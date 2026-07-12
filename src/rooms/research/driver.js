// EO: SYN·EVA·REC(Field,Network → Network,Paradigm, Composing,Tracing) — runGroundedResearch — the writer
// research/driver.js — the grounded research driver (docs/deep-research-log.md).
//
// Wires the machinery that already exists into ONE run that only appends
// ResearchEvents; the report is projectReport(log) afterward. The disciplines,
// unchanged:
//
//   retrieval/relevance  the bind measurement, not a model judgment — a span is
//                        relevant iff it binds to the frame subject above the
//                        null (surfer/answerable.js fieldVerdict)
//   extraction           selection — you cannot hallucinate a fact you quote by
//                        reference (the span address is the fact)
//   importance           the enacted significance loop: causal calibration
//                        (core/enacted calibrateReader), confirm/strain, leaky
//                        strain, REC on accumulation — importance is earned
//   corroboration        proposition equivalence, mechanical (an injected
//                        embedder rides perceiver/proposition-equivalence.js;
//                        offline, a transparent term-overlap fallback)
//   asking               fires on the measured conditions only: the preliminary
//                        DISAMBIGUATE clarification (a homonym subject), VOID,
//                        fork, REC, depth, and the corpus preliminary. Every ask
//                        is ADVISORY — surfaced and logged, never a gate: the run
//                        proceeds on its best-guess plan whether or not it is
//                        answered (the injected `ask` is null by default, so the
//                        run does not block on the human either)
//   the model            confined to ONE phrasing call per section, fed
//                        verbatim excerpts only, and bind-checked: every
//                        summary sentence must bind to a source span above the
//                        null or it is greyed as glue
//
// Everything is injectable (search, pin fetch, model, ask, clock) and the run
// is offline-safe: no model → a spans-only report; no fetch → local pins; an
// off-topic corpus → a measured VOID, never a false-matched report (the Bieber
// non-regression, tests/research-log.test.js).

import {
  openResearch, pinSource, readSpan, extractProposition, evaTest, conEdge,
  recFrame, voidAbsence, askUser, answerAsk, promoteProposition, phraseSection,
} from './events.js';
import { projectReport } from './project.js';
import { pinPayload, locateSpan } from '../archive/pin.js';
import { admitWebSource } from '../../organs/ingest/websource.js';
import { fieldVerdict, ANSWERABLE_ALPHA } from '../../surfer/answerable.js';
import { researchTerms, profileOf, curiosityOf, foldInto, leadsFrom, nextQuery } from '../../turn/research.js';
import { calibrateReader } from '../../core/enacted/loop.js';
import { OPERATORS } from '../../core/operators.js';
import { terrainOf, stanceOf } from '../../core/cube.js';
import { MAX_FANOUT, MAX_DEPTH } from '../../frame/constants.js';

// ── The lexical operator reading (the addressing fallback) ──────────────────
// The cube address of a reported change, read from surface cues. An injected
// classifier (opts.addressOf — e.g. the phasepost centroid reader when a model
// is live) takes precedence; this fallback is transparent and deterministic so
// the coverage grid is never a model judgment either. Grain defaults to Figure
// (a specific thing changed); terrain/stance follow from the operator's own
// domain/mode so the fallback address is always on the Object diagonal.
const OP_CUES = [
  ['REC', /\b(renam\w+|reclassif\w+|redefin\w+|refram\w+|restructur\w+|became known as|rebrand\w+)\b/i],
  ['NUL', /\b(withdr\w+|withheld|remov\w+|cancel\w+|denied|refus\w+|declin\w+|never disclosed|undisclosed|suppress\w+|redact\w+)\b/i],
  ['SYN', /\b(merg\w+|integrat\w+|consolidat\w+|combin\w+|unif\w+)\b/i],
  ['SEG', /\b(split|divid\w+|separat\w+|partition\w+|jurisdiction\w*|carve\w*)\b/i],
  ['CON', /\b(contract\w*|agreement\w*|signed|partner\w+|awarded|deal\b|memorandum)\b/i],
  ['INS', /\b(launch\w+|creat\w+|found\w+|establish\w+|deploy\w+|built|introduc\w+|open\w+)\b/i],
  ['EVA', /\b(rul\w+|judg\w+|found that|conclud\w+|critici[sz]\w+|assess\w+|audit\w+|overr[au]n\w*|fail\w+|violat\w+)\b/i],
  ['SIG', /\b(according to|attribut\w+|report\w+ by|cited|stated by)\b/i],
];
export const addressOfSentence = (text) => {
  let op = 'DEF';
  for (const [id, re] of OP_CUES) if (re.test(text)) { op = id; break; }
  const grain = 'Figure';
  return {
    op, grain,
    terrain: terrainOf(OPERATORS[op].domain, grain),
    stance: stanceOf(OPERATORS[op].mode, grain),
  };
};

