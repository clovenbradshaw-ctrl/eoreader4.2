// EO: SYN·INS(Field,Network → Paradigm, Composing,Making) — corpus → move-shapes, offline
// The join. Run the move-log door (perceiver/predict/movelog.js) over the CORPUS RESPONSES,
// not over a text being read. Each authored response collapses to a sequence over the move
// alphabet — form with the tokens thrown away — and a per-intent bigram grammar over those
// sequences IS the shape that kind of answer wants. Same math the predictor's learnGrammar
// runs (perceiver/predict/grammar.js); a new object, keyed by intent.
//
// Two things this fit is careful about, both load-bearing:
//
//   MASKING.  DEF, EVA, and REC are the reader's own judgment moves — DEF its frame's terms,
//             EVA each particular against them, REC the break. (In the move-log they are the
//             ENACTED register, the reader's cognition ABOUT the response.) They are masked out
//             at fit time, so the fitted shape is provably incapable of carrying a judgment:
//             every shape grammar has exactly zero mass on DEF/EVA/REC (tests/shape-fit.test.js).
//             That is what makes a shape content-free by construction — no corpus content can
//             leak into a Ground-Truth story through the form prior. It is a Law-1 contract in
//             the INPUT direction (docs/model-as-contracted-part.md): the prompt's wanted shape
//             is a distribution over ops, and a distribution that cannot express a judgment
//             cannot smuggle one.
//
//   BACKGROUND.  A grammar fit over ALL responses at once is shipped alongside the per-intent
//             grammars — the corpus's register as a whole. It is the NEGATIVE set: the honest
//             contrast for a draft is s_yours − s_background (this register vs. off-corpus
//             chatbot-ese), not one intent against the corpus's own other intents. The consumer
//             (turn/shape.js) reads the intent grammar as the target and the background as the
//             thing to be unlike.
//
// Offline and model-free: parsing and reading need no embedder, so this is a pure corpus →
// data/shapes.json transform. Navigation (which intent a live question wants) still embeds at
// run time exactly as matchPrompt does today — but SCORING a draft against a shape becomes a
// likelihood under a transition matrix, not a cosine, so the reading path itself stays modelless.
//
// Regenerate:  node tools/shape-fit.mjs   (writes data/shapes.json)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseText } from '../src/perceiver/parse/index.js';
import { buildMoveLog, learnGrammar, MOVE_ALPHABET } from '../src/perceiver/predict/index.js';
import { parseExemplars } from '../src/turn/shape.js';

// The judgment moves — the enacted DEF→EVA→REC cognition the reader runs OVER a response.
// Masked at fit time so no shape can carry an epistemic verdict.
export const MASKED = Object.freeze(['DEF', 'EVA', 'REC']);
const MASKED_SET = new Set(MASKED);
// What survives the mask: the depicted-form skeleton the shape actually is.
export const KEPT = Object.freeze(MOVE_ALPHABET.filter((op) => !MASKED_SET.has(op)));

// Abstract one response string to its masked move-sequence — the move-log door run over a
// response, with the judgment moves dropped. Returns an array of moves ({ op, ... }) carrying
// only KEPT ops, in reading order. Never throws: a response the parser cannot read is an empty
// sequence, skipped by the caller, exactly like a malformed exemplar line.
export const abstractResponse = (response, { docId = 'shape' } = {}) => {
  try {
    const doc = parseText(String(response || ''), { docId });
    const { moves } = buildMoveLog(doc, {});
    return moves.filter((m) => m && !MASKED_SET.has(m.op) && MOVE_ALPHABET.includes(m.op));
  } catch {
    return [];
  }
};

