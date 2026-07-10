// EO: SYN·CON·REC(Network,Link → Network,Link,Paradigm, Composing,Binding) — the reasoning walk
// reason/walk.js — the reasoning walk: continuous, meaningful output as a loop over the log.
//
// think.js (the inner-speech loop) reorganises attention over structure the corpus ALREADY
// holds: it voices an impression, reads it back through the enactor->perceiver edge, re-focuses,
// and quiesces. Past the ground it emits a VOID — an open question ("What of Klamm?") — never a
// leap into the gap, and it grows a reading by re-parsing grown TEXT (inquire), never committing.
// So it develops attention; it does not develop STRUCTURE, and it never commits.
//
// The walk is the delta. Three moves distinguish it:
//
//   1. IT COMMITS. Each step is a real event appended to the same append-only log the corpus
//      lives on (core/log.js). Step N+1 reads the graph projected over the log INCLUDING step N's
//      event. Continuity is not a string in a context window; it is ACCUMULATION over the log.
//      Step three's conclusion is an admitted span at step four, because it is literally there.
//
//   2. IT REACHES. The moves are SYN / CON / REC — synthesise a figure the corpus never named,
//      bond two figures the corpus left unbonded, learn a rule from a repeated relation. These
//      WRITE NEW and READ-TWO-WRITE-LINK (cube SIGNATURES): structure the corpus did not state.
//      That is the leap the answerability VOID gate would otherwise refuse.
//
//   3. IT CANNOT LAUNDER. Every step is voiced through the ENACTOR door (fromEnactor): reafference,
//      mine. By the provenance type law (core/provenance §8) canWitness(step) is FALSE — not by a
//      flag, by the type. A step can ORIENT the next step (canOrient is true for every provenance)
//      but can never WITNESS a later claim as world. A chain that read its own output as ground
//      would drift into confabulation with perfect internal citations — the worst failure, because
//      it looks audited. The type law makes that drift impossible. This is idle.js's I2 firewall,
//      per committed step.
//
// The grade a step carries (docs/ungrounded-emitted.md) is READ OFF THE LOG, never elected:
//   grounded              an EXAFFERENT event (the corpus, canWitness true) attests this claim.
//   warranted-ungrounded  no exafferent witness, but a prior REC generalises a regularity that WAS
//                         exafferently witnessed (>= 2 corpus pairs), and this step instantiates it.
//   idle-ungrounded       a bare reach: no exafferent witness, no backing rule. Shipped, marked.
//
// Termination is SATURATION, not a token budget: the walk stops when the best available reach adds
// no fresh structure the field did not already hold — the one surprise (core/surprise.js) goes flat.
// A hard maxSteps is the backstop only (arc §5.7: it should never bind if saturation is working).
//
// The loop needs NO model. A `propose` backend may be injected to let a talker RANK the confined
// menu; the loop, the firewall, the grade and the termination are model-independent. The reasoning
// is the walk over the graph, not a draw from a large network.

import { fromPerceiver, fromEnactor, classify, canWitness } from '../../core/provenance.js';
import { firm, voidRes, mintHash } from '../../core/event.js';
import { surpriseAt } from '../../core/surprise.js';
import { readGraph, IDENTITY, replayState, buildDischarge } from './cursor.js';

// ── The corpus adapter — appearance events through the PERCEIVER door ─────────
export const seedCorpus = (log, spec = [], { enactment = 'ingest' } = {}) => {
  const prov = fromPerceiver(enactment);
  for (const e of spec) {
    if (e.op === 'INS') log.append({ op: 'INS', id: e.id, label: String(e.label), prov });
    else if (e.op === 'CON') log.append({ op: 'CON', src: e.src, tgt: e.tgt ?? e.dst, via: String(e.via || 'rel'), prov });
    else log.append({ ...e, prov });
  }
  return log;
};

// ── Reading the log back into the sets the walk reasons over ──────────────────
// The fold now lives in cursor.js as readGraph(log, cursor = IDENTITY) — the CURSOR_REV
// generalization. The walk calls it at IDENTITY (or with the caller's cursor composed
// with the open scope), and IDENTITY folds exactly what the local function folded, the
// golden-parity anchor (tools/cursor/probe-replay.mjs). A figure minted by a WALK step
// (enactor INS/SYN) is admitted exactly as a corpus figure is, so the next step can bond
// to it (the accumulation). What differs is the DOOR, which the grade consults, never
// the reach. Re-exported here so existing importers keep one entrance.
export { readGraph, IDENTITY } from './cursor.js';

