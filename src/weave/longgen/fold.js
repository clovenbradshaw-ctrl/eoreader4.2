// EO: INS·EVA(Network,Paradigm → Field,Lens, Making,Binding,Tracing) — fold prompt, best-of-n
// fold — the prompt as a FOLD, and multi-response generation as variation + selection
// (docs/multi-response-folds.md). The companion to render.js/compose.js: where those
// hand the model a document to continue, this hands it the STRUCTURAL STATE the next
// paragraph emerges from and the single MOVE it must make — condition the artifact,
// not the behavior, made literal. A cell does not receive "be a hepatocyte"; it reads
// its position and expression emerges from the resulting state. So the next-paragraph
// prompt does not instruct style; it presents the fold.
//
// THREE PARTS, and only three, because a small model holds one dominant instruction
// plus material, not a lattice of constraints:
//
//   STATE     where we are — the accumulated structural position in plain language,
//             distilled to two or three facts (the cumulative graph, read out).
//   MOVE      the one operation — the single target operator for this paragraph,
//             DERIVED (not guessed): compare the live trajectory position to the
//             build-arc schedule (arcTarget) and the gap names the move (arcGapMove).
//   MATERIAL  what to fold — the specific live threads the move operates on, pulled
//             from the entity graph (in play but not related; raised but not returned).
//
// The operators never appear as jargon; they translate to concrete writing directives
// (OP_DIRECTIVES). And because a small model is a noisy generator, we do not need the
// first fold to be right: we generate N candidates at temperature, score each against
// the flow prior (flowVerdict), and keep the one whose section-vector lands ON-MANIFOLD
// — variation plus selection against a viability manifold. The small model is the
// mutation source; the flow prior is the fitness function (foldBestOfN).
//
// DROP-IN CONTRACT — buildFoldPrompt is model-free and pure; foldBestOfN takes a model
// and (for the default selector) a `parse` function so the flow scorer can turn a
// candidate into a scorable trajectory. Null prior / no parser ⇒ it still produces
// prose, it just cannot select. This is `build_prompt(prior, prevStep, liveGraph,
// arcPhase)` plus its best-of-n wrapper from the design.

import { arcTarget, arcState, flowVerdict } from '../../surfer/flow/index.js';

// ── THE TRANSLATION TABLE ─────────────────────────────────────────────────────
// The operator → a concrete writing directive (never the operator code, never the
// cell name — the §6 discipline render.js also keeps). `directive` carries {slots}
// the builder fills from the live threads; `restated` is the 4–6 word tail placed at
// the very end of the prompt so recency reinforces the one move. Seven operators —
// the writer-facing subset (SIG/NUL do not surface as a paragraph directive).
export const OP_DIRECTIVES = Object.freeze({
  INS: { verb: 'introduce',  directive: 'bring in a new element not yet in play',                 restated: 'bring in a new element' },
  CON: { verb: 'relate',     directive: 'connect two things already in play — show how {A} bears on {B}', restated: 'relate two things in play' },
  SYN: { verb: 'synthesize', directive: 'draw the threads together into one claim',               restated: 'draw the threads into one claim' },
  DEF: { verb: 'establish',  directive: 'state plainly what {X} is or means',                     restated: 'state plainly what it is' },
  EVA: { verb: 'assess',     directive: 'weigh {X} — its significance, cost, or credibility',     restated: 'weigh its significance or cost' },
  SEG: { verb: 'shift',      directive: 'turn to a new scene, angle, or beat',                    restated: 'turn to a new angle' },
  REC: { verb: 'return',     directive: 'pick up {E} and carry it forward',                       restated: 'carry an earlier thread forward' },
});

// The system frame — the ONLY framing, and it names failures a small model tends to
// commit rather than hoping they won't happen (naming the failure suppresses it more
// reliably than silence). One paragraph, match how the writing moves, no summary, no
// wrap-up, no heading.
export const SYSTEM_FOLD =
  'You continue a piece of writing one paragraph at a time. Match how the writing ' +
  'moves. Write exactly one paragraph. Do not summarize what came before, do not ' +
  'wrap up, do not add a heading.';

const DEFAULT_REGISTER = 'a clear, grounded explanatory piece';

