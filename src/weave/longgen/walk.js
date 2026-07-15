// EO: SYN·CON·EVA(Field,Network → Network, Composing,Binding,Tracing) — multi-paragraph walk
// walk — the in-run multi-paragraph loop (docs/paragraph-at-a-time.md, the
// multi-paragraph-walk spec). v1 writes the whole design in one call: given a
// FOLD (ranked evidence spans), a DESIGN (ordered beats, or a { demand, outline }
// the walk carves once), and a MODEL, it emits paragraphs until the design is
// filled or the fold is spent. Each call to the model writes ONE paragraph — a
// CONTINUATION of the running document — bound and vetoed at claim grain after it
// is written. The only inputs that move from one call to the next are the two the
// walk is built on:
//
//   1. the prior paragraph, verbatim — the left-context the new paragraph opens on
//      (register/tense/diction inherited from real prose, never instructed);
//   2. a new part of the fold — the next beat's anchor span plus its strongest
//      UNCOVERED neighbours, so no span a prior paragraph consumed is re-served.
//
// Everything else is fixed or derived (seed, design, genre). Hold that invariant
// and the walk moves forward — five paragraphs cover five regions instead of
// restating one. Break it — re-serve covered spans, or drop the prior paragraph —
// and the two failure modes return: repetition, and a paragraph that opens cold.
//
//   SIG   select the beat's slice — its anchor span plus its fresh neighbours
//   render  build the continuation frame (facts above the line, heading, seed)
//   INS·CON  the model continues one paragraph from the seed; the binder cites it
//   EVA   check per sentence; splice off the ungrounded tail, regen below threshold
//   REC   fold the accepted paragraph into the running document
//
// maxBeats is the SEAM: v1 leaves it Infinity and writes the whole design; the
// deferred across-messages capacity sets it to write a bounded run now and resume
// the rest later, with no change to the body. The returned `state` is that seam's
// statistic — RETURNED by v1, consumed by nothing yet.

import { buildSkeleton } from './skeleton.js';
import { renderContinuation, seedFor } from './render.js';
import { progressAgainst } from './progress.js';
import { selfRead } from './weld.js';
import { bindAndVeto } from '../../enactor/ground/index.js';
import { REBIND_THRESHOLD, FLOOR_TOKENS, ceilingFor, EPSILON } from '../arc/index.js';
import { groundSaturation } from '../arc/index.js';
import { flowVerdict } from '../../surfer/flow/index.js';
import { arcGapMove, OP_DIRECTIVES } from './fold.js';
import { deepReading } from '../../surfer/fold/index.js';

// DEEP READING → the reflection handed to the generation model (docs/deep-reading.md).
// Before a beat is written, the reading turns back on the SOURCE it is writing from,
// surfs to its place of most interest (the reader's own surprise peak), and folds a
// reflection there — "think deeply about the surprising place before giving it to the
// model". The reflection rides into the beat prompt as the reader's OWN reading (a
// reafferent note under REFLECTION_HEADER, never the citable Record), so the model
// composes WITH the thought while the grounder never cites it — the epistemic firewall
// (canWitness === false) carried into generation. `deepRead = { source, surf, reflect? }`:
//   source  the parsed doc the walk is writing from (the reading being surfed)
//   surf    the injected surfer (surfFold) — kept an accessor so the walk stays decoupled
//   reflect OPTIONAL model voice (fold,ctx)→{body}; absent → the model-free inner note
// beatReflection — one reflection body for this beat, habituated across beats (never
// re-reflect a place — the rumination cure). Null-safe: no bundle ⇒ '' and the prompt
// is byte-identical to the unwired walk.
const beatReflection = (deepRead, visited) => {
  if (!deepRead || !deepRead.source || typeof deepRead.surf !== 'function') return '';
  let r; try {
    r = deepReading(deepRead.source, { surf: deepRead.surf, reflect: deepRead.reflect || null, visited, commit: false });
  } catch { return ''; }
  if (!r || !r.body) return '';
  if (visited instanceof Set && Number.isInteger(r.peak)) visited.add(r.peak);   // habituate
  // Feed the reflection as PROSE — the model writes prose, so its input must not be far off
  // from its output (a continuation model handed EOT notation like `X -> rel : Y` either
  // chokes on it or mimics it). `r.body` is the significance VOICING: natural prose when a
  // model `reflect` is injected (the register-matched form), a terse note in the model-free
  // fallback. The structured fold (`r.fold.text`, existence+structure+significance in EOT
  // form) is the reading's own substrate — kept OFF the generation prompt precisely because
  // its register is wrong for a writer. Information, in the writer's own voice.
  return String(r.body).trim();
};

