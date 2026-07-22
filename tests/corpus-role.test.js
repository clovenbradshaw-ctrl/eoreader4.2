import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { projectGraph } from '../src/core/project.js';

// Corpus fold, build-order step 3 (docs/corpus-fold §2.1/§2.3): a corpus item is folded by
// the SAME reader, into the SAME kind of log, as any document (F1 — no separate or
// simplified path). `role: 'corpus'` is the only thing that marks it. These tests pin two
// things: the mark is sealed at the log's own chokepoint (never trusted from a caller, never
// present on a plain document event), and projectGraph — the graph/claim-ledger fold — never
// lets a role:corpus event mint an entity, edge, merge, void, or retraction (F4), however the
// two came to share one log. The firewall is enforced at projection, not at storage (F6): the
// log itself never refuses to append a role:corpus event.

// ── the mark, sealed at the log's one chokepoint ────────────────────────────────

test('log: an event with no role at all carries no role key (byte-identical to before)', () => {
  const log = createLog();
  const e = log.append({ op: 'INS', id: 'a', label: 'Alice' });
  assert.equal('role' in e, false, 'an unmarked event must not carry a role key, not even a false-y one');
  assert.equal(log.role, null);
});

test('log: createLog({ role: "corpus" }) stamps role:corpus onto every sealed event', () => {
  const log = createLog({ role: 'corpus' });
  const a = log.append({ op: 'INS', id: 'a', label: 'Ambrose' });
  const b = log.append({ op: 'INS', id: 'b', label: 'Ledger' });
  assert.equal(a.role, 'corpus');
  assert.equal(b.role, 'corpus');
  // Same chokepoint as any other event — sealed with seq/t like every append (F1: no
  // separate or simplified path just because the log is a corpus fold).
  assert.equal(typeof a.seq, 'number');
  assert.equal(typeof a.t, 'number');
});

test('log: an individual event can carry its own role, independent of the log default', () => {
  const log = createLog(); // a plain document log
  const docEvent = log.append({ op: 'INS', id: 'doc1', label: 'Grete' });
  const corpusEvent = log.append({ op: 'INS', id: 'corp1', label: 'Ambrose', role: 'corpus' });
  assert.equal('role' in docEvent, false);
  assert.equal(corpusEvent.role, 'corpus');
});

// ── F4: the projection firewall ─────────────────────────────────────────────────
// Each test below mixes a role:corpus event alongside a plain document event in ONE log —
// the exact scenario F4 names ("any code path by which a role:corpus event can reach the
// claim ledger of a non-corpus source is a defect") — and asserts the corpus side never
// surfaces in projectGraph's output.

test('project: a role:corpus INS never mints an entity', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'doc1', label: 'Grete' });
  log.append({ op: 'INS', id: 'corp1', label: 'Ambrose', role: 'corpus' });
  const g = projectGraph(log);
  assert.ok(g.entities.has('doc1'));
  assert.equal(g.entities.has('corp1'), false, 'a corpus-tagged INS must not reach the entity projection');
  assert.equal(g.entities.size, 1);
});

test('project: a role:corpus CON/SIG never mints an edge', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'a', label: 'Grete' });
  log.append({ op: 'INS', id: 'b', label: 'household' });
  log.append({ op: 'CON', src: 'a', tgt: 'b', via: 'tends', sentIdx: 0 });
  log.append({ op: 'INS', id: 'c', label: 'Ambrose', role: 'corpus' });
  log.append({ op: 'INS', id: 'd', label: 'Ledger', role: 'corpus' });
  log.append({ op: 'CON', src: 'c', tgt: 'd', via: 'audits', sentIdx: 1, role: 'corpus' });
  const g = projectGraph(log);
  assert.equal(g.edges.length, 1, 'only the document edge is projected');
  assert.equal(g.edges[0].from, 'a');
  assert.equal(g.edges[0].to, 'b');
});

test('project: a role:corpus SYN merge never merges document entities', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'a', label: 'Grete' });
  log.append({ op: 'INS', id: 'b', label: 'Margarethe' });
  log.append({ op: 'SYN', kind: 'merge', from: 'a', to: 'b', role: 'corpus' });
  const g = projectGraph(log);
  assert.equal(g.representative('a'), 'a', 'a corpus-tagged merge must not fire on document referents');
  assert.equal(g.entities.size, 2, 'both document entities survive unmerged');
});

test('project: a role:corpus DEF-to-void never carves an absence onto a document referent', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'a', label: 'Grete' });
  log.append({ op: 'DEF', kind: 'void', node: 'a', rel: 'employer', sentIdx: 0, role: 'corpus' });
  const g = projectGraph(log);
  assert.equal(g.voids.length, 0, 'a corpus-tagged void must not reach the document projection');
});

test('project: a role:corpus retraction never retracts a document event', () => {
  const log = createLog();
  const ins = log.append({ op: 'INS', id: 'a', label: 'Grete' });
  log.append({ op: 'SEG', kind: 'retract', refSeq: ins.seq, role: 'corpus' });
  const g = projectGraph(log);
  assert.ok(g.entities.has('a'), 'a corpus-tagged retraction must not remove a document entity');
});

test('project: an entire corpus-role log projects to an empty graph', () => {
  const log = createLog({ role: 'corpus' });
  log.append({ op: 'INS', id: 'a', label: 'Ambrose' });
  log.append({ op: 'INS', id: 'b', label: 'Ledger' });
  log.append({ op: 'CON', src: 'a', tgt: 'b', via: 'audits', sentIdx: 0 });
  const g = projectGraph(log);
  assert.equal(g.entities.size, 0);
  assert.equal(g.edges.length, 0);
});
