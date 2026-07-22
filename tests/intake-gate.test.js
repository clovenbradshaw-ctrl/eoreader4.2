import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// The web organ (organs/in/web.js, docs/the-web-organ-spec.md) used to be built and tested but
// never DRIVEN — its only caller anywhere in the app was tests/web-organ.test.js. This pins the
// live wire: a web-kind source's turning points now actually run the four gates + MDL
// keep-criterion, land as INTAKE DEFs on a session judgment log, and surface on the source
// itself (src.intake) — persisted, exported, and logged — so the gate is auditable per document,
// not only under test.

const freshApp = async (opts = {}) => {
  // No real network anywhere: recordHit falls through to the text it's handed when the page fetch
  // fails, and the witness (§6 tier 1) fails the same way — deterministic, no archive.org in a test.
  // temperature funds the §7 anomaly exploration hard, so a candidate with ANY nonzero amplitude
  // collapses near-certainly — the seeded-sample draw itself stays exactly the mechanism under
  // test, just no longer at the mercy of one fixture's specific (reproducible, but arbitrary) luck.
  const fetchImpl = async () => { throw new Error('no network in this test'); };
  const app = createReaderApp({ audit: { turns: [] }, fetchImpl, intake: { pollMs: 5, pollAttempts: 2, temperature: 80, ...opts } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

// A web-kind source, landed through the real public ingest entrance (recordHit) rather than the
// internal registry primitive — so this pins the gate exactly as a user's search/URL flow drives it.
const addWebSource = (app, { url, title, text }) => app.recordHit({ url, title, text });

// A long-enough page that the significance spine finds real turning points, with a fact
// ("Meridian Holdings", "case 2019cv04431") repeated across two independently-hosted pages so a
// bridge exists for the MDL gain to reward the second occurrence.
const PAGE_A = 'Meridian Holdings is named in case 2019cv04431. The filing was submitted in April. ' +
  'A separate court appearance followed in May. The judge requested additional documentation. ' +
  'Meridian Holdings did not respond to the request. The case was continued to the fall term. ' +
  'Analysts noted the filing was unusually detailed. A journalist obtained a copy of the record.';

const PAGE_B = 'The ledger shows Meridian Holdings received a transfer tied to case 2019cv04431. ' +
  'The transfer occurred in early April, before the court filing. Bank records confirm the routing. ' +
  'No other entity appears in the same ledger line. The auditor flagged the entry as unusual. ' +
  'A follow-up reconciliation found no matching invoice. The discrepancy remains unexplained.';

const waitForIntake = async (app, sn, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    const s = app.sourceBySn(sn);
    if (s?.intake) return s;
    await new Promise((r) => setTimeout(r, 10));
  }
  return app.sourceBySn(sn);
};

test('a web source is judged by the four gates and carries its intake record', async () => {
  const app = await freshApp();
  const src = await addWebSource(app, { url: 'https://court.gov/filing-a', title: 'Filing A', text: PAGE_A });
  const now = await waitForIntake(app, src.sn);

  assert.equal(now.kind, 'web');
  assert.ok(now.intake, 'the source carries an intake record');
  assert.ok(now.intake.candidates > 0, 'the significance spine produced candidate spans to judge');
  assert.equal(
    now.intake.fates.collapsed + now.intake.fates.rejected + now.intake.fates.encountered + now.intake.fates.nearMiss,
    now.intake.candidates,
    'every candidate lands in exactly one of the four fates',
  );
  assert.ok(Array.isArray(now.intake.decisions) && now.intake.decisions.length > 0, 'the decisions ride on the record');
  // provenance starts incomplete and is enriched (or stays incomplete) once the witness settles —
  // never silently omitted.
  assert.ok(now.intake.provenance && typeof now.intake.provenance.status === 'string');
});

test('every judged span lands as a real INTAKE DEF on the session judgment log', async () => {
  const app = await freshApp();
  const src = await addWebSource(app, { url: 'https://court.gov/filing-a', title: 'Filing A', text: PAGE_A });
  await waitForIntake(app, src.sn);

  const intakeDefs = app.intakeLog().filter((e) => e.grain === 'intake');
  assert.ok(intakeDefs.length > 0, 'at least one INTAKE DEF was logged');
  assert.ok(intakeDefs.every((d) => !d.malformed), 'every logged DEF carries a real witness (no oracle)');
  assert.ok(intakeDefs.every((d) => d.witness && typeof d.witness.address === 'string'), 'every DEF names the span it judged');
});

test('a second, independently-hosted source can bridge the first via MDL gain (source-independence, §5)', async () => {
  const app = await freshApp();
  const a = await addWebSource(app, { url: 'https://court.gov/filing-a', title: 'Filing A', text: PAGE_A });
  await waitForIntake(app, a.sn);

  const b = await addWebSource(app, { url: 'https://ledger.example/row', title: 'Ledger B', text: PAGE_B });
  const nowB = await waitForIntake(app, b.sn);
  assert.ok(nowB.intake.candidates > 0);

  // Some span in the SECOND (independently-hosted) source names one of the first page's already-
  // collapsed spans as an INDEPENDENT-lineage prior it bridges — the MDL gain the organ's own tests
  // exercise directly (explanatoryGain's `back`/`bridges`). The verdict itself still caps at
  // INDETERMINATE rather than CORROBORATED (intakeVerdict's B1 gate, web-keep.js:143-147) because
  // no ruled-out-other detection is wired here (that needs real entity disambiguation, out of scope
  // for this pass) — but the cross-document, cross-lineage BRIDGE is the thing §5 is actually about,
  // and it is what this proves.
  const defs = app.intakeLog();
  const bFromA = defs.filter((d) => d.witness?.address?.startsWith(nowB.sha) && (d.witness?.priors || []).some((p) => p.startsWith(a.sha)));
  assert.ok(bFromA.length > 0, 'the ledger page bridges to the court filing via an independent-lineage prior');
  assert.ok(bFromA.some((d) => (d.witness.bridges || []).length > 0), 'the bridge names the actual shared rare token(s)');
});

test('a non-web source (pasted text) is never routed through the web organ', async () => {
  const app = await freshApp();
  const src = app.ingestText('Local notes, never open-web material.', 'notes');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(app.sourceBySn(src.sn).intake, undefined, 'a non-web source carries no intake record');
});

test('the witness settles to WITNESS_INCOMPLETE without a network, never blocking the record', async () => {
  const app = await freshApp();
  const src = await addWebSource(app, { url: 'https://court.gov/filing-a', title: 'Filing A', text: PAGE_A });
  await waitForIntake(app, src.sn);
  // give the bounded poll loop (2 attempts × 5ms) time to finish settling before asserting.
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(app.sourceBySn(src.sn).intake.provenance.status, 'WITNESS_INCOMPLETE', 'no network ⇒ honestly incomplete, not silently shipped');
});
