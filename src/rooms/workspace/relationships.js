// EO: SYN·CON·INS(Field,Network → Network,Link,Field, Composing,Tracing,Making) — typed-edge db from log
// workspace/relationships.js — typed-edge databases, folded from an event log.
//
// Two (or more) small databases — tables of records — linked by TYPED EDGES. A
// connection here is not a foreign key: it is an edge with its own type and its
// own fields (e.g. "operated by · Since 1987 · Regulated concession"), folded
// from the same append-only log as the records themselves. Lose the fold and it
// rebuilds by replay.
//
// The log is the source of truth; `foldGraph` is a pure projection of it:
//   INS table      → a database (a table of records)
//   INS node       → a record in a table;   DEF node  sets one of its fields
//   INS edge-type  → a connection type with a field schema, a from/to table, a color
//   INS edge       → a typed connection between two records;  DEF edge sets a field
//   SEG edge-del   → retract a connection
//
// Everything here is pure and DOM-free: fold an event array, get a graph; build
// new events with the helpers; nothing mutates in place.

// Fold the event log into a graph: tables, records (nodes), edge-types, and the
// typed edges between records. Unknown ops/kinds are ignored, so a mixed or
// future log never throws.
export const foldGraph = (events) => {
  const tables = {}, tableList = [], nodes = {}, nodeList = [];
  const etypes = {}, etypeList = [], edges = [], edgeMap = {};
  for (const e of events || []) {
    if (!e || typeof e !== 'object') continue;
    if (e.op === 'INS' && e.kind === 'table') {
      if (!tables[e.table]) { const t = { id: e.table, name: e.name || e.table }; tables[e.table] = t; tableList.push(t); }
    } else if (e.op === 'INS' && e.kind === 'node') {
      if (!nodes[e.node]) { const n = { id: e.node, table: e.table, v: {} }; nodes[e.node] = n; nodeList.push(n); }
    } else if (e.op === 'DEF' && e.kind === 'node') {
      const n = nodes[e.node]; if (n) n.v[e.field] = e.value;
    } else if (e.op === 'INS' && e.kind === 'edge-type') {
      if (!etypes[e.etype]) { const t = { id: e.etype, name: e.name || e.etype, from: e.from, to: e.to, color: e.color || '#5b34d6', fields: e.fields || [] }; etypes[e.etype] = t; etypeList.push(t); }
    } else if (e.op === 'INS' && e.kind === 'edge') {
      if (!edgeMap[e.edge]) { const g = { id: e.edge, etype: e.etype, from: e.from, to: e.to, v: {} }; edgeMap[e.edge] = g; edges.push(g); }
    } else if (e.op === 'DEF' && e.kind === 'edge') {
      const g = edgeMap[e.edge]; if (g) g.v[e.field] = e.value;
    } else if (e.op === 'SEG' && e.kind === 'edge-del') {
      const i = edges.findIndex((x) => x.id === e.edge); if (i >= 0) { edges.splice(i, 1); delete edgeMap[e.edge]; }
    }
  }
  return { tables, tableList, nodes, nodeList, etypes, etypeList, edges };
};

// A record's display label: its name, then city, then any first string field,
// falling back to the raw id. Keeps the graph legible without a fixed schema.
export const nodeLabel = (g, id) => {
  const n = g && g.nodes && g.nodes[id];
  if (!n) return String(id || '');
  if (n.v.name) return String(n.v.name);
  if (n.v.city) return String(n.v.city);
  const first = Object.values(n.v).find((x) => typeof x === 'string');
  return first ? String(first) : String(id);
};

// The records of one table, in insertion order.
export const recordsOf = (g, tableId) => (g.nodeList || []).filter((n) => n.table === tableId);

// The stored fields of an edge rendered as a "Since 1987 · Regulated concession"
// string, in the edge-type's field order. Empty when the edge carries no data.
export const edgeDataStr = (g, edge) => {
  const et = (g.etypes && g.etypes[edge.etype]) || {};
  return (et.fields || [])
    .map((f) => (edge.v[f.field] != null && edge.v[f.field] !== '' ? f.name + ' ' + edge.v[f.field] : null))
    .filter(Boolean)
    .join(' · ');
};

// Every typed connection touching `nodeId`, each resolved to the OTHER endpoint
// with its type and data string — the "Connections" list for a record panel.
export const connectionsOf = (g, nodeId) => {
  const out = [];
  for (const ed of g.edges || []) {
    let other = null;
    if (ed.from === nodeId) other = ed.to;
    else if (ed.to === nodeId) other = ed.from;
    else continue;
    const et = (g.etypes && g.etypes[ed.etype]) || {};
    out.push({ edgeId: ed.id, otherId: other, otherLabel: nodeLabel(g, other), typeId: ed.etype, typeName: et.name || ed.etype, color: et.color || '#5b34d6', data: edgeDataStr(g, ed) });
  }
  return out;
};

