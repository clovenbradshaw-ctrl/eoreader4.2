// EO: SYN·CON·EVA(Field,Network → Network,Lens, Composing,Binding,Tracing) — grain-nested predictor
// predict/grained.js — the grain-nested predictor.
//
// The flat sequence reader (surfer/sequence.js) predicts the next unit from ONE
// grain: an order-k n-gram over the raw stream. Its own comment names the wall —
// "order 1 cannot hold a melody, whose figure is the PHRASE, not the single step."
// A melody is grained: note → phrase → piece. A single flat predictor must pick
// one grain and lose the others; raising the order to reach the phrase trades away
// the generalization a short context keeps.
//
// This predicts at TWO grains and composes them, the cube's Object axis made
// operational for prediction:
//
//   FIGURE grain (note)    INS — instantiate the next event. The existing note
//     n-gram. Sharp inside a known run, SURPRISED at every phrase boundary and on
//     a phrase's first hearing (no local context predicts the jump).
//
//   PATTERN grain (phrase) SYN/REC — the regularity over phrases. Two parts, both
//     learned online and causally, no theory supplied:
//       · within-phrase template match by OVERLAP EQUIVALENCE — the same Level-1
//         set/prefix overlap the engine uses to discover octave equivalence, here
//         discovering that THIS phrase is a (possibly varied) repeat of a prior
//         one, so its continuation is anticipated even where the notes differ.
//       · a phrase-TRANSITION n-gram over phrase identities — after phrase X,
//         which phrase tends to follow — so the boundary note the Figure grain
//         cannot reach is predicted from the phrase grammar.
//
// THE CUBE GUARD = SURPRISE ROUTING. High Figure surprise AT a phrase boundary is
// not a note error — it is a Pattern-grain event ("the frame turned"). Composed
// through the task graph (predictionTaskGraph), each boundary note is a leaf
// DECLARED Pattern-grained, so the holon's grain-coherence flags it: a Figure-
// maker handed a Pattern goal — do not fix it at the note grain, escalate.
//
// Segmentation (where the phrases are) is the separate SEG problem. Boundaries are
// taken as input; `surpriseBoundaries` offers a baseline detector, reported, never
// claimed exact.

import { predictiveSequenceReading } from '../../surfer/sequence.js';
import { runTaskGraph, PATTERN } from '../../frame/tasks/index.js';
import { openEvent, bindEvent, projectFrameStack } from '../../frame/index.js';
import { learnBoundariesFromSurprise } from './segment.js';

const round = (x) => Math.round(x * 1000) / 1000;

// ── overlap, the Level-1 measure ──────────────────────────────────────────────
// Prefix overlap of a short run `a` against a template `b`, aligned by position:
// the fraction of a's positions that match b's. The same hits/qLen the reader runs
// over a sentence's words, run over a phrase's notes.
export const prefixOverlap = (a, b) => {
  if (!a.length) return 0;
  let hits = 0;
  for (let i = 0; i < a.length; i++) if (b[i] === a[i]) hits++;
  return hits / a.length;
};

// Whole-phrase similarity for identity assignment: matching positions over the
// longer length, so a length mismatch is penalised (a prefix of a phrase is not
// the same phrase).
export const phraseSimilarity = (a, b) => {
  const n = Math.max(a.length, b.length);
  if (!n) return 1;
  let hits = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) hits++;
  return hits / n;
};

// ── segmentation (input, or a reported baseline) ──────────────────────────────
// Phrase START indices from per-step Figure surprise: a cut where surprise clears
// `cut`. A baseline only — over-fires on a cold model; the demo reports its error.
export const surpriseBoundaries = (steps, { cut = 0.7 } = {}) => {
  const starts = new Set([0]);
  for (const s of steps) if (s.surprise >= cut) starts.add(s.at);
  return [...starts].sort((a, b) => a - b);
};

