#!/usr/bin/env node
// The judgment scoreboard, run from the shell (docs "The Work, v2" #1; the battery doc is
// docs/judgment-eval-battery-2026-07.md). Drives every specimen through the real pipeline —
// offline, deterministic, nothing sent anywhere — and prints the per-grain verdict census
// with the two headlines: CONFIDENT-WRONG rate and the OVERTURN rate under further reading.
//
//   node tools/judgment-battery.mjs                 the scoreboard
//   node tools/judgment-battery.mjs --json          full per-specimen dump (corpus tuning)
//   node tools/judgment-battery.mjs --specimen <id> one specimen, projections printed
//
// The witness-audit oracle (metabolism/def-oracle.js) stays DRY here by design: arming it is
// programmatic only, so this script can never spend a token. It prints how many audit
// requests a wired oracle would have sent.

import { SPECIMENS } from '../tests/fixtures/judgment-specimens.js';
import { runSpecimen, runBattery } from '../src/metabolism/defharness.js';
import { renderScoreboard } from '../src/metabolism/defscore.js';
import { createDefOracle } from '../src/metabolism/def-oracle.js';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const onlyId = args.includes('--specimen') ? args[args.indexOf('--specimen') + 1] : null;

const stripTurns = (s) => ({
  id: s.id, ratchet: s.ratchet, shape: s.shape, verdicts: s.verdicts,
  stability: s.stability, rows: s.rows,
});

if (onlyId) {
  const specimen = SPECIMENS.find((s) => s.id === onlyId);
  if (!specimen) {
    console.error(`no specimen '${onlyId}' — have: ${SPECIMENS.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }
  const r = await runSpecimen(specimen);
  if (asJson) {
    console.log(JSON.stringify(stripTurns(r), null, 2));
  } else {
    console.log(`=== ${r.id} ===`);
    for (const [of, d] of r.turns.full.judgmentLog.project()) {
      console.log(`  [${d.grain}] ${of} -> ${d.verdict}${d.malformed ? '  MALFORMED:' + d.malformed : ''}`);
    }
    for (const row of r.rows) console.log(`  gold [${row.grain}] ${row.match} -> ${row.outcome} (${row.projected ?? 'no DEF'})`);
    console.log(`  stability: ${r.stability.overturned} overturned / ${r.stability.committed} committed; ${r.stability.emergent} emergent, ${r.stability.dropped} dropped`);
  }
  process.exit(0);
}

const oracle = createDefOracle({});   // dry: requests form, nothing sends
const { perSpecimen, scoreboard, errors } = await runBattery(SPECIMENS, { oracle });

if (asJson) {
  console.log(JSON.stringify({ scoreboard, perSpecimen: perSpecimen.map(stripTurns), errors }, null, 2));
} else {
  console.log(renderScoreboard(scoreboard));
  if (errors.length) {
    console.log('\nERRORS:');
    for (const e of errors) console.log(`  ${e.id}: ${e.error}`);
  }
  console.log(`\noracle: dry-run, ${oracle.requests().length} audit requests built, 0 sent`);
}
process.exit(errors.length ? 1 : 0);
