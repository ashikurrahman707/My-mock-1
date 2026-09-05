// ============================================================
// My-Mock — rule-based IELTS speaking evaluation engine
// (browser port of /lib/evaluation/*.ts — see that folder for
// the original TypeScript source with full comments)
// No AI/LLM is used. See SETUP.md for exactly what this can
// and cannot reliably measure.
// ============================================================

const COMMON_WORDS = new Set(`
the be to of and a in that have i it for not on with he as you do at
this but his by from they we say her she or an will my one all would
there their what so up out if about who get which go me when make can
like time no just him know take people into year your good some could
them see other than then now look only come its over think also back
after use two how our work first well way even new want because any
these give day most us is am are was were been being does did doing
has had having very really quite much many more most little big small
good bad happy sad nice great fun cool okay yes maybe sure thing things
place places people person go went going gone come came get got school
work job home house family friend friends city town country place area
live lives living life eat food drink water study learn read write
play games sport sports watch tv movie music like love enjoy hate dislike
spend spent free busy relax rest sleep morning evening night day week
month year today tomorrow yesterday sometimes often usually always
never every each other another same different important interesting
boring easy hard difficult simple normal usual special favorite favourite
`.trim().split(/\s+/));

function isCommonWord(word) {
  return COMMON_WORDS.has(word.toLowerCase().replace(/[^a-z']/g, ""));
}

const COHESIVE_DEVICES = [
  "however", "although", "though", "on the other hand", "in contrast",
  "for example", "for instance", "such as", "in addition", "moreover",
  "furthermore", "as a result", "therefore", "consequently", "because of",
  "due to", "in other words", "that is to say", "to sum up", "overall",
  "in general", "in particular", "especially", "first of all", "secondly",
  "finally", "meanwhile", "at the same time", "in my opinion", "as far as",
  "from my point of view", "to be honest", "actually", "basically",
];

const HIGHER_BAND_PHRASES = [
  "in my opinion", "as far as i'm concerned", "to be honest",
  "i would say that", "it depends on", "on the whole", "generally speaking",
  "when it comes to", "not to mention", "let alone", "as opposed to",
  "with regard to", "in terms of", "a great deal of", "a wide range of",
  "get used to", "look forward to", "take advantage of", "keep in touch",
  "come up with", "end up", "make up for", "put up with",
];

const FILLER_WORDS = [
  "um", "uh", "erm", "er", "like", "you know", "i mean", "sort of",
  "kind of", "basically", "actually", "well",
];

function countOccurrences(text, phrases) {
  const lower = text.toLowerCase();
  return phrases
    .map((phrase) => {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = lower.match(new RegExp(`\\b${escaped}\\b`, "g"));
      return { phrase, count: matches ? matches.length : 0 };
    })
    .filter((r) => r.count > 0);
}

const LANGUAGETOOL_ENDPOINT = "https://api.languagetool.org/v2/check";

async function checkGrammar(text) {
  if (!text || text.trim().length === 0) return [];
  const body = new URLSearchParams({ text, language: "en-US", enabledOnly: "false" });
  try {
    const res = await fetch(LANGUAGETOOL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.matches || []).map((m) => ({
      message: m.message,
      offset: m.offset,
      length: m.length,
      originalText: text.substring(m.offset, m.offset + m.length),
      suggestions: (m.replacements || []).slice(0, 3).map((r) => r.value),
    }));
  } catch {
    return []; // fail soft — grammar check is one signal among several
  }
}

const SUBORDINATORS = [
  "because", "although", "though", "even though", "while", "whereas",
  "if", "unless", "when", "whenever", "since", "as", "which", "that",
  "who", "whom", "whose", "before", "after", "until", "so that",
];

function countComplexClauses(text) {
  const lower = text.toLowerCase();
  return SUBORDINATORS.reduce((total, word) => {
    const matches = lower.match(new RegExp(`\\b${word}\\b`, "g"));
    return total + (matches ? matches.length : 0);
  }, 0);
}

function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function clampBand(x) {
  const clamped = Math.max(3, Math.min(9, x));
  return Math.round(clamped * 2) / 2;
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(Boolean);
}

function correctedVocabDiversity(words) {
  if (words.length < 10) return words.length ? new Set(words).size / words.length : 0;
  const windowSize = 20;
  const ratios = [];
  for (let i = 0; i + windowSize <= words.length; i += 5) {
    const window = words.slice(i, i + windowSize);
    ratios.push(new Set(window).size / window.length);
  }
  return ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
}

function detectPauses(input) {
  let pauseCount = 0, totalPauseMs = 0;
  for (let i = 1; i < input.words.length; i++) {
    const gap = input.words[i].startMs - input.words[i - 1].endMs;
    if (gap > 700) { pauseCount++; totalPauseMs += gap; }
  }
  return { pauseCount, totalPauseMs };
}

function detectRepetition(words) {
  let repeats = 0;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1] && words[i].length > 2) repeats++;
  }
  return repeats;
}