const bondKey = (src, dst, via) => `${src}|${via}|${dst}`;
const pairKey = (a, b) => (String(a) < String(b) ? `${a}~${b}` : `${b}~${a}`);

// ── The grade, read off the log (never elected) ───────────────────────────────
// A slack bond (Step 6 — its target holon was term-set, so this former determiner no
// longer derives it) cannot witness: the sever falls out of the DEF, and the grade
// reads the severed fold. Inert at IDENTITY — slack never arises without a DEF.
const gradeBond = ({ src, dst, via }, { bonds, rules }) => {
  const key = bondKey(src, dst, via);
  const witness = bonds.find((b) => b.canWitness && !b.slack && bondKey(b.src, b.dst, b.via) === key);
  if (witness) return { grade: 'grounded', band: firm(), witness: { seq: witness.seq, sentIdx: witness.sentIdx } };
  const rule = rules.find((r) => r.via === via && r.support >= 2);
  if (rule) return { grade: 'warranted-ungrounded', band: voidRes(0.6), warrant: { rule: rule.via, support: rule.support } };
  return { grade: 'idle-ungrounded', band: voidRes() };
};

// ── The confined menu over the live frontier ──────────────────────────────────
// The walk is cheap because the next move is drawn from a SMALL menu the graph defines, not from
// open chain-of-thought over everything sayable. The frontier is the admitted figures; from it:
//   REC  a `via` that bonds >= 2 EXAFFERENT pairs is a rule waiting to be learned (once).
//   CON  bond two admitted figures the graph has not yet bonded (relate the unrelated).
//   SYN  promote a bonded pair not yet synthesised into a higher-grain figure the corpus never
//        named (the accumulation driver — later steps build on it).
// Each candidate carries the `arrival` mass it deposits, so the loop scores it by surprise. A
// rule's mass reflects the observations it subsumes; a synthesis's mass reflects the new grain it
// introduces — so the high-information moves are legitimately surprising, not hand-weighted.
const menu = (graph, { rules, synthesised, bondsSeen }, { scope = null, supposedDone = null, scopeConsequences = 0, discharged = false } = {}) => {
  const out = [];
  const scopeName = scope?.name ?? null;
  const ids = [...graph.figures.keys()];
  const bonded = new Set(graph.bonds.map((b) => pairKey(b.src, b.dst)));
  const viaCounts = new Map();
  for (const b of graph.bonds) if (b.canWitness && !b.slack) viaCounts.set(b.via, (viaCounts.get(b.via) || 0) + 1);
  const topVia = [...viaCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'rel';

  // Every candidate carries `note` (the operator trace, for the audit) and `said` (the same
  // move voiced as a declarative claim — what the membrane hands the talker to hedge).
  // SUPPOSE — Step 5's entry move: seed an enactor INS, CON, or DEF tagged scope:S (the
  // DEF kind is Step 6's term-setting intervention). Offered only while a scope with
  // unseeded suppositions is open; absent scope, the menu is byte-identical to before.
  if (scopeName && !discharged) {
    (scope.suppositions || []).forEach((spec, idx) => {
      if (supposedDone?.has(idx)) return;
      const arrival = new Map([[`suppose:${scopeName}:${idx}`, 1]]);
      out.push({ op: 'SUPPOSE', spec, specIdx: idx, scope: scopeName, arrival, exaFrac: 1,
        note: `suppose ${describeSpec(spec)} within ${scopeName}`,
        said: `suppose ${describeSpec(spec)}` });
    });
    // DISCHARGE — fold the scope to one conditional claim once every supposition is
    // seeded and the scope has developed at least one consequence.
    if (supposedDone && supposedDone.size === (scope.suppositions || []).length && scopeConsequences > 0) {
      const arrival = new Map([[`discharge:${scopeName}`, scopeConsequences]]);
      out.push({ op: 'DISCHARGE', scope: scopeName, arrival, exaFrac: 1,
        note: `discharge ${scopeName}: it entails its ${scopeConsequences} consequence(s)`,
        said: `if the supposition holds, what followed under it follows` });
    }
  }
  // REC — learn each repeated exafferent relation, once.
  for (const [via, n] of viaCounts) {
    if (n >= 2 && !rules.some((r) => r.via === via)) {
      const arrival = new Map([[`rule:${via}`, n], [`licenses:${via}`, 1]]);
      out.push({ op: 'REC', via, support: n, arrival, exaFrac: 1, participants: partiesOf(graph.bonds, via, scopeName),
        note: `learn ${via} as a rule (holds across ${n} attested pairs)`,
        said: `“${via}” recurs across what was read (${n} attested pairs)` });
    }
  }
  // CON — bond an unbonded admitted pair. `via` is the graph's most-supported relation.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      if (bonded.has(pairKey(a, b)) || bondsSeen.has(pairKey(a, b))) continue;
      const arrival = new Map([[`bond:${pairKey(a, b)}`, 1]]);
      out.push({ op: 'CON', src: a, dst: b, via: topVia, arrival, exaFrac: exaFracOf([a, b], graph.figures, scopeName),
        note: `bond ${graph.figures.get(a)?.label} ${topVia} ${graph.figures.get(b)?.label}`,
        said: `${graph.figures.get(a)?.label} ${topVia} ${graph.figures.get(b)?.label}` });
    }
  }
  // SYN — promote a bonded pair not yet synthesised. Only a pair of ADMITTED FIGURES is
  // promotable: the live parser also bonds figures to proposition/role nodes the walk never
  // admitted, and a synthesis over one of those has no label to voice (the "X and undefined"
  // figure) and no frontier value.
  for (const b of graph.bonds) {
    if (!graph.figures.has(b.src) || !graph.figures.has(b.dst)) continue;
    const pk = pairKey(b.src, b.dst);
    if (synthesised.has(pk)) continue;
    const promotedSeq = graph.figures.size + 1 + out.length;
    const id = mintHash(promotedSeq);
    const newGrain = Math.max(0, ...graph.grains) + 1;
    const arrival = new Map([[`syn:${pk}`, 1]]);
    out.push({ op: 'SYN', id, members: [b.src, b.dst], grain: newGrain, pairKey: pk, arrival, exaFrac: exaFracOf([b.src, b.dst], graph.figures, scopeName),
      label: `${graph.figures.get(b.src)?.label}+${graph.figures.get(b.dst)?.label}`,
      note: `synthesise a figure over {${graph.figures.get(b.src)?.label}, ${graph.figures.get(b.dst)?.label}}`,
      said: `${graph.figures.get(b.src)?.label} and ${graph.figures.get(b.dst)?.label} act as one figure` });
  }
  return out;
};

