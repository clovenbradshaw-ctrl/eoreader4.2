import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { projectGraph } from '../src/core/project.js';
import { createEntityAdmission } from '../src/perceiver/parse/entities.js';
import { createCorefField } from '../src/perceiver/parse/coref.js';
import {
  REFERENT_TYPES, couplingByNode, deriveGates, salienceOf,
  classifyReferent, classifyReferents, typeReferents, provisionalId,
  promotionEvent, promoteBoundDescriptors,
} from '../src/perceiver/individuation.js';

// THE INDIVIDUATION GATE — type every referent by how far it climbed the helix (SIG → INS →
// CON), and admit the un-INS'd ones (the creature, Kurtz) onto the cast. The type is the
// diagnosis, not a detector; the thresholds are Born nulls, never constants.

// ── Assembly 1 — node coupling (couplingByNode) ─────────────────────────────

test('couplingByNode: on a two-node toy, rho equals the single edge weight', () => {
  const graph = { edges: [{ from: 'a', to: 'b', weight: 3 }], representative: (x) => x };
  const c = couplingByNode(graph);
  assert.equal(c.get('a').rho, 3, 'a couples through the one edge');
  assert.equal(c.get('b').rho, 3, 'b couples through the one edge');
  assert.equal(c.get('a').rhoOut, 3, 'a couples OUT');
  assert.equal(c.get('a').rhoIn, 0);
  assert.equal(c.get('b').rhoIn, 3, 'b is coupled INTO');
});

test("couplingByNode: on a star, the hub's rho dominates the leaves'", () => {
  const graph = {
    representative: (x) => x,
    edges: [
      { from: 'hub', to: 'l1', weight: 2 },
      { from: 'hub', to: 'l2', weight: 2 },
      { from: 'hub', to: 'l3', weight: 2 },
    ],
  };
  const c = couplingByNode(graph);
  assert.equal(c.get('hub').rho, 6, 'the hub aggregates every incident edge');
  assert.equal(c.get('l1').rho, 2);
  assert.ok(c.get('hub').rho > c.get('l1').rho, 'the hub outranks its leaves on coupling');
});

test('couplingByNode: self-loops are dropped, non-finite/zero weights ignored', () => {
  const graph = {
    representative: (x) => x,
    edges: [
      { from: 'a', to: 'a', weight: 9 },   // self-loop — not incident coupling
      { from: 'a', to: 'b', weight: 0 },   // zero — no coupling
      { from: 'a', to: 'c', weight: NaN }, // non-finite — ignored
      { from: 'a', to: 'd', weight: 5 },
    ],
  };
  const c = couplingByNode(graph);
  assert.equal(c.get('a').rho, 5, 'only the one real edge counts');
  assert.equal(c.has('b'), false);
  assert.equal(c.has('c'), false);
});

test('couplingByNode: coref-collapses through representative', () => {
  const graph = {
    representative: (x) => (x === 'alias' ? 'canon' : x),
    edges: [{ from: 'alias', to: 'other', weight: 4 }],
  };
  const c = couplingByNode(graph);
  assert.ok(c.has('canon'), 'the alias folds onto its canonical root');
  assert.equal(c.get('canon').rho, 4);
  assert.equal(c.has('alias'), false);
});

// ── Assembly 4 read-off — one fixture per §2 corner, checkable by eye ────────
// classifyReferent takes explicit gates so each verdict is legible: mnull = ρnull = 5,
// the agency line = 0.5.

const GATES = { mnull: 5, rnull: 5, agencyLine: 0.5 };

test('emanon — the creature: recurs + acts, never named, not yet a hub', () => {
  // Frankenstein's "the creature": ¬INS, heavy mass, low coupling, high agency.
  const r = classifyReferent(
    { id: '~desc:creature', label: 'the creature', ins: false, mass: 10, rho: 1, subjShare: 0.9 },
    GATES);
  assert.equal(r.type, REFERENT_TYPES.EMANON);
  assert.equal(r.onCast, true, 'the motivating case reaches the cast');
  assert.equal(r.promotable, false, 'not orbited yet, so not flagged ripe');
});

