// EO: SYN·SEG·EVA(Network,Field → Network,Lens, Composing·Dissecting·Tracing) — the definer chorus
// A chorus of definers — (voice × framing × length × temperature) strategies — each writes a
// candidate contextual definition; the fittest is shown, and the winner carries forward as the
// CHAMPION so the system gets better, and cheaper, at defining over time. This is the definer's own
// small evolutionary loop, in the shape metabolism/select.js already proved:
//
//   VARIATION    a definer STRATEGY is a heritable genome (plain data, so it persists). A challenger
//                is a single-gene mutant of the champion — directed, deterministic (no RNG), so a
//                replayed log reproduces the same lineage.
//   SELECTION    definer.js's definitionFitness grades each candidate with no human in the loop —
//                coverage × fold-salience, anchored by predictive COMPETENCY. bestOfChorus picks.
//   HERITABILITY the champion persists across entities. Similar entities are defined well by the same
//                champion, so its competency compounds — "more efficient at defining similar things"
//                falls out of a competent strategy generalising, with no taxonomy to maintain.
//   SLACK        exploration costs a second model call, so a challenger is spawned only on an EXPLORE
//                beat (every Nth definition). Off-beat, the chorus is the champion alone — one call.
//                Early on, exploration is frequent relative to a small run-count; as runs accumulate
//                the champion dominates and the average cost falls toward one call.
//   HYSTERESIS   a challenger REPLACES the champion only if it wins by a margin — not on one lucky
//                definition — so selection tracks real skill, not the noise of a single entity.

import { contextualDefinition, DEFAULT_STRATEGY, VOICES } from './contextual.js';
import { bestOfChorus } from './definer.js';

const VOICE_KEYS = Object.freeze(Object.keys(VOICES));
const FRAMING_KEYS = Object.freeze(['contextual', 'factsFirst']);

// The genes the chorus varies, each with the values it may take. Defaults ARE DEFAULT_STRATEGY, so a
// champion at defaults reproduces today's single-definer behaviour — the loop is inert until a
// challenger earns promotion.
export const DEFINER_GENES = Object.freeze({
  voice:       Object.freeze({ values: VOICE_KEYS }),
  framing:     Object.freeze({ values: FRAMING_KEYS }),
  nFacts:      Object.freeze({ values: Object.freeze([4, 6, 8]) }),
  temperature: Object.freeze({ values: Object.freeze([0.2, 0.4, 0.7]) }),
});
const GENE_NAMES = Object.freeze(Object.keys(DEFINER_GENES));

export const defaultDefiner = () => ({ ...DEFAULT_STRATEGY });

// mutateDefiner(genome, seed) — a single-gene mutant, chosen DETERMINISTICALLY from `seed` (a run
// counter), never an RNG, so the lineage replays identically. The gene to perturb and the value it
// takes both rotate with the seed, so successive explorations sweep the space rather than repeating.
export const mutateDefiner = (genome = defaultDefiner(), seed = 0) => {
  const g = { ...defaultDefiner(), ...genome };
  const gene = GENE_NAMES[Math.abs(seed) % GENE_NAMES.length];
  const values = DEFINER_GENES[gene].values;
  const cur = values.indexOf(g[gene]);
  const next = values[(Math.abs(seed >> 2) + (cur < 0 ? 0 : cur) + 1) % values.length];   // step off the current value
  return { ...g, [gene]: next };
};

// The default exploration cadence — one in EXPLORE_EVERY definitions also runs a challenger. A run
// count of 0 explores (so the very first definition tries a challenger and the champion is tested at
// once); otherwise every 4th. Deterministic in the run count — no clock, no RNG.
export const EXPLORE_EVERY = 4;
export const shouldExplore = (runs = 0, every = EXPLORE_EVERY) => (Math.max(0, runs | 0) % every) === 0;

// composeChorus(spec, opts) → { winner, candidates, champion, promoted }.
//   spec       { label, objects, telegram, fold, wikiText } — the writer's input plus the wiki anchor.
//   model      the talker. With none, one unwritten candidate (the telegram) comes back.
//   champion   the reigning strategy (persisted by the caller). Defaults to defaultDefiner().
//   runs       the caller's definition count, driving the explore beat deterministically.
//   grade      async (text) → { coverage, competency } — the caller supplies this because grounding
//              needs the doc/passages the caller holds (enactor/ground/spans.js) and competency needs
//              the held-out mentions. Kept out here so the chorus stays pure and unit-testable.
//   margin     fractional fitness edge a challenger needs to seize the championship (hysteresis).
export const composeChorus = async (spec, { model = null, champion = null, runs = 0, grade = null, margin = 0.05, signal = null } = {}) => {
  const champ = { ...defaultDefiner(), ...(champion || {}) };
  const roster = [champ];
  const explore = model && shouldExplore(runs);
  if (explore) roster.push(mutateDefiner(champ, runs));

  const candidates = [];
  for (let i = 0; i < roster.length; i++) {
    const strat = roster[i];
    const def = await contextualDefinition(spec, { model, strategy: strat, signal });
    const graded = (grade && def.written) ? await grade(def.text) : {};
    candidates.push({
      text: def.text, written: def.written, strategy: strat,
      isChampion: i === 0, fold: spec.fold, wikiText: spec.wikiText,
      coverage: graded.coverage ?? 0, competency: graded.competency ?? null,
    });
  }

  const winner = bestOfChorus(candidates) || candidates[0] || null;
  // Promotion: a NON-champion winner must beat the champion's fitness by `margin` to inherit. The
  // champion candidate is always index 0; compare against it directly.
  const champCand = candidates[0];
  let promoted = false;
  let nextChampion = champ;
  if (winner && !winner.isChampion && champCand && winner.written) {
    const cf = winner.fitness?.score ?? 0;
    const pf = champCand.fitness?.score ?? 0;
    if (cf >= pf * (1 + margin)) { promoted = true; nextChampion = winner.strategy; }
  }
  return { winner, candidates, champion: nextChampion, promoted, explored: !!explore };
};