// Split a label stream into phrases at the given START indices.
const splitPhrases = (labels, starts) => {
  const bs = [...new Set([0, ...starts])].filter((i) => i >= 0 && i < labels.length).sort((a, b) => a - b);
  const phrases = [];
  for (let i = 0; i < bs.length; i++) phrases.push(labels.slice(bs[i], bs[i + 1] ?? labels.length));
  return { phrases, starts: bs };
};

// ── the Pattern-grain memory ──────────────────────────────────────────────────
// Causal: only phrases COMPLETED before the current position are in scope. A
// phrase is assigned to the prior class whose exemplar it most resembles (≥
// minOverlap), else it founds a new class — the emergent-identity merge, online.
const makePatternMemory = ({ minOverlap, minPrefix }) => {
  const exemplars = [];                 // classId → the first phrase seen of that class
  const transitions = new Map();        // "prevClass" → Map(nextClass → count)
  let prevClass = null;

  const classify = (phrase) => {
    let best = -1, bestScore = minOverlap;
    for (let c = 0; c < exemplars.length; c++) {
      const s = phraseSimilarity(phrase, exemplars[c]);
      if (s >= bestScore) { bestScore = s; best = c; }
    }
    return best;
  };

  // Predict the next note GIVEN the current phrase's prefix (notes seen so far this
  // phrase) and the class of the previous phrase. Returns { pred, conf, via }.
  const predict = (prefix) => {
    if (prefix.length === 0) {
      // boundary: predict the next phrase from the transition n-gram, take its head
      const row = prevClass != null ? transitions.get(String(prevClass)) : null;
      if (row && row.size) {
        let top = null, n = 0, tot = 0;
        for (const [cls, k] of row) { tot += k; if (k > n) { n = k; top = cls; } }
        const ex = exemplars[Number(top)];
        if (ex) return { pred: ex[0], conf: round(n / tot), via: 'transition' };
      }
      return { pred: null, conf: 0, via: 'cold' };
    }
    // inside a phrase: match the prefix to the best prior exemplar and read ahead.
    // A single note is not a phrase — require at least `minPrefix` notes of context
    // before trusting a template, the same reason order-1 cannot hold a melody.
    if (prefix.length < minPrefix) return { pred: null, conf: 0, via: 'cold' };
    let best = -1, bestScore = minOverlap;
    for (let c = 0; c < exemplars.length; c++) {
      const ex = exemplars[c];
      if (ex.length <= prefix.length) continue;          // need a note to read ahead to
      const s = prefixOverlap(prefix, ex);
      if (s >= bestScore) { bestScore = s; best = c; }
    }
    if (best < 0) return { pred: null, conf: 0, via: 'cold' };
    return { pred: exemplars[best][prefix.length], conf: round(bestScore), via: 'template' };
  };

  // Commit a completed phrase to memory (after it has been read).
  const commit = (phrase) => {
    const c = classify(phrase);
    const cls = c >= 0 ? c : exemplars.length;
    if (c < 0) exemplars.push(phrase.slice());
    if (prevClass != null) {
      const key = String(prevClass);
      if (!transitions.has(key)) transitions.set(key, new Map());
      const row = transitions.get(key);
      row.set(cls, (row.get(cls) || 0) + 1);
    }
    prevClass = cls;
    return cls;
  };

  return { predict, commit, get classes() { return exemplars.length; } };
};

