// EO: DEF·SEG(Field → Field, Dissecting,Clearing) — beat prompt as continuation
// render — the load-bearing function: build ONE beat's prompt as a CONTINUATION of
// a running document, never as an instruction (docs/paragraph-at-a-time.md,
// "Condition the artifact, not the behavior"). The model is handed a document that
// ends mid-sentence and continues it; the goal rides as document furniture (a
// heading, SEG) and as a seeded topic sentence (DEF), never as a command. No task
// frame means no preamble and no assistant register — the exact leak the falcons
// run showed (turn 0 "According to what I found", turn 1 parroting the seeded
// escape hatch). Grounding is NOT policed here; it is checked AFTER, by EVA
// (bindAndVeto). Pure and model-free; the composer calls model.phrase on it.

import { EXCERPTS_HEADER } from '../../model/index.js';

// The register declaration — the ONLY system framing. Organic: it conditions what
// the text IS (a steady, grounded explanatory piece), never what the model must
// avoid. A genre declaration is the line between organic and inorganic — it names
// the artifact, not the behavior. There is no task, no "answer", no "don't".
export const SYSTEM_CONTINUE =
  'The following is a clear, grounded explanatory piece, written plainly in a ' +
  'steady voice. Continue it.';

// The default cold-start genre line — the opening of the artifact when there is no
// prior paragraph to inherit register from. Conditions what the text is; a caller
// may pass its own `genre` for a different register (an investigative article, a
// brief). Organic by the same test as SYSTEM_CONTINUE.
export const DEFAULT_GENRE = 'The following is a grounded explanatory piece.';

// The hard boundary between the source material and the running document — the
// "Record: …" line of the theory. Facts above it; the model composes over them
// and matches the document's register below it.
const BOUNDARY = '———';

// The reflection marker — deliberately NOT the excerpts header (the binder keys on
// that to find citable spans, so a reflection under it would become a groundable
// "fact"). This header names the block as the reader's OWN reading, held open: the
// model composes with the thought, the grounder never cites it. The epistemics in the
// prompt, matching the enactor-door provenance the reflection event carries.
const REFLECTION_HEADER = 'Reading note (your own reflection on the above — a reading, not a source to cite):';

// Wikipedia-style extractors sometimes GLUE a section heading onto the first sentence
// beneath it — "Evolution Dolphins display…", "Behavior A pod…", "Locomotion Dolphins…".
// The heading is a lone Title-Case word that predicates nothing; left in the seed it opens
// the paragraph on a header fragment. Strip a leading run of such KNOWN section words (a
// curated set, so a real Title-Case opener like "United States…" is never touched).
const SECTION_HEADINGS = new Set(['evolution', 'behavior', 'behaviour', 'anatomy', 'ecology',
  'taxonomy', 'distribution', 'habitat', 'diet', 'reproduction', 'conservation', 'etymology',
  'history', 'description', 'locomotion', 'communication', 'socialization', 'socialisation',
  'intelligence', 'range', 'classification', 'physiology', 'morphology', 'biology', 'overview',
  'characteristics', 'feeding', 'predation', 'migration', 'lifespan', 'genetics', 'phylogeny',
  'appearance', 'culture', 'threats', 'status', 'relationship', 'relationships']);
export const stripHeadingPrefix = (text = '') => {
  let t = String(text).trim();
  for (let k = 0; k < 2; k++) {                             // at most two stacked headings
    const m = t.match(/^([A-Z][a-z]+)\s+(?=[A-Z0-9])/);      // a Title-Case word before another capital
    if (m && SECTION_HEADINGS.has(m[1].toLowerCase())) t = t.slice(m[0].length).trim();
    else break;
  }
  return t;
};

// Trim a span's text to its lead sentence — the raw material for a tight seed. A
// load-bearing seed is the text projection of the beat's strongest slice span
// (already grounded, so EVA has nothing to strike in it); its first sentence is
// the topic sentence the paragraph commits to. A glued section heading is stripped
// first so the seed opens on the real topic sentence, not the header.
export const leadSentence = (text = '') => {
  const t = stripHeadingPrefix(String(text).replace(/\s+/g, ' ').trim());
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : t).trim();
};

