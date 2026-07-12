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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { learnGrammar } from '../src/perceiver/predict/grammar.js';
import { ENACTED_MASK, DEPICTED_ALPHABET, depictedMoves } from './lib/moves.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXEMPLARS_PATH = join(ROOT, 'data', 'exemplars.jsonl');
const NAV_CORPUS_PATH = join(ROOT, 'data', 'nav-corpus.jsonl');
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

// The CONTRAST grammars — the corpus as background distribution, not target. Fit one
// grammar per register over data/nav-corpus.jsonl responses: 'assistant-synthetic'
// (HelpSteer2/3, Magpie-Pro — chatbot-ese, the basin a draft should NOT sit in) and
// 'human-authored' (OASST2, Dolly15k — the positive register control). Discards are
// TYPED and counted, never silent: a corpus response that fails to parse or yields no
// depicted moves is logged by kind, so the fit's coverage is on the record.
const fitContrast = () => {
  if (!existsSync(NAV_CORPUS_PATH)) {
    console.log(`shape-fit: no ${NAV_CORPUS_PATH} — contrast grammars skipped (run tools/corpus-fetch.mjs + tools/nav-sample.mjs first)`);
    return null;
  }
  const byRegister = new Map();
  const discards = { 'no-response': 0, 'parse-failed': 0, 'no-depicted-moves': 0 };
  for (const line of readFileSync(NAV_CORPUS_PATH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let r;
    try { r = JSON.parse(t); } catch { continue; }
    if (!r.register || typeof r.response !== 'string' || !r.response.trim()) { discards['no-response']++; continue; }
    let moves;
    try { moves = depictedMoves(r.response, r.id); } catch { discards['parse-failed']++; continue; }
    if (!moves.length) { discards['no-depicted-moves']++; continue; }
    if (!byRegister.has(r.register)) byRegister.set(r.register, []);
    byRegister.get(r.register).push(moves);
  }
  const contrast = {};
  for (const [register, moveSeqs] of byRegister) {
    const grammar = fitGrammar(moveSeqs);
    assertMaskedZero(grammar, `contrast:${register}`);
    contrast[register] = { n: moveSeqs.length, grammar };
  }
  return { contrast, discards };
};

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

  const contrastFit = fitContrast();

  const out = {
    version: 2,
    source: 'data/exemplars.jsonl',
    maskedOps: [...ENACTED_MASK],
    alphabet: DEPICTED_ALPHABET,
    perIntent,
    background: { n: records.length, grammar: background },
    ...(contrastFit ? {
      contrast: contrastFit.contrast,
      contrastSource: 'data/nav-corpus.jsonl',
      contrastDiscards: contrastFit.discards,
    } : {}),
  };

  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');

  console.log(`shape-fit: ${records.length} exemplars, ${byIntent.size} intents -> ${OUT_PATH}`);
  for (const [intent, { n }] of Object.entries(perIntent)) console.log(`  ${intent}: n=${n}`);
  console.log(`  background (pooled exemplars): n=${records.length}`);
  if (contrastFit) {
    for (const [register, { n }] of Object.entries(contrastFit.contrast)) console.log(`  contrast:${register}: n=${n}`);
    console.log(`  contrast discards: ${JSON.stringify(contrastFit.discards)}`);
  }
}

main();
