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
//   records   role-tagged records ({ intent, response, role?, ... }); anything without a readable
//             response contributes no sequence. role defaults to 'target'.
//               target      → per-intent grammars (the shapes we ship).
//               background  → pooled into the negative grammar (the register to be unlike).
//               reference   → labelled assistant data; pooled into the background AND scored for
//                            coverage (which target intents it can/cannot support).
//             With no background/reference records the background falls back to the pooled TARGET,
//             so the default self-contained run is byte-identical to fitting the corpus alone.
//   opts      { alpha } — the grammar's add-α smoothing (matches the predictor's default 0.5).
export const fitShapes = (records, { alpha = 0.5, source = null } = {}) => {
  const roleOf = (r) => r.role || 'target';
  const byIntent = new Map();          // target only
  const targetSeqs = [];
  const bgSeqs = [];                    // background + reference, pooled
  const refByIntent = new Map();        // reference coverage: mapped intent → count
  let read = 0;

  for (const r of records) {
    const seq = abstractResponse(r.response);
    if (!seq.length) continue;
    read++;
    const role = roleOf(r);
    if (role === 'target') {
      targetSeqs.push(seq);
      if (!byIntent.has(r.intent)) byIntent.set(r.intent, []);
      byIntent.get(r.intent).push(seq);
    } else {
      bgSeqs.push(seq);
      if (role === 'reference' && r.intent && !String(r.intent).startsWith('dolly:') && r.intent !== '_bg')
        refByIntent.set(r.intent, (refByIntent.get(r.intent) || 0) + 1);
    }
  }

  const intents = {};
  for (const [intent, seqs] of [...byIntent.entries()].sort()) {
    const g = fitGrammar(seqs, { alpha });
    intents[intent] = { n: seqs.length, moves: seqs.reduce((s, x) => s + x.length, 0), trans: g.trans, marginal: g.marginal };
  }

  // The negative set — a separate assistant corpus when one was given, else the corpus's own
  // register (self-contained fallback). A draft's honest contrast is s_intent − s_background.
  const external = bgSeqs.length > 0;
  const bgSource = external ? bgSeqs : targetSeqs;
  const bg = fitGrammar(bgSource, { alpha });

  // Coverage — the contrast-set proof. For each target intent, how much reference (assistant)
  // support exists. The intents that come back 0 are the Cleo-distinctive half no assistant
  // corpus contains; only computed when a reference corpus was supplied.
  let coverage = null;
  if (refByIntent.size || external) {
    const covered = {}, contrastOnly = [];
    for (const intent of Object.keys(intents)) {
      const n = refByIntent.get(intent) || 0;
      covered[intent] = n;
      if (n === 0) contrastOnly.push(intent);
    }
    coverage = {
      referenceSources: [...new Set(records.filter((r) => roleOf(r) !== 'target').map((r) => r.source).filter(Boolean))],
      supported: Object.entries(covered).filter(([, n]) => n > 0).length,
      contrastOnly,                    // intents with zero assistant analog — the finding
      byIntent: covered,
    };
  }

  return {
    kind: 'eo-move-shapes',
    version: 1,
    alphabet: [...MOVE_ALPHABET],
    masked: [...MASKED],
    kept: [...KEPT],
    alpha,
    background: {
      n: bgSource.length,
      moves: bgSource.reduce((s, x) => s + x.length, 0),
      external,
      trans: bg.trans, marginal: bg.marginal,
    },
    intents,
    ...(coverage ? { coverage } : {}),
    provenance: {
      source,
      records: records.length,
      responsesRead: read,
      intents: Object.keys(intents).length,
      background: external ? 'external-corpus' : 'target-pooled',
      tool: 'tools/shape-fit.mjs',
    },
  };
};

// ── CLI ────────────────────────────────────────────────────────────────────────
// node tools/shape-fit.mjs                         — self-contained: Cleo target, pooled background.
// node tools/shape-fit.mjs --reference data/corpus/dolly.jsonl [--out data/shapes.enriched.json]
//     — target grammars from Cleo; background from the assistant corpus; coverage reported.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const refPath = arg('--reference');
  const OUT = new URL(`../${arg('--out') || 'data/shapes.json'}`, import.meta.url);
  const CORPUS = new URL('../data/exemplars.jsonl', import.meta.url);

  const records = parseExemplars(readFileSync(CORPUS, 'utf8'));
  if (refPath) {
    const { fromDolly } = await import('./corpus/adapters.mjs');
    const ref = fromDolly(readFileSync(new URL(`../${refPath}`, import.meta.url), 'utf8'), { role: 'reference' });
    records.push(...ref);
    console.log(`shape-fit: + ${ref.length} reference records from ${refPath}`);
  }
  const shapes = fitShapes(records, { source: refPath ? `data/exemplars.jsonl + ${refPath}` : 'data/exemplars.jsonl' });

  const top = (g) => Object.entries(g.marginal).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([op, p]) => `${op} ${Math.round(p * 100)}%`).join(' · ');
  console.log(`shape-fit: ${shapes.provenance.responsesRead} responses → ${shapes.provenance.intents} intents`);
  console.log(`  background (${shapes.background.n} seqs, ${shapes.background.external ? 'external' : 'pooled'}): ${top(shapes.background)}`);
  for (const [intent, g] of Object.entries(shapes.intents))
    console.log(`  ${intent.padEnd(30)} n=${String(g.n).padStart(3)}  ${top(g)}`);
  if (shapes.coverage) {
    console.log(`\ncoverage (contrast-set proof): ${shapes.coverage.supported}/${shapes.provenance.intents} intents have assistant support`);
    console.log(`  contrast-only (no assistant analog, Cleo's own): ${shapes.coverage.contrastOnly.join(', ')}`);
  }
  writeFileSync(OUT, JSON.stringify(shapes, null, 2) + '\n');
  console.log(`→ ${fileURLToPath(OUT)}`);
}
