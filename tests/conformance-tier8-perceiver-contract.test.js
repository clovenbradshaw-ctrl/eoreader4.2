// TIER 8 — Perceiver contract and modality blindness (docs/parse-conformance-spec.md).
// "The hard rule is: perceivers get modality structure, core gets none. Test
// the rule, not the intention." The best-supported of the four remaining
// tiers: text, audio, tabular, and binary perceivers are all real,
// implemented code (not stubs), and a real skin system exists — every test
// here runs against production code, not a mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readWithSeed, buildReading } from './conformance/harness/read.js';
import { makeRng } from './conformance/harness/mutate.js';
import { validateReading, ROLES } from '../src/perceiver/contract.js';
import { buildAudioReading } from '../src/perceiver/audio/waveform.js';
import { buildTabularReading } from '../src/perceiver/tabular/waveform.js';
import { buildBinaryReading } from '../src/perceiver/binary/waveform.js';
import { ingestTable } from '../src/organs/in/table.js';
import { buildWaveform } from '../src/weave/waveform/build.js';
import { buildScene } from '../src/surfaces/waveform/render.strict.js';
import { applyAudioSkin } from '../src/surfaces/waveform/skins/audio.js';
import { applyTabularSkin } from '../src/surfaces/waveform/skins/tabular.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

// ── #35 — Schema conformance across modalities ───────────────────────────────
// "Every perceiver's emitted Reading validates against the shared substrate
// schema... Run the same validator over text, WAV, and tabular perceivers."
// Binary (the generic fallback perceiver) is included too — all four are real.
const buildSyntheticAudio = () => {
  const SAMPLE_RATE = 8000, FRAME_SIZE = 512;
  const tone = (freq, frames) => {
    const s = new Float64Array(frames * FRAME_SIZE);
    for (let i = 0; i < s.length; i++) s[i] = 0.8 * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
    return s;
  };
  const silence = (frames) => new Float64Array(frames * FRAME_SIZE);
  const parts = [tone(300, 10), silence(15), tone(1200, 10), silence(15), tone(300, 10)];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const mono = new Float64Array(total);
  let off = 0;
  for (const p of parts) { mono.set(p, off); off += p.length; }
  return buildAudioReading(mono, SAMPLE_RATE, { frameSize: FRAME_SIZE });
};

const buildSyntheticTabular = () => {
  const jitter = (i, amp) => amp * Math.sin(i * 1.3);
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push({ pressure: (1020 + jitter(i, 0.6)).toFixed(1), temp: (15 + jitter(i, 0.4)).toFixed(1) });
  for (let i = 15; i < 30; i++) rows.push({ pressure: (980 + jitter(i, 0.6)).toFixed(1), temp: (8 + jitter(i, 0.4)).toFixed(1) });
  const tdoc = ingestTable({ name: 'tier8-35-table', rows });
  return buildTabularReading(tdoc);
};

const buildSyntheticBinary = () => {
  const bytes = new Uint8Array(2000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) % 256;
  return buildBinaryReading(bytes);
};

test('Tier8 #35: schema conformance — every perceiver (text/audio/tabular/binary) emits a Reading that validates and flows through buildWaveform', async () => {
  const doc = await readWithSeed('Mayor Owusu called the meeting to order. She read the agenda.', { seed: 'tier8-35-text' });
  const readings = {
    text: await buildReading(doc),
    audio: buildSyntheticAudio(),
    tabular: buildSyntheticTabular(),
    binary: buildSyntheticBinary(),
  };
  for (const [modality, reading] of Object.entries(readings)) {
    const { ok, errors } = validateReading(reading);
    assert.ok(ok, `${modality}: Reading failed validateReading — ${JSON.stringify(errors)}`);
    assert.doesNotThrow(() => buildWaveform(reading), `${modality}: a validated Reading threw inside buildWaveform`);
  }
});

// ── #36 — Core blindness by substitution ─────────────────────────────────────
// "Construct two Readings with identical substrate content but different
// modality tags... Core must produce byte-identical signals."
test('Tier8 #36: core blindness by substitution — changing only reading.meta.modality never changes buildWaveform output', async () => {
  const doc = await readWithSeed('Mayor Owusu called the meeting to order. She read the agenda. The council voted to approve the item.', { seed: 'tier8-36' });
  const reading = await buildReading(doc);
  const outA = buildWaveform(reading);
  const outB = buildWaveform({ ...reading, meta: { ...reading.meta, modality: 'a-modality-that-does-not-exist' } });

  const strip = (o) => JSON.stringify({
    baseline: o.baseline, strain: o.strain, confidence: o.confidence,
    frames: o.frames, turns: o.turns, ruler: o.ruler, echoes: o.echoes,
    cast: o.cast, discard: o.discard,
  });
  assert.equal(strip(outA), strip(outB), 'buildWaveform output changed when only reading.meta.modality changed');
});

