// EO: SYN·REC(Entity → Network,Paradigm, Making,Composing) — the article as a read-time view
// renderArticle(eventLog, terrain, asOf) is a PROJECTION over the append-only event log.
// The article is NEVER stored. It is assembled fresh on every read from G (evidence
// events), S (structural edges), and M (the significance events DEF/EVA/REC), exactly as
// the prompt is a projection not a struct (docs/prompt-as-site.md §5). If this function
// ever cached its own output, the Meant-Graph would have been stored and the integrity
// rule (edges.js §M) would be broken — so it does not, and returns a new object each call.
//
// The three read-side functions of the Experience Engine tuple ⟨G,S,M | π,γ,σ⟩ do the
// work here:
//   γ (availability) — what is visible at `asOf`. Later events and retracted ones are
//                      not folded in; a projection at an earlier asOf is the article as
//                      it stood then.
//   σ (supersession) — which of several competing DEF events is the one that CURRENTLY
//                      holds (the lede's terms). Superseded DEFs move to Reframings.
//   π (provenance)   — the attestation footnotes: source, span, observer on each INS.
//
// Sections 1–6 are a projection over G and S; the significance sections (lede/disputes/
// reframings) are projected over M every read. Nothing is precomputed.

import { profileOf, identityKeyOf } from './terrains.js';
import { sectionsOf } from './spine.js';
import { absenceProfile, headlineAbsence, NUL_STATES } from './absence.js';
import { deriveName } from './naming.js';

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const asArticle = (eventLog, terrain) =>
  Array.isArray(eventLog) ? { terrain, log: eventLog }
  : { terrain: terrain ?? eventLog?.terrain, log: Array.isArray(eventLog?.log) ? eventLog.log : [] };

const timeOf = (e) => (Number.isFinite(e?.t) ? e.t : Number.isFinite(e?.turn) ? e.turn : e?.seq ?? 0);

// ── γ: availability at asOf ─────────────────────────────────────────────────────────
// Keep events at or before asOf (null = everything), then drop any event a retract
// points at. Retraction is itself an event (nothing is unwritten); it just removes its
// referent from the fold. The retract markers themselves are kept so NUL can show the
// `cleared` ghost.
const availableAt = (log, asOf) => {
  const visible = log.filter((e) => e && (asOf == null || timeOf(e) <= asOf));
  const retracted = new Set(
    visible.filter((e) => e.kind === 'retract').map((e) => e.ref ?? e.refSeq).filter((x) => x != null));
  return { events: visible.filter((e) => !(e.seq != null && retracted.has(e.seq))), retracted };
};

// ── σ: which DEF currently holds ─────────────────────────────────────────────────────
// Among the visible `define` events, the current lede is the latest one not superseded
// by a `supersede` marker (was → now) and not superseded by a later define that names it
// in `supersedes`. Everything else is a prior framing → Reframings (REC), append-only.
const currentDef = (events) => {
  const defs = events.filter((e) => e.op === 'DEF' && e.kind === 'define');
  if (!defs.length) return { current: null, prior: [] };
  const superseded = new Set();
  for (const e of events) {
    if (e.kind === 'supersede' && e.was != null) superseded.add(e.was);
    if (e.op === 'DEF' && e.kind === 'define' && e.supersedes != null) superseded.add(e.supersedes);
  }
  const standing = defs.filter((d) => !(d.id != null && superseded.has(d.id)));
  const ordered = [...defs].sort((a, b) => timeOf(a) - timeOf(b));
  const current = (standing.length ? standing : defs).slice().sort((a, b) => timeOf(a) - timeOf(b)).pop();
  return { current, prior: ordered.filter((d) => d !== current) };
};

// ── π: provenance footnote of an attestation ─────────────────────────────────────────
const provenanceOf = (e) => Object.freeze({
  source: clean(e.source) || null,
  span: clean(e.span) || null,
  observer: clean(e.observer) || null,
  documented_in: clean(e.documented_in) || null,
  t: timeOf(e),
});

// Route a visible event to the section key it belongs to. An event may name its section
// directly (`section: 'strange'`); otherwise it is routed to the FIRST section its
// operator fills at this terrain (the primary section for that slot).
const routeKey = (e, terrain, sectionsByOp) => {
  if (e.section) return e.section;
  const forOp = sectionsByOp[e.op];
  return forOp && forOp.length ? forOp[0].key : null;
};

// One rendered section's entries, in log order, shaped by operator.
const entryOf = (e) => {
  switch (e.op) {
    case 'INS': return { kind: 'attestation', text: clean(e.text) || clean(e.span), provenance: provenanceOf(e), t: timeOf(e) };
    case 'CON':
    case 'SYN': return e.kind === 'edge'
      ? { kind: 'edge', edge: e.edge, dir: e.dir || 'out', to: clean(e.to) || null, from: clean(e.from) || null, t: timeOf(e) }
      : { kind: 'relation', text: clean(e.text), to: clean(e.to) || null, t: timeOf(e) };
    case 'SEG': return { kind: 'extent', text: clean(e.text) || clean(e.value), t: timeOf(e) };
    case 'SIG': return { kind: 'registration', at: clean(e.at) || null, address: clean(e.address) || null, t: timeOf(e) };
    case 'EVA': return { kind: 'judgment', text: clean(e.text), by: clean(e.by) || null, t: timeOf(e) };
    case 'REC': return { kind: 'reframing', text: clean(e.text), cause: clean(e.cause) || null, supersedes: e.supersedes ?? null, t: timeOf(e) };
    default: return { kind: 'event', text: clean(e.text), t: timeOf(e) };
  }
};

