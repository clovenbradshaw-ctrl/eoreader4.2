// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// entities (the explorer)
import { projectGraph } from '../../../core/index.js';
import { mergeEntitiesByReferent } from '../entity-merge.js';
import { buildReferents } from '../../../perceiver/referents/index.js';

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

  // The referent-first identity layer (perceiver/referents) denotes "Victor" and
  // "Frankenstein" as ONE opaque referent by shared denotation, not spelling — the
  // union-find above never bridges them (no token overlap, and a contested surname
  // defeats the tail merge). It ships off by a parse-time flag (byte-identical when
  // unset) and no reading path threads that flag through, so it never actually ran.
  // Built here instead, LAZILY and POST-HOC straight off the already-parsed doc's
  // own log/sentences/admission/corefField — no re-parse, no change to parseText's
  // default output, cached on the doc so a re-render doesn't rebuild it.
  const referentApiFor = (doc) => {
    if (!doc || !doc.log || doc.modality !== 'text') return null;
    if (typeof doc.referents === 'function') return doc;   // flag was already on upstream
    if (doc._referentApi === undefined) {
      try {
        doc._referentApi = buildReferents({
          log: doc.log, sentences: doc.sentences, admission: doc.admission,
          corefField: doc.corefField, docId: doc.docId,
        });
      } catch { doc._referentApi = null; }
    }
    return doc._referentApi;
  };

  // Which union-find root each referent's NAME/DESCRIPTION surfaces resolve to, so rows
  // built off the firm graph (below) can be folded by shared referent. A root absent from
  // this map denotes no referent (an un-admitted mention) and is left ungrouped.
  const refIdByRoot = (doc, api, rep) => {
    const admission = doc.admission;
    const out = new Map();
    for (const ref of api.referents()) {
      for (const m of api.surfacesOf(ref.id)) {
        if (m.form === 'name' && admission?.isAdmitted?.(m.label)) {
          out.set(rep(admission.idOf(m.label)), ref.id);
        } else if (m.form === 'description' && admission?.isAdmitted?.(m.normalized)) {
          out.set(rep(admission.idOf(m.normalized)), ref.id);
        }
      }
    }
    return out;
  };

  // Fold the firm per-root rows by shared referent — the ONLY structural change from the
  // plain union-find rows: entId/key/label keep coming from a REAL underlying root (so
  // entityProfile's drill-down, which looks entId up directly in the doc's graph, keeps
  // working unmodified) but two or more roots the referent layer denotes as one figure
  // (Victor + bare Frankenstein; the creature + the wretch) now report as a single row,
  // opening on the fullest-named / most-mentioned root, mentions and links summed. Rows
  // the referent layer never touched (no name/description surface, or the layer failed to
  // build) pass through unchanged — this is additive, never lossy.
  const foldRowsByReferent = (doc, rows) => {
    const api = referentApiFor(doc);
    if (!api) return rows;
    const g = projectGraph(doc.log);
    const rep = g.representative || ((x) => x);
    const refOf = refIdByRoot(doc, api, rep);
    const isMulti = (l) => String(l || '').trim().split(/\s+/).filter(Boolean).length >= 2;
    const groups = new Map();               // referent id (or lone root) → rows sharing it
    for (const row of rows) {
      const gid = refOf.get(row.entId) || row.entId;
      let grp = groups.get(gid);
      if (!grp) { grp = []; groups.set(gid, grp); }
      grp.push(row);
    }
    const out = [];
    for (const grp of groups.values()) {
      if (grp.length === 1) { out.push(grp[0]); continue; }
      // Open on the busiest full (multi-word) row; failing that, the busiest row overall —
      // the same "fullest name leads" preference entity-merge.js applies across sources.
      const full = grp.filter((r) => isMulti(r.label)).sort((a, b) => (b.mentions || 0) - (a.mentions || 0))[0];
      const lead = full || grp.slice().sort((a, b) => (b.mentions || 0) - (a.mentions || 0))[0];
      const mentions = grp.reduce((s, r) => s + (r.mentions || 0), 0);
      const links = grp.reduce((s, r) => s + (r.links || 0), 0);
      out.push({ ...lead, mentions, links });
    }
    return out;
  };

  // ── transcription-variant fold: one SCREAMING-CAPS code, mis-heard ──────────────
  // The referent layer folds by shared denotation and the surname logic folds by token
  // containment — but neither catches a single-character MIS-TRANSCRIPTION of an acronym /
  // system name: "FUSUS" (the real system) and "FUSIS" (an ASR/OCR slip) share no token and
  // are not a containment pair, so they admit as two entities and inflate the per-source
  // count. This is a deliberately NARROW orthographic fold, gated so it cannot touch an
  // ordinary name: BOTH labels must be single-token, ALL-CAPS codes (a Titlecase name like
  // "Marisa"/"Marina" is excluded by the caps test), of the SAME length ≥ 5, differing at
  // exactly ONE position (Hamming distance 1). The busier spelling (more sightings) is kept
  // as the canonical row and opens the profile, so "FUSUS" wins over the rarer "FUSIS".
  const isScreamCode = (label) => {
    const s = String(label || '');
    return !s.includes(' ') && s.length >= 5 && s === s.toUpperCase() && s !== s.toLowerCase();
  };
  const isTranscriptionVariant = (a, b) => {
    if (a === b || a.length !== b.length || !isScreamCode(a) || !isScreamCode(b)) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false;
    return diff === 1;
  };
  const foldSpellingVariants = (rows) => {
    const codes = rows.filter((r) => isScreamCode(r.label));
    if (codes.length < 2) return rows;
    // Order candidates by sighting mass so the busiest spelling anchors its variants.
    const ranked = codes.slice().sort((a, b) => (b.mentions || 0) - (a.mentions || 0));
    const foldedInto = new Map();   // variant row → anchor row
    for (let i = 0; i < ranked.length; i++) {
      if (foldedInto.has(ranked[i])) continue;
      for (let j = i + 1; j < ranked.length; j++) {
        if (foldedInto.has(ranked[j])) continue;
        if (isTranscriptionVariant(ranked[i].label, ranked[j].label)) foldedInto.set(ranked[j], ranked[i]);
      }
    }
    if (!foldedInto.size) return rows;
    for (const [variant, anchor] of foldedInto) {
      anchor.mentions = (anchor.mentions || 0) + (variant.mentions || 0);
      anchor.links = (anchor.links || 0) + (variant.links || 0);
    }
    return rows.filter((r) => !foldedInto.has(r));
  };

  // The merged referents a SINGLE doc admits — one row per union-find representative
  // (further folded by shared referent, above), with its sighting mass and incident
  // degree. Pulled out of `entities()` so the topic explorer, the per-source pivot, and
  // the holonic-level toggle all read a source the same way. Each row also carries the
  // acoustic holon tag (kind='signal'|'noise', from organs/in/acoustic.js) and the numeric
  // holon level off the entity's DEF props, so callers can filter by holonic level.
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
    return foldSpellingVariants(foldRowsByReferent(doc, rows));
  };
  // `level` selects the HOLONIC LEVEL of the topic explorer: 'names' (default) is the natural-
  // language REFERENTS — the people, places and things the content NAMES — read from each source's
  // meaning layer (referentDocFor), never from the raw spans underneath; 'signal' is the acoustic
  // signal/noise span holons an audio reading INS's; 'all' keeps both. Referents are the entities;
  // the base spans (a clip's segments/words, an image's regions) are NOT entities, so they never
  // leak into the names list — the bug that filled it with 'the/of/court' word-holons and, before a
  // clip was transcribed, with the acoustic summary's own 'Signal/Noise/Dynamic'.
  const entities = ({ merge = true, level = 'names' } = {}) => {
    const nameRows = [], baseRows = [], convs = [];
    for (const src of appCtx.topicSources()) {
      if (level !== 'signal') {                 // 'names' + 'all' want the referents (the meaning)
        const rd = appCtx.referentDocFor(src);
        if (rd) { nameRows.push(...entitiesInDoc(rd, src.sn)); if (rd.conventions) convs.push(rd.conventions); }
      }
      if (level !== 'names') {                  // 'signal' + 'all' want the raw base spans underneath
        const bd = appCtx.docFor(src);
        baseRows.push(...entitiesInDoc(bd, src.sn));
        if (bd?.conventions) convs.push(bd.conventions);
      }
    }
    // The epithet-fold signal, unioned over every source read (a register is live if ANY
    // source learned it): "God" is a unique non-person referent and "Good"/"Great" are its
    // epithets, so "God" / "Good God" / "Great God" collapse to one row. Only wired when a
    // source actually carries the `isNonPerson` register, so a corpus that never learned it
    // (every existing reading) folds byte-identically to before.
    const anyConv = (m) => (convs.some((c) => typeof c?.[m] === 'function') ? (v) => convs.some((c) => c?.[m]?.(v)) : undefined);
    const epithetHead = anyConv('isNonPerson');
    const isEpithet = anyConv('isModifier');
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
      return mergeEntitiesByReferent(rows, { entityKey, isEpithet, epithetHead });
    }
    rows.sort((a, b) => (b.mentions + b.links) - (a.mentions + a.links));
    return rows;
  };

  Object.assign(appCtx, { entities, entitiesInDoc, entityKey });
};
