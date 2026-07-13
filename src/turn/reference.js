// EO: DEF·SEG(Network,Field → Lens,Network, Dissecting·Binding) — typed reference: the per-mention same-vs-other DEF
// The Work v2 #3 — reference retyped as sense-resolution. The question's own mentions are the
// INPUT side of the same-vs-other cut: is "elvis" in this question the same referent as the
// Elvis the corpus recorded — and WHICH one, when the corpus recorded two? The old cut was one
// scalar over the whole passage (referential.concentrated, a post-retrieval margin) disposed
// as an all-or-nothing veto; a reference error is UPSTREAM of retrieval, so by the time the
// margin measured the diffusion, the walk had already gathered both senses.
//
// The retyped cut is per mention, model-free, and re-runnable: a mention resolves to a sense
// iff exactly one recorded sense basin (sense.js senseBasins — mass over the entity graph)
// survives discrimination by the question's own other terms (resolveByHints — a hint lands
// only when it co-occurs with one basin and not the collision). One real basin → CORROBORATED
// (there is nothing to confuse). A collision the hints cut → CORROBORATED, carrying the
// discriminating anchor. A collision nothing cuts → INDETERMINATE, carrying the ASK — never
// the loudest basin: resolving an ambiguous mention to the dominant sense is the
// superimposition error (the rope called a snake — a DEF without provenance).
//
// One more guard the two-Bushes case demands: a hint may "resolve" a mention to a basin that
// is ITSELF an ambiguity-held short form — "George Bush" beside George Herbert Bush and
// George Walker Bush (parse/name-variants.js holds it own-referent by sticky abstention).
// Landing on that basin is not a resolution; it is the ambiguity restated. The guard reuses
// the name-variants law verbatim: a target whose label fits ≥2 incomparable fuller basin
// labels as an order-preserving token subsequence stays INDETERMINATE.
//
// The witness carries the full derivation — term, basins with weights, floor, hints, the
// resolver that fired — so a later reader re-derives the verdict from the witness alone, and
// the fold's own grounded evidence can REVISE the mention DEF on the log (the counter-DEF
// rail, core/def.js) instead of silently out-ranking it.

import { senseCollision, SENSE_FLOOR, discriminatingAnchor } from './sense.js';
import { nameTokens, isSubsequence } from '../perceiver/parse/name-variants.js';
import { namedReferents, figureSurface } from '../perceiver/index.js';
import { tok } from '../perceiver/parse/index.js';
import { VERDICTS } from '../core/verdicts.js';

// A steered target that is an ambiguity-held short form of ≥2 incomparable fuller real basins
// is not a resolution (two-Bushes). The name-variants containment law, applied to basins.
const ambiguousShortForm = (target, basins = []) => {
  if (!target) return false;
  const t = nameTokens(target.label);
  let fuller = 0;
  for (const b of basins) {
    if (b === target || b.label === target.label) continue;
    const bt = nameTokens(b.label);
    if (bt.length > t.length && isSubsequence(t, bt)) fuller += 1;
  }
  return fuller >= 2;
};

const topBasins = (basins = []) => basins.slice(0, 4).map((b) => ({ label: b.label, weight: Math.round(b.weight * 1000) / 1000 }));
const marginOf = (basins = []) => {
  if (!basins.length) return 0;
  const [a, b] = basins;
  return Math.round(((a?.weight || 0) - (b?.weight || 0)) * 1000) / 1000;
};

// typeReferences(question, entities, { hints, floor }) → one typed mention per question term
// that names ≥1 recorded sense. `entities` are sense.js senseEntities rows ({id, label,
// weight, neighbors[]}); the whole chain is a pure function of them. A term naming nothing
// recorded yields NO mention — that absence is the void judge's territory (v2 #4), not a
// reference judgment.
export const typeReferences = (question, entities = [], { hints = [], floor = SENSE_FLOOR } = {}) => {
  const terms = [...new Set(tok(String(question || '')))].filter((t) => t.length > 2);
  const out = [];
  for (const term of terms) {
    // The question's OTHER content terms are this mention's hints — the reader discriminates
    // with what the asker already said ("memphis" cuts the Elvises; "record" cuts nothing).
    const termHints = [...new Set([...(hints || []), ...terms.filter((t) => t !== term)])];
    let r;
    try { r = senseCollision(term, entities, { hints: termHints, floor }); } catch { continue; }
    if (!r.basins.length) continue;   // nothing recorded — no reference to judge (v2 #4's territory)
    const real = r.basins.filter((b) => b.weight >= floor);
    const base = { term, basins: topBasins(r.basins), margin: marginOf(r.basins), floor, hints: termHints, ambiguous: !!r.ambiguous };
    if (r.resolution === 'ask') {
      out.push(Object.freeze({ ...base, verdict: VERDICTS.INDETERMINATE, sense: null, anchor: '',
        resolvedBy: 'collision-unresolved', ask: r.ask }));
      continue;
    }
    const target = r.target;
    if (!target) continue;
    if (r.ambiguous && ambiguousShortForm(target, real)) {
      // The hint landed on the held short form — the ambiguity restated, not resolved.
      const others = real.filter((b) => b.label !== target.label).slice(0, 3);
      const opts = others.map((b) => ({ label: b.label, anchor: discriminatingAnchor(b, others.filter((x) => x !== b)) }));
      out.push(Object.freeze({ ...base, verdict: VERDICTS.INDETERMINATE, sense: null, anchor: '',
        resolvedBy: 'ambiguous-short-form',
        ask: { question: `Which ${target.label} do you mean — ${opts.map((o) => o.label).join(' or ')}?`, options: opts.map((o) => o.label), anchors: opts.map((o) => o.anchor).filter(Boolean) } }));
      continue;
    }
    out.push(Object.freeze({ ...base, verdict: VERDICTS.CORROBORATED,
      sense: { id: target.id, label: target.label }, anchor: r.anchor || '',
      resolvedBy: r.ambiguous ? 'hint' : 'single-basin', ask: null }));
  }
  return Object.freeze(out);
};