test('protogon — Kurtz before he arrives: orbited, barely present, no name', () => {
  const r = classifyReferent(
    { id: '~desc:kurtz', label: 'Kurtz', ins: false, mass: 1, rho: 10, subjShare: 0.5 },
    GATES);
  assert.equal(r.type, REFERENT_TYPES.PROTOGON);
  assert.equal(r.onCast, true, 'the mass-only gate misses it; the two-axis gate does not');
});

test('emanon (promotable) — present AND orbited but still unnamed: ripe for INS', () => {
  const r = classifyReferent(
    { id: '~desc:thing', label: 'the thing', ins: false, mass: 10, rho: 10, subjShare: 0.8 },
    GATES);
  assert.equal(r.type, REFERENT_TYPES.EMANON);
  assert.equal(r.promotable, true, 'present and orbited but unnamed → flag promotable');
});

test('field — the city: present but oblique, a setting typed OFF the cast', () => {
  const r = classifyReferent(
    { id: '~desc:city', label: 'the city', ins: false, mass: 10, rho: 1, subjShare: 0.1 },
    GATES);
  assert.equal(r.type, REFERENT_TYPES.FIELD);
  assert.equal(r.onCast, false, 'a setting is an accountable loss, not a cast member');
});

test('holon — a named lead: INS and orbited, whole-and-part', () => {
  const r = classifyReferent(
    { id: 'marlow', label: 'Marlow', ins: true, mass: 20, rho: 12, subjShare: 0.7 },
    GATES);
  assert.equal(r.type, REFERENT_TYPES.HOLON);
  assert.equal(r.onCast, true);
});

test('void — a passing common noun clears no null: typed discard, replayable', () => {
  const r = classifyReferent(
    { id: '~desc:moment', label: 'the moment', ins: false, mass: 1, rho: 1, subjShare: 0.2 },
    GATES);
  assert.equal(r.type, REFERENT_TYPES.VOID);
  assert.equal(r.onCast, false);
});

test('precision bonus — a named-but-oblique, uncoupled proper noun (a dateline placename) is demoted, not a holon', () => {
  // INS ∧ ρ < ρnull ∧ subjShare low → the current mass-only cast promotes it; requiring
  // coupling for holon-hood refuses it.
  const r = classifyReferent(
    { id: 'london', label: 'London', ins: true, mass: 12, rho: 1, subjShare: 0.05 },
    GATES);
  assert.equal(r.type, REFERENT_TYPES.FIELD);
  assert.equal(r.onCast, false, 'a dateline placename is a setting, not a cast member');
});

// ── Born gates + ranking ────────────────────────────────────────────────────

test('deriveGates: derives finite mnull/rnull/agencyLine from a population (falls back to median on a thin one)', () => {
  const cands = [
    { mass: 1, rho: 1, subjShare: 0.2 },
    { mass: 2, rho: 2, subjShare: 0.4 },
    { mass: 3, rho: 3, subjShare: 0.6 },
    { mass: 40, rho: 40, subjShare: 0.9 },
  ];
  const g = deriveGates(cands);
  assert.ok(Number.isFinite(g.mnull) && g.mnull > 0, 'a mass null is derived');
  assert.ok(Number.isFinite(g.rnull) && g.rnull > 0, 'a coupling null is derived');
  assert.ok(Number.isFinite(g.agencyLine), 'a bounded agency line is derived');
});

test('classifyReferents: ranks by two-axis salience, not mass alone — a low-mass hub outranks a high-mass isolate', () => {
  const hub     = { id: 'hub', label: 'hub', ins: false, mass: 2, rho: 50, subjShare: 0.5 };
  const isolate = { id: 'iso', label: 'iso', ins: true,  mass: 30, rho: 0,  subjShare: 0.1 };
  const ranked = classifyReferents([isolate, hub]);
  assert.equal(ranked[0].id, 'hub', 'coupling lifts the protogon above the mass-heavy isolate');
  assert.ok(salienceOf(2, 50) > salienceOf(30, 0));
});

