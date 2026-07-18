// EO: CON·SIG(Network,Field → Link, Binding,Tending) — the pipeline surface's graph + runtime
// pipeline-engine.js — CRUD over saved node-graphs (pipeline-nodes.js supplies the vocabulary)
// plus the topological executor and the browser transports (fetch / file-download / a
// TouchDesigner bridge socket) a kind's `run` reaches through its injected `env`. Persistence is
// a small localStorage blob — a graph is a handful of {id,kind,x,y,params} nodes and {from,to}
// edges, nothing like the size of a recorded source, so it does not ride the IndexedDB session
// snapshot (rooms/reader/app/persistence.js) at all; this stays a pure SURFACE-layer feature
// reached only through window.EO.app's already-public membrane (docFor/sourceEntities/
// sourceBySn/ingestText), never through engine internals.
import { NODE_KINDS, kindOf, paramsFor } from './pipeline-nodes.js';

const STORAGE_KEY = 'eo_pipeline_surfaces_v1';
const nowIso = () => new Date().toISOString();
const uid = (p) => `${p}${Math.random().toString(36).slice(2, 9)}`;

const loadAll = (storage) => {
  try {
    const raw = storage ? storage.getItem(STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};
const saveAll = (storage, graphs) => {
  try { if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(graphs)); } catch { /* storage full/unavailable — in-memory only */ }
};

// runGraph(graph, env) → { statusById, order, cyclic }. Kahn's-algorithm topological run: a node
// starts once every edge feeding it has resolved, so two independent branches (say, Characters and
// Motifs off the same source) run in the order they're declared but neither blocks on the other's
// unrelated ancestry. A node whose kind throws is recorded failed and yields a null output —
// downstream nodes still run (an output node fed by two upstream nodes shows what DID arrive
// rather than aborting the whole graph over one bad node. `cyclic` lists nodes a cycle left
// unreached (their in-edges never all resolved) so the surface can flag exactly where the loop is.
export async function runGraph(graph, env = {}) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map(nodes.map((n) => [n.id, edges.filter((e) => e.to === n.id)]));
  const outgoing = new Map(nodes.map((n) => [n.id, edges.filter((e) => e.from === n.id)]));
  const outputs = new Map();
  const statusById = {};
  const indegree = new Map(nodes.map((n) => [n.id, incoming.get(n.id).length]));
  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const done = new Set();
  const order = [];

  while (queue.length) {
    const id = queue.shift();
    if (done.has(id)) continue;
    const node = byId.get(id);
    const kind = kindOf(node.kind);
    const inputs = incoming.get(id).map((e) => {
      const up = outputs.get(e.from);
      return up ? { fromId: e.from, kind: up.kind, data: up.data } : null;
    }).filter(Boolean);
    try {
      if (!kind) throw new Error(`unknown node kind "${node.kind}"`);
      const params = paramsFor(node, kind);
      const out = await kind.run({ node, inputs, params, env });
      outputs.set(id, out || { kind: 'any', data: null });
      statusById[id] = { ok: true, meta: (out && out.meta) || {}, at: nowIso() };
    } catch (e) {
      outputs.set(id, { kind: 'any', data: null });
      statusById[id] = { ok: false, error: String((e && e.message) || e), at: nowIso() };
    }
    done.add(id);
    order.push(id);
    for (const e of outgoing.get(id)) {
      indegree.set(e.to, indegree.get(e.to) - 1);
      if (indegree.get(e.to) === 0 && !done.has(e.to)) queue.push(e.to);
    }
  }
  const cyclic = nodes.filter((n) => !done.has(n.id)).map((n) => n.id);
  for (const id of cyclic) statusById[id] = { ok: false, error: 'unreached — this node sits in (or downstream of) a cycle', at: nowIso() };
  return { statusById, order, cyclic };
}

// ── browser transports — the only place pipeline-nodes.js's `env` reaches outside pure data ──

const download = (text, mime, filename) => {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
};

// A tiny pool of open bridge sockets, keyed by URL, so a graph with several TouchDesigner nodes
// (or repeated runs) reuses one live connection instead of reopening per send. See
// tools/touchdesigner-bridge for the companion process this connects to — it forwards each
// {address, args} message on to TouchDesigner as a real OSC/UDP packet.
const createBridgePool = () => {
  const sockets = new Map();
  const openSocket = (url) => new Promise((resolve, reject) => {
    if (typeof WebSocket === 'undefined') { reject(new Error('WebSocket unavailable in this environment')); return; }
    const existing = sockets.get(url);
    if (existing && existing.readyState === 1) { resolve(existing); return; }
    const ws = new WebSocket(url);
    const onOpen = () => { sockets.set(url, ws); cleanup(); resolve(ws); };
    const onError = () => { cleanup(); reject(new Error(`could not reach the TouchDesigner bridge at ${url}`)); };
    const cleanup = () => { ws.removeEventListener('open', onOpen); ws.removeEventListener('error', onError); };
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onError);
    ws.addEventListener('close', () => { if (sockets.get(url) === ws) sockets.delete(url); });
  });
  return {
    async send(url, message) {
      const ws = await openSocket(url);
      ws.send(JSON.stringify(message));
    },
    closeAll() { for (const ws of sockets.values()) { try { ws.close(); } catch { /* already gone */ } } sockets.clear(); },
  };
};

