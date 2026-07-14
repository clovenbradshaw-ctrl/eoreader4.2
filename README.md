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
    ingest/        surface → EO tuples; the web/library shelves + feeds, JSON/REST APIs, and
                   civic-data discovery (RSS/Atom, CKAN, Socrata — docs/civic-apis.md)
    code/          code → EOT → issues from the dependency order (docs/code-organ.md)
  perceiver/     reading — text → event log → the three reading levels
    parse/  predict/  credence/  classify/
  surfer/        relating — navigation over what the reading maintains
    retrieve/  fold/  flow/  dag/  reason/
    lineup/        a chorus of surfers — the nine-operator cast, cooperative + evolutionary (docs/cooperative-graph-surfers.md)
  enactor/       gating — nothing is asserted that the record can't witness
    enact/  ground/  factcheck/  answer/
  model/         the leaf — backends (webllm, wllama, claude API, qwen-coders,
                 lmstudio/ollama local servers, echo), prompt, stream
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
| ingest bar (URL / file / paste / web search) | `organs/ingest` web client + admission core, `rooms/reader/import-file.js` extractors, proxy chain with public fallbacks. A **video** reads as two senses — the picture as motion + **born-rule entity detection** (`organs/in/motion.js`), the sound as a transcript — folded onto one source (`docs/video-ingest.md`) |
| Libraries launcher → per-shelf search surface | `organs/ingest/libraries.js` — four easy search libraries, each with the surface its kind of thing deserves: **Wikipedia** (articles), **Project Gutenberg** (whole books), **Wikimedia Commons** (a media grid), **GitHub** (repos, with **Ingest code** → the code organ). One descriptor registry the surface reads to render each hit as a card shaped for the thing (`docs/library-search.md`) |
| chat exchange | `turn/` pipeline (`runTurn`) — streamed, cited, fact-checked; model backends from `model/` (webllm · wllama · claude · lmstudio · ollama · echo), picked adaptively |
| S-registry (sha, bytes, rights, fixity) | `organs/ingest/websource.js` records + the controller's registry |
| claim → passage pincites | the turn's `bound`/`citeOrigins`/`citeTexts` (from `enactor/ground`) |
| provenance DAG nodes/edges | derived from real turns: topic → claims → passages → sources → files |
| document viewer (click any source) | the recorded text, cited passages marked, entities clickable |
| EoT encoding (every source, any modality) | `organs/ingest/read.js` `readIngest` at record time — every admitted proposition in the canonical surface + the reading's thinking, viewable and exportable per source |
| entity explorer (right panel) | `projectGraph` entities + `perceiver` `figureSurface`; web graph via `rooms/reader/tiered-graph.js` |
| monologue steps | `rooms/audit` (`createAuditLog`) — live subscription, per-stage trail |
| E2EE chat (optional) | `rooms/chat` — libolm (vendored) Olm/Megolm over the existing `matrix` login; keys pickled to **OPFS**; a floating launcher `boot.js` mounts (see [`docs/element-e2ee.md`](docs/element-e2ee.md)) |
| encrypted media vault (optional) | `rooms/archive/vault` — save content encrypted (Web Crypto), store only ciphertext in the Matrix media repo, record each save in a tamper-evident **hash-linked block chain** on **OPFS**; `window.EO.vault` + a floating 🗄 panel (see [`docs/media-vault.md`](docs/media-vault.md)) |
| shared workspaces + shared vault (optional) | `rooms/archive/room-vault` — a **workspace is an invitable Matrix room**; everything saved into it is stored as an **encrypted, hash-linked blockchain, in binary, in Matrix**, decryptable by **only the room's members** (the block's key rides a Megolm room event). The room timeline is the ledger's ordering, so every member's chain **converges**; room messages carry the updates, `sendSignal` the nudges. `window.EO.spaces` (see [`docs/shared-vault.md`](docs/shared-vault.md)) |
| sync to Matrix (optional) | `rooms/archive/space-sync` — one per-workspace **opt-in** (default OFF) that mirrors a workspace's sources into its room's encrypted blockchain, opening the room first if needed; content-addressed + debounced so an unchanged source is never re-uploaded. `window.EO.spaces.setSync` / `.sync` |

## The plain version — the algebra, worn as three questions

Open **`plain.html`** (`npm run serve`) for the same engine with **nothing named to the person** —
not "operator", not "terrain", not "resolution", not once. It rests on one rule: *the person never
chooses a terrain, because the thing they clicked already is one.* A name is an **Entity**, an arrow
is a **Link**, a quoted phrase is a **Lens** — and a terrain sits in exactly one domain, and a domain
has **exactly three operators**. So a click yields **exactly three questions**, always: they are not
curated, they *are* `operatorsByDomain(domain)` wearing plain-English coats (`src/rooms/plain/terrain.js`).

The person experiences that as restraint; it is arithmetic. `tests/plain-terrain.test.js` pins that the
three questions of a kind are exactly its domain's three operators, and that the §9 addresses
(`SIG(Entity, Binding)`, …, `REC(Paradigm, Composing)`) are the ones the design lists. The only two
things that move under the hand — reading a word under a basis ("surveillance" → a line item under the
budget, a thing-done-to-people under the court filing) and re-centering the picture — are pure folds
(`src/rooms/plain/select.js`), reversible and pinned by `tests/plain-select.test.js`. The ✱ cards
(*When people changed their minds* · *Blind spots*) are the ones no tool without **REC** and a **typed
void** can build. The worked corpus is `src/rooms/plain/scene.js`; the framework-free surface is
`surface.js`, the same room idiom as Replay and Render.