function scoreFluencyCoherence(input, words) {
  const durationMin = input.totalDurationMs / 60000;
  const wpm = durationMin > 0 ? words.length / durationMin : 0;
  const { pauseCount, totalPauseMs } = detectPauses(input);
  const pauseRatio = input.totalDurationMs > 0 ? totalPauseMs / input.totalDurationMs : 0;
  const fillerHits = countOccurrences(input.transcript, FILLER_WORDS);
  const fillerCount = fillerHits.reduce((s, f) => s + f.count, 0);
  const fillerDensity = words.length > 0 ? (fillerCount / words.length) * 100 : 0;
  const cohesiveHits = countOccurrences(input.transcript, COHESIVE_DEVICES);
  const cohesiveVariety = cohesiveHits.length;
  const repetition = detectRepetition(words);
  const lengthRatio = input.expectedDurationMs > 0 ? input.totalDurationMs / input.expectedDurationMs : 1;

  let score = 6.0;
  if (wpm >= 120 && wpm <= 160) score += 0.5;
  else if (wpm < 80 || wpm > 200) score -= 1.0;
  else if (wpm < 100 || wpm > 180) score -= 0.5;

  if (pauseRatio < 0.1) score += 0.5;
  else if (pauseRatio > 0.3) score -= 1.0;
  else if (pauseRatio > 0.2) score -= 0.5;

  if (fillerDensity < 2) score += 0.25;
  else if (fillerDensity > 8) score -= 1.0;
  else if (fillerDensity > 5) score -= 0.5;

  score += Math.min(cohesiveVariety * 0.25, 1.0);
  if (repetition > 3) score -= 0.5;
  if (lengthRatio < 0.5) score -= 1.0;
  else if (lengthRatio < 0.75) score -= 0.5;

  const band = clampBand(score);
  return {
    band,
    label: "Fluency & Coherence",
    feedback: cohesiveVariety === 0
      ? "Try connecting your ideas with linking words like 'however', 'for example', or 'as a result' to sound more organized."
      : "Good use of organizing language. Keep pauses short and try to reduce filler words for smoother delivery.",
    evidence: [
      `Speech rate: ~${Math.round(wpm)} words/min`,
      `${pauseCount} noticeable pause(s), ${Math.round(pauseRatio * 100)}% of response was silence`,
      `Filler words: ${fillerCount} (${fillerDensity.toFixed(1)} per 100 words)`,
      `Used ${cohesiveVariety} distinct linking/organizing phrase(s)`,
    ],
    confidence: 0.75,
  };
}

function scoreLexicalResource(words, transcript) {
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
    feedback: higherBandHits.length > 0
      ? "You used some natural higher-level phrases — good. Keep expanding beyond common words where it fits naturally."
      : "Try varying your word choice more, and consider phrases like 'in my opinion' or 'when it comes to' to sound more natural.",
    evidence: [
      `Vocabulary diversity score: ${(diversity * 100).toFixed(0)}%`,
      `${uncommon.length} less-common word(s) used`,
      `${higherBandHits.length} higher-band phrase(s) detected`,
    ],
    confidence: 0.6,
  };
}

