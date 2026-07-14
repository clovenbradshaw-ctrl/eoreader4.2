// EO: SYN·INS·EVA(Field,Atmosphere,Network → Network, Composing,Making,Tracing) — the closure run forward
// runContinuation — long generation across messages, the closure run forward, with
// the planner's faces wired in (docs/long-generation.md, docs/spec-planner.md).
//
// The arc's spine with the source switched from a document to the generation's SELF
// and the supply from retrieval to a fold of the conversation plus a ground pool.
// One step is the act seen three ways (spec-planner.md §4):
//
//   reconstruct  feed back the tail (verbatim window) and the fold (surfed recap)
//   gate         (§3) before the first step: does the ground answer the TYPE asked?
//   navigate     (§4.1) p(next) over the self, leaned by the significance arc (§8)
//   resolve      (§4.2) that move-type → a concrete proposition, operator HONORED
//   realize      (§4.3) the talker renders it, with the fold + read-window as context
//   floor        bind+veto the rendering against its span (the arc's gate)
//   weld         (§7) append the JUDGED unit; its verdict becomes the next step's strain
//
// Termination is emergent (spec-planner.md §10): the loop stops when the ground
// saturates (uncovered mass below `epsilon`), when the ground is spent, when the
// predictor QUIESCES (§2 — the flat posterior, NOT a VOID-site move), when the arc
// lands a SYN, or on sustained drift — never at a token count. `maxSteps` is a
// runaway guard.

import { foldConversation } from '../../turn/converse/index.js';
import { generateSection, stripUnboundCorrective, REBIND_THRESHOLD, groundSaturation } from '../arc/index.js';
import { bindAndVeto } from '../../enactor/ground/index.js';
import { predictDirection } from './direction.js';
import { resolveProposition, EDGE_OPS } from './resolve.js';
import { answerabilityGate, followUpOffer } from './answerable.js';
import { arcPhase, phaseBias } from './shape.js';
import { speculateNext, readWindow } from './prompt.js';
import { realizeProse } from './render.js';
import { fieldStrain, MIN_FIELD } from './field.js';
import { holonicConfinement } from './confine.js';
import { relaxMove } from './relax.js';
import { nulGate } from './nul.js';

const MAX_STEPS = 24;            // runaway backstop; saturation should bind first
const MAX_DRIFT = 2;             // consecutive drops that read as "the frame is gone"
const LAND_DEVELOP = 2;          // self-op develops in the land phase before forcing the close

// The leading run of bound claims — the grounded opening of a drifting unit, kept
// when the tail confabulates (the arc's boundPrefixText, §5.5).
const boundPrefixText = (bound = []) => {
  const kept = [];
  for (const b of bound) { if (b.citation) kept.push(b.claim); else break; }
  return kept.join(' ');
};

