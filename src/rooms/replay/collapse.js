// EO: SEG·EVA(Network,Field → Lens,Atmosphere, Unraveling,Tracing) — the read-time collapse fold
// collapse.js — the whole thesis of the Replay surface, made mechanical and pure.
//
// No ingest organ returns an ANSWER. It returns a DISTRIBUTION. Whisper does not hand
// back "drones"; it hands back a set of candidates each carrying (a) the acoustic prior
// the microphone actually justifies and (b) how often that candidate appears across the
// documents being read against. The collapse — the choice of one word — happens HERE, at
// read time, against the corpus, and the corpus is a set of sources the reader can turn
// on and off. So the collapse can be run again, differently, by flipping a source, and
// the model never runs twice.
//
// The arithmetic (§ "Report the distribution. Never the decision."):
//
//     weight(candidate) = acoustic(candidate) · (CORPUS_BASE + Σ_{s ∈ enabled} support(candidate, s))
//     p(candidate)      = weight(candidate) / Σ weights
//     chosen            = argmax p
//
// CORPUS_BASE is the mass a candidate carries from the audio alone — it is why a word with
// zero corpus support still has SOME probability, and it is exactly what "itself only"
// (enabled = ∅) reads against. Turn a source off and its counts drop out of the sum; a
// different candidate can win; the word on the page changes. Nothing is re-transcribed —
// the acoustic priors never move. Only the reading does.
//
// This is the same fold-decides discipline as enact/replay.js and projectGraph: a PURE
// function of (scene, enabled, cursor). Lose the state and rebuild it by replay — the
// surface never saves a collapsed transcript, because a saved string is the crime the
// whole surface exists to refuse.

// The audio-alone mass every candidate carries before any corpus evidence. Small enough
// that a well-attested corpus word dominates, large enough that a word the corpus never
// mentions still reads out (and dominates outright under "itself only").
export const CORPUS_BASE = 4;

const isPlainToken = (tok) => typeof tok === 'string' || tok == null || !Array.isArray(tok.cand);

// The corpus support a candidate draws from the currently-enabled sources: the sum of its
// per-source counts, restricted to `enabled`. `enabled` is a Set of source ids; the empty
// set is "itself only" — the audio read against nothing, every corpus assumption stripped.
export const corpusMass = (cand, enabled) => {
  const sup = cand.sup || {};
  let n = 0;
  for (const s of Object.keys(sup)) if (enabled.has(s)) n += Number(sup[s]) || 0;
  return n;
};

// The full corpus frequency of a candidate across ALL its listed sources (enabled or not)
// — the "appears 84 times" figure the surface shows as raw evidence, independent of which
// sources are currently switched on.
export const totalCorpusMass = (cand) => {
  const sup = cand.sup || {};
  let n = 0;
  for (const s of Object.keys(sup)) n += Number(sup[s]) || 0;
  return n;
};

// collapseToken(token, enabled) → the distribution and the collapse, or null for a token
// that was never uncertain (a plain string the hearing was sure of).
//
//   { candidates:[{ word, p, weight, mass }] sorted p-descending,
//     chosen,                 the winning surface (argmax p)
//     acousticChosen,         what the AUDIO ALONE would have picked (enabled = ∅)
//     corpusDecided,          true when the corpus overruled the microphone
//     runnerUp }              the second-best, for "and it is now the best hypothesis"
export const collapseToken = (token, enabled) => {
  if (isPlainToken(token)) return null;
  const set = enabled instanceof Set ? enabled : new Set(enabled || []);
  const scored = token.cand.map((c) => {
    const mass = corpusMass(c, set);
    const weight = (Number(c.ac) || 0) * (CORPUS_BASE + mass);
    return { word: c.w, weight, mass, cand: c };
  });
  const total = scored.reduce((a, s) => a + s.weight, 0) || 1;
  const candidates = scored
    .map((s) => ({ word: s.word, p: s.weight / total, weight: s.weight, mass: s.mass, sup: s.cand.sup || {} }))
    .sort((a, b) => b.p - a.p);

  // What the microphone alone justifies — the argmax of the acoustic priors, i.e. the
  // collapse under "itself only". Every place this disagrees with `chosen` is a place the
  // corpus put a word in someone's mouth.
  const acousticChosen = token.cand
    .slice()
    .sort((a, b) => (Number(b.ac) || 0) - (Number(a.ac) || 0))[0]?.w ?? null;

  const chosen = candidates[0]?.word ?? null;
  return {
    candidates,
    chosen,
    runnerUp: candidates[1]?.word ?? null,
    acousticChosen,
    corpusDecided: chosen !== acousticChosen,
  };
};

// The plain surface of a token given the enabled sources — the string that lands on the
// left-hand page. A plain token is itself; an uncertain token is its current collapse.
export const tokenSurface = (token, enabled) => {
  if (isPlainToken(token)) return typeof token === 'string' ? token : String(token?.text ?? '');
  return collapseToken(token, enabled).chosen;
};

