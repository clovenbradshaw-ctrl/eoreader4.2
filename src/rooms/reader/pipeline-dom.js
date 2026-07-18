// EO: SIG(Field → Entity, Binding) — the pipeline surface's shared DOM vocabulary
// pipeline-dom.js — the style sheet, tiny element builders, and pure geometry the pipeline
// surface's canvas/inspector modules share. Kept apart from pipeline-surface.js (the mount +
// interaction wiring) purely to hold each file under the repo's god-module ceiling
// (tests/size-ratchet.test.js) — there is no independent concern here beyond "shared constants".
export const STYLE_ID = 'eo-pipe-style';
export const CSS = `
.eo-pipe-overlay{position:fixed;inset:0;z-index:2147482800;display:none;flex-direction:column;background:#FCFCFD;font:13px/1.4 system-ui,-apple-system,sans-serif;color:#2A2A32}
.eo-pipe-overlay.eo-pipe-open{display:flex}
.eo-pipe-bar{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #EAEAEF;background:#fff}
.eo-pipe-bar select,.eo-pipe-bar button{font:12.5px/1.4 system-ui,sans-serif}
.eo-pipe-bar select{padding:6px 8px;border-radius:7px;border:1px solid #E0E0E6;background:#fff;color:#2A2A32}
.eo-pipe-bar button{padding:6px 11px;border-radius:7px;border:1px solid #E0E0E6;background:#fff;color:#3A3A44;cursor:pointer}
.eo-pipe-bar button:hover{background:#F5F5F8}
.eo-pipe-bar .eo-pipe-run{background:#5B4BE6;border-color:#5B4BE6;color:#fff;font-weight:600}
.eo-pipe-bar .eo-pipe-run:hover{filter:brightness(1.06)}
.eo-pipe-bar .eo-pipe-spacer{flex:1}
.eo-pipe-status{font-size:11.5px;color:#8A8A95}
.eo-pipe-body{flex:1;min-height:0;display:flex}
.eo-pipe-palette{flex:0 0 200px;overflow-y:auto;border-right:1px solid #EFEFF3;background:#fff;padding:10px}
.eo-pipe-pal-group{font-family:ui-monospace,monospace;font-size:10px;font-weight:700;letter-spacing:.06em;color:#9A9AA4;margin:12px 4px 6px}
.eo-pipe-pal-group:first-child{margin-top:2px}
.eo-pipe-pal-btn{display:block;width:100%;text-align:left;padding:7px 9px;margin-bottom:4px;border-radius:7px;border:1px solid #EAEAEF;background:#fff;cursor:pointer;font-size:12px;color:#3A3A44}
.eo-pipe-pal-btn:hover{background:#F5F5F8;border-color:#DCDCE4}
.eo-pipe-canvas-wrap{flex:1;position:relative;overflow:auto;background:
  linear-gradient(#F1F1F5 1px,transparent 1px) 0 0/24px 24px,
  linear-gradient(90deg,#F1F1F5 1px,transparent 1px) 0 0/24px 24px,#FAFAFC}
.eo-pipe-canvas{position:relative;width:2400px;height:1400px}
.eo-pipe-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.eo-pipe-edge{stroke:#B8B8C4;stroke-width:2;fill:none}
.eo-pipe-node{position:absolute;width:172px;border-radius:10px;border:1.5px solid #E0E0E6;background:#fff;box-shadow:0 1px 3px rgba(20,20,30,.06);user-select:none;cursor:grab}
.eo-pipe-node.eo-pipe-sel{border-color:#5B4BE6;box-shadow:0 0 0 3px rgba(91,75,230,.18)}
.eo-pipe-node-hd{display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid #F0F0F4;font-weight:650;font-size:12px}
.eo-pipe-node-cat{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
.eo-pipe-node-body{padding:6px 9px 9px;font-size:11px;color:#8A8A95;min-height:16px}
.eo-pipe-port{position:absolute;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:#fff;border:2px solid #9A9AA4;cursor:crosshair;pointer-events:auto}
.eo-pipe-port:hover{border-color:#5B4BE6;background:#EEEBFE}
.eo-pipe-port-in{left:-7px}
.eo-pipe-port-out{right:-7px}
.eo-pipe-status-dot{position:absolute;top:-5px;right:-5px;width:11px;height:11px;border-radius:50%;border:2px solid #fff}
.eo-pipe-inspector{flex:0 0 260px;overflow-y:auto;border-left:1px solid #EFEFF3;background:#fff;padding:14px}
.eo-pipe-field{margin-bottom:12px}
.eo-pipe-field label{display:block;font-size:11px;font-weight:600;color:#6E6E78;margin-bottom:4px}
.eo-pipe-field input,.eo-pipe-field select{width:100%;padding:6px 8px;border-radius:6px;border:1px solid #E0E0E6;font-size:12.5px;box-sizing:border-box}
.eo-pipe-empty{color:#9A9AA4;font-size:12px;padding:8px 2px}
.eo-pipe-batch-note{font-size:11px;color:#5B4BE6;background:#EEEBFE;border-radius:6px;padding:6px 8px;margin-bottom:10px}
.eo-pipe-src-row{display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:12px}
.eo-pipe-src-row:hover{background:#F5F5F8}
.eo-pipe-log{flex:0 0 auto;max-height:120px;overflow-y:auto;border-top:1px solid #EAEAEF;background:#FBFBFD;padding:6px 12px;font-size:11px;font-family:ui-monospace,monospace;display:none}
.eo-pipe-log.eo-pipe-log-open{display:block}
.eo-pipe-log-row{padding:2px 0;color:#3A3A44}
.eo-pipe-log-row.eo-pipe-log-err{color:#B23A2E}
`;

export const CATEGORY_COLOR = { source: '#1E8A50', process: '#C79A3A', output: '#5B4BE6' };
export const STATUS_COLOR = { ok: '#1E8A50', err: '#B23A2E', idle: '#D8D8DE' };
export const NODE_WIDTH = 172;

export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
export const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};

// portPos/bezier — pure canvas geometry: where a node's in/out port sits, and the cubic bezier
// path between an upstream out-port and a downstream in-port (a fixed horizontal handle length,
// clamped so a very close pair still curves rather than folding back on itself).
export const portPos = (node, side) => ({ x: node.x + (side === 'in' ? 0 : NODE_WIDTH), y: node.y + 20 });
export const bezier = (a, b) => {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
};
