// EO: SEG·CON·NUL(Network,Link,Field → Lens,Void, Dissecting,Binding,Clearing) — the closed inventory
// By the time anything is generated, the machinery has produced a small, CLOSED set of objects
// (docs/topline.md). That is the whole inventory; there is nothing else in the room. The topline
// is an ordering and a phrasing of exactly these objects — not a summary of the source, because
// the model never sees the source. It sees the objects.
//
//   claim      — a proposition that traces to passages, with its citations and its STANDING.
//   fact       — a COMPUTED fact: arithmetic over the log (counts, dates, the mass on either
//                side of a partition). Never phrased from words; measured.
//   inference  — AT MOST ONE inferential step: the thing that follows from the claims and is
//                stated in none of them. Always marked as ours, never the record's.
//   gap        — the absence, if there is one: what the reading looked for and did not find.
//   moved      — a claim whose footing was pulled out (awaiting re-check / superseded). It is
//                NOT phrased as a claim; the topline says the ground moved instead.
//
// The ORDER is not the model's choice. How a topline runs follows from what KIND of answer it is:
//   contradiction — what the record asserts, then what conflicts, then where they part.
//   absence       — the negative, then where the reading looked.
//   plain         — the claims in standing order, the computed facts, then (at most) the inference.
// The machinery fixes the sequence here; the model receives the objects in that order and keeps it.
//
// LENGTH falls out of the count. One object, one sentence. Four objects, four sentences, joined.
// Nobody sets a target. A thin field produces a one-object inventory and a one-sentence topline,
// and that is correct rather than disappointing.

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
const uniqCite = (xs) => [...new Set((xs || []).filter((n) => Number.isInteger(n)))].sort((a, b) => a - b);

// A claim's footing is pulled when it is waiting to be re-checked or has been superseded —
// the record measured it under a basis that no longer holds (core/supersede.js: UNSETTLED),
// or the reading marked it indeterminate. Such a claim may never be phrased AS a claim.
const footingPulled = (c) =>
  c.unsettled === true || c.standing === 'unsettled' || c.standing === 'indeterminate' ||
  c.verdict === 'indeterminate' || c.superseded === true;

// A claim is CONTESTED when the record also carries its denial — the same subject and property
// asserted with the opposite polarity — or the caller stamped it so (a `contradicted` verdict).
const claimStanding = (c) => {
  if (c.contested === true || c.verdict === 'contradicted') return 'contested';
  return (c.count || 1) >= 2 ? 'witnessed' : 'stated';    // corroborated across passages, or single
};

// Detect the denial-pair inside a claim list: same subject + normalised property, opposite polarity.
// Returns a Set of the indices that are contested, so the kind and the ordering can turn on it.
const contestedIndices = (claims) => {
  const byKey = new Map();
  claims.forEach((c, i) => {
    const k = `${norm(c.subject)}|${norm(c.value ?? `${c.via} ${c.object}`)}`;
    (byKey.get(k) || byKey.set(k, []).get(k)).push({ i, pol: c.polarity === '−' ? '−' : '+' });
  });
  const out = new Set();
  for (const rows of byKey.values()) {
    if (rows.some((r) => r.pol === '+') && rows.some((r) => r.pol === '−')) rows.forEach((r) => out.add(r.i));
  }
  return out;
};

