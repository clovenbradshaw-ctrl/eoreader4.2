# EO compliance — the 2026-07 assessment, and the repair

An audit of how faithfully the stack complies with its own laws — Law 1 and
Law 2 (docs/eo-for-coders.md), the single fact and the anti-patterns
(docs/architecture.md), the holon law (docs/holons.md) — followed by the
repair that this assessment shipped with. The method: read the laws as a
rubric, check the code mechanically where a law is mechanical (import graph,
file census, registry reachability, emitted-vs-declared operators), read the
code where it is not, and refuse to count prose as enforcement. A law
restated in a comment is documentation; a law a test can fail is a checkpoint
(the two laws are one law seen twice).

## The scorecard

| stated law | verdict | evidence |
|---|---|---|
| contracts well-formed, 100% coverage, on the diagonal, no desert cell | **holds** | `tests/contracts.test.js` — and it genuinely walks the live tree, so a new module without a manifest fails loudly |
| the append-only log is the source of truth | **holds** | `core/log.js`: append is the only mutation, events are frozen, retraction is a SEG event; no splice/pop/index-assign against event arrays anywhere in core/frame/store |
| the confabulation guard, live | **holds** | `coherence()` (core/cube.js) is invoked at `enactor/factcheck/correspond.js` inside the turn pipeline — the one doctrine that was already enforced end-to-end, not just stated |
| the frozen floor | **holds** | `metabolism/constitution.js`: explicit bands, frozen by default, `Object.freeze` throughout; the desert cell is unreachable by evolved organs (`contract()` rejects SYN·Cultivating at runtime in `metabolism/organ.js`) |
| Law 1: "the kernel checks every event the part emits against its declared contract" | **did not hold — partially repaired** | the merged registry (`core/contracts.js`) is imported by nothing in the running stack; only the test reads it. Runtime enforcement exists only where the metabolism and the coder build contracts for evolved organs. Repair: `tests/op-fidelity.test.js` now proves every literally-emitted `op:` is on the emitter's declared Act face — static, but a real fidelity check where before there was none. 24 modules emitted operators their contracts never declared; 14 were true emissions (contracts corrected to declare them), 10 were descriptions (exempted, each with its reason in the test) |
| Law 2 / holon law: "no holon imports another's internals — only its index.js" | **did not hold — fully repaired** | 205 imports reached past an entrance, 182 across faculties. Repair, in two passes: first the membrane and the structural cases were healed and the 195 survivors DECLARED in `src/core/seams.js` (§7.5 applied to the import graph: a crossing is legal when declared; the sin was crossing silently); then every declared seam was healed — routed through its holon's entrance, with the entrance re-exporting what neighbors legitimately need — and its row deleted. The registry now stands EMPTY at zero and `tests/boundaries.test.js` keeps it there: an undeclared deep import fails loudly, in src and in the HTML surfaces alike |
| "core cannot import anything" | **did not hold — repaired** | `core/conversation-fold.js` imported `frame/` and `perceiver/parse/` — the floor reaching upward. It now lives at `frame/conversation-fold.js` (it projects THROUGH the frame spine; that is where it always belonged), core's entrance no longer re-exports it, and core purity is pinned by a dedicated test |
| the ONE surface membrane (`rooms/reader/boot.js`) | **did not hold — repaired** | the membrane itself pierced five holons (`perceiver/reading.js`, `enactor/ground/spans.js`, render, plain, chat internals) and `rooms/archive` had no entrance at all. Every membrane import now lands on an entrance (`archive/`, `render/`, `plain/` gained their index.js; chat's entrance now covers its mounts), pinned by a dedicated test |
| audit: "a pure ring buffer with no transitive imports outside itself" | **did not hold — repaired** | `rooms/audit/eot-terminal.js` imported `core/faces.js`. `notate` is now injected by the caller (`opts.notate`); the audit holon imports nothing outside itself |
| "no god module — no file over ~250 lines" | **does not hold — recorded, not repaired** | 130 of 606 src modules exceed it. `rooms/reader/app.js` is 5,034 lines — one file, larger than the 5,029-line `app.jsx` the 4.x refactor set out to dissolve; `turn/stages.js` is 1,756 against the "no 760-line orchestrator" boast. Splitting these is a refactor, not a repair; doing it as a side effect of a compliance pass would be a Tempus emission. It is the largest open item on the worklist |

## What this change did

1. **Moved the conversation fold to the frame holon.** Core is again the
   frozen bottom: nothing under `src/core/` imports outside it, and
   `tests/boundaries.test.js` fails if that ever regresses. Consumers import
   the fold from the frame entrance.
2. **Made the membrane exemplary.** `rooms/reader/boot.js` — the one seam the
   surface stands on — now imports only holon entrances. `rooms/archive/`,
   `rooms/render/`, `rooms/plain/` gained the entrance the holon law always
   required of them; `rooms/chat/index.js` now covers its mount surface;
   `rooms/research/` reaches the archive pins through the archive entrance.
3. **Made the audit self-contained.** The EOT terminal takes `notate` by
   injection; without it the ledger line simply omits the faces.
4. **Made the Act face truthful.** Fourteen contracts now declare the
   operators their modules actually emit (the hearing that edits itself
   really does fire REC·INS·DEF; the EOT ingester materializes all nine).
   `tests/op-fidelity.test.js` holds the line from here on.
5. **Declared the seams, then healed every one.** `src/core/seams.js` first
   carried the 195 surviving deep imports, one row each; each was then routed
   through its holon's entrance (the entrances re-exporting, under a
   `(seam healing)` banner, what their neighbors legitimately need) and its
   row deleted. The registry now stands empty. Redundant registrations went
   with it — `model-entry.js` no longer side-effect-imports five backends the
   model entrance already registers. The auxiliary HTML surfaces (evolution,
   plain, render, replay) were healed the same way — `replay/` gained its
   entrance — and `tests/boundaries.test.js` now walks BOTH graphs: no
   undeclared crossing lands in src or in a surface, no stale row survives,
   core stays pure, the membrane stays on entrances. A future deep import
   fails until it is routed through the entrance or deliberately declared,
   with a reason, in review.

