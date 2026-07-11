// The paragraph-grain realizer for the closure (docs/long-generation.md).
//
// runContinuation's default REALIZE renders one atom as one grounded sentence; the
// `prose` mode renders each atom as a PARAGRAPH continuation of the running document
// (render.js), the planner's move preserved. These tests hold the contract without a
// live model: a capturing echo stub proves the two realizers differ where they should
// (the system frame) and agree where they must (grounded, monotone coverage, a real
// stop) — and that `prose:false` leaves the default path untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runContinuation, realizeProse } from '../src/weave/longgen/index.js';
import { SYSTEM_CONTINUE } from '../src/weave/longgen/render.js';
import { SYSTEM_GROUND } from '../src/model/index.js';

const EXCERPTS_HEADER = 'What I found reading it:';

// A ranked ground pool of full sentences — leadSentence (the prose seed) and the
// binder both need real sentences to work on.
const GROUND = [
  { idx: 0, score: 0.9, text: 'Dolphins are highly intelligent marine mammals that live in social pods.' },
  { idx: 1, score: 0.8, text: 'Dolphins use echolocation to hunt fish in murky coastal water.' },
  { idx: 2, score: 0.7, text: 'Some dolphins carry marine sponges on their beaks as foraging tools.' },
  { idx: 3, score: 0.6, text: 'Dolphin pods can swell into the hundreds during seasonal migration.' },
];

// An echo-style stub that also captures every message set it is handed. It returns the
// verbatim excerpt lines (as the real echo backend does), so bindAndVeto binds cleanly
// under either prompt builder — both emit the same EXCERPTS_HEADER.
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
        if (lines.length) return lines.slice(0, 3).join(' ');
      }
      return user.slice(0, 80);
    },
  };
  return { model, seen };
};

const systemsOf = (seen) => seen.map((ms) => ms.find((m) => m.role === 'system')?.content || '');

test('prose:false — the default realizer is the grounded per-atom path (SYSTEM_GROUND)', async () => {
  const { model, seen } = capturingModel();
  const res = await runContinuation({ ground: GROUND, model, nul: false });

  assert.ok(res.units.length > 0, 'the walk produced atoms');
  assert.ok(res.answer.trim().length > 0, 'the walk produced prose');
  assert.ok(typeof res.stop === 'string' && res.stop.length, 'it stopped for a reason');
  // Coverage is monotone and bounded by the pool — never a token count.
  assert.ok(res.state.covered.length <= GROUND.length);
  // Every model call went through the grounded builder, never the continuation one.
  const sys = systemsOf(seen);
  assert.ok(sys.length > 0);
  assert.ok(sys.every((s) => s === SYSTEM_GROUND), 'default path uses SYSTEM_GROUND');
  assert.ok(sys.every((s) => !s.includes(SYSTEM_CONTINUE)), 'default path never uses the continuation frame');
});

test('prose:true — the paragraph realizer renders continuations (SYSTEM_CONTINUE)', async () => {
  const { model, seen } = capturingModel();
  const res = await runContinuation({ ground: GROUND, model, nul: false, prose: true });

  assert.ok(res.units.length > 0, 'the prose walk produced atoms');
  assert.ok(res.answer.trim().length > 0, 'the prose walk produced prose');
  assert.ok(res.sources.length > 0, 'the prose stayed grounded — it cited spans');
  assert.ok(res.state.covered.length <= GROUND.length, 'coverage stays monotone');

  const sys = systemsOf(seen);
  assert.ok(sys.length > 0);
  // Every realized atom rode the continuation frame; none the grounded-answer frame.
  assert.ok(sys.every((s) => s.startsWith(SYSTEM_CONTINUE)), 'prose path uses the continuation frame');
  assert.ok(sys.every((s) => s !== SYSTEM_GROUND), 'prose path never uses SYSTEM_GROUND');
});

test('realizeProse composes seed + continuation as one grounded paragraph', async () => {
  const { model, seen } = capturingModel();
  const proposition = {
    move: 'CON', stance: 'assert', band: 'firm',
    subClaim: GROUND[0].text, spans: [GROUND[0]], spanSet: [0],
    against: null, closes: false, floor: 24, ceiling: 96,
  };
  const text = await realizeProse({ proposition, units: [], model });

  assert.ok(text.length > 0, 'a paragraph came back');
  // The cold-start paragraph opens on the anchor span's own topic sentence (the seed),
  // grounded by construction — the choppy "answer this span" job is gone.
  assert.ok(text.startsWith('Dolphins are highly intelligent'), 'opens on the grounded seed');
  // It rendered as a continuation, not a grounded-answer turn.
  const system = seen[0].find((m) => m.role === 'system')?.content || '';
  assert.ok(system.startsWith(SYSTEM_CONTINUE));
  const user = seen[0].find((m) => m.role === 'user')?.content || '';
  assert.ok(user.includes(EXCERPTS_HEADER), 'the source lines rode above the boundary for the binder');
});
