// EO: EVA(Field → Lens, Binding) — element role by ablation
// The role of an element, by ablation — the embedder-free version of "embed a proposition,
// remove a word, and the difference is that word's role."
//
// That technique is sound; its only sin is the embedder. It assumes a proposition's meaning
// is a vector you subtract in — and to get that vector you needed a distributional model.
// But this engine already holds a proposition's reading without one: its OPERATOR PROFILE,
// the histogram of what the cube's nine operators do across its events (structure-basis.js).
// So the role of an element is read the same way, structurally: remove the element, recompute
// the proposition's operational signature, and the DIFFERENCE is the element's role — which
// operations it was holding up. The leave-one-out is exactly the Born-rule pattern deriveNull
// already runs (extreme-value, leave-one-out, robust floor), so an element's role is reported
// against a null: load-bearing if its removal moves the reading more than dropping a typical
// element would. No embedder, nothing distributional — the role is operational, which is the
// only kind of meaning this engine claims.

import { deriveNull, OPERATORS } from '../core/index.js';

const OPS = Object.keys(OPERATORS);
const OP_IDX = Object.fromEntries(OPS.map((o, i) => [o, i]));
const round = (x) => Math.round(x * 1e4) / 1e4;

// the operational signature of a set of events: the normalised histogram over the nine
// operators (the proposition's reading, as a point on the simplex).
const signature = (events) => {
  const h = new Array(OPS.length).fill(0);
  let n = 0;
  for (const e of events) if (e.op in OP_IDX) { h[OP_IDX[e.op]] += 1; n += 1; }
  return n ? h.map(x => x / n) : h;
};

// L1 distance between two signatures — how far the reading moved (0…2).
const shift = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };

// an event "touches" an element when the element is its subject, object, or the thing
// instantiated/defined, OR when the element is the relation's verb (its via). So a
// proposition's elements are its entities AND its relations — anything you could remove.
const touches = (e, key) => e.src === key || e.tgt === key || e.id === key || (e.via && String(e.via).toLowerCase() === key);

// propositionRoles(doc) → per unit, the operational role of each of its elements.
//
//   role        the L1 shift the proposition's operational signature undergoes when the
//               element's events are removed — "the difference its removal makes".
//   loadBearing whether that shift clears the leave-one-out null (it moves the reading more
//               than removing a typical element of this proposition would, by chance).
//   carries     the operators that vanish with it — what, operationally, it was holding up.
export const propositionRoles = (doc) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, e.label);

  const byUnit = new Map();
  for (const e of events) { if (e.sentIdx == null) continue; (byUnit.get(e.sentIdx) || byUnit.set(e.sentIdx, []).get(e.sentIdx)).push(e); }

  const out = [];
  for (const [sentIdx, unitEvents] of byUnit) {
    // the elements in play: entity ids (subject/object/instantiated) + relation verbs.
    const keys = new Set();
    for (const e of unitEvents) {
      for (const k of [e.src, e.tgt, e.id]) if (k != null) keys.add(k);
      if ((e.op === 'CON' || e.op === 'SIG') && e.via) keys.add(String(e.via).toLowerCase());
    }
    if (keys.size < 2) continue;                       // nothing to leave out

    const full = signature(unitEvents);
    const roles = [...keys].map(key => {
      const kept = unitEvents.filter(e => !touches(e, key));
      const role = shift(full, signature(kept));
      const carries = OPS.filter((_, i) => signature(unitEvents)[i] > signature(kept)[i]);
      return { element: key, label: label.get(key) ?? key, role: round(role), carries };
    });
    // the leave-one-out null: an element is LOAD-BEARING if its shift beats what dropping a
    // typical element of this proposition throws up (the Born floor, computed per proposition).
    const shifts = roles.map(r => r.role);
    const line = roles.length >= 4 ? deriveNull(shifts, { scale: 'linear', alpha: 0.1, N: roles.length }) : Infinity;
    for (const r of roles) r.loadBearing = Number.isFinite(line) ? r.role > line : r.role >= Math.max(...shifts);
    roles.sort((a, b) => b.role - a.role);
    out.push({ sentIdx, roles });
  }
  return out;
};
