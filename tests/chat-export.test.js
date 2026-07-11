import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pairExchanges, toMarkdown, toJSON, buildChatExport, hasChat, FORMATS, searchedSites,
} from '../src/rooms/reader/chat-export.js';

// The chat + audit export — prove the two records fold into one document: the conversation
// (topic.messages) with the audit ring's per-turn trail nested under each exchange. The
// correlation is the crux — a question answered off the pipeline mints no audit turn, so the
// pairing must leave that exchange without a trail rather than misattributing a later one.

const topic = {
  id: 't1', title: 'Dolphins', created: '2026-07-10T00:00:00.000Z', memo: 'What the record says about cetaceans.',
  messages: [
    // 1) small talk before any source — short-circuits, NO audit turn
    { id: 'm1', role: 'user', text: 'hi there', at: '2026-07-10T00:00:01.000Z' },
    { id: 'm2', role: 'assistant', text: 'Hello — record something and ask.', route: 'smalltalk' },
    // 2) a grounded question — HAS an audit turn
    { id: 'm3', role: 'user', text: 'Are dolphins intelligent?', at: '2026-07-10T00:01:00.000Z' },
    {
      id: 'm4', role: 'assistant', text: 'Yes — they recognize themselves in a mirror [s1].',
      route: 'grounded', grounding: 'auto', grounded: true,
      cites: [
        { idx: 1, docId: 'doc-a', sn: 'S1', reg: 'S-0001', title: 'Cetacean cognition', text: 'Dolphins recognize themselves in a mirror.' },
        { idx: 1, docId: 'doc-a', sn: 'S1', reg: 'S-0001', title: 'Cetacean cognition', text: 'dup should dedupe' },
      ],
      flags: [{ id: 'low-coverage' }],
    },
  ],
};

const turns = [
  {
    schema: 'eo-audit/1', id: 't42', question: 'Are dolphins intelligent?',
    startedAt: 1000, finishedAt: 2200, durationMs: 1200,
    route: 'grounded', grounding: 'auto', gated: false,
    model: { backend: 'claude', kind: 'remote', model: 'claude-opus-4-8', label: 'Claude · hosted API (Anthropic)' },
    steps: [
      { name: 'route', t: 0, data: { route: 'grounded' } },
      { name: 'retrieve', t: 120, data: { count: 3 } },
      { name: 'llm', t: 800, data: {} },
      { name: 'veto', t: 1150, data: { refuses: 0 } },
    ],
    reading: {
      spans: [{ idx: 0, via: 'lexical', score: 0.82, text: 'Dolphins recognize themselves in a mirror.' }],
      note: 'the mirror self-recognition passage', surf: { anchor: 0, peak: 1, stops: [] },
      llm: { system: 'SYSTEM BRIEF', user: 'USER BRIEF' },
    },
    prompt: 'GROUNDED PROMPT with a ``` fence inside it', rawOutput: 'RAW OUTPUT [s1]',
    bound: [{ claim: 'dolphins recognize themselves in a mirror', citation: '[s1]', score: 0.91 }],
    vetoes: [], flags: [], answer: 'Yes — they recognize themselves in a mirror [s1].',
    sources: [1], revisions: null,
  },
];

const sources = [{ sn: 'S1', reg: 'S-0001', title: 'Cetacean cognition' }];

test('pairExchanges: pairs user→assistant and matches audit turns by question, leaving gaps unmatched', () => {
  const ex = pairExchanges(topic, turns);
  assert.equal(ex.length, 2, 'two exchanges');
  assert.equal(ex[0].user.text, 'hi there');
  assert.equal(ex[0].assistant.text, 'Hello — record something and ask.');
  assert.equal(ex[0].audit, null, 'the off-pipeline turn carries no audit trail');
  assert.equal(ex[1].user.text, 'Are dolphins intelligent?');
  assert.ok(ex[1].audit, 'the grounded turn is matched to its audit record');
  assert.equal(ex[1].audit.id, 't42');
});

test('pairExchanges: a forward cursor keeps repeated questions in order', () => {
  const repTopic = { messages: [
    { role: 'user', text: 'again?' }, { role: 'assistant', text: 'first' },
    { role: 'user', text: 'again?' }, { role: 'assistant', text: 'second' },
  ] };
  const repTurns = [
    { id: 'a', question: 'again?', steps: [] },
    { id: 'b', question: 'again?', steps: [] },
  ];
  const ex = pairExchanges(repTopic, repTurns);
  assert.equal(ex[0].audit.id, 'a');
  assert.equal(ex[1].audit.id, 'b', 'the second identical question consumes the second turn, not the first again');
});

