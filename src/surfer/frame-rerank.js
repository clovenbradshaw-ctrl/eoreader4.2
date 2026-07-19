// EO: SEG·EVA(Field,Atmosphere → Field, Dissecting·Tracing) — the steer as a re-rank
// Its own act is selection + order (SEG·EVA), which is precisely how it moves the steer OFF the
// SYN·Cultivating desert cell: you cannot instruct Cultivating, so you cultivate by arranging.
// The prompting consequence of the referent work (docs/referents-recursed-up-the-domain-axis.md,
// "What it changes in prompting", point 2). The frame a turn should read in is an UNNAMED
// referent of the prompt: you point at it by the ARRANGEMENT of Figure-grain material — which
// spans get in, in what order — never by a Ground-grain sentence naming it. Naming the frame in
// prose is the named-referent fallacy (one manifestation privileged over the centre of mass),
// and prompt-as-site.md measured what it costs: a Ground-row instruction lands on the desert
// cell (Cultivating), the row a small model has the fewest words for and drops first.
//
// You cannot instruct Cultivating; you cultivate by arranging conditions. So the steer becomes
// a re-rank: pull the spans that ORBIT the intended frame's barycenter to the front and let the
// model's own reading mint the frame. This is fold-before-gate for prompting — a frame whose
// evidence is scattered across several individually-unremarkable spans is surfaced by pooling
// them onto one barycenter and ranking by overlap with it, rather than by gating each span alone.
//
// Pure over vectors (a span's significance activation), so it is omnimodal and testable with no
// model, no DOM, no log. A primitive the grounder adopts; it decides ORDER and SELECTION, the
// two things prompt-as-site.md says stay in the grounder — and emits no prose.

// |⟨f|v⟩|² — the Born overlap of a span vector with the frame direction, both unit-normalised.
const bornOverlap = (frame, v) => {
  if (!Array.isArray(frame) || !Array.isArray(v)) return 0;
  let dot = 0, nf = 0, nv = 0;
  const n = Math.min(frame.length, v.length);
  for (let i = 0; i < n; i++) { dot += frame[i] * v[i]; nf += frame[i] * frame[i]; nv += v[i] * v[i]; }
  const d = Math.sqrt(nf) * Math.sqrt(nv);
  if (d <= 1e-12) return 0;
  const o = dot / d;
  return o * o;
};

// The barycenter of a set of vectors — the centre of mass the scattered manifestations orbit.
const barycenter = (vecs) => {
  const rows = (vecs || []).filter((v) => Array.isArray(v) && v.length);
  if (!rows.length) return null;
  const dim = rows[0].length;
  const c = new Array(dim).fill(0);
  for (const v of rows) for (let i = 0; i < dim; i++) c[i] += (v[i] || 0) / rows.length;
  return c;
};

// frameDirection(items, { lens, anchors, seed }) — resolve the frame to point at:
//   lens     an explicit frame direction (a chosen eigen-lens) — used as-is;
//   anchors  vectors whose barycenter IS the frame (the spans known to orbit it);
//   seed     else fold-before-gate: take the `seed` top items by pairwise coherence as the
//            provisional orbit and use THEIR barycenter — so a scattered frame is recovered
//            from the material itself rather than assumed to be one dominant span.
export const frameDirection = (items, { lens, anchors, seed = 3 } = {}) => {
  if (Array.isArray(lens) && lens.length) return lens;
  if (Array.isArray(anchors) && anchors.length) return barycenter(anchors);
  const vecs = (items || []).map((it) => it.vec).filter((v) => Array.isArray(v) && v.length);
  if (!vecs.length) return null;
  // The provisional barycenter is the whole field's centre; rank by overlap with it, then pool
  // the top `seed` — the emergent orbit — and recompute. One pass of the fold-before-gate idea.
  const c0 = barycenter(vecs);
  if (!c0) return null;
  const ranked = [...vecs].sort((a, b) => bornOverlap(c0, b) - bornOverlap(c0, a));
  return barycenter(ranked.slice(0, Math.max(1, seed)));
};

// frameRerank(items, opts) → items re-ordered by overlap with the frame, each carrying its
// score. STABLE: ties keep their original order (a re-rank cultivates; it does not shuffle).
//   items  [{ id, vec, ... }]  — spans with their significance activation
//   opts   { lens?, anchors?, seed?, keep? }  — the frame to point at; keep caps the survivors
// Returns { direction, ranked }: `ranked` is the re-ordered items (sliced to keep) each with a
// `frameScore`; `direction` is the barycenter it pointed at (null if unresolved → order held).
export const frameRerank = (items, opts = {}) => {
  const list = Array.isArray(items) ? items : [];
  const direction = frameDirection(list, opts);
  if (!direction) return { direction: null, ranked: list.slice() };   // nothing to point at → held
  const scored = list.map((it, i) => ({ it, i, s: bornOverlap(direction, it.vec) }));
  scored.sort((a, b) => (b.s - a.s) || (a.i - b.i));                   // stable on ties
  const keep = Number.isFinite(opts.keep) ? Math.max(0, opts.keep | 0) : scored.length;
  const ranked = scored.slice(0, keep).map(({ it, s }) => ({ ...it, frameScore: Math.round(s * 1e4) / 1e4 }));
  return { direction, ranked };
};
