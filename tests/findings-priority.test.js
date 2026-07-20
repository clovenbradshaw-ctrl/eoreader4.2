import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installFindings } from '../src/rooms/reader/app/findings.js';

// FINDINGS PRIORITIZATION — a report's OWN "General Findings"/"Recommendations" section should
// outrank whatever the claim miner happened to mint most recently. Before this fix, findings()
// kept only claims.slice(-24) in raw mint order, so a report's headline findings — minted early,
// from the source's own topline — could be pushed out of the cap by later, incidental claims.

const headingSpan = (text, level) => ({ kind: 'heading', level, text });
const paraSpan = (text) => ({ kind: 'paragraph', level: null, text });

const baseAppCtx = (src, doc) => ({
  topic: () => ({ id: 't1', messages: [] }),
  topicSources: () => [src],
  docFor: () => doc,
  topicDocs: () => [doc],
  state: { summaries: { entities: {} } },
});

test('findings: a claim under "General Findings" survives the 24-cap ahead of later incidental claims', () => {
  const spans = [
    headingSpan('Overview', 1),
    ...Array.from({ length: 5 }, (_, i) => paraSpan(`overview sentence ${i}`)),      // units 1-5
    headingSpan('General Findings', 2),                                              // unit 6
    paraSpan('The Commission found four systemic failures: imagination, policy, capabilities, management.'), // unit 7
    headingSpan('Other Section', 2),                                                 // unit 8
    ...Array.from({ length: 30 }, (_, i) => paraSpan(`incidental sentence ${i}`)),    // units 9..38
  ];
  const sentences = spans.map((s) => s.text);
  const doc = { sentences, spans };

  const findingsObj = {
    key: 'claim:0', type: 'claim', standing: 'witnessed', cite: [7],
    fields: { subject: 'The Commission', value: 'four systemic failures', polarity: '+' },
  };
  // 25 ordinary claims, minted AFTER the findings claim in the topline's own object order —
  // mirrors the observed bug where sheer recency buried the report's own findings section.
  const ordinaryObjs = Array.from({ length: 25 }, (_, i) => ({
    key: `claim:${i + 1}`, type: 'claim', standing: 'stated', cite: [9 + i],
    fields: { subject: `Thing${i}`, value: `incidental value ${i}`, polarity: '+' },
  }));

  const src = { sn: 'S1', reg: 'S-0001', docId: 'dA', title: 'Report', summary: { objects: [findingsObj, ...ordinaryObjs] } };
  const appCtx = baseAppCtx(src, doc);
  installFindings(appCtx);
  const f = appCtx.findings();

  assert.equal(f.claims.length, 24, 'still capped at 24');
  assert.ok(f.claims.some((c) => c.unit === 7), 'the General Findings claim survives the cap');
  assert.equal(f.stats.claims, 26, 'the full 26-claim count is still reported honestly (nothing hidden from the stat)');
});

test('findings: with no headings at all, the cap keeps the most recent claims exactly as before', () => {
  const sentences = Array.from({ length: 30 }, (_, i) => `sentence ${i}`);
  const doc = { sentences, spans: sentences.map((text) => paraSpan(text)) };
  const objs = Array.from({ length: 26 }, (_, i) => ({
    key: `claim:${i}`, type: 'claim', standing: 'stated', cite: [i],
    fields: { subject: `Thing${i}`, value: `value ${i}`, polarity: '+' },
  }));
  const src = { sn: 'S1', reg: 'S-0001', docId: 'dA', title: 'Report', summary: { objects: objs } };
  const appCtx = baseAppCtx(src, doc);
  installFindings(appCtx);
  const f = appCtx.findings();

  assert.equal(f.claims.length, 24);
  // The first two minted claims (unit 0, unit 1) are the ones bumped by the cap — unchanged behaviour.
  assert.ok(!f.claims.some((c) => c.unit === 0));
  assert.ok(!f.claims.some((c) => c.unit === 1));
  assert.ok(f.claims.some((c) => c.unit === 25), 'the most recent claim is kept');
});

test('findings: a Recommendations section is boosted the same way as Findings', () => {
  const spans = [
    headingSpan('Recommendations', 1),
    paraSpan('Establish a National Counterterrorism Center to unify effort across agencies.'),   // unit 1
    headingSpan('Appendix', 1),
    ...Array.from({ length: 30 }, (_, i) => paraSpan(`appendix line ${i}`)),                      // units 3..32
  ];
  const sentences = spans.map((s) => s.text);
  const doc = { sentences, spans };
  const recObj = {
    key: 'claim:0', type: 'claim', standing: 'witnessed', cite: [1],
    fields: { subject: 'The Commission', value: 'a National Counterterrorism Center', polarity: '+' },
  };
  const ordinaryObjs = Array.from({ length: 25 }, (_, i) => ({
    key: `claim:${i + 1}`, type: 'claim', standing: 'stated', cite: [3 + i],
    fields: { subject: `Line${i}`, value: `appendix value ${i}`, polarity: '+' },
  }));
  const src = { sn: 'S1', reg: 'S-0001', docId: 'dA', title: 'Report', summary: { objects: [recObj, ...ordinaryObjs] } };
  const appCtx = baseAppCtx(src, doc);
  installFindings(appCtx);
  const f = appCtx.findings();
  assert.ok(f.claims.some((c) => c.unit === 1), 'the Recommendations claim survives the cap');
});
