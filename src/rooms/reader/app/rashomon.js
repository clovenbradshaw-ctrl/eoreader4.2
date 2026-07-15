// EO — one section of the reader session controller (rooms/reader/app.js), the RASHOMON fold:
// the same events read from two figures' folds, and the difference between those folds as a
// first-class object, offered at BOTH scopes — one source, and the whole topic.
//
// It rides the reading, and gets smarter as the reading does. Each figure's fold is read
// through the document's LEARNED speech ledger (doc.conventions.isAttributionVerb — the seed
// verbs ∪ what the gutenberg/omnilingual pass induced), so more voices are heard as the ledger
// learns them. And the claim-sameness judgment is the model-free lexical floor UNLESS the
// MiniLM meaning embedder is warm, in which case the learned proposition-equivalence lift finds
// the agreements and conflicts that spelling alone misses (perceiver/perspective-diff.js).

import { projectGraph } from '../../../core/index.js';
import { perspectiveOf, scanQuotes, diffPerspectives, learnedDiff, mergePerspectives } from '../../../perceiver/index.js';

export const installRashomon = (appCtx) => {
  const speechOf = (doc) => doc?.conventions?.isAttributionVerb;
  const warmEmbedder = () => (appCtx.minilm?.isWarm?.() ? appCtx.minilm : null);
  const diffOf = async (a, b) => { const e = warmEmbedder(); return e ? learnedDiff(a, b, { embedder: e }) : diffPerspectives(a, b); };

  // Resolve a bare label to a representative id in one doc, tolerating a titled full label
  // ("Chief Delgado" ← "Delgado") the way perspective.js resolves a speaker. Returns null when
  // the doc does not name the figure — that source simply contributes nothing to the fold.
  const idInDoc = (doc, label) => {
    const adm = doc?.admission; if (!adm) return null;
    const g = projectGraph(doc.log); const rep = g.representative || ((x) => x);
    const clean = String(label || '').trim().replace(/\s+/g, ' ');
    if (adm.isAdmitted?.(clean)) return rep(adm.idOf(clean));
    const toks = clean.split(' ');
    for (const key of adm.admitted?.keys?.() || []) {
      const kt = String(key).split(/\s+/);
      if (kt.includes(clean) || (toks.length > 1 && toks.every((t) => kt.includes(t)))) return rep(adm.idOf(key));
    }
    return null;
  };

  // One figure's perspective in one doc, threaded through the learned ledger, tagged with the
  // source so the topic-scope merge can carry which source each voice came from.
  const perspById = (doc, entId, source = null) => {
    const p = perspectiveOf(doc, [entId].filter((x) => x != null), { isSpeech: speechOf(doc) });
    return source != null ? { ...p, source } : p;
  };

  // The agents a doc names — the figures with a VOICE, read once from the quote scan (the same
  // seam perspectiveOf uses). What the compare picker offers, cheaper than folding everyone.
  const agentsInDoc = (doc) => {
    const out = new Map();
    if (!doc?.log || !Array.isArray(doc.sentences)) return out;
    const g = projectGraph(doc.log); const rep = g.representative || ((x) => x);
    const labelOf = (id) => doc.admission?.labelOf?.(id) || g.entities.get(id)?.label || id;
    for (const s of doc.sentences) {
      for (const q of scanQuotes(s, { isSpeech: speechOf(doc), admission: doc.admission })) {
        const id = q.speakerId ? rep(q.speakerId) : null;
        const key = id || (q.speakerLabel ? `~${q.speakerLabel.toLowerCase()}` : null);
        if (!key) continue;
        const row = out.get(key) || { id, label: id ? labelOf(id) : q.speakerLabel, quotes: 0 };
        row.quotes += 1; out.set(key, row);
      }
    }
    return out;
  };

  // The surface-safe projection — claim objects flattened to their phrases, so nothing but
  // plain, serializable data crosses the membrane.
  const project = (diff, extra = {}) => ({
    ...extra,
    basis: diff.metric.basis,
    a: diff.a, b: diff.b,
    shared: diff.shared.map((s) => ({ text: s.text, learned: !!s.learned, also: s.also || null, sim: s.sim ?? null })),
    conflict: diff.conflict.map((c) => ({ subject: c.subject, a: c.a.text, b: c.b.text, learned: !!c.learned, sim: c.sim ?? null })),
    divergent: diff.divergent.map((d) => ({ subject: d.subject, a: d.a, b: d.b })),
    onlyA: diff.onlyA.map((x) => x.text),
    onlyB: diff.onlyB.map((x) => x.text),
    cast: diff.cast,
    metric: diff.metric,
  });

  // ── Source scope — two figures in ONE document, diffed ──────────────────────────────
  // entIdA / entIdB are representative ids from the entity explorer (levels.js entityProfile).
  const rashomonSource = async (docId, entIdA, entIdB) => {
    const resolved = appCtx.resolveDoc(docId);
    const doc = resolved?.doc;
    if (!doc || entIdA == null || entIdB == null) return null;
    const a = perspById(doc, entIdA), b = perspById(doc, entIdB);
    const diff = await diffOf(a, b);
    return project(diff, { scope: 'source', docId, title: resolved.src?.title || null });
  };

  // ── Topic scope — two figures ACROSS every source, each folded then diffed ───────────
  // labelA / labelB are the merged entity-explorer labels; each figure's fold is unioned over
  // the topic's sources (mergePerspectives) before the diff, so the comparison is corpus-wide.
  const rashomonTopic = async (labelA, labelB) => {
    if (!labelA || !labelB) return null;
    const aPacks = [], bPacks = [], contributed = [];
    for (const src of appCtx.topicSources()) {
      const doc = appCtx.referentDocFor(src);
      if (!doc?.log) continue;
      const idA = idInDoc(doc, labelA), idB = idInDoc(doc, labelB);
      let touched = false;
      if (idA != null) { const p = perspById(doc, idA, src.sn); if (p.quotes.length || p.fold.claims.length) { aPacks.push(p); touched = true; } }
      if (idB != null) { const p = perspById(doc, idB, src.sn); if (p.quotes.length || p.fold.claims.length) { bPacks.push(p); touched = true; } }
      if (touched) contributed.push({ sn: src.sn, title: src.title || null });
    }
    const a = mergePerspectives(aPacks, { label: labelA });
    const b = mergePerspectives(bPacks, { label: labelB });
    const diff = await diffOf(a, b);
    return project(diff, { scope: 'topic', sources: contributed });
  };

  // The figures worth comparing — those with a voice — at either scope. Source: representative
  // ids (for rashomonSource). Topic: labels unioned across sources (for rashomonTopic).
  const rashomonCandidates = ({ sn = null } = {}) => {
    if (sn != null) {
      const doc = appCtx.referentDocFor(appCtx.sourceBySn(sn));
      if (!doc) return [];
      return [...agentsInDoc(doc).values()].filter((r) => r.id).sort((x, y) => y.quotes - x.quotes)
        .map((r) => ({ id: r.id, label: r.label, quotes: r.quotes }));
    }
    const byLabel = new Map();
    for (const src of appCtx.topicSources()) {
      const doc = appCtx.referentDocFor(src);
      if (!doc) continue;
      for (const r of agentsInDoc(doc).values()) {
        const key = String(r.label || '').trim().toLowerCase();
        if (!key) continue;
        const row = byLabel.get(key) || { label: r.label, quotes: 0, sources: 0 };
        row.quotes += r.quotes; row.sources += 1; byLabel.set(key, row);
      }
    }
    return [...byLabel.values()].sort((x, y) => y.quotes - x.quotes);
  };

  Object.assign(appCtx, { rashomonSource, rashomonTopic, rashomonCandidates, voicesInDoc: agentsInDoc, warmEmbedder });
};
