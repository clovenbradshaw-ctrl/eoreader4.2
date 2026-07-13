// FALSIFIER F1 (spec §7) — does the FIELD predict length better than the regex?
//
//   "Take fifty questions with known-good answers of varying length. Compute
//    buildSkeleton(...).length from the ground alone. Correlate against the length of the
//    good answer. If the skeleton's beat count does not track the reference length better
//    than wantsLongform does, the field is not carrying the signal and the whole inversion
//    is wrong. Run this before touching stages.js."
//
// F1 pits two predictors of answer length against the known-good answer:
//   REGEX  wantsLongform(question)         — a boolean over the user's adverbs (the incumbent)
//   FIELD  buildSkeleton(ground).planned   — the beat count the ground actually supports
//
// The FIELD predictor requires GROUND — an array of retrieved spans {idx,text,score} per
// question. The exemplar corpus (data/exemplars.jsonl) pairs a question with a known-good
// `response` but carries only a prose `context_sketch`, NOT real ground spans. So the field
// side of F1 CANNOT be computed from the shipped corpus. This harness therefore:
//
//   1. Fully characterizes the REGEX predictor over the 430 exemplars (the incumbent
//      baseline — half of F1, runnable today), and
//   2. Runs the full head-to-head when given a ground corpus via `--ground <file.jsonl>`
//      (records: {question, ground:[{idx,text,score}], answer}). Absent that corpus, the
//      field side reports BLOCKED and — per the spec's gate — buildSkeleton is NOT licensed
//      as the length authority in stages.js until this can run.
//
//   node tools/falsify-f1-length.mjs [--ground path.jsonl]

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildSkeleton } from '../src/weave/longgen/skeleton.js';
import { classifyWantedType } from '../src/weave/longgen/answerable.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXEMPLARS = join(ROOT, 'data', 'exemplars.jsonl');

// LONGFORM_RE — copied VERBATIM from src/rooms/reader/app.js:158 (a private const there;
// inlined here so the tool needs no browser module graph). The measurement is of THIS regex.
const LONGFORM_RE = /\b(essays?|treatise|report|deep[\s-]?dive|comprehensive(?:ly)?|in[\s-]?depth|at\s+length|long[\s-]?form|thorough(?:ly)?|detailed|\d{3,}\s*words?|(?:write|compose|draft|create|produce|generate|give)\s+(?:me\s+|us\s+)?(?:a|an|the|some)\b[^.?!]{0,40}?\b(?:essay|report|overview|account|piece|article|guide|breakdown|story|analysis|write[-\s]?up|blog\s*post|review))\b/i;
const wantsLongform = (q) => LONGFORM_RE.test(String(q || ''));

