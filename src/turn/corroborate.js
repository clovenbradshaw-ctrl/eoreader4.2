// EO: SYN·EVA·DEF(Network,Field,Link → Network,Lens, Composing,Binding,Tracing) — hop-until-corroborated web walk
// Corroboration walk — when an answer rests on ONE source, go find an independent second one, or
// hop until it can be said with confidence that none exists.
// (docs/multi-source-corroboration.md; the sibling of the void gap-fill in web.js and the
// curiosity walk in research.js.)
//
// The void path already reaches for the web when the document holds NO answer (turn/propose.js
// gap trigger). This is the other half of the same discipline, at the other end: the answer WAS
// found and grounded — but on a single, meaningfully-distinct source (enactor/ground/corroboration.js
// underCorroborated). A fact standing on one voice is not yet corroborated. So the walk goes out to
// look for a SECOND voice that says the same thing and is not the first one wearing a different URL.
//
// It hops the way the curiosity walk does — best-first over the surprising leads a page surfaces,
// each query kept coherent by the standing anchor (research.js primitives, reused). But the KEEP
// rule is different: a fetched page counts only if it SUPPORTS the answer (verifyAgainstWeb) AND is
// MEANINGFULLY DISTINCT from every witness gathered so far (witnessIndependence — a different
// publisher, not a reprint, not a near-duplicate). The moment the distinct-witness count reaches the
// target (two, by default: the source already behind the answer plus one independent corroborator),
// the walk stops — it FOUND it. If it runs the frontier dry, exhausts its hop budget, or spends a run
// of hops adding nothing, it stops and says so — it can confidently report that an independent
// corroboration was not found, which is the honest terminal the request asks for.
//
// Pure but for the injected `search` (and `formulate`): the frontier, the support check, the
// distinctness collapse, and the hop trace are all testable with a fake search and no model.

import { verifyAgainstWeb, formulateSearchQuery } from './web.js';
import { researchTerms, profileOf, curiosityOf, foldInto, leadsFrom, nextQuery } from './research.js';
import { normalizeQuery } from './prefetch.js';
import {
  witnessDescriptor, sameWitness, distinctWitnessCount, reflectionWitnesses,
  underCorroborated,
} from '../enactor/ground/index.js';

// The prose a hop reads from an admitted doc — the parsed text, or the source's excerpt when only a
// snippet came back. Same fallback the curiosity walk uses.
const pageText = (doc) => String(doc?.text || doc?.web?.excerpt || doc?.excerpt || '');

// The {title, url} of an admitted doc — what a "read N sources" beat clicks through to.
const srcOf = (d) => ({ docId: d.docId, title: d.web?.title || d.title || '', url: d.web?.url || d.web?.final_url || '' });
const srcList = (ds) => ds.map(srcOf);

const round = (x) => Math.round(x * 100) / 100;

// isDistinctCorroborator(candidate, witnesses) → is this a NEW independent voice? True when the
// candidate is not the SAME WITNESS as any voice already held (enactor/ground/corroboration.js) — a
// different publisher, not a reprint, not a near-verbatim re-covering. Decided by identity facts and
// the ONE surprise, no threshold. The gate the walk adds a fetched page through before it counts as
// corroboration.
export const isDistinctCorroborator = (candidate, witnesses) =>
  !!candidate && (witnesses || []).every((w) => !sameWitness(candidate, w));