// ── THE MOVE — derived from the arc gap, not guessed ──────────────────────────

const below = (z) => Math.max(0, -z);   // how far a feature sits BELOW its arc target
const above = (z) => Math.max(0,  z);   // how far a feature sits ABOVE its arc target

// Each operator's DEMAND, read off the per-feature z-scores (live state vs corpus
// schedule). A move is called for when the features it would raise are below the
// schedule — or, for SYN, when the piece is STILL INTRODUCING late (ent_dens above
// schedule) and under-synthesizing. Keyed by the prior's arcKeys names; missing keys
// contribute 0, so a mis-shaped prior degrades to the phase baseline, never throws.
const GAP_DEMAND = {
  INS: (z) => below(z.ent_dens),                              // nothing fresh in play
  DEF: (z) => below(z.def_dens),                              // terms not yet set
  CON: (z) => below(z.rel_dens) + 0.5 * below(z.relate),      // introduced but unrelated
  EVA: (z) => 0.5 * below(z.relate) + 0.5 * below(z.reltyped),// relating, not yet weighing
  REC: (z) => below(z.ent_span) + 0.3 * below(z.coref),       // threads dropped, not carried
  SYN: (z) => above(z.ent_dens) + 0.5 * below(z.generate),    // still introducing, not closing
  SEG: (z) => above(z.mention_conc),                          // over-concentrated on one thing
};

// The phase baseline — a multiplicative prior over the moves, the significance-row
// order opened out (mirrors shape.js PHASE_OPS). open sets terms, develop relates and
// weighs, land closes. The gap SHARPENS this; it does not replace it, so a phase with
// no clear gap still yields its natural move (open→DEF, develop→CON, land→SYN).
const PHASE_WEIGHT = Object.freeze({
  open:    { DEF: 1.6, INS: 1.4, SEG: 0.6, CON: 0.6, EVA: 0.5, REC: 0.4, SYN: 0.2 },
  develop: { CON: 1.6, EVA: 1.3, REC: 1.1, SEG: 0.9, INS: 0.8, DEF: 0.6, SYN: 0.4 },
  land:    { SYN: 1.8, REC: 1.3, EVA: 1.1, CON: 0.7, SEG: 0.5, DEF: 0.3, INS: 0.3 },
});
const PHASE_ORDER = { open: ['DEF', 'INS', 'SEG', 'CON', 'EVA', 'REC', 'SYN'],
  develop: ['CON', 'EVA', 'REC', 'SEG', 'INS', 'DEF', 'SYN'],
  land: ['SYN', 'REC', 'EVA', 'CON', 'SEG', 'DEF', 'INS'] };

// Position and phase are two views of one thing; derive whichever is missing so a
// caller can hand either. t∈[0,1] is how far along the arc is.
const phaseOfT = (t) => (t < 0.15 ? 'open' : t > 0.7 ? 'land' : 'develop');
const tOfPhase = (phase) => (phase === 'open' ? 0.08 : phase === 'land' ? 0.85 : 0.5);
const resolvePosition = ({ t = null, phase = null, remainingFrac = null, stepIndex = null, totalSteps = null } = {}) => {
  let tt = Number.isFinite(t) ? t
    : (Number.isFinite(stepIndex) && Number.isFinite(totalSteps) && totalSteps > 0) ? stepIndex / totalSteps
    : Number.isFinite(remainingFrac) ? 1 - remainingFrac
    : (phase ? tOfPhase(phase) : null);
  if (tt == null) tt = 0;
  tt = Math.min(1, Math.max(0, tt));
  return { t: tt, phase: phase || phaseOfT(tt) };
};

