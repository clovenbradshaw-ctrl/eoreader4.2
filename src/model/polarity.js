// EO: DEF(Lens, Dissecting) — the polarity trichotomy
// A base proposition (blind-structure.js propositionsOf) can stand in exactly three
// relations to a reading: asserted true (⊢A), asserted void (⊢¬A), or never read at
// all (¬⊢A). The first two are witnessed poles; the third is silence, and silence is
// NOT the same as a witnessed void — "the doc never mentions X" is a different claim
// than "the doc asserts X is false." Collapsing the two into one absence is exactly
// the closed-world assumption the rest of this spec (blind-structure.js `mode`)
// smuggled in unlabeled. This module names the third state so callers can ask for it
// on purpose (propositionsOf's `closure` option) instead of inheriting it by default.
export const POLARITY = Object.freeze({
  POS:  '+',      // ⊢A     — asserted, witnessed
  NEG:  '-',      // ⊢¬A    — void asserted, witnessed
  NULL: '∅',      // ¬⊢A    — no reading. NUL's glyph, deliberately.
});
