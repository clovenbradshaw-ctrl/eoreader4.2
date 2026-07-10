// EO: EVA·SYN(Network,Field → Network, Tracing,Composing) — curiosity-guided multi-hop research
// Curiosity-guided research — multi-hop web research that follows the engine's own surprise.
// (docs/curiosity-research.md; the multi-hop sibling of the single-shot path in web.js.)
//
// The `auto` web path (app.js) fires ONE query, folds its results into the scope, and answers.
// That is enough to fill a single gap, but a real question often opens further questions: a
// fetched page names a person, a place, a reboot, a date the engine had never seen — and the
// honest next move is to go ask about THAT. Doing it blindly is shotgunning: fire a fan-out of
// follow-up queries on every term and drown the answer in tangential pages. This does the
// opposite. It expands exactly ONE thread per hop — the most SURPRISING one — and stops the
// moment surprise dries up.
//
// CURIOSITY IS NOT A NEW METRIC. It is the engine's ONE surprise (core/surprise.js,
// docs/spec-one-surprise.md) pointed at the web: D_KL(posterior ‖ prior) of a freshly fetched
// page against the γ-decayed profile of everything read so far. A page that only restates what
// we know moves belief by ~0 bits (low curiosity → a dead thread); a page that introduces a new
// figure, claim, or relation moves belief a finite positive amount (high curiosity → follow it).
// And the SAME computation hands back WHAT was surprising: `bayesBy`, the per-dimension KL
// contribution, names the atoms belief moved toward — those atoms ARE the next leads. So the
// search is steered by the measured gap, not by a keyword heuristic — active inference
// (docs/web-search.md "fire where expected information gain is highest"), run as a loop.
//
// Pure but for the injected `search` (and the surprise core it imports): the front-end map from
// page text into the surprise basis, the best-first frontier, the curiosity floor, and the hop
// trace are all testable with a fake search and a hand-advanced budget — no model, no network.

import { surpriseAt } from '../core/surprise.js';
import { bornSalience } from '../surfer/salience.js';
import { makeArchive } from './archive.js';
import { normalizeQuery } from './prefetch.js';
import { runTurn } from './pipeline.js';

// The content terms that carry a page's topic — the surprise BASIS for the web front-end. This
// is the same discipline web.js uses for its lexical witness check: drop function words, keep
// the words that distinguish one page from another. Embedder-free and offline by construction,
// so the curiosity measure runs in a unit test exactly as it does in the browser. (The full
// engine has a richer proposition/figure basis in reading.js; a research hop works off raw
// fetched prose before the heavy parse, so the term basis is the honest, cheap front-end here.)
const STOP = new Set(('the a an of to in on for and or but is are was were be been being with as at by from this that ' +
  'these those it its his her their your our my we you they he she them then than so not no yes do does did has have ' +
  'had will would can could should about into over under more most some any all what who whom whose when where why ' +
  'which how there here just only also very much many out up off down new news said says say one two three first ' +
  'last year years day days time times back like get got make made well still even now per via amid ' +
  // Common non-content words that were slipping through and surfacing as "leads"
  // and, worse, as reframing labels ("though, quite, flexible") — a reframing
  // must name something contentful, never a hedge or a bare verb.
  'though although however whilst while thus hence therefore rather quite somewhat fairly ' +
  'use uses used using upon within without toward towards among amongst across whether either neither ' +
  'often usually generally typically including include includes included such each other another both ' +
  'may might must shall being able around along already always never sometimes mostly largely mainly').split(/\s+/));

