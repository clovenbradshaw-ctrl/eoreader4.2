// EO — one group of the turn's fold (split from turn/stages.js, 2026-07 compliance
// pass: "no file over ~250 lines" / "no 760-line orchestrator", docs/architecture.md).
// BIND: bind → factcheck (+ the locus terrain reader).
// The methods are VERBATIM from stages.js; stages.js assembles the groups back
// into the one named-stage map the pipeline walks. Same holon, same seams.
import { siteTerrainAt } from '../surfer/index.js';
import { siteIndices } from '../perceiver/index.js';
import { bindCitations, renderBound } from '../enactor/ground/index.js';
import { recordBindingDefs, recordCorrespondenceDefs } from './judgments.js';
import { RULES_REV } from '../organs/out/speech/index.js';
import { projectGraph, VERDICTS } from '../core/index.js';
import { factCheck, auditPropositions } from '../enactor/factcheck/index.js';


// The Site-face terrain the reading typed at the answer locus, for the diagonal guard.
// The guard itself is general over all nine terrains (factcheck/correspond.js: terrainInfo →
// domain+grain, grain the discriminator); it was only ever FED a corner of the face. Now it
// gets the real terrain, typed off the locus's operators (surfer/terrain.js) — a bonded locus
// is a Link, a bare figure an Entity, an interpretive locus a Lens — so the off-diagonal
// verdict records the true Site, and a grain-mismatched claim is caught against whichever of
// the nine the locus actually is, not a hardcoded Entity. The two authorities the engine has
// already MEASURED still win: a measured void is Void (the confabulation guard's Void signal),
// and a DEF'd site (boilerplate / furniture, read/site.js) is ambient Atmosphere. A
// contentless locus that was NOT measured void is not downgraded to Void here (the measured
// void is the only Void authority) — it falls back to Entity, exactly as before.
const terrainAtLocus = (ctx, cursor) => {
  if (ctx.voidMeasure) return 'Void';
  if (cursor != null && Number.isFinite(cursor) && ctx.doc && siteIndices(ctx.doc).has(cursor)) return 'Atmosphere';
  if (cursor == null || !Number.isFinite(cursor) || !ctx.doc) return 'Entity';
  const t = siteTerrainAt(ctx.doc, cursor);
  return (t === 'Void' || t === 'Field') ? 'Entity' : t;   // only a MEASURED void is Void
};

// The recognition-free stand-in for the orientation's "filename" slot. An uploaded FILE
// keeps its name (`docId`, set from the file name). But a WEB source's docId is an opaque
// content-hash (`web-df554d79bc5d5a1f`), and a COMPOSITE's docId is those hashes joined with
// " + " (organs/in/composite.js) — internal identifiers, not anything the reader ever "saw".
// Handed to the talker as a filename they are pure noise: the model tries to parse a wall of
// hashes it can make no sense of. So a composite reduces to a COUNT of its sources ("29
// sources"), and a lone web page to its HOST ("en.wikipedia.org") — the domain is a
// filename-grade descriptor, recognition-free, never the page TITLE that §3 keeps out of the
// content prompt. Everything else falls back to docId, exactly as before.

