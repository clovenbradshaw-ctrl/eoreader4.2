import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { contractOf } from '../src/core/contracts.js';

// The Act-face fidelity checkpoint (docs/eo-for-coders.md Law 1). The contract
// registry proves every module DECLARES ops; this test proves the declaration is
// TRUE of the code: every operator a module literally emits (an `op: 'XXX'`
// event construction) must be among its contract's declared ops. Without this,
// a contract is vanity metadata — the module may fire operators its Act face
// never claimed. The check is static and conservative: it only sees literal
// `op: 'XXX'` spellings (a dynamically-computed op is invisible to it), so it
// can under-catch but never false-accuse — except through strings; files whose
// literal matches are DESCRIPTIONS of events rather than emissions (a prompt, a
// glossary, an alias table) are exempted below, each with the reason.

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const OPS = 'NUL|SIG|INS|SEG|CON|SYN|DEF|EVA|REC';
const EMIT_RE = new RegExp(`\\bop:\\s*['"](${OPS})['"]`, 'g');

// Exemptions: files where a literal `op: '…'` is not an emission by THIS module.
// Keyed by repo-relative path; the value is the reason (kept for the reader).
const EXEMPT = new Map([
  ['src/core/contract.js', 'DESERT_CELL names the forbidden cell; naming is not firing it'],
  ['src/turn/stage-faces.js', 'the stage-faces registry DESCRIBES each stage\'s cells; the stages fire them'],
  ['src/rooms/plain/terrain.js', 'the three-questions table lists a domain\'s operators for the popover'],
  ['src/rooms/audit/eot-ledger.js', 'the ledger witnesses other doors\' acts; op names the witnessed act, the ledger\'s own act is the recording'],
  ['src/metabolism/organ.js', 'organ specs name the CELL an organ claims; organ.js\'s own act is building the contract'],
  ['src/model/bands.js', 'prompt bands carry the cube cell they speak FROM; band assembly itself is the declared SEG·SIG'],
  ['src/perceiver/reading.js', 'the reading narrates events already in the log; op labels what was READ, not an act performed'],
  ['src/rooms/reader/app/wiki.js', 'solarMeaningData labels each meaning-ring body with the operator its claim/bond was READ as (the spectrum), not an act performed — the module appends to no log; its own act is the SIG·CON projection its face declares'],
  ['src/surfer/fold/verdict.js', 're-shapes the surf\'s already-produced REC axes into verdict records'],
  ['src/surfer/metacognition.js', 'narrates logged events into EOT lines; op labels the narrated event'],
  ['src/weave/topline/surface.js', 'drift classifications label a divergence by the op it resembles'],
  ['src/rooms/generation/intents.js', 'the few-shot EXAMPLE is a literal illustration of the intent shape the model should return; this module\'s own act is DEF·SEG (schema + parse), not INS'],
  ['src/core/fold-trace.js', 'the grain-mixed check PROBES the coherence guard with a candidate (REC, Entity) pairing to see whether it diagonals — asking the guard is not firing REC; this module\'s own act is EVA (labeling an already-built WaveformModel)'],
  ['src/perceiver/code/events.js', 'narrates a reconciliation\'s findings using the nine-operator vocabulary as data (docs/code-holons.md §9) — op labels the narrated finding (an INS admission, a DEF contract assertion, a NUL gap), not an act this module itself performs; its own act is SIG·SYN (registering and composing the log)'],
]);

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return walk(p);
  if (!e.name.endsWith('.js')) return [];
  if (e.name === 'eo-contract.js' || e.name === 'contracts.js') return [];
  return [p];
});

test('every literally-emitted operator is declared on the module\'s Act face', () => {
  const bad = [];
  for (const abs of walk(SRC)) {
    const rel = 'src/' + path.relative(SRC, abs);
    if (EXEMPT.has(rel)) continue;
    const text = stripComments(readFileSync(abs, 'utf8'));
    const emitted = new Set();
    let m;
    while ((m = EMIT_RE.exec(text))) emitted.add(m[1]);
    if (!emitted.size) continue;
    const c = contractOf(rel);
    if (!c) { bad.push(`${rel}: emits ${[...emitted].join(',')} but has no contract`); continue; }
    const undeclared = [...emitted].filter(op => !c.ops.includes(op));
    if (undeclared.length) bad.push(`${rel}: emits ${undeclared.join(',')} — not on its declared Act face (${c.ops.join(',')})`);
  }
  assert.equal(bad.length, 0,
    `${bad.length} module(s) emit operators their contract never declared:\n  ${bad.join('\n  ')}`);
});