// createPipelineEngine({ app }) — `app` is the SAME public object the rest of the surface holds
// (window.EO.app): sourceBySn/docFor/sourceEntities/workspaceSources/topicSources/ingestText.
// Nothing here imports engine internals; it is a surface module exactly like tiered-graph.js.
export function createPipelineEngine({ app, storage = (typeof localStorage !== 'undefined' ? localStorage : null) } = {}) {
  let graphs = loadAll(storage);
  const bridgePool = createBridgePool();
  const subs = new Set();
  const emit = () => { for (const fn of subs) { try { fn(graphs); } catch { /* surface's problem */ } } };
  const persist = () => saveAll(storage, graphs);
  const byId = (id) => graphs.find((g) => g.id === id) || null;

  const env = {
    app,
    download,
    fetch: (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null),
    sendToBridge: (url, message) => bridgePool.send(url, message),
  };

  const list = () => graphs.map((g) => ({ id: g.id, name: g.name, updatedAt: g.updatedAt, nodeCount: g.nodes.length }));
  const get = (id) => byId(id);

  const create = (name = 'Untitled surface') => {
    const g = { id: uid('pg'), name, nodes: [], edges: [], createdAt: nowIso(), updatedAt: nowIso() };
    graphs.push(g); persist(); emit();
    return g;
  };
  const rename = (id, name) => {
    const g = byId(id); if (!g) return null;
    g.name = String(name || g.name).trim() || g.name; g.updatedAt = nowIso();
    persist(); emit(); return g;
  };
  const remove = (id) => { graphs = graphs.filter((g) => g.id !== id); persist(); emit(); };

  const addNode = (graphId, kindId, { x = 40, y = 40, sourceSn = null } = {}) => {
    const g = byId(graphId); if (!g) return null;
    if (!NODE_KINDS[kindId]) throw new Error(`unknown node kind "${kindId}"`);
    const node = { id: uid('n'), kind: kindId, x, y, params: {}, sourceSn };
    g.nodes.push(node); g.updatedAt = nowIso();
    persist(); emit(); return node;
  };
  const removeNode = (graphId, nodeId) => {
    const g = byId(graphId); if (!g) return;
    g.nodes = g.nodes.filter((n) => n.id !== nodeId);
    g.edges = g.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
    g.updatedAt = nowIso(); persist(); emit();
  };
  const moveNode = (graphId, nodeId, x, y) => {
    const g = byId(graphId); if (!g) return;
    const n = g.nodes.find((n) => n.id === nodeId); if (!n) return;
    n.x = x; n.y = y; g.updatedAt = nowIso(); persist(); emit();
  };
  // setParams(graphId, nodeIds, patch) — applies the SAME patch to every node listed: "set
  // parameters on a whole series of nodes at once" (e.g. drag-select five Motif nodes, drop
  // minCount to 2 everywhere in one edit instead of one node at a time).
  const setParams = (graphId, nodeIds, patch) => {
    const g = byId(graphId); if (!g) return;
    const ids = new Set(Array.isArray(nodeIds) ? nodeIds : [nodeIds]);
    for (const n of g.nodes) if (ids.has(n.id)) n.params = { ...n.params, ...patch };
    g.updatedAt = nowIso(); persist(); emit();
  };
  const setSourceSn = (graphId, nodeId, sn) => {
    const g = byId(graphId); if (!g) return;
    const n = g.nodes.find((n) => n.id === nodeId); if (!n) return;
    n.sourceSn = sn; g.updatedAt = nowIso(); persist(); emit();
  };

  const connect = (graphId, fromId, toId) => {
    const g = byId(graphId); if (!g || fromId === toId) return null;
    if (g.edges.some((e) => e.from === fromId && e.to === toId)) return null;   // no duplicate wires
    const edge = { id: uid('e'), from: fromId, to: toId };
    g.edges.push(edge); g.updatedAt = nowIso(); persist(); emit();
    return edge;
  };
  const disconnect = (graphId, edgeId) => {
    const g = byId(graphId); if (!g) return;
    g.edges = g.edges.filter((e) => e.id !== edgeId);
    g.updatedAt = nowIso(); persist(); emit();
  };

  const run = async (graphId) => {
    const g = byId(graphId); if (!g) return { statusById: {}, order: [], cyclic: [] };
    return runGraph(g, env);
  };

  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

  return Object.freeze({
    app,   // the public window.EO.app membrane — the surface's source picker reads workspaceSources() off this
    list, get, create, rename, remove,
    addNode, removeNode, moveNode, setParams, setSourceSn,
    connect, disconnect, run, subscribe,
    closeBridges: () => bridgePool.closeAll(),
  });
}
