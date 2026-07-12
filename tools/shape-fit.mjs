// Fit per-intent move-grammars from data/exemplars.jsonl -> data/shapes.json.
//
// Each exemplar response is parsed (parse/pipeline.js parseText) and reduced to its
// move-log (perceiver/predict/movelog.js buildMoveLog) — a sequence over the ten-symbol
// operator alphabet. Grouping by intent and running learnGrammar (predict/grammar.js,
// the same bigram fit scripts/learn-grammar.mjs runs over metamorphosis.txt) yields a
// per-intent transition matrix: the learned SHAPE of that kind of answer, form with the
// tokens thrown away.
//
// DEF/EVA/REC are the enacted (cognition) register — the reader's own frame-forming,
// testing, and breaking (movelog.js's ENACTED stream), not anything depicted in the
// response text. They are dropped before the grammar is fit, so the fitted shape is a
// judgment-free skeleton of depicted form: it can carry no verdict, no held belief, no
// break — only NUL/SEG/SIG/CON/INS/SYN/VOID, the operators a response's own content
// register can emit. That is what makes scoring a draft against a shape safe as a
// contract on the input side (docs/model-as-contracted-part.md): the shape cannot leak
// a judgment because it was never fit from one.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { learnGrammar } from '../src/perceiver/predict/grammar.js';
import { ENACTED_MASK, DEPICTED_ALPHABET, depictedMoves } from './lib/moves.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXEMPLARS_PATH = join(ROOT, 'data', 'exemplars.jsonl');
const OUT_PATH = join(ROOT, 'data', 'shapes.json');

const parseExemplars = (text) => {
  const out = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('//')) continue;
    try {
      const r = JSON.parse(t);
      if (r && typeof r.response === 'string' && r.intent) out.push(r);
    } catch { /* skip malformed line */ }
  }
  return out;
};

const fitGrammar = (moveSeqs, alpha = 0.5) => learnGrammar(moveSeqs, DEPICTED_ALPHABET, { alpha });

// The masking proof: DEF/EVA/REC are structurally absent from the fitted alphabet, not
// merely smoothed toward zero (add-alpha smoothing over a 10-symbol alphabet would give
// even an unobserved op a nonzero floor — fitting over the 7-symbol DEPICTED_ALPHABET
// instead means there is no column for a judgment op to occupy at all).
const assertMaskedZero = (grammar, label) => {
  for (const op of ENACTED_MASK) {
    if (grammar.alphabet.includes(op)) {
      throw new Error(`shape-fit: ${label} grammar's alphabet includes masked op ${op} — masking failed`);
    }
  }
};

const round = (x, k = 6) => (Number.isFinite(x) ? Math.round(x * 10 ** k) / 10 ** k : x);

function main() {
  const raw = readFileSync(EXEMPLARS_PATH, 'utf8');
  const records = parseExemplars(raw);
  if (!records.length) throw new Error(`shape-fit: no exemplars read from ${EXEMPLARS_PATH}`);

  const byIntent = new Map();
  for (const r of records) {
    if (!byIntent.has(r.intent)) byIntent.set(r.intent, []);
    byIntent.get(r.intent).push(r);
  }

  const perIntent = {};
  const allMoveSeqs = [];
  for (const [intent, recs] of byIntent) {
    const moveSeqs = recs.map((r) => depictedMoves(r.response, r.id));
    allMoveSeqs.push(...moveSeqs);
    const grammar = fitGrammar(moveSeqs);
    assertMaskedZero(grammar, intent);
    perIntent[intent] = { n: recs.length, grammar };
  }

  const background = fitGrammar(allMoveSeqs);
  assertMaskedZero(background, 'background');

  const out = {
    version: 1,
    source: 'data/exemplars.jsonl',
    maskedOps: [...ENACTED_MASK],
    alphabet: DEPICTED_ALPHABET,
    perIntent,
    background: { n: records.length, grammar: background },
  };

  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');

  console.log(`shape-fit: ${records.length} exemplars, ${byIntent.size} intents -> ${OUT_PATH}`);
  for (const [intent, { n }] of Object.entries(perIntent)) console.log(`  ${intent}: n=${n}`);
  console.log(`  background: n=${records.length}`);
}

main();
