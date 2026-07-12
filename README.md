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
    code/          code → EOT → issues from the dependency order (docs/code-organ.md)
  perceiver/     reading — text → event log → the three reading levels
    parse/  predict/  credence/  classify/
  surfer/        relating — navigation over what the reading maintains
    retrieve/  fold/  flow/  dag/  reason/
    lineup/        a chorus of surfers — the nine-operator cast, cooperative + evolutionary (docs/cooperative-graph-surfers.md)
  enactor/       gating — nothing is asserted that the record can't witness
    enact/  ground/  factcheck/  answer/
  model/         the leaf — backends (webllm, wllama, claude API, qwen-coders, echo), prompt, stream
  turn/          the fold of 18 stages (see src/turn/stage-faces.js)
    converse/      the conversation fold + dialogue state
  weave/         generation — long form, multi-prompt, over a moving fold
    longgen/  essay/  write/  arc/  chorus/
  rooms/         the places the user stands
    reader/  workspace/  research/  doc/  audit/  archive/  data/
```

The EO contracts are mechanically enforced: `src/core/contracts.js` merges every
holon's manifest and `tests/contracts.test.js` proves 100% coverage, no orphans,
cube coherence, and no desert cell on every run.

## Evolution — the body grows itself

The metabolism (`src/metabolism/`) no longer only **tunes weights** on a fixed body
plan; it can **grow the body**. An organism is a regulatory genome (weights) *and* a
structural soma (organs on a holon substrate). An organ *is* a contract claiming one
cell of the cube; growth (`soma.js`) drifts into the sparse Ground/Pattern cells the
designer never filled — duplicating, recombining, or fusing organs, each passing its
own checkpoint and the body's re-closure before it can wire. Scarcity pays for the
organs, so structure grows when it earns its keep and is pruned when the season turns.

The floor is explicit (`constitution.js`): **core** (the alphabet) and the
**constitution** (fitness, the guard, the firewall, the log, the hidden horizon) are
frozen — the human holds the pen; **body** and **operational** are open; everything is
frozen by default. Beneath all of it, one law that cannot be tuned away: you may *dwell*
in the Void (hold an unbound thread) but may never *fabricate* from it (SYN·Ground, the
desert cell). Fitness rewards only the held thread that **later binds** — the
investigator, not the clerk — and human interaction is the strongest anchor.

Open **`evolution.html`** (`npm run serve`) to start the evolution and watch the body
grow on the cube as the season turns. And — with a Claude key — **evolve against a user**:
Claude poses a real challenge, the local model answers, Claude scores whether it was
*satisfied*, and that satisfaction (not a synthetic number) is what the population evolves
toward. It grades; it never touches a weight. Full write-up:
[`docs/organ-level-evolution.md`](docs/organ-level-evolution.md).

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
| workspace switcher → nested topic tree | `rooms/reader/app.js` — a **workspace** is the top-level container (Notion's workspace/teamspace; a shared workspace is a Matrix room, via `shared`), and **topics nest** into a collapsible tree (`parentId` / `collapsed`, walked by `topicRows`). Sources stay scoped to the active topic. |
| ingest bar (URL / file / paste / web search) | `organs/ingest` web client + admission core, `rooms/reader/import-file.js` extractors, proxy chain with public fallbacks |
| chat exchange | `turn/` pipeline (`runTurn`) — streamed, cited, fact-checked; model backends from `model/` (webllm · wllama · echo), picked adaptively |
| S-registry (sha, bytes, rights, fixity) | `organs/ingest/websource.js` records + the controller's registry |
| claim → passage pincites | the turn's `bound`/`citeOrigins`/`citeTexts` (from `enactor/ground`) |
| provenance DAG nodes/edges | derived from real turns: topic → claims → passages → sources → files |
| document viewer (click any source) | the recorded text, cited passages marked, entities clickable |
| EoT encoding (every source, any modality) | `organs/ingest/read.js` `readIngest` at record time — every admitted proposition in the canonical surface + the reading's thinking, viewable and exportable per source |
| entity explorer (right panel) | `projectGraph` entities + `perceiver` `figureSurface`; web graph via `rooms/reader/tiered-graph.js` |
| monologue steps | `rooms/audit` (`createAuditLog`) — live subscription, per-stage trail |
| E2EE chat (optional) | `rooms/chat` — libolm (vendored) Olm/Megolm over the existing `matrix` login; keys pickled to **OPFS**; a floating launcher `boot.js` mounts (see [`docs/element-e2ee.md`](docs/element-e2ee.md)) |
| encrypted media vault (optional) | `rooms/archive/vault` — save content encrypted (Web Crypto), store only ciphertext in the Matrix media repo, record each save in a tamper-evident **hash-linked block chain** on **OPFS**; `window.EO.vault` + a floating 🗄 panel (see [`docs/media-vault.md`](docs/media-vault.md)) |

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
