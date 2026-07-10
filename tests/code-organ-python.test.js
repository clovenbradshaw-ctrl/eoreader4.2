// The code organ, second language + the merge — the membrane proven and the fixes
// folded into the preserved original (src/organs/code/python.js, fix.js).
//
// The fixture pair is a planted-defect benchmark (tests/fixtures/BUGS_MANIFEST.md):
// six behavioral bugs in pipeline_buggy.py, a line-parallel pipeline_clean.py, ground
// truth for both. Three properties pinned:
//   1. the membrane is real — a .py file routes to the Python provider and lowers
//      through the SAME medium (zero re-parse diagnostics, same laws downstream);
//   2. the organ scores the benchmark exactly — the six defects at the manifest's own
//      lines, zero error/warn on clean, and the only buggy-only notes are the two
//      shadows the manifest itself describes (math unused; last_exc never raised);
//   3. the merge closes the helix — fixes fold into the PRESERVED original, the
//      re-read finds the mended laws gone, and the merged file still compiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCodebase, mergeIssues, extractorFor, extractFacts, extractPyFacts } from '../src/organs/code/index.js';
import { parseEOT } from '../src/organs/ingest/eot.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const buggy = readFileSync(path.join(FIX, 'pipeline_buggy.py'), 'utf8');
const clean = readFileSync(path.join(FIX, 'pipeline_clean.py'), 'utf8');

const read = (name, text) => readCodebase([{ path: name, text }], { doc: false });
const sites = (r, sev) => r.issues.filter((f) => sev.includes(f.severity)).map((f) => `${f.law}@${f.line}`).sort();

// ── the membrane ────────────────────────────────────────────────────────────────

test('membrane: a .py path routes to the Python provider, not the JS reader', () => {
  assert.equal(extractorFor('pipeline_buggy.py'), extractPyFacts);
  assert.equal(extractorFor('anything.js'), extractFacts);
  const f = extractPyFacts('import os\n\ndef go():\n    return os.getcwd()\n', { path: 'm.py' });
  assert.equal(f.module.lang, 'python');
  assert.ok(f.decls.some((d) => d.name === 'go'));
  assert.ok(f.imports.some((i) => i.local === 'os'));
});

test('membrane: the Python lowering is the same medium — re-parses with zero diagnostics', () => {
  const r = read('pipeline_buggy.py', buggy);
  const parsed = parseEOT(r.eotText);
  assert.equal(parsed.diagnostics.length, 0);
  assert.ok(r.eotText.includes('mod:pipeline_buggy : Module'));
  assert.ok(/hz:pipeline_buggy:L129:c\d+:bare-except : Hazard/.test(r.eotText),
    'a hazard is a WITNESSED shape in the medium');
});

test('python structural laws: unbound, module-level use-before-def, dwelling import', () => {
  const r = read('m.py', `import os
import unusedthing

print(undefined_name)
value = compute()

def compute():
    return os.getcwd()
`);
  assert.deepEqual(sites(r, ['error']), ['dependency@5', 'unbound@4']);
  assert.deepEqual(r.issues.filter((f) => f.law === 'dwell').map((f) => f.name), ['unusedthing']);
});

// ── the benchmark — six defects, exactly ────────────────────────────────────────

test('benchmark: the six planted defects, at the manifest\'s own lines, and nothing else', () => {
  const r = read('pipeline_buggy.py', buggy);
  assert.deepEqual(sites(r, ['error', 'warn']), [
    'bare-except@129',
    'dangling-task@239',
    'shared-default@167',
    'tail-drop@246',
    'unbounded-resource@221',
    'void-identity@211',
  ].sort());
});

test('benchmark: the clean twin carries zero error- or warn-grade findings', () => {
  const r = read('pipeline_clean.py', clean);
  assert.deepEqual(sites(r, ['error', 'warn']), []);
});

test('benchmark: the buggy−clean note difference is exactly the manifest\'s two shadows', () => {
  const key = (f) => `${f.law}:${f.name}`;
  const b = new Set(read('pipeline_buggy.py', buggy).issues.filter((f) => f.severity === 'note').map(key));
  const c = new Set(read('pipeline_clean.py', clean).issues.filter((f) => f.severity === 'note').map(key));
  const onlyBuggy = [...b].filter((x) => !c.has(x)).sort();
  const onlyClean = [...c].filter((x) => !b.has(x)).sort();
  // defect 6's shadow: buggy imports math but never draws on it (clean calls isnan);
  // defect 1's shadow: buggy assigns last_exc but never raises it (clean does)
  assert.deepEqual(onlyBuggy, ['dead-entity:last_exc', 'dwell:math']);
  assert.deepEqual(onlyClean, []);
});

// ── the merge — fixes into the preserved original, verified by re-read ──────────

test('merge: all six fold into the original; the re-read finds the mended laws gone', () => {
  const r = mergeIssues([{ path: 'pipeline_buggy.py', text: buggy }]);
  assert.equal(r.skipped.length, 0);
  assert.deepEqual(r.applied.map((a) => a.law).sort(), [
    'bare-except', 'dangling-task', 'shared-default',
    'tail-drop', 'unbounded-resource', 'void-identity',
  ]);
  assert.equal(r.verify.mendedLawsRemaining, 0, 'the checkpoint: the merged corpus re-reads clean of every mended law');
  assert.equal(r.verify.after.counts.error ?? 0, 0);
  assert.equal(r.verify.after.counts.warn ?? 0, 0);

  const text = r.files[0].text;
  assert.ok(text.includes('except Exception:'), 'defect 1: the boundary has a key');
  assert.ok(/batch: list = None/.test(text) && /if batch is None:/.test(text), 'defect 2: one INS per call');
  assert.ok(text.includes('range(len(dockets))'), 'defect 3: the partition covers its tail');
  assert.ok(/with open\(path, "w", encoding="utf-8"\) as fh:/.test(text), 'defect 4: the clearing is bound');
  assert.ok(/await _archive_one\(session_url, d\)/.test(text), 'defect 5: the task is witnessed');
  assert.ok(text.includes('math.isnan(docket.confidence)'), 'defect 6: ask the frame, not identity');
  assert.ok(!/asyncio\.ensure_future/.test(text) && !/== float\("nan"\)/.test(text) && !/\bexcept\s*:/.test(text));
});

test('merge: the original is preserved — untouched files come back verbatim', () => {
  const r = mergeIssues([
    { path: 'pipeline_buggy.py', text: buggy },
    { path: 'pipeline_clean.py', text: clean },
  ]);
  const cleanOut = r.files.find((f) => f.path === 'pipeline_clean.py');
  assert.equal(cleanOut.changed, false);
  assert.equal(cleanOut.text, clean, 'no finding, no touch');
});

test('merge: the merged file still compiles (python3 -m py_compile)', (t) => {
  const r = mergeIssues([{ path: 'pipeline_buggy.py', text: buggy }]);
  const dir = mkdtempSync(path.join(tmpdir(), 'eo-code-organ-'));
  const out = path.join(dir, 'merged.py');
  writeFileSync(out, r.files[0].text);
  const res = spawnSync('python3', ['-m', 'py_compile', out], { encoding: 'utf8' });
  if (res.error) { t.skip('python3 not available on this host'); return; }
  assert.equal(res.status, 0, `py_compile failed:\n${res.stderr}`);
});
