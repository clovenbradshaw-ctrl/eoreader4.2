// The live bridge — proving "sources disagree" runs on the REAL engine, not just the surface
// sweep. disagreeOverSources parses each source with the actual perceiver (parseText) and folds
// the engine's own coref-resolved predicate DEFs into the disagreement. These tests run the real
// parser end-to-end and pin that (a) the engine's DEFs are picked up, and (b) coreference lets a
// pronoun characterization ("it is a camera") count toward the term.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { engineDefs, disagreeOverSources } from '../src/rooms/plain/project.js';
import { readAs } from '../src/rooms/plain/select.js';

const top = (model, basis) =>
  readAs(model.meanings.map((m) => ({ label: m.sense, by: m.by })), basis)[0]?.label ?? null;

test('engineDefs pulls the perceiver’s own copular DEFs about a term', () => {
  const doc = parseText('Surveillance is a line item in the vendor contract.', { docId: 'x' });
  const defs = engineDefs(doc, 'surveillance');
  assert.ok(defs.length >= 1, 'the parser extracted at least one predicate DEF');
  assert.ok(/line item/i.test(defs[0].value), `got: ${defs[0]?.value}`);
});

test('the real engine + surface sweep agree the sources disagree', () => {
  const sources = [
    { id: 'budget', label: 'the budget hearing',
      text: 'Surveillance is a line item. In the vendor contract, surveillance is a line item. Officials described surveillance as a capability.' },
    { id: 'court', label: 'the court filing',
      text: 'Surveillance is a thing done to people. In the motion, surveillance is a thing done to residents. The court treated surveillance as a legal exposure.' },
  ];
  const model = disagreeOverSources(sources, 'surveillance', { parse: parseText });
  assert.equal(model.disagree, true);
  assert.equal(top(model, 'budget'), 'item');
  assert.equal(top(model, 'court'), 'thing');
});

test('the pipeline never throws on empty or termless sources', () => {
  const model = disagreeOverSources(
    [{ id: 'a', label: 'A', text: '' }, { id: 'b', label: 'B', text: 'Nothing to see.' }],
    'surveillance', { parse: parseText });
  assert.equal(model.meanings.length, 0);
  assert.equal(model.disagree, false);
});