// ── Assembly 2 — the signals admission already holds ─────────────────────────

test('admission.signals: returns mass, gravity, and the subject/oblique agency split — read-only', () => {
  const text = 'Alice walked to London. Alice spoke. They went to London again.';
  const a = createEntityAdmission({ text, conventions: null });
  text.split(/(?<=[.!?])\s+/).forEach((s, i) => a.observe(s, i));
  const before = a.counts.size;
  const sig = a.signals('Alice');
  assert.ok(sig.mass >= 1, 'Alice has sighting mass');
  assert.ok(sig.subjShare >= 0, 'a subject share is reported');
  assert.equal(sig.subjShare + sig.oblShare <= 1.0000001, true, 'the shares are a fraction');
  assert.equal(a.counts.size, before, 'signals mutates nothing (admission stays append-only)');
  // Accepts an admitted id too.
  const id = a.idOf('Alice');
  if (id) assert.equal(a.signals(id).mass, sig.mass, 'lookup by id agrees with lookup by label');
});

// ── Assembly 3 — the descriptor channel, read-only ──────────────────────────

test('coref.descriptorReferents: exposes the standing-description channel with its decaying mass', () => {
  const coref = createCorefField();
  coref.noteDescriptor('sister', 0, null);
  coref.noteDescriptor('sister', 3, 'gregor-samsa', { named: true });
  const refs = coref.descriptorReferents();
  const sister = refs.find((r) => r.roleKey === 'sister');
  assert.ok(sister, 'the sister descriptor is exposed');
  assert.ok(sister.mass > 0, 'its accumulated standing mass is live');
  assert.equal(sister.bound, null, 'still unnamed — no name has claimed the door');
  assert.equal(sister.ownerNamed, true, 'the named owner is recorded');
});

// ── Assembly 4 integration — typeReferents on a deterministic doc ────────────

// Build a minimal doc: a projection log + stub admission/coref, so the type read-off is
// checkable without depending on the full parser's emergent behaviour on prose.
const buildDoc = ({ ins = [], edges = [], sigs = {}, descriptors = [] }) => {
  const log = createLog({ docId: 'toy' });
  for (const { id, label, n } of ins)
    for (let k = 0; k < n; k++) log.append({ op: 'INS', id, label, sentIdx: k });
  for (const e of edges)
    log.append({ op: 'CON', src: e.from, tgt: e.to, via: e.via || 'rel', sentIdx: 0, w: e.w ?? 1 });
  const labels = new Map(ins.map((e) => [e.id, e.label]));
  const admission = {
    labelOf: (id) => labels.get(id) || null,
    signals: (labelOrId) => sigs[labelOrId] || { mass: 0, gravity: 0, subjShare: 0, oblShare: 0 },
  };
  const corefField = { descriptorReferents: () => descriptors };
  return { log, admission, corefField };
};

test('typeReferents: a named hub is a holon, on the cast', () => {
  const doc = buildDoc({
    ins: [
      { id: 'lead', label: 'Lead', n: 20 },
      { id: 'x', label: 'X', n: 5 }, { id: 'y', label: 'Y', n: 5 }, { id: 'z', label: 'Z', n: 5 },
    ],
    edges: [
      { from: 'lead', to: 'x' }, { from: 'lead', to: 'y' }, { from: 'lead', to: 'z' },
    ],
    sigs: { Lead: { subjShare: 0.8 }, X: { subjShare: 0.5 }, Y: { subjShare: 0.5 }, Z: { subjShare: 0.5 } },
  });
  const typed = typeReferents(doc);
  const lead = typed.find((t) => t.id === 'lead');
  assert.ok(lead, 'the lead is typed');
  assert.equal(lead.type, REFERENT_TYPES.HOLON);
  assert.equal(lead.onCast, true);
  assert.equal(typed[0].id, 'lead', 'the hub ranks first by two-axis salience');
});