// A dangling connective for a connective beat — momentum with no claim, so the
// render (INS + CON) owns what the paragraph asserts. Deterministic on beat order
// (a run reproduces) yet varied, so the seams do not all open the same way.
const CONNECTIVES = ['Beyond that,', 'Set against this,', 'What follows from it,', 'Here too,', 'By the same token,'];
export const connectiveFor = (order = 0) => CONNECTIVES[((order % CONNECTIVES.length) + CONNECTIVES.length) % CONNECTIVES.length];

// The seed — the DEF that sets the beat's terms, placed as document furniture (the
// per-beat SEG choice). A load-bearing beat gets a full topic sentence projected
// from its strongest slice span (tight goal control, grounded by construction). A
// connective beat gets a dangling connective and lets the render own the claim
// (looser, more organic). Returns the text that ENDS the prompt — the document
// trailing off for the model to complete.
export const seedFor = ({ beat = {}, slice = [] } = {}) => {
  const anchor = slice.find(s => s.idx === beat.idx) || slice[0];
  if (beat.kind === 'load-bearing' && anchor) return leadSentence(anchor.text);
  return connectiveFor(beat.order);
};

// renderContinuation — ONE beat's prompt as a continuation of the running document.
// The tail of what the model sees is the document ending mid-sentence: the facts
// above the boundary (under the excerpts header, so EVA's binder and the echo
// backend both find the citable spans), then the prior paragraph as left-context,
// then the heading, then the seed. No imperative, no task frame. Pure.
export const renderContinuation = ({ beat = {}, slice = [], prior = '', coldStart = false, genre = '', arcDirective = '', reflection = '' } = {}) => {
  const blocks = [];

  // Cold-start (first beat, no prior): a genre declaration opens the artifact —
  // organic register-setting, the one place we say what the text IS.
  if (coldStart) blocks.push(genre || DEFAULT_GENRE);

  // The Record — source material above the line. Under the excerpts header so the
  // binder (EVA) finds the citable spans; the model composes OVER these, it does
  // not answer a question ABOUT them.
  if (slice.length)
    blocks.push(`${EXCERPTS_HEADER}\n${slice.map(s => s.text).join('\n')}`);

  // The REFLECTION — a deep-reading note at the place of most interest (the model
  // reading its own surprise). It rides BELOW the excerpts header on purpose: it is NOT
  // a citable span, so the binder never grounds a claim on it — the epistemic firewall
  // made concrete (a reflection is reafference, canWitness === false; docs/deep-reading.md).
  // Marked plainly as the reader's OWN reading, held open — so the model composes WITH the
  // thought but never mistakes it for a source fact. Absent ('') ⇒ byte-identical prompt.
  if (reflection && String(reflection).trim())
    blocks.push(`${REFLECTION_HEADER}\n${String(reflection).trim()}`);

  blocks.push(BOUNDARY);

  // The running document — the prior paragraph as left-context, so register and
  // thread carry structurally (no "make it flow" instruction).
  if (prior) blocks.push(prior);

  // The heading (goal-as-furniture, SEG) rides ONLY when this beat OPENS a section
  // AND the section carries a heading. A `continue` paragraph picks up within the
  // section with no new heading, and a flowing (headingless) section has none —
  // the goal then rides purely as the seed, never as furniture.
  if (beat.role === 'open' && beat.heading) blocks.push(`## ${beat.heading}`);

  // The seed (goal-as-DEF) ends the prompt: the document trails off here for the
  // model to continue.
  const seed = seedFor({ beat, slice });
  if (seed) blocks.push(seed);

  // ARC DIRECTIVE (flowShape only) — the one soft steer, off by default. The build-arc
  // prior names the move this position wants (relate two things in play, draw the threads
  // together, …); it rides as a brief parenthetical BEFORE the seed's continuation so it
  // conditions the move without becoming the text. Absent ('') ⇒ the prompt is
  // byte-identical to the unshaped walk — the rev-flag parity contract.
  const system = arcDirective
    ? `${SYSTEM_CONTINUE}\n\nMove for this paragraph: ${arcDirective}.`
    : SYSTEM_CONTINUE;

  return [
    { role: 'system', content: system },
    { role: 'user', content: blocks.join('\n\n') },
  ];
};
