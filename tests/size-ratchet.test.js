import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The god-module ratchet ("no god module — no file over ~250 lines",
// docs/architecture.md; docs/eo-compliance-2026-07.md). The law was found
// violated by 130 files; the two worst orchestrators have been split
// (turn/stages.js) or opened (rooms/reader/app.js — the pre-closure helpers
// moved to app/, the closure decomposition staged in the compliance doc).
// This test gives the law mechanical teeth from here on:
//   · a file NOT on the baseline may never exceed 250 lines;
//   · a file ON the baseline may only SHRINK — it may never grow past the
//     line count pinned here. When it drops to 250 or fewer, delete its row
//     (the stale-row check enforces the deletion), and the law holds it there.
// The baseline may only shrink; growing it is a design decision made in
// review, never a silent side effect.

const LIMIT = 250;
const BASELINE = new Map([
  ['src/core/conventions/english-verbs.js', 2637],
  ['src/core/conventions/ledger.js', 568],
  ['src/core/enacted/loop.js', 479],
  ['src/core/enacted/stance.js', 286],
  ['src/core/project.js', 399],
  ['src/core/relation-types.js', 361],
  ['src/core/spectral.js', 514],
  ['src/core/voidnull.js', 289],
  ['src/enactor/answer/math.js', 397],
  ['src/enactor/answer/mechanical.js', 298],
  ['src/enactor/factcheck/correspond.js', 479],
  ['src/enactor/factcheck/propositions.js', 592],
  ['src/enactor/ground/bind.js', 396],
  ['src/enactor/ground/reflect.js', 279],
  ['src/enactor/ground/spans.js', 260],
  ['src/enactor/ground/veto.js', 284],
  ['src/frame/conversation-fold.js', 560],
  ['src/frame/tasks/learn.js', 264],
  ['src/frame/tasks/spec.js', 663],
  ['src/metabolism/defscore.js', 360],
  ['src/metabolism/index.js', 337],
  ['src/metabolism/judge.js', 347],
  ['src/metabolism/population.js', 413],
  ['src/metabolism/soma.js', 309],
  ['src/model/bands.js', 702],
  ['src/model/openai-local.js', 279],
  ['src/model/prompt.js', 257],
  ['src/model/webllm.js', 366],
  ['src/model/wllama.js', 285],
  ['src/organs/code/compose.js', 252],
  ['src/organs/code/facts.js', 1018],
  ['src/organs/code/issues.js', 513],
  ['src/organs/code/python.js', 498],
  ['src/organs/code/widget.js', 333],
  ['src/organs/in/acoustic.js', 427],
  ['src/organs/in/audio.js', 287],
  ['src/organs/in/code.js', 313],
  ['src/organs/in/composite.js', 356],
  ['src/organs/in/hear.js', 367],
  ['src/organs/in/motion.js', 750],
  ['src/organs/in/ocr-context.js', 311],
  ['src/organs/in/ocr-quorum.js', 358],
  ['src/organs/in/voices.js', 494],
  ['src/organs/ingest/civic.js', 367],
  ['src/organs/ingest/eot-emit.js', 276],
  ['src/organs/ingest/eot.js', 352],
  ['src/organs/ingest/github.js', 293],
  ['src/organs/ingest/webfetch.js', 395],
  ['src/organs/out/limner/layout.js', 317],
  ['src/organs/out/speech/schema.js', 284],
  ['src/perceiver/classify/phasepost.js', 291],
  ['src/perceiver/credence/project.js', 373],
  ['src/perceiver/parse/coref.js', 274],
  ['src/perceiver/parse/dark-referent.js', 272],
  ['src/perceiver/parse/entities.js', 792],
  ['src/perceiver/parse/pipeline.js', 926],
  ['src/perceiver/parse/relations.js', 964],
  ['src/perceiver/referents/index.js', 294],
  ['src/perceiver/predict/grained.js', 308],
  ['src/perceiver/reading.js', 314],
  ['src/perceiver/surfaces.js', 370],
  ['src/rooms/archive/matrix.js', 298],
  ['src/rooms/audit/eot-terminal.js', 333],
  ['src/rooms/chat/crypto.js', 306],
  ['src/rooms/chat/index.js', 363],
  ['src/rooms/data/query.js', 541],
  ['src/rooms/doc/render.js', 334],
  ['src/rooms/doc/surface.js', 444],
  ['src/rooms/models/catalog.js', 281],
  ['src/rooms/models/surface.js', 645],
  ['src/rooms/reader/app/chat.js', 720],
  ['src/rooms/reader/app/deep.js', 477],
  ['src/rooms/reader/app/registry.js', 296],
  ['src/rooms/reader/app/findings.js', 253],
  ['src/rooms/reader/app/model.js', 376],
  ['src/rooms/reader/app/toplines.js', 313],
  ['src/rooms/reader/boot.js', 389],
  ['src/rooms/reader/chat-export.js', 514],
  ['src/rooms/reader/console-surface.js', 438],
  ['src/rooms/reader/eo/phasepost.js', 401],
  ['src/rooms/reader/import-file.js', 802],
  ['src/rooms/reader/midi.js', 294],
  ['src/rooms/reader/monologue-surface.js', 607],
  ['src/rooms/reader/reader-render.js', 1210],
  ['src/rooms/reader/solar-system.js', 339],
  ['src/rooms/reader/tiered-graph.js', 680],
  ['src/rooms/reader/transcript-export.js', 406],
  ['src/rooms/reader/transcript-format.js', 440],
  ['src/rooms/reader/wiki-referent.js', 260],
  ['src/rooms/replay/surface.js', 481],
  ['src/rooms/reader/app/registry.js', 296],
  ['src/rooms/research/driver.js', 833],
  ['src/rooms/research/live.js', 266],
  ['src/rooms/research/project.js', 358],
  ['src/rooms/research/render.js', 296],
  ['src/rooms/research/surface.js', 572],
  ['src/store/event-store.js', 274],
  ['src/store/formula.js', 390],
  ['src/surfer/dag/causal.js', 318],
  ['src/surfer/dag/index.js', 254],
  ['src/surfer/dag/stance.js', 264],
  ['src/surfer/dag/surface.js', 524],
  ['src/surfer/flow/index.js', 408],
  ['src/surfer/fold/audit.js', 414],
  ['src/surfer/fold/deep-reading.js', 360],
  ['src/surfer/fold/significance.js', 293],
  ['src/surfer/fold/substrate.js', 314],
  ['src/surfer/fold/summary.js', 275],
  ['src/surfer/fold/summary-cross.js', 314],
  ['src/surfer/fold/summary-prompt.js', 286],
  ['src/surfer/fold/weave.js', 458],
  ['src/surfer/learn-links.js', 283],
  ['src/surfer/levels.js', 266],
  ['src/surfer/reason/cursor.js', 325],
  ['src/surfer/reason/walk.js', 349],
  ['src/surfer/surf.js', 377],
  ['src/turn/converse/dialogue-state.js', 286],
  ['src/turn/deep-research.js', 467],
  ['src/turn/intent.js', 589],
  ['src/turn/judgments.js', 261],
  ['src/turn/meta-route.js', 889],
  ['src/turn/pipeline.js', 695],
  ['src/turn/research.js', 475],
  ['src/turn/stage-prompt.js', 251],
  ['src/turn/web.js', 273],
  ['src/weave/arc/pipeline.js', 278],
  ['src/weave/commission/template.js', 267],
  ['src/weave/essay/driver.js', 800],
  ['src/weave/longgen/answerable.js', 426],
  ['src/weave/longgen/continuation.js', 388],
  ['src/weave/longgen/fold.js', 463],
  ['src/weave/longgen/resolve.js', 290],
  ['src/weave/longgen/walk.js', 598],
  ['src/weave/topline/surface.js', 284],
  ['src/weave/write/gravity.js', 331],
  ['src/weave/write/lens-port.js', 304],
  ['src/weave/write/paragraphs.js', 393],
  ['src/weave/write/redact.js', 260],
  ['src/weave/write/think.js', 261],
  ['src/weave/write/voice.js', 356],
  ['src/wiki/terrains.js', 329]
]);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return walk(p);
  if (!e.name.endsWith('.js') || e.name === 'eo-contract.js') return [];
  return [p];
});