test('typeReferents: an unbound descriptor referent enters as a provisional, un-INS\'d candidate', () => {
  const doc = buildDoc({
    ins: [{ id: 'a', label: 'A', n: 8 }, { id: 'b', label: 'B', n: 8 }],
    edges: [{ from: 'a', to: 'b' }],
    sigs: { A: { subjShare: 0.6 }, B: { subjShare: 0.6 } },
    descriptors: [{ roleKey: 'creature', mass: 12, ownerId: null, ownerNamed: false, bound: null, lastIdx: 40 }],
  });
  const typed = typeReferents(doc);
  const creature = typed.find((t) => t.id === provisionalId('creature'));
  assert.ok(creature, 'the descriptor referent reached the cast though never named');
  assert.equal(creature.ins, false, 'it carries no INS');
  assert.equal(creature.provisional, true);
  // No INS event was ever logged for the provisional node.
  assert.equal(doc.log.snapshot().some((e) => e.op === 'INS' && e.id === provisionalId('creature')), false,
    'no INS is logged for a provisional node — the whole point');
});

test('typeReferents: a descriptor already bound to a name is folded, not re-listed as provisional', () => {
  const doc = buildDoc({
    ins: [{ id: 'grete', label: 'Grete', n: 6 }, { id: 'gregor', label: 'Gregor', n: 10 }],
    edges: [{ from: 'gregor', to: 'grete', via: 'sister' }],
    sigs: { Grete: { subjShare: 0.6 }, Gregor: { subjShare: 0.7 } },
    descriptors: [{ roleKey: 'sister', mass: 8, ownerId: 'gregor', ownerNamed: true, bound: 'grete', lastIdx: 189 }],
  });
  const typed = typeReferents(doc);
  assert.equal(typed.some((t) => t.id === provisionalId('sister')), false,
    'a bound descriptor is not a provisional cast member');
});

// ── Assembly 5 — the promotion ledger ───────────────────────────────────────

test('promotionEvent: a name binding is a single REC (held:true), folding the provisional id onto the name', () => {
  const ev = promotionEvent('sister', 'grete', { sentIdx: 189 });
  assert.equal(ev.op, 'REC');
  assert.equal(ev.kind, 'name');
  assert.equal(ev.held, true, 'a naming that HELD (the inverse of migrate.js\'s held:false escape)');
  assert.equal(ev.from, provisionalId('sister'));
  assert.equal(ev.to, 'grete');
});

test('promoteBoundDescriptors: emits exactly one REC held:true per bound descriptor, appendable, and the projection ignores it (parity)', () => {
  const log = createLog({ docId: 'meta' });
  log.append({ op: 'INS', id: 'grete', label: 'Grete', sentIdx: 189 });
  const doc = {
    log,
    corefField: {
      descriptorReferents: () => [
        { roleKey: 'sister', mass: 8, ownerId: 'gregor', ownerNamed: true, bound: 'grete', lastIdx: 189 },
        { roleKey: 'creature', mass: 5, ownerId: null, ownerNamed: false, bound: null, lastIdx: 40 },
      ],
    },
  };
  const before = projectGraph(log);
  const beforeEntities = new Set(before.entities.keys());

  const events = promoteBoundDescriptors(doc, { append: true });
  assert.equal(events.length, 1, 'exactly one promotion — only the bound descriptor');
  assert.equal(events[0].held, true);
  assert.equal(events[0].to, 'grete');

  // REC lives in the rules ledger, not the projection — the graph is byte-identical.
  const after = projectGraph(log);
  assert.deepEqual(new Set(after.entities.keys()), beforeEntities,
    'the promotion REC adds no node to the projection (REC is ignored by projectGraph)');
  // The auditable trace is on the log.
  assert.equal(log.snapshot().filter((e) => e.op === 'REC' && e.held === true).length, 1);
});
