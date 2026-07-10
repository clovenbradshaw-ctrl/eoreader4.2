// EO: NUL·EVA(Link → Void,Lens, Clearing,Binding) — surface renderers + validator
// essay/renderers.js — many surfaces, one commitment graph.
//
// Renderers are per-modality and all fold the SAME commitments, the way the
// reads all fold one log: the number in a caption and the number in a bar are
// the same field of the same proposition, so the paragraph and the chart are
// not made to agree — they are unable to disagree. Every renderer here is
// DETERMINISTIC: by render time the payloads are chosen and bound, so a
// non-text surface is a projection, not a generation; the model is only ever
// asked for text, and even that is verified back at claim grain (driver.js).
//
// validateSurface is the cross-modal consistency check made a predicate:
// nothing may appear on a surface without a payload source under it. It never
// negotiates; it only refuses.

import { numbersIn } from './proposition.js';
import { termsOf, termSimilarity } from './terms.js';

const freeze = Object.freeze;

// The chart projection: one datum per quantity-bearing commitment, the label
// read off the payload's entities, the caption the text projection of the
// same commitments. Commitments without quantities ride in the caption only.
export const renderChart = (commitments = [], { kind = 'bar' } = {}) => {
  const data = [];
  for (const c of commitments) {
    const q = c.prop?.quantities?.[0];
    if (!q) continue;
    data.push(freeze({
      label: (c.prop.entities[0] || termsOf(c.claim).slice(0, 3).join(' ')) + (c.prop.time ? ` (${c.prop.time})` : ''),
      value: q.value, unit: q.unit, spanRefs: [...c.spanRefs], claimId: c.claimId,
    }));
  }
  return freeze({
    modality: 'chart', kind,
    data: freeze(data),
    caption: commitments.map((c) => c.claim).join(' '),
  });
};

// The pull-quote projection: one commitment, verbatim, with its provenance.
export const renderPullquote = (commitment) => freeze({
  modality: 'pullquote',
  text: commitment.claim,
  spanRefs: [...commitment.spanRefs],
});

// A divider asserts nothing — the honest seam when no model is on hand to
// phrase a transition (and often the fluent move even when one is).
export const renderDivider = () => freeze({ modality: 'divider' });

// ── The cross-modal validator ────────────────────────────────────────────────
// surface ⊆ payload, per modality. Text: every number on the surface belongs
// to some commitment's quantities/time (or, when spans are supplied, to a
// bound span — a quoted figure is sourced even when the lexical prop reading
// missed it). Chart: every datum value is some payload quantity AND its label
// touches that payload's vocabulary. Pullquote: verbatim of a bound claim.
export const validateSurface = (surface, commitments = [], { spans = [] } = {}) => {
  const violations = [];
  if (!surface) return { ok: false, violations: ['no surface'] };

  const allowed = new Set();
  for (const c of commitments) {
    for (const q of c.prop?.quantities || []) allowed.add(q.value);
    if (c.prop?.time != null) allowed.add(+c.prop.time);
  }
  for (const s of spans) for (const n of numbersIn(s.text)) allowed.add(n.value);

  if (surface.modality === 'text' || typeof surface === 'string') {
    const text = typeof surface === 'string' ? surface : surface.text;
    for (const n of numbersIn(text)) {
      if (!allowed.has(n.value)) violations.push(`quantity ${n.raw} has no payload source`);
    }
  } else if (surface.modality === 'chart') {
    for (const d of surface.data || []) {
      if (!allowed.has(+d.value)) { violations.push(`datum ${d.value} has no payload source`); continue; }
      const owner = commitments.find((c) => (c.prop?.quantities || []).some((q) => q.value === +d.value));
      if (owner && d.label && termSimilarity(termsOf(d.label), termsOf(owner.claim)).shared === 0) {
        violations.push(`datum label "${d.label}" does not touch its payload`);
      }
    }
    for (const n of numbersIn(surface.caption || '')) {
      if (!allowed.has(n.value)) violations.push(`caption quantity ${n.raw} has no payload source`);
    }
  } else if (surface.modality === 'pullquote') {
    if (!commitments.some((c) => c.claim === surface.text)) {
      violations.push('pullquote is not a bound claim verbatim');
    }
  }
  return { ok: violations.length === 0, violations };
};
