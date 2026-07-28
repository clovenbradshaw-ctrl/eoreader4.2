// FALSIFIER F2 (spec §7) — does the corpus grammar beat the hand-derived phase bias?
//
// The spec (§5) proposes passing the pooled background move-grammar (data/shapes.json
// `background`) as a prior into predictDirection, MULTIPLIED with phaseBias(phase) rather
// than replacing it — on the argument that the two cover different blind spots (a bigram
// is memoryless but knows what follows SEG; the phase bias supplies the long-range arc the
// bigram cannot see). F2 is the measurement that licenses (or refuses) that wiring:
//
//   "Hold out a hundred exemplar responses. Score each response's move sequence under
//    phaseBias alone, under the pooled grammar alone, and under the product. If the
//    product does not beat both, keep the seat and drop the grammar."
//
// Operationalization. Each of the 430 exemplar responses (data/shapes-audit.jsonl) reduces
// to a DEPICTED move sequence over [NUL,SEG,SIG,CON,INS,SYN,VOID] (DEF/EVA/REC are the
// masked cognition register — turn/depicted.js). We split train/test, FIT the pooled
// grammar on the TRAIN split only (no test leakage — learnGrammar, the same fit
// tools/shape-fit.mjs runs), and score each held-out sequence's next-move likelihood under
// three predictors:
//
//   grammar-only    p(op_i | op_{i-1})           the pooled bigram (conditions on history)
//   phaseBias-only  p(op_i | phase_i)            uniform reweighted by the arc phase at i
//   product         applyPhaseBias(grammar,bias) exactly what direction.js would draw from
//
// The phase at position i is arcPhase({stepIndex:i, units:len i, remainingFrac:(N-i)/N}) —
// the same schedule the coarse walk imposes, reconstructed over the observed length. The
// metric is mean per-move log2-likelihood (bits/move) of the REAL responses — higher (less
// negative) = the predictor assigns real answers more probability. This is a held-out
// perplexity comparison, model-free and reproducible.
//
// VERDICT: F2 passes (wire the grammar) iff product beats BOTH baselines. Otherwise keep
// the seat (phaseBias) and drop the grammar.
//
//   node tools/falsify-f2-grammar.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { arcPhase, phaseBias, applyPhaseBias } from '../src/weave/longgen/shape.js';
import { sequenceLogLikelihood } from '../src/turn/shape-grammar.js';
import { learnGrammar } from '../src/perceiver/predict/grammar.js';
import { DEPICTED_ALPHABET } from '../src/turn/depicted.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT_PATH = join(ROOT, 'data', 'shapes-audit.jsonl');
const LOG2 = Math.log(2);
const FLOOR = 1e-9;
const ALPHA = new Set(DEPICTED_ALPHABET);