// arcGapMove — THE load-bearing derivation. Compare the live cumulative graph state
// (off `step`, the previous section's vector) to the corpus schedule at position t;
// the phase-weighted, gap-sharpened argmax names the move. With no prior or no step it
// falls to the phase baseline — the honest cold-start move (open→DEF). Returns the
// operator, its z-scores (the audit of WHY this move), and the position it read.
export const arcGapMove = ({ prior = null, step = null, t = null, phase = null,
  remainingFrac = null, stepIndex = null, totalSteps = null } = {}) => {
  const pos = resolvePosition({ t, phase, remainingFrac, stepIndex, totalSteps });
  const base = PHASE_WEIGHT[pos.phase] || PHASE_WEIGHT.develop;
  const order = PHASE_ORDER[pos.phase] || PHASE_ORDER.develop;

  const target = arcTarget(prior, pos.t);
  const state = arcState(prior, step);
  let z = {};
  if (target && state) {
    for (const k of Object.keys(target)) {
      const sd = target[k].sd || 1e-6;
      z[k] = (state[k] - target[k].mean) / sd;
    }
  }

  let bestOp = order[0], bestScore = -Infinity;
  for (const op of order) {
    const demand = (target && state) ? (GAP_DEMAND[op] ? GAP_DEMAND[op](z) : 0) : 0;
    const score = (base[op] ?? 1) * (1 + demand);
    if (score > bestScore) { bestScore = score; bestOp = op; }
  }
  const round2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
  const zOut = {}; for (const k of Object.keys(z)) zOut[k] = round2(z[k]);
  return {
    op: bestOp,
    verb: OP_DIRECTIVES[bestOp]?.verb || bestOp,
    phase: pos.phase,
    t: round2(pos.t),
    z: zOut,
    derived: !!(target && state),   // false ⇒ phase-baseline fallback (no prior/step)
    score: round2(bestScore),
  };
};

// ── THE MATERIAL — the live threads, read off whatever entity graph is in hand ────

const asLabel = (x) => {
  if (x == null) return null;
  if (typeof x === 'string') return x.trim() || null;
  const s = String(x.head ?? x.label ?? x.name ?? x.text ?? x.id ?? '').trim();
  return s || null;
};

// readGraph — normalise the many shapes an entity graph arrives in to {nodes, edges}.
// Tolerates: a write/fold.js fold (refs Map + frontier), a mentions Map (key →
// positions[]), and a plain {nodes|entities|referents, edges|relations} object
// (the figureSurface shape included). Unknown shape ⇒ empty, so MATERIAL degrades to
// nothing rather than throwing — the prompt still stands on STATE and MOVE.
const readGraph = (graph) => {
  const nodes = [];   // { id, label, pos }  — pos: higher = more recently in play
  const edges = [];   // { a, b, via }
  if (!graph) return { nodes, edges };

  if (graph.refs instanceof Map) {                          // a write/fold.js fold
    let i = 0;
    for (const [hash, r] of graph.refs) {
      if (typeof graph.has === 'function' && !graph.has(hash)) continue;   // only what is in play
      const label = asLabel(r) || String(hash);
      nodes.push({ id: hash, label, pos: i++ });
    }
    return { nodes, edges };                                // a fold carries no entity–entity edges
  }

  if (graph instanceof Map) {                               // a mentions Map
    for (const [k, arr] of graph) {
      const positions = Array.isArray(arr) ? arr : [];
      const label = asLabel(k);
      if (label) nodes.push({ id: k, label, pos: positions.length ? Math.max(...positions) : 0 });
    }
    return { nodes, edges };
  }

  const rawNodes = graph.nodes || graph.entities || graph.referents || [];
  const nodeArr = Array.isArray(rawNodes) ? rawNodes
    : rawNodes instanceof Map ? [...rawNodes.values()] : Object.values(rawNodes || {});
  nodeArr.forEach((nd, i) => {
    const label = asLabel(nd);
    if (!label) return;
    const pos = Number.isFinite(nd?.pos) ? nd.pos : Number.isFinite(nd?.lastPos) ? nd.lastPos : i;
    nodes.push({ id: nd?.id ?? label, label, pos });
  });
  const rawEdges = graph.edges || graph.relations || [];
  for (const e of (Array.isArray(rawEdges) ? rawEdges : [])) {
    const a = asLabel(e?.a ?? e?.src ?? e?.source ?? e?.from);
    const b = asLabel(e?.b ?? e?.tgt ?? e?.target ?? e?.to);
    const via = asLabel(e?.via ?? e?.type ?? e?.relType ?? e?.label);
    if (a || b) edges.push({ a, b, via });
  }
  return { nodes, edges };
};

