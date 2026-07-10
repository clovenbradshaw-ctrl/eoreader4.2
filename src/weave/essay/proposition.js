// EO: INS·EVA·SIG(Field,Entity → Entity,Lens, Making,Binding) — typed proposition payload
// essay/proposition.js — the commitment, pushed below language.
//
// Omnimodal output proves the commitment was never text: the first time a
// chart must be emitted, the words turn out to have been ONE RENDERING of the
// content, not the content. So the atomic unit drops a level. A commitment's
// payload is a typed proposition — a relation over entities, with quantities
// and a time — and the claim string is its TEXT PROJECTION, one surface among
// many. The bar is the chart projection of the same payload. Projections of
// one source cannot contradict, so cross-modal agreement is by construction
// and checking it is a predicate (surfaceAgrees), not a negotiation.
//
// propositionOf is the MECHANICAL text→proposition reading — a transparent
// lexical fallback in the addressOfSentence tradition (research/driver.js),
// deterministic so the payload is never a model judgment. An injected
// classifier can replace it wholesale; the shapes are identical either way.
// Crucially the validator and the reader share one number grammar
// (quantitiesIn), so what the reading extracts is exactly what the check
// looks for — the two sides cannot drift apart.

import { termsOf } from './terms.js';

const freeze = Object.freeze;
const list = (xs) => freeze([...(xs || [])]);

export const makeProposition = ({ relation = 'state', entities = [], quantities = [], time = null } = {}) => freeze({
  relation: String(relation),
  entities: list(entities.map((e) => String(e))),
  quantities: freeze((quantities || []).map((q) => freeze({
    value: +q.value, unit: q.unit ? String(q.unit) : null, raw: String(q.raw ?? q.value),
  }))),
  time: time == null ? null : String(time),
});

// The one number grammar both the reader and the validator speak. Citations
// ([sN]) are markup, not content — stripped before numbers are read. A
// four-digit year is TIME, not a quantity.
const CITE = /\[s\d+\]/g;
const NUM = /\d[\d,]*(?:\.\d+)?%?/g;
const YEAR = /^(1[5-9]\d\d|20\d\d)$/;
const UNIT_AFTER = /^(?:percent|per\s?cent|million|billion|thousand|dollars|people|years|days|hours|miles|km|kg|tons?|arrests|cases|deaths|sources|spans|sentences)\b/i;

export const numbersIn = (text) => {
  const t = String(text ?? '').replace(CITE, ' ');
  const out = [];
  for (const m of t.match(NUM) || []) {
    const raw = m;
    const bare = raw.replace(/,/g, '').replace(/%$/, '');
    out.push({ raw, value: +bare, percent: raw.endsWith('%'), year: YEAR.test(bare) });
  }
  return out;
};

const RELATION_CUES = [
  ['change', /\b(rose|rises?|fell|falls?|increas\w+|decreas\w+|grew|grow\w*|shrank|shrink\w*|doubl\w+|halv\w+|climb\w+|dropp?\w*)\b/i],
  ['creation', /\b(built|creat\w+|found\w+|establish\w+|launch\w+|open\w+|introduc\w+)\b/i],
  ['end', /\b(destroy\w+|clos\w+|end\w+|abolish\w+|remov\w+|demolish\w+)\b/i],
  ['record', /\b(records?|recorded|logg\w+|list\w+|report\w+|document\w+)\b/i],
];

// The lexical fallback reading of a claim string into its payload.
export const propositionOf = (claim) => {
  const text = String(claim ?? '');
  let relation = 'state';
  for (const [id, re] of RELATION_CUES) if (re.test(text)) { relation = id; break; }

  const nums = numbersIn(text);
  let time = null;
  const quantities = [];
  const stripped = text.replace(CITE, ' ');
  for (const n of nums) {
    if (n.year && time == null) { time = n.raw.replace(/,/g, ''); continue; }
    const after = stripped.slice(stripped.indexOf(n.raw) + n.raw.length).trimStart();
    const unit = n.percent ? '%' : (UNIT_AFTER.exec(after)?.[0]?.toLowerCase() ?? null);
    quantities.push({ value: n.value, unit, raw: n.raw });
  }

  // Entities: capitalized runs off the raw surface (never sentence-initial
  // alone), padded with the leading content terms when nothing is capitalized.
  const caps = [...stripped.matchAll(/(?<!^)(?<![.!?]\s)\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g)]
    .map((m) => m[1]);
  const entities = caps.length ? [...new Set(caps)] : termsOf(text).slice(0, 3);

  return makeProposition({ relation, entities, quantities, time });
};

// The NUMERIC contradiction the string check cannot see: "rose to 148 in
// 2021" and "rose to 152 in 2021" share every word and a polarity — no
// negation flips — yet they are the same field of the same proposition with
// two values. Two payloads conflict when they report the same relation at
// the same time and their quantity sets are disjoint. Time must be PRESENT
// on both and equal: "rose to 148 in 2021" and "fell to 61 after the
// shelters opened" are different events, not a conflict. Callers guard with
// claim-term overlap so different subjects never collide here.
export const propsConflict = (a, b) => {
  if (!a || !b) return false;
  if (!a.quantities?.length || !b.quantities?.length) return false;
  if (a.relation !== b.relation) return false;
  if (a.time == null || b.time == null || a.time !== b.time) return false;
  const B = new Set(b.quantities.map((q) => q.value));
  for (const q of a.quantities) if (B.has(q.value)) return false; // a shared value — the versions agree somewhere
  return true;
};

// The cross-modal predicate over ONE commitment: does a surface say only what
// the payload holds? Text: every number in the surface is one of the payload's
// quantities (or its time). Chart datum: the value IS a payload quantity.
export const surfaceAgrees = (prop, surface) => {
  if (!surface) return false;
  const allowed = new Set([
    ...(prop.quantities || []).map((q) => q.value),
    ...(prop.time != null ? [+prop.time] : []),
  ]);
  if (surface.modality === 'text' || typeof surface === 'string') {
    const text = typeof surface === 'string' ? surface : surface.text;
    return numbersIn(text).every((n) => allowed.has(n.value));
  }
  if (surface.modality === 'chart') {
    return (surface.data || []).every((d) => allowed.has(+d.value));
  }
  if (surface.modality === 'pullquote') return true; // verbatim of the claim by construction
  return true; // a divider asserts nothing
};
