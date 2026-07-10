// EO: NUL(Lens → Void, Clearing) — text output organ (bare renderer)
// organs/out/text — the TEXT output organ, a bare renderer (props → prose).
//
// The mirror of organs/in/text (which raises sentences onto the spine): this lowers
// a task leaf onto prose. It is today's behaviour, named as an organ — the leaf's
// abstract `extent` is read in this organ's native unit (TOKENS), and the render
// delegates to the caller's injected generator (the model call), the same contract
// `tasks/spec.js` has always used. The judging stays in the modality-blind enactor;
// this organ only renders, exactly as organs/out/speech does.

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// The plan-time descriptor (pure, no model). `ceiling` is the single-reach cap — a
// leaf budgeted above it is a Pattern goal the decomposer splits, the same role
// LEAF_MAX_TOKENS played when it was a global. `contextOf` is the advisory retrieval
// width per leaf, in this organ's context unit (spans).
// The neutral arc verb each act lowers to in PROSE. A directive names a move (open /
// develop / close / …) on a role; the organ supplies the language. So the same neutral
// directive that music renders as a phrase, text renders as a sentence.
const TEXT_VERB = Object.freeze({
  open: 'Open', develop: 'Develop', close: 'Close',
  state: 'State', vary: 'Vary', resolve: 'Resolve',
  enumerate: 'List', summarize: 'Summarize',
});

export const textOrgan = Object.freeze({
  id: 'text',
  unit: 'tokens',
  ceiling: 256,
  minBudget: 64,
  contextUnit: 'spans',
  contextOf: (budget) => clamp(Math.round(budget / 40), 3, 10),
  // lower(directive) → an English instruction. The TEXT lowering of a modality-neutral
  // directive { act, role, subject, detail }; pure, plan-time (no model).
  lower: ({ act, role, subject, detail } = {}) => {
    const verb = TEXT_VERB[act] || 'Write';
    const about = subject ? ` about ${subject}` : '';
    const tail = detail ? `: ${detail}` : '';
    return `${verb} the ${role || 'part'}${about}${tail}.`;
  },
});

// renderText(generate) → render(view). The run-time half: adapt the modality-neutral
// view to the text generate contract (the model wants `maxTokens`), delegate, and
// normalize the two return shapes a generator may use. `generate` is injected — this
// organ never imports a model, the runner's discipline preserved.
export const renderText = (generate) => async (view) => {
  const raw = await generate({
    ...view,
    maxTokens: view.extent,            // the leaf's token ceiling — a hard decode cap
    format: view.format || 'prose',
  });
  if (raw == null) return { output: '', sources: [] };
  if (typeof raw === 'string') return { output: raw, sources: [] };
  return { output: String(raw.output ?? ''), sources: Array.isArray(raw.sources) ? raw.sources : [] };
};
