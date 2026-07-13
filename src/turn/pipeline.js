// EO: SYN·CON(Network,Field → Network,Entity, Composing,Binding) — runTurn — the pass composition
// runTurn — the turn is a fold of its named stages.
//
// stages.reduce(...) over the pipeline list; each stage takes a context
// and returns a context; a stage returning {terminate:true} short-
// circuits the rest. The audit's step entry is the projection of that
// fold via the onStep callback — there is no parallel bookkeeping to drift.
//
// Same spine, two levels:
//   document = fold of the event log → projectGraph
//   turn     = fold of the stage list → audit log
//
// Vetoes are flag-only here too: the answer is the model's text, the
// vetoes ride alongside as `flags`.

import { stages } from './stages.js';
import { stageFace } from './stage-faces.js';
import { createJudgmentLog } from '../core/def.js';
import { proposeWebSearch } from './propose.js';
import { createCompositeDoc } from '../organs/in/index.js';
import { siteTerrainAt } from '../surfer/index.js';
import { assembleBrief } from '../weave/write/index.js';
import { reflectAnswer } from '../enactor/ground/reflect.js';
import { senseReturn, commitVoice } from '../enactor/selfline.js';
import { describeModel } from '../model/interface.js';

// The documents a turn's citations actually drew on. For a composite (several selected
// documents folded into one), map each cited sentence index back through the provenance
// axis to its source document; for a single document it is just that document.
const sourceDocsOf = (doc, sources) => {
  if (!doc) return [];
  if (doc.isComposite && typeof doc.origin === 'function')
    return [...new Set((sources || []).map(i => doc.origin(i)?.docId).filter(Boolean))];
  return doc.docId ? [doc.docId] : [];
};

// Per-CLAIM attribution: each cited sentence index → the source document it came from. Where
// sourceDocsOf collapses to the set, this keeps the index→source map so the UI can attribute every
// [sN] in the answer to its specific origin (the EO_Reader sentenceSource model). { idx: docId }.
const citeOriginsOf = (doc, sources) => {
  const out = {};
  if (!doc) return out;
  const composite = doc.isComposite && typeof doc.origin === 'function';
  for (const i of (sources || [])) {
    const id = composite ? doc.origin(i)?.docId : doc.docId;
    if (id != null) out[i] = id;
  }
  return out;
};

// Per-citation source TEXT: each cited sentence index → the sentence itself, so the UI
// can show, on hover, exactly what the cited span allegedly says — the companion of
// citeOriginsOf's idx → docId. { idx: text }.
const citeTextsOf = (doc, sources) => {
  const out = {};
  if (!doc) return out;
  const units = doc.units || doc.sentences || [];
  for (const i of (sources || [])) {
    const t = units[i];
    if (t != null) out[i] = String(t).replace(/\s+/g, ' ').trim().slice(0, 280);
  }
  return out;
};

const round3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

// The surf's reading PATH — the walk the surfer took, assembled human-auditable. surfFold
// (surfer/surf.js) reports its route as bare cursor indices (anchor · stops · peak); to AUDIT
// the surf, not merely count its stops, the reader needs the walk itself: the ordered cursors
// it arrested on, each with the sentence read there and the Bayesian surprise that stopped it.
// The anchor (where retrieval set the surfer down), every stop (a surprise peak or a broken
// frame), and the field peak — deduped, in reading order. Pure and capped, so it rides both the
// live thinking trail (fold-narrative.js) and the JSONL audit without bloat. `units[idx]` IS the
// sentence text (enactor/basis.js reads the surf the same way).
export const buildSurfPath = (surf, doc) => {
  if (!surf) return [];
  const units = doc?.units || doc?.sentences || [];
  const bayesByIdx = new Map((surf.field || []).map(f => [f.idx, f.bayes]));
  const stops = Array.isArray(surf.stops) ? surf.stops : [];
  const { anchor, peak } = surf;
  const idxs = [...new Set([anchor, ...stops, peak])]
    .filter(i => Number.isInteger(i) && i >= 0)
    .sort((a, b) => a - b);
  return idxs.slice(0, 12).map((idx) => {
    const raw = units[idx];
    const text = String((typeof raw === 'string' ? raw : raw?.text) || '')
      .replace(/\s+/g, ' ').trim().slice(0, 220);
    return {
      idx,
      bayes: round3(bayesByIdx.has(idx) ? bayesByIdx.get(idx) : 0) ?? 0,
      text,
      anchor: idx === anchor,
      peak: idx === peak,
      stop: stops.includes(idx),
    };
  });
};

