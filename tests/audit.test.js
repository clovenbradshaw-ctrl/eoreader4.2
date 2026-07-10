import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMetabolism, createScarcity, createSoma, createOrganism, createPopulation, createSanctionLadder, createHomeostat, buildAudit, auditToJSON, auditToMarkdown } from '../src/metabolism/index.js';

// The audit (metabolism/audit.js) makes the evolution FULLY AUDITABLE: the append-only record
// projected into one complete, inspectable, exportable artifact — and an honest evaluation of what
// the run did. These tests pin that it is COMPLETE (timeline + lineage), EVALUATIVE (findings +
// pathology flags), and PORTABLE (round-trips JSON, renders Markdown) — never a silent dump.

const drive = (regime = 'harsh', n = 60, outcome = {}) => {
  const scarcity = createScarcity({ regime, ration: 1000 });
  const m = createMetabolism({ scarcity, soma: createSoma({ maxOrgans: 10 }) });
  for (let i = 0; i < n; i++) m.metabolize({ warmedModel: m.allocation().modelGate < 0.55, grounded: 3, claimed: 4, coherence: 0.8, covered: 1, delivered: true, ...outcome });
  return m;
};

test('audit: the record is complete — a timeline per beat and the full lineage of edits', () => {
  const m = drive('harsh', 50);
  const a = buildAudit({ metabolism: m, meta: { at: '2026-07-10T00:00:00Z', regime: 'harsh', ration: 1000 } });
  assert.equal(a.kind, 'evolution-audit');
  assert.equal(a.timeline.length, 50, 'one timeline row per beat');
  assert.ok(a.summary.periods >= 50, 'the run length is recorded');
  assert.ok(Array.isArray(a.lineage), 'the lineage is carried whole');
  assert.ok(a.constitution && a.constitution.frozen.includes('fitness'), 'the audit records what could NOT evolve, too');
  assert.ok(a.summary.body && a.summary.body.founding >= 4, 'the body trajectory is captured');
});

test('audit: it EVALUATES — findings in plain words, and it flags the honesty of the fitness', () => {
  // no un-authored anchor → the audit must FLAG the run as provisional (self-reported), not hide it.
  const prov = buildAudit({ metabolism: drive('harsh', 40, {}) });
  assert.ok(prov.summary.flags.includes('provisional'), 'an unanchored run is flagged provisional — the Goodhart honesty carried through');
  assert.ok(prov.summary.findings.some((f) => /PROVISIONAL/.test(f)), 'and stated in plain words');
  // an anchored run (validated present) is NOT flagged provisional.
  const anch = buildAudit({ metabolism: drive('harsh', 40, { validated: 0.8 }) });
  assert.ok(!anch.summary.flags.includes('provisional'), 'an anchored run is not flagged provisional');
  assert.ok(anch.summary.findings.length >= 2, 'the evaluation always speaks — never an empty dump');
});

test('audit: the Claude challenges are recorded with grounded/flowing scores (judged vs sources)', () => {
  const m = drive('harsh', 20, { validated: 0.7 });
  const challenges = [
    { question: 'What happened at the reactor?', intent: 'the incident', difficulty: 'medium', answer: 'It reached criticality at noon.', sources: [{ title: 'Log', text: 'criticality at noon', url: 'x' }], satisfaction: { grounded: 0.9, flowing: 0.6, satisfied: 0.75, resolved: true, critique: 'tighten it' } },
  ];
  const a = buildAudit({ metabolism: m, challenges });
  assert.equal(a.challenges.length, 1);
  assert.equal(a.summary.challenges.meanGrounded, 0.9, 'the grounded score is aggregated');
  assert.ok(a.challenges[0].sources && a.challenges[0].sources.length === 1, 'the retrieved sources are recorded — grounding is auditable against them');
  assert.ok(a.summary.findings.some((f) => /Claude posed 1 challenge/.test(f)));
});

test('audit: the through-line is auditable — graduated sanctions, controlled deaths, homeostat, all captured', () => {
  // a metabolism whose ecology runs the ladder + homeostat under fierce scarcity.
  const scarcity = createScarcity({ regime: 'harsh', ration: 280 });
  const population = createPopulation({ scarcity, founder: createOrganism({ soma: createSoma({ maxOrgans: 11 }) }), size: 20, capacity: 24,
    sanction: createSanctionLadder(), homeostat: createHomeostat({ target: 0.12, band: 0.05 }) });
  const m = createMetabolism({ scarcity, population });
  for (let i = 0; i < 100; i++) m.metabolize({ warmedModel: false, grounded: 2, claimed: 3, covered: 1, delivered: true, validated: 0.7 });
  const a = buildAudit({ metabolism: m });
  assert.ok(a.summary.governance, 'the governance ledger is captured — selection is not silent');
  assert.ok(a.summary.governance.sanctions.n > 0, 'graduated sanctions are recorded');
  assert.ok(a.summary.governance.deaths.n > 0 && a.summary.governance.deaths.organsReleased >= 0, 'controlled deaths (with released organs) are recorded');
  assert.ok(a.governanceLedger.length > 0, 'the full ledger is exported for inspection');
  assert.ok(a.summary.findings.some((f) => /graduated, not binary/.test(f)), 'and stated in plain words in the findings');
  assert.ok(/selection \(graduated\)/.test(auditToMarkdown(a)), 'the Markdown carries the graduated-selection line');
});

test('audit: it is PORTABLE — round-trips JSON and renders a readable Markdown evaluation', () => {
  const a = buildAudit({ metabolism: drive('harsh', 30), meta: { at: 't', regime: 'harsh' } });
  const json = auditToJSON(a);
  const back = JSON.parse(json);
  assert.equal(back.timeline.length, a.timeline.length, 'the JSON export is complete and re-parses');
  const md = auditToMarkdown(a);
  assert.ok(/# Evolution audit/.test(md) && /## Findings/.test(md) && /## Timeline/.test(md), 'the Markdown carries the findings and the timeline — a report a human can judge');
});
