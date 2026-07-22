# Parse-conformance suite

A conformance test suite for the parse/perceiver layer of eoreader4.2 — everything
that runs before `core/fold.js` sees a holon (unit segmentation, `entities.js`
admission, `coref.js`, the individuation gate, `project.js`'s edge weights) plus
the omnimodal perceiver contract (`src/perceiver/contract.js`) that sits between
every modality's perceiver and the modality-blind deviation-waveform core.

The suite follows the spec's original design principle: overwhelmingly
invariants, metamorphic relations, conservation laws, and negative controls —
tests that need no hand-labeled ground truth because they compare a read
against another read, or against arithmetic. The one exception is Tier 3's
segmentation gold set, because sentence-boundary labels are cheap and the
blast radius of a bad split is total (every downstream signal is computed
per-unit).

## Running it

```sh
npm test                      # the whole repo suite, conformance included
npm run test:conformance      # just this suite (all 8 tiers)
node --test tests/conformance-tier5-negative-controls.test.js   # a single tier
```

Every commit should stay green on Tiers 1–2 (they run against the full fixture
corpus and are the invariants that must never regress). A PR touching
`perceiver/`, `parse/`, or `core/` should run the full suite before merging.

To regenerate the fixture manifest after adding/editing a fixture:

```sh
npm run test:conformance:manifest
```

## Layout

```
tests/conformance/
  harness/         readWithSeed, readingHash/readingDiff, offset recovery,
                    fuzz mutators, negative-control generators, rename/cipher
                    tooling, substrate validation — see each file's header.
  fixtures/        the pinned corpus (sha256-manifested, see fixtures/README.md).
  gold/            Tier 3's hand-labeled segmentation boundary set.
tests/
  conformance-tier1-determinism.test.js
  conformance-tier2-conservation.test.js
  conformance-tier3-segmentation.test.js
  conformance-tier4-rename-isomorphism.test.js
  conformance-tier5-negative-controls.test.js
  conformance-tier6-coreference-admission.test.js
  conformance-tier7-nulls-priors.test.js
  conformance-tier8-perceiver-contract.test.js
```

## `readWithSeed` — the one entry point

Every conformance test reads a document through `harness/read.js`'s
`readWithSeed(bytes, opts)`, never `ingestText`/`parseText` directly. Two real
`Date.now()` reaches exist on this surface (`core/log.js`'s event timestamp,
`organs/in/text.js`'s bare-string docId fallback) — `readWithSeed` pins both
so the same bytes always mint the same identity, and `readingHash` strips the
timestamp separately since it carries no reading content. If a future change
introduces a new nondeterminism reach anywhere in the parse/perceiver
surface, Tier 1's byte-identical-replay test (`#1`) is what will catch it —
the fix belongs in `readWithSeed`'s pinning, not in that test.

## Known gaps

**Corpus scope.** 23 fixtures, not the spec's ~60-document target (see
`fixtures/manifest.json`'s `scopeNote` and `fixtures/generate-manifest.mjs`'s
`FIXTURE_META`). Composition over count: every category the spec names is
represented, and several fixtures were built specifically to hit the
adversarial cases Tiers 3–5 test for (citation furniture, OCR damage,
degenerate inputs).

**Tier 3's gold set** is two fixtures (78 hand-labeled sentences), not ~250 —
see `gold/segmentation-boundaries.js`'s header for the labeling method and the
six real segmentation bugs it was built from.

**No native byte-offset map.** `segmentSentences` (`src/perceiver/parse/
sentences.js`) returns bare strings; the omnimodal Reading's `resolve(span)`
(`src/perceiver/text/waveform.js`) answers `{ sentIdx, preview }`, not a byte
range. `harness/offsets.js` recovers per-unit byte spans by exploiting the one
normalization the pipeline performs (whitespace collapse) rather than
asserting a byte-offset contract that doesn't exist. Tier 2's partition-law
and slice-fidelity tests are built on this recovery.

**Every `test.todo` below is a confirmed, measured engine behavior**, not a
placeholder — each one is reproduced with a minimal example in its own test
file and left un-"fixed" here deliberately (this is a test suite PR, not an
engine-fix PR). `node --test <file>; echo $?` exits 0 with `test.todo`
entries present — they report but never fail the suite.

| Tier | Finding |
|---|---|
| 3 | Citation-string abbreviations (`Tenn.`, `Ann.`, `Serv.`, unseeded `v.`) shred one legal sentence into up to six units — the spec's own predicted case. |
| 3 | Ellipses, parentheticals containing a full sentence, and a footnote marker with no space after it each produce a wrong boundary count. |
| 3 | A quotation whose terminal punctuation precedes the close quote suppresses the boundary that should follow the quote, not just the one inside it. |
| 3 | A table row whose last cell is literally the word "No" welds onto the following sentence — collides with `CONTINUATION_TAIL`'s structural "no". |
| 3 | Column rewrapping (40/72/120) changes segmentation boundaries — the heading-vs-soft-wrap heuristic decides per physical line, so reflow is not boundary-invariant even in body prose with no heading content. |
| 3 | NFD (decomposed-accent) input truncates admitted referent labels at the first combining diacritical mark ("François" → "Franc") — name admission matches `\p{L}` runs, and combining marks are category Mn, not `\p{L}`. |
| 4 | The descriptor channel (`coref.js`'s closed, hand-seeded role vocabulary) doesn't survive a lexical rename the way proper-name admission does — a renamed "wife" vanishes from the cast instead of surviving under a new label. |
| 4 | A person name and a street sharing a string ("Jefferson") false-merge via `entities.js`'s head-alias containment. |
| 5 | Unigram noise (preserving a source's own lexical statistics) still clears the individuation gate's mass/ρ nulls — the nulls are derived from the same noisy population they're supposed to reject. |
| 5 | Within-sentence word shuffle doesn't fully collapse relation edges — some syntax-dependent signal survives lexical-only scrambling. |
| 5 | Exact document duplication doesn't collapse to near-zero novelty — the echo detector's bulk-outlier null derivation assumes echoes are a population minority. |
| 5 | A single anomalous sentence buried in unigram noise doesn't reliably rank in the top-k salient spans — the sensitivity floor's other half of Tier 5's "#19/#24 bracket the instrument" pairing. |
| 6 | An appositive clause on a possessive-apostrophe surname ("Mayor O'Connell, who…" — the spec's own literal example) suppresses admission entirely, not just the appositive. |
| 6 | Split antecedents ("they" = two prior referents), a reflexive/possessive pronoun chain ("she … herself"), and inverted-order quote attribution (`"…" said X`) each produce **no** relation signal at all — the SVO-regex reader (`parse/relations.js`) doesn't fire on these constructions, correct or incorrect. |
| 6 | Org/person metonymy ("the Department" / "Metro") is never unified — no mechanism resolves this alternation today. |
| 6 | `promoteBoundDescriptors` is not idempotent: calling it twice on the same doc appends the same `REC held:true` promotion event twice. |
| 7 | No reading records which prior/ledger version produced it — `conventions/ledger.js`'s `exportLedger()` carries no version field, so "replay against a different version reproduces or fails loudly" can't be checked; there's nothing to compare against. |
| 8 | `src/weave/waveform/` (the declared modality-blind seam) imports `validateReading`/`couplingByNode`/`classifyReferents` from `src/perceiver/index.js` — modality-agnostic in behavior (confirmed by Tier 8 #36), but a real violation of the spec's literal "no import from any perceiver." |

## Contributing a fixture

1. Add the raw file under the right category directory.
2. Add its provenance to `FIXTURE_META` in `fixtures/generate-manifest.mjs`
   (id, category, source, license, notes — never guessed, always written by
   whoever adds the file).
3. Run `npm run test:conformance:manifest` to compute its sha256/size and
   regenerate `manifest.json`.
4. If it changes Tier 1/2 pass/fail state on the existing suite, that's
   expected — those tiers run against every fixture in the corpus.
