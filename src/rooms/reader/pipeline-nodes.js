// EO: CON·SEG(Network,Field → Link, Making,Dissecting) — the pipeline surface's node kinds
// pipeline-nodes.js — the "anything to anything" wiring surface's vocabulary. A SOURCE node
// exposes one recorded document/clip as a graph input; PROCESS nodes read one of its native
// derivations (the transcript already heard, the waveform already analyzed, the referents
// already admitted) or transform a derivation into another (text → motifs); OUTPUT nodes lower
// whatever reaches them onto a sink — a new note in the Drive, a downloaded file, an arbitrary
// HTTP webhook, or a TouchDesigner instance reached over a local OSC bridge (pipeline-bridge.js
// docs, tools/touchdesigner-bridge). This module is PURE and DOM-free — every kind's `run` takes
// its upstream outputs + params + an injected `env` (the only door to the app, fetch, DOM, or a
// socket), so the whole vocabulary unit-tests in Node exactly as it runs in the browser.
//
// A kind's shape: { id, label, category: 'source'|'process'|'output', accepts, produces,
//   params: [{ key, label, type, default, options? }], run({ node, inputs, params, env }) }.
// `inputs` is every upstream edge's last output: [{ fromId, kind, data }]. New modalities are
// new kinds on this same registry — the graph engine (pipeline-engine.js) never changes.

const STOPWORDS = new Set('the a an and or but of to in on at is are was were it its that this with as by for from be been he she they you i we his her their my your your our not no so if then than which who whom what when where how this these those'.split(' '));

