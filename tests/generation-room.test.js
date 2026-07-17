import { test } from 'node:test';
import assert from 'node:assert/strict';

import { splitSentences, buildGroundPool } from '../src/rooms/generation/ground-pool.js';
import { parseIntents, buildIntentMessages, INTENT_SYSTEM_PROMPT } from '../src/rooms/generation/intents.js';
import { proposeIntents, runFromIntents, runCodegen } from '../src/rooms/generation/codegen.js';
import { runLongform, outlineToSections } from '../src/rooms/generation/longform.js';
import { parsePlan, buildPlanMessages, parseCodeBlock, buildCodeMessages, buildFixMessages } from '../src/rooms/generation/code-prompts.js';
import { planCode, generateAndVerify, MAX_ATTEMPTS } from '../src/rooms/generation/codewrite.js';

const EXCERPTS_HEADER = 'What I found reading it:';

// The same capturing stub tests/longgen-prose.test.js uses: it echoes back the
// excerpt lines the grounded prompt builder places after EXCERPTS_HEADER, so
// bindAndVeto has real spans to bind against without a live model.
const capturingModel = () => {
  const seen = [];
  const model = {
    id: 'stub', kind: 'local', isLoaded: () => true, async load() {},
    async phrase(messages) {
      seen.push(messages);
      const user = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
      const at = user.indexOf(EXCERPTS_HEADER);
      if (at >= 0) {
        const lines = user.slice(at + EXCERPTS_HEADER.length)
          .split('\n').map((s) => s.trim()).filter(Boolean);
        if (lines.length) return lines.slice(0, 2).join(' ');
      }
      return user.slice(0, 80);
    },
  };
  return { model, seen };
};

// ── ground-pool.js ────────────────────────────────────────────────────────

test('splitSentences — splits on sentence punctuation, drops fragments', () => {
  const out = splitSentences('Dolphins hunt in pods. They use echolocation! Is that surprising? Ok.');
  assert.deepEqual(out, [
    'Dolphins hunt in pods.', 'They use echolocation!', 'Is that surprising?',
  ]); // "Ok." is under MIN_CHARS and dropped
});

test('splitSentences — empty/whitespace input yields no spans', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences('   \n\n  '), []);
});

test('buildGroundPool — every sentence becomes an indexed, scored span', () => {
  const pool = buildGroundPool('Dolphins are intelligent. Dolphins hunt fish with echolocation.');
  assert.equal(pool.length, 2);
  assert.deepEqual(pool.map((s) => s.idx), [0, 1]);
  for (const s of pool) {
    assert.ok(s.score > 0 && s.score <= 1);
    assert.equal(typeof s.text, 'string');
  }
});

test('buildGroundPool — topic overlap ranks a relevant sentence above an irrelevant one', () => {
  const text = 'The weather today is mild and clear. Dolphins use echolocation to hunt fish in murky water.';
  const pool = buildGroundPool(text, { topic: 'dolphin echolocation hunting' });
  const bySentence = Object.fromEntries(pool.map((s) => [s.text, s.score]));
  assert.ok(bySentence['Dolphins use echolocation to hunt fish in murky water.'] > bySentence['The weather today is mild and clear.']);
});

// ── longform.js (weave/essay wiring) ────────────────────────────────────────

test('outlineToSections — one intent per non-blank line', () => {
  const secs = outlineToSections('Open the case\n\n  Develop it  \nClose it');
  assert.deepEqual(secs.map((s) => s.intent), ['Open the case', 'Develop it', 'Close it']);
  assert.deepEqual(secs.map((s) => s.id), ['sec:0', 'sec:1', 'sec:2']);
});

test('runLongform — a thesis + source material produces a grounded essay via a stub model', async () => {
  const { model } = capturingModel();
  const sourceText = 'Dolphins are highly intelligent marine mammals that live in social pods. ' +
    'Dolphins use echolocation to hunt fish in murky coastal water.';
  const res = await runLongform({ thesis: 'Dolphins are intelligent hunters', sourceText, model });
  assert.ok(res.essay.length > 0, 'the driver produced prose');
  assert.ok(res.report.sections.length >= 1);
  assert.equal(res.report.thesis, 'Dolphins are intelligent hunters');
});

// ── intents.js — the propose-side prompt + defensive parse ─────────────────

