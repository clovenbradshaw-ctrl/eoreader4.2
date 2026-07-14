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

// The whole live model the plain surface needs to run over real data: the sources, the candidate
// terms, and a bound resolver that computes the disagreement for any chosen term on demand (the
// heavy parse only runs when a term is actually asked about).
export const liveModel = (app, { parse = parseText } = {}) => {
  const sources = liveSources(app);
  return {
    sources,
    terms: liveTerms(app),
    disagreeFor: (term) => disagreeOverSources(sources, term, { parse }),
  };
};
