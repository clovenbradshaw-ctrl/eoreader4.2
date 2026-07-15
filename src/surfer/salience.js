// EO: SIG·EVA(Field,Link,Atmosphere → Field,Link, Tending,Binding) — Born salience vs the thread
// Salience by the Born rule, measured against the activated conversation thread.
//
// The surfer rides a field and arrests where structure beats the noise null (surf.js). But
// "structure" there is the document's OWN coherence — how surprising a bond is in context. It
// says nothing about whether the bond is what THIS conversation is about. Salience is that
// second thing, and it is not a property of the document: it is a projection onto the
// currently activated thread.
//
// The Born rule is the projection. The thread is a state |T⟩ — a vector over the content terms
// the conversation has activated (the prompt, yes, but not only the prompt: the recent turns
// too, recency-weighted, because the activated thread is the whole live context, not one
// message). A candidate span is a state |s⟩ over its own terms. Its salience is the Born
// weight |⟨T|s⟩|² — how much of the span lies along the thread. A span orthogonal to the
// thread scores ~0 no matter how internally surprising it is; a span that lies along it scores
// high. This is embedder-free: the space is the discrete term space the engine already
// tokenises into, not a learned embedding, so the same |⟨·|·⟩|² the significance column runs
// over eigen-lenses runs here over the thread with nothing distributional underneath.
//
// The CUTOFF — "when is what the surfer returns no longer salient" — is then the same noise
// null the surf already uses (deriveNull, the Born-rule VOID boundary): run it over the
// thread-projected weights and a span is salient iff its weight beats what the field's own
// non-aligned bulk throws up by chance. So salience and structure are decided by one rule, the
// only difference being the basis: the document's surprise for structure, the thread for
// salience. The surfer keeps returning content while it is salient to the thread and stops
// when it is not — bounded by relevance, not by a window.

import { tok } from '../perceiver/parse/index.js';
import { surpriseAt } from '../core/index.js';

// threadBasis({ query, history, cast, doc }) → the activated thread, in TWO channels:
//   terms    a sparse term vector (Map<term, weight>) — the prompt weighted fullest, the
//            recent turns γ-decayed by recency (the live context, not just the last message),
//            the cast folded in. The lexical channel.
//   figures  the doc ENTITIES the thread is about (lowercased labels) — every figure a thread
//            term names. The COREF channel: a sentence saying "the creature" is salient to a
//            thread about Gregor even though it spells no thread term, because the surfer's
//            field resolves "the creature" to Gregor and the figure channel matches there.
// Two channels because salience is both lexical (does it use the words) and referential (is it
// ABOUT the figures) — and the referential one is what survives coref. Empty when nothing is
// activated (→ no conditioning). Embedder-free: term space + the doc's own entity labels.
export const threadBasis = ({ query = '', history = [], cast = [], doc = null, gamma = 0.7 } = {}) => {
  const terms = new Map();
  const add = (text, w) => { for (const t of tok(String(text || ''))) terms.set(t, (terms.get(t) || 0) + w); };
  add(query, 1);                                   // the prompt — the strongest pull
  // the recent turns, most-recent weighted highest (γ-decay back through the thread). User
  // turns only — the talker's own prior answers are a weaker witness and not the activated ask.
  const userTurns = (history || []).filter((m) => m && m.role === 'user' && m.content).map((m) => m.content);
  let w = gamma;
  for (let i = userTurns.length - 1; i >= 0; i--) { add(userTurns[i], w); w *= gamma; }
  for (const c of cast || []) add(c, 1);           // the warm figures the thread holds

  // resolve the thread's FIGURES against the doc: an entity is on the thread when any token of
  // its label is an activated term. ("gregor" in the thread → the figure "Gregor Samsa".)
  return { terms, figures: threadFigures(terms, doc) };
};

