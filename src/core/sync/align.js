// EO: EVA·CON(Field → Link,Void, Binding,Tracing) — cross-source alignment, born-rule gated
// alignSequences — the core of the sync feature. Finds a correspondence between two feature
// sequences (organs/in/sync-reduce.js reduces a source's own tokens to this shape) and reports
// it ONLY where it clearly beats a background of decoy (non-)alignments — never a brute-force
// "here is the best path I could find," which a plain DTW always returns even between two
// unrelated files. The gate is core/voidnull.js's boundedNull, unmodified: the same Born-rule
// noise floor the rest of the engine uses to decide whether a structure is signal or chance.
//
// Sequence alignment (edit-distance-with-substitution, banded so it stays roughly O(n·band)
// rather than O(n·m)) finds WHERE things might correspond; the gate decides whether that
// correspondence is real. A wrong subtitle file still produces *a* path — DTW cannot do
// otherwise — but its window scores land inside the decoy background, so every window is
// rejected and the run reports abstain:true rather than a confident-looking, wrong sync.

import { boundedNull } from '../index.js';
import { timeShiftDecoy, blockShuffleDecoy, crossSourceDecoy } from './decoys.js';
import { makeAnchor, makeHeader } from './anchors.js';

// Bounded Levenshtein, ceiling-capped by token length — the same shape as
// perceiver/parse/fuzzy.js's editWithin/fuzzCeiling, reimplemented locally rather than
// imported: core purity (docs/architecture.md — "core cannot import anything") means this
// small, self-contained primitive lives here rather than reaching outside src/core for it.
const fuzzCeiling = (len) => (len <= 3 ? 0 : len <= 6 ? 1 : 2);
const editWithin = (a, b, maxDist) => {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;
  if (maxDist <= 0) return a === b ? 0 : 1;
  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur = new Array(lb + 1);
    cur[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1;
    prev = cur;
  }
  return prev[lb];
};

// Bounded [0,1] token similarity — the local edit-distance primitive above, never a new
// distance metric invented for this feature (it mirrors fuzzy.js's shape exactly).
export const tokenScore = (a, b) => {
  const na = a && a.norm, nb = b && b.norm;
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ceiling = fuzzCeiling(Math.max(na.length, nb.length));
  if (ceiling === 0) return 0;
  const d = editWithin(na, nb, ceiling);
  return d > ceiling ? 0 : 1 - d / (ceiling + 1);
};

const GAP_COST = 1;   // skipping a token costs exactly as much as the worst possible match

