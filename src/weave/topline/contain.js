// EO: EVA·SEG(Field,Link → Lens, Binding,Tracing) — the set-containment safety gate
// The whole safety of the topline lives here (docs/topline.md). The second pass hands the
// model back its own pass-one sentences and asks it ONLY to join them — reorder, add
// connectives, elide repetition, make it read. This is the mechanical, model-free check on
// that join: EVERY CONTENT WORD AND EVERY NUMBER IN THE OUTPUT MUST ALREADY APPEAR IN THE
// INPUT. A set-containment test over the pass-one text. The join may LOSE information; it may
// never ADD any. A new proper noun, a new figure, a new hedge that implies a source, a flipped
// polarity — any of these introduces a content token the input never carried, and the join is
// rejected (the telegram ships instead).
//
// This is the thing that makes the topline different from ordinary summarization. A retrieval
// system hands a model chunks and asks for a summary, and the fluency it produces is fluency
// ACROSS THE GAPS between the chunks — and the gaps are exactly where the fabrication lives.
// Here there are no gaps to be fluent across: the model is not bridging anything, it is
// arranging. The gate below is what enforces "arranging, not adding."

// The only words the join is free to introduce: pure function words — articles, conjunctions,
// prepositions, the copula/auxiliaries, pronouns, and the discourse connectives that make a
// telegram read as prose ("while", "where", "after", "so", "then", …). Everything OUTSIDE this
// set is content the input must already carry.
//
// What is DELIBERATELY NOT here, and why:
//   · negation (not/no/never/without/neither/nor) — flips a claim's polarity; meaning, never free.
//   · hedges (reportedly/allegedly/apparently/seemingly/perhaps/possibly/likely/claimed) — imply a
//     source or a stance the record did not carry; "a new hedge that implies a source" is the
//     canonical rejected join.
//   · quantifiers that assert scope (all/every/none/most/some/many/few/only/always) — they make a
//     claim the objects did not.
// A join that reaches for any of these adds meaning, so it must fail containment and it does.
export const CONNECTIVES = Object.freeze(new Set((
  'a an the ' +                                             // articles
  'and or but yet ' +                                       // coordinators
  'of to in on at by for with from into over under ' +      // prepositions
  'as that which who whom whose where when while ' +         // relativizers / subordinators
  'so then thus hence ' +                                   // consequence connectives (non-hedging)
  'also too here there ' +                                  // light adverbs
  'is are was were be been being ' +                        // copula
  'has have had do does did ' +                             // auxiliaries
  'it its he she they them his her their him this these those ' +  // pronouns / determiners
  "'s"                                                       // the possessive clitic
).split(/\s+/).filter(Boolean)));

// Every maximal run of digits (comma/period grouping folded away), so "12,500" is ONE number
// and "1,912" reads as 1912. A word-splitter would fracture these on the comma and let a
// fabricated figure slip past. Normalised to a bare digit string, and checked on their own axis.
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;
const numbersOf = (text) =>
  (String(text || '').match(NUMBER_RE) || []).map((n) => n.replace(/,/g, '').replace(/\.0+$/, ''));

// This holon's OWN word tokenizer — deliberately not the perceiver's `tok`, whose built-in
// stoplist eats exactly the words the safety turns on (a dropped "not" would let a flipped
// polarity pass containment silently). Here the ONLY words removed are this holon's declared
// connectives; negation, hedges, quantifiers, proper nouns, and every other content word stay.
// The possessive clitic is stripped so "Gregor's" and "Gregor" are one token.
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const words = (text) => (String(text || '').toLowerCase().match(WORD_RE) || [])
  .map((w) => w.replace(/[’]/g, "'").replace(/'s$/, '').replace(/^-+|-+$/g, ''))
  .filter(Boolean);

// The content tokens of a text: its words minus the free connectives AND minus the pure-number
// tokens (numbers are their own, comma-normalised axis above — so "12500" and "12,500" agree).
export const contentTokens = (text) => words(text).filter((t) => !CONNECTIVES.has(t) && !/^\d+$/.test(t));

// Does `output` add nothing `input` did not already carry? True iff every content token and
// every number in the output already appears in the input. Pure, deterministic, model-free —
// this is the gate the join must pass, and the reason the second pass can never fabricate.
export const containedIn = (output, input) => {
  const inTokens = new Set(contentTokens(input));
  for (const t of contentTokens(output)) if (!inTokens.has(t)) return false;
  const inNums = new Set(numbersOf(input));
  for (const n of numbersOf(output)) if (!inNums.has(n)) return false;
  return true;
};

// The content tokens / numbers the output ADDED beyond the input — the witnesses for WHY a join
// was rejected. Empty exactly when containedIn is true. For the audit trail and tests.
export const addedBy = (output, input) => {
  const inTokens = new Set(contentTokens(input));
  const inNums = new Set(numbersOf(input));
  const words = [...new Set(contentTokens(output).filter((t) => !inTokens.has(t)))];
  const numbers = [...new Set(numbersOf(output).filter((n) => !inNums.has(n)))];
  return { words, numbers };
};