It is also a **screen in the main app** — the **Plain** tab in `index.html` (mounted the same way the
Graph tab hosts its draw, via `window.EO.plain`). There the surface reads the person's **real ingested
sources**: "People mean different things by this" is not a table but a projection of what the documents
actually say. `src/rooms/plain/disagreement.js` reads each source's own sentences — every "X is a Y",
"X, a Y,", "X was described as Y", "X means Y" — buckets the characterizations by head-noun into distinct
meanings, and tallies each per source; `select.readAs` then re-reads the word under any one source as a
basis. `src/rooms/plain/project.js` is the live bridge (`window.EO.app` + `perceiver/parse`), folding the
perceiver's own coref-resolved copular DEFs in on top of the surface sweep. It is tested on real text
across three genres — **non-fiction** (a civic procurement, "surveillance"), **fiction** (two narrators,
"the monster"), and **academic papers** (one word, three disciplines, "power") — in
`tests/plain-disagreement.test.js`, with the engine path pinned end-to-end in `tests/plain-project.test.js`.

## Replay — watching something get read

Open **`replay.html`** (`npm run serve`) for a surface built on one rule: **no ingest organ
returns an answer — it returns a distribution.** Whisper does not hand back `"drones"`; it hands
back `drones .71 / drums .19 / drives .10`, and the collapse to one word happens later, at *read*
time, against a corpus. So the collapse can be run again, differently, by turning a source off —
and the model never runs twice.

The page is a facing read: **what arrived** on the left, **what it's making of it** on the right,
scrolling together at reading speed (1× is not real time — it is the pace a person can follow the
reading). Every uncertain word carries a mark; click it and the distribution opens, with the honest
line — *the sound was ambiguous, the corpus wasn't.* The **Reading against** panel is a set of
switches: flip one and the words re-collapse in front of you (nothing is re-transcribed — the audio
never moves, only the reading), and **itself only** reads the audio against nothing, the transcript
with every corpus assumption stripped out. The attention field, the surprise strip, and the
self-drawing graph are all projections of the same fold.

The engine (`src/rooms/replay/`) is the whole thesis made mechanical: `collapse.js` is a **pure fold**
on `(scene, enabled, cursor)` — `weight = acoustic · (base + Σ corpus counts over enabled sources)`,
normalized, argmax — the same fold-decides discipline as `enactor/enact/replay.js`. The collapse is
arithmetic; it is reversible; it is auditable; and `tests/replay-collapse.test.js` pins it (all sources
on ⇒ `drones .71`; MNPD off ⇒ `drums .43`; itself-only ⇒ the microphone alone). **Report the
distribution. Never the decision.**

## Render — write HTML/JS, see it live

Open **`render.html`** (`npm run serve`) for the **facing-page WYSIWYG renderer** — the companion to
the code shelf. The source (HTML · CSS · JS) on one side, the **live render** on the other: type on
the left, the right pane re-renders, executing the HTML and the JavaScript, with a console strip
under it showing every `console.*` and every thrown error. It is the replay idiom — source facing
what it becomes — pointed at code. The engine (`src/rooms/render/`) is a **pure fold**
(`facing.js`: panes → one sandboxed `srcdoc` + a console-capture shim, pinned by
`tests/facing-render.test.js`) and a framework-free DOM surface (`surface.js`). Load a raw GitHub
file with `render.html?src=<url>`, hand a source in from the reader via `window.EO.render.open(...)`,
or start from the built-in demo. The iframe is sandboxed `allow-scripts` (no same-origin) so the
rendered code runs its own JS but can't reach the page. Full write-up: [`docs/library-search.md`](docs/library-search.md).

## Run the big models locally (LM Studio / Ollama)

The in-browser backends (`webllm`, `wllama`) run the weights *inside the tab*, so
they top out at a few billion parameters. To use the **large** open models — the
27–80B Qwen coders in the picker, GLM, DeepSeek — run them in a native server on the
same machine and point the tab at it. The reader speaks the OpenAI
`/v1/chat/completions` protocol, which both **LM Studio** and **Ollama** expose, so
connecting is one click on the model chip.

It is deliberately **dead simple** — you never type a model id. Pick the backend and it
asks the server what's loaded and uses that (auto-discovery). Re-pick the active one to
point at a non-default port or a LAN box.

**LM Studio**
1. Load a model (e.g. a Qwen3.6 / Qwen3-Coder-Next GGUF).
2. **Developer → Start Server** (default port `1234`); leave **Enable CORS** on.
3. On the model chip, pick **LM Studio · local server**. Done.

**Ollama**
1. Pull a model: `ollama pull qwen3-coder-next` (or `qwen3.6:27b`, `codestral`, …).
2. Start it so the browser is allowed to reach it: `OLLAMA_ORIGINS=* ollama serve`.
3. On the model chip, pick **Ollama · local server**. Done.

Nothing leaves your machine — the tab talks only to `localhost`. (An https page is
allowed to call `http://localhost` because browsers treat localhost as trustworthy.) If
the server isn't reachable, the chip says exactly what to fix. Advanced pins live in
`localStorage`: `eo_lmstudio_base` / `eo_ollama_base` (URL), `eo_lmstudio_model` /
`eo_ollama_model` (force a specific model), `eo_{lmstudio,ollama}_key` (a gateway bearer).

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
