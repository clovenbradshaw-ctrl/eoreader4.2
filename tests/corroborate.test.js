import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runCorroborationWalk, runTurnWithCorroboration, isDistinctCorroborator,
  corroborationAnnouncement, corroborationSettled,
} from '../src/turn/corroborate.js';
import { proposeWebSearch, searchAnnouncement } from '../src/turn/propose.js';

// HOP UNTIL CORROBORATED, OR CONFIDENTLY SAY IT DOESN'T EXIST (turn/corroborate.js). When an answer
// is grounded but on a single meaningfully-distinct source, the walk goes to find an INDEPENDENT
// second voice — one that supports the answer and is not the first source wearing a different URL —
// hopping best-first until it finds one or exhausts the leads.

// A page factory: an admitted web doc on a given host, carrying the given body.
const page = (host, body, { title = host } = {}) =>
  ({ doc: { docId: `web-${host}`, text: body, web: { title, url: `https://${host}/x`, final_url: `https://${host}/x` } } });

const ANSWER = 'The regulator fined Zylbrook fifty thousand dollars for the breach.';
const QUESTION = 'how much was Zylbrook fined?';
const SUPPORTING = 'Zylbrook was fined fifty thousand dollars by the regulator after the breach.';

// ── The distinctness gate a fetched page passes through ───────────────────────
test('isDistinctCorroborator: a new publisher is distinct, a same-host page is not', () => {
  const witnesses = [{ id: 'docA', host: 'apnews.com', text: 'a b c' }];
  const other = { id: 'web-reuters.com', host: 'reuters.com', text: 'x y z' };
  const same = { id: 'web-apnews.com', host: 'apnews.com', text: 'p q r' };
  assert.equal(isDistinctCorroborator(other, witnesses), true);
  assert.equal(isDistinctCorroborator(same, witnesses), false);
});

// ── FOUND: the walk stops the moment an independent corroborator turns up ──────
test('the walk finds an independent second source and stops (corroborated)', async () => {
  const backing = [{ id: 'docA', host: 'zylbrook-official.com', text: SUPPORTING }];   // the one source behind the answer
  let searched = 0;
  const search = async (q) => { searched += 1; return [page('apnews.com', SUPPORTING)]; };
  const walk = await runCorroborationWalk('Zylbrook fine', {
    search, answer: ANSWER, question: QUESTION, backing, maxHops: 4,
  });
  assert.equal(walk.corroborated, true, 'an independent publisher corroborated the answer');
  assert.equal(walk.found.length, 1);
  assert.equal(walk.found[0].url, 'https://apnews.com/x');
  assert.ok(walk.hops.length >= 1);
  assert.ok(walk.hops[walk.hops.length - 1].corroborated);
});

test('a page that SUPPORTS but is the same publisher does not corroborate', async () => {
  const backing = [{ id: 'docA', host: 'apnews.com', text: SUPPORTING }];
  const search = async () => [page('apnews.com', SUPPORTING, { title: 'AP reprint' })];   // same host, supporting
  const walk = await runCorroborationWalk('Zylbrook fine', {
    search, answer: ANSWER, question: QUESTION, backing, maxHops: 3, dryPatience: 2,
  });
  assert.equal(walk.corroborated, false, 'the same voice cannot corroborate itself');
  assert.equal(walk.found.length, 0);
  assert.equal(walk.exhausted, true);
});

test('a page on a new host that does NOT support the answer is not counted', async () => {
  const backing = [{ id: 'docA', host: 'zylbrook-official.com', text: SUPPORTING }];
  const search = async () => [page('unrelated.com', 'A completely different story about migrating swallows.')];
  const walk = await runCorroborationWalk('Zylbrook fine', {
    search, answer: ANSWER, question: QUESTION, backing, maxHops: 3, dryPatience: 2,
  });
  assert.equal(walk.corroborated, false, 'an off-topic page is not a corroborator even from a new host');
  assert.equal(walk.exhausted, true);
});

// ── CONFIDENT ABSENCE: hops run dry, and the walk says so ─────────────────────
test('the walk gives up after dryPatience hops with no corroborator (confident absence)', async () => {
  const backing = [{ id: 'docA', host: 'zylbrook-official.com', text: SUPPORTING }];
  let hops = 0;
  // Every hop returns a supporting page — but always on the SAME already-counted host, so none is a
  // new voice. The dryPatience counter must end the walk instead of spinning to maxHops.
  const search = async () => { hops += 1; return [page('zylbrook-official.com', SUPPORTING, { title: `copy ${hops}` })]; };
  const walk = await runCorroborationWalk('Zylbrook fine', {
    search, answer: ANSWER, question: QUESTION, backing, maxHops: 20, dryPatience: 3,
  });
  assert.equal(walk.corroborated, false);
  assert.equal(walk.exhausted, true);
  assert.ok(walk.hops.length <= 4, `dryPatience ended it early, not at maxHops: ${walk.hops.length}`);
});

test('an aborted signal stops the walk before it fetches', async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  let fetched = 0;
  const search = async () => { fetched += 1; return [page('apnews.com', SUPPORTING)]; };
  const walk = await runCorroborationWalk('Zylbrook fine', {
    search, answer: ANSWER, question: QUESTION, backing: [{ id: 'docA', host: 'x.com', text: SUPPORTING }],
    signal: ctrl.signal,
  });
  assert.equal(fetched, 0, 'a pre-aborted walk never reaches the network');
  assert.equal(walk.hops.length, 0);
});

