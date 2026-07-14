// EO: SEG·CON(Network,Link → Network, Dissecting,Binding) — profile → closed inventory
// The two adapters that turn what the reader already computes about a SOURCE or an ENTITY into the
// closed inventory the topline phrases. All the domain knowledge — which of an entity's standing
// properties are claims, what counts as a computed fact, when the field is a measured absence —
// lives here, so the generator (topline.js) stays a pure two-pass over objects, and the room
// (rooms/reader/app.js) just hands over the profile it already has.
//
// Nothing here reads source text or calls a model. It selects and shapes objects the perceiver and
// the graph already decided; buildInventory then fixes their order and the caps.

import { buildInventory } from './inventory.js';

const cite = (xs) => (xs || []).map((x) => (typeof x === 'number' ? x : x?.idx)).filter((n) => Number.isInteger(n));

// A standing PROPERTY worth stating names what the referent IS ("a travelling salesman", "his
// devoted sister", "changed into an insect") — a nominal, article- or possessive-led phrase, or a
// fuller clause. A bare verb fragment the parser happened to lift ("woke find", "brought food")
// identifies nothing and reads as broken. This keeps the nominal properties and, only when the
// referent has none, falls back to its single strongest fragment so a real subject is never left
// silent. The claims arrive already ranked, so order (and thus standing) is preserved.
const NOMINAL = /(^|\s)(a|an|the|his|her|their|its|my|our|your|one|two|three|four|five|first|second|third|no|not)\s+\p{L}/iu;
const isNominal = (v) => NOMINAL.test(String(v || '')) || String(v || '').trim().split(/\s+/).filter(Boolean).length >= 3;
const wordSet = (v) => new Set(String(v || '').toLowerCase().match(/\p{L}+/gu) || []);
const refineClaims = (claims) => {
  const nom = (claims || []).filter((c) => isNominal(c.value));
  const base = nom.length ? nom : (claims || []).slice(0, 1);
  // drop a claim whose words are a subset of an earlier, higher-ranked one ("his sister" under
  // "his devoted sister") — the fuller phrase already carries it.
  const kept = [];
  for (const c of base) {
    const ct = wordSet(c.value);
    if (ct.size && kept.some((k) => { const kt = wordSet(k.value); return [...ct].every((t) => kt.has(t)); })) continue;
    kept.push(c);
  }
  return kept;
};

// An entity's topline inventory, from app.entityProfile(docId, entId). Its ranked standing
// properties are the claims (each already carrying its witnessing passages and a corroboration
// count); its incident bonds are the relational claims; its mention/link/source tallies are the
// computed facts; and a figure the record NAMES but never characterises is a measured gap.
export const entityInventory = (profile, { maxClaims = 4, maxRelations = 3, mentionCount = null, sourceCount = 1 } = {}) => {
  const label = profile?.label || profile?.subject || 'this entity';
  const defs = (profile?.defs || []);
  const rels = (profile?.relations || []);
  const mentions = (profile?.mentions || []);
  const nMentions = mentionCount != null ? mentionCount : mentions.length;

  const claims = refineClaims(defs).slice(0, maxClaims).map((d) => ({
    subject: label, value: d.value, cite: cite(d.witnesses?.length ? d.witnesses : [d.idx]),
    count: d.count || 1, polarity: d.polarity, modality: d.modality,
    // footing pulled: a hedged, single-witness, low-confidence property is not yet standing.
    unsettled: d.modality && d.modality !== 'realis' && (d.count || 1) < 2 && (d.confidence ?? 1) < 0.5,
  }));

  // incident bonds — but only the algebra-TYPED ones (kinship/role/social: sister, captain, wife).
  // typeOf is non-null exactly for relational NOUNS and null for the verb edges the parser lifts
  // ("woke", "drove"), which read as noise in a summary. A typed bond reads possessively (X is Y's
  // sister); an untyped one is dropped rather than phrased on shaky footing.
  const relations = rels.filter((r) => r.type).slice(0, maxRelations).map((r) => ({
    subject: r.srcLabel, via: cleanVia(r.via), object: r.tgtLabel,
    cite: cite([r.idx]), polarity: r.polarity === '−' ? '−' : '+', kinship: true,
  })).filter((r) => r.subject && r.object && r.via);

  const facts = [];
  if (nMentions > 0) facts.push({ id: 'mentions', kind: 'count', verb: 'appears in', n: nMentions, noun: nMentions === 1 ? 'passage' : 'passages', cite: cite(mentions.slice(0, 3)) });
  const links = Math.max(0, (profile?.figures?.length || 0) - 1);
  if (links > 0) facts.push({ id: 'links', kind: 'count', verb: 'is linked to', n: links, noun: links === 1 ? 'other entity' : 'other entities' });
  if (sourceCount > 1) facts.push({ id: 'sources', kind: 'count', verb: 'is named across', n: sourceCount, noun: 'sources' });

  const gap = (claims.length === 0 && relations.length === 0)
    ? { term: label, cite: cite(mentions.slice(0, 1)), scanned: { n: nMentions, noun: nMentions === 1 ? 'passage' : 'passages' } }
    : null;

  return buildInventory({ subject: label, claims, relations, facts, gap, allowInference: false });
};

// A source's topline inventory, from a reading the room assembles (its dominant figures' strongest
// standing properties and bonds, its front-matter facts, its log tallies). The single optional
// inference — what the source PRIMARILY concerns, read off its dominant figures — is allowed here,
// and marked ours.
export const sourceInventory = (reading, { maxClaims = 4, maxRelations = 2 } = {}) => {
  const subject = reading?.title || 'this source';
  const claims = refineClaims(reading?.claims || []).slice(0, maxClaims).map((c) => ({
    subject: c.subject, value: c.value, cite: cite(c.cite), count: c.count || 1,
    polarity: c.polarity, modality: c.modality, unsettled: c.unsettled === true,
  }));
  const relations = (reading?.relations || []).slice(0, maxRelations).map((r) => ({
    subject: r.subject, via: cleanVia(r.via), object: r.object,
    cite: cite(r.cite), polarity: r.polarity === '−' ? '−' : '+', kinship: !!r.kinship,
  })).filter((r) => r.subject && r.object && r.via);

  const m = reading?.metadata || {};
  const facts = [];
  if (m.date) facts.push({ id: 'date', kind: 'value', verb: 'dated', value: String(m.date) });
  if (m.author) facts.push({ id: 'author', kind: 'value', verb: 'written by', value: String(m.author) });
  // The entity/proposition TALLIES are deliberately NOT phrased into the summary. They describe the
  // reading's machinery, not what the source is ABOUT, and a thin reading (e.g. a clip still
  // transcribing) had nothing else to say, so the hero read "names N entities, yields N propositions"
  // — a count of parts where the reader wanted the content. The tallies still show on the source
  // header (its segment/entity count) and the EoT tab (its proposition count); the summary is content.

  return buildInventory({
    subject, claims, relations, facts,
    figures: (reading?.figures || []).map((f) => ({ label: f.label, count: f.count })),
    allowInference: true,
  });
};

// A relation verb the phraser can read: drop a trailing operator/punctuation, collapse whitespace.
// figureSurface hands us the surface verb ("originated in", "drove"); we keep it verbatim as content.
const cleanVia = (via) => String(via || '').trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
