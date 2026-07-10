// EO: EVA·SEG·CON(Lens,Network → Lens,Atmosphere, Binding·Tracing·Dissecting) — stand up model B
// metabolism/transfer.js — measure the transfer floor instead of asserting it.
//
// lift.js states the objective (a LIFT the surfer adds over the frozen model) and the falsifier
// (a genuine gain survives a swap of the leaf — the WEAKER of its lifts on two frozen models is
// what it keeps). But a falsifier is only real if the second model actually exists. Until now the
// two lifts were synthetic — the floor was ASSERTED. This module stands up model B: it runs the
// surfer's output through TWO different frozen local models, bare and scaffolded, scores each
// against the held source (the judge — faithfulness, checkable), and computes the kept lift for
// real. That kept lift is what feeds the Void-respect exchange rate (fitness.js): the magnitude a
// held-then-bound thread is worth is now the value it delivers WHEN THE LEAF IS SWAPPED, measured.
//
// A prompt hack that lifts one model and not the other collapses to kept ≈ 0 and is filtered — the
// talker/grounder split enforced by measurement, not doctrine. The probe is the SLOW true signal
// (lift.js's dual economy): run it on champions/survivors and to re-anchor the cheap proxy, not on
// every turn. Injected seams (runners + a scorer) so a test pins it without a GPU; the adapter
// wires the real model holon (echo / webllm / wllama) at the surface.

import { liftFitness, keptFitness, transfers as transfersOK, TRANSFER_FLOOR } from './lift.js';

const round = (x) => Math.round(x * 1000) / 1000;
const clamp01 = (x) => (Number.isFinite(+x) ? Math.max(0, Math.min(1, +x)) : 0);

// createTransferProbe — the measurement. `runners` are ≥2 frozen models, each a
//   { id, run({ task, surfer, scaffolded }) → Promise<string> }
// (bare when scaffolded=false, through the surfer's scaffolding when true). `score(task, answer)
// → Promise<[0,1]>` is faithfulness to the held source (judge-backed; injectable for tests).
export const createTransferProbe = ({ runners = [], score = null, ceiling = null, floor = TRANSFER_FLOOR } = {}) => {
  if (typeof score !== 'function') throw new TypeError('createTransferProbe: a score(task, answer) → [0,1] is required (judge-backed; a test stubs it)');
  const pair = runners.slice(0, 2);

  // measure — run the surfer through BOTH frozen models, bare and scaffolded, and read the lift on
  // each. Returns the per-model readings plus the kept (worst-case) lift and the overfit gap, and
  // an `outcome` shaped for fitness.observe so the Void-respect rate calibrates from REAL transfer.
  const measure = async ({ task, surfer = null, resource = 0 } = {}) => {
    const readings = [];
    for (const m of pair) {
      let bare = 0, withSurfer = 0;
      try {
        const bareAns = await m.run({ task, surfer, scaffolded: false });
        const surfAns = await m.run({ task, surfer, scaffolded: true });
        bare = clamp01(await score(task, bareAns));
        withSurfer = clamp01(await score(task, surfAns));
      } catch { /* a model outage yields a null lift for that leaf — never fatal */ }
      readings.push({ id: m.id, bare: round(bare), withSurfer: round(withSurfer), lift: liftFitness({ withSurfer, bare, resource, ceiling }) });
    }
    const liftA = readings[0]?.lift ?? 0;
    const liftB = readings.length > 1 ? readings[1].lift : liftA;   // one model → no transfer test; treat as un-swapped
    const kept = keptFitness(liftA, liftB);
    return Object.freeze({
      models: Object.freeze(readings),
      liftA, liftB,
      kept,                                            // the worst-of-two lift — what survives the swap
      transfers: readings.length > 1 ? transfersOK(liftA, liftB, { floor }) : null,
      overfit: round(Math.max(0, liftA - liftB)),      // how much of A's gain failed to transfer (the prompt tax)
      // fold straight into metabolize(): the un-authored liftA/liftB the void exchange rate reads.
      outcome: Object.freeze({ liftA, liftB, lift: kept }),
    });
  };

  return Object.freeze({ measure, size: () => pair.length });
};

// modelRunner — wrap a real src/model backend (phrase(messages) → string) as a probe runner,
// using the real prompt builders for the bare vs scaffolded prompts. `buildBare(task) → messages`
// is the frozen model alone on the question; `buildScaffolded(task, surfer) → messages` is the
// model through the surfer's scaffolding (retrieved spans, grounding, the leashed prompt). This is
// where echo / webllm / wllama become model A and model B — two genuinely different frozen leaves.
export const modelRunner = (backend, { buildBare, buildScaffolded, id = null, phraseOpts = {} } = {}) => {
  if (!backend || typeof backend.phrase !== 'function') throw new TypeError('modelRunner: a backend with phrase(messages) is required');
  const bare = typeof buildBare === 'function' ? buildBare : (task) => [{ role: 'user', content: String(task?.question ?? '') }];
  const scaf = typeof buildScaffolded === 'function' ? buildScaffolded : (task, surfer) => [{ role: 'user', content: `${surferHeader(surfer)}${String(task?.question ?? '')}\n\n${sourceExcerpt(task)}` }];
  return Object.freeze({
    id: id || backend.id || 'model',
    async run({ task, surfer, scaffolded }) {
      const messages = scaffolded ? scaf(task, surfer) : bare(task);
      if (backend.isLoaded && !backend.isLoaded() && typeof backend.load === 'function') { try { await backend.load(); } catch { /* best effort */ } }
      return backend.phrase(messages, phraseOpts);
    },
  });
};

// a minimal default scaffolding prompt when the caller does not supply its own builders — enough
// to give a frozen model the retrieved source the surfer would have fed it, so the lift is real.
const surferHeader = (surfer) => surfer && surfer.notation ? `[surfer ${surfer.notation?.() ?? ''}]\n` : '';
const sourceExcerpt = (task) => {
  const src = task && (task.source ?? task.document ?? '');
  const text = typeof src === 'string' ? src : (src?.text ?? '');
  return text ? `SOURCE:\n${text.slice(0, 1200)}` : '';
};

// judgeScorer — the default faithfulness scorer: grade an answer against the held source with the
// judge (its `validated` scalar). Falls back to a cheap lexical-overlap proxy when the judge is
// dry-run (no key / out of budget), so the probe still measures SOMETHING un-authored offline.
export const judgeScorer = (judge = null) => async (task, answer) => {
  const question = task?.question ?? '';
  const document = typeof (task?.source ?? task?.document) === 'string' ? (task.source ?? task.document) : (task?.source?.text ?? task?.document?.text ?? null);
  if (judge && typeof judge.grade === 'function') {
    try {
      const v = await judge.grade({ question, answer, document });
      if (v && v.validated != null) return clamp01(v.validated);
    } catch { /* fall through to the proxy */ }
  }
  return overlapProxy(answer, document);   // offline fallback — a weak, un-authored faithfulness estimate
};

// overlapProxy — faithfulness as the fraction of the answer's content words that appear in the
// source. Crude, but un-authorable by the surfer and good enough to bootstrap the probe offline.
const overlapProxy = (answer, source) => {
  const words = (s) => new Set(String(s || '').toLowerCase().match(/[a-z0-9']{3,}/g) || []);
  const a = words(answer), s = words(source);
  if (!a.size) return 0;
  let hit = 0; for (const w of a) if (s.has(w)) hit += 1;
  return round(hit / a.size);
};
