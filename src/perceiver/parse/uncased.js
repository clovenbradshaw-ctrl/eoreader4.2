// EO: SIG·SEG·CON(Void → Field,Network, Tending,Composing) — uncased referent discovery
// FINDING THE FIGURES WHERE THE WRITING CARRIES NO CASE. The name scanner (entities.js) anchors on
// the capital — a name BEGINS with an uppercase letter. That reads Latin, Cyrillic, Greek. But
// Japanese and Chinese have NO case: 平清盛 and 六波羅 carry no capital, so the capital-anchored scan
// is structurally blind to them. Their figures must be found the OTHER way the reader already knows —
// by GRAVITY (entities.js:sightingGravity, and the geometric backward-referent discovery): a figure
// is whatever the discourse keeps returning to, in the position an agent takes.
//
// The move is the creature's, and it is the SAME scale-free induction used everywhere:
//   1. induce the CLOSED CLASS from the characters themselves (core/conventions/slots.js). The
//      functors — a language's particles/grammatical morphemes (は が を に の … in Japanese, 的 了 是
//      in Chinese) — are the highest-frequency company-sharing class; the induction finds them with
//      no list, exactly as it finds "the/of/a" in English. The closed class is the induced slot that
//      carries the most token mass.
//   2. a CONTENT RUN is a maximal run of letters that are NOT functors — a stretch of open-class
//      characters between two grammatical morphemes (a noun/name stem, its role marked by the
//      functor beside it). No spaces are needed; the functor frame segments the stream.
//   3. a content run is a FIGURE by gravity: it RECURS (a one-off is not a topic) and it mostly
//      stands in ARGUMENT POSITION — immediately before a functor, the slot an agent/patient fills.
//      A run the writing keeps placing in front of a case particle is what the text is ABOUT.
//
// Pure, dependency-free but for the kernel primitive, and script-agnostic by construction: no kanji
// ranges, no per-language particle list — a "content char" is any \p{L} the induction did not sort
// into the closed class, and a clause is any run of letters between non-letters (punctuation of any
// script). It returns the figures an uncased text draws its gravity toward; the organ layer can
// admit them like any other sighting. Validated on a Shift-JIS 平家物語 — it recovers 基房, 俊寛,
// 六波羅, 鳥羽 (real figures of the Heike) from the bytes alone, no dictionary.

import { createSlotField, BOUNDARY } from '../../core/conventions/index.js';

// discoverUncasedReferents(text, opts) → { functors, referents }
//   functors    the induced closed-class characters (the particles/grammatical morphemes)
//   referents   [{ form, count, arg, gravity }] the recurring content runs in argument position,
//               ranked by gravity (arg-position recurrence) — the figures the text is about.
//
//   minCount    a run must recur at least this often to be a topic (a one-off is not a figure).
//   minArgRate  the fraction of its sightings that stand in argument position (before a functor);
//               below it the run is an incidental content stretch, not a figure the grammar marks.
//   minLen/maxLen  a figure's length in characters — 1 is too ambiguous, a very long run is a phrase.
//   the rest are the induction's own knobs (frame width, min frequency, neighbourhood, floor).
export const discoverUncasedReferents = (text, {
  minCount = 3, minArgRate = 0.4, minLen = 2, maxLen = 6,
  frameSize = 16, minFreq = 6, k = 10, simFloor = 0.22, clusterTop = 120,
} = {}) => {
  // A clause is a run of letters (any script) between non-letters — punctuation, digits, space.
  // \p{L} is script-agnostic, so this segments Japanese (no spaces) and English (spaces) alike.
  const segs = String(text || '').split(/[^\p{L}]+/u).filter((s) => [...s].length > 1);
  if (!segs.length) return { functors: [], referents: [] };

  // 1) induce the closed class: the highest token-mass induced character-slot.
  const stream = [];
  for (const s of segs) { for (const ch of [...s]) stream.push(ch); stream.push(BOUNDARY); }
  const { slots, slotOf } = createSlotField({ frameSize, clusterTop, minFreq, k, simFloor })
    .observe(stream).cluster();
  if (!slots.length) return { functors: [], referents: [] };
  const freq = new Map();
  for (const ch of stream) if (ch !== BOUNDARY) freq.set(ch, (freq.get(ch) || 0) + 1);
  let closed = 0, best = -1;
  slots.forEach((g, i) => { const m = g.reduce((s, ch) => s + (freq.get(ch) || 0), 0); if (m > best) { best = m; closed = i; } });
  const isFunctor = (ch) => slotOf.get(ch) === closed;

  // 2) content runs between functors; note how often each stands in argument position.
  const runs = new Map();
  for (const s of segs) {
    const chars = [...s];
    let i = 0;
    while (i < chars.length) {
      if (isFunctor(chars[i])) { i++; continue; }
      let j = i;
      while (j < chars.length && !isFunctor(chars[j])) j++;
      const len = j - i;
      if (len >= minLen && len <= maxLen) {
        const form = chars.slice(i, j).join('');
        const next = chars[j];                       // undefined at clause end
        const r = runs.get(form) || { form, count: 0, arg: 0 };
        r.count++;
        if (next !== undefined && isFunctor(next)) r.arg++;   // a functor marks its grammatical role
        runs.set(form, r);
      }
      i = j;
    }
  }

  // 3) a figure recurs AND mostly stands where the grammar marks an argument. Gravity is its
  // argument-position recurrence (count × arg-rate = arg): what the text keeps casting as an agent.
  const referents = [...runs.values()]
    .filter((r) => r.count >= minCount && r.arg / r.count >= minArgRate)
    .map((r) => ({ ...r, gravity: r.arg }))
    .sort((a, b) => b.gravity - a.gravity || b.count - a.count
                 || (a.form < b.form ? -1 : a.form > b.form ? 1 : 0));

  return { functors: slots[closed] || [], referents };
};

