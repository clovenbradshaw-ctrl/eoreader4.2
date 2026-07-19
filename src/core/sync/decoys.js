// EO: DEF·SEG(Field → Void,Field, Clearing,Dissecting,Unraveling) — sync decoy generators
// Decoys — alignments between the SAME pair (or a genuinely unrelated pair) that carry no
// real correspondence, so their scores are samples of what chance produces: the "also-ran"
// background core/voidnull.js's boundedNull needs to derive a line. Each generator returns
// an array of per-window average local-similarity scores, at the SAME window size the real
// path is scored at (align.js), so the background and the candidate are directly comparable.
//
// Three generators, three different ways of destroying real correspondence while keeping
// the score function honest: shift the clock, shuffle the order, or swap in unrelated
// content entirely. Concatenated, they are what stands between "DTW always finds a path"
// and "a wrong caption file correctly fails to sync."

const windowAverages = (seqA, seqB, scoreFn, windowSize) => {
  const out = [];
  const n = Math.min(seqA.length, seqB.length);
  for (let i = 0; i + windowSize <= n; i += windowSize) {
    let sum = 0;
    for (let k = 0; k < windowSize; k++) sum += scoreFn(seqA[i + k], seqB[i + k]);
    out.push(sum / windowSize);
  }
  return out;
};

// Rotate B by a handful of fractional offsets and rescore the naive position-for-position
// pairing at each — a real correspondence should NOT survive being shifted, so this is what
// a subtitle file whose timing merely drifted (but whose CONTENT still matches) would defeat;
// blockShuffleDecoy below is what still catches that case (it destroys order, not just phase).
export const timeShiftDecoy = (seqA, seqB, scoreFn, { windowSize = 8, shifts = [0.1, 0.25, 0.5, 0.75] } = {}) => {
  const out = [];
  const n = seqB.length;
  if (!n) return out;
  for (const frac of shifts) {
    const shift = Math.max(1, Math.round(n * frac)) % n;
    if (!shift) continue;
    const shiftedB = seqB.slice(shift).concat(seqB.slice(0, shift));
    out.push(...windowAverages(seqA, shiftedB, scoreFn, windowSize));
  }
  return out;
};

// Chop B into ~`blocks` chunks and reassemble them out of order — destroys sequential
// correspondence while keeping B's own token statistics intact, so vocabulary overlap alone
// (e.g. two transcripts of unrelated speeches that happen to share common words) cannot
// fool the gate. Deterministic (no Math.random) so a run is reproducible byte-for-byte.
export const blockShuffleDecoy = (seqA, seqB, scoreFn, { windowSize = 8, blocks = 10, passes = 3 } = {}) => {
  const out = [];
  const n = seqB.length;
  if (!n) return out;
  const blockSize = Math.max(1, Math.ceil(n / blocks));
  for (let p = 0; p < passes; p++) {
    const chunks = [];
    for (let i = 0; i < n; i += blockSize) chunks.push(seqB.slice(i, i + blockSize));
    const rot = (p + 1) % Math.max(1, chunks.length);
    const shuffled = chunks.slice(rot).concat(chunks.slice(0, rot)).reverse().flat();
    out.push(...windowAverages(seqA, shuffled, scoreFn, windowSize));
  }
  return out;
};

// The strongest decoy: score A against 1-2 genuinely OTHER sources' feature sequences
// already in the workspace, when the caller has them to offer — real content, unrelated to
// this pair, so its score distribution is the truest sample of "what a wrong file looks
// like." Silently contributes nothing when no other sequences are available (align.js's
// MIN_SAMPLES guard in voidnull.js is what makes a too-thin background abstain, not this).
export const crossSourceDecoy = (seqA, otherSeqs, scoreFn, { windowSize = 8 } = {}) => {
  const out = [];
  for (const other of otherSeqs || []) out.push(...windowAverages(seqA, other, scoreFn, windowSize));
  return out;
};
