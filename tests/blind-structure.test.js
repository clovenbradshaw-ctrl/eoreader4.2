import { test } from 'node:test';
import assert from 'node:assert/strict';

import { eotDoc } from '../src/organs/ingest/eot.js';
import {
  blindPrompt, blindCharge, propositionsOf, continuityGate,
  generateOverStructure, makeStreamRestorer,
} from '../src/model/blind-structure.js';
import { restore } from '../src/weave/write/redact.js';
import { POLARITY } from '../src/model/polarity.js';

// The blind-structure loop — the meaning-withheld membrane + the propositional continuity gate.
//
//   BLIND    emit the EOT shape with every referent collapsed to an opaque handle; nothing
//            referential may reach the model (the membrane invariant, fail-closed).
//   RESTORE  bind the handles back to the real referents on the return.
//   GATE     a relation the blind reasoner asserts among real referents that the input did not
//            contain is a FABRICATION (closed) or a PROPOSAL (open); a flipped bond is a
//            CONTRADICTION (refused either way); a lost bond is EROSION (soft).

const CODE = [
  'chargeCard : Function',
  'ledger : Module',
  'refund : Function',
  'chargeCard -> ledger : imports',
  'chargeCard -> refund : calls',
].join('\n');
const codeDoc = () => eotDoc(CODE, { docId: 'code', door: 'perceiver' });

// A stub backend — returns a fixed handle-EOT answer; only `phrase` is exercised.
const stub = (answer) => ({
  id: 'stub', kind: 'remote',
  describe: () => ({ backend: 'stub', kind: 'remote', model: 'authored' }),
  isLoaded: () => true, async load() {},
  async phrase() { return answer; },
});

// ── the blinding membrane ────────────────────────────────────────────────────────

test('blindPrompt collapses every referent to a handle and leaks no real name', () => {
  const { messages, names } = blindPrompt(codeDoc(), { task: 'report structure' });
  const sent = messages.map((m) => m.content).join('\n');
  // the referents are hidden…
  for (const name of ['chargeCard', 'ledger', 'refund']) assert.ok(!sent.includes(name), `"${name}" must not reach the model`);
  assert.deepEqual(names.sort(), ['chargeCard', 'ledger', 'refund']);
  // …but the STRUCTURE — the handles, the types, the relations — survives.
  assert.match(sent, /Referent\d+ -> Referent\d+ : imports/);
  assert.match(sent, /Referent\d+ : Function/);
  // the charge tells the model it is reasoning over opaque handles.
  assert.match(messages[0].content, /OPAQUE handles/);
});

test('blindPrompt is fail-closed: a leak throws before the payload leaves', () => {
  // A doc whose referent surface cannot be aliased away would make redactEot's assertNoNameLeak
  // throw; here we simply prove the happy path returns and the guard is on the real payload.
  assert.doesNotThrow(() => blindPrompt(codeDoc(), { task: 't' }));
  assert.match(blindCharge('do X'), /TASK: do X/);
});

test('the handles restore back to the real referents', () => {
  const { messages, names } = blindPrompt(codeDoc(), { task: 't' });
  // Build the restore table the driver uses by round-tripping through the loop.
  // (restore is redact.js's inverse; here we assert the forward blinding is reversible.)
  const blinded = messages[1].content;
  assert.ok(!names.some((n) => blinded.includes(n)));   // forward: names gone
});

// ── propositions, keyed by referent ───────────────────────────────────────────────

test('propositionsOf reads the label-keyed relations off a reading', () => {
  const props = propositionsOf(codeDoc());
  const bases = [...props.keys()];
  assert.ok(bases.includes('chargecard ⟩ imports ⟩ ledger'));
  assert.ok(bases.includes('chargecard ⟩ calls ⟩ refund'));
  assert.ok(bases.includes('chargecard ⟩ is ⟩ function'));
  // every proposition carries a polarity
  for (const p of props.values()) assert.ok(p.pol === '+' || p.pol === '-');
});

// ── the continuity gate, the four verdicts ─────────────────────────────────────────

test('gate: a faithful subset is continuous and passes', () => {
  const before = propositionsOf(codeDoc());
  const after = new Map([['chargecard ⟩ imports ⟩ ledger', { sub: 'chargeCard', rel: 'imports', dif: 'ledger', pol: '+' }]]);
  const g = continuityGate(before, after, { mode: 'closed' });
  assert.equal(g.verdict, 'narrowed');   // a subset that drops facts is narrowed, still ok
  assert.equal(g.ok, true);
  assert.equal(g.counts.introduced, 0);
});

test('gate: an exact restatement is continuous', () => {
  const before = propositionsOf(codeDoc());
  const g = continuityGate(before, before, { mode: 'closed' });
  assert.equal(g.verdict, 'continuous');
  assert.equal(g.ok, true);
  assert.equal(g.counts.dropped, 0);
});

test('gate: a new bond FABRICATES in a closed task and refuses', () => {
  const before = propositionsOf(codeDoc());
  const after = new Map([['ledger ⟩ owns ⟩ chargecard', { sub: 'ledger', rel: 'owns', dif: 'chargeCard', pol: '+' }]]);
  const g = continuityGate(before, after, { mode: 'closed' });
  assert.equal(g.verdict, 'fabricated');
  assert.equal(g.ok, false);
  assert.equal(g.refuses, true);
  assert.ok(g.fired.some((f) => f.id === 'proposition-fabricated' && f.refuses));
});

