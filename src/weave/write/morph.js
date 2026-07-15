// EO: DEF·NUL(Void → Void, Making,Clearing) — past-tense morphology (the productive rules)
// Past-tense morphology for realization — turn a bare/gerund relation-verb into the
// narrative past so a retelling reads as prose, not telegraphese ("accept"→"accepted",
// "jump"→"jumped", "pushing"→"pushed", "make"→"made"). The parse often hands us a verb with
// its auxiliary stripped ("would accept", "was pushing"), so the surface tense is lost; this
// recovers the simple past, the default narrative tense.
//
// This is English's morphological HOW — a closed convention, the same kind as the engine's
// seed conjunction/preposition lists, and learnable from the corpus's attested verb forms. A
// form that is ALREADY past (it ends in -ed, or is a known irregular past) is left untouched,
// so a source that already gave "woke / saw / brought" is unchanged.

// The closed irregular set is the PACKAGED English-morphology convention (core/conventions/
// english-verbs.js), the same curated-lexicon "packaged way" as the seed speech/relation
// lists — not a table hand-rolled here. This module is only the productive RULES.
import { SEED_IRREGULAR_PAST as IRREGULAR, SEED_PAST_FORMS as PAST } from '../../core/conventions/index.js';

// a present participle ("pushing") back to its base ("push"), undoubling a doubled final
// consonant ("running" → "run", "sitting" → "sit"). A dropped 'e' ("moving" → "mov") is
// recovered in toPast by trying the +'e' lemma against the irregular/regular paths.
const degerund = (v) => {
  let b = v.slice(0, -3);                                   // drop "ing"
  if (/([^aeiou])\1$/.test(b)) b = b.slice(0, -1);          // running → run
  return b;
};

const regularPast = (b) => {
  if (b.endsWith('e')) return b + 'd';                      // love → loved, move → moved
  if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + 'ied';  // try → tried
  // single-syllable consonant-vowel-consonant → double the final consonant (stop → stopped).
  // 'v','w','x','y' never double, so "mov" → "moved" not "movved".
  if (b.length <= 4 && /[^aeiou][aeiou][^aeiouwxyv]$/.test(b)) return b + b.slice(-1) + 'ed';
  return b + 'ed';                                          // jump → jumped, accept → accepted, mov → moved
};

const isPast = (v) => /e[dn]$/.test(v) || /(ought|aught)$/.test(v) || PAST.has(v);

// toPast(verb) — the narrative past of a relation-verb, or the verb unchanged if already past.
export const toPast = (verb) => {
  const v = String(verb || '').toLowerCase();
  if (!v || isPast(v)) return verb;                         // empty or already past — keep the source form
  if (v.endsWith('ing') && v.length > 4) {
    const base = degerund(v);
    return IRREGULAR[base] || IRREGULAR[base + 'e'] || (PAST.has(base) ? base : regularPast(base));
  }
  return IRREGULAR[v] || regularPast(v);
};
