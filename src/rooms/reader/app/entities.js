// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// entities (the explorer)
import { projectGraph } from '../../../core/index.js';
import { mergeEntitiesByReferent } from '../entity-merge.js';

export const installEntities = (appCtx) => {
  // ── entities (the explorer) ────────────────────────────────────────────────
  // Coreference is resolved WITHIN each source's document graph (projectGraph's
  // `representative` union-find), never across them — so the raw pass yields one
  // instance per (source, entity). By DEFAULT we then COLLAPSE across sources:
  // the panel is about entities, not entity-in-one-source, so the eight "Iran"
  // rows (one per source that names it) fold into a single row whose mentions and
  // links sum over every source, tagged with how many sources it spans. Pass
  // { merge: false } for the raw per-source instances (the old behaviour).
  const entityKey = (label) => String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
  // The merged referents a SINGLE doc admits — one row per union-find representative, with
  // its sighting mass and incident degree. Pulled out of `entities()` so the topic explorer,
  // the per-source pivot, and the holonic-level toggle all read a source the same way. Each row
  // also carries the acoustic holon tag (kind='signal'|'noise', from organs/in/acoustic.js) and
  // the numeric holon level off the entity's DEF props, so callers can filter by holonic level.
  const entitiesInDoc = (doc, sn) => {
    const rows = [];
    if (!doc?.log) return rows;
    const g = projectGraph(doc.log);
    const rep = g.representative || ((x) => x);
    // Degree per representative in ONE pass over the edges, rather than re-scanning
    // every edge for every entity (which was O(entities × edges) — minutes on a large
    // document's graph, run on every explorer render). A self-loop counts once, matching
    // the prior `rep(from) === r || rep(to) === r` test.
    const degree = new Map();
    for (const e of g.edges || []) {
      const a = rep(e.from), b = rep(e.to);
      degree.set(a, (degree.get(a) || 0) + 1);
      if (b !== a) degree.set(b, (degree.get(b) || 0) + 1);
    }
    const seen = new Set();
    for (const [id, ent] of g.entities || []) {
      const r = rep(id);
      if (seen.has(r)) continue;
      seen.add(r);
      const label = doc.admission?.labelOf?.(r) || ent.label || r;
      const links = degree.get(r) || 0;
      const kind = (ent.props && ent.props.kind) || null;
      const lvl = (ent.props && ent.props.level != null) ? +ent.props.level : null;
      rows.push({ key: `${doc.docId}#${r}`, entId: r, docId: doc.docId, sn, label, mentions: ent.sightings || 0, links, sourceCount: 1, kind, level: lvl });
    }
    return rows;
  };
  // `level` selects the HOLONIC LEVEL of the topic explorer: 'names' (default) is the natural-
  // language REFERENTS — the people, places and things the content NAMES — read from each source's
  // meaning layer (referentDocFor), never from the raw spans underneath; 'signal' is the acoustic
  // signal/noise span holons an audio reading INS's; 'all' keeps both. Referents are the entities;
  // the base spans (a clip's segments/words, an image's regions) are NOT entities, so they never
  // leak into the names list — the bug that filled it with 'the/of/court' word-holons and, before a
  // clip was transcribed, with the acoustic summary's own 'Signal/Noise/Dynamic'.
  const entities = ({ merge = true, level = 'names' } = {}) => {
    const nameRows = [], baseRows = [];
    for (const src of appCtx.topicSources()) {
      if (level !== 'signal') {                 // 'names' + 'all' want the referents (the meaning)
        const rd = appCtx.referentDocFor(src);
        if (rd) nameRows.push(...entitiesInDoc(rd, src.sn));
      }
      if (level !== 'names') {                  // 'signal' + 'all' want the raw base spans underneath
        baseRows.push(...entitiesInDoc(appCtx.docFor(src), src.sn));
      }
    }
    // The acoustic cut: 'signal' is the signal/noise holons of the base reading (the audio case).
    const acoustic = (it) => it.kind === 'signal' || it.kind === 'noise';
    const rows = level === 'names' ? nameRows
      : level === 'signal' ? baseRows.filter(acoustic)
      : [...nameRows, ...baseRows.filter(acoustic)];   // 'all' — referents + the acoustic holons
    if (merge) {
      // Collapse per-source instances into cross-source rows by referent, NOT by bare surname:
      // "Iran" folds across sources as one entity, but "Armstrong" — a surname Neil, Louis and
      // Gerry share — is folded into the full-name bearer of its own source, so a read about Neil
      // Armstrong never inherits Louis Armstrong's chapters (entity-merge.js). The strongest
      // instance still leads, mentions and links aggregate, and `sourceCount` records the reach.
      return mergeEntitiesByReferent(rows, { entityKey });
    }
    rows.sort((a, b) => (b.mentions + b.links) - (a.mentions + a.links));
    return rows;
  };

  Object.assign(appCtx, { entities, entitiesInDoc, entityKey });
};