// Build the closed, ordered inventory from the decided pieces. Pure and deterministic — no model,
// no source text. `claims` and `relations` are propositions that trace to passages; `facts` are
// computed; `figures` seed the single optional inference; `gap` is a measured absence or null.
export const buildInventory = ({
  subject, claims = [], relations = [], facts = [], figures = [], gap = null, allowInference = false,
} = {}) => {
  // 1 — every proposition, claims and relations alike, as a uniform record with a standing.
  const props = [
    ...claims.map((c, i) => ({
      raw: c, rel: false, order: i,
      cite: uniqCite(c.cite), polarity: c.polarity === '−' ? '−' : '+',
      pulled: footingPulled(c),
    })),
    ...relations.map((r, i) => ({
      raw: r, rel: true, order: 1000 + i,
      cite: uniqCite(r.cite), polarity: r.polarity === '−' ? '−' : '+',
      pulled: footingPulled(r),
    })),
  ];
  const contested = contestedIndices([...claims, ...relations]);
  props.forEach((p, i) => { p.contested = contested.has(i); });

  // 2 — the footing-pulled ones are set aside; they collapse to a SINGLE "the ground moved" object
  //     rather than being phrased. Total capture: they are not dropped, they are re-typed.
  const phrasable = props.filter((p) => !p.pulled);
  const moved = props.filter((p) => p.pulled);

  // 3 — the kind follows from what the objects are.
  let kind = 'plain';
  const anyContested = phrasable.some((p) => p.contested);
  if (phrasable.length === 0 && (gap || facts.length === 0)) kind = 'absence';
  else if (anyContested) kind = 'contradiction';

  const objects = [];
  const claimObj = (p, standing) => ({
    key: `${p.rel ? 'rel' : 'claim'}:${p.order}`,
    type: 'claim', relational: p.rel, standing, cite: p.cite,
    fields: p.rel
      ? { subject: p.raw.subject, via: p.raw.via, object: p.raw.object, polarity: p.polarity, kinship: !!p.raw.kinship }
      : { subject: p.raw.subject, value: p.raw.value, polarity: p.polarity },
  });

  if (kind === 'absence') {
    // the negative first, then where the reading looked (the scan receipt).
    objects.push({
      key: 'gap:0', type: 'gap', standing: 'void', cite: uniqCite(gap?.cite),
      fields: { subject, term: gap?.term || subject, scanned: gap?.scanned || null },
    });
  } else if (kind === 'contradiction') {
    // what the record asserts, then what conflicts, then where they part.
    const con = phrasable.filter((p) => p.contested);
    const pos = con.find((p) => p.polarity === '+') || con[0];
    const neg = con.find((p) => p.polarity === '−' && p !== pos) || con[1];
    if (pos) objects.push(claimObj(pos, 'asserted'));
    if (neg) objects.push(claimObj(neg, 'contested'));
    objects.push({ key: 'part:0', type: 'part', standing: 'ours', cite: uniqCite([...(pos?.cite || []), ...(neg?.cite || [])]),
      fields: { subject } });
    // any remaining plain claims follow, standing-ordered
    for (const p of phrasable.filter((p) => !p.contested)) objects.push(claimObj(p, claimStanding(p.raw)));
  } else {
    // plain: witnessed claims before merely-stated ones, then the relations, in stability order.
    const ranked = phrasable
      .map((p) => ({ p, standing: claimStanding(p.raw) }))
      .sort((a, b) => rankOfStanding(a.standing) - rankOfStanding(b.standing) || a.p.order - b.p.order);
    for (const { p, standing } of ranked) objects.push(claimObj(p, standing));
  }

  // 4 — the computed facts (arithmetic over the log), after the claims. Always their own objects.
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    objects.push({ key: `fact:${f.id || i}`, type: 'fact', standing: 'computed', cite: uniqCite(f.cite),
      fields: { kind: f.kind, verb: f.verb, n: f.n, noun: f.noun, value: f.value, label: f.label, unit: f.unit } });
  }

  // 5 — the single "ground moved" object, if any footing was pulled. Never more than the fact that
  //     it moved — the topline states that the ground shifted, not the claim it shifted under.
  if (moved.length) {
    const subs = [...new Set(moved.map((p) => String(p.raw.subject || subject)))].slice(0, 3);
    objects.push({ key: 'moved:0', type: 'moved', standing: 'moved', cite: [],
      fields: { subject, under: subs, count: moved.length } });
  }

  // 6 — AT MOST ONE inference, and only where the machinery can derive it from the figures the
  //     claims already name. Marked 'ours', never the record's. Off unless the caller opts in AND
  //     there is a genuine dominant pair to infer from.
  if (allowInference && kind === 'plain') {
    const inf = deriveInference(subject, figures, objects);
    if (inf) objects.push(inf);          // deriveInference guarantees a single object
  }

  return Object.freeze({ subject, kind, objects: Object.freeze(objects) });
};

const STANDING_RANK = { witnessed: 0, asserted: 0, stated: 1, contested: 2, computed: 3, ours: 4, moved: 5, void: 6 };
const rankOfStanding = (s) => (s in STANDING_RANK ? STANDING_RANK[s] : 3);

// The one inferential step for a source: what it PRIMARILY concerns, read off its dominant figures.
// This follows from the claims (the figures are the subjects the claims are about) and is stated in
// none of them, so it is marked ours. The figure LABELS are the only content it introduces, and
// every one of them already appears among the claim objects — so the containment gate downstream
// accepts the phrasing. Returns a single object or null (no dominant pair ⇒ no inference).
const deriveInference = (subject, figures, objects) => {
  const named = new Set(objects.flatMap((o) => [o.fields?.subject, o.fields?.object, o.fields?.value]
    .filter(Boolean).flatMap((v) => norm(v).split(' '))));
  const top = (figures || [])
    .filter((f) => f && f.label && (f.count || 0) > 0)
    .filter((f) => norm(f.label).split(' ').every((w) => named.has(w)))   // only figures the claims already name
    .slice(0, 3)
    .map((f) => f.label);
  if (top.length < 1) return null;
  return { key: 'inference:0', type: 'inference', standing: 'ours', cite: [], fields: { subject, about: top } };
};