const describeSpec = (spec = {}) =>
  spec.op === 'INS' ? `a figure ${spec.label ?? spec.id}`
    : spec.op === 'DEF' ? `${spec.id} = ${spec.value}`
      : `${spec.src} ${spec.via ?? 'rel'} ${spec.tgt ?? spec.dst}`;

// Step 5's anchoring — the Gate B lever. A supposition tagged with the OPEN scope counts
// as anchored (contributing one) for moves inside that scope, so the walk can DEVELOP
// the hypothetical instead of starving it; outside any scope the fraction is what it
// always was, and a stray enactor figure still halves its moves.
const exaFracOf = (ids, figures, scopeName = null) => {
  if (!ids.length) return 1;
  const anchored = ids.filter((id) => {
    const f = figures.get(id);
    if ((f?.door ?? 'perceiver') === 'perceiver') return true;
    return scopeName != null && f?.scope === scopeName;
  }).length;
  return anchored / ids.length;
};

// The Gate B parity-leak fix: a rule's participants are the figures of its ATTESTED
// pairs (plus in-scope suppositions when a scope is open). A stray enactor bond outside
// any open scope never rides into the actual REC.
const partiesOf = (bonds, via, scopeName = null) => {
  const s = new Set();
  for (const b of bonds) {
    if (b.via !== via) continue;
    if (!(b.canWitness || (b.scope != null && b.scope === scopeName))) continue;
    s.add(b.src); s.add(b.dst);
  }
  return [...s];
};

// ── The one surprise, over the walk's own basis (core/surprise.js) ────────────
const surpriseOf = (candidate, profile, gamma) => {
  const { bayesBits } = surpriseAt(profile, candidate.arrival, { gamma });
  return bayesBits;
};