// liveThreads — the MATERIAL, distilled. What is in play (most-recent first), which of
// those nothing has related yet, and which were raised early and not returned to. The
// move operates on exactly these.
export const liveThreads = (graph, { recentK = 3 } = {}) => {
  const { nodes, edges } = readGraph(graph);
  const endpoints = new Set();
  for (const e of edges) { if (e.a) endpoints.add(e.a); if (e.b) endpoints.add(e.b); }

  const seen = new Set();
  const inPlay = [];
  for (const n of [...nodes].sort((a, b) => (b.pos ?? 0) - (a.pos ?? 0))) {
    if (n.label && !seen.has(n.label)) { seen.add(n.label); inPlay.push(n.label); }
  }
  const unrelated = inPlay.filter((l) => {
    const node = nodes.find((n) => n.label === l);
    return node && !endpoints.has(node.label) && !endpoints.has(node.id);
  });
  const recent = new Set(inPlay.slice(0, recentK));
  const dangling = [];
  for (const n of [...nodes].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))) {
    if (n.label && !recent.has(n.label) && !dangling.includes(n.label)) dangling.push(n.label);
  }
  const relations = edges.map((e) => ({ a: e.a, b: e.b, via: e.via }));
  return { inPlay, unrelated, dangling, relations };
};

// ── ASSEMBLY — STATE + MOVE + MATERIAL into the two-message prompt ─────────────

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const listOf = (arr, n = 4) => {
  const xs = (arr || []).filter(Boolean).slice(0, n);
  if (!xs.length) return '';
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
};

// The two anchors the move's directive and Work-with line resolve against.
const anchorsFor = (threads) => {
  const A = threads.unrelated[0] || threads.inPlay[threads.inPlay.length - 1] || 'the last thing introduced';
  const B = threads.unrelated[1] || threads.unrelated[0] && threads.inPlay.find((l) => l !== threads.unrelated[0])
    || threads.inPlay[threads.inPlay.length - 2] || 'the frame it sits in';
  const X = threads.inPlay[0] || 'the term just introduced';   // most recent, front of inPlay
  const E = threads.dangling[0] || threads.inPlay[threads.inPlay.length - 1] || 'the thread raised earlier';
  return { A, B, X, E, threadList: listOf(threads.inPlay, 4) };
};

// STATE — two or three plain facts, the accumulated structural position. Built from
// the threads and sharpened by the move's own rationale (a CON with no unrelated pair
// still says relations are sparse — the gap the deriver read, in words).
const stateFacts = (threads, move) => {
  const facts = [];
  if (threads.inPlay.length) facts.push(`In play: ${listOf(threads.inPlay, 4)}.`);
  if (threads.unrelated.length >= 2) {
    facts.push(`${cap(threads.unrelated[0])} and ${threads.unrelated[1]} are both in play but not yet connected.`);
  } else if (move.op === 'CON') {
    facts.push('Relations are sparse relative to what has been introduced.');
  }
  if (threads.dangling.length && (move.op === 'REC' || facts.length < 2)) {
    facts.push(`${cap(threads.dangling[0])} was raised earlier and has not been returned to.`);
  }
  if (move.op === 'SYN' && facts.length < 3) facts.push('The threads are laid out but not yet drawn together.');
  if (!facts.length) facts.push('The piece has just opened; the terms are not yet set.');
  return facts.slice(0, 3);
};

// The MOVE directive, material woven into its slots; and the Work-with line naming the
// exact threads the move operates on.
const fillDirective = (move, anc) =>
  (OP_DIRECTIVES[move.op]?.directive || 'continue the piece')
    .replace('{A}', anc.A).replace('{B}', anc.B).replace('{X}', anc.X).replace('{E}', anc.E);

const workWithLine = (move, threads, anc) => {
  switch (move.op) {
    case 'CON': return `${anc.A} and ${anc.B}`;
    case 'SYN': return anc.threadList || 'the threads so far';
    case 'REC': return anc.E;
    case 'EVA': case 'DEF': return anc.X;
    case 'INS': return threads.inPlay.length ? `a new element, set beside ${listOf(threads.inPlay, 3)}` : 'a genuinely new element';
    case 'SEG': return 'a new angle on the material';
    default: return anc.threadList || '';
  }
};