// ── The orchestrator: only under-corroborated turns walk; the answer is kept ──
const singleSourceTurn = {
  answer: ANSWER,
  reflection: {
    summary: { relations: 1, corroborated: 0, singleSource: 1, crossModal: 0, unwitnessed: 0, interpretation: 0, origins: 1 },
    eot: [{ kind: 'relation', status: 'single-source', origins: 1,
      sources: [{ docId: 'docA', text: SUPPORTING }] }],
  },
};

test('runTurnWithCorroboration walks an under-corroborated turn and attaches the outcome', async () => {
  const search = async () => [page('apnews.com', SUPPORTING)];
  const out = await runTurnWithCorroboration(
    { question: QUESTION, docs: [] }, singleSourceTurn,
    { search, enrich: { docA: { url: 'https://zylbrook-official.com/statement' } },
      formulate: async () => 'Zylbrook fine fifty thousand' },
  );
  assert.equal(out.answer, ANSWER, 'the answer is kept — corroboration confirms, it does not replace');
  assert.ok(out.corroboration);
  assert.equal(out.corroboration.sought, true);
  assert.equal(out.corroboration.corroborated, true);
  assert.equal(out.corroboration.verdict, 'corroborated');
  assert.equal(out.corroboration.sources[0].url, 'https://apnews.com/x');
});

test('runTurnWithCorroboration leaves a well-corroborated turn untouched (no walk)', async () => {
  const twoSourceTurn = {
    answer: ANSWER,
    reflection: {
      summary: { relations: 1, corroborated: 1, singleSource: 0, crossModal: 0, unwitnessed: 0, interpretation: 0, origins: 2 },
      eot: [{ kind: 'relation', status: 'corroborated', origins: 2,
        sources: [{ docId: 'docA', text: 'alpha beta' }, { docId: 'docB', text: 'gamma delta' }] }],
    },
  };
  let fetched = false;
  const search = async () => { fetched = true; return []; };
  const out = await runTurnWithCorroboration({ question: QUESTION }, twoSourceTurn,
    { search, enrich: { docA: { url: 'https://apnews.com/a' }, docB: { url: 'https://reuters.com/b' } } });
  assert.equal(fetched, false, 'two independent voices already — nothing to fetch');
  assert.equal(out.corroboration, undefined);
});

test('runTurnWithCorroboration reports a confident absence when no independent source is found', async () => {
  const search = async () => [page('zylbrook-official.com', SUPPORTING)];   // only ever the same voice
  const out = await runTurnWithCorroboration({ question: QUESTION }, singleSourceTurn,
    { search, enrich: { docA: { url: 'https://zylbrook-official.com/statement' } },
      formulate: async () => 'Zylbrook fine', maxHops: 5, });
  assert.equal(out.corroboration.corroborated, false);
  assert.equal(out.corroboration.verdict, 'uncorroborated');
  assert.equal(out.corroboration.sources.length, 0);
});

// ── The proposer trigger: opt-in via ctx.reflection, dominated by real gaps ───
test('proposeWebSearch: a single-source grounded answer proposes a CORROBORATE search', () => {
  const p = proposeWebSearch({
    route: 'grounded', task: 'answer', question: QUESTION,
    doc: { docId: 'docA' }, sources: [0], bound: [{ claim: ANSWER, citation: 's0' }], vetoes: [],
    reflection: singleSourceTurn.reflection,
  });
  assert.ok(p, 'an under-corroborated answer proposes');
  assert.equal(p.trigger, 'corroborate');
  assert.match(p.rationale, /single source/);
});

test('proposeWebSearch: no reflection → no corroborate proposal (byte-identical, opt-in)', () => {
  const p = proposeWebSearch({
    route: 'grounded', task: 'answer', question: QUESTION,
    doc: { docId: 'docA' }, sources: [0], bound: [{ claim: ANSWER, citation: 's0' }], vetoes: [],
  });
  assert.equal(p, null, 'a sound grounded answer with no reflection proposes nothing');
});

test('proposeWebSearch: a real gap dominates the corroborate trigger (void, not single-source)', () => {
  const p = proposeWebSearch({
    route: 'grounded', task: 'answer', question: QUESTION,
    voidMeasure: true, bound: [], vetoes: [], reflection: singleSourceTurn.reflection,
  });
  assert.equal(p.trigger, 'gap', 'a void is "no source", not "single source" — the gap wins');
});

test('the corroborate proposal announces in the first person', () => {
  const line = searchAnnouncement({ trigger: 'corroborate', query: 'Zylbrook fine', rationale: 'the answer rests on a single source' });
  assert.match(line, /rests on a single source/);
  assert.match(line, /independent/);
  assert.match(line, /Zylbrook fine/);
});

// ── The settled trail lines name both terminals ───────────────────────────────
test('corroborationAnnouncement and corroborationSettled speak both outcomes', () => {
  assert.match(corroborationAnnouncement('Zylbrook fine'), /single source/);
  assert.equal(corroborationAnnouncement(''), null);
  assert.match(corroborationSettled({ sought: true, corroborated: true, sources: [{ title: 'AP' }], hops: [{}] }), /Corroborated by an independent source — AP/);
  assert.match(corroborationSettled({ sought: true, corroborated: false, hops: [{}, {}, {}] }), /couldn't find an independent source/);
  assert.equal(corroborationSettled({ sought: false }), null);
  assert.equal(corroborationSettled(null), null);
});
