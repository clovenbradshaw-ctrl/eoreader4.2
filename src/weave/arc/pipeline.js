// EO: SYN·CON·EVA·NUL(Field,Network → Network,Void, Composing,Binding,Tracing,Clearing) — runArc: fold section plan
// runArc — the arc is a fold of its section plan.
//
// Same spine, three levels:
//   document = fold of the event log  → projectGraph
//   turn     = fold of the stage list → audit log
//   arc      = fold of the section plan → the assembled long answer
//
// A turn produces one grounded answer; an arc produces a long, multi-section
// answer by planning sections from retrieved evidence, generating each as a
// gated sub-turn, and STOPPING when the evidence budget is spent — not at a
// token count. Length is emergent, monotone in evidence, and auditable: every
// step is a log event, so "why was this answer eleven paragraphs?" is answered
// by reading the coverage trace, not by guessing at the model.
//
// The one exogenous knob is the three-valued `coverage` policy
// (terse / standard / exhaustive), never a token target.

import { runTurn } from '../../turn/index.js';
import { retrieveHybrid, pickRetrievalEmbedder } from '../../surfer/retrieve/index.js';
import { bindAndVeto } from '../../enactor/ground/index.js';
import { classifyScope, isPointScope } from './scope.js';
import { bindableSpans, clusterByEmbedding } from './cluster.js';
import { planSections } from './plan.js';
import { evaCoverageGate } from './saturation.js';
import { generateSection, stripUnboundCorrective } from './generate.js';
import { assembleArc, arcSources } from './assemble.js';
import { REBIND_THRESHOLD, MAX_SECTIONS, MAX_TOTAL_TOKENS } from './constants.js';

