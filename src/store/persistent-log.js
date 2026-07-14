// EO: INS·CON·SIG(Void → Entity,Link, Making,Binding,Tending) — durable log
//
// The seam that makes eoreader's ephemeral log durable.
//
// createLog (src/core/log.js) is in-memory: readings evaporate with the tab.
// attachStore() binds an EventStore to a live log so that
//   · on open, the stored events REPLAY back into the log (rehydration), and
//   · every subsequent append PERSISTS (encrypted) to the store.
// Because both sides are the same append-only nine-operator log, the round-trip
// is loss-free: a rehydrated log folds (projectGraph) byte-identically to the
// original — that equivalence is the contract the tests pin.

import { createLog } from '../core/log.js';
import { EventStore } from './event-store.js';
import { vault as defaultVault } from './vault.js';

/**
 * Bind an EventStore to a live log.
 *
 *   attachStore(log, store, { replay })
 *
 * With `replay` (default true) the store's events are re-appended into the log
 * FIRST — so pass a fresh log, or the replayed seqs will not line up with any
 * events already present. Then a subscription persists each new append. Returns
 * { detach, flush } — detach() stops persisting; flush() resolves once every
 * queued write has hit the backend.
 */
export async function attachStore(log, store, { replay = true } = {}) {
  if (replay) {
    if (log.length > 0) {
      console.warn('[persistent-log] attachStore(replay) onto a non-empty log — skipping replay to avoid seq drift');
    } else {
      const stored = await store.getAll();
      for (const event of stored) {
        // log.append re-seals seq (= position) and eo; t is preserved. Stored
        // events were appended in order, so the resealed seq matches the original.
        try { log.append(stripSealed(event)); }
        catch (e) { console.warn('[persistent-log] skipped un-replayable event', e?.message || e); }
      }
    }
  }

  const detach = log.subscribe((event) => {
    // Fire-and-forget; the store serializes writes internally. Errors are logged,
    // never thrown into the append path (persistence must not break the reading).
    Promise.resolve(store.append([event])).catch((e) =>
      console.warn('[persistent-log] persist failed', e?.message || e));
  });

  return {
    detach,
    // Resolves once the store's append queue has drained (an empty append rides
    // the same queue, so awaiting it awaits everything before it).
    flush: () => store.append([]),
    store,
  };
}

// The log re-seals seq/t/eo on append; hand it back the raw operator event so it
// re-derives them identically instead of inheriting a stale seal.
function stripSealed(event) {
  const { seq, eo, ...rest } = event;
  return rest;
}

/**
 * One-call durable log: create a fresh log, open (or adopt) an EventStore for
 * `roomId`, rehydrate, and start persisting. Resolves to
 * { log, store, flush, detach }.
 *
 *   const { log } = await openPersistentLog({ roomId: 'topic:dolphins', vault });
 *   log.append({ op: 'INS', id: 'e1', label: 'dolphin' });   // persisted, encrypted
 *
 * The vault must be unlocked for anything to reach disk; locked, this still
 * returns a working in-memory log (persistence is a no-op until unlock).
 */
export async function openPersistentLog({
  docId, roomId, store, vault = defaultVault, namespace, backend,
} = {}) {
  const id = roomId || docId || 'default';
  const es = store || await new EventStore({ roomId: id, vault, namespace, backend }).open();
  if (!store) { /* freshly opened above */ } else if (!es._opened) { await es.open(); }

  const log = createLog({ docId: docId || id });
  const { detach, flush } = await attachStore(log, es, { replay: true });
  return { log, store: es, flush, detach };
}
