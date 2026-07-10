// EO: DEF·EVA(Field,Link → Link, Dissecting,Binding) — proposition unit + EVA measure
// enactor/props.js — the proposition unit and the RELATIONAL correspondence
// (the enactor's EVA measure, modality-blind; add-on 3 §1).
//
// The unit of grounding moves from the claim-string to the proposition, because
// only a proposition can be true (Frege/Codd). A proposition here is a resolved
// SVO read of a clause:
//
//   prop = { subj, rel, obj, op, kind:'rel', surface, spans }     // two-place
//        | { subj, attr:{key,value}, op:'DEF', kind:'def', surface }   // one-place
//
// `subj` / `obj` are RESOLVED ids (a document figure id, or an NP-referent
// lemma) — not surface strings. That resolution is the whole point: "Grete",
// "his sister", and "she" all parse to the same subj id when read through the
// document field, so paraphrase grounds and verbatim echo is not privileged
// (the fix for bind.js's lexical overlap, lifted to the proposition).
//
// parseProps reuses the page's own organs — the SVO clause parser
// (parse/relations.js) resolved through the document referent field
// (factcheck/correspond.js documentFieldAt) — exactly as the edge-grounding
// veto reads the talker's prose. SEG turns the same read inward on the talker's
// forming surface; the basis runs it over the document's own stops. One parser,
// two directions.

import { segmentSentences }   from '../perceiver/parse/index.js';
import { parseRelations }     from '../perceiver/parse/index.js';
import { documentFieldAt }    from './factcheck/index.js';
import { typeOf }             from '../core/index.js';

// Parse a stretch of text into normalized propositions, resolving endpoints
// through the DOCUMENT field at `cursor` (the same binding of record the
// fact-checker uses). With no admission (a bare test doc) it returns []. The
// referents slot is ON so an NP object (`the window`, `a bowl`) is a referent
// endpoint, not dropped — the propositions a passage actually holds.
export const parseProps = (text, doc, cursor = Infinity) => {
  const admission = doc?.admission;
  if (!admission || !text) return [];
  const isSpeech = doc?.conventions?.isAttributionVerb
    ? (v) => doc.conventions.isAttributionVerb(v)
    : undefined;
  const field = documentFieldAt(doc, cursor);
  const coref = {
    field: () => field,
    resolve: () => field[0]?.id ?? null,
    lastIns: () => (field[0] ? { id: field[0].id, w: field[0].w } : null),
  };
  const relOpts = { referents: true, ...(isSpeech ? { isSpeech } : {}) };

  const out = [];
  for (const sentence of segmentSentences(text)) {
    for (const r of parseRelations(sentence, admission, coref, relOpts)) {
      if (r.op === 'DEF') {
        if (r.id) out.push(Object.freeze({
          kind: 'def', op: 'DEF', subj: r.id, attr: { key: r.key, value: r.value },
          surface: sentence,
        }));
        continue;
      }
      if ((r.op === 'CON' || r.op === 'SIG') && r.src != null && r.tgt != null) {
        out.push(Object.freeze({
          kind: 'rel', op: r.op, subj: r.src, rel: r.via || null, obj: r.tgt,
          surface: sentence, spans: r.args || null,
        }));
      }
    }
  }
  return out;
};

// The relation-TYPE of a `via` verb/noun, for paraphrase-tolerant matching: two
// relations correspond when they project to the same primitive (sister ≈
// sibling ≈ brother under the gendered projection), not only when the surface
// verb is identical. Falls back to the lowercased surface when the verb types to
// no primitive (an open-vocabulary bond), so an exact verb still matches itself.
const relKey = (via) => {
  if (!via) return null;
  const t = typeOf(String(via).toLowerCase());
  return t ? t.type : String(via).toLowerCase();
};

// correspondProp — score a candidate proposition against a basis of propositions
// by RELATIONAL correspondence (§5), not lexical overlap. The match is over the
// resolved structure:
//
//   subject id  ·  relation type  ·  object id
//
// not the surface string — so a paraphrase that resolves to the same figures and
// the same relation type grounds, and a verbatim echo earns nothing extra. The
// subject and object are the load-bearing terms (they fix WHICH proposition);
// the relation breaks ties and guards against asserting the wrong link between
// the right pair. Returns the best { prop, score } or null.
//
// score ∈ [0,1]: a two-place candidate needs both endpoints to land on a basis
// prop's endpoints to score at all (an asserted link between figures the basis
// never linked is support 0 — the fluent-hallucination guard). A one-place DEF
// matches on subject + predicate-key.
export const correspondProp = (cand, basisProps) => {
  if (!cand || !basisProps?.length) return null;

  let best = null;
  for (const p of basisProps) {
    const s = scorePair(cand, p);
    if (s > 0 && (!best || s > best.score)) best = { prop: p, score: s };
  }
  return best;
};

const scorePair = (cand, p) => {
  if (cand.kind === 'def' || p.kind === 'def') {
    if (cand.kind !== 'def' || p.kind !== 'def') return 0;
    if (cand.subj !== p.subj) return 0;
    // Same subject; reward a shared predicate key, full credit on a value overlap.
    const sameKey = cand.attr?.key && cand.attr.key === p.attr?.key;
    const v1 = String(cand.attr?.value || '').toLowerCase();
    const v2 = String(p.attr?.value || '').toLowerCase();
    const valueHit = v1 && v2 && (v1.includes(v2) || v2.includes(v1));
    return valueHit ? 1 : (sameKey ? 0.6 : 0.4);
  }

  // Two-place: both endpoints must correspond, in EITHER orientation for a
  // symmetric relation (sibling, spouse, social) — the relation algebra already
  // knows which primitives are symmetric, so "Grete is Gregor's sister" grounds
  // "Gregor's sister Grete".
  const ck = relKey(cand.rel), pk = relKey(p.rel);
  const sym = ck && typeOf(String(cand.rel).toLowerCase())?.symmetric;
  const direct  = cand.subj === p.subj && cand.obj === p.obj;
  const flipped = sym && cand.subj === p.obj && cand.obj === p.subj;
  if (!direct && !flipped) return 0;

  // Endpoints correspond (0.7 of the mass); the relation type adds the rest. An
  // unknown/mismatched relation between the right pair still grounds weakly — the
  // pair is the proposition's identity — but a typed match is the full reading.
  const endpoints = 0.7;
  const relMatch = (ck && pk && ck === pk) ? 0.3 : (ck && pk ? 0.0 : 0.15);
  return endpoints + relMatch;
};

// A stable key for a proposition, for depletion bookkeeping (which props the
// committed speech has already spent the support of, §5 non-redundancy).
export const propKey = (p) =>
  p?.kind === 'def'
    ? `def:${p.subj}:${p.attr?.key || ''}:${String(p.attr?.value || '').toLowerCase()}`
    : `rel:${[p?.subj, p?.obj].sort().join(':')}:${relKey(p?.rel) || ''}`;

export { relKey };
