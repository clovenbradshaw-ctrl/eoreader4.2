// EO: EVA·SYN(Field,Network,Lens → Lens,Network, Binding,Composing) — proposition DEF-claim veto (P2)
// The proposition channel — the claim-grain veto for DEF predications (the P2
// channel the edge-grounding veto left open).
//
// The edge veto (correspond.js) parses the talker's prose into CON/SIG EDGES and
// checks each against the document graph. It is, by construction, EDGES-ONLY: a
// single-argument predication — "O'Connell is a council member" — has no second
// entity, produces no edge, and slips the check whole. That is exactly the miss
// this closes: a deep-research answer called Freddie O'Connell "a Metro Council
// member" while the very sources it stood on say "Mayor Freddie O'Connell". The
// stale role survived because nothing evaluated the PROPOSITION the answer made
// about a single figure.
//
// This channel does for DEF propositions what correspond.js does for edges:
//
//   1. EVALUATE every proposition the answer asserts — parseProps reads the
//      talker's prose into resolved props (the same parser the page is read with),
//      and this channel takes the DEF (one-place, subject + predicate) ones the
//      edge channel cannot see.
//   2. CHECK each against the SOURCES AT THE CORRECT CURSOR — the document's own
//      DEF propositions are read sentence-by-sentence, EACH at the cursor where it
//      sits, so "as a council member, he WAS a critic" (a past frame at its own
//      line) is read as a FORMER role, distinct from "he IS the mayor" read at the
//      line that asserts it. A claim is graded against the source reading that
//      governs it, not against a bag of words pooled across the corpus.
//
// The new verdicts, beside corroborated / unsupported:
//
//   superseded  the answer asserts an exclusive OFFICE (mayor, council member,
//               governor, …) as current, but the sources currently witness a
//               DIFFERENT exclusive office for the same person and do NOT currently
//               witness the claimed one. The role the answer gives has been
//               succeeded — the O'Connell catch. Flag-and-tell with the current
//               office and its citation, never a substitution.
//   stale       the answer asserts an office as current, but the sources mark that
//               same office as FORMER and do not currently witness it ("former
//               council member" against "is a council member").
//
// Like the edge veto this is a correspondence between two readings, never a claim
// against truth (edge-grounding.md): it makes the answer faithful to the sources at
// the cursor, not the sources faithful to the world. And it is conservative by
// construction — supersession fires only between offices a person holds ONE of at a
// time, only when the current office is positively witnessed, and only when the
// answer asserts the stale role AS current. False negatives (a title outside the
// exclusive set, a person sharing a surname) are the honest seam; a false refusal
// is the thing it must never do, so it only ever flags.

import { parseProps }          from '../index.js';
import { parseText }           from '../../perceiver/parse/index.js';
import { attributesConflict, projectGraph, evaluateSameAs, discriminatorIndex } from '../../core/index.js';

// ── The office lexicon ──────────────────────────────────────────────────────
//
// Two tiers. EXCLUSIVE offices are seats a person holds one of at a time within a
// body — a transition between them (council member → mayor) is precisely the
// supersession this catches, so a conflict between two distinct exclusive heads is
// real. The broader OFFICE set is every title we RECOGNISE as a role (so a DEF
// naming one is graded as an office claim, corroborated or not), but a clash among
// these never supersedes — "chair", "director", "founder" co-occur freely.

// Multiword phrases → a single canonical head, longest first so "vice president"
// is read before "president". The value is `[canonical, exclusive]`.
const OFFICE_PHRASES = [
  ['city council member', ['councilmember', true]],
  ['council member',      ['councilmember', true]],
  ['prime minister',      ['prime-minister', true]],
  ['vice president',      ['vice-president', true]],
  ['lieutenant governor', ['lieutenant-governor', true]],
  ['attorney general',    ['attorney-general', true]],
  ['secretary of state',  ['secretary-of-state', true]],
  ['district attorney',   ['district-attorney', true]],
  ['chief justice',       ['chief-justice', true]],
  ['chief executive officer', ['ceo', true]],
  ['chief executive',     ['ceo', true]],
  ['head coach',          ['head-coach', true]],
  ['deputy mayor',        ['deputy-mayor', false]],   // a distinct seat from mayor — recognised, never supersedes it
  ['press secretary',     ['press-secretary', false]],
  ['executive director',  ['executive-director', false]],
  ['managing director',   ['managing-director', false]],
  ['editor in chief',     ['editor-in-chief', false]],
];

