// EO: SYN·EVA(Network,Field → Network, Composing,Tracing) — deep multi-branch research + report
// Deep research — the curiosity walk, widened into a plan and deepened into a report.
// (docs/deep-research.md; the deliberate, multi-branch sibling of the single walk in research.js.)
//
// The `auto` gather (app.js) runs ONE curiosity walk: a single thread, expanded best-first, that
// stops the moment surprise dries up — enough to fill one answer. Deep research is the same engine
// asked to dig HARD on a question the user explicitly wants explored. It differs on three axes,
// each a deliberate choice the user opted into, not a default:
//
//   1. MULTIPLE PROMPT GENERATION. A concise query is one mouth on a topic; a thorough sweep needs
//      several. `planQueries` turns the one query into a small set of FACETS — distinct angles on
//      the same subject (history, mechanism, criticism, current state, …). Each facet seeds the
//      walk, so the search opens from many sides at once instead of a single thread. The angles can
//      come from the talker (it knows the topic's shape) or, with no model, the bare query alone —
//      the walk still fans out by surprise, just from one mouth.
//   2. DEEPER, on a longer leash. The single walk is tuned to STOP early (it is one tributary of a
//      fast answer). Deep research runs a far larger hop budget, a wider lead beam, a touch looser
//      saliency floor and more stray patience — it is meant to follow curiosity "as deeply as
//      possible," bounded by the same leash, just held longer.
//   3. ONE SHARED STATE across every branch. All facets fold into ONE γ-decayed prior and one fixed
//      topic frame anchored on the ORIGINAL concise query. So a figure surfaced while exploring
//      facet A raises the surprise bar for facet B (no two branches re-learn the same thing), every
//      branch is leashed to the same question, and a page fetched once is never fetched again.
//
// CURIOSITY IS STILL THE ONE SURPRISE. Nothing here is a new metric: `curiosityOf`, `foldInto`,
// `leadsFrom`, `bornSalience`, `nextQuery` are imported verbatim from the single walk (research.js),
// which imports them from the engine's one surprise (core/surprise.js). Deep research is an
// ORCHESTRATION over that machinery — a frontier seeded from many mouths, walked deep, with the
// provenance of every hop kept — not a second notion of "interesting."
//
// The deliverable is not an answer but a REPORT: the synthesized prose (one grounded pass over
// everything gathered) PLUS the full provenance — the facets it planned, every source it read with
// the surprise and saliency that admitted it, and the hop tree it walked. `deepResearchReport`
// assembles it; `runTurnWithDeepResearch` is the end-to-end entry. Pure but for the injected
// `search` and `plan`, so the whole flow is offline-testable with a fake search and a fake planner.

import { profileOf, curiosityOf, foldInto, leadsFrom, nextQuery, researchTerms } from './research.js';
import { bornSalience } from '../surfer/salience.js';
import { makeArchive } from './archive.js';
import { normalizeQuery } from './prefetch.js';
import { runTurn } from './pipeline.js';
import { discourseFrame } from './converse/index.js';

// The prose a hop reads from an admitted doc — the parsed full text, falling back to the source's
// excerpt (a snippet-only result still carries one). Same accessor the single walk uses.
const pageText = (doc) => String(doc?.text || doc?.web?.excerpt || doc?.excerpt || '');

const round  = (x) => Math.round(x * 100) / 100;
const round4 = (x) => Math.round(x * 10000) / 10000;   // saliency is a squared cosine — small; keep 4 places

// planQueries(seed, { plan, max }) → the FACETS to open the search from — the multiple-prompt
// generation step. The concise query is ALWAYS facet 0 (the broad overview, and the anchor the
// leash measures against). An injected `plan` (the talker, in the app) adds distinct angles on the
// same subject; with no planner the seed stands alone and the walk fans out by surprise. Deduped by
// normalized query (a facet that just restates the seed is dropped), capped at `max`, never empty
// when the seed is non-empty. `plan` may throw or return junk — caught; the seed always survives.
export const planQueries = async (seed, { plan, max = 4 } = {}) => {
  const q0 = String(seed || '').trim();
  if (!q0) return [];
  let proposed = [];
  if (typeof plan === 'function') {
    try { proposed = await plan(q0, { max }); } catch { proposed = []; }
  }
  const out = [];
  const seen = new Set();
  const push = (s) => {
    const q = String(s || '').replace(/\s+/g, ' ').trim();
    if (!q || q.length > 160) return;                 // a facet is a query, not a paragraph
    const key = normalizeQuery(q);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(q);
  };
  push(q0);                                           // the concise query is the anchor facet
  for (const f of (Array.isArray(proposed) ? proposed : [])) push(f);
  return out.slice(0, Math.max(1, max));
};

