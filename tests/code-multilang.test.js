// The organ across FOUR languages — the hazard membrane on a planted-defect benchmark
// (src/organs/code/{facts,python,go,rust}.js, tests/fixtures/multilang/BUGS_MANIFEST.md).
//
// The uploaded benchmark is three matched buggy/clean pairs — JavaScript, Go, Rust —
// each with six idiomatic behavioral defects that COMPILE/parse clean (so nothing is
// catchable by a syntax pass). Its own stated tool baseline: `go vet` catches 1 of 6 Go
// defects, `rustc` and `node --check` catch 0 — 1 of 18 total. This pins the organ's
// score: every planted line flagged, and zero findings on the clean twins.
//
// Go and Rust mount as HAZARD-ONLY providers (witnessed shapes, no binding analysis) —
// the membrane's point: a language joins by emitting the fact shape, and every shape is
// an EO reading (a race is a SYN with no boundary; a nil-map write an INS into a Field
// never made; float == the void-identity law ported). JS's six ride the same mechanism
// as Python's, in facts.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCodebase } from '../src/organs/code/index.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'multilang');
const load = (name) => readFileSync(path.join(FIX, name), 'utf8');
const flags = (name) => readCodebase([{ path: name, text: load(name) }], { doc: false })
  .issues.filter((f) => f.severity !== 'note');
// a planted line counts as caught if a finding lands within one line of it (a hazard is
// sometimes witnessed at the statement, sometimes at the declaration above it).
const hits = (name, lines) => {
  const got = new Set(flags(name).map((f) => f.line));
  return lines.filter((l) => [...got].some((g) => Math.abs(g - l) <= 1));
};

// the six sites per language, from the manifest
const PLANTED = {
  'claims_buggy.js': [49, 65, 128, 139, 154, 190],
  'poller_buggy.go': [46, 83, 95, 112, 119, 162],
  'indexer_buggy.rs': [35, 46, 69, 74, 82, 89],
};

for (const [file, lines] of Object.entries(PLANTED)) {
  const lang = file.split('.').pop();
  test(`${lang}: all six planted defects flagged at their manifest lines`, () => {
    const hit = hits(file, lines);
    assert.deepEqual(hit, lines,
      `missed ${lines.filter((l) => !hit.includes(l)).join(', ')} in ${file}\nflagged: ${flags(file).map((f) => `${f.law}@${f.line}`).join(', ')}`);
  });
  test(`${lang}: the clean twin carries zero error/warn findings (no false positives)`, () => {
    const clean = file.replace('_buggy', '_clean');
    const fp = flags(clean);
    assert.equal(fp.length, 0, `${clean} false positives: ${fp.map((f) => `${f.law}@${f.line}`).join(', ')}`);
  });
}

test('the whole benchmark: 18/18 flagged, 0 false positives, beating the 1/18 tool floor', () => {
  let caught = 0, planted = 0, falsePos = 0;
  for (const [file, lines] of Object.entries(PLANTED)) {
    caught += hits(file, lines).length;
    planted += lines.length;
    falsePos += flags(file.replace('_buggy', '_clean')).length;
  }
  assert.equal(planted, 18);
  assert.equal(caught, 18, 'every planted defect flagged');
  assert.equal(falsePos, 0, 'nothing flagged on the clean twins');
});

test('each language routes to its own provider (the membrane), lowering to one medium', () => {
  for (const file of Object.keys(PLANTED)) {
    const r = readCodebase([{ path: file, text: load(file) }]);   // build the doc too
    assert.ok(r.eotText.includes(': Hazard'), `${file} witnesses hazards in the shared EOT`);
    assert.equal(r.doc.diagnostics.length, 0, `${file} lowers to canonical EOT`);
  }
});
