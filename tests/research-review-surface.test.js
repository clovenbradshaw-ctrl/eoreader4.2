import { test } from 'node:test';
import assert from 'node:assert/strict';

import { researchReview } from '../src/rooms/reader/research-review-corpus.js';
import { mountResearchReview } from '../src/rooms/reader/research-review-surface.js';
import {
  renderEvidenceMatrixSection, renderSourceNetworkSection, renderIdentityReviewSection,
  renderDerivativeClustersSection, renderGapDirectedSection,
} from '../src/rooms/reader/research-review-surface2.js';

// Research Review's mounted surface — a minimal hand-rolled DOM stub (not jsdom), the same idiom
// tests/waveform-render.test.js uses for src/surfaces/waveform/render.strict.js. Two layers: direct
// unit tests of the §7/§9 section renderers (research-review-surface2.js / -cards2.js) against
// small hand-built view slices — deterministic, precise about wiring — and one broader end-to-end
// smoke test of mountResearchReview over the REAL engine, guarding against a crash or a dropped
// ctx callback across the whole file split.

// ---- the DOM adapter ------------------------------------------------------------------------

const makeEl = (tag, doc) => {
  const e = {
    tagName: String(tag).toUpperCase(), _children: [], _attrs: {}, _listeners: {},
    className: '', textContent: '', style: {}, ownerDocument: doc,
    appendChild(child) {
      if (child && child._isFragment) { for (const c of child._children) this._children.push(c); child._children = []; }
      else this._children.push(child);
      return child;
    },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); },
    fire(type) { for (const fn of (this._listeners[type] || [])) fn(); },
  };
  Object.defineProperty(e, 'innerHTML', { get: () => '', set: (v) => { if (v === '') e._children = []; } });
  return e;
};

const makeFakeDoc = () => {
  const byId = new Map();
  const doc = {
    createElement: (tag) => makeEl(tag, doc),
    createDocumentFragment: () => ({ _isFragment: true, _children: [], appendChild(c) { this._children.push(c); } }),
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild: (el) => { if (el.id) byId.set(el.id, el); } },
  };
  return doc;
};

const flatten = (node) => {
  const out = [node];
  for (const c of node._children || []) out.push(...flatten(c));
  return out;
};
const findByText = (root, text) => flatten(root).find((n) => n.textContent === text);
const findByTextPrefix = (root, prefix) => flatten(root).find((n) => typeof n.textContent === 'string' && n.textContent.startsWith(prefix));
const allByText = (root, text) => flatten(root).filter((n) => n.textContent === text);

// ---- §7/§9 section renderers — direct unit tests over hand-built view slices ------------------

test('renderDerivativeClustersSection — null when nothing has a derivative; wires keep-origin/keep-all/mark-independent/diff-toggle', () => {
  const doc = makeFakeDoc();
  assert.equal(renderDerivativeClustersSection(doc, { clusters: [{ origin: { sn: 'S1' }, derivative: [], members: [{ sn: 'S1' }] }] }, {}), null);

  const cluster = {
    origin: { sn: 'S1', title: 'Origin report', text: 'origin text here' },
    derivative: [{ sn: 'S2', title: 'Copycat', text: 'copy text here' }],
    members: [{ sn: 'S1', title: 'Origin report', text: 'origin text here' }, { sn: 'S2', title: 'Copycat', text: 'copy text here' }],
  };
  const calls = [];
  const diffOpenSet = new Set();
  const ctx = {
    titleOf: (sn) => sn, diffOpenSet,
    onAction: (originSn, action) => calls.push(['action', originSn, action]),
    onToggleDiff: (originSn) => calls.push(['diff', originSn]),
    onMarkIndependent: (sn) => calls.push(['independent', sn]),
  };
  const sec = renderDerivativeClustersSection(doc, { clusters: [cluster] }, ctx);
  assert.ok(sec);
  findByText(sec, 'Keep origin only').fire('click');
  findByText(sec, 'Keep reporting perspectives').fire('click');
  findByText(sec, 'Review differences').fire('click');
  findByText(sec, 'Mark “Copycat” independent').fire('click');
  assert.deepEqual(calls, [['action', 'S1', 'keep-origin'], ['action', 'S1', 'keep-all'], ['diff', 'S1'], ['independent', 'S2']]);

  // diffOpenSet marks it open — the excerpt rows render, and the button now reads "Hide differences".
  diffOpenSet.add('S1');
  const sec2 = renderDerivativeClustersSection(doc, { clusters: [cluster] }, ctx);
  assert.ok(findByText(sec2, 'Hide differences'));
  assert.ok(findByTextPrefix(sec2, 'origin text here'), 'the origin excerpt is shown');
  assert.ok(findByTextPrefix(sec2, 'copy text here'), 'the derivative excerpt is shown');
});

