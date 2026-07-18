// EO: SEG·EVA·SYN(Field → Field,Lens, Dissecting,Tracing,Composing) — the full-power surf, composed
// rich-surf.js — the surf with everything the answer path already rides, in one injectable
// function, so a caller that only knows `surf(doc, anchor, opts)` (the fold's injected-surf
// contract) gets the FULL reading, not the single-ride core.
//
// The summary fold injected bare surfFold: adaptive reach + thread, but NONE of:
//   · the SIGNIFICANCE column — structuralActivations (structure-basis.js), read off the
//     operator profiles with no embedder, so lenses/stance/atmosphere light up on every doc.
//     This is exactly what turn/stage-fold.js rides as its "structural default".
//   · the MULTI-LEVEL / CHORUS surf — multiLevelSurf, which over a COMPOSITE (many sources on
//     one axis) surfs the high level first, drops the off-topic sources, and reads only the
//     relevant ones (multilevel.js). The single-ride surf reads one neighbourhood and lets the
//     rest of a 40-review journal go unread — the source DRIFT the audits show.
//
// richSurf folds both in, and is a SAFE drop-in for surfFold:
//   · single-source doc → multiLevelSurf delegates to surfFold; the activations ride as a
//     report only (no lens passed → the arrest is byte-identical, the stage-fold discipline),
//     so `stops`/`peak` are unchanged. Nothing a non-composite summary reads moves.
//   · composite doc + a thread → the chorus triages the sources: the fold reads the relevant
//     sub-documents and drops the rest. THIS is the power the summary fold was leaving unused.
//
// Pure and synchronous (structuralActivations and multiLevelSurf both are), so it satisfies the
// injected-surf contract with no async lift — the caller wires it exactly where it wired surfFold.

import { surfFold } from './surf.js';
import { multiLevelSurf, sourceRanges } from './multilevel.js';
import { structuralActivations } from './structure-basis.js';

// The significance opts, embedder-free — turn/stage-fold.js's "structural default", verbatim in
// spirit: ρ from the operator profiles lights the column (lenses, stance) on every doc. The
// dominant lens is deliberately NOT passed, so the arrest stays byte-identical to the plain surf
// (a reading change is bench-gated, not a side effect). Degrades to {} on any fault — a flaky
// significance read must never darken the fold.
const significanceOpts = (doc) => {
  try {
    const { activations, signs } = structuralActivations(doc);
    if (!activations?.length || !activations.some((v) => v.some((x) => x > 0))) return {};
    return { activations, signs, lensReport: true, stance: true };
  } catch { return {}; }
};

export const richSurf = (doc, anchor = 0, opts = {}) => {
  const sig = significanceOpts(doc);
  // A composite with a thread to be relevant to → the multi-level chorus, which drops the
  // off-topic sources before their content is read. The summary fold's per-scope thread
  // (entity/topic) is the chorus basis. multiLevelSurf itself falls back to a single chorus
  // ride when level 1 is a no-op, so this is safe for one-source docs too — but we only route
  // there when there IS more than one source, keeping the non-composite path byte-identical.
  const thread = opts.thread || null;
  const multiSource = (() => { try { return sourceRanges(doc).length > 1; } catch { return false; } })();
  if (thread && multiSource) {
    return multiLevelSurf(doc, anchor, { ...opts, ...sig, chorus: thread });
  }
  return surfFold(doc, anchor, { ...opts, ...sig });
};