// Banded sequence alignment (Needleman-Wunsch-shaped: match/skip-A/skip-B), the band sized
// off the two sequences' own length ratio so very different lengths (a sparse subtitle file
// vs. a dense word-level ASR transcript) still align without an O(n·m) matrix. Returns the
// backtraced path as [{i, j, score}], one entry per matched (not skipped) pair.
export const bandedAlign = (seqA, seqB, scoreFn, { bandFrac = 0.15, minBand = 20 } = {}) => {
  const n = seqA.length, m = seqB.length;
  if (!n || !m) return [];
  const band = Math.max(minBand, Math.ceil(bandFrac * Math.max(n, m)));
  const ratio = m / n;
  const loOf = (i) => Math.max(0, Math.floor(i * ratio) - band);
  const hiOf = (i) => Math.min(m, Math.ceil(i * ratio) + band);
  const INF = Infinity;

  const rows = new Array(n + 1);
  const rowLo = new Array(n + 1);
  const mk = (lo, hi) => new Float64Array(Math.max(0, hi - lo) + 1).fill(INF);
  const at = (i, j) => {
    const r = rows[i]; if (!r) return INF;
    const idx = j - rowLo[i];
    return (idx < 0 || idx >= r.length) ? INF : r[idx];
  };

  const lo0 = loOf(0), hi0 = hiOf(0);
  rows[0] = mk(lo0, hi0); rowLo[0] = lo0;
  for (let j = lo0; j <= hi0; j++) rows[0][j - lo0] = j * GAP_COST;

  for (let i = 1; i <= n; i++) {
    const jLo = loOf(i), jHi = hiOf(i);
    const row = mk(jLo, jHi);
    for (let j = jLo; j <= jHi; j++) {
      const up = at(i - 1, j) + GAP_COST;                                  // consumed A[i-1], skipped B
      const left = j > jLo ? row[j - 1 - jLo] + GAP_COST : INF;            // consumed B[j-1], skipped A
      const diag = j > 0 ? at(i - 1, j - 1) + (1 - scoreFn(seqA[i - 1], seqB[j - 1])) : INF;
      const best = Math.min(up, left, diag);
      if (Number.isFinite(best)) row[j - jLo] = best;
    }
    rows[i] = row; rowLo[i] = jLo;
  }
  if (!Number.isFinite(at(n, m))) return [];   // band too narrow for these two sequences — no path

  const path = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    const cur = at(i, j);
    const s = scoreFn(seqA[i - 1], seqB[j - 1]);
    const diag = at(i - 1, j - 1) + (1 - s);
    const up = at(i - 1, j) + GAP_COST;
    if (Math.abs(cur - diag) < 1e-9) { path.push({ i: i - 1, j: j - 1, score: s }); i--; j--; }
    else if (Math.abs(cur - up) < 1e-9) { i--; }
    else { j--; }
  }
  return path.reverse();
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// alignSequences(seqA, seqB, opts) → { anchors, header, background, path }
//   seqA, seqB    {t, text, norm}[] — organs/in/sync-reduce.js's normalized feature sequences
//   opts.alpha    tolerated false-positive rate for the born-rule gate (default 0.05)
//   opts.windowSize  path steps grouped per gate decision (default 8) — an anchor's own
//                     window must clear the line, not just that one lucky token
//   opts.minCoverage  below this fraction of min(len) anchored, the whole run abstains (0.15
//                      — well above the ~10% coincidental-match rate two unrelated same-
//                      language texts produce from shared function words alone; a genuine
//                      correspondence clears 60%+, so the margin is wide)
//   opts.otherSeqs    other sources' feature sequences already in the workspace, for the
//                      cross-source decoy (the strongest background, when available)
//   opts.snA/snB, opts.roleA/roleB   carried into the header for the record, not used to align
export const alignSequences = (seqA, seqB, opts = {}) => {
  const { alpha = 0.05, windowSize = 8, minCoverage = 0.15, otherSeqs = [],
          snA = null, snB = null, roleA = null, roleB = null } = opts;

  const path = bandedAlign(seqA, seqB, tokenScore);
  const minLen = Math.min(seqA.length, seqB.length);

  const background = [
    ...timeShiftDecoy(seqA, seqB, tokenScore, { windowSize }),
    ...blockShuffleDecoy(seqA, seqB, tokenScore, { windowSize }),
    ...crossSourceDecoy(seqA, otherSeqs, tokenScore, { windowSize }),
  ];
  const line = boundedNull(background, { alpha, ceiling: 1, fallback: undefined });

  if (!Number.isFinite(line) || !path.length) {
    return {
      anchors: [],
      header: makeHeader({ snA, snB, roleA, roleB, alpha, N: background.length, line, abstain: true, coverage: 0 }),
      background, path,
    };
  }

  const anchors = [];
  for (let w = 0; w < path.length; w += windowSize) {
    const win = path.slice(w, w + windowSize);
    const winScore = win.reduce((s, p) => s + p.score, 0) / win.length;
    if (winScore <= line) continue;
    for (const step of win) {
      if (step.score <= line) continue;   // the window passed; an individual dud step still doesn't
      const confidence = clamp01((step.score - line) / (1 - line));
      anchors.push(makeAnchor({
        snA, snB, tA: seqA[step.i].t, tB: seqB[step.j].t,
        textA: seqA[step.i].text, textB: seqB[step.j].text,
        score: step.score, confidence,
      }));
    }
  }

  const coverage = minLen ? anchors.length / minLen : 0;
  const abstain = anchors.length === 0 || coverage < minCoverage;
  return {
    anchors: abstain ? [] : anchors,
    header: makeHeader({ snA, snB, roleA, roleB, alpha, N: background.length, line, abstain, coverage }),
    background, path,
  };
};
