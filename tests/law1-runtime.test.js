import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/index.js';
import { contractOf } from '../src/core/contracts.js';
import { createParser } from '../src/perceiver/parse/index.js';

// Law 1 at the append chokepoint (docs/eo-for-coders.md: "the kernel checks
// every event the part emits against its declared contract"). The log takes the
// registry's resolver by INJECTION (core imports nothing); an event whose
// emitter names itself (append meta.src) is checked op-vs-declared-Act-face at
// emit. A violation is RECORDED, never thrown — the sealed event carries `law1`
// and the log collects it — and the record is never rewritten.

const FAKE = (path) =>
  path === 'src/fake/writer.js' ? { ops: ['INS', 'DEF'] } : null;

test('a declared op from a self-identified emitter seals clean', () => {
  const log = createLog({ contractOf: FAKE });
  const e = log.append({ op: 'INS', id: 'x', label: 'X' }, { src: 'src/fake/writer.js' });
  assert.equal(e.law1, undefined);
  assert.equal(log.law1Violations().length, 0);
});

test('an undeclared op from a self-identified emitter is recorded, not thrown', () => {
  const log = createLog({ contractOf: FAKE });
  const e = log.append({ op: 'SYN', kind: 'merge', from: 'a', to: 'b' }, { src: 'src/fake/writer.js' });
  assert.equal(e.law1.verdict, 'undeclared-op');
  assert.equal(e.law1.src, 'src/fake/writer.js');
  assert.deepEqual([...e.law1.declared], ['INS', 'DEF']);
  assert.equal(log.law1Violations().length, 1);
  assert.equal(log.law1Violations()[0].seq, e.seq);
  // the violation is part of the record — appended, sealed, never unwritten
  assert.equal(log.events[e.seq].law1.verdict, 'undeclared-op');
});

test('an emitter with no contract is itself the violation', () => {
  const log = createLog({ contractOf: FAKE });
  const e = log.append({ op: 'INS', id: 'y' }, { src: 'src/fake/nobody.js' });
  assert.equal(e.law1.verdict, 'no-contract');
  assert.equal(log.law1Violations().length, 1);
});

test('no resolver, or no self-identification → sealed byte-identically to before', () => {
  const bare = createLog({});
  const e1 = bare.append({ op: 'INS', id: 'z' }, { src: 'src/fake/writer.js' });
  assert.equal(e1.law1, undefined);
  const wired = createLog({ contractOf: FAKE });
  const e2 = wired.append({ op: 'SYN', kind: 'merge', from: 'a', to: 'b' }); // anonymous
  assert.equal(e2.law1, undefined);
  assert.equal(wired.law1Violations().length, 0);
});

test('the live parser, wired to the REAL registry, parses with zero Law 1 violations', () => {
  // The first adopter: the parse orchestrator self-identifies every event it
  // authors, and its declared Act face covers them — so a real parse against
  // the real registry emits no violation. If the pipeline gains an emission its
  // contract does not declare, this fails at runtime exactly as Law 1 promises.
  const parser = createParser({ contractOf });
  const doc = parser.parse('Ada Lovelace wrote the first program. Babbage designed the engine. Ada admired Babbage.');
  assert.ok(doc.log.events.length > 0, 'the parse emitted events');
  const violations = doc.log.law1Violations();
  assert.equal(violations.length, 0,
    `the parse orchestrator violated its own Act face:\n  ${violations.map(v => `${v.law1.src}: ${v.op} (${v.law1.verdict})`).join('\n  ')}`);
});
