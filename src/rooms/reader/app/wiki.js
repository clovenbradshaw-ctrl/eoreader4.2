// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// the wiki referent (the entity panel's encyclopedia lookup)
import { projectGraph, operatorsOf, glyphOf } from '../../../core/index.js';
import { figureSurface, typeReferents } from '../../../perceiver/index.js';
import { wikiReferent } from '../wiki-referent.js';
import { networkGraphData } from '../../../wiki/index.js';

export const installWiki = (appCtx) => {
  const { client } = appCtx;
  // ── the wiki referent (the entity panel's encyclopedia lookup) ─────────────
  // 4.1's entity panel searched Wikipedia for the open entity and showed the settled
  // referent — the general meaning behind the local name — but only when the article
  // could be CONFIRMED against what the record says (wiki-referent.js). 4.2 dropped it
  // with the old shell; this restores it as one cached lookup per (doc, entity). The
  // promise is cached first so a double-open never double-fetches; a failure caches
  // null, and the surface words that as "no confirmed match", never an error.
  const wikiCache = new Map();
  const entityWiki = (docId, entId) => {
    const key = `${docId}#${entId}`;
    if (wikiCache.has(key)) return Promise.resolve(wikiCache.get(key));
    const p = appCtx.entityProfile(docId, entId);
    if (!p || !p.label) return Promise.resolve(null);
    const pending = wikiReferent(client, {
      label: p.label,
      statements: [...p.defs.map((d) => d.value), ...p.mentions.map((m) => m.text)],
      neighbors: p.relations.map((r) => (r.srcId === entId ? r.tgtLabel : r.srcLabel)),
      pageTitles: p.sourceTitle ? [p.sourceTitle] : [],
    }).catch(() => null).then((def) => { wikiCache.set(key, def); return def; });
    wikiCache.set(key, pending);
    return pending;
  };

  // When a source entered the record, in epoch-ms — the graphs' time axis reads this off
  // each node (0/undefined ⇒ undated). Prefer the numeric recordedAt; fall back to parsing
  // the ISO `retrieved` so sources recorded before this field existed still place in time.
  const srcTimeMs = (s) => {
    if (!s) return 0;
    if (Number.isFinite(s.recordedAt) && s.recordedAt > 0) return s.recordedAt;
    const p = Date.parse(s.retrieved || '');
    return Number.isNaN(p) ? 0 : p;
  };

  // The honest tiered data for mountTieredGraph: the source at the radial centre
  // (tier 0), the focus + bonded figures (tier 1), the standing claims (tier 2).
  const tieredData = (docId, entId) => {
    const p = appCtx.entityProfile(docId, entId);
    if (!p) return { nodes: [], edges: [] };
    const srcT = srcTimeMs(appCtx.resolveDoc(docId)?.src);
    // terrain: a source is Entity (Existence×Figure — a specific, bounded document); an entity
    // node is likewise Entity; a standing claim (a DEF value held about the focus) is Lens
    // (Significance×Figure — a specific reading), the closest of the nine terrains to what a
    // ranked/witnessed property actually is. See docs/terrain-typed-templates.md.
    const nodes = [{ id: 'src', tier: 0, label: p.sourceTitle, kind: 'source', terrain: 'Entity', t: srcT }];
    const edges = [];
    const seen = new Set();
    const addEnt = (id, label) => {
      const nid = `e:${id}`;
      if (!seen.has(nid)) { seen.add(nid); nodes.push({ id: nid, tier: 1, label, kind: 'entity', terrain: 'Entity', ref: { docId, entId: id }, t: srcT }); }
      return nid;
    };
    const focus = addEnt(entId, p.label);
    edges.push({ a: 'src', b: focus, tier: 0, gl: '●', code: 'INS' });
    // Render the whole bonded neighbourhood figureSurface returns (already salience-bounded to
    // FOCUS_MAX_BONDS), not a 24-edge slice of it — the graph's own de-overlap and collision-culled
    // labels keep it readable, so every entity the focus actually bonds to gets a node.
    for (const r of p.relations) {
      const a = addEnt(r.srcId, r.srcLabel), b = addEnt(r.tgtId, r.tgtLabel);
      // Type the edge by the ACT it records, not the bare CON fallback: a kinship via
      // (mother/son) projects to INS, a metamorphosis to SEG·INS, and only a genuine
      // bond stays CON. The glyph shows the dominant (most-specific) operator; the code
      // carries the whole nested stack (§ operatorsOf).
      const ops = operatorsOf(r.via, r.op || 'CON');
      edges.push({ a, b, tier: 1, gl: glyphOf(ops[0]), code: ops.join('·') });
    }
    p.defs.slice(0, 16).forEach((d, i) => {
      const id = `c:${i}`;
      nodes.push({ id, tier: 2, label: d.value, kind: 'claim', terrain: 'Lens', t: srcT });
      edges.push({ a: focus, b: id, tier: 2, gl: '⊢', code: 'DEF' });
    });
    return { nodes, edges };
  };

  // The WHOLE-TOPIC entity graph for mountTieredGraph — the sibling of tieredData's single-entity
  // web, drawn over the entire topic at once. Every source sits at tier 0; the salient figures
  // across the topic at tier 1, MERGED across sources by normalised label so the same figure named
  // in two sources is one node (opaque per-doc ids never coincide, so a label merge is the honest
  // topic view); the bonds among them, aggregated across sources, are the tier-1 edges. Returns the
  // FULL graph — the surface's entity on/off toggles filter it for display, so a hidden entity can
  // still be turned back on. Entity nodes carry a representative { docId, entId } so a click opens
  // the entity panel, exactly like the single-entity web.
  // srcsOverride: the same builder scoped to an explicit source list rather than the whole
  // topic — how networkOf (below) unpacks one composite source's own children into their own
  // network at a finer grain, without duplicating this traversal.
  const topicTieredData = (srcsOverride) => {
    const srcs = srcsOverride || appCtx.topicSources();
    const nodes = [], edges = [], seen = new Set();
    // terrain: a source and a merged entity are both Entity (Existence×Figure) at this grain —
    // see tieredData's note above; docs/terrain-typed-templates.md.
    const push = (id, tier, label, kind, ref, t = 0) => { if (!seen.has(id)) { seen.add(id); nodes.push({ id, tier, label, kind, terrain: 'Entity', ref, t }); } };
    const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const urlish = (s) => /^(https?:\/\/|www\.)/i.test(String(s || '')) || String(s || '').includes('://');
    const merged = new Map();       // normLabel → { id, label, mentions, sns:Set, ref }
    const mapKey = new Map();        // `${docId}#${repId}` → normLabel  (to map bond endpoints)
    for (const src of srcs) {
      const doc = appCtx.docFor(src); if (!doc?.log) continue;
      const g = projectGraph(doc.log);
      const rep = g.representative || ((x) => x);
      const done = new Set();
      for (const [id, ent] of g.entities || []) {
        const r = rep(id); if (done.has(r)) continue; done.add(r);
        const label = doc.admission?.labelOf?.(r) || ent.label || r;
        const nl = norm(label); if (!nl || urlish(label)) continue;
        mapKey.set(`${doc.docId}#${r}`, nl);
        let m = merged.get(nl);
        if (!m) merged.set(nl, m = { id: `e:${nl}`, label, mentions: 0, sns: new Set(), ref: { docId: doc.docId, entId: r }, t: 0 });
        m.mentions += ent.sightings || 0; m.sns.add(src.sn);
        // an entity sits on the axis at its EARLIEST recording — when it first entered the record
        const st = srcTimeMs(src); if (st > 0) m.t = m.t > 0 ? Math.min(m.t, st) : st;
      }
    }
    // rank by salience and cap — the graph's own collision-culling keeps it legible, but a hard cap
    // keeps the toggle list and the layout from swelling on a large topic.
    const ranked = [...merged.values()].sort((a, b) => b.mentions - a.mentions).slice(0, 40);
    const shown = new Set(ranked.map((m) => norm(m.label)));
    const srcById = new Map(srcs.map((s) => [s.sn, s]));
    for (const m of ranked) push(m.id, 1, m.label, 'entity', m.ref, m.t);
    for (const m of ranked) {
      for (const sn of m.sns) {
        const sid = `src:${sn}`; const s = srcById.get(sn);
        push(sid, 0, s ? (s.title || s.reg || 'source') : 'source', 'source', null, srcTimeMs(s));
        edges.push({ a: sid, b: m.id, tier: 0, gl: '●', code: 'INS' });
      }
    }
    // The cast's unnamed presences (individuation.js) — a referent that recurs and acts, or
    // is heavily coupled, yet never earned a name: EMANON ("the creature"), PROTOGON ("Kurtz
    // before he arrives"). In truth every referent starts this way; these are simply the ones
    // the record never gave a door onto a name. Shown as antimatter — present in the structure,
    // carrying no name to hang a normal figure on, so never a pivot/open target (ref stays null).
    for (const src of srcs) {
      const doc = appCtx.docFor(src); if (!doc?.log) continue;
      for (const c of typeReferents(doc)) {
        if (c.ins || !c.onCast || seen.has(c.id)) continue;
        seen.add(c.id);
        nodes.push({ id: c.id, tier: 1, label: c.label, kind: 'entity', antimatter: c.type, terrain: 'Entity', ref: null, t: 0 });
      }
    }
    const agg = new Map();
    for (const src of srcs) {
      const doc = appCtx.docFor(src); if (!doc?.log) continue;
      const g = projectGraph(doc.log);
      const rep = g.representative || ((x) => x);
      for (const e of g.edges || []) {
        const an = mapKey.get(`${doc.docId}#${rep(e.from)}`), bn = mapKey.get(`${doc.docId}#${rep(e.to)}`);
        if (!an || !bn || an === bn || !shown.has(an) || !shown.has(bn)) continue;
        const key = an + '' + bn; let b = agg.get(key);
        if (!b) agg.set(key, b = { a: `e:${an}`, b: `e:${bn}`, w: 0, via: null, op: null });
        b.w += (e.weight != null ? e.weight : 1) || 0.001;
        const via = e.relType || e.via; if (!b.via && via) b.via = via;
        // The projection carries the real operator through (project.js stores it as
        // e.kind — 'con'/'sig'/'syn'), so a SIG or SYN survives instead of being
        // flattened to the hardcoded bond it was before.
        if (!b.op && e.kind) b.op = String(e.kind).toUpperCase();
      }
    }
    [...agg.values()].sort((x, y) => y.w - x.w).slice(0, 80).forEach((b) => {
      // Type the aggregated topic edge by its act (INS for kinship, SEG·INS for a
      // metamorphosis, SIG/SYN when the source read one) rather than a uniform CON.
      const ops = operatorsOf(b.via, b.op || 'CON');
      edges.push({ a: b.a, b: b.b, tier: 1, gl: glyphOf(ops[0]), code: ops.join('·') });
    });
    return { nodes, edges };
  };

  // ── the Network surface (docs/terrain-typed-templates.md; src/wiki/network-article.js) ──
  // The corpus read at the Network terrain (Structure×Pattern, core/cube.js) — the architecture
  // of connections AMONG SOURCES, not a bag of entity nodes. Reuses topicTieredData()'s own
  // cross-source entity merge (never re-walks a doc's log): two sources sharing a merged
  // referent earn a Link between them; the Links' own topology is the Network.
  //
  // rootSourceId / sourceLabel: a composite source — one with children via registry.js's
  // `parentSn` (a crawled site's sub-pages, a bundled report's sub-documents like "the Unified
  // Housing Strategy") — collapses to its own root and is ONE Entity node here, "in one
  // ontological sense … treated as a single source." Unpacking it is `networkOf`, below —
  // grain, not terrain migration (surfer/reason/cursor.js's `grain` cursor: "unpacking descends
  // a SYN to its members").
  const rootSourceId = (id) => {
    const sn = String(id).replace(/^src:/, '');
    const s = appCtx.sourceBySn(sn);
    const rsn = (s && s.parentSn && appCtx.sourceBySn(s.parentSn)) ? s.parentSn : sn;
    return `src:${rsn}`;
  };
  const sourceLabel = (id) => {
    const sn = String(id).replace(/^src:/, '');
    const s = appCtx.sourceBySn(sn);
    return (s && (s.title || s.reg)) || sn;
  };

  // The whole topic's Network — every composite source collapsed to its root first, so "the
  // Unified Housing Strategy" reads as one node even though it may carry several sub-pages.
  const networkTieredData = () => networkGraphData(topicTieredData(), { rootOf: rootSourceId, labelOf: sourceLabel });

  // networkOf(rootSn) — the SAME builder, scoped to just one composite source's own children:
  // its OWN network at a finer grain, unpacked rather than collapsed. Returns null when the
  // source has no children — an honest absence (nothing to unpack), never a fabricated one.
  const networkOf = (rootSn) => {
    const root = appCtx.sourceBySn(rootSn);
    const kids = appCtx.topicSources().filter((s) => s.parentSn === rootSn);
    if (!root || !kids.length) return null;
    return networkGraphData(topicTieredData([root, ...kids]), { labelOf: sourceLabel });
  };

  // The topic's sources shaped for the causal DAG surface (mountDagSurface). A readable id (the
  // source title) rides in front of the parsed sentences + log the two cursors read: cursor 2 runs
  // over ALL of them so cross-source confounders and disagreements surface; cursor 1 reads the
  // primary. Sources with no readable sentences drop out.
  const dagSources = () => appCtx.topicSources().map((src) => {
    const doc = appCtx.docFor(src);
    if (!doc || !(doc.sentences || []).length) return null;
    return { docId: src.title || src.url || src.docId, sn: src.sn, sentences: doc.sentences, log: doc.log };
  }).filter(Boolean);

  // srcTimeMs re-exported: the crosswalk surface (app/trajectory.js) needs the SAME "earliest
  // recording" time reading topicTieredData's own node.t uses, rather than a second copy of it.
  Object.assign(appCtx, { dagSources, entityWiki, tieredData, topicTieredData, networkTieredData, networkOf, wikiCache, srcTimeMs });
};
