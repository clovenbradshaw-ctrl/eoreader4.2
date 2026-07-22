#!/usr/bin/env node
// Regenerates tests/goldens/manifest.json from the files on disk.
//
//   node tests/goldens/generate-manifest.mjs
//
// Run after adding, removing, or editing a golden, OR after an INTENTIONAL change
// to the reading path that moves the captured `reading` counts (segmentation,
// clause splitting, unnamed-referent recovery). The manifest is the regression
// oracle for tests/goldens.test.js: it pins each golden's bytes (sha256) and the
// reader's own reading of it. If the test fails and you did NOT intend to move
// those numbers, the failure is the finding — fix the read, not the manifest.
//
// Provenance (source / author / license) is declared BY HAND in GOLDENS below and
// never inferred — a manifest is a claim about where a text came from and who owns
// it, and that claim has to be written by whoever added the file. sha256, bytes,
// and the `reading` snapshot are the only fields computed here.
//
// Kept intentionally SMALL: whole-book-scale goldens (e.g. War & Peace) were dropped
// in favor of targeted excerpts and shorter complete works — real diagnostic value
// per committed byte, not bulk. Nothing here should need more than a few seconds to
// read.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestText } from '../../src/organs/in/text.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'manifest.json');

const PG = (id) => `Project Gutenberg #${id} (https://www.gutenberg.org/ebooks/${id}), text/plain UTF-8 ` +
  `rendition; the PG license header/footer stripped with src/organs/ingest/gutenberg.js ` +
  `stripGutenbergBoilerplate — the same normalization the reader applies when it ingests a PG book, ` +
  `so the golden is byte-for-byte what the reader would read from this ebook.`;

// id -> metadata. `path` is relative to this directory; the `..`-relative path for
// Frankenstein reaches the copy already vendored at tests/fixtures/frankenstein.txt
// (used by tests/individuation.test.js and the Frankenstein cast golden) rather
// than duplicating a 428 KB file.
const GOLDENS = [
  {
    id: 'literary-heart-of-darkness', category: 'literary', path: 'texts/heart-of-darkness.txt',
    title: 'Heart of Darkness', author: 'Joseph Conrad', language: 'en', year: 1899,
    source: PG(219),
    license: 'public domain (first published 1899); PG boilerplate removed',
    notes: 'novella; dense first-person narration with a frame narrator.',
  },
  {
    id: 'literary-frankenstein', category: 'literary', path: '../fixtures/frankenstein.txt',
    title: 'Frankenstein; or, The Modern Prometheus', author: 'Mary Shelley', language: 'en', year: 1818,
    source: 'Project Gutenberg (1818 text), already vendored at tests/fixtures/frankenstein.txt for ' +
      'tests/individuation.test.js and tests/frankenstein-cast-golden.test.js — referenced here rather than duplicated.',
    license: 'public domain',
    notes: 'the canonical un-named-referent case ("the creature"); heavy coreference. A separate output golden already exists (tests/fixtures/frankenstein-cast-golden.json).',
  },
  {
    id: 'multilang-basque-garoa', category: 'multilang', path: 'texts/basque-garoa.txt',
    title: 'Garoa', author: 'Domingo Agirre (Txomin Agirre)', language: 'eu', year: 1912,
    source: 'Basque Wikisource (https://eu.wikisource.org/wiki/Garoa) — the complete novel, all 21 sections ' +
      '(preface "Irakurleari" + chapters I–XX) assembled in reading order from the per-chapter proofread pages ' +
      'of the 1912 edition; ProofreadPage navigation furniture, page-number running heads, and the trailing ' +
      'publisher advertisement removed. Extraction script recorded in the PR that added this corpus.',
    license: 'public domain — Domingo Agirre died in 1920 (life + 70 years elapsed)',
    notes: 'complete Basque novel (~48k words). Basque is a Latin-script language isolate with rich agglutination — ' +
      'a segmentation/tokenization stress test. Faithful to source: the 1912 edition misnumbers two chapters ' +
      '(both "Agerpenak" and "Ijiji ¡aiene!" are printed "XV", skipping XVI) and the golden preserves that.',
  },
  {
    id: 'multilang-japanese-rashomon', category: 'multilang', path: 'texts/japanese-rashomon.txt',
    title: '羅生門 (Rashōmon)', author: '芥川龍之介 (Ryūnosuke Akutagawa)', language: 'ja', year: 1915,
    source: PG(1982),
    license: 'public domain — Akutagawa died in 1927; PG boilerplate removed',
    notes: 'complete Japanese short story. No inter-word spaces; mixed kana/kanji, full-width punctuation, and ' +
      'digitizer furigana in parentheses — a non-whitespace-segmentation stress test. Faithful to the PG ebook: ' +
      'it opens with the digitizer\'s short English note (encoding + modernized orthography) before the Japanese body, ' +
      'exactly as the reader would ingest it.',
  },
  {
    id: 'academic-ostrom-lecture', category: 'academic', path: 'texts/ostrom-lecture.txt',
    title: 'Beyond Markets and States: Polycentric Governance of Complex Economic Systems (Nobel Prize Lecture)',
    author: 'Elinor Ostrom', language: 'en', year: 2009,
    source: 'https://www.nobelprize.org/uploads/2018/06/ostrom_lecture.pdf — 37-page single-column PDF with a clean ' +
      'text layer; extracted with PyMuPDF, de-hyphenated at line-wraps, ligatures normalized, page numbers / running ' +
      'heads dropped.',
    license: 'IN COPYRIGHT — © The Nobel Foundation 2009. Stored as an internal research/test fixture, not redistributed as a publication. Replace with a checksum-only manifest entry if that is preferred.',
    notes: 'academic prose with a large numbered bibliography — citation-furniture stress test.',
  },
  {
    id: 'academic-descartes-meditations', category: 'academic', path: 'texts/descartes-meditations.txt',
    title: 'Meditations on First Philosophy',
    author: 'René Descartes', translator: 'Michael Moriarty', language: 'en', year: 1641,
    source: 'https://personal.lse.ac.uk/ROBERT49/teaching/ph103/pdf/Descartes_1641Meditations.pdf — the Oxford ' +
      'World\'s Classics edition. The source PDF is the full 330-page critical edition (editor\'s introduction, the ' +
      'Meditations, selections from the Objections and Replies, notes, index); this golden is scoped to Descartes\'s ' +
      '1641 work proper — the Preface to the Reader, the Synopsis, and the Six Meditations — with per-page running ' +
      'heads removed and line-wrap hyphenation / ligatures normalized.',
    license: 'IN COPYRIGHT — the 1641 work is public domain, but THIS is the modern Michael Moriarty translation © Oxford University Press (Oxford World\'s Classics). Stored as an internal research/test fixture. Swap for a public-domain translation (e.g. Veitch/Haldane) or a checksum-only entry if preferred.',
    notes: 'sustained philosophical argument, long periodic sentences — clause-segmentation stress test.',
  },
  {
    id: 'academic-watson-crick-1953', category: 'academic', path: 'texts/watson-crick-1953.txt',
    title: 'Molecular Structure of Nucleic Acids: A Structure for Deoxyribose Nucleic Acid',
    author: 'J. D. Watson and F. H. C. Crick', language: 'en', year: 1953,
    source: 'https://dosequis.colorado.edu/Courses/MethodsLogic/papers/WatsonCrick1953.pdf — the two-page Nature ' +
      'facsimile (vol. 171, pp. 737–738). The page is a two-column journal scan interleaved with neighbouring ' +
      'articles; this golden is the Watson–Crick article ONLY, reconstructed column-aware (preceding oceanography ' +
      'article and following Wilkins paper excluded, the Fig. 1 caption moved out of the sentence it floated into).',
    license: 'IN COPYRIGHT — © Nature Publishing Group 1953. Stored as an internal research/test fixture, not redistributed. Replace with a checksum-only manifest entry if preferred.',
    notes: 'The source PDF\'s text layer is OCR of a 1953 scan and carries authentic OCR artifacts ("van del\' Waals", ' +
      '"z-direetion", "es~aped", "cl1ain", garbled reference markers), PRESERVED faithfully — this doubles as an ' +
      'OCR-damaged + hard-multi-column-layout golden. Dense scientific prose with inline citations.',
  },
];

