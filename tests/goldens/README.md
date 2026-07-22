# Reading goldens

A curated corpus of **real, diverse documents** used as reading goldens for the EO
Reader: public-domain literary works, non-English / non-whitespace language samples,
and academic PDFs. Each was fetched, run through the reader, reviewed by hand, and
pinned here — bytes (`sha256`) and the reader's own reading of them (`reading.*`) —
in [`manifest.json`](./manifest.json).

Guarded by [`tests/goldens.test.js`](../goldens.test.js).

## Why a separate corpus (not the conformance manifest)

The conformance fast gate (`tests/conformance-tier2-*.test.js`) parses **every**
manifest fixture on every commit. These goldens are real-world texts, not synthetic
ones, so they live in their own corpus, out of that gate. Kept deliberately **small**
— targeted excerpts and short complete works rather than whole novels — so nothing
here takes more than a couple seconds to read.

## The corpus

| id | title | author | lang | license | sentences |
|----|-------|--------|:----:|---------|----------:|
| `literary-heart-of-darkness` | Heart of Darkness | Conrad | en | public domain | 2,277 |
| `literary-frankenstein` | Frankenstein | Shelley | en | public domain | 3,379 |
| `multilang-basque-garoa` | Garoa | Domingo Agirre | eu | public domain | 4,965 |
| `multilang-japanese-rashomon` | 羅生門 (Rashōmon) | Akutagawa | ja | public domain | 167 |
| `academic-ostrom-lecture` | Beyond Markets and States (Nobel lecture) | Ostrom | en | **in copyright** | 882 |
| `academic-descartes-meditations` | Meditations on First Philosophy | Descartes (tr. Moriarty) | en | **in copyright** | 636 |
| `academic-watson-crick-1953` | Molecular Structure of Nucleic Acids | Watson & Crick | en | **in copyright** | 73 |

`literary-frankenstein` is not stored here — it references the copy already vendored
at `tests/fixtures/frankenstein.txt` (used by `tests/individuation.test.js` and the
Frankenstein cast golden), so it isn't duplicated.

**In progress:** Descartes is being swapped to the public-domain Veitch (1901)
translation, Watson–Crick (no PD version exists — copyright runs to ~2049 US /
later UK) is being replaced by Mendel's 1865 *Experiments in Plant Hybridisation*
(PD), and an Euclid *Elements* Book I excerpt (Ancient Greek, converted from Perseus
Beta Code to Unicode) is being added. This table will update when those land.

## Licensing — read before adding these to any published build

The **literary and language texts are public domain** (each author died well over 70
years ago). Project Gutenberg license boilerplate was stripped with the reader's own
`src/organs/ingest/gutenberg.js` `stripGutenbergBoilerplate`, so each PG golden is
byte-for-byte what the reader would ingest from that ebook.

The **PDF-derived academic texts currently here are IN COPYRIGHT**:

- **Ostrom lecture** — © The Nobel Foundation, 2009
- **Descartes Meditations** (current file) — the modern **Michael Moriarty**
  translation © Oxford University Press (Oxford World's Classics); being replaced
  by the public-domain Veitch (1901) translation.
- **Watson–Crick 1953** — © Nature Publishing Group, 1953; being replaced by a
  public-domain substitute (Mendel 1865) since no PD version of this paper exists.

They are stored here as **internal research / test fixtures**, not redistributed as
publications, each `manifest.json` row saying so in its `license` field.

## Extraction & review notes

Every text was reviewed by hand, not just fetched. Findings worth keeping:

- **Garoa (Basque)** — the complete novel, assembled in reading order from the 21
  per-chapter proofread pages on Basque Wikisource; ProofreadPage navigation,
  page-number running heads, and the trailing publisher advertisement were removed.
  Faithful to source: the 1912 edition **misnumbers two chapters** (both *Agerpenak*
  and *Ijiji ¡aiene!* are printed "XV", skipping XVI) and the golden preserves that
  quirk rather than silently renumbering.
- **Rashōmon (Japanese)** — the complete PG ebook, which opens with the digitizer's
  short **English note** (encoding + modernized orthography) before the Japanese body.
  Kept, because it is exactly what the reader ingests. The body has no inter-word
  spaces; the reader still segments it into 167 sentences on the full-width `。`.
- **Ostrom** — clean single-column PDF; de-hyphenated at line wraps, ligatures
  normalized, page numbers / running heads dropped.
- **Descartes** (current file, being replaced) — the source PDF is the full 330-page
  critical edition; this golden is scoped to Descartes's 1641 work proper — Preface,
  Synopsis, and the Six Meditations — with per-page running heads removed (they were
  splitting sentences mid-paragraph) and hyphenation / ligatures normalized.
- **Watson–Crick** (current file, being replaced) — the hardest extraction so far.
  The Nature page is a two-column scan interleaved with neighbouring articles; a
  naive extract mixes in an oceanography article's references and shatters the
  figure caption into one-word lines. This golden is the Watson–Crick article
  **only**, reconstructed column-aware, with the Fig. 1 caption moved out of the
  sentence it floated into. The source text layer is OCR of a 1953 scan and carries
  authentic OCR artifacts (`van del' Waals`, `z-direetion`, `es~aped`, `cl1ain`,
  garbled reference markers) — preserved faithfully.

**A note on entity counts.** `reading.mentions` is 0 for every golden because the
mention/coreference layer is opt-in (`referentIdentity: 'mention'`) and off in the
default `ingestText` path. `reading.unnamedReferents` is 0 here too under the default
parse — the recurring-definite-description recovery that finds "the creature" in
Frankenstein is exercised by the Frankenstein cast golden, not re-derived here. The
Japanese and Basque samples surface no mentions because that layer is
English-oriented — itself a useful thing for this corpus to record.

## Regenerating / adding a golden

```
node tests/goldens/generate-manifest.mjs
```

Recomputes `sha256`, `bytes`, and the `reading.*` snapshot for every golden and
rewrites `manifest.json`. Provenance (`source` / `author` / `license`) is declared
by hand in the script's `GOLDENS` array and never inferred. Run this after adding or
editing a golden, or after an **intentional** reading-path change that moves the
captured counts.

To add a golden: drop the text in `texts/`, add a `GOLDENS` row (with honest
provenance and license), regenerate, and run `node --test tests/goldens.test.js`.

## Running the test

```
node --test tests/goldens.test.js
```
