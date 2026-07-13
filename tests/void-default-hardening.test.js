// Void-default hardening on two library-surface functions the audit found inverted (real, but
// with no in-repo consumer today — so hardened before a future caller inherits the wrong default).
// Pins the new contract so a regression back to a free firm/positive fails here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { standing } from '../src/core/supersede.js';
import { REC } from '../src/core/spectral.js';

test('hardening: standing().credit is null at cold start, not a free 1', () => {
  // Nothing committed → no basis yet → credit is void (null), never "fully credited".
  assert.equal(standing([]).credit, null);
  assert.equal(standing().credit, null);
  // once a claim is settled, credit is the earned share (a real number again).
  const c = standing([{ kind: 'assert', seq: 0, under: null }]).credit;
  assert.ok(c === null || typeof c === 'number');   // shape only; value depends on statusOf
});

test('hardening: spectral REC abstains (−1) with no derived floor; plain-SIG is opt-in via floor:0', () => {
  const dir = [1, 0];
  const lenses = [[1, 0]];                 // a perfect match for dir
  // default floor = Infinity → nothing clears the unmeasured bar → abstain to −1 (void).
  assert.equal(REC(dir, lenses), -1);
  // explicit floor:0 opts into "always match, i.e. plain SIG" → matches reading index 0.
  assert.equal(REC(dir, lenses, { floor: 0 }), 0);
  // an empty reading set is void regardless.
  assert.equal(REC(dir, []), -1);
});
