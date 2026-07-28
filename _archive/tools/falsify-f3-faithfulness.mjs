// FALSIFIER F3 (spec §7) — does the WALK beat the plain path on faithfulness?
//
//   "compareModes in longgen/generate.js already runs both and returns faithfulnessDelta
//    and plannerAtLeastAsFaithful. It exists and it has never been pointed at the reader's
//    real traffic. Run it on fifty live questions before making the walk the default. If the
//    planner is less faithful than the plain path, the walk ships prose the ground does not
//    support and the honest move is a short answer, exactly as CAPABILITY_CUE was clumsily
//    saying."
//
// This is the falsifier that settles whether the walk (planner ON — the §4 wiring) should
// become the long-form default, or whether the correct long-form policy is a short grounded
// answer (the plain path, planner OFF, with the answerability gate). It is the empirical
// claim CAPABILITY_CUE was asserting without inspection.
//
// F3 requires a LIVE MODEL and REAL GROUND — a question set where each record carries the
// retrieved spans the turn would ground on, plus a talker with a .phrase() method. The
// reader's dependable talker is the hosted `claude` backend (src/model/anthropic.js), which
// needs an API key and the browser SDK; there is no headless model in this repo. So F3 runs
// only where a keyed model is reachable. Absent one it reports BLOCKED and — per the spec
// ("before making the walk the default") — the walk is NOT licensed as the default.
//
//   node tools/falsify-f3-faithfulness.mjs --questions <file.jsonl> [--backend claude] [--key <k>]
//
//   question record: {question, ground:[{idx,text,score}], doc?}   (doc optional)

import { readFileSync, existsSync } from 'node:fs';

import { compareModes } from '../src/weave/longgen/generate.js';
import '../src/model/anthropic.js';           // registers the 'claude' backend
import '../src/model/echo.js';                // registers the offline 'echo' backend (smoke only)
import { createModel } from '../src/model/interface.js';

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const questionsPath = arg('--questions');
const backend = arg('--backend') || 'claude';
const key = arg('--key') || process.env.EO_CLAUDE_KEY || process.env.ANTHROPIC_API_KEY || null;

const jsonl = (p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

const blocked = (why, hint) => {
  console.log('# FALSIFIER F3 — walk (planner ON) vs plain path (planner OFF) on faithfulness\n');
  console.log(`BLOCKED — ${why}`);
  if (hint) console.log(hint);
  console.log('\nVERDICT: INCONCLUSIVE — F3 could not run in this environment. Per the spec');
  console.log('("Run it on fifty live questions before making the walk the default"), the walk is');
  console.log('NOT licensed as the long-form default until this measurement clears. If it cannot');
  console.log('beat the plain path on faithfulness, the correct long-form policy is a short');
  console.log('grounded answer (the plain path + answerability gate), reached by measurement.');
  process.exit(0);
};

if (!questionsPath || !existsSync(questionsPath)) {
  blocked('no question set', '  Provide --questions <file.jsonl> with records {question, ground:[{idx,text,score}], doc?}.');
}

let model;
try {
  model = createModel(backend, key ? { apiKey: key } : {});
  await model.load?.();
  // a cheap liveness check so a dead key fails HERE, not mid-run
  await model.phrase([{ role: 'user', content: 'ok' }], { maxTokens: 4 });
} catch (e) {
  blocked(`the '${backend}' model could not run in Node: ${e.message}`,
    "  The hosted talker needs a key and the browser SDK; run F3 where a keyed model is\n" +
    "  reachable (browser/headless-chromium, like tools/verify-shapes.mjs), or pass --key.");
}

const questions = jsonl(questionsPath).filter((r) => r.question && Array.isArray(r.ground));
if (!questions.length) blocked('the question set has no usable records', null);

console.log('# FALSIFIER F3 — walk (planner ON) vs plain path (planner OFF) on faithfulness');
console.log(`model: ${backend}   questions: ${questions.length}\n`);

const results = [];
for (let i = 0; i < questions.length; i++) {
  const r = questions[i];
  const ground = r.ground.map((s, j) => ({ idx: s.idx ?? j, text: s.text ?? String(s), score: s.score ?? 0 }));
  try {
    const cmp = await compareModes({ ground, model, doc: r.doc || null, graph: null, question: r.question });
    results.push(cmp);
    console.log(`  [${i + 1}/${questions.length}] Δfaithful ${cmp.faithfulnessDelta >= 0 ? '+' : ''}${cmp.faithfulnessDelta}` +
      `  planner≥plain: ${cmp.plannerAtLeastAsFaithful}  — ${r.question.slice(0, 60)}`);
  } catch (e) {
    console.log(`  [${i + 1}/${questions.length}] ERR ${e.message}`);
  }
}

if (!results.length) blocked('every comparison errored', null);
const meanDelta = results.reduce((s, r) => s + (r.faithfulnessDelta || 0), 0) / results.length;
const atLeast = results.filter((r) => r.plannerAtLeastAsFaithful).length;
console.log(`\nmean faithfulnessDelta (planner − plain): ${meanDelta >= 0 ? '+' : ''}${meanDelta.toFixed(4)}`);
console.log(`planner at least as faithful as plain: ${atLeast}/${results.length} (${(100 * atLeast / results.length).toFixed(0)}%)`);
const pass = meanDelta >= 0 && atLeast >= results.length * 0.5;
console.log(`\nVERDICT: ${pass
  ? 'PASS — the walk is at least as faithful as the plain path. Making it the long-form default is licensed.'
  : 'FAIL — the walk is LESS faithful than the plain path. Do not default the walk; the honest long-form policy is a short grounded answer (plain path + gate).'}`);
process.exit(0);
