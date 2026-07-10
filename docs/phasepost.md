# Phasepost perception — the geometric reader

> The unit is the proposition. A complete SVO fills three positions — Ground,
> Figure, Pattern — one per grain, all true at once. Each position is a
> *reader's perception* of the clause, never the ground truth. The Given is the
> verbatim clause; the phasepost is **Meant**.

This document describes what this branch builds: the **geometric reader** — the
apparatus that measures a proposition into its three-position phasepost — and
the **auto-install + initialization animation** that bring it online honestly.

## The three positions

The 27 phasepost cells (`data/phasepost-cells.json`, ported verbatim from
eoreader3) partition cleanly by operator into three grain bands. A proposition
is embedded once and scored three times, once against each band:

| Position | Operators | Cells | Reads |
|---|---|---|---|
| **Ground** | NUL, INS | 6 | the terrain the clause rests on |
| **Figure** | SEG, DEF, SIG, EVA | 12 | the act that stands out against the ground |
| **Pattern** | CON, SYN, REC | 9 | the relation laid across the field |

This is the same partition `core/address.js` already infers from the operator.
A proposition can commit on one position and hold at no-commit on another.

## Classification is measurement, not choice

A cell is an **address**, read off a proposition's position in centroid space —
not a token a reader emits. The control-flow router may be a reader emitting a
route (a wrong route is cheap; no false fact enters the graph). The classifier
may not: a wrong cell ships a typed edge the talker speaks and the fold cannot
un-say. So the cell is **measured** (`src/perceiver/classify/phasepost.js`):

1. Embed the proposition (at the grain the centroids were built in — see seams).
2. Score against the 27 centroids, partitioned into the three bands.
3. Per band: argmax. Margin = own similarity − nearest competitor's.
4. Per band: commit above a floor; otherwise no-commit.
5. Demote DESERT / proven-empty cells — an argmax there is a misfire.
6. Confidence = margin × cell provenance.

The perception is **memoized** within a reader: re-perceiving the same clause
with the same instrument returns the cached reading rather than recomputing it
(the fold is not thrown away). A genuinely new perception — a warmer reader, a
moved cursor, a changed instrument — is a new reader with its own cache.

## The no-commit guard (the firewall)

The classifier measures meaning **only in the space the centroids were built
in**. The centroids are `paraphrase-multilingual-MiniLM-L12-v2`. Under the hash
embedder, the query vector lives in *spelling* space, and the cosine between a
spelling-space vector and a MiniLM-space centroid measures nothing. So the
guard — `embedder.measuresMeaning`, true on MiniLM, false on hash — short-
circuits the classifier to **all-positions-no-commit** under the hash organ.

> A verb classified by spelling is the hardcoded list with extra steps — the
> thing this design exists to avoid. **No-commit is the honest output** until
> MiniLM is the embedder and verified centroids are loaded.

## Auto-install and the initialization animation

`src/boot/` adds the two operational requirements over the borrowed machinery:

- **Auto-install** (`install.js`) — a stage machine that assembles the reader:
  `clearing → instruments → centroids → warming → ready`. Idempotent (one boot,
  one download), non-blocking (the chat is usable throughout), and **degrading,
  never failing**: each stage is wrapped, and the machine resolves to a *true*
  terminal state — live, or unavailable with a stated reason — never a thrown
  boot. The installer has no DOM and no network of its own; every effect is
  injected, so it is driven under test with fakes (`tests/boot.test.js`).
- **The animation** (`animation.js`) — the reader assembling, in the EO
  aesthetic (white ground, system monospace, 1px borders, no shadows, no
  gradients; triad accents green/violet/red + ochre). Three band elements fill
  as the instrument comes online; the five stages report the granular truth; it
  resolves to the real state and then gets out of the way (minimizes to a pill).
  See it in isolation at **`boot-animation.html`** — the same component, driven
  through every terminal state (live, and both degrades) by a scripted installer.

## Honest seams

These are stated plainly because they govern what is and is not true today.

1. **MiniLM is the precondition.** Until MiniLM is the running embedder, the
   classifier is spelling-distance wearing a cosine, and no-commit is the only
   honest output. The guard enforces this.
2. **Construction grain.** The classifier must embed the proposition the same
   way the centroids were built. The registry's attested verbs are *lemmas*; the
   per-cell clause exemplars that would build clause-grain centroids live in an
   unfetchable Drive folder (the registry's own `data_source` says so). The
   centroid bundle therefore carries `meta.construction` (`clause` | `verb`), and
   the classifier embeds its query at that grain so the cosine is measured
   in-space. Clause-level is the design target; verb-grain is a construction
   mismatch to fix by **rebuilding** the centroids, not by downgrading the query.
3. **No verified centroids ship here.** Consequently the geometric reader boots
   to **unavailable**, and the animation says so. That is correct, not a gap to
   paper over — see the guard.

## Installing verified centroids (flipping the reader live)

Drop a bundle at `data/centroids-27.json` matching `CENTROID_SCHEMA`
(`src/perceiver/classify/centroids.js`):

```json
{
  "meta": { "model": "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
            "construction": "clause", "dim": 384 },
  "vectors": { "INS_Making_Entity": [/* 384 unit-vector floats */], "...": [] }
}
```

Keys are the registry's `OP_Stance_Site`. On next boot the installer loads it
(caching to IndexedDB), the warming stage runs a first real measurement, and the
animation resolves to **live**. Nothing else changes — the apparatus is built to
receive it.

## Scope — what is next

This branch delivers the apparatus: the guard, the measurement classifier
(holding honestly at no-commit), the auto-install, and the animation. The
remaining phases from the spec:

- **The edge** (§5): replace the single `depicts.op` in `parse/relations.js`
  with the three-position perception, keeping the bond at `CON`; serialize the
  Pattern position as the arrow's relation label at the wall.
- **Readers and the fold** (§6): deposit lexical / geometric / model reader
  perceptions and weigh them at the cursor by coupling and per-position margin.

Both depend on the geometric reader actually measuring — i.e. on verified
centroids — which is why they follow this apparatus rather than precede it.
