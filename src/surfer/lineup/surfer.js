// EO: EVA·SEG·SYN(Field,Network → Network,Lens, Tracing,Composing,Dissecting) — one surfer
// lineup/surfer.js — one surfer of the chorus: a temperament riding the graph.
//
// A surfer is a temperament (temperaments.js) bound to a traversal. It does not own the
// walk — the walk is INJECTED (reason/walk.js by default), the same firewall every
// organ-touching module runs — so a test can drive the chorus with a stubbed walk and
// production runs the real one. The surfer's whole job is to hand the walk its
// temperament's dials and taste, then read the committed steps back as FINDINGS the
// chorus can pool, weigh, and separate.
//
// A finding is a step the walk committed, re-read on the surfer's side: its operator,
// the figures it touched (the `sites` — a stable key for corroboration, because two
// surfers reaching the same move over the same figures is the consensus signal.js
// reads), the grade the log assigned it (grounded / warranted / conditional / idle —
// never elected, read off the log, walk.js), and its surprise in bits. The surfer adds
// no judgement of its own; it only attributes each finding to itself so the reward can
// be attributed back. The walk's firewall still holds: every step is reafference
// (canWitness false, by type), so nothing the chorus commits can later witness itself.

import { walkReasoning } from '../reason/index.js';
import { proposeFrom } from './temperaments.js';

// The weight the log's grade carries as evidence — grounded structure is worth most, an
// idle reach least. Read off the grade the walk assigned; the surfer never re-grades.
export const GRADE_WEIGHT = Object.freeze({
  'grounded': 1,
  'warranted-ungrounded': 0.7,
  'conditional': 0.5,
  'idle-ungrounded': 0.2,
});
export const gradeWeightOf = (grade) => GRADE_WEIGHT[grade] ?? 0.2;

// siteKey — the corroboration key: an operator over a sorted set of figure ids. Two
// surfers that reach the SAME move over the SAME figures land on the same key, which is
// how the chorus recognises an independently-corroborated finding (signal.js). Uses the
// underlying figure ids (stable across forks), never a freshly-minted synthesis id.
export const siteKey = (op, sites) =>
  `${op}:${[...(sites || [])].map(String).sort().join('+')}`;

// createSurfer — bind a temperament to an injected walk. `walk(log, opts)` must return a
// walk result ({ steps, quiesced, ... }); the default is the real reasoning walk.
export const createSurfer = ({ id, temperament, walk = walkReasoning } = {}) => {
  if (!temperament) throw new Error('a surfer needs a temperament (temperaments.js)');
  const surferId = id || temperament.name;
  // the propose backend is surprise-aware — it reads the walk's live profile to score each
  // candidate, so taste chooses only among moves that clear this temperament's quit-threshold.
  const propose = proposeFrom(temperament, { gamma: temperament.knobs.gamma, epsilon: temperament.knobs.epsilon });

  // surf — ride ONE (already-forked) graph-log. `maxSteps` may override the temperament's
  // span (the lineup grants the well-rewarded a deeper walk — reward.js's evolutionary
  // lever); every other dial is the temperament's. Returns the surfer's findings and the
  // spend they cost (the step count — the resource the reward divides signal by).
  const surf = async (log, { maxSteps = null, enactment = 'lineup' } = {}) => {
    const { gamma, epsilon, selfReachBudget } = temperament.knobs;
    const steps = maxSteps != null ? maxSteps : temperament.knobs.maxSteps;
    let res;
    try {
      res = await walk(log, { gamma, epsilon, maxSteps: steps, selfReachBudget, propose, enactment });
    } catch {
      res = { steps: [], quiesced: false };   // a walk outage is an empty round for this voice, never a crash
    }

    const findings = (res.steps || []).map((s) => Object.freeze({
      key: siteKey(s.op, s.sites),
      surfer: surferId,
      temperament: temperament.name,
      op: s.op,
      sites: Object.freeze([...(s.sites || [])]),
      said: s.said ?? s.note ?? null,
      grade: s.grade,
      weight: gradeWeightOf(s.grade),
      bits: typeof s.bits === 'number' ? s.bits : 0,
      builtOnSelf: !!s.builtOnSelf,       // a step that stood on the surfer's own prior reach (a lead, not ground)
      seq: s.seq,
    }));

    // The tally the reward reads without re-walking the findings: how much of what this
    // voice committed was grounded vs a bare reach — its own signal-to-spend before the
    // chorus weighs in.
    const quality = findings.reduce((q, f) => {
      if (f.grade === 'grounded') q.grounded += 1;
      else if (f.grade === 'idle-ungrounded') q.idle += 1;
      else q.warranted += 1;
      return q;
    }, { grounded: 0, warranted: 0, idle: 0 });

    // THE VOID READING (sources.js's gate reads this). The walk grades itself off the log;
    // here we lift the three quantities that say whether this surfer hit a gap the GRAPH
    // could not close — the measured void that earns a web search, and nothing else does
    // (turn/propose.js: "a sound turn never reaches for the net"). `lastReason` is why the
    // walk stopped (ground-covered = it exhausted the corpus-anchored moves and only
    // reaches remained — the corpus is spent), `groundedFraction` how much of what it
    // committed was corpus-anchored, `idle` how many bare reaches are open leads.
    const walkSummary = {
      quiesced: !!res.quiesced,
      groundedFraction: typeof res.groundedFraction === 'number'
        ? res.groundedFraction
        : (findings.length ? quality.grounded / findings.length : 0),
      lastReason: res.saturationTrace?.[res.saturationTrace.length - 1]?.reason ?? null,
      idle: quality.idle,
    };
    // the open leads — the idle-ungrounded findings, the questions this surfer could not
    // answer from the graph. sources.js turns the strongest into a query to the world.
    const openLeads = findings.filter((f) => f.grade === 'idle-ungrounded')
      .sort((a, b) => b.bits - a.bits);

    return Object.freeze({
      id: surferId,
      temperament: temperament.name,
      steps: findings.length,        // the spend — every committed step cost a look
      quiesced: !!res.quiesced,       // did it stop on saturation (honest) or hit the span (starved)?
      findings: Object.freeze(findings),
      quality: Object.freeze(quality),
      walk: Object.freeze(walkSummary),
      openLeads: Object.freeze(openLeads),
    });
  };

  return Object.freeze({ id: surferId, temperament, surf });
};
