// EO: CON·EVA(Field,Link,Network → Link,Lens, Binding,Tracing) — edge-grounding veto / fact-checker
// The edge-grounding veto — the fact-checker. A correspondence between two
// readings (§1), never a claim against truth.
//
// The shape: translate the talker's output into EO notation and compare it
// against the graph. Parse the talker's prose into propositions, type each one
// the way the page is typed, and check each claimed edge against the document
// reading the fold built. A claimed edge with no corresponding document edge is
// unbound in the LINK sense, the way an uncited claim is unbound in the NODE
// sense — this is the veto the invented-location claim slipped past, because the
// node-grounding check looked at nodes and the lie was shaped like a link.
//
// Both sides are Meant. The graph is the document reading, defeasible, folded to
// a cursor; the talker's parsed edge is a reading of the talker's own prose. So
// a mismatch does not mean the talker lied about the world — it means the talker
// asserted a relation the document reading does not contain. That is the right
// thing to catch, and it is all the check can honestly claim to catch (§10): it
// makes the talker faithful to the graph, not the graph faithful to the world.
//
// The check REUSES three organs already built — the SVO clause parser, the
// document referent table, the centroid classifier — and adds the five-way
// verdict and the geometric relation comparison.

import { segmentSentences }       from '../../perceiver/parse/index.js';
import { parseRelations, headVerb } from '../../perceiver/parse/index.js';
import { clauseForVerb }           from '../../perceiver/parse/index.js';
import { checkRelationConflict, checkObjectFunctionalConflict, checkRelationAgree, typeOf } from '../../core/index.js';
import { coherence, terrainInfo, canWitness }  from '../../core/index.js';
import { operatorsByDomain }       from '../../core/index.js';

// The verdict vocabulary lives in core (a leaf both factcheck and read import down
// into — see core/verdicts.js). Re-exported here so the holon's public surface
// (factcheck/index.js → VERDICTS) is unchanged.
import { VERDICTS } from '../../core/index.js';
export { VERDICTS };

const GAMMA = 0.7;   // the same γ kernel the graph and the field run on

// The refusal floor for a symbolic contradiction. A contradiction carries a
// `confidence` — the joint typing prior of the two relations (read/relation-
// types.js) — and a HARD, libel-grade refusal is reserved for the confident
// ones. A contradiction below the floor is real but rests on a weakly-typed
// relation, so it is surfaced as a flag for a human rather than used to refuse.
// The floor sits below every current symbolic axiom (kin/spouse joints are
// 0.81–0.90), so it changes nothing today and arms the gate for lower-prior
// relations added later. A verdict with no confidence (the geometric VOID path,
// or a synthetic verdict) is treated as certain — the geometric path is already
// gated by the embedder, so its contradictions are not the weakly-typed kind.
export const CONTRADICTION_REFUSE_FLOOR = 0.5;

// Does this verdict clear the bar for a hard refusal? The likelihood gate that
// replaces the old boolean: contradicted AND confident enough.
export const contradictionRefuses = (v) =>
  v?.verdict === VERDICTS.CONTRADICTED && (v.confidence ?? 1) >= CONTRADICTION_REFUSE_FLOOR;

// Reconstruct the DOCUMENT referent field at a cursor from the page's own
// mention positions (`admission.mentions`: id → sentence indices), decayed by γ.
// This is the binding of record for a talker claim's endpoints (§5): the SYN
// built from the page, by document-side evidence only. A leading pronoun in a
// talker claim resolves to the hottest DOCUMENT referent here — never to
// whatever the talker might have meant. The talker does not get to tell the
// fact-checker who it is talking about.
export const documentFieldAt = (doc, cursor = Infinity, gamma = GAMMA) => {
  const mentions = doc?.mentions || new Map();
  const c = (cursor == null || !isFinite(cursor)) ? Infinity : cursor;
  const cands = [];
  for (const [id, idxs] of mentions) {
    let mass = 0;
    for (const i of idxs) mass += Math.pow(gamma, isFinite(c) ? Math.abs(c - i) : 0);
    if (mass > 0) cands.push({ id, mass });
  }
  const Z = cands.reduce((s, x) => s + x.mass, 0) || 1;
  for (const x of cands) x.w = x.mass / Z;
  cands.sort((a, b) => b.w - a.w);
  return cands.map(({ id, w }) => ({ id, w }));
};