// FLOW — the amodal build-arc witness/shaper (docs/flow-prior.md). The walk owns the
// grounded-paragraph floor; the flow prior owns the SHAPE floor: is the build going
// where competent prose of this register goes, or re-opening in place? The prior is a
// manifold over the operator basis (flow/index.js) — it never reads text, only the
// section trajectory a `parse` accessor produces, so this is the amodal middle with the
// parser as the thin in-organ shell. `flow = { prior, parse, perSentences }`:
//   observe  each accepted paragraph re-parses the running draft and scores the last
//            section — residual/delta vs the prior, plus the MOVE the arc would demand
//            here (arcGapMove: still-introducing late ⇒ it wants CON/SYN). Rides the
//            trace; changes NO tokens. Off (no prior/parse) ⇒ identical behavior.
//   shape    (flowShape) feed that demanded move into the beat prompt as a soft
//            directive — the one place tokens change. Default OFF; a rev-flag opt-in.
// flowStep — read a compact per-beat flow record off the running draft, and the section
// vector to carry forward as the next beat's `prevStep`. Null-safe: no prior/parse ⇒
// { record:null, step:prevStep } and the walk is untouched.
const flowStep = (flow, prevStep, draftText, idx, total) => {
  if (!flow || !flow.prior || typeof flow.parse !== 'function' || !draftText) {
    return { record: null, step: prevStep };
  }
  let doc; try { doc = flow.parse(draftText); } catch { return { record: null, step: prevStep }; }
  const v = flowVerdict(flow.prior, prevStep, doc, { perSentences: flow.perSentences || 8 });
  if (!v) return { record: null, step: prevStep };
  // arcGapMove reads the demanded move off the PREVIOUS section vs the corpus schedule
  // at this position — "where the build should be by now vs where it is".
  const want = arcGapMove({ prior: flow.prior, step: prevStep, stepIndex: idx, totalSteps: Math.max(1, total) });
  const topZ = Object.entries(want.z || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3);
  return {
    record: {
      residualPct: v.residualPercentile ?? null,
      deltaPct: v.deltaPercentile ?? null,
      ok: v.ok,
      want: want.op, wantVerb: want.verb, wantDerived: want.derived,
      z: Object.fromEntries(topZ),
    },
    step: v.step || prevStep,
  };
};

// arcDirectiveFor — the SHAPE lever (flowShape only). The move the arc demands at this
// position → a soft continuation directive (fold.js OP_DIRECTIVES, the same translation
// the designed fold path uses). Empty when there is no derived move, so the prompt is
// byte-identical unless the prior actually has a schedule to reach for.
const arcDirectiveFor = (flow, prevStep, idx, total) => {
  if (!flow || !flow.prior) return '';
  const want = arcGapMove({ prior: flow.prior, step: prevStep, stepIndex: idx, totalSteps: Math.max(1, total) });
  if (!want.derived) return '';
  return OP_DIRECTIVES[want.op]?.restated || '';
};

const MAX_REGEN = 1;   // one regenerate on an ungrounded paragraph, then hold (NUL)
const BOUND_FLOOR = 0.2;   // write-first: a beat grounding below this regenerates ONCE before it ships

// SIG — the beat's slice: its anchor span plus supporting context, a cluster of
// commitments (the chosen grain). Neighbours are NEVER another beat's anchor, so
// no beat's coverage is charged to a sibling; among the rest, the strongest
// UNCOVERED context comes first, then already-covered context is reused to fill
// out the cluster rather than leave a thin single-span beat (the seed keeps each
// beat on its own topic, so reused context is grounding, not repetition). This is
// the mechanical guarantee behind "a new part of the fold": fresh before reused.
export const sliceFor = (beat, pool, covered, anchors, { width = 3 } = {}) => {
  const anchor = pool.find(s => s.idx === beat.idx);
  const nbr = pool.filter(s => s.idx !== beat.idx && !anchors.has(s.idx));
  const byScore = (a, b) => (b.score || 0) - (a.score || 0);
  const fresh = nbr.filter(s => !covered.has(s.idx)).sort(byScore);
  const reused = nbr.filter(s => covered.has(s.idx)).sort(byScore);
  return [anchor, ...fresh, ...reused].filter(Boolean).slice(0, width);
};

// The leading run of bound claims — the grounded opening kept when the tail drifts
// (the arc's boundPrefixText, run at paragraph grain).
const boundPrefix = (bound = []) => {
  const kept = [];
  for (const b of bound) { if (b.citation) kept.push(b.claim); else break; }
  return kept.join(' ');
};