test('toMarkdown: the conversation reads through with the audit folded under each turn', () => {
  const md = toMarkdown({ topic, turns, sources });
  // conversation
  assert.match(md, /# Dolphins/);
  assert.match(md, /## Memo/);
  assert.match(md, /What the record says about cetaceans\./);
  assert.match(md, /hi there/);
  assert.match(md, /Are dolphins intelligent\?/);
  assert.match(md, /recognize themselves in a mirror/);
  // grounded-in line, deduped to one source
  assert.match(md, /\*\*Grounded in:\*\* S-0001 \(Cetacean cognition\)/);
  assert.equal((md.match(/Cetacean cognition/g) || []).length >= 1, true);
  // the audit trail
  assert.match(md, /Audit trail — 4 stages/);
  assert.match(md, /\*\*route:\*\* grounded/);
  assert.match(md, /`retrieve`/);
  assert.match(md, /The prompt the model was handed/);
  assert.match(md, /RAW OUTPUT \[s1\]/);
  assert.match(md, /Bound claims/);
  assert.match(md, /\*\*Cited spans:\*\* 1/);
  // the off-pipeline exchange says so plainly
  assert.match(md, /Audit trail — none retained/);
});

test('toMarkdown: a prompt containing a triple-backtick fence cannot break out of its block', () => {
  const md = toMarkdown({ topic, turns, sources });
  // the guard picks a longer fence; the inner ``` survives verbatim inside it
  assert.match(md, /````[\s\S]*GROUNDED PROMPT with a ``` fence inside it[\s\S]*````/);
});

test('toJSON: a structured chat with each exchange paired to its cleaned audit turn', () => {
  const parsed = JSON.parse(toJSON({ topic, turns, sources }));
  assert.equal(parsed.schema, 'eo-chat-export/1');
  assert.equal(parsed.topic.title, 'Dolphins');
  assert.equal(parsed.counts.exchanges, 2);
  assert.equal(parsed.counts.audited, 1);
  assert.equal(parsed.exchanges[0].audit, null);
  assert.equal(parsed.exchanges[1].question, 'Are dolphins intelligent?');
  assert.equal(parsed.exchanges[1].audit.prompt, 'GROUNDED PROMPT with a ``` fence inside it');
  assert.equal(parsed.exchanges[1].answer.cites.length, 1, 'cites are deduped');
  assert.equal(parsed.exchanges[1].answer.grounded, true);
});

test('buildChatExport: returns a downloadable descriptor, guards unknown formats and empty chats', () => {
  const md = buildChatExport({ topic, turns, sources }, 'md', 'Dolphins / notes');
  assert.equal(md.ext, 'md');
  assert.equal(md.mime, 'text/markdown;charset=utf-8');
  assert.equal(md.filename, 'Dolphins_notes.md', 'the base name is sanitised for a filename');
  assert.ok(md.text.length > 0);

  const json = buildChatExport({ topic, turns, sources }, 'json', 'Dolphins');
  assert.equal(json.ext, 'json');
  assert.doesNotThrow(() => JSON.parse(json.text));

  assert.equal(buildChatExport({ topic, turns, sources }, 'nope'), null, 'unknown format → null');
  assert.equal(buildChatExport({ topic: { messages: [] } }, 'md'), null, 'empty chat → null');
  assert.equal(hasChat({ messages: [] }), false);
  assert.equal(hasChat(topic), true);
});

test('FORMATS: the menu is the two combined formats', () => {
  assert.deepEqual(FORMATS.map((f) => f.id), ['md', 'json']);
  for (const f of FORMATS) assert.equal(typeof f.build, 'function');
});

// ── provenance — "what produced this" ──────────────────────────────────────────────────────────
// The audit is a receipt; a receipt has to say who signed it. These pin that the export names its
// producer: the app + the exact published build, the latest build on GitHub, and the model(s) that
// answered — in the Markdown Produced-by block, folded into each turn's trail, and in the JSON twin.

const provenance = {
  app: 'EO Reader', version: '4.2',
  repo: 'clovenbradshaw-ctrl/eoreader4.2',
  repoUrl: 'https://github.com/clovenbradshaw-ctrl/eoreader4.2',
  siteUrl: 'https://clovenbradshaw-ctrl.github.io/eoreader4.2/',
  build: { commit: 'a1b2c3d4e5f6a7b8', shortCommit: 'a1b2c3d', ref: 'main', builtAt: '2026-07-10T00:00:00.000Z' },
  latest: { commit: 'a1b2c3d4e5f6a7b8', shortCommit: 'a1b2c3d', url: 'https://github.com/clovenbradshaw-ctrl/eoreader4.2/commit/a1b2c3d4e5f6a7b8', message: 'ship the provenance seam' },
  freshness: 'current',
  freshnessNote: 'This export was produced by the current published build.',
  model: { backend: 'claude', kind: 'remote', model: 'claude-opus-4-8', label: 'Claude · hosted API (Anthropic)' },
  models: [{ backend: 'claude', kind: 'remote', model: 'claude-opus-4-8', label: 'Claude · hosted API (Anthropic)' }],
  exportedAt: '2026-07-10T12:00:00.000Z',
};

test('toMarkdown: the Produced-by block names the app, the build, the latest on GitHub, and the model', () => {
  const md = toMarkdown({ topic, turns, sources, provenance });
  assert.match(md, /## Produced by/);
  assert.match(md, /\*\*App:\*\* EO Reader 4\.2/);
  // the exact build, linked to its commit, marked current
  assert.match(md, /\*\*Build:\*\* \[`a1b2c3d`\]\(https:\/\/github\.com\/clovenbradshaw-ctrl\/eoreader4\.2\/commit\/a1b2c3d4e5f6a7b8\)/);
  assert.match(md, /\*\*current\*\*/);
  // the latest published build, "if accessible"
  assert.match(md, /\*\*Latest on GitHub:\*\* \[`a1b2c3d`\]/);
  // the model that produced the answer — the whole point
  assert.match(md, /\*\*Model:\*\* \*\*claude-opus-4-8 — Claude · hosted API \(Anthropic\) · hosted\*\*/);
  // and one plain, unmissable sentence
  assert.match(md, /> \*\*Produced by EO Reader 4\.2 — answers generated by claude-opus-4-8/);
  assert.match(md, /current published build/);
});

test('toMarkdown: each turn folds in the model that produced it', () => {
  const md = toMarkdown({ topic, turns, sources, provenance });
  assert.match(md, /- \*\*model:\*\* claude-opus-4-8 — Claude · hosted API \(Anthropic\) · hosted/);
});

test('toMarkdown: with no provenance it still names the app and the model the turn recorded', () => {
  const md = toMarkdown({ topic, turns, sources });
  assert.match(md, /## Produced by/);
  assert.match(md, /\*\*App:\*\* EO Reader 4\.2/);
  // unstamped local run — honest about not being the published build
  assert.match(md, /\*\*Build:\*\* _unstamped/);
  // the model still comes through, read off the turn's own record
  assert.match(md, /\*\*Model:\*\* \*\*claude-opus-4-8/);
});

test('toMarkdown: a conversation with no recorded model says so plainly, never silently', () => {
  const bare = [{ ...turns[0], model: null }];
  const md = toMarkdown({ topic, turns: bare, sources });
  assert.match(md, /\*\*Model:\*\* _not recorded/);
});

test('toJSON: carries the provenance bundle and each turn its model', () => {
  const parsed = JSON.parse(toJSON({ topic, turns, sources, provenance }));
  assert.ok(parsed.provenance, 'the provenance bundle rides in the machine-readable export');
  assert.equal(parsed.provenance.app, 'EO Reader');
  assert.equal(parsed.provenance.build.shortCommit, 'a1b2c3d');
  assert.equal(parsed.provenance.freshness, 'current');
  // models is the distinct set actually used across the conversation, read off the turns
  assert.equal(parsed.provenance.models.length, 1);
  assert.equal(parsed.provenance.models[0].model, 'claude-opus-4-8');
  // and each turn keeps its own producer
  assert.equal(parsed.exchanges[1].audit.model.model, 'claude-opus-4-8');
});

test('buildChatExport: threads a provenance bundle through to the rendered file', () => {
  const md = buildChatExport({ topic, turns, sources, provenance }, 'md', 'Dolphins');
  assert.match(md.text, /## Produced by/);
  assert.match(md.text, /claude-opus-4-8/);
});

// ── the websites it searched, as hyperlinks (not content) ────────────────────────
// A grounded web turn records what pages it went to in its research trail (each "Read N sources"
// beat carries {title, url}). The export must surface those as LINKS — where it looked — without
// dumping the page text. A turn answered from the record alone searched nothing and prints no line.

const webAnswer = {
  role: 'assistant', text: 'Ryan Coogler directed it [s1].', route: 'grounded',
  research: { steps: [
    { kind: 'search', text: 'Searching the web for “who directed Sinners”' },   // a query beat — no page, no url
    { kind: 'read', text: 'Read 2 sources', sources: [
      { docId: 'd1', title: 'Ryan Coogler — Wikipedia', url: 'https://en.wikipedia.org/wiki/Ryan_Coogler' },
      { docId: 'd2', title: 'Sinners (2025 film)', url: 'https://en.wikipedia.org/wiki/Sinners_(2025_film)' },
    ] },
    { kind: 'read', text: 'Read 1 source', sources: [
      { docId: 'd1', title: 'Ryan Coogler — Wikipedia', url: 'https://en.wikipedia.org/wiki/Ryan_Coogler' },  // dup URL
      { docId: 'd3', title: 'A page that came back without a URL', url: '' },   // nothing to link to — dropped
    ] },
  ] },
};

test('searchedSites: pulls the searched pages off the research trail, deduped by URL, url-less dropped', () => {
  const sites = searchedSites(webAnswer);
  assert.deepEqual(sites, [
    { url: 'https://en.wikipedia.org/wiki/Ryan_Coogler', title: 'Ryan Coogler — Wikipedia' },
    { url: 'https://en.wikipedia.org/wiki/Sinners_(2025_film)', title: 'Sinners (2025 film)' },
  ]);
  assert.deepEqual(searchedSites({ role: 'assistant', text: 'from the record' }), [], 'no trail → no sites');
});

test('toMarkdown renders searched sites as hyperlinks (parens encoded), never the page content', () => {
  const t = { id: 't', title: 'Sinners', created: '2026-07-10T00:00:00.000Z', messages: [
    { id: 'u', role: 'user', text: 'Who directed Sinners?', at: '2026-07-10T00:00:01.000Z' },
    webAnswer,
  ] };
  const md = toMarkdown({ topic: t, turns: [], sources: [], provenance: null });
  assert.ok(md.includes('**Searched the web** (2 sites):'), 'a Searched-the-web heading with the count');
  assert.ok(md.includes('- [Ryan Coogler — Wikipedia](https://en.wikipedia.org/wiki/Ryan_Coogler)'), 'a plain link');
  assert.ok(md.includes('- [Sinners (2025 film)](https://en.wikipedia.org/wiki/Sinners_%282025_film%29)'),
    'a URL with parens is percent-encoded so the link never breaks');
  assert.equal((md.match(/en\.wikipedia\.org\/wiki\/Ryan_Coogler\)/g) || []).length, 1, 'the duplicate URL is listed once');
});

test('toMarkdown omits the Searched line for a turn that did no web walk', () => {
  const t = { id: 't', title: 'x', messages: [
    { role: 'user', text: 'q' },
    { role: 'assistant', text: 'answered from the record alone' },
  ] };
  assert.doesNotMatch(toMarkdown({ topic: t, turns: [], sources: [] }), /Searched the web/);
});

test('toJSON carries searched[] of {url,title} per answer — [] when the turn searched nothing', () => {
  const t = { id: 't', title: 'x', messages: [
    { role: 'user', text: 'q1' }, webAnswer,
    { role: 'user', text: 'q2' }, { role: 'assistant', text: 'from the record' },
  ] };
  const out = JSON.parse(toJSON({ topic: t, turns: [], sources: [] }));
  assert.deepEqual(out.exchanges[0].answer.searched.map((s) => s.url), [
    'https://en.wikipedia.org/wiki/Ryan_Coogler', 'https://en.wikipedia.org/wiki/Sinners_(2025_film)',
  ]);
  assert.deepEqual(out.exchanges[1].answer.searched, [], 'a record-only answer searched nothing');
});
