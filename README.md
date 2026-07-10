# EO Reader 4.2 — the holonic refactor

Document-chat over an append-only event log, with every module spelled on the
EO cube's three faces — **and the tree itself now nested the way the cube reads**.
This repository is the 4.1 engine re-cut along its faculty seams, carrying only
the essential content, under a new dc surface.

> The append-only event log is the source of truth.
> Everything you see is a recomputed projection of it.

## The nesting

Each top-level directory is a faculty; each directory inside it is a holon
(one entrance, `index.js`; its own `eo-contract.js` manifest; swappable). A
holon that contains sub-holons is itself whole at its own scale — Koestler's
watchmaker, applied to the tree.

```
src/
  core/          the physics — operators, cube, faces, log, projection,
                 contract factory + the merged contract registry
  frame/         the ONE interior spine (log / projection / active-path / bind)
    tasks/         …instantiated on the generation axis (recursive decomposition)
  organs/        the modality membrane
    in/  out/      raise (SIG) and render (INS) adapters
    ingest/        surface → EO tuples
  perceiver/     reading — text → event log → the three reading levels
    parse/  predict/  credence/  classify/
  surfer/        relating — navigation over what the reading maintains
    retrieve/  fold/  flow/  dag/  reason/
  enactor/       gating — nothing is asserted that the record can't witness
    enact/  ground/  factcheck/  answer/
  model/         the leaf — backends (webllm, qwen-coders, echo), prompt, stream
  turn/          the fold of 17 stages (see src/turn/stage-faces.js)
    converse/      the conversation fold + dialogue state
  weave/         generation — long form, multi-prompt, over a moving fold
    longgen/  essay/  write/  arc/  chorus/
  rooms/         the places the user stands
    reader/  workspace/  research/  doc/  audit/  archive/  data/
```

The EO contracts are mechanically enforced: `src/core/contracts.js` merges every
holon's manifest and `tests/contracts.test.js` proves 100% coverage, no orphans,
cube coherence, and no desert cell on every run.

## The surface

`index.html` is the new dc surface (screens: **EOReader** and **Provenance DAG**),
running on `support.js` (the dc runtime) + vendored React. It boots the engine
bridge at `src/rooms/reader/boot.js`, which exposes exactly one membrane to the
surface: `window.EO` — the reader session controller (`app`), parse, readingAt,
groundSpans, factCheck, the DAG cursors, the audit log, the workspace, and the
tiered-graph mount. The surface never imports engine internals.

### Seams (all live — the seeds are gone)

Every surface element renders the engine's real state through
`rooms/reader/app.js` (the session controller). There is no demo data; the app
opens empty and fills as you record.

| surface | engine wiring |
|---|---|
| ingest bar (URL / file / paste / web search) | `organs/ingest` web client + admission core, `rooms/reader/import-file.js` extractors, proxy chain with public fallbacks |
| chat exchange | `turn/` pipeline (`runTurn`) — streamed, cited, fact-checked; model backends from `model/` (webllm · wllama · echo), picked adaptively |
| S-registry (sha, bytes, rights, fixity) | `organs/ingest/websource.js` records + the controller's registry |
| claim → passage pincites | the turn's `bound`/`citeOrigins`/`citeTexts` (from `enactor/ground`) |
| provenance DAG nodes/edges | derived from real turns: topic → claims → passages → sources → files |
| document viewer (click any source) | the recorded text, cited passages marked, entities clickable |
| EoT encoding (every source, any modality) | `organs/ingest/read.js` `readIngest` at record time — every admitted proposition in the canonical surface + the reading's thinking, viewable and exportable per source |
| entity explorer (right panel) | `projectGraph` entities + `perceiver` `figureSurface`; web graph via `rooms/reader/tiered-graph.js` |
| monologue steps | `rooms/audit` (`createAuditLog`) — live subscription, per-stage trail |

## What stayed behind in 4.1

The frozen 4.1 shell (`app.dc.js`, 954 KB) and its checked-in bundle, the dormant
second SVO reader, the unreachable model backends (`pleias`, `onnx`), the four
superseded write loops (`answer/composition/impression/spurt` — the paragraph
loop in `weave/write/paragraphs.js` is the live posture), the demo HTML pages,
and the eval/tools harnesses. Tests that pinned the old shell's wiring were
removed with it; every engine-behavior test came along.

## Run

```
npm test          # node --test tests/*.test.js
npm run serve     # python3 -m http.server 8000 → open http://localhost:8000
```

CI runs the suite on every push; `main` deploys to GitHub Pages via Actions.
