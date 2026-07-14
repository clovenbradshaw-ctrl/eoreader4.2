// EO: SIG·DEF·CON(Entity,Field → Lens,Link, Tracing,Binding) — the live projection (engine → plain)
// project.js — the bridge from the real engine (window.EO.app + perceiver/parse) to the plain
// surface's model. Where scene.js is a hand-authored corpus for the standalone demo, this reads
// whatever the person has actually ingested: the active topic's sources, their recorded text, and
// their parsed readings. It is the layer that makes "People mean different things by this" (§3) a
// real projection of real documents rather than a table.
//
// The disagreement itself is computed by disagreement.js from the source TEXT (the reliable floor);
// here we additionally fold in the perceiver's own coref-resolved predicate DEFs — so "it is a
// camera", where "it" resolves to the term, counts too. The parser is injected (default parseText)
// so this stays testable without a browser.

import { parseText } from '../../perceiver/parse/index.js';
import { disagree, sourcesDisagree } from './disagreement.js';
import { detectShifts } from './shifts.js';
import { blindSpots, mapModel, timelineModel, studyGuideModel, rankedTerms } from './live-views.js';

// The engine's own characterizations of `term` in a parsed doc: the copular/appositive DEFs the
// perceiver already extracted (perceiver/parse/relations.js → op DEF, key 'predicate'), resolved
// through coreference to a stable id. Returns [{ value }] to fold in as disagreement `extra`.
export const engineDefs = (doc, term) => {
  if (!doc || !doc.log) return [];
  const events = doc.log.events || [];
  const t = String(term || '').toLowerCase();
  let id = null;
  try { id = doc.admission && doc.admission.idOf ? doc.admission.idOf(term) : null; } catch { id = null; }
  return events
    .filter((e) => e.op === 'DEF' && e.key === 'predicate' && e.value
      && (e.id === id || String(e.id || '').toLowerCase() === t))
    .map((e) => ({ value: e.value }));
};

// Live disagreement over a set of sources (each { id, label, text }). Reads each source's text and
// enriches with its engine DEFs, then folds them together. Pure given the injected parser.
export const disagreeOverSources = (sources, term, { parse = parseText } = {}) => {
  const enriched = (sources || []).map((s) => {
    let extra = [];
    try { extra = engineDefs(parse(s.text || '', { docId: s.id }), term); } catch { extra = []; }
    return { id: s.id, label: s.label || s.id, text: s.text || '', extra };
  });
  const model = disagree(enriched, term);
  return { ...model, disagree: sourcesDisagree(model) };
};

// A source's date for the corpus timeline (shifts.js). Prefer a publication/posted date the parser
// harvested from the document's own front matter (perceiver/parse/metadata.js canonicalizes
// "published" / "publication date" / "posted" / "pubdate" → the `date` key), then the caller's
// explicit date, then when it entered the record. Undated ⇒ '' (excluded from the timeline).
const docDate = (doc) => {
  try { return doc && doc.metadata ? (doc.metadata.date || doc.metadata.updated || null) : null; } catch { return null; }
};

// Live "when the meaning changed" (§4) over a dated corpus. Each source is parsed once — for its
// engine DEFs (enrichment) and its front-matter date — then the change-point detector runs over the
// whole timeline. Pure given the injected parser.
export const shiftsOverSources = (sources, term, { parse = parseText } = {}) => {
  const dated = (sources || []).map((s) => {
    let doc = null;
    try { doc = parse(s.text || '', { docId: s.id }); } catch { doc = null; }
    const extra = doc ? engineDefs(doc, term) : [];
    const date = (s.date != null && s.date !== '') ? s.date
      : (docDate(doc) || s.recordedAt || s.retrieved || '');
    return { id: s.id, label: s.label || s.id, text: s.text || '', date, extra };
  });
  return detectShifts(dated, term);
};

// ── Reading a live app (window.EO.app). All best-effort and defensive: a missing method or an
// empty topic degrades to empty, never throws, so the surface can always render something. ──

// The active topic's sources, shaped for the plain surface. Each keeps its recorded text so the
// disagreement can be computed from what the documents actually say.
export const liveSources = (app) => {
  if (!app) return [];
  let srcs = [];
  try { srcs = app.topicSources ? app.topicSources() : (app.state && app.state.sources) || []; } catch { srcs = []; }
  return (srcs || []).map((s) => ({
    id: String(s.sn ?? s.id ?? s.docId ?? s.title ?? ''),
    label: s.title || s.label || s.url || (s.sn != null ? `source ${s.sn}` : 'source'),
    text: s.text || '',
    recordedAt: s.recordedAt, retrieved: s.retrieved,   // the timeline axis for shifts (§4)
  })).filter((s) => s.id);
};

// The clickable terms to offer — the engine's real entities across the topic (names), deduped and
// ordered by how much the corpus leans on them when that signal is available.
export const liveTerms = (app) => {
  if (!app) return [];
  let ents = [];
  try { ents = app.entities ? app.entities({ merge: true, level: 'names' }) : []; } catch { ents = []; }
  const seen = new Set();
  const out = [];
  for (const e of ents || []) {
    const label = e.label || e.name || e.rep || (typeof e === 'string' ? e : null);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
};

// The remaining explore cards, over real sources. Blind spots / map / timeline are pure text
// projections (live-views.js); the study guide additionally needs to know which leading terms the
// sources genuinely disagree about or shifted on — that runs the real parser, bounded to the few
// most-mentioned terms so opening the card stays cheap.
export const blindSpotsOverSources = (sources, terms) => blindSpots(sources, terms);
export const mapOverSources = (sources, terms) => mapModel(sources, terms);
export const timelineOverSources = (sources) => timelineModel(sources);

const contestedLeads = (sources, terms, { parse = parseText, max = 5 } = {}) => {
  const dis = [], shf = [];
  for (const t of rankedTerms(sources, terms).slice(0, max)) {
    try { if (disagreeOverSources(sources, t, { parse }).disagree) dis.push(t); } catch { /* skip */ }
    try {
      const m = shiftsOverSources(sources, t, { parse });
      const b = m.shifted && m.marks.find((x) => x.kind === 'break');
      if (b) shf.push({ term: t, when: b.when });
    } catch { /* skip */ }
  }
  return { dis, shf };
};

export const studyGuideOverSources = (sources, terms, { parse = parseText } = {}) => {
  const { dis, shf } = contestedLeads(sources, terms, { parse });
  return studyGuideModel(sources, terms, { disagreements: dis, shifts: shf, blind: blindSpots(sources, terms) });
};

// The whole live model the plain surface needs to run over real data: the sources, the candidate
// terms, and bound resolvers that compute each card on demand (the heavy parse only runs when a
// card or term is actually asked about).
export const liveModel = (app, { parse = parseText } = {}) => {
  const sources = liveSources(app);
  const terms = liveTerms(app);
  return {
    sources,
    terms,
    disagreeFor: (term) => disagreeOverSources(sources, term, { parse }),
    shiftsFor: (term) => shiftsOverSources(sources, term, { parse }),
    blindSpots: () => blindSpotsOverSources(sources, terms),
    map: () => mapOverSources(sources, terms),
    timeline: () => timelineOverSources(sources),
    studyGuide: () => studyGuideOverSources(sources, terms, { parse }),
  };
};
