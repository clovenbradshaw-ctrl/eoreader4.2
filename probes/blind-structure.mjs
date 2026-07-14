// Probe for "blind-structure generation over the Anthropic API + the propositional continuity
// gate" — cheap, read-only, falsifiable. Run: node probes/blind-structure.mjs
//
// It executes the REAL code paths (the redaction membrane weave/write/redact.js, the EOT ingester
// organs/ingest/eot.js, the graph core, and model/blind-structure.js). It prints a report; it
// asserts nothing — the regression guard is tests/blind-structure.test.js. The point is to SEE, on
// the actual spine, the loop the request asked for:
//
//   1. BLIND     the reading of a referent is emitted as EOT with every referent collapsed to an
//                opaque handle (Referent7 -> Referent2 : imports). The model reasons over SHAPE and
//                never learns the who/what — "thinks about it rationally, doesn't know what it is."
//   2. RESTORE   the handles are bound back to the real referents on the return.
//   3. GATE      the propositional continuity gate: a relation the blind reasoner asserts among real
//                referents that the input did not contain is a FABRICATION about things it could not
//                see — caught, and (in a closed/audit task) refused. A PROPOSAL in an open/generation
//                task is surfaced, not refused. A flipped bond is a CONTRADICTION — refused either way.
//
// The backend is INJECTED: this probe drives it with hand-authored stubs (so a fabrication is
// demonstrable without spending a token) and shows that createModel('claude') — the real Anthropic
// API (model/anthropic.js) — is the same shape, a drop-in when a key is present.

import { eotDoc } from '../src/organs/ingest/eot.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';        // registers the echo backend (the always-available driver)
import '../src/model/anthropic.js';   // registers the claude backend (the real Anthropic API)
import {
  generateOverStructure, continuityGate, propositionsOf, blindPrompt,
} from '../src/model/blind-structure.js';

const h  = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const kv = (k, v) => console.log(`  ${String(k).padEnd(20)} ${v}`);

// A stub backend: it ignores the prompt and returns a fixed handle-EOT answer, so we can drive the
// return path (restore + gate) deterministically. Same shape as echo / claude — only phrase is used.
const stub = (answer) => ({
  id: 'stub', kind: 'remote',
  describe: () => ({ backend: 'stub', kind: 'remote', model: 'authored-answer' }),
  isLoaded: () => true, async load() {},
  async phrase() { return answer; },
});

// ───────────────────────────────────────────────────────────────────────────────
// PROBE 1 — the blinding. The model sees SHAPE, not meaning.
// ───────────────────────────────────────────────────────────────────────────────
h('PROBE 1 — what leaves the box: shape, not meaning');

const codeSrc = [
  'chargeCard : Function',
  'ledger : Module',
  'refund : Function',
  'chargeCard -> ledger : imports',
  'chargeCard -> refund : calls',
].join('\n');
const codeDoc = eotDoc(codeSrc, { docId: 'code', door: 'perceiver' });

const { messages, names } = blindPrompt(codeDoc, { task: 'Report the call/import structure.' });
console.log('  the reading (real referents):');
codeSrc.split('\n').forEach((l) => console.log('    | ' + l));
console.log('\n  what the model actually receives (blinded):');
messages[1].content.split('\n').forEach((l) => console.log('    | ' + l));
kv('referents hidden', JSON.stringify(names));
kv('leak-proven clean', 'yes — blindPrompt threw nothing (assertNoNameLeak passed)');

// ───────────────────────────────────────────────────────────────────────────────
// PROBE 2 — the loop, and the four ways the gate can land.
// ───────────────────────────────────────────────────────────────────────────────
h('PROBE 2 — the return path: restore + the continuity gate');

const drive = async (label, answer, mode) => {
  const r = await generateOverStructure({ model: stub(answer), doc: codeDoc, task: 't', mode });
  console.log(`\n  ▶ ${label}  [mode=${mode}]`);
  console.log('    model answered (blind, over handles):  ' + JSON.stringify(answer));
  console.log('    restored (referents bound back):       ' + JSON.stringify(r.restored));
  kv('    verdict', `${r.gate.verdict}   ok=${r.gate.ok}   ${JSON.stringify(r.gate.counts)}`);
  for (const f of r.gate.fired) console.log('    ✗ ' + f.message + (f.relations?.length ? `  [${f.relations.join(' ; ')}]` : ''));
};

// a — faithful restatement of the given structure → continuous.
await drive('faithful restatement', 'Referent1 -> Referent2 : imports\nReferent1 -> Referent3 : calls\nReferent1 : Function\nReferent2 : Module\nReferent3 : Function', 'closed');
// b — a generation task proposing a NEW edge (refund should import ledger) → a PROPOSAL, surfaced not refused.
await drive('propose a new edge', 'Referent3 -> Referent2 : imports', 'open');
// c — the same new edge asserted as SETTLED FACT in an audit task → a FABRICATION, refused.
await drive('assert an unseen edge as fact', 'Referent2 -> Referent1 : owns', 'closed');

