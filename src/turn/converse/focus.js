// EO: EVA·SIG(Field → Lens, Binding,Tending) — conversation-aware retrieval (regex path)
// Conversation-aware retrieval — resolve a follow-up against what has been asked.
//
// A grounded follow-up like "now?", "what about her?", or "answer my first question"
// carries no standalone retrieval signal: retrieving on its literal words finds
// sentences containing "now", not the topic the user is pursuing. (In the audit the
// "now?" turn retrieved on the word and missed the thread entirely.) We resolve it by
// folding the recent USER turns' content into the retrieval query.
//
// Only the user's OWN words feed this — never the talker's prior answers. So it adds no
// poisoning: a small model can anchor on its earlier replies only where those replies
// are fed back, and they are not. The user's questions are a different, safe witness
// (the talker/witness split in converse/provenance.js).

// Function words PLUS the deictic / continuation words that carry no topic on their
// own — "now", "again", "go on". A turn made only of these contributes no focus and
// cannot stand alone for retrieval.
const STOP = new Set((
  'a an the and or but if then so of to in on at for with as is are was were be been ' +
  'being do does did done have has had i you he she it we they me him her them my your our ' +
  'this that these those what which who whom whose how why when where will would can ' +
  'could should may might must not no yes ok okay sure thanks thank please just about ' +
  'now then again more next go on continue here there back also too anymore'
).split(/\s+/));

// Generic attribute / identity nouns — the kind of thing one asks ABOUT someone,
// never a topic that stands on its own. "his name", "her age", "their job" each
// lean on a referent the question itself never supplies; the referent is back in
// the conversation. (Distinct from STOP: these ARE content words — they just can't
// anchor a retrieval on their own.)
const ATTRIBUTE = new Set((
  'name names age job jobs role roles title titles occupation profession identity ' +
  'gender nationality deal story point problem problems issue issues'
).split(/\s+/));

// A bare third-person pronoun whose antecedent lives in the conversation, not the
// question. "what is HIS name?" names no one — the "his" points back a turn. The
// possessives (his/its/their/hers/theirs) are NOT in STOP, so they survive
// `contentWords`; we filter them with PRONOUN_TOKENS before judging topicality.
const PRONOUN = /\b(he|him|his|she|her|hers|it|its|they|them|their|theirs)\b/;
const PRONOUN_TOKENS = new Set('he him his she her hers it its they them their theirs'.split(' '));

// A correction / redirect opener — "no, the musician", "actually the other one".
// The user is amending the LAST question, not posing a fresh one, so the thread is
// the topic. Only leans when it carries no strong query of its own (guarded below).
const CORRECTION = /^\s*(no|nope|nah|not|actually|rather|wait|i\s+mean(?:t)?)\b/;

// An EVIDENCE DEMAND on the prior answer — "prove it", "back it up", "justify that".
// The demonstrative object ("it"/"that") points at what was just said, not at anything
// in the question; it leans on the conversation only when it carries no real query of
// its own ("prove it" leans, "prove the earth is round" stands). This was the t2 audit
// catastrophe: "prove it" retrieved on the literal token and landed on the broom
// sentence ("to prove it she gave Gregor's body another shove") instead of the topic.
const EVIDENCE = /^\s*(?:prove|justify|substantiate|verify|cite|source|defend|demonstrate|back\s+(?:it|that|this)\s+up)\b/i;

