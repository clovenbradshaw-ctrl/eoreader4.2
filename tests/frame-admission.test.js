import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INADMISSIBLE, defeaterAudit, riskedBitsPerSite, retroAudit, absenceAudit, poisonAudit,
  chanceFloor, frameCompetence, admitFrame, frameDefEntry, defeatedBy, defeatEntriesOn,
  inquiryExhausted,
} from '../src/core/frame-admission.js';
import { statusOf, UNSETTLED, SETTLED } from '../src/core/supersede.js';

// Frame admission: a frame is admissible only if EVA can get purchase on it — it must
// ship live defeaters, forbid real observation mass, derive from present spans, keep
// trust exogenous, and refund surprise only by explanation. The keystone passes; the
// conspiracy fails at the door, one typed failure per channel it corrupted.

// ── the shared world: an investigation mid-flight ─────────────────────────────
const SPAN_INVOICE = 'sha256:aa11@1#invoice.p2[10:80]';
const SPAN_REGISTRY = 'sha256:bb22#registry.row-14';

const OMEGA = [
  { atom: 'registry:link-found', weight: 1 },
  { atom: 'registry:no-link', weight: 3 },
  { atom: 'invoice:recovered', weight: 1 },
  { atom: 'invoice:absent', weight: 1 },
  { atom: 'witness:confirms', weight: 1 },
  { atom: 'witness:recants', weight: 2 },
];

const world = (over = {}) => ({
  observations: OMEGA,
  occurred: ['invoice:recovered', 'witness:confirms'],
  present: [SPAN_INVOICE, SPAN_REGISTRY],
  pinned: ['site:payment-1'],
  contradictions: ['site:amounts-clash'],
  voices: [
    { voice: 'ledger-clerk', agrees: true },
    { voice: 'auditor', agrees: false },
    { voice: 'registrar', agrees: false },
  ],
  ...over,
});

// The KEYSTONE: the shell-entity frame. It names what would break it (and its own
// reading agrees those arrivals break it), it re-reads the residual through present
// spans, it derives its holon from the registry row it actually holds.
const keystone = (over = {}) => ({
  id: 'frame:shell-entity',
  read: (atom) =>
    atom === 'registry:no-link' || atom === 'witness:recants' ? 'defeats'
    : atom === 'registry:link-found' || atom === 'invoice:recovered' ? 'confirms'
    : 'inert',
  defeaters: ['registry:no-link', 'witness:recants'],
  explains: [
    { site: 'site:payment-1', bitsBefore: 6, bitsAfter: 1, via: SPAN_INVOICE },
    { site: 'site:amounts-clash', bitsBefore: 4, bitsAfter: 2, via: SPAN_REGISTRY },
  ],
  derives: [{ holon: 'holon:shell-co', supports: [{ span: SPAN_REGISTRY }] }],
  demotes: [],
  ...over,
});

// The CRANK: the hidden-coordinator frame. Reads every observation as serving O
// (reach 1, risk 0), names a defeater it converts to confirmation, dissolves the
// logged contradiction by narration, derives the cover-up from a void, and demotes
// exactly the voices that disagree — on no ground but the disagreement.
const crank = () => ({
  id: 'frame:hidden-coordinator',
  read: () => 'confirms',
  defeaters: ['registry:no-link'],
  explains: [
    { site: 'site:amounts-clash', bitsBefore: 4, bitsAfter: 0, via: null },
    { site: 'site:loose-end', bitsBefore: 3, bitsAfter: 0, via: null },
  ],
  derives: [{ holon: 'holon:cover-up', supports: [{ nul: 'never-set' }] }],
  demotes: [
    { voice: 'auditor', grounds: [] },
    { voice: 'registrar', grounds: ['holon:cover-up'] },
  ],
});

// ── the door ──────────────────────────────────────────────────────────────────

test('the keystone is admitted — live defeaters, real risk, earned refund', () => {
  const v = admitFrame(keystone(), world());
  assert.equal(v.admitted, true, `failures: ${v.failures.join(', ')}`);
  assert.deepEqual(v.defeaters.live, ['registry:no-link', 'witness:recants']);
  assert.ok(v.defeaters.forbiddenMass > 0.5, 'it forbade most of the prior mass');
  assert.ok(v.competence.retro.earned > 0, 'the retro refund survived the audits');
  assert.ok(v.competence.keepAmplitude > 0, 'a keeper, above the (empty) chance floor');
});