// ── Offline proposition equivalence (the corroboration fallback) ────────────
// Two spans assert the same proposition when their term sets overlap above
// threshold; the same proposition under opposite polarity is a contradiction.
// The injected-embedder path (perceiver/proposition-equivalence.js) replaces
// this wholesale when a vector reader is live; the shape of the con events is
// identical either way.
const NEG = /\b(not|no|never|denied|denies|refused|refuses|without|didn't|doesn't|isn't|wasn't|weren't)\b/i;
const polarityOf = (text) => (NEG.test(text) ? '-' : '+');
export const termSimilarity = (aTerms, bTerms) => {
  const A = new Set(aTerms), B = new Set(bTerms);
  if (!A.size || !B.size) return { sim: 0, shared: 0 };
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return { sim: shared / Math.min(A.size, B.size), shared };
};

const SIM_THRESHOLD = 0.6;
const SIM_MIN_SHARED = 3;

// ── Output size × research strategy ─────────────────────────────────────────
// Deep research needs a LOT of material — one page is a sketch, not a survey.
// The SIZE preset sets the ambition (how many sources to gather, how deep to
// mine each); the STRATEGY sets the shape of the search. Both feed the gather
// loop below, which keeps searching until the target is met, the leads dry up,
// or the round cap trips. No `search` or no `size` → the corpus is exactly what
// was handed in (every offline test unchanged).
export const SIZE_PRESETS = {
  brief:    { sources: 3,  perSource: 4, facets: 3 },   // a tight answer
  standard: { sources: 6,  perSource: 6, facets: 5 },   // a real write-up
  deep:     { sources: 12, perSource: 8, facets: 6 },   // a survey
};
export const STRATEGIES = {
  // wide and shallow: maximize distinct sources, skim each, expand by new facets
  breadth:  { sourcesMul: 1.6, perSourceMul: 0.6, follow: 'facet' },
  // narrow and deep: fewer sources, mine each, chase the surprising leads far
  depth:    { sourcesMul: 0.6, perSourceMul: 1.7, follow: 'lead' },
  // holonic — the topic as a holarchy: each facet a whole at its own scale,
  // composing into the larger whole. Spread across the cube's kinds of fact (a
  // bit of every operator), seeded by the cues that surface the kinds the
  // coverage grid still lacks, so no aspect is left a stub.
  holonic:  { sourcesMul: 1.0, perSourceMul: 1.0, follow: 'holonic' },
};
// Generic aspect words that pull a subject apart into different facets (breadth).
const FACETS = ['overview', 'history', 'how it works', 'criticism', 'impact', 'types', 'examples', 'recent developments'];
// The cube's operators mapped to query cues that tend to surface that KIND of
// fact — the holonic walk cycles these so the grid fills across every kind
// (each a whole facet) rather than piling more of the same operator.
const OP_FACETS = {
  INS: 'origin history founded',
  EVA: 'criticism assessment controversy',
  CON: 'relationships connections partnerships',
  SEG: 'types classification differences',
  SYN: 'overview synthesis how it works',
  REC: 'evolution reclassification renamed',
  SIG: 'reports studies according to',
  DEF: 'definition what is',
};

// The holonic decomposition — the subject broken into sub-holons, each a whole
// at its own scale, phrased as a natural sub-question so it opens its own frame,
// gather, and section, then composes into the nested report. Ordered to trace
// the cube's kinds (existence → structure → mechanism → evaluation → consequence
// → relation), and trimmed to the size's facet budget.
const HOLON_FACETS = [
  (s) => `origins and history of ${s}`,
  (s) => `types and forms of ${s}`,
  // A NOUN-PHRASE heading (not "how ${s} works"): the subject's grammatical number
  // is unknown here, so a finite verb would mis-agree on a plural subject ("how
  // dolphins works"). The nominal form reads correctly for a singular or plural
  // subject alike.
  (s) => `the inner workings of ${s}`,
  (s) => `criticism and controversy around ${s}`,
  (s) => `impact and significance of ${s}`,
  (s) => `${s} compared with related subjects`,
];
// A task noun that leaked past subject extraction — "dolphins essay", "climate
// report" — would make every facet read "origins and history of dolphins essay"
// (the dolphins audit, 2026-07-04). Drop a single trailing framing noun, but
// only when a real subject word precedes it (so "essay" or "report" as the whole
// subject survives).
const TRAILING_TASK_NOUN = /\s+(?:essays?|reports?|papers?|articles?|overviews?|summar(?:y|ies)|guides?|posts?|write[-\s]?ups?|analys[ei]s|reviews?|briefs?|memos?)\s*$/i;
export const stripTaskFraming = (q) => String(q || '')
  .replace(/^\s*(?:research|about|on|study of)\s+/i, '')
  .replace(TRAILING_TASK_NOUN, '')
  .trim();

export const holonicFacets = (q, n = 5) => {
  const s = stripTaskFraming(q);
  if (!s) return [];
  return HOLON_FACETS.slice(0, Math.max(1, Math.min(HOLON_FACETS.length, n))).map((f) => f(s));
};

// resolveDepth(opts) → { targetSources, perSource, facets, follow } | null. Null means
// no active gather (behave exactly as before): only chosen when a size preset
// is set. Strategy scales the size; an explicit targetSources/perSource wins.
export const resolveDepth = (opts = {}) => {
  const size = SIZE_PRESETS[opts.size] || (opts.size ? SIZE_PRESETS.standard : null);
  if (!size && opts.targetSources == null) return null;
  const strat = STRATEGIES[opts.strategy] || STRATEGIES.holonic;
  const base = size || SIZE_PRESETS.standard;
  return {
    targetSources: opts.targetSources ?? Math.max(1, Math.round(base.sources * strat.sourcesMul)),
    perSource: opts.maxSpansPerSource ?? Math.max(2, Math.round(base.perSource * strat.perSourceMul)),
    facets: base.facets ?? 5,
    follow: strat.follow,
  };
};

// gatherCorpus — widen the seed corpus toward the target with the injected
// `search`. The frontier is seeded by the subject and grown by what the pages
// surface, shaped by the strategy: `facet` fans across generic aspects, `lead`
// chases the most surprising terms (curiosityOf/leadsFrom, the same active-
// inference the walk uses), `coverage` cycles the cube's operator cues so the
// spread of KINDS widens. Novel on-topic pages only (dedup by a text signature);
// bounded by targetSources and a round cap. Pure but for `search`.
const gatherCorpus = async (q, subject, seed, search, { targetSources, maxRounds, follow, k, onBeat }) => {
  const corpus = [...seed];
  if (typeof search !== 'function') return corpus;
  const sig = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 240).toLowerCase();
  const seen = new Set(corpus.map((s) => sig(s.text)));
  const seenQ = new Set();
  const frontier = [];
  const pushQ = (query) => { const s = String(query || '').trim(); if (s && !seenQ.has(s.toLowerCase())) frontier.push(s); };
  // Seed: the plain question first, then the strategy's opening spread.
  pushQ(q);
  const anchor = subject.join(' ') || q;
  if (follow === 'facet') for (const f of FACETS) pushQ(`${anchor} ${f}`);
  if (follow === 'holonic') for (const cue of Object.values(OP_FACETS)) pushQ(`${anchor} ${cue.split(' ')[0]}`);
  let prior = new Map();
  for (const s of corpus) prior = foldInto(prior, profileOf(s.text || ''));
  const need = () => corpus.length < targetSources;
  const cap = Math.max(1, maxRounds);
  let rounds = 0;
  while (frontier.length && (need() || !corpus.length) && rounds < cap) {
    const query = frontier.shift();
    const qk = query.toLowerCase();
    if (seenQ.has(qk)) continue;
    seenQ.add(qk);
    rounds++;
    if (onBeat) { try { onBeat(query, corpus.length, targetSources); } catch { /* a beat never breaks the gather */ } }
    let hits = [];
    try { hits = (await search(query, { k })) || []; } catch { hits = []; }
    for (const h of hits) {
      const text = String(h?.text || '');
      if (text.trim().length < 120) continue;
      const s = sig(text);
      if (seen.has(s)) continue;
      seen.add(s);
      corpus.push(h);
      // Harvest the next queries from THIS page, shaped by the strategy.
      if (follow === 'lead' || follow === 'holonic') {
        const arrival = profileOf(text);
        const { by } = curiosityOf(prior, arrival);
        prior = foldInto(prior, arrival);
        for (const lead of leadsFrom(by, { max: follow === 'lead' ? 3 : 1 })) pushQ(nextQuery(anchor, lead));
      }
      if (!need()) break;
    }
  }
  return corpus;
};

