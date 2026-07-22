// fixtures/ — a pinned corpus, committed as raw bytes with a manifest recording
// sha256, source, and license (docs/parse-conformance-spec.md, "Shared harness").
//
// SCOPE NOTE (see tests/conformance/README.md for the full accounting): the spec
// asks for ~60 documents pulled from real municipal/legal/news/literary/OCR
// sources. Sourcing and licensing 60 real third-party documents inside this
// change is not something this suite can respons­ibly do in one pass — provenance
// and license review for scraped municipal minutes, court dockets, or news prose
// takes real diligence, not a generated guess. This corpus is a smaller, honestly
// labeled starter set: one real public-domain literary text already vendored in
// this repo (frankenstein.txt, used by tests/individuation.test.js and friends),
// plus originally-authored fixtures across the other categories, each manifest
// row saying so plainly (`source: "original, authored for this suite"`). Growing
// this toward the full 60-document, real-source corpus is follow-up work, not a
// suite design change — every test here reads the manifest, not a hardcoded list,
// so dropping in more fixtures (and re-running `npm run conformance:manifest`)
// is the entire integration cost.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.join(HERE, '..', 'fixtures');
const MANIFEST_PATH = path.join(FIXTURES_DIR, 'manifest.json');

let _manifest = null;
const manifest = () => {
  if (!_manifest) _manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  return _manifest;
};

export const listFixtures = ({ category = null } = {}) => {
  const rows = manifest().fixtures;
  return category ? rows.filter((r) => r.category === category) : rows.slice();
};

export const listCategories = () => [...new Set(manifest().fixtures.map((r) => r.category))].sort();

// loadFixture(id) -> { id, category, bytes:Buffer, text:string, sha256, source,
// license, notes }. Verifies the manifest's recorded sha256 against the bytes on
// disk on every load — a silently-edited fixture (which would invalidate any
// committed baseline number, Tier 3's gold set included) fails loudly here
// instead of quietly drifting.
export const loadFixture = (id) => {
  const row = manifest().fixtures.find((r) => r.id === id);
  if (!row) throw new Error(`loadFixture: no fixture "${id}" in manifest.json`);
  const abs = path.join(FIXTURES_DIR, row.path);
  const bytes = readFileSync(abs);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== row.sha256) {
    throw new Error(`loadFixture: sha256 mismatch for "${id}" — manifest says ${row.sha256}, ` +
      `file is ${sha256}. Either the fixture was edited without updating the manifest, or the ` +
      `manifest is stale — regenerate it (see tests/conformance/fixtures/README.md).`);
  }
  return { ...row, bytes, text: bytes.toString('utf8') };
};

export const loadAllFixtures = ({ category = null } = {}) =>
  listFixtures({ category }).map((r) => loadFixture(r.id));

// Compute the manifest afresh from the files on disk (used by the small script
// that regenerates manifest.json after a fixture is added or edited — never by
// the tests themselves, which always read the committed manifest).
export const computeManifestRow = (categoryDir, filename, meta) => {
  const rel = path.join(categoryDir, filename);
  const abs = path.join(FIXTURES_DIR, rel);
  const bytes = readFileSync(abs);
  return {
    id: meta.id, category: categoryDir, path: rel.split(path.sep).join('/'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    source: meta.source, license: meta.license, notes: meta.notes || '',
  };
};

export const walkFixtureFiles = () => {
  const out = [];
  for (const category of readdirSync(FIXTURES_DIR)) {
    const dir = path.join(FIXTURES_DIR, category);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) out.push({ category, filename: f });
  }
  return out;
};
