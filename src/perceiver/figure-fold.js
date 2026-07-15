// EO: SEG·SIG·DEF(Field → Network,Lens, Dissecting,Binding) — the universe a text instantiates
// figure-fold.js — the shared claim/figure extractor behind a figure's fold.
//
// perspective.js re-reads a figure's OWN words with the full parser, so their quotes yield the
// little world their utterances instantiate — who they name, what they assert. That extraction
// is factored HERE so more than one reading can reuse it: perspective.js folds a figure's whole
// voice at once; idea-transmission.js folds ONE quote at a time to time-stamp each claim. Pure
// given `parse` (default parseText), no DOM, no state, no model.

import { projectGraph } from '../core/index.js';
import { parseText } from './parse/index.js';

// The claims a PARSED doc instantiates — an IS-A (a DEF predicate, "this is surveillance") and a
// LINK (a CON/SIG bond, "the city runs it"), each traced to its sentence, coreference resolved
// through the projection's representative. The one place claim-shape is read from a graph.
export const claimsFromDoc = (doc) => {
  const claims = [];
  if (!doc?.log) return claims;
  const graph = projectGraph(doc.log);
  const rep = graph.representative || ((x) => x);
  const labelOf = (id) => doc.admission?.labelOf?.(id) || graph.entities.get(id)?.label || id;
  for (const e of doc.log.snapshot()) {
    if (e.op === 'DEF' && e.key === 'predicate' && e.value) {
      claims.push({ type: 'is-a', subject: labelOf(rep(e.id)), value: e.value, idx: e.sentIdx ?? null,
        ...(e.polarity && e.polarity !== '+' ? { polarity: e.polarity } : {}),
        ...(e.modality && e.modality !== 'realis' ? { modality: e.modality } : {}) });
    }
  }
  const seen = new Set();
  for (const edge of graph.edges) {
    if (edge.kind !== 'con' && edge.kind !== 'sig') continue;
    const key = `${rep(edge.from)}|${edge.via}|${rep(edge.to)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push({ type: 'link', subject: labelOf(rep(edge.from)), via: edge.via,
      object: labelOf(rep(edge.to)), idx: edge.sentIdx ?? null,
      ...(edge.polarity ? { polarity: edge.polarity } : {}) });
  }
  return claims;
};

// The figures a parsed doc names — the cast, most-sighted first.
export const figuresFromDoc = (doc) => {
  if (!doc?.log) return [];
  const graph = projectGraph(doc.log);
  return [...graph.entities.values()]
    .map((e) => ({ id: e.id, label: e.label, count: e.sightings || 0 }))
    .sort((a, b) => b.count - a.count);
};

// Parse a text into a mini-doc — the quote(s) re-read as their own document.
export const parseFold = (text, label, parse = parseText) => {
  try { return parse(text, { docId: `${label || 'figure'}~fold` }); } catch { return null; }
};

// A figure's fold: their quotes re-read as one document → the figures they invoke and the claims
// they assert. Unchanged in behaviour from perspective.js's original; now built on the shared
// extractor above so idea-transmission can fold a single quote the same way.
export const foldOfQuotes = (quotes, label, parse = parseText) => {
  const empty = { text: '', figures: [], claims: [] };
  const text = quotes
    .map((q) => (/[.!?]["”']?\s*$/.test(q.text) ? q.text : q.text + '.'))
    .join(' ')
    .trim();
  if (!text) return empty;
  const doc = parseFold(text, label, parse);
  if (!doc || !doc.log) return { ...empty, text };
  return { text, figures: figuresFromDoc(doc), claims: claimsFromDoc(doc) };
};
