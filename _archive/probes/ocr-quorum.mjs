// Probe for "OCR quorum + context" — a set of witnesses read one scan, then the reading
// edits itself in context. Cheap, read-only, runnable narrative. Run: node probes/ocr-quorum.mjs
//
// It executes the REAL code paths (the organ barrel: ingestOcr's quorum path, resolveOcr,
// resolveOcrInContext, revertOcrGuesses). It prints a report; it asserts nothing — the
// regression guards are tests/ocr-quorum.test.js and tests/ocr-context.test.js. The point is
// to SEE, on the actual spine, the three layers the request asked for:
//
//   1. RAW      — what each eye returned (the witnesses).
//   2. QUORUM   — the elected reading, its belief, and the rule learned about which eye is best.
//   3. GUESS    — a shaky line re-read as what it likely means in context — and peeled back off.

import { ingestOcr, resolveOcr, resolveOcrInContext, revertOcrGuesses } from '../src/organs/in/index.js';

const h  = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const kv = (k, v) => console.log(`  ${String(k).padEnd(34)} ${v}`);
const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

// Three eyes read a three-line notice, so each layer fixes what the other cannot:
//   line 1 — all three agree (confident context: "trusted", "contract").
//   line 2 — the third eye misreads "trusted" as "trvsted"; the QUORUM outvotes it 2-to-1.
//   line 3 — only ONE eye sees it, and it garbles "contract" as "cortract"; no second eye can
//            outvote a lone witness, so the CONTEXT layer repairs it from line 1's vocabulary.
const readings = [
  { engine: 'tesseract', lines: [
    { text: 'Anna trusted the contract.', bbox: box(40, 20, 460, 44), confidence: 93 },
    { text: 'Ben also trusted Anna.',     bbox: box(40, 60, 420, 84), confidence: 89 },
    { text: 'The cortract holds.',        bbox: box(40, 100, 360, 124), confidence: 58 },  // lone eye, garble
  ] },
  { engine: 'florence2-ocr', lines: [
    { text: 'Anna trusted the contract.', bbox: box(41, 21, 461, 45), confidence: null },
    { text: 'Ben also trusted Anna.',     bbox: box(42, 61, 419, 85), confidence: null },
  ] },
  { engine: 'paddle', lines: [
    { text: 'Anna trusted the contract.', bbox: box(39, 19, 459, 43), confidence: 87 },
    { text: 'Ben also trvsted Anna.',     bbox: box(41, 62, 421, 86), confidence: 62 },  // cross-eye misread
  ] },
];

// ───────────────────────────────────────────────────────────────────────────────
h('LAYER 1 + 2 — the eyes read, the quorum reconciles');
// ───────────────────────────────────────────────────────────────────────────────
const q = resolveOcr(readings);
console.log('\n  the raw witnesses, per physical line:');
q.blocks.forEach((b, i) => {
  console.log(`\n  line ${i + 1}:  \x1b[1m"${b.text}"\x1b[0m   (elected from ${b.ref.elected})`);
  kv('eyes / agreement / belief', `${b.ref.eyes} eyes · ${b.ref.agreement != null ? Math.round(b.ref.agreement * 100) + '% agree' : '—'} · belief ${b.ref.belief}`);
  kv('disagreement flagged?', b.ref.disagreement ? 'YES — a reader should check this line' : 'no — corroborated');
  b.ref.witnesses.forEach((w) => kv(`  · ${w.engine}`, `"${w.text}" ${w.agreed ? '✓' : '✗ (dissented)'}`));
});

// ───────────────────────────────────────────────────────────────────────────────
h('LAYER 2 — REC: the rule learned about which eye is best');
// ───────────────────────────────────────────────────────────────────────────────
q.reliability.forEach((r) => kv(r.engine, r.reliability == null ? 'never checked (no second eye on its lines)' : `${Math.round(r.reliability * 100)}% agreement with consensus (over ${r.checked} checked lines)`));
kv('\n  most reliable eye (DEF)', q.best || '—');

// ───────────────────────────────────────────────────────────────────────────────
h('LAYER 3 — the reading edits itself IN CONTEXT');
// ───────────────────────────────────────────────────────────────────────────────
const doc = ingestOcr({ name: 'mou.png', readings });
console.log('\n  before the context pass:');
doc.spans.forEach((s, i) => kv(`line ${i + 1}`, `"${s.text}"  (belief ${s.ref.belief}${s.ref.disagreement ? ', shaky' : ''})`));

const receipt = resolveOcrInContext(doc);
console.log(`\n  ${receipt.edits} line(s) re-read as what they likely mean, given the rest of the page:`);
receipt.guesses.forEach((g) => {
  kv('  guess', `"${g.from}"  ⇒  "${g.to}"   (belief ${g.belief})`);
  g.words.forEach((w) => kv('    evidence', w.evidence));
});
console.log('\n  after the context pass:');
doc.spans.forEach((s, i) => kv(`line ${i + 1}`, `"${s.text}"${s.guessed ? `   (guessed — raw was "${s.raw}")` : ''}`));

// ───────────────────────────────────────────────────────────────────────────────
h('AUDIT — the whole trail lives on the append-only log (DEF · EVA · REC · SEG · INS)');
// ───────────────────────────────────────────────────────────────────────────────
const tally = {};
for (const e of doc.log.snapshot()) { const key = `${e.op}${e.kind ? ':' + e.kind : e.reason ? ':' + e.reason : ''}`; tally[key] = (tally[key] || 0) + 1; }
Object.entries(tally).sort().forEach(([k, n]) => kv(k, n));

// ───────────────────────────────────────────────────────────────────────────────
h('REVERT — the guess layer peels straight back off');
// ───────────────────────────────────────────────────────────────────────────────
const { reverted } = revertOcrGuesses(doc);
kv('guesses reverted', reverted);
doc.spans.forEach((s, i) => kv(`line ${i + 1}`, `"${s.text}"${s.guessed ? ' (still guessed)' : ''}`));
kv('reversal on the log?', doc.log.snapshot().some((e) => e.op === 'EVA' && e.reason === 'ocr-guess-reverted') ? 'yes — nothing is unwritten, in either direction' : 'no');
console.log();
