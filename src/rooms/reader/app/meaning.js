// EO — one section of the reader session controller (split from rooms/reader/app.js).
// meaning — the Reader's Meaning nav: lenses/stance at a reading position (surfer/surf.js's
// STRUCTURAL significance column — the same model-free default turn/stage-fold.js's
// significanceOpts falls back to: activations off the OPERATOR PROFILES, read from the log, no
// embedding model), and kinds clustered over a whole document (surfer/kinds.js). Pure folds over
// the already-parsed document — the same "always something real, model only ever an upgrade"
// discipline the fold-summary machinery keeps (docs/fold.md).
//
// Atmosphere and Paradigm are deliberately NOT read here: surf.js only computes either against a
// `prior` basis built from embedding centroids (turn/stage-fold.js's "meaning path"), which needs
// a loaded meaning-measuring model. Faking a basis-free reading would be an invented atmosphere/
// paradigm wearing a real label — worse than an honest gap — so surfAt() reports lenses/stance
// (real, structural, always available) and leaves atmosphere/paradigm null for the surface to
// mark as "needs a loaded model" rather than pretend to answer.

import { surfFold, structuralActivations, detectKinds } from '../../../surfer/index.js';

export const installMeaning = (appCtx) => {
  const docOf = (src) => (appCtx.referentDocFor ? appCtx.referentDocFor(src) : null) || (appCtx.docFor ? appCtx.docFor(src) : null);

  // surfAt(sn, anchor) → { anchor, lenses, lensEntropy, stance, atmosphere, paradigm } read at a
  // sentence-index position. atmosphere/paradigm stay null (see header) until a meaning model is
  // wired in; lenses/stance are the real structural column. Never throws; null only when the
  // source or its parsed document isn't available yet.
  const surfAt = (sn, anchor = 0) => {
    const src = appCtx.sourceBySn ? appCtx.sourceBySn(sn) : null;
    if (!src) return null;
    const doc = docOf(src);
    if (!doc) return null;
    const n = (doc.sentences || doc.units || []).length;
    const at = Math.max(0, Math.min(n > 0 ? n - 1 : 0, anchor | 0));
    const empty = { anchor: at, lenses: [], lensEntropy: 0, stance: null, atmosphere: null, paradigm: null };
    try {
      const { activations, signs } = structuralActivations(doc);
      if (!activations.length || !activations.some((v) => v.some((x) => x > 0))) return empty;
      const report = surfFold(doc, at, { activations, signs, lensReport: true, stance: true });
      return {
        anchor: at,
        lenses: report.lenses || [],
        lensEntropy: report.lensEntropy || 0,
        stance: report.stance || null,
        atmosphere: null,
        paradigm: null,
      };
    } catch { return empty; }
  };

  // kindsOf(sn) → detectKinds' clustering over this source's own entities. Abstains (k:0, kinds:
  // []) rather than forcing a cluster count onto too few or too flat a cast — an honest empty
  // reading, not a guess.
  const kindsOf = (sn) => {
    const src = appCtx.sourceBySn ? appCtx.sourceBySn(sn) : null;
    const doc = src && docOf(src);
    if (!doc) return { k: 0, kinds: [] };
    try { return detectKinds(doc); } catch { return { k: 0, kinds: [] }; }
  };

  // surfAtFraction(sn, frac) → surfAt resolved from a 0..1 SCROLL fraction rather than a sentence
  // index — the reading map's own coordinate (readerProgress), so the surface never needs to know
  // a document's sentence count just to ask "what's active roughly here."
  const surfAtFraction = (sn, frac = 0) => {
    const src = appCtx.sourceBySn ? appCtx.sourceBySn(sn) : null;
    const doc = src && docOf(src);
    const n = doc ? (doc.sentences || doc.units || []).length : 0;
    const f = Math.max(0, Math.min(1, +frac || 0));
    return surfAt(sn, Math.round(f * Math.max(0, n - 1)));
  };

  Object.assign(appCtx, { surfAt, surfAtFraction, kindsOf });
};
