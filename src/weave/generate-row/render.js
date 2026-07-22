// EO: REC·DEF(Lens → Lens, Making,Dissecting) — deterministic row rendering + prosifier
// docs/generate-row-stance-templates.md §9: realizeSlot is pure and total, no network
// call, no model call in the default path. A row is assembled by concatenating labeled
// text fragments (proposition sentences and fixed §6 lexicon words); trace coverage
// (§8) falls out of the construction by design — every character of renderedText comes
// from exactly one labeled fragment, so tokenizing the concatenation and looking up each
// token's owning fragment always yields a bijection, never a post-hoc check that can
// silently drift out of sync with the renderer.

import { phraseMechanical } from '../topline/index.js';
import { tokenize } from './tokenize.js';

const stripDot = (s) => String(s ?? '').trim().replace(/[.!?]+$/, '');
const capFirst = (s) => { const t = String(s ?? ''); return t ? t[0].toUpperCase() + t.slice(1) : t; };
// Lowercase only the leading word's first letter, and only when that word is not itself
// an acronym (MOU, FBI, …) — "MOU drafted…" folded into a continuation clause must stay
// "MOU", never degrade to "mOU". A run of 2+ leading uppercase letters is left alone.
const lowerFirst = (s) => {
  const t = String(s ?? '');
  if (!t) return t;
  const leadingCaps = t.match(/^[A-Z]+/)?.[0] ?? '';
  if (leadingCaps.length >= 2) return t;
  return t[0].toLowerCase() + t.slice(1);
};
const dotTerminate = (s) => { const t = String(s ?? '').trim(); return /[.!?]$/.test(t) ? t : `${t}.`; };

// toPhraseObject(prop) -> the weave/topline/phrase.js `obj` shape, for the fallback path
// (a proposition with no `displayText` of its own — §9's phraseMechanical reuse).
const toPhraseObject = (prop) => ({
  type: 'claim',
  relational: prop.predicate && prop.predicate !== 'is',
  fields: {
    subject: prop.subject,
    object: prop.value,
    via: prop.predicate,
    value: prop.value,
    kinship: false,
    polarity: prop.verdict === 'contradicted' ? undefined : undefined,
  },
});

// phrase(prop) -> the sentence a proposition contributes. Prefers its own `displayText`
// (Question Result spec §28.2's "an extracted proposition already present in the
// record") and falls back to phraseMechanical when none is supplied.
export const phrase = (prop) =>
  prop.displayText ? dotTerminate(prop.displayText) : phraseMechanical(toPhraseObject(prop));

// §6's closed lexicon — connectives and ordinals, each with its registered synonym set.
// prosify (below) may only substitute within ONE entry's own set — never invent a word.
export const LEXICON = Object.freeze({
  because:      { id: 'because', text: 'because', synonyms: ['because', 'since'] },
  'ordinal-first': { id: 'ordinal-first', text: 'First', synonyms: ['First'] },
  'ordinal-then':  { id: 'ordinal-then', text: 'Then', synonyms: ['Then', 'Next'] },
});

const HEADINGS = Object.freeze({
  disagree:        { id: 'disagree-heading', text: 'The sources disagree.' },
  notEstablished:  { id: 'not-established-heading', text: 'Not established by these sources.' },
  multipleReadings: { id: 'multiple-readings-heading', text: 'Multiple readings are recorded.' },
});

// The closed set of non-proposition refIds this renderer can ever emit — every fixed
// connective/ordinal/heading/glue id. row-veto.js's backward-entailment check (§7) uses
// this to recognise "a fixed template word" versus "something fabricated" without
// needing to import the whole render module for its templates.
export const KNOWN_CONNECTIVE_IDS = Object.freeze([
  ...Object.values(LEXICON).map((e) => e.id),
  ...Object.values(HEADINGS).map((h) => h.id),
  'making-punct', 'composing-space', 'cultivating-space',
]);

// buildFromFragments(fragments) -> { renderedText, trace, fragments }
// fragments: { text, source: 'proposition'|'connective'|'ordinal', refId }[]
const buildFromFragments = (fragments) => {
  let text = '';
  const ranges = [];
  for (const f of fragments) {
    const start = text.length;
    text += f.text;
    ranges.push({ start, end: text.length, source: f.source, refId: f.refId });
  }
  const trace = tokenize(text).map((t) => {
    const r = ranges.find((r) => t.start >= r.start && t.start < r.end);
    return Object.freeze({
      tokenStart: t.start,
      tokenEnd: t.end,
      source: r ? r.source : 'connective',
      refId: r ? r.refId : 'unlabeled',
    });
  });
  return Object.freeze({ renderedText: text, trace: Object.freeze(trace), fragments: Object.freeze(fragments) });
};

