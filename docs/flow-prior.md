# The flow prior — corpus → 16 KB → per-beat witness

A book is a **path** through shape-space, not a point. This is the loop that learns
how competent long-form prose *moves*, compresses that into a small loadable prior,
and hands it to the generation loop as a witness that knows whether each new
paragraph moves the way the corpus moves — and whether the piece is building on
schedule.

```
corpus.jsonl ─▶ eo_trajectory.mjs ─▶ trajectories.jsonl ─▶ flow_distill.py ─▶ flow-prior.json
                (parse each book,        (one 109-dim           (PCA + per-position         (16 KB,
                 segment into NATURAL      vector per section)    arc & delta stats,          provenance-stamped)
                 sections, one vec each)                          resampled onto a grid)
                                                                                    │
                            src/surfer/flow/index.js ◀──────────── loads ──────────────────┘
                            (the drop-in holon: sectionize / scoreTrajectory / flowVerdict / arcTarget)
```

## Segmentation — one vector per NATURAL section, not per grid cell

A fixed grid of *N* equal slices is arbitrary: a slice is a different-sized chunk of
reading in every document, and the delta between two slices is partly an artifact of
where the grid line fell. The reading articulates itself instead (the *born rule*).
`sectionize()` reads two signals from the event log:

- **NUL births** — a NUL fires when the text re-grounds from the void. The *start* of
  a NUL run is an **authoritative joint** (a dense opening cluster collapses to one),
  overriding everything else — these are the parts/chapters.
- **operator-mode shifts** — where the smoothed dominant operator changes (INS-heavy →
  SEG-heavy = a phase transition), gated by a minimum run so flicker doesn't cut.

NUL is a *boundary*, never a mode, so it is excluded from the dominant-operator vote.
On *Metamorphosis* this recovers 48 variable-length sections with births at sentences
**0, 289, 504** — Parts I, II, III — labelled `DEF SEG SEG INS INS SEG …`. The delta
between consecutive sections is then a **real structural transition** — the discourse
genuinely changed mode there.

`trajectoryFromDoc(doc)` defaults to this. Two other modes stay available:

| `opts` | segmentation | use |
|---|---|---|
| `{segment:'sections'}` *(default)* | the reading's own sections | book/whole-piece scoring |
| `{perSentences:N}` | a fixed *N*-sentence window | the running paragraph-at-a-time critic (short drafts have few sections, so a window gives it more points) |
| `{segment:'equal',steps:N}` or a number | *N* equal slices | legacy comparability |

## Why sections — the measured case (and one honest correction)

The prediction was that natural joints would give a *sharper manifold* than the grid.
Tested head-to-head on the same corpus (same parse, same step-math, only segmentation
differs — `tools/flow/manifold_compare.py`), the result splits:

| metric | grid-40 | sentences-12 | sections |
|---|---|---|---|
| PCs to 90% variance | 9 | 10 | 10 |
| variance @ top-10 PCs | 94% | 90% | 90% |
| **mean Δ (step-to-step)** | 0.164 | 0.316 | **0.322** |
| **mode separability** (between/within by dominant op) | 0.13 | 0.14 | **0.17** |

The raw manifold-tightness metrics (fewer PCs, higher variance-captured, lower
residual) actually **favor the grid** — but that is a *blur* artifact, not a point
for the grid: a grid cell averages over many sentences, smoothing operator variation
toward the book mean, so the cloud is artificially compact. It is tighter because it
is blurrier.

The metrics that test whether the *joints* are real both favor sections: the
step-to-step delta is **~2× larger** (0.164 → 0.322 — cutting at real joints yields
transitions twice the size of cutting mid-unit), and the sections **separate ~27%
more cleanly by dominant operator** (0.13 → 0.17). So the deltas are more meaningful
and the modes are better resolved. The manifold is not "tighter," and it shouldn't be
— a tighter grid manifold only means the grid discarded structure by averaging.

## The three layers

**1 — Extraction (`tools/flow/eo_trajectory.mjs`).** Parses each book through
`parseText`, segments it (default: natural sections), and emits one 109-dim vector
per section — `[0:9]` local operator distribution, `[9:90]` local bigram
transitions, `[90:102]` *cumulative* graph features, `[102:109]` the level-3
mode-sequence block (run, novelty, sig-row phase, echo…) — plus each section's fractional
reading position `pos`, dominant-operator label, and length. `--resume` skips
already-extracted ids and appends, so a large pass is interruptible for free.

**2 — Distillation (`tools/flow/flow_distill.py`).** Sections are variable-count per
book, so the per-position statistics resample each book onto a canonical position
grid (`--grid`, default 24) by `pos`, while the manifold and the delta distribution
pool the sections directly (order-free). The prior:

- **manifold** — PCA mean + top components + explained variance + residual quantiles.
- **buildArc** — per-grid-position mean/sd of each cumulative graph feature.
- **delta** — per-grid-position mean/sd + global quantiles of *section-to-section* change.
- **sections** — section-length quantiles, sections-per-book, and the dominant-op mix
  + transition matrix (the INS↔SEG alternation, measured).
- **books** — book-level flow-score quantiles.

Provenance-stamped: corpus size, segmentation, grid, source SHA-256, timestamp.

**3 — The scorer holon (`src/surfer/flow/index.js`).** Pure JS, zero imports, browser-safe.
`trajectoryFromDoc(doc)` takes the same `doc` `parseText` returns and returns steps +
`pos`; `scoreTrajectory(prior, steps, pos)` maps each section to the prior's grid by
reading position, so a variable-count trajectory aligns to a fixed prior.