// The MECHANICAL reading, assembled for the audit: every piece that came through between the
// question and the phrase. The spans the surfer/retrieval delivered (idx + text + how it was
// found + score), the surfer's own per-cursor field (the surprise/warmth trace, its peak and
// frame-break stops — what the surfer "gets back mechanically"), and the fold's assembled note
// (the reading the phraser was handed). Sizes capped so one turn cannot bloat the JSONL.
const buildReading = (ctx) => {
  if (!ctx.spans?.length && !ctx.surf && !ctx.note) return null;
  return {
    spans: (ctx.spans || []).slice(0, 40).map(s => ({
      idx: s.idx, via: s.via || s.kind || null, score: round3(s.score),
      // the cube SITE this locus IS — read off its operators (Link if it carries a bond,
      // Entity if a bare figure, Void if thin). The Structure row is now typed, not collapsed.
      terrain: (ctx.doc && Number.isFinite(s.idx)) ? siteTerrainAt(ctx.doc, s.idx) : null,
      text: String(s.text || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    })),
    note: ctx.note?.text ? String(ctx.note.text).slice(0, 2000) : null,
    surf: ctx.surf ? {
      anchor: ctx.surf.anchor, peak: ctx.surf.peak,
      stops: ctx.surf.stops, recCursors: ctx.surf.recCursors,
      rode: ctx.surf.rode,
      field: (ctx.surf.field || []).slice(0, 80).map(f => ({
        idx: f.idx, focus: f.focus, bayes: round3(f.bayes), surprisalBits: round3(f.surprisalBits),
      })),
    } : null,
    inquiry: ctx.inquiry?.asked?.length ? ctx.inquiry.asked : null,
    // WHAT THE LLM WOULD BE TOLD — the whole pipeline assembled into the talker's payload:
    // thread salience → adaptive surf → salient edges → EO-enriched RDF-star → the realization
    // prompt. Recorded so the audit shows not just what was read but exactly what a talker
    // would be handed (system + user), and the structure behind the selection.
    llm: ctx.doc ? llmBrief(ctx) : null,
  };
};

// the LLM-facing brief for the audit — assembled from the doc and the activated thread, with
// any fault degrading to null rather than sinking the turn record.
//
// It is handed the surf the turn ALREADY did (the fold stage's ctx.surf) so it reconstructs the
// brief from that rather than re-surfing the whole document from scratch. Without this, assembleBrief
// runs an adaptive surf that reads readingAt at every unit — O(S) — which on a large document (a big
// source, or several fetched pages folded in) takes tens of seconds AFTER the answer is already done,
// so the turn appears to hang between `self` and the record's completion. Reusing ctx.surf keeps this
// diagnostic effectively free and faithful to what was actually read (assemble.js).
const llmBrief = (ctx) => {
  try {
    const b = assembleBrief(ctx.doc, { question: ctx.question, history: ctx.history, surf: ctx.surf });
    // Bounded like every other audit field: the ring holds hundreds of turns, and an
    // unbounded second copy of the whole assembled prompt per turn is session-long growth.
    const clip = (s, n) => (s == null ? s : String(s).slice(0, n));
    return { system: clip(b.prompt.system, 4000), user: clip(b.prompt.user, 4000), focus: b.surf.focus, thread: b.thread, draft: clip(b.draft, 4000) };
  } catch { return null; }
};

// route → converse → retrieve → fold → answerable → prompt → llm → bind → factcheck → revise → veto → settle.
// `converse` (the session fold) sits right after `route`, before retrieval — it runs
// for both grounded and chat turns and is independent of the document. The mechanical
// short-circuits (smalltalk, math) terminate at `route` and never reach it; they need
// no history. `factcheck` sits between `bind` and `veto`: it contrasts the talker's
// propositional assertions against the document graph and deposits the per-claim
// verdicts the veto battery reads (the answer is never gagged — flag-and-tell).
// `revise` sits between `factcheck` and `veto`: when the diagonal guard caught the
// confabulation proper (a specific claim at a measured void), it re-prompts the talker
// once; a surviving confabulation ships, tagged by the veto (rewrite-then-tag).
// `inquire` sits between `retrieve` and `fold`: gated by ctx.inquire (default off →
// byte-identical), it reads another pass on the engine's OWN open question — a figure the
// retrieved spans keep mentioning but that never acts — and folds the results in as citable
// spans before the fold builds the reading (turn/stages.js, write/think.js).
// `reason` sits between `gate` and `prompt`: the reasoning walk (src/reason) commits its
// SYN/CON/REC steps to the document's log on an OPEN turn (explain / compose) only, after the
// answerability floor has had its chance to refuse — a gated turn terminates and the walk is
// never run — and before the prompt reads the graph the walk just grew.
// `absence` sits between `veto` and `settle`: the void reaching the voice (the honesty
// seam). When the field measured an absence and the answer, after bind + factcheck +
// revise, still earned no witness at all, the typed absence the measurement rendered
// replaces the unwitnessed draft — preserved beside it in `revisions`, never erased.
// `validate` sits between `absence` and `settle`: the model-prompt check ("does this
// sound right?"). Opt-in (ctx.validate; default off → byte-identical). Where `absence`
// gates on a MEASURED void, `validate` gates on the residual the void measure never sees —
// retrieval returned tangential spans (no void), yet the answer earned no witness and shares
// only the passages' vocabulary. It asks the reader to judge its own draft against the lines
// and, on a clear "not supported", replaces the unwitnessed draft with an honest absence.
const PIPELINE = [
  'route', 'expect', 'converse', 'retrieve', 'inquire', 'fold', 'predict', 'answerable', 'gate', 'reason', 'prompt', 'llm', 'bind', 'factcheck', 'revise', 'veto', 'absence', 'validate', 'settle',
];

// `classifier`/`adjacency` are the geometric organ the edge-grounding fact-check needs
// for its meaning-distance verdicts; threaded through like `embedder`, optional, and
// degrading honestly to the embedder-free symbolic algebra when absent.
export const runTurn = async ({ question, doc, docs, model, embedder, geometricEmbedder, classifier, adjacency, centroids, auditLog, onStep, history = [], grounding = 'auto', stream = false, onToken = null, alpha, mindSpans = null, inquire = false, horizon = null, cast = null, reread = false, witnessSource = null, shapeLibrary = null, groundGraph = false, broadcastArc = false, now = null, lensPort = false, voicePref = null, signal = null, maxTokens = null, longform = false, monitor = null, ledger = null, validate = false }) => {
  // Ground against a SELECTED SET of documents when one is given: several parsed docs
  // are folded into one composite doc (organs/in/composite.js) the pipeline reads as a
  // single document — referents stay distinct per source unless cross-doc SYN'd. A
  // single doc passes through untouched; the legacy `doc` argument still works.
  const groundingDoc = (Array.isArray(docs) && docs.length) ? createCompositeDoc(docs) : (doc || null);
  // The ORIGINAL source docs, before compositing — kept on the ctx so the route stage can
  // reach a table's addressable cells (records/columns/column()). The composite flattens
  // every doc to prose row-lines for retrieval; a COMPUTATION over a table (the data room's
  // answerTable) needs the typed cells themselves, which only the pre-composite doc carries.
  const sourceDocs = (Array.isArray(docs) && docs.length) ? docs : (doc ? [doc] : []);
  const turn      = auditLog.turn(question);
  // Print the faces (docs/spec-good-watchmaker.md, migration step 1): every stage
  // carries its canonical notate(event) spelling — operator(Site, Stance) — beside
  // its human label, so the Site and Stance faces are visible in the trace and not
  // just the Act label. `stageFace` returns null for the pipeline's book-keeping
  // steps (error/reflect/propose-web), which are not cube stages and stay unspelled.
  const stepFan   = (name, ctx, ms) => {
    const data = summarize(name, ctx, ms);
    const face = stageFace(name);
    if (face) { data.eo = face.notation; data.faces = face.cells; }
    turn.step(name, data);
    onStep?.(name, ctx, data);
  };
  // `geometricEmbedder` is the MiniLM organ; the retrieve stage reads it for the
  // semantic channel when it is live, and falls back to `embedder` (the hash organ)
  // otherwise. Threaded like `classifier` — optional, degrading honestly when absent.
  // `stream`/`onToken` arm the streaming-answer path (turn/stages.js `llm`,
  // docs/streaming-answer.md): a grounded turn realises its answer one sentence per
  // surfer stop and emits tokens through `onToken` as they decode. Off by default —
  // the present one-shot path is byte-identical when `stream` is false.
  // `centroids` is the significance prior (the 27-cell centroid bundle). When present
  // alongside a meaning-measuring `geometricEmbedder`, the fold's surf rides the full
  // Significance column (Atmosphere · Lens · Paradigm); absent either, the column is
  // dark and the surf is byte-identical to today. Injected, never imported, so the
  // surfer stays acyclic.
  // `mindSpans` is the read corpus's contribution (src/mind) when the user has the
  // Mind chip in WEAVE mode: provenance-tagged lines woven into the prompt as labelled
  // background. Null on every default turn, so the prompt — and the golden parses — are
  // byte-identical unless the user opts in. The mind stays epistemically separate: these
  // are offered as background, never folded into the document's citable spans.
  // `inquire` arms the self-directed inquiry stage (turn/stages.js `inquire`, write/think.js):
  // when on, a grounded answer turn reads another pass on the engine's OWN open question
  // before answering. Off by default → byte-identical.
  // `horizon` is the SESSION's persistent Horizon (surfer/horizon.js) — the moved density
  // operator that accumulates across turns (surfing-next.md §4). When the caller threads one
  // (created once per session), the `settle` stage folds this turn's reading into it, so the
  // conversation grows an interpretive state instead of re-deriving one each turn. Null on a
  // default turn → settle is byte-identical and the surf stays stateless, as today.
  // `reread` arms the in-turn active-inference re-read (turn/reread.js, surfing-next.md §3):
  // when the surf could not settle on a figure (stance-reserve) on a pointed turn, the fold
  // reads more of the document on the circled figure and folds again. Off by default — the
  // present single-pass fold is byte-identical when `reread` is false.
  // `witnessSource` is an optional EXAFFERENT corpus (a parsed source doc) the veto stage
  // retrieves from to confirm an interpretation: when the grounding doc is the model's own
  // notes (reafference) and the answer rests only on them, the engine fetches the source spans
  // on the claim's figures and re-checks. Null → no seeking, byte-identical.
  // `signal` is the turn's AbortSignal (the Stop button). Threaded into ctx so the `llm`
  // stage can hand it to the backend, which halts the decode and returns the partial answer;
  // an aborted `llm` then short-circuits the remaining stages. Null on a default turn.
  // `broadcastArc` arms the arc broadcast (turn/stages.js `prompt`, write/gravity.js): when
  // on, the surf's own dynamics — the focus's trajectory segmented at the RECs, turns
  // weighted by rewrite magnitude — ride into the talker's window as a plain-language arc
  // block, so the answer voices the turn as a turn. Off by default → byte-identical.
  // `validate` arms the reaction-weighing stage (turn/stages.js `validate`): on a grounded
  // answer turn whose draft earned no witness AND the mechanical read already doubts, the
  // reader is asked to REACT to its own draft, the reaction is put through the Born rule, and
  // a negative reaction sends the draft back (regenerate). Off by default → byte-identical.
  // The per-turn JUDGMENT LOG — the append-only rail every same-vs-other verdict rides as a
  // revisable DEF (core/def.js). The stages append to it (fold → reference, answerable → void,
  // bind → binding, factcheck → correspondence); it is drained into the summary below. A single
  // mutable object held by reference, so it survives every `{...ctx}` spread through the stages.
  const judgments = createJudgmentLog();
  const ctx0      = { question, doc: groundingDoc, sourceDocs, model, embedder, geometricEmbedder, classifier, adjacency, centroids, history, grounding, stream, onToken, alpha, mindSpans, inquire, horizon, cast, reread, witnessSource, shapeLibrary, groundGraph, broadcastArc, now, lensPort, voicePref, signal, maxTokens, longform, validate, judgments };

  // The answer is FORMED at `bind` and only ANNOTATED after it (factcheck, revise,
  // veto, settle). Those annotation stages must never discard an answer the model
  // already produced: when one throws — the observed failure was the geometric
  // classifier's MiniLM/onnxruntime-web backend faulting transiently inside
  // `factcheck` — we keep the bound answer, record the fault in the trail, and flag
  // the turn, rather than collapsing it to a dead "Error:" the user can't act on.
  // A failure BEFORE the answer exists is genuinely fatal and falls to the catch.
  const degraded = [];

  try {
    const ctx = await PIPELINE.reduce(
      async (accPromise, name) => {
        const acc = await accPromise;
        if (acc.terminate) return acc;
        const t0   = nowMs();
        try {
          const next = await stages[name](acc);
          stepFan(name, next, nowMs() - t0);
          return next;
        } catch (err) {
          const message = String(err?.message || err);
          if (acc.answer != null) {
            // Post-answer (annotation) failure — salvage the answer, keep going so the
            // remaining annotation stages still run, and flag the gap.
            turn.step('error', { stage: name, message, fatal: false });
            degraded.push(name);
            return acc;
          }
          throw err;   // pre-answer failure — there is no answer to salvage
        }
      },
      Promise.resolve(ctx0)
    );

    const flags = (ctx.vetoes || []).map(v => ({
      id: v.id, message: v.message, refuses: v.refuses,
    }));
    // The proposition channel's corrections (a stale/superseded office the sources
    // succeed) ride out as flag-and-tell flags beside the vetoes — surfaced, never
    // refusing, the answer untouched. This is the DEF half of the fact-check the
    // edges-only veto cannot see.
    for (const f of (ctx.propositions?.fired || [])) flags.push({ id: f.id, message: f.message, refuses: false });
    // THE FACT-CHECK'S BLIND CHANNEL. The edge-grounding fact-check adjudicates a claimed
    // relation's MEANING with a live geometric classifier; without one every claim that reaches
    // that gate degrades to `indeterminate` (held) — the answer ships UNCHECKED on the semantic
    // channel, and until now silently (the "5/5 indeterminate" turns). When the turn ran the
    // fact-check with no classifier AND a claim actually degraded for want of it, say so: a
    // non-refusing flag, the answer shown but honestly qualified. The symbolic relation algebra
    // still ran (it needs no classifier), so this never fires when the only claims were typed
    // kinship/disjointness ones the algebra already settled.
    if (!ctx.classifier && (ctx.factcheck?.edgeVerdicts || []).some(v => v.reason === 'no-classifier')) flags.push({
      id: 'factcheck-limited', refuses: false,
      message: 'The semantic fact-checker was not available, so the answer’s claims were not checked for meaning against your sources — only the symbolic checks ran.',
    });
    // A post-answer annotation stage failed: the answer rides, with an honest flag
    // that the grounding check behind it could not complete.
    if (degraded.length) flags.push({
      id: 'grounding-incomplete', refuses: false,
      message: `A grounding step (${degraded.join(', ')}) could not complete, so the answer is shown without that verification.`,
    });

    // THE REFLECTION (ground/reflect.js): read the answer BACK — parse the model's output
    // into EOT, compare each lowered proposition with the document graph, and judge the
    // groundedness of what the graph holds: corroborated by several independent origins,
    // single-source, interpretation (the engine's own notes only), or unwitnessed. Post-
    // answer and best-effort — a fault here never costs the answer, it ships unreflected.
    let reflection = null;
    if (ctx.answer && groundingDoc && (ctx.route || 'grounded') === 'grounded' && !ctx.stopped) {
      try {
        reflection = reflectAnswer({ answer: ctx.answer, doc: groundingDoc });
        if (reflection) turn.step('reflect', {
          relations:      reflection.summary.relations,
          corroborated:   reflection.summary.corroborated,
          singleSource:   reflection.summary.singleSource,
          interpretation: reflection.summary.interpretation,
          unwitnessed:    reflection.summary.unwitnessed,
          origins:        reflection.summary.origins,
        });
      } catch { reflection = null; }
    }

    // THE SELF LINE (enactor/selfline.js): with a session monitor threaded, the turn is
    // one beat of the closed loop. First SENSE the question against the copies held from
    // earlier turns — an echo of the voice's own words is SELF (attenuated: never
    // independent confirmation), a push-back on a committed claim is SELF_MISMATCH (news,
    // and a correction the ledger records). Then COMMIT this answer's propositions as
    // fresh efference copies, held outstanding for the turns to come. Sense-before-commit
    // keeps the line causal: a turn can never match its own output. Best-effort — the
    // self line must never cost the answer.
    let selfLine = null;
    if (monitor && groundingDoc && !ctx.stopped) {
      try {
        const cursor = ctx.surf?.peak ?? Infinity;
        const sensed = senseReturn(monitor, { text: question, doc: groundingDoc, cursor });
        const committed = ctx.answer && !ctx.voidSpoken
          ? commitVoice(monitor, { text: ctx.answer, doc: groundingDoc, cursor })
          : null;
        if (sensed || committed) {
          selfLine = { ...(sensed || {}), committed: committed?.committed || 0,
                       outstanding: committed?.outstanding ?? monitor.outstanding().length,
                       expired: committed?.expired || [] };
          turn.step('self', {
            observed: selfLine.observed || 0, self: selfLine.self || 0,
            world: selfLine.world || 0, mismatched: selfLine.mismatched || 0,
            committed: selfLine.committed, outstanding: selfLine.outstanding,
          });
          if (selfLine.self > 0) flags.push({
            id: 'self-echo', refuses: false,
            message: `The question hands back what I said earlier (${selfLine.echoes.slice(0, 2).join(' · ')}) — my own words returning are not independent confirmation.`,
          });
          if (selfLine.mismatched > 0) flags.push({
            id: 'self-corrected', refuses: false,
            message: 'You pushed back on something I committed earlier — recorded as a correction against my prior answer.',
          });
        }
      } catch { selfLine = null; }
    }

    // THE COMMITMENT LEDGER (enactor/ledger.js): append this turn's public word — each
    // claim as a relay (cited) or an authored assertion (uncited, the system's own name)
    // — and every correction beside what it corrects: superseded drafts, record-denied
    // relations, the world's push-back, the typed absence. Best-effort and append-only.
    if (ledger) {
      try {
        ledger.recordTurn({
          question, answer: ctx.answer, route: ctx.route || 'grounded',
          bound: ctx.bound, verdicts: ctx.factcheck?.edgeVerdicts,
          reflection, revisions: ctx.revisions, selfLine,
          gated: ctx.gated || false, voidSpoken: ctx.voidSpoken || false,
        });
      } catch { /* the ledger must never cost the answer */ }
    }

    // THE JUDGMENT DISTRIBUTION (core/def.js): every same-vs-other verdict the turn made —
    // binding, reference, void, correspondence — folded to its CURRENT verdict per subject and
    // counted. This is the verdict census the answer chip will summarize (n corroborated / n
    // unsupported / n indeterminate), and the append-only log behind it means any of these is
    // a revisable DEF, not a frozen flag. Best-effort — the log must never cost the answer.
    let judgmentDist = null;
    try {
      judgmentDist = ctx.judgments ? ctx.judgments.distribution() : null;
      if (judgmentDist && judgmentDist.total > 0) turn.step('judgments', {
        corroborated:  judgmentDist.corroborated,
        unsupported:   judgmentDist.unsupported,
        contradicted:  judgmentDist.contradicted,
        indeterminate: judgmentDist.indeterminate,
        offDiagonal:   judgmentDist.offDiagonal,
        total:         judgmentDist.total,
      });
    } catch { judgmentDist = null; }

    turn.finish({
      route:     ctx.route || 'grounded',
      grounding,                                  // the register the user selected (audit trail)
      model:     describeModel(model),            // WHAT produced this answer — the talker + its exact model
      reading:   buildReading(ctx),               // the full mechanical reading: spans · surf field · note
      // Bounded copies: 16K chars keeps any real prompt/decode inspectable while capping
      // what a single turn can pin in the ring for the rest of the session.
      prompt:    ctx.promptText ? String(ctx.promptText).slice(0, 16000) : null,
      rawOutput: ctx.rawOutput  ? String(ctx.rawOutput).slice(0, 16000)  : null,
      bound:     ctx.bound      || null,
      vetoes:    ctx.vetoes     || null,
      answer:    ctx.answer     || '',
      sources:   ctx.sources    || [],
      referential: ctx.referential || null,
      // The verdict census over this turn's judgment log — the revisable DEFs behind the answer.
      judgments: judgmentDist,
      // Whether the hard floor GATED — substituted a typed decline for an ungrounded /
      // denied draft. The draft survives in `revisions`; the answer is the honest word.
      gated: ctx.gated || false,
      // The superseded drafts (a confabulation rewritten, or a draft the floor gated),
      // preserved beside the answer that replaced them (never erased — turn/stages.js).
      // This is the conversational record's SEG/retract: correction beside error, both
      // visible in the trail.
      revisions: ctx.revisions || null,
      flags,
    });
    // Whether this answer BOUND — earned at least one citation, or honestly abstained.
    // An answer that made claims but tied none to a source (`unbound` / `unbound-contact`)
    // did not bind; §7 keeps it out of the next turn's ground (the converse fold filters
    // an unbound assistant turn) so a claim that could not be grounded cannot become the
    // premise of a follow-up — the propagation the audit shows turn over turn.
    const unbound = flags.some(f => f.id === 'unbound' || f.id === 'unbound-contact');
    // The web-search PROPOSAL (turn/propose.js): a query the turn would put to the world when
    // the document could not close the gap. Proposer-only — it is returned for a confirmed user
    // action (or auto mode) to run; the pipeline itself never fetches. Null on a sound turn.
    const webProposal = proposeWebSearch(ctx);
    if (webProposal) turn.step('propose-web', { query: webProposal.query, rationale: webProposal.rationale });
    return {
      answer: ctx.answer, sources: ctx.sources || [],
      sourceDocs: sourceDocsOf(groundingDoc, ctx.sources),
      referential: ctx.referential || null, flags, unbound, webProposal,
      // The verdict distribution over the turn's judgment log (core/def.js): the current DEF
      // per subject, counted by verdict — the summary the label reads. Null on a bare turn.
      judgments: judgmentDist,
      fedGraph: ctx.fedGraph || null,   // the meaning graph fed to the talker (web path); null otherwise
      citeOrigins: citeOriginsOf(groundingDoc, ctx.sources),   // per-claim attribution: [sN] idx → source docId
      citeTexts:   citeTextsOf(groundingDoc, ctx.sources),     // [sN] idx → the cited sentence itself (hover provenance)
      // The EOT reflection of the answer against the graph — every lowered proposition with
      // its verdict and the independent origins that witness it. Null on an ungrounded turn.
      reflection,
      // The self/world line's reading for this turn (enactor/selfline.js): what the question
      // handed back of the voice's own prior word (self / mismatched), what this answer
      // committed, and what is still outstanding. Null without a threaded session monitor.
      selfLine,
      // The per-PROPOSITION record the transparency view reads: every claim the answer makes
      // (`bound` — its text + the sentence it cited) and every relation the fact-check judged
      // against the source (`verdicts` — corroborated / contradicted / unsupported / …). Together
      // they let the UI show the source (or the inaccuracy) behind everything the answer says.
      bound: ctx.bound || [],
      verdicts: ctx.factcheck?.edgeVerdicts || [],
      // The DEF/claim-grain channel's per-proposition record (every office the answer
      // asserts, graded corroborated / superseded / stale / unsupported against the
      // sources at their cursor) — the transparency surface for the proposition veto.
      propositions: ctx.propositions || null,
      route: ctx.route || 'grounded', grounding, turn,
      // The user stopped this turn mid-decode (the Stop button): the answer is the partial
      // text, and the UI marks it as stopped rather than committing it to the session fold.
      stopped: ctx.stopped || false,
    };
  } catch (err) {
    turn.step('error', { message: String(err?.message || err) });
    turn.finish({
      route:   'error',
      grounding,
      model:   describeModel(model),   // name the talker even on a failed turn — the receipt still says who
      answer:  `Error: ${err?.message || err}`,
      sources: [],
      flags:   [],
    });
    return { answer: turn.answer, sources: [], sourceDocs: [], flags: [], route: 'error', grounding, turn, error: err };
  }
};

const nowMs = () =>
  (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();

const summarize = (name, ctx, ms) => {
  const base = { ms: Math.round(ms) };
  switch (name) {
    case 'route':    return { ...base, route: ctx.route, task: ctx.task, grounding: ctx.grounding,
                              // the meta-conversational register (intent.js): the question is ABOUT
                              // the conversation, so the grounded prompt opens the full both-role thread
                              ...(ctx.meta ? { meta: true } : {}) };
    case 'expect':   return { ...base,
                              constraints: (ctx.expectation?.constraints || []).map(c => c.id),
                              gates: ctx.expectation?.gates || false };
    // The engine's own grounded generation (src/write), kept beside the talker's answer so
    // the audit shows the prediction the fluent reply was checked against — what it is
    // ABOUT (primary · entities) and the clumsy draft verbatim.
    case 'predict':  return ctx.prediction ? { ...base,
                              primary:  ctx.prediction.primaryName || null,
                              entities: ctx.prediction.entities || [],
                              confident: ctx.prediction.confident || false,
                              draft: String(ctx.prediction.draft || '').slice(0, 400),
                              // the form prediction from the sample-answer library, when threaded:
                              // the matched intent and the nearest sample answer (the prediction)
                              ...(ctx.shapeTarget ? { shape: {
                                intent: ctx.shapeTarget.intent,
                                confidence: ctx.shapeTarget.promptMatch?.confidence ?? null,
                                nearest: String(ctx.shapeTarget.promptMatch?.best_response || '').slice(0, 200),
                              } } : {}) } : base;
    case 'converse': return { ...base, recent: ctx.convStats?.recent || 0,
                              folded: ctx.convStats?.folded || 0, notesLen: ctx.convStats?.notesLen || 0 };
    case 'retrieve': return { ...base, n: ctx.spans?.length || 0, top: ctx.spans?.[0]?.score || 0,
                              // the retrieval mode, when it left the default hybrid path (e.g. 'structural'
                              // for a whole-document meta-query — the audit can see the skeleton was read)
                              ...(ctx.retrieval ? { mode: ctx.retrieval } : {}),
                              // the conversation-resolved query, shown only when it differs from the raw question
                              ...(ctx.retrievalQuery && ctx.retrievalQuery !== ctx.question ? { q: ctx.retrievalQuery } : {}) };
    case 'inquire':  return { ...base,
                              // the engine's own follow-up questions and how much each read
                              asked: (ctx.inquiry?.asked || []).map(a => a.q),
                              added: (ctx.spans || []).filter(s => s.via === 'inquire').length };
    case 'fold':     return { ...base, noteLen: ctx.note?.text?.length || 0,
                              referential: ctx.referential || null,
                              // the cast cycle (cast.js): the referent this turn landed on,
                              // whether it was CARRIED forward from a settled one, and whether
                              // this turn SETTLED it. Present only when a session cast is threaded.
                              ...(ctx.cast ? { cast: { carried: !!ctx.refTarget?.carried, settled: !!ctx.castStep?.settled,
                                                       referent: ctx.refTarget?.label ?? null, ...ctx.cast.snapshot() } } : {}),
                              // the active-inference re-read (§3): present only when the surf
                              // under-settled and reading more on the circled figure paid off
                              ...(ctx.rereadInfo ? { reread: ctx.rereadInfo } : {}),
                              surf: ctx.surf ? {
                                anchor: ctx.surf.anchor, peak: ctx.surf.peak, stops: ctx.surf.stops,
                                focus:  ctx.surf.focus,  recs: ctx.surf.recCursors, rode: ctx.surf.rode,
                                // the human-auditable reading walk — the cursors the surf arrested on,
                                // each with its sentence and surprise (buildSurfPath, above). Rides both
                                // the live trail's "Folded the reading" beat and the persisted audit.
                                path: buildSurfPath(ctx.surf, ctx.doc),
                                // The Significance column, when it rode (meaning embedder + prior present):
                                // the interpretive Atmosphere (departure · tone · verdict), the Lens spread
                                // (lensEntropy = the predictive uncertainty of the next unit), and the
                                // Paradigm verdict (under-read vs mis-framed). Absent on the dark path.
                                ...(ctx.surf.atmosphere ? { atmosphere: {
                                  departure: ctx.surf.atmosphere.departure,
                                  tone: ctx.surf.atmosphere.tone?.label || null,
                                  verdict: ctx.surf.atmosphere.verdict,
                                  frame: ctx.surf.atmosphere.frame,   // which ρ each number came from
                                } } : {}),
                                ...(ctx.surf.lensEntropy != null ? { lensEntropy: ctx.surf.lensEntropy } : {}),
                                ...(ctx.surf.lenses ? { lenses: ctx.surf.lenses.filter(l => l.real).length } : {}),
                                ...(ctx.surf.paradigm ? { paradigm: ctx.surf.paradigm.verdict } : {}),
                                // the helix turning: a measured basis-defeat emitted as an
                                // append-only REC(Paradigm,…) with its surprise-delta (the reframe).
                                ...(ctx.surf.paradigmRec ? { paradigmRec: {
                                  cell: ctx.surf.paradigmRec.cell,
                                  surpriseDelta: ctx.surf.paradigmRec.surpriseDelta,
                                } } : {}),
                                // The Stance face (Track F): the measured commit — how the surfer
                                // moved ρ — and whether the confabulation guard fired (a Ground-grain
                                // commit: reserve, do not name a clause).
                                ...(ctx.surf.stance ? { stance: {
                                  op: ctx.surf.stance.op, stance: ctx.surf.stance.stance,
                                  grain: ctx.surf.stance.grain, firmness: ctx.surf.stance.firmness,
                                  guard: ctx.surf.stance.guard,
                                } } : {}),
                              } : null };
    case 'answerable': return ctx.voidMeasure
      ? { ...base, verdict: 'answer', terrain: 'void', kind: ctx.voidMeasure.kind, rode: ctx.voidMeasure.rode }
      : { ...base, verdict: 'answer' };
    // The reasoning walk, when the intent gate opened it: how many steps committed, the grade
    // census (grounded / warranted-ungrounded / idle-ungrounded), whether the field quiesced it
    // (saturation, not the backstop), and the firewall reading — `mine` must always be true.
    case 'reason':   return ctx.reasoning ? { ...base,
                              steps: ctx.reasoning.steps.length,
                              grades: ctx.reasoning.gradeCounts,
                              quiesced: ctx.reasoning.quiesced,
                              mine: ctx.reasoning.everyStepIsMine } : base;
    case 'prompt':   return { ...base, promptLen: ctx.promptText?.length || 0,
                              // the arc broadcast rode this turn's window (broadcastArc)
                              ...(ctx.arcBlock ? { arc: true } : {}) };
    case 'llm':      return { ...base, outputLen: ctx.rawOutput?.length || 0, maxTokens: ctx.maxTokens,
                              // the paragraph-loop telemetry (write/paragraphs.js): how many
                              // paragraphs the answer took, and whether the model closed it
                              // itself (DONE) rather than hitting the cap.
                              ...(ctx.streamed ? { streamed: {
                                paragraphs: ctx.streamed.paragraphs.length,
                                chars: ctx.streamed.draft.length,
                                done: !!ctx.streamed.done,
                              } } : {}),
                              // the lens-port steering provenance (spec-the-lens-port.md): which
                              // terms fired, suppressed tokens, void-conflicts, per-gated entropy.
                              ...(ctx.lensEvents?.length || ctx.lensMounted?.length ? { lens: {
                                events: ctx.lensEvents?.length || 0,
                                voidConflicts: ctx.lensEvents?.filter(e => e.type === 'void-conflict').length || 0,
                                suppressed: ctx.lensEvents?.filter(e => e.type === 'suppress').length || 0,
                                regrounded: ctx.lensEvents?.filter(e => e.type === 'rec' && e.decision === 'widen').length || 0,
                                // the pantheon mounted-set: which gods voiced this turn, at what weight
                                mounted: (ctx.lensMounted || []).map(m => ({ god: m.god, op: m.op, weight: m.weight, locked: !!m.locked })),
                              } } : {}) };
    case 'bind':     return { ...base,
                              claims: ctx.bound?.length || 0,
                              cited:  ctx.bound?.filter(b => b.citation).length || 0 };
    case 'factcheck': return { ...base,
                              corroborated:  ctx.factcheck?.counts?.corroborated  || 0,
                              contradicted:  ctx.factcheck?.counts?.contradicted  || 0,
                              unsupported:   ctx.factcheck?.counts?.unsupported   || 0,
                              indeterminate: ctx.factcheck?.counts?.indeterminate || 0,
                              offDiagonal:   ctx.factcheck?.counts?.offDiagonal   || 0,
                              refuse:        ctx.factcheck?.refuse || false };
    case 'revise':   return { ...base,
                              attempts: ctx.revised?.attempts || 0,
                              resolved: ctx.revised?.resolved ?? null,
                              // the superseded draft(s) ride in the step trail too, verbatim,
                              // each beside the reason it was made to answer again — so the
                              // audit shows the engine catching itself and beginning again
                              superseded: (ctx.revisions || []).map(r => r.draft),
                              reasons:    (ctx.revisions || []).map(r => r.why).filter(Boolean) };
    // The absence stage spoke: the typed absence replaced an unwitnessed draft at a
    // measured void (the draft rides in `revisions`). Silent pass-through shows only ms.
    case 'absence':  return ctx.voidSpoken
      ? { ...base, spoken: true, kind: ctx.voidMeasure?.kind || null, rode: ctx.voidMeasure?.rode ?? null }
      : base;
    case 'veto':     return { ...base,
                              fired:   ctx.vetoes?.map(v => v.id) || [],
                              // the active witness-seek, when it ran: which figures it read the
                              // source on, and whether the source confirmed the interpretation
                              ...(ctx.witnessSought ? { witness: ctx.witnessSought } : {}) };
    // The reader's Born-measured reaction to its own draft: whether it ran, the reaction's
    // sign (positive → forward, negative → back), the Born mass off the "good answer" frame,
    // whether the negative reaction sent the draft BACK (a regenerate) or, if it could not
    // answer again, HELD it for the honest absence. Absent (base only) when the stage no-oped
    // — the flag was off, the draft had a witness, or the grounding was not in doubt.
    case 'validate': return ctx.assessment ? { ...base,
                              ran: true,
                              positive: ctx.assessment.positive === true,
                              rode: ctx.assessment.rode || null,          // 'embedding' (approval axis) or 'valence' (lexical)
                              offMass: round3(ctx.assessment.offMass),
                              ...(ctx.assessment.proj != null ? { proj: round3(ctx.assessment.proj) } : {}),   // approval-axis projection
                              wentBack: ctx.wentBack === true,
                              held: ctx.voidSpoken === true && ctx.assessment.positive === false } : base;
    // The session Horizon's reading after this turn folded in (surfing-next.md §4): how far
    // the accumulated ρ has left σ, the running ∫ surprise, and the turn's own surprise
    // against the prior memory. Present only when a Horizon was threaded; absent otherwise.
    case 'settle':   return ctx.horizonReading ? { ...base, horizon: {
                              turns:      ctx.horizonReading.turns,
                              departure:  ctx.horizonReading.departure,
                              turnSurprise: ctx.horizonReading.turnSurprise,
                              cumulativeSurprise: ctx.horizonReading.cumulativeSurprise,
                              regrounded: ctx.horizonReading.regrounded,
                            } } : base;
    default:         return base;
  }
};
