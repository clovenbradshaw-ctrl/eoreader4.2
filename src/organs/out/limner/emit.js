// EO: INS(Lens → Void, Making) — INS — emit the view event
// organs/out/limner/emit.js — INS: instantiate the view in the event log.
//
// LIMNER emits exactly ONE event per successful render (docs/limner.md §2, §7):
// an INS of a VIEW ARTIFACT. It writes no graph content — it projects what is
// already there — so the event is tagged `kind: 'view'`, and the graph fold
// skips it (core/project.js): a render must never appear as a figure in the doc
// it draws. The event carries the resolution triple §7 specifies, adapted to
// this log's append shape (ad-hoc fields beside `op`, the ingestion convention):
//
//   { op:'INS', kind:'view', site:<view_target>,
//     resolution: { spec_hash, render_hash, kind, log_cursor } }
//
// Because the render is deterministic, `render_hash` is a stable content
// address — the SVG can be stored to OPFS and mirrored to archive on the same
// path NPJ media takes, with the log holding only the pointer.

import { specHash, fnvHash } from './spec.js';

// emitRender(log, spec, svg, opts) → { eventId, spec_hash, render_hash }
//   opts.site   where the view attaches (a query / doc / session marker)
//   opts.t      timestamp override (the log defaults to Date.now)
export const emitRender = (log, spec, svg, opts = {}) => {
  const spec_hash = specHash(spec);
  const render_hash = fnvHash(svg);
  if (!log || typeof log.append !== 'function') {
    // No log in scope (a headless/offline render, e.g. a test or REC dreaming
    // with no doc attached): still return the content addresses so the caller
    // can store/compare the artifact; just nothing is logged.
    return { eventId: null, spec_hash, render_hash };
  }
  const ev = log.append({
    op: 'INS',
    kind: 'view',                       // the project.js guard reads this — not a figure
    site: opts.site ?? null,
    resolution: Object.freeze({
      spec_hash,
      render_hash,
      kind: spec.kind,
      log_cursor: spec.source?.log_cursor ?? null,
    }),
    label: `view:${spec.kind}`,
    ...(opts.t != null ? { t: opts.t } : {}),
  });
  return { eventId: ev.seq, spec_hash, render_hash };
};