// Does this talker sentence ASSERT a relation? A name-led clause with a head
// verb that is not a copula. Used only to decide whether a sentence that yielded
// no resolved edge is a relational claim we couldn't ground (→ indeterminate,
// held) rather than a non-claim. Reuses the page's own head-verb scan.
const looksRelational = (sentence) => {
  const m = String(sentence).match(/^\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b([\s\S]*)$/);
  if (!m) return false;
  const head = headVerb(m[2]);
  return !!head && !head.copular;
};

// Parse the talker's prose into claimed edges, RESOLVED THROUGH THE DOCUMENT
// referent table (§2.1–2.2, §5). We reuse parseRelations — the same SVO clause
// parser that reads the page — but hand it the DOCUMENT's admission and a coref
// whose field is the document field reconstructed above. The talker supplies the
// string; the document decides who the string is about. The talker's own
// coreference is never consulted: there is no talker-coref object in scope here,
// the way a talker event is structurally uncitable — the firewall is the wiring,
// not a remembered rule.
//
// Two-endpoint relations (CON bond, SIG attribution) are the link-shaped claims
// this veto exists for; a DEF predicate is node-shaped and belongs to the
// existing node-grounding citation path. A relational sentence whose endpoints
// do not both anchor is returned UNRESOLVED, so the verdict holds it rather than
// silently dropping it.
// The equative / possessive copula → a CON edge — the EOT-comparison gap. "Gregor's sister is
// Grete", "Grete is Gregor's sister", "Grete is the sister of Gregor" are RELATIONAL claims
// wearing a copula: parseRelations flattens them to a node-shaped DEF (relations.js copular
// branch), so the edge-grounding check never sees them and a correct kinship answer reads as
// unbound. Recover the edge HERE, on the TALKER-claim side only — the document parse is untouched
// (its naming path already logs these kinship edges). When one side names an admitted referent
// and the other is "OWNER's REL" / "the REL of OWNER" with OWNER admitted and REL a relation the
// algebra types, emit OWNER -> NAME : REL: the same owner→named, via=relnoun shape the page logs,
// so checkRelationAgree matches it against the document edge. Conservative by construction — both
// endpoints must resolve to admitted ids and the relation must type, so it never manufactures an
// edge from prose the document does not ground.
const POSS = /^(?:the\s+)?(.+?)['’]s\s+([a-z]+)$/i;          // "Gregor's sister"
const REL_OF = /^(?:the\s+)?([a-z]+)\s+of\s+(.+?)$/i;        // "the sister of Gregor"
const COPULA_SPLIT = /^(.*?)\s+\b(?:is|was|are|were)\b\s+(.*)$/i;
const cleanPhrase = (p) => String(p || '').trim().replace(/[.?!,;:]+$/, '').trim();

const ownerEpithet = (phrase, admission) => {
  const s = cleanPhrase(phrase);
  let owner = null, rel = null;
  let m = s.match(POSS);
  if (m) { owner = cleanPhrase(m[1]); rel = m[2].toLowerCase(); }
  else { m = s.match(REL_OF); if (m) { rel = m[1].toLowerCase(); owner = cleanPhrase(m[2]); } }
  if (!owner || !rel || !typeOf(rel)) return null;            // only relations the algebra knows
  const ownerId = admission.idOf?.(owner);
  return ownerId ? { ownerId, rel } : null;
};

export const equativeKinEdges = (prose, admission) => {
  if (!admission?.idOf) return [];
  const out = [];
  for (const sentence of segmentSentences(prose)) {
    const m = sentence.match(COPULA_SPLIT);
    if (!m) continue;
    const left = cleanPhrase(m[1]), right = cleanPhrase(m[2]);
    const nameId = (p) => admission.idOf?.(cleanPhrase(p)) || null;
    // Try both arrangements: "OWNER's REL is NAME" and "NAME is OWNER's REL".
    let owner = ownerEpithet(left, admission), name = nameId(right);
    if (!(owner && name)) { owner = ownerEpithet(right, admission); name = nameId(left); }
    if (owner && name && owner.ownerId !== name) {
      out.push({ sentence, op: 'CON', src: owner.ownerId, tgt: name, via: owner.rel, resolved: true, equative: true });
    }
  }
  return out;
};

export const claimedEdges = ({ prose, doc, cursor = Infinity, referents = false }) => {
  const admission = doc?.admission;
  if (!admission) return [];
  const isSpeech = doc?.conventions?.isAttributionVerb
    ? (v) => doc.conventions.isAttributionVerb(v)
    : undefined;
  const field = documentFieldAt(doc, cursor);
  const coref = { field: () => field, resolve: () => field[0]?.id ?? null };

  // §4 — `referents` opens the NP object slot for the TALKER claim too, so a change-of-state
  // resultant that is a common noun ("…into a vermin") resolves as an endpoint, the way it
  // does on the page. OFF by default (the veto grounds against document figures only); the
  // §4 flag turns it on so the object-functional clash has an object to check.
  const relOpts = { ...(isSpeech ? { isSpeech } : {}), ...(referents ? { referents: true } : {}) };

  const out = [];
  for (const sentence of segmentSentences(prose)) {
    const rels  = parseRelations(sentence, admission, coref, relOpts);
    const edges = rels.filter(r => (r.op === 'CON' || r.op === 'SIG') && r.src && r.tgt);
    for (const e of edges) {
      out.push({ sentence, op: e.op, src: e.src, tgt: e.tgt, via: e.via || null, resolved: true });
    }
    if (edges.length === 0 && looksRelational(sentence)) {
      out.push({ sentence, op: null, src: null, tgt: null, via: null, resolved: false });
    }
  }
  // Equative kinship claims the copular branch flattened to a DEF never appear as a CON/SIG
  // edge above — recover them so the edge-grounding check can run on them.
  for (const e of equativeKinEdges(prose, admission)) {
    if (!out.some(x => x.resolved && x.src === e.src && x.tgt === e.tgt && x.via === e.via)) out.push(e);
  }
  return out;
};

// Type a relation to its Pattern cell. We pass BOTH the clause and the verb so
// the classifier can embed at whichever grain its centroids were built in (the
// verb doubles as the clause when no sentence is available, e.g. a bare void
// relation). Returns the cell key or null (no-commit / weak embedder).
//
// CLAUSE GRAIN (clause-layer.js) — the centroids are clause-grain ("the unit is the
// proposition", docs/phasepost.md), so we narrow a full-sentence argument to the CLAUSE
// carrying this verb before embedding. A compound sentence yielding two edges no longer
// types BOTH against the same sentence-wide text; each edge is measured against its own
// clause. A bare relation or a single-clause sentence is returned unchanged, so the
// query is never emptier than before.
const patternCell = async (classifier, clause, verb) => {
  const scoped = clauseForVerb(clause, verb);
  const p = await classifier.classify({ clause: scoped || verb || '', verb: verb || '' });
  return { live: !!p.live, cell: p.pattern?.cell || null };
};

const result = (verdict, extra = {}) => Object.freeze({ verdict, ...extra });

// An explicit VOID that DENIES this claim: a carved absence touching one of the
// claim's endpoints whose voided relation is the same or adjacent cell as the
// talker's relation — the talker asserting the very relation the document carved
// as absent ("Block by Block caused the fire" against a no-cause-named VOID).
// Needs the meaning reader on both the void's relation and the talker's; under
// the hash organ it cannot be measured, so contradiction (like every relational
// verdict) degrades to indeterminate — §4, §10.
const voidDenial = async ({ src, tgt, talkerCell }, { graph, classifier, adj }) => {
  const voids = graph?.voids || [];
  if (!voids.length || !adj?.adjacent) return null;
  const rep = graph?.representative || ((id) => id);
  for (const v of voids) {
    if (v.kind === 'same_as?') continue;            // an IDENTITY void is not a fact-relation void — it holds open
                                                    // who two names are, not what a relation denies (asterisk.js)
    const node = rep(v.node);
    if (node !== src && node !== tgt) continue;     // the void must touch an endpoint
    if (!v.rel) continue;                           // a void with no relation can't be compared
    const { cell: voidCell } = await patternCell(classifier, v.rel, v.rel);
    if (!voidCell) continue;
    if (adj.adjacent(talkerCell, voidCell) === true) return v;
  }
  return null;
};

// Check ONE claimed edge against the document reading. The five verdicts, in
// precedence order so each absence is reported for what it is:
//
//   indeterminate  — endpoints won't resolve, OR the relation types to no-commit,
//                    OR the embedder cannot measure meaning. The check can't run;
//                    the claim is HELD, not passed on the talker's say-so.
//   contradicted   — a VOID (or an opposing edge) denies the claimed relation.
//                    Hard refusal. The libel-grade catch.
//   corroborated   — a document edge with the same endpoints and the same or
//                    adjacent Pattern cell. Stands, and EARNS that edge's
//                    citation (§7) — the same correspondence that vetoes an
//                    invented relation cites a real one.
//   unsupported    — endpoints resolve, relation types, and a same-endpoint
//                    document edge exists, but it does not correspond to the
//                    claimed relation. Material exists; it does not support.
//   silent         — endpoints resolve, relation types, but NOTHING connects
//                    them in the document reading at all — no candidate edge,
//                    of any relation. "No material", not "doesn't support"
//                    (core/resolution-face.js Generate×Ground vs Generate×Figure).
export const checkClaim = async (claim, { doc, graph, classifier, adjacency, changeOfState = false } = {}) => {
  if (!claim?.resolved) return result(VERDICTS.INDETERMINATE, { reason: 'unresolved-endpoints' });

  // The symbolic relation algebra runs BEFORE the classifier gate, because it is
  // embedder-free: a disjoint axiom (sister ⟂ mother on the same pair) or a
  // functional-slot clash is a verdict the geometry cannot see and should not
  // need to. So it fires even under the hash organ, where every geometric verdict
  // degrades to indeterminate. Untyped relations return null here and fall
  // through to the geometric path unchanged.
  const algebra = checkRelationConflict(graph, claim);
  if (algebra) return result(algebra.verdict, {
    reason: algebra.reason, citation: algebra.citation || null,
    confidence: algebra.confidence ?? null,   // the joint typing prior rides the verdict
  });

  // §4 — the OBJECT-functional (change-of-state) clash, behind the flag. Gregor (not the
  // father) underwent the transformation; a claim that a different undergoer reached the
  // same resultant is contradicted. Inert for every non-`becomes` relation, so the default
  // path (flag off) is byte-identical.
  if (changeOfState) {
    const cos = checkObjectFunctionalConflict(graph, claim);
    if (cos) return result(cos.verdict, {
      reason: cos.reason, citation: cos.citation || null, confidence: cos.confidence ?? null,
    });
  }

  // The symbolic CORROBORATION axiom — embedder-free, the mirror of the disjoint/functional
  // contradiction above. A same-pair (or symmetric-reverse) document edge of the SAME relation
  // primitive WITNESSES the claim, so it corroborates and earns that edge's citation even under
  // the hash organ. Runs AFTER the contradiction checks (a disjoint pair is a contradiction, not
  // agreement) and BEFORE the classifier gate (so a typed kinship claim never degrades to
  // indeterminate just because the meaning embedder is cold). Untyped relations return null and
  // fall through to the geometric path unchanged.
  const agree = checkRelationAgree(graph, claim);
  if (agree) return result(agree.verdict, {
    reason: agree.reason, citation: agree.citation || null,
    sentIdx: agree.sentIdx ?? null, confidence: agree.confidence ?? null,
  });

  if (!classifier)      return result(VERDICTS.INDETERMINATE, { reason: 'no-classifier' });

  const tp = await patternCell(classifier, claim.sentence, claim.via);
  if (!tp.live)  return result(VERDICTS.INDETERMINATE, { reason: 'weak-embedder' });
  if (!tp.cell)  return result(VERDICTS.INDETERMINATE, { reason: 'relation-no-commit' });
  const talkerCell = tp.cell;

  const adj = adjacency || classifier.adjacency;
  const rep = graph?.representative || ((id) => id);
  const src = rep(claim.src), tgt = rep(claim.tgt);

  // Contradiction first — the hard verdict dominates.
  const denied = await voidDenial({ src, tgt, talkerCell }, { graph, classifier, adj });
  if (denied) return result(VERDICTS.CONTRADICTED, { reason: 'voided', talkerCell, voided: denied });

  // Corroboration — same endpoints, same or adjacent Pattern cell. Both relations
  // are typed by the SAME classifier so the cosine is measured in one space.
  const candidates = (graph?.edges || []).filter(e => rep(e.from) === src && rep(e.to) === tgt);
  let couldType = false;
  for (const e of candidates) {
    const dp = await patternCell(classifier, doc?.sentences?.[e.sentIdx], e.via);
    if (!dp.cell) continue;
    couldType = true;
    if (adj?.adjacent?.(talkerCell, dp.cell) === true) {
      return result(VERDICTS.CORROBORATED, {
        reason: 'edge-corresponds', talkerCell, docCell: dp.cell,
        citation: e.sentIdx != null ? `s${e.sentIdx}` : null, sentIdx: e.sentIdx ?? null,
      });
    }
  }

  // A same-endpoint document edge exists but its relation could not be typed —
  // we cannot say corroborated OR contradicted, so we hold (§3 no-commit
  // discipline at the verdict).
  if (candidates.length && !couldType) return result(VERDICTS.INDETERMINATE, { reason: 'doc-relation-no-commit', talkerCell });

  // Endpoints resolve, relation types, but the document reading does not witness this
  // relation between them. Unwitnessed, not false. A same-endpoint edge that simply
  // doesn't correspond is UNSUPPORTED (material exists); no edge at all is SILENT.
  if (candidates.length) return result(VERDICTS.UNSUPPORTED, { reason: 'relation-not-corresponding', talkerCell });
  return result(VERDICTS.SILENT, { reason: 'no-edge', talkerCell });
};

// The grain of a claimed edge. A resolved relational claim — a bond (CON) or an
// attribution (SIG) between two specific figures — asserts a SPECIFIC link, so it is
// Figure-grain (the gravity-well cell). A type/class or recurrence claim would be
// Pattern and an ambient/tone claim Ground, but the SVO clause parser yields neither
// as an edge, so every resolved claimed edge types Figure here. The guard generalises
// the day a claim carries its own grain.
const claimGrain = (claim) =>
  (claim?.resolved && (claim.op === 'CON' || claim.op === 'SIG')) ? 'Figure' : null;

// The diagonal guard (P1) — the confabulation guard, made live. For each resolved
// claim, run the LANDED cube guard (core/cube.js `coherence`) on the claim's grain
// against the terrain the reading typed at the answer locus. We hand coherence an
// operator in the terrain's OWN domain, so domain agreement holds by construction and
// the only thing it adjudicates is GRAIN: a Figure claim at a Ground terrain (a Void,
// or a site/atmosphere locus) is off the Object diagonal — "do not apply a Figure fix
// to a Ground problem". A claim at a measured Void is the confabulation proper (the
// Making-at-Void shape, `void:true`); a Figure claim at any other Ground terrain is the
// softer grain over-read.
//
// This is GRAIN algebra, not meaning geometry — it needs no classifier, so unlike the
// four-way edge verdicts it fires even under the hash organ. A claim the document
// positively witnesses (corroborated) or denies (contradicted) is already adjudicated
// with a witness and is skipped; the guard speaks to the unwitnessed claim asserted
// where the reading found no ground for it. Inert when no terrain was measured.
//
// SCOPE — what this does NOT catch, and why it must stay that way. The claim space is
// currently EDGES-ONLY: the SVO parser yields entity-to-entity relations, and such an
// edge is Figure-grain by construction. A Ground-grain claim — a tone or atmospheric
// predication ("the statement is neutral"), a single-argument assertion — has no second
// entity and produces NO edge, so the guard never sees it. That is structural blindness,
// not a miss: there is nothing to test. Closing it needs the P2 CLAIM-GRAIN CHANNEL — a
// second extractor that reads the talker's NON-relational sentences and types their
// grain directly, not an addition to the relation typer. Until it lands, the guard
// covers Figure-at-Void (the hard confabulation, rightly closed first) and stays silent
// on Ground over-reads (the softer case).
//
// And a standing caveat for whoever builds that channel: a Ground claim at a Ground
// terrain — a tone claim at an Atmosphere — is ON the diagonal, grain-coherent, so the
// guard MUST NOT flag it. A "neutral tone" read over an evasive passage fails because it
// is FALSE (a correspondence verdict against the read tone), never because it is off-
// grain. Catching that is blocked on two stacked, still-unbuilt things: this claim-grain
// channel to SEE the claim, and an Atmosphere-reading pass to give it a terrain VALUE to
// judge against. Do not "fix" the guard to fire on a coherent Ground claim.
const diagonalGuard = (claims, terrain) => {
  const meta = terrainInfo(terrain);
  if (!meta) return [];
  // The first operator in the terrain's domain — a canonical, deterministic pick (stable
  // OPERATORS order), not arbitrary: any op in the domain satisfies the domain check by
  // construction, leaving grain as the sole live discriminator. That is the whole point.
  const op = operatorsByDomain(meta.domain)[0]?.id;
  if (!op) return [];
  const out = [];
  for (const c of claims) {
    if (c.verdict === VERDICTS.CORROBORATED || c.verdict === VERDICTS.CONTRADICTED) continue;
    const grain = claimGrain(c);
    if (!grain) continue;
    const v = coherence({ op, grain, terrain });   // op-domain == terrain-domain → grain is the sole discriminator
    if (!v.ok && /grain-mismatch|domain-mismatch/.test(v.reason || '')) {
      out.push(Object.freeze({
        sentence: c.sentence, src: c.src, tgt: c.tgt,
        verdict: VERDICTS.OFF_DIAGONAL, reason: v.reason,
        terrain, terrainGrain: meta.grain, claimGrain: grain,
        void: terrain === 'Void',
      }));
    }
  }
  return out;
};

// The whole fact-check over a talker turn. Returns the per-claim verdicts, the
// citations a corroborated claim earned (§7), and a battery-ready `fired` list
// plus `refuse` so the veto harness can surface the edge-grounding check beside
// the node-grounding one. The talker speaks the fold's arrows on the way out and
// is held to the fold's arrows on the way back — same object, two directions.
//
// `terrain` is the Site-face terrain the reading typed at the answer locus (Void /
// Atmosphere / Entity …); when present, the diagonal guard contributes OFF_DIAGONAL
// verdicts to `edgeVerdicts` alongside the four-way ones. Absent, the guard is inert.
export const factCheck = async ({ prose, doc, graph, classifier, adjacency, cursor = Infinity, terrain = null, changeOfState = false } = {}) => {
  const claims  = claimedEdges({ prose, doc, cursor, referents: changeOfState });
  // THE TYPE LAW AT THE WITNESS (core/provenance §8). Only an EXAFFERENT edge adjudicates a
  // claim — corroborates it, contradicts it, cites it. An ENACTOR-door edge (the reasoning
  // walk's committed reach, src/reason/walk.js) is reafference: it can ORIENT the turn but
  // never witness the talker's claim as world. Without this split, the walk commits "A
  // employs B" and the talker voicing it back gets CORROBORATED against the walk's own
  // event — confabulation with perfect internal citations, the exact drift the door exists
  // to prevent. So adjudication runs on the witness view; a claim that matches only a
  // reafferent edge is annotated `reach: true` — the deliberate, marked reach the veto
  // battery surfaces as `marked-reach` instead of mislabelling it a grounding failure.
  // A prov-less edge (the parser's) classifies exafferent, so the default path — no walk
  // ran — is byte-identical: the witness view IS the graph.
  const reafferent = (graph?.edges || []).filter(e => !canWitness(e.prov ?? null));
  const witnessed  = reafferent.length
    ? Object.freeze({ ...graph, edges: Object.freeze((graph?.edges || []).filter(e => canWitness(e.prov ?? null))) })
    : graph;
  const rep = graph?.representative || ((id) => id);
  const reaches = (claim) => claim.resolved && reafferent.some(e => {
    const f = rep(e.from), o = rep(e.to), s = rep(claim.src), t = rep(claim.tgt);
    return (f === s && o === t) || (f === t && o === s);
  });
  const checked = [];
  for (const claim of claims) {
    const v = await checkClaim(claim, { doc, graph: witnessed, classifier, adjacency, changeOfState });
    checked.push(Object.freeze({ ...claim, ...v, ...(reaches(claim) ? { reach: true } : {}) }));
  }

  const counts = {
    corroborated:  checked.filter(c => c.verdict === VERDICTS.CORROBORATED).length,
    unsupported:   checked.filter(c => c.verdict === VERDICTS.UNSUPPORTED).length,
    contradicted:  checked.filter(c => c.verdict === VERDICTS.CONTRADICTED).length,
    indeterminate: checked.filter(c => c.verdict === VERDICTS.INDETERMINATE).length,
    silent:        checked.filter(c => c.verdict === VERDICTS.SILENT).length,
  };
  // The contradiction veto is a likelihood gate, not a boolean: a contradiction
  // refuses only when its joint typing confidence clears the floor. A contradiction
  // that exists but stays under the floor is held back as a flag — reported,
  // human-checkable, not used to hard-refuse.
  const refusing = checked.some(contradictionRefuses);
  const weakContra = counts.contradicted > 0 && !refusing;

  const fired = [];
  if (refusing)            fired.push({ id: 'edge-contradicted',      refuses: true,  message: 'A claimed relation is denied by the document reading.' });
  else if (weakContra)     fired.push({ id: 'edge-contradicted-weak', refuses: false, message: 'A claimed relation conflicts with the document reading, but the relation typing is too uncertain to refuse on.' });
  // A claim that matches only the walk's own committed reach is a correctly MARKED ungrounded
  // emission, not a grounding failure — bind-or-mark, not bind-or-veto. The plain unsupported
  // flag keeps to claims with no walk step behind them. SILENT joins UNSUPPORTED here — both
  // mean "the document does not witness this."
  const unsupportedPlain = checked.filter(c => (c.verdict === VERDICTS.UNSUPPORTED || c.verdict === VERDICTS.SILENT) && !c.reach).length;
  if (unsupportedPlain)    fired.push({ id: 'edge-unsupported',       refuses: false, message: 'A claimed relation has no witness in the document reading.' });
  if (checked.some(c => c.reach)) fired.push({ id: 'marked-reach', refuses: false, message: 'A claim rests on the reading’s own reasoning — a deliberate inference past the text, marked as such, never attested by the document.' });

  // The diagonal guard's off-diagonal verdicts ride in `edgeVerdicts` beside the
  // five-way ones; the veto battery reads them by `verdict:'off_diagonal'`.
  const offDiagonal = diagonalGuard(checked, terrain);

  return Object.freeze({
    claims: Object.freeze(checked),
    // The flat per-claim verdict list the veto battery reads (`ctx.edgeVerdicts`).
    edgeVerdicts: Object.freeze([
      ...checked.map(c => Object.freeze({
        sentence: c.sentence, src: c.src, tgt: c.tgt,
        verdict: c.verdict, reason: c.reason, citation: c.citation || null,
        confidence: c.confidence ?? null,   // the likelihood the gate reads downstream
        ...(c.reach ? { reach: true } : {}),   // traces to a walk step — marked, not mislabelled
      })),
      ...offDiagonal,
    ]),
    citations: Object.freeze(checked.filter(c => c.verdict === VERDICTS.CORROBORATED && c.citation).map(c => c.citation)),
    counts: Object.freeze({ ...counts, offDiagonal: offDiagonal.length }),
    offDiagonal: Object.freeze(offDiagonal),
    fired,
    refuse: refusing,
  });
};