// buildFoldPrompt — this is `build_prompt(prior, prevStep, liveGraph, arcPhase)`. Pure
// and model-free. Emits the two-message prompt (SYSTEM_FOLD + the filled USER fold) and
// the resolved move/state/material beside it, so the best-of-n wrapper and any audit
// can read WHAT was asked without re-deriving it. The move is derived from the arc gap
// unless the caller pins one (`move`).
export const buildFoldPrompt = ({
  prior = null,
  prevStep = null,
  graph = null,
  liveGraph = null,           // an alias for `graph` — the design's name
  phase = null,
  t = null,
  remainingFrac = null,
  stepIndex = null,
  totalSteps = null,
  register = DEFAULT_REGISTER,
  priorText = '',             // the last 1–2 paragraphs, verbatim — the hard anchor
  move: forcedMove = null,    // pin the move (skip the derivation) when the caller knows it
} = {}) => {
  const g = liveGraph || graph;
  const move = forcedMove
    ? { op: forcedMove, verb: OP_DIRECTIVES[forcedMove]?.verb || forcedMove, phase: phase || null, derived: false, z: {} }
    : arcGapMove({ prior, step: prevStep, t, phase, remainingFrac, stepIndex, totalSteps });

  const threads = liveThreads(g);
  const anc = anchorsFor(threads);
  const facts = stateFacts(threads, move);
  const directive = fillDirective(move, anc);
  const workWith = workWithLine(move, threads, anc);
  const restated = OP_DIRECTIVES[move.op]?.restated || 'continue the piece';

  const blocks = [];
  blocks.push(`Register: ${register}.`);
  blocks.push(`Established so far:\n${facts.map((f) => `- ${f}`).join('\n')}`);
  blocks.push(`This paragraph should: ${directive}.`);
  if (workWith) blocks.push(`Work with: ${workWith}.`);
  if (priorText && String(priorText).trim()) {
    blocks.push(`Continue this text:\n"""\n${String(priorText).trim()}\n"""`);
  }
  // The move restated at the very end — recency reinforces the one instruction.
  blocks.push(`Write the next single paragraph. It should ${restated}. Do not summarize or conclude.`);

  return {
    messages: [
      { role: 'system', content: SYSTEM_FOLD },
      { role: 'user', content: blocks.join('\n\n') },
    ],
    move,
    state: facts,
    material: { workWith, threads },
    restated,
  };
};

// build_prompt — the design's name, honored as an alias for callers that speak it.
export { buildFoldPrompt as build_prompt };

// ── THE SELECTOR — variation + selection against the flow manifold ────────────

const FLAT_DELTA = 0.02;   // a section transition below this barely moved — the fold went flat

// flowScorer — the fitness function. Given the prior, the previous section vector, and
// a `parse` (parseText) to turn candidate prose into a scorable trajectory, it returns
// a scorer: candidateText → the flow verdict, enriched with the three viability flags
// the design selects on — flat (didn't move), lurch (over-jumped, delta > p90),
// offManifold (residual > p95). onManifold = none of the three. Null when it cannot
// score (no prior, or no parser), and foldBestOfN then degrades to "generate one".
//
// The candidate is scored IN CONTEXT: parse(contextText + candidate) and read the LAST
// section's vector, so the delta is measured against `prevStep` exactly as the running
// critic measures it beat to beat.
export const flowScorer = ({
  prior = null, prevStep = null, parse = null, contextText = '',
  segment = { perSentences: 8 }, flatDelta = FLAT_DELTA,
} = {}) => {
  if (!prior || typeof parse !== 'function') return null;
  return (candidateText) => {
    const text = String(candidateText || '').trim();
    if (!text) return null;
    const full = contextText && String(contextText).trim() ? `${String(contextText).trim()}\n\n${text}` : text;
    let doc;
    try { doc = parse(full); } catch { return null; }
    const v = flowVerdict(prior, prevStep, doc, segment);
    if (!v) return null;
    const flat = v.delta != null && v.delta < flatDelta;
    const lurch = v.deltaPercentile != null && v.deltaPercentile > 90;
    const offManifold = v.residualPercentile != null && v.residualPercentile > 95;
    return { ...v, flat, lurch, offManifold, onManifold: !flat && !lurch && !offManifold };
  };
};

