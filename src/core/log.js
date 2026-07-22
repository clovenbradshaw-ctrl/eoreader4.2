// EO: INS·SEG·SIG(Entity → Field,Entity, Making,Dissecting,Binding) — the append-only log (write)
// The append-only event log. Single source of truth.
// Append is the only mutation. Retractions are written as SEG events —
// nothing is unwritten. The graph and every projection are folds of this.

import { isOperator } from './operators.js';
import { facesOf } from './faces.js';

let nextLogId = 1;

// Seal the geometry at emit time (add-on 2 §B/§D). Every logged operation is
// recorded as operator(Site, Stance) at a holonic address: the Act (operator), the
// Site (terrain + the holonic address of the target when the event names one), and
// the Stance (the manner). Computed HERE, the single chokepoint every event passes
// through, and frozen with the event — so the address reflects the holarchy at the
// moment of emission and, like everything in the append-only log, is never
// rewritten. A non-addressable event (no grain-coherent face) carries no `eo`.
const sealGeometry = (event) => {
  let f = null;
  try { f = facesOf(event); } catch { f = null; }
  if (!f) return null;
  const holon = f.site.holon || null;
  const siteStr = holon ? `${holon.path}@${f.site.terrain}` : f.site.terrain;
  return Object.freeze({
    notation: `${event.op}(${siteStr}, ${f.stance.stance})`,
    terrain: f.site.terrain,
    stance: f.stance.stance,
    address: holon ? Object.freeze({ path: holon.path, id: holon.id, depth: holon.depth }) : null,
  });
};

// Law 1 at the chokepoint (docs/eo-for-coders.md: "the kernel checks every event
// the part emits against its declared contract"). The log cannot import the
// contract registry — core imports nothing, and the registry aggregates every
// manifest in the tree — so the resolver is INJECTED (`contractOf`), the same way
// the audit terminal takes notate. When a resolver is present AND the emitter
// names itself (`meta.src`, its repo-relative module path), append checks the
// event's op against that module's declared Act face. A violation is RECORDED,
// never thrown (core/contract.js: a crossing is recorded, not silently kept, and
// the record is never rewritten) — the sealed event carries `law1` and the log
// collects it. An event with no `src`, or a log with no resolver, is checked by
// the static checkpoints instead (tests/op-fidelity.test.js) and seals
// byte-identically to before.
export const createLog = ({ docId, contractOf = null, role = null } = {}) => {
  const id = nextLogId++;
  const events = [];
  const subscribers = new Set();
  const law1Violations = [];

  const append = (event, meta = {}) => {
    if (!event || !isOperator(event.op)) {
      throw new TypeError(`log.append: invalid event ${JSON.stringify(event)}`);
    }
    const eo = sealGeometry(event);
    let law1 = null;
    const src = meta.src ?? null;
    if (typeof contractOf === 'function' && src) {
      const c = contractOf(src);
      if (!c) law1 = Object.freeze({ src, op: event.op, verdict: 'no-contract' });
      else if (!c.ops.includes(event.op))
        law1 = Object.freeze({ src, op: event.op, verdict: 'undeclared-op', declared: c.ops });
    }
    // The corpus role (docs/corpus-fold §2.1, F1) — sealed HERE, the one chokepoint every
    // event already passes through for seq/t/eo/law1, never trusted from a caller that could
    // forget it. A corpus fold rides the SAME append (F1: no separate or simplified path);
    // what marks it is this log's own `role` (a corpus item's whole log) or, failing that, the
    // individual event's own `role` (a caller staging a mixed log). Either way the mark rides
    // the sealed event itself, so a projection can read it without walking back to the log
    // that produced it — the firewall (F4, enforced in core/project.js) needs nothing more.
    // Omitted entirely (not a false-y key) on a plain document event, so an ordinary log's
    // events stay byte-identical in shape to before this field existed.
    const evRole = event.role ?? role ?? null;
    const sealed = Object.freeze({
      ...event,
      seq: events.length,
      t: event.t ?? Date.now(),
      ...(eo ? { eo } : {}),
      ...(law1 ? { law1 } : {}),
      ...(evRole ? { role: evRole } : {}),
    });
    events.push(sealed);
    if (law1) law1Violations.push(sealed);
    for (const fn of subscribers) {
      try { fn(sealed); } catch { /* subscribers are best-effort */ }
    }
    return sealed;
  };

  const retract = (refSeq, reason) =>
    append({ op: 'SEG', kind: 'retract', refSeq, reason });

  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };

  return {
    id,
    docId,
    role,
    append,
    retract,
    subscribe,
    get events() { return events; },
    get length() { return events.length; },
    snapshot() { return events.slice(); },
    filter(pred) { return events.filter(pred); },
    last(n = 1) { return events.slice(-n); },
    // Law 1 at emit — the recorded violations (empty without a resolver).
    law1Violations() { return law1Violations.slice(); },
  };
};

export const isLog = (x) =>
  !!x && typeof x.append === 'function' && Array.isArray(x.events);
