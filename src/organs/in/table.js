// EO: INS·DEF·CON(Void → Entity,Link,Field, Making,Binding,Dissecting) — tabular adapter (CSV/xlsx)
// The tabular adapter — CSV and spreadsheet exports, as records on the spine.
//
// Court dockets and campaign-finance exports arrive as CSV (Papaparse, streamed for
// the large ones) or .xlsx (SheetJS). A table is not prose: its unit is the ROW, a
// record whose meaning is the pairing of its CELLS to COLUMN HEADERS. So this adapter
// does not flatten rows into sentences — it emits each row as an entity (INS) whose
// columns are DEF key/value facts, bonded to the next row along the sheet's reading
// order. A campaign-finance row's donor, amount and date become addressable fields a
// claim can cite ("row 412, `amount` = $2,900"), not a line of text.
//
// Repeated key values across rows are NOT auto-merged: two rows naming "ACME LLC"
// stay distinct records until a proof unifies them (the same rule referents follow,
// organs/in/index.js). Nothing here is bundled; the caller parses the file and passes
// the header + rows in.

import { createLog }         from '../../core/index.js';
import { projectGraph }      from '../../core/index.js';
import { createConventions } from '../../core/conventions/index.js';
import { tok }               from '../../perceiver/parse/index.js';

const slugKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'col';

// table: { name?, columns?:[string], rows:[ {..} | [..] ], keyColumn?, metadata? }
// rows may be objects keyed by column, or arrays aligned to `columns`.
export const ingestTable = (table = {}) => {
  const { name = `table-${Date.now()}`, rows = [], keyColumn } = table;
  let columns = table.columns;
  if (!columns && rows.length && !Array.isArray(rows[0])) columns = Object.keys(rows[0]);
  columns = (columns || []).map(String);
  const keys = columns.map(slugKey);

  const log = createLog({ docId: name });
  const units = [], sentences = [], records = [];
  const mentions = new Map();
  let prevId = null;

  rows.forEach((row, i) => {
    const values = Array.isArray(row) ? row : columns.map(c => row[c]);
    const cells = {};
    keys.forEach((k, ci) => { cells[k] = values[ci] == null ? '' : String(values[ci]); });

    const id = `row-${i}`;
    log.append({ op: 'INS', id, label: keyColumn ? String(cells[slugKey(keyColumn)] ?? `row ${i}`) : `row ${i}`, sentIdx: i });
    mentions.set(id, [i]);
    for (const k of keys) if (cells[k] !== '') log.append({ op: 'DEF', id, key: k, value: cells[k], sentIdx: i });
    if (prevId) log.append({ op: 'CON', src: prevId, tgt: id, via: 'next-row', sentIdx: i });
    prevId = id;

    // A readable projection of the row for retrieval / embeddings. It is terminated with a
    // period so any reader that re-segments these lines as prose keeps ONE SENTENCE PER ROW:
    // without a sentence boundary, period-less tabular data (names, ids, numbers, categories)
    // collapses into a single multi-megabyte "sentence" that then stalls — or overflows the
    // stack in — sentence-level passes downstream.
    const line = keys.map((k, ci) => `${columns[ci]}: ${cells[k]}`).filter(s => !/: $/.test(s)).join('; ');
    records.push({ id, index: i, cells });
    units.push(`row ${i}`);
    sentences.push(line && !/[.!?]$/.test(line) ? line + '.' : line);
  });

  const tokensBySentence = sentences.map(s => new Set(tok(s)));

  const doc = {
    docId: name, modality: 'table',
    columns, keys, records, units, sentences, tokensBySentence,
    log, mentions,
    conventions: createConventions(),
    metadata: table.metadata || {},
    projectGraph: (frame = {}) => projectGraph(log, frame),
  };
  doc.rowAt = (i) => records[i] || null;
  doc.column = (col) => { const k = slugKey(col); return records.map(r => r.cells[k]); };

  const vecByOrgan = new Map();
  doc.sentenceEmbeddings = async (embedder) => {
    const key = embedder?.id || 'default';
    if (!vecByOrgan.has(key)) vecByOrgan.set(key, Promise.all(sentences.map(s => embedder.embed(s))));
    return vecByOrgan.get(key);
  };

  return doc;
};
