// EO: SEG(Kind → Kind, Dissecting) — the prompt-golden case matrix (test helper)
// The shared case matrix for the prompt byte-identity oracle. Every branch of the three
// prompt builders (grounded, cursor, chat) appears at least once, alone and in the
// combinations that gate each other (budget suppressing shape; steer bending the answer
// clause; meta swallowing the firewall). tools/prompt-census and tests/prompt-golden
// both walk THIS matrix, so the census measures exactly what the oracle pins.
//
// The `now` values are fixed instants — the golden output must be deterministic.

const SPANS = [
  { text: 'The dolphins surfaced at dawn near the estuary.', score: 0.9 },
  { text: 'Fishermen reported pods moving upriver in spring.', score: 0.7 },
  { text: 'The survey counted ninety-two individuals.', score: 0.5 },
  { text: 'Water temperature rose two degrees over the decade.', score: 0.3 },
  { text: 'The estuary silted after the dam went in.', score: 0.2 },
];

const CONV = {
  notes: 'They asked about the estuary; you said the survey covered it.',
  pastTurns: ['You asked: where do the dolphins feed?', 'You asked: when was the survey?'],
  settled: ['The survey ran in 2019', 'The estuary is tidal'],
};

// Grounded builder — one case per band, then the gating combinations.
export const GROUNDED_CASES = [
  { name: 'minimal', args: { question: 'What did the survey find?' } },
  { name: 'orientation', args: { question: 'What is this?', orientation: 'river-survey.txt · text · 120 sentences' } },
  { name: 'spans', args: { question: 'What did the survey find?', spans: SPANS } },
  { name: 'spans-two', args: { question: 'What did the survey find?', spans: SPANS.slice(0, 2) } },
  { name: 'graph', args: { question: 'What is it about?', spans: SPANS, graph: 'The reading kept joining the dolphins to the estuary, and the estuary to the dam.' } },
  { name: 'arc', args: { question: 'How does it develop?', spans: SPANS, arc: 'At first the counts; then the water; the hardest turn at the dam.' } },
  { name: 'tail', args: { question: 'Go on.', spans: SPANS, tail: 'The survey found a stable pod, though the water was warming.' } },
  { name: 'reasoning', args: { question: 'Why did they move?', spans: SPANS, reasoning: '~ the silting may have pushed the pods upriver' } },
  { name: 'notes', args: { question: 'And the dam?', spans: SPANS, conversation: { notes: CONV.notes } } },
  { name: 'past-turns', args: { question: 'And the dam?', spans: SPANS, conversation: { pastTurns: CONV.pastTurns } } },
  { name: 'notes-and-turns', args: { question: 'And the dam?', spans: SPANS, conversation: { notes: CONV.notes, pastTurns: CONV.pastTurns } } },
  { name: 'settled', args: { question: 'And the dam?', spans: SPANS, conversation: { settled: CONV.settled } } },
  { name: 'meta', args: { question: 'Which topic was about France?', spans: SPANS, meta: true, conversation: { notes: CONV.notes, pastTurns: CONV.pastTurns } } },
  { name: 'meta-without-thread', args: { question: 'Which topic was about France?', spans: SPANS, meta: true } },
  { name: 'exemplar', args: { question: 'Summarize it.', spans: SPANS, exemplar: 'A short plain paragraph naming the subject and its turn.' } },
  { name: 'corrective', args: { question: 'What did it say?', spans: SPANS, corrective: 'Your last draft asserted a figure the lines do not carry — drop it.' } },
  { name: 'summary-task', args: { question: 'Summarize it.', spans: SPANS, task: 'summary' } },
  { name: 'budget-sentences', args: { question: 'What did the survey find?', spans: SPANS, budget: { sentences: 2 } } },
  { name: 'budget-chars', args: { question: 'What did the survey find?', spans: SPANS, budget: { chars: 200 } } },
  { name: 'budget-both', args: { question: 'What did the survey find?', spans: SPANS, budget: { sentences: 1, chars: 100 } } },
  { name: 'budget-string', args: { question: 'What did the survey find?', spans: SPANS, budget: 'Reply in one short line.' } },
  { name: 'shape', args: { question: 'What do the sources hold?', spans: SPANS, shape: 'Answer as a research librarian surfacing what the sources hold.' } },
  { name: 'shape-under-budget', args: { question: 'What do the sources hold?', spans: SPANS, shape: 'Answer as a research librarian surfacing what the sources hold.', budget: { sentences: 2 } } },
  { name: 'strict-with-spans', args: { question: 'What did the survey find?', spans: SPANS, strict: true } },
  { name: 'strict-empty', args: { question: 'What is the capital of France?', strict: true } },
  { name: 'steer', args: { question: 'Tell me about dolphins.', spans: SPANS, steer: 'They want a plain overview of the dolphins themselves, not the climate thread.' } },
  { name: 'steer-with-thread', args: { question: 'Tell me about dolphins.', spans: SPANS, steer: 'They want a plain overview.', conversation: { notes: CONV.notes } } },
  { name: 'now', args: { question: 'What day is it?', now: new Date(2026, 5, 20, 9, 30) } },
  { name: 'kitchen-sink', args: {
    question: 'So what happened to the pod?',
    orientation: 'river-survey.txt · text · 120 sentences',
    spans: SPANS,
    graph: 'The reading kept joining the dolphins to the estuary, and the estuary to the dam.',
    arc: 'At first the counts; then the water; the hardest turn at the dam.',
    reasoning: '~ the silting may have pushed the pods upriver',
    conversation: CONV,
    exemplar: 'A short plain paragraph naming the subject and its turn.',
    steer: 'They want the story of the pod, start to finish.',
    now: new Date(2026, 5, 20, 9, 30),
  } },
];

