// EO: NUL·SEG·SIG·EVA·CON·REC·DEF(Field,Network,Kind → Network,Field,Lens,Paradigm,Void, Tending·Clearing·Tracing·Making·Composing·Binding·Dissecting) — barrel
// lineup/index.js — the chorus of surfers (docs/cooperative-graph-surfers.md).
//
// A lineup — the surfers' word for the group waiting in the water together — of graph
// surfers, cooperative and evolutionary. Each round, every voice in the cast:
//
//   1. BORROWS the sources the chorus has already proven meaningful (sources.js's commons),
//      seeded free — one voice's confirmed page is every voice's starting material.
//   2. SURFS a fork of the graph with its own temperament (temperaments.js) — ADHD chasing
//      the novel lead, type A consolidating on ground, and the rest between.
//   3. FORAGES the web, but ONLY on a measured void (needsWeb) — a lead the graph could not
//      close — then re-surfs the enriched graph. A voice that closed on ground asks nothing.
//
// Then the chorus, together:
//
//   4. SEPARATES signal from noise (signal.js): the null the findings' own bulk throws up,
//      lifted by consensus across independent voices and by the log's own grades.
//   5. KEEPS only meaningful sources: a source a SIGNAL finding actually used is contributed
//      to the commons (borrowable next round); the rest are dropped, and even the kept ones
//      decay unless re-proven — the chorus does not store everything forever (sources.js).
//   6. REWARDS the voices evolutionarily (reward.js): fitness is corroborated signal per unit
//      spend; a fitter voice earns a deeper walk next round; no voice goes extinct (the
//      diversity floor). The room monitor names cooperation vs. the collusion that would game
//      the consensus, every round.
//
// Everything model-free and injected at the seams — the walk (reason/walk.js) and the web
// search both stub in tests and wire to the real surfaces in production — so the whole loop
// is deterministic and replay-stable save the one honestly-nondeterministic organ, the net.

import { createLog } from '../../core/log.js';
import { seedCorpus, walkReasoning } from '../reason/index.js';
import { temperamentOf, defaultCast } from './temperaments.js';
import { createSurfer } from './surfer.js';
import { separate } from './signal.js';
import { reward } from './reward.js';
import { needsWeb, queryFor, admitSources, createSourceCommons } from './sources.js';

const clampSteps = (x) => Math.max(3, Math.min(40, Math.round(x) || 3));
const mapToObj = (m) => Object.fromEntries([...m.entries()].map(([k, v]) => [k, v]));
const round = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);

