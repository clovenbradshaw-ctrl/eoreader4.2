// EO: INS·SYN·EVA·DEF(Void → Entity,Network, Composing) — a referent pointed at without a name
// A REFERENT IS NEVER IN THE TEXT. It is a centre of mass the mind mints to point at something out
// there; every surface — name, definite description, pronoun — is one of its MANIFESTATIONS, none
// privileged. There is no "light" referent (with a name) and no "dark" one (without): every referent
// is pointed at, and a name is merely the brightest handle one may wear.
// The capital scanner (entities.js) and the uncased read (uncased.js) are conveniences that anchor
// on that bright handle because it is cheapest. When a figure wears none — Frankenstein's *creature*
// is only ever "the creature", "the monster", "the wretch" and a hail of pronouns — the convenience
// finds nothing, yet the referent is as present as any named one. This leaf finds that SAME centre
// by the only manifestations it has: the descriptions and pronouns that point at it.
//
// You read it off the orbits it bends: a description the text keeps RETURNING to, standing where an
// AGENT stands (a subject that ACTS — "the creature stretched"), carrying real mass. That is the
// ordinary signature of a referent (recurrence × agency), the same read entities.js/grain.js run,
// with no name at its centre. It is the SETTING's opposite: "the room" recurs too but is moved
// THROUGH — oblique, never acting — so the figure test (subject-dominant) separates the creature
// from the room. An elided adjective ("the old") is refused outright (modifier-law.js). And where a
// description already orbits a NAMED centre it is that centre's — in *Metamorphosis* "the creature" IS Gregor.
//
// MECHANICAL AND MODELLESS, like every leaf here: it names the body by its own dominant description
// ("the creature"). Whether "the monster" and "the wretch" are the SAME body is world knowledge the
// mechanics abstain on — `nameReferent` (the injected hook, ideally the talker) MAY rename/merge
// before admission. Mechanics propose; the hook disposes — the coref-as-proposal discipline.

import { VERDICTS } from '../../core/index.js';
import { censusModifiers } from './modifier-law.js';
import { segmentClauses } from './clauses.js';

// The determiner that fronts a definite/indefinite description. Sentence-initial "The" is caught
// by allowing the leading capital; the HEAD stays strictly lowercase so a proper name ("the White
// House") is never mistaken for a description.
const DET = String.raw`(?:[Tt]he|[Aa]n?)`;
// modifiers: up to three lowercase adjectives between the determiner and the head noun.
const MODS = String.raw`(?:[a-z][a-z'’-]+\s+){0,3}`;
const HEAD = String.raw`([a-z][a-z'’-]{2,})`;
const DESC_RE = new RegExp(String.raw`\b${DET}\s+${MODS}?${HEAD}\b`, 'g');

// Heads that recur yet name no referent — the same inhibitor entities.js's common-noun catalyst
// carries, kept here so a description built on one ("the same", "the way") never reacts into a
// body. The language-specific classes (function / starter / role / calendar / demonym) are read
// from the conventions ledger; only these purely abstract heads are held locally.
const ABSTRACT_HEADS = new Set(['way', 'time', 'thing', 'matter', 'fact', 'case', 'point', 'kind',
  'sort', 'moment', 'sense', 'part', 'whole', 'same', 'other', 'first', 'last', 'rest', 'one',
  'day', 'night', 'morning', 'evening', 'while', 'end', 'side', 'reason', 'idea', 'word', 'name',
  'sake', 'use', 'need', 'place', 'world', 'life', 'people', 'man', 'woman', 'men', 'women']);

// A content head — an open-class word (a verb/noun, not a function word) — so a description
// followed by one stands where an agent's verb stands ("the creature STRETCHED"). Lowercase-
// initial of any script, mirroring entities.js's own `isContent`.
const isContent = (w, C) => !!w && /^\p{Ll}[\p{Ll}'’]*$/u.test(w) && w.length >= 2 && !C.isFunction(w);

// A stable id from a label — lowercased, spaces → hyphens, letters/numbers of any script kept.
// The same normalisation entities.js's `idFor` uses, so an unnamed referent's id is minted exactly
// like a named one's and the projection treats it identically.
const idFor = (label) =>
  label.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '');

