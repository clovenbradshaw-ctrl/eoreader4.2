import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { ingestMusic } from '../src/organs/in/music.js';
import { surfFold } from '../src/surfer/index.js';
import {
  atmosphereFromActivations, atmosphereOf, projectUnit, projectUnits, centroidBasis, corpusSigma,
  structuralActivations,
} from '../src/surfer/index.js';
import { noveltyFromLensEntropy, forwardDist, NOVELTY_RESERVE } from '../src/core/index.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';

// The Significance column (significance-column spec). The surfer ran one terrain of the
// Significance row (the Lens, at the Figure grain). These tests prove the other two
// terrains now ride the SAME density operator ρ, gated by deriveNull, off by default,
// and — crucially — that the column is PURE ON VECTORS, so it runs unchanged on text and
// music alike (omnimodal for free), and improves prediction/generation through the
// reading-spread it measures.

const STORY = 'Grete Vale entered. Grete sat. Grete read. Gregor Pike arrived. ' +
              'Gregor coughed. Gregor waited. Otto Stein knocked. Otto left. ' +
              'Otto returned. Mara Cole spoke. Mara left.';

// A synthetic significance prior: six orthonormal centroids over a 6-dim space, keyed
// with real cube cells (three Atmosphere-terrain cells for the Ground-grain tone, three
// Lens-terrain cells). Orthonormal so the projection is exactly controllable.
const e = (i, dim = 6) => { const v = new Array(dim).fill(0); v[i] = 1; return v; };
const PRIOR = {
  vectors: {
    DEF_Clearing_Atmosphere:    e(0),
    EVA_Tending_Atmosphere:     e(1),
    REC_Cultivating_Atmosphere: e(2),
    EVA_Binding_Lens:           e(3),
    DEF_Dissecting_Lens:        e(4),
    REC_Making_Lens:            e(5),
  },
};

// A stub MEANING embedder — deterministic 6-dim vectors. measuresMeaning:true lights up
// the column the way a real MiniLM organ would; the hash embedder (measuresMeaning:false)
// keeps it dark, the firewall the geometric classifier already runs.
const stubMeaning = (dim = 6) => ({
  id: 'stub-meaning', measuresMeaning: true,
  embed: async (text) => {
    const v = new Array(dim).fill(0);
    const s = String(text);
    for (let i = 0; i < s.length; i++) v[i % dim] += ((s.charCodeAt(i) % 7) - 3);
    const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map(x => x / n);
  },
});

// ── parity: activations present but no sig opt ⇒ byte-identical to the bare surf ──
test('surfFold is byte-identical when no significance opt is set (parity gate)', () => {
  const doc = parseText(STORY, { docId: 's' });
  const acts = doc.sentences.map(() => e(1));   // activations present but unused
  const bare = surfFold(doc, 1);
  const withActs = surfFold(doc, 1, { activations: acts });   // no atmosphere/lensReport/lens/paradigm
  assert.equal(JSON.stringify(bare), JSON.stringify(withActs));
  assert.ok(!('atmosphere' in withActs) && !('lenses' in withActs), 'no column fields leak onto the default');
});

// ── Track B: the Atmosphere tone is read off ρ's Ground-grain (Atmosphere) cells ──
test('atmosphere reads a Ground-grain tone off ρ, never a figure', () => {
  const basis = centroidBasis(PRIOR);
  const idx = basis.keys.indexOf('EVA_Tending_Atmosphere');
  // every unit reads as EVA_Tending_Atmosphere → ρ mass concentrates there → tone EVA
  const onEva = Array.from({ length: 8 }, () => {
    const a = new Array(basis.keys.length).fill(0); a[idx] = 1; return a;
  });
  const atm = atmosphereFromActivations(onEva, basis, { alpha: 0.05 });
  assert.ok(atm.tone, 'a tone was read');
  assert.equal(atm.tone.terrain, 'Atmosphere', 'the tone lands at the Ground-grain terrain');
  assert.equal(atm.tone.op, 'EVA');
  assert.match(atm.tone.label, /evaluative/);
  assert.ok(Number.isFinite(atm.departure) && atm.departure >= 0, 'a finite KL departure');
  assert.ok(['anomalous', 'corpus-weather', 'unmeasured'].includes(atm.verdict));
});