test('the crank fails admission with one typed failure per corrupted channel', () => {
  const v = admitFrame(crank(), world());
  assert.equal(v.admitted, false);
  assert.ok(v.failures.includes(INADMISSIBLE.SELF_SEALING), 'named defeater read as confirmation');
  assert.ok(v.failures.includes(INADMISSIBLE.INERT), 'forbids nothing — EVA has no purchase');
  assert.ok(v.failures.includes(INADMISSIBLE.ABSENCE_MINING), 'the cover-up stands on a void');
  assert.ok(v.failures.includes(INADMISSIBLE.SOURCE_POISONING), 'trust computed from frame-fit');
  assert.ok(v.failures.includes(INADMISSIBLE.SUPPRESSION), 'a logged contradiction dissolved by narration');
  assert.equal(v.competence.retro.earned, 0, 'no refund is earned by suppression or narration');
  assert.equal(v.competence.keepAmplitude, 0);
});

test('a frame with no named defeaters fails EMPTY even if its reading would forbid', () => {
  const v = admitFrame(keystone({ defeaters: [] }), world());
  assert.equal(v.admitted, false);
  assert.ok(v.failures.includes(INADMISSIBLE.EMPTY_DEFEATERS),
    '"name what would prove you wrong" is the test — an unnamed defeater set is not shipped');
});

test('a live defeater already on the tape fails ALREADY_DEFEATED — you went and looked; it is there', () => {
  const v = admitFrame(keystone(), world({ occurred: ['registry:no-link'] }));
  assert.equal(v.admitted, false);
  assert.deepEqual(v.defeaters.occurredHits, ['registry:no-link']);
  assert.ok(v.failures.includes(INADMISSIBLE.ALREADY_DEFEATED));
});

// ── the cap: surprise removed ≤ surprise risked ───────────────────────────────

test('riskedBitsPerSite is the renormalization gain — 0 at no risk, 1 bit at F=1/2', () => {
  assert.equal(riskedBitsPerSite(0), 0);
  assert.ok(Math.abs(riskedBitsPerSite(0.5) - 1) < 1e-12);
  assert.ok(Number.isFinite(riskedBitsPerSite(1)), 'F is clamped shy of 1');
});

test('a claimed refund is capped by the risk term, per site', () => {
  const w = world({
    observations: [{ atom: 'x:forbidden', weight: 1 }, { atom: 'x:allowed', weight: 1 }],
  });
  const f = keystone({
    read: (a) => (a === 'x:forbidden' ? 'defeats' : 'confirms'),
    defeaters: ['x:forbidden'],
    explains: [{ site: 'site:big-story', bitsBefore: 10, bitsAfter: 0, via: SPAN_INVOICE }],
    derives: [],
  });
  const v = admitFrame(f, w);
  assert.equal(v.admitted, true);
  assert.ok(Math.abs(v.competence.capPerSite - 1) < 1e-12, 'F=1/2 → 1 bit per site');
  assert.ok(Math.abs(v.competence.retro.earned - 1) < 1e-12,
    'ten narrated bits, one risked bit: one bit earned');
  assert.equal(v.competence.retro.claimed, 10);
});

test('a frame that forbids nothing refunds nothing, however neatly it narrates', () => {
  const f = keystone({
    read: () => 'confirms',
    explains: [{ site: 'site:loose-end', bitsBefore: 8, bitsAfter: 0, via: SPAN_INVOICE }],
  });
  const v = admitFrame(f, world());
  assert.ok(v.failures.includes(INADMISSIBLE.SELF_SEALING) || v.failures.includes(INADMISSIBLE.INERT));
  assert.equal(v.competence.retro.earned, 0, 'cap at zero risk is zero');
});

// ── the guardrail: explanation, never suppression ─────────────────────────────

test('a refund on an ordinary site without a span is unearned but not fatal', () => {
  const f = keystone({
    explains: [
      { site: 'site:payment-1', bitsBefore: 6, bitsAfter: 1, via: SPAN_INVOICE },
      { site: 'site:loose-end', bitsBefore: 3, bitsAfter: 0, via: null },
    ],
  });
  const v = admitFrame(f, world());
  assert.equal(v.admitted, true, 'narration is worthless, not criminal');
  const unearned = v.competence.retro.entries.find((e) => e.site === 'site:loose-end');
  assert.equal(unearned.status, 'unearned');
  assert.equal(unearned.earned, 0);
});

test('a refund on a pinned or contradiction site without a span is SUPPRESSION and fatal', () => {
  const f = keystone({
    explains: [{ site: 'site:payment-1', bitsBefore: 6, bitsAfter: 0, via: 'span:that-does-not-resolve' }],
  });
  const v = admitFrame(f, world());
  assert.equal(v.admitted, false);
  assert.ok(v.failures.includes(INADMISSIBLE.SUPPRESSION),
    'the only way to refund a frozen site without evidence is to dissolve it');
  assert.deepEqual(v.competence.retro.suppressed, ['site:payment-1']);
});

// ── absence: NUL may not be laundered into SIG ────────────────────────────────

