import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createResearchAnswerer } from '../src/metabolism/answerer.js';
import { runChallengeCycle } from '../src/metabolism/challenger.js';
import { buildAudit, auditToMarkdown } from '../src/metabolism/audit.js';
import { createMetabolism, createScarcity, createSoma } from '../src/metabolism/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';               // registers the deterministic, network-free 'echo' backend
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { admitWebSource } from '../src/organs/ingest/websource.js';

// The answerer (metabolism/answerer.js) is the thing the newest ask reaches for: an evolve turn must
// be, step for step, a REAL chat that triggers web search as needed — turn/runTurn plus the multi-hop
// research walk — NOT the echo stand-in that folded a challenge's own material back at it. These tests
// run the WHOLE turn pipeline for real; only the network is stubbed (admitWebSource yields the same
// parsed prose doc a live fetch would). They pin: web search fires, the answer grounds on the FETCHED
// pages, the retrieved TEXT rides back so grounding is judged against it, and the research trail is
// captured and flows — auditable — into the audit.

// A stubbed web: one on-topic prose page per query (distinct URL so hops accumulate sources; the same
// reactor body + the query's own terms so the walk stays on the leash and spawns leads). No network.
const stubSearch = async (query) => {
  const base = 'The reactor core reached criticality at noon. Operators vented steam and the temperature fell within the hour. No radiation was released beyond the site boundary.';
  const text = `${base} ${query} ${query}`;
  const slug = String(query).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'q';
  const { doc, record } = admitWebSource({ url: `https://example.test/${slug}`, title: `Reactor incident — ${query}`, text, retrieval_query: query, engine: 'web:test', fetched_at: 't' });
  return [{ item: { title: record.title, url: record.url }, doc, record }];
};

const model = createModel('echo');
const embedder = createHashEmbedder();

test('the answerer runs a REAL turn: web search fires and the answer grounds on the fetched pages', async () => {
  const auditLog = createAuditLog({ capacity: 64 });
  const answerer = createResearchAnswerer({ model, embedder, auditLog, search: stubSearch, maxHops: 2, k: 1 });
  const out = await answerer({ question: 'What happened when the reactor reached criticality?' });

  assert.equal(typeof out.answer, 'string', 'a rendered answer came back through the real pipeline');
  assert.ok(Array.isArray(out.sources) && out.sources.length >= 1, 'the retrieved pages ride back as sources');
  assert.ok(out.sources.every((s) => typeof s.text === 'string' && s.text.length), 'each source carries its TEXT — grounding is judged against what it fetched');
  assert.ok(out.sources.some((s) => /criticality/.test(s.text)), 'the source text is the real page body, not just a title');
  assert.ok(out.trail && Array.isArray(out.trail.hops) && out.trail.hops.length >= 1, 'the research trail (the hops) is captured');
  assert.ok(out.trail.sources.some((s) => /example\.test/.test(s.url || '')), 'the trail records the source URLs — the web research is auditable');
});

test('formulate is a seam and degrades: a failing query-formulator still seeds the walk with the question', async () => {
  const auditLog = createAuditLog({ capacity: 64 });
  const answerer = createResearchAnswerer({ model, embedder, auditLog, search: stubSearch, maxHops: 1, k: 1,
    formulate: async () => { throw new Error('no model available'); } });
  const out = await answerer('reactor criticality timeline');
  assert.equal(out.trail.seed, 'reactor criticality timeline', 'a formulate fault falls back to the question itself as the seed');
  assert.ok(out.sources.length >= 1, 'the walk still runs and grounds');
});

test('the answerer never needs the network wired to be safe — a dead search yields an honest empty answer', async () => {
  const auditLog = createAuditLog({ capacity: 64 });
  const deadSearch = async () => [];
  const answerer = createResearchAnswerer({ model, embedder, auditLog, search: deadSearch, maxHops: 2, k: 1 });
  const out = await answerer({ question: 'anything at all' });
  assert.equal(typeof out.answer, 'string');
  assert.deepEqual(out.sources, [], 'nothing fetched → no sources claimed (no fabrication)');
});

test('it plugs into runChallengeCycle, and the research trail flows into the audit as a FACT', async () => {
  const auditLog = createAuditLog({ capacity: 64 });
  const answerer = createResearchAnswerer({ model, embedder, auditLog, search: stubSearch, maxHops: 2, k: 1 });
  // a stub challenger: poses a fixed question and scores grounding against the SOURCES it is shown —
  // so this proves the retrieved pages reach the evaluator through the whole cycle.
  const challenger = {
    challenge: async () => ({ question: 'What happened at the reactor?', intent: 'the incident', difficulty: 'medium' }),
    evaluate: async ({ sources }) => ({ grounded: sources && sources.length ? 0.9 : 0.1, flowing: 0.6, satisfied: 0.75, resolved: true, critique: 'tighten it' }),
  };
  const r = await runChallengeCycle({ challenger, answerer });
  assert.ok(r && r.satisfaction && r.satisfaction.grounded === 0.9, 'the evaluator saw the fetched sources (grounding judged against them)');
  assert.ok(r.trail && r.trail.hops.length >= 1, 'the cycle carries the research trail through');

  const m = createMetabolism({ scarcity: createScarcity({ regime: 'harsh', ration: 500 }), soma: createSoma({ maxOrgans: 8 }) });
  for (let i = 0; i < 5; i++) m.metabolize({ grounded: 2, claimed: 3, covered: 1, delivered: true, validated: 0.75 });
  const a = buildAudit({ metabolism: m, challenges: [r] });
  assert.ok(a.summary.challenges.research && a.summary.challenges.research.sources >= 1, 'the audit aggregates the live sources fetched');
  assert.ok(a.challenges[0].trail && a.challenges[0].trail.sources.length >= 1, 'the per-challenge trail is exported for inspection');
  assert.ok(a.summary.findings.some((f) => /REAL web research/.test(f)), 'and it is stated in plain words in the findings');
  assert.ok(/Web research trail/.test(auditToMarkdown(a)), 'the Markdown lists the pages each answer grounded on');
});
