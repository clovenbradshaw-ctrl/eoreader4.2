// EO: EVA·SEG(Network,Field → Lens, Tracing,Dissecting) — the search SURFACE router.
// One question over the record, rendered as the BEST surface for that question — not a prose
// answer (the reader is not here to be told; they are here to see). The fold has already decided
// what is true (entities minted, claims graded, sentences parsed); this only realizes it. It reads
// the query's INTENT and routes to a preset template:
//   · concordance — the default, the best-ever ctrl+F: every verbatim occurrence, highlighted;
//   · cast        — "who / people / characters": the figures on record, by weight;
//   · contrast    — "where do the sources disagree": the contested claims, side by side.
// Across every template it separates SIGNAL from NOISE (scope-sources.js) and carries a source RAIL
// the caller can toggle — turning a source off re-scopes and the surface auto-pivots. Pure and
// model-free: (query, providers) in, a surface descriptor out; it computes nothing new and can
// therefore fabricate nothing. Runs in a unit test exactly as it does in the browser.

import { parseQuery, hasQuery } from './search-record.js';
import { scanAll, sourceRail, OCC_CAP } from './search-surface-scan.js';
import { crossSourceConflicts } from '../../enactor/factcheck/index.js';
import { fieldVerdict } from '../../surfer/index.js';

// A cross-source numeric conflict (crosscheck.js — "18,000 homes" vs "9,000") read into a contrast
// row. This is the one real disagreement signal that existed in the engine but never reached this
// page: it was computed only for the Findings tab's conflict banner, so a plain search's Contrast
// tab could show "no contested claims" while the very same sources disagreed on a hard number.
const measureConflictRows = (conflicts) => conflicts.map((c) => {
  const vs = c.values.slice(0, 2);
  const spread = vs.map((v) => v.raw + (v.sourceLabel ? ` (${v.sourceLabel})` : '')).join(' vs ');
  const extra = c.values.length > 2 ? `, +${c.values.length - 2} more` : '';
  return {
    subject: c.measureLabel + (c.subject ? ` · ${c.subject}` : ''),
    text: `Sources disagree: ${spread}${extra}.`,
    quote: vs[0]?.text || '', status: 'Contested', origin: 'measure',
    sn: vs[0]?.source ?? null, reg: vs[0]?.sourceLabel || '',
  };
});

// The intent vocabularies — the question words that name a KIND of surface, not a subject. Kept
// here (not a shared stoplist) because the job is narrow: read what the reader is after, and strip
// those words from the subject so "who fights Frankenstein" highlights "fights", never "who".
const CAST_WORDS = new Set('who whom people person persons folks cast character characters figure figures name names players everyone'.split(' '));
const CONTRAST_WORDS = new Set('disagree disagrees disagreement contradict contradicts contradiction conflict conflicts conflicting versus contested dispute disputes disputed tension tensions differ differs difference dissent'.split(' '));
// Connectors that frame the QUESTION, not the subject — "where do the SOURCES disagree" is about
// disagreement, not about a thing called "sources". Stripped from the subject terms below.
const META_WORDS = new Set('sources source record records where do does did the a an of about is are was were what which how on in for and or with'.split(' '));

// routeIntent(parsed) → the template a query asks for, before any override.
export const routeIntent = (parsed) => {
  if (parsed.ops.contradicts) return 'contrast';
  const w = parsed.terms;
  if (w.some((t) => CONTRAST_WORDS.has(t))) return 'contrast';
  if (parsed.ops.type || w.some((t) => CAST_WORDS.has(t))) return 'cast';
  return 'concordance';
};

// The subject: the query minus the intent/meta words, plus any entity: operand folded in — the
// terms the concordance actually highlights. `entity:Walton who` → ['walton'].
export const subjectTerms = (parsed) => {
  const kept = parsed.terms.filter((t) => !CAST_WORDS.has(t) && !CONTRAST_WORDS.has(t) && !META_WORDS.has(t));
  const ent = parsed.ops.entity ? String(parsed.ops.entity).toLowerCase().split(/\s+/).filter(Boolean) : [];
  return [...new Set([...kept, ...ent])];
};