// ── Load the depicted move sequences ─────────────────────────────────────────
const records = readFileSync(AUDIT_PATH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
// A record's depicted sequence: the content-register, non-masked moves — exactly the
// `kept` set the grammar was fit from (turn/depicted.js isDepicted). Computed from
// register+op directly so the harness does not lean on the audit's own `kept` flag.
const depictedOf = (rec) => (rec.moves || [])
  .filter((m) => m && m.register === 'content' && ALPHA.has(m.op))
  .map((m) => m.op);
const samples = records
  .map((rec) => ({ id: rec.id, intent: rec.intent, seq: depictedOf(rec) }))
  .filter((s) => s.seq.length >= 1);

// Sanity: the harness's depicted reduction must agree with the audit's `kept` flag.
let mismatch = 0;
for (const rec of records) {
  const viaKept = (rec.moves || []).filter((m) => m.kept && ALPHA.has(m.op)).map((m) => m.op).join(',');
  const viaReg = depictedOf(rec).join(',');
  if (viaKept !== viaReg) mismatch++;
}

// ── The three next-move predictors ───────────────────────────────────────────
const restrictBias = (bias) => {                     // phaseBias over the depicted alphabet only
  const b = {};
  for (const op of DEPICTED_ALPHABET) b[op] = bias[op] ?? 1;
  return b;
};
const normalize = (dist) => {
  let Z = 0; for (const op of DEPICTED_ALPHABET) Z += Math.max(dist[op] ?? 0, 0);
  const out = {};
  for (const op of DEPICTED_ALPHABET) out[op] = Z > 0 ? Math.max(dist[op] ?? 0, 0) / Z : 1 / DEPICTED_ALPHABET.length;
  return out;
};
const lg2 = (p) => Math.log(Math.max(p, FLOOR)) / LOG2;

// phase at position i over a length-N sequence — the arc schedule reconstructed.
const phaseAt = (i, N) => arcPhase({ stepIndex: i, units: new Array(i).fill(0), remainingFrac: (N - i) / N });

// grammar-only: reuse the shipped scorer (marginal for op0, trans row after).
const scoreGrammar = (seq, grammar) => sequenceLogLikelihood(seq, grammar);

// phaseBias-only: uniform base reweighted by the phase bias at each position.
const scorePhase = (seq) => {
  const N = seq.length;
  let bits = 0;
  for (let i = 0; i < N; i++) {
    const bias = restrictBias(phaseBias(phaseAt(i, N)));
    const dist = normalize(bias);                    // uniform base * bias == bias, normalized
    bits += lg2(dist[seq[i]]);
  }
  return bits / N;
};

// product: the pooled grammar's row reweighted by the phase bias — applyPhaseBias, the
// exact operation direction.js performs on the drawn posterior.
const scoreProduct = (seq, grammar) => {
  const N = seq.length;
  let bits = 0;
  for (let i = 0; i < N; i++) {
    const prev = i === 0 ? null : seq[i - 1];
    const row = (prev != null && grammar.trans?.[prev]) ? grammar.trans[prev] : grammar.marginal;
    const ranked = DEPICTED_ALPHABET.map((op) => [op, Math.max(row?.[op] ?? 0, FLOOR)]);
    const bias = restrictBias(phaseBias(phaseAt(i, N)));
    const reweighted = applyPhaseBias(ranked, bias);         // [[op,p],…], renormalised
    const p = (reweighted.find(([op]) => op === seq[i]) || [null, FLOOR])[1];
    bits += lg2(p);
  }
  return bits / N;
};

// ── Aggregate over a held-out test set (move-weighted mean bits/move) ─────────
const evalSplit = (train, test) => {
  const grammar = learnGrammar(train.map((s) => s.seq.map((op) => ({ op }))), DEPICTED_ALPHABET, { alpha: 1 });
  let bG = 0, bP = 0, bX = 0, moves = 0;
  for (const s of test) {
    const N = s.seq.length;
    bG += scoreGrammar(s.seq, grammar) * N;
    bP += scorePhase(s.seq) * N;
    bX += scoreProduct(s.seq, grammar) * N;
    moves += N;
  }
  return { grammar: bG / moves, phase: bP / moves, product: bX / moves, moves, n: test.length };
};

// Deterministic split: order by a stable hash of id, hold out the first `holdout`.
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const ordered = [...samples].sort((a, b) => hash(a.id) - hash(b.id));

const HOLDOUT = 100;
const primary = evalSplit(ordered.slice(HOLDOUT), ordered.slice(0, HOLDOUT));

// Robustness: K-fold cross-validation over the same ordering.
const K = 5;
const folds = Array.from({ length: K }, (_, k) => ordered.filter((_, i) => i % K === k));
const cv = folds.map((testFold, k) => {
  const trainFold = ordered.filter((_, i) => i % K !== k);
  return evalSplit(trainFold, testFold);
});
const cvMean = (key) => cv.reduce((s, r) => s + r[key], 0) / cv.length;

// ── Report ───────────────────────────────────────────────────────────────────
const f = (x) => (x >= 0 ? '+' : '') + x.toFixed(4);
console.log('# FALSIFIER F2 — corpus grammar vs hand-derived phase bias');
console.log(`exemplars: ${samples.length} depicted sequences (from ${records.length} audit records)`);
console.log(`depicted-reduction vs audit \`kept\` flag: ${mismatch} mismatches`);
console.log(`metric: mean per-move log2-likelihood of REAL responses (higher = better)\n`);

console.log(`primary held-out (n=${primary.n}, ${primary.moves} moves):`);
console.log(`  phaseBias-only : ${f(primary.phase)} bits/move`);
console.log(`  grammar-only   : ${f(primary.grammar)} bits/move`);
console.log(`  product        : ${f(primary.product)} bits/move\n`);

console.log(`${K}-fold CV (mean over folds):`);
console.log(`  phaseBias-only : ${f(cvMean('phase'))} bits/move`);
console.log(`  grammar-only   : ${f(cvMean('grammar'))} bits/move`);
console.log(`  product        : ${f(cvMean('product'))} bits/move\n`);

const beatsBoth = (r) => r.product > r.grammar && r.product > r.phase;
const marginG = primary.product - primary.grammar;
const marginP = primary.product - primary.phase;
console.log(`product − grammar : ${f(marginG)} bits/move   (product must beat grammar)`);
console.log(`product − phase   : ${f(marginP)} bits/move   (product must beat phaseBias)`);

const pass = beatsBoth(primary) && beatsBoth({ product: cvMean('product'), grammar: cvMean('grammar'), phase: cvMean('phase') });
console.log(`\nVERDICT: ${pass ? 'PASS — product beats both. Wire the grammar (§5).'
  : 'FAIL — product does not beat both. Keep the seat (phaseBias); drop the grammar.'}`);
process.exit(0);