// threadFigures(terms, doc) → the doc ENTITIES a thread's terms name (lowercased labels). Split
// out of threadBasis so the SAME term basis can be resolved against a DIFFERENT doc — the
// multi-level surf reuses one thread's terms (which are doc-independent) but must re-resolve the
// figures against each source's OWN standalone doc, so figureSalience scores that source's
// entities and never a neighbour source's. Empty when no doc or no terms.
export const threadFigures = (terms, doc) => {
  const figures = new Set();
  if (!doc || !terms || terms.size === 0) return figures;
  // match a label token against the thread terms, possessive-tolerant ("grete's" → grete):
  // a name in the query nearly always arrives possessive ("Grete's feeling"), and that must
  // still activate the figure "Grete".
  const norm = new Set([...terms.keys()].map((t) => t.replace(/['’]s$/, '')));
  const onThread = (t) => terms.has(t) || norm.has(t);
  const ev = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const seen = new Set();
  for (const e of ev) {
    if (e.op !== 'INS' || e.id == null) continue;
    const label = String(e.label || '').toLowerCase();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    if (label.split(/\s+/).some(onThread)) figures.add(label);
  }
  return figures;
};

// positionThread(doc, position, { reach, gamma }) → the reader's POSITION as an activated thread,
// the CO-READING analogue of threadBasis. In deep reading the thread is a chat query, or — idle —
// nothing (the seed only varies WHICH void the walk starts from; the peak is the document's own
// steepest structure). Co-reading points that same mechanism at the reader: where the eye sits IS
// the thread. So the passage at `position` becomes the state |T⟩ — the sentence under the eye
// weighted fullest, the sentences around it γ-decayed by distance (the live reading context, not
// one line) — and its figures resolve against the doc, exactly as a query's terms would. The
// surfer then re-weights the peak toward this passage (surf.js thread conditioning), so "most
// interesting" means most interesting to WHERE YOU ARE. Embedder-free: the doc's own token sets
// (no re-tokenisation when tokensBySentence is present), the doc's own entity labels. Empty (→ no
// conditioning, byte-identical to unseeded deep reading) when the doc is empty or position is not
// a real index.
export const positionThread = (doc, position, { reach = 4, gamma = 0.7 } = {}) => {
  const sents = doc?.units || doc?.sentences || [];
  const sets = doc?.tokensBySentence || null;
  const n = sents.length;
  const terms = new Map();
  if (!n || !Number.isInteger(position)) return { terms, figures: new Set() };
  const p = Math.max(0, Math.min(n - 1, position));
  const addAt = (i, w) => {
    const ts = (sets && sets[i]) ? sets[i] : tok(String(sents[i] ?? ''));
    for (const t of ts) terms.set(t, (terms.get(t) || 0) + w);
  };
  addAt(p, 1);                                       // the line under the eye — the strongest pull
  for (let d = 1; d <= reach; d++) {                 // the passage around it, decayed by distance
    const w = Math.pow(gamma, d);
    if (p - d >= 0) addAt(p - d, w);
    if (p + d < n) addAt(p + d, w);
  }
  return { terms, figures: threadFigures(terms, doc) };
};

// combineThreads(a, b) → the union of two threads, so the reader's position can COMPOSE with a
// live chat thread (or a lens filter) rather than replace it: term weights sum, figure sets union.
// Either side may be null/empty (then the other passes through unchanged). This is how "where you
// are" and "what is being discussed" steer the co-reader together — the passage under the eye and
// the question in the thread both pull on the same |T⟩.
export const combineThreads = (a, b) => {
  const ta = (a && (a.terms || a)) || null;
  const tb = (b && (b.terms || b)) || null;
  if (!ta || (ta.size === 0)) return b || { terms: new Map(), figures: new Set() };
  if (!tb || (tb.size === 0)) return a || { terms: new Map(), figures: new Set() };
  const terms = new Map(ta);
  for (const [t, w] of tb) terms.set(t, (terms.get(t) || 0) + w);
  const figures = new Set(a.figures || []);
  for (const f of (b.figures || [])) figures.add(f);
  return { terms, figures };
};

// bornSalience(basis, tokenSet) → |⟨T|s⟩|², the Born weight of a span against the thread.
// The span is its set of terms (the doc's tokensBySentence entry); the thread is the weighted
// basis. The overlap is the cosine in the shared term space, squared (the Born rule). 0 when
// either side is empty — an unactivated thread conditions nothing; an empty span lies nowhere.
export const bornSalience = (basis, tokenSet) => {
  if (!basis || basis.size === 0 || !tokenSet) return 0;
  const terms = tokenSet instanceof Set ? tokenSet : new Set(tokenSet);
  if (terms.size === 0) return 0;
  let dot = 0;
  for (const t of terms) { const b = basis.get(t); if (b) dot += b; }   // span weights are 1
  if (dot === 0) return 0;
  let nb = 0; for (const v of basis.values()) nb += v * v;              // ||T||²
  const ns = terms.size;                                                // ||s||² = #terms (unit weights)
  const d = Math.sqrt(nb) * Math.sqrt(ns);
  if (d <= 1e-12) return 0;
  const o = dot / d;
  return o * o;
};

// termMass(text) → Map<term, mass>, unit mass per token occurrence — the shape surpriseAt reads.
const termMass = (text) => {
  const m = new Map();
  for (const t of tok(String(text || ''))) m.set(t, (m.get(t) || 0) + 1);
  return m;
};

// retreads(said, candidate, { gamma }) → is the candidate span RE-COVERING already-said ground
// rather than adding to it? The self-repetition read a small model needs (the 3B loops whole
// sentences to fill the paragraph cap once it has said its piece — the woodpecker answer's third
// paragraph re-ran its first two). Measured, never a sampling constant.
//
// The measure is the engine's ONE surprise (core/surprise.js), the same turn/research.js stops a
// non-novel web hop on — turned on the answer's OWN prior text. surpriseAt gives the per-term
// belief-shift (`bayesBy`, the KL each term carries); we split that shift into the mass landing on
// terms ALREADY said (onBits) and on newcomers (offBits) and read the SELF-NORMALIZED crossing:
// onBits > offBits — the belief moving mostly back onto what is already held rather than out to
// something new. It is the frameMassPartition doctrine (chorus/born.js) in surprise space: the two
// shares of ONE surprise decide, "not a chosen bar." No constant, and — because a ubiquitous topic
// term carries ≈0 KL — the ever-present subject word never dominates the way a raw squared-mass
// crossing would. Empty/no-surprise ⇒ false (the honest no-mass; never judged into a stop).
export const retreads = (said, candidate, { gamma = 0.8 } = {}) => {
  const prior = termMass(said);
  const arrival = termMass(candidate);
  if (arrival.size === 0 || prior.size === 0) return false;
  const { bayesBits, bayesBy } = surpriseAt(prior, arrival, { gamma });
  if (!(bayesBits > 0)) return false;
  let onBits = 0, offBits = 0;
  for (const [term, bits] of Object.entries(bayesBy)) {
    if (prior.has(term)) onBits += bits; else offBits += bits;
  }
  return onBits > offBits;
};

// linkSalience(threadFigures, link) → the Born weight of a LINK against the thread.
//
// The salient unit is not a node, and not a PAIR of nodes (two is arbitrary) — it is the LINK:
// the edge, the operator, incident on however many participants it relates. So salience is a
// projection of the link's participant set onto the thread: |⟨T|p⟩|², the squared cosine of
// the link's participants against the thread's figures. A link whose participants are all on
// the thread scores 1; a link incident on one of them scores less; a link wandering off the
// thread is penalised by the cosine. This generalises the figure channel from the node to the
// edge and of any arity — and it discriminates the relation from the mere mention: a link
// BETWEEN two thread figures ("Grete fed Gregor") outranks a link merely touching one ("Gregor
// crawled"), with no rule that says "two", because the cosine rewards coverage of the link.
export const linkSalience = (threadFigures, link) => {
  if (!threadFigures || threadFigures.size === 0 || !link) return 0;
  const parts = (Array.isArray(link.participants) ? link.participants : [link.src, link.tgt])
    .filter((x) => x != null).map((x) => String(x).toLowerCase());
  if (parts.length === 0) return 0;
  let hit = 0;
  for (const p of parts) if (threadFigures.has(p)) hit += 1;
  if (hit === 0) return 0;
  const o = hit / (Math.sqrt(threadFigures.size) * Math.sqrt(parts.length));
  return o * o;
};

// linksBySentence(doc) → Map<sentIdx, link[]> — the links each span carries, participants
// resolved to labels. A link is a CON/SIG bond (an operator edge); its participants are its
// endpoints (src and, if any, tgt). This is the per-span edge set the link channel scores.
export const linksBySentence = (doc) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, String(e.label).toLowerCase());
  const L = (id) => label.get(id) ?? String(id).toLowerCase();
  const map = new Map();
  for (const e of events) {
    if (!((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null && e.sentIdx != null)) continue;
    if (!map.has(e.sentIdx)) map.set(e.sentIdx, []);
    map.get(e.sentIdx).push({ via: String(e.via), participants: [L(e.src), e.tgt != null ? L(e.tgt) : null].filter((x) => x != null) });
  }
  return map;
};

// figureSalience(threadFigures, cursorFigures) → the Born overlap² of two figure sets — the
// referential channel. Both the thread's figures and the cursor's COREF-RESOLVED figures (the
// surfer's warm field, so "the creature"/"it"/"the thing" already count as Gregor). |⟨T|s⟩|²
// over the discrete figure space: the squared cosine of the two indicator vectors. 0 when
// either side is empty — a figureless thread or cursor contributes nothing here.
export const figureSalience = (threadFigures, cursorFigures) => {
  if (!threadFigures || threadFigures.size === 0 || !cursorFigures || cursorFigures.length === 0) return 0;
  const cur = cursorFigures.map((f) => String(f).toLowerCase());
  let hit = 0;
  for (const f of cur) if (threadFigures.has(f)) hit += 1;
  if (hit === 0) return 0;
  const o = hit / (Math.sqrt(threadFigures.size) * Math.sqrt(cur.length));
  return o * o;
};

// salienceField(doc, basis) → the per-sentence term-channel Born salience against the thread.
// Reads the doc's own token sets — embedder-free, no re-tokenisation. (The figure channel
// needs the surfer's per-cursor resolved figures and so is applied inside surfFold.)
export const salienceField = (doc, basis) => {
  const terms = basis?.terms || basis;   // accept {terms,figures} or a bare term Map
  const sets = doc?.tokensBySentence || [];
  return sets.map((s) => bornSalience(terms, s));
};
