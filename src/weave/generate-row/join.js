// EO: CON·EVA(Link,Lens → Link,Lens, Binding,Tracing) — grounded row joins
// docs/generate-row-stance-templates.md §5: a RelationSlot/OrderSlot is a claim, and it
// must be grounded the same way a proposition is — never connective tissue a renderer
// invents so two propositions read smoothly together. proposeJoin is the ONLY place a
// relation is proposed, and it is a closed, deterministic classifier over the
// propositions' own fields (verdict, subject/predicate/value, dated spans) and the
// evidence spans that witness them — never a similarity score by itself (§5's own
// refusal), never model output.
//
// Two propositions that do not clear one of the classifiers below simply do not join —
// the caller (stance.js, render.js) then sees them as unrelated, exactly the "no
// groundable join exists → do not join" rule §5 states.

const norm = (s) => String(s ?? '').trim().toLowerCase();
const sameKey = (a, b) => norm(a) === norm(b) && norm(a) !== '';

// Two propositions that BOTH carry an explicit `domain` tag and disagree on it are never
// related by agree/oppose/measure — a bare subject+predicate string match ("python" the
// language vs "python" the snake) is exactly the "different domains, not really opposed"
// case §5/§11.1 refuse to treat as a relation. Silent (no domain on either/both) never
// blocks — most propositions carry no domain tag at all, and the absence of one is not
// evidence of a domain mismatch.
const differentDomains = (a, b) => a.domain && b.domain && !sameKey(a.domain, b.domain);

// The closed causal-connective lexicon (§5's "because"/"as a result of"/"which led to").
// A span's text must contain one of these AND witness both propositions for a causal
// join to ground — bare temporal adjacency is never enough (§5's explicit refusal).
const CAUSAL_CONNECTIVES = [
  { id: 'because', re: /\bbecause\b/i },
  { id: 'as-a-result-of', re: /\bas a result of\b/i },
  { id: 'which-led-to', re: /\bwhich led to\b/i },
  { id: 'due-to', re: /\bdue to\b/i },
];

const spansFor = (spans, propId) => (spans || []).filter((s) => (s.propositionIds || []).includes(propId));

// agree — G·Evidence: witness rosters overlap or both witness the SAME canonical claim
// (same subject/predicate/value), never a bare similarity score (§5).
const proposeAgree = (a, b) => {
  if (differentDomains(a, b)) return null;
  if (!sameKey(a.subject, b.subject) || !sameKey(a.predicate, b.predicate) || !sameKey(a.value, b.value)) return null;
  if (a.verdict === 'contradicted' || b.verdict === 'contradicted') return null;
  return {
    kind: 'agree',
    memberIds: [a.id, b.id],
    groundedBy: { type: 'shared-claim', subject: a.subject, predicate: a.predicate, value: a.value },
  };
};

// oppose — G·Evidence: same subject/predicate, explicitly different/contradictory value,
// or one side is VERDICTS.contradicted against the other. Domain mismatch alone (two
// propositions about different subjects entirely) never produces `oppose` (§5, §11.1).
const proposeOppose = (a, b) => {
  if (differentDomains(a, b)) return null;
  if (!sameKey(a.subject, b.subject) || !sameKey(a.predicate, b.predicate)) return null;
  if (sameKey(a.value, b.value)) return null; // same value → agree's territory, not oppose
  return {
    kind: 'oppose',
    memberIds: [a.id, b.id],
    groundedBy: { type: 'contradictory-value', subject: a.subject, predicate: a.predicate, values: [a.value, b.value] },
  };
};

// causal — S·Structural: requires an explicit connective span witnessing BOTH members.
// Bare date adjacency is refused here (§5) — that is at most a `temporal` join below.
const proposeCausal = (a, b, spans) => {
  const shared = (spans || []).filter((s) => (s.propositionIds || []).includes(a.id) && (s.propositionIds || []).includes(b.id));
  for (const span of shared) {
    const hit = CAUSAL_CONNECTIVES.find((c) => c.re.test(span.text || ''));
    if (hit) {
      return {
        kind: 'causal',
        memberIds: [a.id, b.id],
        groundedBy: { type: 'connective-span', spanId: span.id, connective: hit.id },
      };
    }
  }
  return null;
};

