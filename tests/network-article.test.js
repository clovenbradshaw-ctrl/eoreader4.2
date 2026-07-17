import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSourceLinks, topologyOf, buildNetworkArticle, networkGraphData,
} from '../src/wiki/network-article.js';

// A small housing-corpus fixture in topicTieredData()'s own shape: tier-0 source nodes,
// tier-1 merged-entity nodes, tier-0 src→entity edges. Three sources share "the housing
// trust"; a fourth ("workforce housing") shares nothing with anyone — the honest negative
// case a corpus-level synonym/coref graph has to get right (docs/coreference-timeline.md).
const topic = {
  nodes: [
    { id: 'src:1', tier: 0, label: 'Unified Housing Strategy' },
    { id: 'src:2', tier: 0, label: 'FY24 Budget Filing' },
    { id: 'src:3', tier: 0, label: 'News: affordable housing fund' },
    { id: 'src:4', tier: 0, label: 'Workforce Housing Memo' },
    { id: 'e:housing-trust', tier: 1, label: 'the housing trust' },
    { id: 'e:eastside', tier: 1, label: 'the Eastside' },
    { id: 'e:workforce', tier: 1, label: 'workforce housing' },
  ],
  edges: [
    { a: 'src:1', b: 'e:housing-trust', tier: 0, code: 'INS' },
    { a: 'src:1', b: 'e:eastside', tier: 0, code: 'INS' },
    { a: 'src:2', b: 'e:housing-trust', tier: 0, code: 'INS' },
    { a: 'src:3', b: 'e:housing-trust', tier: 0, code: 'INS' },
    { a: 'src:2', b: 'e:eastside', tier: 0, code: 'INS' },
    { a: 'src:4', b: 'e:workforce', tier: 0, code: 'INS' },
  ],
};

test('buildSourceLinks pairs sources by shared referents, never a source with itself', () => {
  const links = buildSourceLinks(topic);
  // src:1~src:2, src:1~src:3, src:2~src:3 (all share housing-trust; 1~2 also share eastside —
  // still ONE link per pair, evidence carries both) — src:4 shares nothing, no link at all.
  assert.equal(links.length, 3);
  assert.ok(links.every((l) => l.a !== l.b));
  assert.ok(!links.some((l) => l.a === 'src:4' || l.b === 'src:4'));
  const l12 = links.find((l) => l.a === 'src:1' && l.b === 'src:2');
  assert.ok(l12, 'src:1~src:2 link exists');
  assert.deepEqual(l12.evidence, ['the Eastside', 'the housing trust']);
  assert.equal(l12.terrain, 'Link');
  assert.deepEqual(l12.facets.endpoints, ['src:1', 'src:2']);
});

test('buildSourceLinks is order-independent per pair (a < b canonically)', () => {
  const links = buildSourceLinks(topic);
  for (const l of links) assert.ok(l.a < l.b, `${l.a} < ${l.b}`);
});

test('buildSourceLinks respects rootOf — a composite source collapses its children before pairing', () => {
  // src:2 and src:3 both "belong" to src:1's composite (a parentSn collapse) — a shared referent
  // with a sibling should not manufacture a self-link, and cross-composite pairs still form.
  const rootOf = (id) => (id === 'src:2' || id === 'src:3' ? 'src:1' : id);
  const links = buildSourceLinks(topic, { rootOf });
  assert.ok(!links.some((l) => l.a === l.b));
  // Only src:1 (the collapsed composite) and src:4 remain distinct roots — but src:4 shares
  // nothing, so no link survives at all once 1/2/3 collapse into one root.
  assert.equal(links.length, 0);
});

test('topologyOf is deterministic and reproducible from the same link set', () => {
  const links = buildSourceLinks(topic);
  const t1 = topologyOf(links), t2 = topologyOf(links.slice().reverse());
  assert.equal(t1, t2, 'order of the input links must not change the topology string');
  assert.match(t1, /^components:1\|/);   // one connected component: 1, 2, 3 all corroborate
});

test('topologyOf of an empty link set is the honest "empty", not a crash or a fabricated shape', () => {
  assert.equal(topologyOf([]), 'empty');
});

