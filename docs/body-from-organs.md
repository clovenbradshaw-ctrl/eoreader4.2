# The body from the organs — four seams closed

The audit that started this work found finished organs with no wiring between them:
`core/self` and `enactor/monitor` defined the self/world line and nothing ever ran it
(zero call sites); the gate cast efference copies nothing held; `answerVoid`'s typed
absence was computed and its prose discarded; `core/surprise.js`'s forward distribution
said in its own header it was "not yet wired into the predictive score"; the metabolism
graded itself on a judge's taste with no connection to the surprise currency; and every
record of assertion-and-correction lived in a ring buffer that drops off the front.

A body is a set of organs that have learned to predict each other. This change is the
wiring — four seams, each closed with the organs already on the bench.

## 1. The honesty seam — self and void reach the voice

**The void reaches the voice** (`turn/stages.js` `absence`, stage 17 of 18). The
`answerable` stage already measured the field's absence (`voidMeasure`) and let the
talker speak anyway so the diagonal guard could adjudicate (P0.2). Now the typed
absence prose rides beside the measurement (`voidText`), and after bind, factcheck,
revise, and veto have all had their chance, a turn whose answer earned **no witness at
all** — no lexical citation, no graph-earned citation — at a measured void ships the
typed absence instead of the invention: *"Zorro" is not in this document.* The draft is
preserved beside it in `revisions` (the SEG/retract law — correction beside error,
nothing unwritten), the turn is `gated`, and a non-refusing `void-asserted` flag says
what happened. A talker that already abstained in its own words keeps them; a turn with
any citation ships untouched; streaming and stopped turns are exempt.

**The self line runs live** (`enactor/selfline.js`, threaded through `turn/pipeline.js`).
One monitor per session (`rooms/reader/app.js`), one self model, every modality. Each
turn the voice COMMITS: the answer's propositions are cast as efference copies and held
outstanding. Each turn the world RETURNS: the next question is sensed against the
copies, and the line is drawn —

- **SELF** — the user handed back what the voice itself said. Attenuated, and flagged
  (`self-echo`): my own words returning are not independent confirmation. You cannot
  tickle yourself; the voice cannot corroborate itself through the user's mouth.
- **SELF_MISMATCH** — the user pushed back on a committed claim (same figures, diverged
  relation). News, a `self-corrected` flag, and a correction the ledger records.
- **WORLD** — unbidden, the ordinary case.

Sense-before-commit keeps the line causal: a turn can never match its own output. The
outstanding window is bounded (`monitor.expire`), and an expired copy — a commitment
whose predicted return never came — is surfaced to the ledger as never-witnessed, not
silently dropped.

## 2. The truth seam — surprise wired to selection

`metabolism/foresight.js`. Fitness's operational anchor was the judge's taste — a model
grading grounded/flowing prose — and taste is the one thing reality never grades. Now a
turn that carries its arrival sequence (`outcome.arrivals`) is graded on **predictive
skill against a reality that supplies its own answer key**: the running genome's
`gamma` (the attention-horizon gene) builds a γ-decayed profile over the prefix of what
actually arrived, and the held-out tail prices each return at −log₂ p(arrival) under
the profile's own forward distribution — `forwardDist`, the forward object
`core/surprise.js` reserved for exactly this, wired into a predictive score at last.

Skill is measured against the same reader with **no horizon** (γ = 0), so it prices
exactly what the gene claims to buy: how much remembering helps. Only returns are
graded — in an open alphabet a never-seen atom carries no discriminative signal, so
pure novelty grades `null` (an absent anchor, never a fake one), and a forgotten atom
must be found in the reserve split across everything the reader forgot (an unsplit
reserve would let amnesia grade as calibration). Measured on a distance-4 motif:
γ=0.5 → 0, γ=0.7 → 0.02, γ=0.9 → 0.21 — a real gradient for selection to climb.

In `fitness.js` the result (`outcome.foresight`) is a new un-authored anchor, `world`,
that **outranks the judge** — only the human outranks the world. `metabolize` computes
it automatically when arrivals ride the outcome; the research answerer
(`metabolism/answerer.js`) now returns the kept pages' arrival sequences, and the
challenge cycle carries them through, so an evolve turn is graded by what it predicted,
not only by what a judge believed.

## 3. The omnimodal seam — one more jack was the currency itself

The in-membrane already had the jacks (`organs/in`: text, image, audio, music, video,
codons, code…), all emitting the same operators onto the same log with the same
per-unit index. What was plugged into the *currency* was only text. `arrivalsOfDoc`
reads the arrival sequence off the log itself — adapter-blind — so the same foresight
grading runs on a melody as on prose (proven in `tests/body-seams.test.js`), and the
one monitor's copies were already propositions, not organs. The seam turned out to be
cut exactly as the design intended: closing the truth seam closed this one with it.

## 4. The ledger seam — the external spine

`enactor/ledger.js` (`createCommitmentLedger`). The audit ring and the EOT ledger record
assertion and self-correction, and both are in-memory rings. This is the durable spine:
an append-only record of every turn's public word — each claim marked as a **relay** of
the record (cited) or **authored** in the system's own name (uncited) — and every
correction appended *beside* what it corrects, never over it:

- `revision` — the engine superseded its own draft mid-turn
- `contradicted` — the record denied a committed relation
- `self-mismatch` — the world (the user) pushed back on an earlier commitment
- `absence` — the typed absence replaced an unwitnessed draft at a measured void
- `expired` — a commitment's predicted return never came

The reader session serializes the ledger into its IndexedDB snapshot beside the topics,
so the record survives reload — a memory answerable to its own past, exportable as
JSONL (`app.ledgerExport()`), readable from the surface (`app.ledger()`,
`app.selfModel()`).

## What to watch at the joins

The tests (`tests/body-seams.test.js`) pin each seam, including the original flail:
a fluent confabulation about a figure the corpus never mentions now ships as the typed
absence with the draft in the trail. The parts have started betting on each other —
the monitor leans on the parser, the ledger on the monitor, selection on the reading's
own forward distribution. Where a bet is wrong, it is now wrong *on the record*.
