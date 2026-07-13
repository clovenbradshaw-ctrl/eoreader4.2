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
import { attachReading }     from '../ingest/index.js';

const slugKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'col';

// Papaparse (header mode) parks the cells of a row that is WIDER than the header row
// under this key. They are content — a ragged export's overflow cells — not noise.
const EXTRA = '__parsed_extra';
const extraOf = (row) => (row && !Array.isArray(row) && Array.isArray(row[EXTRA])) ? row[EXTRA] : [];

// table: { name?, columns?:[string], rows:[ {..} | [..] ], keyColumn?, metadata? }
// rows may be objects keyed by column, or arrays aligned to `columns`.
export const ingestTable = (table = {}) => {
  const { name = `table-${Date.now()}`, rows = [], keyColumn } = table;
  // The effective header is widened until EVERY cell of EVERY row has a column:
  //   • an object row's keys are unioned across ALL rows (first-seen order), not read
  //     off row 0 alone — a field that first appears on row 40 must not vanish;
  //   • a row wider than the header (a ragged CSV/sheet, or Papaparse's __parsed_extra)
  //     gets synthesized `col_N` names for its overflow cells.
  // 100% of the content lands on the spine; nothing is silently dropped.
  let columns = (table.columns || []).map(String);
  const knownCols = new Set(columns);
  let overflow = 0;
  for (const row of rows) {
    if (Array.isArray(row)) { overflow = Math.max(overflow, row.length - columns.length); continue; }
    for (const k of Object.keys(row)) {
      if (k === EXTRA) continue;
      if (!knownCols.has(k)) { knownCols.add(k); columns.push(k); }
    }
    overflow = Math.max(overflow, extraOf(row).length);
  }
  const named = columns.length;
  for (let i = 0; i < overflow; i++) columns.push(`col_${named + i + 1}`);
  // Slug the headers into DEF keys, deduping collisions ("Name" and "name" both slug
  // to `name`) with a positional suffix so one column can never overwrite another.
  const seenKeys = new Map();
  const keys = columns.map((c) => {
    const base = slugKey(c);
    const n = (seenKeys.get(base) || 0) + 1;
    seenKeys.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });

  const log = createLog({ docId: name });
  const units = [], sentences = [], records = [];
  const mentions = new Map();
  let prevId = null;

  // Every row's cells, computed up front so the key column can be inferred over the
  // whole sheet before any row is labelled.
  const allCells = rows.map((row) => {
    // An array row aligns positionally over the widened header; an object row reads its
    // named cells then appends its overflow cells, so both shapes fill every column.
    const values = Array.isArray(row)
      ? row
      : [...columns.slice(0, named).map(c => row[c]), ...extraOf(row)];
    const cells = {};
    keys.forEach((k, ci) => { cells[k] = values[ci] == null ? '' : String(values[ci]); });
    return cells;
  });

  // The column that NAMES a row. When the caller doesn't pass keyColumn, infer it: the
  // leftmost column whose values are all present, (nearly) all distinct, and mostly
  // non-numeric — the column a person would point at to say WHICH row this is, so the
  // row's entity reads "Springfield", not "row 3". Labelling only; every cell still
  // lands as its own DEF fact regardless, and `units` keeps the positional "row N".
  const inferKey = () => {
    if (!allCells.length) return null;
    for (const k of keys) {
      const vals = allCells.map((c) => c[k]).filter((v) => v !== '');
      if (vals.length < allCells.length) continue;                        // gaps — not an identifier
      if (new Set(vals).size < vals.length * 0.9) continue;               // repeats — a category, not a key
      if (vals.filter((v) => /^[\s$€£]*-?[\d,.\s]+%?$/.test(v)).length > vals.length / 2) continue;   // a measure
      return k;
    }
    return null;
  };
  const keyK = keyColumn ? slugKey(keyColumn) : inferKey();

  rows.forEach((row, i) => {
    const cells = allCells[i];
    const id = `row-${i}`;
    const rowLabel = (keyK && cells[keyK]) ? String(cells[keyK]) : `row ${i}`;
    log.append({ op: 'INS', id, label: rowLabel, sentIdx: i });
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

  // Every source encodes into EoT, tabular included: the lazy `doc.reading()` renders the
  // full log — every row-INS, every cell-DEF, every next-row CON — as canonical EoT lines
  // (ingest/read.js). A row is not a proposition the way a sentence is, but it is the same
  // three-faced event on the same spine, and the EoT surface carries all of it.
  attachReading(doc);

  const vecByOrgan = new Map();
  doc.sentenceEmbeddings = async (embedder) => {
    const key = embedder?.id || 'default';
    if (!vecByOrgan.has(key)) vecByOrgan.set(key, Promise.all(sentences.map(s => embedder.embed(s))));
    return vecByOrgan.get(key);
  };

  return doc;
};
