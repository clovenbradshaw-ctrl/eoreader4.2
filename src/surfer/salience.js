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
  const figures = new Set();
  if (doc) {
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
  }
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