// ── Track C: the Lens spread (eigen-lenses + von Neumann entropy = NPOV scalar) ──
test('two balanced readings give two real lenses and entropy ≈ ln 2', () => {
  const basis = centroidBasis(PRIOR);
  const evaLens = basis.keys.indexOf('EVA_Binding_Lens');
  const defLens = basis.keys.indexOf('DEF_Dissecting_Lens');
  // alternate between two orthogonal readings → ρ has two equal eigenvalues (0.5, 0.5)
  const acts = [];
  for (let i = 0; i < 10; i++) {
    const a = new Array(basis.keys.length).fill(0);
    a[i % 2 === 0 ? evaLens : defLens] = 1;
    acts.push(a);
  }
  // a real doc (the surf still reads its bayes field off the log); ρ is built over the
  // supplied activations, which are what carry the two balanced readings.
  const doc = parseText(STORY, { docId: 's' });
  const surf = surfFold(doc, 0, { activations: acts, prior: basis, lensReport: true });
  assert.ok(Array.isArray(surf.lenses) && surf.lenses.length >= 2, 'eigen-lenses emitted');
  const top2 = surf.lenses.slice(0, 2).reduce((s, l) => s + l.weight, 0);
  assert.ok(Math.abs(top2 - 1) < 1e-3, `top two Born weights span the state (${top2})`);
  assert.ok(Math.abs(surf.lensEntropy - Math.log(2)) < 1e-3, `lensEntropy ≈ ln2 (${surf.lensEntropy})`);
  assert.ok(surf.lenses.some(l => l.real), 'at least one lens beats the spectral null');
});

// ── Track C #3: lens-conditioning rides forward inside one reading ──
test('a lens orthogonal to every reading collapses the conditioned reach to the forced stops', () => {
  const basis = centroidBasis(PRIOR);
  const evaLens = basis.keys.indexOf('EVA_Binding_Lens');
  const doc = parseText(STORY, { docId: 's' });
  // every unit reads as EVA_Binding_Lens; condition on an ORTHOGONAL lens (zero overlap)
  const acts = doc.sentences.map(() => { const a = new Array(basis.keys.length).fill(0); a[evaLens] = 1; return a; });
  const orthoLens = new Array(basis.keys.length).fill(0);
  orthoLens[basis.keys.indexOf('REC_Making_Lens')] = 1;   // orthogonal to EVA_Binding_Lens
  const surf = surfFold(doc, 1, { activations: acts, prior: basis, lens: orthoLens });
  // every conditioned score is 0 → no peak arrests → only the forced stops survive
  const forced = [...new Set([surf.anchor, ...surf.recCursors])].sort((a, b) => a - b);
  assert.deepEqual(surf.stops, forced, 'an orthogonal lens admits only the anchor and the RECs');
  // deterministic, like every surf
  assert.equal(JSON.stringify(surf), JSON.stringify(surfFold(doc, 1, { activations: acts, prior: basis, lens: orthoLens })));
});