// ── Extractable span guard (the mis-split-fragment gate) ────────────────────
// A span is only a proposition if it is a WELL-FORMED sentence. The prose parser
// splits on sentence punctuation, and a period inside an abbreviation or a
// taxonomic initial ("I. g. geoffrensis (Amazon river dolphin), I. g.
// boliviensis …") splinters one line into head-less fragments — "geoffrensis
// (Amazon river dolphin), I. g.", "boliviensis (Bolivian river dolphin) and
// I. g." Those fragments still carry the subject term ("dolphin") so they bind
// and, unguarded, surfaced as the run's top "propositions" — the dolphin-mating
// audit (2026-07-07): the panel's findings read as noise. A real claim starts
// like a sentence (capital / digit / quote / open-paren), carries enough words
// to state something, and does not trail off on an orphaned initial. This gates
// only what is EXTRACTED (the visible propositions); the bind/void measurement
// upstream is untouched, so a source of only fragments still reads as present,
// and if that is all it has, the frame voids honestly instead of quoting rubble.
const SPAN_WORD = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;
export const isWellFormedSpan = (text) => {
  const t = String(text || '').trim();
  if (t.length < 24) return false;                 // too short to carry a claim
  const words = t.match(SPAN_WORD) || [];
  if (words.length < 4) return false;              // a label or a fragment, not a statement
  if (/^[a-z]/.test(t)) return false;              // a mid-sentence continuation from a mis-split
  const last = words[words.length - 1];            // trails off on an orphaned initial ("… I. g.")
  if (last.length === 1 && /[a-z]/.test(last) && /\s[A-Za-z]\.\s*[a-z]\.?$/.test(t)) return false;
  return true;
};

