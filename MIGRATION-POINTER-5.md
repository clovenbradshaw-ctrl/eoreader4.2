# eoreader4.2 — pointer forward to eoreader5

Status: eoreader4.2 is now the **frozen legacy product**. It is kept as a
source of golden fixtures and parity behavior, and as an explicit
compatibility target for anything not yet migrated — it is never an
upstream runtime dependency of the new engine.

## Where the engine went

The pure semantic core of this repository — the physics (`src/core`,
minus `src/core/conventions`), the frame spine (`src/frame`), provenance
and witness (`src/attest`), the fabrication veto and grounding
(`src/enactor`), the reading holons (`src/perceiver`, minus the format
decoders), and the navigation/fold math (`src/surfer`) — has been
re-cut into holonic subassemblies under
[`eoreader5`](https://github.com/clovenbradshaw-ctrl/eoreader5)'s
`packages/engine/`. See that repository's `docs/architecture.md` for the
full repository-responsibility split and `docs/migration.md` for the
transfer sequence this pointer completes.

`src/core/conventions` (the learned register sediment, Pass-0 slot
induction, and corpus-inherited relation vocabulary) went to
[`eoPriors`](https://github.com/clovenbradshaw-ctrl/eoPriors)'s
`src/conventions/` instead — convention sets are prior-governance
material, not engine logic.

## Where the app went

Everything this repository's `dc` surface used to own at runtime — sense
organs (`src/organs`), model backends (`src/model`), the durable
substrate (`src/store`), turn orchestration (`src/turn`), generation
(`src/weave`), the product rooms (`src/rooms`), the code organ
(`src/coder`), narration/audit (`src/murmur`), visualization surfaces
(`src/surfaces`), and `src/wiki` — is app-owned per eoreader5's
`docs/architecture.md` section 2.2, and belongs in
[`eoreaderapp`](https://github.com/clovenbradshaw-ctrl/eoreaderapp)
going forward. `eoreaderapp`'s own migration backlog document tracks
which of these have actually been carried over versus still pending.

`src/metabolism` (the self-evolving-body experiment) is not part of the
product boundary either engine owns; it stays here as an archived
experiment (see `docs/organ-level-evolution.md` and
`docs/calibration-mode.md`), not carried forward.

## Why 4.2 stays put

Nothing here is deleted. `eoreaderapp` no longer names this repository as
its engine — the submodule pointing here has been retired — but 4.2's
behavior tests, golden fixtures, and design docs remain the record any
parity claim about the new engine is checked against.