test('renderIdentityReviewSection — null when no candidates; confirm/reject wire reviewSetIdentity(key, decision)', () => {
  const doc = makeFakeDoc();
  assert.equal(renderIdentityReviewSection(doc, { identity: [] }, {}), null);

  const calls = [];
  const view = { identity: [{ key: 'mta', label: 'MTA', sns: ['S1', 'S2'], state: 'candidate' }] };
  const sec = renderIdentityReviewSection(doc, view, {
    titleOf: (sn) => `title-${sn}`,
    onSet: (key, decision) => calls.push([key, decision]),
  });
  assert.ok(findByTextPrefix(sec, 'Identity review — 1 unresolved'));
  findByText(sec, 'Same referent').fire('click');
  findByText(sec, 'Different').fire('click');
  assert.deepEqual(calls, [['mta', 'aligned'], ['mta', 'separate']]);
});

test('renderSourceNetworkSection — null when no edges; caps the list and wires the expand toggle', () => {
  const doc = makeFakeDoc();
  assert.equal(renderSourceNetworkSection(doc, { network: { edges: [], total: 0, truncated: false } }, {}), null);

  const edges = Array.from({ length: 10 }, (_, i) => ({ a: `S${i}`, b: `S${i + 1}`, type: 'shares a referent', label: 'x', why: 'y' }));
  const network = { edges, total: 10, truncated: false };
  let expanded = false;
  const sec = renderSourceNetworkSection(doc, { network }, {
    titleOf: (sn) => sn, onOpenSource: () => {}, expanded,
    onToggleExpand: () => { expanded = true; },
  });
  assert.equal(allByText(sec, 'shares a referent').length, 8, 'capped to 8 when collapsed');
  findByText(sec, 'Show all 10').fire('click');
  assert.equal(expanded, true);
});

test('renderEvidenceMatrixSection — null when empty; a nonempty cell opens its source', () => {
  const doc = makeFakeDoc();
  assert.equal(renderEvidenceMatrixSection(doc, { evidenceMatrix: { rows: [], sources: [] } }, {}), null);

  const matrixView = {
    sources: [{ source: 'S1', label: 'MTA' }, { source: 'S2', label: 'News' }],
    rows: [{ family: 'measure', label: 'Revenue', cells: { S1: { state: 'supports', display: '$48M' }, S2: { state: 'silent' } } }],
  };
  const calls = [];
  const sec = renderEvidenceMatrixSection(doc, { evidenceMatrix: matrixView }, { onOpenSource: (sn) => calls.push(sn) });
  assert.ok(findByTextPrefix(sec, 'Evidence matrix — 2 selected'));
  findByText(sec, '$48M').fire('click');
  assert.deepEqual(calls, ['S1']);
});

test('renderGapDirectedSection — null when nothing detected; a missing-tier action calls onSearch(area, templateKey)', () => {
  const doc = makeFakeDoc();
  assert.equal(renderGapDirectedSection(doc, { gaps: { strong: [], partial: [], missing: [] } }, {}), null);

  const area = { label: 'equity impacts', terms: ['equity'], sourceCount: 1, independentOrigins: 1 };
  const calls = [];
  const sec = renderGapDirectedSection(doc, { gaps: { strong: [], partial: [], missing: [area] } }, {
    onSearch: (a, key) => calls.push([a.label, key]),
  });
  findByText(sec, 'Search for primary dataset').fire('click');
  assert.deepEqual(calls, [['equity impacts', 'dataset']]);
});

