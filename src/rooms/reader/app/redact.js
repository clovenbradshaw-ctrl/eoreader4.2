// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// redact-when-hosted (the confidentiality lever)


export const installRedact = (appCtx) => {
  const { emit, logIt } = appCtx;
  // ── redact-when-hosted (the confidentiality lever) ───────────────────────────
  // When ON, a HOSTED talker (Claude · Anthropic) never sees a real entity name: the turn's
  // messages pass through the privacy membrane (model/redact-remote.js) — every admitted entity
  // collapses to an opaque token on the way out, and the answer is restored locally. A local
  // in-browser model is untouched (it already runs where the names live), and the membrane is a
  // transparent passthrough for it, so the flag only bites a remote backend. Persisted; OFF by
  // default (the record is sent verbatim unless the user asks otherwise). Read redactRemote()/
  // setRedactRemote() from the surface.
  let redactRemoteOverride = null;
  const redactRemote = () => {
    if (redactRemoteOverride != null) return redactRemoteOverride;
    try { return localStorage.getItem('eo_redact_remote') === '1'; } catch { return false; }
  };
  const setRedactRemote = (on) => {
    redactRemoteOverride = !!on;
    try { localStorage.setItem('eo_redact_remote', on ? '1' : '0'); } catch { /* session-only */ }
    logIt('record', on
      ? 'Hosted chat set to REDACTED — real entities are replaced with tokens before they leave the browser'
      : 'Hosted chat set to send the record verbatim');
    emit('model');
  };
  // The real entity surfaces across the active topic's docs (the admitted labels) — the names the
  // membrane must keep off the wire. Reuses the same lexicon the answer/viewer segmentation reads.
  const redactionNames = () => {
    try { return appCtx.entityLexicon(appCtx.topicReferentDocs()).map((e) => e.label); } catch { return []; }
  };

  Object.assign(appCtx, { redactRemote, redactionNames, setRedactRemote });
};