test('INTENT_SYSTEM_PROMPT names the closed catalog and cube vocabulary', () => {
  assert.match(INTENT_SYSTEM_PROMPT, /board:/);
  for (const op of ['NUL', 'SEG', 'DEF', 'SIG', 'CON', 'EVA', 'INS', 'SYN', 'REC']) {
    assert.ok(INTENT_SYSTEM_PROMPT.includes(op), `missing op ${op}`);
  }
});

test('buildIntentMessages — a system + user turn, the task carried verbatim', () => {
  const messages = buildIntentMessages('a kanban board for cases');
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.equal(messages[1].content, 'a kanban board for cases');
});

test('parseIntents — a clean JSON array passes through', () => {
  const raw = JSON.stringify([{ id: 'a', kind: 'room', contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] }, events: [] }]);
  const { intents, dropped, error } = parseIntents(raw);
  assert.equal(error, null);
  assert.equal(dropped, 0);
  assert.equal(intents.length, 1);
  assert.equal(intents[0].id, 'a');
});

test('parseIntents — strips a markdown fence the model added anyway', () => {
  const raw = '```json\n' + JSON.stringify([{ id: 'x', kind: 'surface', surface: 'board', room: { terrains: ['Entity', 'Field'] } }]) + '\n```';
  const { intents, error } = parseIntents(raw);
  assert.equal(error, null);
  assert.equal(intents.length, 1);
  assert.equal(intents[0].surface, 'board');
});

test('parseIntents — recovers the array even with a stray sentence around it', () => {
  const raw = 'Here you go:\n' + JSON.stringify([{ id: 'y', kind: 'room' }]) + '\nHope that helps!';
  const { intents, error } = parseIntents(raw);
  assert.equal(error, null);
  assert.equal(intents.length, 1);
});

test('parseIntents — drops entries with no id or an unknown kind, keeps the rest', () => {
  const raw = JSON.stringify([
    { id: 'good', kind: 'room' },
    { kind: 'room' },              // no id
    { id: 'bad-kind', kind: 'kanban' },  // not a real kind
    'not even an object',
  ]);
  const { intents, dropped, error } = parseIntents(raw);
  assert.equal(error, null);
  assert.equal(intents.length, 1);
  assert.equal(dropped, 3);
});

test('parseIntents — genuinely unparseable text reports an error, never throws', () => {
  const { intents, error } = parseIntents('I cannot help with that.');
  assert.deepEqual(intents, []);
  assert.match(error, /JSON array/);
});

// ── codegen.js — propose (stub model) then the real coder pipeline ─────────

const INTENT_REPLY = JSON.stringify([
  { id: 'cases', kind: 'room',
    contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
    events: [{ op: 'INS', id: 'case', terrain: 'Entity', stance: 'Making' }] },
  { id: 'case_board', kind: 'surface', surface: 'board', room: { terrains: ['Entity', 'Field'] } },
]);
const stubIntentModel = (reply = INTENT_REPLY) => ({
  id: 'stub', kind: 'local', isLoaded: () => true, async load() {},
  async phrase() { return reply; },
});

test('proposeIntents — parses a stub model\'s reply into intents build() accepts', async () => {
  const { intents, dropped, error } = await proposeIntents({ task: 'a case board', model: stubIntentModel() });
  assert.equal(error, null);
  assert.equal(dropped, 0);
  assert.equal(intents.length, 2);
});

test('runFromIntents — the real coder pipeline ships the proposed intents clean', () => {
  const out = runFromIntents(JSON.parse(INTENT_REPLY));
  assert.equal(out.ok, true);
  assert.ok(out.provisioned.rooms.includes('cases'));
  assert.match(out.report, /checkpoint passed/);
});

test('runCodegen — one call proposes, one pass builds, end to end', async () => {
  const out = await runCodegen({ task: 'a case board', model: stubIntentModel() });
  assert.equal(out.parseError, null);
  assert.equal(out.buildResult.ok, true);
});

test('runCodegen — a model reply with no JSON in it never throws, and skips the build', async () => {
  const out = await runCodegen({ task: 'anything', model: stubIntentModel('sorry, I cannot do that') });
  assert.match(out.parseError, /JSON array/);
  assert.equal(out.buildResult, null);
});

// ── code-prompts.js — plan/code/fix prompts + defensive parse ──────────────

test('buildPlanMessages — a system + user turn carrying the task', () => {
  const messages = buildPlanMessages('a pomodoro timer');
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].content, 'a pomodoro timer');
});

