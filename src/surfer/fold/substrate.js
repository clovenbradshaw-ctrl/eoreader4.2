// EO: SYN·EVA·NUL(Field,Network → Network,Void, Composing,Binding,Clearing) — the reading substrate (typed graph)
// The reading substrate (docs rich-notes §2, P1·P2). The notes stop being an
// ad-hoc verb-string format and become a real graph: a typed property, typed
// endpoints, an rdfs:label on every individual. OWL is the floor — open-world,
// the Given-Log's own stance — plus the three things OWL cannot carry and a
// refusal:
//
//   eo:band       the Resolution axis, riding the assertion itself (firm | void),
//                 so a void bond is held open rather than asserted as fact.
//   eo:Tension    EVA as a first-class node — two contradictory readings coexist
//                 on one node without exploding (the paraconsistent move).
//   eo:Reframing  the located REC — the surfer's recCursor written as a node, with
//                 the axis it broke along and its trigger.
//   eo:Reflection a DEEP READING (fold/deep-reading.js) — the reading's own enacted EVA at
//                 the place of most interest, carried as a first-class node at band void and
//                 witness 'reafferent' (canWitness false — the firewall). It is an
//                 interpretation the reading deposited when it was not otherwise busy, never
//                 a witnessed fact; projectGraph skips EVA, so it can ONLY surface here.
//   (refuse)      the global-consistency reasoner; at a Tension EO is deliberately
//                 paraconsistent, so a reasoner that flags the held contradiction is
//                 reasoning at the wrong face.
//
// SUBSTRATE INVARIANT. This is a PROJECTION of the append-only log, not new stored
// state — one more fold over the same events, computed at read time exactly as
// serializeNotes is. It is handed the structure surface (already a fold of the log)
// and the surfer's reading; it adds the band, the tensions, and the reframings, and
// nothing is written back. The membrane (fold/project.js) is what the talker sees;
// this is the grounder-side graph the membrane projects from.

import { plainRel } from '../../perceiver/index.js';

// The import-time alias table the wiki keeps (SUP→eo:EVA, ALT→eo:DEF; the corpus is
// never renamed) plus the two fields every individual carries. The @context is what
// makes the runtime form JSON-LD; the engine is browser-local and the log is already
// JSON, so JSON-LD is the natural serialization.
const EO = 'https://experientialontology.org/ns#';
const JSONLD_CONTEXT = Object.freeze({
  eo: EO,
  label: 'http://www.w3.org/2000/01/rdf-schema#label',
  SUP: 'eo:EVA',
  ALT: 'eo:DEF',
});

