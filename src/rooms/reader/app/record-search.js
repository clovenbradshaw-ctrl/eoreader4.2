// EO — one section of the reader session controller (rooms/reader/app.js assembler;
// "no god module — no file over ~250 lines"). Cross-section reach rides ctx (call-time).
// SEARCH THE RECORD (docs/search-and-pins.md) — one query over everything recorded:
// entities, claims, passages, sources, grouped, with the operator facets riding fields
// the record already carries. The module (../search-record.js) is pure; this is just
// the provider wiring: the topic's sources, the merged entity rows, the findings
// projection, and the per-entity incident relations the type: facet prices in only
// when asked for.
import { recordClaims } from '../claims.js';
import { parseQuery, searchRecord as searchRecordOver } from '../search-record.js';
import { scopeSources } from '../scope-sources.js';
import { routeSurface, subjectTerms } from '../search-surface.js';

export const installRecordSearch = (appCtx) => {
  const relationsOf = (row) => {
    const p = appCtx.entityProfile(row.docId, row.entId);
    const viasAsSrc = [], viasAsTgt = [];
    for (const r of p?.relations || []) {
      if (!r?.via) continue;
      if (r.srcId === row.entId) viasAsSrc.push(r.via);
      else if (r.tgtId === row.entId) viasAsTgt.push(r.via);
    }
    return { viasAsSrc, viasAsTgt };
  };
  // the WHOLE claim projection (not findings()' display cap) — search sees every claim on record
  const allClaims = () => {
    const t = appCtx.topic();
    return recordClaims({
      messages: t?.messages || [], sources: appCtx.topicSources(),
      docFor: (s) => appCtx.docFor(s), entitySummaries: appCtx.topicEntitySummaries(),
    }).claims;
  };

  const searchTheRecord = (query, sources) => searchRecordOver(query, {
    sources: sources || appCtx.topicSources(),
    entities: appCtx.entities({ merge: true, level: 'names' }),
    claims: allClaims(),
    docFor: (s) => appCtx.docFor(s),
    relationsOf,
  });

  // searchSurface(query, opts) — the same query, rendered as its BEST preset template (search-
  // surface.js), over the sources the reader has left ENABLED. opts.enabledSns (a Set of sns, or
  // absent = all) is the source rail's live state, so toggling a source re-scopes and re-pivots.
  const searchTheSurface = (query, opts = {}) => {
    const all = appCtx.topicSources();
    const enabled = opts.enabledSns ? all.filter((s) => opts.enabledSns.has(s.sn)) : all;
    const record = searchTheRecord(query, enabled);
    // signal from noise (scope-sources.js) — measured over the FULL set so a disabled source can
    // still be recommended back; the concordance itself only ever reads the enabled ones.
    const parsed = parseQuery(query);
    const subject = subjectTerms(parsed).join(' ') || (record.parsed?.text || '');
    let scoped = new Set();
    try { scoped = new Set(scopeSources(subject, all).map((s) => s.sn)); } catch { scoped = new Set(all.map((s) => s.sn)); }
    return routeSurface(record.parsed || parsed, {
      sources: enabled, record, entities: appCtx.entities({ merge: true, level: 'names' }),
      docFor: (s) => appCtx.docFor(s), scopeSignal: (sn) => scoped.has(sn),
    }, opts);
  };

  Object.assign(appCtx, { searchRecord: searchTheRecord, searchSurface: searchTheSurface });
};