export const runContinuation = async ({
  ground = [],            // the ranked supply — what the continuation may cite
  history = [],           // the conversation; folded to tail + recap each call
  model,
  doc = null,             // optional, only for the neutral orientation line
  graph = null,           // optional referent-and-relation graph; refines the resolver
  question = '',          // optional; when given, the §3 answerability gate runs first
  auditLog = null,        // optional; records the step trace when given
  state = null,           // resumable closure state from a prior message
  maxSteps = MAX_STEPS,
  temperature = 0,        // the surprise quantile the direction draw reaches up
  arc = false,            // §8 — lean the draw by the significance arc (planner-ON)
  epsilon = undefined,    // §10 — the saturation knob; default is the arc's EPSILON
  speculate = false,      // §9 — pre-resolve the next move on a clean-verdict assumption
  selfRegister = false,   // essay-backwards — edge ops resolve against the SELF, no fresh span
  semanticStrain = false, // essay-backwards — the self-fold licenses REC on a clean-binding turn
  fieldRead = false,      // generation-by-field-reading — read atoms back as a density field
  embed = null,           // the embedder the field read needs (text → vector); required by fieldRead
  interleave = false,     // generation-by-field-reading — develop each node right after introducing it
  confine = false,        // holonic-token-confinement — record each atom's address→confinement
  dynamics = false,       // decision-as-relaxation — occupancy currents settle into the move (no gauge)
  nul = true,             // nul — hold uncohered ground honestly instead of hedging (default on)
  grammar = null,         // commission — an exemplar's learned move-grammar; leans the move draw toward its form
  prose = false,          // paragraph-grain realizer — render each atom as a paragraph CONTINUATION of
                          //   the running document (render.js), not one isolated grounded sentence. The
                          //   planner still decides the move; only the writing changes. Default off ⇒ the
                          //   REALIZE call is byte-identical to today (the rev-flag parity contract).
  genre = '',             // the cold-start register line for prose mode (render.js DEFAULT_GENRE when '')
  signal = null,
} = {}) => {
  // RECONSTRUCT — the tail and the fold, reused wholesale. Computed once: the same
  // for every step of this message (the history does not change mid-run).
  const fold = foldConversation(history);
  const conversation = { notes: fold.notes, pastTurns: fold.pastTurns };

  // GATE (§3) — does the ground answer the TYPE the question wants? A licensed walk
  // proceeds; an unlicensed one returns the refusal atom and NOTHING more (no walk,
  // no follow-up offer). The walk is licensed, not assumed.
  const gate = answerabilityGate({ question, ground, graph });
  if (!gate.licensed) {
    const r = gate.refusal;
    const unit = { i: 0, move: 'VOID', subClaim: r.reason, text: r.text,
      sources: r.sources, boundFraction: 1, vetoes: [], action: 'refuse', refusal: true };
    return {
      answer: r.text, units: [unit], sources: [...r.sources].sort((a, b) => a - b),
      stop: 'unanswerable', wantedType: gate.wantedType, followUp: '',
      trace: [{ step: 0, kind: 'refuse', wantedType: gate.wantedType, reason: r.reason }],
      state: { units: [], covered: [] }, fold: fold.stats,
    };
  }

  // NUL (§ the ninth cell) — the walk is the RIGHT TYPE, but does the ground COHERE? A
  // field that is present but does not clear its own Born noise-null (the degenerate weights
  // a bad projection produces) is held, not walked: the honest "I have these sources, they
  // do not resolve" instead of hedged pseudo-prose. Conservative — fires only on a genuinely
  // uncohered field, so a normal grounded walk is untouched.
  if (nul) {
    const heldResponse = nulGate(ground);
    if (heldResponse) return { ...heldResponse, wantedType: gate.wantedType, fold: fold.stats };
  }

  // Resume from prior state, or start fresh. `units` are the accepted self-units
  // (the move-log substrate and the weld's carrier); `covered` is the spent ground.
  const units = state?.units ? [...state.units] : [];
  const covered = new Set(state?.covered || []);

  const trace = [];
  let stop = null;
  let drift = 0;
  let lastClean = true;
  let pendingDevelop = false;   // interleave — a develop beat is owed after a node introduce
  let landDevelops = 0;   // self-op develops taken in the land phase (essay-backwards)
  let spec = null;        // the speculated next {move, proposition}, when speculate is on

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) { stop = 'aborted'; break; }

    // SATURATION (§10) — read the uncovered budget off the ground pool every step.
    const sat = groundSaturation(ground, covered, epsilon != null ? { epsilon } : {});

    // NAVIGATE (§4.1) — p(next) over the self, leaned by the significance arc (§8)
    // when the planner is on. A flat posterior is the predictor QUIESCING (§2): no
    // grounded expectation of what comes next, so the honest move is to stop.
    // FIELD READ (generation-by-field-reading.md) — read the accepted atoms back as a
    // density field: strainByCursor marks the turns (void-cleared atmosphere/paradigm
    // boundaries), and the geography abstention is the principled quiesce.
    const field = fieldRead ? await fieldStrain(units, { embed }) : null;
    // Quiesce only when the field is BOTH flat (geography abstains) AND has turned
    // nowhere — a field that turned anywhere is still developing, so its raw-spectrum
    // abstention (the common mode keeps rank low) must not stop it.
    if (field && field.abstain && field.boundaries.length === 0 && units.length >= 2 * MIN_FIELD) {
      stop = 'quiesce-flat'; trace.push({ step, kind: 'quiesce-flat', k: field.k }); break;
    }

    const phase = arc ? arcPhase({ stepIndex: step, units, remainingFrac: sat.remainingFrac }) : null;
    const dir = predictDirection(units, {
      temperature,
      phaseBias: arc ? phaseBias(phase) : undefined,
      semanticStrain,                        // the self-fold licenses REC on a clean turn
      strainByCursor: field?.strainByCursor, // the field read overrides the lexical proxy
      grammar,                               // commission — the exemplar's move-grammar, when shaping
    });
    // The prior going flat quiesces the READOUT path; under dynamics the occupancy decides,
    // so a flat prior is not a stop (the relaxation quiesces on spent occupancy, below).
    if (dir.flat && !dynamics) { stop = 'quiesce'; trace.push({ step, kind: 'quiesce', sharpness: dir.sharpness }); break; }

    // INTERLEAVE (generation-by-field-reading.md) — while the pool still holds fresh
    // ground, STRICTLY alternate introduce (a node op walking the next span) and develop (an
    // EVA on the just-introduced atom): the arity-gate SCHEDULE, not a move-predictor bias
    // (bias was the §8 dead end). The strict beat walks the ground in order so the field
    // turns where the topics turn, and lands each turn right after an EVA — the one place
    // the structural prior licenses a REC. Once the pool is spent the beat releases and the
    // arc's develop/land takes over. The coarse form of the §4.2 scheduler; off by default.
    let drawMove = dir.move;
    let relaxAudit = null;
    if (dynamics) {
      // DECISION AS RELAXATION (decision-as-relaxation.md) — no gauge consulted. The field's
      // OCCUPANCY (unspent ground, an undeveloped trailing node, a frontier turn) drives the
      // operators and the network settles into one attractor; that settling IS the move. It
      // replaces both the temperature reach and the interleave schedule — the cadence emerges
      // from the activator–consumer currents, it is not written.
      const r = relaxMove({ prior: dir.posterior, ground, covered, units, field, phase });
      // Occupancy spent — nothing to introduce, develop, turn, or close. No attractor; quiesce.
      if (r.occupancy < 0.5 && units.length) {
        stop = 'quiesce-spent'; trace.push({ step, kind: 'quiesce-spent', occupancy: round3(r.occupancy) }); break;
      }
      drawMove = r.move;
      relaxAudit = { currents: r.currents, activations: r.activations, occupancy: round3(r.occupancy) };
    } else if (interleave && selfRegister) {
      const hasUncovered = ground.some((s, i) => !covered.has(s.idx ?? i));
      if (hasUncovered) {
        if (pendingDevelop) {
          drawMove = 'EVA';
        } else {
          // Introduce beat — UNLESS the field just turned right after a develop-EVA. A
          // detected boundary (atmosphere/paradigm) IS the strain that licenses a turn, so
          // the scheduler restructures (REC) at the boundary rather than blindly introducing
          // the next span. This is the field read closing the loop: the turn is read off the
          // generated field and realized, not coaxed from the move-predictor.
          const li = units.length - 1;
          const turned = li >= 0 && units[li].move === 'EVA' && (field?.strainByCursor?.[li] || 0) >= 1;
          drawMove = turned ? 'REC' : 'CON';
        }
      }
    }
    pendingDevelop = false;

    // RESOLVE (§4.2) — the drawn move-type → a proposition, operator honored. Reuse
    // the clean-verdict speculation when it is live and the last unit bound clean
    // (§9); otherwise resolve fresh.
    let prop;
    if (speculate && spec && lastClean && spec.move === drawMove) {
      prop = spec.proposition;
    } else {
      prop = resolveProposition({ move: drawMove, ground, covered, graph, units, selfRegister });
    }
    // A node op drew but the external pool is spent (nothing fresh to introduce). Under
    // the self register, fall to DEVELOPING what the pool bought rather than ending the
    // essay: draw the highest-posterior EDGE op and resolve it against the self. The arc
    // then lands on a SYN close (or the predictor quiesces); the walk stops on the SELF
    // running dry, not on the external pool. Without the register this is still a stop.
    if (!prop && selfRegister && units.length && dir.posterior) {
      const edgeMove = dir.posterior.find(([op]) => EDGE_OPS.has(op))?.[0];
      if (edgeMove && edgeMove !== drawMove) {
        prop = resolveProposition({ move: edgeMove, ground, covered, graph, units, selfRegister });
        if (prop) { trace.push({ step, kind: 'develop-self', drew: dir.move, fell: edgeMove }); }
      }
    }
    if (!prop) { stop = 'ground-exhausted'; trace.push({ step, kind: 'exhausted', move: dir.move }); break; }

    // LAND (essay-backwards) — the coarse-grain arc close. Once the body has developed
    // in the land phase, a recurrence-dominated EVA/REC stream will not let SYN win the
    // draw (it out-probabilities the boosted close), so the walk would develop forever.
    // After LAND_DEVELOP self-op develops in `land`, force the SYN close if one resolves.
    // The FINE-grain rhythm (which develop, when to turn) is the predict-self seam
    // (spec-generation.md "reading self back through the perceiver"); this lands the arc.
    if (selfRegister && phase === 'land' && prop.selfOp && !prop.closes) {
      if (landDevelops >= LAND_DEVELOP) {
        const close = resolveProposition({ move: 'SYN', ground, covered, graph, units, selfRegister });
        if (close?.closes) { prop = close; trace.push({ step, kind: 'land-close', after: landDevelops }); }
      } else {
        landDevelops += 1;
      }
    }

    // The budget is spent — the next deposit only re-cites the dregs. Stop, UNLESS
    // this is the closing SYN that lands the arc (it cites already-covered spans), or a
    // self-op (essay-backwards): a self-op consumes no fresh external span, so external
    // saturation must not end an essay that is still developing what the pool bought.
    if (sat.saturated && !prop.closes && !prop.selfOp) {
      stop = 'saturated';
      trace.push({ step, kind: 'saturated', remainingFrac: round3(sat.remainingFrac) });
      break;
    }

    // REALIZE (§4.3) — the talker renders the proposition, with the fold + the
    // read-window (the prose tail, witnessed not re-bound, §5) as context. Under
    // `prose`, realize at PARAGRAPH grain — a continuation of the running document
    // (render.js), the planner's move preserved but the writing no longer one
    // isolated sentence per atom. Default: the arc's per-atom generateSection.
    const window = readWindow(units, 2);
    const realize = (corrective = '') => prose
      ? realizeProse({ proposition: prop, units, model, genre, signal })
      : generateSection(prop, { doc, model, corrective, signal, conversation, tail: window }).then(g => g.rawOutput);
    let rawOut = await realize();
    let gated = bindAndVeto(rawOut, prop.spans, { doc, question: prop.subClaim, task: 'answer' });
    let action = 'append';

    // FLOOR — the arc's faithfulness gate, run forward. bound → append; partly
    // bound → truncate to the grounded opening; mostly unbound → regenerate once
    // with the unbound claims struck; still unbound → drop.
    if (gated.boundFraction >= 1) {
      action = 'append';
    } else if (gated.boundFraction >= REBIND_THRESHOLD) {
      const prefix = boundPrefixText(gated.bound);
      if (prefix) { gated = bindAndVeto(prefix, prop.spans, { doc, question: prop.subClaim, task: 'answer' }); action = 'truncate'; }
      else action = 'drop';
    } else {
      const corrective = stripUnboundCorrective(gated.bound);
      const rawOut2 = await realize(corrective);
      const gated2 = bindAndVeto(rawOut2, prop.spans, { doc, question: prop.subClaim, task: 'answer' });
      if (gated2.boundFraction >= REBIND_THRESHOLD) {
        const prefix2 = boundPrefixText(gated2.bound);
        if (prefix2) { gated = bindAndVeto(prefix2, prop.spans, { doc, question: prop.subClaim, task: 'answer' }); action = 'regenerate'; }
        else action = 'drop';
      } else {
        action = 'drop';
      }
    }

    // A span is spent whether the unit appended or dropped — a drop does not get
    // retried against the same ground (that would loop), so coverage stays monotone.
    // A SYN close cites already-covered spans, so it adds nothing here.
    for (const idx of prop.spanSet) covered.add(idx);

    if (action === 'drop' || !gated.sources.length) {
      drift += 1;
      lastClean = false;
      spec = null;
      trace.push({ step, kind: 'drop', move: dir.move, boundFraction: round3(gated.boundFraction) });
      if (drift >= MAX_DRIFT) { stop = 'drift'; break; }
      continue;
    }
    drift = 0;
    lastClean = gated.boundFraction >= 1;

    // WELD (§7) — append the JUDGED unit. The verdict (boundFraction, vetoes) travels
    // with it, so the next direction read sees self-output with its verdict, never the
    // bare assertion: an evaluation of self orients the next step, never grounds it.
    // The move the unit RECORDS is the one it REALIZED (prop.move), not the one drawn
    // (dir.move) — when the loop fell to a self-op develop, the drawn move is not what
    // was written. This distinction is the weld: selfMoveLog reads u.move, so recording
    // the drawn move instead of the realized one traps the predictor's recurrence on the
    // wrong op and the arc can never progress (essay-backwards).
    const unit = {
      i: units.length,
      move: prop.move,
      drew: dir.move,
      selfOp: !!prop.selfOp,
      stance: prop.stance,
      band: prop.band,
      subClaim: prop.subClaim,
      text: gated.answer,
      // The display projection — the same prose with each ungrounded FACT underlined
      // ([no source]); `text` stays clean because it is fed back as the next beat's
      // left-context and a mark there would derail the continuation (enactor/ground).
      marked: gated.marked,
      sources: gated.sources,
      boundFraction: gated.boundFraction,
      vetoes: gated.vetoes,
      action,
      // The atom's holonic address → its token confinement (docs/holonic-token-confinement.md).
      // Recorded here; it drives the lens-port's logit bias when a real renderer is present.
      ...(confine ? { confinement: holonicConfinement({ proposition: prop, phase }) } : {}),
    };
    units.push(unit);
    // Interleave: a node introduce owes a develop beat next (an EVA on this atom), so the
    // field boundary a turning node opens lands after an EVA where REC can fire.
    pendingDevelop = interleave && !prop.selfOp && !EDGE_OPS.has(prop.move);
    trace.push({
      step, kind: 'append', move: prop.move, drew: dir.move, stance: prop.stance, action,
      phase, cited: gated.sources.length, boundFraction: round3(gated.boundFraction), sharpness: dir.sharpness,
      selfOp: !!prop.selfOp, band: prop.band,
      // the decision internals — enough to tell, from an export, WHY this move (audit-schema)
      posterior: dir.posterior ? dir.posterior.slice(0, 4).map(([o, p]) => [o, round3(p)]) : null,
      dynamics: relaxAudit ? { winner: prop.move, activations: round3Map(relaxAudit.activations), currents: round3Map(relaxAudit.currents) } : null,
      field: field ? { boundaries: field.boundaries, k: field.k, abstain: field.abstain, strainHere: field.strainByCursor?.[units.length - 2] || 0 } : null,
      confinement: unit.confinement ? { register: unit.confinement.register, forbidClose: unit.confinement.forbidClose, address: unit.confinement.address, openness: unit.confinement.openness } : null,
    });

    if (auditLog?.event) {
      try { auditLog.event('longgen:unit', { i: unit.i, move: unit.move, action, boundFraction: round3(unit.boundFraction) }); }
      catch { /* the audit is a projection; a logging slip never fails the run */ }
    }

    // The arc lands: a successful SYN close ends the walk (§8).
    if (prop.closes) { stop = 'arc-closed'; break; }

    // SPECULATE (§9) — pre-resolve the next move assuming THIS verdict was clean, so
    // the symbolic resolve is overlapped with witnessing. Discarded on a drift.
    spec = (speculate && lastClean)
      ? speculateNext({ units, proposition: prop, ground, covered, graph, temperature })
      : null;
  }

  if (!stop) stop = 'max-steps';

  const answer = units.map(u => u.text).filter(Boolean).join('\n\n');
  // The display projection — the assembled prose with ungrounded facts underlined. Built
  // AFTER the walk, so it never feeds back as left-context; a surface renders `marked` to
  // disclose provenance in the long-form mode, `answer` stays the clean text.
  const marked = units.map(u => u.marked || u.text).filter(Boolean).join('\n\n');
  const sources = [...new Set(units.flatMap(u => u.sources || []))].sort((a, b) => a - b);

  return {
    answer,
    marked,
    units,
    sources,
    stop,
    wantedType: gate.wantedType,
    // The follow-up offer, gated by the same §3 test — only regions the field can
    // actually develop, or '' (no offer is better than an offer to confabulate).
    followUp: followUpOffer(ground, covered),
    trace,
    // The resumable closure state — feed this back with the next message.
    state: { units, covered: [...covered] },
    fold: fold.stats,
  };
};

const round3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

// Round a map/object of numbers to 3 dp, dropping the near-zero entries so the audit stays
// legible (only the operators that actually competed appear).
const round3Map = (m = {}) => {
  const out = {};
  for (const k of Object.keys(m)) { const v = round3(m[k]); if (v && Math.abs(v) > 1e-3) out[k] = v; }
  return out;
};
