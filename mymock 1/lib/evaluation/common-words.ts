// A curated set of the ~300 most frequent English words (function words +
// everyday vocabulary). Words a student uses that fall OUTSIDE this set are
// treated as a signal of wider vocabulary (lexical resource), not proof of
// correctness — it's a heuristic, not language understanding.

export const COMMON_WORDS = new Set(
  `
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
  \n  `
    .trim()
    .split(/\s+/)
);

export function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(word.toLowerCase().replace(/[^a-z']/g, ""));
}