// realizeSlot(slot) -> { renderedText, trace, fragments }
//
//   slot.role === 'readout'      { proposition }
//   slot.role === 'making'       { propositions: [a, b], connective? } — connective
//                                 defaults to LEXICON.because; a causal join's own
//                                 groundedBy.connective, when present, selects it.
//   slot.role === 'composing'    { order: OrderSlot, propositionsById }
//   slot.role === 'cultivating'  { propositions, relations }
//   slot.role === 'void'         {} — the fixed void template, §10.5
export const realizeSlot = (slot) => {
  switch (slot.role) {
    case 'readout': {
      const p = slot.proposition;
      return buildFromFragments([{ text: phrase(p), source: 'proposition', refId: p.id }]);
    }

    case 'making': {
      const [primary, ...rest] = slot.propositions;
      if (!primary || rest.length === 0) throw new Error('realizeSlot: making needs >= 2 propositions');
      const connective = LEXICON[slot.connective] || LEXICON.because;
      const fragments = [
        { text: capFirst(stripDot(phrase(primary))), source: 'proposition', refId: primary.id },
        { text: ', ', source: 'connective', refId: 'making-punct' },
        { text: connective.text, source: 'connective', refId: connective.id },
        { text: ' ', source: 'connective', refId: 'making-punct' },
      ];
      // The rest of the joined propositions, comma-separated with a final "and" — still
      // every word traced to its own proposition or to fixed glue, never invented.
      rest.forEach((p, i) => {
        if (i > 0) fragments.push({
          text: i === rest.length - 1 ? ' and ' : ', ',
          source: 'connective', refId: 'making-punct',
        });
        fragments.push({ text: lowerFirst(stripDot(phrase(p))), source: 'proposition', refId: p.id });
      });
      fragments.push({ text: '.', source: 'connective', refId: 'making-punct' });
      return buildFromFragments(fragments);
    }

    case 'composing': {
      const { order, propositionsById } = slot;
      const fragments = [];
      order.memberIds.forEach((id, i) => {
        const claim = propositionsById[id];
        const ordinal = i === 0 ? LEXICON['ordinal-first'] : LEXICON['ordinal-then'];
        fragments.push({ text: i === 0 ? '' : ' ', source: 'ordinal', refId: 'composing-space' });
        fragments.push({ text: ordinal.text, source: 'ordinal', refId: ordinal.id });
        fragments.push({ text: ' ', source: 'ordinal', refId: 'composing-space' });
        fragments.push({ text: lowerFirst(stripDot(phrase(claim))), source: 'proposition', refId: claim.id });
        fragments.push({ text: '.', source: 'ordinal', refId: 'composing-space' });
      });
      return buildFromFragments(fragments);
    }

    case 'cultivating': {
      const opposed = (slot.relations || []).some((r) => r.kind === 'oppose' || r.kind === 'contrasts');
      const heading = opposed
        ? HEADINGS.disagree
        : (slot.void ? HEADINGS.notEstablished : HEADINGS.multipleReadings);
      const fragments = [{ text: heading.text, source: 'connective', refId: heading.id }];
      // Every proposition the survey claims to cover is represented in the traced text
      // too — never just a bare heading with the readings held only in a side channel
      // (§7's forward-entailment check: "nothing was dropped that changes the claim").
      for (const p of slot.propositions || []) {
        fragments.push({ text: ' ', source: 'connective', refId: 'cultivating-space' });
        fragments.push({ text: phrase(p), source: 'proposition', refId: p.id });
      }
      return buildFromFragments(fragments);
    }

    case 'void':
      return buildFromFragments([{ text: HEADINGS.notEstablished.text, source: 'connective', refId: HEADINGS.notEstablished.id }]);

    default:
      throw new Error(`realizeSlot: unknown role "${slot.role}"`);
  }
};

// prosify(row, { refId, synonym }) -> { renderedText, trace, fragments }
// §9's strictly bounded pass: exactly one closed connective/ordinal fragment, swapped for
// a registered synonym of the SAME lexicon entry. Never touches a `source: 'proposition'`
// fragment; never adds or removes a fragment. Pure — callers re-run the row vetoes on the
// result before shipping it (§9's own requirement; enforced by the caller, not here, so
// this function stays a simple, auditable mechanical swap).
export const prosify = (row, { refId, synonym }) => {
  const entry = Object.values(LEXICON).find((e) => e.id === refId);
  if (!entry || !entry.synonyms.includes(synonym)) {
    throw new Error(`prosify: "${synonym}" is not a registered synonym of "${refId}"`);
  }
  const matches = row.fragments.filter((f) => f.refId === refId);
  if (matches.length !== 1) {
    throw new Error(`prosify: expected exactly one fragment for "${refId}", found ${matches.length}`);
  }
  const fragments = row.fragments.map((f) => (f.refId === refId ? { ...f, text: synonym } : f));
  return buildFromFragments(fragments);
};