// measure — S·Structural: compatible subject and a comparable numeric/scalar value that
// disagrees — reuses the oppose shape but tagged distinctly so a renderer can pick the
// scalar-comparison template (Question Result spec §31.1) rather than a generic dispute.
const proposeMeasure = (a, b) => {
  if (differentDomains(a, b)) return null;
  if (!sameKey(a.subject, b.subject) || !sameKey(a.predicate, b.predicate)) return null;
  if (!a.isMeasure || !b.isMeasure) return null;
  if (sameKey(a.value, b.value)) return null;
  return {
    kind: 'measure',
    memberIds: [a.id, b.id],
    groundedBy: { type: 'compatible-measure', subject: a.subject, predicate: a.predicate, values: [a.value, b.value] },
  };
};

// contrasts/qualifies — S·Structural, Comparison plan (§11.5, §5's last bullet): matched
// attributes across two DIFFERENT subjects (X vs Y), grounded in the Question Result
// spec §15.2 alignment criteria — compatible predicate, comparable scope, incompatible
// (contrasts) or complementary (qualifies) values.
const proposeContrastOrQualify = (a, b) => {
  if (sameKey(a.subject, b.subject)) return null; // same subject is agree/oppose territory
  if (!sameKey(a.predicate, b.predicate)) return null;
  const kind = sameKey(a.value, b.value) ? 'qualifies' : 'contrasts';
  return {
    kind,
    memberIds: [a.id, b.id],
    groundedBy: { type: 'matched-attribute', predicate: a.predicate, subjects: [a.subject, b.subject] },
  };
};

// proposeJoin(propositions, { spans } = {}) -> { relations: RelationSlot[], order: OrderSlot | null }
// Pairwise relation candidates over every pair, plus a single dated OrderSlot when ≥2
// propositions carry their own dated span (§5's temporal grounding — never wall-clock
// ingestion order).
export const proposeJoin = (propositions, { spans = [] } = {}) => {
  const props = propositions || [];
  const relations = [];
  for (let i = 0; i < props.length; i++) {
    for (let j = i + 1; j < props.length; j++) {
      const a = props[i], b = props[j];
      const found =
        proposeCausal(a, b, spans) ||
        proposeAgree(a, b) ||
        proposeMeasure(a, b) ||
        proposeOppose(a, b) ||
        proposeContrastOrQualify(a, b);
      if (found) relations.push(found);
    }
  }

  const dated = props.filter((p) => p.date);
  let order = null;
  if (dated.length >= 2) {
    const sorted = [...dated].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    order = {
      memberIds: sorted.map((p) => p.id),
      basis: dated.length === props.length ? 'dated' : 'sequenced-by-source',
      groundedBy: { type: 'dated-span', dates: sorted.map((p) => p.date) },
    };
  }

  return Object.freeze({ relations: Object.freeze(relations), order: order && Object.freeze(order) });
};

// groundJoin(join, record) -> EdgeRef | null — resolve a proposed join's groundedBy
// descriptor against the record it was proposed over, returning null if the record no
// longer carries the evidence (e.g. a source toggle removed the grounding span). `record`
// is a plain lookup: { spans: EvidenceSpan[] }.
export const groundJoin = (join, record) => {
  if (!join?.groundedBy) return null;
  const g = join.groundedBy;
  if (g.type === 'connective-span') {
    const span = (record?.spans || []).find((s) => s.id === g.spanId);
    return span ? Object.freeze({ ...g, resolved: true }) : null;
  }
  // shared-claim / contradictory-value / compatible-measure / matched-attribute /
  // dated-span are grounded directly in the propositions' own fields, which the caller
  // already holds — always resolvable as long as the propositions themselves are still
  // in scope (checked by the caller before calling groundJoin).
  return Object.freeze({ ...g, resolved: true });
};
