// EO: NUL(Void → Void, Clearing) — degenerate-line guard
// The degenerate-structure guard.
//
// This is NOT chrome detection by a list of conventions — that is a semantic
// role, and it lives in `read/site.js`, where a unit is DEF'd as a *site*
// (ground/furniture) by its semantic role rather than matched against patterns.
//
// What stays here is only the genuinely degenerate: a line with no content to
// have a role — empty, a bare roman numeral, a footnote marker, a separator rule.
// These are not conventions; they carry no figure at all, so they are held as NUL
// at parse time. Everything with actual words gets a role decided semantically.
//
// A NUMBER, crucially, is NOT degenerate. A bare "72", "55", "1,471", "66.9" is a
// quantity — a temperature, a score, a count, a price — and on the modern web the
// data a reader most wants arrives exactly that way: a forecast or a results table
// serialized to text lands each figure on its own line. The old rule held every
// bare-number line as chrome (and `length < 3` swept up "72" before the regex even
// ran), so "what are the numbers?" had nothing to ground on — the figures were
// censored at parse time. A digit-bearing line is content; only the genuinely
// empty stays degenerate.

const FOOTNOTE  = /^\[\d{1,3}\]$/;        // "[12]" — a reference marker, not a datum
const ROMAN     = /^[ivxlcdm]{1,7}\.?$/i; // a bare roman numeral: "III", "iv."
const SEPARATOR = /^[\W_]+$/;             // only punctuation/symbols — a separator rule

export const isDegenerate = (sentence) => {
  const s = String(sentence || '').trim();
  if (!s) return true;
  if (FOOTNOTE.test(s)) return true;      // tested before the digit guard: a ref marker carries no datum
  if (/\d/.test(s)) return false;         // any digit ⇒ a quantity ⇒ content — never censor a number
  if (s.length < 3) return true;          // a stray non-numeric fragment ("a", "ok", a bad split)
  return ROMAN.test(s) || SEPARATOR.test(s);
};

// `hint` is the nudge seam (message: "a mini-LLM is a good way to nudge things
// toward chrome"). A boolean or a number ≥ 1 forces the hold; otherwise the
// line is held only if it is structurally degenerate. The *semantic* role pass
// is the real determinant and runs later, with the embedder.
export const isChrome = (sentence, hint = 0) => {
  const nudge = typeof hint === 'boolean' ? (hint ? 1 : 0) : (Number(hint) || 0);
  return isDegenerate(sentence) || nudge >= 1;
};