// ---- end-to-end smoke test — the REAL engine through mountResearchReview -----------------------

const S1 = { sn: 'S1', title: 'MTA report', domain: 'mta.gov', url: 'https://mta.gov/r', kind: 'pdf', retrieved: '2026-04-01T00:00:00Z', text: 'The Metropolitan Transportation Authority congestion pricing program reduced vehicle entries. Traffic volume declined by 11 percent. Revenue collected reached $48.6 million.' };
const S2 = { sn: 'S2', title: 'News report', domain: 'newswire1.test', url: 'https://newswire1.test/a', kind: 'web', retrieved: '2026-04-02T00:00:00Z', text: 'Congestion pricing traffic volume dropped after the MTA program launched, officials said. Vehicle entries fell by 11 percent.' };
const S3 = { sn: 'S3', title: 'Comptroller audit', domain: 'comptroller.ny.gov', url: 'https://comptroller.ny.gov/a', kind: 'web', retrieved: '2026-04-03T00:00:00Z', text: 'An independent comptroller analysis of the congestion pricing program found revenue of $51 million, higher than the agency projection.' };
const S4 = { sn: 'S4', title: 'Court filing', domain: 'courtwire2.test', url: 'https://courtwire2.test/x', kind: 'web', retrieved: '2026-04-04T00:00:00Z', text: 'A state court filing challenges the congestion pricing program on environmental grounds, naming the transportation authority.' };
const S5 = { sn: 'S5', title: 'Syndicated copy', domain: 'mirror-syndicate.test', url: 'https://mirror-syndicate.test/c', kind: 'web', retrieved: '2026-04-05T00:00:00Z', hash: 'mta-hash-1', text: S1.text };
S1.hash = 'mta-hash-1';
const ROWS = [S1, S2, S3, S4, S5];
const ENTITIES = [
  { label: 'MTA', docId: 'd1', entId: 'e1', instances: [{ sn: 'S1' }, { sn: 'S2' }, { sn: 'S3' }] },
  { label: 'congestion pricing', docId: 'd1', entId: 'e2', instances: [{ sn: 'S1' }, { sn: 'S2' }, { sn: 'S3' }, { sn: 'S4' }] },
];
const MATRIX = {
  sources: ROWS.map((r) => ({ source: r.sn, label: r.title })),
  rows: [{
    measure: 'revenue', measureLabel: 'Revenue', subject: 'toll', conflict: true, changed: false,
    reading: 'Sources disagree', sourceCount: 2,
    cells: [
      { source: 'S1', sourceLabel: 'MTA', value: 48.6, unit: 'M', raw: '$48.6M', bound: 'exact', transition: null, sentIdx: 2, text: 'Revenue collected reached $48.6 million.', display: '$48.6M' },
      null,
      { source: 'S3', sourceLabel: 'Comptroller', value: 51, unit: 'M', raw: '$51M', bound: 'exact', transition: null, sentIdx: 0, text: 'revenue of $51 million', display: '$51M' },
      null, null,
    ],
  }],
  counts: { rows: 1, measures: 1, conflicts: 1, sources: 5 },
};