// ── the composed, grain-nested prediction ─────────────────────────────────────
// Walk the stream once; at each step hold a Figure prediction and a Pattern
// prediction, and compose: trust the Pattern grain when it is confident (inside a
// matched template or a sharp transition), else fall back to Figure. The composite
// hit is what the predictor would actually emit.
export const predictGrained = (doc, { order = 2, boundaries = null, minOverlap = 0.6, minPrefix = 2, patternConf = 0.6, figConfFloor = 0.5, alpha = 0.4, minGap = 2 } = {}) => {
  const labels = doc.sequence.map((s) => s.pc);
  const figureSteps = predictiveSequenceReading(doc, { order });
  const figByAt = new Map(figureSteps.map((s) => [s.at, s]));

  // Boundaries: taken as input when given, else LEARNED from the note grain's own
  // surprise (segment.js) — the SEG cut derived, not hand-fed. The default path is
  // now fully self-supervised: no human marks the phrases.
  const starts = boundaries
    || learnBoundariesFromSurprise(figureSteps.map((s) => ({ at: s.at, surprise: s.surprise })), { alpha, minGap });
  const startSet = new Set(starts);
  const { phrases } = splitPhrases(labels, starts);

  // map each absolute index → (phrase index, its start). Build phrase spans.
  const phraseOf = [];
  { let pi = 0, cursor = 0;
    for (const p of phrases) { for (let k = 0; k < p.length; k++) phraseOf[cursor++] = { pi, start: cursor - k - 1 }; pi++; } }

  const mem = makePatternMemory({ minOverlap, minPrefix });
  const steps = [];
  let curPhraseIdx = 0;

  for (let at = 1; at < labels.length; at++) {
    // commit any phrases that ENDED before `at` (causal: only completed phrases).
    const here = phraseOf[at];
    while (curPhraseIdx < here.pi) { mem.commit(phrases[curPhraseIdx]); curPhraseIdx++; }

    const fig = figByAt.get(at);
    const prefix = labels.slice(here.start, at);          // notes of THIS phrase before `at`
    const pat = mem.predict(prefix);
    const boundary = startSet.has(at);

    // THE CUBE GUARD, as composition: route to the Pattern grain only when the
    // Figure grain is itself UNSURE — its top pick holds little mass — AND the
    // Pattern grain is confident. A committed Figure prediction is never
    // overridden ("do not apply a Pattern fix where the note grain already
    // holds"). The gate reads the note grain's OWN confidence (its top
    // probability), never the actual that landed — strictly causal, unlike the
    // surprise of the outcome. This is what stops the Pattern grain from harming a
    // stream the n-gram already reads well (the no-structure control).
    const figConf = fig.ranked?.[0]?.prob ?? 0;
    const usePattern = pat.pred != null && pat.conf >= patternConf && figConf < figConfFloor;
    const compositePred = usePattern ? pat.pred : fig.predicted;
    const actual = labels[at];

    steps.push({
      at,
      actual,
      figure:  { pred: fig.predicted, hit: fig.predicted === actual, surprise: fig.surprise },
      pattern: { pred: pat.pred, conf: pat.conf, via: pat.via, hit: pat.pred === actual },
      composite: { pred: compositePred, hit: compositePred === actual, grain: usePattern ? 'Pattern' : 'Figure' },
      // surprise routing: a boundary where Figure is surprised is a Pattern-grain
      // event — the prediction's true grain is Pattern even if we had to fall back.
      boundary,
      routedGrain: boundary ? 'Pattern' : 'Figure',
    });
  }
  return { steps, phrases, starts };
};

