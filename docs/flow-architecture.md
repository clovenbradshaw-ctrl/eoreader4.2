# The flow pipeline as the operator cycle

The flow-prior system is not bolted onto eoreader — it *is* eoreader's own nine
operators run once over a corpus. Each stage is the operator it enacts, and the whole
reads as the three triads of the significance cycle. The last operator, REC, closes
the loop: the generation loop meets its own output and feeds back to the parse.

```
GROUND triad — establishing what exists
  NUL  the void        the raw corpus as undifferentiated potential   (Gutenberg / HF, ~3,400 books)
  SIG  acquisition     pointing at sources, selecting what enters      (books2.py, dump_corpus.py — external)
  INS  parsing         instantiating structure from raw text           eoreader parseText() → log.events · sentences · mentions

STRUCTURE triad — articulating how it's organized
  SEG  segmentation    the text divides itself at its own joints        sectionize(): NUL births (primary) + mode shifts (secondary)
  CON  relating        per-section vectors at three holon levels        109-dim: L1 local(90) · L2 graph(12) · L3 mode-seq(7)
  SYN  synthesis       sections merge into a trajectory                 trajectories.jsonl: [step₁…stepₙ] + sections + l3summary

INTERPRETATION triad — making it mean something
  DEF  definition      asserting what "normal flow" is                  flow_distill.py → flow-prior.json (PCA manifold, arc, deltas)
  EVA  evaluation      judging text against the defined norm            flow_analyze.py (smooth/lurching) · atlas_diagnose.py (external)
  REC  recurrence      the system meets its own output, feeds back      write/witness.js · longgen/shape.js · longgen/audit.js  ─┐
                                                                                                                              │
                        └──────────────────────────── feedback to INS (parse the draft) ──────────────────────────────────┘
```

## Where each stage lives

| Op | Stage | In this repo | Notes |
|----|-------|--------------|-------|
| **NUL** | the corpus | `corpus.jsonl` (you build it) | one `{id,title,text}` per line |
| **SIG** | acquire/select | — (external `books2.py` / `dump_corpus.py`) | stream, filter, assign ids |
| **INS** | parse | `src/perceiver/parse/` (`parseText`) | events, sentences, mentions |
| **SEG** | segment | `src/surfer/flow/index.js` → `sectionize()` | born-rule; also `tools/flow/eo_trajectory.mjs` |
| **CON** | relate | `src/surfer/flow/index.js` → `trajectoryFromDoc()` | the 109-dim three-level vector |
| **SYN** | trajectory | `tools/flow/eo_trajectory.mjs` | writes `trajectories.jsonl` |
| **DEF** | prior | `tools/flow/flow_distill.py` → `data/flow-prior.json` | the manifold + arc + delta norms |
| **EVA** | judge | `tools/flow/flow_analyze.py` (+ `flow_scorer.mjs`) | ranking + manifold; `atlas_diagnose.py` is external |
| **REC** | the loop | `write/witness.js` · `longgen/shape.js` · `longgen/audit.js` | `flowVerdict` · `arcTarget` · `scoreTrajectory` |

## The CON level in detail — three holon grains in one vector

A section is not one thing; it is a holon read at three grains, stacked into the
109-dim step vector:

- **L1 — local state (dims 0–89).** What is happening *here*: the operator
  distribution (9) and the bigram transition matrix (81). The section's own texture.
- **L2 — cumulative graph (dims 90–101).** What has been *built* by here: entity
  density, relation density, coref, hub share, spans — the accumulating structure.
- **L3 — mode sequence (dims 102–108).** The section's place in the *rhythm* of
  sections: current run length, local mode entropy, mode/transition novelty,
  significance-row phase, structural echo of the opening, and variety acceleration.
  This grain is only visible at the scale of sections-as-units — the holon *above* the
  section — and the per-book `l3summary` (overallEntropy, maxRun, transDiversity,
  palindrome, arcOrder) is its whole-trajectory read.

## The REC feedback

REC is why this is a loop and not a pipeline. The generation hooks read the prior
(DEF) to judge each beat, and a rendered beat re-enters as text to be parsed (INS) —
the system perceiving its own production. `write/witness.js` runs the per-beat
`flowVerdict`; `longgen/shape.js` reads `arcTarget` for the phase schedule;
`longgen/audit.js` ships `scoreTrajectory` with the finished piece. See
`docs/flow-prior.md` for the wiring and `docs/flow-exemplar.md` for conditioning on a
single exemplar.
