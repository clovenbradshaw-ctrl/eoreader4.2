// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// the entity DIGEST — the explore surface (docs/topline.md)
import { chapterBullets, composeEntityDigest, composeChapterReading } from '../../../weave/topline/index.js';
import { detectGrain } from '../../../surfer/index.js';
import { nowIso } from './util.js';

export const installDigest = (appCtx) => {
  const { emit, state } = appCtx;
  // ── the entity DIGEST — the explore surface (docs/topline.md) ──────────────────────────────────
  // The topline is the one line the panel opens with; the digest is what a reader DIGS INTO. It has
  // three layers, and the discipline is progressive disclosure: the deterministic spine is always
  // there, and the model is not touched until the reader leans in.
  //
  //   entityChapters      — the chapter spine (deterministic, model-free, computed every render): the
  //                         referent's mentions folded into the document's coarse grain, one bullet per
  //                         chapter it moves through. Always shown; costs no model, no network.
  //   entityDigest        — Most important / Most surprising, pulled ONLY on demand (generate:true, the
  //                         reader opened the card). Two grounded, containment-gated readings.
  //   entityChapterReading — the fold-prompted reading of the referent WITHIN one chapter, pulled only
  //                         when the reader opens that chapter to read closer. Deeper is another pull.
  //
  // Both on-demand readings hang on the entity's own summary record (keyed by merged label), so they
  // persist with it and are read back synchronously; neither is ever auto-kicked.

  // The chapter spine — deterministic, always available. Never touches the model.
  const entityChapters = (docId, entId) => {
    const profile = appCtx.entityProfile(docId, entId);
    if (!profile) return [];
    const doc = appCtx.resolveDoc(docId)?.doc;
    if (!doc) return [];
    const sentences = doc.sentences || doc.units || [];
    let grain;
    try { grain = detectGrain(doc, { grain: 'auto' }); } catch { grain = { mode: 'window', bounds: [] }; }
    return chapterBullets({ sentences, bounds: grain.bounds, mode: grain.mode, mentions: profile.mentions, label: profile.label });
  };

  // Read a stored digest back synchronously (the surface renders this; generation is separate).
  const entityDigestFor = (label) => state.summaries.entities[appCtx.entityKey(label)]?.digest || null;

  // Compose (or refresh) the Most-important / Most-surprising digest — pulled on demand. Stored on the
  // entity's summary record under `.digest`; with no model, the mechanical bullets stand.
  const entityDigest = (docId, entId, { generate = false, regenerate = false } = {}) => {
    const profile = appCtx.entityProfile(docId, entId);
    if (!profile) return Promise.resolve(null);
    const key = appCtx.entityKey(profile.label);
    const stored = state.summaries.entities[key]?.digest || null;
    if (!generate && !regenerate) return Promise.resolve(stored);
    if (stored && !regenerate) return Promise.resolve(stored);
    return appCtx.guarded(`digest:e:${key}`, regenerate, async () => {
      const digest = await composeEntityDigest(profile, { model: appCtx.model });
      const cur = state.summaries.entities[key] || { key, label: profile.label };
      state.summaries.entities[key] = { ...cur, key, label: profile.label, digest: { ...digest, generatedAt: nowIso() } };
      appCtx.persist(); emit('sources');
      return state.summaries.entities[key].digest;
    });
  };

  // Read a stored chapter reading back synchronously, keyed by the entity's label and the chapter id.
  const entityChapterReadingFor = (label, chapterIdx) => state.summaries.entities[appCtx.entityKey(label)]?.chapters?.[chapterIdx] || null;

  // Compose the fold-prompted reading of the entity within one chapter — pulled on demand when the
  // reader opens that chapter to read closer. Stored under `.chapters[chapterIdx]` on the summary.
  const entityChapterReading = (docId, entId, chapterIdx, { generate = false, regenerate = false } = {}) => {
    const profile = appCtx.entityProfile(docId, entId);
    if (!profile) return Promise.resolve(null);
    const key = appCtx.entityKey(profile.label);
    const stored = state.summaries.entities[key]?.chapters?.[chapterIdx] || null;
    if (!generate && !regenerate) return Promise.resolve(stored);
    if (stored && !regenerate) return Promise.resolve(stored);
    const chapter = entityChapters(docId, entId).find((c) => c.chapterIdx === chapterIdx);
    if (!chapter) return Promise.resolve(null);
    return appCtx.guarded(`chread:e:${key}#${chapterIdx}`, regenerate, async () => {
      const reading = await composeChapterReading(profile, chapter, { model: appCtx.model });
      const cur = state.summaries.entities[key] || { key, label: profile.label };
      const chapters = { ...(cur.chapters || {}) };
      chapters[chapterIdx] = { ...reading, generatedAt: nowIso() };
      state.summaries.entities[key] = { ...cur, key, label: profile.label, chapters };
      appCtx.persist(); emit('sources');
      return state.summaries.entities[key].chapters[chapterIdx];
    });
  };

  Object.assign(appCtx, { entityChapterReading, entityChapterReadingFor, entityChapters, entityDigest, entityDigestFor });
};
