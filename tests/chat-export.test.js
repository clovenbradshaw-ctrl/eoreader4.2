import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pairExchanges, toMarkdown, toJSON, buildChatExport, hasChat, FORMATS,
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