## The shipped prior (provenance & honesty)

`data/flow-prior.json` is a **bootstrap** prior distilled from **36 public-domain
Project Gutenberg books** (natural sections, `--min-sent 300`, grid 24, top-10 PCs).
Section length median ~14 sentences; the dominant-op mix is **INS 48% · SEG 39% ·
SIG 10% · DEF 3%** — the introducing/segmenting alternation as a corpus statistic (NUL
is a boundary, not a label). The 109-dim step vector stacks three holon levels —
L1 local operator state (90) · L2 cumulative graph (12) · L3 mode-sequence rhythm (7).
Top-10 PCs capture **79%** of section variance; the whole model is **16 KB**.

**What is trustworthy at 36 books (split-half agreement, `manifold_compare` sibling):**
the build-arc (Pearson r≈0.99) and the manifold mean (r≈0.99) are stable — they are
not artifacts of which books were sampled. The per-position **delta profile is not**
(r≈0.4–0.6): the "lurch" signal is high-variance at this corpus size. So lean on
arc-adherence and manifold-residual; treat the delta axis as a coarse global signal
until the corpus is much larger.

It is deliberately **not** definitive: it encodes *its* corpus (19th–early-20th-c.
narrative). Regenerate for any register (retains no text — only statistics):

```
node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader . --sample 0 --resume
python3 tools/flow/flow_distill.py trajectories.jsonl --min-sent 300 --grid 24 --out data/flow-prior.json
```

## Wiring into eoreader4.1

The load-and-thread weld is **built** (`src/surfer/flow/select.js` → `loadInstalledPrior`,
zero-caller no longer). The live essay walk (`src/weave/longgen/walk.js`, the path the
reader drives) now takes a `flow` bundle; the reader wires it by default (OBSERVE),
with token-shaping behind a rev flag (SHAPE).

| Hook | Call | What it adds | State |
|---|---|---|---|
| `src/surfer/flow/select.js` | `loadInstalledPrior({ lang, domain, register }, { base, read })` | Resolves an installed prior by facets (`selectPrior` → fetch → `loadPrior`); null-safe. `{lang:'en'}` → `mixed-en-pooled`. | **live** |
| `src/weave/longgen/walk.js` | `walk({ …, flow: { prior, parse, perSentences } })` | OBSERVE: each accepted paragraph re-parses the running draft (`parse` is the **injected** in-organ accessor — the engine stays amodal), scores the last section, and rides a per-beat flow record + a whole-piece `res.flow` roll-up on the trace. Changes **no** tokens. | **live** (reader wires it) |
| `src/weave/longgen/walk.js` + `render.js` | `walk({ …, flow, flowShape: true })` | SHAPE: the arc-demanded move (`arcGapMove`) is fed into the beat prompt as one soft directive (`Move for this paragraph: …`). The only token-changing hook. **A/B on a real small model found this NEGATIVE** — it did not improve prose and modestly hurt it (`docs/flow-shaping-ab-2026-07.md`); on a weak model `SYN`/`REC` directives induce restatement. Keep off. | **rev-flag, default-off (tested negative)** |
| `src/weave/write/witness.js` | `witness(text, expect, source, fold, { flow: { prior, prevStep, doc } })` | Per-beat flow verdict on `w.flow` for the `src/weave/write/*` enacted-writer path (a separate walk from the reader's essay path). `ok` unchanged. | built, opt-in |
| `src/weave/longgen/audit.js` | `exportAudit(result, { flow: { prior, doc } })` | Whole-piece `audit.flow` for the harness export. | built, opt-in |

Reader wiring (`app.dc.js:_walkReply`): `const flow = await this._flowBundle()` loads
`mixed-en-pooled` once (memoized; null if the registry isn't served) and pairs it with
`this.E.parseText` as the accessor; the walk's `res.flow` is surfaced as a `flow` audit
stage. `flowShape` stays off — the reader witnesses its build live, and steering is the
deliberate next flip. Browser load path: `loadInstalledPrior` fetches
`data/flow-priors/index.json` via `new URL(rel, document.baseURI)`.

**Parity contract:** with no prior (registry unserved) or `flow` unset, `walk` and
`renderContinuation` are byte-identical to before — pinned by `tests/flow-walk.test.js`
(observe changes no tokens; the empty directive is a byte-identical prompt).

## Validation (36-book prior, this repo)

Scoring the corpus against its own prior ranks *The Prince*, *Grimms' Fairy Tales*,
*Emma*, *Moby Dick* smoothest and *An Occurrence at Owl Creek Bridge* (206
sentences), *Meditations*, and *The Turn of the Screw* most lurching — aphoristic and
argumentative texts genuinely change mode more often; steady narratives don't. Owl
Creek Bridge topping the list is the `--min-sent` caveat in miniature: a short text
has too few sections for its section-to-section deltas to be stable.

## Two things you now own

1. **The prior encodes its corpus.** A Gutenberg-1900s prior scores a modern or
   avant-garde writer as deviant because they *are* deviant relative to it. Distil
   register-specific priors for your actual targets.
2. **The thresholds (p90 / p95) are defaults, not truths.** Tune them once the
   witness is wired and you can feel the flags. The one test only you can run:
   machine flags vs. your editorial eye.
