// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// persistence
import { isDefaultTopicTitle } from '../topic-name.js';
import { kv } from './kv.js';
import { nowIso } from './util.js';

export const installPersistence = (appCtx) => {
  const { emit, ledger, state } = appCtx;
  // ── persistence ────────────────────────────────────────────────────────────
  const serialize = () => ({
    v: 1, sn: appCtx.sn, tn: appCtx.tn, ln: appCtx.ln, mn: appCtx.mn, wn: appCtx.wn, fon: appCtx.fon,
    activeTopicId: state.activeTopicId,
    activeWorkspaceId: state.activeWorkspaceId,
    workspaces: state.workspaces,
    // the source explorer's folder tree (Drive) — small plain JSON, one per workspace subtree
    folders: state.folders,
    log: state.log.slice(-120),
    topics: state.topics,
    // Persist only the RECORDED source — never its DERIVED readings. Every `_`-prefixed
    // field (`_doc` the parse, `_eot` the full EoT reading) re-derives from `text` in a
    // tick and must not ride into the snapshot: `_eot` alone is the whole reading of the
    // source (a 2,500-page PDF's is ~7,600 propositions of structure + the reading as one
    // string), and leaving it in meant every 400 ms autosave structure-cloned that derived
    // bulk into IndexedDB — the large-document slowdown. Strip anything underscore-led.
    sources: state.sources.map((s) => {
      const out = {};
      for (const k in s) if (k[0] !== '_') out[k] = s[k];
      return out;
    }),
    // the commitment ledger — assertions and corrections survive reload (the spine)
    ledger: ledger.serialize(),
    // entity toplines (source toplines ride on each source above) — the summary + its feedback
    summaries: { entities: state.summaries.entities, definer: state.summaries.definer, folds: state.summaries.folds || {} },
    // the durable pending-work registry — the fetches / imports / transcriptions still in flight,
    // so a reload mid-way can pick them back up (ingest-jobs.js). Small plain JSON specs only.
    jobs: state.jobs,
    // pins — small plain JSON, each with its embedded anchor (docs/search-and-pins.md)
    pn: appCtx.pn, pins: state.pins,
    // standing folds — saved comparisons/traces with their last snapshot (app/standing.js)
    stn: appCtx.stn, standing: state.standing,
  });
  let saveTimer = null;
  const persist = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const snap = serialize();
      kv('readwrite', (store) => store.put(snap, 'session')).catch(() => {});
    }, 400);
  };
  const restore = async () => {
    try {
      const snap = await kv('readonly', (store) => store.get('session'));
      if (snap && snap.v === 1) {
        ({ sn: appCtx.sn, tn: appCtx.tn, ln: appCtx.ln, mn: appCtx.mn } = snap);
        appCtx.wn = snap.wn || 0;
        appCtx.fon = snap.fon || 0;
        state.sources = (Array.isArray(snap.sources) ? snap.sources : []).map((s) => {
          const src = { ...s, _doc: null };
          // Re-seed the live ASR object from its durable twin so the transcription banner reads
          // correctly at once after a reload (done / skipped / — or the resuming state resumeJobs
          // is about to drive). A clip left mid-transcription reads as pending until the resume runs.
          if (src.transcription) {
            const st = src.transcription.state;
            src._asr = { state: st === 'running' ? 'pending' : st, pct: src.transcription.pct || 0, reason: src.transcription.reason || null, partial: src.transcription.partial || '' };
            // The heard-so-far words, if the tab closed mid-transcription — re-seed the live view so
            // the Listen surface shows the partial transcript AT ONCE (click-to-seek + karaoke on it)
            // instead of a blank, and so it is never lost even if the resume below cannot run.
            if (Array.isArray(src.transcription.words) && src.transcription.words.length) src._asr.words = src.transcription.words;
          }
          return src;
        });
        state.topics = Array.isArray(snap.topics) ? snap.topics : [];
        state.activeTopicId = snap.activeTopicId;
        state.workspaces = Array.isArray(snap.workspaces) ? snap.workspaces : [];
        state.activeWorkspaceId = snap.activeWorkspaceId || null;
        state.folders = Array.isArray(snap.folders) ? snap.folders : [];
        state.log = Array.isArray(snap.log) ? snap.log : [];
        state.jobs = Array.isArray(snap.jobs) ? snap.jobs : [];   // pending work to resume below
        state.pins = Array.isArray(snap.pins) ? snap.pins : [];
        appCtx.pn = snap.pn || state.pins.length;
        state.standing = Array.isArray(snap.standing) ? snap.standing : [];
        appCtx.stn = snap.stn || state.standing.length;
        if (snap.ledger) ledger.restore(snap.ledger);   // the spine survives reload
        if (snap.summaries && snap.summaries.entities) {
          // `contextualPending` is a within-session marker that a written reading is mid-compose; it
          // can never be live across a reload (nothing is generating), and the panel would otherwise
          // hang on "composing…". Clear it on restore so each entity reveals the telegram it holds.
          const ents = {};
          for (const k in snap.summaries.entities) {
            const e = snap.summaries.entities[k];
            ents[k] = (e && e.contextualPending) ? { ...e, contextualPending: false } : e;
          }
          state.summaries = {
            entities: ents,
            definer: snap.summaries.definer || { champion: null, runs: 0 },
            // fold summaries (app/summaries.js) — plain records, restored as-is
            folds: (snap.summaries.folds && typeof snap.summaries.folds === 'object') ? snap.summaries.folds : {},
          };
        }
      }
    } catch { /* fresh session */ }
    // ── migrate to the workspace / topic-tree model ──────────────────────────
    // Older sessions had no workspaces and a flat topic list. Give them a single
    // "Personal" workspace, home every topic in it at the root, and default the new
    // nesting fields. Idempotent: a session already on the new model is untouched.
    if (!state.workspaces.length) {
      state.workspaces = [{ id: 'ws1', name: 'Personal', color: appCtx.WS_COLORS[0], shared: false, created: nowIso() }];
      appCtx.wn = Math.max(appCtx.wn, 1);
    }
    if (!state.activeWorkspaceId || !state.workspaces.find((w) => w.id === state.activeWorkspaceId)) {
      state.activeWorkspaceId = state.workspaces[0].id;
    }
    const defWs = state.workspaces[0].id;
    for (const t of state.topics) {
      if (!t.workspaceId || !state.workspaces.find((w) => w.id === t.workspaceId)) t.workspaceId = defWs;
      if (t.parentId === undefined) t.parentId = null;
      if (t.collapsed === undefined) t.collapsed = false;
      // Older sessions predate `named`: a title that differs from the placeholder was chosen
      // by hand, so pin it; a lingering "New topic" wasn't, so BACKFILL its auto-name from
      // the content it already holds (sources restored above, messages on the topic).
      if (t.named === undefined) t.named = !isDefaultTopicTitle(t.title);
      appCtx.topicAutoName(t, { silent: true });
    }
    if (!state.topics.length) appCtx.topicNew('New topic', { silent: true });
    if (!state.topics.find((t) => t.id === state.activeTopicId)) state.activeTopicId = state.topics[0].id;
    // Folder sanity: drop folders whose workspace is gone, and clear a source's `folderId`
    // when it points at a folder that no longer exists — the drive never shows a dead crumb.
    const wsIds = new Set(state.workspaces.map((w) => w.id));
    state.folders = (state.folders || []).filter((f) => f && f.id && wsIds.has(f.workspaceId));
    const folderIds = new Set(state.folders.map((f) => f.id));
    for (const f of state.folders) if (f.parentId && !folderIds.has(f.parentId)) f.parentId = null;
    for (const s of state.sources) if (s.folderId && !folderIds.has(s.folderId)) s.folderId = null;
    state.ready = true;
    emit('ready');
    // Lean boot: no local LLM/MiniLM prewarm on page open; load weights only on opt-in synthesis.
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      // THE MODEL KEEPER's triggers (healModel/verifyRestoredModel below): reload a model that
      // silently unloaded — a lost GPU device, a failed first load, an evicted engine — in the
      // background, at the moments recovery is likely to work, instead of on the next question's
      // critical path. Browser-only, like the prewarm; the 30s watch is a few property reads
      // when nothing is wrong.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) appCtx.healModel(); });
      window.addEventListener('online', () => appCtx.healModel());
      window.addEventListener('pageshow', (e) => { if (e && e.persisted) appCtx.verifyRestoredModel(); });
      setInterval(() => appCtx.healModel(), appCtx.HEAL_WATCH_MS);
      // Pull the build/latest provenance in the background so the first export already names the
      // exact build and how current it is against GitHub — best-effort, never on the critical path.
      appCtx.refreshProvenance().catch(() => { /* offline / unreachable — the export degrades gracefully */ });
      // The inner monologue starts at rest: the governor wakes the reading in the lulls
      // between turns and reflects on what's on the record (no-op until something is recorded).
      appCtx.deepIdleStart();
      // Pick back up any ingest / transcription that was in flight when the tab last closed —
      // the "survive a refresh even mid-way" guarantee. Deferred a beat so the first paint lands
      // first; browser-only (resume needs fetch / OPFS / whisper), best-effort, never blocks boot.
      setTimeout(() => { appCtx.resumeJobs().catch(() => { /* each job logs its own failure */ }); }, 800);
    }
  };

  Object.assign(appCtx, { persist, restore });
};
