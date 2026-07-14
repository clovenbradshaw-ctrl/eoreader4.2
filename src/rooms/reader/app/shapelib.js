// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// the form library (turn/shape.js) — built in the background once MiniLM is warm
import { loadShapeLibrary } from '../../../turn/index.js';
import { loadShapeGrammars } from '../../../turn/index.js';
import { extendLibraryWithNavPool } from '../../../turn/index.js';

export const installShapelib = (appCtx) => {
  const { emit } = appCtx;
  // ── the form library (turn/shape.js) — built in the background once MiniLM is warm ──
  // Grammar mode when data/shapes.json is present: navigation embeds the 430 exemplar
  // prompts (a one-time cost the persistent cache amortises to zero across sessions);
  // draft scoring is model-free (move-grammar likelihood vs the assistant contrast).
  // Then the corpus navigation pool (data/nav-corpus.jsonl) extends the kNN under a
  // wall-clock budget — however far it reaches, coverage is breadth-first, and the next
  // session's budget starts where this one stopped (cached vectors cost no budget).
  // Every step degrades to inert, never to a broken turn: no shapes.json → legacy
  // cosine library; no exemplars → no library; a thrown build → shapeLib stays null.
  const NAV_POOL_BUDGET_MS = 45_000;
  let shapeLibBuilding = false; appCtx.shapeLib = null;
  const buildShapeLib = () => {
    if (appCtx.shapeLib || shapeLibBuilding || !appCtx.minilm?.isWarm?.()) return;
    shapeLibBuilding = true;
    (async () => {
      try {
        const shapes = await loadShapeGrammars();
        const lib = await loadShapeLibrary((t) => appCtx.minilm.embed(t), { shapes });
        if (!lib) return;
        appCtx.shapeLib = lib;
        emit('model');
        await extendLibraryWithNavPool(lib, appCtx.minilm, { budgetMs: NAV_POOL_BUDGET_MS });
        emit('model');
      } catch { /* the form path stays inert — never a broken turn */ }
      finally { shapeLibBuilding = false; }
    })();
  };

  Object.assign(appCtx, { buildShapeLib });
};
