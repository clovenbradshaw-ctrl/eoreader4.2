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
// In Node (tests) there is no indexedDB and no fetch — every method that needs
// one degrades to a no-op or a thrown, catchable error; nothing at import time
// touches the network.

import { parseText } from '../../perceiver/parse/index.js';
import { projectGraph } from '../../core/index.js';
import { createModel, describeModel } from '../../model/interface.js';
import { probeOrigins, explainReach } from '../../model/reach.js';
import { createHashEmbedder, createMiniLMEmbedder, withPersistentEmbedCache } from '../../model/index.js';
import { runTurn, runWebFollowup, formulateSearchQuery, searchAnnouncement,
         runTurnWithResearch, researchAnnouncement, modelDisambiguator, senseAnnouncement,
         readDiscourse, phaticFromSpeech, clarifyDemandOf, loadShapeLibrary } from '../../turn/index.js';
import { loadShapeGrammars } from '../../turn/shape-grammar.js';
import { extendLibraryWithNavPool } from '../../turn/nav-pool.js';
import { createWebClient, htmlToText, wikiExtract, searchAndAdmit } from '../../organs/ingest/webfetch.js';
import { directCorsUrl } from '../../organs/ingest/direct-cors.js';
import { admitWebSource, webContentHash } from '../../organs/ingest/websource.js';
import { GUTENBERG_FULLTEXT } from '../../organs/ingest/gutenberg.js';
import { WIKIMEDIA_FULLTEXT } from '../../organs/ingest/wikimedia.js';
import { readIngest } from '../../organs/ingest/read.js';
import { outstandingQuestion, answersAwaited } from '../../core/conversation-fold.js';
import { senseGate } from '../../turn/sense.js';
import { createMonitor } from '../../enactor/monitor.js';
import { createCommitmentLedger } from '../../enactor/ledger.js';
import { answerSmalltalk } from '../../enactor/answer/index.js';
import { figureSurface } from '../../perceiver/index.js';
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

