import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runGroundedResearch, disproofQueries } from '../src/rooms/research/driver.js';
import { projectReport } from '../src/rooms/research/project.js';
import { renderReportFragment } from '../src/rooms/research/render.js';
import { formatChatReply } from '../src/rooms/research/session.js';
import { liveView } from '../src/rooms/research/live.js';
import {
  openResearch, searchProbe, pinSource, extractProposition, evaTest,
  recFrame, promoteProposition, SEARCH_STANCES,
} from '../src/rooms/research/events.js';

// "Going and looking" — the connected loop the surface reads as three numbers:
//   1. how many of the searches went looking to prove the story WRONG (disprove);
//   2. the stopping rule you can watch — per-document information gain, and how
//      many quiet documents from a stop;
//   3. which earlier answers a mid-run reframing has left needing a re-check.
// All three are pure folds of the log. These lock the folds and prove the offline
// path (no search injected) is untouched — no search events, no via on pins.

// ── The disproof stance is a real fraction of the searches ────────────────────

// A fake web: every query returns one on-topic page (so it binds and grounds).
// A DISPROVE query — the driver appends adversarial cues to the subject — comes
// back as counter-evidence; a CONFIRM query as supporting material. Each page
// embeds its own query text so pages stay distinct (dedup keeps them all).
const DISPROVE_CUE = /criticism|controvers|lawsuit|legal|complaint|rejected|suspended|cancelled|debunked|disputed|contradict|failed|evidence|overstated|opposition|concern|denied|investigation|violation|misconduct|reversed|overturned|withdrawn/i;
const fakeSearch = async (query, { k = 4 } = {}) => {
  const q = String(query);
  const slug = q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const body = DISPROVE_CUE.test(q)
    ? `Surveillance cameras faced a lawsuit over ${q}. A court rejected the surveillance camera program as unlawful in ${slug}. Critics say surveillance cameras failed to reduce crime regarding ${q}.`
    : `Surveillance cameras are deployed widely for ${q}. Surveillance cameras record public spaces across the city under ${q}. Surveillance cameras expanded rapidly in policing about ${q}.`;
  return [{ url: `https://example.test/${slug}`, title: q, text: body }];
};

const runWithSearch = (extra = {}) => runGroundedResearch('surveillance cameras', {
  targetSources: 5, strategy: 'breadth', search: fakeSearch, save: false, now: () => 0, ...extra,
});

test('disproofQueries pairs the subject with adversarial cues, capped at n', () => {
  const qs = disproofQueries('the drone program', 3);
  assert.equal(qs.length, 3);
  assert.ok(qs.every((q) => q.startsWith('the drone program ')));
  assert.ok(qs.some((q) => DISPROVE_CUE.test(q)), 'the cues read as falsification, not confirmation');
  assert.equal(disproofQueries('', 3).length, 0, 'no anchor → no disproof search');
  assert.equal(disproofQueries('x', 0).length, 0);
});

test('a real gather logs searches with a confirm/disprove stance, and disprove is a genuine share', async () => {
  const { log, report } = await runWithSearch();

  const searches = log.filter((e) => e.kind === 'search');
  assert.ok(searches.length >= 3, 'the gather issued several searches');
  assert.ok(searches.every((s) => SEARCH_STANCES.includes(s.stance)));

  const a = report.searchAudit;
  assert.equal(a.total, searches.length);
  assert.ok(a.disprove >= 2, 'at least the seeded falsification searches ran');
  assert.ok(a.confirm >= 1, 'and confirm searches too — this is not a search for agreement alone');
  assert.equal(a.confirm + a.disprove, a.total);
  assert.ok(a.disproveFound >= 1, 'a disprove search that turned up a document is the dangerous kind');

  // The loop the surface reads: "N of M trying to disprove it".
  assert.equal(report.loop.disprove, a.disprove);
  assert.equal(report.loop.searchTotal, a.total);
});

