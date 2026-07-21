// Regenerate tests/fixtures/frankenstein-cast-golden.json from the CURRENT reading path.
//
//   node tests/helpers/regen-frankenstein-cast-golden.mjs
//
// Run this ONLY after an INTENTIONAL change to how the cast is read or filtered, and say so
// in the commit message: the fixture is the regression oracle (frankenstein-cast-golden.test.js)
// for the cast-quality bug (place names and categories flooding the "CAST · figures across the
// reading" panel) — regenerating it re-baselines what "correct" means. If the golden test fails
// and you did NOT intend to move the cast, the failure is the finding — fix the read, not the
// fixture. Takes ~20s (nestComposite re-parses each chapter/letter of the book).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { frankensteinCast } from './frankenstein-cast.mjs';

const golden = frankensteinCast();
const out = fileURLToPath(new URL('../fixtures/frankenstein-cast-golden.json', import.meta.url));
writeFileSync(out, JSON.stringify(golden, null, 2) + '\n');
console.log(`rebaselined the Frankenstein cast golden at ${out}`);
console.log(`  ${golden.count} figures on record · top ${golden.rows.length} in the panel · ${golden.excluded.length} excluded (setting/kind)`);