// ── #37 — Static prohibition ─────────────────────────────────────────────────
// "A lint rule / AST check asserting the core module graph contains no
// reference to modality identifiers and no import from any perceiver."
//
// Scope: src/weave/waveform/ — the seam contract.js itself names as the
// boundary ("gone by the time a Reading crosses into src/weave/waveform/ —
// no function past this seam may branch on modality"), not the whole
// src/core/ directory (a separate, more foundational operator-algebra layer
// that many non-waveform modules also depend on, and whose own `modality`
// mentions — grepped separately — are either doc comments asserting
// blindness or, in core/project.js, a namespace collision with LINGUISTIC
// modality/hedging, unrelated to the omnimodal sense this test cares about).
const WAVEFORM_DIR = path.join(REPO_ROOT, 'src/weave/waveform');
const waveformFiles = readdirSync(WAVEFORM_DIR).filter((f) => f.endsWith('.js')).map((f) => path.join(WAVEFORM_DIR, f));

// Strip comments before scanning — a doc comment ASSERTING modality-blindness
// in prose (build.js's own header does exactly this: "no function... ever
// branches on `reading.meta.modality`") must not itself trip the check meant
// to catch real branching code.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('Tier8 #37: static prohibition — src/weave/waveform/ never branches on reading.meta.modality', () => {
  const MODALITY_BRANCH_RE = /\.modality\s*===|meta\.modality/;
  for (const file of waveformFiles) {
    const code = stripComments(readFileSync(file, 'utf8'));
    assert.ok(!MODALITY_BRANCH_RE.test(code), `${path.relative(REPO_ROOT, file)}: contains a literal modality branch`);
  }
});

test.todo('Tier8 #37 GAP, confirmed — src/weave/waveform/ imports from src/perceiver/ (cast.js, build.js), violating the spec\'s literal "no import from any perceiver"', () => {
  // What's imported (validateReading, couplingByNode, classifyReferents) is
  // itself modality-agnostic — the individuation gate and the contract
  // validator, not modality-branching logic — and #36 above directly
  // confirms no modality-dependent BEHAVIOR results. But the spec's rule is
  // stated as a structural/import-graph rule, not a behavioral one, and by
  // that literal reading these two imports are real violations:
  //   src/weave/waveform/build.js:14  import { validateReading } from '../../perceiver/index.js'
  //   src/weave/waveform/cast.js:16   import { couplingByNode, classifyReferents } from '../../perceiver/index.js'
  const PERCEIVER_IMPORT_RE = /from ['"](\.\.\/)+perceiver\//;
  for (const file of waveformFiles) {
    const code = stripComments(readFileSync(file, 'utf8'));
    assert.ok(!PERCEIVER_IMPORT_RE.test(code), `${path.relative(REPO_ROOT, file)}: imports from src/perceiver/`);
  }
});

// ── #38 — Null perceiver ──────────────────────────────────────────────────────
// "A synthetic perceiver emitting a random-but-valid substrate... Core must
// not crash and must report near-null signals — Tier 5's negative controls,
// applied through the contract boundary."
test('Tier8 #38: null perceiver — a random-but-valid Reading does not crash core and reports near-null signals', () => {
  const rng = makeRng(42);
  const DIM = 8, N = 60;
  const metric = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
  const units = Array.from({ length: N }, (_, i) => ({
    id: `u${i}`, ordinal: i, span: { at: i },
    field: Array.from({ length: DIM }, () => rng() * 2 - 1), // uniform noise, no structure
  }));
  const reading = {
    units, metric,
    segments: [], referents: [], sightings: [],
    vocab: { FOREGROUND: 'x', PRESENT: 'y', LATENT: 'z' },
    resolve: (span) => ({ locator: span }),
    meta: { modality: 'null-perceiver', perceiverVersion: '1.0.0' },
  };
  const { ok, errors } = validateReading(reading);
  assert.ok(ok, `synthetic null-perceiver Reading failed validateReading — ${JSON.stringify(errors)}`);

  let model;
  assert.doesNotThrow(() => { model = buildWaveform(reading); }, 'buildWaveform threw on a random-but-valid Reading');
  const hotTurns = model.turns.filter((t) => t.hot).length;
  assert.ok(hotTurns / N < 0.1, `expected near-null turn detection on pure noise; got ${hotTurns}/${N} hot turns`);
  assert.equal(model.cast.filter((c) => c.onCast).length, 0, 'expected zero on-cast referents from a Reading with no referents');
});

// ── #39 — Skin non-interference ──────────────────────────────────────────────
// "Render a reading through each display skin and assert the underlying
// detection outputs are bit-identical. Skins may restyle; if a skin can
// change a signal, the hard rule is already broken."
test('Tier8 #39: skin non-interference — audio and tabular skins restyle a scene without changing any detection field', async () => {
  const doc = await readWithSeed('Mayor Owusu called the meeting to order. She read the agenda. The council voted to approve the item.', { seed: 'tier8-39' });
  const reading = await buildReading(doc);
  const model = buildWaveform(reading);
  const scene = buildScene(model, { mode: 'study' });

  for (const applySkin of [applyAudioSkin, applyTabularSkin]) {
    const skinned = applySkin(scene);
    for (const key of Object.keys(scene)) {
      assert.equal(skinned[key], scene[key], `${applySkin.name}: field "${key}" was not the same reference after skinning — a skin changed a detection output`);
    }
    assert.ok(skinned.style && skinned.style.theme, `${applySkin.name}: expected a style/theme to be added`);
  }
});