const jsonl = (p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

// ── Length measures of a good answer ─────────────────────────────────────────
const wordCount = (s) => (String(s || '').trim().match(/\S+/g) || []).length;
const sentCount = (s) => (String(s || '').match(/[.!?]+(\s|$)/g) || []).length || (String(s).trim() ? 1 : 0);

// Pearson correlation.
const pearson = (xs, ys) => {
  const n = xs.length; if (!n) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : 0;
};

// ── 1. REGEX baseline over the exemplar corpus ───────────────────────────────
const exemplars = jsonl(EXEMPLARS).filter((r) => r.user_turn && r.response);
const rows = exemplars.map((r) => ({
  q: r.user_turn, words: wordCount(r.response), sents: sentCount(r.response),
  fires: wantsLongform(r.user_turn) ? 1 : 0, wanted: classifyWantedType(r.user_turn),
}));

const fired = rows.filter((r) => r.fires), quiet = rows.filter((r) => !r.fires);
const mean = (a, k) => a.length ? a.reduce((s, r) => s + r[k], 0) / a.length : NaN;
const rPB = pearson(rows.map((r) => r.fires), rows.map((r) => r.words));   // point-biserial

// "Long" = top tercile of answer length; does the regex catch those?
const wordsSorted = [...rows].map((r) => r.words).sort((a, b) => a - b);
const longBar = wordsSorted[Math.floor(wordsSorted.length * 0.667)] || 0;
const longAnswers = rows.filter((r) => r.words >= longBar);
const missed = longAnswers.filter((r) => !r.fires).length;              // long answer, regex silent
const falseAlarm = fired.filter((r) => r.words < longBar).length;       // regex fires, short answer

console.log('# FALSIFIER F1 — field vs regex as a predictor of answer length');
console.log(`corpus: data/exemplars.jsonl (${rows.length} question→good-answer pairs)\n`);
console.log('## REGEX predictor (wantsLongform over the question) — the incumbent, runnable today');
console.log(`  regex fires on ${fired.length}/${rows.length} questions (${(100 * fired.length / rows.length).toFixed(1)}%)`);
console.log(`  mean good-answer length | regex fires : ${mean(fired, 'words').toFixed(1)} words`);
console.log(`  mean good-answer length | regex quiet : ${mean(quiet, 'words').toFixed(1)} words`);
console.log(`  point-biserial r(regex, answer words) : ${rPB.toFixed(3)}`);
console.log(`  long answers (top tercile, ≥${longBar} words): ${longAnswers.length}`);
console.log(`    ↳ MISSED by the regex (long answer, no fire): ${missed}/${longAnswers.length} (${(100 * missed / (longAnswers.length || 1)).toFixed(0)}%)`);
console.log(`    ↳ regex FALSE ALARMS (fires on a short answer): ${falseAlarm}/${fired.length || 1}`);

// ── 2. FIELD predictor — needs a ground corpus ───────────────────────────────
const groundArg = process.argv.indexOf('--ground');
const groundPath = groundArg >= 0 ? process.argv[groundArg + 1] : null;

console.log('\n## FIELD predictor (buildSkeleton(ground).planned)');
if (!groundPath || !existsSync(groundPath)) {
  console.log('  BLOCKED — no ground corpus. buildSkeleton needs real retrieved spans');
  console.log('  {idx,text,score} per question; the exemplar corpus carries only a prose');
  console.log('  context_sketch, not ground. Provide --ground <file.jsonl> with records');
  console.log('  {question, ground:[{idx,text,score}], answer} to complete the head-to-head.');
  console.log('\nVERDICT: INCONCLUSIVE — the FIELD side of F1 cannot be measured on the shipped');
  console.log('corpus. Per the spec ("Run this before touching stages.js"), buildSkeleton is NOT');
  console.log('licensed as the length authority until a (question, ground, answer) corpus exists.');
  console.log('The regex baseline above stands on its own as a characterization of the incumbent.');
  process.exit(0);
}

// Full head-to-head when ground is supplied.
const gcorpus = jsonl(groundPath).filter((r) => r.question && Array.isArray(r.ground) && r.answer != null);
const fx = [], reg = [], ans = [];
for (const r of gcorpus) {
  const ground = r.ground.map((s, i) => ({ idx: s.idx ?? i, text: s.text ?? String(s), score: s.score ?? 0 }));
  const demand = classifyWantedType(r.question);      // wantedType selects the artifact, not the length
  const skel = buildSkeleton({ ground, question: r.question, demand: null, outline: null, max: 8 });
  fx.push(skel.planned);
  reg.push(wantsLongform(r.question) ? 1 : 0);
  ans.push(wordCount(r.answer));
  void demand;
}
const rField = pearson(fx, ans), rRegex = pearson(reg, ans);
console.log(`  ground corpus: ${gcorpus.length} records`);
console.log(`  r(buildSkeleton.planned, answer words) : ${rField.toFixed(3)}   [FIELD]`);
console.log(`  r(wantsLongform,        answer words)  : ${rRegex.toFixed(3)}   [REGEX]`);
console.log(`\nVERDICT: ${rField > rRegex
  ? 'PASS — the field tracks reference length better than the regex. The inversion holds.'
  : 'FAIL — the field does NOT beat the regex. The field is not carrying the length signal.'}`);
process.exit(0);
