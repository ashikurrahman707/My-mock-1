// LanguageTool (languagetool.org) offers a free public API that does
// genuine rule-based grammar, spelling, and style checking — it is NOT
// an AI/LLM, so it needs no billing account and no API key for light use.
// Public endpoint has a rate limit (~20 req/min, ~20k chars/day per IP),
// which is fine for individual practice sessions. For heavier production
// use later, self-hosting LanguageTool (free, open source, Docker image)
// removes the rate limit entirely — flagged in the setup notes.

export interface GrammarError {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  originalText: string;
  suggestions: string[];
  ruleCategory: string;
}

const LANGUAGETOOL_ENDPOINT = "https://api.languagetool.org/v2/check";

export async function checkGrammar(text: string): Promise<GrammarError[]> {
  if (!text || text.trim().length === 0) return [];

  const body = new URLSearchParams({
    text,
    language: "en-US",
    enabledOnly: "false",
  });

  const res = await fetch(LANGUAGETOOL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    // Fail soft: grammar checking is one signal among several, not a
    // hard dependency. If LanguageTool is unreachable/rate-limited we
    // simply lower confidence on the grammar criterion rather than
    // failing the whole evaluation.
    return [];
  }

  const data = await res.json();

  return (data.matches || []).map((m: any) => ({
    message: m.message,
    shortMessage: m.shortMessage || m.message,
    offset: m.offset,
    length: m.length,
    originalText: text.substring(m.offset, m.offset + m.length),
    suggestions: (m.replacements || []).slice(0, 3).map((r: any) => r.value),
    ruleCategory: m.rule?.category?.name || "Grammar",
  }));
}

// Sentence complexity is a genuine "range" signal independent of error
// count: attempting subordinate clauses (even imperfectly) is exactly
// what separates band 5 responses from band 7 responses.
const SUBORDINATORS = [
  "because", "although", "though", "even though", "while", "whereas",
  "if", "unless", "when", "whenever", "since", "as", "which", "that",
  "who", "whom", "whose", "before", "after", "until", "so that",
];

export function countComplexClauses(text: string): number {
  const lower = text.toLowerCase();
  return SUBORDINATORS.reduce((total, word) => {
    const matches = lower.match(new RegExp(`\\b${word}\\b`, "g"));
    return total + (matches ? matches.length : 0);
  }, 0);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
