// EO — one section of the reader session controller (rooms/reader/app.js assembler;
// "no god module — no file over ~250 lines"). Cross-section reach rides ctx (call-time).
// SEARCH THE RECORD (docs/search-and-pins.md) — one query over everything recorded:
// entities, claims, passages, sources, grouped, with the operator facets riding fields
// the record already carries. The module (../search-record.js) is pure; this is just
// the provider wiring: the topic's sources, the merged entity rows, the findings
// projection, and the per-entity incident relations the type: facet prices in only
// when asked for.
import { recordClaims } from '../claims.js';
import { searchRecord as searchRecordOver } from '../search-record.js';

export const installRecordSearch = (appCtx) => {
  const searchTheRecord = (query) => {
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
    const t = appCtx.topic();
    return searchRecordOver(query, {
      sources: appCtx.topicSources(),
      entities: appCtx.entities({ merge: true, level: 'names' }),
      // the WHOLE projection, not findings()' display cap — search sees every claim on record
      claims: recordClaims({
        messages: t?.messages || [], sources: appCtx.topicSources(),
        docFor: (s) => appCtx.docFor(s), entitySummaries: appCtx.topicEntitySummaries(),
      }).claims,
      docFor: (s) => appCtx.docFor(s),
      relationsOf,
    });
  };

  Object.assign(appCtx, { searchRecord: searchTheRecord });
};