// ── The walk ──────────────────────────────────────────────────────────────────
// CURSOR_REV additions, both inert when absent (the golden-parity anchor):
//   cursor   a reason/cursor.js cursor the fold runs under (upto / grain / origin / door).
//   scope    { name, suppositions: [specs] } — opens a hypothetical: the fold includes
//            scope-tagged events, the menu gains SUPPOSE/DISCHARGE, in-scope suppositions
//            count anchored (the Gate B lever), and every step that touches scoped
//            material is committed scope-tagged and graded `conditional` — a warrant on
//            the scope, never a witness.
export const walkReasoning = async (log, {
  gamma = 0.7, epsilon = 0.02, maxSteps = 24, enactment = 'reason', propose = null, selfReachBudget = 3,
  cursor = null, scope = null,
} = {}) => {
  const rules = [];
  const synthesised = new Set();
  const bondsSeen = new Set();
  const profile = new Map();
  let selfReach = selfReachBudget;
  const steps = [];
  const saturationTrace = [];
  const supposedDone = new Set();
  let scopeConsequences = 0;
  let discharged = false;
  const foldCursor = scope?.name ? { ...(cursor || {}), scope: scope.name } : (cursor || IDENTITY);

  for (let i = 0; i < maxSteps; i++) {
    const graph = readGraph(log, foldCursor);
    const cands = menu(graph, { rules, synthesised, bondsSeen }, { scope, supposedDone, scopeConsequences, discharged });
    if (!cands.length) { saturationTrace.push({ i, reason: 'no-admissible-move', bits: 0 }); break; }

    // A bounded reach past the ground: the walk may extrapolate beyond the corpus a fixed number
    // of steps (self-anchored moves, exaFrac < 1), then it must stop reaching and only corpus-
    // anchored structure keeps it alive. This is the policy the analysis named — the decomposable
    // reasoning is surfaced, and the rest is declined rather than spun (arc/saturation.js: saturate
    // on GROUND coverage, not on finding fresh self-symbols).
    const live = selfReach > 0 ? cands : cands.filter((c) => (c.exaFrac ?? 1) >= 1);
    if (!live.length) { saturationTrace.push({ i, reason: 'ground-covered', bits: 0 }); break; }
    const scored = live.map((c) => ({ c, bits: surpriseOf(c, profile, gamma), rank: surpriseOf(c, profile, gamma) * (c.exaFrac ?? 1) }))
      .sort((a, b) => b.rank - a.rank);
    let choice = scored[0];
    if (typeof propose === 'function') {
      const picked = await propose(scored.map((s) => s.c), { graph, profile });
      if (picked) choice = scored.find((s) => s.c === picked) || { c: picked, bits: surpriseOf(picked, profile, gamma) };
    }

    // SATURATION — the best available reach adds no fresh structure. The field ends the walk.
    if (choice.bits < epsilon) { saturationTrace.push({ i, reason: 'saturated', bits: round3(choice.bits) }); break; }
    if ((choice.c.exaFrac ?? 1) < 1) selfReach -= 1;   // spend the reach budget on a self-anchored move
    const cand = choice.c;
    const prov = fromEnactor(enactment);   // mine — canWitness will be false, by type

    let event, grade, warrant = null, witness = null, sites = [];
    if (cand.op === 'SUPPOSE') {
      // Step 5's entry: seed the supposition through the enactor door, scope-tagged and
      // marked supposed. A supposed CON registers in bondsSeen so the menu never
      // re-proposes the pair it already holds hypothetically.
      supposedDone.add(cand.specIdx);
      const spec = cand.spec;
      event = { ...spec, scope: cand.scope, supposed: true, prov };
      if (spec.op === 'CON' && spec.src != null) bondsSeen.add(pairKey(spec.src, spec.tgt ?? spec.dst));
      grade = 'conditional'; warrant = { scope: cand.scope };
      sites = [spec.id, spec.src, spec.tgt ?? spec.dst].filter((x) => x != null);
    } else if (cand.op === 'DISCHARGE') {
      // Step 5's exit: fold the scope to ONE conditional claim — S entails its
      // consequences — through the same single append path as every other step.
      discharged = true;
      event = buildDischarge(log, cand.scope, { enactment }) ?? { op: 'REC', kind: 'discharge', scope: cand.scope, if: [], then: [], prov };
      grade = 'conditional'; warrant = { scope: cand.scope }; sites = [];
    } else if (cand.op === 'REC') {
      rules.push({ via: cand.via, support: cand.support });
      event = { op: 'REC', via: cand.via, support: cand.support, prov };
      grade = 'warranted-ungrounded'; warrant = { induced_from: cand.support };
      sites = cand.participants.slice();          // keep the rule's figures live on the frontier
    } else if (cand.op === 'SYN') {
      synthesised.add(cand.pairKey);
      const g = gradeBond({ src: cand.members[0], dst: cand.members[1], via: 'coheres' }, { bonds: graph.bonds, rules });
      event = { op: 'SYN', id: cand.id, label: cand.label, members: cand.members, grain: cand.grain, prov };
      grade = g.grade === 'grounded' ? 'warranted-ungrounded' : g.grade;   // a source never mints your figure
      warrant = g.warrant ?? null; sites = cand.members.slice();
    } else { // CON
      bondsSeen.add(pairKey(cand.src, cand.dst));
      const g = gradeBond({ src: cand.src, dst: cand.dst, via: cand.via }, { bonds: graph.bonds, rules });
      event = { op: 'CON', src: cand.src, tgt: cand.dst, via: cand.via, prov };
      grade = g.grade; warrant = g.warrant ?? null; witness = g.witness ?? null; sites = [cand.src, cand.dst];
    }

    // Step 5's grade branch: a step that touches scoped material IS an in-scope
    // consequence — committed scope-tagged, graded `conditional`, warrant the scope,
    // never a witness. Every downstream consequence inherits the scope it was set under.
    const stepScope = (scope?.name && !discharged && cand.op !== 'SUPPOSE' && cand.op !== 'DISCHARGE'
      && sites.some((id) => graph.figures.get(id)?.scope === scope.name)) ? scope.name : null;
    if (stepScope) {
      event = { ...event, scope: stepScope };
      grade = 'conditional'; warrant = { scope: stepScope }; witness = null;
      scopeConsequences += 1;
    }

    const sealed = log.append(event);   // COMMIT — step i+1 reads it back off the log

    const builtOnSelf = sites.some((id) => graph.figures.get(id)?.door === 'enactor');
    steps.push(Object.freeze({
      i, op: cand.op, note: cand.note, said: cand.said ?? null, sites, seq: sealed.seq, grade, warrant, witness,
      prov: sealed.prov, classified: classify(sealed.prov),
      canWitness: canWitness(sealed.prov),   // FALSE, by type — the firewall
      builtOnSelf, bits: round3(choice.bits),
      ...(stepScope || cand.op === 'SUPPOSE' || cand.op === 'DISCHARGE' ? { scope: stepScope ?? cand.scope } : {}),
    }));

    for (const [a, m] of cand.arrival) profile.set(a, (profile.get(a) || 0) + m);
    saturationTrace.push({ i, reason: 'reach', op: cand.op, bits: round3(choice.bits) });
  }

  const last = saturationTrace.at(-1);
  const quiesced = !!last && ['saturated', 'no-admissible-move', 'ground-covered'].includes(last.reason);
  const gradeCounts = steps.reduce((m, s) => (m[s.grade] = (m[s.grade] || 0) + 1, m), {});
  const grounded = gradeCounts['grounded'] || 0;
  const groundedFraction = steps.length ? grounded / steps.length : 0;

  return Object.freeze({
    steps, quiesced, saturationTrace, groundedFraction, gradeCounts,
    everyStepIsMine: steps.every((s) => s.canWitness === false),
  });
};

