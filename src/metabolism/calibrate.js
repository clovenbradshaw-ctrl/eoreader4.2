// EO: EVA·SEG·REC(Lens,Network → Paradigm,Atmosphere, Binding·Tracing·Composing) — the calibration loop
// metabolism/calibrate.js — dev/eval/REC over the FOLD → PLAN → CHUNK-PROMPT pipeline (see
// docs/calibration-mode.md), not the surfer's retrieval scaffolding lift.js was written for. Same
// objects, same firewall, aimed one faculty over: judge.js/challenger.js/proposer.js already put a
// frontier model in three roles the population cannot game (grader, user, breeder); this module
// adds a fourth read (fold-plan-judge.js) and composes all four with the existing transfer
// falsifier (transfer.js) into ONE cycle:
//
//   1. challenger POSES a realistic generation task (an essay, an answer, a coding task) — the user.
//   2. `ideal(task)` — the frontier model answers DIRECTLY, unconstrained by fold/plan/chunking.
//      This is the ceiling lift.js already wants: what the task is worth when nothing narrows the
//      context.
//   3. `local(task, allocation)` — the ACTUAL product pipeline (fold → plan → one prompt per chunk
//      → the frozen local model), run at the genome's CURRENT allocation (genome.js: foldWidth,
//      retrieveK, bindFloor, maxTokens, arcEpsilon, gamma — the fold/plan/chunk-prompt dials
//      already live there, unlabeled). Returns { answer, fold, plan }.
//   4. FOUR independent reads, each naming which stage to blame:
//        challenger.evaluate      [answer]        grounded / flowing / resolved
//        foldPlanJudge.gradeFold  [fold]           sufficient / salient / missing
//        foldPlanJudge.gradePlan  [plan]           decomposition / coverage / ordered
//        judge.grade              [faithfulness]   validated against the ideal-as-document
//   5. transferProbe.measure — the QUANTITATIVE falsifier, unchanged from transfer.js: bare vs.
//      through-the-pipeline on TWO frozen local models, keep the WEAKER lift. A gain that only
//      shows up on one frozen leaf is a prompt hack against that leaf, not a better fold/plan —
//      the exact failure lift.js was built to catch, now pointed at the fold/plan dials.
//   6. proposer.propose — the breeder reads the FOUR stage-tagged critiques and proposes ONE dial
//      move on the SAME genome (no new heritable unit invented). It proposes; the tournament
//      (population.js / select.js, already wired) ratifies. The firewall holds.
//
// Nothing here calls a model or an API. Every step is an injected function or an already-armed
// metabolism organ; missing any of them degrades that ONE reading to null, never the whole cycle.

// calibrationRunner — adapt a frozen backend + the two pipeline entry points into the
// { id, run({task, surfer, scaffolded}) → Promise<string> } shape transfer.createTransferProbe
// wants. `surfer` here is the calibration ALLOCATION (genome.express()), not a retrieval surfer —
// the probe itself is allocation-agnostic; it only ever threads the argument through untouched.
export const calibrationRunner = ({ id, backend, local, bare } = {}) => {
  if (!id || typeof local !== 'function' || typeof bare !== 'function') {
    throw new TypeError('calibrationRunner: id, local(task, allocation, backend), and bare(task, backend) are required');
  }
  return Object.freeze({
    id,
    async run({ task, surfer, scaffolded } = {}) {
      const out = scaffolded ? await local(task, surfer, backend) : await bare(task, backend);
      return typeof out === 'string' ? out : (out && out.answer) || '';
    },
  });
};

// runCalibrationCycle — one full pass. `genome` is the running metabolism unit (genome.js /
// createOrganism) — its `.express()` is the allocation `local()` and the transfer probe both read.
// Returns null only when the challenger itself is dry-run (no task to calibrate against); every
// other reading degrades independently to null on its own field, never aborting the cycle.
export const runCalibrationCycle = async ({
  challenger, foldPlanJudge = null, judge = null, transferProbe = null, proposer = null,
  ideal, local, genome, material = null, persona = null, resource = 0, lineage = [], season = null,
} = {}) => {
  if (!challenger || typeof ideal !== 'function' || typeof local !== 'function' || !genome) return null;
  const task = await challenger.challenge({ material, persona });
  if (!task) return null;

  const allocation = genome.express();
  let idealAnswer = '', sample = null;
  try { idealAnswer = (await ideal(task)) || ''; } catch { idealAnswer = ''; }
  try { sample = await local(task, allocation); } catch { sample = null; }
  const answer = (sample && typeof sample === 'object') ? (sample.answer || '') : (sample || '');
  const fold = sample && typeof sample === 'object' ? sample.fold : null;
  const plan = sample && typeof sample === 'object' ? sample.plan : null;

  const [satisfaction, foldVerdict, planVerdict, faithVerdict, transfer] = await Promise.all([
    safe(() => challenger.evaluate({ question: task.question, answer, intent: task.intent, sources: fold, persona })),
    safe(() => foldPlanJudge && foldPlanJudge.gradeFold({ task, fold, idealAnswer })),
    safe(() => foldPlanJudge && foldPlanJudge.gradePlan({ task, plan, idealAnswer })),
    safe(() => judge && judge.grade({ question: task.question, answer, document: idealAnswer })),
    safe(() => transferProbe && transferProbe.measure({ task: { ...task, document: idealAnswer }, surfer: allocation, resource })),
  ]);

  // the critiques the breeder reads — every rationale that survived, each TAGGED by stage so
  // proposer.js's frontier reader can tell a fold problem from a plan problem from an answer one.
  const critiques = [
    satisfaction && satisfaction.critique ? { critique: `[answer] ${satisfaction.critique}`, satisfied: satisfaction.satisfied } : null,
    foldVerdict && foldVerdict.rationale ? { critique: `[fold] ${foldVerdict.rationale}${foldVerdict.sufficient === false ? ' (insufficient)' : ''}`, satisfied: foldVerdict.salience } : null,
    planVerdict && planVerdict.rationale ? { critique: `[plan] ${planVerdict.rationale}`, satisfied: planVerdict.coverage } : null,
    faithVerdict && faithVerdict.rationale ? { critique: `[faithfulness] ${faithVerdict.rationale}`, satisfied: faithVerdict.validated } : null,
  ].filter(Boolean);

  let proposal = null;
  if (proposer && typeof proposer.propose === 'function') {
    try { proposal = await proposer.propose({ unit: genome, critiques, lineage, season }); } catch { proposal = null; }
  }

  return Object.freeze({
    task, idealAnswer, answer, fold, plan, allocation,
    satisfaction, foldVerdict, planVerdict, faithVerdict, transfer,
    critiques: Object.freeze(critiques),
    proposal,
  });
};

const safe = async (fn) => { try { return await fn(); } catch { return null; } };