// ── event builders (callers stamp id/ts/actor; these are the raw ops) ──

export const tableEvent = (table, name) => ({ op: 'INS', kind: 'table', table, name });
export const nodeEvents = (node, table, fields = {}) => [
  { op: 'INS', kind: 'node', node, table },
  ...Object.entries(fields).map(([field, value]) => ({ op: 'DEF', kind: 'node', node, field, value })),
];
export const edgeTypeEvent = (etype, name, from, to, color, fields) => ({ op: 'INS', kind: 'edge-type', etype, name, from, to, color, fields });
// A typed connection plus its field values — the events a "+ New Connection" emits.
export const edgeEvents = (edge, etype, from, to, vals = {}) => [
  { op: 'INS', kind: 'edge', edge, etype, from, to },
  ...Object.entries(vals).filter(([, v]) => v != null && v !== '').map(([field, value]) => ({ op: 'DEF', kind: 'edge', edge, field, value })),
];
export const edgeDeleteEvent = (edge) => ({ op: 'SEG', kind: 'edge-del', edge });

// The demo databases: Metro systems ↔ Operators, linked by two typed edge kinds
// ("operated by" carrying a start year + ownership model, "benchmarks with"
// carrying a basis + year). Mirrors the design comp's seed so the surface is
// never empty on first open.
export const seedEvents = () => {
  const ev = [];
  ev.push(tableEvent('metros', 'Metro systems'));
  ev.push(tableEvent('operators', 'Operators'));
  const metros = [
    ['tokyo', 'Tokyo', 1927], ['singapore', 'Singapore', 1987], ['paris', 'Paris', 1900],
    ['london', 'London', 1863], ['newyork', 'New York', 1904], ['delhi', 'Delhi', 2002],
  ];
  for (const [slug, city, opened] of metros) ev.push(...nodeEvents('metro/' + slug, 'metros', { city, opened }));
  const ops = [
    ['teito', 'Tokyo Metro Co.', 'Semi-public'], ['lta', 'Land Transport Authority', 'Statutory board'],
    ['ratp', 'RATP Group', 'State-owned'], ['tfl', 'Transport for London', 'Government body'],
    ['mta', 'Metropolitan Transportation Auth.', 'Public authority'], ['dmrc', 'Delhi Metro Rail Corp.', 'Joint venture'],
  ];
  for (const [slug, name, kind] of ops) ev.push(...nodeEvents('operator/' + slug, 'operators', { name, kind }));
  ev.push(edgeTypeEvent('operated_by', 'operated by', 'metros', 'operators', '#5b34d6',
    [{ field: 'since', name: 'Since', type: 'year' }, { field: 'model', name: 'Ownership model', type: 'text' }]));
  ev.push(edgeTypeEvent('benchmarks', 'benchmarks with', 'metros', 'metros', '#0d7d74',
    [{ field: 'via', name: 'Basis', type: 'text' }, { field: 'year', name: 'Since', type: 'year' }]));
  ev.push(...edgeEvents('edge/op-tokyo', 'operated_by', 'metro/tokyo', 'operator/teito', { since: 1927, model: 'Semi-public franchise' }));
  ev.push(...edgeEvents('edge/op-sing', 'operated_by', 'metro/singapore', 'operator/lta', { since: 1987, model: 'Regulated concession' }));
  ev.push(...edgeEvents('edge/op-paris', 'operated_by', 'metro/paris', 'operator/ratp', { since: 1900, model: 'State operator' }));
  ev.push(...edgeEvents('edge/op-london', 'operated_by', 'metro/london', 'operator/tfl', { since: 2000, model: "Arm's-length body" }));
  ev.push(...edgeEvents('edge/op-ny', 'operated_by', 'metro/newyork', 'operator/mta', { since: 1968, model: 'Public authority' }));
  ev.push(...edgeEvents('edge/op-delhi', 'operated_by', 'metro/delhi', 'operator/dmrc', { since: 2002, model: '50/50 joint venture' }));
  ev.push(...edgeEvents('edge/ix-tp', 'benchmarks', 'metro/tokyo', 'metro/paris', { via: 'Automation benchmarking', year: 2019 }));
  ev.push(...edgeEvents('edge/ix-ln', 'benchmarks', 'metro/london', 'metro/newyork', { via: 'Operations MOU', year: 2016 }));
  return ev;
};

const VERSION = 1;
// The log serializes as-is (it is already plain data); the wrapper carries a
// version for forward migration.
export const serialize = (events) => JSON.stringify({ v: VERSION, events: events || [] });
export const deserialize = (raw) => {
  let obj = raw;
  if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { return seedEvents(); } }
  if (!obj || typeof obj !== 'object') return seedEvents();
  const ev = Array.isArray(obj.events) ? obj.events : Array.isArray(obj) ? obj : null;
  if (!ev || !ev.length) return seedEvents();
  return ev.filter((e) => e && typeof e === 'object' && typeof e.op === 'string');
};