test('a source a disprove search found is traceable — via on the pin, fromDisprove on its claims', async () => {
  const { log, report } = await runWithSearch();

  const disprovePins = log.filter((e) => e.kind === 'pin' && e.via?.stance === 'disprove');
  assert.ok(disprovePins.length >= 1, 'a disprove search pinned at least one source, tagged with its stance');
  assert.ok(disprovePins.every((p) => typeof p.via.query === 'string' && p.via.query.length > 0));

  const disproveProps = report.propositions.filter((p) => p.fromDisprove);
  assert.ok(disproveProps.length >= 1, 'claims from those sources carry the disprove lineage');
  assert.ok(disproveProps.every((p) => disprovePins.some((pin) => pin.id === p.pinId)));
});

test('documents: kept + set-aside partitions every pinned source; thrown are the unpinned', async () => {
  const { report } = await runWithSearch();
  const d = report.documents;
  assert.equal(d.pinned, report.pins.length);
  assert.equal(d.kept + d.setAside, d.pinned, 'a pinned source either kept (a claim landed) or was set aside');
  assert.ok(d.kept >= 1);
  assert.ok(d.thrown >= 0, 'thrown are fetched-but-never-pinned — a separate bucket');
});

test('the stopping rule is watchable: per-document gain, and a countdown to the stop', async () => {
  const { report } = await runWithSearch();
  const s = report.stopRule;
  assert.ok(Array.isArray(s.docGains) && s.docGains.length >= 1, 'each read document reports how much it moved the picture');
  assert.ok(s.docGains.every((g) => typeof g.gain === 'number' && typeof g.quiet === 'boolean'));
  assert.ok(s.docGains.every((g) => (report.pins.some((p) => p.id === g.pinId))), 'a gain row names a real pinned source');
  assert.equal(s.quietNeeded, 2);
  assert.ok(s.willStopIn >= 0 && s.willStopIn <= s.quietNeeded);
  assert.equal(s.willStopIn, Math.max(0, s.quietNeeded - s.quietTail));
});

// ── The offline path is untouched — no search injected, nothing new appears ───

test('no search injected → no search events, and every pin has via:null', async () => {
  const source = {
    title: 'Cameras', text:
      'Surveillance cameras are deployed across the city for public safety. '
      + 'Surveillance cameras record public spaces and feed a monitoring centre.',
  };
  const { log, report } = await runGroundedResearch('surveillance cameras', { sources: [source], save: false, now: () => 0 });
  assert.equal(log.filter((e) => e.kind === 'search').length, 0, 'the disprove loop only fires when there is a web to search');
  assert.ok(log.filter((e) => e.kind === 'pin').every((p) => p.via === null));
  assert.equal(report.searchAudit.total, 0);
  assert.equal(report.searchAudit.disprove, 0);
  assert.equal(report.storyChanges.length, 0);
  assert.equal(report.recheck.length, 0);
  assert.equal(report.loop.storyChanged, false);
});

// ── The story-change and the re-check — deterministic, over a hand-built log ──

// A minimal log: an early answer read from a CONFIRM source, then a DISPROVE
// source whose claim forces the frame to reframe. The reframing is "the story
// changed"; the early answer, read under the old reading, now needs re-checking.
const storyChangeLog = () => [
  openResearch({ id: 'root', question: 'did the rule cover it?', subject: ['rule', 'cover'], t: 0 }),
  searchProbe({ id: 'search:0', frameId: 'root', query: 'rule cover', stance: 'confirm', found: 1, kept: 1, t: 1 }),
  searchProbe({ id: 'search:1', frameId: 'root', query: 'rule cover lawsuit rejected', stance: 'disprove', found: 1, kept: 1, t: 2 }),
  pinSource({ id: 'pin:0', title: 'Policy', contentHash: 'aaa', via: { query: 'rule cover', stance: 'confirm' }, t: 3 }),
  pinSource({ id: 'pin:1', title: 'Legal opinion', contentHash: 'bbb', via: { query: 'rule cover lawsuit rejected', stance: 'disprove' }, t: 4 }),
  extractProposition({ id: 'prop:0', frameId: 'root', pinId: 'pin:0', span: { start: 0, end: 40, text: 'The rule was written to cover the program.' }, terms: ['rule', 'cover', 'program'], t: 5 }),
  evaTest({ propId: 'prop:0', frameId: 'root', verdict: 'confirm', surprise: 0.2, strainDelta: 0, strain: 0, t: 6 }),
  promoteProposition({ propId: 'prop:0', frameId: 'root', t: 7 }),
  extractProposition({ id: 'prop:1', frameId: 'root', pinId: 'pin:1', span: { start: 0, end: 50, text: 'The rule never reached the ingestion of outside feeds.' }, terms: ['rule', 'ingestion', 'feeds'], t: 8 }),
  evaTest({ propId: 'prop:1', frameId: 'root', verdict: 'strain', surprise: 3.0, strainDelta: 2.0, strain: 2.0, t: 9 }),
  recFrame({ frameId: 'root', forcedBy: ['prop:1'], strainSum: 2.0, from: ['rule', 'cover'], to: ['ingestion', 'feeds'], t: 10 }),
  promoteProposition({ propId: 'prop:1', frameId: 'root', t: 11 }),
];