// Single-token offices → [canonical, exclusive]. Council variants collapse to the
// one seat; the exclusive tier is kept tight (clearly one-per-person seats) so a
// supersession is never minted between titles that genuinely co-occur.
const OFFICE_TOKENS = new Map([
  ['mayor', ['mayor', true]], ['governor', ['governor', true]],
  ['councilmember', ['councilmember', true]], ['councilman', ['councilmember', true]],
  ['councilwoman', ['councilmember', true]], ['councilor', ['councilmember', true]],
  ['councillor', ['councilmember', true]], ['councilperson', ['councilmember', true]],
  ['alderman', ['alderman', true]], ['alderwoman', ['alderman', true]],
  ['supervisor', ['supervisor', true]], ['senator', ['senator', true]],
  ['congressman', ['representative', true]], ['congresswoman', ['representative', true]],
  ['representative', ['representative', true]], ['delegate', ['delegate', true]],
  ['assemblyman', ['assemblyman', true]], ['assemblywoman', ['assemblyman', true]],
  ['president', ['president', true]], ['chancellor', ['chancellor', true]],
  ['premier', ['premier', true]], ['taoiseach', ['taoiseach', true]],
  ['sheriff', ['sheriff', true]], ['ambassador', ['ambassador', true]],
  ['king', ['king', true]], ['queen', ['queen', true]], ['emperor', ['emperor', true]],
  ['empress', ['empress', true]], ['pope', ['pope', true]], ['premier', ['premier', true]],
  // Recognised offices that DO NOT supersede (co-occurring titles).
  ['chair', ['chair', false]], ['chairman', ['chair', false]], ['chairwoman', ['chair', false]],
  ['chairperson', ['chair', false]], ['director', ['director', false]], ['chief', ['chief', false]],
  ['ceo', ['ceo', true]], ['cfo', ['cfo', false]], ['cto', ['cto', false]],
  ['dean', ['dean', false]], ['principal', ['principal', false]], ['commissioner', ['commissioner', false]],
  ['superintendent', ['superintendent', false]], ['founder', ['founder', false]],
  ['owner', ['owner', false]], ['publisher', ['publisher', false]], ['editor', ['editor', false]],
  ['treasurer', ['treasurer', false]], ['secretary', ['secretary', false]],
  ['minister', ['minister', false]], ['coach', ['coach', false]], ['captain', ['captain', false]],
  ['judge', ['judge', false]], ['justice', ['justice', false]], ['professor', ['professor', false]],
]);

const ALL_OFFICE_TOKENS = new Set(OFFICE_TOKENS.keys());
for (const [phrase] of OFFICE_PHRASES) for (const t of phrase.split(' ')) ALL_OFFICE_TOKENS.add(t);

// Honorifics and qualifiers dropped when reading a person's name out of a label, so
// "Mayor Freddie O'Connell" / "former O'Connell" / "the O'Connell" all key on the
// surname. Office tokens are dropped too (the title is not the name).
const NAME_NOISE = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'sir', 'lord', 'lady', 'rev', 'hon', 'sen', 'rep', 'gov',
  'former', 'ex', 'onetime', 'one-time', 'erstwhile', 'outgoing', 'then', 'sometime', 'late',
  'retired', 'previous', 'incoming', 'acting', 'interim', 'earlier', 'later', 'now', 'current',
  'the', 'a', 'an', 'metro', 'city', 'county', 'state', 'us', 'u.s', 'new',
]);

// A value-level FORMER marker — the role itself is qualified as past ("a former
// council member", "the onetime mayor").
const FORMER_VALUE = /\b(former|ex|onetime|one-time|erstwhile|outgoing|sometime|previous|retired|then)\b/i;
// A surface-level past frame around the predication, absent a "now/currently" pull.
const FORMER_SURFACE = /\b(was|were|had been|used to|no longer|previously|formerly|stepped down|resigned|ousted|until)\b/i;
const PRESENT_NOW = /\b(now|currently|today|presently|these days)\b/i;