// ── the app ──────────────────────────────────────────────────────────────────
export const createReaderApp = ({ audit, fetchImpl = chainFetch } = {}) => {
  const state = {
    sources: [],           // registry entries (serializable minus _doc)
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
    model: { backend: null, state: 'cold', progress: 0, note: '' },
    busy: null,            // { kind, label } while a long op runs
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

  const logIt = (kind, text, effect = '') => {
    state.log.push({ id: `L${++ln}`, t: nowIso(), kind, text, effect });
    if (state.log.length > 400) state.log.shift();
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

  // ── persistence ────────────────────────────────────────────────────────────
  const serialize = () => ({
    v: 1, sn, tn, ln, mn, wn,
    activeTopicId: state.activeTopicId,
    activeWorkspaceId: state.activeWorkspaceId,
    workspaces: state.workspaces,
    log: state.log.slice(-120),
    topics: state.topics,
    sources: state.sources.map(({ _doc, ...rest }) => rest),
    // the commitment ledger — assertions and corrections survive reload (the spine)
    ledger: ledger.serialize(),
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
        state.sources = (snap.sources || []).map((s) => ({ ...s, _doc: null }));
        state.topics = snap.topics || [];
        state.activeTopicId = snap.activeTopicId;
        state.workspaces = Array.isArray(snap.workspaces) ? snap.workspaces : [];
        state.activeWorkspaceId = snap.activeWorkspaceId || null;
        state.log = snap.log || [];
        if (snap.ledger) ledger.restore(snap.ledger);   // the spine survives reload
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
      setTimeout(() => { ensureModel().catch(() => { /* logged by the ladder */ }); }, 600);
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
    }
  };

  // ── topics — a nested tree within a workspace (Notion's pages / sub-pages) ────
  const topicById = (id) => state.topics.find((t) => t.id === id) || null;
  // Every topic strictly below `id` in the tree — the guard against a move that would
  // fold a topic under one of its own descendants (a cycle out of the tree).
  const topicDescendants = (id) => {
    const out = [];
    const walk = (pid) => { for (const t of state.topics) if ((t.parentId ?? null) === pid) { out.push(t.id); walk(t.id); } };
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
  const setTopic = (id) => { if (state.topics.find((t) => t.id === id)) { state.activeTopicId = id; deepWake(); persist(); emit('topics'); } };
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
    if (state.topics.length <= 1) return;
    const gone = topicById(id); if (!gone) return;
    const parentId = gone.parentId ?? null;
    // Lift the direct children up one level (the subtree rises rather than vanishing).
    for (const t of state.topics) if ((t.parentId ?? null) === id) t.parentId = parentId;
    state.topics = state.topics.filter((t) => t.id !== id);
    if (state.activeTopicId === id) {
      const sib = state.topics.find((t) => t.workspaceId === gone.workspaceId) || state.topics[0];
      state.activeTopicId = sib.id;
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

  const addSource = ({ title, url = null, text, kind = 'web', rights = null, record = null, doc = null }) => {
    const body = String(text || '').trim();
    if (!body) throw new Error('nothing to record — the page had no readable text');
    const hash = record?.content_hash || webContentHash(body);
    const dup = state.sources.find((s) => s.sha === hash);
    if (dup) { logIt('skip', `Already recorded — ${dup.title}`, dup.sn); return dup; }
    const id = `S${++sn}`;
    const src = {
      sn: id, reg: `S-${String(sn).padStart(4, '0')}`,
      docId: doc?.docId || `doc-${shaShort(hash)}`,
      title: title || url || 'Untitled', url, domain: url ? domainOf(url) : (kind === 'file' ? 'local file' : 'pasted text'),
      kind, retrieved: nowIso(), sha: hash, bytes: bytesOf(body),
      rights: rights || (url ? 'web — verify before reuse' : 'local'),
      text: body, entCount: null, _doc: doc || null,
    };
    if (doc) { try { src.entCount = projectGraph(doc.log).entities?.size || 0; } catch { src.entCount = 0; } }
    state.sources.push(src);
    const t = topic();
    if (t && !t.sourceSns.includes(id)) t.sourceSns.push(id);
    if (t) topicAutoName(t, { silent: true });   // a first source names a placeholder topic (persist/emit follow below)
    logIt('record', `Recorded ${src.domain} — ${src.title}`, src.reg);
    logIt('hash', `Fixity sha ${shaShort(src.sha)} · ${src.bytes.toLocaleString()} bytes`, src.reg);
    deepWake();   // the record grew — let the reading reflect on the new places at rest
    persist(); emit('sources');
    // Every source is READ into EoT at the moment of record — every proposition the
    // parse admitted (any modality: the organs all land on the same spine) rendered
    // in the canonical surface, with the reading's own thinking layered as comments.
    // Deferred a tick so the record lands (toast, registry) before the read runs.
    setTimeout(() => {
      try {
        const r = eotFor(id);
        if (r) logIt('eot', `Encoded ${src.reg} into EoT — ${r.structure?.lines?.length ?? 0} propositions, ${r.turns?.length ?? 0} turning points`, src.reg);
      } catch (e) { logIt('skip', `EoT read failed for ${src.reg} — ${String(e?.message || e).slice(0, 90)}`); }
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
    state.sources = state.sources.filter((s) => s.sn !== id);
    for (const t of state.topics) t.sourceSns = t.sourceSns.filter((x) => x !== id);
    persist(); emit('sources');
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
      const raw = (await client.fetchUrl(norm, { signal })).text;
      const title = (/<title[^>]*>([^<]*)</i.exec(raw)?.[1] || '').trim() || norm;
      const text = htmlToText(raw);
      const { doc, record } = admitWebSource({ url: norm, title, text, fetched_at: nowIso(), engine: 'feed-proxy' });
      return addSource({ title: record.title || title, url: norm, text: doc.text, kind: 'web', record, doc });
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

  const ingestText = (text, title = 'Pasted text') => {
    const doc = parseText(String(text), { docId: `doc-${shaShort(webContentHash(text))}` });
    return addSource({ title, text: String(text), kind: 'text', doc });
  };

  const ingestFile = (file) =>
    runCancellable({ kind: 'file', label: `Reading ${file.name}…` }, async (signal, progress) => {
      const { importAnyFile } = await import('./import-file.js');
      const got = await importAnyFile(file, { signal, onProgress: (msg) => progress({ kind: 'file', label: String(msg) }) });
      // For a structured modality the ORGAN doc is the reading: a table's cells, a JSON
      // tree's leaves, a binary's string runs ARE its propositions — three-faced events
      // already on the log — and re-parsing their rendered lines as prose would drop
      // them. Prose-bearing modalities (pdf, webpage, ocr, audio transcript, plain text)
      // parse as text so the entity/relation read runs over the actual sentences.
      const structured = ['table', 'json', 'binary'].includes(got.meta?.modality) && got.meta?.doc;
      const doc = structured ? got.meta.doc : parseText(got.text, { docId: `doc-${shaShort(webContentHash(got.text))}` });
      const src = addSource({ title: got.title || file.name, text: got.text, kind: got.meta?.modality || 'file', rights: 'local file', doc });
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

  // ── model ──────────────────────────────────────────────────────────────────
  let backendOverride = null;
  const backendPref = () => {
    if (backendOverride) return backendOverride;
    try { const v = localStorage.getItem('eo_backend'); if (v) return v; } catch { /* default */ }
    return (typeof navigator !== 'undefined' && navigator.gpu) ? 'webllm' : 'wllama';
  };
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
    orphanModel();
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
      orphanModel();
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
          const hint = (backend === 'webllm' && quiet < 90)
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
            try { await m.phrase([{ role: 'user', content: '.' }], { maxTokens: 1, temperature: 0 }); } catch { /* warmed or not, it loaded */ }
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
          const noGpu = backend === 'webllm' && !(typeof navigator !== 'undefined' && navigator.gpu);
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
        if (backendPref() === 'webllm' && speedPref() !== 'fast') {
          logIt('skip', 'In-browser model kept dying — dropping to the faster 1B build for this session');
          setSpeed('fast', { persist: false });
        } else if (backendPref() === 'webllm') {
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
      pending.flags = [{ id: 'unverified', note: 'Stopped before grounding — this draft was not checked against your record.' }];
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
        onStep: (name, ctx, data) => { if (turnSignal.aborted) return; turn.guard.feed(); setBusy({ kind: 'turn', label: stageLabel(name) }); foldBeat(pending, name, data); releaseOnAnswer(pending, name, ctx); },
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

  const ask = async (question, { onToken = null } = {}) => {
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

    const mode = webMode();

    // ── THE FRONT DOOR — physics, not a regex (docs/response-demand.md) ───────────────────────────
    // The engine warms the model and reads ONE plain discourse statement about this turn
    // (readDiscourse): the model says, in its own words, what the user is doing. Every door is then
    // a CURRENT measured off that single paragraph. This replaces the old answerSmalltalk regex
    // floor: a phatic turn — a greeting, a thanks, a goodbye, a how-are-you — is the PHATIC CURRENT
    // winning the route relaxation (phaticFromSpeech → metaRoute), a physical fact of the statement
    // rather than a matched spelling. It runs BEFORE the empty-record and grounding branches, so a
    // greeting answers with one warm line and NEVER reaches the web (the "why did it search for
    // 'how are you'" bug). The same statement is reused below to decide clarify, so the model speaks
    // once per turn. Fail-soft by construction: no model, an empty read, or any throw abstains, and
    // the turn proceeds exactly as a substantive one would.
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
      // The floor already settled a clear greeting — don't spend the discourse read on it.
      discourse = floorTalk ? '' : await raceGuard(keepAlive(readDiscourse(m0, { history: priorHistory, now: new Date(), scope: t.title || '', signal: turnSignal })(q)));
      if (floorTalk || phaticFromSpeech(discourse).phatic) {
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
      const m = await raceGuard(ensureModel());
      const history = t.messages
        .filter((x) => !x.pending && x.text)
        .slice(0, -2)
        .map((x) => ({ role: x.role, content: x.text, ...(x.unbound ? { unbound: true } : {}) }));
      // A long-form ask ("write me an essay …") gets a large budget so the answer can develop
      // past the pointed-answer cap; a normal ask keeps the per-task budget the pipeline picks.
      const longform = wantsLongform(effectiveQ);
      const args = {
        question: effectiveQ, docs, model: m,
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
        onStep: (name, ctx, data) => { if (turnSignal.aborted) return; turn.guard.feed(); setBusy({ kind: 'turn', label: stageLabel(name) }); foldBeat(pending, name, data); releaseOnAnswer(pending, name, ctx); },
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
      finishMessage(pending, result);
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

  const finishMessage = (msg, result) => {
    localWedges = 0;    // a completed answer means the engine is alive — clear the wedge streak
    finishTrail(msg);   // stop the research trail's clock; the surface collapses it to its summary
    // Prefer the marked projection — the answer with ungrounded FACTS underlined ([no source],
    // creative prose left clean) — so the disclosure rides in every mode. The chat answer
    // already carries its marks in `answer` (turn/stages.js bind), so `marked` is undefined
    // there and this falls through unchanged; the long-form modes supply `marked` explicitly.
    msg.text = result.marked || result.answer || msg.text;
    msg.route = result.route;
    msg.grounding = result.grounding;
    msg.flags = (result.flags || []).map((f) => ({ id: f.id, note: f.note || '' }));
    msg.unbound = !!result.unbound;
    msg.stopped = !!result.stopped;
    msg.grounded = (result.sources || []).length > 0 && !result.unbound;
    // The "Search the web" button belongs to confirm mode only: auto already fetched (and
    // suppresses via webFetched), and off means the user opted out of reaching the net — so
    // a proposal is offered as a button only when the user asked to be the one to approve it.
    msg.webProposal = (result.webProposal && !result.webFetched && webMode() === 'confirm')
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
  const entities = () => {
    const out = [];
    for (const src of topicSources()) {
      const doc = docFor(src);
      if (!doc?.log) continue;
      const g = projectGraph(doc.log);
      const rep = g.representative || ((x) => x);
      const seen = new Set();
      for (const [id, ent] of g.entities || []) {
        const r = rep(id);
        if (seen.has(r)) continue;
        seen.add(r);
        const label = doc.admission?.labelOf?.(r) || ent.label || r;
        let links = 0;
        for (const e of g.edges || []) if (rep(e.from) === r || rep(e.to) === r) links++;
        out.push({ key: `${doc.docId}#${r}`, entId: r, docId: doc.docId, sn: src.sn, label, mentions: ent.sightings || 0, links });
      }
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
    const mentions = [...idxs].sort((a, b) => a - b).slice(0, 40)
      .map((i) => ({ idx: i, text: String(doc.sentences?.[i] || '').trim() }))
      .filter((m2) => m2.text);
    return {
      label, docId, sn: src.sn, sourceTitle: src.title,
      defs: fs.defs.map((d) => ({ value: d.value, idx: d.idx })),
      relations: fs.relations.map((r) => ({
        srcId: r.src.id, srcLabel: r.src.label, tgtId: r.tgt.id, tgtLabel: r.tgt.label,
        via: r.via, op: r.op, idx: r.idx,
      })),
      figures: fs.figures.map((f) => ({ entId: f.id, label: f.label, count: f.count })),
      mentions,
    };
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

  // The honest tiered data for mountTieredGraph: the source at the radial centre
  // (tier 0), the focus + bonded figures (tier 1), the standing claims (tier 2).
  const tieredData = (docId, entId) => {
    const p = entityProfile(docId, entId);
    if (!p) return { nodes: [], edges: [] };
    const nodes = [{ id: 'src', tier: 0, label: p.sourceTitle, kind: 'source' }];
    const edges = [];
    const seen = new Set();
    const addEnt = (id, label) => {
      const nid = `e:${id}`;
      if (!seen.has(nid)) { seen.add(nid); nodes.push({ id: nid, tier: 1, label, kind: 'entity', ref: { docId, entId: id } }); }
      return nid;
    };
    const focus = addEnt(entId, p.label);
    edges.push({ a: 'src', b: focus, tier: 0, gl: '●', code: 'INS' });
    // Render the whole bonded neighbourhood figureSurface returns (already salience-bounded to
    // FOCUS_MAX_BONDS), not a 24-edge slice of it — the graph's own de-overlap and collision-culled
    // labels keep it readable, so every entity the focus actually bonds to gets a node.
    for (const r of p.relations) {
      const a = addEnt(r.srcId, r.srcLabel), b = addEnt(r.tgtId, r.tgtLabel);
      edges.push({ a, b, tier: 1, gl: r.op === 'SIG' ? '△' : '⋈', code: r.via || r.op });
    }
    p.defs.slice(0, 16).forEach((d, i) => {
      const id = `c:${i}`;
      nodes.push({ id, tier: 2, label: d.value, kind: 'claim' });
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
    const push = (id, tier, label, kind, ref) => { if (!seen.has(id)) { seen.add(id); nodes.push({ id, tier, label, kind, ref }); } };
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
        if (!m) merged.set(nl, m = { id: `e:${nl}`, label, mentions: 0, sns: new Set(), ref: { docId: doc.docId, entId: r } });
        m.mentions += ent.sightings || 0; m.sns.add(src.sn);
      }
    }
    // rank by salience and cap — the graph's own collision-culling keeps it legible, but a hard cap
    // keeps the toggle list and the layout from swelling on a large topic.
    const ranked = [...merged.values()].sort((a, b) => b.mentions - a.mentions).slice(0, 40);
    const shown = new Set(ranked.map((m) => norm(m.label)));
    const srcById = new Map(srcs.map((s) => [s.sn, s]));
    for (const m of ranked) push(m.id, 1, m.label, 'entity', m.ref);
    for (const m of ranked) {
      for (const sn of m.sns) {
        const sid = `src:${sn}`; const s = srcById.get(sn);
        push(sid, 0, s ? (s.title || s.reg || 'source') : 'source', 'source', null);
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
        if (!b) agg.set(key, b = { a: `e:${an}`, b: `e:${bn}`, w: 0, via: null });
        b.w += (e.weight != null ? e.weight : 1) || 0.001;
        const via = e.relType || e.via; if (!b.via && via) b.via = via;
      }
    }
    [...agg.values()].sort((x, y) => y.w - x.w).slice(0, 80).forEach((b) => {
      edges.push({ a: b.a, b: b.b, tier: 1, gl: '⋈', code: b.via || 'CON' });
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
        logIt('reflection', `Reflected at rest — ${state.reflectionsSeen} note${state.reflectionsSeen === 1 ? '' : 's'} so far`);
        persist(); emit('reflections');
      }
    } finally { deepRunning = false; }
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
        if (deepSettled) return;                            // quiesced until the record grows
        if (Date.now() - lastActivity < IDLE_MS) return;    // the user is active
        if (!topicSources().length) return;                 // nothing recorded yet
        deepTick(false);
      } catch { /* a bad pass never breaks the governor */ }
    }, 4000);
  };

  const reflections = () => state.reflections.slice();

  restore();

  return Object.freeze({
    state, subscribe,
    // topics — a nested tree within a workspace
    topicNew, setTopic, topicRename, topicDelete, topic,
    topicMove, topicToggleCollapse, topicTree, topicRows,
    // workspaces — the top-level containers (Matrix-shared workspaces slot in via `shared`)
    workspaceNew, setWorkspace, workspaceRename, workspaceDelete, activeWorkspace,
    // ingest
    ingestUrl, ingestText, ingestFile, search, recordHit, webSearchAdmit, fetchPage,
    sourceBySn, removeSource, topicSources,
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
    // web-search mode (off | confirm | auto)
    webMode, setWebMode,
    // model
    ensureModel, setBackend, backendPref, setSpeed, speedPref,
    // projections for the surface
    answerSegments, viewerParas, readerLink, entities, entityProfile, entityWiki, tieredData, topicTieredData,
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
  });
};
