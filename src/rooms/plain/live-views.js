// EO: DEF·NUL·CON(Entity,Lens,Field → Field,Void,Link, Dissecting,Clearing,Binding) —
// the live plain-view projections (engine → the plain surface's explore cards)
// live-views.js — the honest computations behind the plain surface's remaining explore cards
// when it runs over the person's REAL ingested sources instead of the worked scene. Where
// disagreement.js answers "what do people mean by this word" and shifts.js "when did that
// meaning change", this file answers the other cards the surface offers:
//
//   Blind spots (§8)  — things the corpus NAMES but never EXPLAINS (the typed void, NUL)
//   Map (§6)          — the things named · what sits around them, never connected · the patterns
//   Study guide (§7)  — an ordered reading path, composed from what actually exists
//   Timeline          — the dated documents placed in time
//
// Every one is a projection of the real text: it reports what the sources literally carry and,
// crucially, what they DON'T — a blind spot is a real absence, not a guess. Pure and testable:
// (sources, terms) in, plain models out, matching scene.js's shapes so the surface renders either
// with the same code. `liveScene` overlays these onto a scene so the surface needs no new branch.
// Pinned by tests/plain-live-views.test.js.

import { characterize } from './disagreement.js';
import { toMs, fmt } from './shifts.js';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const dedupe = (xs) => {
  const seen = new Set(); const out = [];
  for (const x of xs || []) { const k = String(x).toLowerCase(); if (x && !seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
};

// Whole-word, case-insensitive mention count of `term` in `text`.
export const mentionsOf = (text, term) => {
  const t = norm(term);
  if (!t) return 0;
  const m = String(text || '').match(new RegExp(`\\b${escRe(t)}\\b`, 'gi'));
  return m ? m.length : 0;
};

const STOP = new Set(('the a an and or but of to in on at for with by from as is are was were be been being this that ' +
  'these those it its their his her our your my we they he she you i not no over into per about between if then so').split(' '));

// When no entity list is available, derive candidate terms from the text itself: capitalized
// proper-noun phrases that recur (appear two or more times) — the things the documents name.
export const candidateTerms = (sources, { limit = 40 } = {}) => {
  const counts = new Map();
  for (const s of sources || []) {
    const re = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3})\b/g;
    let m;
    while ((m = re.exec(String(s.text || '')))) {
      const p = m[1]; if (STOP.has(p.toLowerCase())) continue;
      counts.set(p, (counts.get(p) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([p]) => p);
};

const termsFor = (sources, terms) => (terms && terms.length ? dedupe(terms) : candidateTerms(sources));

// Per term: total mentions, how many sources mention it, whether ANY source ever characterizes it
// (says what it IS). The shared floor for the blind-spots, map, and study-guide projections.
export const termStats = (sources, terms) => {
  const rows = [];
  for (const term of termsFor(sources, terms)) {
    let mentions = 0, inSources = 0, characterized = 0;
    for (const s of sources || []) {
      const n = mentionsOf(s.text, term);
      if (n > 0) { mentions += n; inSources += 1; }
      if (n > 0 && characterize(s.text || '', term, { extra: s.extra || [] }).length) characterized += 1;
    }
    if (mentions > 0) rows.push({ term, mentions, inSources, characterized });
  }
  return rows.sort((a, b) => b.mentions - a.mentions || a.term.localeCompare(b.term));
};

// The terms the corpus leans on most, most-mentioned first — the candidate leads for the guide.
export const rankedTerms = (sources, terms) => termStats(sources, terms).map((r) => r.term);

// Blind spots (§8): a term the corpus NAMES (mentioned, ≥ minMentions) that NO source ever
// explains — zero characterizations anywhere. The typed void made visible: a real absence.
export const blindSpots = (sources, terms, { minMentions = 2, limit = 8 } = {}) =>
  termStats(sources, terms)
    .filter((r) => r.characterized === 0 && r.mentions >= minMentions)
    .slice(0, limit)
    .map((r) => ({
      name: `“${r.term}”`,
      note: `Named ${r.mentions} time${r.mentions === 1 ? '' : 's'} across ${r.inSources} source${r.inSources === 1 ? '' : 's'}. Never explained.`,
      mentions: r.mentions, sources: r.inSources,
    }));

// The characterization SENSES (head nouns) that recur across the corpus — the same shape of
// description applied by two or more distinct source·term pairs. A representative label each.
const recurringSenses = (sources, terms) => {
  const seenBy = new Map(); const label = new Map();
  for (const term of termsFor(sources, terms)) {
    for (const s of sources || []) {
      if (mentionsOf(s.text, term) === 0) continue;
      for (const c of characterize(s.text || '', term, { extra: s.extra || [] })) {
        if (!seenBy.has(c.sense)) seenBy.set(c.sense, new Set());
        seenBy.get(c.sense).add(`${s.id}|${String(term).toLowerCase()}`);
        if (!label.has(c.sense) || c.label.length < label.get(c.sense).length) label.set(c.sense, c.label);
      }
    }
  }
  return [...seenBy.entries()].filter(([, set]) => set.size >= 2)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])).map(([sense]) => label.get(sense) || sense);
};

const dateOf = (s) => (s && s.date != null && s.date !== '' ? s.date : (s && (s.recordedAt || s.retrieved)) || null);
const dateSpan = (sources) => {
  const ms = (sources || []).map((s) => toMs(dateOf(s))).filter(Number.isFinite).sort((a, b) => a - b);
  return ms.length ? { from: fmt(ms[0]), to: fmt(ms[ms.length - 1]), now: '' } : { from: '—', to: '—', now: '' };
};

