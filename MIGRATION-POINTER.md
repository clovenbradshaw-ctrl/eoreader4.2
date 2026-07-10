# EO Reader 4.2 — pointer back to 4.1

4.2 is the **holonic refactor** of 4.1: the same engine, re-cut along its faculty
seams into a nested tree (see `README.md` for the map), under a new dc surface,
carrying only the essential content.

## Where the rest of 4.1 went

This repository is deliberately lean. The exhaustive history — the full test
battery, the ~80 design docs, the eval harnesses and tools, the frozen 4.1 shell
— was **left behind in 4.1 on purpose**, not lost. When you need the reasoning
behind a holon, the behavior pin for a module, or the prose that names a
mechanism, go to 4.1:

- **Repository:** `clovenbradshaw-ctrl/eoreader4.1`
- **Its own assembly map:** `MIGRATION-POINTER.md` there, and
  `docs/UPGRADE-4.1-MANIFEST.md` for the full reachability trace.

## What 4.2 keeps

| kept here | why |
|---|---|
| `src/` (nested holon tree) | the engine — the product |
| `tests/contracts.test.js` | the EO conformance checkpoint — 100% coverage, cube coherence, enforced every run |
| `tests/smoke.test.js` | proves the migrated tree resolves and the reading spine runs |
| `docs/eo-for-coders.md` | the one law the contracts implement (Law 1: the cube) |
| `data/` (5 files) | only what the engine fetches at runtime: centroids-27, exemplars, flow-prior(+priors), metamorphosis |
| `index.html` + `support.js` + `vendor/` | the dc surface and its runtime |

## What 4.2 dropped (find it in 4.1)

- **The behavior test battery** — ~140 test files (`bind`, `coref`, `factcheck`,
  `flow`, `chorus`, the disambiguation and grounding suites, …). The behavior
  they pin is unchanged; the pins live in 4.1.
- **The design docs** — every `docs/*.md` except `eo-for-coders.md`. The
  architecture narratives (`architecture.md`, `holons.md`, `surfing-the-fold.md`,
  the fold/reading/generation specs) are 4.1's record.
- **The 4.1 shell** — `src/reader/app.dc.js` (954 KB) and `eoreader4-bundle.js`,
  replaced by the dc `index.html` + the `window.EO` bridge (`src/rooms/reader/boot.js`).
- **Dormant / superseded modules** — the second SVO reader (`svo-llm.js`), the
  unreachable model backends (`pleias`, `onnx`), and the four superseded write
  loops (`answer`/`composition`/`impression`/`spurt`; the live posture is
  `weave/write/paragraphs.js`).
- **Eval + build tooling** — `eoreader4-eval/`, `scripts/`, `tools/`, the demo
  HTML pages.

Nothing dropped here is deleted from the world — it is one repository away, in 4.1.
