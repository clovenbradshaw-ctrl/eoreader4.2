#!/usr/bin/env node
// The BOOTSTRAP READ — how the reader earns its literacy. Runs the literacy inductions
// (src/core/conventions/literacy.js) over a small shelf of public-domain books and writes the
// merged result to src/core/conventions/sediment-en.js: machine-learned register sediment with
// provenance, loaded by the ledger where hand-written seeds used to sit. Re-run to regenerate;
// point it at books in another language to deposit that language's sediment instead.
//
//   node tools/bootstrap-read.mjs <book.txt> [book2.txt ...] [-o out.js] [--lang en]

import { readFileSync, writeFileSync } from 'node:fs';
import { induceLiteracy } from '../src/core/conventions/literacy.js';

const args = process.argv.slice(2);
const out = args.includes('-o') ? args[args.indexOf('-o') + 1] : 'src/core/conventions/sediment-en.js';
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'en';
const files = args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '-o' && args[i - 1] !== '--lang');
if (!files.length) { console.error('usage: bootstrap-read.mjs <book.txt> [...] [-o out.js]'); process.exit(1); }

// Strip the Project Gutenberg frame (licence header/footer) — the reading is of the BOOK.
const stripFrame = (t) => {
  const a = t.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const b = t.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  return a >= 0 && b > a ? t.slice(t.indexOf('\n', a) + 1, b) : t;
};

const merged = new Map();   // register → Map(token → weight)
const shelf = [];
for (const f of files) {
  const text = stripFrame(readFileSync(f, 'utf8'));
  shelf.push({ file: f.replace(/^.*\//, ''), chars: text.length });
  const sed = induceLiteracy(text);
  for (const [reg, list] of Object.entries(sed)) {
    let m = merged.get(reg); if (!m) merged.set(reg, m = new Map());
    for (const { token, weight } of list) m.set(token, (m.get(token) || 0) + weight);
  }
}

const registers = {};
for (const [reg, m] of merged)
  registers[reg] = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

// Cross-register discipline AT MERGE — per-book unions can resurrect what a single book's
// lanes excluded (an epistolary book that never sees «," said X» re-admits "said" to the
// closed class; a book whose preposition induction missed "as" leaves it in copula):
//   1. a preposition is never a copula or a modifier;
//   2. a verb register's claim (copula/speech/modifier) evicts the token from function.
const prepSet = new Set(registers.preposition || []);
registers.copula = (registers.copula || []).filter((t) => !prepSet.has(t));
registers.modifier = (registers.modifier || []).filter((t) => !prepSet.has(t));
const claimed = new Set([
  ...(registers.copula || []),
  ...(registers['attribution-verb'] || []),
  ...(registers.modifier || []),
]);
registers.function = (registers.function || []).filter((t) => !claimed.has(t));

const body = Object.entries(registers)
  .map(([reg, toks]) => `  '${reg}': ${JSON.stringify(toks)},`)
  .join('\n');

writeFileSync(out, `// GENERATED SEDIMENT — do not hand-edit. Regenerate: node tools/bootstrap-read.mjs
// The reader's ${lang} literacy, INDUCED (src/core/conventions/literacy.js) from a bootstrap
// shelf of public-domain books — machine-learned register sediment, not hand-written seeds.
// Loaded by the ledger as defeasible priors, the same slot and status as anything learned.
// Shelf: ${shelf.map((s) => `${s.file} (${s.chars} chars)`).join(', ')}
export const SEDIMENT_LANG = '${lang}';
export const SEDIMENT = Object.freeze({
${body}
});
`);
console.log(`wrote ${out}`);
for (const [reg, toks] of Object.entries(registers)) console.log(`  ${reg}: ${toks.length} — ${toks.slice(0, 12).join(' ')}`);
