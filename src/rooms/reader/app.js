// EO: CON·INS(Network,Void → Entity,Link, Making,Binding) — the reader room's session controller
// The reader app — the stateful session the dc surface renders. Everything the
// surface shows lives here as plain data; everything it does routes through the
// engine holons. The surface never computes, the engine never renders.
//
//   sources    the S-registry — every recorded page/file/paste, sha'd + parsed
//   topics     research topics — each scopes a source set, a chat, and a memo
//   ask()      one chat turn through turn/runTurn (model + embedder DI'd)
//   ingest*()  URL / search / file / paste, through the organs + admission core
//   entities() the admitted referents across the topic's docs (the explorer)
//   provenance() the session's claim→passage→source→fixity DAG (the graph tab)
//
// Persistence is IndexedDB (text + chat survive reload; docs re-parse lazily).
// Work still IN FLIGHT survives too: a fetch / file import / transcription opens a
// durable job (ingest-jobs.js) that rides the snapshot and is RESUMED on the next
// boot, so ingestion and transcription survive a reload even part-way through.
// In Node (tests) there is no indexedDB and no fetch — every method that needs
// one degrades to a no-op or a thrown, catchable error; nothing at import time
// touches the network.

import { parseText } from '../../perceiver/parse/index.js';
import { promoteConnection } from '../../enactor/connect/index.js';
import { speakTriples, talkThenVerify } from '../../weave/write/index.js';
import { projectGraph, operatorsOf, glyphOf } from '../../core/index.js';
import { createModel, describeModel } from '../../model/interface.js';
import { wrapRedacting } from '../../model/redact-remote.js';
import { probeOrigins, explainReach } from '../../model/reach.js';
import { createHashEmbedder, createMiniLMEmbedder, withPersistentEmbedCache } from '../../model/index.js';
import { runTurn, runWebFollowup, formulateSearchQuery, searchAnnouncement,
         runTurnWithResearch, runCuriousResearch, researchAnnouncement, modelDisambiguator, senseAnnouncement,
         runTurnWithCorroboration, corroborationAnnouncement, corroborationSettled,
         readDiscourse, clarifyDemandOf, loadShapeLibrary } from '../../turn/index.js';
import { loadShapeGrammars } from '../../turn/shape-grammar.js';
import { extendLibraryWithNavPool } from '../../turn/nav-pool.js';
import { createWebClient, htmlToText, wikiExtract, searchAndAdmit } from '../../organs/ingest/webfetch.js';
import { directCorsUrl } from '../../organs/ingest/direct-cors.js';
import { admitWebSource, webContentHash } from '../../organs/ingest/websource.js';
import { GUTENBERG_FULLTEXT } from '../../organs/ingest/gutenberg.js';
import { WIKIMEDIA_FULLTEXT } from '../../organs/ingest/wikimedia.js';
import { readIngest } from '../../organs/ingest/read.js';
import { emitEot } from '../../organs/ingest/eot-emit.js';
import { scopeSources } from './scope-sources.js';
import { createAudioStore } from './audio-store.js';
import { makeJob, upsertJob, patchJob, dropJob, resumableJobs, MAX_JOB_ATTEMPTS } from './ingest-jobs.js';
import { projectTranscript } from './transcript-edit.js';
import { sha256Hex } from '../archive/file-crypto.js';
import { outstandingQuestion, answersAwaited } from '../../core/conversation-fold.js';
import { senseGate } from '../../turn/sense.js';
import { createMonitor } from '../../enactor/monitor.js';
import { createCommitmentLedger } from '../../enactor/ledger.js';
import { answerSmalltalk } from '../../enactor/answer/index.js';
import { figureSurface, rankProperties } from '../../perceiver/index.js';
import { generateTopline, entityInventory, sourceInventory, interpretFeedback, mergeSteer } from '../../weave/topline/index.js';
import { discourseDag, assertedDag } from '../../surfer/dag/index.js';
import { createDeepReader } from '../../surfer/fold/deep-reading.js';
import { surfFold } from '../../surfer/index.js';
import { buildChatExport } from './chat-export.js';
import { wikiReferent } from './wiki-referent.js';
import { composeProvenance, repoRef, readBuild, fetchLatestCommit, APP_NAME, APP_VERSION } from './provenance.js';
import { foldNarrative } from './fold-narrative.js';
import { deriveTopicTitle, isDefaultTopicTitle, DEFAULT_TOPIC_TITLE } from './topic-name.js';

// ── the proxy chain ───────────────────────────────────────────────────────────
// The primary is the n8n feed proxy (webfetch's default); when it fails the two
// public CORS proxies are tried in order, same target. The chain rides UNDER
// createWebClient: the client builds its primary-proxied URL, this fetchImpl
// recovers the target and walks the chain — so search kinds, wiki extracts and
// page fetches all inherit the fallback without knowing it exists.
const PROXY_FORMS = [
  (u) => `https://n8n.intelechia.com/webhook/feed?url=${encodeURIComponent(u)}`,
  // corsproxy.io was dropped: its free tier now returns a 200 HTML landing page (no CORS
  // header) for every request, so it poisoned the chain — a fake "success" that hid a real
  // failure and blocked the working fallback below. allorigins is the public backstop for a
  // fully-down primary; n8n (the reader's own feed proxy) carries the normal load.
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

const targetOf = (proxiedUrl) => {
  try { return new URL(proxiedUrl).searchParams.get('url') || proxiedUrl; }
  catch { return proxiedUrl; }
};

// fetchTimed cuts a stalled proxy connection loose two ways: a per-request TIMEOUT and the
// caller's abort `signal` (the Stop button / the turn's stall watchdog). 4.1's proxyFetch
// chained the caller signal so Stop halted an in-flight fetch; 4.2 had dropped it, so a
// hung fetch ignored Stop and the turn ground through the full timeout with no way out.
const fetchTimed = (url, { ms = 20000, signal = null } = {}) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  const relay = () => { try { c.abort(); } catch { /* already aborted */ } };
  if (signal) { if (signal.aborted) relay(); else signal.addEventListener('abort', relay, { once: true }); }
  return fetch(url, { signal: c.signal }).finally(() => {
    clearTimeout(t);
    if (signal) signal.removeEventListener('abort', relay);
  });
};

