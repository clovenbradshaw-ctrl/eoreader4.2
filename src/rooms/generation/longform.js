// EO: SYN·CON·EVA(Field,Network → Network,Lens, Composing,Binding,Tracing) — Write mode
// longform.js — the generation surface's Write mode: topic + outline + source
// material → a grounded, multi-section essay. This is a thin caller over
// weave/essay's runEssay (docs/longform-generation.md) — the engine that already
// does the real work (explore cheap candidate claims → bind them to spans →
// veto the unbound → render one prose pass per section, with bounded spine
// revision as the mechanism). Nothing here re-implements that loop; this file
// only turns what a surface can collect from a person (a thesis, an optional
// outline, a block of source material) into the three things runEssay needs
// (`thesis`, `sections`, `spans`) and hands the live model through untouched.
//
// The grounding is deliberate, not a limitation to route around: every claim
// the driver keeps is bound to a span in `sourceText`, so the model is spent
// exactly where the wired-in-a-frontier-model essay says it should be — making
// the prose from commitments the substrate already chose, never asserting a
// fact with nothing behind it. A piece with no source material still plans and
// checkpoints, but writes nothing, honestly (reconcile.findings says so) —
// that is the anti-confabulation floor holding, not a bug to paper over.

import { runEssay, KNOB_DEFAULTS, describeEvent, liveView } from '../../weave/essay/index.js';
import { buildGroundPool } from './ground-pool.js';

// outlineToSections("one section topic per line") -> essay/spine.js section specs.
// A blank outline yields none — runLongform then opens on the thesis itself as
// the one section, and the driver's bounded insert/split motion may still grow
// it from what the source material surfaces.
export const outlineToSections = (outline = '') =>
  String(outline || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((intent, i) => ({ id: `sec:${i}`, intent }));

// runLongform({ thesis, sourceText, outline, model, onEvent, knobs, signal })
//   -> runEssay's result: { log, report, essay, spine, carry, done }
// `report` is the projected essay (weave/essay/project.js) — per-section state,
// the commitment ledger, open threads, reconcile findings; `essay` is its text
// projection. `onEvent` fires once per EssayEvent, live, for a streaming UI.
export const runLongform = async ({
  thesis = '', sourceText = '', outline = '', model = null,
  onEvent = null, knobs = {}, signal = null,
} = {}) => {
  const sections = outlineToSections(outline);
  const resolvedThesis = String(thesis || '').trim() || sections[0]?.intent || 'Untitled';
  const topic = resolvedThesis + (sections.length ? ` ${sections.map((s) => s.intent).join(' ')}` : '');
  const spans = buildGroundPool(sourceText, { topic });
  return runEssay({
    thesis: resolvedThesis,
    sections: sections.length ? sections : [{ id: 'sec:0', intent: resolvedThesis }],
    spans,
    model,
    onEvent,
    knobs,
    signal,
  });
};

export { KNOB_DEFAULTS, describeEvent, liveView };
