// EO: CON·EVA·SIG(Network → Link,Lens, Binding,Tracing) — the database front door
//
// One handle over a set of rooms (tables) sharing a vault + namespace, tying the
// durable substrate (event-store · persistent-log) to the spreadsheet engine
// (rows · table · query · formula). This is what the surface adopts as
// window.EO.db.
//
//   const db = createDatabase();
//   await db.unlock('reader@local', passphrase);
//   const { log } = await db.openLog('topic:dolphins');     // durable, encrypted log
//   log.append({ op: 'INS', id: 'c1', label: 'Client', type: 'client' });
//   db.query('topic:dolphins', { filter: { field: 'type', op: 'is', value: 'client' } });
//   db.buildTable('topic:dolphins', { setName: 'client' });
//   db.formula('{qty} * {price}', { qty: 3, price: 4 });     // → 12

import { projectGraph } from '../core/project.js';
import { vault as defaultVault } from './vault.js';
import { EventStore } from './event-store.js';
import { openPersistentLog } from './persistent-log.js';
import { foldToRows } from './rows.js';
import { buildTable, buildTableForSet, listSets } from './table.js';
import { query as queryRows, aggregate, relatedRecords, linkedSetsFor, indexRows } from './query.js';
import { evaluate as evalFormula, evaluateRollup } from './formula.js';

export function createDatabase({ vault = defaultVault, namespace } = {}) {
  const stores = new Map(); // roomId → EventStore
  const logs = new Map();   // roomId → { log, store, flush, detach }

  const table = async (roomId) => {
    if (stores.has(roomId)) return stores.get(roomId);
    const es = await new EventStore({ roomId, vault, namespace }).open();
    stores.set(roomId, es);
    return es;
  };

  const openLog = async (roomId, { docId } = {}) => {
    if (logs.has(roomId)) return logs.get(roomId);
    const store = await table(roomId);
    const handle = await openPersistentLog({ roomId, docId, store, vault, namespace });
    logs.set(roomId, handle);
    return handle;
  };

  // Fold a room's durable log into a row set: { rows, connections, log, store }.
  const rows = async (roomId, opts = {}) => {
    const { log, store } = await openLog(roomId);
    const fold = projectGraph(log);
    const { rows, connections } = foldToRows(fold, opts);
    return { rows, connections, log, store, fold };
  };

  return {
    vault,
    // ── durable substrate ──
    unlock: (userId, passphrase) => vault.open(userId, passphrase),
    lock: () => vault.lock(),
    isUnlocked: () => vault.isUnlocked(),
    table,
    openLog,

    // ── spreadsheet-database view over a room's fold ──
    rows,
    /** listSets over a room's rows: [{ name, rows, declared }]. */
    listSets: async (roomId, { schema } = {}) => listSets((await rows(roomId)).rows, { schema }),
    /** buildTable for a room (optionally one set): { cols, rows }. */
    buildTable: async (roomId, { setName, schema } = {}) => {
      const { rows: rs } = await rows(roomId);
      return setName ? buildTableForSet(rs, setName, { schema }) : buildTable(rs, { schemaFields: schema && schema.fields });
    },
    /** query a room: { page, total, groups }. */
    query: async (roomId, opts = {}) => queryRows((await rows(roomId)).rows, opts),
    /** aggregate a room's rows: { grouped, value } | { grouped, rows }. */
    aggregate: async (roomId, spec = {}) => aggregate((await rows(roomId)).rows, spec),
    /** records related to `id` in a room, grouped by direction/relation/set. */
    related: async (roomId, id) => {
      const { rows: rs, connections } = await rows(roomId);
      return relatedRecords(id, { connections, rowsById: indexRows(rs) });
    },
    /** the sets a set can link to, in a room. */
    linkedSetsFor: async (roomId, setName, { schema } = {}) => {
      const { rows: rs, connections } = await rows(roomId);
      return linkedSetsFor(setName, { schema, connections, rowsById: indexRows(rs) });
    },

    // ── pure engine passthroughs (no room needed) ──
    formula: (expr, record, ctx = {}) => evalFormula(expr, { record, ...ctx }),
    rollup: (cfg, record, ctx = {}) => evaluateRollup(cfg, { record, ...ctx }),
  };
}