test('a holon derived only from voids is absence-mining; one present span redeems it', () => {
  const mined = absenceAudit(crank(), world());
  assert.deepEqual(mined.mined, ['holon:cover-up']);
  const redeemed = absenceAudit(
    { derives: [{ holon: 'holon:cover-up', supports: [{ nul: 'never-set' }, { span: SPAN_REGISTRY }] }] },
    world());
  assert.deepEqual(redeemed.mined, [], 'a void may accompany evidence; it may not BE the evidence');
});

// ── trust: exogenous or nothing (the third property) ──────────────────────────

test('demoting a disagreeing voice with no independent ground is poisoning — and covering all dissent is the echo', () => {
  const p = poisonAudit(crank(), world());
  assert.deepEqual(p.poisoned, ['auditor', 'registrar']);
  assert.equal(p.echo, true, 'every disagreeing voice demoted → the survivors agree by construction');
});

test('a demotion grounded in a present span the frame did not install is not poisoning', () => {
  const f = keystone({ demotes: [{ voice: 'auditor', grounds: [SPAN_INVOICE] }] });
  const v = admitFrame(f, world());
  assert.equal(v.admitted, true);
  assert.deepEqual(v.poison.poisoned, []);
  assert.equal(v.poison.echo, false, 'the registrar still stands — no unanimity by purge');
});

test('grounding a purge in the frame\'s own holon is the circle, not independence', () => {
  const f = keystone({
    demotes: [{ voice: 'auditor', grounds: ['holon:shell-co'] }],
  });
  const p = poisonAudit(f, world({ present: [SPAN_INVOICE, SPAN_REGISTRY, 'holon:shell-co'] }));
  assert.deepEqual(p.poisoned, ['auditor'], 'its own output cannot warrant its own purge');
});

// ── competence and the chance floor ───────────────────────────────────────────

test('keepAmplitude = salience · max(0, competence − chance floor)', () => {
  const c = frameCompetence(keystone(), world(), { foreBits: 0.4, salience: 0.5 });
  assert.ok(c.competence > 0.4, 'retro earned + fore measured');
  assert.ok(Math.abs(c.keepAmplitude - 0.5 * c.competence) < 1e-12, 'empty background → floor 0');

  const floored = frameCompetence(keystone(), world(), {
    salience: 1,
    background: [c.competence + 1, c.competence + 2, c.competence + 1.5, c.competence + 1.2, c.competence + 1.8],
  });
  assert.equal(floored.keepAmplitude, 0, 'a refund chance reorganizations also achieve earns nothing');
});

test('chanceFloor: none → 0; thin → its own max; deep → the derived null', () => {
  assert.equal(chanceFloor([]), 0);
  assert.equal(chanceFloor([0.2, 0.7]), 0.7);
  const deep = chanceFloor([0.1, 0.12, 0.11, 0.09, 0.1, 0.13, 0.1, 0.11]);
  assert.ok(Number.isFinite(deep) && deep > 0.13, 'above the bulk, by the void\'s own boundary');
});

// ── the lifecycle: install, then be defeated on the ledger ────────────────────

test('an admitted frame installs as a def carrying its defeaters; its named defeater evicts it through σ', () => {
  const f = keystone();
  const v = admitFrame(f, world());
  const def = frameDefEntry(f, v, { turn: 3, seq: 1 });
  assert.equal(def.kind, 'def');
  assert.deepEqual([...def.defeaters], ['registry:no-link', 'witness:recants']);

  const entries = [def, { kind: 'assert', seq: 2, under: def.id, turn: 3 }];
  assert.equal(statusOf(entries, 2), SETTLED, 'the claim stands while its frame stands');

  assert.equal(defeatedBy(def, 'invoice:recovered'), false);
  assert.deepEqual(defeatEntriesOn(entries, def, 'invoice:recovered', { turn: 4 }), [],
    'a non-defeater appends nothing');

  const evict = defeatEntriesOn(entries, def, 'registry:no-link', { turn: 4 });
  assert.equal(evict[0].kind, 'supersede');
  assert.equal(evict[0].was, def.id);
  assert.ok(evict.some((e) => e.kind === 'unsettle' && e.ref === 2), 'dependents unsettled — the bill');
  assert.equal(statusOf([...entries, ...evict], 2), UNSETTLED,
    'the claim no longer stands: measured under a frame the tape unseated');
});

test('an unadmitted frame never mints a def entry — the ledger cannot hold what skipped the algebra', () => {
  const c = crank();
  const v = admitFrame(c, world());
  assert.throws(() => frameDefEntry(c, v), /not admitted/);
});

// ── the stopping signal ───────────────────────────────────────────────────────

test('a line of inquiry is exhausted when new salient spans stop refunding', () => {
  assert.equal(inquiryExhausted([3, 2, 0, 0, 0]).exhausted, true);
  assert.equal(inquiryExhausted([0, 0, 5]).exhausted, false, 'a live refund resets the streak');
  assert.equal(inquiryExhausted([0, 0]).exhausted, false, 'too short a history to call it');
});