const counted = new Map(walk(SRC).map((p) => [
  path.relative(ROOT, p),
  readFileSync(p, 'utf8').split('\n').length - 1,
]));

test('no new god module — a file off the baseline stays within 250 lines', () => {
  const grown = [...counted].filter(([p, n]) => n > LIMIT && !BASELINE.has(p));
  assert.equal(grown.length, 0,
    `${grown.length} file(s) crossed ${LIMIT} lines without a baseline row:\n  ` +
    grown.map(([p, n]) => `${p} (${n})`).join('\n  '));
});

test('the baseline only shrinks — no pinned offender may grow', () => {
  const worse = [...BASELINE].filter(([p, pinned]) => (counted.get(p) ?? 0) > pinned);
  assert.equal(worse.length, 0,
    `${worse.length} pinned file(s) GREW past their baseline:\n  ` +
    worse.map(([p, pinned]) => `${p} (${counted.get(p)} > ${pinned})`).join('\n  '));
});

test('no stale baseline row — a healed file is deleted from the pin list', () => {
  const stale = [...BASELINE].filter(([p]) => (counted.get(p) ?? 0) <= LIMIT);
  assert.equal(stale.length, 0,
    `${stale.length} baseline row(s) are healed or gone — delete them:\n  ` +
    stale.map(([p]) => p).join('\n  '));
});