export const researchTerms = (s) =>
  (String(s || '').toLowerCase().match(/[a-z][a-z0-9'’-]{2,}/g) || []).filter(t => !STOP.has(t));

// profileOf(text) → Map<term, mass> — a page reduced to its term-frequency profile, the unit a
// hop deposits into the running knowledge state. Repetition is signal (a page ABOUT Coogler says
// "Coogler" many times), so mass is the raw count, not a set.
export const profileOf = (text) => {
  const m = new Map();
  for (const t of researchTerms(text)) m.set(t, (m.get(t) || 0) + 1);
  return m;
};

// curiosityOf(prior, arrival, { gamma, novelty }) → { bits, by } — the engine's ONE surprise,
// renamed for the call site. `bits` is D_KL(posterior ‖ prior) in bits: how far this page moved
// belief = how curious-worthy it is. `by` is the per-term KL contribution: WHICH terms belief
// moved toward = the leads worth chasing. A thin wrapper so research speaks "curiosity" while the
// arithmetic stays the one shared core — a drift in surpriseAt is a drift here, by construction.
export const curiosityOf = (prior, arrival, { gamma = 0.8, novelty } = {}) => {
  const { bayesBits, bayesBy } = surpriseAt(prior, arrival, { gamma, ...(novelty != null ? { novelty } : {}) });
  return { bits: bayesBits, by: bayesBy };
};

// foldInto(prior, arrival, gamma) → the NEW profile after this hop: every incumbent decays by γ,
// every term the page delivered deposits its mass. This is exactly the posterior mass surpriseAt
// formed internally (γ·prior + arrival) — the running, γ-decayed state of what the research has
// read. γ is the horizon ACROSS HOPS: at 0.8 a term first seen four hops ago still carries ~0.4
// of its mass, so an early thread keeps biasing surprise without pinning it forever. Returns a
// fresh Map; the input prior is untouched.
export const foldInto = (prior, arrival, gamma = 0.8) => {
  const next = new Map();
  for (const [k, m] of prior) next.set(k, gamma * m);
  for (const [k, m] of arrival) next.set(k, (next.get(k) || 0) + m);
  return next;
};

// plausibleLead(term) → is this a real word worth a SEARCH, or an OCR / markup artifact?
//
// Surprise rewards novelty, and the most novel "word" on a scanned or badly-extracted page is
// often garbage — "rn1", "0f", "c0mpany", "vvss", a hyphenation crumb. Such a token has never been
// seen, so it tops `bayesBy` (maximal KL) and would become the next query — the walk chasing
// nonsense. This rejects the artifact SHAPES so a junk token is never chased: a digit wedged
// between letters (l1ne, v0te), a letter→digit→letter splice, a vowelless run (rn, thc), a long
// consonant smear, a triple-repeated character (vvv). Deliberately CONSERVATIVE — a normal word, a
// name, a digits-at-end token (covid19, mp3) all pass; only artifact shapes are dropped. It is a
// best-effort efficiency valve, not the safety guarantee: the saliency leash is what ensures a
// garbled page can never ground the answer (its near-zero overlap with the topic frame strays it).
const VOWEL = /[aeiouy]/;
export const plausibleLead = (term) => {
  const t = String(term || '').toLowerCase();
  if (t.length < 3) return false;                  // too short to be a distinctive lead
  if (!VOWEL.test(t)) return false;                // no vowel at all: rn, thc, vvss
  if (/[a-z]\d[a-z]/.test(t)) return false;        // letter-digit-letter splice: c0mpany, v0te
  if (/[a-z]\d/.test(t) && /\d[a-z]/.test(t)) return false;  // digit wedged inside letters: l1ne, rn1e
  if (/(.)\1\1/.test(t)) return false;             // a triple-repeated char: vvv, sss — a smear, not a word
  if (/[^aeiouy\d'’-]{6,}/.test(t)) return false;  // 6+ consonants in a row: an OCR smudge
  return true;
};

// leadsFrom(by, { seen, max }) → the surprising terms worth a hop, ranked by how much belief
// moved toward them, with the ones already chased (or already in a prior query) — and the OCR /
// markup artifacts (plausibleLead) — dropped. This is the anti-shotgun valve at the term level: of
// everything a page surfaced, only the few HEAVIEST *real* surprises become candidate threads,
// never the long tail and never the scanning noise that surprise alone would rank at the very top.
export const leadsFrom = (by, { seen = new Set(), max = 4 } = {}) =>
  Object.entries(by || {})
    .filter(([term, w]) => w > 0 && !seen.has(term) && plausibleLead(term))
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([term, weight]) => ({ term, weight }));

// nextQuery(anchor, lead) → the query that chases ONE lead, kept coherent by the anchor (the
// research's standing subject). A bare surprising term ("Coogler") goes to the world with no
// subject and matches a namesake — the same failure proposeWebSearch guards against (web.js). So
// the lead rides WITH the anchor: "X-Files revival" + "Coogler" → "X-Files revival Coogler". One
// thread, sharpened — not a bag of every surprising word at once.
export const nextQuery = (anchor, lead) => {
  const a = String(anchor || '').trim();
  const t = String(lead?.term || lead || '').trim();
  if (!t) return a;
  if (!a) return t;
  return a.toLowerCase().includes(t.toLowerCase()) ? a : `${a} ${t}`;
};

// runCuriousResearch(seed, opts) → { docs, hops, frontier, prior, topic } — the loop.
//
//   seed     the first query (the formulated search query for the user's turn)
//   search   async (query, opts) → admitted[] — the real fetch+admit (searchAndAdmit, bound to
//            the session web client). The ONLY effectful dependency; injected so this is offline-
//            testable with a fake.
//   anchor   the standing subject that keeps every hop's query coherent (defaults to the seed)
//   maxHops  the hard ceiling on hops — "max number of hops". Generous; the saliency leash is the
//            real governor, this is only the backstop so the walk can never run away. Default 6.
//   gamma    the cross-hop horizon for the γ-decayed prior. Default 0.8.
//   curiosityFloor  bits below which a hop, though on-topic, taught us nothing NEW, so it spawns no
//            fresh leads (it is still kept as ground). Default 0.15 bits. NOT a stop condition —
//            an exhausted-but-relevant page is fine; it is straying that ends the walk.
//   salienceRatio   the LEASH. Surprise pulls the walk OUTWARD (the most surprising lead is often the
//            most off-topic); saliency pulls it BACK toward the original question. Each hop's content
//            is scored for saliency to the FIXED topic frame (the seed query + what the seed page
//            established, frozen) by the Born rule (surfer/salience.js, |⟨topic|hop⟩|²). A hop whose
//            saliency falls below `salienceRatio × the seed page's own saliency` has STRAYED TOO FAR
//            — it is dropped (not grounded, not expanded). Default 0.34: a thread a third as on-topic
//            as the seed is off the leash. `strayPatience` consecutive strays end the walk early.
//   strayPatience   how many consecutive off-leash hops to tolerate before stopping. Default 2.
//   k        results per hop, passed through to search. Default 3 — focused, not a fan-out.
//   searchOpts  extra options merged into every search call (e.g. { kind:'auto', fetchPages }).
//
// BEST-FIRST under two forces. EXPECTED CURIOSITY (the KL contribution that surfaced a lead) sets
// what to explore; SALIENCY (to the seed topic) leashes how far. The frontier priority blends them
// — a surprising lead found on an on-topic page out-ranks an equally surprising one found while
// already drifting — so the walk follows surprise WITHIN the orbit of the question. Each hop pops the
// best thread, fetches, then measures realized curiosity (against the running prior) AND realized
// saliency (against the fixed topic). On-topic pages join the ground and, if also novel, spawn deeper
// leads; off-leash pages are dropped. It ends when the budget is spent, the frontier empties, or a run
// of consecutive strays says the walk has wandered off the question — multiple hops, but never endless.
export const runCuriousResearch = async (seed, {
  search,
  anchor = seed,
  maxHops = 6,
  gamma = 0.8,
  curiosityFloor = 0.15,
  salienceRatio = 0.34,
  strayPatience = 2,
  k = 3,
  searchOpts = {},
  onHop = null,           // (｛ index, query, term ｝) → void — a progress beat fired before each hop's fetch
  signal = null,          // an AbortSignal (the Stop button): stop the walk between hops, keeping what it gathered
  clock = () => Date.now(),  // the archive's `now` — injected so a reading's shred time is deterministic in a test
  shredTtlOpts = {},      // { msPerChar, min, max } — how the archive scales a reading's lease by content processed
} = {}) => {
  const q0 = String(seed || '').trim();
  if (typeof search !== 'function' || !q0) return { docs: [], archive: [], hops: [], frontier: [], prior: new Map(), topic: new Map() };

  let prior = new Map();
  // The FIXED topic frame the saliency leash measures drift against. It is anchored PRIMARILY on the
  // QUESTION's own terms (weighted ANCHOR_W so they dominate), enriched ONCE by the seed page (the
  // first grounding of what the question is about, folded in at presence weight so one repeated name
  // can't hijack the frame), then frozen. Anchoring on the question — not on the running walk — is
  // what gives the leash something fixed to stray FROM: a later page is "on topic" to the degree it
  // still echoes the QUESTION, with the seed page's specifics only a secondary pull.
  const ANCHOR_W = 3;
  const topic = new Map();
  for (const t of researchTerms(anchor)) topic.set(t, (topic.get(t) || 0) + ANCHOR_W);
  let topicFrozen = false;
  let baseline = 0;       // the seed page's own saliency to the topic — the "on-topic looks like this" yardstick
  const docs = [];
  const archive = makeArchive({ clock, ...shredTtlOpts });   // parsed-but-strayed readings, leased by content then shredded
  const seenDocIds = new Set();       // docIds already grounded — never archive a page that is a source
  const hops = [];
  const visited = new Set();          // normalized queries already fetched — never re-fetch
  const seenLeads = new Set();        // lead terms already chased or already in a query — never re-chase
  for (const t of researchTerms(anchor)) seenLeads.add(t);   // the anchor's own words are not "discoveries"

  // The frontier: { query, term, priority }. The seed leads at +∞ so it is always explored first;
  // a discovered lead's priority blends its surprise (the KL it carried) with the saliency of the
  // page it was found on — so the walk prefers leads that are both surprising AND still on-topic.
  const frontier = [{ query: q0, term: null, priority: Infinity }];
  const pushLead = (lead, salience) => {
    const query = nextQuery(anchor, lead);
    const key = normalizeQuery(query);
    if (visited.has(key) || seenLeads.has(lead.term)) return;
    frontier.push({ query, term: lead.term, priority: lead.weight * (0.1 + salience) });
  };
  const popBest = () => {
    let bi = -1, best = -Infinity;
    for (let i = 0; i < frontier.length; i++) if (frontier[i].priority > best) { best = frontier[i].priority; bi = i; }
    return bi < 0 ? null : frontier.splice(bi, 1)[0];
  };

  let stray = 0;
  while (hops.length < maxHops && frontier.length) {
    if (signal?.aborted) break;   // the user stopped — return the pages gathered so far
    const node = popBest();
    const key = normalizeQuery(node.query);
    if (visited.has(key)) continue;
    visited.add(key);
    if (node.term) seenLeads.add(node.term);
    if (onHop) { try { onHop({ index: hops.length + 1, query: node.query, term: node.term }); } catch { /* a progress beat must never break the walk */ } }

    let admitted = [];
    try { admitted = await search(node.query, { k, ...searchOpts }); } catch { admitted = []; }
    const hopDocs = (admitted || []).map(a => a?.doc).filter(Boolean);
    const arrival = profileOf(hopDocs.map(d => pageText(d)).join('\n'));
    const isSeed = node.priority === Infinity;

    // The two measurements: CURIOSITY (surprise vs everything read so far) and SALIENCY (Born
    // overlap with the fixed topic frame). One says "is this new?", the other "is this still about
    // the question?". An empty fetch is zero on both.
    const { bits, by } = arrival.size ? curiosityOf(prior, arrival, { gamma }) : { bits: 0, by: {} };
    const salience = arrival.size ? bornSalience(topic, new Set(arrival.keys())) : 0;

    // SEED: the question's own footing — always kept and folded, and it CALIBRATES the leash. Its
    // saliency becomes the baseline; the topic frame is enriched with its content, then frozen.
    if (isSeed) {
      baseline = salience;
      if (!topicFrozen) { for (const t of arrival.keys()) topic.set(t, (topic.get(t) || 0) + 1); topicFrozen = true; }   // presence, not counts
      if (hopDocs.length) {
        docs.push(...hopDocs);
        for (const d of hopDocs) seenDocIds.add(d.docId);
        prior = foldInto(prior, arrival, gamma);
        const leads = leadsFrom(by, { seen: seenLeads, max: 4 });
        for (const lead of leads) { pushLead(lead, salience); seenLeads.add(lead.term); }
        hops.push({ query: node.query, term: node.term, curiosity: round(bits), salience: round4(salience),
                    results: hopDocs.length, leads: leads.map(l => l.term), kept: true });
      } else {
        hops.push({ query: node.query, term: node.term, curiosity: 0, salience: 0, results: 0, leads: [], kept: false, reason: 'empty' });
      }
      stray = 0;
      continue;
    }

    // THE LEASH: has this hop strayed too far from the question? Measured relative to the seed's own
    // saliency, so the floor self-calibrates to the query (a three-word ask and a paragraph ask have
    // very different absolute overlaps). A baseline of ~0 disables the relative test and leaves only
    // maxHops as the backstop.
    const floor = baseline > 0 ? salienceRatio * baseline : 0;
    const strayed = hopDocs.length > 0 && salience < floor;

    if (!hopDocs.length || strayed) {
      // A strayed hop was PARSED but is not salient to the question. It never grounds — but the
      // reading is not thrown away: file it in the archive, leased to go to the shredder after a
      // duration set by how much content it processed, so a later hop that circles back re-uses it
      // instead of re-reading it cold.
      let archived = 0;
      if (strayed) for (const d of hopDocs) {
        if (seenDocIds.has(d.docId)) continue;   // already grounded — it is a source, not archived
        archive.file(d, { query: node.query, term: node.term, curiosity: round(bits), salience: round4(salience), reason: 'strayed' });
        archived += 1;
      }
      hops.push({ query: node.query, term: node.term, curiosity: round(bits), salience: round4(salience),
                  results: hopDocs.length, leads: [], kept: false, reason: strayed ? 'strayed' : 'empty', archived });
      if (++stray >= strayPatience) break;     // wandered off the question — stop, well short of maxHops
      continue;
    }

    // ON THE LEASH: an on-topic hop. Keep it as ground and fold it into what we know. If it is also
    // NOVEL (above the curiosity floor) it opens deeper threads; a relevant restatement just
    // corroborates and spawns nothing. Either way it is on the question, so the stray run resets.
    stray = 0;
    docs.push(...hopDocs);
    for (const d of hopDocs) seenDocIds.add(d.docId);
    prior = foldInto(prior, arrival, gamma);
    const novel = bits >= curiosityFloor;
    const leads = novel ? leadsFrom(by, { seen: seenLeads, max: 4 }) : [];
    for (const lead of leads) { pushLead(lead, salience); seenLeads.add(lead.term); }
    hops.push({ query: node.query, term: node.term, curiosity: round(bits), salience: round4(salience),
                results: hopDocs.length, leads: leads.map(l => l.term), kept: true, exhausted: !novel });
  }

  return { docs, archive: archive.entries(), hops, frontier, prior, topic };
};

// The prose a hop reads from an admitted doc: the parsed text, falling back to the source's
// excerpt. admitWebSource parses the full page into `doc.text`; a snippet-only result still
// carries an excerpt on its web metadata.
const pageText = (doc) =>
  String(doc?.text || doc?.web?.excerpt || doc?.excerpt || '');

// runTurnWithResearch(args, opts) → { ...turn, research } — the inverted-flow orchestrator: gather
// the web by a curiosity WALK first (instead of the single-shot search the `auto` path runs), fold
// every kept page into the turn's scope, then answer in ONE grounded pass over [web + docs]. The
// answer therefore stands on a SEAM the engine mined by following its own surprise, and the
// `research` trace (hops + curiosity per hop) rides back for the transparency surface. `runTurnImpl`
// and `search` are injected, so the whole flow is testable without a model or the network.
export const runTurnWithResearch = async (args, {
  search,
  runTurnImpl = runTurn,
  seed,
  maxHops = 6,
  gamma = 0.8,
  curiosityFloor = 0.15,
  salienceRatio = 0.34,
  strayPatience = 2,
  k = 3,
  searchOpts = { kind: 'auto', fetchPages: true },
} = {}) => {
  const q0 = String(seed || args?.question || '').trim();
  const walk = await runCuriousResearch(q0, { search, anchor: q0, maxHops, gamma, curiosityFloor, salienceRatio, strayPatience, k, searchOpts });

  const baseDocs = args?.docs || (args?.doc ? [args.doc] : []);
  const turnArgs = walk.docs.length
    ? { ...args, doc: undefined, docs: [...baseDocs, ...walk.docs], groundGraph: true }
    : args;
  const turn = await runTurnImpl(turnArgs);

  return {
    ...turn,
    research: {
      seed: q0,
      hops: walk.hops,
      kept: walk.hops.filter(h => h.kept).length,
      results: walk.docs.length,
      // Readings parsed but strayed off the question — stored in the archive, NOT listed as sources,
      // each leased to go to the shredder after a content-scaled duration. Rides back so a session
      // can file them.
      archive: walk.archive || [],
      sources: walk.docs.map(d => ({
        docId: d.docId, title: d.web?.title || d.title || '', url: d.web?.url || d.web?.final_url || '',
        fetched_at: d.web?.fetched_at || null,
      })),
    },
  };
};

// researchAnnouncement(seed, { maxHops }) → the first-person "I'm going to research this" beat, the
// multi-hop sibling of searchAnnouncement (propose.js). Said the moment a curiosity walk starts, so
// the (slower, multi-fetch) gather reads as purposeful — it names the DECISION (I'm researching) and
// the QUERY it's about to fire (`seed`, the LLM-formulated search from formulateSearchQuery, not the
// raw chat turn), so "here's what I'm searching for" is literal, not a black box. Pure string-mapping,
// no model call — the model already ran to produce `seed`; this only promotes it into voice.
export const researchAnnouncement = (seed, { maxHops = 6 } = {}) => {
  const q = String(seed || '').trim();
  if (!q) return null;
  return `I'm going to research this. Here's what I'm searching for: “${q}” — I'll follow what surprises me while it stays on topic, up to ${maxHops} hops.`;
};

const round  = (x) => Math.round(x * 100) / 100;
const round4 = (x) => Math.round(x * 10000) / 10000;   // saliency is a squared cosine — small; keep 4 places
