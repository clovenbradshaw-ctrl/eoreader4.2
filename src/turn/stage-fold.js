// EO — one group of the turn's fold (split from turn/stages.js, 2026-07 compliance
// pass: "no file over ~250 lines" / "no 760-line orchestrator", docs/architecture.md).
// FOLD: fold → foldReading → predict (+ the chorus rev and significance options).
// The methods are VERBATIM from stages.js; stages.js assembles the groups back
// into the one named-stage map the pipeline walks. Same holon, same seams.
import { retrieveHybrid, pickRetrievalEmbedder } from '../surfer/retrieve/index.js';
import { think } from '../weave/write/index.js';
import { foldNote } from '../surfer/fold/index.js';
import { surfFold, multiLevelSurf, centroidBasis, projectUnits, structuralActivations, threadBasis } from '../surfer/index.js';
import { namedReferents, referentialConfidence } from '../perceiver/index.js';
import { referenceTarget } from './converse/index.js';
import { rereadOnUnsettled } from './reread.js';
import { recordReferenceDef } from './judgments.js';
import { RULES_REV } from '../organs/out/speech/index.js';


// The Significance column's opts for the fold's surf. Returns {} — the byte-identical
// default — unless a MEANING-measuring embedder and a centroid prior are both present.
// The async embedding work happens HERE (the fold stage is async); the surf itself
// stays a synchronous pure function fed pre-computed activations. The dominant REAL
// lens (one whose Born weight beat the spectral null) conditions the surf; absent any
// real lens, the column still rides as a report (atmosphere + lenses) with the peak
// unchanged. Degrades to {} on any embedding fault — a flaky meaning organ must never
// crash the fold.
// The CHORUS flag (surf-chorus / multi-level surf). The fold reads the document with the multi-
// level chorus surf (chorus.js / multilevel.js): the arrest is discourse-aware (the activated
// thread conditions which spans stop) and, over a composite of several sources, off-topic sources
// are dropped before their content is read, and the per-source reads are folded to a bounded stop
// set so the reading never spams the prompt. ON by default; set CHORUS_REV=0/false/off to fall
// back to the incumbent single-ride surf (the RULES_REV idiom, speech/index.js:33 — read once).
export const CHORUS_REV =
  !(typeof process !== 'undefined' && process.env && /^(0|false|off)$/i.test(process.env.CHORUS_REV || ''));



export const significanceOpts = async (ctx, anchor) => {
  if (!ctx.doc) return {};
  const emb = ctx.geometricEmbedder;
  // THE MEANING PATH (the upgrade). A live meaning-measuring embedder AND a centroid prior
  // → the embedding column: the full atmosphere/paradigm/stance read, ridden forward inside
  // the dominant lens (lens-conditioned arrest). This is the richest reading and unchanged.
  if (ctx.centroids && emb?.measuresMeaning && typeof ctx.doc.sentenceEmbeddings === 'function') {
    const basis = centroidBasis(ctx.centroids);
    if (basis) {
      try {
        const vectors = await ctx.doc.sentenceEmbeddings(emb);
        const activations = projectUnits(vectors, basis);
        const report = surfFold(ctx.doc, anchor, { activations, prior: basis, lensReport: true });
        const dom = report.lenses?.find(l => l.real)?.lens ?? report.lenses?.[0]?.lens ?? null;
        return { activations, prior: basis, lensReport: true, atmosphere: true, paradigm: true, stance: true,
                 alpha: ctx.alpha ?? 0.05, ...(dom ? { lens: dom } : {}) };
      } catch { /* fall through to the structural default — never a dark fold */ }
    }
  }
  // THE STRUCTURAL DEFAULT (the embedder-free column, surfing-next.md §2). ρ from the
  // OPERATOR PROFILES (structure-basis.js) — read off the log, no model — so the column
  // (lenses, lensEntropy, stance) lights up on EVERY turn, not only when a meaning model
  // is loaded. Conservative by construction: the dominant lens is NOT passed, so the surf
  // is not lens-conditioned and `stops`/`peak` (the fields the answer rides) stay
  // byte-identical to the no-significance surf. Lens-conditioned arrest on this basis is
  // the follow-on, bench-validated before it changes the reading. The stance it computes
  // is what the veto battery now reads (the surfer's own confabulation guard, §3).
  try {
    const { activations, signs } = structuralActivations(ctx.doc);
    if (!activations.length || !activations.some(v => v.some(x => x > 0))) return {};
    // `alpha` is deliberately NOT passed: it would flip the cursor axis from the median
    // rule to the derived VOID boundary (surf.js `useBoundary`), changing which cursors
    // arrest — a reading change for the bench-gated follow-on, not here. The significance
    // pass falls back to its own internal 0.05 for the lens/stance nulls, so the column is
    // fully measured while the arrest stays byte-identical.
    return { activations, signs, lensReport: true, stance: true };
  } catch { return {}; }
};


