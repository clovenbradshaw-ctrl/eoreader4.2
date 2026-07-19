// EO — one section of the reader session controller (split from rooms/reader/app.js, same
// "no god module" pass the other app/*.js sections follow). Cross-source sync: pick two
// sources, align their timestamped word tokens (core/sync/align.js), gated so a wrong
// pairing correctly reports abstain rather than a force-fit guess (docs: the born-rule gate,
// core/voidnull.js). The canonical output is the anchor JSONL (core/sync/anchors.js); export
// organs (organs/out/sync) project it into whatever format a caller actually wants.
import { alignSequences, toJsonl, fromJsonl } from '../../../core/sync/index.js';
import { reduceWordsToFeatures } from '../../../organs/in/index.js';
import { jsonlPlan, srtPlan, renderSrt } from '../../../organs/out/sync/index.js';
import { createAnchorStore } from '../anchor-store.js';
import { sha256Hex } from '../../archive/index.js';
import { nowIso } from './util.js';

export const installSync = (appCtx) => {
  const { state, emit, logIt } = appCtx;
  const anchorStore = createAnchorStore();

  // Two other sources already in the workspace (their own words, if any) — the strongest
  // decoy background (core/sync/decoys.js crossSourceDecoy): real content, genuinely
  // unrelated to the pair under test.
  const otherFeatureSeqs = (snA, snB) =>
    (state.sources || [])
      .filter((s) => s.sn !== snA && s.sn !== snB && Array.isArray(s.words) && s.words.length)
      .slice(0, 2)
      .map((s) => reduceWordsToFeatures(s.words));

  const computeSync = (snA, snB, opts = {}) => {
    const srcA = appCtx.sourceBySn(snA), srcB = appCtx.sourceBySn(snB);
    if (!srcA || !srcB) return null;
    const seqA = reduceWordsToFeatures(srcA.words);
    const seqB = reduceWordsToFeatures(srcB.words);
    return alignSequences(seqA, seqB, {
      alpha: opts.alpha, windowSize: opts.windowSize, minCoverage: opts.minCoverage,
      otherSeqs: otherFeatureSeqs(snA, snB), snA, snB, roleA: opts.roleA, roleB: opts.roleB,
    });
  };

  // A fast, unsaved run for the live confirm-modal preview — same alignment, just capped to
  // the first ~10 anchors and never written to OPFS. Cheap enough to re-run on every
  // threshold-slider tick so raising alpha visibly drops low-confidence anchors in real time.
  const syncPreview = (snA, snB, opts = {}) => {
    const result = computeSync(snA, snB, opts);
    if (!result) return null;
    return { header: result.header, anchors: result.anchors.slice(0, 10), total: result.anchors.length };
  };

  // The full run: align, serialize the anchor stream, and content-address it into OPFS
  // (anchor-store.js) — the same pattern audio/pdf bytes already use, off the JSON snapshot.
  // Returns the header + a small ref, never the whole anchor array (syncExport reads it back).
  const syncRun = async (snA, snB, opts = {}) => {
    const result = computeSync(snA, snB, opts);
    if (!result) return null;
    const jsonlText = toJsonl(result.header, result.anchors);
    const sha = await sha256Hex(new TextEncoder().encode(jsonlText));
    await anchorStore.putText(sha, jsonlText);
    const anchorRef = { opfs: sha, bytes: jsonlText.length };
    const summary = {
      abstain: result.header.abstain, coverage: result.header.coverage, count: result.anchors.length,
      line: result.header.line, N: result.header.N, alpha: result.header.alpha,
    };
    return { header: result.header, anchorRef, summary };
  };

  // The standing-fold hook (app/standing.js runFold, kind:'sync') — a saved sync re-runs
  // exactly like any other standing fold ("recomputed projection... free"), against sources
  // that may have grown new content since it was saved.
  const syncRunFold = async (rec) => {
    if (!rec || rec.a == null || rec.b == null) return null;
    return syncRun(rec.a, rec.b, rec.opts || {});
  };

  // Save a sync as a standing fold — reuses app/standing.js's a/b fields (source sn's here,
  // not the old Rashomon entity ids that kind:'compare' used) so standingList/Refresh/Remove
  // work uniformly across every fold kind.
  const syncSave = async (snA, snB, opts = {}) => {
    const run = await syncRun(snA, snB, opts);
    if (!run) return null;
    const rec = {
      id: `watch${++appCtx.stn}`, kind: 'sync', scope: 'topic', sn: null, docId: null,
      a: snA, b: snB, opts, topicId: appCtx.topic()?.id || null, at: nowIso(),
      label: opts.label || `Sync · ${snA} ↔ ${snB}`,
      snapshot: run,
    };
    state.standing.push(rec);
    logIt('watch', `Sync — ${rec.label}${run.header.abstain ? ' (no confident alignment)' : ` · ${run.summary.count} anchors`}`, snA);
    appCtx.persist(); emit('standing');
    return { id: rec.id, kind: rec.kind, a: rec.a, b: rec.b, label: rec.label, at: rec.at, snapshot: rec.snapshot };
  };

  // Export a saved sync's anchors into a format organ (organs/out/sync). Reads the anchor
  // JSONL back from OPFS (never held in memory beyond a run) so export works after a reload.
  const syncExport = async (id, format = 'jsonl', exportOpts = {}) => {
    const rec = state.standing.find((r) => r.id === id && r.kind === 'sync');
    const ref = rec && rec.snapshot && rec.snapshot.anchorRef;
    if (!ref || !ref.opfs) return null;
    const text = await anchorStore.getText(ref.opfs);
    if (!text) return null;
    const { anchors } = fromJsonl(text);
    if (format === 'srt') {
      const cues = srtPlan(anchors, exportOpts);
      return { text: renderSrt(cues), ext: 'srt', mime: 'text/plain', filename: `${rec.label || id}.srt` };
    }
    const plan = jsonlPlan(rec.snapshot.header, anchors);
    return { ...plan, filename: `${rec.label || id}.jsonl` };
  };

  Object.assign(appCtx, { syncPreview, syncRun, syncRunFold, syncSave, syncExport });
};