// ── the NUL projection: typed absence, not one blank ─────────────────────────────────
// Group visible `absent` events by their typed-absence id (or by field), count the three
// states, and fold in the retracted set as `cleared` ghosts. Structurally-sparse slots
// are NOT filed here (they are a fourth thing, §8) — the renderer marks them separately.
const projectAbsence = (terrain, events, retracted) => {
  const typed = absenceProfile(terrain) || [];
  const byId = new Map(typed.map((a) => [a.id, []]));
  const states = { [NUL_STATES.NEVER_SET]: 0, [NUL_STATES.CLEARED]: 0, [NUL_STATES.UNKNOWN]: 0 };
  for (const e of events) {
    if (e.op !== 'NUL' || e.kind !== 'absent') continue;
    const st = states[e.state] != null ? e.state : NUL_STATES.UNKNOWN;
    states[st] = (states[st] || 0) + 1;
    const bucket = byId.has(e.absence) ? e.absence : (typed[0]?.id ?? null);
    if (bucket != null) byId.get(bucket).push({ field: clean(e.field) || null, note: clean(e.note), state: st, t: timeOf(e) });
  }
  if (retracted.size) states[NUL_STATES.CLEARED] += retracted.size;
  return {
    headline: headlineAbsence(terrain) || null,
    states: Object.freeze({ ...states }),
    typed: typed.map((a) => Object.freeze({ ...a, entries: Object.freeze(byId.get(a.id) || []) })),
  };
};

// renderArticle(eventLog, terrain, asOf) → a fresh article view. `asOf` (a t/turn value)
// defaults to now-visible (null = everything). Returns null for an unknown terrain.
export const renderArticle = (eventLog, terrain, asOf = null) => {
  const article = asArticle(eventLog, terrain);
  const p = profileOf(article.terrain);
  if (!p) return null;

  const { events, retracted } = availableAt(article.log, asOf);
  const sections = sectionsOf(article.terrain);
  const sectionsByOp = sections.reduce((m, s) => ((m[s.op] = m[s.op] || []).push(s), m), {});

  // significance projection (M): σ picks the current lede; priors become reframings
  const { current, prior } = currentDef(events);

  // bucket every visible event to its section key
  const buckets = new Map(sections.map((s) => [s.key, []]));
  for (const e of events) {
    if (e.kind === 'retract' || e.kind === 'supersede' || e.op === 'NUL') continue; // handled elsewhere
    const key = routeKey(e, article.terrain, sectionsByOp);
    if (key && buckets.has(key)) buckets.get(key).push(e);
  }

  const absence = projectAbsence(article.terrain, events, retracted);
  const name = deriveName(article);

  const rendered = sections.map((s) => {
    const isLede = s.op === 'DEF';
    const isAbsence = s.op === 'NUL';
    let entries;
    if (isLede) {
      entries = current ? [{ kind: 'lede', text: clean(current.text), by: clean(current.by) || null, t: timeOf(current) }] : [];
    } else if (isAbsence) {
      entries = absence.typed.filter((a) => a.entries.length).flatMap((a) => a.entries.map((x) => ({ kind: 'absence', absence: a.id, ...x })));
    } else if (s.op === 'REC') {
      // reframings = explicit REC events PLUS the DEFs σ retired (prior framings)
      const recs = (buckets.get(s.key) || []).map(entryOf);
      const retired = prior.map((d) => ({ kind: 'reframing', text: `Prior lede: ${clean(d.text)}`, cause: 'superseded', supersedes: d.id ?? null, t: timeOf(d) }));
      entries = [...retired, ...recs];
    } else {
      entries = (buckets.get(s.key) || []).map(entryOf);
    }
    return Object.freeze({
      ...s,
      entries: Object.freeze(entries),
      empty: entries.length === 0,
      // a sparse slot that is empty is EXPECTED (desert / absent), not a TODO
      expectedEmpty: !!s.sparse,
    });
  });

  // provenance footnotes: every attestation's π, in order, numbered for the renderer
  const provenance = events.filter((e) => e.op === 'INS' && e.kind === 'attest')
    .map((e, i) => Object.freeze({ n: i + 1, ...provenanceOf(e) }));

  // Fresh object every call — never cached (see module header). Frozen so a caller can
  // hand it around without a downstream write mutating a "stored" article.
  return Object.freeze({
    terrain: article.terrain,
    domain: p.domain,
    object: p.object,
    name: name.name,
    nameSource: name.source,
    identityKey: identityKeyOf(article),
    lede: current ? Object.freeze({ text: clean(current.text), by: clean(current.by) || null }) : null,
    sections: Object.freeze(rendered),
    absence: Object.freeze(absence),
    provenance: Object.freeze(provenance),
    characteristicFailure: p.characteristicFailure,
    asOf,
    projectedAt: null, // deliberately not a timestamp — the view is not a cached snapshot
  });
};

// A convenience the render layer and probes use: the article's current lede text at asOf,
// or null. Same projection, so it can never disagree with renderArticle.
export const ledeAt = (eventLog, terrain, asOf = null) => renderArticle(eventLog, terrain, asOf)?.lede ?? null;
