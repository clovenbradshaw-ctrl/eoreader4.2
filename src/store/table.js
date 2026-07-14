// EO: SIG·CON·SEG(Entity → Link,Network, Binding,Tracing) — the grid engine
//
// Turn a row set into a table the way a spreadsheet grid needs it: ordered
// columns (schema-declared first, then data-only "extras"), the rows themselves,
// and the relational links each row carries. buildTable is the projection the
// Database view renders; listSets enumerates every table the corpus holds.

import { inferType } from './types.js';
import { linkedSetsFor, relatedRecords, indexRows } from './query.js';

/**
 * Build a table from `rows`, optionally under a declared field schema.
 *   schemaFields: [{ name, type, options?, formula?, rollup? }] | undefined
 * Columns are the declared fields in order (schematized:true), then any data-only
 * field observed on the rows (schematized:false, type inferred). Fields whose
 * name starts with `_` are treated as hidden meta and never become columns.
 */
export function buildTable(rows, { schemaFields } = {}) {
  const visibleKeys = (r) => Object.keys(r).filter((k) => !k.startsWith('_'));
  let cols;
  if (Array.isArray(schemaFields)) {
    const declared = new Set(schemaFields.map((f) => f.name));
    cols = schemaFields.map((f) => ({
      name: f.name, type: f.type, options: f.options, optionColors: f.optionColors,
      formula: f.formula, rollup: f.rollup, schematized: true,
    }));
    const extras = new Set();
    for (const r of rows) for (const k of visibleKeys(r)) if (!declared.has(k)) extras.add(k);
    for (const name of extras) cols.push({ name, type: inferType(rows.map((r) => r[name])), schematized: false });
  } else {
    const colSet = new Set();
    for (const r of rows) for (const k of visibleKeys(r)) colSet.add(k);
    cols = Array.from(colSet).map((name) => ({ name, type: inferType(rows.map((r) => r[name])), schematized: false }));
  }
  return { cols, rows };
}

/** buildTable for a single set: the subset of `rows` whose `_set` matches. */
export function buildTableForSet(rows, setName, { schema } = {}) {
  const setRows = rows.filter((r) => r._set === setName);
  const schemaFields = schema && schema.fields && schema.fields[setName];
  return buildTable(setRows, { schemaFields });
}

/**
 * Enumerate every set (table) the row corpus holds: declared schema.tables ∪
 * every distinct row `_set`. Returns [{ name, rows, declared }] sorted by size.
 */
export function listSets(rows, { schema } = {}) {
  const declared = (schema && schema.tables) || [];
  const counts = new Map();
  for (const r of rows) if (r._set) counts.set(r._set, (counts.get(r._set) || 0) + 1);
  const names = Array.from(new Set([...declared, ...counts.keys()])).filter((n) => n && !String(n).startsWith('_'));
  return names
    .map((name) => ({ name, rows: counts.get(name) || 0, declared: declared.includes(name) }))
    .sort((a, b) => (b.rows - a.rows) || a.name.localeCompare(b.name));
}

export { linkedSetsFor, relatedRecords, indexRows };
