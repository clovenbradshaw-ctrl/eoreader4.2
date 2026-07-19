// EO: SIG(Link → Void, Tending) — sync export: raw JSONL
// jsonlPlan — the canonical format needs no projection: the anchor stream itself IS the
// spec. Kept as its own organ (rather than a bare JSON.stringify at the call site) so every
// sync export target, this trivial one included, goes through the same organs/out/sync
// convention — app/sync.js's syncExport dispatches to all of them uniformly.

import { toJsonl } from '../../../core/sync/index.js';

export const jsonlPlan = (header, anchors) => ({
  ext: 'jsonl', mime: 'application/x-ndjson',
  text: toJsonl(header, anchors),
});