## The second pass (same month)

6. **Law 1 gained its runtime mechanism.** `createLog` takes an injected
   `contractOf` resolver (core still imports nothing — the registry, which
   aggregates every manifest, rides the ONE declared seam boot holds);
   `append` takes the emitter's self-identification (`meta.src`), and a
   mismatch between the event's op and that module's declared Act face is
   RECORDED on the sealed event (`law1`), collected by the log, never thrown.
   No resolver or no `src` seals byte-identically, so adoption is incremental.
   First adopter: the parse orchestrator tags the 21 events it authors, and a
   real parse against the real registry runs violation-free
   (`tests/law1-runtime.test.js`).
7. **The turn orchestrator was split along the fold's own seams.**
   `turn/stages.js` (1,756 lines) became eight group files — read · fold ·
   decide · prompt · llm · bind · revise (+correctives) · close — plus
   `stage-support.js`, every one under 250 lines, every method verbatim. The
   assembler that remains delegates at CALL time on purpose: the import graph
   carries a legal cycle (intent → longgen → arc → turn/index → stages), and
   an eval-time merge would TDZ on it.
8. **The reader controller was opened, and the law got a ratchet.** The
   pre-closure helpers of `rooms/reader/app.js` moved to `app/` (net · kv ·
   guards · util). The closure itself (4,700 lines, 33 banner sections, 266
   definitions) resists verbatim splitting: a scope-blind cut cannot tell a
   closure `let` from its dozens of local shadows (`text`, `model`, `q`…) —
   decomposing it safely needed an AST-scoped pass. Meanwhile
   `tests/size-ratchet.test.js` gives the "no file over ~250 lines" law
   mechanical teeth: no file off the baseline may cross 250, the pinned
   offenders may only SHRINK, and a healed file's row must be deleted.
9. **The reader closure was then decomposed, AST-scoped.** With real scope
   analysis (acorn + eslint-scope over the closure), every banner section
   became an `install(appCtx)` module under `app/` — 33 sections + the
   public membrane (`api.js`) — with the section bodies VERBATIM: references
   into a sibling section are rewritten (scope-exactly, shorthand properties
   included) to ride `appCtx` at call time; the core spine (state · emit ·
   the trail beats · the web client) is destructured once at install; and
   the 18 genuinely shared mutables (the mint counters, the turn's
   abort/stallGuard, the live model handle, the wedge streak, the warm
   MiniLM…) live ON `appCtx`, because a published snapshot of a reassigned
   `let` goes stale — chat's `stop()` must see the LIVE controller the
   ingest section armed. `app.js` is now the 234-line assembler: the state,
   the ctx, thirty-three installs in the closure's original order, and
   `buildApi(appCtx)`. Four verbatim sections (chat · deep · model ·
   toplines) are still over the line and enter the ratchet's pin list at
   their birth size — they may only shrink.

## The open worklist, honestly

- ~~**The reader closure.**~~ Done: decomposed AST-scoped into 33 section
  modules + the api membrane; the assembler is 234 lines. Four verbatim
  sections (chat 639 · deep 363 · model 328 · toplines 297) remain pinned
  and may only shrink.
- **Law 1 adoption.** The emit-time check is live but opt-in per emitter;
  the parse orchestrator is the first adopter. Each faculty can self-identify
  its authored events (`append(event, { src })`) at its own pace — the
  registry resolver is already at the chokepoint.
- ~~**The seam registry.**~~ Done: healed from 195 to zero (one declared row
  remains, with its reason: the conformance registry itself cannot ride
  core's entrance); the boundary test keeps it that way.
