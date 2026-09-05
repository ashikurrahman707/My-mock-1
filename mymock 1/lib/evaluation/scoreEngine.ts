import { RawAnswerInput, CriterionResult, EvaluationResult } from "./types";
import { isCommonWord } from "./common-words";
import { COHESIVE_DEVICES, HIGHER_BAND_PHRASES, FILLER_WORDS, countOccurrences } from "./phrase-banks";
import { checkGrammar, countComplexClauses, splitSentences, GrammarError } from "./languagetool";

// ---------- helpers ----------

function clampBand(x: number): number {
  const clamped = Math.max(3, Math.min(9, x));
  return Math.round(clamped * 2) / 2; // nearest 0.5
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Length-corrected vocabulary diversity (a simplified MTLD-style measure).
// Raw type-token ratio (unique/total) is misleading: short answers score
// artificially high. This corrects for that by measuring diversity over
// a rolling window instead of the whole response at once.
function correctedVocabDiversity(words: string[]): number {
  if (words.length < 10) return words.length ? new Set(words).size / words.length : 0;
  const windowSize = 20;
  const ratios: number[] = [];
  for (let i = 0; i + windowSize <= words.length; i += 5) {
    const window = words.slice(i, i + windowSize);
    ratios.push(new Set(window).size / window.length);
  }
  return ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
}

function detectPauses(input: RawAnswerInput): { pauseCount: number; totalPauseMs: number } {
  let pauseCount = 0;
  let totalPauseMs = 0;
  for (let i = 1; i < input.words.length; i++) {
    const gap = input.words[i].startMs - input.words[i - 1].endMs;
    if (gap > 700) {
      // Gaps under ~0.7s are natural speech rhythm, not hesitation.
      pauseCount++;
      totalPauseMs += gap;
    }
  }
  return { pauseCount, totalPauseMs };
}

function detectRepetition(words: string[]): number {
  let repeats = 0;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1] && words[i].length > 2) repeats++;
  }
  return repeats;
}

// ---------- criterion scorers ----------

function scoreFluencyCoherence(input: RawAnswerInput, words: string[]): CriterionResult {
  const durationMin = input.totalDurationMs / 60000;
  const wpm = durationMin > 0 ? words.length / durationMin : 0;
  const { pauseCount, totalPauseMs } = detectPauses(input);
  const pauseRatio = input.totalDurationMs > 0 ? totalPauseMs / input.totalDurationMs : 0;
  const fillerHits = countOccurrences(input.transcript, FILLER_WORDS);
  const fillerCount = fillerHits.reduce((sum, f) => sum + f.count, 0);
  const fillerDensity = words.length > 0 ? (fillerCount / words.length) * 100 : 0;
  const cohesiveHits = countOccurrences(input.transcript, COHESIVE_DEVICES);
  const cohesiveVariety = cohesiveHits.length; // distinct devices used, not just count
  const repetition = detectRepetition(words);
  const lengthRatio = input.expectedDurationMs > 0 ? input.totalDurationMs / input.expectedDurationMs : 1;

  let score = 6.0;

  // Speech rate: optimal band is roughly 120-160 wpm for natural pace.
  if (wpm >= 120 && wpm <= 160) score += 0.5;
  else if (wpm < 80 || wpm > 200) score -= 1.0;
  else if (wpm < 100 || wpm > 180) score -= 0.5;

  // Pausing
  if (pauseRatio < 0.1) score += 0.5;
  else if (pauseRatio > 0.3) score -= 1.0;
  else if (pauseRatio > 0.2) score -= 0.5;

  // Fillers
  if (fillerDensity < 2) score += 0.25;
  else if (fillerDensity > 8) score -= 1.0;
  else if (fillerDensity > 5) score -= 0.5;

  // Cohesive device variety — reward organization, cap the bonus
  score += Math.min(cohesiveVariety * 0.25, 1.0);

  // Repetition penalty
  if (repetition > 3) score -= 0.5;

  // Response length vs expected (too short = underdeveloped answer)
  if (lengthRatio < 0.5) score -= 1.0;
  else if (lengthRatio < 0.75) score -= 0.5;

  const band = clampBand(score);

  const evidence: string[] = [
    `Speech rate: ~${Math.round(wpm)} words/min`,
    `${pauseCount} noticeable pause(s), ${Math.round(pauseRatio * 100)}% of response was silence`,
    `Filler words: ${fillerCount} (${fillerDensity.toFixed(1)} per 100 words)`,
    `Used ${cohesiveVariety} distinct linking/organizing phrase(s)`,
  ];

  return {
    band,
    label: "Fluency & Coherence",
    feedback:
      cohesiveVariety === 0
        ? "Try connecting your ideas with linking words like 'however', 'for example', or 'as a result' to sound more organized."
        : "Good use of organizing language. Keep pauses short and try to reduce filler words for smoother delivery.",
    evidence,
    confidence: 0.75, // reasonably reliable — based on real timing + text signals
  };
}