const chainFetch = async (proxiedUrl, { signal = null } = {}) => {
  if (signal?.aborted) throw new Error('aborted');
  const target = targetOf(proxiedUrl);
  // CORS-DIRECT FIRST. The Wikimedia API family (the default search route) and OpenAlex (the
  // academic route) answer cross-origin with `Access-Control-Allow-Origin: *`, so fetch them
  // straight from the browser with no proxy — the reliability fix: the two most common routes no
  // longer go dark when BOTH proxies are down or rate-limited, and each hop is a hop faster. A
  // direct miss (an unexpected CORS failure, an offline tab, a transient 5xx) simply falls through
  // to the proxy chain below, so this only ADDS a path, never removes one. Everything else — article
  // pages, arXiv/ar5iv, news RSS, feeds — has no CORS header and still rides the proxy.
  const direct = directCorsUrl(target);
  const forms = direct ? [() => direct, ...PROXY_FORMS] : PROXY_FORMS;
  let lastErr = null;
  for (const form of forms) {
    if (signal?.aborted) throw new Error('aborted');
    try {
      const res = await fetchTimed(form(target), { signal });
      if (!res.ok && (res.status >= 500 || res.status === 429)) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      return res;
    } catch (e) {
      // A user/turn abort is final — don't keep walking the chain waiting on a stopped turn.
      if (signal?.aborted) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('fetch failed');
};

// Full-text hooks per search kind — a Wikipedia hit reads the clean API extract,
// a Gutenberg hit the whole book, a Wikidata hit its rendered claims; anything
// else fetches the page and reduces its HTML. Mirrors webfetch's internal map.
const FULL_TEXT = {
  wikipedia: (client, item) => wikiExtract(client, item?.title),
  ...GUTENBERG_FULLTEXT,
  ...WIKIMEDIA_FULLTEXT,
};

// ── tiny IndexedDB kv (best-effort; absent in Node) ──────────────────────────
const idbOpen = () => new Promise((res, rej) => {
  const r = indexedDB.open('eo-reader-42', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const kv = async (mode, fn) => {
  if (typeof indexedDB === 'undefined') return null;
  const db = await idbOpen();
  try {
    return await new Promise((res, rej) => {
      const tx = db.transaction('kv', mode);
      const out = fn(tx.objectStore('kv'));
      tx.oncomplete = () => res(out && 'result' in out ? out.result : null);
      tx.onerror = () => rej(tx.error);
    });
  } finally { db.close(); }
};

const nowIso = () => new Date().toISOString();
const nowMs = () => { try { return Date.now(); } catch { return 0; } };
// How far a reader web-search walks. 4.1 reached the net by a multi-hop curiosity walk (follow the
// surprise while it stays on topic), not a single fetch; this restores that depth. The budget is
// generous ON PURPOSE: the walk's own knobs (a low curiosity floor, a deep frontier, strayPatience)
// are tuned so multi-hop walks are the COMMON case, and the saliency leash — not this cap — is what
// ends a walk that has left the question. The cap only stops a runaway.
const RESEARCH_HOPS = 8;
// Does the ask want a DEVELOPED, multi-paragraph piece — an essay, a report, a detailed
// write-up — rather than a pointed answer? 4.1 had a system-decided long-form route; 4.2 had
// dropped it, so EVERY reader turn was capped at the small per-task budgets (answer 384 tokens)
// and "write me an essay about dolphins" came back as two sentences. This restores a long-form
// lane: when the ask names a long-form artifact, the turn gets a much larger budget and the
// paragraph loop is allowed to develop the piece. Mirrors 4.1's _longformIntent keyword floor.
const LONGFORM_RE = /\b(essays?|treatise|report|deep[\s-]?dive|comprehensive(?:ly)?|in[\s-]?depth|at\s+length|long[\s-]?form|thorough(?:ly)?|detailed|\d{3,}\s*words?|(?:write|compose|draft|create|produce|generate|give)\s+(?:me\s+|us\s+)?(?:a|an|the|some)\b[^.?!]{0,40}?\b(?:essay|report|overview|account|piece|article|guide|breakdown|story|analysis|write[-\s]?up|blog\s*post|review))\b/i;
const wantsLongform = (q) => LONGFORM_RE.test(String(q || ''));
const LONGFORM_MAX_TOKENS = 1600;
const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const shaShort = (h) => String(h || '').replace(/^[^:]*:/, '').slice(0, 12);
const bytesOf = (text) => { try { return new TextEncoder().encode(text).length; } catch { return String(text).length; } };
const esc = (s) => String(s ?? '');

// keepGuardAlive(guard, p, opts) → p, but while p is pending the no-progress `guard` is FED on a
// fixed interval, so an OPAQUE model call — formulateSearchQuery, the sense disambiguator — that
// streams no token and fires no step still reads as a sign of life. This is the fix for the false
// "the web lookup stalled" abort: the sense disambiguator alone is a 220-token temperature-0 decode
// (disambiguate.js), and it runs BEFORE the first hop's progress beat; on a modest device (or a first
// cold decode) that one call outlasts the 45s stall guard, which then aborts the turn mid-think and
// blames the web before a single page is ever fetched. A ping every `every` ms says "the engine is
// working" — the same sign-of-life the token / step / hop feeds carry for the phases that CAN report
// progress. It never masks a real hang: the interval is cleared the instant the call settles
// (`finally`), a Stop or a stall tripped elsewhere still settles the turn (a fed guard that is already
// tripped is a no-op), and a hard `maxMs` ceiling stops the feed so a genuinely stuck call is released
// to trip well past any real decode. Pure and injectable (`now`) so the cadence is unit-testable.
export const keepGuardAlive = (guard, p, { every = 8000, maxMs = 180000, now = () => Date.now() } = {}) => {
  const done = Promise.resolve(p);
  if (!guard || !every) return done;
  const t0 = now();
  const iv = setInterval(() => {
    if (guard.tripped?.() || (maxMs && now() - t0 >= maxMs)) { clearInterval(iv); return; }
    try { guard.feed?.(); } catch { /* feeding a settled guard is harmless */ }
  }, every);
  return done.finally(() => clearInterval(iv));
};

// probeModelAlive(m) → did the engine ANSWER a one-token decode inside the window? The wedge
// recovery below (resetWedgedLocalModel) used to pattern-match: 45s of no progress ⇒ the engine is
// dead ⇒ tear it down. But a no-progress stall has two very different causes — a genuinely wedged
// engine (a lost WebGPU device, a dead worker) and a merely SLOW one (a long prefill on a weak GPU,
// a CPU decode on a modest machine) — and tearing down a slow-but-alive engine forces a reload it
// never needed, then counts a "wedge" toward the downgrade ladder. Two slow turns in a row and the
// user's Llama pick silently became wllama: the model "didn't stay loaded". This probe is the
// evidence: a truly dead engine throws at once (its backend already dropped the handle) or never
// answers (the timeout catches it); a live one answers a 1-token draw in seconds. Resolves true/false,
// never throws. Exported for the tests; `timeoutMs` injectable for the same reason.
export const probeModelAlive = (m, { timeoutMs = 10000 } = {}) =>
  new Promise((resolve) => {
    let done = false;
    const settle = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => settle(false), timeoutMs);
    Promise.resolve()
      .then(() => m.phrase([{ role: 'user', content: 'ok' }], { maxTokens: 1, temperature: 0 }))
      .then(() => settle(true), () => settle(false));
  });

// The at-rest record is a ring buffer: it keeps at most REFLECTION_CAP notes so a long session's
// memory stays bounded (the oldest fall off the front). But the count we SURFACE — "… N notes so
// far" — has to be the running total the reading has ever voiced, NOT the retained buffer size, or
// it plateaus at the cap and reads as frozen the moment the session crosses it (the "200 notes"
// that never moves). So recordReflections mints ids and advances the tally from a monotonic `seen`
// that the trim never touches: the buffer caps, the count climbs, and ids stay unique past the cap
// (no repeated R201). `make(r)` builds the stored note from each fresh reflection; the id is added
// here. Returns the advanced `seen`. Pure and injectable (`cap`) so it is unit-testable without the
// engine — which matters because below the cap the bug is invisible; it only shows past REFLECTION_CAP.
export const REFLECTION_CAP = 200;
export const recordReflections = (record, seen, fresh, make, cap = REFLECTION_CAP) => {
  for (const r of fresh) { seen += 1; record.push({ id: `R${seen}`, ...make(r) }); }
  if (record.length > cap) record.splice(0, record.length - cap);
  return seen;
};

// The activity ledger is append-only — every discrete action (record, claim, conflict, search)
// gets its own line, in order. EXCEPT: a beat that repeats every idle pass — the at-rest
// reflection — would bury those actions under dozens of near-identical "Reflected at rest — N
// notes" lines (the idle governor fires every few seconds; a long lull over a big record voices a
// fresh batch each pass). So such a beat may COALESCE: when the tail entry already shares its
// kind, the tail is updated in place — new text/effect/time, its id kept so the surface's list
// keys don't churn — instead of a new line being appended. A run of idle passes collapses to ONE
// live line that ticks its count; the next DISCRETE action (which never opts into coalescing)
// appends past it, so the timeline still marks WHERE the lull sat. `mintId` is called only when a
// line is actually appended, so a coalesced beat never burns an id number. Pure and injectable
// (`cap`) so it is unit-testable without the engine — the same reason recordReflections is.
export const LOG_CAP = 400;
export const appendLog = (log, { kind, t, text, effect = '' }, mintId, { coalesce = false, cap = LOG_CAP } = {}) => {
  const tail = log[log.length - 1];
  if (coalesce && tail && tail.kind === kind) {
    tail.t = t; tail.text = text; tail.effect = effect;
  } else {
    log.push({ id: mintId(), t, kind, text, effect });
    if (log.length > cap) log.splice(0, log.length - cap);
  }
  return log;
};

// ── the app ──────────────────────────────────────────────────────────────────
export const createReaderApp = ({ audit, murmur = null, fetchImpl = chainFetch } = {}) => {
  const state = {
    sources: [],           // registry entries (serializable minus _doc)
    // Auto-generated toplines (docs/topline.md). A SOURCE's topline rides on its own registry
    // entry (src.summary), removed with the source; an ENTITY has no persisted home object (it is
    // re-derived from the graph each render), so its topline is kept here, keyed by normalised
    // label — the same merged identity the explorer groups by. Both persist across reload.
    summaries: { entities: {} },
    // A workspace is the top-level container (Notion's workspace/teamspace): it owns a
    // nested tree of topics. A topic scopes a source set, a chat and a memo, and now
    // carries `workspaceId` (which container it lives in) + `parentId` (its parent topic,
    // null at the root) + `collapsed` (whether its subtree is folded in the sidebar), so
    // the flat list becomes a navigable tree that stays legible at scale.
    workspaces: [],        // { id, name, color, shared, created }
    activeWorkspaceId: null,
    topics: [],            // { id, title, created, workspaceId, parentId, collapsed, sourceSns:[], messages:[], memo:'' }
    activeTopicId: null,
    log: [],               // activity ledger: { id, t, kind, text, effect }
    reflections: [],       // the inner monologue: reflections the reading has at rest (band void)
    reflectionsSeen: 0,    // running total ever voiced this session — the honest "N notes so far".
                           // reflections is capped at REFLECTION_CAP; this is not, and (like
                           // reflections, which re-derive each load) is per-session, never persisted.
    // SELF-GUIDED LEARNING (murmur/learn) — the murmur's own notebook, accrued as it WANDERS at
    // rest. Per-session working state, re-earned each load exactly like reflections (the firewall:
    // nothing murmur keeps is durable truth). The `learning` layer is what the graph toggle shows.
    learning: [],          // the learning notes (a bounded ring, like reflections)
    learningSeen: 0,       // running total learned this session
    // The murmur's stance, set by the surface (persisted there as eo_murmur*). The wander runs ONLY
    // when mode is not 'off' AND the strip is visible — so there is never any muttering unseen.
    murmurMode: 'look',    // 'off' | 'look' (no internet) | 'explore' (curiosity onto the web)
    murmurVisible: true,   // the strip shown? hidden ⇒ the wander PAUSES (nothing muttered unseen)
    model: { backend: null, state: 'cold', progress: 0, note: '' },
    busy: null,            // { kind, label } while a long op runs
    // DURABLE PENDING WORK (ingest-jobs.js). The reader records a source only when a fetch, a file
    // import, or a transcription has FINISHED — so a refresh mid-way used to lose the work with no
    // trace. A job is opened when the work begins, rides the snapshot, and is dropped when it lands;
    // on the next boot the still-open jobs are RESUMED (idempotently — dedup by content hash). This
    // is what lets ingestion AND transcription survive a reload even part-way through.
    jobs: [],              // [{ id, kind, status, attempts, topicId, workspaceId, ...spec }]
    ready: false,          // restore finished
  };
  let sn = 0, tn = 0, ln = 0, mn = 0, wn = 0;
  const client = createWebClient({ fetchImpl });

  // THE SESSION'S SELF AND SPINE. One monitor for the whole session (one loop, one me):
  // every turn commits its answer's propositions as efference copies and senses the next
  // question against them — an echo of the voice's own words is never independent
  // confirmation; a push-back is a recorded correction. One commitment ledger beside it:
  // the persisting line of what was asserted (relay vs authored) and every correction
  // appended next to what it corrects. The ledger is serialized with the session, so the
  // record survives reload; the monitor's copies are per-session working state.
  const monitor = createMonitor();
  const ledger = createCommitmentLedger({ now: nowIso });

  // change fan-out — the dc surface subscribes once and re-renders on any emit
  const subs = new Set();
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  const emit = (kind, data = null) => { for (const fn of subs) { try { fn(kind, data); } catch { /* surface's problem */ } } };

  // `opts.coalesce` folds a repeating beat into the tail rather than appending a fresh line —
  // used only by the at-rest reflection, so idle passes don't flood the Actions feed (see appendLog).
  const logIt = (kind, text, effect = '', opts = {}) => {
    appendLog(state.log, { kind, t: nowIso(), text, effect }, () => `L${++ln}`, opts);
    emit('log');
  };

  // ── the research trail — the live "what am I researching / thinking" stream ────
  // 4.1 surfaced a web search as a collapsible, Claude-style THINKING TRAIL in the answer bubble:
  // one typed beat per search / page read / lead followed / page set aside, ticking a clock, then
  // settling to "Researched N sources · M hops". 4.2 had regressed this to a single transient busy
  // label with nothing rendered. These helpers rebuild that trail on the message as plain data the
  // surface renders. `beat` appends one step (deduped against the previous), `emit`ing so it streams.
  const beat = (msg, kind, text, mode = 'research', extra = null) => {
    stallGuard?.feed();   // a research beat is progress — re-arm the no-progress watchdog
    const t = String(text || '').trim();
    if (!msg || !t) return;
    if (!msg.research) msg.research = { steps: [], mode, t0: nowMs(), tEnd: 0, done: false, summary: '' };
    const steps = msg.research.steps;
    const last = steps[steps.length - 1];
    if (last && last.kind === kind && last.text === t) return;   // don't stack a repeated status
    steps.push({ kind, text: t, ...(extra || {}) });
    emit('messages');
  };
  // Narrate the fold: turn each completed pipeline stage into one trail beat, so the answer
  // bubble shows the reading think — read the record, fold it, phrase, bind, check — BEFORE
  // the answer lands (never a dead, labelless wait). onStep hands (name, ctx, data); we pass
  // only the SAFE `data` projection to fold-narrative.js. mode 'think' so a plain document
  // turn's trail reads "Thinking…", not "Researching…" (a web walk creates the trail first,
  // with mode 'research', and the first-writer's mode wins).
  const foldBeat = (msg, name, data) => {
    const b = foldNarrative(name, data || {});
    // Carry the surf audit (the reading path fold-narrative folded off the fold stage) onto the
    // beat, so the trail's "Folded the reading" line can be OPENED to audit the surf — the same
    // way a "Read N sources" beat carries its pages (hopDoneBeat).
    if (b) beat(msg, b.kind, b.text, 'think', b.surf ? { surf: b.surf } : null);
  };
  // The pre-fetch beat: what the walk is about to search THIS hop. A followed lead names the term it
  // is chasing ("Following 'X' — searching 'Y'"); the seed / a plain hop just names the query.
  const hopBeat = (msg, hop, seed) => {
    if (!hop) return;
    const q = String(hop.query || '').trim();
    if (!q) return;
    if (hop.term && q.toLowerCase() !== String(seed || '').toLowerCase())
      beat(msg, 'lead', `Following “${hop.term}” — searching “${q}”`);
    else
      beat(msg, 'search', `Searching the web for “${q}”`);
  };
  // The after-fetch beat: the hop's OUTCOME — what it read, or why it was set aside. Mirrors 4.1's
  // honest "Kept / Set aside" narration so the leash is legible, not a black box.
  const hopDoneBeat = (msg, hop) => {
    if (!hop) return;
    if (hop.kept && hop.results) {
      const lead = (hop.leads && hop.leads.length) ? ` — picked up ${hop.leads.slice(0, 3).join(', ')}` : '';
      // Carry the actual pages this hop read onto the beat, so the trail's "Read N sources" line
      // can be clicked through to what the surf returned (title + url per source), not just a count.
      const sources = (hop.sources || []).filter((s) => s && (s.url || s.title));
      beat(msg, 'read', `Read ${hop.results} source${hop.results === 1 ? '' : 's'}${lead}`, 'research', sources.length ? { sources } : null);
    } else if (hop.reason === 'strayed') {
      beat(msg, 'warn', `Set aside “${hop.query}” — drifted off the question`);
    } else if (hop.reason === 'empty') {
      beat(msg, 'warn', `Nothing came back for “${hop.query}”`);
    }
  };
  // Settle the trail: the one-line summary the collapsed header shows. `research` is the walk trace
  // (turn/research.js). Called once the gather is done, before the answer is phrased.
  const settleTrail = (msg, research) => {
    if (!msg?.research) return;
    if (research) {
      const nH = (research.hops || []).length;
      const n = research.results || 0;
      msg.research.summary = `Researched ${n} source${n === 1 ? '' : 's'} · ${nH} hop${nH === 1 ? '' : 's'}`;
    }
    beat(msg, 'done', msg.research.summary || 'Done researching');
  };
  // Mark the trail finished (the clock stops). The surface reads `done`/`tEnd` to collapse it.
  const finishTrail = (msg) => {
    if (!msg?.research) return;
    msg.research.done = true;
    msg.research.tEnd = nowMs();
  };

  // Release the composer the moment the answer is FORMED — the `bind` stage — instead of when
  // the whole turn settles. The delay a user feels between "the answer finished appearing" and
  // "I can send again" is the post-answer TAIL: on the streaming path the text is final at bind
  // (pipeline.js: "the answer is FORMED at `bind` and only ANNOTATED after it"), yet
  // factcheck → veto → absence → validate → settle and the epilogue (reflection · self-line ·
  // ledger · assembleBrief) still run before runTurn resolves — a MiniLM fact-check per claim,
  // an assembleBrief that scales with the document, and, when the draft earned no witness, a
  // whole extra model decode in `validate`. None of them can rewrite a STREAMED draft (revise,
  // absence, and validate all exempt it — turn/stages.js), so the bubble only GAINS its
  // citations/flags as they finish; nothing the user is reading changes. So we settle the
  // message here — `.pending` gates both the composer (index.html `_generating`) and whether
  // the turn counts toward the next turn's history — and let that grounding finish in the
  // background: the trail keeps ticking until finishTrail, the header keeps its busy label off
  // `onStep`, and finishMessage folds in the verdicts when runTurn returns. Idempotent, and
  // scoped to `bind`, so a turn that terminates before it (smalltalk, math, a gated decline) is
  // untouched and still settles at the `finally`. The onStep guard (`turnSignal.aborted`) keeps
  // this from firing on a stopped turn, so a Stop still freezes the partial exactly as before.
  const releaseOnAnswer = (pending, name, ctx) => {
    if (name !== 'bind' || !pending || pending.pending !== true) return;
    // Swap in the bound answer (citations attached) so the settled text — and thus any history a
    // fast follow-up reads — matches what finishMessage would set, whether or not the tail is done.
    if (ctx && typeof ctx.answer === 'string' && ctx.answer) pending.text = ctx.answer;
    pending.pending = false;
    emit('messages');
  };

  // Feed the peripheral sense (murmur, docs/murmur.md) one fold snapshot per turn. Called from the
  // turn's onStep at the `fold` stop and run FIRE-AND-FORGET, strictly off the critical path: the
  // sense POINTS ("we've wandered" / "this doesn't smell right"), it never adds answer content
  // (spec §9.4). The wiring site extracts the fields here so murmur imports nothing from the turn
  // pipeline. concentration is always available off the fold's referential read (zero embedding
  // cost); drift/novelty need a meaning-measuring embedder (MiniLM warm) — absent it the geometric
  // channel stays null and only the concentration/unease signal can fire (honest degradation).
  const observeMurmur = (ctx) => {
    if (!murmur || !ctx) return;
    try {
      const auditTurn = (audit && audit.turns && audit.turns.length) ? audit.turns[audit.turns.length - 1] : null;
      // The reading's LOCUS, not just the turn: which doc + which sentence indices the fold
      // assembled from. This rides into the recognition ring so a later "seen this before" names
      // the specific earlier passage the connective nominator (phase 4) can go read and verify.
      const spanIdxs = Array.isArray(ctx.spans) ? ctx.spans.map((s) => s && s.idx).filter((i) => Number.isInteger(i)) : [];
      const cursor = (ctx.surf && Number.isInteger(ctx.surf.peak)) ? ctx.surf.peak : (spanIdxs.length ? spanIdxs[0] : null);
      const ref = {
        turnId: auditTurn ? auditTurn.id : null, stepName: 'fold', t: nowMs(),
        docId: (ctx.doc && ctx.doc.docId) || null, sentIdxs: spanIdxs, cursor,
      };
      const r = ctx.referential || null;
      const concentration = {
        concentrated: r ? r.concentrated : undefined,
        margin: r ? r.margin : undefined,
        w: r ? r.w : undefined,
        top: (ctx.spans && ctx.spans[0]) ? ctx.spans[0].score : undefined,
        focus: ctx.surf ? ctx.surf.focus : undefined,
      };
      const emb = ctx.geometricEmbedder;
      const measures = !!(emb && emb.measuresMeaning && typeof emb.embed === 'function');
      const queryText = String(ctx.retrievalQuery || ctx.question || '');
      const readingText = ctx.note && ctx.note.text ? String(ctx.note.text) : '';
      const base = { ref, query: ctx.question || '', concentration, passageText: readingText.slice(0, 400) };
      if (!measures || !queryText) {
        // no meaning space this stop — concentration-only (drift/novelty null by construction).
        void Promise.resolve(murmur.observe({ ...base, measuresMeaning: false }, { turn: auditTurn })).catch(() => {});
        return;
      }
      // Two cheap, cache-backed embeddings: the query (the drift anchor) and the fold's assembled
      // note (this turn's reading). A flaky embed must never disturb the turn, so it is swallowed.
      Promise.all([
        emb.embed(queryText),
        readingText ? emb.embed(readingText) : Promise.resolve(null),
      ]).then(([queryVec, readingVec]) => murmur.observe({
        ...base, queryVec, readingVecs: readingVec ? [readingVec] : null, measuresMeaning: true,
      }, { turn: auditTurn })).catch(() => { /* the sense must never cost a turn */ });
    } catch { /* never let the peripheral sense throw into the pipeline */ }
  };

  // ── persistence ────────────────────────────────────────────────────────────
  const serialize = () => ({
    v: 1, sn, tn, ln, mn, wn,
    activeTopicId: state.activeTopicId,
    activeWorkspaceId: state.activeWorkspaceId,
    workspaces: state.workspaces,
    log: state.log.slice(-120),
    topics: state.topics,
    // Persist only the RECORDED source — never its DERIVED readings. Every `_`-prefixed
    // field (`_doc` the parse, `_eot` the full EoT reading) re-derives from `text` in a
    // tick and must not ride into the snapshot: `_eot` alone is the whole reading of the
    // source (a 2,500-page PDF's is ~7,600 propositions of structure + the reading as one
    // string), and leaving it in meant every 400 ms autosave structure-cloned that derived
    // bulk into IndexedDB — the large-document slowdown. Strip anything underscore-led.
    sources: state.sources.map((s) => {
      const out = {};
      for (const k in s) if (k[0] !== '_') out[k] = s[k];
      return out;
    }),
    // the commitment ledger — assertions and corrections survive reload (the spine)
    ledger: ledger.serialize(),
    // entity toplines (source toplines ride on each source above) — the summary + its feedback
    summaries: { entities: state.summaries.entities },
    // the durable pending-work registry — the fetches / imports / transcriptions still in flight,
    // so a reload mid-way can pick them back up (ingest-jobs.js). Small plain JSON specs only.
    jobs: state.jobs,
  });
  let saveTimer = null;
  const persist = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const snap = serialize();
      kv('readwrite', (store) => store.put(snap, 'session')).catch(() => {});
    }, 400);
  };
  const restore = async () => {
    try {
      const snap = await kv('readonly', (store) => store.get('session'));
      if (snap && snap.v === 1) {
        ({ sn, tn, ln, mn } = snap);
        wn = snap.wn || 0;
        state.sources = (Array.isArray(snap.sources) ? snap.sources : []).map((s) => {
          const src = { ...s, _doc: null };
          // Re-seed the live ASR object from its durable twin so the transcription banner reads
          // correctly at once after a reload (done / skipped / — or the resuming state resumeJobs
          // is about to drive). A clip left mid-transcription reads as pending until the resume runs.
          if (src.transcription) {
            const st = src.transcription.state;
            src._asr = { state: st === 'running' ? 'pending' : st, pct: src.transcription.pct || 0, reason: src.transcription.reason || null, partial: '' };
          }
          return src;
        });
        state.topics = Array.isArray(snap.topics) ? snap.topics : [];
        state.activeTopicId = snap.activeTopicId;
        state.workspaces = Array.isArray(snap.workspaces) ? snap.workspaces : [];
        state.activeWorkspaceId = snap.activeWorkspaceId || null;
        state.log = Array.isArray(snap.log) ? snap.log : [];
        state.jobs = Array.isArray(snap.jobs) ? snap.jobs : [];   // pending work to resume below
        if (snap.ledger) ledger.restore(snap.ledger);   // the spine survives reload
        if (snap.summaries && snap.summaries.entities) state.summaries = { entities: { ...snap.summaries.entities } };
      }
    } catch { /* fresh session */ }
    // ── migrate to the workspace / topic-tree model ──────────────────────────
    // Older sessions had no workspaces and a flat topic list. Give them a single
    // "Personal" workspace, home every topic in it at the root, and default the new
    // nesting fields. Idempotent: a session already on the new model is untouched.
    if (!state.workspaces.length) {
      state.workspaces = [{ id: 'ws1', name: 'Personal', color: WS_COLORS[0], shared: false, created: nowIso() }];
      wn = Math.max(wn, 1);
    }
    if (!state.activeWorkspaceId || !state.workspaces.find((w) => w.id === state.activeWorkspaceId)) {
      state.activeWorkspaceId = state.workspaces[0].id;
    }
    const defWs = state.workspaces[0].id;
    for (const t of state.topics) {
      if (!t.workspaceId || !state.workspaces.find((w) => w.id === t.workspaceId)) t.workspaceId = defWs;
      if (t.parentId === undefined) t.parentId = null;
      if (t.collapsed === undefined) t.collapsed = false;
      // Older sessions predate `named`: a title that differs from the placeholder was chosen
      // by hand, so pin it; a lingering "New topic" wasn't, so BACKFILL its auto-name from
      // the content it already holds (sources restored above, messages on the topic).
      if (t.named === undefined) t.named = !isDefaultTopicTitle(t.title);
      topicAutoName(t, { silent: true });
    }
    if (!state.topics.length) topicNew('New topic', { silent: true });
    if (!state.topics.find((t) => t.id === state.activeTopicId)) state.activeTopicId = state.topics[0].id;
    state.ready = true;
    emit('ready');
    // The model prewarms the moment the session is up (4.1's mount posture) so the
    // first question never pays the download stall. Browser only — never in tests —
    // and the ladder inside ensureModel already falls back webllm → wllama → echo.
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      setTimeout(() => {
        ensureModel().catch(() => { /* logged by the ladder */ });
        // Warm the MiniLM meaning embedder at boot too, not lazily on the first ask. Retrieval's
        // semantic channel — and the fold's referent-binding that the EOT answerability floor
        // reads — is only trustworthy when this is live; warming it here means the FIRST question
        // already gets meaning-scored retrieval instead of the lexical-only fallback that sends
        // the surf wandering (the cold-start "fastest dolphin over a Vaporwave composite" case).
        // Fire-and-forget and IndexedDB-cached, so it costs nothing on a warm return.
        warmMinilm();
      }, 600);
      // THE MODEL KEEPER's triggers (healModel/verifyRestoredModel below): reload a model that
      // silently unloaded — a lost GPU device, a failed first load, an evicted engine — in the
      // background, at the moments recovery is likely to work, instead of on the next question's
      // critical path. Browser-only, like the prewarm; the 30s watch is a few property reads
      // when nothing is wrong.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) healModel(); });
      window.addEventListener('online', () => healModel());
      window.addEventListener('pageshow', (e) => { if (e && e.persisted) verifyRestoredModel(); });
      setInterval(() => healModel(), HEAL_WATCH_MS);
      // Pull the build/latest provenance in the background so the first export already names the
      // exact build and how current it is against GitHub — best-effort, never on the critical path.
      refreshProvenance().catch(() => { /* offline / unreachable — the export degrades gracefully */ });
      // The inner monologue starts at rest: the governor wakes the reading in the lulls
      // between turns and reflects on what's on the record (no-op until something is recorded).
      deepIdleStart();
      // Pick back up any ingest / transcription that was in flight when the tab last closed —
      // the "survive a refresh even mid-way" guarantee. Deferred a beat so the first paint lands
      // first; browser-only (resume needs fetch / OPFS / whisper), best-effort, never blocks boot.
      setTimeout(() => { resumeJobs().catch(() => { /* each job logs its own failure */ }); }, 800);
    }
  };

  // ── durable pending work — the ingest/transcription job registry (ingest-jobs.js) ────────────
  // A job is opened when a long ingest/transcription BEGINS and dropped when it lands, so the list
  // that rides the snapshot is exactly the work still in flight. On boot, resumeJobs() re-runs it.
  // The bytes a `file` job needs to re-import rest in their own OPFS store (keyed by content hash),
  // separate from the audio store, so a resume can rebuild the original File after a reload.
  const ingestStore = createAudioStore({ dir: 'eoreader-ingest' });
  // beginJob(fields) → the job's id. Opens (or replaces) the job and persists at once, so even an
  // immediate reload finds it. Files under the topic/workspace active NOW so a resume records there.
  // Re-opening the SAME work (same identity key, e.g. resuming) carries the existing resume count
  // forward — so a job that keeps getting interrupted still marches toward the attempt cap.
  const beginJob = (fields) => {
    const job = makeJob({ topicId: state.activeTopicId, workspaceId: state.activeWorkspaceId, at: nowMs(), ...fields });
    const existing = state.jobs.find((j) => j.id === job.id);
    if (existing) job.attempts = existing.attempts || 0;
    state.jobs = upsertJob(state.jobs, job);
    persist();
    return job.id;
  };
  // settleJob(id, status, reason) — close a job. A terminal outcome (done / skipped / stopped) drops
  // it (and, for a `file` job, deletes the bytes it stashed for a possible resume). An `error` is
  // KEPT so the next boot can resume it — up to the attempt cap (incremented per resume, below), past
  // which it is abandoned and logged so a permanently-broken job can't resurrect itself forever.
  const settleJob = (id, status, reason = null) => {
    const job = state.jobs.find((j) => j.id === id);
    if (!job) return;
    if (status === 'error' && (job.attempts || 0) < MAX_JOB_ATTEMPTS) {
      state.jobs = patchJob(state.jobs, id, { status: 'error', reason });
    } else {
      if (status === 'error') logIt('skip', `Gave up resuming ${job.kind} after ${job.attempts} tr${job.attempts === 1 ? 'y' : 'ies'}${reason ? ` — ${reason}` : ''}`);
      state.jobs = dropJob(state.jobs, id);
      if (job.kind === 'file' && job.sha) ingestStore.remove(job.sha).catch(() => {});
    }
    persist();
  };

  // ── topics — a nested tree within a workspace (Notion's pages / sub-pages) ────
  const topicById = (id) => state.topics.find((t) => t.id === id) || null;
  // Every topic strictly below `id` in the tree — the guard against a move that would
  // fold a topic under one of its own descendants (a cycle out of the tree).
  const topicDescendants = (id) => {
    const out = [];
    // `seen` guards the walk against a cyclic parentId chain in restored state (a
    // self-parent bricked every later move with a stack overflow); expandAncestors
    // carries the same guard as its counter.
    const seen = new Set([id]);
    const walk = (pid) => { for (const t of state.topics) if ((t.parentId ?? null) === pid && !seen.has(t.id)) { seen.add(t.id); out.push(t.id); walk(t.id); } };
    walk(id);
    return out;
  };
  // Un-fold a topic's whole ancestor chain, so a freshly made or moved sub-topic is
  // never hidden inside a collapsed parent the moment it appears.
  const expandAncestors = (id) => {
    let t = topicById(id), guard = 0;
    while (t && guard++ < 200) { if (t.collapsed) t.collapsed = false; t = t.parentId ? topicById(t.parentId) : null; }
  };

  const topicNew = (title = DEFAULT_TOPIC_TITLE, { silent = false, parentId = null, workspaceId = null } = {}) => {
    const wsId = workspaceId || state.activeWorkspaceId || (state.workspaces[0] && state.workspaces[0].id) || null;
    // `named` — was this title CHOSEN (passed in as a real name, or set by a manual rename)?
    // While false the topic auto-names itself from its content (topicAutoName); a chosen
    // name is never overwritten.
    const t = { id: `t${++tn}`, title, created: nowIso(), workspaceId: wsId, parentId: parentId ?? null, collapsed: false, named: !isDefaultTopicTitle(title), sourceSns: [], messages: [], memo: '' };
    state.topics.push(t);
    state.activeTopicId = t.id;
    if (t.parentId) expandAncestors(t.parentId);   // a sub-topic opens its ancestors
    if (!silent) { logIt('open', `New topic — ${title}`); persist(); emit('topics'); }
    return t;
  };
  const topic = () => state.topics.find((t) => t.id === state.activeTopicId) || state.topics[0];
  const setTopic = (id) => { if (state.topics.find((t) => t.id === id)) { state.activeTopicId = id; releaseParsesOutsideTopic(); deepWake(); persist(); emit('topics'); } };
  const topicRename = (id, title) => { const t = topicById(id); if (t && title) { t.title = title; t.named = true; persist(); emit('topics'); } };
  // AUTO-NAMING. A topic still wearing the "New topic" placeholder names itself from what
  // it holds — its first question, else its first source (topic-name.js) — the moment
  // either lands. Recomputed on every such event while un-`named`: the derivation reads
  // only the topic's FIRST question/source, so the title upgrades exactly once per kind
  // (source-derived → question-derived) and never jitters as the topic grows. A manual
  // rename (topicRename) pins the title for good.
  const topicAutoName = (t, { silent = false } = {}) => {
    if (!t || t.named) return;
    const title = deriveTopicTitle({ messages: t.messages, sources: (t.sourceSns || []).map(sourceBySn).filter(Boolean) });
    if (!title || title === t.title) return;
    t.title = title;
    if (!silent) { persist(); emit('topics'); }
  };
  // Re-parent a topic (null = the workspace root). Rejects a cycle (into itself or a
  // descendant) and a cross-workspace move — a topic tree never spans workspaces.
  const topicMove = (id, parentId = null) => {
    const t = topicById(id); if (!t) return;
    const np = parentId ?? null;
    if (np === id || topicDescendants(id).includes(np)) return;
    const p = np ? topicById(np) : null;
    if (p && p.workspaceId !== t.workspaceId) return;
    t.parentId = np;
    if (np) expandAncestors(np);
    persist(); emit('topics');
  };
  const topicToggleCollapse = (id) => { const t = topicById(id); if (t) { t.collapsed = !t.collapsed; persist(); emit('topics'); } };
  const topicDelete = (id) => {
    const gone = topicById(id); if (!gone) return;
    const parentId = gone.parentId ?? null;
    // Lift the direct children up one level (the subtree rises rather than vanishing).
    for (const t of state.topics) if ((t.parentId ?? null) === id) t.parentId = parentId;
    state.topics = state.topics.filter((t) => t.id !== id);
    // A workspace is never left without a topic. Deleting its LAST topic is allowed —
    // it opens a fresh one in the same workspace rather than being blocked, so the last
    // topic resets instead of being un-deletable (the whole app keeps this invariant:
    // see workspaceNew / setWorkspace / workspaceDelete). We land on a same-workspace
    // sibling when one survives; otherwise on the fresh replacement.
    if (state.activeTopicId === id) {
      const sib = state.topics.find((t) => t.workspaceId === gone.workspaceId);
      state.activeTopicId = (sib || topicNew('New topic', { silent: true, workspaceId: gone.workspaceId })).id;
    } else if (!state.topics.some((t) => t.workspaceId === gone.workspaceId)) {
      // Deleted the last topic of a workspace we weren't viewing — keep it populated too,
      // without stealing focus from the topic on screen (topicNew makes its topic active).
      const keep = state.activeTopicId;
      topicNew('New topic', { silent: true, workspaceId: gone.workspaceId });
      state.activeTopicId = keep;
    }
    persist(); emit('topics');
  };
  // The topic forest of a workspace (default: active), nested by parentId in creation
  // order. Each node: { topic, depth, children }.
  const topicTree = (workspaceId = null) => {
    const wsId = workspaceId || state.activeWorkspaceId;
    const inWs = state.topics.filter((t) => (t.workspaceId ?? null) === (wsId ?? null));
    const build = (parentId, depth) => inWs
      .filter((t) => (t.parentId ?? null) === (parentId ?? null))
      .map((t) => ({ topic: t, depth, children: build(t.id, depth + 1) }));
    return build(null, 0);
  };
  // A flat pre-order walk of the forest for an indented sidebar render, HIDING the
  // subtree under any collapsed node. Each row: { topic, depth, hasChildren, collapsed }.
  const topicRows = (workspaceId = null) => {
    const out = [];
    const walk = (nodes) => { for (const n of nodes) {
      const hasChildren = n.children.length > 0;
      out.push({ topic: n.topic, depth: n.depth, hasChildren, collapsed: !!n.topic.collapsed });
      if (hasChildren && !n.topic.collapsed) walk(n.children);
    } };
    walk(topicTree(workspaceId));
    return out;
  };

  // ── workspaces — the top-level containers a topic tree lives in ──────────────
  // The accent palette a new workspace cycles through; the seed "Personal" takes the
  // app default. A shared workspace (future) is a Matrix room — `shared` is the hook
  // the switcher already reads, so the collaborative case slots in without a reshape.
  const WS_COLORS = ['#6D5EF5', '#2563EB', '#0F766E', '#B45309', '#A91D1D', '#BE185D', '#15803D'];
  const activeWorkspace = () => state.workspaces.find((w) => w.id === state.activeWorkspaceId) || state.workspaces[0] || null;
  const workspaceNew = (name = 'New workspace', { silent = false, shared = false } = {}) => {
    const w = { id: `ws${++wn}`, name: String(name || 'New workspace'), color: WS_COLORS[state.workspaces.length % WS_COLORS.length], shared: !!shared, created: nowIso() };
    state.workspaces.push(w);
    state.activeWorkspaceId = w.id;
    topicNew('New topic', { silent: true, workspaceId: w.id });   // a workspace always opens onto a topic
    if (!silent) { logIt('open', `New workspace — ${name}`); persist(); emit('topics'); }
    return w;
  };
  const setWorkspace = (id) => {
    const w = state.workspaces.find((x) => x.id === id);
    if (!w || state.activeWorkspaceId === id) return;
    state.activeWorkspaceId = id;
    // Land on a topic that actually lives in this workspace (make one if it is empty).
    const first = state.topics.find((t) => t.workspaceId === id);
    state.activeTopicId = first ? first.id : topicNew('New topic', { silent: true, workspaceId: id }).id;
    deepWake(); persist(); emit('topics');
  };
  const workspaceRename = (id, name) => { const w = state.workspaces.find((x) => x.id === id); if (w && name) { w.name = String(name); persist(); emit('topics'); } };
  const workspaceDelete = (id) => {
    if (state.workspaces.length <= 1) return;   // the shell always keeps one workspace
    const idx = state.workspaces.findIndex((w) => w.id === id);
    if (idx < 0) return;
    state.workspaces = state.workspaces.filter((w) => w.id !== id);
    // Re-home this workspace's topics into the previous sibling, flattened to its root,
    // so nothing filed here is lost when the container goes.
    const dest = state.workspaces[Math.max(0, idx - 1)] || state.workspaces[0];
    for (const t of state.topics) if (t.workspaceId === id) { t.workspaceId = dest.id; t.parentId = null; }
    if (state.activeWorkspaceId === id) {
      state.activeWorkspaceId = dest.id;
      const f = state.topics.find((t) => t.workspaceId === dest.id);
      state.activeTopicId = f ? f.id : topicNew('New topic', { silent: true, workspaceId: dest.id }).id;
    }
    persist(); emit('topics');
  };

  // ── the S-registry ─────────────────────────────────────────────────────────
  const sourceBySn = (id) => state.sources.find((s) => s.sn === id);
  const docFor = (src) => {
    if (!src) return null;
    if (!src._doc) {
      src._doc = parseText(src.text, { docId: src.docId });
      try {
        const g = projectGraph(src._doc.log);
        src.entCount = g.entities?.size || 0;
      } catch { src.entCount = 0; }
      emit('sources');
    }
    return src._doc;
  };

  const addSource = ({ title, url = null, text, kind = 'web', rights = null, record = null, doc = null, parentSn = null }) => {
    const body = String(text || '').trim();
    if (!body) throw new Error('nothing to record — the page had no readable text');
    const hash = record?.content_hash || webContentHash(body);
    const dup = state.sources.find((s) => s.sha === hash);
    // Re-visiting a page already recorded is a no-op on the registry, but if it now arrives UNDER a
    // parent (a link we followed inside that parent's site) and had none before, adopt it — so a
    // page first seen on its own, then reached by clicking through its site, nests where expected.
    if (dup) {
      if (parentSn && !dup.parentSn && dup.sn !== parentSn) { dup.parentSn = parentSn; persist(); emit('sources'); }
      logIt('skip', `Already recorded — ${dup.title}`, dup.sn); return dup;
    }
    const id = `S${++sn}`;
    const src = {
      sn: id, reg: `S-${String(sn).padStart(4, '0')}`,
      docId: doc?.docId || `doc-${shaShort(hash)}`,
      title: title || url || 'Untitled', url, domain: url ? domainOf(url) : (kind === 'file' || kind === 'audio' || kind === 'video' ? 'local file' : 'pasted text'),
      kind, retrieved: nowIso(), recordedAt: nowMs(), sha: hash, bytes: bytesOf(body),
      rights: rights || (url ? 'web — verify before reuse' : 'local'),
      // parentSn: a page reached by following a link inside another source's site is recorded as a
      // SUB-OBJECT of that source — one site stays one source in the sidebar, its followed pages
      // nested and (by default) folded under it. collapsed governs its OWN children's fold state.
      parentSn: parentSn || null, collapsed: true,
      text: body, entCount: null, _doc: doc || null,
    };
    if (doc) { try { src.entCount = projectGraph(doc.log).entities?.size || 0; } catch { src.entCount = 0; } }
    state.sources.push(src);
    const t = topic();
    if (t && !t.sourceSns.includes(id)) t.sourceSns.push(id);
    if (t) topicAutoName(t, { silent: true });   // a first source names a placeholder topic (persist/emit follow below)
    if (parentSn) {
      const par = sourceBySn(parentSn);
      logIt('nav', `Followed link on ${par ? par.domain : 'a source'} → ${src.title}`, src.reg);
    }
    logIt('record', `Recorded ${src.domain} — ${src.title}`, src.reg);
    logIt('hash', `Fixity sha ${shaShort(src.sha)} · ${src.bytes.toLocaleString()} bytes`, src.reg);
    deepWake();   // the record grew — let the reading reflect on the new places at rest
    persist(); emit('sources');
    // Every source is READ into EoT at the moment of record — every proposition the
    // parse admitted (any modality: the organs all land on the same spine) counted here,
    // in the canonical surface. Deferred a tick so the record lands (toast, registry)
    // before the read runs.
    //
    // Only the CHEAP half runs at record: the propositions count is a linear read of the
    // log (emitEot). The reading's THINKING layer — its turning points — is NOT computed
    // here: significanceSpine re-reads the whole log once per sampled cursor, tens of
    // seconds on a 2,500-page document, and running it eagerly froze the tab right after
    // every large import. It is left to the reading surface to compute lazily (eotFor,
    // memoised) when the reader actually opens that source. Recording never blocks the tab
    // on the full EoT read again.
    setTimeout(() => {
      try {
        const d = docFor(src);
        const props = d?.log ? emitEot(d.log).lines.length : 0;
        logIt('eot', `Encoded ${src.reg} into EoT — ${props} propositions`, src.reg);
      } catch (e) { logIt('skip', `EoT read failed for ${src.reg} — ${String(e?.message || e).slice(0, 90)}`); }
      // …and auto-compose the source's topline the moment it is recorded. Model-optional: the
      // deterministic telegram lands at once (there is a summary before any talker is warm), and a
      // loaded talker refines the join in the background. Fire-and-forget — never blocks the record.
      sourceSummary(src.sn).catch(() => { /* a summary must never cost the record */ });
    }, 0);
    return src;
  };

  // The source's reading as one EoT document (structure + thinking). Memoised on the
  // source; readIngest itself memoises per doc, so this is computed once per record.
  const eotFor = (snId) => {
    const src = sourceBySn(snId);
    if (!src) return null;
    if (!src._eot) src._eot = readIngest(docFor(src));
    return src._eot;
  };

  // The ANSWER's own reading as one EoT document. The source viewer's facing page reads a recorded
  // document back through the predictive stack; this hands the chat the same lens on the machine's
  // OWN reply — so "how it read it" is available for an answer, not only for its sources. Memoised
  // per (message, length) in a transient cache: it is derived, re-derives in a tick, and must never
  // ride into the persisted message (which would bloat the record with a re-computable projection).
  const _answerEot = new Map();
  const answerEot = (msg) => {
    const text = String((msg && msg.text) || '');
    if (!text.trim()) return null;
    const key = `${(msg && msg.id) || ''}:${text.length}`;
    if (_answerEot.has(key)) return _answerEot.get(key);
    let eot = null;
    try { eot = readIngest(parseText(text, { docId: `answer-${(msg && msg.id) || shaShort(webContentHash(text))}` })); }
    catch { eot = null; }
    if (_answerEot.size > 64) _answerEot.clear();   // a small, self-pruning cache — answers are transient
    _answerEot.set(key, eot);
    return eot;
  };

  const removeSource = (id) => {
    const gone = sourceBySn(id);
    if (gone) deepReaders.delete(gone.docId);   // or the deep reader keeps the removed doc resident
    state.sources = state.sources.filter((s) => s.sn !== id);
    // A removed source's sub-objects rise to the top level rather than vanish with their parent.
    for (const s of state.sources) if (s.parentSn === id) s.parentSn = null;
    for (const t of state.topics) t.sourceSns = t.sourceSns.filter((x) => x !== id);
    persist(); emit('sources');
  };

  // Release the derived readings the active topic no longer needs. A parse (_doc), its EoT
  // reading (_eot — and readIngest's memo, a WeakMap keyed by the doc, dies with it), and the
  // deep reader pinning the doc all re-derive lazily from src.text; holding EVERY topic's
  // parses at once (each several times its text's size) is session-long growth the tab —
  // already carrying model weights — cannot afford.
  const releaseParsesOutsideTopic = () => {
    const t = topic();
    const keep = new Set(t ? t.sourceSns : []);
    for (const s of state.sources) {
      if (keep.has(s.sn)) continue;
      deepReaders.delete(s.docId);
      s._doc = null; s._eot = null;
    }
  };

  const topicSources = () => {
    const t = topic();
    return t ? t.sourceSns.map(sourceBySn).filter(Boolean) : [];
  };
  const topicDocs = () => topicSources().map(docFor).filter(Boolean);

  // ── ingest: URL / search / file / paste ───────────────────────────────────
  // The two cancellable-op controllers, declared here (not just in the chat section) so `stop()`
  // reaches ANY long op, not only a chat turn — that is what makes the Stop button universal. A chat
  // turn owns `abort` + its `stallGuard` (armed in ask/answerFromWeb, below); every OTHER long op —
  // a URL fetch, a web search, a page/file import — owns `opAbort`, armed through `runCancellable`.
  // Kept separate so an ingest started over the top of a live turn can't clobber the turn's signal
  // (and vice-versa); `stop()` trips whichever are in flight.
  let abort = null;
  let stallGuard = null;
  let opAbort = null;
  const setBusy = (busy) => { state.busy = busy; emit('busy'); };

  // runCancellable(busy, fn) — the seam that makes Stop universal for the non-turn ops. It arms a
  // fresh abort the Stop button can trip (via `stop()`), shows the busy label, hands `fn` the signal
  // to thread into the actual fetch (so a hung proxy is cut loose, not just the chat turn), and
  // clears busy + abort when it settles. Every guard is gated on THIS op still being the current one,
  // so a `stop()` — or a second op started over the top — can never have the loser's finally clear
  // the winner's state. `fn(signal, progress)`: `progress(busy)` re-labels the pill mid-op (a
  // multi-step file import), itself gated so a superseded op can't repaint the pill after it lost.
  const runCancellable = async (busy, fn) => {
    const ac = new AbortController();
    opAbort = ac;
    setBusy(busy);
    try {
      return await fn(ac.signal, (next) => { if (opAbort === ac) setBusy(next); });
    } finally {
      if (opAbort === ac) { opAbort = null; setBusy(null); }
    }
  };

  const ingestUrl = (url) => {
    const norm = /^https?:\/\//.test(url) ? url : `https://${url}`;
    return runCancellable({ kind: 'fetch', label: `Reading ${domainOf(norm)}…` }, async (signal) => {
      // Open a durable job FIRST — a reload while the proxy is still fetching picks the URL back up
      // (a re-fetch dedups by content hash, so a page that actually landed is a no-op on resume).
      const jid = beginJob({ kind: 'url', url: norm });
      try {
        const raw = (await client.fetchUrl(norm, { signal })).text;
        const title = (/<title[^>]*>([^<]*)</i.exec(raw)?.[1] || '').trim() || norm;
        const text = htmlToText(raw);
        const { doc, record } = admitWebSource({ url: norm, title, text, fetched_at: nowIso(), engine: 'feed-proxy' });
        const src = addSource({ title: record.title || title, url: norm, text: doc.text, kind: 'web', record, doc });
        settleJob(jid, 'done');
        return src;
      } catch (e) {
        settleJob(jid, signal.aborted ? 'stopped' : 'error', String(e?.message || e).slice(0, 90));
        throw e;
      }
    });
  };

  const search = (query, { kind = 'auto', k = 8 } = {}) =>
    runCancellable({ kind: 'search', label: `Searching the web — ${query}` }, async (signal) => {
      const items = await client.search(query, { kind, k, signal });
      logIt('search', `Web search "${query}"`, `${items.length} results`);
      return items;
    });

  const recordHit = (item, query = null) =>
    runCancellable({ kind: 'fetch', label: `Reading ${item.title || item.url}…` }, async (signal) => {
      const full = FULL_TEXT[item.source] || FULL_TEXT[item.kind];
      let text = '';
      try { text = full ? await full(client, item) : htmlToText((await client.fetchUrl(item.url, { signal })).text); } catch (e) { if (signal.aborted) throw e; /* else fall through */ }
      if (!text) text = item.text || item.title || '';
      const { doc, record } = admitWebSource({
        url: item.url, title: item.title, text,
        retrieval_query: query, engine: `web:${item.source || item.kind || 'search'}`, fetched_at: nowIso(),
      });
      return addSource({ title: item.title, url: item.url, text: doc.text, kind: 'web', record, doc });
    });

  // The page's own HTML, fetched through the same proxy chain ingest uses — for the source
  // viewer's native "Native" tab, which renders the REAL website (sanitized + sandboxed by the
  // surface) rather than the reduced text. Browser only; in Node (no fetch) client.fetchUrl
  // throws, which the surface catches into the tab's error state.
  const fetchPage = (url) => {
    const norm = /^https?:\/\//.test(url) ? url : `https://${url}`;
    return runCancellable({ kind: 'fetch', label: `Loading ${domainOf(norm)}…` }, async (signal) => {
      const res = await client.fetchUrl(norm, { signal });
      // Report the REAL page URL, never `res.url`: fetchUrl goes through the feed proxy, so
      // res.url is the proxied `…/feed?url=…` address. The Native tab feeds this straight into
      // the render's injected <base href>, and a proxy base makes every relative stylesheet/
      // image (/w/load.php, /static/…) resolve against the proxy host — a blank, image-broken
      // page. `norm` is the site's own URL, so its assets resolve against the site. (4.1 based
      // the native render on the page URL for exactly this reason.)
      return { html: res.text || '', url: norm, ok: res.ok !== false };
    });
  };

  // Following a link INSIDE a source's native view: fetch the target page once, render it in place
  // (the raw HTML rides back for the Native iframe), AND record it as a SUB-OBJECT of `parentSn` —
  // one site stays one source, every page you click through logged beneath it (dedup keeps a
  // re-visit a no-op on the registry). Returns { html, url, childSn } — childSn null if the page had
  // no readable text (nothing to record) or admission failed; the page still renders either way.
  const navigatePage = (parentSn, url) => {
    const norm = /^https?:\/\//.test(url) ? url : `https://${url}`;
    return runCancellable({ kind: 'fetch', label: `Loading ${domainOf(norm)}…` }, async (signal) => {
      const res = await client.fetchUrl(norm, { signal });
      const raw = res.text || '';
      const title = (/<title[^>]*>([^<]*)</i.exec(raw)?.[1] || '').trim() || norm;
      let childSn = null;
      try {
        const text = htmlToText(raw);
        if (text && text.trim()) {
          const { doc, record } = admitWebSource({ url: norm, title, text, fetched_at: nowIso(), engine: 'feed-proxy' });
          const child = addSource({ title: record.title || title, url: norm, text: doc.text, kind: 'web', record, doc, parentSn });
          childSn = child.sn;
        }
      } catch { /* un-admittable (empty/dup-of-parent) — still render the page */ }
      // Report the site's own URL for the iframe <base href> (not the proxied res.url), same as
      // fetchPage — so the rendered page's relative assets resolve against the real site.
      return { html: raw, url: norm, childSn, ok: res.ok !== false };
    });
  };

  // Fold / unfold a source's sub-objects in the sidebar (persisted with the source).
  const sourceToggleCollapse = (id) => {
    const s = sourceBySn(id); if (!s) return;
    s.collapsed = !s.collapsed; persist(); emit('sources');
  };

  // webSearchAdmit(query, opts) → the fetch+admit primitive the turn's web loop consumes.
  // Search a source (or auto-route), pull each hit's FULL page through the proxy chain
  // (fetchPages), admit it as a frozen web source (websource.js), AND register it in the
  // S-registry so its cited spans resolve to a real chip and it persists with the topic —
  // a fetched page becoming "a normal prose source that joins the answer scope"
  // (docs/web-search.md). Returns the admitted [{ item, doc, record }] for the turn to
  // stand on; addSource dedupes by content hash and never overwrites, so re-fetching the
  // same page is a no-op on the registry while the doc still rides the turn.
  const webSearchAdmit = async (query, opts = {}) => {
    // Each fetched+admitted page re-arms the no-progress watchdog: a hop pulling five full pages
    // through the proxy is slow but ALIVE, and without this beat the 45s stall guard was aborting
    // the whole turn mid-walk ("the web lookup stalled"). onAdmit is set AFTER the spread so the
    // stall feed always runs — the caller still tunes k/kind/fetchPages, but can't drop the beat.
    const admitted = await searchAndAdmit(query, {
      client, k: 5, kind: 'auto', fetchPages: true, ...opts, onAdmit: () => stallGuard?.feed() });
    for (const a of admitted || []) {
      if (!a?.doc || !a?.record) continue;
      try {
        addSource({
          title: a.record.title || a.item?.title, url: a.record.url || a.item?.url || null,
          text: a.doc.text, kind: 'web', record: a.record, doc: a.doc,
        });
      } catch { /* empty page or dup — the doc still grounds the turn */ }
    }
    return admitted || [];
  };

  // ── SEARCH — the sibling of ask() ──────────────────────────────────────────
  // ask() answers a question over the record; searchTopic() does the opposite motion — it GROWS
  // the record. A query typed in the search box is not answered: we open a dedicated "search
  // topic" on the left, named for the query, and pull the top salient web sources straight into
  // it. No results popup, no model. This is the deliberately thin version — the seams for the
  // full chat/search/parse pipeline are left OPEN, not wired:
  //   • formulateSearch — where a query PLANNER ("figure out the best way to search it": pick the
  //     source, rephrase, decompose) will sit. Today it is the identity.
  //   • topic.kind='search' / topic.query — a tag the sidebar and a future re-run/refine can read.
  //   • fetchPages+admit is the SAME primitive the chat's web loop stands on, so when the planner
  //     and parse steps land they slot in around this call rather than replacing it.
  const formulateSearch = (raw) => String(raw || '').trim();   // SEAM: query planning plugs in here

  // Pull the top salient web sources for `query` INTO an existing search topic `t`. Extracted so
  // both the first run and a resume (after a reload interrupted the search) fill the SAME topic —
  // addSource dedups by content hash, so re-running against a half-filled topic just tops it up.
  const fillSearchTopic = async (t, query, k, signal) => {
    let count = 0, first = null;
    const admitted = await searchAndAdmit(query, { client, k, kind: 'auto', fetchPages: true, signal });
    for (const a of admitted || []) {
      if (!a?.doc || !a?.record) continue;
      try {
        const s = addSource({
          title: a.record.title || a.item?.title, url: a.record.url || a.item?.url || null,
          text: a.doc.text, kind: 'web', record: a.record, doc: a.doc,
        });
        // addSource files a NEW source into the active (search) topic itself, but a hit that was
        // already recorded elsewhere returns as a dedup WITHOUT joining this topic — link it
        // explicitly so the search topic always contains the results it pulled (a source may
        // belong to many topics). Idempotent for the fresh sources addSource already added.
        if (s) { if (!t.sourceSns.includes(s.sn)) t.sourceSns.push(s.sn); count++; first = first || s; }
      } catch { /* empty page or dup — skip, keep pulling the next salient hit */ }
    }
    return { count, first };
  };

  const searchTopic = (raw, { k = 3 } = {}) =>
    runCancellable({ kind: 'search', label: `Searching the web — ${String(raw || '').trim()}` }, async (signal) => {
      const rawQuery = String(raw || '').trim();
      if (!rawQuery) return { topic: null, count: 0, first: null };
      const query = formulateSearch(rawQuery);
      // Open the search topic FIRST and make it active, so every admitted source nests under it
      // (addSource files into the current topic). Tagged as search-origin for later refine/re-run.
      // Remember where we were, so a fruitless search can fall back rather than strand the reader.
      const prevActive = state.activeTopicId;
      const t = topicNew(rawQuery, { workspaceId: state.activeWorkspaceId });
      t.kind = 'search'; t.query = rawQuery; t.searchQuery = query; t.named = true;
      // A durable job keyed to THIS search topic: a reload while the search is still fetching resumes
      // it into the same topic (fillSearchTopic re-runs the admit; dedup keeps it idempotent).
      const jid = beginJob({ kind: 'search', query, k, topicId: t.id });
      let count = 0, first = null;
      try {
        ({ count, first } = await fillSearchTopic(t, query, k, signal));
        settleJob(jid, 'done');
      } catch (e) {
        settleJob(jid, signal.aborted ? 'stopped' : 'error', String(e?.message || e).slice(0, 90));
        // Tidy an empty search topic (nothing landed before the error/Stop), then re-throw. Guard on
        // the topic's OWN sources, not `count` — a mid-loop throw may have filed some before failing;
        // those keep the topic (matching the pre-refactor finally, which counted inside the loop).
        if (!t.sourceSns.length) { topicDelete(t.id); if (prevActive && topicById(prevActive)) setTopic(prevActive); }
        throw e;
      }
      // Nothing landed — empty result or a Stop before the first hit. Don't strand an empty search
      // topic in the sidebar: drop it and return the reader to where they were.
      if (!count) {
        topicDelete(t.id);
        if (prevActive && topicById(prevActive)) setTopic(prevActive);
        logIt('search', `Search "${rawQuery}"`, 'no sources'); return { topic: null, count: 0, first: null };
      }
      logIt('search', `Search topic "${rawQuery}"`, `${count} source${count === 1 ? '' : 's'}`);
      persist(); emit('topics'); emit('sources');
      return { topic: t, count, first };
    });

  const ingestText = (text, title = 'Pasted text') => {
    const doc = parseText(String(text), { docId: `doc-${shaShort(webContentHash(text))}` });
    return addSource({ title, text: String(text), kind: 'text', doc });
  };

  // ── audio: original bytes + non-destructive transcript edits/redactions ─────────────────────
  // The original clip rests in OPFS (off the JSON snapshot), keyed by content hash, so an audio
  // source can still be PLAYED and its redactions re-synthesised after a reload — the blob: URL the
  // import made dies with the tab; these bytes do not. Signed into Matrix, a second ENCRYPTED copy
  // is deposited to Matrix media via the vault (window.EO.vault, content-addressed + deduped).
  const audioStore = createAudioStore();
  const MEDIA_MAX_BYTES = 120 * 1024 * 1024;   // above this, keep the clip session-only (don't flood OPFS)
  const vaultRef = () => { try { return (typeof window !== 'undefined' && window.EO && window.EO.vault) || null; } catch { return null; } };
  const matrixSignedIn = () => { try { const m = (typeof window !== 'undefined' && window.EO && window.EO.matrix); return !!(m && m.identity && m.identity() && m.identity().token); } catch { return false; } };

  // The compact acoustic reading that must survive a reload — the underscore artefacts
  // (_wave/_analysis/_holons) are stripped by serialize(), so a small subset rides the snapshot:
  // enough to redraw the waveform (peak amplitudes), tint signal vs noise (signal spans), and fill
  // the stat pills. Built from the live artefacts at import/transcription time.
  // Downsample the waveform peaks to a snapshot-friendly bar count (the media panel draws ≤200
  // bars anyway), taking the loudest amp per bucket so the shape is preserved.
  const compactPeaks = (wave, n = 200) => {
    const len = wave.length;
    if (!len) return [];
    const N = Math.min(n, len), per = len / N, out = [];
    for (let i = 0; i < N; i++) {
      const a = Math.floor(i * per), b = Math.max(a + 1, Math.floor((i + 1) * per));
      let amp = 0; for (let j = a; j < b && j < len; j++) amp = Math.max(amp, wave[j].amp || 0);
      out.push({ amp: +amp.toFixed(4) });
    }
    return out;
  };
  const audioMetaOf = (src) => {
    const an = src._analysis || null, h = src._holons || null, wave = src._wave || null;
    if (!an && !h && !wave) return src.audioMeta || null;
    const m = src.audioMeta || {};
    return {
      duration: (an && an.duration) || (h && h.root && h.root.dur) || m.duration || 0,
      peaks: Array.isArray(wave) ? compactPeaks(wave, 200) : (m.peaks || null),
      peakDb: an ? an.peakDb : (m.peakDb ?? null),
      rmsDb: an ? an.rmsDb : (m.rmsDb ?? null),
      dynamicRangeDb: an ? an.dynamicRangeDb : (m.dynamicRangeDb ?? null),
      silencePct: an ? an.silencePct : (m.silencePct ?? null),
      signalSeconds: h ? h.signalSeconds : (m.signalSeconds ?? null),
      signalSpans: h && Array.isArray(h.signalSpans) ? h.signalSpans.map((sp) => ({ start: sp.start, end: sp.end })) : (m.signalSpans || null),
    };
  };

  // Persist the original bytes for a freshly-imported audio/video source: OPFS locally, plus an
  // encrypted copy on Matrix media when signed in. Best-effort and off the critical path — a
  // failure just leaves the source playable for this session only.
  const persistAudioBytes = async (src, file, mediaKind) => {
    try {
      if (!file || file.size > MEDIA_MAX_BYTES) {
        if (file) logIt('skip', `${file.name} too large to keep offline (${Math.round(file.size / 1048576)} MB) — playable this session only`, src.reg);
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha = await sha256Hex(bytes);
      const mime = file.type || (mediaKind === 'video' ? 'video/mp4' : 'audio/mpeg');
      src.audioRef = { opfs: sha, mime, size: bytes.length };
      await audioStore.putBytes(sha, bytes);
      persist();
      if (matrixSignedIn() && vaultRef()) {
        vaultRef().save(bytes, { name: file.name, mime }).then((r) => {
          if (r && r.ok && r.block) { src.audioRef = { ...src.audioRef, mxc: r.block }; persist(); logIt('record', `Encrypted ${src.reg} to Matrix media`, src.reg); }
        }).catch(() => { /* the cloud copy is best-effort */ });
      }
    } catch { /* persistence is best-effort; the session copy still plays */ }
  };

  // A playable URL for an audio source: the live blob if this session imported it, else rehydrated
  // from the persisted bytes (OPFS, or the encrypted Matrix copy) so playback + redaction work
  // after a reload. Cached back onto _media. Null when the bytes are gone (too large, or evicted).
  const playableUrl = async (src) => {
    if (!src) return null;
    if (src._media && src._media.url) return src._media.url;
    const bytes = await audioBytes(src);
    if (!bytes) return null;
    try {
      const ref = src.audioRef || {};
      const url = URL.createObjectURL(new Blob([bytes], { type: ref.mime || 'audio/mpeg' }));
      src._media = { url, kind: ref.mime || 'audio', isVideo: !!(ref.mime && ref.mime.startsWith('video/')) };
      emit('sources');
      return url;
    } catch { return null; }
  };

  // The raw persisted bytes for a source (for the redaction re-synthesis in the surface). Null when
  // nothing was kept. Prefers OPFS, falls back to the encrypted Matrix copy.
  const audioBytes = async (src) => {
    const ref = src && src.audioRef;
    if (!ref) return null;
    try { if (ref.opfs) { const b = await audioStore.getBytes(ref.opfs); if (b) return b; } } catch { /* fall through */ }
    if (ref.mxc && vaultRef()) { try { const r = await vaultRef().open(ref.mxc); if (r && r.ok) return r.bytes; } catch { /* offline */ } }
    return null;
  };

  // The chokepoint for a non-destructive transcript edit or redaction: the event lands on the
  // source's append-only `audioEvents` log, and the plain-text reading is RECOMPUTED from the
  // baseline words + the log (transcript-edit.projectTranscript) so chat, grounding and EoT all read
  // the edited/redacted transcript. Nothing is overwritten — the original rides in the event.
  const recordAudioEvent = (src, evt) => {
    if (!src || !evt || !evt.op) return null;
    if (!Array.isArray(src.audioEvents)) src.audioEvents = [];
    const ev = { ...evt, ts: evt.ts || nowMs(), id: evt.id || `${evt.op}-${src.audioEvents.length}-${nowMs()}` };
    src.audioEvents.push(ev);
    const proj = projectTranscript(src.words || [], src.audioEvents);
    src.text = proj.text;
    src.bytes = bytesOf(src.text);
    src.sha = webContentHash(src.text);
    src._doc = null; src._eot = null;
    deepReaders.delete(src.docId);
    try { src.entCount = projectGraph(docFor(src).log).entities?.size || 0; } catch { /* keep prior */ }
    logIt('record', `${ev.op === 'REDACT' ? 'Redacted' : ev.op === 'RETRACT' ? 'Reverted' : 'Edited'} ${src.reg} transcript`, src.reg);
    persist(); emit('sources');
    return ev;
  };

  // The transcription status, kept in two twinned places. `_asr` (underscore) is the RICH LIVE
  // object the surface reads — state, pct, and the streaming `partial` tail — and is stripped from
  // the snapshot (serialize() drops underscore fields). `src.transcription` is its small DURABLE
  // twin (state + pct only, no partial) that DOES ride the snapshot — so after a reload the app
  // knows a clip was mid-transcription and the surface can still show the banner. This one setter
  // keeps them in lockstep; on restore, `_asr` is re-seeded from `transcription`.
  const setAsr = (src, patch) => {
    if (!src) return;
    src._asr = { ...(src._asr || {}), ...patch };
    src.transcription = { state: src._asr.state, pct: src._asr.pct || 0, reason: src._asr.reason || null };
  };

  // Fold a landed transcript back into an audio source that was already recorded from its
  // acoustic reading: the words become the source's text, the word-level organ doc (with its
  // timings, witness and carried-forward waveform/holons) becomes its reading, and the derived
  // caches are dropped so the reader re-reads the transcript rather than the placeholder.
  const applyTranscript = (src, text, doc, coverage) => {
    const body = String(text || '').trim();
    if (!body || !doc) return;
    src.text = body;
    src.bytes = bytesOf(body);
    src.sha = webContentHash(body);
    src._doc = doc;
    src._eot = null;
    deepReaders.delete(src.docId);
    // The interactive transcript's persisted substrate: the heard words with their timings become
    // the immutable baseline, and an empty append-only edit log. Both ride the snapshot (small
    // plain JSON), so the Listen surface — click-to-seek, karaoke, edits, redactions — survives a
    // reload without the session-only `_doc`. audioMeta keeps the waveform + stats drawable too.
    src.words = (doc.tokens || []).map((t) => ({ text: t.text, start: t.start, end: t.end }));
    if (!Array.isArray(src.audioEvents)) src.audioEvents = [];
    src.audioMeta = audioMetaOf(src) || src.audioMeta || null;
    try { src.entCount = projectGraph(doc.log).entities?.size || 0; } catch { /* keep prior */ }
    if (coverage) src.coverage = coverage;
    setAsr(src, { state: 'done', pct: 100, partial: '' });
    logIt('record', `Transcribed ${src.reg} — ${body.length.toLocaleString()} chars`, src.reg);
    setTimeout(() => {
      try { const d = docFor(src); logIt('eot', `Encoded ${src.reg} into EoT — ${d?.log ? emitEot(d.log).lines.length : 0} propositions`, src.reg); }
      catch { /* the record already stands */ }
    }, 0);
    persist(); emit('sources');
  };

  // Run a transcription thunk against an already-recorded audio source: stream partials into the
  // live ASR state + repaint, fold the finished transcript in, and close the durable transcribe job.
  // Shared by the first import AND by a resume after a reload (there the thunk comes from a fresh
  // import of the same OPFS bytes). Idempotent — applyTranscript rewrites by content hash, and the
  // job is keyed by the source, so a resume finds and closes the same job.
  const runTranscription = async (src, transcribe, { signal, progress } = {}) => {
    const jid = beginJob({ kind: 'transcribe', sn: src.sn });   // idempotent (keyed by sn); carries attempts
    setAsr(src, { state: 'running' });
    emit('sources');
    const paint = (label) => { try { progress && progress({ kind: 'file', label }); } catch { /* pill is best-effort */ } };
    paint('Transcribing the signal…');
    let lastPaint = 0;
    try {
      const res = await transcribe({
        signal,
        twoWitness: !!state.auditReadings,
        onPartial: (p) => {
          paint(`Transcribing… ${p.pct != null ? p.pct + '%' : ''}`);
          setAsr(src, { pct: p.pct || 0, partial: String(p.text || '').slice(-2000) });
          // Repaint the media panel's live transcript at most a few times a second.
          const now = nowMs();
          if (now - lastPaint > 350) { lastPaint = now; emit('sources'); }
        },
      });
      if (res && res.empty) {
        setAsr(src, { state: 'skipped', reason: 'no speech found in the signal', pct: 100, partial: '' });
        settleJob(jid, 'skipped'); persist(); emit('sources');
      } else if (res && res.doc) {
        applyTranscript(src, res.text, res.doc, res.coverage);   // sets _asr done + persists
        settleJob(jid, 'done');
      } else {
        settleJob(jid, 'done');   // the run finished with nothing to fold; don't resume it again
      }
    } catch (e) {
      if (signal && signal.aborted) { setAsr(src, { state: 'stopped' }); settleJob(jid, 'stopped'); }
      else { setAsr(src, { state: 'error', reason: String(e?.message || e).slice(0, 90) }); settleJob(jid, 'error', String(e?.message || e).slice(0, 90)); logIt('skip', `Transcription failed for ${src.reg} — ${String(e?.message || e).slice(0, 90)}`); }
      persist(); emit('sources');
    }
  };

  // Stash a file's original bytes to OPFS and open a durable `file` job, so a reload DURING the
  // import (fetch of the extractor libs, PDF/OCR read, audio decode — all before any source has
  // landed) can rebuild the File and re-run the import. Returns the job id, or null when the file
  // is too large to keep offline (the import still runs; it just won't survive a mid-way reload).
  // Best-effort — a stash fault never fails the import. Dropped (and the bytes deleted) once the
  // source lands (settleJob), so it never leaks OPFS beyond the life of the in-flight import.
  const beginFileJob = async (file) => {
    try {
      if (!file || file.size > MEDIA_MAX_BYTES) {
        if (file) logIt('skip', `${file.name} too large to make reload-safe (${Math.round(file.size / 1048576)} MB) — re-drop it if you reload before it finishes`);
        return null;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha = await sha256Hex(bytes);
      await ingestStore.putBytes(sha, bytes);
      return beginJob({ kind: 'file', sha, name: file.name || 'file', mime: file.type || '' });
    } catch { return null; }
  };

  const ingestFile = (file, fileOpts = {}) =>
    runCancellable({ kind: 'file', label: `Reading ${file.name}…` }, async (signal, progress) => {
      // Make the import reload-safe from the first byte: stash the file + open a durable job now,
      // before the (possibly slow) extractor even loads. Dropped the moment the source lands below.
      const fileJid = await beginFileJob(file);
      const settleFile = (status, reason) => { if (fileJid) settleJob(fileJid, status, reason); };
      const { importAnyFile } = await import('./import-file.js');
      let got;
      try { got = await importAnyFile(file, { signal, onProgress: (msg) => progress({ kind: 'file', label: String(msg) }) }); }
      catch (e) { settleFile(signal.aborted ? 'stopped' : 'error', String(e?.message || e).slice(0, 90)); throw e; }

      // ── MEDIA — the source lands AT ONCE from its acoustic reading; transcription follows. ──
      // An audio/video import returns a full pre-transcription reading (waveform + basic
      // analysis + signal/noise nested holons) plus a deferred `transcribe` thunk. We record
      // the source immediately (so it shows up as a source, playable, with its visualization),
      // reveal it, THEN run transcription in the background — only if there was signal to hear.
      if (got.meta?.modality === 'audio' && got.meta?.doc) {
        const src = addSource({ title: got.title || file.name, text: got.text, kind: 'audio', rights: 'local file', doc: got.meta.doc });
        // The source has landed and persists on its own now — the pre-source decode window the file
        // job covered is over. The original bytes (audio store, below) + the transcribe job carry
        // reload-safety from here, so drop the file job and its stashed copy rather than double-keep.
        settleFile('done');
        if (src) {
          // The playback + visualization artefacts ride the source as underscore fields, so they
          // are session-only (never structure-cloned into the persisted snapshot; serialize()
          // strips anything underscore-led) and re-derive on a fresh import.
          src._media = got.meta.media ? { url: got.meta.media, kind: got.meta.mediaKind, isVideo: !!got.meta.isVideo } : null;
          src._wave = got.meta.waveform || null;
          src._analysis = got.meta.analysis || null;
          src._holons = got.meta.holons || null;
          setAsr(src, got.meta.transcribable
            ? { state: 'pending', pct: 0, partial: '' }
            : { state: 'skipped', reason: 'no signal above the noise floor', pct: 0, partial: '' });
          // The waveform + stat reading, in a compact persisted form so the Listen surface still
          // draws them after a reload (the underscore artefacts above are stripped from the snapshot).
          src.audioMeta = audioMetaOf(src);
          if (!Array.isArray(src.audioEvents)) src.audioEvents = [];
          const cov = got.meta.coverage;
          if (cov) { src.coverage = cov; logIt(cov.complete ? 'record' : 'skip', `Coverage — ${cov.transcribable ? '100% of ' + file.name + ' read as sound; transcribing signal' : (cov.dropped || []).join('; ')}`, src.reg); }
          // Open the durable transcribe job NOW — before the (slow) whisper load — so a reload during
          // the model download or the decode still resumes it. Keyed by the source (audio bytes below).
          if (got.meta.transcribable) beginJob({ kind: 'transcribe', sn: src.sn });
          persist(); emit('sources');
          // Keep the original bytes so playback + redaction — and a resumed transcription — survive a
          // reload: OPFS locally, plus an encrypted copy on Matrix media when signed in. Background.
          persistAudioBytes(src, file, got.meta.mediaKind);
          if (typeof fileOpts.onSource === 'function') { try { fileOpts.onSource(src); } catch { /* reveal is best-effort */ } }

          // Transcription proper — streamed, resumable, job-tracked (runTranscription). If the tab
          // reloads part-way, the transcribe job + the OPFS audio bytes let resumeJobs pick it up.
          if (got.meta.transcribe) await runTranscription(src, got.meta.transcribe, { signal, progress });
        }
        return src;
      }
      // For a structured modality the ORGAN doc is the reading: a table's cells, a JSON
      // tree's leaves, a binary's string runs ARE its propositions — three-faced events
      // already on the log — and re-parsing their rendered lines as prose would drop
      // them. Prose-bearing modalities (pdf, webpage, ocr, audio transcript, plain text)
      // parse as text so the entity/relation read runs over the actual sentences.
      // A MIDI score is structured like a table: the ORGAN doc (pitch-class entities +
      // interval bonds) IS the reading — re-parsing the human summary as prose would drop
      // the note graph the music organ raised. Its readable `text` is the summary the
      // organ carries; STRUCTURED_MODALITIES (first-surface.js) keeps the two lists aligned.
      const structured = ['table', 'json', 'binary', 'music'].includes(got.meta?.modality) && got.meta?.doc;
      // Prose parses through the parser's CHUNKED path (onProgress → yield between chunks),
      // so a 2,500-page document's entity/relation read no longer runs as one synchronous
      // sweep that freezes the tab for seconds — it breathes, reports progress, and stays
      // stoppable. The work and its order are byte-identical to the plain sweep (pipeline.js);
      // `await` passes the structured (already-parsed) doc straight through unchanged.
      const doc = structured
        ? got.meta.doc
        : await parseText(got.text, {
            docId: `doc-${shaShort(webContentHash(got.text))}`,
            onProgress: (p) => {
              if (p && p.phase === 'parse' && p.total)
                progress({ kind: 'file', label: `Reading the text… ${p.done.toLocaleString()} / ${p.total.toLocaleString()} sentences` });
            },
          });
      const src = addSource({ title: got.title || file.name, text: got.text, kind: got.meta?.modality || 'file', rights: 'local file', doc });
      // The source has landed and persists (src.text rides the snapshot); the import is complete, so
      // drop the file job and its stashed bytes. A reload from here on re-derives the reading lazily.
      settleFile('done');
      // The coverage receipt — proof that 100% of the file was processed, or the named
      // account of what could not be (import-file.js) — rides the source and the ledger.
      const cov = got.meta?.coverage;
      if (cov && src) {
        src.coverage = cov;
        if (cov.complete) logIt('record', `Coverage — 100% of ${file.name} processed`, src.reg);
        else logIt('skip', `Partial read of ${file.name} — ${(cov.dropped || []).join('; ')}`, src.reg);
        persist();
      }
      return src;
    });

  // ── resume — pick back up the ingest/transcription in flight when the tab last closed ─────────
  // Re-run a resumed AUDIO TRANSCRIPTION from the original bytes kept for playback: rebuild a File
  // from the OPFS/vault copy, re-read it (waveform + the transcribe thunk), and run the thunk. The
  // whole thing is idempotent — the source already exists, applyTranscript rewrites by content hash,
  // and the transcribe job is keyed by the source. Wrapped in runCancellable so Stop cancels it.
  const resumeTranscribe = (job) =>
    runCancellable({ kind: 'file', label: 'Resuming transcription…' }, async (signal, progress) => {
      const src = sourceBySn(job.sn);
      // The source is gone (removed after the reload was queued) — nothing to transcribe.
      if (!src) { settleJob(job.id, 'done'); return; }
      // Already finished (a completed run whose job-drop didn't flush before the reload) — close it.
      if (src.transcription && ['done', 'skipped'].includes(src.transcription.state) && (src.words || []).length) { settleJob(job.id, 'done'); return; }
      const bytes = await audioBytes(src);
      if (!bytes) { setAsr(src, { state: 'error', reason: 'original audio unavailable — re-import to transcribe' }); settleJob(job.id, 'done'); persist(); emit('sources'); return; }
      const ref = src.audioRef || {};
      const file = new File([bytes], src.title || 'clip', { type: ref.mime || 'audio/mpeg' });
      const { importAnyFile } = await import('./import-file.js');
      const got = await importAnyFile(file, { signal, onProgress: (msg) => progress({ kind: 'file', label: String(msg) }) });
      // Re-hydrate the session-only visualization artefacts too, so the Listen surface is whole again.
      if (got.meta) { src._wave = got.meta.waveform || src._wave; src._analysis = got.meta.analysis || src._analysis; src._holons = got.meta.holons || src._holons; }
      if (got.meta?.transcribe) await runTranscription(src, got.meta.transcribe, { signal, progress });
      else { setAsr(src, { state: 'skipped', reason: 'no signal above the noise floor', pct: 100, partial: '' }); settleJob(job.id, 'skipped'); persist(); emit('sources'); }
    });

  // Re-run a resumed WEB SEARCH into the topic it originally opened (not a fresh one), topping up
  // whatever landed before the reload. If that topic is gone, the job is done.
  const resumeSearch = (job) => {
    const t = topicById(job.topicId);
    if (!t) { settleJob(job.id, 'done'); return Promise.resolve(); }
    return runCancellable({ kind: 'search', label: `Resuming search — ${job.query}` }, async (signal) => {
      const jid = beginJob({ kind: 'search', query: job.query, k: job.k, topicId: t.id });
      try {
        const { count } = await fillSearchTopic(t, job.query, job.k || 3, signal);
        settleJob(jid, 'done');
        if (count) { persist(); emit('topics'); emit('sources'); }
      } catch (e) { settleJob(jid, signal.aborted ? 'stopped' : 'error', String(e?.message || e).slice(0, 90)); }
    });
  };

  // Re-run a resumed FILE import from the bytes stashed at open time (rebuilt into a File). ingestFile
  // re-opens the same file job (dedup by content hash keeps a source that already landed a no-op).
  const resumeFile = async (job) => {
    const bytes = await ingestStore.getBytes(job.sha);
    if (!bytes) { settleJob(job.id, 'done'); return; }   // bytes evicted / never stashed — can't resume
    await ingestFile(new File([bytes], job.name || 'file', { type: job.mime || '' })).catch(() => { /* ingestFile settles its own job */ });
  };

  // resumeOne — dispatch one job to its resumer. Sets the active topic to where the work belongs so
  // the resumed source files there. url/file re-run the public path (which manages its own job);
  // search/transcribe use the dedicated resumers above.
  const resumeOne = async (job) => {
    if (job.topicId && topicById(job.topicId) && job.topicId !== state.activeTopicId) setTopic(job.topicId);
    switch (job.kind) {
      case 'url':        await ingestUrl(job.url).catch(() => { /* ingestUrl settles its own job */ }); break;
      case 'search':     await resumeSearch(job); break;
      case 'file':       await resumeFile(job); break;
      case 'transcribe': await resumeTranscribe(job); break;
      default:           settleJob(job.id, 'done');
    }
  };

  // resumeJobs — on boot, walk the still-open jobs and re-run each in turn. Every resume counts as an
  // attempt (so a job that keeps crashing — or keeps getting interrupted — marches to the cap rather
  // than looping forever). Sequential on purpose: the ops share one Stop signal and one whisper
  // engine, so running them one at a time keeps the reload's recovery legible and cancellable.
  const resumeJobs = async () => {
    // Reconcile: any audio source left mid-transcription — its durable status still `pending` or
    // `running` — that has its bytes but no open transcribe job, re-open one. This makes a resume
    // robust even if the jobs list itself was lost. A `done`/`skipped` status is finished; an `error`
    // is left to its own persisted job (which carries the attempt cap) so a permanently-failing clip
    // is not re-queued from scratch on every boot.
    for (const s of state.sources) {
      const st = s.transcription && s.transcription.state;
      if ((st === 'pending' || st === 'running') && s.audioRef && !state.jobs.some((j) => j.kind === 'transcribe' && j.sn === s.sn)) {
        state.jobs = upsertJob(state.jobs, makeJob({ kind: 'transcribe', sn: s.sn, at: nowMs() }));
      }
    }
    const pending = resumableJobs(state.jobs);
    if (!pending.length) return;
    logIt('open', `Resuming ${pending.length} interrupted task${pending.length === 1 ? '' : 's'} from before the reload`);
    for (const job of pending) {
      state.jobs = patchJob(state.jobs, job.id, { attempts: (job.attempts || 0) + 1, status: 'running' });
      persist();
      try { await resumeOne(job); }
      catch (e) { settleJob(job.id, 'error', String(e?.message || e).slice(0, 90)); }
    }
  };

  // ── model ──────────────────────────────────────────────────────────────────
  let backendOverride = null;
  const backendPref = () => {
    if (backendOverride) return backendOverride;
    try { const v = localStorage.getItem('eo_backend'); if (v) return v; } catch { /* default */ }
    return (typeof navigator !== 'undefined' && navigator.gpu) ? 'webllm' : 'wllama';
  };
  // The WebGPU talkers — both ride the web-llm engine, so they share the stall wording,
  // the no-WebGPU blame check, and the wedge ladder's step down to the CPU model.
  const isWebgpuTalker = (b) => b === 'webllm' || b === 'qwen';
  let model = null, modelLoading = null, modelGen = 0;
  // Consecutive in-browser decode wedges (a lost / OOM'd WebGPU device). A clean answer clears it
  // (finishMessage); a second straight wedge steps DOWN to the smaller/CPU backup (resetWedgedLocalModel).
  let localWedges = 0;
  // THE ADAPTIVE STALL BUDGET. Every turn arms a no-progress watchdog (makeStallGuard); 45s is
  // right for most machines, but on a slow one a legitimate long prefill outlasts it, the turn
  // is aborted as a "stall", and the engine gets torn down for the crime of being slow. When the
  // wedge probe (probeModelAlive) proves the engine was alive all along, the budget DOUBLES (to a
  // 3-minute ceiling) so later turns on this machine get the room they demonstrably need.
  // Session-only — a fresh visit starts back at 45s.
  let stallBudgetMs = 45000;
  const STALL_BUDGET_MAX = 180000;
  // Drop the loaded model + orphan any in-flight load, so the next ensureModel starts fresh.
  const orphanModel = () => { model = null; modelLoading = null; modelGen++; };
  // Free an engine the app no longer owns (a superseded load, a bfcache corpse). Fire-and-forget
  // and fail-soft: reset() is optional (claude/echo have none) and an already-dead engine is fine.
  const freeOrphan = (m) => { Promise.resolve().then(() => m?.reset?.()).catch(() => { /* already gone */ }); };
  // `persist: false` is the AUTOMATIC path (the wedge ladder stepping down): the change holds for
  // this session but never overwrites the user's own saved pick — a transient bad day (a
  // backgrounded tab, one OOM) must not permanently hijack their choice of model, which is how
  // "I picked Llama and it keeps coming back as SmolLM2" happened. `force: true` reloads even when
  // the same backend is already up (the claude path re-keys through it).
  const setBackend = (name, { persist = true, force = false } = {}) => {
    const prev = backendPref();
    backendOverride = name;
    if (persist) { try { localStorage.setItem('eo_backend', name); } catch { /* session-only */ } }
    // RE-PICKING THE ACTIVE BACKEND MUST NOT UNLOAD IT. The picker calls this on every row click,
    // including the row already selected — before this guard that click orphaned a fully loaded
    // (or mid-download) engine and paid a whole reload for nothing. Loaded-for-this-name or
    // loading-this-name ⇒ keep it; a prior FALLBACK (pref webllm, wllama actually loaded) does
    // not count as live, so re-picking webllm genuinely retries it.
    const live = (model?.isLoaded?.() && model.id === name)
      || (!!modelLoading && state.model.backend === name && name === prev);
    if (!force && live) { emit('model'); return; }
    // Free the engine being walked away from, same as the wedge/bfcache paths: a dropped
    // handle alone leaves webllm's worker (the whole GPU weight buffer) running forever.
    const old = model;
    orphanModel();
    freeOrphan(old);
    state.model = { backend: name, state: 'cold', progress: 0, note: '' };
    emit('model');
  };
  // Fast/Fluent — the render-speed lever for the local Llama (webllm). 'fast' runs the
  // 1B build (~2× faster load, ~2–3× faster decode), 'fluent' the 3B; the pick is read
  // by model/webllm.js at load time. Only the size moves — grounding is mechanical and
  // downstream, so the record it can witness is identical either way. null ⇒ adaptive.
  // `speedOverride` is the session-only lane (the automatic 3B→1B step) — it wins over
  // the saved pick but never touches it, and ensureModel hands the EFFECTIVE speed to
  // the backend (opts.speed) so the override works without a localStorage write.
  let speedOverride = null;
  const speedPref = () => {
    if (speedOverride === 'fast' || speedOverride === 'fluent') return speedOverride;
    try { const v = localStorage.getItem('eo_llm_speed'); if (v === 'fast' || v === 'fluent') return v; } catch { /* default */ }
    return null;
  };
  const setSpeed = (speed, { persist = true } = {}) => {
    if (speed !== 'fast' && speed !== 'fluent') return;
    speedOverride = speed;
    if (persist) { try { localStorage.setItem('eo_llm_speed', speed); } catch { /* session-only */ } }
    // Only webllm reads this. If it is the active backend, orphan the loaded build so the
    // new size takes effect on the next load; for wllama/claude the pin sits dormant and
    // nothing needs to move — just re-emit so the chip reflects the new choice. And if the
    // WANTED size is already the loaded one (clicking Fluent when the adaptive pick landed
    // on 3B, re-clicking the highlighted size), keep the engine — never reload a build that
    // is already up.
    if (backendPref() === 'webllm') {
      const wantSize = speed === 'fast' ? '1B' : '3B';
      const loadedBuild = (model?.isLoaded?.() && model.id === 'webllm' && describeModel(model)?.model) || '';
      if (loadedBuild.includes(`-${wantSize}-`)) { emit('model'); return; }
      const old = model;
      orphanModel();
      freeOrphan(old);   // the other-size build's GPU buffers must not outlive the switch
      state.model = { backend: 'webllm', state: 'cold', progress: 0, note: '' };
    }
    emit('model');
  };
  // KEEP THE DOWNLOADED WEIGHTS. Both weight caches are origin storage — wllama streams GGUFs to
  // OPFS, web-llm keeps MLC shards in the Cache API — and un-persisted origin storage is exactly
  // what a browser evicts first under disk pressure. Evicted weights mean the "cached after the
  // first load" promise breaks and the next session silently re-downloads 140MB–2GB: the single
  // biggest "the model didn't stay loaded" between visits. Ask ONCE for durable storage the first
  // time a local model is about to load. Best-effort: Chrome grants silently on engagement,
  // Firefox may prompt, a denial changes nothing — we just stay evictable, as today.
  let persistAsked = false;
  const ensurePersistentStorage = () => {
    if (persistAsked) return;
    persistAsked = true;
    try {
      const st = typeof navigator !== 'undefined' ? navigator.storage : null;
      if (!st || typeof st.persist !== 'function') return;
      Promise.resolve(typeof st.persisted === 'function' ? st.persisted() : false)
        .then((already) => (already ? null : st.persist()))
        .then((granted) => { if (granted) logIt('record', 'Storage marked persistent — the browser won’t evict the downloaded model weights'); })
        .catch(() => { /* stays evictable — no worse than before */ });
    } catch { /* no storage manager here */ }
  };
  const ensureModel = async () => {
    if (model?.isLoaded?.()) return model;
    if (modelLoading) return modelLoading;
    const gen = ++modelGen;
    const name = backendPref();
    state.model = { backend: name, state: 'loading', progress: 0, note: 'starting…' };
    emit('model');
    modelLoading = (async () => {
      const tryLoad = async (backend) => {
        // The EFFECTIVE speed rides in as an opt (session override included) so a
        // persist:false downgrade reaches the backend without a localStorage write.
        const m = createModel(backend, { speed: speedPref() });
        // A local backend is about to put real weight into origin storage — ask (once)
        // that the browser not evict it. Remote backends (claude) store nothing.
        if (m.kind === 'local') ensurePersistentStorage();
        // THE STALL CLOCK. webllm reports progress per fetched CHUNK, and its first
        // chunk is 130–200 MB — on a slow link the chip legitimately sits at
        // "Start to fetch params — 0%" for minutes with no callback at all, which
        // reads as broken ("all models having problems loading") when it is merely
        // mute. And when the network really is blocking the host, that same silent
        // 0% is all the user ever sees. So: count the quiet seconds since the last
        // progress callback and SAY them — first as patience ("the first chunk is
        // large"), and past 90s as the honest suspicion (a blocked host) with a way
        // out. The clock only annotates; it never aborts a slow-but-alive download.
        let lastCb = Date.now(), lastNote = 'starting…';
        const stallClock = setInterval(() => {
          if (gen !== modelGen) return;                      // superseded — not ours to narrate
          const quiet = Math.round((Date.now() - lastCb) / 1000);
          if (quiet < 20) return;
          const hint = (isWebgpuTalker(backend) && quiet < 90)
            ? `no data for ${quiet}s — the first chunk is 130–200 MB, a slow link sits at 0% a while`
            : `no data for ${quiet}s — if this never moves, this network may be blocking ` +
              `${backend === 'claude' ? 'api.anthropic.com' : 'huggingface.co'}; pick another model from the chip`;
          state.model = { backend, state: 'loading', progress: state.model.progress || 0, note: `${lastNote} · ${hint}` };
          emit('model');
        }, 10000);
        try {
          await m.load((p) => {
            // Every backend reports progress as { phase, pct } (the shape is spelled out in
            // model/wllama.js and emitted the same by model/webllm.js / anthropic.js). The old
            // code read p.progress / p.text — fields NO backend emits — so `frac` was always 0 and
            // `note` always '': the chip sat at "webllm · 0%" through a multi-GB download and read
            // as stuck / "not loading" until it abruptly finished. Read the real fields.
            const frac = typeof p === 'number' ? p : (p?.pct ?? 0);
            const note = typeof p === 'object' ? (p?.phase || '') : '';
            lastCb = Date.now();
            if (note) lastNote = note;
            // A downloaded chunk is progress: when a turn is already waiting on this load (the user
            // asked mid-download over a slow link), keep its no-progress watchdog alive so the slow
            // download is not mistaken for a hang and aborted as a stall. A truly blocked host emits
            // no chunk, so the guard still trips — this only credits genuine forward motion. No-op
            // during the at-rest prewarm, where no guard is armed (stallGuard is null).
            stallGuard?.feed();
            state.model = { backend, state: 'loading', progress: Math.round(frac * 100) / 100, note };
            emit('model');
          });
        } finally { clearInterval(stallClock); }
        return m;
      };
      // LLM-first, always: webllm → wllama, and NO echo in the ladder — a silent
      // fall to the echo skeleton reads as garbage, not an answer. If no LLM can
      // load, the surface says so plainly and offers a retry instead of faking it.
      const ladder = [...new Set([name, 'wllama'])];
      let lastErr = null;
      for (const backend of ladder) {
        try {
          const m = await tryLoad(backend);
          // SUPERSEDED by a newer setBackend/setSpeed/reset while we loaded. The old code
          // returned the orphan uncommitted — every caller then decoded on a build the user
          // had just switched away from, and NOTHING ever freed it: up to ~2GB of GPU/WASM
          // memory leaked per click-during-load, which is exactly the memory pressure that
          // loses WebGPU devices and wedges the NEXT model. Free the orphan and answer with
          // the CURRENT pick instead (ensureModel dedupes, so this joins any load already
          // in flight rather than starting a third).
          if (gen !== modelGen) { freeOrphan(m); return ensureModel(); }
          // WARM THE PIPELINE ("shoot a message to get warm"). A local WebGPU/WASM backend pays
          // its shader/kernel warmup on the FIRST decode — silent, no progress tick — so a cold
          // first answer stalls seconds after the download already read "done". Spend it now on a
          // throwaway one-token draw with the chip showing "warming…", so the first real question
          // answers fast (4.1's mount posture). Best-effort and gen-checked: a warmup fault never
          // demotes a model that already loaded; claude (remote) proves itself in load() and the
          // instant skeletons no-op through it.
          if (m.kind === 'local') {
            state.model = { backend, state: 'loading', progress: 1, note: 'warming…' };
            emit('model');
            // Bounded: webllm only arms its wedge backstop when a signal exists, so a
            // signal-less warmup that wedges would hold modelLoading (and the chip at
            // "warming…") for the rest of the session.
            const warmupSignal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined;
            try { await m.phrase([{ role: 'user', content: '.' }], { maxTokens: 1, temperature: 0, signal: warmupSignal }); } catch { /* warmed or not, it loaded */ }
            if (gen !== modelGen) { freeOrphan(m); return ensureModel(); }   // superseded mid-warmup — same as above
          }
          state.model = { backend, state: 'ready', progress: 1, note: backend === name ? '' : `fell back from ${name}` };
          emit('model');
          model = m;
          return m;
        } catch (e) {
          lastErr = e;
          if (gen !== modelGen) throw e;    // superseded — stop the orphaned ladder quietly
          // Blame WebGPU only when WebGPU is actually absent. webllm also fails on a
          // blocked CDN or weights host, and the old note pointed every such user at
          // chrome://flags — a fix for a problem they didn't have, hiding the real one.
          const noGpu = isWebgpuTalker(backend) && !(typeof navigator !== 'undefined' && navigator.gpu);
          const why = noGpu
            ? 'needs WebGPU (chrome://flags or Chrome/Edge); falling back to the CPU model'
            : String(e?.message || e).slice(0, 120);
          logIt('skip', `Model ${backend} failed to load — ${why}`);
        }
      }
      if (gen === modelGen) {
        // The whole ladder is down — the one moment a network probe pays for itself.
        // The runtimes' own errors can't tell "your GPU" from "your firewall"; a
        // 3.5s no-cors HEAD per model host can (model/reach.js), and names the
        // blocked origin in the note instead of leaving an opaque failure.
        let reach = '';
        try { reach = explainReach(await probeOrigins()); } catch { /* nothing provable — say nothing */ }
        state.model = { backend: name, state: 'error', progress: 0,
          note: `No local model could load — ${String(lastErr?.message || lastErr).slice(0, 140)}${reach ? ` · ${reach}` : ''}` };
        emit('model');
      }
      throw lastErr;
    })();
    // Release the latch ONLY if it is still ours. A setBackend/setSpeed mid-load nulls and
    // may REPLACE modelLoading with a fresh load; when the superseded promise then settled,
    // the old unconditional `modelLoading = null` dropped the NEW load's latch — so a third
    // caller started yet another load over it, each supersede orphaning the last: a restart
    // cascade that read as "the model never finishes loading".
    const p = modelLoading;
    try { return await p; } finally { if (modelLoading === p) modelLoading = null; }
  };

  // RECOVER A WEDGED IN-BROWSER MODEL. The no-progress watchdog fired on a LOCAL turn — the decode
  // went dark before its first token, or streamed a preamble and then died mid-decode (the
  // frozen-session shape) — the WebGPU engine has almost certainly lost its device (a backgrounded
  // tab, memory pressure from the ~1.9GB 3B weights, a driver reset). That engine is a singleton that
  // still claims isLoaded(), so every "Ask again to retry" calls into the corpse and stalls the same
  // way — the loop behind "why's it stuck". (The decode gate in model/webllm.js serializes decodes so
  // an OVERLAP can't wedge the runtime; this is the other failure — the device dying under a lone
  // decode — which the gate can't reach.) Tear it down so the NEXT ask reloads a fresh engine, and
  // keep the user's backup: a SECOND straight wedge steps DOWN the ladder — Fluent 3B → Fast 1B, then
  // 1B → the CPU model (wllama) — so a machine that can't hold the big build still answers. Whichever
  // model ends up talking is named in the record: every turn stamps describeModel(model)
  // (turn/pipeline.js) and the export dedups them, so a mid-session downgrade shows both. Synchronous
  // and fire-and-forget: the answer bubble settles now; recovery runs behind it.
  let wedgeProbe = null;   // the in-flight liveness check — concurrent stalls share one verdict
  const resetWedgedLocalModel = () => {
    const m = model;
    if (!m || m.kind !== 'local') return;   // a remote talker (claude) has no engine; a healthy model is never sent here
    if (wedgeProbe) return;                 // two turns stalling together get ONE probe, one strike, one budget bump
    const gen = modelGen;
    state.model = { ...state.model, note: 'the turn stalled — checking the in-browser model…' };
    emit('model');
    // THE EVIDENCE STEP (probeModelAlive above). A 45s no-progress stall has two causes that need
    // OPPOSITE cures: a dead engine (lost GPU device / dead worker) must be torn down and rebuilt,
    // but a slow-but-alive one must be LEFT ALONE — tearing it down pays a pointless reload and,
    // two strikes later, silently downgrades the user's pick. So ask the engine itself: one token,
    // raced against a window. A truly wedged webllm has already been killed from inside by its own
    // abort backstop (isLoaded() false ⇒ the probe's phrase throws at once), so the dead verdict is
    // usually immediate; the full window is only ever spent on an engine that is genuinely working.
    wedgeProbe = (async () => {
      const alive = await probeModelAlive(m);
      // Superseded while probing (the user switched models, a retry already reloaded) — not ours.
      if (gen !== modelGen || model !== m) return;
      if (alive) {
        // The engine answered: it never wedged, the machine is just SLOW. Keep it loaded — this
        // is the whole point — clear the strike, and widen the stall budget so the next long
        // prefill isn't aborted for lateness again.
        localWedges = 0;
        stallBudgetMs = Math.min(stallBudgetMs * 2, STALL_BUDGET_MAX);
        logIt('record', `The in-browser model is alive, just slow — turns now get ${Math.round(stallBudgetMs / 1000)}s before a stall is called`);
        state.model = { backend: state.model.backend || backendPref(), state: 'ready', progress: 1, note: 'slow but alive — kept loaded' };
        emit('model');
        return;
      }
      localWedges += 1;
      // Drop the app's handle FIRST so a slow/hung unload can never block the reload; free the
      // engine's memory in the background (reset → unload/terminate/exit), never awaited.
      orphanModel();
      freeOrphan(m);
      if (localWedges >= 2) {
        // A repeat PROVEN wedge — this device likely can't hold the current build. Step to the
        // backup for THIS SESSION ONLY (persist: false): the user's saved pick stays theirs, so a
        // transient bad day (a backgrounded tab, one OOM) can't permanently hijack it — the next
        // visit tries their real choice again.
        // The default IS the 3B build now, so any webllm that isn't explicitly pinned to
        // 'fast' is on the big build and has the lighter 1B rung to step down to first; only
        // an explicit 'fast' pin is already at the smallest webllm build and drops straight
        // to the CPU rung instead of wasting a wedge cycle reloading the same size.
        if (backendPref() === 'webllm' && speedPref() !== 'fast') {
          logIt('skip', 'In-browser model kept dying — dropping to the faster 1B build for this session');
          setSpeed('fast', { persist: false });
        } else if (isWebgpuTalker(backendPref())) {
          logIt('skip', 'WebGPU model kept dying — switching to the CPU model for this session');
          setBackend('wllama', { persist: false });
        } else {
          state.model = { backend: backendPref(), state: 'cold', progress: 0, note: 'reloading — the model stopped responding' };
          emit('model');
        }
        localWedges = 0;
      } else {
        state.model = { backend: backendPref(), state: 'cold', progress: 0, note: 'the in-browser model stopped responding — reloading' };
        emit('model');
      }
      // Warm the fresh pick in the background so the retry answers fast instead of paying the reload on
      // the critical path (the mount-time prewarm posture). Browser only; a manual retry also triggers it.
      if (typeof window !== 'undefined') setTimeout(() => { ensureModel().catch(() => { /* the ladder logs its own failure */ }); }, 200);
    })().catch(() => { /* recovery must never throw */ }).finally(() => { wedgeProbe = null; });
  };

  // ── THE MODEL KEEPER — the model heals itself instead of waiting to be asked ──────────────────
  // A loaded engine can silently become unloaded between turns: webllm drops its own singleton when
  // the WebGPU device is lost (a backgrounded tab, memory pressure, a driver reset), a failed load
  // leaves the chip on "error" until someone retries, and a bfcache restore can revive the page
  // around an engine whose GPU state died with the freeze. Before, ALL of these waited for the next
  // question — which then paid the whole reload on the critical path and could trip the turn
  // watchdog, reading as yet another wedge. The keeper reloads in the BACKGROUND at the moments a
  // recovery is likely to work: the tab coming back to the foreground, the network returning, and a
  // slow 30s watch for the quiet failures nothing announces. Exponential backoff (60s → 10min) on
  // repeated failures so a blocked network is probed politely, not hammered; any success resets it.
  let healFails = 0, healNotBefore = 0;
  const HEAL_WATCH_MS = 30000;
  const healModel = () => {
    if (!state.ready) return;
    if (typeof document !== 'undefined' && document.hidden) return;   // heal when the user can see it
    if (model?.isLoaded?.() || modelLoading) return;                  // nothing to heal / already healing
    if (Date.now() < healNotBefore) return;                           // backing off a failing load
    ensureModel().then(
      () => { healFails = 0; healNotBefore = 0; },
      () => {
        healFails = Math.min(healFails + 1, 6);
        healNotBefore = Date.now() + Math.min(60000 * 2 ** (healFails - 1), 600000);
      },
    );
  };
  // A bfcache restore (pageshow persisted) revives the page's JS — including a `model` handle —
  // around GPU state that may not have survived the freeze. isLoaded() answers true either way,
  // so PROVE it with the same one-token probe the wedge recovery uses; a corpse is freed and
  // reloaded quietly before the user ever asks it anything.
  const verifyRestoredModel = () => {
    const m = model;
    if (!m || m.kind !== 'local' || !m.isLoaded?.()) { healModel(); return; }
    const gen = modelGen;
    void probeModelAlive(m).then((alive) => {
      if (alive || gen !== modelGen || model !== m) return;
      orphanModel();
      freeOrphan(m);
      state.model = { backend: backendPref(), state: 'cold', progress: 0, note: 'reloading — the restored tab’s model didn’t survive' };
      emit('model');
      healModel();
    });
  };

  // embedders — hash is instant; MiniLM warms in the background on first ask. MiniLM is
  // wrapped in the persistent cache (model/embed-cache.js): every vector it computes
  // lands in IndexedDB, so a text embedded in ANY session is never embedded again — the
  // reader gets measurably faster the more it operates.
  const hashEmb = createHashEmbedder();
  let minilm = null, minilmWarming = false;
  const warmMinilm = () => {
    if (minilm?.isWarm?.() || minilmWarming) return;
    minilmWarming = true;
    try {
      minilm = withPersistentEmbedCache(createMiniLMEmbedder());
      minilm.warm().then(() => { emit('model'); buildShapeLib(); }).catch(() => { minilm = null; }).finally(() => { minilmWarming = false; });
    } catch { minilmWarming = false; }
  };

  // ── the form library (turn/shape.js) — built in the background once MiniLM is warm ──
  // Grammar mode when data/shapes.json is present: navigation embeds the 430 exemplar
  // prompts (a one-time cost the persistent cache amortises to zero across sessions);
  // draft scoring is model-free (move-grammar likelihood vs the assistant contrast).
  // Then the corpus navigation pool (data/nav-corpus.jsonl) extends the kNN under a
  // wall-clock budget — however far it reaches, coverage is breadth-first, and the next
  // session's budget starts where this one stopped (cached vectors cost no budget).
  // Every step degrades to inert, never to a broken turn: no shapes.json → legacy
  // cosine library; no exemplars → no library; a thrown build → shapeLib stays null.
  const NAV_POOL_BUDGET_MS = 45_000;
  let shapeLib = null, shapeLibBuilding = false;
  const buildShapeLib = () => {
    if (shapeLib || shapeLibBuilding || !minilm?.isWarm?.()) return;
    shapeLibBuilding = true;
    (async () => {
      try {
        const shapes = await loadShapeGrammars();
        const lib = await loadShapeLibrary((t) => minilm.embed(t), { shapes });
        if (!lib) return;
        shapeLib = lib;
        emit('model');
        await extendLibraryWithNavPool(lib, minilm, { budgetMs: NAV_POOL_BUDGET_MS });
        emit('model');
      } catch { /* the form path stays inert — never a broken turn */ }
      finally { shapeLibBuilding = false; }
    })();
  };

  // ── export provenance (rooms/reader/provenance.js) ───────────────────────────
  // WHAT PRODUCED THIS. The chat export must be able to name its own maker — the app + the exact
  // published build, the latest build on GitHub, and the model that answered. The build/latest reads
  // are network (version.json + the GitHub API); do them ONCE, best-effort, at boot and cache them,
  // so `exportChat` stays synchronous and composes the fresh model + clock over the cached pieces.
  // The repo/site is derived from the running location; in Node/tests there is no fetch, so the
  // cache stays empty and the export degrades to app + model, never a throw or a hang.
  const provRepo = repoRef(typeof location !== 'undefined' ? location : null);
  let provBuild = null, provLatest = null;
  const refreshProvenance = async () => {
    if (typeof fetch === 'undefined') return;   // no network here — the synchronous core still exports
    const f = fetch.bind(globalThis);           // detached window.fetch throws "Illegal invocation" in some browsers
    const base = (typeof location !== 'undefined' && location.href) || null;
    provBuild  = await readBuild(f, base).catch(() => null);
    provLatest = await fetchLatestCommit(f, provRepo.slug).catch(() => null);
    emit('model');   // a header badge can reflect the build/freshness once it's in
  };

  // ── web-search mode ──────────────────────────────────────────────────────────
  // off     — never reach the net (proposer-only stays silent; the answer rides its flag)
  // confirm — the turn proposes; the fetch waits on the user's click on the in-chat button
  // auto    — the engine fetches on a measured gap without a prompt: 4.1's internet-native
  //           default (docs/web-search.md), so an unrecorded question can go get its own
  //           sources. Persisted in localStorage; the surface reads webMode()/setWebMode().
  let webModeOverride = null;
  const webMode = () => {
    if (webModeOverride) return webModeOverride;
    try { const v = localStorage.getItem('eo_web_mode'); if (v === 'off' || v === 'confirm' || v === 'auto') return v; } catch { /* default */ }
    return 'auto';
  };
  const setWebMode = (mode) => {
    if (!['off', 'confirm', 'auto'].includes(mode)) return;
    webModeOverride = mode;
    try { localStorage.setItem('eo_web_mode', mode); } catch { /* session-only */ }
    logIt('web', `Web search set to ${mode}`);
    emit('web');
  };

  // ── redact-when-hosted (the confidentiality lever) ───────────────────────────
  // When ON, a HOSTED talker (Claude · Anthropic) never sees a real entity name: the turn's
  // messages pass through the privacy membrane (model/redact-remote.js) — every admitted entity
  // collapses to an opaque token on the way out, and the answer is restored locally. A local
  // in-browser model is untouched (it already runs where the names live), and the membrane is a
  // transparent passthrough for it, so the flag only bites a remote backend. Persisted; OFF by
  // default (the record is sent verbatim unless the user asks otherwise). Read redactRemote()/
  // setRedactRemote() from the surface.
  let redactRemoteOverride = null;
  const redactRemote = () => {
    if (redactRemoteOverride != null) return redactRemoteOverride;
    try { return localStorage.getItem('eo_redact_remote') === '1'; } catch { return false; }
  };
  const setRedactRemote = (on) => {
    redactRemoteOverride = !!on;
    try { localStorage.setItem('eo_redact_remote', on ? '1' : '0'); } catch { /* session-only */ }
    logIt('record', on
      ? 'Hosted chat set to REDACTED — real entities are replaced with tokens before they leave the browser'
      : 'Hosted chat set to send the record verbatim');
    emit('model');
  };
  // The real entity surfaces across the active topic's docs (the admitted labels) — the names the
  // membrane must keep off the wire. Reuses the same lexicon the answer/viewer segmentation reads.
  const redactionNames = () => {
    try { return entityLexicon(topicDocs()).map((e) => e.label); } catch { return []; }
  };

  // ── chat ───────────────────────────────────────────────────────────────────
  // `abort` (turn) + `opAbort` (ingest) + `stallGuard` are declared up in the ingest section so
  // `stop()` reaches EVERY long op, not just a chat turn — the universal Stop. Stop trips whichever
  // signals are in flight (turn, ingest, or both) and clears the busy label AT ONCE, so the UI
  // reflects "stopped" immediately even when a slow backend or a hung proxy is still unwinding in
  // the background (the op's own finally is a no-op by then). It never throws: a settled op has
  // already nulled its controller.
  //
  // The module `abort`/`stallGuard` refs only name the NEWEST turn — but turns can OVERLAP (ask
  // in one topic, switch, ask in another), so every in-flight turn's controller is ALSO tracked
  // in `liveTurns` and Stop halts them all; each turn cleans up only its own kit (armTurn below).
  // When the module refs were the only handle, the first turn's finally cleared the second turn's
  // live watchdog and nulled its controller — leaving that turn unstoppable and unsettleable:
  // the eternal "● reading the record" with a dead Stop button.
  const liveTurns = new Set();   // every in-flight turn's controller
  const stop = () => {
    for (const c of [...liveTurns]) { try { c.abort(); } catch { /* already done */ } }
    try { opAbort?.abort(); } catch { /* already done */ }
    setBusy(null);
  };

  // A NO-PROGRESS WATCHDOG — 4.1's `_stallGuard`, which 4.2 had dropped (the regression behind
  // "it gets stuck and I can't even hit Stop"). A turn's model decode or a web fetch can stall
  // OUTRIGHT — a promise that neither resolves nor rejects — leaving the answer bubble spinning
  // with nothing able to recover it. This aborts the turn's OWN signal (`ctrl`, captured — never
  // the module ref, which by trip time may be another turn's) AND rejects `race` when no
  // progress (a streamed token, a pipeline step, a research beat) arrives for `ms`, so the turn
  // always settles, the `finally` always runs, and the bubble always finalizes with whatever
  // streamed. `feed()` re-arms the deadline on every sign of life; a live-but-slow model runs on.
  const makeStallGuard = (ctrl, ms = 45000) => {
    let timer = null, tripped = false, stalled = false, trip = null;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const doTrip = (err) => { if (tripped) return; tripped = true; clear(); if (trip) trip(err); };
    const feed = () => {
      if (tripped) return;
      clear();
      timer = setTimeout(() => {
        stalled = true;   // the WATCHDOG fired — no progress for `ms`, distinct from a user Stop
        try { ctrl?.abort(); } catch { /* already aborted */ }
        doTrip(Object.assign(new Error('the turn stalled — no progress'), { stalled: true }));
      }, ms);
    };
    const race = new Promise((_, rej) => { trip = rej; });
    race.catch(() => {});   // a tripped guard nobody is racing must never surface as unhandled
    // A user Stop settles the turn AT ONCE — the bubble finalizes immediately even if the
    // backend is slow to unwind its decode, so Stop never feels dead.
    if (ctrl?.signal) ctrl.signal.addEventListener('abort',
      () => doTrip(Object.assign(new Error('stopped'), { stopped: true })), { once: true });
    feed();
    // `stalled()` is true ONLY when the no-progress timer fired (a wedge to recover from), never on a
    // user Stop — resetWedgedLocalModel keys off it so a deliberate Stop never reloads a healthy model.
    return { feed, clear, race, tripped: () => tripped, stalled: () => stalled };
  };

  // armTurn() → one turn's whole cancellation kit, SCOPED TO THAT TURN:
  //   ctrl       its AbortController (the walk's / the backends' signal)
  //   guard      its no-progress watchdog
  //   raceGuard  race a turn await against ITS watchdog: a stall rejects (and the signal
  //              aborts) so control returns instead of hanging
  //   keepAlive  feed ITS watchdog while an OPAQUE model call runs (keepGuardAlive above):
  //              query formulation / sense disambiguation stream nothing, so without this a
  //              slow local decode trips the 45s guard and reads as a stall. keepAliveFn
  //              wraps an injected async utility (the walk's disambiguator) the same way.
  //   disarm     the finally: clear ITS guard, drop ITS controller, and release the module
  //              refs only if they are still its own — never another turn's.
  const armTurn = () => {
    const ctrl = new AbortController();
    // The watchdog runs on the ADAPTIVE budget: 45s until a stall-probe proves this machine is
    // merely slow, then doubled per proof (capped) so honest long decodes stop being aborted.
    const guard = makeStallGuard(ctrl, stallBudgetMs);
    liveTurns.add(ctrl);
    abort = ctrl; stallGuard = guard;   // the newest turn is what the beats feed
    const keepAlive = (p, opts) => keepGuardAlive(guard, p, opts);
    return {
      ctrl, guard, keepAlive,
      raceGuard: (p) => Promise.race([p, guard.race]),
      keepAliveFn: (fn) => (typeof fn === 'function' ? (...a) => keepAlive(fn(...a)) : fn),
      disarm: () => {
        guard.clear();
        liveTurns.delete(ctrl);
        if (stallGuard === guard) stallGuard = null;
        if (abort === ctrl) abort = null;
      },
    };
  };

  // markStoppedPartial(pending, stoppedOrStalled, hadPartial) — reconcile a STOPPED/STALLED turn's
  // metadata on the catch path. Stop (or the 45s watchdog) settles the turn by rejecting the guard
  // race, so the catch below runs and finishMessage NEVER does — which means the grounding pipeline
  // (bind → factcheck → veto, plus the "underline the unsourced facts" marking) never ran over
  // whatever streamed. Left alone, the frozen partial reads as a normal answer wearing only a small
  // "ungrounded" chip, and its metadata lies: the "New topic" export showed route "stopped" while
  // `stopped` stayed false, `grounding` null, `flags` empty — the fingerprint of finishMessage being
  // skipped. Set the record straight so a frozen partial can never read — in the bubble OR a later
  // export/audit — as a checked answer: `stopped` true (finishMessage would have set it), never
  // grounded, and — when real prose streamed before the cut — flagged `unverified` so the surface
  // bands it as an unchecked draft. A stop with nothing streamed (only the fallback line) needs no
  // draft banner: the honest stopped/route flags already say it.
  const markStoppedPartial = (pending, stoppedOrStalled, hadPartial) => {
    if (!stoppedOrStalled) return;
    pending.stopped = true;
    pending.grounded = false;
    if (hadPartial) {
      pending.unverified = true;
      // APPEND, don't overwrite: any flags the turn already surfaced (a referent-diffuse
      // decline, a factcheck-limited note) are honest signals that must survive the stop, not
      // be replaced wholesale by the lone 'unverified' band. De-dupe so a re-entry can't stack it.
      const prior = Array.isArray(pending.flags) ? pending.flags.filter((f) => f && f.id !== 'unverified') : [];
      pending.flags = [...prior, { id: 'unverified', note: 'Stopped before grounding — this draft was not checked against your record.' }];
    }
  };

  // answerFromWeb(pending, q) — the empty-record auto path. Nothing is on the record, but the ask
  // is substantive, so REACH for the web the way 4.1 did: not a single fetch but a multi-hop
  // CURIOSITY WALK (runTurnWithResearch) — formulate a real query (the "write me an essay about
  // dolphins" → "dolphins" rewrite lives in web.js), then follow what surprises it while it stays on
  // topic, fold every kept page in, and answer GROUNDED over the seam it mined. Each hop streams a
  // beat into the answer's research trail, so the user SEES what it is searching and reading — the
  // disclosure 4.1 had and 4.2 had dropped to a lone busy label. Browser-only in practice (needs
  // fetch + a model); in Node it degrades to the "couldn't pull anything" line rather than throwing.
  const answerFromWeb = async (pending, q, { onToken = null } = {}) => {
    warmMinilm();
    // Arm the abort + watchdog BEFORE the first await, so a stalled model load or a hung fetch
    // is always recoverable (and Stop always has something to abort), not just the walk itself.
    // The kit is THIS TURN'S OWN (armTurn): its callbacks — which outlive the turn while a slow
    // backend unwinds its decode — read the captured signal/guard, never the module refs,
    // which by then may belong to another turn (or be null).
    const turn = armTurn();
    const { raceGuard, keepAlive, keepAliveFn } = turn;
    const turnSignal = turn.ctrl.signal;
    try {
      const m = await raceGuard(ensureModel());
      setBusy({ kind: 'search', label: 'Looking this up on the web…' });
      const query = await raceGuard(keepAlive(formulateSearchQuery({ model: m, question: q, history: [], fallback: q, signal: turnSignal })));
      beat(pending, 'start', researchAnnouncement(query, { maxHops: RESEARCH_HOPS }) || `Searching the web for “${query}”…`);
      setBusy({ kind: 'search', label: `Searching the web — ${query}` });
      logIt('search', `Web research "${query}"`, 'auto · nothing on record');
      const result = await raceGuard(runTurnWithResearch({
        question: q, docs: [], model: m,
        embedder: hashEmb,
        geometricEmbedder: (minilm?.isWarm?.() ? minilm : null) || undefined,
        shapeLibrary: shapeLib || undefined,   // the form predictor (turn/shape.js) — inert until built
        auditLog: audit, history: [],
        stream: true,
        // A backend slow (or unable) to honor the abort keeps handing us tokens after Stop; appending
        // them to the already-finalized bubble is the "I hit Stop but it kept typing" bug. Once the
        // turn's signal is aborted the bubble is settled and no longer ours to write — drop them.
        onToken: (tok) => { if (turnSignal.aborted) return; turn.guard.feed(); pending.text += String(tok); if (onToken) onToken(tok); emit('stream'); },
        signal: turnSignal,
        monitor, ledger,   // the session's self/world line and commitment ledger (enactor)
        onStep: (name, ctx, data) => { if (turnSignal.aborted) return; turn.guard.feed(); setBusy({ kind: 'turn', label: stageLabel(name) }); foldBeat(pending, name, data); if (name === 'fold') observeMurmur(ctx); releaseOnAnswer(pending, name, ctx); },
      }, {
        search: webSearchAdmit, seed: query, maxHops: RESEARCH_HOPS, k: 3,
        // The thumb: when the subject is a homonym, commit to ONE sense before gathering and search
        // for it, so "dolphins" doesn't fetch a mix of the animal and the football team (disambiguate.js).
        // keepAliveFn: this 220-token decode runs before the first hop's beat — feed the guard while it thinks.
        disambiguate: keepAliveFn(modelDisambiguator(m, { history: [], question: q, signal: turnSignal })),
        onHop: (h) => hopBeat(pending, h, query),
        onHopDone: (h) => hopDoneBeat(pending, h),
        signal: turnSignal,
      }));
      const committedSense = senseAnnouncement(result.research && result.research.sense);
      if (committedSense) beat(pending, 'read', committedSense);
      const gathered = (result.research && result.research.results) || 0;
      if (!gathered) {
        beat(pending, 'warn', `Couldn't pull anything readable for “${query}”.`);
        settleTrail(pending, result.research);
        pending.text = `I searched the web for “${query}” but couldn't pull anything readable back. The web proxy may be unreachable — try again, or drop a URL, file, or pasted text in the bar above.`;
        pending.route = 'empty';
        return pending;
      }
      settleTrail(pending, result.research);
      finishMessage(pending, {
        ...result,
        webFetched: {
          query, trigger: 'gap', results: gathered,
          sources: (result.research && result.research.sources) || [],
        },
      });
    } catch (e) {
      // A stall (watchdog) or a user Stop keeps whatever streamed; only a genuine fault gets the
      // error line, so a stopped/stalled turn never reads as a crash.
      const stalledOut = turn.guard.stalled();   // the no-progress WATCHDOG fired — a wedge, not a user Stop
      const stoppedOrStalled = turn.guard.tripped() || turnSignal.aborted;
      const hadPartial = !!pending.text;   // the walk streamed prose before the stop cut in
      settleTrail(pending, null);
      // A wedged local engine — reload it / fall to the backup so "try again" isn't advice to
      // re-hit a dead singleton. BOTH wedge shapes count: dark from the first token, and the
      // frozen-session shape — a preamble streams, THEN the decode dies (the export that led
      // here hung exactly so, and the old `nothing streamed` gate left that engine standing,
      // wedging every turn after it). A 45s all-quiet stall can only be the decode: fetches
      // self-cut at 20s and every beat feeds the guard. The partial is kept and banded
      // unverified (markStoppedPartial); a user Stop (stalled() false) never reloads a healthy
      // model. Read `model` before the reset nulls it.
      const wedged = stalledOut && model?.kind === 'local';
      if (wedged) resetWedgedLocalModel();
      pending.text = pending.text || (wedged
        ? 'The turn stalled — I’m checking the in-browser model and will reload it if it died. Try again in a moment.'
        : stoppedOrStalled
          ? 'The web lookup stalled and was stopped before it could finish. Try again, or drop a URL, file, or pasted text in the bar above.'
          : (state.model.state === 'error'
            ? `${state.model.note}. Pick a model from the chip in the header, then retry — or drop a URL, file, or pasted text in the bar above.`
            : `The web lookup failed: ${String(e?.message || e)}`));
      pending.route = stoppedOrStalled ? 'stopped' : 'error';
      markStoppedPartial(pending, stoppedOrStalled, hadPartial);
    } finally {
      turn.disarm();
      finishTrail(pending);   // stop the trail clock on the empty/error paths too (finishMessage
                              // does it on the success path; the early returns bypass it)
      setBusy(null);
      pending.pending = false;
      persist(); emit('messages');
    }
    return pending;
  };

  // phaticReply(model, {question, hasDoc, …}) → one short warm social line IN THE MODEL'S OWN
  // VOICE — the phatic door's whole answer. No regex and no canned classification: the same model
  // that read the turn as social (the discourse statement) now says the word back. With a document
  // in scope it closes on an invitation to ask about it; with none it mentions recording a source.
  // Fail-soft to a single neutral line if the decode comes back empty, so the door always speaks.
  const phaticReply = async (model, { question, hasDoc, signal, raceGuard, keepAlive }) => {
    const sys = hasDoc
      ? 'The user sent a social message — a greeting, a thanks, or a goodbye — while a document is open. Reply in ONE short, warm, natural sentence, and gently invite them to ask about what they have open. Do not answer a question they did not ask; no lists.'
      : 'The user sent a social message — a greeting, a thanks, or a goodbye. Reply in ONE short, warm, natural sentence. You may mention that they can record a source (a URL, a file, or pasted text) and ask about it. No lists.';
    try {
      const out = await raceGuard(keepAlive(model.phrase(
        [{ role: 'system', content: sys }, { role: 'user', content: String(question || '') }],
        { maxTokens: 64, temperature: 0.6, signal })));
      const text = String(out || '').replace(/\s+/g, ' ').trim();
      if (text) return text;
    } catch { /* fall through to the neutral line */ }
    return hasDoc
      ? 'Hey — ask me anything about what you have open.'
      : 'Hey — record a source and ask me about it, or ask me anything.';
  };

  const ask = async (question, { onToken = null, web = null } = {}) => {
    const t = topic();
    const q = String(question || '').trim();
    if (!t || !q) return null;
    const userMsg = { id: `m${++mn}`, role: 'user', text: q, at: nowIso() };
    t.messages.push(userMsg);
    emit('messages');
    topicAutoName(t);   // the first question names a placeholder topic, live in the sidebar

    const docs = topicDocs();
    const pending = { id: `m${++mn}`, role: 'assistant', text: '', at: nowIso(), pending: true, cites: [], grounded: false };
    t.messages.push(pending);
    emit('messages');

    // The web reach for THIS turn. A caller may pin it (the `web` option); otherwise the persisted
    // global stands. The Ask surface pins `'off'` — it is record-only by contract ("every answer is
    // measured against your record") and carries no web control (the web-mode chip lives on Chat), so
    // an Ask turn never reaches the net. This is a per-turn surface pin, not a settings change: the
    // stored webMode() (and the Chat toggle) are untouched, and every other caller keeps the global.
    const mode = web || webMode();

    // ── THE FRONT DOOR — the phatic short-circuit is DETERMINISTIC (docs/response-demand.md) ──────
    // A turn is answered with one warm social line (and NEVER reaches retrieval / grounding / the
    // web) ONLY when the offline floor `answerSmalltalk` recognizes it as social from the user's own
    // words — a greeting, a thanks, a goodbye, a how-are-you. The tiny-model discourse read
    // (readDiscourse) is STILL taken once per turn, but it no longer decides phatic: it feeds only
    // the clarify gate below. This reverses the earlier "physics, not a regex" phatic door, where the
    // PHATIC CURRENT of the model's paragraph (phaticFromSpeech → metaRoute) could win the route
    // relaxation and short-circuit the turn. On a 1B/1.5B model that read is unreliable AND biased —
    // it routinely describes a real question ("what is the best elvis movie?") as a casual/social ask,
    // and the phatic exemplars then out-score ground/research — so a genuine question was
    // intermittently swallowed as chit-chat, the sources never consulted and no search fired, and the
    // SAME question flipped answer to answer (the exported "works sometimes, not another" flakiness).
    // Deciding phatic on the deterministic floor makes routing reproducible and can never discard a
    // real question; the cost is a paraphrased greeting the floor misses ("you around?") gets a normal
    // turn instead of a warm line — the safe direction. Fail-soft: no model / empty read / any throw
    // still proceeds as a substantive turn; a clear greeting is honored even if the model faults.
    warmMinilm();
    // This turn's cancellation kit, armed BEFORE the front-door decode so even that read is watched,
    // stoppable, and signal-threaded (see answerFromWeb) — never a fresh way for a turn to hang.
    const turn = armTurn();
    const { raceGuard, keepAlive, keepAliveFn } = turn;
    const turnSignal = turn.ctrl.signal;

    const settledMsgs = t.messages.filter((mm) => !mm.pending && mm.text);
    const priorHistory = settledMsgs.slice(0, -1).map((x) => ({ role: x.role, content: x.text }));
    // THE INSTANT FLOOR (docs/response-demand.md, rung 3) — the phatic gate's OFFLINE layer, read off
    // the user's OWN words with no model. A bare greeting/thanks/goodbye is unmistakably social from
    // the message alone, so it settles phatic HERE without depending on the tiny model's discourse read
    // landing phatic. It composes with (does not replace) the graded model door below: the floor catches
    // the clear cases deterministically, the read catches the paraphrases it misses ("you around?"). A
    // FLOOR, not the decision — answerSmalltalk is folded in the way isExplicitCompose is at the route
    // grain: it informs, it does not decide. This is the layer the front-door refactor dropped: without
    // it, a one-word "hi" whose 1B discourse read did not cohere to the phatic door fell through to the
    // grounding pipeline ("The document does not say — scanned N sentences") and, in auto web mode,
    // spent a corpus-steered web walk on a hello.
    const floorTalk = answerSmalltalk(q, { hasDoc: docs.length > 0 });
    let discourse = '';
    try {
      setBusy({ kind: 'turn', label: 'Reading the turn…' });
      const m0 = await raceGuard(ensureModel());
      // The floor already settled a clear greeting — don't spend the discourse read on it. Otherwise
      // the read is taken for the clarify gate below (it no longer decides phatic).
      discourse = floorTalk ? '' : await raceGuard(keepAlive(readDiscourse(m0, { history: priorHistory, now: new Date(), scope: t.title || '', signal: turnSignal })(q)));
      if (floorTalk) {
        pending.text = await phaticReply(m0, { question: q, hasDoc: docs.length > 0, signal: turnSignal, raceGuard, keepAlive });
        pending.route = 'phatic';
        pending.pending = false;
        turn.disarm(); setBusy(null);   // the warm word IS this turn's answer — release its kit
        persist(); emit('messages');
        return pending;
      }
    } catch (_) {
      // The graded read is best-effort — a fault proceeds to the normal turn. But if the OFFLINE floor
      // already found the turn social (and this was a real fault, not a user Stop), honor it with the
      // floor's own warm line rather than grounding a greeting: the model may have failed to warm, and
      // the floor never needed it.
      if (floorTalk && !turnSignal.aborted) {
        pending.text = floorTalk.text;
        pending.route = 'phatic';
        pending.pending = false;
        turn.disarm(); setBusy(null);
        persist(); emit('messages');
        return pending;
      }
    }

    // The front-door read shares THIS turn's abort signal. If it was stopped (the user hit Stop
    // during "Reading the turn…") or the watchdog tripped, the signal is now aborted — and the
    // grounded turn below would decode NOTHING, because every backend returns '' immediately on a
    // pre-aborted signal. That is the empty "stopped" answer that STILL grinds the whole pipeline
    // and even proposes a web search — the export's "llm outputLen:0 · ms:0 → propose-web →
    // stopped" fingerprint. Settle it honestly and at once instead of running a doomed turn on a
    // dead signal. Inert on every normal turn (the signal is only aborted on a Stop/stall).
    if (turnSignal.aborted) {
      const hadPartial = !!pending.text;               // did real prose stream first? (front door: usually none)
      const stalledOut = turn.guard.stalled();         // the 45s watchdog fired — a wedge, not a user Stop
      const wedged = stalledOut && model?.kind === 'local';
      if (wedged) resetWedgedLocalModel();
      pending.text = pending.text || (wedged
        ? 'The turn stalled — I’m checking the in-browser model and will reload it if it died. Ask again and it should answer.'
        : 'Stopped before the answer finished. Ask again to retry.');
      pending.route = 'stopped';
      markStoppedPartial(pending, true, hadPartial);
      turn.disarm(); finishTrail(pending); setBusy(null);
      pending.pending = false; persist(); emit('messages');
      return pending;
    }

    if (!docs.length) {
      // An empty record is not a dead end for a substantive ask: it reaches for the web when web
      // mode allows it — `auto` fetches real pages and answers grounded in them (answerFromWeb);
      // `confirm`/`off` leave it as a one-click web-search proposal so the first question fetches
      // its own sources on the button. (A phatic turn was already answered by the front door above.)
      turn.disarm(); setBusy(null);   // answerFromWeb arms its own kit; the off/confirm lines need none
      if (mode === 'auto') return answerFromWeb(pending, q, { onToken });
      pending.text = 'Nothing is on the record yet, so I can\'t ground an answer to that. I can search the web and record what comes back — or read any URL, file, or pasted text you drop in the bar above.';
      pending.route = 'empty';
      // Offer the one-click search button in confirm mode; in off, respect the opt-out.
      if (mode === 'confirm') pending.webProposal = { query: q, rationale: 'no sources recorded yet', trigger: 'gap' };
      pending.pending = false;
      persist(); emit('messages');
      return pending;
    }

    // ── subject-sense disambiguation (docs/response-demand.md, Stage 1) ──────────────────────────
    // Before grounding/searching, decide whether the question turns on a sense the user must pin
    // down. The recorded corpus (senseGate) can only see that a subject's SPELLING collides across
    // entities — "dolphin" names the animal AND the Miami Dolphins — so on its own it asks a choice
    // question on ANY such collision, including a plainly clear ask ("what is the smallest dolphin").
    // Whether to ACT on it is the physics' call, read with the router's Born currents off the SAME
    // discourse statement the front door already spoke (clarifyDemandOf on `discourse`) — no second
    // decode. The corpus supplies the OPTIONS; the physics decides whether to ask at all. If THIS
    // turn is a reply to a question we asked, we NEVER reopen disambiguation on it — the reply folds
    // back onto the original ask (a literal choice recovers the chosen option; any other reply rides
    // in whole as a sense hint). Fail-soft: a fault here never costs the turn, and with no discourse
    // the clarify current is empty and nothing is asked (the safe direction).
    let effectiveQ = q;
    try {
      const settled = settledMsgs;
      // the current user turn (q) is already appended; the fold before this turn drops it, so the
      // "outstanding" question is the assistant's clarify, not read past by the new message.
      const awaiting = outstandingQuestion(settled.slice(0, -1));
      // the ask a question of ours was ABOUT: the user turn before our last assistant message.
      const originalAsk = () => {
        for (let i = settled.length - 1; i >= 0; i--) {
          if (settled[i].role === 'assistant') {
            for (let j = i - 1; j >= 0; j--) if (settled[j].role === 'user') return String(settled[j].text || '');
            return '';
          }
        }
        return '';
      };
      if (awaiting) {
        // A REPLY to a question we posed. Never re-open disambiguation on it (the loop); fold it back
        // onto the original ask so the subject is not lost.
        const prior = answersAwaited({ awaiting }, q);
        const original = originalAsk();
        if (prior && prior.answered) {
          const scope = (prior.choice && prior.choice.length ? prior.choice : (prior.polarity ? [prior.polarity] : [])).join(' ');
          if (original) effectiveQ = scope ? `${original} ${scope}` : original;
        } else if (original) {
          effectiveQ = `${original} ${q}`;
        }
      } else {
        // A FRESH ask. Only a real corpus collision is even a candidate for disambiguation; whether
        // to ACT is the physics' call, read off the discourse the front door already spoke.
        const gate = senseGate(q, docs);
        if (gate && gate.resolution === 'ask' && clarifyDemandOf(discourse) === 'clarify') {
          pending.text = gate.ask.question;
          pending.route = 'clarify';
          pending.pending = false;
          turn.disarm(); setBusy(null);   // the clarify IS this turn's answer — release its kit
          persist(); emit('messages');
          return pending;
        }
      }
    } catch (_) { /* disambiguation is best-effort; fall through to the normal turn */ }

    try {
      const m0 = await raceGuard(ensureModel());
      // The confidentiality lever: when redact-when-hosted is on, wrap the talker in the privacy
      // membrane so a REMOTE backend sees only tokens (a no-op for a local model, or when off).
      const m = redactRemote() ? wrapRedacting(m0, redactionNames) : m0;
      // The conversation handed to the turn is the settled dialogue MINUS this turn's own
      // question (it rides separately as `question`). Drop exactly one — the current user turn,
      // which is last after the empty pending assistant is filtered out — so the most recent
      // assistant reply STAYS in. The old `-2` dropped that reply too, so the grounded prompt's
      // "conversation so far" band only ever showed the user's turns (the exported bug: a bare
      // "You: research elvis films…" with the answer it refers to missing), leaving a follow-up
      // like "which is the best?" nothing to resolve against. `-1` matches priorHistory above.
      // foldConversation then holds the recent window to its token budget and folds the rest.
      const history = t.messages
        .filter((x) => !x.pending && x.text)
        .slice(0, -1)
        .map((x) => ({ role: x.role, content: x.text, ...(x.unbound ? { unbound: true } : {}) }));
      // A long-form ask ("write me an essay …") gets a large budget so the answer can develop
      // past the pointed-answer cap; a normal ask keeps the per-task budget the pipeline picks.
      const longform = wantsLongform(effectiveQ);
      // Separate signal from noise: ground this turn on the sources that bear on the
      // question (the substantial documents + any small source it distinctly names),
      // not the whole topic pile. `docs` above still holds the full set for the front
      // door and the disambiguation gate; only what the answer GROUNDS on is scoped.
      // Set-aside is logged, never silent — the reader can see the focus it took.
      const scopedDocs = scopeSources(effectiveQ, topicSources()).map(docFor).filter(Boolean);
      const setAside = docs.length - scopedDocs.length;
      if (setAside > 0) logIt('skip', `Focused on ${scopedDocs.length} of ${docs.length} sources for this question — set aside ${setAside} unrelated to it`, topic()?.id);
      const groundDocs = scopedDocs.length ? scopedDocs : docs;
      const args = {
        question: effectiveQ, docs: groundDocs, model: m,
        embedder: hashEmb,
        geometricEmbedder: (minilm?.isWarm?.() ? minilm : null) || undefined,
        shapeLibrary: shapeLib || undefined,   // the form predictor (turn/shape.js) — inert until built
        auditLog: audit, history,
        stream: true,
        // Arm the reaction-weighing stage: when a grounded answer earned no witness and the
        // mechanical read already doubts it, the reader is asked to REACT to its own draft and
        // the reaction is put through the Born rule. While streaming (the reader has already
        // seen the text) a negative reaction rides as a refusing flag; off-stream it sends the
        // draft back for another pass. Off elsewhere by default — golden turns stay byte-identical.
        validate: true,
        ...(longform ? { maxTokens: LONGFORM_MAX_TOKENS, longform: true } : {}),
        // A backend slow (or unable) to honor the abort keeps handing us tokens after Stop; appending
        // them to the already-finalized bubble is the "I hit Stop but it kept typing" bug. Once the
        // turn's signal is aborted the bubble is settled and no longer ours to write — drop them.
        onToken: (tok) => { if (turnSignal.aborted) return; turn.guard.feed(); pending.text += String(tok); if (onToken) onToken(tok); emit('stream'); },
        signal: turnSignal,
        monitor, ledger,   // the session's self/world line and commitment ledger (enactor)
        onStep: (name, ctx, data) => { if (turnSignal.aborted) return; turn.guard.feed(); setBusy({ kind: 'turn', label: stageLabel(name) }); foldBeat(pending, name, data); if (name === 'fold') observeMurmur(ctx); releaseOnAnswer(pending, name, ctx); },
      };
      let result = await raceGuard(runTurn(args));
      // The document turn measured a gap it couldn't close (or an answer worth confirming
      // against the world). In `auto` we take the go-ahead the moment it's proposed.
      // `off`/`confirm` leave the proposal for the in-chat "Search the web" button.
      if (result.webProposal && mode === 'auto') {
        const proposal = result.webProposal;
        // The document turn only PROPOSED the web; the real answer is still coming (a curiosity
        // walk that clears and re-streams this bubble, or a verify/witness re-run). So if bind
        // already released the composer on the first draft, re-hold it — this turn is not done.
        // The continuation threads the same onStep, so releaseOnAnswer fires again when the
        // web-grounded answer binds; the `finally` is the backstop either way.
        pending.pending = true; emit('messages');
        if (proposal.trigger === 'gap') {
          // A GAP the record couldn't close — go WIDE the way 4.1 did: a multi-hop curiosity walk,
          // not one fetch, streaming its search/read beats into the trail. Clear the first ("not in
          // the document") draft so the grounded re-run's stream replaces it rather than appends.
          const query = await raceGuard(keepAlive(formulateSearchQuery({ model: m, question: proposal.query, history, fallback: proposal.query, signal: turnSignal })));
          beat(pending, 'start', researchAnnouncement(query, { maxHops: RESEARCH_HOPS }) || `Searching the web for “${query}”…`);
          setBusy({ kind: 'search', label: `Searching the web — ${query}` });
          pending.text = ''; emit('stream');
          const walked = await raceGuard(runTurnWithResearch(args, {
            search: webSearchAdmit, seed: query, maxHops: RESEARCH_HOPS, k: 3,
            // The thumb: commit to one sense of a homonymous subject before gathering (disambiguate.js).
            // keepAliveFn feeds the guard through this pre-hop decode so a slow model can't false-stall the walk.
            disambiguate: keepAliveFn(modelDisambiguator(m, { history, question: proposal.query, signal: turnSignal })),
            onHop: (h) => hopBeat(pending, h, query),
            onHopDone: (h) => hopDoneBeat(pending, h),
            signal: turnSignal,
          }));
          const committedSense = senseAnnouncement(walked.research && walked.research.sense);
          if (committedSense) beat(pending, 'read', committedSense);
          settleTrail(pending, walked.research);
          result = {
            ...walked, webProposal: proposal,
            webFetched: {
              query, trigger: 'gap', results: (walked.research && walked.research.results) || 0,
              sources: (walked.research && walked.research.sources) || [],
            },
          };
        } else if (proposal.trigger === 'corroborate') {
          // The answer is grounded but rests on a SINGLE meaningfully-distinct source. Keep the
          // answer already streamed — go find an INDEPENDENT second source that corroborates it,
          // hopping until it does or can be said not to exist (turn/corroborate.js). The trail
          // streams the search; the outcome rides back as a flag, it never rewrites the answer.
          const query = await raceGuard(keepAlive(formulateSearchQuery({ model: m, question: effectiveQ, history, fallback: effectiveQ, signal: turnSignal })));
          beat(pending, 'start', corroborationAnnouncement(query) || `Looking for an independent source for “${query}”…`);
          setBusy({ kind: 'search', label: `Corroborating — ${query}` });
          // Enrich the answer's own sources with their host/byline so the walk knows which voices a
          // corroborator must be distinct FROM (a same-host reprint is not a second source).
          const enrich = {};
          for (const s of (state.sources || [])) if (s.docId) enrich[s.docId] = { url: s.url || s.web?.url || s.host || '', author: s.byline || s.author || null };
          result = await raceGuard(keepAlive(runTurnWithCorroboration(args, result, {
            search: webSearchAdmit, enrich, k: 3, formulate: async () => query,
            onHop: (h) => { turn.guard.feed(); hopBeat(pending, h, query); },
            onHopDone: (h) => { turn.guard.feed(); hopDoneBeat(pending, h); },
            signal: turnSignal,
          })));
          const settled = corroborationSettled(result.corroboration);
          if (settled) beat(pending, 'read', settled);
          if (result.corroboration) pending.research && (pending.research.summary = settled || 'Sought corroboration');
          settleTrail(pending, null);
        } else {
          // A verify (check the general-knowledge answer, keep it) or witness (confirm the reading)
          // is a targeted single-shot, not a walk — augment/re-run through runWebFollowup as before.
          const note = searchAnnouncement(proposal);
          setBusy({ kind: 'search', label: note || 'Searching the web…' });
          if (note) beat(pending, 'start', note);
          if (proposal.trigger !== 'verify') { pending.text = ''; emit('stream'); }
          // keepAlive: the verify re-run inside is a full grounded turn with the UI callbacks
          // stripped (it must not stream over the live bubble) — so it feeds the watchdog
          // nothing on its own, and an honest slow re-run read as a stall. The turn's signal
          // (in args) still stops it for real; the guard only stops BLAMING it.
          result = await raceGuard(keepAlive(runWebFollowup(args, result, { webSearch: webSearchAdmit, k: 4 })));
          const n = (result.webFetched && result.webFetched.results) || 0;
          if (result.webFetched) beat(pending, 'read', `Read ${n} web source${n === 1 ? '' : 's'}`);
          if (pending.research) pending.research.summary = `Checked ${n} web source${n === 1 ? '' : 's'}`;
          settleTrail(pending, null);
        }
      }
      finishMessage(pending, result, mode);
    } catch (e) {
      // A stall (watchdog trip) or a user Stop keeps whatever streamed rather than blanking the
      // bubble to an error — only a genuine mid-turn fault gets the error line.
      const stalledOut = turn.guard.stalled();   // the no-progress WATCHDOG fired — a wedge, not a user Stop
      const stoppedOrStalled = turn.guard.tripped() || turnSignal.aborted;
      const hadPartial = !!pending.text;   // the model streamed prose before the stop cut in
      // A local decode the watchdog caught has wedged its WebGPU engine — reload it (or fall to
      // the smaller/CPU backup) so the retry we suggest can actually work, instead of hitting the
      // same dead singleton. BOTH wedge shapes count: dark from the first token, and the
      // frozen-session shape — a preamble streams, THEN the decode dies mid-stream (the old
      // `nothing streamed` gate left that engine standing, and every later turn queued behind
      // its orphaned decode). The partial is kept and banded unverified (markStoppedPartial);
      // a user Stop (stalled() false) never reloads a healthy model. Compute this BEFORE the
      // reset nulls `model`.
      const wedged = stalledOut && model?.kind === 'local';
      if (wedged) resetWedgedLocalModel();
      pending.text = pending.text || (wedged
        ? 'The turn stalled — I’m checking the in-browser model and will reload it if it died. Ask again and it should answer.'
        : stoppedOrStalled
          ? 'Stopped before the answer finished. Ask again to retry.'
          : (state.model.state === 'error'
            ? `${state.model.note}. A WebGPU browser (Chrome/Edge) runs Llama 3.2; anything else runs SmolLM2 on CPU — or pick Claude (hosted API, needs a key) from the model chip in the header, then retry.`
            : `Something failed mid-turn: ${String(e?.message || e)}`));
      pending.pending = false; pending.route = stoppedOrStalled ? 'stopped' : 'error';
      markStoppedPartial(pending, stoppedOrStalled, hadPartial);
    } finally {
      turn.disarm();
      finishTrail(pending);   // stop the trail clock even if the turn threw/aborted mid-walk, so a
                              // running trail can never be left spinning forever on an errored turn
      setBusy(null);
      pending.pending = false;
      persist(); emit('messages');
    }
    return pending;
  };

  const stageLabel = (name) => ({
    route: 'Routing…', retrieve: 'Retrieving from the record…', fold: 'Folding the reading…',
    gate: 'Gating…', prompt: 'Building the grounded prompt…', llm: 'Phrasing…',
    bind: 'Binding citations…', factcheck: 'Fact-checking against the record…',
    veto: 'Vetoing unsupported claims…', settle: 'Settling…',
  }[name] || `${name}…`);

  const finishMessage = (msg, result, mode = webMode()) => {
    localWedges = 0;    // a completed answer means the engine is alive — clear the wedge streak
    finishTrail(msg);   // stop the research trail's clock; the surface collapses it to its summary
    // Prefer the marked projection — the answer with ungrounded FACTS underlined ([no source],
    // creative prose left clean) — so the disclosure rides in every mode. The chat answer
    // already carries its marks in `answer` (turn/stages.js bind), so `marked` is undefined
    // there and this falls through unchanged; the long-form modes supply `marked` explicitly.
    msg.text = result.marked || result.answer || msg.text;
    msg.route = result.route;
    msg.grounding = result.grounding;
    // The VERBATIM prompt this turn handed the model — the audit turn's own record
    // (turn/stages.js promptText, riding the pipeline result as `turn`). Stashed on the
    // message — unlike the derived answerEot projection, it is a fact of the turn, not
    // re-computable — so the facing panel can show exactly what the talker was prompted,
    // and still show it after a reload (the in-memory audit ring does not survive one).
    // Null when no talker prompt exists for this answer (a phatic line, an errored turn).
    msg.prompt = (result.turn && result.turn.prompt) || null;
    msg.flags = (result.flags || []).map((f) => ({ id: f.id, note: f.note || '' }));
    msg.unbound = !!result.unbound;
    msg.stopped = !!result.stopped;
    msg.grounded = (result.sources || []).length > 0 && !result.unbound;
    // The "Search the web" button belongs to confirm mode only: auto already fetched (and
    // suppresses via webFetched), and off means the user opted out of reaching the net — so
    // a proposal is offered as a button only when the user asked to be the one to approve it.
    // Keyed on THIS turn's effective mode (passed in), not the global — so a record-only Ask turn
    // (mode pinned 'off') never surfaces the button even when the global Chat mode is 'confirm'.
    msg.webProposal = (result.webProposal && !result.webFetched && mode === 'confirm')
      ? { query: result.webProposal.query, rationale: result.webProposal.rationale || '' } : null;
    msg.bound = (result.bound || []).map((b) => ({ claim: b.claim, citation: b.citation || null, cited: b.cited || b.text || null }));
    msg.verdicts = (result.verdicts || []).map((v) => ({
      verdict: v.verdict || v.status || '', claim: v.claim || v.text || [v.src, v.via, v.tgt].filter(Boolean).join(' '),
    }));
    msg.cites = Object.entries(result.citeOrigins || {}).map(([idx, docId]) => {
      const src = state.sources.find((s) => s.docId === docId);
      return { idx: Number(idx), docId, sn: src?.sn || null, reg: src?.reg || null, title: src?.title || docId, text: (result.citeTexts || {})[idx] || '' };
    });
    msg.reflection = result.reflection || null;
    // the self/world line's reading for this turn (echoes / push-back / commitments)
    msg.selfLine = result.selfLine || null;
    // What the web search brought back — the query, why, and the sources it fetched. The
    // gap/witness answer already streamed the re-run over these; a verify AUGMENTS instead,
    // so append what the web said (with its sources) as a plainly-marked addendum, keeping
    // the model's own answer above it untouched (docs/web-search.md, "verify — don't restrict").
    msg.webFetched = result.webFetched
      ? {
          query: result.webFetched.query || '', trigger: result.webFetched.trigger || '',
          results: result.webFetched.results || 0,
          sources: (result.webFetched.sources || []).map((s) => ({ title: s.title || '', url: s.url || '', docId: s.docId || '' })),
        }
      : null;
    const aug = result.webFetched && result.webFetched.augmented;
    if (aug && aug.answer) {
      const add = String(aug.answer).replace(/\[s\d+(?:,\s*s?\d+)*\]/g, '').replace(/[ \t]+\n/g, '\n').trim();
      const srcLines = (aug.sources || []).slice(0, 4).map((s) => `· ${s.title || s.url || s.docId}`).filter(Boolean).join('\n');
      if (add) msg.text = `${msg.text}\n\n— From the web —\n${add}${srcLines ? `\n\nSources:\n${srcLines}` : ''}`;
    }
    // What the corroboration walk found (turn/corroborate.js): an independent second source that
    // supports the answer, or — after real hops — the confident absence of one. Surfaced as a flag
    // beside the answer (it never rewrites it) and, when found, as the source to click through to.
    if (result.corroboration && result.corroboration.sought) {
      const c = result.corroboration;
      msg.corroboration = {
        verdict: c.verdict, corroborated: !!c.corroborated, query: c.query || '',
        sources: (c.sources || []).map((s) => ({ title: s.title || '', url: s.url || '' })),
      };
      const src = (c.sources || [])[0];
      msg.flags = [...msg.flags, c.corroborated
        ? { id: 'corroborated', note: `Independently corroborated${src ? ` — ${src.title || src.url}` : ''}.` }
        : { id: 'single-source', note: 'Rests on a single source — I searched but couldn’t find an independent one that corroborates it.' }];
      logIt(c.corroborated ? 'search' : 'skip',
        c.corroborated ? `Corroborated by an independent source${src ? ` — ${src.title || src.url}` : ''}` : 'No independent corroboration found', `"${c.query || ''}"`);
    } else {
      msg.corroboration = null;
    }
    for (const f of msg.flags) {
      if (/contradic/i.test(f.id)) logIt('conflict', `Contradiction flagged — ${f.note || f.id}`);
    }
    if (msg.webFetched) {
      logIt('search', `Grounded in ${msg.webFetched.results} web source${msg.webFetched.results === 1 ? '' : 's'}`, `"${msg.webFetched.query}"`);
    }
    logIt('claim', `Answered "${msg.text.slice(0, 60)}${msg.text.length > 60 ? '…' : ''}"`,
      `${msg.cites.length} citation${msg.cites.length === 1 ? '' : 's'}`);
  };

  // Export one whole chat (a topic) with its full audit trail folded under each turn — the
  // conversation is the record, the audit ring the receipt. The app is the one place that
  // holds BOTH the topics and the audit, so it assembles the bundle; chat-export.js renders
  // it (Markdown or JSON). Returns { text, ext, mime, filename } for the surface to Blob-
  // download, or null when the topic has nothing to export.
  const exportChat = (topicId = state.activeTopicId, format = 'md') => {
    const t = state.topics.find((x) => x.id === topicId) || topic();
    if (!t) return null;
    // Compose the provenance fresh: the app + the build/latest cached at boot, plus the CURRENT
    // talker (describeModel) and the export clock. chat-export.js also reads each turn's own model
    // record, so a conversation that switched models mid-way names each — this is the session's
    // current one, and the header's app/build/freshness. Pure and total: null pieces just render as
    // "unstamped"/"not recorded", never blocking the download.
    const provenance = composeProvenance({
      app: APP_NAME, version: APP_VERSION,
      build: provBuild, latest: provLatest, repo: provRepo,
      model: describeModel(model),
      exportedAt: nowIso(),
    });
    return buildChatExport(
      { topic: t, turns: (audit && audit.turns) || [], sources: state.sources, provenance },
      format,
      t.title || 'chat',
    );
  };

  // ── answer/viewer segmentation (text | entity | cite) ─────────────────────
  // The entity lexicon for a doc set: admitted label → { docId, entId }, longest
  // labels first so "New York City" wins over "New York".
  const entityLexicon = (docs) => {
    const lex = [];
    for (const doc of docs) {
      if (!doc?.admission?.admitted) continue;
      const g = projectGraph(doc.log);
      const rep = g.representative || ((x) => x);
      for (const [label, id] of doc.admission.admitted) {
        if (String(label).length < 3) continue;
        lex.push({ label: String(label), docId: doc.docId, entId: rep(id) });
      }
    }
    lex.sort((a, b) => b.label.length - a.label.length);
    return lex;
  };

  const linkifySegs = (text, lex) => {
    const segs = [];
    let rest = String(text);
    if (!lex.length) return rest ? [{ t: 'text', s: rest }] : [];
    // one pass, longest-label-first alternation; word-bounded, case-insensitive so EVERY
    // mention links — "the dolphin's sonar" reaches the same entity as "Dolphin" in a heading.
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b(${lex.map((e) => escRe(e.label)).join('|')})\\b`, 'gi');
    let last = 0, mArr;
    while ((mArr = re.exec(rest)) !== null) {
      if (mArr.index > last) segs.push({ t: 'text', s: rest.slice(last, mArr.index) });
      // exact-case wins; else a case-insensitive hit, so a lowercase mention of a capitalised
      // figure ("dolphins" for the admitted "Dolphins") still renders as its entity — but the
      // relaxed match is only trusted for labels long enough that it can't grab a common word off
      // a short acronym ("who" for "WHO"), which falls back to plain text.
      const exact = lex.find((e) => e.label === mArr[1]);
      const hit = exact || lex.find((e) => e.label.toLowerCase() === mArr[1].toLowerCase());
      if (hit && (exact || hit.label.length >= 4)) segs.push({ t: 'ent', s: mArr[1], docId: hit.docId, entId: hit.entId });
      else segs.push({ t: 'text', s: mArr[1] });
      last = mArr.index + mArr[1].length;
    }
    if (last < rest.length) segs.push({ t: 'text', s: rest.slice(last) });
    return segs;
  };

  // Answer text → paragraphs of segments; [sN] markers become cite chips. With cites off the
  // markers are still consumed (never rendered as raw [sN] text) but no chip seg is emitted.
  // With `sources` on, every prose seg carries the source that grounds it (gsn/greg): the run of
  // text since the last citation is grounded in the source that citation resolves to, and a run
  // with no trailing citation stays ungrounded (gsn null) — so the surface can disclose, span by
  // span, exactly what stands behind each stretch of the answer.
  const answerSegments = (msg, { entities = true, cites = true, sources = false } = {}) => {
    const docs = topicDocs();
    const lex = entities ? entityLexicon(docs) : [];
    const citeOf = new Map((msg.cites || []).map((c) => [c.idx, c]));
    const paras = [];
    for (const para of String(msg.text || '').split(/\n{2,}|\n(?=[-•*])/)) {
      if (!para.trim()) continue;
      const segs = [];
      let last = 0, runStart = 0;
      // back-fill the current run's grounding when its [sN] marker arrives (the claim precedes
      // its citation, so the source is only known once the marker is read)
      const ground = (sn, reg) => { for (let k = runStart; k < segs.length; k++) if (segs[k].t === 'text' || segs[k].t === 'ent') { segs[k].gsn = sn; segs[k].greg = reg; } };
      const re = /\[s(\d+)(?:,\s*s?\d+)*\]/g;
      let m2;
      while ((m2 = re.exec(para)) !== null) {
        if (m2.index > last) segs.push(...linkifySegs(para.slice(last, m2.index), lex));
        const resolved = (m2[0].match(/\d+/g) || []).map((n) => citeOf.get(Number(n))).filter(Boolean);
        if (sources && resolved[0]) ground(resolved[0].sn, resolved[0].reg);
        if (cites) for (const c of resolved) segs.push({ t: 'cite', idx: c.idx, sn: c.sn, reg: c.reg, title: c.title, quote: c.text });
        runStart = segs.length;
        last = m2.index + m2[0].length;
      }
      if (last < para.length) segs.push(...linkifySegs(para.slice(last), lex));
      if (segs.length) paras.push({ segs });
    }
    return paras;
  };

  // The document viewer — full text as paragraphs; cited sentences marked. (Still used by the
  // Facing page's left leaf; the standalone Document tab is now folded into the Reader.)
  const viewerParas = (snId, { entities = true } = {}) => {
    const src = sourceBySn(snId);
    if (!src) return [];
    const doc = docFor(src);
    const lex = entities ? entityLexicon([doc]) : [];
    const citedTexts = [];
    for (const t of state.topics) {
      for (const m of t.messages) {
        for (const c of m.cites || []) if (c.docId === src.docId && c.text) citedTexts.push(c.text.slice(0, 80));
      }
    }
    const paras = [];
    for (const para of String(src.text).split(/\n{2,}|\n/)) {
      if (!para.trim()) continue;
      const cited = citedTexts.some((ct) => ct.length > 20 && para.includes(ct.slice(0, Math.min(60, ct.length))));
      paras.push({ cited, segs: linkifySegs(para, lex) });
    }
    return paras;
  };

  // The Reader's link layer — the Document view merged INTO the themed book. reader-render reflows
  // and themes the source; this supplies the two things the book can't know on its own: which words
  // are entities (so it can underline them and open the entity panel on click) and which paragraphs
  // a citation grounds (so they pick up the gold rule). Both reuse the Document view's own machinery
  // over WHATEVER text reader-render hands back — the reflowed paragraph, not the raw newline split —
  // so a Gutenberg book links the same as a web page. Returns { linkify, isCited } for readerHtml's
  // opts.segsOf / opts.isCited; with `entities:false` no lexicon is built and nothing links.
  const readerLink = (snId, { entities = true } = {}) => {
    const src = sourceBySn(snId);
    if (!src) return null;
    const doc = docFor(src);
    const lex = entities ? entityLexicon([doc]) : [];
    const citedTexts = [];
    for (const t of state.topics) {
      for (const m of t.messages) {
        for (const c of m.cites || []) if (c.docId === src.docId && c.text) citedTexts.push(c.text.slice(0, 80));
      }
    }
    return {
      linkify: (text) => linkifySegs(String(text == null ? '' : text), lex),
      isCited: (text) => { const s = String(text == null ? '' : text); return citedTexts.some((ct) => ct.length > 20 && s.includes(ct.slice(0, Math.min(60, ct.length)))); },
    };
  };

  // ── entities (the explorer) ────────────────────────────────────────────────
  // Coreference is resolved WITHIN each source's document graph (projectGraph's
  // `representative` union-find), never across them — so the raw pass yields one
  // instance per (source, entity). By DEFAULT we then COLLAPSE across sources:
  // the panel is about entities, not entity-in-one-source, so the eight "Iran"
  // rows (one per source that names it) fold into a single row whose mentions and
  // links sum over every source, tagged with how many sources it spans. Pass
  // { merge: false } for the raw per-source instances (the old behaviour).
  const entityKey = (label) => String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const entities = ({ merge = true } = {}) => {
    const out = [];
    for (const src of topicSources()) {
      const doc = docFor(src);
      if (!doc?.log) continue;
      const g = projectGraph(doc.log);
      const rep = g.representative || ((x) => x);
      // Degree per representative in ONE pass over the edges, rather than re-scanning
      // every edge for every entity (which was O(entities × edges) — minutes on a large
      // document's graph, run on every explorer render). A self-loop counts once, matching
      // the prior `rep(from) === r || rep(to) === r` test.
      const degree = new Map();
      for (const e of g.edges || []) {
        const a = rep(e.from), b = rep(e.to);
        degree.set(a, (degree.get(a) || 0) + 1);
        if (b !== a) degree.set(b, (degree.get(b) || 0) + 1);
      }
      const seen = new Set();
      for (const [id, ent] of g.entities || []) {
        const r = rep(id);
        if (seen.has(r)) continue;
        seen.add(r);
        const label = doc.admission?.labelOf?.(r) || ent.label || r;
        const links = degree.get(r) || 0;
        out.push({ key: `${doc.docId}#${r}`, entId: r, docId: doc.docId, sn: src.sn, label, mentions: ent.sightings || 0, links, sourceCount: 1 });
      }
    }
    if (merge) {
      // Group per-source instances by normalized label. The strongest instance
      // (most mentions) LEADS the merged row, so key/docId/entId/sn point at the
      // richest per-source profile — opening the row lands there — while mentions
      // and links aggregate and `sourceCount` records the reach.
      const byLabel = new Map();
      for (const it of out) {
        const k = entityKey(it.label);
        let grp = byLabel.get(k);
        if (!grp) { grp = { lead: it, mentions: 0, links: 0, sns: new Set(), instances: [] }; byLabel.set(k, grp); }
        grp.mentions += it.mentions;
        grp.links += it.links;
        grp.sns.add(it.sn);
        grp.instances.push({ docId: it.docId, entId: it.entId, sn: it.sn });
        if (it.mentions > grp.lead.mentions) grp.lead = it;
      }
      const merged = [...byLabel.values()].map((grp) => ({
        key: grp.lead.key, entId: grp.lead.entId, docId: grp.lead.docId, sn: grp.lead.sn,
        label: grp.lead.label, mentions: grp.mentions, links: grp.links,
        sourceCount: grp.sns.size, instances: grp.instances,
      }));
      merged.sort((a, b) => (b.mentions + b.links) - (a.mentions + a.links));
      return merged;
    }
    out.sort((a, b) => (b.mentions + b.links) - (a.mentions + a.links));
    return out;
  };

  const entityProfile = (docId, entId) => {
    const src = state.sources.find((s) => s.docId === docId);
    const doc = src && docFor(src);
    if (!doc) return null;
    const fs = figureSurface(doc, [entId]);
    const label = doc.admission?.labelOf?.(entId) || fs.figures.find((f) => f.id === entId)?.label || entId;
    // mentions: the sentences whose INS events touch this referent
    const g = projectGraph(doc.log);
    const rep = g.representative || ((x) => x);
    const idxs = new Set();
    for (const e of doc.log.snapshot()) {
      if (e.op === 'INS' && rep(e.id) === rep(entId) && e.sentIdx != null) idxs.add(e.sentIdx);
    }
    const sentAt = (i) => String(doc.sentences?.[i] || '').trim();
    const mentions = [...idxs].sort((a, b) => a - b).slice(0, 40)
      .map((i) => ({ idx: i, text: sentAt(i) }))
      .filter((m2) => m2.text);
    // Standing properties, ranked and deduped with their provenance (§ rankProperties):
    // what the record most strongly and specifically witnesses leads, and each property
    // carries the passages that assert it — its trail, and the DAG's edges.
    const defs = rankProperties(fs.defs).map((d) => ({
      value: d.value, idx: d.idx, count: d.count,
      score: d.score, confidence: d.confidence, polarity: d.polarity, modality: d.modality,
      witnesses: d.witnesses.map((i) => ({ idx: i, text: sentAt(i) })).filter((w) => w.text),
    }));
    return {
      label, docId, sn: src.sn, sourceTitle: src.title,
      defs, mentionCount: idxs.size,
      relations: fs.relations.map((r) => ({
        srcId: r.src.id, srcLabel: r.src.label, tgtId: r.tgt.id, tgtLabel: r.tgt.label,
        via: r.via, op: r.op, idx: r.idx, type: r.type, polarity: r.polarity,
      })),
      figures: fs.figures.map((f) => ({ entId: f.id, label: f.label, count: f.count })),
      mentions,
    };
  };

  // ── auto-generated toplines — a summary for every source and every entity ──
  // docs/topline.md. A topline is an ordering and a phrasing of the CLOSED set of objects the
  // machinery already decided about a source or an entity — never a summary of the text, because
  // the model never sees the text, only the objects (claims with their citations and standing,
  // computed facts, at most one marked inference, and the gap if there is one). Generation runs in
  // two passes; the second, model-free CONTAINMENT check is the safety — the join may lose
  // information, never add it. It is model-OPTIONAL: the deterministic telegram is stored the moment
  // a source is recorded (there is a summary before any talker is warm), and a loaded talker only
  // refines the join in the background. Feedback STEERS the closed set (re-order, bound, suppress);
  // it can never add a fact the record does not carry — an out-of-record request is reported, not
  // fabricated (the same discipline as the void answerer).
  const TOPLINE_FIGURES = 6;

  // The source's reading, shaped for sourceInventory: its dominant figures' strongest standing
  // properties and incident bonds, its front matter, and its log tallies. Pure and model-free.
  const sourceReading = (src) => {
    const doc = docFor(src);
    if (!doc?.log) return null;
    const g = projectGraph(doc.log);
    const rep = g.representative || ((x) => x);
    const bySight = new Map();                          // dominant figures by merged sighting mass
    for (const [id, ent] of g.entities || []) {
      const r = rep(id);
      const label = doc.admission?.labelOf?.(r) || ent.label || r;
      const cur = bySight.get(r);
      if (cur) cur.sightings += ent.sightings || 0;
      else bySight.set(r, { id: r, label, sightings: ent.sightings || 0 });
    }
    const topFigs = [...bySight.values()].sort((a, b) => b.sightings - a.sightings).slice(0, TOPLINE_FIGURES);
    const fs = figureSurface(doc, topFigs.map((f) => f.id));
    const claims = rankProperties(fs.defs).slice(0, 6).map((d) => ({
      subject: d.label, value: d.value, cite: d.witnesses, count: d.count, polarity: d.polarity, modality: d.modality,
    }));
    const relations = fs.relations.filter((r) => r.type).slice(0, 4).map((r) => ({  // typed (noun) bonds only
      subject: r.src.label, via: r.via, object: r.tgt.label, cite: [r.idx], polarity: r.polarity, kinship: true,
    }));
    const md = doc.metadata || {};
    let propositions = 0;
    try { propositions = emitEot(doc.log).lines.length; } catch { propositions = 0; }
    return {
      title: src.title, sn: src.sn,
      metadata: { author: md.author, date: md.date || md.published, publisher: md.publisher },
      claims, relations,
      figures: topFigs.map((f) => ({ label: f.label, count: f.sightings })),
      counts: { entities: g.entities?.size || 0, propositions, sentences: doc.sentences?.length || 0, bytes: src.bytes || 0 },
    };
  };

  // Compose (or refine) a topline over a closed inventory into the stored shape. `modelless` marks a
  // telegram-only topline a warm talker can later refine; `sha` lets a source topline invalidate if
  // its content ever moves. Never throws — a summary must never cost the caller its record.
  const composeTopline = async (inv, { steer = null, useModel = false } = {}) => {
    const m = useModel ? model : null;
    let top;
    try { top = await generateTopline({ inventory: inv, steer, model: m }); }
    catch { top = await generateTopline({ inventory: inv, steer, model: null }); }
    return {
      text: top.text, telegram: top.telegram, joined: top.joined, kind: top.kind,
      objects: top.objects, cites: top.cites, unmet: top.unmet,
      modelless: !m, generatedAt: nowIso(),
      model: m ? (describeModel(m)?.label || describeModel(m)?.backend || null) : null,
    };
  };

  // In-flight guard so an auto-gen kick and a surface open never race to double-generate one subject.
  const _summaryInFlight = new Map();
  const guarded = (key, regenerate, run) => {
    if (_summaryInFlight.has(key) && !regenerate) return _summaryInFlight.get(key);
    const p = Promise.resolve().then(run).finally(() => { if (_summaryInFlight.get(key) === p) _summaryInFlight.delete(key); });
    _summaryInFlight.set(key, p);
    return p;
  };

  // The two-phase store: phase A writes the deterministic telegram at once (so the surface always has
  // something); phase B refines the join with the loaded talker, if any. `write` persists each phase.
  const composeTwoPhase = async (inv, prev, write) => {
    const steer = prev?.steer || null;
    const feedback = prev?.feedback || [];
    if (!prev || prev.regenerate) {
      const tele = await composeTopline(inv, { steer, useModel: false });
      write({ ...tele, steer, feedback });
    }
    if (model) {
      const full = await composeTopline(inv, { steer, useModel: true });
      write({ ...full, steer, feedback });
    }
  };

  const sourceSummaryOf = (snId) => sourceBySn(snId)?.summary || null;

  // Generate/refresh a source topline. Returns the stored summary; stores on src.summary and emits.
  const sourceSummary = (snId, { regenerate = false } = {}) => guarded(`s:${snId}`, regenerate, async () => {
    const src = sourceBySn(snId);
    if (!src) return null;
    const prev = src.summary || null;
    const upgrade = prev && prev.modelless && !!model;           // a warm talker can now refine a telegram
    if (prev && !regenerate && !upgrade) return prev;
    const reading = sourceReading(src);
    if (!reading) return prev;
    const inv = sourceInventory(reading);
    await composeTwoPhase(inv, prev ? { ...prev, regenerate } : { regenerate: true }, (s) => {
      src.summary = { ...s, sha: src.sha }; persist(); emit('sources');
    });
    return src.summary;
  });

  const entitySummaryFor = (label) => state.summaries.entities[entityKey(label)] || null;

  // Generate/refresh an entity topline, keyed by the merged label the explorer groups by. Returns
  // the stored summary; stores in state.summaries.entities and emits.
  const entitySummary = (docId, entId, { regenerate = false } = {}) => guarded(`e:${docId}#${entId}`, regenerate, async () => {
    const profile = entityProfile(docId, entId);
    if (!profile) return null;
    const key = entityKey(profile.label);
    const prev = state.summaries.entities[key] || null;
    const upgrade = prev && prev.modelless && !!model;
    if (prev && !regenerate && !upgrade) return prev;
    const inv = entityInventory(profile, { mentionCount: profile.mentionCount ?? profile.mentions.length, sourceCount: profile.sourceCount || 1 });
    await composeTwoPhase(inv, prev ? { ...prev, regenerate } : { regenerate: true }, (s) => {
      state.summaries.entities[key] = { ...s, key, label: profile.label }; persist(); emit('sources');
    });
    return state.summaries.entities[key];
  });

  // Give a topline feedback so it updates. The free-text note is interpreted into a STEER over the
  // closed set (cap length, pin a term, suppress a claim), folded onto the standing steer, recorded,
  // and the topline regenerated under it. A request the record cannot honour comes back in `unmet`.
  const summaryFeedback = async ({ scope, sn = null, docId = null, entId = null, text = '' } = {}) => {
    const note = interpretFeedback(text);
    const entry = { text: String(text || ''), at: nowIso() };
    if (scope === 'source') {
      const src = sourceBySn(sn);
      if (!src) return null;
      const steer = mergeSteer(src.summary?.steer, note);
      src.summary = { ...(src.summary || {}), steer, feedback: [...(src.summary?.feedback || []), entry] };
      persist();
      return sourceSummary(sn, { regenerate: true });
    }
    if (scope === 'entity') {
      const profile = entityProfile(docId, entId);
      if (!profile) return null;
      const key = entityKey(profile.label);
      const cur = state.summaries.entities[key] || {};
      const steer = mergeSteer(cur.steer, note);
      state.summaries.entities[key] = { ...cur, key, label: profile.label, steer, feedback: [...(cur.feedback || []), entry] };
      persist();
      return entitySummary(docId, entId, { regenerate: true });
    }
    return null;
  };

  // ── the wiki referent (the entity panel's encyclopedia lookup) ─────────────
  // 4.1's entity panel searched Wikipedia for the open entity and showed the settled
  // referent — the general meaning behind the local name — but only when the article
  // could be CONFIRMED against what the record says (wiki-referent.js). 4.2 dropped it
  // with the old shell; this restores it as one cached lookup per (doc, entity). The
  // promise is cached first so a double-open never double-fetches; a failure caches
  // null, and the surface words that as "no confirmed match", never an error.
  const wikiCache = new Map();
  const entityWiki = (docId, entId) => {
    const key = `${docId}#${entId}`;
    if (wikiCache.has(key)) return Promise.resolve(wikiCache.get(key));
    const p = entityProfile(docId, entId);
    if (!p || !p.label) return Promise.resolve(null);
    const pending = wikiReferent(client, {
      label: p.label,
      statements: [...p.defs.map((d) => d.value), ...p.mentions.map((m) => m.text)],
      neighbors: p.relations.map((r) => (r.srcId === entId ? r.tgtLabel : r.srcLabel)),
      pageTitles: p.sourceTitle ? [p.sourceTitle] : [],
    }).catch(() => null).then((def) => { wikiCache.set(key, def); return def; });
    wikiCache.set(key, pending);
    return pending;
  };

  // When a source entered the record, in epoch-ms — the graphs' time axis reads this off
  // each node (0/undefined ⇒ undated). Prefer the numeric recordedAt; fall back to parsing
  // the ISO `retrieved` so sources recorded before this field existed still place in time.
  const srcTimeMs = (s) => {
    if (!s) return 0;
    if (Number.isFinite(s.recordedAt) && s.recordedAt > 0) return s.recordedAt;
    const p = Date.parse(s.retrieved || '');
    return Number.isNaN(p) ? 0 : p;
  };

  // The honest tiered data for mountTieredGraph: the source at the radial centre
  // (tier 0), the focus + bonded figures (tier 1), the standing claims (tier 2).
  const tieredData = (docId, entId) => {
    const p = entityProfile(docId, entId);
    if (!p) return { nodes: [], edges: [] };
    const srcT = srcTimeMs(state.sources.find((s) => s.docId === docId));
    const nodes = [{ id: 'src', tier: 0, label: p.sourceTitle, kind: 'source', t: srcT }];
    const edges = [];
    const seen = new Set();
    const addEnt = (id, label) => {
      const nid = `e:${id}`;
      if (!seen.has(nid)) { seen.add(nid); nodes.push({ id: nid, tier: 1, label, kind: 'entity', ref: { docId, entId: id }, t: srcT }); }
      return nid;
    };
    const focus = addEnt(entId, p.label);
    edges.push({ a: 'src', b: focus, tier: 0, gl: '●', code: 'INS' });
    // Render the whole bonded neighbourhood figureSurface returns (already salience-bounded to
    // FOCUS_MAX_BONDS), not a 24-edge slice of it — the graph's own de-overlap and collision-culled
    // labels keep it readable, so every entity the focus actually bonds to gets a node.
    for (const r of p.relations) {
      const a = addEnt(r.srcId, r.srcLabel), b = addEnt(r.tgtId, r.tgtLabel);
      // Type the edge by the ACT it records, not the bare CON fallback: a kinship via
      // (mother/son) projects to INS, a metamorphosis to SEG·INS, and only a genuine
      // bond stays CON. The glyph shows the dominant (most-specific) operator; the code
      // carries the whole nested stack (§ operatorsOf).
      const ops = operatorsOf(r.via, r.op || 'CON');
      edges.push({ a, b, tier: 1, gl: glyphOf(ops[0]), code: ops.join('·') });
    }
    p.defs.slice(0, 16).forEach((d, i) => {
      const id = `c:${i}`;
      nodes.push({ id, tier: 2, label: d.value, kind: 'claim', t: srcT });
      edges.push({ a: focus, b: id, tier: 2, gl: '⊢', code: 'DEF' });
    });
    return { nodes, edges };
  };

  // The WHOLE-TOPIC entity graph for mountTieredGraph — the sibling of tieredData's single-entity
  // web, drawn over the entire topic at once. Every source sits at tier 0; the salient figures
  // across the topic at tier 1, MERGED across sources by normalised label so the same figure named
  // in two sources is one node (opaque per-doc ids never coincide, so a label merge is the honest
  // topic view); the bonds among them, aggregated across sources, are the tier-1 edges. Returns the
  // FULL graph — the surface's entity on/off toggles filter it for display, so a hidden entity can
  // still be turned back on. Entity nodes carry a representative { docId, entId } so a click opens
  // the entity panel, exactly like the single-entity web.
  const topicTieredData = () => {
    const srcs = topicSources();
    const nodes = [], edges = [], seen = new Set();
    const push = (id, tier, label, kind, ref, t = 0) => { if (!seen.has(id)) { seen.add(id); nodes.push({ id, tier, label, kind, ref, t }); } };
    const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const urlish = (s) => /^(https?:\/\/|www\.)/i.test(String(s || '')) || String(s || '').includes('://');
    const merged = new Map();       // normLabel → { id, label, mentions, sns:Set, ref }
    const mapKey = new Map();        // `${docId}#${repId}` → normLabel  (to map bond endpoints)
    for (const src of srcs) {
      const doc = docFor(src); if (!doc?.log) continue;
      const g = projectGraph(doc.log);
      const rep = g.representative || ((x) => x);
      const done = new Set();
      for (const [id, ent] of g.entities || []) {
        const r = rep(id); if (done.has(r)) continue; done.add(r);
        const label = doc.admission?.labelOf?.(r) || ent.label || r;
        const nl = norm(label); if (!nl || urlish(label)) continue;
        mapKey.set(`${doc.docId}#${r}`, nl);
        let m = merged.get(nl);
        if (!m) merged.set(nl, m = { id: `e:${nl}`, label, mentions: 0, sns: new Set(), ref: { docId: doc.docId, entId: r }, t: 0 });
        m.mentions += ent.sightings || 0; m.sns.add(src.sn);
        // an entity sits on the axis at its EARLIEST recording — when it first entered the record
        const st = srcTimeMs(src); if (st > 0) m.t = m.t > 0 ? Math.min(m.t, st) : st;
      }
    }
    // rank by salience and cap — the graph's own collision-culling keeps it legible, but a hard cap
    // keeps the toggle list and the layout from swelling on a large topic.
    const ranked = [...merged.values()].sort((a, b) => b.mentions - a.mentions).slice(0, 40);
    const shown = new Set(ranked.map((m) => norm(m.label)));
    const srcById = new Map(srcs.map((s) => [s.sn, s]));
    for (const m of ranked) push(m.id, 1, m.label, 'entity', m.ref, m.t);
    for (const m of ranked) {
      for (const sn of m.sns) {
        const sid = `src:${sn}`; const s = srcById.get(sn);
        push(sid, 0, s ? (s.title || s.reg || 'source') : 'source', 'source', null, srcTimeMs(s));
        edges.push({ a: sid, b: m.id, tier: 0, gl: '●', code: 'INS' });
      }
    }
    const agg = new Map();
    for (const src of srcs) {
      const doc = docFor(src); if (!doc?.log) continue;
      const g = projectGraph(doc.log);
      const rep = g.representative || ((x) => x);
      for (const e of g.edges || []) {
        const an = mapKey.get(`${doc.docId}#${rep(e.from)}`), bn = mapKey.get(`${doc.docId}#${rep(e.to)}`);
        if (!an || !bn || an === bn || !shown.has(an) || !shown.has(bn)) continue;
        const key = an + '' + bn; let b = agg.get(key);
        if (!b) agg.set(key, b = { a: `e:${an}`, b: `e:${bn}`, w: 0, via: null, op: null });
        b.w += (e.weight != null ? e.weight : 1) || 0.001;
        const via = e.relType || e.via; if (!b.via && via) b.via = via;
        // The projection carries the real operator through (project.js stores it as
        // e.kind — 'con'/'sig'/'syn'), so a SIG or SYN survives instead of being
        // flattened to the hardcoded bond it was before.
        if (!b.op && e.kind) b.op = String(e.kind).toUpperCase();
      }
    }
    [...agg.values()].sort((x, y) => y.w - x.w).slice(0, 80).forEach((b) => {
      // Type the aggregated topic edge by its act (INS for kinship, SEG·INS for a
      // metamorphosis, SIG/SYN when the source read one) rather than a uniform CON.
      const ops = operatorsOf(b.via, b.op || 'CON');
      edges.push({ a: b.a, b: b.b, tier: 1, gl: glyphOf(ops[0]), code: ops.join('·') });
    });
    return { nodes, edges };
  };

  // The topic's sources shaped for the causal DAG surface (mountDagSurface). A readable id (the
  // source title) rides in front of the parsed sentences + log the two cursors read: cursor 2 runs
  // over ALL of them so cross-source confounders and disagreements surface; cursor 1 reads the
  // primary. Sources with no readable sentences drop out.
  const dagSources = () => topicSources().map((src) => {
    const doc = docFor(src);
    if (!doc || !(doc.sentences || []).length) return null;
    return { docId: src.title || src.url || src.docId, sn: src.sn, sentences: doc.sentences, log: doc.log };
  }).filter(Boolean);

  // ── findings + provenance (the graph tab, honest) ──────────────────────────
  const findings = () => {
    const t = topic();
    const claims = [];
    const passages = new Map();
    let contradictions = 0;
    for (const m of t?.messages || []) {
      if (m.role !== 'assistant') continue;
      for (const b of m.bound || []) {
        if (!b.claim) continue;
        const cite = (m.cites || []).find((c) => b.citation && String(b.citation).includes(String(c.idx)));
        claims.push({
          id: `C${claims.length + 1}`, text: b.claim, msgId: m.id,
          status: b.citation ? 'Supported' : 'Uncited',
          sn: cite?.sn || null, reg: cite?.reg || null, quote: cite?.text || '',
        });
      }
      for (const v of m.verdicts || []) {
        if (/contradict/i.test(v.verdict)) {
          contradictions++;
          const hit = claims.find((c) => c.text === v.claim);
          if (hit) hit.status = 'Contested';
        }
      }
      for (const c of m.cites || []) {
        if (!passages.has(`${c.docId}:${c.idx}`)) {
          passages.set(`${c.docId}:${c.idx}`, {
            id: `P${passages.size + 1}`, idx: c.idx, sn: c.sn, reg: c.reg, text: c.text, docId: c.docId,
          });
        }
      }
    }
    return {
      claims: claims.slice(-24), passages: [...passages.values()].slice(-32),
      contradictions,
      stats: { claims: claims.length, passages: passages.size, sources: topicSources().length, contradictions },
    };
  };

  const provenance = () => {
    const t = topic();
    const f = findings();
    const srcs = topicSources();
    const usedSns = new Set(f.passages.map((p) => p.sn).filter(Boolean));
    const shown = srcs.filter((s) => usedSns.has(s.sn) || usedSns.size === 0).slice(0, 8);
    const nodes = { memo: { id: 'M1', title: t?.title || 'This topic' }, claims: f.claims.slice(-8), passages: [], sources: shown, files: [] };
    const passBySn = new Map();
    for (const p of f.passages) {
      if (!p.sn || !shown.find((s) => s.sn === p.sn)) continue;
      passBySn.set(p.id, p);
    }
    nodes.passages = [...passBySn.values()].slice(-12);
    nodes.files = shown.map((s, i) => ({ id: `F${i + 1}`, sn: s.sn, sha: shaShort(s.sha), bytes: s.bytes }));
    const edges = [];
    for (const c of nodes.claims) {
      edges.push({ kind: 'cite', from: 'M1', to: c.id });
      const p = nodes.passages.find((x) => x.sn === c.sn && (!c.quote || x.text === c.quote)) ||
                nodes.passages.find((x) => x.sn === c.sn);
      if (p) edges.push({ kind: c.status === 'Contested' ? 'against' : 'ground', from: c.id, to: p.id });
    }
    for (const p of nodes.passages) {
      if (p.sn) edges.push({ kind: 'extract', from: p.id, to: p.sn });
    }
    nodes.sources.forEach((s, i) => edges.push({ kind: 'fixity', from: s.sn, to: nodes.files[i].id }));
    return { nodes, edges };
  };

  const dagFor = (snId, which = 'discourse') => {
    const src = sourceBySn(snId);
    const doc = src && docFor(src);
    if (!doc) return null;
    return which === 'asserted' ? assertedDag(doc) : discourseDag(doc);
  };

  // ── memo ───────────────────────────────────────────────────────────────────
  const setMemo = (text) => { const t = topic(); if (t) { t.memo = String(text); persist(); emit('memo'); } };

  // ── deep reading: the inner monologue at rest ────────────────────────────────
  // When no turn is generating and the reader is quiet, the reading turns back on the
  // record: it surfs to the place of most interest (Bayesian surprise), folds it, and
  // voices a reflection — an ENACTED EVA held at band VOID. The firewall is the TYPE:
  // canWitness(reflection.prov) === false, so a reflection can never be mistaken for a
  // witnessed fact or ground an answer (docs/deep-reading.md, docs/monologue-significance.md).
  // Model-free and embedder-free — thinking needs no weights. Reflections stream into
  // state.reflections; the surface shows them in the master-log drawer's "Reflections" mode.
  // The reader never self-polls: an idle governor wakes it only in the lulls between turns.
  const deepReaders = new Map();     // docId → { reader, doc, anchor }
  let deepSettled = false, deepRunning = false, deepTimer = null, lastActivity = 0;
  // self-guided-learning pacing — the wander advances at most one step per `minStepMs` (human pace)
  // and never re-turns a reflection it has already learned from (anti-rumination).
  let lastWander = 0, wanderRunning = false;
  const wanderSeen = new Set();

  // A reflection deposits onto the log; layer it over the source's log in an overlay so the
  // stored record stays append-only truth and a reload re-reads clean.
  const overlayDoc = (base) => {
    const extra = [];
    const log = {
      append: (e) => { extra.push(e); return e; },
      snapshot: () => base.log.snapshot().concat(extra),
      get length() { return base.log.snapshot().length + extra.length; },
    };
    return { log, units: base.units, sentences: base.sentences, tokensBySentence: base.tokensBySentence, docId: base.docId };
  };

  // A figure the reading named by opaque id → its readable label, so the inner note reads as
  // prose; id-shaped tokens with no known label drop to "something" rather than show raw.
  const cleanLabels = (s, doc) => String(s ?? '').replace(/\b[a-z][a-z0-9]{4,}\b/g, (tok) => {
    if (!/[0-9]/.test(tok)) return tok;
    let lab = null; try { lab = doc?.admission?.labelOf?.(tok) ?? null; } catch { /* pass */ }
    if (lab && lab !== tok) return lab;
    return /^[a-z][0-9]/.test(tok) ? 'something' : tok;
  });

  const deepReaderFor = (src) => {
    const doc = docFor(src);
    if (!doc || !(doc.sentences || doc.units || []).length) return null;
    let entry = deepReaders.get(src.docId);
    if (!entry) {
      try {
        const od = overlayDoc(doc);
        entry = { reader: createDeepReader({ doc: od, surf: surfFold }), doc: od, base: doc, anchor: 0 };
        deepReaders.set(src.docId, entry);
      } catch { return null; }
    }
    return entry;
  };

  // The record grew (a source landed) or the topic changed — wake the loop so the new
  // places get read at rest. Readers keep their per-place habituation (the rumination cure).
  const deepWake = () => { deepSettled = false; };

  // ONE governed pass over the topic's sources — arrive() runs until it quiesces (never spins).
  // Called by the idle governor, and by the surface's "Reflect now" (manual=true).
  const deepTick = (manual = false) => {
    if (deepRunning) return; deepRunning = true;
    try {
      if (state.busy && !manual) return;            // engaged — a turn is decoding
      if (deepSettled && !manual) return;           // quiesced until the record grows
      const srcs = topicSources();
      if (!srcs.length) return;
      let anyFresh = false, allSettled = true;
      for (const src of srcs) {
        const entry = deepReaderFor(src);
        if (!entry) continue;
        const n = (entry.doc.sentences || entry.doc.units || []).length; if (!n) continue;
        let res; try { res = entry.reader.arrive({ anchor: entry.anchor }); } catch { continue; }
        const fresh = (res && res.reflections) || [];
        if (fresh.length) {
          anyFresh = true;
          state.reflectionsSeen = recordReflections(state.reflections, state.reflectionsSeen, fresh, (r) => ({
            t: nowIso(), docId: src.docId, sn: src.sn, title: src.title,
            peak: r.peak, note: cleanLabels(r.body, entry.base), verdict: r.verdict || '',
            surprise: r.surprise, canWitness: r.canWitness,   // false — the firewall, surfaced
          }));
          entry.anchor = Math.min(n - 1, fresh[fresh.length - 1].peak + 1);
        } else {
          entry.anchor += 8;
        }
        if (entry.anchor < n - 1 || fresh.length) allSettled = false;
      }
      deepSettled = allSettled && !anyFresh;
      if (anyFresh) {
        // ONE coalescing beat for the whole lull (see appendLog): every idle pass folds into this
        // single line, ticking its count, rather than stacking a new one — the Actions feed stays
        // about actions. The effect points to where the notes actually live, so the count reads as
        // a signpost ("go read them") instead of a bare number that touched nothing.
        const n = state.reflectionsSeen;
        logIt('reflection', `Reflected at rest — ${n} note${n === 1 ? '' : 's'} so far`,
          'read them in the Reflections tab', { coalesce: true });
        persist(); emit('reflections');
      }
    } finally { deepRunning = false; }
  };

  // Voice the just-grounded connections as prose (phase E). Builds grounded subject→relation→object
  // propositions from the connection edges, labelled via the doc's own graph so real names surface,
  // then realises them — with the LOCAL model when it is loaded and free, else the deterministic
  // model-free realizer. The propositional veto (talkThenVerify) strips any drift, so the prose can
  // be no more wrong than the graph is. Returns '' when there is nothing (grounded) to say.
  const prosifyConnections = async (promoted) => {
    if (!promoted || !promoted.length) return '';
    const props = [];
    for (const { event, doc } of promoted) {
      let g = null; try { g = projectGraph(doc.log); } catch { /* skip this one */ }
      const rep = g?.representative || ((id) => id);
      const lab = (id) => g?.entities?.get?.(rep(id))?.label ?? id;
      if (event.src && event.via) props.push({ subj: lab(event.src), verb: event.via, obj: event.tgt ? lab(event.tgt) : null });
    }
    if (!props.length) return '';
    if (state.model?.state === 'ready') {
      try {
        const model = await ensureModel();
        if (model && typeof model.phrase === 'function') {
          const out = await talkThenVerify({ propositions: props }, model, { doc: promoted[0].doc });
          const fluent = String(out?.fluent || '').trim();
          if (fluent && out.clean) return fluent;    // clean = no fabricated proposition survived the veto
        }
      } catch { /* a cold/slow/erroring model never costs the pass — fall through to model-free */ }
    }
    return speakTriples(props);
  };

  // The connective promotion pass (phase 4) — the VERIFY half of murmur's connective loop, run at
  // rest beside deep reading. It drains murmur's candidate connections (recognition impressions that
  // pointed back at an earlier locus) and lets the DOCUMENT decide: a document-corroborated relation
  // bridging the two passages is promoted to a real CON edge (Tier 2, nominatedBy:'murmur', grounded
  // by citation, reafferent so it can never self-witness); every other echo is held open as a
  // firewalled EVA/void margin note (Tier 1). Both ride the deep-reader OVERLAY (append-only over the
  // source's durable truth), so they enter the session graph exactly as reflections do, and surface
  // in the same Reflections drawer — "watch the app murmur" for free. Off the critical path: it never
  // runs while a turn decodes, and a bad candidate never breaks the loop.
  let connectRunning = false;
  const connectTick = async (manual = false) => {
    if (connectRunning) return 0; connectRunning = true;
    try {
      if (!murmur || typeof murmur.nominations !== 'function') return 0;
      if (state.busy && !manual) return 0;                  // engaged — a turn is decoding
      const cands = murmur.nominations();                   // DRAIN the read side-channel
      if (!cands.length) return 0;
      const overlayFor = (docId) => {
        const src = state.sources.find((s) => s.docId === docId);
        const entry = src ? deepReaderFor(src) : null;
        return entry ? { doc: entry.doc, src } : null;
      };
      const docForId = (docId) => overlayFor(docId)?.doc || null;
      const fresh = [];
      const promoted = [];                                  // Tier-2 events to prosify (phase E)
      for (const c of cands) {
        let res = null;
        try { res = await promoteConnection(c, { docFor: docForId }); }
        catch { continue; }                                 // a bad candidate never costs the pass
        if (!res || !res.event || res.tier === 0) continue;
        const home = overlayFor(res.docId);
        if (!home) continue;
        try { home.doc.log.append(res.event); } catch { continue; }
        if (res.tier === 2) promoted.push({ event: res.event, doc: home.doc });
        const label = res.event.echoes?.sharedLabel || res.shared || null;
        fresh.push({
          docId: res.docId, sn: home.src?.sn || null, title: home.src?.title || res.docId,
          peak: Number.isInteger(c?.from?.cursor) ? c.from.cursor : null,   // the "jump to" locus in the drawer
          tier: res.tier, connection: true, canWitness: false,   // the firewall, surfaced
          note: res.tier === 2
            ? `${label ? label + ' — ' : ''}connects to an earlier passage${res.event.citation ? ` (${res.event.citation})` : ''}`
            : (res.event.body || 'reads like an earlier passage'),
          citation: res.event.citation || null,
          verdict: res.tier === 2
            ? (res.event.echoes?.recurrence ? 'recurrence' : (res.verdict?.verdict || 'corroborated'))
            : '',
        });
      }
      // Phase E — PROSIFY the grounded connections. "If not otherwise occupied": run only at rest,
      // and use the LOCAL model when it is warm (webllm/wllama, nothing leaves the box), falling back
      // to the model-free realizer (speakTriples) otherwise — so the connections are always voiced,
      // the LLM is spent only when it is free and loaded. The propositional veto (talkThenVerify)
      // strips anything the talker invents, so the prose can be no more wrong than the graph is.
      const prose = await prosifyConnections(promoted);
      if (prose) {
        const pd = promoted[0]?.doc?.docId || null;
        const psrc = pd ? state.sources.find((s) => s.docId === pd) : null;
        fresh.push({ docId: pd, sn: psrc?.sn || null, title: psrc?.title || pd, prose: true, connection: true, tier: 2, canWitness: false, note: prose });
      }

      if (fresh.length) {
        state.reflectionsSeen = recordReflections(state.reflections, state.reflectionsSeen, fresh, (r) => ({
          t: nowIso(), ...r,
        }));
        const nT2 = fresh.filter((f) => f.tier === 2 && !f.prose).length;
        logIt('reflection', nT2
          ? `Connected at rest — ${nT2} grounded connection${nT2 === 1 ? '' : 's'} added to the graph`
          : `Noticed ${fresh.length} echo${fresh.length === 1 ? '' : 'es'} at rest`);
        persist(); emit('reflections');
      }
      return fresh.length;
    } finally { connectRunning = false; }
  };

  // The murmur's stance, driven by the surface (Settings). Hidden ⇒ the wander PAUSES, so the
  // transparency rule holds by construction: there is no code path where murmur mutters or reaches
  // the web while the strip is not on screen ("no muttering you don't see"). 'off' fully disables.
  const setMurmurMode = (mode) => {
    const m = (mode === 'off' || mode === 'look' || mode === 'explore') ? mode : 'look';
    if (state.murmurMode === m) return;
    state.murmurMode = m; emit('murmur');
  };
  const setMurmurVisible = (on) => {
    const v = on !== false;
    if (state.murmurVisible === v) return;
    state.murmurVisible = v; emit('murmur');
  };

  // The labels the record already EXPLAINS — the entity names in the topic's document graphs. A
  // surprising term that is NOT here is something the reading NAMED but did not explain: the honest
  // outward lead for explore mode. Lowercased tokens so a multi-word label still shields its parts.
  const knownLabels = () => {
    const known = new Set();
    for (const src of topicSources()) {
      let g = null; try { g = projectGraph(docFor(src).log); } catch { continue; }
      if (!g || !g.entities) continue;
      for (const ent of g.entities.values()) {
        for (const w of String(ent?.label || '').toLowerCase().match(/[a-z][a-z0-9'’-]{2,}/g) || []) known.add(w);
      }
    }
    return known;
  };

  // Fold a fresh learning note into the notebook + broadcast it as a LIVE mutter so the strip paints
  // it (self-guided learning, visible by construction). Never a log write — murmur.mutter is a read
  // side-channel and the note is reafferent (canWitness===false).
  const noteLearning = (note, pick) => {
    if (!note) return;
    state.learningSeen += 1;
    state.learning.push({ id: `L${state.learningSeen}`, t: nowIso(),
      phrase: note.phrase, terms: note.terms, origin: note.origin, register: note.register,
      curiosity: note.curiosity, source: note.source, web: note.web, canWitness: false });
    if (state.learning.length > REFLECTION_CAP) state.learning.splice(0, state.learning.length - REFLECTION_CAP);
    try { murmur.mutter({ phrase: note.phrase, register: note.register || 'curiosity',
      intensity: Math.max(0.35, Math.min(1, (pick && pick.curiosity) || 0.5)), learning: note }); } catch { /* the strip must never cost the pass */ }
  };

  // THE WANDER (self-guided learning) — one human-paced step, run at rest beside deep reading. It
  // looks at the most INTERESTING place the reading just surfaced (a fresh reflection), lets the
  // notebook decide if it is worth turning over (curiosity = the one surprise pointed inward), and
  // — in EXPLORE mode, with a web license — follows ONE outward lead onto the web, folding what it
  // reads back as a learning note. Gated: mode≠off, strip visible, not engaged, and at most one step
  // per minStepMs. Everything is reafferent (canWitness===false) and off the critical path.
  let learnRunning = false;
  const wanderTick = async (manual = false) => {
    if (learnRunning) return 0; learnRunning = true;
    try {
      if (!murmur || !murmur.learn || typeof murmur.learn.wander !== 'function') return 0;
      if (state.murmurMode === 'off' || !state.murmurVisible) return 0;   // off / hidden ⇒ paused
      if (state.busy && !manual) return 0;                                // engaged — a turn is decoding
      const cfg = (murmur.config && murmur.config.learn) || {};
      const nowMs = Date.now();
      if (!manual && nowMs - lastWander < (cfg.minStepMs || 20000)) return 0;   // human pace
      lastWander = nowMs;

      // The most interesting places at rest = the freshest reflections the deep reader surfaced that
      // the wander hasn't turned over yet. Their note text is the candidate; the locus rides along.
      const cands = [];
      for (let i = state.reflections.length - 1; i >= 0 && cands.length < 6; i--) {
        const r = state.reflections[i];
        if (!r || wanderSeen.has(r.id) || r.prose) continue;   // skip prosified connection lines
        cands.push({ text: `${r.title ? r.title + '. ' : ''}${r.note || ''}`,
          source: { docId: r.docId, sn: r.sn, title: r.title, cursor: r.peak, reflId: r.id } });
      }
      if (!cands.length) return 0;

      const pick = murmur.learn.wander(cands, { floor: cfg.curiosityFloor });
      if (pick) { if (pick.source && pick.source.reflId) wanderSeen.add(pick.source.reflId); }
      else { for (const c of cands) if (c.source.reflId) wanderSeen.add(c.source.reflId); return 0; }  // nothing new — don't re-scan these

      const note = murmur.learn.learn(pick, { source: pick.source, origin: 'reading', register: 'curiosity' });
      noteLearning(note, pick);
      let learned = 1;

      // EXPLORE — reach ONE outward thread onto the web (opt-in; the surface enables it). Guarded on
      // the license, a working search seam, and web consent; a bad fetch never costs the pass.
      if (state.murmurMode === 'explore' && cfg.internet !== false && typeof webSearchAdmit === 'function' && webMode() !== 'off') {
        try {
          const lead = murmur.learn.outwardLead(note, { known: knownLabels(), anchor: pick.source?.title || '' });
          if (lead) {
            murmur.mutter({ phrase: `wondering about ${lead.term} — going to read a little`, register: 'outward', intensity: 0.5 });
            const walk = await runCuriousResearch(lead.query, { search: webSearchAdmit, anchor: lead.query, maxHops: cfg.hopsPerReach || 1, k: 3 });
            for (const d of (walk.docs || []).slice(0, 2)) {
              const text = String(d?.text || d?.web?.excerpt || '').trim();
              if (!text) continue;
              const web = { url: d?.web?.url || d?.web?.final_url || '', title: d?.web?.title || d?.title || lead.term, gist: text.slice(0, 160) };
              const wnote = murmur.learn.learn({ text, source: pick.source }, { origin: 'web', register: 'discovery', web });
              noteLearning(wnote, { curiosity: 0.6 });
              learned += 1;
            }
          }
        } catch { /* the web is best-effort — a strayed or failed reach never breaks the wander */ }
      }

      const n = state.learningSeen;
      logIt('learning', `Learned at rest — ${n} note${n === 1 ? '' : 's'} so far`,
        'see them in the Learning layer', { coalesce: true });
      persist(); emit('learning');
      return learned;
    } finally { learnRunning = false; }
  };

  // The idle governor: a light interval that fires a deep pass only when NOT engaged — no turn
  // generating, and the user quiet for a beat. A keystroke or tap resets the clock, so deep
  // reading never competes with an active reader; it fills the lulls. Browser only (no timers,
  // no window in tests — the whole loop is inert under node).
  const markActivity = () => { lastActivity = Date.now(); };
  const deepIdleStart = () => {
    if (deepTimer || typeof window === 'undefined') return;
    lastActivity = Date.now();
    const bump = () => markActivity();
    try {
      window.addEventListener('keydown', bump, { passive: true });
      window.addEventListener('pointerdown', bump, { passive: true });
    } catch { /* no window events — the governor still ticks on time alone */ }
    const IDLE_MS = 12000;
    deepTimer = setInterval(() => {
      try {
        if (state.busy) return;                             // engaged
        if (Date.now() - lastActivity < IDLE_MS) return;    // the user is active
        if (!topicSources().length) return;                 // nothing recorded yet
        // Promote murmur's connections first (cheap: drains a queue), then read deeper. connectTick
        // has its own quiescence (an empty queue), so it does not gate on deepSettled the way the
        // reflection pass does — a fresh recognition can arrive while deep reading has settled.
        void connectTick(false);
        void wanderTick(false);                             // self-guided learning — self-throttled to human pace
        if (deepSettled) return;                            // quiesced until the record grows
        deepTick(false);
      } catch { /* a bad pass never breaks the governor */ }
    }, 4000);
  };

  const reflections = () => state.reflections.slice();

  // A snapshot the migration can't digest must degrade to a fresh session, not an
  // unhandled boot rejection with `ready` never emitted — that bricked the surface
  // on EVERY visit until the user cleared site data.
  restore().catch(() => { if (!state.ready) { state.ready = true; emit('ready'); } });

  return Object.freeze({
    state, subscribe,
    // topics — a nested tree within a workspace
    topicNew, setTopic, topicRename, topicDelete, topic,
    topicMove, topicToggleCollapse, topicTree, topicRows,
    // workspaces — the top-level containers (Matrix-shared workspaces slot in via `shared`)
    workspaceNew, setWorkspace, workspaceRename, workspaceDelete, activeWorkspace,
    // ingest
    ingestUrl, ingestText, ingestFile, search, recordHit, webSearchAdmit, fetchPage, navigatePage,
    // durable pending work — the ingest/transcription jobs still in flight, and the boot-time resume
    // that re-runs them (so ingestion AND transcription survive a reload even part-way through)
    jobs: () => state.jobs.slice(),
    resumeJobs,
    // search — the sibling of ask(): a query opens a "search topic" and pulls sources into it
    searchTopic,
    sourceBySn, removeSource, topicSources, sourceToggleCollapse,
    // chat
    ask, stop, exportChat,
    // export provenance — WHAT produced this session: app + published build + latest-on-GitHub +
    // the current talker. Composed live so a surface badge can show the build/freshness/model.
    provenance: () => composeProvenance({
      app: APP_NAME, version: APP_VERSION,
      build: provBuild, latest: provLatest, repo: provRepo,
      model: describeModel(model), exportedAt: nowIso(),
    }),
    refreshProvenance,
    // deep reading — the inner monologue at rest (reflections stream into state.reflections)
    deepTick, reflections,
    // connective promotion — murmur's candidate connections verified + written at rest (phase 4)
    connectTick,
    // self-guided learning — the murmur's at-rest wander (murmur/learn): notes stream into
    // state.learning (the toggleable graph layer) and mutter live in the strip.
    wanderTick, learning: () => state.learning.slice(),
    setMurmurMode, setMurmurVisible,
    murmurMode: () => state.murmurMode,
    // web-search mode (off | confirm | auto)
    webMode, setWebMode,
    // redact-when-hosted — keep real entities off the wire when the talker is Claude (Anthropic)
    redactRemote, setRedactRemote,
    // model
    ensureModel, setBackend, backendPref, setSpeed, speedPref,
    // projections for the surface
    answerSegments, viewerParas, readerLink, entities, entityProfile, entityWiki, tieredData, topicTieredData,
    // auto-generated toplines (docs/topline.md) — a summary for every source and entity, + feedback
    sourceSummary, sourceSummaryOf, entitySummary, entitySummaryFor, summaryFeedback,
    findings, provenance, dagFor, dagSources, setMemo, eotFor, answerEot,
    // the commitment ledger (assertions + corrections, persisted) and the session's
    // self/world line readout — the honesty and ledger seams, readable from the surface
    ledger: () => ledger.entries(),
    ledgerExport: () => ledger.exportJSONL(),
    selfModel: () => ({
      observations: monitor.self.size,
      self: monitor.self.count('self'),
      world: monitor.self.count('world'),
      mismatched: monitor.self.count('self-mismatch'),
      outstanding: monitor.outstanding().length,
      corrections: monitor.corrections().length,
    }),
    // the raw doc, for anything the surface wants to inspect
    docFor: (snId) => docFor(sourceBySn(snId)),
    // audio: a playable URL (rehydrated from OPFS / the encrypted Matrix copy after reload), the raw
    // persisted bytes (for redaction re-synthesis), and the non-destructive edit/redaction chokepoint.
    playableUrl, audioBytes, recordAudioEvent,
  });
};
