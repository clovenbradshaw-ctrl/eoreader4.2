// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// memo


export const installMemo = (appCtx) => {
  const { emit } = appCtx;
  // ── memo ───────────────────────────────────────────────────────────────────
  const setMemo = (text) => { const t = appCtx.topic(); if (t) { t.memo = String(text); appCtx.persist(); emit('memo'); } };

  Object.assign(appCtx, { setMemo });
};