// modelPlanner(model, { history }) → an async plan(seed, { max }) → string[] backed by the talker.
// The same discipline as formulateSearchQuery (web.js), and DISCOURSE-AWARE the same way: a tiny,
// low-token utility call, temperature 0, output parsed line-by-line into bare queries. When a
// conversation `history` is threaded, the fan-out of research angles is written against the
// DISCOURSE STATE (discourseFrame — the subject the conversation is on and the question it left
// open), so every facet keeps the conversation's subject and resolves back-references, instead of
// re-guessing the topic from the seed string alone. The firewall holds (only the grounded referent
// label and the user's open-intent text ride, never the talker's claims). Returns [] (the seed
// stands alone) on any failure or a refusal. Exported so the app injects it, engine stays testable.
export const modelPlanner = (model, { history = [], question = '' } = {}) => async (seed, { max = 4 } = {}) => {
  if (!model?.phrase) return [];
  const n = Math.max(2, max - 1);                     // facet 0 is the seed itself; plan the rest
  // Read discourse off the RAW user turn when the app threads it (the referent/operator live in the
  // real turn, not the already-resolved seed); fall back to the seed when planning standalone.
  const { subject, open } = discourseFrame(question || seed, history);
  const frame = [
    subject ? `Subject in focus: ${subject}` : '',
    open ? `Open question: ${open}` : '',
  ].filter(Boolean).join('\n');
  const messages = [
    { role: 'system', content:
      `You plan web research. Given a topic${frame ? ' and the DISCOURSE STATE (the subject the ' +
      'conversation is on and the question it left open)' : ''}, output ${n} DISTINCT search queries ` +
      'that each open a different angle on it — e.g. its background, how it works, the evidence, the ' +
      'criticism, the current state. ' + (frame ? 'Resolve references against the discourse and ' : '') +
      'Keep the SUBJECT in every query so each stands alone. One query per line, the keywords a ' +
      'search engine needs — no numbering, no question words, no quotes, no commentary.' },
    { role: 'user', content: `${frame ? `Discourse state:\n${frame}\n\n` : ''}Topic: ${seed}\n\n${n} research queries:` },
  ];
  try {
    const out = await model.phrase(messages, { maxTokens: 96, temperature: 0, minPredict: 0 });
    return String(out || '')
      .split('\n')
      .map(s => s.replace(/^\s*[-*\d.)\]]+\s*/, '').replace(/^(query|search)\s*:\s*/i, '').replace(/^["'`]+|["'`]+$/g, '').trim())
      .filter(isQueryLine);
  } catch { return []; }
};

// A planner line is a QUERY, not the model's framing around one. Small local
// models routinely prepend a lead-in — "Here are 4 distinct search queries that
// open different angles on … :" — and, being under the length cap and not a
// refusal, it used to sail through and get FETCHED as if it were a query: a
// wasted hop, and it polluted the walk with the instruction echoed back at the
// search engine (the dolphins audit, 2026-07-04). Drop the tells — a refusal, a
// trailing colon (a header, not a query), a lead-in opener, or a line echoing
// the instruction's own words ("search queries", "different angles"). A genuine
// keyword query trips none of these.
export const isQueryLine = (s) =>
  !!s && s.length <= 160
  && !/^i (?:cannot|can't|am unable)/i.test(s)
  && !/[:：]\s*$/.test(s)
  && !/^(?:here (?:are|is)|the following|below (?:are|is)|these are|sure\b|certainly\b|okay\b|of course)/i.test(s)
  && !/\b(?:search|research)\s+quer(?:y|ies)\b/i.test(s)
  && !/\bdifferent angles?\b/i.test(s);

// runDeepResearch(seed, opts) → { docs, sources, hops, facets, frontier, prior, topic } — the
// multi-branch walk.
//
//   seed     the user's concise query — the anchor for the topic frame AND facet 0
//   search   async (query, opts) → admitted[] — the real fetch+admit. The one effectful dependency.
//   plan     optional async (seed, { max }) → string[] — the facet planner (modelPlanner in the app)
//   facets   optional pre-computed facet list; given, planning is skipped (lets a caller plan once)
//   anchor   the fixed subject the saliency leash measures drift against. Defaults to the seed.
//   maxFacets   how many angles to open from. Default 4.
//   maxHops     the hard ceiling on hops across ALL branches — the runaway backstop. Default 14
//            (the single walk's 6 is for a fast answer; deep research is meant to dig). The leash is
//            the real governor; this only guarantees the walk ends.
//   beam     how many fresh leads a kept hop pushes onto the frontier. Default 5 — wider than the
//            single walk's 4, since depth here is the point.
//   gamma    the cross-hop horizon for the γ-decayed shared prior. Default 0.8.
//   curiosityFloor  bits below which an on-topic hop taught nothing NEW (kept as ground, spawns no
//            leads). Default 0.12.
//   salienceRatio   the LEASH: a DISCOVERED hop strays when its saliency to the topic frame falls
//            below `salienceRatio × the seed facet's saliency`. Default 0.30 — a touch looser than
//            the single walk's 0.34, so deep research follows a thread a little further out.
//   strayPatience   consecutive strays before the walk stops. Default 3 (the single walk's 2 + one):
//            with many branches interleaved, one bad lead should not end the whole sweep.
//   k        results per hop. Default 3.
//   searchOpts  merged into every search call (e.g. { kind:'auto', fetchPages:true }).
//   onPlan   (facets[]) → void — fired once the facets are known (a progress beat).
//   onHop    ({ index, depth, facet, query, term }) → void — fired before each hop's fetch.
//
// BEST-FIRST over EXPECTED CURIOSITY, leashed by SALIENCY, across a frontier seeded from MANY mouths.
// Facet nodes lead (popped before any discovered lead, in plan order) and are ALWAYS kept as ground —
// the user's chosen angles are trusted, not leashed; they only stop SPAWNING when they drift. The
// FIRST facet to return pages (the concise query) calibrates the leash baseline and freezes the topic
// frame. Discovered leads (depth ≥ 1) are fully leashed: a strayed one is dropped and counts toward
// `strayPatience`. The walk ends when the budget is spent, the frontier empties, or a run of strays
// says it has wandered off — deep, but never endless.
export const runDeepResearch = async (seed, {
  search,
  plan,
  facets: presetFacets,
  anchor = seed,
  maxFacets = 4,
  maxHops = 14,
  beam = 5,
  gamma = 0.8,
  curiosityFloor = 0.12,
  salienceRatio = 0.30,
  strayPatience = 3,
  k = 3,
  searchOpts = {},
  onPlan = null,
  onHop = null,
  signal = null,          // an AbortSignal (the Stop button): stop the walk between hops, keeping what it gathered
  clock = () => Date.now(),  // the archive's `now` — injected so a reading's shred time is deterministic in a test
  shredTtlOpts = {},      // { msPerChar, min, max } — how the archive scales a reading's lease by content processed
} = {}) => {
  const q0 = String(seed || '').trim();
  const empty = { docs: [], sources: [], archive: [], hops: [], facets: [], frontier: [], prior: new Map(), topic: new Map() };
  if (typeof search !== 'function' || !q0) return empty;

  // 1. MULTIPLE PROMPT GENERATION — the facets, the mouths the search opens from.
  const facets = Array.isArray(presetFacets) && presetFacets.length
    ? (await planQueries(q0, { plan: () => presetFacets, max: maxFacets }))
    : (await planQueries(q0, { plan, max: maxFacets }));
  if (onPlan) { try { onPlan(facets.slice()); } catch { /* a progress beat must never break the walk */ } }

  // 2. The FIXED topic frame the leash measures drift against — anchored on the ORIGINAL query
  // (weighted to dominate) and enriched ONCE by the first facet's seed page, then frozen. Anchoring
  // on the question, not on the running walk, is what gives the leash something fixed to stray FROM.
  const ANCHOR_W = 3;
  const topic = new Map();
  for (const t of researchTerms(anchor)) topic.set(t, (topic.get(t) || 0) + ANCHOR_W);
  let topicFrozen = false;
  let baseline = 0;

  let prior = new Map();                 // the ONE shared γ-decayed knowledge state across all branches
  const docs = [];                       // every kept page, deduped by docId
  const docIds = new Set();
  const sources = [];                    // provenance rows, in admission order
  const archive = makeArchive({ clock, ...shredTtlOpts });   // parsed-but-strayed readings, leased by content then shredded
  const hops = [];
  const visited = new Set();             // normalized queries already fetched — never re-fetch
  const seenLeads = new Set();           // lead terms already chased or already in a query
  for (const f of facets) for (const t of researchTerms(f)) seenLeads.add(t);   // a planned angle's words are not "discoveries"

  // The frontier: { query, term, facet, depth, priority }. Facets lead in plan order (priority
  // 1e9 - i, so facet 0 pops first); a discovered lead enters at its surprise × the saliency of the
  // page it was found on, so a surprising-AND-on-topic lead out-ranks an equally surprising stray.
  const frontier = facets.map((query, i) => ({ query, term: null, facet: query, depth: 0, priority: 1e9 - i }));
  const pushLead = (lead, node, salience) => {
    const query = nextQuery(node.facet, lead);
    const key = normalizeQuery(query);
    if (visited.has(key) || seenLeads.has(lead.term)) return;
    frontier.push({ query, term: lead.term, facet: node.facet, depth: node.depth + 1, priority: lead.weight * (0.1 + salience) });
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
    if (onHop) { try { onHop({ index: hops.length + 1, depth: node.depth, facet: node.facet, query: node.query, term: node.term }); } catch { /* progress beat */ } }

    let admitted = [];
    try { admitted = await search(node.query, { k, ...searchOpts }); } catch { admitted = []; }
    const hopDocs = (admitted || []).map(a => a?.doc).filter(Boolean);
    const arrival = profileOf(hopDocs.map(d => pageText(d)).join('\n'));
    const isFacet = node.depth === 0;

    // The two measurements: CURIOSITY (surprise vs the shared prior) and SALIENCY (Born overlap with
    // the fixed topic frame). One asks "is this new?", the other "is this still the question?".
    const { bits, by } = arrival.size ? curiosityOf(prior, arrival, { gamma }) : { bits: 0, by: {} };
    const salience = arrival.size ? bornSalience(topic, new Set(arrival.keys())) : 0;

    // record(kept, extra) — push the hop's trace row, with the sources it admitted attached so the
    // report can show which page came from which thread.
    const record = (kept, extra = {}) => hops.push({
      facet: node.facet, depth: node.depth, query: node.query, term: node.term,
      curiosity: round(bits), salience: round4(salience), results: hopDocs.length, kept, ...extra,
    });
    // ground(leads) — admit this hop's pages (deduped) and fold them into the shared prior; record
    // each as a provenance source row tagged with the thread and the surprise/saliency that admitted it.
    const ground = (leadTerms) => {
      prior = foldInto(prior, arrival, gamma);
      for (const d of hopDocs) {
        if (docIds.has(d.docId)) continue;
        docIds.add(d.docId);
        docs.push(d);
        sources.push({
          n: sources.length + 1, docId: d.docId,
          title: d.web?.title || d.title || '', url: d.web?.url || d.web?.final_url || '',
          fetched_at: d.web?.fetched_at || null,
          facet: node.facet, depth: node.depth, query: node.query,
          curiosity: round(bits), salience: round4(salience),
        });
      }
      return leadTerms;
    };

    // A FACET (depth 0): a trusted, deliberately-chosen angle. Always kept and folded. The first one
    // to return pages calibrates the leash baseline and freezes the topic frame. It spawns deeper
    // leads only when it is itself novel and (once a baseline exists) on the leash — so a drifting
    // facet still grounds, but we do not dig DOWN a thread that is already off the question.
    if (isFacet) {
      if (!hopDocs.length) { record(false, { leads: [], reason: 'empty' }); stray = 0; continue; }
      if (!topicFrozen) {
        baseline = salience;
        for (const t of arrival.keys()) topic.set(t, (topic.get(t) || 0) + 1);   // presence, not counts
        topicFrozen = true;
      }
      const onLeash = baseline <= 0 || salience >= salienceRatio * baseline;
      const novel = bits >= curiosityFloor || sources.length === 0;   // the very first arrival has no prior to diverge from
      const leads = (novel && onLeash) ? ground(leadsFrom(by, { seen: seenLeads, max: beam })) : (ground([]), []);
      for (const lead of leads) { pushLead(lead, node, salience); seenLeads.add(lead.term); }
      record(true, { leads: leads.map(l => l.term), exhausted: !novel, strayed: !onLeash });
      stray = 0;
      continue;
    }

    // THE LEASH on a DISCOVERED hop: has it strayed too far from the question? Measured relative to
    // the seed facet's saliency, so the floor self-calibrates to the query. A baseline of ~0 (the
    // seed fetched nothing) disables the relative test, leaving only maxHops as the backstop.
    const floor = baseline > 0 ? salienceRatio * baseline : 0;
    const strayed = hopDocs.length > 0 && salience < floor;
    if (!hopDocs.length || strayed) {
      // A strayed hop was PARSED but is not salient to the question. It never becomes a source —
      // but the reading is not thrown away: file it in the archive, leased to go to the shredder
      // after a duration set by how much content it processed, so a later hop that circles back
      // re-uses it instead of re-reading.
      let archived = 0;
      if (strayed) for (const d of hopDocs) {
        if (docIds.has(d.docId)) continue;   // already grounded elsewhere — it is a source, not archived
        archive.file(d, { facet: node.facet, depth: node.depth, query: node.query, term: node.term,
                          curiosity: round(bits), salience: round4(salience), reason: 'strayed' });
        archived += 1;
      }
      record(false, { leads: [], reason: strayed ? 'strayed' : 'empty', archived });
      if (++stray >= strayPatience) break;     // wandered off the question — stop, well short of maxHops
      continue;
    }

    // ON THE LEASH: an on-topic discovered hop. Keep it as ground; if also NOVEL, open deeper threads.
    stray = 0;
    const novel = bits >= curiosityFloor;
    const leads = novel ? ground(leadsFrom(by, { seen: seenLeads, max: beam })) : (ground([]), []);
    for (const lead of leads) { pushLead(lead, node, salience); seenLeads.add(lead.term); }
    record(true, { leads: leads.map(l => l.term), exhausted: !novel });
  }

  return { docs, sources, archive: archive.entries(), hops, facets, frontier, prior, topic };
};

// deepResearchReport(walk, { query, turn }) → the thorough summary WITH provenance — the deliverable.
//
//   overview   the synthesized prose: the grounded, cited answer the talker wrote over EVERYTHING
//              gathered (turn.answer). The report's body.
//   facets     the angles the search opened from — the multiple prompts it generated.
//   sources    every page read, numbered, each with title · url · when AND the thread that found it
//              (facet, query, depth) and the surprise/saliency that admitted it. The full provenance.
//   archive    the readings that were PARSED but strayed off the question — stored, not listed as
//              sources (absent from `sources`), each leased to go to the shredder after a
//              content-scaled duration.
//   byFacet    the sources grouped by the facet that surfaced them — the report's sections.
//   tree       the complete hop trace: which thread, at what depth, how surprising, kept or why dropped.
//   stats      the shape of the walk: facets, hops, kept, strayed, sources, deepest hop, total bits.
//
// Pure assembly over the walk and the finished turn — no model, no network.
export const deepResearchReport = (walk, { query = '', turn = null } = {}) => {
  const hops = walk?.hops || [];
  const sources = walk?.sources || [];
  const archive = walk?.archive || [];
  const facets = walk?.facets || [];
  const byFacet = facets.map(facet => ({
    facet,
    sources: sources.filter(s => s.facet === facet),
    hops: hops.filter(h => h.facet === facet).length,
  }));
  const strayed = hops.filter(h => h.reason === 'strayed' || h.strayed).length;
  const bits = hops.reduce((a, h) => a + (h.curiosity || 0), 0);
  return {
    query: String(query || '').trim(),
    overview: String(turn?.answer || '').trim(),
    facets,
    sources,
    // The ARCHIVE: readings that were parsed but strayed off the question — stored, not listed as
    // sources (they are deliberately absent from `sources` above), each leased to go to the shredder
    // after a duration set by how much content it processed. Surfaced for transparency, kept distinct
    // from the provenance.
    archive,
    byFacet,
    tree: hops,
    // The proposition audit (factcheck/propositions.js): every office the overview
    // asserts, checked against the gathered sources at their cursor. `corrections`
    // names any role the sources have succeeded — the guard against an answer
    // calling a current mayor a council member off a year-old page.
    audit: turn?.propositions
      ? { verdicts: turn.propositions.verdicts || [], corrections: turn.propositions.corrections || [], counts: turn.propositions.counts || null }
      : null,
    stats: {
      facets: facets.length,
      hops: hops.length,
      kept: hops.filter(h => h.kept).length,
      strayed,
      sources: sources.length,
      archived: archive.length,
      maxDepth: hops.reduce((d, h) => Math.max(d, h.depth || 0), 0),
      bits: round(bits),
    },
  };
};

// runTurnWithDeepResearch(args, opts) → { ...turn, deepResearch } — the end-to-end entry: plan the
// facets, walk them deep, fold EVERY kept page into the turn scope, then synthesize in ONE grounded
// pass over [web + docs]. The answer therefore stands on the seam the engine mined by following its
// curiosity from many angles, and the full report (overview + provenance + hop tree) rides back.
// `runTurnImpl`, `search`, and `plan` are injected, so the whole flow is offline-testable.
export const runTurnWithDeepResearch = async (args, {
  search,
  plan,
  runTurnImpl = runTurn,
  seed,
  maxFacets = 4,
  maxHops = 14,
  beam = 5,
  gamma = 0.8,
  curiosityFloor = 0.12,
  salienceRatio = 0.30,
  strayPatience = 3,
  k = 3,
  searchOpts = { kind: 'auto', fetchPages: true },
  onPlan = null,
  onHop = null,
} = {}) => {
  const q0 = String(seed || args?.question || '').trim();
  const walk = await runDeepResearch(q0, {
    search, plan, anchor: q0, maxFacets, maxHops, beam, gamma, curiosityFloor, salienceRatio,
    strayPatience, k, searchOpts, onPlan, onHop,
  });

  const baseDocs = args?.docs || (args?.doc ? [args.doc] : []);
  const turnArgs = walk.docs.length
    ? { ...args, doc: undefined, docs: [...baseDocs, ...walk.docs], groundGraph: true }
    : args;
  const turn = await runTurnImpl(turnArgs);

  return { ...turn, deepResearch: deepResearchReport(walk, { query: q0, turn }) };
};

// deepResearchAnnouncement(seed, facets, { maxHops }) → the first-person "let me dig in from several
// angles" beat, said the moment a deep walk starts so the (long, many-fetch) gather reads as
// purposeful. Names the angles it will open from and the depth budget. Pure string-mapping.
export const deepResearchAnnouncement = (seed, facets = [], { maxHops = 14 } = {}) => {
  const q = String(seed || '').trim();
  if (!q) return null;
  const angles = (facets || []).filter(f => normalizeQuery(f) !== normalizeQuery(q));
  const from = angles.length
    ? ` from ${angles.length + 1} angles (${[q, ...angles].slice(0, 3).map(a => `“${a}”`).join(', ')}${angles.length > 2 ? ', …' : ''})`
    : '';
  return `I'm going to research “${q}” deeply${from} — I'll follow what surprises me while it stays on topic, up to ${maxHops} hops, then write up everything I found with its sources.`;
};
