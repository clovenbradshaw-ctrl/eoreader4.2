// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// export provenance (rooms/reader/provenance.js)
import { repoRef, readBuild, fetchLatestCommit } from '../provenance.js';

export const installProvBuild = (appCtx) => {
  const { emit } = appCtx;
  // ── export provenance (rooms/reader/provenance.js) ───────────────────────────
  // WHAT PRODUCED THIS. The chat export must be able to name its own maker — the app + the exact
  // published build, the latest build on GitHub, and the model that answered. The build/latest reads
  // are network (version.json + the GitHub API); do them ONCE, best-effort, at boot and cache them,
  // so `exportChat` stays synchronous and composes the fresh model + clock over the cached pieces.
  // The repo/site is derived from the running location; in Node/tests there is no fetch, so the
  // cache stays empty and the export degrades to app + model, never a throw or a hang.
  const provRepo = repoRef(typeof location !== 'undefined' ? location : null);
  appCtx.provBuild = null; appCtx.provLatest = null;
  const refreshProvenance = async () => {
    if (typeof fetch === 'undefined') return;   // no network here — the synchronous core still exports
    const f = fetch.bind(globalThis);           // detached window.fetch throws "Illegal invocation" in some browsers
    const base = (typeof location !== 'undefined' && location.href) || null;
    appCtx.provBuild  = await readBuild(f, base).catch(() => null);
    appCtx.provLatest = await fetchLatestCommit(f, provRepo.slug).catch(() => null);
    emit('model');   // a header badge can reflect the build/freshness once it's in
  };

  Object.assign(appCtx, { provRepo, refreshProvenance });
};
