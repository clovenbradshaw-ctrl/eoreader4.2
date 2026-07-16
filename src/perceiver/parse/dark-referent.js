// EO: INS·SYN·EVA·DEF(Void → Entity,Network, Composing) — the dark-referent read
// FINDING THE FIGURE THAT HAS NO NAME. The capital scanner (entities.js) anchors on a proper name;
// the uncased read (uncased.js) on the case-particle a nameless script marks its figures with —
// both assume the figure has a NAME the writing spells somewhere. Many never do: Frankenstein's
// *creature* is only ever "the creature", "the monster", "the wretch" — a definite description and
// a hail of pronouns, no proper name in the book — so the name scan admits nothing and the
// protagonist of half the novel never enters the entity graph.
//
// You cannot see the body; you can see the GRAVITY WARPING AROUND IT — a dark mass read off the
// orbits it bends, not off light it emits. A nameless figure bends the discourse as a named one
// does: a description the text keeps RETURNING to, standing where an AGENT stands (a subject that
// ACTS — "the creature stretched"), carrying a mass that RIVALS the named cast. That warp
// (recurrence × agency × mass) is the signature — the same distributional read entities.js and
// grain.js already run, with no name at its centre. It is the SETTING's opposite: "the room",
// "the door" recur too but are moved THROUGH — oblique, never acting (grain.js) — so the figure
// test (subject-dominant) separates the creature from the room, and the MASS gate (rival the named
// cast, not merely recur) keeps an incidental "the soldier" out. A crucial NON-fire: where a
// description already orbits a NAMED star it is that star's — in *Metamorphosis* "the creature" IS
// Gregor, and beside a name sighted 25× an unnamed description sighted twice never clears star-
// scale, so no phantom is minted. Only a genuinely nameless mass survives.
//
// MECHANICAL AND MODELLESS, like every leaf here: it names the body by its own dominant description
// ("the creature"). Whether that is the name a reader would give, and whether "the monster" and
// "the wretch" are the SAME body, is world knowledge the mechanics abstain on — `nameReferent` (the
// injected hook, ideally the talker) MAY rename/merge before admission. Mechanics propose; the
// hook, if present, disposes — the coref-as-proposal discipline (enactor/factcheck/coref.js).

import { VERDICTS } from '../../core/index.js';

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
// The same normalisation entities.js's `idFor` uses, so a dark referent's id is minted exactly
// like a named one's and the projection treats it identically.
const idFor = (label) =>
  label.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '');

// Approximate singularisation so "the creatures"/"the creature" fold onto one head. Deliberately
// timid — plain trailing -s only, never -es/-ies (which mangle more than they help) — because an
// over-eager stemmer merges distinct heads, the error this read most wants to avoid.
const singular = (h) => (h.length > 4 && h.endsWith('s') && !h.endsWith('ss')) ? h.slice(0, -1) : h;

// discoverDarkReferents(sentences, opts) → proposal[]
//   Each proposal: { id, label, head, count, subj, obl, mass, mentions:[sentIdx], surfaces:[form] }
//   admission     the live entity admission (its counts/mentions give the named cast's mass, and
//                 its admitted names are excluded so a name is never re-read as a description).
//   conventions   the ledger the inhibitor classes are read from (function/starter/role/…).
//   minSightings  a body must recur at least this often (a one-off description is not a figure).
//   minAgency     subject-position sightings required — the figure test (it ACTS), not a setting.
//   massFraction  the dark body's count must reach this fraction of the top named referent's, so
//                 only a STAR-SCALE nameless mass is inferred (the "a name should be here" gate).
export const discoverDarkReferents = (sentences, {
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

  // The named cast's mass — the top merged referent's sighting count. A dark body is measured
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
  // the heaviest dark body first — the protagonist the name scan lost.
  out.sort((a, b) => b.mass - a.mass || b.subj - a.subj || (a.label < b.label ? -1 : 1));
  return out;
};

export { idFor as darkReferentId };

// admitDarkReferents(ctx) — the pipeline's whole dark-referent pass, kept in this holon so the
// orchestrator gains only a call. Detects the nameless bodies (above), lets an injected
// `nameReferent(proposals,{sentences}) → proposals` hook rename/fold them (ideally the talker;
// the mechanical labels stand if it is absent or throws), then admits each like a scanned name:
// one INS per sighting (a real ×N badge), a coref trace (pronouns can now fall to it), a SYN
// folding any hook-merged synonym onto the body, and a defeasible figure-grain DEF. Returns the
// last INS `{ id, sentIdx }` so the orchestrator can advance its arrow of time. Pure but for the
// log/admission/coref it is handed — the same injected-substrate discipline the pipeline uses.
export const admitDarkReferents = ({ sentences, admission, conventions, corefField, log, emit, nameReferent } = {}) => {
  if (!log || !admission) return { lastIns: null };
  let proposals = discoverDarkReferents(sentences, { admission, conventions });
  if (proposals.length && typeof nameReferent === 'function') {
    try { const named = nameReferent(proposals, { sentences }); if (Array.isArray(named)) proposals = named; }
    catch { /* naming is optional — the mechanical labels stand */ }
  }
  let lastIns = null;
  for (const p of proposals) {
    if (!p || !p.label || !Array.isArray(p.mentions) || !p.mentions.length) continue;
    let id = null;
    for (const si of p.mentions) {
      id = admission.admit(p.label, si);
      log.append({ op: 'INS', id, label: p.label, sentIdx: si, kind: 'dark' }, emit);
      corefField?.note?.(id, si);
      lastIns = { id, sentIdx: si };
    }
    if (id == null) continue;
    for (const alias of (p.mergedFrom || [])) {
      if (!alias || !alias.label) continue;
      const aliasId = admission.admit(alias.label, p.mentions[0]);
      if (aliasId && aliasId !== id) {
        const syn = log.append({ op: 'SYN', kind: 'merge', from: aliasId, to: id, label: p.label,
                                 sentIdx: 0, match: 'dark-alias', warrant: 'coreference' }, emit);
        log.append({ op: 'EVA', site: 'merge', ref: syn.seq, verdict: VERDICTS.CORROBORATED,
                     reason: 'dark-referent-coreference', sentIdx: 0 }, emit);
      }
    }
    log.append({ op: 'DEF', id, key: 'grain', value: 'figure', grain: 'Figure',
                 cue: 'dark-referent', defeasible: true, sentIdx: 0 }, emit);
  }
  return { lastIns };
};