// A reference to the TALKER's prior statement — "what you are saying", "what you said",
// "what you claimed about her". The follow-up is about the prior answer's topic, so it
// leans on the conversation. Allows a few words between "you" and the verb ("you ARE
// saying", "you JUST said").
const ABOUT_PRIOR = /\byou\b(?:'re)?(?:\s+(?:are|were|just|had|have|keep|kept|did|do|been))?\s+(?:said|say|saying|says|asked|told|mention(?:ed|ing)?|answered|wrote|claim(?:ed|ing)?|mean(?:t|ing)?|stat(?:e|ed|ing)|insist(?:ed|ing)?|referring|talking|telling)\b/i;

// A pure confusion / continuation marker — "huh?", "what?", "eh", "come again", "how
// so?", "really?". It carries no topic at all; it asks to re-tread the prior turn, so it
// leans entirely on the conversation. The WHOLE utterance must be the marker, so a real
// question that merely opens with "what" ("what is Gregor's job?") is untouched.
const CONFUSION = /^\s*(?:huh|eh|hmm+|wat|what|sorry|pardon|come\s+again|really|meaning|how\s+so|in\s+what\s+way|wait(?:,?\s+what)?|say\s+(?:that\s+)?again|i\s+don'?t\s+(?:get|understand)(?:\s+(?:it|that))?)\s*[?!.…]*\s*$/i;

// The content words of a string, in order, deduped — its topic-bearing tokens. Split
// on the apostrophe too, so a possessive yields the bare noun ("gregor's" → "gregor",
// the dangling "s" dropped as length-1) — the form the retriever indexes.
export const contentWords = (s) => {
  const out = [];
  const seen = new Set();
  for (const t of String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (t.length > 1 && !STOP.has(t) && !seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
};

// Does the question stand on its own for retrieval, or does it lean on the conversation?
// Two ways it leans: an explicit reference to the dialogue itself ("my first question",
// "you said", "go on"), or thinness — nothing topic-bearing once stop/deictic words go.
export const needsContext = (question) => {
  const q = String(question || '').toLowerCase();
  if (/\b(my|the|that|your|his|her)\s+(first|last|previous|earlier|other|second|original)\b/.test(q)) return true;
  if (/\byou\s+(said|asked|told|mentioned|answered|wrote)\b/.test(q)) return true;
  if (/\b(answer|address|finish|repeat|reread|re-read)\s+(my|the|that|it|again)\b/.test(q)) return true;
  if (/\bgo\s+(on|ahead)\b|\bcontinue\b|\bgo back\b|\bback to\b|\bwhat about\b/.test(q)) return true;
  // A pure confusion / continuation marker, and a reference to the talker's own prior
  // statement, both lean on the conversation (the t2/t3 audit turns).
  if (CONFUSION.test(q)) return true;
  if (ABOUT_PRIOR.test(q)) return true;
  // An evidence demand on the prior answer — "prove it" — but only when it carries no
  // strong query of its own, so "prove the transformation is real" still stands alone.
  const ev = q.match(EVIDENCE);
  if (ev && contentWords(q.slice(ev[0].length)).length <= 1) return true;
  // Pronoun-led: a third-person pronoun whose only topic-bearing words (the pronoun
  // itself set aside) are generic attributes ("what is his name?", "what's her job?").
  // The pronoun has no antecedent in the question — it points back into the conversation.
  // A pronoun ALONGSIDE a real topic ("is his Yellowstone theory right?") still stands on
  // its own and is left untouched. This was the "but what is his name?" failure: a lone
  // "name" looked like a standalone topic, so retrieval re-anchored and found "His name is
  // Curtis Yarvin" instead of riding the musician the prior turn had already established.
  if (PRONOUN.test(q) && contentWords(q).filter(t => !PRONOUN_TOKENS.has(t)).every(t => ATTRIBUTE.has(t))) return true;
  // A correction that redirects the last question rather than posing a new one
  // ("no, the musician") — only when the words AFTER the opener carry no strong query of
  // their own, so a real standalone ("no, summarize chapter 3") is never polluted.
  const corr = q.match(CORRECTION);
  if (corr && contentWords(q.slice(corr[0].length)).length <= 1) return true;
  return contentWords(q).length === 0;
};

// The salient terms the conversation is about: the recent USER turns, newest first,
// deduped and capped. The retrieval query is augmented with these when the question
// can't stand alone.
export const conversationalFocus = (history = [], { maxTerms = 6, maxTurns = 3 } = {}) => {
  const users = (Array.isArray(history) ? history : []).filter(m => m && m.role === 'user' && m.content);
  const terms = [];
  const seen = new Set();
  for (const m of users.slice(-maxTurns).reverse()) {        // newest user turns first
    for (const t of contentWords(m.content)) {
      if (!seen.has(t)) { seen.add(t); terms.push(t); if (terms.length >= maxTerms) return terms; }
    }
  }
  return terms;
};

// The retrieval query, resolved against the conversation when the question leans on it.
// A self-contained question passes through untouched — never pollute a strong query;
// a thin or self-referential one is augmented with the conversation's focus terms, the
// ORIGINAL question kept so its own words still count.
export const resolveRetrievalQuery = (question, history = []) => {
  if (!needsContext(question)) return question;
  const focus = conversationalFocus(history);
  return focus.length ? `${question} ${focus.join(' ')}` : question;
};