// Cursor builder — one case per slot, then the loaded beat.
export const CURSOR_CASES = [
  { name: 'minimal', args: {} },
  { name: 'orientation', args: { orientation: 'a novel-length text' } },
  { name: 'established', args: { established: 'Gregor woke; the family stirred' } },
  { name: 'one-integral', args: { integrals: [{ name: 'Gregor Samsa, the son' }] } },
  { name: 'two-integrals', args: { integrals: [{ name: 'Gregor Samsa, the son' }, { name: 'the office manager' }] } },
  { name: 'three-integrals', args: { integrals: [{ name: 'Gregor Samsa, the son' }, { name: 'Grete, the sister' }, { name: 'the office manager' }] } },
  { name: 'open', args: { open: ['whether the door was locked', 'who sent the manager'] } },
  { name: 'edge', args: { edge: 'Gregor -> the manager : answers' } },
  { name: 'beat', args: { beat: 'the family hears him through the door' } },
  { name: 'corrective', args: { corrective: 'Qualify the last claim — the text left the hour unsettled.' } },
  { name: 'spans', args: { spans: SPANS.slice(0, 2) } },
  { name: 'void-band', args: { band: 'void', edge: 'Gregor -> the manager : answers' } },
  { name: 'target', args: { target: 'one plain past-tense sentence' } },
  { name: 'loaded-beat', args: {
    orientation: 'a novel-length text',
    established: 'Gregor woke; the family stirred',
    integrals: [{ name: 'Gregor Samsa, the son' }, { name: 'the office manager' }],
    open: ['whether the door was locked'],
    edge: 'Gregor -> the manager : answers',
    spans: SPANS.slice(0, 2),
    target: 'one plain past-tense sentence',
    band: 'void',
    corrective: 'Qualify the last claim — the text left the hour unsettled.',
  } },
];

// Chat builder — the register/branch matrix.
export const CHAT_CASES = [
  { name: 'minimal', args: { question: 'Hello there.' } },
  { name: 'free', args: { question: 'What is the capital of France?', free: true } },
  { name: 'notes', args: { question: 'And after that?', notes: 'They asked about Paris; you covered the river.' } },
  { name: 'history', args: { question: 'And after that?', history: [
    { role: 'user', content: 'Tell me about Paris.' },
    { role: 'assistant', content: 'Paris sits on the Seine.' },
  ] } },
  { name: 'longform', args: { question: 'Write me an essay on rivers.', longform: true } },
  { name: 'now', args: { question: 'What day is it?', now: new Date(2026, 5, 20, 9, 30) } },
  { name: 'loaded', args: {
    question: 'And after that?',
    free: true,
    longform: true,
    notes: 'They asked about Paris; you covered the river.',
    history: [{ role: 'user', content: 'Tell me about Paris.' }],
    now: new Date(2026, 5, 20, 9, 30),
  } },
];
