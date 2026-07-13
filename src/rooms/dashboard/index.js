// EO: NUL·SIG·EVA(Field → Lens,Void, Binding,Clearing) — barrel
// dashboard/index.js — the live-metric dashboard: pin any element on any web page and watch it.
//
// A user who understands nothing about code pastes a page's URL, CLICKS the number/price/status
// they care about (the picker reads its address for them), and gets a tile that re-pulls the page
// and re-reads that exact place every time they open the dashboard. Each pull APPENDS a reading to
// an append-only log; the tile — its value, its delta, its sparkline — is a projection of that log,
// the same log-is-truth discipline the rest of the engine keeps.
//
//   spec.js     the watch + its append-only reading log (pure state math + projections)
//   extract.js  a pulled string → the quantity it names (reuses data/values.js)
//   select.js   a clicked element → a durable CSS handle + a value pulled back out of a document
//   render.js   the reading log → a grid of tiles (pure HTML)
//   store.js    watches + reading logs, persisted (injectable storage)
//   picker.js   the point-and-click element selector (sandboxed, script-free iframe)
//   mount.js    the surface + the floating launcher + the fetch→read→append refresh cycle

export {
  WATCH_KINDS, READING_CAP, watchId, hostOf, makeWatch, upsertWatch, dropWatch, renameWatch,
  makeReading, recordReading, latest, latestOk, series, trend, sparkPoints,
} from './spec.js';
export { readValue, inferKind } from './extract.js';
export { buildSelector, extractFromDoc, labelFor } from './select.js';
export { renderDashboard, relTime, DASHBOARD_CSS } from './render.js';
export { createDashboardStore } from './store.js';
export { mountPicker } from './picker.js';
export { refreshWatch, mountDashboard, mountDashboardLauncher } from './mount.js';