function scoreLexicalResource(words: string[], transcript: string): CriterionResult {
  const diversity = correctedVocabDiversity(words);
  const uncommon = words.filter((w) => !isCommonWord(w) && w.length > 3);
  const uncommonRatio = words.length > 0 ? uncommon.length / words.length : 0;
  const higherBandHits = countOccurrences(transcript, HIGHER_BAND_PHRASES);

  let score = 6.0;
  if (diversity > 0.75) score += 1.0;
  else if (diversity > 0.65) score += 0.5;
  else if (diversity < 0.45) score -= 1.0;
  else if (diversity < 0.55) score -= 0.5;

  if (uncommonRatio > 0.35) score += 0.5;
  else if (uncommonRatio < 0.15) score -= 0.5;

  score += Math.min(higherBandHits.length * 0.25, 0.75);

  const band = clampBand(score);

  return {
    band,
    label: "Lexical Resource",
    feedback:
      higherBandHits.length > 0
        ? "You used some natural higher-level phrases — good. Keep expanding beyond common words where it fits naturally."
        : "Try varying your word choice more, and consider phrases like 'in my opinion' or 'when it comes to' to sound more natural.",
    evidence: [
      `Vocabulary diversity score: ${(diversity * 100).toFixed(0)}%`,
      `${uncommon.length} less-common word(s) used`,
      `${higherBandHits.length} higher-band phrase(s) detected`,
    ],
    confidence: 0.6, // weaker — text-only proxy, no true semantic judgement
  };
}

async function scoreGrammar(transcript: string, words: string[]): Promise<{ result: CriterionResult; errors: GrammarError[] }> {
  let errors: GrammarError[] = [];
  let toolAvailable = true;
  try {
    errors = await checkGrammar(transcript);
  } catch {
    toolAvailable = false;
  }

  const errorDensity = words.length > 0 ? (errors.length / words.length) * 100 : 0;
  const complexClauses = countComplexClauses(transcript);
  const sentences = splitSentences(transcript);
  const avgSentenceLen = sentences.length > 0 ? words.length / sentences.length : 0;

  let score = 6.0;
  if (errorDensity < 2) score += 0.5;
  else if (errorDensity > 10) score -= 1.5;
  else if (errorDensity > 6) score -= 1.0;
  else if (errorDensity > 3) score -= 0.5;

  // Range: attempting complex/varied sentence structures
  const clausesPerSentence = sentences.length > 0 ? complexClauses / sentences.length : 0;
  if (clausesPerSentence > 0.5) score += 0.75;
  else if (clausesPerSentence > 0.25) score += 0.25;
  else if (avgSentenceLen < 6) score -= 0.5; // very short, simple sentences only

  const band = clampBand(score);

  return {
    result: {
      band,
      label: "Grammatical Range & Accuracy",
      feedback:
        errors.length === 0
          ? "No obvious grammar errors detected by the checker. Try using more complex sentence structures to raise your range score."
          : `Found ${errors.length} likely grammar issue(s) — see the corrections list below.`,
      evidence: [
        `${errors.length} flagged grammar issue(s) (${errorDensity.toFixed(1)} per 100 words)`,
        `${complexClauses} complex clause marker(s) used (because, although, which, etc.)`,
        `Average sentence length: ${avgSentenceLen.toFixed(1)} words`,
      ],
      confidence: toolAvailable ? 0.7 : 0.35, // drops if LanguageTool was unreachable
    },
    errors,
  };
}

