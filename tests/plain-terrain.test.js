// The plain version's one rule, tested as arithmetic. The person is shown exactly three
// questions on a click — not because a designer curated three, but because the thing they
// clicked IS a terrain, a terrain sits in one domain, and a domain has exactly three
// operators. These tests pin that the three questions of a kind ARE the three operators of
// its domain (docs, "eoreader — the plain version" §9), so the restraint can never drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  KINDS, questionsFor, operatorsOfKind, domainOfKind, terrainOfKind, addressOf,
} from '../src/rooms/plain/terrain.js';
import { operatorsByDomain } from '../src/core/operators.js';
import { terrainInfo } from '../src/core/cube.js';

test('a name is Entity, a connection is Link, an idea is Lens — the thing already is a terrain', () => {
  assert.equal(terrainOfKind('name'), 'Entity');
  assert.equal(terrainOfKind('connection'), 'Link');
  assert.equal(terrainOfKind('idea'), 'Lens');
});

test('the domain is derived from the terrain, never chosen', () => {
  assert.equal(domainOfKind('name'), 'Existence');
  assert.equal(domainOfKind('connection'), 'Structure');
  assert.equal(domainOfKind('idea'), 'Interpretation');
  // …and it is exactly the domain the cube says that terrain sits in.
  for (const kind of KINDS) {
    assert.equal(domainOfKind(kind), terrainInfo(terrainOfKind(kind)).domain);
  }
});

test('THE RULE: every click yields exactly three questions', () => {
  for (const kind of KINDS) {
    assert.equal(questionsFor(kind).length, 3, `${kind} must show three questions`);
  }
});

test('THE RULE, why: the three questions ARE the three operators of the domain', () => {
  for (const kind of KINDS) {
    const asked = new Set(questionsFor(kind).map((q) => q.op));
    const afforded = new Set(operatorsByDomain(domainOfKind(kind)).map((o) => o.id));
    assert.deepEqual([...asked].sort(), [...afforded].sort(),
      `${kind}: the questions must be exactly its domain's operators`);
    // one operator per Mode — the arithmetic that makes it always three, never two or four
    assert.equal(asked.size, 3);
  }
});

test('the §9 addresses are the ones the doc lists', () => {
  const addr = (kind) => Object.fromEntries(questionsFor(kind).map((q) => [q.label, addressOf(q)]));
  const name = addr('name');
  assert.equal(name['Where does this come up?'], 'SIG(Entity, Binding)');
  assert.equal(name['Show me the actual ones'], 'INS(Entity, Making)');
  assert.equal(name["What's never said about it"], 'NUL(Void, Tending)');
  const conn = addr('connection');
  assert.equal(conn['What else connects here?'], 'CON(Link, Binding)');
  assert.equal(conn['What does this split?'], 'SEG(Link, Dissecting)');
  assert.equal(conn["What's the bigger picture?"], 'SYN(Network, Composing)');
  const idea = addr('idea');
  assert.equal(idea['People mean different things by this'], 'DEF(Lens, Dissecting)');
  assert.equal(idea['Does it hold up?'], 'EVA(Lens, Binding)');
  assert.equal(idea['When people changed their minds'], 'REC(Paradigm, Composing)');
});

test('only the REC card is starred — the one no tool without REC can build', () => {
  const stars = KINDS.flatMap((k) => questionsFor(k)).filter((q) => q.star);
  assert.equal(stars.length, 1);
  assert.equal(stars[0].op, 'REC');
});

test('counts attach per-question and never zero-pad a missing tally', () => {
  const qs = questionsFor('name', { occurrences: 12, instances: 7, blindspots: 3 });
  assert.equal(qs.find((q) => q.view === 'occurrences').count, 12);
  // a question with no supplied count reads blank (null), not 0
  const bare = questionsFor('name', { occurrences: 12 });
  assert.equal(bare.find((q) => q.view === 'instances').count, null);
});

test('an unknown kind yields no questions (no menu conjured from nothing)', () => {
  assert.deepEqual(questionsFor('sentence'), []);
  assert.deepEqual(operatorsOfKind('sentence'), []);
});
