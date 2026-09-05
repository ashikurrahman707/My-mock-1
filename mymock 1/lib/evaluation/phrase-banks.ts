// These lists let us detect *organizational* and *idiomatic* language use
// directly from text — no AI needed, just pattern matching. Presence and
// VARIETY of these is a genuine, defensible signal for band scoring;
// IELTS examiners are explicitly trained to listen for exactly this kind
// of cohesive/idiomatic language.

export const COHESIVE_DEVICES = [
  "however", "although", "though", "on the other hand", "in contrast",
  "for example", "for instance", "such as", "in addition", "moreover",
  "furthermore", "as a result", "therefore", "consequently", "because of",
  "due to", "in other words", "that is to say", "to sum up", "overall",
  "in general", "in particular", "especially", "first of all", "secondly",
  "finally", "meanwhile", "at the same time", "in my opinion", "as far as",
  "from my point of view", "to be honest", "actually", "basically",
];

export const HIGHER_BAND_PHRASES = [
  "in my opinion", "as far as i'm concerned", "to be honest",
  "i would say that", "it depends on", "on the whole", "generally speaking",
  "when it comes to", "not to mention", "let alone", "as opposed to",
  "with regard to", "in terms of", "a great deal of", "a wide range of",
  "get used to", "look forward to", "take advantage of", "keep in touch",
  "come up with", "end up", "make up for", "put up with",
];

export const FILLER_WORDS = [
  "um", "uh", "erm", "er", "like", "you know", "i mean", "sort of",
  "kind of", "basically", "actually", "well",
];

export function countOccurrences(text: string, phrases: string[]): { phrase: string; count: number }[] {
  const lower = text.toLowerCase();
  return phrases
    .map((phrase) => {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = lower.match(new RegExp(`\\b${escaped}\\b`, "g"));
      return { phrase, count: matches ? matches.length : 0 };
    })
    .filter((r) => r.count > 0);
}
