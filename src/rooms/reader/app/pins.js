// EO — one section of the reader session controller (rooms/reader/app.js assembler;
// "no god module — no file over ~250 lines"). Cross-section reach rides ctx (call-time).
// PINS — the durable write path (docs/search-and-pins.md). A pin is small plain JSON
// with its identity EMBEDDED (the anchor carries the quote and the hashes; an entity
// pin carries its lead instance; a query pin carries the query), so it survives
// reloads, re-parses, topic moves, and source drift — and when the ground truly moved,
// resolution says so instead of silently rebinding.
import { anchorFor, resolveAnchor } from '../anchor.js';
import { nowIso } from './util.js';

export const installPins = (appCtx) => {
  const { state, emit } = appCtx;

  const pinAdd = (spec = {}) => {
    const kind = spec.kind;
    if (!['entity', 'claim', 'passage', 'source', 'query'].includes(kind)) return null;
    const t = appCtx.topic();
    const pin = {
      id: `pin${++appCtx.pn}`, kind,
      refKey: `${kind}:${spec.refId ?? spec.anchor?.sn ?? spec.entity?.entityKey ?? spec.claim?.claimKey ?? spec.query?.q ?? appCtx.pn}`,
      topicId: t?.id || null, workspaceId: state.activeWorkspaceId || null,
      at: nowIso(), label: String(spec.label || '').slice(0, 160), note: String(spec.note || ''),
      ...(spec.anchor ? { anchor: spec.anchor } : {}),
      ...(spec.entity ? { entity: spec.entity } : {}),
      ...(spec.claim ? { claim: spec.claim } : {}),
      ...(spec.query ? { query: { q: String(spec.query.q || ''), last: spec.query.last || null } } : {}),
    };
    // idempotent on the refKey — pinning the same thing twice keeps the first record
    const dupe = state.pins.find((p) => p.refKey === pin.refKey);
    if (dupe) return dupe;
    state.pins.push(pin);
    appCtx.logIt('pin', `Pinned ${kind} — ${pin.label || pin.refKey}`);
    appCtx.persist(); emit('pins');
    return pin;
  };
  const pinRemove = (id) => {
    const before = state.pins.length;
    state.pins = state.pins.filter((p) => p.id !== id);
    if (state.pins.length !== before) { appCtx.persist(); emit('pins'); }
  };
  const pinUpdate = (id, patch = {}) => {
    const p = state.pins.find((x) => x.id === id);
    if (!p) return null;
    if (patch.note != null) p.note = String(patch.note);
    if (patch.label != null) p.label = String(patch.label).slice(0, 160);
    if (patch.queryLast && p.query) p.query.last = patch.queryLast;
    appCtx.persist(); emit('pins');
    return p;
  };
  const pins = () => state.pins;

  // Mint an anchor at a place in a source — the pin affordances all come through here.
  const anchorAt = (snId, { unit = null, quote = null } = {}) => {
    const src = appCtx.sourceBySn(snId);
    if (!src) return null;
    const doc = Number.isInteger(unit) ? appCtx.docFor(src) : null;
    return anchorFor({ src, doc, unit, quote });
  };
  // Resolve a pin's anchor down the honesty ladder (anchor.js). The sn is tried first; if the
  // registry row is gone or renumbered, the source is re-found by its content hash before the
  // ladder runs.
  const pinResolve = (pin) => {
    const a = pin?.anchor;
    if (!a) return null;
    let src = a.sn ? appCtx.sourceBySn(a.sn) : null;
    if (!src && a.sourceSha) src = state.sources.find((s) => s.sha === a.sourceSha) || null;
    if (!src && a.docId) src = state.sources.find((s) => s.docId === a.docId) || null;
    const r = resolveAnchor(a, src);
    if (src && r.jump) r.jump.sn = src.sn;   // follow a renumbered registry row
    return r;
  };

  Object.assign(appCtx, { pins, pinAdd, pinRemove, pinUpdate, pinResolve, anchorAt });
};