// ── OMNIMODAL: the same column runs on a melody, unchanged (pure on vectors) ──
test('the column runs on a music doc through the universal embeddings contract', async () => {
  const melody = ingestMusic({ name: 'm', notes: ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4', 'E4', 'G4', 'C5'] });
  const atm = await atmosphereOf(melody, { embedder: stubMeaning(6), prior: PRIOR, alpha: 0.05 });
  assert.ok(Number.isFinite(atm.departure), 'a melody has an interpretive atmosphere too');
  assert.equal(atm.rode, 'atmosphere-kl');
  // and it is inert under a non-meaning embedder (the firewall)
  const dark = await atmosphereOf(melody, { embedder: createHashEmbedder(), prior: PRIOR });
  assert.equal(dark.verdict, 'unmeasured', 'a spelling-space embedder measures no tone');
});

// ── PREDICTION: the reading-spread calibrates the generative novelty reserve ──
test('noveltyFromLensEntropy makes the reserve track the spread of readings (omnimodal)', () => {
  // a committed frame (entropy 0) reserves little → predict sharply
  const sharp = noveltyFromLensEntropy(0, 6);
  // a balanced mixture (max entropy = ln dim) reserves the full base → predict broadly
  const broad = noveltyFromLensEntropy(Math.log(6), 6);
  assert.ok(sharp < broad, 'higher reading-spread reserves more novelty mass');
  assert.ok(Math.abs(broad - NOVELTY_RESERVE) < 1e-9, 'max mixing → the full base reserve');
  assert.ok(sharp > 0, 'never zero — forwardDist stays proper on an empty profile');
  // no entropy supplied → the constant (byte-identical) reserve
  assert.equal(noveltyFromLensEntropy(undefined, 6), NOVELTY_RESERVE);
  // it flows into the forward distribution the generator draws from
  const profile = new Map([['a', 3], ['b', 1]]);
  const fSharp = forwardDist(profile, { novelty: sharp });
  const fBroad = forwardDist(profile, { novelty: broad });
  assert.ok(fBroad.reserve > fSharp.reserve, 'a broader reading-spread holds more probability for the unseen');
});

// ── INTEGRATION: the embedder-free column rides every turn; atmosphere is the meaning add-on ──
// (surfing-next.md §2) The column used to be dark without a meaning embedder. Now the DEFAULT
// basis is the operator profiles, so the lens spread and the commit stance ride on EVERY turn,
// hash organ or not. The meaning embedder + centroid prior ADD the atmosphere terrain (the KL
// departure from a corpus prior, which the structural ground does not carry).
test('the structural column rides on the hash path; the meaning embedder adds atmosphere', async () => {
  const attach = (d) => { d.sentenceEmbeddings = async (emb) => Promise.all(d.sentences.map(s => emb.embed(s))); return d; };
  const doc = attach(parseText(STORY, { docId: 's' }));
  const model = createModel('echo'); await model.load();

  // hash path: no meaning embedder, no centroids → the EMBEDDER-FREE column still rides.
  const auditDark = createAuditLog();
  await runTurn({ question: 'what happens to Otto?', doc, model, embedder: createHashEmbedder(), auditLog: auditDark });
  const foldDark = auditDark.turns[0].steps.find(s => s.name === 'fold');
  assert.ok(foldDark?.data?.surf, 'the surf rides');
  assert.equal(typeof foldDark.data.surf.lensEntropy, 'number', 'the lens spread rides embedder-free');
  assert.ok(foldDark.data.surf.stance && typeof foldDark.data.surf.stance.guard === 'boolean',
    'the commit stance is measured embedder-free');
  assert.equal(foldDark.data.surf.atmosphere, undefined, 'but atmosphere needs the meaning prior — absent here');

  // lit path: a meaning embedder + the centroid prior → atmosphere joins the column.
  const doc2 = attach(parseText(STORY, { docId: 's' }));
  const auditLit = createAuditLog();
  await runTurn({
    question: 'what happens to Otto?', doc: doc2, model,
    embedder: createHashEmbedder(), geometricEmbedder: stubMeaning(6), centroids: PRIOR,
    auditLog: auditLit,
  });
  const foldLit = auditLit.turns[0].steps.find(s => s.name === 'fold');
  assert.ok(foldLit?.data?.surf, 'the surf rides');
  assert.ok(typeof foldLit.data.surf.lensEntropy === 'number', 'the lens spread rode the turn');
  assert.ok(foldLit.data.surf.atmosphere && typeof foldLit.data.surf.atmosphere.verdict === 'string',
    'the interpretive atmosphere rode the turn');
});

// ── Track D: the Paradigm pass EMITS an append-only REC when the basis is defeated ──
test('a basis incommensurable with the corpus prior emits REC(Paradigm,…); a commuting one does not', () => {
  // 4 orthonormal centroids → σ = (1/4)I, its top-m eigenbasis is the standard axes.
  const E = (i) => { const v = [0, 0, 0, 0]; v[i] = 1; return v; };
  const PRIOR4 = { vectors: {
    EVA_Binding_Lens: E(0), DEF_Dissecting_Lens: E(1), REC_Making_Lens: E(2), CON_Binding_Link: E(3),
  } };
  const basis = centroidBasis(PRIOR4);
  const doc = parseText('a. b. c. d. e. f. g. h. i. j. k. l.', { docId: 's' });

  // MIS-FRAMED: the doc reads through directions that cross the prior's axes (e0±e2,
  // e1±e3) → its eigen-subspace does not commute with σ's. Both halves identical →
  // the within-doc baseline is ~0, so any real incommensurability clears it.
  const u = [1 / Math.sqrt(2), 0, 1 / Math.sqrt(2), 0];
  const w = [0, 1 / Math.sqrt(2), 0, 1 / Math.sqrt(2)];
  const crossing = doc.sentences.map((_, i) => (i % 2 === 0 ? u : w));
  const mis = surfFold(doc, 0, { activations: crossing, prior: basis, paradigm: true, paradigmRank: 2 });
  assert.equal(mis.paradigm.verdict, 'mis-framed');
  assert.ok(mis.paradigmRec, 'a defeated basis emits a Paradigm REC');
  assert.equal(mis.paradigmRec.op, 'REC');
  assert.equal(mis.paradigmRec.cell, 'REC_Composing_Paradigm');
  assert.ok(mis.paradigmRec.surpriseDelta >= 0 && mis.paradigmRec.reground === true,
    'the REC carries its surprise-delta and re-grounds (the helix turning)');

  // UNDER-READ: the doc reads along the prior's own axes → its subspace commutes with
  // σ → no incommensurability → stay at the Lens, no REC.
  const aligned = doc.sentences.map((_, i) => (i % 2 === 0 ? E(0) : E(1)));
  const under = surfFold(doc, 0, { activations: aligned, prior: basis, paradigm: true, paradigmRank: 2 });
  assert.equal(under.paradigm.verdict, 'under-read');
  assert.equal(under.paradigmRec, undefined, 'a commuting basis emits no REC — under-read, not mis-framed');
});

// projection + σ sanity
test('projectUnits maps any vector into the shared 27-cell basis; σ is the corpus prior', () => {
  const basis = centroidBasis(PRIOR);
  const acts = projectUnits([e(0), e(1)], basis);
  assert.equal(acts.length, 2);
  assert.equal(acts[0].length, basis.keys.length, 'one activation per cell');
  const sigma = corpusSigma(basis);
  assert.equal(sigma.dim, basis.keys.length, 'σ lives in the significance basis');
});

// The embedder-free default (surfing-next.md §2). The column first rode an embedding ρ —
// the distributional bet the engine exists to refute, and it pinned the column to a
// meaning model, so it was dark under the hash organ. Now the DEFAULT basis is the
// operator profiles (structure-basis.js): ρ from what the nine operators do, read off the
// log, no model. So lenses · lensEntropy · stance light up on EVERY turn — and, ridden
// WITHOUT lens-conditioning, leave the arrest (stops/peak) byte-identical to the plain surf.
test('the significance column lights up embedder-free, off the operator profiles', () => {
  const doc = parseText(STORY, { docId: 's.md' });
  const { activations, signs } = structuralActivations(doc);
  assert.ok(activations.some(v => v.some(x => x > 0)), 'the operator profiles carry mass (no embedder)');

  const sig = surfFold(doc, 1, { activations, signs, lensReport: true, stance: true });
  assert.ok(Array.isArray(sig.lenses) && sig.lenses.length > 0, 'lenses computed off operators alone');
  assert.ok(Number.isFinite(sig.lensEntropy), 'lensEntropy (the NPOV scalar) computed');
  assert.ok(sig.stance && typeof sig.stance.guard === 'boolean', 'the commit stance + guard is measured');

  // The parity gate: no lens passed → raw-bayes arrest → byte-identical to the plain surf.
  const plain = surfFold(doc, 1);
  assert.deepEqual(sig.stops, plain.stops, 'stops unchanged (the column does not move the arrest)');
  assert.equal(sig.peak, plain.peak, 'peak unchanged');
});
