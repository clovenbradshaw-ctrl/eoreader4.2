// Regenerate tests/fixtures/prompt-golden.json from the CURRENT prompt builders.
//
//   node tests/helpers/regen-prompt-golden.mjs
//
// Run this ONLY after an INTENTIONAL byte change to the prompt (a band edited on
// purpose), and say so in the commit message: the fixtures are the byte-identity
// oracle (tests/prompt-golden.test.js), and regenerating them re-baselines what
// "identical" means. If prompt-golden.test.js fails and you did NOT intend to move
// a byte, the failure is the finding — fix the projection, not the fixtures.

import { buildGroundedMessages, buildCursorMessages, buildChatMessages } from '../../src/model/prompt.js';
import { GROUNDED_CASES, CURSOR_CASES, CHAT_CASES } from './prompt-golden-cases.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const run = (cases, build) => Object.fromEntries(cases.map(c => [c.name, build(c.args)]));
const golden = {
  grounded: run(GROUNDED_CASES, buildGroundedMessages),
  cursor:   run(CURSOR_CASES, buildCursorMessages),
  chat:     run(CHAT_CASES, buildChatMessages),
};
const out = fileURLToPath(new URL('../fixtures/prompt-golden.json', import.meta.url));
writeFileSync(out, JSON.stringify(golden, null, 2) + '\n');
const n = Object.values(golden).reduce((a, g) => a + Object.keys(g).length, 0);
console.log(`rebaselined ${n} fixtures at ${out}`);
