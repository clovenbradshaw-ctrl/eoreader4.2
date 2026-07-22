import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// THE SOLAR MEANING RING CARRIES A MANNER SPECTRUM AND A STANDING (FIRMING/CONTESTED) READ.
//
// tieredData draws the meaning ring flat — every claim a bare position. solarMeaningData is the
// solar-only view over the same data that adds the two reads the orbit surface wants:
//   · MANNER — each body says what KIND of act it is (distinguishes / links / introduces), read
//     off the operator's Mode. DEF properties distinguish; the figure's own bonds, folded in,
//     link or introduce — so the ring reads as a real spectrum, not one note.
//   · STANDING — is a claim firming up (multiply witnessed, flatly asserted) or coming apart
//     (negated / hedged)? An honest, log-backed read, scoped to this figure's own reading.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

// Darcy: standing properties (DEF → distinguishes) AND a bond (a marriage → CON → links), plus a
// property asserted TWICE identically (firming) and one hedged (unsettled).
const TEXT = [
  'Fitzwilliam Darcy is a wealthy gentleman.',
  'Darcy is a wealthy gentleman.',
  'Darcy may be arrogant.',
  'Darcy married Elizabeth Bennet.',
].join(' ');

const solarOf = (app) => {
  const src = app.ingestText(TEXT, 'Darcy');
  const data = app.topicTieredData([src]);
  const darcy = (data.nodes || []).find((n) => n.kind === 'entity' && /darcy/i.test(n.label) && n.ref);
  assert.ok(darcy, 'Darcy is admitted as a figure');
  return { src, ...app.solarMeaningData(darcy.ref.docId, darcy.ref.entId) };
};

test('every meaning-ring claim carries an operator and its manner word', async () => {
  const app = await freshApp();
  const { nodes } = solarOf(app);
  const claims = nodes.filter((n) => n.kind === 'claim');
  assert.ok(claims.length > 0, 'the ring has claims');
  assert.ok(claims.every((c) => c.op && c.manner),
    'no claim is drawn without its operator + manner (never a position without a spectrum)');
  // the three manners are exactly the record's three Modes, said plainly
  assert.ok(claims.every((c) => ['distinguishes', 'links', 'introduces'].includes(c.manner)),
    'a manner is always one of distinguishes / links / introduces');
});

test('folding the figure\'s bonds in makes the spectrum genuinely vary', async () => {
  const app = await freshApp();
  const { nodes } = solarOf(app);
  const manners = new Set(nodes.filter((n) => n.kind === 'claim').map((c) => c.manner));
  // DEF properties distinguish; the marriage / fathering bonds link or introduce — so the ring is
  // never a wall of one manner.
  assert.ok(manners.size >= 2, `the ring shows more than one manner (${[...manners].join(', ')})`);
  assert.ok(manners.has('distinguishes'), 'the standing properties read as distinguishes');
  const bondClaims = nodes.filter((n) => n.kind === 'claim' && n.bond);
  assert.ok(bondClaims.length > 0, 'the figure\'s own bonds are folded in as meaning-ring claims');
  assert.ok(bondClaims.every((c) => c.ref && c.ref.entId),
    'a bond-claim keeps a ref to the figure at the other end, so selecting it still offers "open →"');
});

test('a claim\'s standing reads firming / fresh / unsettled from the log, never a number', async () => {
  const app = await freshApp();
  const { nodes } = solarOf(app);
  const claims = nodes.filter((n) => n.kind === 'claim');
  assert.ok(claims.every((c) => !c.standing || ['fresh', 'firming', 'unsettled'].includes(c.standing)),
    'standing is one of the three honest bands, or absent — never a confidence percentage');
  // "wealthy gentleman" is asserted twice → firming; "may be arrogant" is hedged → unsettled.
  const def = nodes.filter((n) => n.kind === 'claim' && !n.bond);
  assert.ok(def.some((c) => c.standing === 'firming'),
    'a property witnessed more than once reads as firming up');
  assert.ok(def.some((c) => c.standing === 'unsettled'),
    'a hedged property reads as unsettled (the record does not hold it flat)');
});

test('solarMeaningData leaves tieredData (the entity web\'s feed) untouched', async () => {
  const app = await freshApp();
  const src = app.ingestText(TEXT, 'Darcy');
  const data = app.topicTieredData([src]);
  const darcy = (data.nodes || []).find((n) => n.kind === 'entity' && /darcy/i.test(n.label) && n.ref);
  const plain = app.tieredData(darcy.ref.docId, darcy.ref.entId);
  // tieredData's claims are still flat — no op/manner/standing/bond-claims leaked into the shared feed
  assert.ok(plain.nodes.filter((n) => n.kind === 'claim').every((c) => !c.manner && !c.standing && !c.bond),
    'the shared tiered feed stays byte-flat — the enrichment is solar-only');
});