async function scoreGrammar(transcript, words) {
  let errors = [], toolAvailable = true;
  try { errors = await checkGrammar(transcript); } catch { toolAvailable = false; }

  const errorDensity = words.length > 0 ? (errors.length / words.length) * 100 : 0;
  const complexClauses = countComplexClauses(transcript);
  const sentences = splitSentences(transcript);
  const avgSentenceLen = sentences.length > 0 ? words.length / sentences.length : 0;

  let score = 6.0;
  if (errorDensity < 2) score += 0.5;
  else if (errorDensity > 10) score -= 1.5;
  else if (errorDensity > 6) score -= 1.0;
  else if (errorDensity > 3) score -= 0.5;

  const clausesPerSentence = sentences.length > 0 ? complexClauses / sentences.length : 0;
  if (clausesPerSentence > 0.5) score += 0.75;
  else if (clausesPerSentence > 0.25) score += 0.25;
  else if (avgSentenceLen < 6) score -= 0.5;

  const band = clampBand(score);
  return {
    result: {
      band,
      label: "Grammatical Range & Accuracy",
      feedback: errors.length === 0
        ? "No obvious grammar errors detected by the checker. Try using more complex sentence structures to raise your range score."
        : `Found ${errors.length} likely grammar issue(s) — see the corrections list below.`,
      evidence: [
        `${errors.length} flagged grammar issue(s) (${errorDensity.toFixed(1)} per 100 words)`,
        `${complexClauses} complex clause marker(s) used (because, although, which, etc.)`,
        `Average sentence length: ${avgSentenceLen.toFixed(1)} words`,
      ],
      confidence: toolAvailable ? 0.7 : 0.35,
    },
    errors,
  };
}

function scorePronunciation(input) {
  const withConfidence = input.words.filter((w) => typeof w.confidence === "number");
  if (withConfidence.length === 0) {
    return {
      band: 6.0,
      label: "Pronunciation",
      feedback: "Pronunciation could not be reliably measured without real audio/phonetic analysis. This score is a placeholder, not a real assessment.",
      evidence: ["No speech-recognition confidence data was available for this recording."],
      confidence: 0.15,
    };
  }
  const avgConfidence = withConfidence.reduce((s, w) => s + (w.confidence || 0), 0) / withConfidence.length;
  const band = clampBand(5.5 + avgConfidence * 2.5);
  return {
    band,
    label: "Pronunciation",
    feedback: "This score is estimated from speech-recognition confidence only — it does NOT reflect real stress, intonation, or rhythm analysis, which requires AI-based audio processing we don't have here.",
    evidence: [`Average recognition confidence: ${(avgConfidence * 100).toFixed(0)}%`],
    confidence: 0.3,
  };
}

async function evaluateAnswer(input) {
  const words = tokenize(input.transcript);
  const fluency = scoreFluencyCoherence(input, words);
  const lexical = scoreLexicalResource(words, input.transcript);
  const { result: grammar, errors } = await scoreGrammar(input.transcript, words);
  const pronunciation = scorePronunciation(input);

  const overall = clampBand((fluency.band + lexical.band + grammar.band + pronunciation.band) / 4);
  const overallConfidence = (fluency.confidence + lexical.confidence + grammar.confidence + pronunciation.confidence) / 4;

  const grammar_corrections = errors.slice(0, 6).map((e) => ({
    original: e.originalText,
    suggestion: e.suggestions[0] || "(no suggestion available)",
    explanation: e.message,
  }));

  const strengths = [], improvements = [];
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
    vocabulary_suggestions: [],
    fluency_feedback: fluency.feedback,
    pronunciation_feedback: pronunciation.feedback,
    overall_feedback:
      `Estimated band ${overall} (Practice Score Estimate — rule-based, not AI-evaluated). ` +
      `Confidence in this estimate: ${Math.round(overallConfidence * 100)}%. ` +
      `This is not an official IELTS score and should be used as a rough practice signal only.`,
    method: "rule_based_v1",
  };
}

window.MyMock = window.MyMock || {};
window.MyMock.evaluateAnswer = evaluateAnswer;