// buildSubstrate — fold the structure + the surfer's reading into the typed graph.
//   structure     the level-2 surface (figures, relations, defs) — already a log fold
//   significance  the level-3 reading at the cursor (its named surprises)
//   surf          the surfer's descent (recAxes — the located RECs)
//   reflections   the deep-reading EVAs read off the log (readReflections) — the reading's own
//                 held-open reflections at the places of most interest
//   metaReflections the metacognitive EVAs (fold/weave.js, readMetaReflections) — the reading's
//                 reflections ABOUT its reflections, one grain up, band void, reafferent
//   connections   the cross-connections (fold/weave.js, readConnections) — CON bonds between held
//                 interpretations (echo · bears-on · analogy), band void, reafferent
//   cursor        where the significance reading was taken (grounder-side; never crosses)
export const buildSubstrate = ({ structure, significance = null, surf = null, reflections = [], metaReflections = [], connections = [], cursor = null } = {}) => {
  const relations = structure?.relations || [];
  const defs      = structure?.defs || [];

  // Firm assertions — the CON arrows, each carrying its band (firm by default) and a
  // back-pointer (heldBy) the membrane reads to move a held fact out of the settled
  // group. The endpoints are typed individuals with labels; the verb is a typed
  // property whose plain rendering is the arrow the talker reads.
  const assertions = relations.map((r, i) => ({
    id: `a${i}`,
    s: { id: r.src.id, label: r.src.label },
    p: { via: r.via, plain: plainRel(r.via) },
    o: { id: r.tgt.id, label: r.tgt.label },
    polarity: r.polarity === '−' ? '−' : '+',
    band: 'firm',
    heldBy: null,
  }));

  // Firm value lines — the DEF predicates, one individual + a literal.
  const values = defs.map((d, i) => ({
    id: `v${i}`,
    ref: d.id,
    label: d.label,
    value: d.value,
    band: 'firm',
    heldBy: null,
  }));

  // eo:Tension (P2) — the one new read. Mint a held node where the document holds two
  // readings at once: a referent given two competing fills, or a bond both affirmed
  // and denied. The participating assertions/values are flagged held (so the membrane
  // voices the tension instead of asserting either side) but never removed — the
  // round-trip stays a superset of today's arrows.
  const tensions = detectTensions({ assertions, values });

  // eo:Reframing (located REC) — the surfer's recCursors written as nodes. The index
  // (atSentence) stays grounder-side; the membrane renders only the plain narration.
  const reframings = (surf?.recAxes || []).map((rec, i) => ({
    id: `r${i}`,
    atSentence: rec.cursor,
    alongAxis: (rec.alongAxis || []).slice(0, 3),
    trigger: rec.trigger || null,
    layer: rec.layer || null,
  }));

  // eo:Reflection — the deep readings the reading deposited when it was not otherwise busy
  // (fold/deep-reading.js). Each is an EVA at the place of most interest, carried at band
  // void with witness 'reafferent': it CANNOT witness (the §8 firewall), so it is graphed as
  // an interpretation the reading holds open, never as a fact. The index (atSentence) stays
  // grounder-side; the reflection prose and the figure it is about are what the reader shows.
  const reflectionNodes = (reflections || []).map((r, i) => Object.freeze({
    id: `f${i}`,
    atSentence: r.cursor ?? r.sentIdx ?? null,
    about: r.focus ?? null,
    reading: String(r.body ?? ''),
    verdict: r.verdict ?? null,
    band: 'void',                 // always held open — an interpretation, never firm
    witness: 'reafferent',        // canWitness false — the firewall, made explicit in the graph
    grounded: false,
  })).filter((r) => r.reading);

  // eo:MetaReflection — the reading's reflections ABOUT its reflections (fold/weave.js), one grain
  // up: a pattern (a recurring focus, a standing strain) read off its own prior EVAs. Carried at
  // band void, witness 'reafferent' — the same firewall as a first-order reflection.
  const metaNodes = (metaReflections || []).map((m, i) => Object.freeze({
    id: `m${i}`,
    atSentence: m.cursor ?? m.sentIdx ?? null,
    about: m.focus ?? null,
    pattern: m.pattern ?? null,
    reading: String(m.body ?? ''),
    verdict: m.verdict ?? null,
    order: 2,
    band: 'void',                 // always held open — an interpretation, never firm
    witness: 'reafferent',        // canWitness false — the firewall, explicit on the node
    grounded: false,
  })).filter((m) => m.reading);

  // eo:Connection — a CON bond between two held interpretations (fold/weave.js): echo (same
  // proposition, Born-gated), bears-on (a reflection touching a tension/reframing), or analogy
  // (same structure, different entities). Void and reafferent: it links void nodes and is itself
  // void — never a firm edge, never upgraded.
  const connectionNodes = (connections || []).map((c, i) => Object.freeze({
    id: `c${i}`,
    kind: c.kind ?? null,
    a: c.a ?? null,
    b: c.b ?? null,
    aSentence: c.aCursor ?? null,
    bSentence: c.bCursor ?? null,
    aDoc: c.aDoc ?? null,
    bDoc: c.bDoc ?? null,
    reading: String(c.body ?? ''),
    sameness: c.sameness ?? null,
    band: 'void',
    witness: 'reafferent',
    grounded: false,
  })).filter((c) => c.reading);

  return Object.freeze({
    '@context': JSONLD_CONTEXT,
    cursor,
    assertions,
    values,
    tensions,
    reframings,
    reflections: reflectionNodes,
    metaReflections: metaNodes,
    connections: connectionNodes,
    // The located-REC narration the reading already computes — the Significance
    // appearance today's notes drop. Carried so the membrane can route it to the
    // "Where the reading turns" group. Surface prose, no index.
    surprise: significance?.summary || null,
  });
};

// readReflections — the deep-reading EVAs a log carries (fold/deep-reading.js). Read off the
// append-only log at read time, exactly as the substrate reads everything else: a reflection
// is an enacted EVA tagged `reflection:true`. Empty on any log a deep reading never touched, so
// buildSubstrate stays byte-identical where no reflection has been deposited.
export const readReflections = (doc) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  return events.filter((e) => e && e.op === 'EVA' && e.reflection === true && e.register === 'enacted');
};

// readMetaReflections — the metacognitive EVAs a log carries (fold/weave.js). An enacted EVA one
// order up, tagged meta:true, layer:'metacognition'. It is deliberately NOT reflection:true, so
// readReflections never folds it back in — loop 2 reads loop 1's reflections, never its own output.
export const readMetaReflections = (doc) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  return events.filter((e) => e && e.op === 'EVA' && e.meta === true && e.layer === 'metacognition');
};

// readConnections — the cross-connections a log carries (fold/weave.js): enacted CON bonds tagged
// connection:true, layer:'connection'. Read off the log at read time, exactly like the reflections.
export const readConnections = (doc) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  return events.filter((e) => e && e.op === 'CON' && e.connection === true && e.layer === 'connection');
};

