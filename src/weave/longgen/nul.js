// EO: NUL(Field → Void, Clearing) — hold the uncohered
// nul — hold the uncohered, at the generation grain (docs/nul-hold-the-uncohered.md).
//
// The dolphin failure: a reading whose material was PRESENT but did not COHERE (a
// projection collapsed its weights to ~0), and the loop, lacking a NUL, smeared it into
// hedged pseudo-prose. The honest move for present-but-uncohered ground is neither to hedge
// a shape the evidence cannot earn, nor to refuse (that is the answerability gate, a
// different failure — the wrong TYPE); it is NUL: hold the material, assert nothing.
//
// This is the ninth cell (core/voidnull.js `nul`) at the answer grain: read the ground's
// own scores against their Born noise-null; if essentially nothing clears it, the field is
// uncohered and the response is a single held atom — "I have these sources; they do not
// resolve into an answer" — with no sources cited, because there is nothing grounded to cite.

// Enough spans that "it does not cohere" is a measurement, not a cold start. Below this the
// walk proceeds normally — the NUL gate never fires on the small grounded answers.
const NUL_MIN = 8;

// A field is uncohered when its weight is DEGENERATE — concentrated on ~one item, the rest
// vanishing (the collapsed field a bad projection produces). The Born measure of that is the
// PARTICIPATION RATIO: treat the scores as amplitudes, and (Σw)² / Σw² is the effective
// number of items that actually contribute. Degenerate (one live, rest ~0) → ~1; a usable
// spread of N real scores → ~N. This is the concentration (inverse purity) of the normalized
// weight distribution — the same von-Neumann-style read the significance column runs, pointed
// at the ground. Below `min` effective items, nothing but one thing carries weight: uncohered.
export const participationRatio = (scores = []) => {
  let sum = 0, sumSq = 0, n = 0;
  for (const s of scores) if (Number.isFinite(s) && s > 0) { sum += s; sumSq += s * s; n += 1; }
  return sumSq > 0 ? (sum * sum) / sumSq : 0;
};

// The NUL gate. Returns a NUL response when the ground is genuinely uncohered — enough spans
// to judge, but their weight collapses onto ~one item (participation ≈ 1). Else null (proceed
// with the walk). Conservative: a spread of real scores has high participation and walks.
export const nulGate = (ground = [], { min = 1.5 } = {}) => {
  if (!Array.isArray(ground) || ground.length < NUL_MIN) return null;
  const scores = ground.map((s) => (s && Number.isFinite(s.score) ? s.score : 0));
  const p = participationRatio(scores);
  if (p >= min) return null;                            // more than ~one item carries weight — walk it
  const text = `I read ${ground.length} sources, but they do not cohere into an answer — ` +
    `the material is here, held, unresolved.`;
  const unit = { i: 0, move: 'NUL', stance: 'hold', band: 'firm', subClaim: 'the material does not cohere',
    text, sources: [], boundFraction: 1, vetoes: [], action: 'hold', nul: true };
  return {
    answer: text, units: [unit], sources: [], stop: 'nul-uncohered',
    followUp: '', participation: Math.round(p * 100) / 100,
    trace: [{ step: 0, kind: 'nul', participation: Math.round(p * 100) / 100, spans: ground.length }],
    state: { units: [], covered: [] },
  };
};