// ── The run ──────────────────────────────────────────────────────────────────
//
// runGroundedResearch(question, opts) → { log, report }
//
//   sources        [{ url?, title?, text }] — the pinned corpus (pasted or fetched)
//   search         async (query) => [{ url?, title?, text }] — optional, widens the corpus
//   subQuestions   [string] — sub-frames to push under the root (the frame tree)
//   model          { phrase: async (messages) => string } — the ONE checked call per section
//   ask            async (askEvent) => string|null — the human in the loop; null leaves it open
//   fetch, now     for archive pinning (offline default: local pins)
//   alpha          the hallucination budget (ANSWERABLE_ALPHA) — larger asks less
//   maxSpansPerSource / maxPerSection — extraction and promotion caps, logged, not silent
//   onEvent        (event, log) => void — the live view's feed
export const runGroundedResearch = async (question, opts = {}) => {
  const {
    sources = [], search = null, subQuestions = [],
    model = null, ask = null, fetch: netFetch = null, now = null, save = true,
    // The sense thumb (turn/disambiguate.js), injected: async (subject) → a sense
    // prior { sense, alternatives, collision } | null. Used ONLY to decide whether
    // to surface the preliminary DISAMBIGUATE clarification below — it names the
    // rival senses a homonym subject binds to. Absent (offline / no model) → no
    // preliminary ask ever fires, so a model-free run is byte-identical to before.
    disambiguate = null,
    // Turn the advisory preliminary clarification off entirely (it is on by default
    // but is itself gated by `disambiguate` finding a genuine homonym, so leaving it
    // on costs nothing on an unambiguous subject).
    clarify = true,
    alpha = ANSWERABLE_ALPHA, addressOf = addressOfSentence,
    maxSpansPerSource = 6, maxPerSection = 12,
    // compose:'essay' — let the model WRITE a flowing essay from the grounded
    // excerpts (one composition, no imposed section types) instead of the terse
    // per-section summary. Absent → the summary phrasing, byte-identical to before.
    compose = null,
    onEvent = null,
    // The per-section streaming seam: when the host wants to show a section's
    // summary as the model writes it (not only when the whole run lands), it
    // passes onSectionToken(frameId, piece) and each decoded delta of that
    // section's ONE phrasing call is forwarded live. Absent → the phrase call is
    // made exactly as before (no onToken), so every offline test is byte-identical.
    onSectionToken = null,
    // The LIVE-surface seam: pass an existing log to APPEND this run to it — the
    // surface is a projection of the whole log, so further research via chat
    // keeps populating the same report (never a dead artifact). `rootId`
    // namespaces this run's frames; pin/prop/ask counters continue from the
    // log so ids never collide across runs.
    log = [],
    rootId = log.some((e) => e.kind === 'open') ? `r${log.filter((e) => e.kind === 'open' && e.parentId == null).length}` : 'root',
  } = opts;

  let t = log.length ? Math.max(...log.map((e) => e.t ?? 0)) + 1 : 0;
  const emit = (e) => { log.push(e); if (onEvent) { try { onEvent(e, log); } catch { /* view errors never stop the run */ } } return e; };
  const tick = () => t++;
  let askN = log.filter((e) => e.kind === 'ask').length;
  let pinN = log.filter((e) => e.kind === 'pin').length;
  let propN = log.filter((e) => e.kind === 'extract').length;

  const q = String(question || '').trim();
  const subject = researchTerms(q);
  const depth = resolveDepth(opts);
  const perSourceCap = depth ? depth.perSource : maxSpansPerSource;

  // Holonic strategy with no explicit sub-questions AUTO-DECOMPOSES the subject
  // into facet sub-frames — each a sub-holon gathered to its own mini-target and
  // composed into the nested report. Explicit sub-questions always win; offline
  // (no search) the facets still structure the read over the seed corpus.
  const holonic = depth?.follow === 'holonic';
  const perHolon = holonic && !!search; // read per-sub-holon vs. over the whole corpus
  const effectiveSubQs = subQuestions.length ? subQuestions
    : (holonic ? holonicFacets(q, depth.facets) : []);

  // The root frame of THIS run. Sub-questions push child frames under it (the
  // frame stack); the depth guard is the shared runaway guard, reused unchanged.
  emit(openResearch({ id: rootId, question: q, subject, scope: { alpha }, depth: 0, t: tick() }));

  // ── Preliminary clarification — advisory, never gating ──────────────────────
  // Before anything is gathered, if the subject is genuinely AMBIGUOUS — it binds
  // to more than one entity (a homonym: "dolphins" the marine mammal vs. the NFL
  // team; "mercury" the planet, the metal, the god) — surface ONE clarifying ask
  // so the user can say which they meant. Deliberately restrained, in exactly the
  // three ways the human asked for:
  //   • it does NOT trigger too often — it fires only on a MEASURED homonym (the
  //     injected `disambiguate`, the only reader with the world knowledge to know
  //     "dolphins" names two things, returning rival senses), at most ONCE per run,
  //     and it is deduped against the shared session log so re-researching the same
  //     subject never re-asks. No disambiguator → it never fires, so every
  //     model-free run is byte-identical.
  //   • it does NOT gate the research — the run neither waits on it (the injected
  //     `ask` is null by default) nor changes what it gathers based on the reply;
  //     the gather proceeds on the best-guess sense regardless, and the clarification
  //     is surfaced (chat reply + trace) as an offer to refocus, not a prerequisite.
  await maybeAskDisambiguate({
    q, rootId, clarify, disambiguate, ask, emit, tick,
    nextAskId: () => `ask:${askN++}`, log,
  });

  const kids = effectiveSubQs.slice(0, MAX_FANOUT).map((sq, i) => {
    const id = `${rootId}.${i}`;
    emit(openResearch({ id, parentId: rootId, question: String(sq), subject: researchTerms(sq), depth: 1, t: tick() }));
    return { id, question: String(sq) };
  });
  if (effectiveSubQs.length > MAX_FANOUT) {
    const a = askUser({
      id: `ask:${askN++}`, frameId: rootId, trigger: 'depth',
      text: `The plan spawned ${effectiveSubQs.length} threads; the budget is ${MAX_FANOUT}. Which to pursue?`,
      options: effectiveSubQs.map(String), t: tick(),
    });
    emit(a);
    const reply = ask ? await safeAsk(ask, a) : null;
    if (reply != null) emit(answerAsk({ askId: a.id, reply, t: tick() }));
  }
  const frames = [{ id: rootId, question: q }, ...kids].filter((f) => f.question);
  // Holonic splits the source budget across the sub-holons: the root gathers a
  // light general footing, each facet gathers its own share.
  const perFacetTarget = depth ? Math.max(2, Math.round(depth.targetSources / frames.length)) : 0;

  // Preliminary — the corpus must be a specified cell-region, not a vague string.
  // A size preset turns the single-shot fallback into a gather-to-target loop:
  // keep searching until there is enough grounded material for the requested
  // size, shaped by the strategy (breadth / depth / holonic).
  let corpus = [...sources];
  if (search && (depth || !corpus.length)) {
    corpus = await gatherCorpus(q, subject, corpus, search, {
      // Under holonic decomposition the root takes only a light general footing
      // (chase the subject's own leads) and leaves the facet-specific pages for
      // the sub-holons to claim; otherwise it gathers the full strategy shape.
      targetSources: depth ? Math.max(perHolon ? perFacetTarget : depth.targetSources, corpus.length) : 1,
      maxRounds: opts.maxRounds ?? (depth ? Math.max(6, depth.targetSources * 2) : 1),
      follow: perHolon ? 'lead' : (depth ? depth.follow : 'lead'),
      k: opts.perQuery ?? 4,
      onBeat: opts.onGather || null,
    });
  }
  if (!corpus.length) {
    const a = askUser({
      id: `ask:${askN++}`, frameId: rootId, trigger: 'corpus',
      text: 'No pinned corpus and no search — which sources, what dates?', t: tick(),
    });
    emit(a);
    const reply = ask ? await safeAsk(ask, a) : null;
    if (reply != null) emit(answerAsk({ askId: a.id, reply, t: tick() }));
    emit(voidAbsence({ frameId: rootId, terrain: 'Entity-gap', receipt: 'no sources pinned', t: tick() }));
    return { log, report: projectReport(log) };
  }

  // Pin every source BEFORE it is read — the provenance anchor. The pin
  // degrades to a local record offline; the content hash never degrades. A
  // source already pinned in this log (same content hash — a follow-up ask
  // over the same corpus) reuses its pin: one snapshot, many reads. `pinInto`
  // is reusable so a facet frame can pin its own freshly-gathered sources into
  // the same working set mid-run.
  const priorPins = new Map(log.filter((e) => e.kind === 'pin').map((e) => [e.contentHash, e.id]));
  const pinned = [];
  const pinnedById = new Map();
  const pinnedHashes = new Set();
  // Pin a list of sources; return the ids of the ones NEWLY added to this run's
  // working set (so a sub-holon owns exactly the sources it first introduced).
  const pinInto = async (list) => {
    const added = [];
    for (const src of list) {
      const text = String(src.text || '');
      if (!text.trim()) continue;
      const payload = await pinPayload({ url: src.url ?? null, title: src.title ?? null, text, fetch: netFetch, save, now });
      if (pinnedHashes.has(payload.contentHash)) continue; // already owned by an earlier frame
      pinnedHashes.add(payload.contentHash);
      let pinId = priorPins.get(payload.contentHash);
      if (!pinId) {
        pinId = `pin:${pinN++}`;
        emit(pinSource({ id: pinId, ...payload, t: tick() }));
        priorPins.set(payload.contentHash, pinId);
      }
      const entry = { pinId, text, doc: admitWebSource({ url: src.url || `pinned:${pinId}`, text }).doc, title: src.title ?? null };
      pinned.push(entry);
      pinnedById.set(pinId, entry);
      added.push(pinId);
    }
    return added;
  };
  // The root owns the general footing; each holonic facet owns its own gather.
  const framePins = new Map();
  framePins.set(rootId, await pinInto(corpus));

  // ── Per-frame: gather (holonic), bind, VOID-gate, extract, significance ────
  for (const frame of frames) {
    const fq = frame.question;
    const fTerms = researchTerms(fq);

    // A holonic facet is its own whole: it gathers its OWN sources to a
    // mini-target before it reads, so the sub-holon stands on material it went
    // and found — not just leftovers of the root's gather. Root gathers the
    // general footing above; offline (no search) this is a no-op.
    if (perHolon && frame.id !== rootId) {
      const facetCorpus = await gatherCorpus(fq, fTerms, [], search, {
        targetSources: perFacetTarget,
        maxRounds: opts.maxRounds ?? Math.max(4, perFacetTarget * 2),
        follow: 'lead',
        k: opts.perQuery ?? 4,
        onBeat: opts.onGather || null,
      });
      framePins.set(frame.id, await pinInto(facetCorpus));
    }

    // Which sources this frame READS, and what it binds against. Under holonic
    // decomposition each sub-holon reads only the sources IT owns, bound to the
    // subject (the facet's descriptor steered the gather, not the bind — those
    // words rarely appear in the prose). Otherwise the frame reads the whole
    // corpus, bound to its own question terms (unchanged).
    const readSet = perHolon ? (framePins.get(frame.id) || []).map((id) => pinnedById.get(id)).filter(Boolean) : pinned;
    const bindTerms = perHolon ? subject : fTerms;
    if (perHolon && !readSet.length) continue; // this sub-holon found no sources — leave its section empty

    // The bind measurement per source: score each sentence by its overlap with
    // the frame subject; the spans that clear the strong gate are the reads.
    let anyBind = false;
    const extracts = []; // { pinId, sentence, idx, score }
    for (const p of readSet) {
      const sentences = p.doc.sentences || [];
      const scored = sentences.map((s, idx) => {
        const toks = p.doc.tokensBySentence?.[idx];
        let overlap = 0;
        for (const term of bindTerms) if (toks?.has(term)) overlap++;
        return { idx, sentence: s, overlap, score: bindTerms.length ? overlap / bindTerms.length : 0 };
      });
      const spans = scored.filter((x) => x.overlap > 0).map((x) => ({ idx: x.idx, score: x.score }));
      const verdict = fieldVerdict(p.doc, fq, spans, { alpha });
      if (verdict.void) {
        // This source is silent on the frame — a read that measured nothing is
        // still a measurement, but nothing here may be extracted.
        continue;
      }
      anyBind = true;
      const strong = scored.filter((x) => (x.overlap >= 2 || x.score >= 0.5) && isWellFormedSpan(x.sentence))
        .sort((a, b) => b.overlap - a.overlap).slice(0, perSourceCap);
      for (const hit of strong) {
        const span = locateSpan(p.text, hit.sentence);
        emit(readSpan({
          frameId: frame.id, pinId: p.pinId, span: { ...span, sentence: hit.idx },
          bind: { score: round3(hit.score), overlap: hit.overlap, pass: true }, t: tick(),
        }));
        extracts.push({ pinId: p.pinId, sentence: hit.sentence, idx: hit.idx, span, score: hit.score });
      }
    }

    // The VOID gate, turned into a question rather than a flat "does not say".
    if (!anyBind || !extracts.length) {
      const named = (fq.match(/\b[A-Z][A-Za-z'’-]{2,}\b/g) || []).filter((w) => !fTerms.includes(w.toLowerCase()));
      const inCorpus = readSet.some((p) => p.doc.sentences?.some((s, i) => bindTerms.some((term) => p.doc.tokensBySentence?.[i]?.has(term))));
      const terrain = !inCorpus && subject.length ? 'elsewhere' : 'never-set';
      emit(voidAbsence({
        frameId: frame.id, terrain,
        receipt: `scanned ${pinned.reduce((n, p) => n + (p.doc.sentences?.length || 0), 0)} sentences across ${pinned.length} pinned source${pinned.length === 1 ? '' : 's'}`,
        term: terrain === 'elsewhere' ? (named[0] ?? fTerms[0] ?? null) : null, t: tick(),
      }));
      const a = askUser({
        id: `ask:${askN++}`, frameId: frame.id, trigger: 'void',
        text: `The pinned set is silent on “${fq}” — widen the corpus, supply a source, or record the absence?`, t: tick(),
      });
      emit(a);
      const reply = ask ? await safeAsk(ask, a) : null;
      if (reply != null) emit(answerAsk({ askId: a.id, reply, t: tick() }));
      continue;
    }

    // Extraction is selection: each strong span becomes a grounded proposition
    // at its cube address. The span address IS the fact.
    const frameProps = [];
    for (const ex of extracts) {
      const id = `prop:${propN++}`;
      const terms = researchTerms(ex.sentence);
      emit(extractProposition({
        id, frameId: frame.id, pinId: ex.pinId, span: { ...ex.span, sentence: ex.idx },
        terms, address: addressOf(ex.sentence), t: tick(),
      }));
      frameProps.push({ id, terms, sentence: ex.sentence, pinId: ex.pinId });
    }

    // The enacted significance loop over the extracts, in arrival order, with
    // the causal discipline: the band that judges an extract is fit from the
    // surprises seen strictly before it (calibrateReader over the past only),
    // so a fact is important because it broke the frame AS IT STOOD when the
    // fact arrived. Strain leaks per arrival; a cluster of anomaly breaks the
    // frame (REC), and the spans that forced it are the reframings.
    let prior = profileOf(fq);
    const seen = [];
    let strain = 0;
    const LEAK = 0.9;
    let sinceRec = [];
    const axisStrain = new Map();
    for (const pr of frameProps) {
      const arrival = profileOf(pr.sentence);
      const cur = curiosityOf(prior, arrival);
      const s = cur.bits;
      const cal = calibrateReader(seen, { layers: ['proposition'], defaults: { proposition: 1.5 }, defaultBand: 0.25 });
      const band = cal.confirmBand;
      const threshold = cal.thresholds.proposition;
      const verdict = s < band ? 'confirm' : 'strain';
      const delta = Math.max(0, s - band);
      strain = strain * LEAK + delta;
      emit(evaTest({
        propId: pr.id, frameId: frame.id, verdict,
        surprise: s, strainDelta: delta, strain, band, threshold, t: tick(),
      }));
      if (verdict === 'strain') {
        sinceRec.push(pr.id);
        for (const [term, w] of Object.entries(cur.by || {})) {
          if (w > 0) axisStrain.set(term, (axisStrain.get(term) || 0) + w);
        }
      }
      if (strain >= threshold && sinceRec.length) {
        // The reframing must NAME what the topic reorganized around — a term the
        // frame did not already stand on. Rank by accumulated strain, drop the
        // terms the frame already carries (a reframe onto its own DEF terms is
        // not a reframe), and require a term with some body so a label never
        // reads as a hedge. Fall back to the forcing span's own distinctive
        // terms, filtered the same way, before ever emitting a bare token.
        const from = fTerms.slice(0, 3);
        const meaningful = (t) => t && t.length >= 4 && !from.includes(t);
        const ranked = [...axisStrain.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
        let axis = ranked.filter(meaningful).slice(0, 3);
        if (!axis.length) axis = pr.terms.filter(meaningful).slice(0, 3);
        if (!axis.length) axis = (ranked.length ? ranked : pr.terms).slice(0, 3);
        emit(recFrame({
          frameId: frame.id, forcedBy: [...sinceRec], strainSum: strain,
          from, to: axis,
          trigger: 'accumulation', t: tick(),
        }));
        const a = askUser({
          id: `ask:${askN++}`, frameId: frame.id, trigger: 'rec',
          text: `The frame just restructured around ${axis.join(', ') || 'new terms'} — the topic got reconceived. Continue on the new frame?`, t: tick(),
        });
        emit(a);
        const reply = ask ? await safeAsk(ask, a) : null;
        if (reply != null) emit(answerAsk({ askId: a.id, reply, t: tick() }));
        strain = 0; sinceRec = []; axisStrain.clear();
      }
      seen.push(s);
      prior = foldInto(prior, arrival);
    }

    // Corroboration / contradiction — proposition equivalence across DISTINCT
    // pins (a source cannot corroborate itself). A contradiction neither side
    // of which is corroborated is a fork the loop cannot settle: hand it over.
    const corroborated = new Set();
    const forks = [];
    for (let i = 0; i < frameProps.length; i++) {
      for (let j = i + 1; j < frameProps.length; j++) {
        const a = frameProps[i], b = frameProps[j];
        if (a.pinId === b.pinId) continue;
        const { sim, shared } = termSimilarity(a.terms, b.terms);
        if (sim < SIM_THRESHOLD || shared < SIM_MIN_SHARED) continue;
        const rel = polarityOf(a.sentence) === polarityOf(b.sentence) ? 'corroborate' : 'contradict';
        emit(conEdge({ relation: rel, a: a.id, b: b.id, sim, t: tick() }));
        if (rel === 'corroborate') { corroborated.add(a.id); corroborated.add(b.id); }
        else forks.push([a, b]);
      }
    }
    for (const [a, b] of forks) {
      if (corroborated.has(a.id) || corroborated.has(b.id)) continue; // corroboration broke the tie
      const ev = askUser({
        id: `ask:${askN++}`, frameId: frame.id, trigger: 'fork',
        text: `Two sources pull in opposite directions with no corroboration breaking the tie:\n(a) “${a.sentence}”\n(b) “${b.sentence}”`, t: tick(),
      });
      emit(ev);
      const reply = ask ? await safeAsk(ask, ev) : null;
      if (reply != null) emit(answerAsk({ askId: ev.id, reply, t: tick() }));
    }

    // Promote — the propositions enter the report at this section. The cap is
    // logged by the count itself (promoted vs. extracted), never silent.
    for (const pr of frameProps.slice(0, maxPerSection)) {
      emit(promoteProposition({ propId: pr.id, frameId: frame.id, t: tick() }));
    }

    // The model, confined to checked phrasing: ONE call for this section, fed
    // verbatim excerpts only — never operator codes, never cube vocabulary (the
    // anti-bleed talker discipline). Every summary sentence binds back to a
    // span above the null or it is greyed as glue. No model → no summary; the
    // section stands on its spans (never worse than today).
    if (model?.phrase && frameProps.length) {
      // compose:'essay' lets the model WRITE from the grounded excerpts (a flowing,
      // multi-paragraph essay) instead of the terse per-section summary — no imposed
      // section types, the composition is the model's. Still excerpt-confined and
      // bind-checked: claim sentences carry a citation, connective prose reads as
      // glue. Absent → the exact 2-5-sentence summary as before.
      const essay = compose === 'essay';
      const messages = [
        { role: 'system', content: essay
          ? 'Using ONLY the facts in the numbered excerpts, write a flowing, well-organized essay on the topic. Do NOT add facts, names, numbers, or dates that are not in them — draw the essay together from what the excerpts say. Write connected paragraphs, an essay, not a list.'
          : 'Summarize ONLY from the numbered excerpts. Do not add facts, names, numbers, or dates that are not in them. Plain prose, 2-5 sentences.' },
        { role: 'user', content: `${essay ? 'Topic' : 'Question'}: ${fq}\n\nExcerpts:\n${frameProps.map((p, i) => `${i + 1}. ${p.sentence}`).join('\n')}` },
      ];
      let out = '';
      // Stream this section's deltas to the host when it asked (onSectionToken);
      // otherwise call phrase() with no opts, exactly as before. An essay wants room
      // to breathe, so lift the token budget when composing one.
      const baseOpts = essay ? { maxTokens: 900 } : null;
      const phraseOpts = onSectionToken
        ? { ...(baseOpts || {}), onToken: (piece) => { try { onSectionToken(frame.id, String(piece || '')); } catch { /* a view error never stops the run */ } } }
        : baseOpts;
      try { out = String(await (phraseOpts ? model.phrase(messages, phraseOpts) : model.phrase(messages)) || ''); } catch { out = ''; }
      if (out.trim()) {
        // Drop the instruction-echo the small model sometimes prepends ("Here is a
        // summary … in plain prose, 2-5 sentences:") — it is the prompt bouncing
        // back, not content, and would otherwise render as a glue sentence. The
        // raw output is preserved verbatim in the event (audit); only the rendered
        // sentences are cleaned.
        const sentences = splitSentences(stripInstructionPreamble(out)).map((sTxt) => {
          const sTerms = researchTerms(sTxt);
          let best = null, bestShared = 0;
          for (const p of frameProps) {
            const { shared } = termSimilarity(sTerms, p.terms);
            if (shared > bestShared) { bestShared = shared; best = p; }
          }
          const bound = bestShared >= 2;
          return { text: sTxt, boundTo: bound ? best.id : null, glue: !bound };
        });
        // The prompt and the raw output ride in the event — the audit of the
        // run's one generative step, exportable with the rest of the surf.
        emit(phraseSection({
          frameId: frame.id, sentences, dropped: 0,
          model: model.name ?? 'model', prompt: messages, raw: out, t: tick(),
        }));
      }
    }
  }

  return { log, report: projectReport(log) };
};

const safeAsk = async (ask, ev) => { try { return await ask(ev); } catch { return null; } };

// The preliminary DISAMBIGUATE clarification (see the call site). Kept a small pure
// helper so the run body reads as one flow and the "don't nag / don't gate" rules
// live in one place. It:
//   1. no-ops unless clarification is on AND a disambiguator was injected;
//   2. no-ops if a disambiguate ask was ALREADY raised for this exact question
//      anywhere in the (session-wide) log — so a second ask about the same subject
//      is silent (dedup across runs, not just within one);
//   3. asks the disambiguator whether the subject is a homonym, and only when it
//      names RIVAL senses (alternatives) emits ONE `disambiguate` ask — the
//      committed sense plus the alternatives as options — then optionally awaits the
//      injected `ask` and logs the reply. It returns either way; the caller carries on.
// Any throw from the injected disambiguator is swallowed: an ambiguity check that
// fails must never take the whole run down with it.
const maybeAskDisambiguate = async ({ q, rootId, clarify, disambiguate, ask, emit, tick, nextAskId, log }) => {
  if (!clarify || typeof disambiguate !== 'function') return;
  // Dedup across the whole log: a disambiguate ask already raised for a frame whose
  // question matches this one (case-insensitive) means we've offered this choice
  // before — do not offer it again.
  const qKey = q.trim().toLowerCase();
  const qOfFrame = new Map(log.filter((e) => e.kind === 'open').map((e) => [e.id, String(e.question ?? '').trim().toLowerCase()]));
  const askedBefore = log.some((e) => e.kind === 'ask' && e.trigger === 'disambiguate'
    && e.frameId !== rootId && qOfFrame.get(e.frameId) === qKey);
  if (askedBefore) return;

  let prior = null;
  try { prior = await disambiguate(q); } catch { prior = null; }
  const alts = prior && Array.isArray(prior.alternatives)
    ? prior.alternatives.map((a) => String(a?.sense || '').trim()).filter(Boolean) : [];
  if (!prior || !prior.sense || !alts.length) return; // unambiguous (or nothing to offer) → stay quiet

  const away = prior.collision ? ` (not ${prior.collision})` : '';
  const a = askUser({
    id: nextAskId(), frameId: rootId, trigger: 'disambiguate',
    text: `“${q}” could mean more than one thing — I'm reading it as ${prior.sense}${away} and researching that. `
        + `If you meant one of the others, tell me which and I'll refocus:`,
    options: [prior.sense, ...alts], t: tick(),
  });
  emit(a);
  const reply = ask ? await safeAsk(ask, a) : null;
  if (reply != null) emit(answerAsk({ askId: a.id, reply, t: tick() }));
};
// Strip a leading instruction-echo the small model prepends to its summary — the
// system prompt bounced back ("Here is a summary of … in plain prose, 2-5
// sentences:", a bare "Summary:"/"In summary:"). Only a LEADING framing clause up
// to its first colon is removed; never strips to empty (a summary that legitimately
// opens with such a clause and nothing after keeps its text).
const stripInstructionPreamble = (text) => {
  let t = String(text || '');
  t = t.replace(/^\s*here\s+(?:is|are)\b[^:]{0,200}\bsummar[^:]{0,200}:\s*/i, '');
  t = t.replace(/^\s*(?:in\s+)?summary\s*:\s*/i, '');
  return t.trim() || String(text || '').trim();
};
// Split into sentences WITHOUT breaking inside a decimal ("9.5 m"), an
// abbreviation ("e.g."), or an initial — the period between two digits (or the
// dots in a short lower-case abbreviation) is not a sentence boundary. Guarding
// them keeps a citation from landing mid-number ("to the 9. [1] 5m-long orca").
const splitSentences = (text) => {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  // Mask the dots that are NOT sentence boundaries (decimals like "9.5", short
  // abbreviations like "e.g."/"U.S.") with a private-use sentinel, split, then
  // unmask — so a citation can never land mid-number ("to the 9. [1] 5m orca").
  const DOT = "\uE000";
  const guarded = t
    .replace(/(\d)\.(\d)/g, "$1" + DOT + "$2")
    .replace(/\b([a-z])\.([a-z])\./gi, "$1" + DOT + "$2" + DOT);
  const parts = guarded.match(/[^.!?]+[.!?]+(?:["'”’)\]]+)?|[^.!?]+$/g) || [];
  return parts.map((x) => x.replace(new RegExp(DOT, "g"), ".").trim()).filter(Boolean);
};
const round3 = (x) => Math.round(x * 1000) / 1000;