// detectTensions — the paraconsistent read (P2). Two shapes:
//   competing fills — the same referent DEF'd to two distinct values.
//   polarity clash  — the same (subject, verb, object) bond affirmed and denied.
// Each becomes an eo:Tension with eo:resolved false; the members are flagged held.
export const detectTensions = ({ assertions = [], values = [] } = {}) => {
  const tensions = [];

  // Competing DEF fills, grouped by referent. Distinct values only — a repeated
  // identical fill is corroboration, not tension.
  const byRef = new Map();
  for (const v of values) {
    const k = v.ref;
    if (!byRef.has(k)) byRef.set(k, []);
    byRef.get(k).push(v);
  }
  for (const [, group] of byRef) {
    const distinct = dedupBy(group, v => norm(v.value));
    if (distinct.length < 2) continue;
    const label = group[0].label;
    const fills = distinct.map(v => `“${trim(v.value)}”`);
    for (const v of distinct) v.heldBy = `t${tensions.length}`;
    tensions.push(Object.freeze({
      id: `t${tensions.length}`,
      kind: 'competing-fills',
      label: `${label}: the document gives both ${joinAnd(fills)} and settles neither.`,
      holds: distinct.map(v => v.id),
      resolved: false,
    }));
  }

  // Polarity clash on the same bond.
  const byBond = new Map();
  for (const a of assertions) {
    const k = `${a.s.id}|${a.p.plain}|${a.o.id}`;
    if (!byBond.has(k)) byBond.set(k, []);
    byBond.get(k).push(a);
  }
  for (const [, group] of byBond) {
    const pols = new Set(group.map(a => a.polarity));
    if (!(pols.has('+') && pols.has('−'))) continue;
    const a = group[0];
    for (const x of group) x.heldBy = `t${tensions.length}`;
    tensions.push(Object.freeze({
      id: `t${tensions.length}`,
      kind: 'polarity-clash',
      label: `${a.s.label} ${a.p.plain.replace(/-/g, ' ')} ${a.o.label}: the document both affirms and denies this.`,
      holds: group.map(x => x.id),
      resolved: false,
    }));
  }

  return tensions;
};

// substrateToEOT — the round-trip measurement (P1). Render the firm graph back to the
// EOT lines serializeNotes emits, band and nodes stripped, so the substrate is provably a
// SUPERSET of the current notes. Mirrors serializeNotes' dedup (by src|±rel|tgt, by ref)
// and the shared 8-line cap, so the output is byte-equal to serializeNotes(structure) on
// the same structure.
export const substrateToEOT = (substrate, { max = 8 } = {}) =>
  renderLines(substrate, { max, includeHeld: true });

// renderLines — the shared EOT LINK / IS-A renderer (docs/eot-surface-syntax.md). A bond
// is `A -> B : rel`, a value `A : value` — the flat-arrow notation was retired (a
// model reads it as causal even on mere adjacency; §2). includeHeld=false drops the facts
// a tension has claimed (the membrane's settled group); includeHeld=true keeps them (the
// round-trip superset).
export const renderLines = (substrate, { max = 8, includeHeld = true } = {}) => {
  const lines = [];
  const seen = new Set();
  for (const a of (substrate?.assertions || [])) {
    if (!includeHeld && a.heldBy) continue;
    const neg = a.polarity === '−' ? 'not-' : '';
    const key = `${a.s.id}|${neg}${a.p.plain}|${a.o.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`${a.s.label} -> ${a.o.label} : ${neg}${a.p.plain}`);   // EOT LINK → CON
    if (lines.length >= max) return lines;
  }
  for (const v of (substrate?.values || [])) {
    if (!includeHeld && v.heldBy) continue;
    const key = `def|${v.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`${v.label} : ${v.value}`);                             // EOT IS-A → DEF
    if (lines.length >= max) return lines;
  }
  return lines;
};

// substrateToJSONLD — the firm graph as JSON-LD, centred on a node (the cursor's
// referent if it carries firm assertions, else the first subject). The @id/label
// pair is the cursor membrane written as a W3C standard: the formal identifier and
// the human rendering are two fields on one object. Demonstration form — the engine
// reasons over the substrate object; this is the standard-shaped serialization.
export const substrateToJSONLD = (substrate, focusId = null) => {
  const firm = (substrate?.assertions || []).filter(a => a.band === 'firm');
  const subject = focusId || firm[0]?.s.id || null;
  if (!subject) return { '@context': substrate?.['@context'] || JSONLD_CONTEXT };
  const out = {
    '@context': { ...(substrate?.['@context'] || JSONLD_CONTEXT) },
    '@id': `doc:${subject}`,
    '@type': 'eo:Entity',
  };
  const subjLabel = firm.find(a => a.s.id === subject)?.s.label
    || (substrate?.values || []).find(v => v.ref === subject)?.label || subject;
  out.label = subjLabel;
  for (const a of firm) {
    if (a.s.id !== subject) continue;
    const prop = camel(a.p.plain);
    out['@context'][prop] = { '@id': `eo:${prop}`, '@type': '@id' };
    out[prop] = { '@id': `doc:${a.o.id}`, label: a.o.label };
  }
  return out;
};

// ── helpers ──────────────────────────────────────────────────────────────────
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const trim = (s, n = 90) => { const t = String(s || '').trim(); return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t; };
const dedupBy = (xs, key) => { const seen = new Set(); const out = []; for (const x of xs) { const k = key(x); if (seen.has(k)) continue; seen.add(k); out.push(x); } return out; };
const joinAnd = (xs) => xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const camel = (s) => String(s).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