// FRAME LEAK — the assistant register the continuation frame is meant to make
// impossible, caught as a CHECKED property, never a prompt prohibition (naming a
// token to forbid it only raises its salience — the pink-elephant failure). These
// are the exact leaks a loose prompt ships: "According to what I found", "I didn't
// find … in what I read", "the text about the Royal National Park". A leak that
// binds lexically slips past the grounding floor (the preamble rides on a grounded
// claim), so EVA strikes it here. Returns the offending phrase, or null.
const LEAKS = [
  /according to what i (?:found|read)/i, /\bas an ai\b/i, /as a language model/i,
  /i (?:didn'?t|could ?n'?t) find/i, /\bthe user\b/i, /in this paragraph/i,
  /^\s*sure[,!]/i, /^\s*here'?s\b/i, /^\s*certainly[,!]/i, /\bi found\b/i,
  /the text (?:about|describes|mentions)/i, /the record (?:shows|says)/i,
  // EDITOR REGISTER — the model narrating the WRITING rather than continuing it. A
  // base/instruct model handed a document-to-continue sometimes announces the seam
  // ("Here is the continuation of the text:", "here is a revised version") mid-answer;
  // it binds lexically to nothing and is pure scaffolding, so strike the beat. Anywhere
  // in the paragraph, not just the opening — the dolphins run leaked it mid-paragraph.
  /here (?:is|'?s) (?:the |a |your )?(?:continuation|revised|rewritten|updated|rest of|remainder of|following)/i,
  /continuation of the (?:text|passage|essay|document|above)/i,
];
export const frameLeak = (text = '') => {
  const t = String(text || '');
  for (const re of LEAKS) { const m = t.match(re); if (m) return (m[0] || '').trim(); }
  return null;
};

// DEGENERATION TRIM — cut a paragraph at the onset of model degeneration, keeping the
// coherent lead. This is COHERENCE HYGIENE, not grounding: it drops the repetition
// loops, verbatim-restated sentences, and low-diversity token runs a small model falls
// into once it runs past what it can say ("I'm not sure about that. I'm not sure about
// that." / "00/00/00/00…"). Used only on the write-first (groundLater) path, where the
// whole draft is kept — so the kept draft is the model's real prose up to the point it
// stops being prose. Conservative: a paragraph with no degeneration is returned whole.
const norml = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const trimDegeneration = (text = '') => {
  const sents = String(text || '').split(/(?<=[.!?])\s+/);
  const kept = []; const seen = new Set();
  for (const s of sents) {
    const n = norml(s);
    if (!n) { kept.push(s); continue; }
    if (seen.has(n)) break;                                  // a sentence restated verbatim — degeneration onset
    const toks = n.split(' ');
    let run = 1, maxRun = 1;
    for (let i = 1; i < toks.length; i++) { if (toks[i] === toks[i - 1]) { run++; if (run > maxRun) maxRun = run; } else run = 1; }
    if (maxRun >= 5) break;                                  // a token repeated 5+ times in a row — a loop
    const uniq = new Set(toks).size;
    if (toks.length >= 12 && uniq / toks.length < 0.35) break;   // long sentence, almost no distinct words — garbage
    seen.add(n); kept.push(s);
  }
  const out = kept.join(' ').trim();
  return out || String(text || '').trim();                  // never trim to nothing — keep the original if the whole thing tripped
};

// DANGLING-TAIL TRIM — when a beat runs to the token ceiling it stops MID-SENTENCE; the
// write-first path keeps the draft whole, so that un-terminated fragment would ship (the
// dolphins essay ended "…dolphins have also been observed exhibiting"). Drop the trailing
// fragment back to the last completed sentence — but never to nothing: a paragraph that is a
// single unfinished sentence is kept whole (a whole thought beats no thought).
export const trimDangling = (text = '') => {
  const t = String(text || '').trim();
  if (!t || /[.!?…][)\]"'”’]*$/.test(t)) return t;          // already ends on a sentence boundary
  const m = t.match(/^[\s\S]*[.!?…][)\]"'”’]*(?=\s)/);       // keep through the last complete sentence
  const kept = m ? m[0].trim() : '';
  return kept || t;                                          // no earlier boundary → keep the fragment whole
};

// EVA — the provenance gate: verify per sentence (bindAndVeto binds at claim
// grain); keep the bound prefix, strike the ungrounded tail; regenerate only when
// the bound fraction falls below REBIND_THRESHOLD. Pure on the gate result.
export const evaSplice = (gated) => {
  if (gated.boundFraction >= 1) return { action: 'accept', text: gated.answer };
  if (gated.boundFraction >= REBIND_THRESHOLD) {
    const prefix = boundPrefix(gated.bound);
    return prefix ? { action: 'splice', text: prefix } : { action: 'regen', text: '' };
  }
  return { action: 'regen', text: '' };
};

const round3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

// Derive a design from raw ordered beats handed in directly (design as an Array).
// The beats are copied forward as-is; sections and the planned count are read back
// off them so progressAgainst has the same shape buildSkeleton would produce.
const designFromBeats = (beats, { question = '' } = {}) => {
  const kept = (beats || []).filter(b => b && Number.isInteger(b.idx));
  const bySection = new Map();
  const norm = kept.map((b, i) => {
    const sectionId = b.sectionId || 's0';
    if (!bySection.has(sectionId)) bySection.set(sectionId, []);
    const beat = Object.freeze({
      id: b.id || `b${i}`, order: b.order ?? i, sectionId,
      idx: b.idx, topic: b.topic || '', kind: b.kind || 'connective',
      role: b.role || (bySection.get(sectionId).length ? 'continue' : 'open'),
      heading: b.heading ?? null, state: 'pending',
    });
    bySection.get(sectionId).push(beat.id);
    return beat;
  });
  const sections = [...bySection.entries()].map(([id, ids], si) => {
    const first = norm.find(b => b.sectionId === id);
    return Object.freeze({ id, heading: first?.heading ?? null, topic: first?.topic || '', beats: Object.freeze(ids) });
  });
  return Object.freeze({
    question: String(question || ''), demand: null, planned: norm.length,
    short: false, shortfall: 0,
    sections: Object.freeze(sections), beats: Object.freeze(norm),
  });
};

// Carve the design ONCE, or copy forward the one already carved. The design comes
// in three shapes, all normalised to the { beats, sections, planned, … } skeleton:
//   - an already-carved design (has `.beats`) — copied forward, never re-derived;
//   - an Array of ordered beats — wrapped as a design;
//   - a { demand, outline } carve spec — floored by the fold (a demand for five
//     regions over a fold that develops three yields three beats and a stated
//     reason, never five padded). The demand sets the ceiling; the fold the floor.
const carveDesign = ({ design, fold, question }) => {
  if (design && !Array.isArray(design) && Array.isArray(design.beats)) return design;
  if (Array.isArray(design)) return designFromBeats(design, { question });
  const spec = (design && typeof design === 'object') ? design : {};
  return buildSkeleton({
    ground: fold,
    question: spec.question ?? question ?? '',
    demand: spec.demand ?? null,
    outline: spec.outline ?? null,
  });
};

// composeBeat — write ONE beat: render the continuation, phrase it, bind and veto
// at claim grain, splice the ungrounded tail, regenerate once below threshold,
// strike a frame leak at EVA. The coarse-generate / fine-verify body shared by the
// static walk and the live (self-read) walk, so both hold the SAME grounding floor.
// Returns { paragraph|null, gated, action, leak, seed, weld }.
//
// groundLater — WRITE FIRST, GROUND LATER. The default path grounds at BIRTH: it
// splices the ungrounded tail and salvages a beat down to its cited prefix, so a
// small model that drafts a full paragraph around a couple of sourced sentences
// ships only those sentences ("wrote a lot, kept little"). Under groundLater the
// beat KEEPS the whole draft — grounding becomes a downstream LABEL (per-span
// provenance: cite what a source witnesses, mark the rest as the model's own),
// never a gate that deletes. The only birth-time strike is the editor-register
// leak, which is hygiene (the model narrating the writing), not grounding. `gated`
// is still computed so the citation labels and sources ride along.
const composeBeat = async (model, { beat, slice, prior, coldStart, genre, signal, weld = null, groundLater = false, arcDirective = '', reflection = '' }) => {
  const seed = seedFor({ beat, slice });
  const ceiling = ceilingFor({ mass: slice.reduce((m, s) => m + (s.score || 0), 0) / slice.length, spans: slice });
  let paragraph = null, gated = null, action = 'regen', leak = null;
  for (let attempt = 0; attempt <= MAX_REGEN; attempt++) {
    // The design is the length spec: stop at the next heading marker so the model
    // bridges one paragraph's worth to the gap, never a "one paragraph" instruction.
    // A backend without stop sequences ignores it, byte-identical.
    const messages = renderContinuation({ beat, slice, prior, coldStart, genre, arcDirective, reflection });
    const raw = await model.phrase(messages, { maxTokens: ceiling, minTokens: FLOOR_TOKENS, stop: ['\n##'], signal });
    // The paragraph is the seed (the DEF the model was handed) plus its
    // continuation — the topic sentence the model finished.
    const continuation = String(raw || '').trim();
    const full = seed ? `${seed} ${continuation}`.trim() : continuation;
    gated = bindAndVeto(full, slice, { question: beat.topic, task: 'answer' });
    if (groundLater) {
      // Keep the whole draft; strike only the editor-register leak (one regen to
      // shed it) and trim any degeneration tail (coherence hygiene, not grounding).
      // Grounding is deferred to the render's per-span provenance pass.
      leak = frameLeak(full);
      if (leak && attempt < MAX_REGEN) { action = 'regen'; continue; }
      // BOUND FLOOR — a beat that grounds almost nothing (a small model drifting off a thin
      // slice: the dolphins run shipped 0.071-bound paragraphs) gets ONE regenerate before it
      // ships. Write-first never DELETES, but it should try once for a better-grounded draft
      // rather than ship near-ungrounded prose unchallenged; after the retry it holds and labels.
      if (!leak && gated.boundFraction < BOUND_FLOOR && attempt < MAX_REGEN) { action = 'regen'; continue; }
      const deleaked = leak ? full.replace(frameLeak(full), '').trim() : full;
      // Trim the degeneration loops, then the dangling mid-sentence tail a ceiling-length beat leaves.
      const cleaned = trimDangling(trimDegeneration(deleaked));
      if (cleaned) {
        if (cleaned !== full) gated = bindAndVeto(cleaned, slice, { question: beat.topic, task: 'answer' });
        paragraph = cleaned; action = gated.boundFraction >= 1 ? 'accept' : 'ground-later'; leak = null;
      }
      break;
    }
    let eva = evaSplice(gated);
    // A frame leak that bound lexically is struck here — the grounding floor cannot
    // see it (it rides on a grounded claim), so EVA must.
    leak = eva.action !== 'regen' ? frameLeak(eva.text) : null;
    if (leak) eva = { action: 'regen', text: '' };
    action = eva.action;
    if (eva.action !== 'regen') { paragraph = eva.text; break; }
  }
  // SALVAGE — the regenerate also under-bound (a small model drifting off a thin
  // slice: bound fraction < threshold, so evaSplice never reached its splice arm).
  // The bound PREFIX is still real grounded material — on a load-bearing beat the
  // seed is grounded by construction — so ship it rather than hold a NUL that
  // wastes the slice (the batman run's 0/5: every beat held, nothing shipped).
  // The floor does not move: only cited claims survive (re-gated for accurate
  // sources), a leaked prefix is struck, and a beat where NOTHING bound — a
  // connective seed with a drifting continuation — still holds as NUL. Never
  // confabulation; at worst the beat is the anchor's own topic sentence.
  if (!groundLater && !paragraph && gated) {
    const prefix = boundPrefix(gated.bound);
    if (prefix && !frameLeak(prefix)) {
      const regated = bindAndVeto(prefix, slice, { question: beat.topic, task: 'answer' });
      if (regated.sources.length) { paragraph = prefix; gated = regated; action = 'salvage'; leak = null; }
    }
  }
  // The SELF-READ WELD — re-read the accepted paragraph through the grounder
  // BEFORE it becomes the prior the next paragraph opens on. The birth gate above
  // is lexical and slice-scoped; the weld's three signals (number / refold /
  // witness, docs/self-read-weld-measurement.md) catch the drift that rides
  // through it. A struck sentence is dropped and the paragraph RE-GATED so its
  // sources stay accurate; a fully-struck paragraph holds as NUL — drift is never
  // folded into the running document, and never becomes the next retrieval cue.
  // The weld strikes drift before it becomes the next prior. Under groundLater we keep
  // the draft whole and label it downstream, so the weld's discarding is off — the
  // provenance pass will mark any drift as the model's own rather than delete it.
  let welded = null;
  if (paragraph && weld && !groundLater) {
    welded = selfRead(paragraph, { slice, pool: weld.pool, doc: weld.doc });
    if (welded.action === 'reject') { paragraph = null; }
    else if (welded.action === 'splice') {
      const regated = bindAndVeto(welded.text, slice, { question: beat.topic, task: 'answer' });
      if (regated.sources.length) { paragraph = welded.text; gated = regated; action = 'weld'; }
      else { paragraph = null; }
    }
  }
  return { paragraph, gated, action, leak, seed, weld: welded };
};

// recordFor — the accepted-paragraph record (the shape the progress fold and the
// caller read). Frozen so a walked paragraph is never mutated after the fact.
const recordFor = (beat, seed, paragraph, gated, action) => Object.freeze({
  beat: beat.id, sectionId: beat.sectionId, role: beat.role, heading: beat.heading,
  topic: beat.topic, kind: beat.kind, seed, text: paragraph,
  sources: gated.sources, boundFraction: gated.boundFraction, action, closes: false,
});

const LIVE_WIDTH = 3;         // spans per live slice (anchor + strongest fresh neighbours)
const LOAD_BEARING = 0.6;     // score at or above which a live anchor is pinned tight

export const walk = async ({
  fold = [],              // the running situation: ranked evidence spans (the ground pool)
  design = null,          // ordered beats, or a { demand, outline } the walk carves once
  model,                  // model.phrase(messages, opts) -> text
  genre = '',             // optional cold-start genre declaration, first call only
  maxBeats = Infinity,    // beats to write this call. v1: the whole design.
  question = '',          // carried into the carve when design is a { demand, outline } spec
  state = null,           // resumable state — the SEAM; v1 produces no caller that feeds it back
  refold = null,          // self-read RETRIEVAL (deferred capacity #3): async ({ prior, accepted,
                          // covered, index, question, seen }) -> fresh spans for the next beat.
                          // When set, the walk runs LIVE — generation drives retrieval, each beat's
                          // fold re-focused by the paragraph before it, rather than one static pool.
  selfRead: weldOn = true, // the SELF-READ WELD GATE: re-read each accepted paragraph through the
                          // grounder (number / refold / witness signals) and strike drifted
                          // sentences before the paragraph becomes the next prior. Measured in
                          // docs/self-read-weld-measurement.md; off restores the birth gate alone.
  doc = null,             // optional — the reading's own doc; sharpens the weld's witness signal
                          // (propositional judgment, coref intact). Absent, the weld degrades to
                          // the citation-holds gate against the slice.
  groundLater = false,    // WRITE FIRST, GROUND LATER: keep each drafted paragraph WHOLE (strike
                          // only editor-register leaks) and let grounding be a downstream per-span
                          // label rather than a birth-time gate that salvages the draft down to its
                          // cited prefix. Off by default — the birth gate stays the shipped floor.
  flow = null,            // FLOW WITNESS/SHAPE — { prior, parse, perSentences }. The amodal build-arc
                          // prior (docs/flow-prior.md); `parse` is the injected in-organ accessor
                          // (text→doc) so the flow engine stays modality-free. When set, each accepted
                          // paragraph is scored against the prior and the verdict + the arc-demanded
                          // move ride the trace (OBSERVE — no token change). Null ⇒ identical behavior.
  flowShape = false,      // SHAPE (rev-flag opt-in) — feed the arc-demanded move into the beat prompt
                          // as a soft directive. Requires `flow.prior`. Default OFF: the observe path
                          // measures without steering; only this flips tokens.
  deepRead = null,        // DEEP READING — { source, surf, reflect? }. Before each beat, surf the
                          // source to its place of most interest and fold a reflection there; it rides
                          // the beat prompt as the reader's OWN reading (reafferent, never citable), so
                          // the model composes with the thought and the grounder never grounds it
                          // (docs/deep-reading.md). Null ⇒ byte-identical prompt.
  onParagraph = null,     // (record, i) -> void — called as each paragraph is accepted (UI streaming)
  signal = null,
} = {}) => {
  // Deep-reading habituation — places already reflected on across this walk (never
  // re-reflect a place; the rumination cure). Shared across beats so each beat's
  // reflection lands on a FRESH surprise peak.
  const drVisited = new Set();
  // Normalise the fold idx so a span's identity is stable across calls.
  const pool = (fold || []).map((s, i) => ({ ...s, idx: s.idx ?? i }));

  // Carve the design ONCE, or resume the one carried in state — copied forward,
  // never re-derived, so the shape is stable across messages.
  const carved = state?.design || carveDesign({ design, fold: pool, question });
  const anchors = new Set(carved.beats.map(b => b.idx));

  const accepted = state?.accepted ? [...state.accepted] : [];
  const covered = new Set(state?.covered || accepted.flatMap(p => p.sources || []));
  const done = new Set(state?.done || accepted.map(p => p.beat));   // beats already walked (accepted or held)
  const trace = [];
  let wrote = 0;

  // ── LIVE WALK — the self-read weld (refold provided) ──────────────────────────
  // No pre-carved beat list: each paragraph refolds for a NEW part of the fold,
  // focused by the paragraph before it (the last accepted text is the retrieval
  // cue). The demand caps the run; an empty refold IS saturation — the fold is
  // spent, so stop and report the shortfall rather than pad. This is the shape the
  // reader drives: it owns retrieval, the walk owns the grounded-paragraph floor.
  if (typeof refold === 'function') {
    const demandCap = Number.isInteger(design?.demand) && design.demand > 0 ? design.demand : maxBeats;
    // Seed `seen` from BOTH the carried coverage and the accepted paragraphs' cites,
    // so a discovered continuation (state.covered = the fold the single call already
    // drank) refolds for genuinely NEW spans instead of re-serving them.
    const seen = new Set([...covered, ...accepted.flatMap(p => (p.sources || []))].map(String));
    // The weld's "anywhere" pool accumulates every span the live walk has been
    // served — the fold as drunk so far — since no static pool exists here.
    const served = [];
    // FLOW — carry the previous section's vector across beats (the build so far) and a
    // finite step count for the arc position. prevStep starts null (cold: the arc opens
    // on DEF/INS); flowTotal is the demand ceiling, defensively finite for a boundless run.
    let prevStep = null;
    const flowTotal = Number.isFinite(demandCap) ? demandCap : 6;
    let idx = accepted.length;
    while (idx < demandCap && wrote < maxBeats) {
      if (signal?.aborted) { trace.push({ beat: `b${idx}`, kind: 'aborted' }); break; }
      const prior = accepted.length ? accepted[accepted.length - 1].text : '';
      const fresh = (await refold({ prior, accepted: [...accepted], covered: new Set(covered), index: idx, question, seen })) || [];
      if (!fresh.length) { trace.push({ beat: `b${idx}`, kind: 'saturated' }); break; }  // the fold is spent
      const slice = fresh.slice(0, LIVE_WIDTH).map((s, j) => ({ ...s, idx: s.idx ?? `L${idx}.${j}` }));
      const anchor = slice[0];
      const beat = {
        id: `b${idx}`, order: idx, sectionId: 's0', idx: anchor.idx,
        topic: anchor.text || question, kind: (anchor.score || 0) >= LOAD_BEARING ? 'load-bearing' : 'connective',
        role: idx === 0 ? 'open' : 'continue', heading: null,
      };
      const coldStart = accepted.length === 0;
      served.push(...slice);
      const weld = weldOn ? { pool: served, doc } : null;
      // SHAPE (flowShape only) — the arc-demanded move at this position, derived off the
      // build so far (prevStep), fed to the prompt as a soft directive. '' when off/underived.
      const arcDirective = flowShape ? arcDirectiveFor(flow, prevStep, idx, flowTotal) : '';
      // DEEP READING — a reflection at the source's next place of most interest (habituated),
      // handed to the model as its own reading (reafferent, never citable). '' when unwired.
      const reflection = beatReflection(deepRead, drVisited);
      const { paragraph, gated, action, leak, seed, weld: welded } = await composeBeat(model, { beat, slice, prior, coldStart, genre, signal, weld, groundLater, arcDirective, reflection });
      // Spend only what the beat CONSUMED: its anchor (a walked beat is never
      // retried against the same anchor — monotone), plus every span the accepted
      // paragraph actually CITED (re-anchoring a cited span later would restate
      // it — the spec's first failure mode). Context neighbours that merely rode
      // along stay available to anchor a later beat: spending the whole slice
      // capped the walk at floor(pool/LIVE_WIDTH) paragraphs and reported an
      // honest-sounding "saturated" over a fold with plenty of fresh ground.
      covered.add(anchor.idx); seen.add(String(anchor.idx));
      for (const src of ((gated && gated.sources) || [])) { covered.add(src); seen.add(String(src)); }
      done.add(beat.id); wrote += 1; idx += 1;
      // NUL — no paragraph survived (empty / all-leak), or, in the birth-gate path, it
      // grounded nothing. Under groundLater a paragraph with no cited span is still
      // KEPT (grounding is a later label), so only an empty draft holds.
      if (!paragraph || (!groundLater && !gated.sources.length)) {
        trace.push({ beat: beat.id, kind: 'nul', boundFraction: round3(gated?.boundFraction ?? 0), leak,
                     ...(welded?.fired ? { weld: welded.action } : {}) });
        continue;
      }
      const record = recordFor(beat, seed, paragraph, gated, action);
      accepted.push(record);
      // OBSERVE — score the running draft's newest section against the flow prior and
      // carry its vector forward. Pure measurement: the paragraph is already accepted, so
      // this changes nothing about what shipped — it only rides the trace as a flow record.
      const fs = flowStep(flow, prevStep, accepted.map(p => p.text).filter(Boolean).join('\n\n'), idx, flowTotal);
      prevStep = fs.step;
      trace.push({ beat: beat.id, kind: action, cited: gated.sources.length, boundFraction: round3(gated.boundFraction),
                   ...(welded?.fired ? { weldStruck: welded.spans.filter(s => s.fired).length } : {}),
                   ...(fs.record ? { flow: fs.record } : {}) });
      if (onParagraph) { try { onParagraph(record, accepted.length - 1); } catch (e) { /* UI hook, never fatal */ } }
    }
    const answerLive = accepted.map(p => p.text).filter(Boolean).join('\n\n');
    // Numeric-aware: live sources are global sentence indices (ints) — a bare sort
    // would order them lexicographically ("10" before "9").
    const sourcesLive = [...new Set(accepted.flatMap(p => p.sources || []))]
      .sort((a, b) => (typeof a === 'number' && typeof b === 'number') ? a - b : String(a).localeCompare(String(b)));
    // Whole-piece flow report — a compact roll-up of the per-beat records for the audit:
    // how many beats went off-manifold or lurched, and the sequence of moves the arc
    // DEMANDED across the walk (e.g. a wall of INS is the flat-refrain signature). Null
    // when flow was not wired, so the audit stays byte-identical without a prior.
    const flowRecords = trace.filter(t => t.flow).map(t => ({ beat: t.beat, ...t.flow }));
    const flowReport = flowRecords.length ? {
      prior: flow?.prior?.meta?.facets || null,
      beats: flowRecords,
      offManifold: flowRecords.filter(r => r.residualPct != null && r.residualPct > 95).length,
      lurches: flowRecords.filter(r => r.deltaPct != null && r.deltaPct > 90).length,
      wantSeq: flowRecords.map(r => r.want),
    } : null;
    return {
      answer: answerLive, paragraphs: accepted, sources: sourcesLive,
      design: Object.freeze({ ...carved, live: true }),
      progress: progressAgainst(carved, accepted), trace,
      state: { design: carved, accepted, covered: [...covered], done: [...done] },
      ...(flowReport ? { flow: flowReport } : {}),
    };
  }

  for (const beat of carved.beats) {
    if (signal?.aborted) { trace.push({ beat: beat.id, kind: 'aborted' }); break; }
    if (done.has(beat.id)) continue;               // resume: skip beats already walked
    if (wrote >= maxBeats) break;                  // this message's budget is spent; the rest resume

    // SATURATION — the honest floor beneath "the design is filled". If the
    // uncovered mass of the fold has fallen below epsilon, the fold is spent:
    // stop here and report the shortfall rather than pad the remaining beats.
    const sat = groundSaturation(pool, covered, { epsilon: EPSILON });
    if (sat.saturated) { trace.push({ beat: beat.id, kind: 'saturated', remainingFrac: round3(sat.remainingFrac) }); break; }

    const slice = sliceFor(beat, pool, covered, anchors);
    if (!slice.length) { done.add(beat.id); trace.push({ beat: beat.id, kind: 'no-slice' }); continue; }

    const prior = accepted.length ? accepted[accepted.length - 1].text : '';
    const coldStart = accepted.length === 0;
    const weld = weldOn ? { pool, doc } : null;
    const { paragraph, gated, action, leak, seed, weld: welded } = await composeBeat(model, { beat, slice, prior, coldStart, genre, signal, weld, groundLater });

    // Cover the slice whether the beat held or not — a walked beat is not retried
    // against the same slice (monotone coverage), and the beat is marked done.
    for (const s of slice) covered.add(s.idx);
    done.add(beat.id);
    wrote += 1;

    // NUL — no paragraph survived, or (birth-gate path) it grounded nothing. Under
    // groundLater a paragraph with no cited span is KEPT and labeled downstream.
    if (!paragraph || (!groundLater && !gated.sources.length)) {
      trace.push({ beat: beat.id, kind: 'nul', boundFraction: round3(gated?.boundFraction ?? 0), leak,
                   ...(welded?.fired ? { weld: welded.action } : {}) });
      continue;
    }

    const record = recordFor(beat, seed, paragraph, gated, action);
    accepted.push(record);
    trace.push({ beat: beat.id, kind: action, cited: gated.sources.length, boundFraction: round3(gated.boundFraction),
                 ...(welded?.fired ? { weldStruck: welded.spans.filter(s => s.fired).length } : {}) });
    if (onParagraph) { try { onParagraph(record, accepted.length - 1); } catch (e) { /* UI hook, never fatal */ } }
  }

  const progress = progressAgainst(carved, accepted);
  const answer = accepted.map(p => p.text).filter(Boolean).join('\n\n');
  const sources = [...new Set(accepted.flatMap(p => p.sources || []))].sort((a, b) => a - b);

  return {
    answer,
    paragraphs: accepted,
    sources,
    design: carved,
    progress,
    trace,
    // The resumable statistic the deferred across-messages capacity will feed
    // back. In v1 no caller feeds it back, and no store persists it — it exists so
    // that turning on the next capacity is a wiring change, not a rewrite.
    state: { design: carved, accepted, covered: [...covered], done: [...done] },
  };
};