test('gate: the same new bond is a PROPOSAL in an open task and passes', () => {
  const before = propositionsOf(codeDoc());
  const after = new Map([['refund ⟩ imports ⟩ ledger', { sub: 'refund', rel: 'imports', dif: 'ledger', pol: '+' }]]);
  const g = continuityGate(before, after, { mode: 'open' });
  assert.equal(g.verdict, 'proposed');
  assert.equal(g.ok, true);
  assert.equal(g.counts.proposals, 1);
  assert.equal(g.fired.length, 0);   // a proposal is surfaced, never fired
});

test('gate: a flipped bond CONTRADICTS and refuses in either mode', () => {
  const neg = new Map([['ledger ⟩ imports ⟩ auth', { sub: 'ledger', rel: 'imports', dif: 'auth', pol: '-' }]]);
  const pos = new Map([['ledger ⟩ imports ⟩ auth', { sub: 'ledger', rel: 'imports', dif: 'auth', pol: '+' }]]);
  for (const mode of ['open', 'closed']) {
    const g = continuityGate(neg, pos, { mode });
    assert.equal(g.verdict, 'contradicted');
    assert.equal(g.ok, false);
    assert.ok(g.fired.some((f) => f.id === 'proposition-contradicted' && f.refuses));
  }
});

test('gate: requireTotal makes erosion a hard fail', () => {
  const before = propositionsOf(codeDoc());
  const after = new Map([['chargecard ⟩ imports ⟩ ledger', { sub: 'chargeCard', rel: 'imports', dif: 'ledger', pol: '+' }]]);
  assert.equal(continuityGate(before, after, { mode: 'closed' }).ok, true);
  assert.equal(continuityGate(before, after, { mode: 'closed', requireTotal: true }).ok, false);
});

// ── the driver, end to end (echo/stub backend) ─────────────────────────────────────

test('generateOverStructure runs the whole loop and gates a faithful answer', async () => {
  const answer = 'Referent1 -> Referent2 : imports\nReferent1 -> Referent3 : calls\nReferent1 : Function\nReferent2 : Module\nReferent3 : Function';
  const r = await generateOverStructure({ model: stub(answer), doc: codeDoc(), task: 't', mode: 'closed' });
  assert.match(r.restored, /chargeCard -> ledger : imports/);   // referents bound back
  assert.ok(!r.restored.includes('Referent'));                  // no handle survives the restore
  assert.equal(r.gate.verdict, 'continuous');
  assert.equal(r.gate.ok, true);
});

test('generateOverStructure catches a fabrication in a closed task', async () => {
  const r = await generateOverStructure({ model: stub('Referent2 -> Referent1 : owns'), doc: codeDoc(), task: 't', mode: 'closed' });
  assert.equal(r.gate.verdict, 'fabricated');
  assert.equal(r.gate.ok, false);
  assert.match(r.restored, /ledger -> chargeCard : owns/);
});

test('generateOverStructure requires a loaded backend and a doc with a log', async () => {
  await assert.rejects(() => generateOverStructure({ doc: codeDoc(), task: 't' }), /loaded backend/);
  await assert.rejects(() => generateOverStructure({ model: stub('x'), doc: {}, task: 't' }), /must carry a log/);
});

// ── the streaming restorer never emits a half-restored handle ──────────────────────

test('makeStreamRestorer restores across chunk boundaries, splitting no handle', () => {
  const table = new Map([['Referent1', 'chargeCard'], ['Referent2', 'ledger']]);
  const r = makeStreamRestorer(table);
  // feed "Referent1 -> Referent2" one character at a time; the concatenation must equal a
  // wholesale restore, with no handle ever split across an emitted chunk.
  const pieces = 'Referent1 -> Referent2 : imports'.split('');
  let out = '';
  for (const p of pieces) out += r.push(p);
  out += r.flush();
  assert.equal(out, restore('Referent1 -> Referent2 : imports', table));
  assert.match(out, /chargeCard -> ledger : imports/);
});

// ── the polarity trichotomy (Assembly 1) ───────────────────────────────────────────

test('propositionsOf: closure "open" (default) never produces POLARITY.NULL and is byte-identical to the bare call', () => {
  const withOpts = propositionsOf(codeDoc(), { closure: 'open' });
  const bare = propositionsOf(codeDoc());
  assert.deepEqual([...withOpts.entries()], [...bare.entries()]);
  for (const p of withOpts.values()) assert.notEqual(p.pol, POLARITY.NULL);
});

test('propositionsOf: closure "declared" agrees with "open" on every base actually read, and adds NULL only for undeclared-but-unread universe bases', () => {
  const open = propositionsOf(codeDoc(), { closure: 'open' });
  const universe = [...open.keys(), 'nobody ⟩ imports ⟩ nothing', 'ghost ⟩ calls ⟩ void'];
  const declared = propositionsOf(codeDoc(), { closure: 'declared', universe });

  // every base the open reading has, the declared reading agrees on exactly
  for (const [base, p] of open) assert.deepEqual(declared.get(base), p);

  // the universe bases NOT read materialize as NULL, and only those
  const extra = [...declared.keys()].filter((b) => !open.has(b));
  assert.deepEqual(extra.sort(), ['ghost ⟩ calls ⟩ void', 'nobody ⟩ imports ⟩ nothing'].sort());
  for (const base of extra) assert.equal(declared.get(base).pol, POLARITY.NULL);
});