test('parsePlan — a clean plan object passes through with defaults for missing fields', () => {
  const raw = JSON.stringify({ summary: 'a timer', features: ['start/pause', 'reset'] });
  const { plan, error } = parsePlan(raw);
  assert.equal(error, null);
  assert.equal(plan.summary, 'a timer');
  assert.deepEqual(plan.features, ['start/pause', 'reset']);
  assert.deepEqual(plan.checks, []);
});

test('parsePlan — strips a markdown fence and recovers a trailing sentence', () => {
  const raw = '```json\n' + JSON.stringify({ features: ['one thing'] }) + '\n```\nLet me know if you want changes!';
  const { plan, error } = parsePlan(raw);
  assert.equal(error, null);
  assert.deepEqual(plan.features, ['one thing']);
});

test('parsePlan — no features at all is reported, never thrown', () => {
  const { plan, error } = parsePlan('sure, I can help with that');
  assert.equal(plan, null);
  assert.match(error, /usable plan/);
});

test('parseCodeBlock — extracts a fenced html block', () => {
  const raw = 'Here:\n```html\n<!doctype html><html></html>\n```\n';
  assert.equal(parseCodeBlock(raw), '<!doctype html><html></html>');
});

test('parseCodeBlock — no fence at all still returns the trimmed text, never null', () => {
  assert.equal(parseCodeBlock('  <p>hi</p>  '), '<p>hi</p>');
});

test('buildFixMessages — carries the previous code and the observed errors', () => {
  const messages = buildFixMessages('a timer', null, '<html>broken</html>', [{ level: 'error', text: 'x is not defined' }]);
  assert.match(messages[1].content, /x is not defined/);
  assert.match(messages[1].content, /<html>broken<\/html>/);
});

// ── codewrite.js — plan → generate → verify → fix, with a stub model + a scripted verify ──

const stubTextModel = (replies) => {
  let i = 0;
  return {
    id: 'stub', kind: 'local', isLoaded: () => true, async load() {},
    async phrase() { const r = replies[Math.min(i, replies.length - 1)]; i += 1; return r; },
  };
};
const codeReply = (body) => '```html\n<!doctype html><html><body>' + body + '</body></html>\n```';

test('planCode — parses a stub model\'s plan reply', async () => {
  const model = stubTextModel([JSON.stringify({ summary: 'a counter', features: ['increment', 'decrement'] })]);
  const { plan, error } = await planCode({ task: 'a counter', model });
  assert.equal(error, null);
  assert.deepEqual(plan.features, ['increment', 'decrement']);
});

test('generateAndVerify — a clean first attempt stops the loop at one round', async () => {
  const model = stubTextModel([codeReply('ok')]);
  const okVerify = async () => ({ ok: true, errors: [], logs: [] });
  const { attempts, final } = await generateAndVerify({ task: 'x', plan: null, model, verify: okVerify });
  assert.equal(attempts.length, 1);
  assert.equal(final.verify.ok, true);
});

test('generateAndVerify — a failing attempt retries with the errors folded back in, then succeeds', async () => {
  const model = stubTextModel([codeReply('v1'), codeReply('v2')]);
  let call = 0;
  const scriptedVerify = async () => {
    call += 1;
    return call === 1 ? { ok: false, errors: [{ level: 'error', text: 'ReferenceError: x is not defined' }], logs: [] }
                       : { ok: true, errors: [], logs: [] };
  };
  const seen = [];
  const { attempts, final } = await generateAndVerify({
    task: 'x', plan: null, model, verify: scriptedVerify,
    onAttempt: (a, i) => seen.push({ i, ok: a.verify.ok }),
  });
  assert.equal(attempts.length, 2);
  assert.equal(final.verify.ok, true);
  assert.deepEqual(seen, [{ i: 0, ok: false }, { i: 1, ok: true }]);
});

test('generateAndVerify — stops at MAX_ATTEMPTS and returns the last (still-failing) attempt honestly', async () => {
  const model = stubTextModel([codeReply('v1'), codeReply('v2'), codeReply('v3'), codeReply('v4')]);
  const alwaysFails = async () => ({ ok: false, errors: [{ level: 'error', text: 'still broken' }], logs: [] });
  const { attempts, final } = await generateAndVerify({ task: 'x', plan: null, model, verify: alwaysFails });
  assert.equal(attempts.length, MAX_ATTEMPTS);
  assert.equal(final.verify.ok, false);
  assert.equal(final.verify.errors[0].text, 'still broken');
});