// Map (§6): the things the documents name (most-mentioned), what sits around them (named in a
// single source, never characterized — present but unconnected: the desert cell), and the
// patterns (recurring characterization senses). Matches scene.MAP's shape.
export const mapModel = (sources, terms, { things = 8, around = 6, patterns = 5 } = {}) => {
  const stats = termStats(sources, terms);
  const thingsList = stats.slice(0, things).map((r) => r.term);
  const aroundList = stats
    .filter((r) => r.inSources === 1 && r.characterized === 0 && !thingsList.includes(r.term))
    .sort((a, b) => a.mentions - b.mentions || a.term.localeCompare(b.term))
    .slice(0, around).map((r) => r.term);
  return {
    things: thingsList,
    around: aroundList,
    patterns: recurringSenses(sources, terms).slice(0, patterns),
    desert: aroundList.length
      ? 'These get named but nothing in your sources ties them to the rest. We’re not going to guess why — that part’s yours.'
      : 'Nothing sits unconnected yet — every named thing here is tied to something else.',
    span: dateSpan(sources),
    shiftMarks: [],
  };
};

// Timeline: the dated documents placed in time. Undated sources are honestly reported as
// excluded, not guessed into an order. Shape { marks:[{ kind, when, text }] } like a shift model.
export const timelineModel = (sources) => {
  const dated = (sources || [])
    .map((s) => ({ label: s.label || s.id, ms: toMs(dateOf(s)) }))
    .filter((x) => Number.isFinite(x.ms)).sort((a, b) => a.ms - b.ms);
  const undated = (sources || []).length - dated.length;
  const marks = dated.map((d) => ({ kind: 'steady', when: fmt(d.ms), text: d.label }));
  if (undated > 0) marks.push({ kind: 'steady', when: 'undated',
    text: `${undated} source${undated === 1 ? '' : 's'} carry no date — not placed on the line.` });
  return { marks, dated: dated.length, undated };
};

// Study guide (§7): an ordered reading path composed from what the sources actually contain. The
// order is the pedagogy — meet the documents and their vocabulary, then how the pieces fit, then
// where meanings are contested and where the record goes silent. `disagreements`/`shifts`/`blind`
// are supplied by the caller (project.js), which runs the real parser to find them.
export const studyGuideModel = (sources, terms, { disagreements = [], shifts = [], blind = [] } = {}) => {
  const nSrc = (sources || []).length;
  const stats = termStats(sources, terms);
  const top = stats.slice(0, 5).map((r) => r.term);
  const start = [`What’s in ${nSrc === 1 ? 'this document' : `these ${nSrc} documents`}`];
  if (top.length) start.push(`The words that keep coming back: ${top.slice(0, 4).join(', ')}`);
  if (stats.length) start.push(`The ${stats.length} thing${stats.length === 1 ? '' : 's'} your sources actually name`);
  const fits = disagreements.slice(0, 3).map((d) => `What your sources mean by “${d}” — and where they part ways`);
  if (!fits.length && top.length) fits.push(`How “${top[0]}” runs through the documents`);
  const breaks = [];
  for (const sh of shifts.slice(0, 2)) breaks.push({ text: `${sh.when}: what “${sh.term}” means changes`, star: true });
  for (const b of blind.slice(0, 2)) breaks.push(`What none of these documents explain: ${b.name}`);
  if (!breaks.length) breaks.push('What none of these documents can tell you');
  return {
    title: nSrc ? `A path through your ${nSrc} source${nSrc === 1 ? '' : 's'}` : 'A reading path',
    built: `built from your ${nSrc} source${nSrc === 1 ? '' : 's'}`,
    groups: [
      { title: 'START HERE — what you’re looking at', sections: start },
      { title: 'HOW IT FITS TOGETHER', sections: fits },
      { title: 'WHAT IT MEANS — AND WHERE IT BREAKS', sections: breaks },
    ].filter((g) => g.sections.length),
  };
};

// Overlay the live projections onto a scene so the surface's card renderers read S.STUDY_GUIDE /
// S.MAP / S.BLIND_SPOTS / S.SHIFTS unchanged — here those keys are recomputed from the person's
// real sources, lazily (the parse only runs when a card is opened) and defensively (a failure
// falls back to an empty model, never to the demo). Everything else falls through to the scene.
export const liveScene = (scene, live) => {
  const LIVE = live && Array.isArray(live.sources) && live.sources.length ? live : null;
  if (!LIVE) return scene;
  const cache = {};
  const at = (k, fn, empty) => () => {
    if (!(k in cache)) { try { const v = fn(); cache[k] = v == null ? empty : v; } catch { cache[k] = empty; } }
    return cache[k];
  };
  const emptyGuide = { title: 'A reading path', built: `built from your ${LIVE.sources.length} sources`, groups: [] };
  const emptyMap = { things: [], around: [], patterns: [], desert: '', span: { from: '—', to: '—' }, shiftMarks: [] };
  return Object.create(scene, {
    STUDY_GUIDE: { enumerable: true, get: at('g', () => LIVE.studyGuide(), emptyGuide) },
    MAP:         { enumerable: true, get: at('m', () => LIVE.map(), emptyMap) },
    BLIND_SPOTS: { enumerable: true, get: at('b', () => LIVE.blindSpots(), []) },
    SHIFTS:      { enumerable: true, get: at('t', () => ({ _timeline: LIVE.timeline() }), { _timeline: { marks: [] } }) },
  });
};
