// EO: SEG(Field,Network → Network, Unraveling) — output skeleton (SEG)
// skeleton — SEG: the shape of the proper output, two levels (docs/paragraph-at-a-
// time.md). Message 1: for longform to cohere across messages the loop must know
// what the whole output should be — and that shape is SECTIONS, each an ordered run
// of paragraph BEATS, not one heading per paragraph. A beat's `role` is `open` (the
// first paragraph of its section, which carries the heading) or `continue` (a
// paragraph that picks up WITHIN the section — no new heading, the prose flows on).
//
// The structure has two sources, and the honest one is the second:
//
//  - `outline` — the EMERGENT structure discovered by processing a corpus: the
//    significance loop surfaces the salient findings, and the surfer's frame-breaks
//    (atmosphere/paradigm shifts) are the section boundaries. Sections of findings,
//    handed in. This is the real path.
//  - mechanical fallback — no outline: a SINGLE flowing section over the developable
//    regions. We do NOT invent section breaks from a per-query retrieval (shape.js
//    forbids a canon); without discovered structure the answer flows as one section.
//
// The length demand caps the TOTAL paragraph count and is honest-floored against the
// findings the structure actually supplies (never padded to the demand). Carved
// once, copied forward across messages, never re-derived on resume.

import { developableRegions } from './answerable.js';

// A region strong enough to pin with a tight topic-sentence seed is LOAD-BEARING; a
// thinner one is CONNECTIVE and lets the render own the claim. Above the developable
// floor (answerable.js DEVELOPABLE_SCORE 0.4).
const LOAD_BEARING_SCORE = 0.6;

// A heading written from a topic — a few words, title-ish, no trailing punctuation.
export const headingOf = (topic = '') => {
  const words = String(topic).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 6);
  const h = words.join(' ').replace(/[.,;:!?]+$/, '');
  return h ? h[0].toUpperCase() + h.slice(1) : 'The reading';
};

// Normalise the two input shapes to a list of { heading, topic, findings:[{idx,topic}] }.
const sectionsFrom = ({ outline, ground, question, cap, max }) => {
  if (Array.isArray(outline) && outline.length) {
    return outline
      .map((s) => ({
        heading: s.heading != null ? s.heading : (s.topic ? headingOf(s.topic) : null),
        topic: s.topic || s.heading || '',
        findings: (s.findings || s.beats || [])
          .filter((f) => f && Number.isInteger(f.idx))
          .map((f) => ({ idx: f.idx, topic: f.topic || f.text || '' })),
      }))
      .filter((s) => s.findings.length);
  }
  // Fallback — one flowing section over the developable regions, no invented breaks.
  const regions = developableRegions(ground, new Set(), { max: Math.max(cap || 0, max) });
  if (!regions.length) return [];
  return [{
    heading: null,                                   // a flowing section carries no heading
    topic: question || regions[0].topic || '',
    findings: regions.map((r) => ({ idx: r.idx, topic: r.topic })),
  }];
};

export const buildSkeleton = ({ ground = [], question = '', demand = null, outline = null, max = 8 } = {}) => {
  const cap = Number.isInteger(demand) && demand > 0 ? demand : null;
  const scoreByIdx = new Map((ground || []).map((s, i) => [s.idx ?? i, s.score || 0]));
  const kindOf = (idx) => ((scoreByIdx.get(idx) || 0) >= LOAD_BEARING_SCORE ? 'load-bearing' : 'connective');

  const secs = sectionsFrom({ outline, ground, question, cap, max });
  const availableTotal = secs.reduce((n, s) => n + s.findings.length, 0);
  const plannedTotal = cap ? Math.min(cap, availableTotal) : availableTotal;

  // Flatten to ordered beats, capping the TOTAL paragraph count at the demand. The
  // first finding of a section OPENS it (carries the heading); the rest CONTINUE.
  const sections = [];
  const beats = [];
  let count = 0;
  for (let si = 0; si < secs.length && count < plannedTotal; si++) {
    const sec = secs[si];
    const sectionId = `s${si}`;
    const ids = [];
    for (let fi = 0; fi < sec.findings.length && count < plannedTotal; fi++) {
      const f = sec.findings[fi];
      beats.push(Object.freeze({
        id: `b${count}`,
        order: count,
        sectionId,
        idx: f.idx,
        topic: f.topic,
        kind: kindOf(f.idx),
        role: fi === 0 ? 'open' : 'continue',
        heading: fi === 0 ? sec.heading : null,      // heading only on the section opener
        state: 'pending',
      }));
      ids.push(`b${count}`);
      count += 1;
    }
    if (ids.length) sections.push(Object.freeze({ id: sectionId, heading: sec.heading, topic: sec.topic, beats: Object.freeze(ids) }));
  }

  return Object.freeze({
    question: String(question || ''),
    demand: cap,
    planned: plannedTotal,
    short: cap ? cap > availableTotal : false,
    shortfall: cap ? Math.max(0, cap - availableTotal) : 0,
    sections: Object.freeze(sections),
    beats: Object.freeze(beats),
  });
};
