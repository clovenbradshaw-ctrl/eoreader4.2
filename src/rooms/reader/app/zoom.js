// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// ZOOM IN — the passage and its fold-prompted close reading (docs/topline.md)
import { interpretFeedback, mergeSteer, passageNeighborhood, composePassageReading } from '../../../weave/topline/index.js';
import { nowIso } from './util.js';

export const installZoom = (appCtx) => {
  const { emit, state } = appCtx;
  // ── ZOOM IN — the passage and its fold-prompted close reading (docs/topline.md) ─────────────────
  // The deepest level of the drill: chapter → passage → this moment. The reader clicked a single
  // mention and wants to zoom into it — read the referent AT that instant, against the few sentences
  // around it rather than jumping away to the source. `entityPassage` is the deterministic
  // neighbourhood (always shown, no model); `entityPassageReading` is the tight close reading, pulled
  // only on the zoom. Both keyed by the centre sentence index, stored on the entity's summary record.
  const PASSAGE_RADIUS = 2;

  // The neighbourhood around a passage — deterministic context, always available. Also returns the
  // entity's mentions that fall inside the window, so the close reading folds over the same span.
  const entityPassage = (docId, entId, idx, { radius = PASSAGE_RADIUS } = {}) => {
    const profile = appCtx.entityProfile(docId, entId);
    if (!profile) return null;
    const doc = appCtx.resolveDoc(docId)?.doc;
    if (!doc) return null;
    const sentences = doc.sentences || doc.units || [];
    const hood = passageNeighborhood({ sentences, idx, radius });
    const lo = hood.start, hi = hood.end;
    const windowMentions = (profile.mentions || []).filter((m) => m.idx >= lo && m.idx <= hi);
    return { ...hood, windowMentions, label: `¶${idx}` };
  };

  const entityPassageReadingFor = (label, idx) => state.summaries.entities[appCtx.entityKey(label)]?.passages?.[idx] || null;

  // Compose the fold-prompted close reading of one passage — the tightest zoom, pulled on demand when
  // the reader opens that moment. Stored under `.passages[idx]` on the summary record.
  const entityPassageReading = (docId, entId, idx, { generate = false, regenerate = false, radius = PASSAGE_RADIUS } = {}) => {
    const profile = appCtx.entityProfile(docId, entId);
    if (!profile) return Promise.resolve(null);
    const key = appCtx.entityKey(profile.label);
    const stored = state.summaries.entities[key]?.passages?.[idx] || null;
    if (!generate && !regenerate) return Promise.resolve(stored);
    if (stored && !regenerate) return Promise.resolve(stored);
    const passage = entityPassage(docId, entId, idx, { radius });
    if (!passage) return Promise.resolve(null);
    return appCtx.guarded(`pass:e:${key}#${idx}`, regenerate, async () => {
      const reading = await composePassageReading(profile, { idx, radius, windowMentions: passage.windowMentions, label: passage.label }, { model: appCtx.model });
      const cur = state.summaries.entities[key] || { key, label: profile.label };
      const passages = { ...(cur.passages || {}) };
      passages[idx] = { ...reading, generatedAt: nowIso() };
      state.summaries.entities[key] = { ...cur, key, label: profile.label, passages };
      appCtx.persist(); emit('sources');
      return state.summaries.entities[key].passages[idx];
    });
  };

  // Give a topline feedback so it updates. The free-text note is interpreted into a STEER over the
  // closed set (cap length, pin a term, suppress a claim), folded onto the standing steer, recorded,
  // and the topline regenerated under it. A request the record cannot honour comes back in `unmet`.
  const summaryFeedback = async ({ scope, sn = null, docId = null, entId = null, text = '' } = {}) => {
    const note = interpretFeedback(text);
    const entry = { text: String(text || ''), at: nowIso() };
    if (scope === 'source') {
      const src = appCtx.sourceBySn(sn);
      if (!src) return null;
      const steer = mergeSteer(src.summary?.steer, note);
      src.summary = { ...(src.summary || {}), steer, feedback: [...(src.summary?.feedback || []), entry] };
      appCtx.persist();
      return appCtx.sourceSummary(sn, { regenerate: true });
    }
    if (scope === 'entity') {
      const profile = appCtx.entityProfile(docId, entId);
      if (!profile) return null;
      const key = appCtx.entityKey(profile.label);
      const cur = state.summaries.entities[key] || {};
      const steer = mergeSteer(cur.steer, note);
      state.summaries.entities[key] = { ...cur, key, label: profile.label, steer, feedback: [...(cur.feedback || []), entry] };
      appCtx.persist();
      return appCtx.entitySummary(docId, entId, { regenerate: true });
    }
    return null;
  };

  Object.assign(appCtx, { entityPassage, entityPassageReading, entityPassageReadingFor, summaryFeedback });
};