const sha256Of = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex');

const goldens = [];
for (const m of GOLDENS) {
  const abs = path.join(HERE, m.path);
  const bytes = readFileSync(abs);
  const text = bytes.toString('utf8');
  const doc = await ingestText(text, {});
  const len = (x) => (Array.isArray(x) ? x.length : 0);
  goldens.push({
    id: m.id, category: m.category, path: m.path,
    title: m.title, author: m.author,
    ...(m.translator ? { translator: m.translator } : {}),
    language: m.language, year: m.year,
    sha256: sha256Of(abs), bytes: bytes.length,
    // The reader's own reading of this text, captured as a baseline. Deterministic
    // (conformance Tier 1) so these are stable byte-for-byte across runs; they move
    // only when the reading path intentionally changes.
    reading: {
      sentences: len(doc.sentences),
      clauses: len(doc.clauses),
      mentions: len(doc.mentions),
      unnamedReferents: len(doc.unnamedReferentBodies),
    },
    source: m.source, license: m.license, notes: m.notes,
  });
  process.stderr.write(`  read ${m.id}: ${goldens.at(-1).reading.sentences} sentences\n`);
}

const manifest = {
  version: 1,
  generatedBy: 'tests/goldens/generate-manifest.mjs',
  note: 'A curated corpus of real, diverse documents used as reading goldens: public-domain literary works ' +
    '(English), non-English / non-whitespace language samples (Basque, Japanese), and academic PDFs (a Nobel ' +
    'lecture, Descartes\'s Meditations, the Watson–Crick 1953 DNA paper). Each row pins the golden\'s bytes ' +
    '(sha256) and the reader\'s reading of it (reading.*). License is per-row: the literary/language texts are ' +
    'public domain; the three PDF-derived academic texts are IN COPYRIGHT and stored as internal research/test ' +
    'fixtures — see each row\'s license field.',
  goldens,
};

writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');
process.stderr.write(`wrote ${goldens.length} goldens to ${path.relative(process.cwd(), OUT)}\n`);