const tokenize = (text) => String(text || '')
  .toLowerCase()
  .replace(/[^a-z0-9'\s]/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

// detectMotifs(text) — recurring phrases (n-grams that repeat ≥ minCount times), read straight
// off the token stream. Grams starting or ending on a stopword are skipped (real phrase
// boundaries, not "the cat sat" truncated to "the cat"); a shorter gram wholly contained in an
// equally-frequent longer one is suppressed so "the ancient mariner" doesn't also list "ancient
// mariner" at the same count. Ranked by count×length so a long, frequent phrase leads.
export const detectMotifs = (text, opts = {}) => {
  const { minLen = 2, maxLen = 5, minCount = 3, topN = 20 } = opts;
  const words = tokenize(text);
  const counts = new Map();
  for (let n = minLen; n <= maxLen; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n);
      if (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram[gram.length - 1])) continue;
      if (gram.every((w) => STOPWORDS.has(w))) continue;
      const key = gram.join(' ');
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const rows = [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .map(([phrase, count]) => ({ phrase, count, length: phrase.split(' ').length }));
  rows.sort((a, b) => b.length - a.length || b.count - a.count);
  const kept = [];
  for (const r of rows) {
    if (kept.some((k) => k.count === r.count && k.phrase.includes(r.phrase))) continue;
    kept.push(r);
  }
  kept.sort((a, b) => (b.count * b.length) - (a.count * a.length) || b.count - a.count);
  return kept.slice(0, topN).map((r) => ({ phrase: r.phrase, count: r.count, weight: r.count * r.length }));
};

const firstOfKind = (inputs, kind) => {
  const hit = (inputs || []).find((i) => i && i.kind === kind);
  return hit ? hit.data : null;
};
const firstSourceSn = (inputs) => { const s = firstOfKind(inputs, 'source'); return s ? s.sn : null; };
const firstText = (inputs) => { const t = firstOfKind(inputs, 'text'); return t == null ? '' : String(t); };
const firstList = (inputs) => { const l = firstOfKind(inputs, 'list'); return Array.isArray(l) ? l : []; };

// renderPayload(inputs) → a plain-text rendering of every upstream output, for the note/download
// sinks — legible whatever modality actually arrived (list, series, text, a bare source ref).
const renderPayload = (inputs) => (inputs || []).map((i) => {
  if (i.kind === 'text') return String(i.data || '');
  if (i.kind === 'list') return (i.data || []).map((r) => `• ${r.label}${r.count != null ? ` (${r.count})` : ''}`).join('\n');
  if (i.kind === 'series') return `[series — ${(i.data || []).length} points]`;
  if (i.kind === 'source') return i.data ? `[source ${i.data.sn}: ${i.data.title}]` : '';
  return JSON.stringify(i.data);
}).join('\n\n');

const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const buildDownloadBlob = (inputs, format) => {
  if (format === 'csv') {
    const rows = (inputs || []).flatMap((i) => (Array.isArray(i.data) ? i.data : []));
    const header = 'label,weight,count\n';
    const body = rows.map((r) => `${csvEscape(r.label)},${r.weight ?? ''},${r.count ?? ''}`).join('\n');
    return { text: header + body, mime: 'text/csv' };
  }
  if (format === 'txt') return { text: renderPayload(inputs), mime: 'text/plain' };
  return { text: JSON.stringify((inputs || []).map((i) => ({ fromId: i.fromId, kind: i.kind, data: i.data })), null, 2), mime: 'application/json' };
};

// flattenForOsc(inputs) → primitive args (numbers/strings) an OSC message can actually carry —
// TouchDesigner's OSC In CHOP wants a flat float/string list per address, not nested JSON.
const flattenForOsc = (inputs) => {
  const args = [];
  for (const i of (inputs || [])) {
    if (i.kind === 'series') args.push(...(i.data || []).map(Number));
    else if (i.kind === 'list') for (const r of (i.data || [])) { args.push(String(r.label || '')); if (r.weight != null) args.push(Number(r.weight)); }
    else if (i.kind === 'text') args.push(String(i.data || '').slice(0, 512));
    else if (i.data != null) args.push(typeof i.data === 'object' ? JSON.stringify(i.data) : i.data);
  }
  return args;
};

export const NODE_KINDS = Object.freeze({
  source: {
    id: 'source', label: 'Source', category: 'source', accepts: null, produces: 'source', params: [],
    async run({ node, env }) {
      const src = env.app && env.app.sourceBySn ? env.app.sourceBySn(node.sourceSn) : null;
      if (!src) return { kind: 'source', data: null, meta: { error: 'no source chosen' } };
      return { kind: 'source', data: { sn: src.sn, title: src.title, mediaKind: src.kind }, meta: { title: src.title } };
    },
  },
  transcript: {
    id: 'transcript', label: 'Transcript / Text', category: 'process', accepts: 'source', produces: 'text', params: [],
    async run({ inputs, env }) {
      const sn = firstSourceSn(inputs);
      const src = sn && env.app.sourceBySn ? env.app.sourceBySn(sn) : null;
      const text = src ? String(src.text || '') : '';
      return { kind: 'text', data: text, meta: { chars: text.length } };
    },
  },
  waveform: {
    id: 'waveform', label: 'Waveform', category: 'process', accepts: 'source', produces: 'series', params: [],
    async run({ inputs, env }) {
      const sn = firstSourceSn(inputs);
      const src = sn && env.app.sourceBySn ? env.app.sourceBySn(sn) : null;
      const peaks = (src && src.audioMeta && Array.isArray(src.audioMeta.peaks)) ? src.audioMeta.peaks.map((p) => p.amp || 0) : [];
      return { kind: 'series', data: peaks, meta: { points: peaks.length } };
    },
  },
  characters: {
    id: 'characters', label: 'Characters', category: 'process', accepts: 'source', produces: 'list', params: [],
    async run({ inputs, env }) {
      const sn = firstSourceSn(inputs);
      const rows = (sn && env.app.sourceEntities) ? (env.app.sourceEntities(sn) || []) : [];
      const data = rows.map((r) => ({ label: r.label, weight: (r.mentions || 0) + (r.links || 0), count: r.mentions || 0, type: r.type || '' }));
      return { kind: 'list', data, meta: { count: data.length } };
    },
  },
  motifs: {
    id: 'motifs', label: 'Motifs', category: 'process', accepts: 'text', produces: 'list',
    params: [
      { key: 'minCount', label: 'Min repeats', type: 'number', default: 3 },
      { key: 'minLen', label: 'Min words', type: 'number', default: 2 },
      { key: 'maxLen', label: 'Max words', type: 'number', default: 5 },
      { key: 'topN', label: 'Top N', type: 'number', default: 20 },
    ],
    async run({ inputs, params }) {
      const rows = detectMotifs(firstText(inputs), params);
      const data = rows.map((r) => ({ label: r.phrase, weight: r.weight, count: r.count }));
      return { kind: 'list', data, meta: { count: data.length } };
    },
  },
  'filter-top': {
    id: 'filter-top', label: 'Top N', category: 'process', accepts: 'list', produces: 'list',
    params: [{ key: 'n', label: 'Keep top', type: 'number', default: 10 }],
    async run({ inputs, params }) {
      const n = Math.max(1, Number(params.n) || 10);
      const data = [...firstList(inputs)].sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, n);
      return { kind: 'list', data, meta: { count: data.length } };
    },
  },
  'note-out': {
    id: 'note-out', label: 'New note', category: 'output', accepts: 'any', produces: null,
    params: [{ key: 'title', label: 'Title', type: 'text', default: 'Pipeline output' }],
    async run({ inputs, params, env }) {
      const body = renderPayload(inputs) || '(no upstream data reached this node)';
      if (!env.app || !env.app.ingestText) throw new Error('note: ingestText unavailable');
      const src = env.app.ingestText(body, params.title || 'Pipeline output');
      return { kind: 'source', data: { sn: src ? src.sn : null }, meta: { title: params.title } };
    },
  },
  'download-out': {
    id: 'download-out', label: 'Download file', category: 'output', accepts: 'any', produces: null,
    params: [
      { key: 'filename', label: 'File name', type: 'text', default: 'pipeline-output' },
      { key: 'format', label: 'Format', type: 'select', options: ['json', 'csv', 'txt'], default: 'json' },
    ],
    async run({ inputs, params, env }) {
      const { text, mime } = buildDownloadBlob(inputs, params.format);
      if (env.download) env.download(text, mime, `${params.filename || 'pipeline-output'}.${params.format || 'json'}`);
      return { kind: 'any', data: null, meta: { bytes: text.length } };
    },
  },
  'webhook-out': {
    id: 'webhook-out', label: 'Webhook (HTTP)', category: 'output', accepts: 'any', produces: null,
    params: [
      { key: 'url', label: 'URL', type: 'text', default: '' },
      { key: 'method', label: 'Method', type: 'select', options: ['POST', 'PUT'], default: 'POST' },
    ],
    async run({ inputs, params, env }) {
      if (!params.url) throw new Error('webhook: no URL configured');
      const fetchImpl = env.fetch || (typeof fetch !== 'undefined' ? fetch : null);
      if (!fetchImpl) throw new Error('webhook: fetch unavailable in this environment');
      const payload = { at: new Date().toISOString(), data: (inputs || []).map(({ fromId, kind, data }) => ({ fromId, kind, data })) };
      const res = await fetchImpl(params.url, { method: params.method || 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      return { kind: 'any', data: null, meta: { status: res && res.status } };
    },
  },
  'touchdesigner-out': {
    id: 'touchdesigner-out', label: 'TouchDesigner (OSC)', category: 'output', accepts: 'any', produces: null,
    params: [
      { key: 'bridgeUrl', label: 'Bridge WS URL', type: 'text', default: 'ws://127.0.0.1:8765' },
      { key: 'address', label: 'OSC address', type: 'text', default: '/eo/pipeline' },
    ],
    async run({ inputs, params, env }) {
      const args = flattenForOsc(inputs);
      if (!env.sendToBridge) throw new Error('TouchDesigner: no bridge transport in this environment (see tools/touchdesigner-bridge)');
      await env.sendToBridge(params.bridgeUrl || 'ws://127.0.0.1:8765', { address: params.address || '/eo/pipeline', args });
      return { kind: 'any', data: null, meta: { args: args.length } };
    },
  },
});

export const kindOf = (id) => NODE_KINDS[id] || null;
export const nodeKindList = () => Object.values(NODE_KINDS);
// merge a kind's declared defaults with a node's own overrides — a node only ever stores the
// params it has actually changed, so an older saved graph still picks up a newly added default.
export const paramsFor = (node, kind) => {
  const out = {};
  for (const p of (kind ? kind.params : [])) out[p.key] = p.default;
  return { ...out, ...(node && node.params ? node.params : {}) };
};