function scorePronunciation(input: RawAnswerInput): CriterionResult {
  const withConfidence = input.words.filter((w) => typeof w.confidence === "number");
  if (withConfidence.length === 0) {
    return {
      band: 6.0,
      label: "Pronunciation",
      feedback:
        "Pronunciation could not be reliably measured without real audio/phonetic analysis. This score is a placeholder, not a real assessment.",
      evidence: ["No speech-recognition confidence data was available for this recording."],
      confidence: 0.15,
    };
  }
  const avgConfidence =
    withConfidence.reduce((sum, w) => sum + (w.confidence || 0), 0) / withConfidence.length;

  // Low recognition confidence correlates loosely with unclear speech —
  // this is a WEAK proxy, not real phonetic/stress/intonation analysis.
  let score = 5.5 + avgConfidence * 2.5;
  const band = clampBand(score);

  return {
    band,
    label: "Pronunciation",
    feedback:
      "This score is estimated from speech-recognition confidence only — it does NOT reflect real stress, intonation, or rhythm analysis, which requires AI-based audio processing we don't have here.",
    evidence: [`Average recognition confidence: ${(avgConfidence * 100).toFixed(0)}%`],
    confidence: 0.3, // always kept low — this is the weakest criterion by design
  };
}

// ---------- main entry point ----------

export async function evaluateAnswer(input: RawAnswerInput): Promise<EvaluationResult> {
  const words = tokenize(input.transcript);

  const fluency = scoreFluencyCoherence(input, words);
  const lexical = scoreLexicalResource(words, input.transcript);
  const { result: grammar, errors } = await scoreGrammar(input.transcript, words);
  const pronunciation = scorePronunciation(input);

  const overall = clampBand(
    (fluency.band + lexical.band + grammar.band + pronunciation.band) / 4
  );

  const overallConfidence =
    (fluency.confidence + lexical.confidence + grammar.confidence + pronunciation.confidence) / 4;

  const grammar_corrections = errors.slice(0, 6).map((e) => ({
    original: e.originalText,
    suggestion: e.suggestions[0] || "(no suggestion available)",
    explanation: e.message,
  }));

  const strengths: string[] = [];
  const improvements: string[] = [];
  [fluency, lexical, grammar, pronunciation].forEach((c) => {
    if (c.band >= 6.5) strengths.push(`${c.label}: ${c.band}`);
    else improvements.push(`${c.label}: ${c.band} — ${c.feedback}`);
  });

  return {
    fluency_coherence: fluency,
    lexical_resource: lexical,
    grammatical_range_accuracy: grammar,
    pronunciation,
    overall_band: overall,
    overall_confidence: overallConfidence,
    strengths,
    improvements,
    grammar_corrections,
    vocabulary_suggestions: [], // left empty rather than fabricated — no reliable
                                  // way to suggest natural in-context alternatives
                                  // without real language understanding
    fluency_feedback: fluency.feedback,
    pronunciation_feedback: pronunciation.feedback,
    overall_feedback:
      `Estimated band ${overall} (Practice Score Estimate — rule-based, not AI-evaluated). ` +
      `Confidence in this estimate: ${Math.round(overallConfidence * 100)}%. ` +
      `This is not an official IELTS score and should be used as a rough practice signal only.`,
    method: "rule_based_v1",
  };
}