// figureActivation — how "live" a figure is at a cursor. Attention decays as the reading
// moves off a figure (each segment away halves it, roughly), so a figure mentioned long
// ago sits low. AND a figure is only hot if the corpus that MAKES it a figure is in the
// room: `figure.sources` lists the sources that bind it (the city is a figure only because
// the council minutes name it). With none of those enabled the activation collapses toward
// zero — the activation is a property of the reading, not of the audio.
export const figureActivation = (figure, cursor, enabled) => {
  const set = enabled instanceof Set ? enabled : new Set(enabled || []);
  const mentions = Array.isArray(figure.mentions) ? figure.mentions : [];
  let raw = 0;
  for (const m of mentions) if (m <= cursor) raw += Math.pow(0.6, cursor - m);
  const needs = Array.isArray(figure.sources) ? figure.sources : [];
  // Intrinsic figures (no source requirement, e.g. the live human speaker) are always as
  // hot as their mentions justify; corpus-bound figures scale by the fraction of their
  // binding sources that are switched on.
  const factor = needs.length === 0 ? 1 : needs.filter((s) => set.has(s)).length / needs.length;
  return Math.max(0, Math.min(1, raw * factor));
};

// edgePresent — an edge is on the page when the cursor has reached the segment that draws
// it AND every source it depends on is enabled. The city→MNPD binding requires the MNPD
// source; remove MNPD and the edge is simply gone — the resident is talking about nobody
// in particular.
export const edgePresent = (edge, cursor, enabled) => {
  const set = enabled instanceof Set ? enabled : new Set(enabled || []);
  if ((edge.bornAt ?? 0) > cursor) return false;
  const needs = Array.isArray(edge.requires) ? edge.requires : [];
  return needs.every((s) => set.has(s));
};

// foldReading(scene, { enabled, cursor }) → the reconstituted reading as of the cursor and
// no further. Everything the surface paints is here, and it is a pure function of the three
// inputs — the same (scene, enabled, cursor) always folds to the same reading.
export const foldReading = (scene, { enabled = [], cursor = 0 } = {}) => {
  const set = enabled instanceof Set ? enabled : new Set(enabled || []);
  const segments = Array.isArray(scene.segments) ? scene.segments : [];
  const cur = Math.max(0, Math.min(segments.length, Math.round(cursor)));

  // The left/right facing pages, revealed segment by segment up to the cursor.
  const revealed = segments.slice(0, cur).map((seg, i) => ({
    index: i,
    t: seg.t,
    speaker: seg.speaker,
    isNewVoice: !!seg.newVoice,
    // Each token carries its live collapse so the surface can mark the uncertain ones.
    tokens: (seg.tokens || []).map((tok) => {
      if (isPlainToken(tok)) return { plain: true, text: typeof tok === 'string' ? tok : String(tok?.text ?? '') };
      const col = collapseToken(tok, set);
      return { plain: false, token: tok, surface: col.chosen, collapse: col };
    }),
    note: seg.note || [],
    surprise: Number(seg.surprise) || 0,
  }));

  // The graph as of the cursor: nodes introduced by revealed segments, edges present under
  // the current sources. It grows as the cursor moves and un-grows when you scrub back.
  const nodes = [];
  const seenNodes = new Set();
  const edges = [];
  segments.slice(0, cur).forEach((seg, i) => {
    for (const n of seg.nodes || []) {
      if (seenNodes.has(n.id)) continue;
      seenNodes.add(n.id);
      nodes.push({ ...n, bornAt: i });
    }
    for (const e of seg.edges || []) {
      const withBorn = { ...e, bornAt: e.bornAt ?? i };
      if (edgePresent(withBorn, cur, set)) edges.push(withBorn);
    }
  });
  // A node whose only reason to exist was an edge that a disabled source removed still
  // stands if it was introduced directly; edges just stop pointing at it.

  // The attention field at the cursor.
  const figures = (scene.figures || [])
    .map((f) => ({
      id: f.id,
      label: f.label,
      note: f.note,
      activation: figureActivation(f, cur, set),
      bound: Array.isArray(f.sources) ? f.sources : [],
    }))
    .filter((f) => f.activation > 0.001 || (revealed.length && false))
    .sort((a, b) => b.activation - a.activation);

  // The surprise series up to the cursor, and its peak — the biggest departure from the
  // running average, the line the whole story turns on.
  const surprise = revealed.map((r) => ({ index: r.index, t: r.t, value: r.surprise }));
  let peak = null;
  for (const s of surprise) if (!peak || s.value > peak.value) peak = s;

  return {
    cursor: cur,
    total: segments.length,
    revealed,
    nodes,
    edges,
    figures,
    surprise,
    peak,
    enabled: [...set],
    itselfOnly: set.size === 0,
  };
};
