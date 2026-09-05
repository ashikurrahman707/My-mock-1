// IELTS Speaking Practice — Rule-Based Evaluation Engine
// No external AI/LLM is used anywhere in this module. All scoring is
// computed from measurable signals: the transcript text, word-level
// timing/confidence from the Web Speech API, and free rule-based
// grammar checking (LanguageTool public API — NOT an AI model).

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
  confidence?: number; // 0-1, from Web Speech API result, if available
}

export interface RawAnswerInput {
  transcript: string;          // final transcript text from Web Speech API
  words: WordTiming[];         // word-level timing, used for pause + rate detection
  totalDurationMs: number;     // total recording duration
  part: 1 | 2 | 3;
  expectedDurationMs: number;  // 60000 for Part1, 120000 for Part2, 90000 for Part3
}

export interface CriterionResult {
  band: number;          // 0.5 increments, e.g. 6.5
  label: string;         // e.g. "Fluency & Coherence"
  feedback: string;      // plain-language explanation
  evidence: string[];    // short bullet points citing what was observed
  confidence: number;    // 0-1, how much we trust this specific score
}

export interface EvaluationResult {
  fluency_coherence: CriterionResult;
  lexical_resource: CriterionResult;
  grammatical_range_accuracy: CriterionResult;
  pronunciation: CriterionResult;
  overall_band: number;
  overall_confidence: number;
  strengths: string[];
  improvements: string[];
  grammar_corrections: { original: string; suggestion: string; explanation: string }[];
  vocabulary_suggestions: { used: string; alternative: string; note: string }[];
  fluency_feedback: string;
  pronunciation_feedback: string;
  overall_feedback: string;
  method: "rule_based_v1"; // never claim this is AI-generated
}
