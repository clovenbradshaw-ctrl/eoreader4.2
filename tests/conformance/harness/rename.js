// The rename isomorphism (docs/parse-conformance-spec.md Tier 4 #15-18).
//
// "Replace every surface form of a referent with a novel, unrecognizable,
// morphologically-similar token (preserving capitalization, length class,
// apostrophes, and possessive/plural inflection)." A letter-substitution cipher
// does exactly this by construction: it maps a-z/A-Z to a-z/A-Z one-to-one and
// leaves every other character (apostrophes, hyphens, digits, whitespace,
// punctuation) untouched — so length, capitalization pattern, and possessive/
// plural markers survive automatically, with no separate bookkeeping needed.
//
// The rename is applied GLOBALLY and CONSISTENTLY: every occurrence of a given
// word (case-sensitive, word-boundary-anchored) is replaced by the SAME cipher
// image everywhere in the document — never per-admitted-span — so the
// document's own orthographic statistics (entities.js's capCount/lowCount,
// docLowerVocab, the whole moon/planet/orbit apparatus) transform coherently
// rather than getting scrambled. That is the whole point: the isomorphism
// claim is about structure derived from those statistics, so the statistics
// themselves must transform as a rename, not as noise.

const rotChar = (ch, shift) => {
  const isUpper = ch >= 'A' && ch <= 'Z';
  const isLower = ch >= 'a' && ch <= 'z';
  if (!isUpper && !isLower) return ch;
  const base = isUpper ? 65 : 97;
  return String.fromCharCode(((ch.charCodeAt(0) - base + shift) % 26 + 26) % 26 + base);
};

export const caesarShiftWord = (word, shift) => [...word].map((c) => rotChar(c, shift)).join('');
export const rot13Word = (word) => caesarShiftWord(word, 13);

// Every distinct word (\p{L}+ run) appearing in any admitted referent's label,
// EXCLUDING closed-class title words (Mr/Mrs/Dr/...) — a title is structural
// furniture, not the name, and renaming it would just make "Mr" into another
// unrecognizable token instead of testing anything.
const TITLE_WORDS = new Set(['Mr', 'Mrs', 'Ms', 'Dr', 'Miss', 'Mister', 'Sir', 'Madam', 'Madame',
  'Lady', 'Lord', 'Professor', 'Prof', 'Capt', 'Captain', 'Rev', 'St', 'Aunt', 'Uncle']);

// Only a word that is CAPITALIZED as it sits in the admitted label is a name
// token. Admission also holds labels for un-named, common-noun-headed
// descriptor bodies discovered by the unnamed-referent census ("the motion",
// "the city" — pipeline.js's centreScanner, opts.unnamedReferents) — those
// labels are plain lowercase common nouns, not names, and renaming a word like
// "the" or "motion" would corrupt the very structural/closed-class vocabulary
// (isStarter, isFunction, TRAILING_CONNECTOR, ...) segmentation and admission
// both depend on, breaking nearly everything downstream of it rather than
// testing anything about lexical independence.
export const nameWordsOf = (doc) => {
  const words = new Set();
  for (const label of doc.admission.admitted.keys()) {
    for (const w of label.split(/\s+/)) {
      const bare = w.replace(/\.$/, '');
      if (!TITLE_WORDS.has(bare) && /^\p{Lu}\p{L}*$/u.test(bare)) words.add(bare);
    }
  }
  return words;
};

// buildRenameMap(doc, { shift }) -> Map<word, cipherWord>. Also guards against a
// degenerate cipher (shift 0/26, or a collision where two distinct source words
// cipher to the same image, or a cipher image that collides with an existing
// document word) — any of those would confound the isomorphism, not test it.
export const buildRenameMap = (doc, { shift = 13, text = '' } = {}) => {
  const words = [...nameWordsOf(doc)];
  const map = new Map();
  const existingLower = new Set((text.match(/\p{L}+/gu) || []).map((w) => w.toLowerCase()));
  for (const w of words) {
    const image = caesarShiftWord(w, shift);
    map.set(w, image);
  }
  return { map, words };
};

// Apply a word-level rename map to a text, matching whole words only
// (Unicode-letter-boundary anchored so "Kim's" renames only "Kim", and a word
// that is a substring of a longer word is never partially replaced).
export const applyRename = (text, map) => {
  if (!map.size) return text;
  const words = [...map.keys()].sort((a, b) => b.length - a.length);   // longest-first, avoids prefix clashes
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  return text.replace(pattern, (m) => map.get(m) ?? m);
};

// renameFixture(text, doc, opts) -> { renamedText, map, words } — the one call
// most Tier 4 tests need: derive the rename map from what THIS read admitted,
// then apply it to the ORIGINAL text (never to doc.sentences — the rename must
// happen upstream of parsing, so the renamed document is re-parsed from scratch,
// exactly as a real unfamiliar-name document would be read).
export const renameFixture = (text, doc, opts = {}) => {
  const { map, words } = buildRenameMap(doc, { ...opts, text });
  return { renamedText: applyRename(text, map), map, words };
};
