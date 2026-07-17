// EO: NUL·SIG(Field → Void,Kind, Clearing,Tending) — tiny DOM-string helpers
// util.js — the two-line helpers every surface module in this room needs:
// HTML-escaping user text before it lands in a template string, and reducing
// any thrown value to one legible line for an error banner. Split out so
// surface.js, write-panel.js and build-panel.js share one copy instead of
// three drifting ones.

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const oneLine = (err) => String(err && err.message || err || 'failed').replace(/\s+/g, ' ').trim();