export const STAGES = {

  // Fold the spans into a single note the model can read — the reading. With a doc
  // this is the consciousness: existence + structure + significance. The cursor is no
  // longer blindly the top lexical hit — the SURFER (docs/surfing-the-fold.md) is
  // seeded at that anchor and steps down the Bayesian-surprise gradient to the PEAK,
  // where the significance reading is taken. Any high-significance line retrieval
  // missed is folded in as a citable span (via:'surf', its index real), so it is both
  // read by the consciousness and bindable.
  async fold(ctx) {
    const folded = await STAGES.foldReading(ctx);
    // THE ACTIVE-INFERENCE RE-READ (surfing-next.md §3, opt-in via ctx.reread). When the surf
    // could not SETTLE on a figure at the peak (the stance-reserve guard) on a pointed
    // question, read more of the document on the figure the reading circled and fold AGAIN
    // from the wider evidence — `inquire`'s loop brought in-turn, bounded to one extra pass.
    // Inert unless the caller opts in, so the default turn is byte-identical to foldReading.
    if (!ctx.reread || !folded.surf) return folded;
    const re = pickRetrievalEmbedder(ctx);
    const widened = await rereadOnUnsettled({
      doc: ctx.doc, spans: folded.spans, surf: folded.surf, task: ctx.task,
      referential: folded.referential,        // the diffuse-coref trigger (the live one on the default path)
      query: ctx.retrievalQuery || ctx.question,
      retrieve: (q, k) => retrieveHybrid(ctx.doc, q, re, k),
    });
    if (!widened.added) return folded;
    const refolded = await STAGES.foldReading({ ...ctx, spans: widened.spans });
    return { ...refolded, rereadInfo: { added: widened.added, asked: widened.asked } };
  },

  // The reading proper — fold the spans into the note (the surf + significance column). Split
  // out from `fold` so the re-read can run it twice: once on the retrieved spans, once on the
  // widened set. Byte-identical to the former fold body.
  async foldReading(ctx) {
    if (!ctx.spans?.length) return { ...ctx, note: null };
    // Reference by reading (RULES_REV, docs/reference-by-reading.md §2–§3). The turn's
    // DEF target is read off the CONVERSATION CAST — the warmest figure the conversation
    // holds, with retrieval nominating a document referent beside it — and the document
    // surf is seeded at that referent's LOCUS (localeOf), the one hop from the warm
    // referent to where the document establishes it. So "his name" lands on the line
    // that NAMES the figure, which the word "name" never reaches by similarity. Flag
    // off: the anchor is the top retrieval hit and the focus is the named referents of
    // the question, exactly as before — byte-identical, the read path is dark.
    const refTarget0 = RULES_REV ? referenceTarget(ctx.doc, ctx.history, ctx.question, ctx.spans) : null;
    // CAST CYCLE — EVA (cast.js, docs/source-activation.md). When a session cast is threaded,
    // let it evaluate which referent THIS turn concerns: the live read wins when it resolves;
    // only a NULL live read carries forward a referent the conversation has SETTLED and is still
    // holding — so a thin follow-up stays on the thing being discussed instead of the anchor
    // degrading to the loudest retrieval hit. Null cast → refTarget0 unchanged (byte-identical).
    const refTarget = ctx.cast
      ? ctx.cast.evaluate({ doc: ctx.doc, history: ctx.history, question: ctx.question, refTarget: refTarget0 })
      : refTarget0;
    const anchor = (refTarget?.locale ?? ctx.spans[0]?.idx) ?? 0;
    // THE SIGNIFICANCE COLUMN (significance-column spec). When a meaning-measuring
    // embedder AND a centroid prior are present, the surf rides the full column: it
    // registers the document's interpretive Atmosphere, decomposes its Lenses, and
    // rides forward INSIDE the dominant reading (lens-conditioning) so the peak lands on
    // that reading's surprise rather than the document's loudest overall. Inert under
    // the hash embedder (a cosine between spelling-space and MiniLM-space measures
    // nothing — the same firewall the geometric classifier runs), so `sigOpts` is `{}`
    // there and the surf is byte-identical to today. This is the column improving the
    // chat only where it can honestly measure, and staying dark where it cannot.
    const sigOpts = await significanceOpts(ctx, anchor);
    // THE CHORUS / MULTI-LEVEL SURF (CHORUS_REV, chorus.js + multilevel.js). Off (the default)
    // → the incumbent single-ride surf, byte-identical. On → the activated thread (the question
    // + recent turns + cast, threadBasis) conditions a chorus of rides, and over a composite the
    // sources are surfed high-level first and only the relevant ones read for content. Gated so
    // an empty thread (no words to be relevant to) never opts in — it degrades to today's surf.
    const thread = (CHORUS_REV && ctx.doc)
      ? threadBasis({ query: ctx.question, history: ctx.history || [], doc: ctx.doc })
      : null;
    const useChorus = thread && (((thread.terms && thread.terms.size) || (thread.figures && thread.figures.size)));
    const surf   = ctx.doc
      ? (useChorus ? multiLevelSurf(ctx.doc, anchor, { ...sigOpts, chorus: thread }) : surfFold(ctx.doc, anchor, sigOpts))
      : null;

    let spans = ctx.spans;
    if (surf) {
      const units = ctx.doc.units || ctx.doc.sentences || [];
      const have  = new Set(spans.map(s => s.idx));
      const surfed = surf.stops
        .filter(idx => !have.has(idx) && units[idx] != null)
        .map(idx => ({ idx, text: units[idx], score: 0, via: 'surf' }));
      if (surfed.length) spans = [...spans, ...surfed];
    }

    const cursor = surf ? surf.peak : anchor;
    // The referents the message named (if any). When it names one, the fold centres
    // the structured reading on that referent — everything tied to it, coref
    // collapsed — instead of the figures the surfed window happened to cross.
    //   Reference by reading (RULES_REV): the referent is READ off the conversation
    //   cast (refTarget), so a pronoun / definite description / correction centres the
    //   reading on the figure it refers to, not only one the question names by surface
    //   form. Flag off: the question's named referents, exactly as before.
    const focus  = refTarget ? [refTarget.id] : (ctx.doc ? namedReferents(ctx.doc, ctx.question) : []);
    // The RICH NOTES path rides behind RULES_REV (rich-notes §6): with the flag off the
    // fold is byte-identical (flat arrows + significance summary); with it on the note
    // is projected through the reading substrate (settled · held-open · turns), and the
    // surfer's located RECs feed the turns group, so the Significance face the flat
    // notes drop reaches the talker.
    const note   = foldNote(spans, { doc: ctx.doc, cursor, focus, surf: RULES_REV ? surf : null, grouped: RULES_REV });
    // Pattern: if the basis itself was defeated (a measured Paradigm REC), the note
    // records a REFRAME, not a deeper read — append-only, carrying its surprise-delta
    // (the helix turning: REC re-admits what counts as ground). Off the dark path
    // (no surf.paradigmRec) the note is untouched.
    if (note && surf?.paradigmRec) note.reframed = surf.paradigmRec;
    // The reader's confidence about WHO this passage concerns — read off the
    // grounded coref posterior at the cursor (the same field the fold rode). No
    // longer measured and discarded: it rides the turn, and a diffuse field
    // (no dominant referent) becomes a flag in the veto battery.
    const referential = ctx.doc?.corefField
      ? referentialConfidence(ctx.doc.corefField.fieldGrounded(cursor))
      : null;
    // Route the reference verdict onto the judgment log as a DEF — a concentrated field
    // CORROBORATES the referent, a split one abstains (INDETERMINATE). Best-effort; the log
    // never costs the answer.
    try { recordReferenceDef(ctx.judgments, referential); } catch { /* logging is best-effort */ }
    // CAST CYCLE — REC (cast.js). Commit this turn's target as SETTLED only when the fold
    // CONCENTRATED (referential.concentrated), so the carried state holds only referents a
    // reading actually landed on; a diffuse, wandering fold commits nothing.
    const cast = ctx.cast
      ? ctx.cast.reconcile({ id: refTarget?.id ?? null, label: refTarget?.label ?? null,
                             locale: refTarget?.locale ?? null, concentrated: referential?.concentrated === true })
      : null;
    return { ...ctx, spans, note, surf, focus, referential, refTarget, castStep: cast };
  },

  // The PREDICTION — the engine's own grounded generation, before the talker speaks
  // (docs/answer-expectation.md). The mechanical writer (src/write `think`) says, from the
  // graph alone, what it would answer; that draft is the prior the fluent answer is checked
  // against. We read only its CONTENT — the named figures the grounded reading centers on —
  // not its surface: the mechanical SURFACE is corpus-dependent (learned conventions, often
  // telegraphic), but WHICH figures it is about is read straight off the log, so it is a
  // reliable content prediction even when the prose is clumsy. A confident grounded reading
  // that centers on a named figure the talker then drops is an under-answer (the mirror of a
  // confabulation). Fully guarded: a clumsy predictor must never break the answer.
  async predict(ctx) {
    if (!ctx.doc || !ctx.spans?.length) return ctx;
    try {
      const cursor = ctx.surf?.peak ?? ctx.spans[0]?.idx ?? 0;
      const t = think(ctx.doc, { cursor, genders: ctx.genders || {} });
      const draft = String(t?.voiced || '');
      const labelOf = (id) => ctx.doc.admission?.labelOf?.(id) || id;
      const entities = [...new Set(namedReferents(ctx.doc, draft).map(labelOf))];
      // the figure the grounded reading centers on: the fold's focus when it resolved one,
      // else the strongest figure the mechanical draft named.
      const focusId = ctx.focus?.[0] ?? null;
      const primaryName = focusId != null ? labelOf(focusId) : (entities[0] || null);
      const confident = !!ctx.referential?.concentrated;
      const prediction = { draft, entities, primaryName, confident };

      // The FORM prediction, from the sample-answer library (turn/shape.js): read the wanted
      // shape off the question's nearest sample answers. Embedder-gated — a cosine is meaning
      // only under a meaning-measuring embedder — and inert without a threaded library, so the
      // default turn is byte-identical. The question's embedding rides to `veto`, where the
      // talker's answer is scored against this shape.
      let shapeTarget = null, shapeQueryVec = null;
      if (ctx.shapeLibrary) {
        const emb = pickRetrievalEmbedder(ctx);
        if (emb?.measuresMeaning && emb.isWarm?.()) {
          try {
            shapeQueryVec = await emb.embed(ctx.question);
            shapeTarget = ctx.shapeLibrary.selectForQuestion(shapeQueryVec);
          } catch { /* a clumsy predictor must never break the answer */ }
        }
      }
      return { ...ctx, prediction, shapeTarget, shapeQueryVec };
    } catch { return ctx; }
  },
};