// diagnoseMiss — when no candidate clears the bar, the miss says how to sharpen. This
// closes the loop the design specifies: the move was wrong for the phase, or the
// material was too thin, or every candidate over-jumped — each a different next step
// (soften the move, widen the material, or drop in a retrieved exemplar).
const diagnoseMiss = (scored, move) => {
  if (!scored.length) return { reason: 'no-candidates', suggest: 'the model produced nothing — check the model/prompt' };
  const vs = scored.map((s) => s.verdict).filter(Boolean);
  if (!vs.length) return { reason: 'unscored', suggest: 'no scorer wired — inject a `parse` (parseText) or a `score` fn' };
  const all = (p) => vs.every(p);
  if (all((v) => v.flat)) return { reason: 'flat', move: move.op,
    suggest: 'the material was too thin — the move had nothing to operate on; widen MATERIAL or pick a node move (INS/DEF)' };
  if (all((v) => v.lurch)) return { reason: 'lurch', move: move.op,
    suggest: 'the move over-jumped for this phase — soften toward a develop move (CON/EVA)' };
  if (all((v) => v.offManifold)) return { reason: 'off-manifold', move: move.op,
    suggest: 'the move was likely wrong for the phase, or drop in a retrieved exemplar that makes exactly this move' };
  return { reason: 'mixed', move: move.op, suggest: 'no candidate cleared all three bars — retry, or relax the bar for this beat' };
};

// foldBestOfN — the honest way steering works with a small model: not a perfect first
// fold, but MANY folds and a selector that knows which one belongs. Build the fold,
// draw N candidates at temperature, score each, keep the on-manifold one nearest the
// manifold (lowest residual). Returns the chosen text plus every candidate's verdict
// (the audit) and, on a whiff, the miss diagnosis.
//
//   opts extends buildFoldPrompt's — everything it needs plus:
//     model        { phrase(messages, opts) → Promise<string> }
//     parse        parseText, for the default flowScorer (ignored if `score` is given)
//     score        an explicit scorer (candidateText → verdict) — overrides flowScorer
//     n            candidates to draw (default 4)
//     temperature  the draw temperature (default 0.8 — noisy enough to vary)
//     maxTokens/minTokens/signal  passed to model.phrase
export const foldBestOfN = async ({
  model,
  parse = null,
  score = null,
  n = 4,
  temperature = 0.8,
  maxTokens,
  minTokens,
  signal = null,
  ...promptArgs
} = {}) => {
  if (!model || typeof model.phrase !== 'function') throw new TypeError('foldBestOfN: a model with phrase() is required');
  const built = buildFoldPrompt(promptArgs);

  const scorer = score || flowScorer({
    prior: promptArgs.prior,
    prevStep: promptArgs.prevStep,
    parse,
    contextText: promptArgs.priorText || promptArgs.contextText || '',
    segment: promptArgs.segment,
  });

  const scored = [];
  for (let i = 0; i < n; i++) {
    if (signal?.aborted) break;
    let raw = '';
    try { raw = await model.phrase(built.messages, { temperature, maxTokens, minTokens, signal }); }
    catch { continue; }                               // a dead draw is a lost candidate, not a failed run
    const text = String(raw || '').trim();
    if (!text) continue;
    const verdict = scorer ? await scorer(text) : null;
    scored.push({ i, text, verdict });
  }

  const viable = scored.filter((s) => s.verdict && s.verdict.onManifold);
  viable.sort((a, b) => a.verdict.manifoldResidual - b.verdict.manifoldResidual);

  // With a scorer: the on-manifold winner (or null → the miss). Without one: the walk
  // still yields prose (the first live candidate), flagged so the caller knows
  // selection did not run.
  const chosen = scorer ? (viable[0] || null) : (scored[0] || null);
  return {
    text: chosen ? chosen.text : null,
    selected: !!scorer && !!viable.length,
    scored: !!scorer,
    chosen,
    move: built.move,
    prompt: built,
    candidates: scored,
    miss: (scorer && !viable.length) ? diagnoseMiss(scored, built.move) : null,
  };
};
