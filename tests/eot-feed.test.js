import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEotLedger } from '../src/rooms/audit/eot-ledger.js';
import { wireEotFeed } from '../src/rooms/reader/eot-feed.js';
import { eotBucket } from '../src/rooms/audit/eot-terminal.js';

// The EOT console must show EVERYTHING the machine does — not just the murmur. This
// pins the two things that make that true: (1) the feed translator captures all three
// live streams onto the ledger (reads/searches through the perceiver door, turn acts
// through the enactor door, the peripheral sense as murmur); (2) the terminal buckets
// murmur as its own filterable stream, distinct from the model's real acts, so a view
// of "everything except the murmur" is one click away and the continuous murmur can be
// set apart rather than drowning the sparse operations.

// A tiny live-stream trio in the shape the reader emits (app.state.log + emit('log'),
// audit.subscribe over turn objects, murmur.subscribe over voice snapshots).
const harness = () => {
  const appSubs = new Set();
  const app = { state: { log: [] }, subscribe: (fn) => { appSubs.add(fn); return () => appSubs.delete(fn); } };
  let ln = 0;
  const logIt = (kind, text, effect = '') => {
    app.state.log.push({ id: `L${++ln}`, kind, text, effect });
    for (const f of appSubs) f('log');
  };
  const auditSubs = new Set();
  const audit = { subscribe: (fn) => { auditSubs.add(fn); return () => auditSubs.delete(fn); } };
  const emitTurn = (t) => { for (const f of auditSubs) f(t); };
  const murmurSubs = new Set();
  const murmur = { subscribe: (fn) => { murmurSubs.add(fn); return () => murmurSubs.delete(fn); } };
  const emitMurmur = (s) => { for (const f of murmurSubs) f(s); };
  return { app, logIt, audit, emitTurn, murmur, emitMurmur };
};

test('the feed captures all three streams — the world, the model\'s acts, and the murmur', () => {
  const h = harness();
  const eot = createEotLedger({ capacity: 500 });
  wireEotFeed({ app: h.app, audit: h.audit, murmur: h.murmur, eot });

  h.logIt('search', 'quantum computing');
  h.logIt('record', 'https://example.com/article');
  h.logIt('claim', 'The sky is blue', 'src:1');
  h.emitTurn({ id: 't1', route: 'grounded', reading: { spans: [{ score: 0.9 }] }, prompt: 'Answer this', rawOutput: 'the answer', durationMs: 42, vetoes: [{ id: 'c1', message: 'unsupported' }] });
  h.emitMurmur({ voice: [{ text: 'something drifts here', register: 'drift', op: 'SIG', sites: [{ hash: 'abc123' }] }] });

  const kinds = eot.snapshot().map((r) => r.kind);
  // the world it read (perceiver door)
  assert.ok(kinds.includes('search'), 'a search is on the ledger');
  assert.ok(kinds.includes('read'), 'a read is on the ledger');
  // the model\'s own acts (enactor door)
  assert.ok(kinds.includes('route'), 'a route is on the ledger');
  assert.ok(kinds.includes('retrieve'), 'a retrieval is on the ledger');
  assert.ok(kinds.includes('prompt'), 'a prompt is on the ledger');
  assert.ok(kinds.includes('generate'), 'a generation is on the ledger');
  assert.ok(kinds.includes('bind'), 'a citation bind is on the ledger');
  assert.ok(kinds.includes('veto'), 'a veto is on the ledger');
  // the peripheral sense
  assert.ok(kinds.includes('murmur'), 'the murmur is on the ledger');

  // …and it is NOT just the murmur: real operations outnumber the single voicing.
  const murmurs = kinds.filter((k) => k === 'murmur').length;
  assert.equal(murmurs, 1);
  assert.ok(kinds.length - murmurs >= 8, 'the non-murmur operations are all present');
});

test('the terminal buckets murmur as its own stream, apart from the model\'s real acts', () => {
  // a perceiver read, an enactor act, and a murmur voicing (which rides the enactor door)
  const read = { door: 'perceiver', kind: 'read' };
  const act = { door: 'enactor', kind: 'generate' };
  const voice = { door: 'enactor', kind: 'murmur' };

  assert.equal(eotBucket(read), 'perceiver');
  assert.equal(eotBucket(act), 'enactor');
  // the murmur shares the enactor DOOR (still reafferent, cannot witness) but is its own
  // VIEW bucket — so "act · model" shows the real acts without the murmur drowning them.
  assert.equal(eotBucket(voice), 'murmur');
  assert.notEqual(eotBucket(voice), eotBucket(act));
});
