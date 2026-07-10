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
import { createModel } from '../../model/interface.js';
import { createHashEmbedder, createMiniLMEmbedder } from '../../model/index.js';
import { runTurn } from '../../turn/index.js';
import { createWebClient, htmlToText, wikiExtract } from '../../organs/ingest/webfetch.js';
import { admitWebSource, webContentHash } from '../../organs/ingest/websource.js';
import { GUTENBERG_FULLTEXT } from '../../organs/ingest/gutenberg.js';
import { WIKIMEDIA_FULLTEXT } from '../../organs/ingest/wikimedia.js';
import { readIngest } from '../../organs/ingest/read.js';
import { answerSmalltalk } from '../../enactor/answer/index.js';
import { figureSurface } from '../../perceiver/index.js';
import { discourseDag, assertedDag } from '../../surfer/dag/index.js';

// ── the proxy chain ───────────────────────────────────────────────────────────
// The primary is the n8n feed proxy (webfetch's default); when it fails the two
// public CORS proxies are tried in order, same target. The chain rides UNDER
// createWebClient: the client builds its primary-proxied URL, this fetchImpl
// recovers the target and walks the chain — so search kinds, wiki extracts and
// page fetches all inherit the fallback without knowing it exists.
const PROXY_FORMS = [
  (u) => `https://n8n.intelechia.com/webhook/feed?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

const targetOf = (proxiedUrl) => {
  try { return new URL(proxiedUrl).searchParams.get('url') || proxiedUrl; }
  catch { return proxiedUrl; }
};

const fetchTimed = (url, ms = 25000) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { signal: c.signal }).finally(() => clearTimeout(t));
};

const chainFetch = async (proxiedUrl) => {
  const target = targetOf(proxiedUrl);
  let lastErr = null;
  for (const form of PROXY_FORMS) {
    try {
      const res = await fetchTimed(form(target));
      if (!res.ok && res.status >= 500) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      if (!res.ok && res.status === 429) { lastErr = new Error('HTTP 429'); continue; }
      return res;
    } catch (e) { lastErr = e; }
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
const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const shaShort = (h) => String(h || '').replace(/^[^:]*:/, '').slice(0, 12);
const bytesOf = (text) => { try { return new TextEncoder().encode(text).length; } catch { return String(text).length; } };
const esc = (s) => String(s ?? '');

// ── the app ──────────────────────────────────────────────────────────────────
export const createReaderApp = ({ audit } = {}) => {
  const state = {
    sources: [],           // registry entries (serializable minus _doc)
    topics: [],            // { id, title, created, sourceSns:[], messages:[], memo:'' }
    activeTopicId: null,
    log: [],               // activity ledger: { id, t, kind, text, effect }
    model: { backend: null, state: 'cold', progress: 0, note: '' },
    busy: null,            // { kind, label } while a long op runs
    ready: false,          // restore finished
  };
  let sn = 0, tn = 0, ln = 0, mn = 0;
  const client = createWebClient({ fetchImpl: chainFetch });

  // change fan-out — the dc surface subscribes once and re-renders on any emit
  const subs = new Set();
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  const emit = (kind, data = null) => { for (const fn of subs) { try { fn(kind, data); } catch { /* surface's problem */ } } };

  const logIt = (kind, text, effect = '') => {
    state.log.push({ id: `L${++ln}`, t: nowIso(), kind, text, effect });
    if (state.log.length > 400) state.log.shift();
    emit('log');
  };

  // ── persistence ────────────────────────────────────────────────────────────
  const serialize = () => ({
    v: 1, sn, tn, ln, mn,
    activeTopicId: state.activeTopicId,
    log: state.log.slice(-120),
    topics: state.topics,
    sources: state.sources.map(({ _doc, ...rest }) => rest),
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
        state.sources = (snap.sources || []).map((s) => ({ ...s, _doc: null }));
        state.topics = snap.topics || [];
        state.activeTopicId = snap.activeTopicId;
        state.log = snap.log || [];
      }
    } catch { /* fresh session */ }
    if (!state.topics.length) topicNew('New topic', { silent: true });
    if (!state.topics.find((t) => t.id === state.activeTopicId)) state.activeTopicId = state.topics[0].id;
    state.ready = true;
    emit('ready');
    // The model prewarms the moment the session is up (4.1's mount posture) so the
    // first question never pays the download stall. Browser only — never in tests —
    // and the ladder inside ensureModel already falls back webllm → wllama → echo.
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      setTimeout(() => { ensureModel().catch(() => { /* logged by the ladder */ }); }, 600);
    }
  };

  // ── topics ─────────────────────────────────────────────────────────────────
  const topicNew = (title = 'New topic', { silent = false } = {}) => {
    const t = { id: `t${++tn}`, title, created: nowIso(), sourceSns: [], messages: [], memo: '' };
    state.topics.push(t);
    state.activeTopicId = t.id;
    if (!silent) { logIt('open', `New topic — ${title}`); persist(); emit('topics'); }
    return t;
  };
  const topic = () => state.topics.find((t) => t.id === state.activeTopicId) || state.topics[0];
  const setTopic = (id) => { if (state.topics.find((t) => t.id === id)) { state.activeTopicId = id; persist(); emit('topics'); } };
  const topicRename = (id, title) => { const t = state.topics.find((x) => x.id === id); if (t && title) { t.title = title; persist(); emit('topics'); } };
  const topicDelete = (id) => {
    if (state.topics.length <= 1) return;
    state.topics = state.topics.filter((t) => t.id !== id);
    if (state.activeTopicId === id) state.activeTopicId = state.topics[0].id;
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
    logIt('record', `Recorded ${src.domain} — ${src.title}`, src.reg);
    logIt('hash', `Fixity sha ${shaShort(src.sha)} · ${src.bytes.toLocaleString()} bytes`, src.reg);
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
  const setBusy = (busy) => { state.busy = busy; emit('busy'); };

  const ingestUrl = async (url) => {
    const norm = /^https?:\/\//.test(url) ? url : `https://${url}`;
    setBusy({ kind: 'fetch', label: `Reading ${domainOf(norm)}…` });
    try {
      const raw = (await client.fetchUrl(norm)).text;
      const title = (/<title[^>]*>([^<]*)</i.exec(raw)?.[1] || '').trim() || norm;
      const text = htmlToText(raw);
      const { doc, record } = admitWebSource({ url: norm, title, text, fetched_at: nowIso(), engine: 'feed-proxy' });
      return addSource({ title: record.title || title, url: norm, text: doc.text, kind: 'web', record, doc });
    } finally { setBusy(null); }
  };

  const search = async (query, { kind = 'auto', k = 8 } = {}) => {
    setBusy({ kind: 'search', label: `Searching the web — ${query}` });
    try {
      const items = await client.search(query, { kind, k });
      logIt('search', `Web search "${query}"`, `${items.length} results`);
      return items;
    } finally { setBusy(null); }
  };

  const recordHit = async (item, query = null) => {
    setBusy({ kind: 'fetch', label: `Reading ${item.title || item.url}…` });
    try {
      const full = FULL_TEXT[item.source] || FULL_TEXT[item.kind];
      let text = '';
      try { text = full ? await full(client, item) : htmlToText((await client.fetchUrl(item.url)).text); } catch { /* fall through */ }
      if (!text) text = item.text || item.title || '';
      const { doc, record } = admitWebSource({
        url: item.url, title: item.title, text,
        retrieval_query: query, engine: `web:${item.source || item.kind || 'search'}`, fetched_at: nowIso(),
      });
      return addSource({ title: item.title, url: item.url, text: doc.text, kind: 'web', record, doc });
    } finally { setBusy(null); }
  };

  const ingestText = (text, title = 'Pasted text') => {
    const doc = parseText(String(text), { docId: `doc-${shaShort(webContentHash(text))}` });
    return addSource({ title, text: String(text), kind: 'text', doc });
  };

  const ingestFile = async (file) => {
    setBusy({ kind: 'file', label: `Reading ${file.name}…` });
    try {
      const { importAnyFile } = await import('./import-file.js');
      const got = await importAnyFile(file, { onProgress: (msg) => setBusy({ kind: 'file', label: String(msg) }) });
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
    } finally { setBusy(null); }
  };

  // ── model ──────────────────────────────────────────────────────────────────
  let backendOverride = null;
  const backendPref = () => {
    if (backendOverride) return backendOverride;
    try { const v = localStorage.getItem('eo_backend'); if (v) return v; } catch { /* default */ }
    return (typeof navigator !== 'undefined' && navigator.gpu) ? 'webllm' : 'wllama';
  };
  let model = null, modelLoading = null, modelGen = 0;
  const setBackend = (name) => {
    backendOverride = name;
    try { localStorage.setItem('eo_backend', name); } catch { /* session-only */ }
    model = null; modelLoading = null; modelGen++;   // orphan any in-flight load
    state.model = { backend: name, state: 'cold', progress: 0, note: '' };
    emit('model');
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
        const m = createModel(backend);
        await m.load((p) => {
          const frac = typeof p === 'number' ? p : (p?.progress ?? 0);
          const note = typeof p === 'object' ? (p?.text || p?.note || '') : '';
          state.model = { backend, state: 'loading', progress: Math.round(frac * 100) / 100, note };
          emit('model');
        });
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
          if (gen !== modelGen) return m;   // superseded by a newer setBackend — don't commit
          state.model = { backend, state: 'ready', progress: 1, note: backend === name ? '' : `fell back from ${name}` };
          emit('model');
          model = m;
          return m;
        } catch (e) {
          lastErr = e;
          if (gen !== modelGen) throw e;    // superseded — stop the orphaned ladder quietly
          const why = backend === 'webllm'
            ? 'needs WebGPU (chrome://flags or Chrome/Edge); falling back to the CPU model'
            : String(e?.message || e).slice(0, 120);
          logIt('skip', `Model ${backend} failed to load — ${why}`);
        }
      }
      if (gen === modelGen) {
        state.model = { backend: name, state: 'error', progress: 0,
          note: `No local model could load — ${String(lastErr?.message || lastErr).slice(0, 140)}` };
        emit('model');
      }
      throw lastErr;
    })();
    try { return await modelLoading; } finally { modelLoading = null; }
  };

  // embedders — hash is instant; MiniLM warms in the background on first ask
  const hashEmb = createHashEmbedder();
  let minilm = null, minilmWarming = false;
  const warmMinilm = () => {
    if (minilm?.isWarm?.() || minilmWarming) return;
    minilmWarming = true;
    try {
      minilm = createMiniLMEmbedder();
      minilm.warm().then(() => emit('model')).catch(() => { minilm = null; }).finally(() => { minilmWarming = false; });
    } catch { minilmWarming = false; }
  };

  // ── chat ───────────────────────────────────────────────────────────────────
  let abort = null;
  const stop = () => { try { abort?.abort(); } catch { /* already done */ } };

  const ask = async (question, { onToken = null } = {}) => {
    const t = topic();
    const q = String(question || '').trim();
    if (!t || !q) return null;
    const userMsg = { id: `m${++mn}`, role: 'user', text: q, at: nowIso() };
    t.messages.push(userMsg);
    emit('messages');

    const docs = topicDocs();
    const pending = { id: `m${++mn}`, role: 'assistant', text: '', at: nowIso(), pending: true, cites: [], grounded: false };
    t.messages.push(pending);
    emit('messages');

    if (!docs.length) {
      // An empty record is not a dead end. Greetings get the mechanical smalltalk
      // answer; anything substantive becomes a one-click web-search proposal, so
      // the first real question can go fetch its own sources.
      const small = answerSmalltalk(q);
      if (small) {
        pending.text = small.text.replace(/the document/g, 'what you record');
        pending.route = 'smalltalk';
      } else {
        pending.text = 'Nothing is on the record yet, so I can\'t ground an answer to that. I can search the web and record what comes back — or read any URL, file, or pasted text you drop in the bar above.';
        pending.route = 'empty';
        pending.webProposal = { query: q, rationale: 'no sources recorded yet' };
      }
      pending.pending = false;
      persist(); emit('messages');
      return pending;
    }

    warmMinilm();
    try {
      const m = await ensureModel();
      abort = new AbortController();
      const history = t.messages
        .filter((x) => !x.pending && x.text)
        .slice(0, -2)
        .map((x) => ({ role: x.role, content: x.text, ...(x.unbound ? { unbound: true } : {}) }));
      const result = await runTurn({
        question: q, docs, model: m,
        embedder: hashEmb,
        geometricEmbedder: (minilm?.isWarm?.() ? minilm : null) || undefined,
        auditLog: audit, history,
        stream: true,
        onToken: (tok) => { pending.text += String(tok); if (onToken) onToken(tok); emit('stream'); },
        signal: abort.signal,
        onStep: (name) => { setBusy({ kind: 'turn', label: stageLabel(name) }); },
      });
      finishMessage(pending, result);
    } catch (e) {
      pending.text = pending.text || (state.model.state === 'error'
        ? `${state.model.note}. A WebGPU browser (Chrome/Edge) runs Llama 3.2; anything else runs SmolLM2 on CPU — or pick Claude (hosted API, needs a key) from the model chip in the header, then retry.`
        : `Something failed mid-turn: ${String(e?.message || e)}`);
      pending.pending = false; pending.route = 'error';
    } finally {
      abort = null; setBusy(null);
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
    msg.text = result.answer || msg.text;
    msg.route = result.route;
    msg.grounding = result.grounding;
    msg.flags = (result.flags || []).map((f) => ({ id: f.id, note: f.note || '' }));
    msg.unbound = !!result.unbound;
    msg.stopped = !!result.stopped;
    msg.grounded = (result.sources || []).length > 0 && !result.unbound;
    msg.webProposal = result.webProposal ? { query: result.webProposal.query, rationale: result.webProposal.rationale || '' } : null;
    msg.bound = (result.bound || []).map((b) => ({ claim: b.claim, citation: b.citation || null, cited: b.cited || b.text || null }));
    msg.verdicts = (result.verdicts || []).map((v) => ({
      verdict: v.verdict || v.status || '', claim: v.claim || v.text || [v.src, v.via, v.tgt].filter(Boolean).join(' '),
    }));
    msg.cites = Object.entries(result.citeOrigins || {}).map(([idx, docId]) => {
      const src = state.sources.find((s) => s.docId === docId);
      return { idx: Number(idx), docId, sn: src?.sn || null, reg: src?.reg || null, title: src?.title || docId, text: (result.citeTexts || {})[idx] || '' };
    });
    msg.reflection = result.reflection || null;
    for (const f of msg.flags) {
      if (/contradic/i.test(f.id)) logIt('conflict', `Contradiction flagged — ${f.note || f.id}`);
    }
    logIt('claim', `Answered "${msg.text.slice(0, 60)}${msg.text.length > 60 ? '…' : ''}"`,
      `${msg.cites.length} citation${msg.cites.length === 1 ? '' : 's'}`);
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
    // one pass, longest-label-first alternation; word-bounded, case-sensitive first letter
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b(${lex.map((e) => escRe(e.label)).join('|')})\\b`, 'g');
    let last = 0, mArr;
    while ((mArr = re.exec(rest)) !== null) {
      if (mArr.index > last) segs.push({ t: 'text', s: rest.slice(last, mArr.index) });
      const hit = lex.find((e) => e.label === mArr[1]);
      segs.push({ t: 'ent', s: mArr[1], docId: hit?.docId, entId: hit?.entId });
      last = mArr.index + mArr[1].length;
    }
    if (last < rest.length) segs.push({ t: 'text', s: rest.slice(last) });
    return segs;
  };

  // Answer text → paragraphs of segments; [sN] markers become cite chips.
  const answerSegments = (msg, { entities = true } = {}) => {
    const docs = topicDocs();
    const lex = entities ? entityLexicon(docs) : [];
    const citeOf = new Map((msg.cites || []).map((c) => [c.idx, c]));
    const paras = [];
    for (const para of String(msg.text || '').split(/\n{2,}|\n(?=[-•*])/)) {
      if (!para.trim()) continue;
      const segs = [];
      let last = 0;
      const re = /\[s(\d+)(?:,\s*s?\d+)*\]/g;
      let m2;
      while ((m2 = re.exec(para)) !== null) {
        if (m2.index > last) segs.push(...linkifySegs(para.slice(last, m2.index), lex));
        for (const idxStr of m2[0].match(/\d+/g) || []) {
          const c = citeOf.get(Number(idxStr));
          if (c) segs.push({ t: 'cite', idx: c.idx, sn: c.sn, reg: c.reg, title: c.title, quote: c.text });
        }
        last = m2.index + m2[0].length;
      }
      if (last < para.length) segs.push(...linkifySegs(para.slice(last), lex));
      if (segs.length) paras.push({ segs });
    }
    return paras;
  };

  // The document viewer — full text as paragraphs; cited sentences marked.
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
    for (const r of p.relations.slice(0, 24)) {
      const a = addEnt(r.srcId, r.srcLabel), b = addEnt(r.tgtId, r.tgtLabel);
      edges.push({ a, b, tier: 1, gl: r.op === 'SIG' ? '△' : '⋈', code: r.via || r.op });
    }
    p.defs.slice(0, 8).forEach((d, i) => {
      const id = `c:${i}`;
      nodes.push({ id, tier: 2, label: d.value, kind: 'claim' });
      edges.push({ a: focus, b: id, tier: 2, gl: '⊢', code: 'DEF' });
    });
    return { nodes, edges };
  };

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

  restore();

  return Object.freeze({
    state, subscribe,
    // topics
    topicNew, setTopic, topicRename, topicDelete, topic,
    // ingest
    ingestUrl, ingestText, ingestFile, search, recordHit,
    sourceBySn, removeSource, topicSources,
    // chat
    ask, stop,
    // model
    ensureModel, setBackend, backendPref,
    // projections for the surface
    answerSegments, viewerParas, entities, entityProfile, tieredData,
    findings, provenance, dagFor, setMemo, eotFor,
    // the raw doc, for anything the surface wants to inspect
    docFor: (snId) => docFor(sourceBySn(snId)),
  });
};
