// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// the wiki referent (the entity panel's encyclopedia lookup)
import { projectGraph, operatorsOf, glyphOf } from '../../../core/index.js';
import { figureSurface } from '../../../perceiver/index.js';
import { wikiReferent } from '../wiki-referent.js';

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
    const nodes = [{ id: 'src', tier: 0, label: p.sourceTitle, kind: 'source', t: srcT }];
    const edges = [];
    const seen = new Set();
    const addEnt = (id, label) => {
      const nid = `e:${id}`;
      if (!seen.has(nid)) { seen.add(nid); nodes.push({ id: nid, tier: 1, label, kind: 'entity', ref: { docId, entId: id }, t: srcT }); }
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
      nodes.push({ id, tier: 2, label: d.value, kind: 'claim', t: srcT });
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
  const topicTieredData = () => {
    const srcs = appCtx.topicSources();
    const nodes = [], edges = [], seen = new Set();
    const push = (id, tier, label, kind, ref, t = 0) => { if (!seen.has(id)) { seen.add(id); nodes.push({ id, tier, label, kind, ref, t }); } };
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

  // The topic's sources shaped for the causal DAG surface (mountDagSurface). A readable id (the
  // source title) rides in front of the parsed sentences + log the two cursors read: cursor 2 runs
  // over ALL of them so cross-source confounders and disagreements surface; cursor 1 reads the
  // primary. Sources with no readable sentences drop out.
  const dagSources = () => appCtx.topicSources().map((src) => {
    const doc = appCtx.docFor(src);
    if (!doc || !(doc.sentences || []).length) return null;
    return { docId: src.title || src.url || src.docId, sn: src.sn, sentences: doc.sentences, log: doc.log };
  }).filter(Boolean);

  Object.assign(appCtx, { dagSources, entityWiki, tieredData, topicTieredData, wikiCache });
};