const lower = (s) => String(s ?? '').toLowerCase();
const tokens = (s) => lower(s).split(/[^a-z0-9']+/).filter(Boolean);

// The TIME axis is dated, not just tensed. yearOf lifts a 4-digit year from a date string,
// Date, or number — the grain the grounding re-dates on: "is the mayor" on a 2021 page is
// current AS OF 2021, not assumed true now. The surfer's clock (now) decides if that is stale.
const STALE_YEARS = 2;   // a current claim whose freshest witness predates now by more than this is re-dated
const yearOf = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return (v >= 1900 && v <= 2100) ? v : null;
  if (v instanceof Date) return v.getFullYear();
  const m = String(v).match(/\b(?:19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
};
const universeYear = (u) => yearOf(u?.web?.published || u?.web?.date || u?.web?.fetched_at);

// The SPACE axis. A seat is bound to a jurisdiction — "mayor OF NASHVILLE", "council
// member IN SALT LAKE CITY". readPlace lifts that proper-noun place so a role can be
// grounded against WHERE, not just who and when: a Nashville council membership is a
// different fact from a Salt Lake City one, and one must never corroborate the other.
// Generic administrative words (metro, city, county) are NOT places — "a Metro Council
// member" carries no jurisdiction, so it can't false-mismatch a "Nashville" mention.
const GENERIC_PLACE = new Set(['metro', 'city', 'county', 'state', 'district', 'town', 'borough', 'council', 'the', 'us', 'usa', 'national']);
const PLACE_OF = /\b(?:of|in|for|from)\s+(?:the\s+)?([A-Z][A-Za-z.'’-]+(?:\s+(?:of\s+)?[A-Z][A-Za-z.'’-]+){0,3})/;
const readPlace = (value) => {
  const m = String(value || '').match(PLACE_OF);
  if (!m) return null;
  const p = m[1].toLowerCase().replace(/\./g, '').trim();
  return (!p || GENERIC_PLACE.has(p)) ? null : p;
};

// readOffice(value) → { head, exclusive, former, place } | null. Find the office a
// predicate value names (multiword first), whether the value marks it former, and the
// jurisdiction it is bound to (the space axis), if any.
export const readOffice = (value) => {
  const v = lower(value);
  if (!v) return null;
  const former = FORMER_VALUE.test(v);
  const place = readPlace(value);
  for (const [phrase, [head, exclusive]] of OFFICE_PHRASES) {
    if (v.includes(phrase)) return { head, exclusive, former, place };
  }
  for (const t of tokens(v)) {
    const hit = OFFICE_TOKENS.get(t);
    if (hit) return { head: hit[0], exclusive: hit[1], former, place };
  }
  return null;
};

// The person a label is about — its surname token, with titles, honorifics and
// time-qualifiers stripped. The bridge across name variants ("Freddie O'Connell",
// "O'Connell", "Mayor Freddie O'Connell") that separate admissions would otherwise
// key on different ids. Conservative: a shared surname is taken as the same person,
// which is the honest seam (two distinct people sharing a surname would merge here).
export const personKey = (label) => {
  // Apostrophes are stripped, not split on, so "O'Connell" / "O’Connell" (curly) /
  // "OConnell" all key on one surname — the variant the real failure turned on.
  const ts = lower(label).replace(/['’]/g, '').split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !NAME_NOISE.has(t) && !ALL_OFFICE_TOKENS.has(t));
  return ts.length ? ts[ts.length - 1] : null;
};

// defTense(surface, value) → 'former' | 'current'. The role is FORMER when the value
// marks it past, or the surface clause sits in a past frame with no present pull.
const defTense = (surface, value) => {
  if (FORMER_VALUE.test(lower(value))) return 'former';
  if (FORMER_SURFACE.test(surface) && !PRESENT_NOW.test(surface)) return 'former';
  return 'current';
};

// The CORROBORATION axis — "appears once" is not a fact. A witness is a (source · text)
// pair, and two witnesses are THE SAME witness when they come from the same source OR
// say the same thing verbatim — syndicated wire copy on three sites is one witness, not
// three. `meaningfulSupport` collapses those and returns the count of genuinely
// independent supports, so the audit can ask the user's question: are there ≥2
// meaningfully-different sources, or is this resting on a single mention?
const SUPPORT_STOP = new Set('the a an of to in on for and or but is are was were be been with as at by from this that his her their its he she they it him them who whom whose when where why which how not no into over under more most some any all said says say now then'.split(' '));
const contentWords = (t) => new Set(lower(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 3 && !SUPPORT_STOP.has(w)));
const nearDuplicate = (a, b) => {
  const A = contentWords(a), B = contentWords(b);
  if (!A.size || !B.size) return false;
  let inter = 0; for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter) >= 0.7;   // Jaccard ≥ .7 → the same statement reworded or copied
};
export const meaningfulSupport = (supports = []) => {
  const witnesses = [];
  for (const s of supports) {
    if (witnesses.some(w => (w.source && w.source === s.source) || nearDuplicate(w.text, s.text))) continue;
    witnesses.push(s);
  }
  return witnesses.length;
};

// ── The IDENTITY axis — pocket universes (docs/pocket-universe-grounding.md) ──
//
// Surname is a bad cross-document tool. Identity is the engine's own physics: each
// document is a POCKET UNIVERSE in which a name resolves to one referent carrying that
// universe's relationships; across universes, same-name referents are DISTINCT, and a
// `same_as` bridge is ASSERTED — by convergence of discriminators, forked by conflict,
// held open otherwise (core/asterisk.js evaluateSameAs). The name proposes the
// candidate; the relationships dispose. So a Nashville mayor and a Salt Lake City
// council member named Smith stay two people, while a council-member-then-mayor O'Connell,
// converging on a shared context, is one.
//
// The composite collapses identical labels across documents (first-doc-wins), so the
// pocket universes live in its PART documents — each keeps its own un-collapsed
// admission. `universesOf` recovers them.
const universesOf = (doc) => {
  if (!doc?.isComposite) return doc ? [doc] : [];
  const seen = new Map();
  for (let i = 0; i < (doc.sentences || []).length; i++) {
    const o = typeof doc.origin === 'function' ? doc.origin(i) : null;
    if (o?.doc && !seen.has(o.docId)) seen.set(o.docId, o.doc);
  }
  return seen.size ? [...seen.values()] : [doc];
};

// nameTokens — the candidate-BLOCKING tokens of a label (full-name tokens, office and
// honorific words dropped). NOT the identity decision — only which referents are worth
// TESTING for sameness. The label is the thing in question and cannot be its own evidence.
const nameTokens = (label) => new Set(
  lower(label).replace(/['’]/g, '').split(/[^a-z0-9]+/)
    .filter(t => t.length > 2 && !NAME_NOISE.has(t) && !ALL_OFFICE_TOKENS.has(t)));
const shareName = (a, b) => { const A = nameTokens(a); for (const t of nameTokens(b)) if (A.has(t)) return true; return false; };

// The TIME-and-SPACE-gated office conflict oracle (the crux). Two CURRENT exclusive
// offices are two people — one bearer holds one current exclusive seat:
//   · office-head  (the bare seat) — disjoint heads ⇒ a current mayor and a current
//                  council member are two people. Same head converges (exact overlap),
//                  so a missing jurisdiction never conflicts with a present one.
//   · office-where (head@jurisdiction) — the SAME seat in two jurisdictions (a Nashville
//                  mayor and a Salt Lake City mayor) ⇒ two people.
// A FORMER office is never a conflict (council-member→mayor is succession, not a split).
// Everything else (jurisdiction alone, relational vias) defers to the standard oracle.
const officeConflict = (via, A, B, opts) => {
  if (via === 'office-head') return { conflict: 1, reason: 'two-current-seats' };   // disjoint current seats
  if (via === 'office-where') {
    const heads = (s) => new Set([...s].map(t => t.split('@')[0]));
    const hb = heads(B);
    for (const h of heads(A)) if (hb.has(h)) return { conflict: 1, reason: 'same-seat-two-jurisdictions' };
    return { conflict: 0, reason: 'distinct-seats' };
  }
  return attributesConflict(via, A, B, opts);
};

const EMPTY_DISC = new Map();

// The office propositions one pocket universe holds, each tagged with its universe-
// namespaced referent, source, tense (read at its cursor), place, and witnessing text.
const universeOfficeRecords = (u, ui) => {
  const out = [];
  if (!u?.admission) return out;
  const tag = (id) => `U${ui}::${id}`;
  const source = u.web?.url || u.web?.final_url || u.docId || `u${ui}`;
  const date = universeYear(u);   // when this universe was published — the as-of date of its claims
  const sents = u.sentences || [];
  for (let i = 0; i < sents.length; i++) {
    for (const p of parseProps(sents[i], u, i)) {
      if (p.kind !== 'def') continue;
      const office = readOffice(p.attr?.value);
      if (!office) continue;
      out.push({ ref: tag(p.subj), label: u.admission.labelOf?.(p.subj) || p.subj, office,
        tense: defTense(p.surface || sents[i], p.attr?.value), source, date, sentIdx: i, value: p.attr?.value, text: p.surface || sents[i] });
    }
  }
  for (const [label, id] of (u.admission.admitted || [])) {
    const office = readOffice(label);
    if (!office) continue;
    const sentIdx = (u.mentions?.get(id) || [])[0] ?? null;
    out.push({ ref: tag(id), label, office, tense: FORMER_VALUE.test(lower(label)) ? 'former' : 'current',
      source, date, sentIdx, value: label, text: sents[sentIdx] || label });
  }
  return out;
};

// The discriminators of every universe-namespaced referent: the relationships from its
// universe's own graph (the relational fingerprint), PLUS its offices encoded as
// time-tagged discriminators. These are what evaluateSameAs reads to bridge or fork.
const buildDiscriminators = (universes, records) => {
  const disc = new Map();
  const add = (r, via, t) => { let m = disc.get(r); if (!m) disc.set(r, (m = new Map())); let s = m.get(via); if (!s) m.set(via, (s = new Set())); s.add(t); };
  universes.forEach((u, ui) => {
    let edges = [];
    try { edges = projectGraph(u.log, {}).edges || []; } catch { edges = []; }
    const lf = (id) => u.admission?.labelOf?.(id) || id;
    for (const [r, m] of discriminatorIndex(edges, (x) => x, lf)) for (const [via, ts] of m) for (const t of ts) add(`U${ui}::${r}`, via, t);
  });
  for (const rc of records) {
    if (rc.tense === 'current' && rc.office.exclusive) {
      add(rc.ref, 'office-head', rc.office.head);                                   // converges same current seat
      if (rc.office.place) { add(rc.ref, 'office-where', `${rc.office.head}@${rc.office.place}`); add(rc.ref, 'jurisdiction', rc.office.place); }
    } else if (rc.tense === 'former') add(rc.ref, 'former-office', `${rc.office.head}@${rc.office.place || ''}`);
    else add(rc.ref, 'title', rc.office.head);
  }
  return disc;
};

// personClusters(doc) → { clusters: Map<clusterId, person>, disc, find }. The pocket-
// universe identity layer: extract each universe's office referents, bridge them by the
// `same_as` physics (name-blocked, decided by evaluateSameAs over discriminators, merged
// only on PROMOTE — earned convergence, never the name), and aggregate offices per
// person. A `person` is { current: Map<head,fact>, former: Map<head,fact>, names:Set,
// disc:Map<via,Set>, refs:Set }; a `fact` is { sentIdx, value, exclusive, places:Set,
// supports:[{source,text}] }, so space, time, and corroboration ride on every office.
export const personClusters = (doc) => {
  const universes = universesOf(doc);
  const records = universes.flatMap((u, ui) => universeOfficeRecords(u, ui));
  const disc = buildDiscriminators(universes, records);
  const labelOfRef = new Map(records.map(r => [r.ref, r.label]));
  const refs = [...new Set(records.map(r => r.ref))];

  const parent = new Map();
  const find = (x) => { let p = parent.get(x) ?? x; while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p; return p; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const dof = (r) => disc.get(r) || EMPTY_DISC;
  for (let i = 0; i < refs.length; i++) for (let j = i + 1; j < refs.length; j++) {
    if (!shareName(labelOfRef.get(refs[i]), labelOfRef.get(refs[j]))) continue;   // name proposes
    if (evaluateSameAs(refs[i], refs[j], { discriminatorsOf: dof, attributesConflict: officeConflict, minConvergence: 1 }).verdict === 'promote')
      union(refs[i], refs[j]);                                                      // relationships dispose
  }

  const clusters = new Map();
  for (const rc of records) {
    const c = find(rc.ref);
    let e = clusters.get(c);
    if (!e) { e = { current: new Map(), former: new Map(), names: new Set(), refs: new Set(), disc: new Map() }; clusters.set(c, e); }
    e.names.add(rc.label); e.refs.add(rc.ref);
    for (const [via, ts] of (disc.get(rc.ref) || EMPTY_DISC)) { let s = e.disc.get(via); if (!s) e.disc.set(via, (s = new Set())); for (const t of ts) s.add(t); }
    const slot = rc.tense === 'former' ? e.former : e.current;
    let f = slot.get(rc.office.head);
    if (!f) { f = { sentIdx: rc.sentIdx, value: rc.value, exclusive: rc.office.exclusive, places: new Set(), supports: [] }; slot.set(rc.office.head, f); }
    if (rc.office.place) f.places.add(rc.office.place);
    f.supports.push({ source: rc.source, text: rc.text, date: rc.date });
  }
  return { clusters, disc, find };
};

// bindClaim(clusters, claimLabel, claimDisc) → the person a claim is ABOUT, or null. The
// answer is the CLAIM, not a pocket universe — so it is matched to a source person by
// name + its OTHER relationships (claimDisc EXCLUDES the office it is asserting), never
// forked from that person by the very office under test. Name-blocked; a candidate whose
// non-office discriminators CONFLICT is dropped (a different person of the same name);
// among the rest the most-converged wins, and a lone non-split candidate binds.
const bindClaim = (clusters, claimLabel, claimDisc) => {
  const cands = [];
  for (const [cid, e] of clusters) {
    if (![...e.names].some(n => shareName(n, claimLabel))) continue;
    const v = evaluateSameAs('claim', cid, {
      discriminatorsOf: (r) => (r === 'claim' ? claimDisc : e.disc), attributesConflict: officeConflict, minConvergence: 1,
    });
    if (v.verdict === 'split') continue;                       // a different person of the same name
    cands.push({ e, shared: v.shared.length, promote: v.verdict === 'promote' });
  }
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0].e;                   // a lone, non-conflicting same-name person
  cands.sort((a, b) => (b.promote - a.promote) || (b.shared - a.shared));
  return (cands[0].promote || cands[0].shared) ? cands[0].e : null;   // else need evidence to disambiguate
};

const cite = (c) => (c && c.sentIdx != null) ? `s${c.sentIdx}` : null;

// answerDefs(prose, doc, cursor) → the DEF propositions the ANSWER asserts, each as
// { value, surface, personKey, subj }. Read two ways and unioned, because the answer's
// subject can be either a figure the SOURCES admit (resolve it through the document
// field — the path that also binds a pronoun "he is the mayor" to the hottest source
// referent) OR a name the sources never admitted as that exact string ("Freddie
// O'Connell" when the corpus only ever wrote "Mayor O'Connell"). Parsing the answer as
// its own doc recovers the latter; the surname `personKey` is what reconciles the two
// to one person. Deduped by (person · value).
const answerDefs = (prose, doc, cursor) => {
  const rows = [];
  const add = (subj, value, surface, label) => {
    const pk = personKey(label || subj);
    rows.push({ subj, value: value || '', surface: surface || '', personKey: pk, label: label || subj });
  };
  for (const p of parseProps(prose, doc, cursor)) {
    if (p.kind === 'def') add(p.subj, p.attr?.value, p.surface, doc.admission.labelOf?.(p.subj));
  }
  // The answer parsed standalone — its own admission, so a named subject the corpus
  // never wrote verbatim still yields its DEF claim.
  try {
    const self = parseText(prose, { docId: 'answer' });
    for (const p of parseProps(prose, self, Infinity)) {
      if (p.kind === 'def') add(p.subj, p.attr?.value, p.surface, self.admission.labelOf?.(p.subj));
    }
  } catch { /* a malformed answer parse must never break the audit */ }
  const seen = new Set();
  return rows.filter(r => {
    const key = `${r.personKey || r.subj}::${lower(r.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// auditPropositions({ prose, doc, cursor }) → the per-proposition record + a
// flag-and-tell `fired` list for the surfacing layer.
//
//   verdicts  one row per DEF proposition the answer asserts: { subj, value, office,
//             verdict, reason, citation, supersededBy?, correction? }
//   superseded the rows whose role the sources have succeeded or marked former — the
//             actionable catch, also surfaced as `fired` (never refusing).
//   corrections short human strings ("the sources give O'Connell's current office as
//             mayor [s3]") for the answer's annotation.
//
// Edges (CON/SIG) are the edge channel's domain (correspond.js) and are not graded
// here — this is the DEF half, deliberately non-overlapping.
export const auditPropositions = ({ prose, doc, cursor = Infinity, now = null } = {}) => {
  const empty = { verdicts: [], superseded: [], corrected: [], weak: [], dated: [], corrections: [], fired: [], counts: { corroborated: 0, singleSource: 0, unsupported: 0, superseded: 0, stale: 0, placeMismatch: 0, dated: 0 } };
  if (!doc?.admission || !prose) return empty;
  const nowYear = yearOf(now);   // the surfer's clock — null leaves the date axis inert

  const { clusters } = personClusters(doc);
  // The answer's own relational discriminators, by subject — edges only, so the office a
  // claim asserts is naturally excluded; used to bind each claim to the RIGHT source
  // person (the claim is graded against that person, never forked from them by its office).
  const answerRel = [];
  try {
    const aDoc = parseText(prose, { docId: 'answer' });
    const lf = (id) => aDoc.admission?.labelOf?.(id) || id;
    for (const [r, m] of discriminatorIndex(projectGraph(aDoc.log, {}).edges || [], (x) => x, lf))
      answerRel.push({ label: lf(r), disc: m });
  } catch { /* binding falls back to name-only */ }
  const claimDiscOf = (claimLabel, place) => {
    const m = new Map();
    for (const { label: l, disc } of answerRel) if (shareName(l, claimLabel)) for (const [via, ts] of disc) { let s = m.get(via); if (!s) m.set(via, (s = new Set())); for (const t of ts) s.add(t); }
    if (place) { let s = m.get('jurisdiction'); if (!s) m.set('jurisdiction', (s = new Set())); s.add(place); }
    return m;
  };
  const verdicts = [];

  for (const claim of answerDefs(prose, doc, cursor)) {
    const { value, surface, subj } = claim;
    const office = readOffice(value);
    // IDENTITY — bind the claim to the source PERSON (pocket-universe cluster), by name +
    // the claim's other relationships, never by surname alone.
    const docFacts = office ? bindClaim(clusters, claim.label || subj, claimDiscOf(claim.label || subj, office.place)) : null;
    const label = (docFacts && shortestName(docFacts.names)) || claim.label || subj;

    // A NON-office predicate is outside this channel's reach (no exclusive-slot
    // semantics to grade it by) — recorded, unwitnessed, never fired.
    if (!office) {
      verdicts.push({ subj, value, office: null, verdict: 'unsupported', reason: 'no-office-claim', citation: null, surface });
      continue;
    }

    const assertedCurrent = !office.former && defTense(surface, value) === 'current';

    // SPACE — the answer binds the role to a jurisdiction the sources never bind it to.
    // A Nashville council membership is not a Salt Lake City one; "he was never a council
    // member in Salt Lake City" is a wrong-place claim even if the role name matches.
    // Compared across BOTH tenses for this person, so a misplaced role is caught however
    // the answer dates it. Only fires when both sides carry a proper place that disagree.
    if (office.place && docFacts) {
      const matched = [docFacts.current.get(office.head), docFacts.former.get(office.head)].filter(Boolean);
      const docPlaces = new Set(matched.flatMap(f => [...f.places]));
      if (docPlaces.size && !docPlaces.has(office.place)) {
        const where = [...docPlaces][0];
        const correction = `the sources place ${displayName(label)}'s ${office.head.replace(/-/g, ' ')} in ${titleCasePlace(where)}, not ${titleCasePlace(office.place)}`;
        verdicts.push({ subj, value, office: office.head, place: office.place, verdict: 'place-mismatch', reason: 'wrong-jurisdiction', citation: cite(matched[0]), docPlaces: [...docPlaces], correction, surface });
        continue;
      }
    }

    // Is this exact office currently witnessed for this person? Then it STANDS — but with
    // its corroboration weight: how many MEANINGFULLY-DIFFERENT sources back it. One
    // mention is `single-source` (a hedge, and the trigger to go seek a second); ≥2
    // independent, non-duplicate witnesses is `corroborated`. "Appears once" is reported
    // as exactly that, never laundered into a flat fact.
    if (docFacts?.current?.has(office.head)) {
      const f = docFacts.current.get(office.head);
      const support = meaningfulSupport(f.supports);
      // DATE — the freshest witness's year. If the surfer's clock says it predates now by
      // more than STALE_YEARS, the "current" claim is RE-DATED: current as of that year, not
      // assumed true now (a 2021 "is the mayor" read in 2026 is a 2021 fact). A hedge, not an
      // error — surfaced, never fired.
      const dates = f.supports.map(s => s.date).filter((y) => y != null);
      const asOf = dates.length ? Math.max(...dates) : null;
      const dated = nowYear != null && asOf != null && (nowYear - asOf) > STALE_YEARS;
      verdicts.push({ subj, value, office: office.head, verdict: 'corroborated', reason: 'office-current',
        support, weak: support < 2, dated, asOf, citation: cite(f), places: [...f.places], surface });
      continue;
    }

    // SUPERSEDED — the answer gives an exclusive office as current, but the sources
    // currently witness a DIFFERENT exclusive office for this person (and not this
    // one). The role has been succeeded. Consult the conflict oracle so the
    // one-at-a-time semantics live in the one injected place.
    if (office.exclusive && assertedCurrent && docFacts) {
      const succeededBy = [...docFacts.current.entries()]
        .filter(([head, c]) => c.exclusive && head !== office.head &&
          attributesConflict('office', office.head, head, { functional: true }).conflict)
        .map(([head, c]) => ({ head, citation: cite(c), value: c.value }));
      if (succeededBy.length) {
        const correction = `the sources give ${displayName(label)}'s current office as ${succeededBy[0].head.replace(/-/g, ' ')}${succeededBy[0].citation ? ` [${succeededBy[0].citation}]` : ''}, not ${office.head.replace(/-/g, ' ')}`;
        verdicts.push({ subj, value, office: office.head, verdict: 'superseded', reason: 'office-succeeded', citation: succeededBy[0].citation, supersededBy: succeededBy, correction, surface });
        continue;
      }
    }

    // STALE — the answer gives the office as current, but the sources mark THIS office
    // former (and never current): "is a council member" against "former council member".
    if (assertedCurrent && docFacts?.former?.has(office.head)) {
      const c = docFacts.former.get(office.head);
      const correction = `the sources mark ${displayName(label)} as a former ${office.head.replace(/-/g, ' ')}${cite(c) ? ` [${cite(c)}]` : ''}`;
      verdicts.push({ subj, value, office: office.head, verdict: 'stale', reason: 'office-former', citation: cite(c), correction, surface });
      continue;
    }

    verdicts.push({ subj, value, office: office.head, verdict: 'unsupported', reason: 'office-unwitnessed', citation: null, surface });
  }

  // The corrected claims (a role succeeded, marked former, or placed in the wrong
  // jurisdiction) — the actionable catches, surfaced as a non-refusing flag.
  const corrected = verdicts.filter(v => v.verdict === 'superseded' || v.verdict === 'stale' || v.verdict === 'place-mismatch');
  // The weakly-grounded claims — current, but resting on a SINGLE meaningful source. Not
  // an error; the signal that the system should seek a second, meaningfully-different
  // witness before stating it flatly (the user's "can't say it because it appears once").
  const weak = verdicts.filter(v => v.verdict === 'corroborated' && v.weak);
  // The dated claims — current per the sources, but the freshest witness predates now by
  // more than STALE_YEARS, so it is current AS OF its date, not asserted-now (the surfer's
  // clock at work). A hedge, like single-source — surfaced, not fired.
  const dated = verdicts.filter(v => v.verdict === 'corroborated' && v.dated);
  const counts = {
    corroborated: verdicts.filter(v => v.verdict === 'corroborated' && !v.weak).length,
    singleSource: weak.length,
    dated:        dated.length,
    unsupported:  verdicts.filter(v => v.verdict === 'unsupported').length,
    superseded:   verdicts.filter(v => v.verdict === 'superseded').length,
    stale:        verdicts.filter(v => v.verdict === 'stale').length,
    placeMismatch: verdicts.filter(v => v.verdict === 'place-mismatch').length,
  };
  const corrections = corrected.map(v => v.correction).filter(Boolean);
  const fired = corrected.length ? [{
    id: 'proposition-superseded', refuses: false,
    message: corrections.length ? corrections.join('; ') : 'The answer asserts a status the sources do not bear out.',
    corrections,
  }] : [];

  // `superseded` kept for back-compat (the prior field name); `corrected` is the wider set.
  return { verdicts, superseded: corrected, corrected, weak, dated, corrections, fired, counts };
};

// Re-title a lowercased place for a correction string ("salt lake city" → "Salt Lake City").
const titleCasePlace = (p) => String(p || '').replace(/\b([a-z])/g, (_, c) => c.toUpperCase());

// A label rendered back for a correction string: the surface label with its noise
// words kept (it reads as written), trimmed of a leading article.
const displayName = (label) => String(label || '').replace(/^(the|a|an)\s+/i, '').trim() || String(label || '');

// The shortest BARE name among a cluster's surface labels (office words stripped) — so a
// correction names the person ("O'Connell"), not a title-laden form ("Mayor Freddie O'Connell").
const shortestName = (names) => {
  let best = null;
  for (const n of names || []) {
    const bare = displayName(String(n).replace(new RegExp(`\\b(${[...ALL_OFFICE_TOKENS].join('|')})\\b`, 'gi'), '').replace(/\s+/g, ' ').trim());
    if (bare && (!best || bare.length < best.length)) best = bare;
  }
  return best;
};