// runCorroborationWalk(seed, opts) → { corroborated, witnesses, found, hops, exhausted } — the loop.
//
//   seed      the first query (the formulated search query for the answer's subject)
//   search    async (query, opts) → admitted[] — the real fetch+admit, injected (offline-testable)
//   answer    the answer text whose distinctive claim a corroborator must SUPPORT (verifyAgainstWeb)
//   question  the question, so the support check discounts the terms the answer merely echoes back
//   anchor    the standing subject that keeps every hop's query coherent (defaults to the seed)
//   backing   descriptors (or admitted docs) of the sources ALREADY behind the answer — the walk
//             counts these as witnesses, so a single-source answer needs only ONE more distinct voice
//   target    the distinct-witness count that means "corroborated". Default 2.
//   maxHops   the hard ceiling on hops. Default 6.
//   dryPatience  consecutive hops that add no distinct corroborator before the walk gives up early
//             and reports the absence. Default 3.
//   leadsPerHop / k / gamma  the frontier depth, results per hop, and cross-hop horizon — as in
//             research.js; a page's surprises become the next queries so the walk actually MOVES.
//
// SUPPORT is the established web-witness check (web.js verifyAgainstWeb, with its own default) — a
// page corroborates only if it actually asserts the answer's distinctive claim. DISTINCTNESS is the
// fact/surprise sameWitness test — no threshold of this module's own.
//
// Ends on one of three terminals: FOUND (distinct witnesses reached the target — corroborated:true,
// exhausted:false), DRY (a run of hops added nothing — corroborated by whatever it had, exhausted:
// true), or SPENT (budget/frontier exhausted — same shape). The caller reads `corroborated` for the
// verdict and `found` for the independent source(s) to cite.
export const runCorroborationWalk = async (seed, {
  search,
  answer,
  question = seed,
  anchor = seed,
  backing = [],
  target = 2,
  maxHops = 6,
  dryPatience = 3,
  leadsPerHop = 4,
  k = 3,
  gamma = 0.8,
  searchOpts = { kind: 'auto', fetchPages: true },
  onHop = null,
  onHopDone = null,
  signal = null,
} = {}) => {
  const q0 = String(seed || '').trim();
  const witnesses = (backing || []).map(witnessDescriptor).filter(Boolean);
  const found = [];
  const hops = [];
  const done = () => distinctWitnessCount(witnesses) >= target;
  if (typeof search !== 'function' || !q0 || !String(answer || '').trim())
    return { corroborated: done(), witnesses, found, hops, exhausted: false };

  let prior = new Map();
  const visited = new Set();
  const seenLeads = new Set(researchTerms(anchor));
  const frontier = [{ query: q0, term: null, priority: Infinity }];
  const pushLead = (lead) => {
    const query = nextQuery(anchor, lead);
    if (visited.has(normalizeQuery(query)) || seenLeads.has(lead.term)) return;
    frontier.push({ query, term: lead.term, priority: lead.weight });   // best-first by the surprise the lead carried
  };
  const popBest = () => {
    let bi = -1, best = -Infinity;
    for (let i = 0; i < frontier.length; i++) if (frontier[i].priority > best) { best = frontier[i].priority; bi = i; }
    return bi < 0 ? null : frontier.splice(bi, 1)[0];
  };

  let dry = 0;
  while (hops.length < maxHops && frontier.length) {
    if (signal?.aborted) break;
    const node = popBest();
    const key = normalizeQuery(node.query);
    if (visited.has(key)) continue;
    visited.add(key);
    if (node.term) seenLeads.add(node.term);
    if (onHop) { try { onHop({ index: hops.length + 1, query: node.query, term: node.term }); } catch { /* a beat must never break the walk */ } }

    let admitted = [];
    try { admitted = await search(node.query, { k, signal, ...searchOpts }); } catch { admitted = []; }
    const pages = (admitted || []).map((a) => a?.doc).filter(Boolean);

    // Which fetched pages SUPPORT the answer, and are MEANINGFULLY DISTINCT from every witness so
    // far? Each such page is a new independent voice — count it, and remember what it read.
    let added = 0;
    for (const d of pages) {
      const support = verifyAgainstWeb(answer, pageText(d), { question });
      if (!support.supported) continue;
      const desc = witnessDescriptor(d);
      if (isDistinctCorroborator(desc, witnesses)) {
        witnesses.push(desc);
        found.push({ ...srcOf(d), overlap: support.overlap });
        added += 1;
      }
    }

    // Fold this hop's content into the running prior and spawn the surprising leads as the next
    // queries — even a non-supporting page can name a sharper query. The frontier depth is what
    // keeps the walk moving when one thread comes back dry.
    const arrival = profileOf(pages.map(pageText).join('\n'));
    const { bits, by } = arrival.size ? curiosityOf(prior, arrival, { gamma }) : { bits: 0, by: {} };
    if (arrival.size) prior = foldInto(prior, arrival, gamma);
    const leads = leadsFrom(by, { seen: seenLeads, max: leadsPerHop });
    for (const lead of leads) { pushLead(lead); seenLeads.add(lead.term); }

    const distinct = distinctWitnessCount(witnesses);
    const reached = distinct >= target;
    const hop = { query: node.query, term: node.term, results: pages.length, added, distinct,
                  curiosity: round(bits), leads: leads.map((l) => l.term), sources: srcList(pages),
                  corroborated: reached };
    hops.push(hop);
    if (onHopDone) { try { onHopDone(hop); } catch { /* a beat must never break the walk */ } }

    if (reached) return { corroborated: true, witnesses, found, hops, exhausted: false };
    if (added === 0) { if (++dry >= dryPatience) break; } else dry = 0;
  }
  return { corroborated: done(), witnesses, found, hops, exhausted: true };
};

