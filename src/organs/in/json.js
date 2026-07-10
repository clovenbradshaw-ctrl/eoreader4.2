// EO: INS·DEF·CON(Void → Entity,Link,Field, Making,Binding,Dissecting) — JSON tree adapter
// The JSON adapter — a config / record TREE, as addressable key-paths on the spine.
//
// A `.json` file is neither prose nor a flat sheet: it is a nesting of objects, arrays and
// typed leaves. Read as run-on text it collapses into an unreadable blob; its real unit is
// the KEY-PATH — `research.depth`, `record.retention` — a leaf whose meaning is its value
// paired to the path that reaches it. So this adapter walks the tree in document order and,
// mirroring the table adapter (organs/in/table.js), emits each CONTAINER (object/array) as an
// entity (INS) bonded to its parent, and each LEAF as a DEF fact of its nearest container —
// the same "a cell is a fact of its row" shape, one level of nesting deeper. Each leaf also
// gets a readable "path: value." line (one sentence per leaf, period-terminated) so retrieval
// and embeddings have prose to work over and a claim can cite a value by its path.
//
// `data` (the parsed tree) rides along on the doc so a viewer can render the real nesting; the
// caller parses the file and passes the parsed value in.

import { createLog }         from '../../core/index.js';
import { projectGraph }      from '../../core/index.js';
import { createConventions } from '../../core/conventions/index.js';
import { tok }               from '../../perceiver/parse/index.js';

const typeOf = (v) => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v; // object|array|string|number|boolean|null
const isContainer = (v) => v !== null && typeof v === 'object';
const DEPTH_CAP = 200;   // past this a subtree is frozen to a string leaf — no adversarial-JSON stack blow-up

// ingestJson: { name?, data, metadata? }  — `data` is the already-parsed JSON value.
export const ingestJson = (input = {}) => {
  const { name = `json-${Date.now()}`, data } = input;
  const log = createLog({ docId: name });
  const nodes = [], sentences = [], units = [];
  const mentions = new Map();
  let entN = 0, sentN = 0, leaves = 0, containers = 0;

  const display = (v) => {
    const t = typeOf(v);
    if (t === 'string') return v;
    if (t === 'null') return 'null';
    return String(v);
  };

  const leaf = (key, path, val, parentId) => {
    leaves++;
    const kStr = key == null ? 'value' : String(key);
    const pStr = path || kStr;
    const si = sentN++;
    if (parentId) log.append({ op: 'DEF', id: parentId, key: kStr, value: display(val), sentIdx: si });
    nodes.push({ path: pStr, depth: 0, key: kStr, leaf: true, kind: typeOf(val), value: display(val) });
    const line = `${pStr}: ${display(val)}`;
    units.push(pStr);
    sentences.push(/[.!?]$/.test(line) ? line : line + '.');
  };

  // Depth-first, document order: a container is an entity + CON from its parent; a leaf is a
  // DEF fact of its nearest container. `nodes` keeps the walk order (with depth) for a viewer.
  const walk = (val, key, path, depth, parentId) => {
    if (isContainer(val) && depth <= DEPTH_CAP) {
      containers++;
      const id = `node-${entN++}`;
      const label = key == null ? (name || 'root') : String(key);
      log.append({ op: 'INS', id, label, sentIdx: null });
      mentions.set(id, []);
      if (parentId) log.append({ op: 'CON', src: parentId, tgt: id, via: 'contains', sentIdx: null });
      const t = typeOf(val);
      const entries = t === 'array' ? val.map((v, i) => [i, v]) : Object.entries(val);
      nodes.push({ path, depth, key: label, leaf: false, kind: t, count: entries.length });
      for (const [k, v] of entries) walk(v, k, path ? path + '.' + k : String(k), depth + 1, id);
      return;
    }
    if (isContainer(val)) { leaf(key, path, JSON.stringify(val), parentId); return; } // over the depth cap
    leaf(key, path, val, parentId);
  };

  walk(data, null, '', 0, null);

  const tokensBySentence = sentences.map(s => new Set(tok(s)));
  const doc = {
    docId: name, modality: 'json',
    data, nodes, units, sentences, tokensBySentence,
    counts: { leaves, containers },
    log, mentions,
    conventions: createConventions(),
    metadata: input.metadata || {},
    projectGraph: (frame = {}) => projectGraph(log, frame),
  };
  doc.leafAt = (i) => nodes.filter(n => n.leaf)[i] || null;

  const vecByOrgan = new Map();
  doc.sentenceEmbeddings = async (embedder) => {
    const key = embedder?.id || 'default';
    if (!vecByOrgan.has(key)) vecByOrgan.set(key, Promise.all(sentences.map(s => embedder.embed(s))));
    return vecByOrgan.get(key);
  };

  return doc;
};