const nowMs = () =>
  (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

// A crude token estimate (whitespace words) for the MAX_TOTAL_TOKENS backstop —
// a guard only; it should never bind if saturation is working (§5.7).
const tokenEstimate = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

// The bound prefix of a drifting section: the maximal LEADING run of claims that
// bound to a span. A small model states grounded claims and then drifts into
// confabulation; this cuts at the drift, keeping the grounded opening (§5.5).
const boundPrefixText = (bound = []) => {
  const kept = [];
  for (const b of bound) { if (b.citation) kept.push(b.claim); else break; }
  return kept.join(' ');
};

export const runArc = async ({
  question, doc, docs, model, embedder, geometricEmbedder,
  auditLog, coverage = 'standard', onSection = null,
  // `spans` is the retrieval-injection seam (mirrors the turn's per-stage
  // injectability): when given, the arc plans over THESE ranked spans instead of
  // retrieving — the supply is controlled. Null on a real arc → it retrieves.
  spans = null,
  history = [], grounding = 'auto', now = null, signal = null,
  // every other turn knob is forwarded verbatim to the degenerate path
  ...turnOpts
} = {}) => {
  const t0 = nowMs();
  const scope = classifyScope(question);

  // DEGENERATE ARC ≡ TURN (§8, invariant 6). A `point` question wants one
  // section and must be byte-identical to the present single-turn path, so the
  // arc delegates to runTurn outright — no planning, no re-binding. The turn IS
  // the one-section arc; this is that identity made literal.
  const delegate = async (why) => {
    const turn = await runTurn({
      question, doc, docs, model, embedder, geometricEmbedder,
      auditLog, history, grounding, now, signal, ...turnOpts,
    });
    return {
      answer: turn.answer,
      sources: turn.sources || [],
      sections: [],            // a degenerate arc plans no sections — it is the turn
      scopeClass: scope.scopeClass,
      coverage,
      degenerate: true,
      lengthTrace: { scopeClass: scope.scopeClass, matched: scope.matched, degenerate: true, why },
      turn: turn.turn,
      flags: turn.flags || [],
    };
  };
  if (isPointScope(scope.scopeClass)) return delegate('point-scope');

  // SUPPLY (§5.2). Retrieve a wide pool, keep the bindable spans, measure the
  // total mass, and cluster — each cluster a candidate section.
  const re = pickRetrievalEmbedder({ embedder, geometricEmbedder });
  const pool = spans
    ? spans
    : ((doc && grounding !== 'free') ? await retrieveHybrid(doc, question, re, 18) : []);
  const { bindable, totalMass } = bindableSpans(pool);
  const clusters = await clusterByEmbedding(bindable, embedder);

  // SEG (§5.3). Reconcile demand against supply under the coverage policy.
  const plan = planSections({ scopeClass: scope.scopeClass, clusters, totalMass, coverage, maxSections: MAX_SECTIONS });

  // No bindable supply to plan over — there is nothing for the arc to do that a
  // turn does not do better (the turn answers the absence honestly). Delegate, so
  // an arc is never strictly worse than the turn it generalizes.
  if (!plan.sections.length) return delegate('no-supply');

  // The arc gets its own audit record — one turn at the higher level, a fold of
  // its sections rather than its stages. (The audit adds no new source of truth:
  // the SectionEvents and length-decision trace are steps and finish-fields on
  // the same append-only log the turn writes.)
  const rec = auditLog.turn(question);

  rec.step('plan', {
    scopeClass: scope.scopeClass, matched: scope.matched, coverage,
    totalMass: round3(totalMass), clusters: clusters.length,
    clusterMasses: clusters.map(c => round3(c.mass)),
    planned: plan.sections.length, order: plan.order,
  });

  // Mass per span index, for the saturation gate's covered-mass accounting.
  const massByIdx = new Map(bindable.map(s => [s.idx, s.score || 0]));

  // THE FOLD over the section plan (§4). Each section: EVA gate → generate →
  // bind+veto → faithfulness gate → append. A section that fails the EVA gate
  // terminates the arc (NUL hold); a section that cannot ground is truncated,
  // regenerated once, or dropped, and never compounds.
  const arc0 = {
    sections: [],                     // the appended SectionEvents
    coveredSpans: new Set(),
    coveredMass: 0,
    totalTokens: 0,
    terminate: false,
    stop: null,                       // why the arc stopped (saturation / guard / plan-exhausted)
  };

  const finalAcc = await plan.sections.reduce(async (accPromise, section, index) => {
    const acc = await accPromise;
    if (acc.terminate) return acc;

    // EVA → NUL: would this section add new coverage?
    const gate = evaCoverageGate(section, acc, { totalMass });
    if (!gate.proceed) {
      rec.step('saturate', { index, reason: gate.reason, remainingFrac: round3(gate.remainingFrac), novelty: round3(gate.novelty) });
      return { ...acc, terminate: true, stop: gate.reason };
    }

    // MAX_TOTAL_TOKENS backstop (§5.7) — a runaway guard, not policy.
    if (acc.totalTokens >= MAX_TOTAL_TOKENS) {
      rec.step('guard', { index, guard: 'max-total-tokens', totalTokens: acc.totalTokens });
      return { ...acc, terminate: true, stop: 'guard:max-total-tokens' };
    }

    // CON: generate the section, bind + veto against its OWN spans.
    let gen = await generateSection(section, { doc, model, signal });
    let gated = bindAndVeto(gen.rawOutput, section.spans, { doc, question: section.subClaim, task: 'answer' });
    let action = 'append';

    if (gated.boundFraction >= 1) {
      action = 'append';
    } else if (gated.boundFraction >= REBIND_THRESHOLD) {
      // Truncate to the bound prefix and keep — cut the drift, keep the grounded opening.
      const prefix = boundPrefixText(gated.bound);
      if (prefix) { gated = bindAndVeto(prefix, section.spans, { doc, question: section.subClaim, task: 'answer' }); action = 'truncate'; }
      else action = 'drop';
    } else {
      // Regenerate ONCE with the unbound claims stripped from the allowed set.
      const corrective = stripUnboundCorrective(gated.bound);
      const gen2 = await generateSection(section, { doc, model, corrective, signal });
      const gated2 = bindAndVeto(gen2.rawOutput, section.spans, { doc, question: section.subClaim, task: 'answer' });
      if (gated2.boundFraction >= REBIND_THRESHOLD) {
        const prefix2 = boundPrefixText(gated2.bound);
        if (prefix2) { gen = gen2; gated = bindAndVeto(prefix2, section.spans, { doc, question: section.subClaim, task: 'answer' }); action = 'regenerate'; }
        else action = 'drop';
      } else {
        action = 'drop';
      }
    }

    // No empty sections (§8, invariant 1): an appended section earns ≥ 1 citation.
    if (action === 'drop' || !gated.sources.length) {
      rec.step('section', { index, action: 'drop', subClaim: section.subClaim, spanSet: section.spanSet,
        reason: gated.sources.length ? 'unsalvageable' : 'no-citation' });
      return acc;
    }

    // APPEND — mark the section's spans covered, add only the NEW mass (so a
    // shared span is never double-spent), and record the SectionEvent.
    const coveredSpans = new Set(acc.coveredSpans);
    let addedMass = 0;
    for (const idx of section.spanSet) {
      if (!coveredSpans.has(idx)) { addedMass += massByIdx.get(idx) || 0; coveredSpans.add(idx); }
    }
    const coveredMass = acc.coveredMass + addedMass;
    const coverageAfter = totalMass > 0 ? coveredMass / totalMass : 0;
    const totalTokens = acc.totalTokens + tokenEstimate(gated.answer);

    const event = {
      op: 'CON', index,
      subClaim: section.subClaim,
      spanSet: section.spanSet,
      budget: { floor: section.floor, ceiling: section.ceiling },
      prompt: gen.messages.map(m => `${m.role}: ${m.content}`).join('\n\n'),
      rawOutput: gen.rawOutput,
      bound: gated.bound,
      vetoed: gated.vetoes,
      sources: gated.sources,
      answer: gated.answer,
      action,
      coverageAfter,
    };
    rec.step('section', { index, action, subClaim: section.subClaim, spanSet: section.spanSet,
      cited: gated.sources.length, boundFraction: round3(gated.boundFraction),
      vetoes: gated.vetoes.map(v => v.id), coverageAfter: round3(coverageAfter) });

    return { ...acc, sections: [...acc.sections, event], coveredSpans, coveredMass, totalTokens };
  }, Promise.resolve(arc0));

  const stop = finalAcc.stop || (finalAcc.sections.length < plan.sections.length ? 'plan-exhausted-with-drops' : 'plan-exhausted');
  const answer = assembleArc(finalAcc.sections);
  const sources = arcSources(finalAcc.sections);

  // THE LENGTH-DECISION TRACE (§7) — the length of every answer as a reviewable
  // decision: the scope and why, the supply, the coverage cut, planned vs.
  // realized section count and which sections were dropped/truncated/regenerated,
  // and the saturation reading at termination.
  const lengthTrace = {
    scopeClass: scope.scopeClass, matched: scope.matched, coverage,
    totalMass: round3(totalMass),
    clusterCount: clusters.length,
    clusterMasses: clusters.map(c => round3(c.mass)),
    coverageSelected: plan.coverageSelected,
    plannedSections: plan.sections.length,
    realizedSections: finalAcc.sections.length,
    actions: finalAcc.sections.map(s => ({ index: s.index, action: s.action })),
    coverageAfter: finalAcc.sections.map(s => round3(s.coverageAfter)),
    finalCoverage: round3(totalMass > 0 ? finalAcc.coveredMass / totalMass : 0),
    stop,
  };

  // Project the per-section gate outcomes into the turn's flag/veto channel so
  // the existing audit panel reads them exactly as a turn's.
  const flags = finalAcc.sections.flatMap(s => (s.vetoed || []).map(v => ({ ...v, section: s.index })));

  rec.finish({
    route: 'arc',
    grounding,
    answer,
    sources,
    bound: finalAcc.sections.flatMap(s => s.bound || []),
    vetoes: flags,
    flags,
    arc: {                            // the arc's own record on the same append-only log
      coverage, scopeClass: scope.scopeClass,
      totalMass: round3(totalMass),
      sections: finalAcc.sections.map(s => ({
        op: s.op, index: s.index, subClaim: s.subClaim, spanSet: s.spanSet,
        budget: s.budget, action: s.action, coverageAfter: round3(s.coverageAfter),
        vetoed: s.vetoed, sources: s.sources,
      })),
      lengthTrace,
    },
  });

  if (onSection)
    finalAcc.sections.forEach(s => { try { onSection(s, nowMs() - t0); } catch { /* projection only */ } });

  return {
    answer, sources,
    sections: finalAcc.sections,
    scopeClass: scope.scopeClass,
    coverage,
    degenerate: false,
    lengthTrace,
    flags,
    turn: rec,
  };
};

const round3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