const round3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

// noStepLaunders — the type-law guarantee, as a predicate for the conformance battery
// (docs/ungrounded-emitted.md I1/I2): every committed step is reafference (cannot witness), and a
// `grounded` grade can only ever come from an EXAFFERENT witness (gradeBond), never from the walk.
export const noStepLaunders = (result) =>
  result.steps.every((s) => s.canWitness === false);

// noScopeLaunders — noStepLaunders extended to the modal family (Step 5): every step is
// still reafference, AND every step that touched a scope carries the `conditional` grade
// with the scope as its warrant — a supposition's consequence never reads grounded or
// warranted, and never sheds the scope it was set under.
export const noScopeLaunders = (result) =>
  noStepLaunders(result) &&
  result.steps.every((s) => !s.scope || (s.grade === 'conditional' && s.warrant?.scope === s.scope));

// pastMenu — Step 4, regret as a replay of walk state. menu() is a pure function of the
// graph and { rules, synthesised, bondsSeen }; refold both at seq k and the result is the
// set of roads not taken at step k, scorable against what arrived by the profile delta.
// Read-only: nothing is committed.
export const pastMenu = (log, k, { scope = null } = {}) =>
  menu(readGraph(log, { upto: k, ...(scope ? { scope } : {}) }), replayState(log, k), scope ? { scope: { name: scope } } : {});