// discoverUncasedRelations(text, opts) → [{ src, via, tgt }]
// The figures of an uncased clause take their roles by POSITION and the particle frame: an SOV
// language writes [agent]-particle [patient]-particle … [predicate], the verb last. So in a clause
// carrying EXACTLY two figures, the first is the agent, the second the patient, and the content run
// trailing the last figure (bounded by the clause end) is the predicate that bonds them. That yields
// src --predicate--> tgt with no dependency grammar — the same gravity read, one rung up.
//
// PRECISION IS DELIBERATELY NARROW. Only the exactly-two-figure clause is read (the unambiguous
// shape); a one-figure clause has no bond and a many-figure clause needs real dependency structure.
// Even so the edges are only as clean as the figure set feeding them — where discovery admits a
// common noun as a figure, a spurious edge follows — so this is a building block, not yet wired into
// the live reader. On a well-formed passage it is exact (清盛→呼ぶ→重盛); on the Heike it still finds
// the real 興福→争→延暦 (the temple war) among noisier co-occurrences.
export const discoverUncasedRelations = (text, { maxPredicate = 4, ...opts } = {}) => {
  const { referents, functors } = discoverUncasedReferents(text, opts);
  const figs = [...new Set(referents.map((r) => r.form))].sort((a, b) => b.length - a.length);
  if (figs.length < 2) return [];
  const funct = new Set(functors);
  const clauses = String(text || '').split(/[^\p{L}]+/u).filter((s) => [...s].length > 1);
  const edges = [];
  for (const clause of clauses) {
    // locate the figures in this clause (longest-first, masked so a superstring wins), in order.
    let masked = clause;
    const present = [];
    for (const f of figs) {
      let idx = masked.indexOf(f);
      while (idx >= 0) {
        present.push({ form: f, at: idx });
        masked = masked.slice(0, idx) + ' '.repeat([...f].length) + masked.slice(idx + f.length);
        idx = masked.indexOf(f);
      }
    }
    if (present.length !== 2) continue;                     // the one unambiguous SOV shape
    present.sort((a, b) => a.at - b.at);
    const [src, tgt] = present;
    if (src.form === tgt.form) continue;
    // the predicate: the content run (non-functor letters) trailing the last figure — the SOV verb.
    const chars = [...clause];
    let pred = '';
    for (let i = tgt.at + [...tgt.form].length; i < chars.length; i++) if (!funct.has(chars[i])) pred += chars[i];
    pred = pred.replace(/[^\p{L}]/gu, '');
    const plen = [...pred].length;
    if (plen < 1 || plen > maxPredicate) continue;          // a plausible verb, not a run-on tail
    edges.push({ src: src.form, via: pred, tgt: tgt.form });
  }
  return edges;
};
