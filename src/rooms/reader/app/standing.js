// EO — one section of the reader session controller (rooms/reader/app.js): STANDING FOLDS.
// A saved comparison or trace that is never stale — because everything here is a recomputed
// projection of an append-only log, re-running a saved fold against a grown corpus is free, and
// the DIFFERENCE from its last run is the finding: since you last looked, this conflict appeared,
// that one resolved, an idea reached a new voice or was newly inverted (perceiver/fold-delta.js).
//
// A standing fold is small plain JSON with its snapshot embedded (the surface-safe projection it
// last produced), so it persists across reloads exactly like a pin — durable on purpose.

import { foldDelta } from '../../../perceiver/index.js';
import { nowIso } from './util.js';

export const installStanding = (appCtx) => {
  const { state, emit } = appCtx;

  // Re-run the fold a record names, at its scope — the one place the standing kinds dispatch to
  // the live transmission methods. Compare folds (rashomon) are no longer available; sync folds
  // (app/sync.js) are a different axis — a cross-source alignment, not an entity-claim diff.
  const runFold = async (rec) => {
    if (rec.kind === 'trace') return rec.scope === 'source' ? appCtx.transmissionSource(rec.sn) : appCtx.transmissionTopic();
    if (rec.kind === 'sync') return appCtx.syncRunFold(rec);
    return null;   // compare folds (rashomon) removed — return null for backward compat
  };
  const autoLabel = (rec) => rec.kind === 'trace'
    ? `Trace · ${rec.scope === 'source' ? 'this source' : 'whole topic'}`
    : `${rec.a || '?'} vs ${rec.b || '?'}${rec.scope === 'topic' ? ' · topic' : ''}`;
  const project = (rec) => ({ id: rec.id, kind: rec.kind, scope: rec.scope, sn: rec.sn, a: rec.a, b: rec.b, label: rec.label, at: rec.at });

  // Save the current view as a standing fold — run it now and keep the result as the baseline the
  // next refresh diffs against.
  const standingSave = async (spec = {}) => {
    const kind = spec.kind === 'trace' ? 'trace' : 'compare';
    const scope = spec.scope === 'source' ? 'source' : 'topic';
    const rec = {
      id: `watch${++appCtx.stn}`, kind, scope,
      sn: scope === 'source' ? (spec.sn ?? null) : null,
      docId: scope === 'source' ? (spec.docId ?? null) : null,
      a: kind === 'compare' ? (spec.a ?? null) : null,
      b: kind === 'compare' ? (spec.b ?? null) : null,
      topicId: appCtx.topic()?.id || null,
      at: nowIso(),
    };
    if (kind === 'compare' && (rec.a == null || rec.b == null)) return null;
    rec.label = spec.label || autoLabel(rec);
    rec.snapshot = await runFold(rec);
    if (!rec.snapshot) return null;
    state.standing.push(rec);
    appCtx.logIt('watch', `Watching — ${rec.label}`);
    appCtx.persist(); emit('standing');
    return project(rec);
  };

  // Re-run a standing fold and report what changed since its last run; the new result becomes the
  // baseline, so the next refresh reports only what is new again.
  const standingRefresh = async (id) => {
    const rec = state.standing.find((r) => r.id === id);
    if (!rec) return null;
    const curr = await runFold(rec);
    const delta = foldDelta(rec.snapshot, curr);
    rec.snapshot = curr; rec.at = nowIso();
    appCtx.persist(); emit('standing');
    return { record: project(rec), delta };
  };

  const standingRemove = (id) => {
    const before = state.standing.length;
    state.standing = state.standing.filter((r) => r.id !== id);
    if (state.standing.length !== before) { appCtx.persist(); emit('standing'); }
  };

  // The standing folds of the active topic (a watch belongs to the topic it was saved in).
  const standingList = () => {
    const tid = appCtx.topic()?.id || null;
    return state.standing.filter((r) => !r.topicId || r.topicId === tid).map(project);
  };

  Object.assign(appCtx, { standingSave, standingRefresh, standingRemove, standingList });
};
