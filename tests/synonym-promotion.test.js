import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSynonymPromotion } from '../src/enactor/ground/synonym-promotion.js';

// docs/coreference-timeline.md § "The promotion threshold" — the support/strain register a
// corroborated cross-source synonym pair earns, gated by the corpus's own two-distinct-voice
// corroboration bar, never a hand-tuned promotion count. These tests pin the doc's own worked
// example (§ "Worked through the housing fixture") and its accounting rules verbatim.

test('one voice never promotes — a single document\'s habitual phrasing is not corpus consensus', () => {
  const promo = createSynonymPromotion();
  const r = promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'doc2', host: 'doc2' });
  assert.equal(r.voices, 1);
  assert.equal(r.promoted, false);
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), false);
});

test('two independent mentions inside ONE document never promote the pair', () => {
  const promo = createSynonymPromotion();
  // same document id twice — sameWitness collapses them to one voice (corroboration.js's own rule).
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'doc2', host: 'doc2' });
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'doc2', host: 'doc2' });
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), false);
});

test('a second, DISTINCT voice crosses the gate: support = 2, origin learned', () => {
  const promo = createSynonymPromotion();
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'doc2', host: 'wire-service.example' });
  const r = promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'doc3', host: 'city-news.example' });
  assert.equal(r.voices, 2);
  assert.equal(r.promoted, true);
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), true);
});

test('order-independence — pairKey does not care which label is a or b', () => {
  const promo = createSynonymPromotion();
  promo.corroborate('the housing trust', 'the Barnes Fund', { id: 'a', host: 'a.example' });
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'b', host: 'b.example' });
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), true);
  assert.equal(promo.isPromoted('the housing trust', 'the Barnes Fund'), true);
});

test('further corroborations reinforce support without a bigger threshold', () => {
  const promo = createSynonymPromotion();
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'a', host: 'a.example' });
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'b', host: 'b.example' });
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), true);
  // a third, fourth, fifth independent voice — accumulation, not a bigger chosen number.
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'c', host: 'c.example' });
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'd', host: 'd.example' });
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), true);
});

test('a dissenting assertDistinct accrues strain against the STANDING RULE and can defeat it', () => {
  const promo = createSynonymPromotion();
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'a', host: 'a.example' });
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'b', host: 'b.example' });
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), true);   // support = 2, strain = 0

  promo.dispute('the Barnes Fund', 'the housing trust');                         // strain = 1 (contested, not defeated)
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), true);

  promo.dispute('the Barnes Fund', 'the housing trust');                         // strain = 2 (< 2? equal support)
  promo.dispute('the Barnes Fund', 'the housing trust');                         // strain = 3 > support = 2 — defeated
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), false, 'strain overtaking support defeats it');
});

test('no silent reinstatement — a defeated pair does not re-promote on further corroboration', () => {
  const promo = createSynonymPromotion();
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'a', host: 'a.example' });
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'b', host: 'b.example' });
  promo.dispute('the Barnes Fund', 'the housing trust');
  promo.dispute('the Barnes Fund', 'the housing trust');
  promo.dispute('the Barnes Fund', 'the housing trust');
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), false);

  // more corroborating voices arrive after defeat — still no automatic re-promotion.
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'c', host: 'c.example' });
  promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'd', host: 'd.example' });
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), false,
    'reinstatement requires an explicit call, never a mechanical re-cross of the gate');

  // only the explicit, authoritative channel brings it back.
  promo.reinstate('the Barnes Fund', 'the housing trust');
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), true);
});

test('the housing fixture, worked exactly as the doc describes it', () => {
  const promo = createSynonymPromotion();
  // Doc 1 introduces "the Barnes Fund". Doc 2 (distinct voice) corroborates "the housing trust" —
  // one voice, below the gate, still model-tier.
  const afterDoc2 = promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'doc2', host: 'doc2.example' });
  assert.equal(afterDoc2.promoted, false);

  // Doc 3 (a third, distinct voice) uses "the affordable-housing fund", corroborating against the
  // SAME cluster (i.e. the same standing pair the crosswalk already tracks) — two distinct voices
  // now support the pairing, so it promotes: support = 2, logged.
  const afterDoc3 = promo.corroborate('the Barnes Fund', 'the housing trust', { id: 'doc3', host: 'doc3.example' });
  assert.equal(afterDoc3.promoted, true);

  // a hypothetical doc 5 reusing both labels no longer needs the witness channel to PROPOSE the
  // merge — the ledger already trusts the pair (the ordinary convergence check still has final say,
  // which lives outside this module, § "What crossing the gate actually changes").
  assert.equal(promo.isPromoted('the Barnes Fund', 'the housing trust'), true);
});