// createLineup — build a chorus over a `corpus` (a seedCorpus spec: the graph they surf).
//   walk     the injected traversal (default the real reasoning walk).
//   search   async ({ query, temperament, n }) → [{ title, text, url, source }] — the net.
//            Omit it (or leave null) and the gate can still fire but nothing comes back:
//            a graph-only chorus, honest about having no world to reach.
//   cast     Map temperament → share (default the whole cast, equal shares).
//   floor/eta          the selection knobs (reward.js): diversity floor and step size.
//   borrowMax/fetchN   how many sources to borrow / forage per surfer per round.
//   fetchCost          the spend a forage costs, so needless searching lowers fitness.
//   groundFloor/alpha  the gate's grounded-fraction floor and the null's hallucination budget.
export const createLineup = ({
  corpus = [],
  walk = walkReasoning,
  search = null,
  newLog = createLog,
  cast = defaultCast(),
  sourceCommons = createSourceCommons(),
  floor = 0.05, eta = 1.5, noiseTax = 0.5,
  borrowMax = 4, fetchN = 3, fetchCost = 3,
  groundFloor = 0.5, alpha = 0.05,
} = {}) => {
  const reputations = new Map();
  const history = [];
  let roundNo = 0;
  let live = new Map(cast);   // the evolving cast — never mutate the caller's Map

  // one surfer's turn: borrow, surf, gate, (forage, re-surf). Returns its findings, its
  // total spend, and the source records it touched (for the meaningfulness check).
  const runSurfer = async (name, share) => {
    const t = temperamentOf(name);
    const surfer = createSurfer({ id: name, temperament: t, walk });
    const log = seedCorpus(newLog(), corpus, { enactment: 'ingest' });

    const idMap = new Map();   // source-figure id → record, this surfer
    const borrowed = sourceCommons.borrowable({ max: borrowMax });
    for (const [id, rec] of admitSources(log, borrowed, { enactment: 'borrow' })) idMap.set(id, rec);

    // reward → depth: a higher-share (fitter) voice gets a deeper walk (share × cast size
    // is 1 at equal shares, so the default depth is the temperament's own span).
    const depth = clampSteps(t.knobs.maxSteps * share * live.size);
    let res = await surfer.surf(log, { maxSteps: depth });
    let spend = res.steps;

    const gate = needsWeb(res, { groundFloor });
    let foraged = [];
    if (gate.search && typeof search === 'function') {
      const query = queryFor(res);
      // how many anchors to mint depends on the voice: a Seeder (INS-weighted) brings back
      // more (temperaments.js fetchN); the gate already decided a forage is warranted.
      const n = t.fetchN || fetchN;
      try { foraged = (await search({ query, temperament: name, n })) || []; }
      catch { foraged = []; }
      if (foraged.length) {
        for (const [id, rec] of admitSources(log, foraged, { enactment: 'web' })) idMap.set(id, rec);
        spend += fetchCost;
        res = await surfer.surf(log, { maxSteps: depth });   // re-surf the enriched graph
        spend += res.steps;
      }
    }

    return {
      id: name, temperament: name, findings: res.findings, steps: res.steps, spend,
      gate, walk: res.walk, borrowed: borrowed.length, foraged: foraged.length, idMap,
    };
  };

  // runRound — one full beat of the chorus.
  const runRound = async () => {
    roundNo += 1;
    const surfers = [];
    for (const [name, share] of live) surfers.push(await runSurfer(name, share));

    // SEPARATE signal from noise across every voice.
    const findings = surfers.flatMap((s) => s.findings);
    const sep = separate(findings, { alpha });

    // MEANINGFULNESS — which admitted sources did a SIGNAL finding actually use? Those, and
    // only those, are contributed to the commons; the rest die with their surfer's fork.
    const idMapAll = new Map();
    for (const s of surfers) for (const [id, rec] of s.idMap) idMapAll.set(id, rec);
    const meaningful = new Map();
    for (const e of sep.signal) for (const site of e.sites) {
      if (idMapAll.has(site)) meaningful.set(site, Math.max(meaningful.get(site) || 0, e.weight || 0.2));
    }
    for (const [id, q] of meaningful) sourceCommons.contribute(idMapAll.get(id), q);
    // RETENTION — decay and evict what stopped proving meaningful. Don't hoard.
    sourceCommons.step();

    // The two anchors the room monitor reads (reward.js). commonsLevel is the chorus's own
    // EPISTEMIC commons — the fraction of everything it committed that it then corroborated
    // and kept (a rich shared reading vs. everyone talking past each other). externalValidation
    // is whether the KEPT signal held up OUTSIDE the chorus: how much of it a foraged/borrowed
    // source actually touched. It is null when no source was in play — no outside to check, so
    // the collusion test is skipped rather than misfiring on honest graph-only work.
    const keptCount = findings.filter((f) => sep.signalKeys.has(f.key)).length;
    const commonsLevel = findings.length ? round(keptCount / findings.length) : 0;
    // A kept finding is externally validated if it is anchored to WITNESSED material — either
    // the corpus graded it warranted-or-better, or a foraged/borrowed source touched it. The
    // collusion falsifier then fires precisely when the chorus corroborates IDLE reaches that
    // nothing outside it backs — not merely because the web has not weighed in yet.
    const externallyValid = sep.signal.filter((e) =>
      (e.weight || 0) >= 0.7 || e.sites.some((site) => idMapAll.has(site))).length;
    const externalValidation = sep.signal.length ? round(externallyValid / sep.signal.length) : null;

    // REWARD + EVOLVE the cast.
    const rw = reward({
      surfers, separation: sep, prevShares: live, reputations, floor, eta, noiseTax,
      commonsLevel, externalValidation,
    });
    live = rw.shares;

    const readout = Object.freeze({
      round: roundNo,
      surfers: surfers.map((s) => Object.freeze({
        temperament: s.temperament, steps: s.steps, spend: s.spend,
        found: s.findings.length, searched: s.gate.search && s.foraged > 0,
        gate: s.gate.because, borrowed: s.borrowed, foraged: s.foraged,
        groundedFraction: s.walk.groundedFraction,
      })),
      signal: sep.signal, noise: sep.noise, threshold: sep.threshold,
      groundedFraction: sep.groundedFraction,
      fitness: mapToObj(rw.fitness), shares: mapToObj(live),
      room: rw.room, cooperationRate: rw.cooperationRate, monoculture: rw.monoculture,
      commonsLevel, externalValidation,
      sources: Object.freeze({
        level: sourceCommons.level(), kept: sourceCommons.size(),
        meaningful: meaningful.size, foraged: surfers.reduce((a, s) => a + s.foraged, 0),
        borrowable: sourceCommons.records().map((r) => r.id),
      }),
    });
    history.push(readout);
    return readout;
  };

  // run — beat the chorus `rounds` times, returning every readout (the audit trail).
  const run = async (rounds = 1) => {
    const out = [];
    for (let i = 0; i < rounds; i++) out.push(await runRound());
    return out;
  };

  return Object.freeze({
    runRound, run,
    cast: () => new Map(live),
    reputations: () => new Map(reputations),
    sourceCommons,
    history: () => history.slice(),
    round: () => roundNo,
  });
};

// The holon's one entrance — the pieces, reachable for composition and testing.
export {
  OPERATORS, DOMAIN, MODE, PURE, ARCHETYPES,
  makeTemperament, pureTemperament, archetype, temperamentOf,
  knobsFromWeights, tasteFromWeights, fetchNFromWeights, proposeFrom,
  defaultCast, castFromArchetypes,
} from './temperaments.js';
export { createSurfer, siteKey, gradeWeightOf, GRADE_WEIGHT } from './surfer.js';
export { separate, DEFAULT_ALPHA } from './signal.js';
export { reward } from './reward.js';
export { needsWeb, queryFor, admitSources, sourceId, createSourceCommons } from './sources.js';