export const STAGES = {

  // Mechanical citation binding. The model never wrote [sN]; we do.
  // Without spans we skip binding — the raw output is the answer.
  async bind(ctx) {
    if (!ctx.spans?.length) {
      return { ...ctx, bound: [], answer: String(ctx.rawOutput || '').trim(), sources: [] };
    }
    // THE ARCHON'S RECORD (docs/archon-source-gate.md). On the strict path every shipped sentence
    // was already admitted with its witnessing spans (ctx.sourced), so the answer is assembled
    // straight from that record — each sentence carries the FULL set of its ≥2 witnesses as [sN]
    // tags — bypassing the lexical binder, which yields only ONE witness per claim and cannot
    // express the ≥2-citation requirement. Every non-strict turn (ctx.sourced absent) falls through
    // to the binder below, byte-identical.
    if (Array.isArray(ctx.sourced) && ctx.sourced.length) {
      const bound = ctx.sourced.map((s) => ({
        claim: s.text, citation: s.citations?.[0] ?? null, citations: s.citations || [], verbatim: false,
      }));
      const answer = ctx.sourced
        .map((s) => `${s.text}${(s.citations || []).map((c) => `[${c}]`).join('')}`)
        .join(' ');
      const sources = [...new Set(
        ctx.sourced.flatMap((s) => (s.citations || []).map((c) => parseInt(String(c).slice(1), 10)))
          .filter(Number.isFinite)
      )];
      return { ...ctx, bound, answer, sources };
    }
    // The binder rides the same reading the fold sat on: the document for idf,
    // the surfer's peak (the cursor the significance reading was taken at) for
    // the γ-field tilt. Both are priors — with no doc they flatten and binding
    // is the old lexical overlap.
    const cursor = ctx.surf?.peak ?? ctx.spans[0]?.idx ?? 0;
    // Bind PER PARAGRAPH so the draft's blank lines survive into the answer —
    // renderBound joins claims with a space, which would flatten the paragraph
    // loop's structure (and any one-shot draft that used blank lines). A draft
    // with no blank line is one paragraph: byte-identical to binding it whole.
    const paras = String(ctx.rawOutput || '').split(/\n[ \t]*\n+/).map(p => p.trim()).filter(Boolean);
    const boundParas = paras.map(p => bindCitations(p, ctx.spans, { doc: ctx.doc, cursor }));
    const bound = boundParas.flat();
    // Mark the zero-contact claims — a grounded answer wears its provenance at claim
    // grain, so an unsourced sentence can no longer read as sourced (bind.js UNSOURCED_MARK).
    const answer = boundParas.map(p => renderBound(p, { mark: true })).join('\n\n');
    const sources = [...new Set(
      bound.filter(b => b.citation).map(b => parseInt(b.citation.slice(1), 10))
    )];
    // The binding DEF is recorded at the `factcheck` seam, not here: the typed-cut binding
    // (turn/judgments.js) reads the PREDICATE cut off the correspondence verdict, which only
    // exists after factcheck types the claim against the sources' edges. bind just carries the
    // presence/argument signal (each bound claim's verbatim/refs/ruledOut) forward on `bound`.
    return { ...ctx, bound, answer, sources };
  },

  // Contrast the talker's propositional assertions against the document graph.
  // (factcheck/correspond.js) We do NOT gate what the model may say — it can answer
  // from its own memory — because every claimed RELATION is adjudicated here against
  // the reading the fold built: corroborated (it matches a document edge, and EARNS
  // that edge's citation), contradicted (a carved VOID or a disjoint axiom denies it
  // — the libel-grade catch), unsupported (no witness — it rides, flagged),
  // indeterminate (cannot be measured — held). The verdicts flow into
  // ctx.edgeVerdicts, which the veto battery already reads. Flag-and-tell: the answer
  // is never gagged here. The symbolic relation algebra runs embedder-free, so a
  // disjoint-kinship contradiction fires even under the hash organ; the geometric
  // verdicts need a live classifier and otherwise degrade to indeterminate (held).
  // Skipped in chat mode (no doc) and after a measured void (terminate short-circuit).
  async factcheck(ctx) {
    if (!ctx.doc || !ctx.rawOutput) return ctx;
    const cursor = ctx.surf?.peak ?? ctx.spans?.[0]?.idx ?? Infinity;
    const graph  = projectGraph(ctx.doc.log, { cursor });
    const fc = await factCheck({
      prose: ctx.rawOutput, doc: ctx.doc, graph, cursor,
      classifier: ctx.classifier || null, adjacency: ctx.adjacency || null,
      // P1: the Site-face terrain at the answer locus, for the diagonal guard. A
      // measured void rides as Void; this is what turns a specific claim made over an
      // absence into an OFF_DIAGONAL verdict the veto battery can tag.
      terrain: terrainAtLocus(ctx, cursor),
      // §4 (behind RULES_REV): the change-of-state object-functional clash — Gregor, not
      // the father, underwent the transformation. Off by default → byte-identical.
      changeOfState: RULES_REV,
    });
    // A claim the GRAPH corroborates earns the cited sentence even when the model
    // spoke from memory: fold those citations into the answer's sources, de-duped.
    const earned = (fc.citations || [])
      .map(c => parseInt(String(c).slice(1), 10)).filter(Number.isFinite);
    const sources = earned.length ? [...new Set([...(ctx.sources || []), ...earned])] : ctx.sources;

    // Feed an edge-corroboration back into the per-claim BIND. The lexical binder cites on
    // surface overlap with a single span; a kinship claim ("Gregor's sister is Grete") whose
    // witness sentence shares few words stays uncited there, so unbound-contact / low-coverage
    // (ground/veto.js — both read `bound`, not the edge verdicts) fire on a correct, graph-
    // witnessed answer. When the factcheck corroborated a claim against a document edge, attach
    // that edge's citation to the matching bound claim, so the answer reads as grounded where
    // the GRAPH grounds it — not only where lexical overlap did. Only fills an UNcited claim
    // (a real lexical citation is never overwritten); when nothing matches, bound is untouched.
    let bound = ctx.bound, answer = ctx.answer;
    if (Array.isArray(ctx.bound) && ctx.bound.length) {
      const corro = (fc.claims || []).filter(c => c.verdict === VERDICTS.CORROBORATED && c.citation && c.sentence);
      if (corro.length) {
        const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        let changed = false;
        bound = ctx.bound.map(b => {
          if (b.citation) return b;
          const hit = corro.find(c => { const cs = norm(c.sentence), bs = norm(b.claim); return cs && bs && (bs.includes(cs) || cs.includes(bs)); });
          if (!hit) return b;
          changed = true;
          return { ...b, citation: hit.citation, edgeGrounded: true };
        });
        if (changed) answer = renderBound(bound, { mark: true });
        else bound = ctx.bound;
      }
    }
    // The PROPOSITION channel (the DEF/claim-grain sibling of the edge veto above).
    // claimedEdges is edges-only, so a single-argument predication — "O'Connell is a
    // council member" — produces no edge and is never graded; a stale exclusive office
    // survives even when the sources say "Mayor O'Connell". This evaluates every DEF
    // proposition the answer asserts against the sources' own DEF props read at the
    // cursor where each sits, and flags a superseded/stale office. Flag-and-tell, never
    // refusing: its corrections ride out as flags, the answer is never gagged. Pure and
    // additive — it touches neither the edge verdicts the veto battery reads nor `refuse`.
    let propositions = null;
    try { propositions = auditPropositions({ prose: ctx.rawOutput, doc: ctx.doc, cursor, now: ctx.now || null }); }
    catch { propositions = null; }
    // Route the correspondence verdict onto the judgment log — a DEF per proposition at the
    // predication grain, the verdict factcheck typed against the sources' own edges.
    try { recordCorrespondenceDefs(ctx.judgments, fc.claims); } catch { /* logging is best-effort */ }
    // Route the binding verdict onto the log — a DEF per claim at the CLAIM grain, its witness the
    // presence/argument/predicate CUT decomposition (turn/judgments.js). The predicate cut reads
    // the correspondence verdict just computed; the argument cut reads the fold's referential
    // (a diffuse subject suspends the argument, never guesses a sense). A claim ships CORROBORATED
    // only when its witness ENTAILS it (Invariant B1). Recorded on the post-factcheck `bound` so an
    // edge-grounded claim carries its citation into the presence cut.
    try { recordBindingDefs(ctx.judgments, bound, { referential: ctx.referential, correspondence: fc.claims }); }
    catch { /* logging is best-effort */ }
    return { ...ctx, edgeVerdicts: fc.edgeVerdicts, factcheck: fc, propositions, sources, bound, answer };
  },
};