// senseTopicFrame(doc, mention) → the topic prior a RESOLVED-AMBIGUOUS mention arms for
// retrieval ({topicIds, namedRefsOf, floor} — surfer/retrieve/hybrid.js applyTopicPrior), or
// null. The join back to the doc's id-space goes through the doc's own tables: the sense
// LABEL (plus its discriminating anchor) is re-read by namedReferents, then widened by the
// figure surface — no cross-graph id mapping. Off-sense spans are DAMPED below the activation
// floor; nothing new is fetched. A reference error is upstream of retrieval: the fix is to
// stop gathering the wrong sense, never to gather more.
export const senseTopicFrame = (doc, mention) => {
  if (!doc || !mention || mention.verdict !== VERDICTS.CORROBORATED || !mention.ambiguous || !mention.sense) return null;
  try {
    const subjectIds = namedReferents(doc, `${mention.sense.label} ${mention.anchor || ''}`.trim());
    if (!subjectIds.length) return null;
    const neighbourhood = figureSurface(doc, subjectIds).figures.map((f) => f.id);
    const topicIds = new Set([...subjectIds, ...neighbourhood]);
    const namedRefsOf = (s) => { try { return namedReferents(doc, s.text || ''); } catch { return []; } };
    return { topicIds, namedRefsOf, floor: 0.25, sense: mention.sense.label };
  } catch { return null; }
};

// reviseMentionsWithEvidence(log, mentions, referential, labelOf) — the fold's grounded field
// is the first EVIDENCE a mention's sense meets (the disambiguate.js law: the commit is a
// PRIOR, not a verdict; the evidence gets a vote). When the fold CONCENTRATED on a referent,
// each mention DEF is re-judged on the log — a counter-DEF via revise(), never an overwrite:
//   · evidence inside the resolved sense (same figure family, the name-variants containment
//     test) → CORROBORATED, the prior confirmed, evidence in the witness;
//   · evidence on a DIFFERENT figure → the reading diverted: CORROBORATED to the evidence's
//     referent, diverted:true in the witness — the sense the reading actually landed on;
//   · an unresolved mention the evidence settles → CORROBORATED, resolvedBy 'fold-evidence'.
// A fold that did not concentrate revises nothing — no evidence, no counter-DEF. Returns the
// number of revisions appended.
export const reviseMentionsWithEvidence = (log, mentions = [], referential = null, labelOf = null) => {
  if (!log || !referential || referential.concentrated !== true || referential.id == null) return 0;
  const label = (typeof labelOf === 'function' ? labelOf(referential.id) : null) ?? String(referential.id);
  const evTokens = nameTokens(label);
  let n = 0;
  for (const m of mentions) {
    const of = `referent:mention:${m.term}`;
    if (!log.latestOf(of)) continue;
    const evidence = { id: referential.id, label, w: referential.w ?? 0, margin: referential.margin ?? 0 };
    if (m.verdict === VERDICTS.CORROBORATED && m.sense) {
      const st = nameTokens(m.sense.label);
      const sameFamily = isSubsequence(st, evTokens) || isSubsequence(evTokens, st);
      log.revise(of, {
        verdict: VERDICTS.CORROBORATED,
        witness: { term: m.term, sense: sameFamily ? m.sense.label : label, prior: m.sense.label,
          resolvedBy: sameFamily ? 'evidence-confirmed' : 'evidence-diverted',
          ...(sameFamily ? {} : { diverted: true }), evidence },
      });
      n += 1;
    } else if (m.verdict === VERDICTS.INDETERMINATE) {
      // The fold's grounded read settled what the question's own terms could not — but only
      // when the evidence names ONE of the colliding senses (else it is a different figure
      // entirely and the suspension stands).
      const hit = (m.basins || []).find((b) => {
        const bt = nameTokens(b.label);
        return isSubsequence(bt, evTokens) || isSubsequence(evTokens, bt);
      });
      if (!hit) continue;
      log.revise(of, {
        verdict: VERDICTS.CORROBORATED,
        witness: { term: m.term, sense: hit.label, resolvedBy: 'fold-evidence', evidence },
      });
      n += 1;
    }
  }
  return n;
};