test('buildNetworkArticle: a coherent corpus (>=2 links) passes its own cardinality check', () => {
  const article = buildNetworkArticle(topic);
  assert.equal(article.terrain, 'Network');
  assert.equal(article.links.length, 3);
  assert.equal(article.facets.members.length, 3);
  assert.ok(article.check.ok, JSON.stringify(article.check.violations));
  assert.equal(article.characteristicFailure, null);
  assert.ok(article.linkChecks.every((lc) => lc.check.ok));
});

test('buildNetworkArticle: identity key is exactly the members + topology (terrains.js §4)', () => {
  const a1 = buildNetworkArticle(topic);
  const a2 = buildNetworkArticle({ ...topic, nodes: topic.nodes.slice(), edges: topic.edges.slice() });
  assert.equal(a1.key, a2.key, 'the same corpus folds to the same Network identity');
});

test('buildNetworkArticle: a corpus with fewer than 2 corroborating links is honestly incoherent', () => {
  const thin = {
    nodes: [
      { id: 'src:1', tier: 0, label: 'A' },
      { id: 'src:2', tier: 0, label: 'B' },
      { id: 'e:x', tier: 1, label: 'x' },
    ],
    edges: [
      { a: 'src:1', b: 'e:x', tier: 0, code: 'INS' },
      { a: 'src:2', b: 'e:x', tier: 0, code: 'INS' },
    ],
  };
  const article = buildNetworkArticle(thin);
  assert.equal(article.links.length, 1);   // one link, but Network requires >=2 inbound member_of
  assert.equal(article.check.ok, false);
  assert.ok(article.check.violations.some((v) => v.kind === 'missing-required' && v.edge === 'member_of'));
  // the terrain's OWN characteristic-failure text (src/wiki/terrains.js), never an invented message
  assert.match(article.characteristicFailure, /nobody in it would recognise as a system/);
});

test('networkGraphData renders in mountTieredGraph\'s exact node/edge shape', () => {
  const { nodes, edges, article } = networkGraphData(topic, { labelOf: (id) => (topic.nodes.find((n) => n.id === id) || {}).label || id });
  // every source that participates in a link is a tier-0 Entity node
  const sourceNodes = nodes.filter((n) => n.kind === 'source');
  assert.ok(sourceNodes.every((n) => n.tier === 0 && n.terrain === 'Entity'));
  assert.ok(sourceNodes.every((n) => typeof n.label === 'string' && n.label.length));
  // every derived pairing is a tier-1 Link node, and exactly one Network node closes the graph
  const linkNodes = nodes.filter((n) => n.kind === 'link');
  const networkNodes = nodes.filter((n) => n.kind === 'network');
  assert.equal(linkNodes.length, article.links.length);
  assert.equal(networkNodes.length, 1);
  assert.equal(networkNodes[0].terrain, 'Network');
  assert.equal(networkNodes[0].note, null, 'a coherent network carries no failure note');
  // every Link has exactly two endpoint_of (CON) edges in and one member_of (SYN) edge out
  for (const ln of linkNodes) {
    const ins = edges.filter((e) => e.b === ln.id);
    const out = edges.filter((e) => e.a === ln.id);
    assert.equal(ins.length, 2);
    assert.ok(ins.every((e) => e.gl === '⋈' && e.code === 'CON'));
    assert.equal(out.length, 1);
    assert.equal(out[0].gl, '△');
    assert.equal(out[0].code, 'SYN');
    assert.equal(out[0].b, networkNodes[0].id);
  }
  // src:4 (workforce housing — no corroboration) never appears at all, honestly
  assert.ok(!nodes.some((n) => n.id === 'src:4'));
});

test('networkGraphData surfaces the honest failure note when the corpus does not cohere', () => {
  const thin = {
    nodes: [
      { id: 'src:1', tier: 0, label: 'A' },
      { id: 'src:2', tier: 0, label: 'B' },
      { id: 'e:x', tier: 1, label: 'x' },
    ],
    edges: [
      { a: 'src:1', b: 'e:x', tier: 0, code: 'INS' },
      { a: 'src:2', b: 'e:x', tier: 0, code: 'INS' },
    ],
  };
  const { nodes } = networkGraphData(thin, { labelOf: (id) => id });
  const net = nodes.find((n) => n.kind === 'network');
  assert.ok(net.note, 'a not-yet-coherent network carries its own characteristic-failure note');
  assert.equal(net.label, 'Network (not yet coherent)');
});