// ── composed through the task graph ───────────────────────────────────────────
// The prediction AS the nested grain graph: the piece decomposes into phrases
// (Pattern branches), each phrase into its note predictions (Figure leaves). A
// boundary note is a leaf DECLARED Pattern — a Pattern-grain event handed to a
// Figure-maker — so the holon's grain-coherence flags it. result.incoherent is
// then exactly the surprise that must route up: the boundary notes where the note
// grain alone would confabulate. The graph updates as each note is predicted.
export const predictionTaskGraph = async (doc, opts = {}) => {
  const pred = predictGrained(doc, opts);
  const labels = doc.sequence.map((s) => s.pc);
  const { phrases, starts } = pred;
  const startSet = new Set(starts);
  const byAt = new Map(pred.steps.map((s) => [s.at, s]));

  // index the notes of each phrase by absolute position
  const phraseNotes = [];
  { let cursor = 0; for (const p of phrases) { phraseNotes.push(p.map((_, k) => cursor + k)); cursor += p.length; } }

  const res = await runTaskGraph({
    goal: 'predict the sequence',
    maxFanout: 64, maxDepth: 4,
    decompose: ({ goal, depth }) => {
      if (depth === 0) return phrases.map((_, i) => ({ goal: `phrase ${i}`, grain: PATTERN }));
      if (depth === 1) {
        const pi = Number(goal.split(' ')[1]);
        return phraseNotes[pi].map((at) => ({
          goal: `note ${at}`,
          // a boundary note is a Pattern-grain event (surprise routes up); a within
          // phrase note is a genuine Figure goal.
          grain: startSet.has(at) ? PATTERN : null,
        }));
      }
      return [];
    },
    generate: ({ goal }) => {
      const at = Number(goal.split(' ')[1]);
      const s = byAt.get(at);
      return s ? String(s.composite.pred ?? '·') : String(labels[at] ?? '·');
    },
  });
  return { prediction: pred, graph: res.graph, incoherent: res.incoherent };
};

// ── the reactive frame log (docs/frame-holon.md, Phase C) ─────────────────────
// The SAME structure predictGrained walks — piece → phrases → note events — as
// the interior frame holon's event log: the piece is the root frame, a SEG
// boundary PUSHES a phrase frame (the 'novelty' bind, the cut segment.js derives
// from the signal's own surprise), each within-phrase note BINDS the open phrase
// (the 'leaf' bind), and the next boundary pops to the piece and pushes the next
// phrase. A phrase frame's subject is its pitch-set — the props the phrase-repeat
// overlap-equivalence measures, the same floor the discourse bind measures over.
//
// This is the eager ≡ reactive invariance pinned in CI: predictionTaskGraph
// DECLARES this tree top-down (a planner's `decompose`), this log DISCOVERS it as
// the stream arrives (`open` + `bind`), and the shared projection derives the
// same nesting either way (tests/frame-predict.test.js).
export const predictionFrameLog = ({ phrases }) => {
  const log = [openEvent({ id: 'piece', goal: 'the piece', t: 0 })];
  let t = 1, at = 0;
  for (let i = 0; i < phrases.length; i++) {
    if (i > 0) log.push(bindEvent({ id: 'piece', channel: 'ancestor', t: t++ }));   // phrase end → the piece (pop)
    const id = `piece.${i}`;
    log.push(openEvent({
      id, parentId: 'piece', goal: `phrase ${i}`, depth: 1,
      subject: [...new Set(phrases[i])], t: t++,
    }));
    for (let k = 0; k < phrases[i].length; k++, at++) {
      // the boundary note lands on NOTHING in scope (c_new) — the push; the rest
      // bind the open phrase (c_leaf).
      log.push(bindEvent({ id, unit: at, channel: k === 0 ? 'novelty' : 'leaf', t: t++ }));
    }
  }
  return log;
};

// The prediction's frame stack — the reactive projection of the walk above.
export const predictionFrameStack = (pred) => projectFrameStack(predictionFrameLog(pred));

// ── grading ───────────────────────────────────────────────────────────────────
export const gradeGrained = (result) => {
  const { steps } = result;
  const n = steps.length || 1;
  const figHits = steps.filter((s) => s.figure.hit).length;
  const compHits = steps.filter((s) => s.composite.hit).length;
  const boundarySteps = steps.filter((s) => s.boundary);
  const bHits = boundarySteps.filter((s) => s.composite.hit).length;
  const figBHits = boundarySteps.filter((s) => s.figure.hit).length;
  return {
    n,
    figure:    { hits: figHits, rate: round(figHits / n) },
    composite: { hits: compHits, rate: round(compHits / n) },
    lift:      round((compHits - figHits) / n),
    boundary:  { n: boundarySteps.length, figureHits: figBHits, compositeHits: bHits },
  };
};
