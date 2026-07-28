#!/usr/bin/env node
// Regenerates tests/conformance/fixtures/manifest.json from the files on disk.
// Run after adding, removing, or editing a fixture:
//   node tests/conformance/fixtures/generate-manifest.mjs
//
// Every fixture's provenance is declared by hand in FIXTURE_META below (never
// inferred) — a manifest is a claim about where a document came from, and that
// claim has to be written by whoever added the file, not guessed from its path.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(FIXTURES_DIR, 'manifest.json');

const ORIGINAL = 'original, authored for this suite (docs/parse-conformance-spec.md fixtures) — not a real municipal/legal/news document';
const CC0 = 'CC0 — original work, dedicated to the public domain for this suite';

// id -> metadata. `path` is relative to this directory; `..`-relative paths (for
// frankenstein.txt) reach an existing repo fixture instead of duplicating it.
const FIXTURE_META = [
  { id: 'muni-council-minutes-01', path: 'municipal/council-minutes-01.txt', category: 'municipal', source: ORIGINAL, license: CC0, notes: 'city council minutes: motions, votes, an abstention, named officials' },
  { id: 'muni-staff-report-01', path: 'municipal/staff-report-01.txt', category: 'municipal', source: ORIGINAL, license: CC0, notes: 'staff report recommending a contract award' },
  { id: 'muni-rfp-excerpt-01', path: 'municipal/rfp-excerpt-01.txt', category: 'municipal', source: ORIGINAL, license: CC0, notes: 'procurement RFP excerpt: numbered sections, defined terms, weighted criteria' },
  { id: 'legal-docket-01', path: 'legal/docket-01.txt', category: 'legal', source: ORIGINAL, license: CC0, notes: 'court docket entries: dates, citation furniture, multiple parties' },
  { id: 'legal-order-01', path: 'legal/order-01.txt', category: 'legal', source: ORIGINAL, license: CC0, notes: 'court order: case caption, citations, headings I/II/III/IV' },
  { id: 'legal-complaint-excerpt-01', path: 'legal/complaint-excerpt-01.txt', category: 'legal', source: ORIGINAL, license: CC0, notes: 'civil petition excerpt: numbered paragraphs 1-9' },
  { id: 'news-infrastructure-01', path: 'news/news-infrastructure-01.txt', category: 'news', source: ORIGINAL, license: CC0, notes: 'news article, byline, quoted officials' },
  { id: 'news-officials-01', path: 'news/news-officials-01.txt', category: 'news', source: ORIGINAL, license: CC0, notes: 'news article referencing the council-minutes-01 cast — cross-fixture entity overlap' },
  { id: 'news-brief-01', path: 'news/news-brief-01.txt', category: 'news', source: ORIGINAL, license: CC0, notes: 'short wire-style brief' },
  { id: 'literary-frankenstein', path: '../../fixtures/frankenstein.txt', category: 'literary', source: 'Mary Shelley, Frankenstein; or, The Modern Prometheus (1818) — public domain; the file already vendored at tests/fixtures/frankenstein.txt for tests/individuation.test.js and friends, referenced here rather than duplicated', license: 'public domain', notes: 'long, heavy coref, the canonical un-named-referent case ("the creature")' },
  { id: 'literary-the-lamplighter', path: 'literary/the-lamplighter.txt', category: 'literary', source: ORIGINAL, license: CC0, notes: 'short story, heavy pronoun coref, two never-named definite-description agents ("the stranger", "the old woman"), a possessive descriptor ("her sister") never named' },
  { id: 'ocr-council-minutes', path: 'ocr-damaged/ocr-council-minutes.txt', category: 'ocr-damaged', source: `${ORIGINAL} — synthetically OCR-damaged from muni-council-minutes-01 (line-wrap hyphenation, l/1/I and O/0 confusion, missing spaces)`, license: CC0, notes: 'simulated OCR damage, not a real scan' },
  { id: 'ocr-legal-order', path: 'ocr-damaged/ocr-legal-order.txt', category: 'ocr-damaged', source: `${ORIGINAL} — synthetically OCR-damaged from legal-order-01`, license: CC0, notes: 'simulated OCR damage, not a real scan; heavier corruption than ocr-council-minutes' },
  { id: 'adversarial-citations', path: 'adversarial/adversarial-citations.txt', category: 'adversarial', source: ORIGINAL, license: CC0, notes: 'Tier 3 battery in prose form: abbreviations, decimals, money, ellipsis-adjacent quotes, citation strings' },
  { id: 'adversarial-tables', path: 'adversarial/adversarial-tables.txt', category: 'adversarial', source: ORIGINAL, license: CC0, notes: 'space-aligned table rows leaked into the text layer, interleaved with prose' },
  { id: 'adversarial-allcaps', path: 'adversarial/adversarial-allcaps.txt', category: 'adversarial', source: ORIGINAL, license: CC0, notes: 'ALL-CAPS headers with no terminal punctuation, mid-sentence footnote markers' },
  { id: 'degenerate-empty', path: 'degenerate/empty.txt', category: 'degenerate', source: 'generated', license: CC0, notes: 'zero bytes' },
  { id: 'degenerate-one-word', path: 'degenerate/one-word.txt', category: 'degenerate', source: 'generated', license: CC0, notes: 'a single word, no punctuation' },
  { id: 'degenerate-huge-single-line', path: 'degenerate/huge-single-line.txt', category: 'degenerate', source: 'generated', license: CC0, notes: 'one ~60KB line, no newlines — scaled down from the spec\'s 8MB for repo size; see README for how to regenerate a larger instance locally' },
  { id: 'degenerate-emoji-only', path: 'degenerate/emoji-only.txt', category: 'degenerate', source: 'generated', license: CC0, notes: 'emoji only, no letters' },
  { id: 'degenerate-rtl', path: 'degenerate/rtl.txt', category: 'degenerate', source: 'original, authored for this suite (Arabic)', license: CC0, notes: 'right-to-left script' },
  { id: 'degenerate-mixed-script', path: 'degenerate/mixed-script.txt', category: 'degenerate', source: 'original, authored for this suite (Latin/Cyrillic/Japanese)', license: CC0, notes: 'mixed-script document — Latin, Cyrillic, and Japanese names in one text' },
  { id: 'degenerate-pure-whitespace', path: 'degenerate/pure-whitespace.txt', category: 'degenerate', source: 'generated', license: CC0, notes: 'spaces, tabs, and newlines only' },
];

const sha256Of = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex');

const fixtures = FIXTURE_META.map((m) => {
  const abs = path.join(FIXTURES_DIR, m.path);
  const stat = statSync(abs);
  return {
    id: m.id, category: m.category, path: m.path,
    sha256: sha256Of(abs), bytes: stat.size,
    source: m.source, license: m.license, notes: m.notes,
  };
});

const manifest = {
  version: 1,
  generatedBy: 'tests/conformance/fixtures/generate-manifest.mjs',
  scopeNote: 'Starter corpus (~24 fixtures) vs. the spec\'s ~60-document target — see tests/conformance/README.md "Known gaps".',
  fixtures,
};

writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${fixtures.length} fixtures to ${path.relative(process.cwd(), OUT)}`);
