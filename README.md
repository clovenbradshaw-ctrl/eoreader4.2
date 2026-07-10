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
surface: `window.EO` — parse, readingAt, groundSpans, factCheck, the DAG cursors,
the audit log, and the workspace. The surface never imports engine internals.

### Seams (mock → engine, in progress)

The surface still seeds demo data where the wiring is not yet pulled through the
membrane. Each seed has a named engine home:

| surface seed | engine home |
|---|---|
| topic list | `rooms/research` session projections |
| chat exchange | `turn/` pipeline (`runTurn`) |
| S-registry (sha, rights, fixity) | `perceiver/credence` + `rooms/archive` |
| claim → passage pincites | `enactor/ground/spans.js` (`groundSpans`) |
| DAG nodes/edges | `surfer/dag` (`discourseDag` / `assertedDag`) |
| monologue steps | `rooms/audit` (`createAuditLog`) |

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