test('a reframing forced by a disprove-found source is reported as the story changing', () => {
  const report = projectReport(storyChangeLog());
  assert.equal(report.storyChanges.length, 1, 'exactly the one reframe a disprove source forced');
  const sc = report.storyChanges[0];
  assert.equal(sc.propId, 'prop:1');
  assert.equal(sc.pinId, 'pin:1');
  assert.deepEqual(sc.to, ['ingestion', 'feeds']);
  assert.equal(report.loop.storyChanged, true);

  // The disprove lineage is on the proposition that forced it, not the other one.
  const byId = Object.fromEntries(report.propositions.map((p) => [p.id, p]));
  assert.equal(byId['prop:1'].fromDisprove, true);
  assert.equal(byId['prop:0'].fromDisprove, false);
});

test('an earlier answer read before a reframing is flagged for re-checking', () => {
  const report = projectReport(storyChangeLog());
  assert.deepEqual(report.recheck, ['prop:0'], 'the pre-reframe answer needs re-checking');
  assert.equal(report.loop.recheck, 1);

  const byId = Object.fromEntries(report.propositions.map((p) => [p.id, p]));
  assert.equal(byId['prop:0'].staleAfterRec, true, 'read under a reading since reframed');
  assert.equal(byId['prop:1'].staleAfterRec, false, 'the reframe itself is not stale — it IS the new reading');
});

test('re-projecting the loop is byte-stable', () => {
  const log = storyChangeLog();
  assert.deepEqual(projectReport(log), projectReport(log));
});

// ── The loop reaches the surfaces — report, chat reply, live panel ────────────

test('the report states the audit, the story-change, and the answers to re-check', () => {
  const html = renderReportFragment(projectReport(storyChangeLog()));
  assert.match(html, /1 of 2 searches tried to disprove it/, 'the header carries the disprove audit');
  assert.match(html, /How the search went/);
  assert.match(html, /went looking to prove the story wrong/);
  assert.match(html, /This changed the story/, 'the disprove-forced reframe is called out');
  assert.match(html, /ingestion, feeds/, 'and names what the topic reframed to');
  assert.match(html, /Earlier answers to re-check/);
  assert.match(html, /re-check<\/span>/, 'the stale claim is flagged inline');
});

test('the chat reply audits the search, not just the answer', () => {
  const reply = formatChatReply(projectReport(storyChangeLog()), 'root');
  assert.match(reply, /went looking to be wrong/i);
  assert.match(reply, /changed the story/i);
  assert.match(reply, /re-check/i);
});

test('the live panel surfaces the gap (state A) and the audit (state B)', () => {
  // Nothing grounded yet — the gap is the door.
  const opening = liveView([openResearch({ id: 'root', question: 'who consents to a private feed?', subject: ['consent'], t: 0 })]);
  assert.ok(opening.gap, 'an opened frame with nothing grounded shows the gap');
  assert.equal(opening.gap.question, 'who consents to a private feed?');

  // Mid/after a run — the audit strip reads the loop.
  const v = liveView(storyChangeLog());
  assert.equal(v.gap, null, 'grounded propositions close the gap');
  assert.equal(v.searchAudit.disprove, 1);
  assert.equal(v.searchAudit.total, 2);
  assert.equal(v.storyChanges.length, 1);
  assert.equal(v.recheck, 1);
  assert.equal(v.documents.kept, 2);
});