// Re-key a grammar learned over the KEPT alphabet into the full ten-symbol layout the predictor
// speaks (grammarPrior/DEFAULT_GRAMMAR), with the masked symbols pinned to exactly 0 as both a
// context row and a next-move column. The kept rows already normalise over KEPT, so pinning the
// masked columns to 0 leaves every row summing to 1; the marginal likewise. This makes the
// zero-mass guarantee provable, not merely an add-α floor.
const toFullAlphabet = (kept) => {
  const trans = {};
  for (const prev of MOVE_ALPHABET) {
    trans[prev] = {};
    for (const next of MOVE_ALPHABET) {
      trans[prev][next] =
        MASKED_SET.has(prev) || MASKED_SET.has(next) ? 0 : round(kept.trans?.[prev]?.[next] ?? 0);
    }
  }
  const marginal = {};
  for (const op of MOVE_ALPHABET) marginal[op] = MASKED_SET.has(op) ? 0 : round(kept.marginal?.[op] ?? 0);
  return { alphabet: [...MOVE_ALPHABET], trans, marginal };
};

const round = (x) => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : 0);

// Fit a single shape grammar from an array of masked move-sequences. Fits over the KEPT
// alphabet (so add-α never puts mass on a masked symbol), then re-keys to the full layout.
const fitGrammar = (moveSeqs, { alpha = 0.5 } = {}) =>
  toFullAlphabet(learnGrammar(moveSeqs, KEPT, { alpha }));

// fitShapes(records, opts) → the shapes object written to data/shapes.json.
//   records   parsed exemplars ({ intent, response, ... }); anything without a readable
//             response contributes no sequence.
//   opts      { alpha } — the grammar's add-α smoothing (matches the predictor's default 0.5).
export const fitShapes = (records, { alpha = 0.5, source = null } = {}) => {
  const byIntent = new Map();
  const all = [];
  let read = 0;
  for (const r of records) {
    const seq = abstractResponse(r.response);
    if (!seq.length) continue;
    read++;
    all.push(seq);
    if (!byIntent.has(r.intent)) byIntent.set(r.intent, []);
    byIntent.get(r.intent).push(seq);
  }

  const intents = {};
  for (const [intent, seqs] of [...byIntent.entries()].sort()) {
    const g = fitGrammar(seqs, { alpha });
    intents[intent] = { n: seqs.length, moves: seqs.reduce((s, x) => s + x.length, 0), trans: g.trans, marginal: g.marginal };
  }
  const bg = fitGrammar(all, { alpha });

  return {
    kind: 'eo-move-shapes',
    version: 1,
    alphabet: [...MOVE_ALPHABET],
    masked: [...MASKED],
    kept: [...KEPT],
    alpha,
    // The negative set — the corpus's register as a whole. A draft's honest contrast is
    // s_intent − s_background, not intent-against-its-own-siblings.
    background: { n: all.length, moves: all.reduce((s, x) => s + x.length, 0), trans: bg.trans, marginal: bg.marginal },
    intents,
    provenance: {
      source,
      records: records.length,
      responsesRead: read,
      intents: Object.keys(intents).length,
      tool: 'tools/shape-fit.mjs',
    },
  };
};

// ── CLI ────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const CORPUS = new URL('../data/exemplars.jsonl', import.meta.url);
  const OUT = new URL('../data/shapes.json', import.meta.url);
  const records = parseExemplars(readFileSync(CORPUS, 'utf8'));
  const shapes = fitShapes(records, { source: 'data/exemplars.jsonl' });
  writeFileSync(OUT, JSON.stringify(shapes, null, 2) + '\n');
  const top = (g) => Object.entries(g.marginal).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([op, p]) => `${op} ${Math.round(p * 100)}%`).join(' · ');
  console.log(`shape-fit: ${shapes.provenance.responsesRead}/${records.length} responses → ${shapes.provenance.intents} intents`);
  console.log(`  background (${shapes.background.n} seqs): ${top(shapes.background)}`);
  for (const [intent, g] of Object.entries(shapes.intents))
    console.log(`  ${intent.padEnd(30)} n=${String(g.n).padStart(3)}  ${top(g)}`);
  console.log(`→ ${fileURLToPath(OUT)}`);
}