// Approximate singularisation so "the creatures"/"the creature" fold onto one head. Deliberately
// timid — plain trailing -s only, never -es/-ies (which mangle more than they help) — because an
// over-eager stemmer merges distinct heads, the error this read most wants to avoid.
const singular = (h) => (h.length > 4 && h.endsWith('s') && !h.endsWith('ss')) ? h.slice(0, -1) : h;

// ── The gravitational census: which "the X" heads are BODIES the reading can point at ──────────
// A referent is weighed by the bound orbit it captures, not its own light. Two measurements decide
// whether a recurring description head is a body worth tracking (docs/unnamed-referents-relativistic.md):
//   REST MASS   — head-dominance = asHead / (asHead + attrib), where `attrib` counts the head standing
//                 BEFORE another content word in a "the …" run ("the great house") and `asHead` counts
//                 it ending the run ("the creature"). A substantivized adjective ("the great") is
//                 attributive even when it heads an elided NP, so it sits LOW; a figure-noun sits high.
//                 This is the adjective filter the modifier law misses when prose substantivizes freely.
//   LUMINOSITY  — animacy = the rate at which the head co-occurs with a personal pronoun (he/she/him/
//                 her). A FIGURE binds animate satellites; a SETTING ("the sea", "the door") is a dark
//                 medium pronouns fly through. This is the one thing rest-mass and raw mass cannot tell
//                 apart, and the reason a crude mass gate was the only thing that ever worked.
// Plus AGENCY (subject-dominant — it ACTS) and RECURRENCE. No star-scale gate here: a body's mass is
// often SCATTERED across epithets (creature/monster/wretch), so admission is decided later, on the
// POOLED virial mass, against a born/null floor — never per-head against the top name.
const PERSONAL_PRONOUN = /\b(?:he|him|his|she|her|hers|himself|herself)\b/i;
const RUN_RE = new RegExp(String.raw`\b(?:[Tt]he|[Aa]n?)\s+((?:[a-z][a-z'’-]+\s+){0,4}[a-z][a-z'’-]{2,})\b`, 'g');
export const censusUnnamedCentres = (sentences, { conventions,
  minSightings = 3, minAgency = 2, restMassFloor = 0.35, luminosityFloor = 0.5 } = {}) => {
  if (!Array.isArray(sentences) || !sentences.length) return new Map();
  const C = {
    isFunction:    (w) => conventions?.isFunction?.(w) ?? false,
    isStarter:     (w) => conventions?.isStarter?.(w) ?? false,
    isRole:        (w) => conventions?.isRole?.(w) ?? false,
    isCalendar:    (w) => conventions?.isCalendar?.(w) ?? false,
    isDemonym:     (w) => conventions?.isDemonym?.(w) ?? false,
    isPreposition: (w) => conventions?.isPreposition?.(w) ?? false,
  };
  const isModifierHead = censusModifiers(sentences, C);
  // A head that is really a NAME (lowercased) is dropped. Read the names off the document's own
  // casing law, not admission — so the census is admission-INDEPENDENT and runs up front (before the
  // main loop admits anyone), exactly as the uncased read discovers its figures up front. A NAME's
  // capital is INTRINSIC: it appears capital-initial MID-sentence ("met Victor"), where a mere
  // sentence-initial capital ("Wretch swore…") is positional — so "Wretch"/"Devil" stay candidates
  // while "Victor"/"Frankenstein" are excluded.
  const nameTokens = new Set();
  for (const sent of sentences) {
    const ws = String(sent).match(/[\p{L}'’]+/gu) || [];
    ws.forEach((w, i) => { if (i > 0 && /^\p{Lu}/u.test(w)) nameTokens.add(w.toLowerCase()); });
  }
  const excluded = (h) => h.length < 3 || C.isFunction(h) || C.isStarter(h) || C.isRole(h)
    || C.isCalendar(h) || C.isDemonym(h) || ABSTRACT_HEADS.has(h) || isModifierHead(h) || nameTokens.has(h);

  // Pass 1 — the dominance census (rest mass): attrib vs asHead over every "the …" run.
  const attrib = new Map(), asHead = new Map();
  for (const sent of sentences) {
    const s = String(sent); const re = new RegExp(RUN_RE.source, 'g'); let m;
    while ((m = re.exec(s)) !== null) {
      const ws = m[1].split(/\s+/).map((w) => singular(w.toLowerCase())).filter((w) => w.length >= 3 && !C.isFunction(w));
      for (let i = 0; i < ws.length; i++) (i < ws.length - 1 ? attrib : asHead).set(ws[i], ((i < ws.length - 1 ? attrib : asHead).get(ws[i]) || 0) + 1);
    }
  }
  const dominance = (h) => { const a = attrib.get(h) || 0, hd = asHead.get(h) || 0; return (a + hd) ? hd / (a + hd) : 0; };

  // Pass 2 — per-head sightings, agency, animacy, surfaces.
  const heads = new Map();
  sentences.forEach((sent, sentIdx) => {
    const s = String(sent); const re = new RegExp(DESC_RE.source, 'g'); let m;
    const near = s + ' ' + String(sentences[sentIdx + 1] || '');
    const animateHere = PERSONAL_PRONOUN.test(near);
    const seen = new Set();
    while ((m = re.exec(s)) !== null) {
      const raw = m[1], head = singular(raw.toLowerCase());
      if (excluded(head)) continue;
      const before = s.slice(0, m.index), after = s.slice(m.index + m[0].length);
      const prev = (before.match(/([\p{L}'’]+)\s*$/u) || [])[1];
      const next = (after.match(/^\s*([\p{L}'’]+)/u) || [])[1];
      let h = heads.get(head);
      if (!h) heads.set(head, h = { head, count: 0, subj: 0, obl: 0, animate: 0, appears: 0, mentions: new Set(), surfaces: new Map() });
      h.count++;
      h.mentions.add(sentIdx);
      const surface = m[0].replace(/^\s*[A-Z]/, (c) => c.toLowerCase()).replace(/\s+/g, ' ').trim();
      h.surfaces.set(surface, (h.surfaces.get(surface) || 0) + 1);
      if (isContent(next, C)) h.subj++;
      if (prev && C.isPreposition(prev.toLowerCase())) h.obl++;
      if (!seen.has(head)) { seen.add(head); h.appears++; if (animateHere) h.animate++; }
    }
  });

  // The bodies: recurring, agentive, with rest mass (a noun) and luminosity (binds animate satellites).
  const centres = new Map();   // head → { head, id, dominance, animacy, subj, obl, count, mentions, surfaces }
  for (const h of heads.values()) {
    const count = h.mentions.size;
    if (count < minSightings || h.subj < minAgency || h.subj <= h.obl) continue;
    const dom = dominance(h.head), anim = h.appears ? h.animate / h.appears : 0;
    if (dom < restMassFloor || anim < luminosityFloor) continue;
    const label = [...h.surfaces.entries()].sort((a, b) => b[1] - a[1] || (a[0].length - b[0].length) || (a[0] < b[0] ? -1 : 1))[0][0];
    centres.set(h.head, { head: h.head, id: idFor(label), label, dominance: dom, animacy: anim,
      subj: h.subj, obl: h.obl, count, mentions: [...h.mentions].sort((a, b) => a - b), surfaces: [...h.surfaces.keys()] });
  }
  return centres;
};

// discoverUnnamedReferents(sentences, opts) → proposal[]
//   Each proposal: { id, label, head, count, subj, obl, mass, mentions:[sentIdx], surfaces:[form] }
//   admission     the live entity admission (its counts/mentions give the named cast's mass, and
//                 its admitted names are excluded so a name is never re-read as a description).
//   conventions   the ledger the inhibitor classes are read from (function/starter/role/…).
//   minSightings  a body must recur at least this often (a one-off description is not a figure).
//   minAgency     subject-position sightings required — the figure test (it ACTS), not a setting.
//   massFraction  the unnamed body's count must reach this fraction of the top named referent's, so
//                 only a STAR-SCALE nameless mass is inferred (the "a name should be here" gate).
export const discoverUnnamedReferents = (sentences, {
  admission, conventions,
  minSightings = 3, minAgency = 2, massFraction = 0.5,
} = {}) => {
  if (!admission || !Array.isArray(sentences) || !sentences.length) return [];
  const C = {
    isFunction:    (w) => conventions?.isFunction?.(w) ?? false,
    isStarter:     (w) => conventions?.isStarter?.(w) ?? false,
    isRole:        (w) => conventions?.isRole?.(w) ?? false,
    isCalendar:    (w) => conventions?.isCalendar?.(w) ?? false,
    isDemonym:     (w) => conventions?.isDemonym?.(w) ?? false,
    isPreposition: (w) => conventions?.isPreposition?.(w) ?? false,
  };
  const isModifierHead = censusModifiers(sentences, C);   // an elided adjective ("the old") is no body (modifier-law.js)

  // The named cast's mass — the top merged referent's sighting count. An unnamed body is measured
  // against this: it must rival a real name, not merely recur. Read off the admission's own
  // mention stream (post-merge), so an aliased name ("Victor"/"Frankenstein") counts once.
  let topNamed = 0;
  for (const arr of (admission.mentions?.values?.() || []))
    topNamed = Math.max(topNamed, new Set(arr).size);
  // Every token any admitted NAME wears — a head that is really a name (lowercased by the scan)
  // is dropped, so a description is never a name in disguise.
  const nameTokens = new Set();
  for (const label of (admission.admitted?.keys?.() || []))
    for (const t of String(label).toLowerCase().split(/\s+/)) if (t) nameTokens.add(t);

  const heads = new Map();   // head → { head, count, subj, obl, mentions:Set, surfaces:Map }
  sentences.forEach((sent, sentIdx) => {
    const s = String(sent);
    const re = new RegExp(DESC_RE.source, 'g');
    let m;
    while ((m = re.exec(s)) !== null) {
      const raw = m[1];
      const head = singular(raw.toLowerCase());
      if (head.length < 3) continue;
      if (C.isFunction(head) || C.isStarter(head) || C.isRole(head)
          || C.isCalendar(head) || C.isDemonym(head) || ABSTRACT_HEADS.has(head)) continue;
      if (isModifierHead(head)) continue;   // an elided adjective ("the old"), not a body — the modifier law
      if (nameTokens.has(head) || nameTokens.has(raw.toLowerCase())) continue;
      const headStart = m.index + m[0].length - raw.length;
      const before = s.slice(0, m.index);
      const after  = s.slice(m.index + m[0].length);
      // the word BEFORE the determiner (an adposition here → the description is oblique, a
      // setting), and the word AFTER the head (a content verb → it acts, a figure).
      const prev = (before.match(/([\p{L}'’]+)\s*$/u) || [])[1];
      const next = (after.match(/^\s*([\p{L}'’]+)/u) || [])[1];
      let h = heads.get(head);
      if (!h) heads.set(head, h = { head, count: 0, subj: 0, obl: 0, mentions: new Set(), surfaces: new Map() });
      h.count++;
      h.mentions.add(sentIdx);
      const surface = m[0].replace(/^\s*[A-Z]/, (c) => c.toLowerCase()).replace(/\s+/g, ' ').trim();
      h.surfaces.set(surface, (h.surfaces.get(surface) || 0) + 1);
      if (isContent(next, C)) h.subj++;
      if (prev && C.isPreposition(prev.toLowerCase())) h.obl++;
    }
  });

  const massFloor = Math.max(minSightings, Math.ceil(massFraction * topNamed));
  const out = [];
  for (const h of heads.values()) {
    const count = h.mentions.size;                 // distinct sentences (one body per sentence)
    if (count < minSightings) continue;
    if (count < massFloor) continue;               // not star-scale — a name would have been given
    // the figure test (grain.js): subject-dominant → it ACTS; oblique-dominant → a setting, held.
    if (h.subj < minAgency || h.subj <= h.obl) continue;
    // the label is the body's own dominant description — the most-sighted surface form.
    const label = [...h.surfaces.entries()].sort((a, b) => b[1] - a[1]
      || (a[0].length - b[0].length) || (a[0] < b[0] ? -1 : 1))[0][0];
    out.push({
      id: idFor(label), label, head: h.head, count, subj: h.subj, obl: h.obl,
      mass: count, mentions: [...h.mentions].sort((a, b) => a - b),
      surfaces: [...h.surfaces.keys()],
    });
  }
  // the heaviest body first — the referent the name scan could not anchor.
  out.sort((a, b) => b.mass - a.mass || b.subj - a.subj || (a.label < b.label ? -1 : 1));
  return out;
};

export { idFor as unnamedReferentId };

// ── The centre scanner — relativistic admission of an unnamed referent DURING the main pass ──────
// The census (above) proposes the candidate BODIES up front. This scanner puts them into the reading
// as first-class coreference candidates, so the SAME machinery a named figure rides — the activation
// field, the gendered pronoun binding — resolves them too. That is the whole correction
// (docs/unnamed-referents-relativistic.md): reference is RELATIVISTIC, so an epithet binds relative
// to its LOCAL FRAME, and the frame is the PROPOSITION, not the sentence. A sentence may hold two
// agents ("Victor fled, but the creature stretched out its hand"); the "its" belongs to the
// creature's clause, zero propositions away, and to Victor's clause one away — so the field is read
// and deposited at PROPOSITION grain: sentIdx + (clause ordinal / clause count), a fractional
// position the γ kernel (a numeric distance) carries without change.
//
// When "the creature" first acts, no compatible centre is the local sun, so it OPENS a body; the
// following "it"/"he" then bind to it through the field; when "the wretch" acts and that body is the
// LOCAL SUN of its proposition — it dominates the full field (names included) — the epithet MERGES
// into it, its mass adding at a shared barycenter. Where a NAME is the local sun instead
// (Metamorphosis: Gregor), no unnamed body opens — "the creature" is his.
//
// scan(sent, sentIdx, corefField) → [{ id, label, head, at }] : the bodies this sentence mentions as
// agents, each resolved to its (possibly merged) centre and tagged with its proposition position
// `at`. The caller admits + INS + notes each at `at`, so the field and the arrow of time carry them
// at proposition grain exactly like a scanned name.
export const createCentreScanner = (sentences, { admission, conventions } = {}) => {
  const centres = censusUnnamedCentres(sentences, { admission, conventions });
  if (!centres.size) return { active: false, centres, scan: () => [] };
  const C = { isFunction: (w) => conventions?.isFunction?.(w) ?? false };
  const centreOf = new Map();   // head → the live centre id it belongs to (merge mutates this)
  const labelOf  = new Map();   // centre id → its canonical (dominant-epithet) label
  const live     = new Set();   // centre ids that have opened (are candidates in the field)
  for (const c of centres.values()) { centreOf.set(c.head, c.id); labelOf.set(c.id, c.label); }
  const scan = (sent, sentIdx, corefField) => {
    const clauses = segmentClauses(sent);
    const spans = clauses.length ? clauses : [{ text: String(sent), start: 0 }];
    const out = []; const seen = new Set();
    spans.forEach((clause, k) => {
      const at = sentIdx + (spans.length > 1 ? k / spans.length : 0);   // PROPOSITION-grain position
      const s = String(clause.text || ''); const re = new RegExp(DESC_RE.source, 'g'); let m;
      while ((m = re.exec(s)) !== null) {
        const head = singular(m[1].toLowerCase());
        if (!centres.has(head) || seen.has(head)) continue;
        seen.add(head);
        const after = s.slice(m.index + m[0].length);
        const next = (after.match(/^\s*([\p{L}'’]+)/u) || [])[1];
        if (!isContent(next, C)) continue;   // only an AGENT mention seats the body (it acts here)
        let id = centreOf.get(head);
        // relativistic merge: if a DIFFERENT already-open body is the LOCAL SUN of THIS proposition
        // (top of the full field, names included, read at `at`), the epithet is that body under
        // another description — bind to it, its mass adding at the shared barycenter.
        const top = (corefField?.field?.(at) || [])[0];
        if (top && live.has(top.id) && top.id !== id && (top.w ?? 0) >= 0.34) {
          id = top.id; centreOf.set(head, id);
        }
        live.add(id);
        out.push({ id, label: labelOf.get(id) || centres.get(head).label, head, at });
      }
    });
    return out;
  };
  return { active: true, centres, scan };
};

// ── The coreference fold — many descriptions, one nameless body ─────────────
// The mechanics find each recurring nameless description on its own ("the creature", "the
// wretch", "the monster"). Whether they are ONE body is world knowledge the read abstains on —
// deferred to `nameReferent` when a talker is present. Absent one, the DEFAULT reading folds
// every surviving unnamed body onto the HEAVIEST: a document almost never carries two nameless
// star-scale protagonists, so "the wretch" is the creature under another description. The one
// refusal keeps the honest case apart — two descriptions that each stand as a SUBJECT (the head
// immediately followed by a content word) in the SAME sentence are two figures on stage at once
// ("the plaintiff alleges … the defendant denies"), and are left as distinct bodies. The fold is
// PROPOSED here; admitUnnamedReferents commits it as a DEFEASIBLE SYN, overturnable like a surname.
// The word after a description that is NOT its verb — a particle ("drove the wretch AWAY"), a
// preposition ("the creature IN the woods"), or a bleached adverb/connector. A follower in this
// class means the description did not ACT there, so it does not witness two figures on stage.
const NOT_PREDICATE = new Set([
  'away', 'out', 'off', 'up', 'down', 'back', 'aside', 'apart', 'along', 'ahead', 'forward',
  'onward', 'around', 'about', 'over', 'through', 'aboard', 'overboard', 'here', 'there',
  'to', 'into', 'onto', 'of', 'in', 'on', 'at', 'from', 'with', 'for', 'by', 'as', 'than',
  'toward', 'towards', 'upon', 'within', 'against', 'near', 'past', 'after', 'before', 'until',
  'then', 'again', 'too', 'also', 'once', 'soon', 'later', 'now', 'and', 'or', 'but', 'so', 'yet', 'nor',
]);
const bothActInOneSentence = (sentences, headA, headB, C) => {
  const subjRe = (h) => new RegExp(String.raw`\b${DET}\s+${MODS}?${h}\b\s+([\p{L}'’]+)`, 'u');
  const reA = subjRe(headA), reB = subjRe(headB);
  const acted = (m) => m && isContent(m[1], C) && !NOT_PREDICATE.has(m[1].toLowerCase());
  for (const s of sentences) {
    const str = String(s);
    if (acted(reA.exec(str)) && acted(reB.exec(str))) return true;   // both acted here → distinct
  }
  return false;
};

// foldUnnamedReferents(proposals, sentences, C) → proposals
//   The heaviest body absorbs each other body it does not co-act with; each absorbed body rides
//   on as a `mergedFrom` alias (carrying its head, so its description surface can be registered),
//   and the survivor's mentions are the union. A genuinely distinct nameless figure (the co-actor)
//   is kept as its own body. Idempotent-shaped: with 0/1 proposals, or no fold, the input stands.
export const foldUnnamedReferents = (proposals, sentences = [], C = { isFunction: () => false }) => {
  if (!Array.isArray(proposals) || proposals.length < 2) return proposals;
  const sorted = [...proposals].sort((a, b) => (b.mass || 0) - (a.mass || 0) || (a.label < b.label ? -1 : 1));
  const primary = sorted[0];
  const distinct = [];       // unnamed bodies that ACT alongside the primary → not the same figure
  const folded = [];         // unnamed bodies with no such conflict → the primary under another description
  for (const p of sorted.slice(1))
    (bothActInOneSentence(sentences, primary.head, p.head, C) ? distinct : folded).push(p);
  if (!folded.length) return proposals;
  const mentions = [...new Set([...(primary.mentions || []), ...folded.flatMap((f) => f.mentions || [])])]
    .sort((a, b) => a - b);
  const mergedFrom = folded.map((f) => ({ id: f.id, label: f.label, head: f.head }));
  const surfaces = [...new Set([...(primary.surfaces || []), ...folded.flatMap((f) => f.surfaces || [])])];
  return [{ ...primary, mentions, surfaces, mergedFrom }, ...distinct];
};

// admitUnnamedReferents(ctx) — the pipeline's whole unnamed-referent pass, kept in this holon so the
// orchestrator gains only a call. Detects the nameless bodies (above), lets an injected
// `nameReferent(proposals,{sentences}) → proposals` hook rename/fold them (ideally the talker;
// the mechanical labels stand if it is absent or throws), then admits each like a scanned name:
// one INS per sighting (a real ×N badge), a coref trace (pronouns can now fall to it), a SYN
// folding any hook-merged synonym onto the body, and a defeasible figure-grain DEF. Returns the
// last INS `{ id, sentIdx }` so the orchestrator can advance its arrow of time. Pure but for the
// log/admission/coref it is handed — the same injected-substrate discipline the pipeline uses.
export const admitUnnamedReferents = ({ sentences, admission, conventions, corefField, log, emit,
                                     nameReferent, npEndpoints } = {}) => {
  if (!log || !admission) return { lastIns: null, unnamedRefs: [] };
  let proposals = discoverUnnamedReferents(sentences, { admission, conventions });
  if (proposals.length && typeof nameReferent === 'function') {
    try { const named = nameReferent(proposals, { sentences }); if (Array.isArray(named)) proposals = named; }
    catch { /* naming is optional — the mechanical labels stand */ }
  } else if (proposals.length > 1) {
    // No talker: fold the coreferent descriptions onto one body, mechanically and defeasibly.
    const C = { isFunction: (w) => conventions?.isFunction?.(w) ?? false };
    proposals = foldUnnamedReferents(proposals, sentences, C);
  }
  // The np-object endpoints the main read already emitted (ids the relation parser minted from
  // a bare description in OBJECT position, e.g. "Frankenstein pursued the wretch" → tgt "wretch").
  // A description HEAD folded onto the body must union those orphaned lemma nodes onto it, so the
  // bond the main read DID make lands on the referent too — not just the ones the re-read adds.
  const npEnd = npEndpoints instanceof Set ? npEndpoints : new Set();
  const headOf = (label) => { const t = String(label || '').trim().toLowerCase().split(/\s+/); return singular(t[t.length - 1] || ''); };
  let lastIns = null;
  const unnamedRefs = [];
  for (const p of proposals) {
    if (!p || !p.label || !Array.isArray(p.mentions) || !p.mentions.length) continue;
    let id = null;
    for (const si of p.mentions) {
      id = admission.admit(p.label, si);
      log.append({ op: 'INS', id, label: p.label, sentIdx: si }, emit);   // shape-identical to a name's INS — no species tag
      corefField?.note?.(id, si);
      lastIns = { id, sentIdx: si };
    }
    if (id == null) continue;
    for (const alias of (p.mergedFrom || [])) {
      if (!alias || !alias.label) continue;
      const aliasId = admission.admit(alias.label, p.mentions[0]);
      if (aliasId && aliasId !== id) {
        const syn = log.append({ op: 'SYN', kind: 'merge', from: aliasId, to: id, label: p.label,
                                 sentIdx: 0, match: 'unnamed-alias', warrant: 'coreference' }, emit);
        log.append({ op: 'EVA', site: 'merge', ref: syn.seq, verdict: VERDICTS.CORROBORATED,
                     reason: 'unnamed-referent-coreference', sentIdx: 0 }, emit);
      }
    }
    // Register every description HEAD this body wears — its own and each merged alias's — onto the
    // one referent id, so the relation parser resolves "the creature <verb>" / "the wretch <verb>"
    // to it when the sentences are re-read at the retroactive cursor. Where the SAME head already
    // rode as an np-object lemma in the main read, a SYN unions that orphaned node onto the body.
    const heads = [...new Set([headOf(p.label), ...(p.mergedFrom || []).map((a) => a.head || headOf(a.label))].filter(Boolean))];
    for (const h of heads) {
      admission.aliasTo?.(h, id);
      if (idFor(h) !== id && npEnd.has(h)) {
        const syn = log.append({ op: 'SYN', kind: 'merge', from: idFor(h), to: id, label: p.label,
                                 sentIdx: 0, match: 'unnamed-surface', warrant: 'description' }, emit);
        log.append({ op: 'EVA', site: 'merge', ref: syn.seq, verdict: VERDICTS.CORROBORATED,
                     reason: 'unnamed-referent-description', head: h, sentIdx: 0 }, emit);
      }
    }
    log.append({ op: 'DEF', id, key: 'grain', value: 'figure', grain: 'Figure',
                 cue: 'unnamed-referent', defeasible: true, sentIdx: 0 }, emit);
    unnamedRefs.push({ id, label: p.label, head: p.head, heads, mentions: [...p.mentions].sort((a, b) => a - b) });
  }
  return { lastIns, unnamedRefs };
};