// ───────────────────────────────────────────────────────────────────────────────
// PROBE 3 — it is modality-blind: natural language rides the same loop.
// ───────────────────────────────────────────────────────────────────────────────
h('PROBE 3 — natural language, same membrane');

const nlDoc = eotDoc(['Awad : Person', 'Meridian : Company', 'Awad -> Meridian : advises'].join('\n'), { docId: 'nl', door: 'perceiver' });
const { messages: nlMsg, names: nlNames } = blindPrompt(nlDoc, { task: 'State the relationship.' });
kv('NL referents hidden', JSON.stringify(nlNames));
console.log('  blinded NL structure the model sees:');
nlMsg[1].content.split('\n').filter(Boolean).forEach((l) => console.log('    | ' + l));
const nlRun = await generateOverStructure({ model: stub('Referent1 : Person\nReferent2 : Company\nReferent1 -> Referent2 : advises'), doc: nlDoc, task: 't', mode: 'closed' });
kv('restored', JSON.stringify(nlRun.restored));
kv('verdict', `${nlRun.gate.verdict}  ok=${nlRun.gate.ok}`);

// ───────────────────────────────────────────────────────────────────────────────
// PROBE 4 — the gate catches a CONTRADICTION (a flipped bond) — the same base proposition
// carrying the opposite pole. It refuses in EITHER mode: a blind reasoner has no ground to
// overturn a bond it was handed. (Polarity is the one thing an EOT round-trip cannot carry — a
// negation is born in NL, parse/index.js, while an EOT re-read is always positive — so this is
// shown on the gate itself, over two readings, where the flip is exactly the gate's job.)
// ───────────────────────────────────────────────────────────────────────────────
h('PROBE 4 — a flipped bond is a contradiction, refused in either mode');

const given    = new Map([['ledger ⟩ imports ⟩ auth', { sub: 'ledger', rel: 'imports', dif: 'auth', pol: '-' }]]);  // ledger does NOT import auth
const returned = new Map([['ledger ⟩ imports ⟩ auth', { sub: 'ledger', rel: 'imports', dif: 'auth', pol: '+' }]]);  // the model returned: it DOES
console.log('  given  : ledger imports auth (−)   — a negated bond');
console.log('  return : ledger imports auth (+)   — the blind reasoner flipped it');
const cg = continuityGate(given, returned, { mode: 'open' });   // open mode — even so, a flip refuses
kv('verdict', `${cg.verdict}  ok=${cg.ok}`);
for (const f of cg.fired) console.log('  ✗ ' + f.message + (f.relations?.length ? `\n      ${f.relations.join('\n      ')}` : ''));

// ───────────────────────────────────────────────────────────────────────────────
// PROBE 5 — the real Anthropic API is a drop-in. Same driver, one line changed.
// ───────────────────────────────────────────────────────────────────────────────
h('PROBE 5 — the same loop over the real Anthropic API (model/anthropic.js)');

const key = process.env.EO_CLAUDE_KEY || process.env.ANTHROPIC_API_KEY || null;
if (!key) {
  console.log('  (no EO_CLAUDE_KEY / ANTHROPIC_API_KEY in the env — not calling the API)');
  console.log('  To run the blind loop against Claude for real:');
  console.log("    const claude = createModel('claude', { apiKey: KEY });");
  console.log('    await claude.load();');
  console.log("    const r = await generateOverStructure({ model: claude, doc: codeDoc, mode: 'open',");
  console.log("      task: 'Some binding is used before it is declared. Propose the reordering as EOT edges.' });");
  console.log('  Everything above is byte-identical; only the backend changes. Claude never learns a name.');
} else {
  const claude = createModel('claude', { apiKey: key });
  await claude.load();
  const r = await generateOverStructure({
    model: claude, doc: codeDoc, mode: 'open', maxTokens: 400,
    task: 'This is a dependency structure. Propose one edge that would make it more modular, as EOT, marked !clm.',
  });
  console.log('  Claude answered blind, then referents were bound back:');
  r.restored.split('\n').filter(Boolean).forEach((l) => console.log('    | ' + l));
  kv('verdict', `${r.gate.verdict}  ok=${r.gate.ok}  proposals=${r.gate.counts.proposals}`);
  kv('provenance', JSON.stringify(r.describe));
}

console.log('\n\x1b[1mThe wager:\x1b[0m the model did the structural reasoning; it never knew what it reasoned about;');
console.log('the referents came back on the return; and the gate proved the answer stayed faithful to the shape.\n');