// backingFromReflection(reflection, enrich) → the witness descriptors the answer ALREADY stands on,
// read off the reflection (enactor/ground/corroboration.js), so the walk knows what a corroborator
// must be distinct FROM and how many more distinct voices it still needs.
export const backingFromReflection = (reflection, enrich = {}) => reflectionWitnesses(reflection, enrich);

// runTurnWithCorroboration(args, first, opts) → { ...first, corroboration } — the post-answer half.
// Given a COMPLETED grounded turn (`first`, carrying its reflection, answer, and the sources it
// grounded on), decide whether it is under-corroborated; if so, run the walk to find an independent
// second source and ATTACH the outcome. It never replaces the answer — corroboration CONFIRMS, the
// way a chat verify augments rather than overwrites. Null-safe and opt-out: a well-corroborated
// answer (or no reflection) returns `first` untouched.
//
//   corroboration = {
//     sought,        // true when the walk actually ran (the answer was under-corroborated)
//     corroborated,  // an independent second source was found
//     verdict,       // 'corroborated' | 'uncorroborated'
//     sources,       // the independent corroborator(s) found — { title, url, overlap }
//     distinct,      // the effective distinct-witness count now behind the answer
//     hops,          // the walk's hop trace, for the research trail
//   }
export const runTurnWithCorroboration = async (args, first, {
  search,
  enrich = {},
  formulate = formulateSearchQuery,
  target = 2,
  maxHops = 6,
  k = 3,
  onHop = null,
  onHopDone = null,
  signal = null,
} = {}) => {
  const reflection = first?.reflection;
  if (!search || !first?.answer || !underCorroborated(reflection, enrich)) return first;

  const backing = backingFromReflection(reflection, enrich);
  const seed = await formulate({
    model: args?.model, question: args?.question || '', history: args?.history || [],
    fallback: args?.question || '', signal,
  });

  const walk = await runCorroborationWalk(seed, {
    search, answer: first.answer, question: args?.question || seed, anchor: seed,
    backing, target, maxHops, k, onHop, onHopDone, signal,
  });

  return {
    ...first,
    corroboration: {
      sought: true,
      corroborated: walk.corroborated,
      verdict: walk.corroborated ? 'corroborated' : 'uncorroborated',
      query: seed,
      sources: walk.found,
      distinct: distinctWitnessCount(walk.witnesses),
      hops: walk.hops,
    },
  };
};

// corroborationAnnouncement(query) → the first-person "let me find a second, independent source"
// beat, said the moment the walk starts — the sibling of searchAnnouncement / researchAnnouncement.
// Pure string-mapping, no model call.
export const corroborationAnnouncement = (query) => {
  const q = String(query || '').trim();
  if (!q) return null;
  return `That rests on a single source — let me look for an independent one that corroborates it${q ? ` (“${q}”)` : ''}…`;
};

// corroborationSettled(corroboration) → the first-person outcome line for the chat trail, or null.
// Names the terminal the request asks for: an independent source was FOUND, or — after real hops —
// one confidently was NOT, and the answer stands as single-source.
export const corroborationSettled = (corroboration) => {
  if (!corroboration || !corroboration.sought) return null;
  const n = (corroboration.hops || []).length;
  if (corroboration.corroborated) {
    const src = (corroboration.sources || [])[0];
    const where = src?.title || src?.url;
    return `Corroborated by an independent source${where ? ` — ${where}` : ''}.`;
  }
  return `I searched ${n} lead${n === 1 ? '' : 's'} and couldn't find an independent source that corroborates this — treat it as single-source.`;
};