// The cast: the figures on record, filtered to the SUBJECT (a label match), ranked by weight —
// falling back to the whole cast when the subject names no one (so "who is here" shows everyone,
// not nothing). Drawn from the full merged entity list, NOT searchRecord's terms filter, because
// the intent word ("who") is not a name and must never narrow the cast to itself.
const castFrom = (entities, terms) => {
  const all = (entities || []).filter((e) => e && e.label);
  const named = terms.length ? all.filter((e) => terms.some((t) => String(e.label).toLowerCase().includes(t))) : [];
  const pool = named.length ? named : all;
  return pool
    .map((e) => ({ e, score: (e.sourceCount || 1) * 100 + (e.mentions || 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 24)
    .map(({ e }) => ({
      label: e.label, docId: e.docId, entId: e.entId, sn: e.sn ?? null,
      type: e.type && e.type !== 'proper' ? e.type : '', mentions: e.mentions || 0, sourceCount: e.sourceCount || 1,
    }));
};

// routeSurface(query, providers, opts) → the surface descriptor.
//   providers.sources     — the ENABLED sources (sn, reg, title, docId, kind, bytes, text)
//   providers.record      — searchRecord() output over those sources (claims, passages, …)
//   providers.entities    — the full merged figure list, for the cast (subject-filtered here)
//   providers.docFor      — src → parsed doc (sentences), for the occurrence scan
//   providers.scopeSignal — sn → does this source carry substance for the query (scope-sources.js)
//   opts.template         — 'auto' (default) routes by intent; anything else forces a template.
export const routeSurface = (query, providers = {}, opts = {}) => {
  const parsed = typeof query === 'string' ? parseQuery(query) : (query || parseQuery(''));
  const { sources = [], record = {}, entities = null, docFor = () => null, scopeSignal = () => true } = providers;
  const terms = subjectTerms(parsed);
  const asked = hasQuery(parsed);

  // the occurrence scan grounds both the concordance AND the rail's signal read, so it runs once.
  const { hits, total, counts } = scanAll(sources, terms, docFor, OCC_CAP);
  const anyHits = total > 0;
  const rail = sourceRail(sources, counts, scopeSignal, anyHits);
  const signalCount = rail.filter((r) => r.signal).length;

  const out = {
    template: 'concordance', requested: opts.template || 'auto',
    subject: parsed.text || String(parsed.ops.entity || '').trim(),
    terms, asked, rail, signalCount, total,
    concordance: [], cast: [], contrast: [], contrastKind: '',
    elements: [], concepts: [],
    empty: !asked, thin: false,
    answerable: { void: false },
  };
  if (!asked) return out;

  // Void, honestly: does ANY enabled source's field even hold this question, or is the corpus
  // silent on it entirely? Reuses the same measurement the pre-generation void gate runs
  // (surfer/answerable.js) — a named referent that resolves, or real retrieved material, means
  // notVoid; per-source spans aren't threaded through here, so this checks referent/never-set
  // absence only (fieldVerdict's spans=[] branch), never the Bayesian-surprise arm, which needs a
  // real retrieval reach this surface doesn't compute. Void only when EVERY checked source agrees
  // — one source that has it is enough to answer.
  const questionText = parsed.text || out.subject;
  const railDocs = rail
    .map((r) => { const s = sources.find((x) => x.sn === r.sn); return s ? docFor(s) : null; })
    .filter(Boolean);
  if (railDocs.length) {
    const verdicts = railDocs.map((d) => { try { return fieldVerdict(d, questionText, []); } catch { return { void: false }; } });
    if (verdicts.every((v) => v.void)) {
      out.answerable = { void: true, kind: verdicts[0].kind, term: verdicts[0].term || null, checked: verdicts.length };
    }
  }

  // All three yields, always — they are cheap given the scan/record already in hand, and the tab
  // counts must be honest even for the surface not currently shown (so switching is instant and the
  // count a reader sees on a tab is the count they get when they click it).
  out.concordance = hits.map((h) => ({ ...h, signal: true }));
  out.cast = castFrom(entities || record.entities, terms);
  const claims = record.claims || [];
  const contested = claims.filter((c) => c.status === 'Contested');
  const contrastRows = (contested.length ? contested : claims).slice(0, 24);
  out.contrastKind = contested.length ? 'contested' : (contrastRows.length ? 'claims' : '');
  out.contrast = contrastRows.map((c) => ({
    subject: c.subject || '', text: c.text, quote: c.quote || '', status: c.status || '',
    origin: c.origin || '', sn: c.sn ?? null, reg: c.reg || '',
  }));
  // Cross-source numeric disagreement — scoped to the enabled sources, same reading the Findings
  // conflict banner runs (app/findings.js), so a plain search sees the same disagreements the
  // record already knows about instead of only chat-surfaced or turn-verdict contradictions.
  let measureConflicts = [];
  try {
    const entries = sources
      .map((s) => ({ doc: docFor(s), source: s.sn, label: s.title }))
      .filter((e) => e.doc && e.doc.admission);
    measureConflicts = crossSourceConflicts(entries).conflicts;
  } catch { measureConflicts = []; }
  if (measureConflicts.length) {
    out.contrast = [...measureConflictRows(measureConflicts), ...out.contrast];
    out.contrastKind = 'contested';
  }
  out.elements = [
    { key: 'sources', label: 'Sources', count: signalCount, total: rail.length },
    { key: 'occurrences', label: 'Occurrences', count: total },
    { key: 'cast', label: 'Cast', count: out.cast.length },
    { key: 'claims', label: 'Claims', count: out.contrast.length },
  ];
  const conceptSeen = new Set();
  const addConcept = (label, kind = 'concept', weight = 0, meta = '') => {
    const clean = String(label || '').trim();
    const key = clean.toLowerCase();
    if (!clean || conceptSeen.has(key)) return;
    conceptSeen.add(key); out.concepts.push({ label: clean, kind, weight, meta });
  };
  for (const e of out.cast.slice(0, 8)) addConcept(e.label, e.type || 'figure', e.mentions || 0, e.sourceCount + ' src');
  for (const c of out.contrast.slice(0, 8)) addConcept(c.subject || c.text, c.status || 'claim', 1, c.reg || '');
  for (const h of hits.slice(0, 6)) addConcept(h.title, 'source', h.count, h.reg || '');

  // route to the best surface — the query's intent, unless a template is forced. When the intended
  // surface is empty but the concordance has hits, fall to the concordance rather than show nothing.
  let template = opts.template && opts.template !== 'auto' ? opts.template : routeIntent(parsed);
  const yieldOf = { concordance: total, cast: out.cast.length, contrast: out.contrast.length };
  if (!yieldOf[template] && anyHits) template = 'concordance';
  out.template = template;
  out.thin = !yieldOf[template];
  return out;
};
