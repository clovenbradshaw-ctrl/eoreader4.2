// EO: NUL(Lens → Void, Clearing) — music output organ (bare renderer)
// organs/out/music — the MUSIC output organ, a bare renderer (a directive → a phrase).
//
// The mirror of organs/in/music (which raises a melody onto the spine as notes): this
// lowers a task leaf onto a stretch of melody. It exists to FALSIFY the claim that the
// task language is text-shaped — it is planned by the same `createTaskSpec` and run by
// the same `runTaskGraph` as an essay, differing only in its NATIVE UNIT. Where text
// budgets a leaf in tokens, music budgets it in BEATS, and the single-reach ceiling is
// a phrase, not a paragraph; an over-ceiling section splits into sub-phrases exactly as
// a long essay paragraph splits into parts.
//
// (The leaf's `directive` is still carried as a text instruction here — generalizing the
// directive to a non-text representation is the follow-up the design note flags; this
// slice proves the EXTENT/ORGAN dispatch, the seam the runner crosses.)

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// The plan-time descriptor. `unit` is beats; `ceiling` is one phrase (~a bar or two)
// — the most one small-model reach should compose before the goal is too big and the
// decomposer must split it. `contextOf` is the advisory width in motifs.
// The same neutral arc verbs, lowered to MELODIC moves. open → state the motif,
// develop → vary and extend it, close → resolve to a cadence. This is what makes the
// directive modality-neutral: the IR names the move, the organ names the music.
const MUSIC_VERB = Object.freeze({
  open: 'State the opening motif of', develop: 'Develop and vary the motif of', close: 'Resolve to a cadence',
  state: 'State', vary: 'Vary the motif of', resolve: 'Resolve to a cadence',
  enumerate: 'Sequence the figures of', summarize: 'Restate the motif of',
});

export const musicOrgan = Object.freeze({
  id: 'music',
  unit: 'beats',
  ceiling: 16,
  minBudget: 4,
  contextUnit: 'motifs',
  contextOf: (budget) => clamp(Math.round(budget / 4), 1, 6),
  // lower(directive) → a music instruction. The MUSIC lowering of the SAME neutral
  // directive { act, role, subject, detail } the text organ renders as a sentence.
  lower: ({ act, subject, detail } = {}) => {
    const verb = MUSIC_VERB[act] || 'Play';
    const evoking = subject ? ` evoking ${subject}` : '';
    const tail = detail ? `, ${detail}` : '';
    return `${verb} a phrase${evoking}${tail}.`;
  },
});

// renderMusic(generate) → render(view). Adapt the neutral view to a music generator's
// contract (`maxBeats` instead of `maxTokens`), delegate, normalize. Injected, model-free.
export const renderMusic = (generate) => async (view) => {
  const raw = await generate({
    ...view,
    maxBeats: view.extent,             // the leaf's beat ceiling — the music analogue of maxTokens
    format: view.format || 'notes',
  });
  if (raw == null) return { output: '', sources: [] };
  if (typeof raw === 'string') return { output: raw, sources: [] };
  return { output: String(raw.output ?? ''), sources: Array.isArray(raw.sources) ? raw.sources : [] };
};
