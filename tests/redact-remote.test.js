import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTable, redactText, restore, assertNoNameLeak, makeStreamRestorer, wrapRedacting,
} from '../src/model/redact-remote.js';

const NAMES = ['Dr. Awad', 'Meridian Corp', 'New York City', 'New York'];

test('buildTable: nth distinct name → Referent{n}, stable and reversible', () => {
  const { alias, back } = buildTable(['Dr. Awad', 'Meridian Corp', 'Dr. Awad']);
  assert.equal(alias.get('Dr. Awad'), 'Referent1');
  assert.equal(alias.get('Meridian Corp'), 'Referent2');
  assert.equal(back.get('Referent1'), 'Dr. Awad');
  assert.equal(back.get('Referent2'), 'Meridian Corp');
});

test('redactText: every real name collapses to its token, longest surface wins', () => {
  const table = buildTable(NAMES);
  const out = redactText('Dr. Awad joined Meridian Corp in New York City, not New York.', table);
  for (const n of NAMES) assert.ok(!out.includes(n), `leaked: ${n}`);
  // "New York City" must win over "New York" (longest first)
  assert.match(out, /Referent3\b/);   // New York City
  assert.ok(/\bReferent4\b/.test(out), 'the bare "New York" also tokenized');
});

test('redactText: case-insensitive mention still redacts; mid-word never matches', () => {
  const table = buildTable(['Awad']);
  assert.equal(redactText('awad and AWAD', table), 'Referent1 and Referent1');
  assert.equal(redactText('Awadi stays whole', table), 'Awadi stays whole');
});

test('restore: tokens → real names; an unknown token is left untouched', () => {
  const { back } = buildTable(NAMES);
  assert.equal(restore('Referent1 advised Referent2', back), 'Dr. Awad advised Meridian Corp');
  assert.equal(restore('Referent9 is unknown', back), 'Referent9 is unknown');
});

test('assertNoNameLeak: throws on a surviving name, passes on clean tokens', () => {
  assert.throws(() => assertNoNameLeak([{ role: 'user', content: 'about Dr. Awad' }], ['Dr. Awad']),
    /redaction leak/);
  assert.ok(assertNoNameLeak([{ role: 'user', content: 'about Referent1' }], ['Dr. Awad']));
});

test('makeStreamRestorer: a token split across chunks is never half-emitted, and equals restore(whole)', () => {
  const { back } = buildTable(NAMES);
  const r = makeStreamRestorer(back);
  let out = '';
  // "Referent1" arrives split as "Refe" / "rent1", then a space, then Referent2 split too.
  for (const piece of ['Refe', 'rent1', ' met ', 'Referen', 't2', ' today.']) out += r.push(piece);
  out += r.flush();
  assert.equal(out, 'Dr. Awad met Meridian Corp today.');
  // no partial "Refe"/"Referen" ever leaked into the emitted stream
  assert.ok(!/Refe(?!rent)/.test(out) && !out.includes('Referen '), 'no half-restored token surfaced');
});

// A fake REMOTE backend: records the exact messages it was handed and echoes tokens back,
// streaming them in awkward splits so the restorer is exercised.
const fakeRemote = () => {
  const seen = [];
  return {
    model: {
      id: 'fake', kind: 'remote',
      isLoaded: () => true,
      load: async () => {},
      propose: async function* () {},   // must be hidden by the wrapper
      describe: () => ({ backend: 'fake', kind: 'remote', model: 'x', label: 'Fake' }),
      async phrase(messages, opts = {}) {
        seen.push(messages);
        const reply = 'Referent1 advised Referent2.';
        if (typeof opts.onToken === 'function') {
          for (const piece of ['Refer', 'ent1 advised ', 'Referent2.']) opts.onToken(piece);
        }
        return reply;
      },
    },
    seen,
  };
};

test('wrapRedacting: a REMOTE talker sees only tokens; the answer is restored', async () => {
  const { model, seen } = fakeRemote();
  const wrapped = wrapRedacting(model, () => ['Dr. Awad', 'Meridian Corp']);
  const answer = await wrapped.phrase([
    { role: 'system', content: 'be helpful' },
    { role: 'user', content: 'What did Dr. Awad do at Meridian Corp?' },
  ]);
  // outgoing: no real name reached the fake backend
  const serial = seen[0].map((m) => m.content).join('\n');
  assert.ok(!serial.includes('Dr. Awad') && !serial.includes('Meridian Corp'), 'a real name leaked');
  assert.match(serial, /Referent1/);
  assert.match(serial, /Referent2/);
  // incoming: tokens restored to real names
  assert.equal(answer, 'Dr. Awad advised Meridian Corp.');
});

test('wrapRedacting: streamed tokens are restored live, concatenating to the answer', async () => {
  const { model } = fakeRemote();
  const wrapped = wrapRedacting(model, () => ['Dr. Awad', 'Meridian Corp']);
  let streamed = '';
  const answer = await wrapped.phrase([{ role: 'user', content: 'Dr. Awad?' }], { onToken: (t) => { streamed += t; } });
  assert.equal(streamed, 'Dr. Awad advised Meridian Corp.');
  assert.equal(answer, streamed);
});

test('wrapRedacting: hides propose (forces the phrase path) and marks describe() redacted', () => {
  const { model } = fakeRemote();
  const wrapped = wrapRedacting(model, () => ['Dr. Awad']);
  assert.equal(typeof wrapped.propose, 'undefined');
  assert.equal(wrapped.describe().redacted, true);
  assert.match(wrapped.describe().label, /redacted/);
});

test('wrapRedacting: transparent passthrough for a local model and for an empty name set', async () => {
  const local = { id: 'echo', kind: 'local', isLoaded: () => true, load: async () => {}, phrase: async () => 'x' };
  assert.equal(wrapRedacting(local, () => ['Dr. Awad']), local);   // same object — untouched

  const { model, seen } = fakeRemote();
  const wrapped = wrapRedacting(model, () => []);                  // remote, but nothing to hide
  await wrapped.phrase([{ role: 'user', content: 'Dr. Awad?' }]);
  assert.ok(seen[0][0].content.includes('Dr. Awad'), 'with no names the message is sent verbatim');
});