const makeFakeApp = () => {
  const topic = { id: 't1', title: null, review: { query: 'congestion pricing', excludedSns: [], recipe: 'balanced', identityDecisions: {}, independentOverrides: [] } };
  const calls = [];
  const app = {
    reviewCompute(topicId) {
      if (topicId !== topic.id) return null;
      const view = researchReview({
        rows: ROWS, entities: ENTITIES, matrix: MATRIX, query: topic.review.query,
        independentOverrides: topic.review.independentOverrides, identityDecisions: topic.review.identityDecisions,
        excludedSns: topic.review.excludedSns,
      });
      const waveforms = {};
      for (const r of ROWS) waveforms[r.sn] = { bars: [{ hPct: 40, hasTurn: true, ordinal: 0, hasBridge: false, hasMeasure: false }, { hPct: 8, hasTurn: false, ordinal: null }] };
      return { ...view, topic, excludedSns: new Set(topic.review.excludedSns), discovered: [], waveforms };
    },
    reviewStart: async () => null,
    reviewAddUrl: async () => null,
    reviewMore: async () => 0,
    reviewToggleExclude(topicId, sn) {
      calls.push(['toggle', sn]);
      const ex = new Set(topic.review.excludedSns);
      if (ex.has(sn)) ex.delete(sn); else ex.add(sn);
      topic.review.excludedSns = [...ex];
    },
    reviewApplyRecipe(topicId, key) { calls.push(['recipe', key]); topic.review.recipe = key; },
    reviewAdmit() { calls.push(['admit']); return { id: 'target' }; },
    reviewClusterAction(topicId, originSn, action) { calls.push(['cluster', originSn, action]); },
    reviewToggleIndependent(topicId, sn) { calls.push(['independent', sn]); },
    reviewSetIdentity(topicId, key, decision) { calls.push(['identity', key, decision]); },
    reviewExpand: async (topicId, opts) => { calls.push(['expand', opts]); return 2; },
    reviewOpenMark(topicId, sn, ordinal) { calls.push(['mark', sn, ordinal]); return { sn, sourceTitle: 'x', mark: { sourceId: sn } }; },
    comparisonMatrix: () => null,
    subscribe: () => () => {},
  };
  return { app, topic, calls };
};

test('mountResearchReview — mounts the Question Result with direct answer, ledger, sources, and admission', () => {
  const doc = makeFakeDoc();
  const host = makeEl('div', doc);
  const { app } = makeFakeApp();
  let closed = null;
  const handle = mountResearchReview(host, { app, topicId: 't1', onClose: (t) => { closed = t; } });
  assert.ok(findByText(host, 'QUESTION'), 'question header painted');
  assert.ok(findByText(host, 'Direct answer'), 'direct answer section painted');
  assert.ok(flatten(host).some((n) => String(n.textContent || '').startsWith('Claims in this result')), 'claim ledger painted');
  assert.equal(allByText(host, 'MTA report').length >= 1, true, 'a source card title painted');
  assert.ok(findByTextPrefix(host, '5 selected') || findByTextPrefix(host, '4 selected') || findByTextPrefix(host, '3 selected'), 'a footer selection count painted');
  const admit = flatten(host).find((n) => typeof n.textContent === 'string' && n.textContent.startsWith('Add ') && n.textContent.endsWith('selected sources'));
  assert.ok(admit);
  admit.fire('click');
  assert.deepEqual(closed, { id: 'target' });
  handle.destroy();
});

test('mountResearchReview — evidence expands inline on a verdict card', () => {
  const doc = makeFakeDoc();
  const host = makeEl('div', doc);
  const { app } = makeFakeApp();
  mountResearchReview(host, { app, topicId: 't1' });
  findByText(host, 'Show evidence').fire('click');
  assert.ok(findByText(host, 'SUPPORTING EVIDENCE'));
});

test('mountResearchReview — toggling a candidate checkbox calls reviewToggleExclude', () => {
  const doc = makeFakeDoc();
  const host = makeEl('div', doc);
  const { app, calls } = makeFakeApp();
  mountResearchReview(host, { app, topicId: 't1' });
  const checkbox = flatten(host).find((n) => n.tagName === 'INPUT' && n._attrs === n._attrs && n.type === 'checkbox');
  assert.ok(checkbox, 'at least one candidate checkbox rendered');
  checkbox.fire('change');
  assert.equal(calls.some((c) => c[0] === 'toggle'), true);
});

test('mountResearchReview — does not render retired recipe or waveform controls', () => {
  const doc = makeFakeDoc();
  const host = makeEl('div', doc);
  const { app } = makeFakeApp();
  mountResearchReview(host, { app, topicId: 't1' });
  assert.equal(!!findByText(host, 'Historical'), false);
  assert.equal(flatten(host).some((n) => (n.className || '').includes('eo-rr__bar--turn')), false);
});

