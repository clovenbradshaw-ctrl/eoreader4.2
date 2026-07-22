// EO: DEF·NUL(Lens,Void → Atmosphere,Void, Dissecting,Clearing) — the demo's palette + CSS
// theme.js — everything the terrain surface paints WITH, kept out of the surface so the
// surface stays about behaviour. The channel table (grain → technique), the palettes, the
// small colour helpers, and the stylesheet.
//
// Design posture: restraint. Marks are quiet underlines, not highlighter fills; washes are
// faint bands with a coloured edge; relations are smooth arcs with a small pill label. Colour
// is spent sparingly so that turning on several terrains at once still reads as one picture.

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// CSS.escape isn't guaranteed in every embedder; a tiny local escape for attribute selectors.
export const cssEsc = (s) => String(s).replace(/["\\]/g, '\\$&');

export const withAlpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// Each terrain name → the channel its grain allows. Figure/Void mark inline (they STACK);
// Kind/Network recolour the figures (single-select); Field/Atmosphere/Paradigm wash the page
// (single-select). This table is the only place grain→technique is wired.
export const ACTION = {
  Entity:    { channel: 'inline',  key: 'entity',     hint: 'underline' },
  Kind:      { channel: 'recolor', key: 'kind',       hint: 'by type' },
  Void:      { channel: 'inline',  key: 'void',       hint: 'absences' },
  Link:      { channel: 'inline',  key: 'link',       hint: 'arrows' },
  Network:   { channel: 'recolor', key: 'network',    hint: 'by cluster' },
  Field:     { channel: 'wash',    key: 'field',      hint: 'density' },
  Lens:      { channel: 'inline',  key: 'lens',       hint: 'senses' },
  Paradigm:  { channel: 'wash',    key: 'paradigm',   hint: 'frame' },
  Atmosphere:{ channel: 'wash',    key: 'atmosphere', hint: 'tone' },
};

// Domain → a hue family (the answer's "Domain picks the hue"), desaturated so it reads calm.
export const DOMAIN_HUE = { Existence: '#5aa9e6', Structure: '#46c39e', Interpretation: '#d3a24a' };

// Categorical palettes for the recolour channels + the washes. The fixed-passage keys
// (org/product/…, governing/vendor/…, surveillance/…) sit alongside the feedback-scene keys
// (support/delivery/…, positive/negative/neutral) so either scene reads in named colour without
// touching this table again; huesForKeys() (below) covers whatever key a THIRD scene invents.
export const KIND_HUE    = { org: '#5aa9e6', product: '#d3a24a', person: '#a882e6', doc: '#46c39e', group: '#e88aa0',
  support: '#5aa9e6', delivery: '#e88aa0', speed: '#7f9cf5', staff: '#a882e6', process: '#e0975a', service: '#5bc6c2', experience: '#c78be6', general: '#8b93a2' };
export const CLUSTER_HUE = { governing: '#5aa9e6', vendor: '#d3a24a', public: '#46c39e' };
export const TONE_HUE    = { amber: '#d3a24a', blue: '#5aa9e6', violet: '#a882e6', green: '#46c39e' };
export const FRAME_HUE   = { surveillance: '#a882e6', 'public-safety': '#46c39e',
  positive: '#46c39e', negative: '#d3a24a', neutral: '#5aa9e6' };
export const ENT_HUES    = ['#5aa9e6', '#d3a24a', '#a882e6', '#46c39e', '#e88aa0', '#7f9cf5', '#e0975a', '#5bc6c2', '#c78be6'];

// A stable hue per entity id (identity recolour), by first appearance in the scene.
export const identityHues = (entities) => {
  const m = {}; let i = 0;
  for (const e of entities) if (!(e.id in m)) m[e.id] = ENT_HUES[i++ % ENT_HUES.length];
  return m;
};

// The same cycling assignment, generalized to any key list — a derived scene's category
// column (Network cluster) is open-ended (whatever values the CSV's own column carries), so
// there is no fixed table to pre-populate the way KIND_HUE/FRAME_HUE are. Merge this UNDER a
// fixed palette (`{ ...huesForKeys(keys), ...FIXED_HUE }`) so known keys keep their designed
// colour and only the unknown ones fall back to a generated one.
export const huesForKeys = (keys) => {
  const m = {}; let i = 0;
  for (const k of keys) if (k != null && !(k in m)) m[k] = ENT_HUES[i++ % ENT_HUES.length];
  return m;
};

// The hue an entity mark wears under the active recolour channel. `kindPalette`/`clusterPalette`
// default to the fixed dictionaries above but a caller painting a derived scene (feedback.js)
// passes its own merged palette (huesForKeys(...) ∪ the fixed table) so an open-ended key still
// gets a real colour instead of falling through to grey.
export const hueForEntity = (mark, recolor, idHues, kindPalette = KIND_HUE, clusterPalette = CLUSTER_HUE) =>
  recolor === 'kind'    ? (kindPalette[mark.colorKey] || '#8b93a2') :
  recolor === 'network' ? (clusterPalette[mark.colorKey] || '#8b93a2') :
                          (idHues[mark.colorKey] || idHues[mark.id] || '#8b93a2');

export const CSS = `
.tr{--bg:#0e1014;--panel:#15181f;--panel2:#1b1f28;--ink:#e9edf3;--dim:#8992a2;--faint:#606a7b;--line:#242a35;--accent:#5bc6c2;
  --neg:#e0879a;--pos:#54c69f;
  --mono:'SFMono-Regular',ui-monospace,Menlo,Consolas,monospace;--sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --serif:'Iowan Old Style','Palatino Linotype',Palatino,Georgia,ui-serif,serif;
  background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.55;display:flex;flex-direction:column;height:100%;min-height:0}
@media (prefers-color-scheme:light){.tr{--bg:#f7f8fb;--panel:#fff;--panel2:#f0f2f6;--ink:#1a1e26;--dim:#616b7a;--faint:#8b93a2;--line:#e5e9ef}}
:root[data-theme="dark"] .tr{--bg:#0e1014;--panel:#15181f;--panel2:#1b1f28;--ink:#e9edf3;--dim:#8992a2;--faint:#606a7b;--line:#242a35}
:root[data-theme="light"] .tr{--bg:#f7f8fb;--panel:#fff;--panel2:#f0f2f6;--ink:#1a1e26;--dim:#616b7a;--faint:#8b93a2;--line:#e5e9ef}
.tr *{box-sizing:border-box}
.tr-head{flex:0 0 auto;padding:15px 22px 14px;border-bottom:1px solid var(--line);background:var(--panel)}
.tr-title{font-weight:600;font-size:15px;letter-spacing:-.01em}
.tr-sub{color:var(--dim);font-size:12px;margin-top:4px;max-width:104ch}
/* source bar — demo passage vs. a loaded CSV */
.tr-source{flex:0 0 auto;padding:10px 22px;border-bottom:1px solid var(--line);background:var(--panel2)}
.tr-src-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tr-src-label{font-size:11px;color:var(--faint);letter-spacing:.04em;margin-right:2px}
.tr-src-btn{font:inherit;font-size:12px;padding:5px 11px;border-radius:999px;border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer}
.tr-src-btn:hover{border-color:var(--accent)}
.tr-src-btn.on{border-color:var(--accent);color:var(--accent);background:${withAlpha('#5bc6c2', .1)}}
.tr-src-paste{display:flex;gap:8px;margin-top:8px;align-items:flex-start}
.tr-src-paste textarea{flex:1 1 auto;font-family:var(--mono);font-size:12px;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px 10px;resize:vertical;min-height:64px}
.tr-src-use{font:inherit;font-size:12px;padding:6px 13px;border-radius:8px;border:1px solid var(--accent);background:${withAlpha('#5bc6c2', .12)};color:var(--accent);cursor:pointer;flex:0 0 auto}
.tr-src-stat{margin-top:7px;font-size:11.5px;color:var(--dim);font-family:var(--mono)}
.tr-src-err{margin-top:7px;font-size:11.5px;color:var(--neg)}
.tr-body{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:366px 1fr;overflow:hidden}
@media (max-width:840px){.tr-body{grid-template-columns:1fr;overflow:auto}}
.tr-side{border-right:1px solid var(--line);background:var(--panel);padding:20px 18px;overflow:auto}
.tr-kick{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:0 0 12px}
/* the cube switcher */
.tr-cube{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}
.tr-ch{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);text-align:center;padding-bottom:1px}
.tr-dh{grid-column:1/-1;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:11px 0 1px;padding-left:2px;font-weight:600}
.tr-dh:first-of-type{margin-top:4px}
.tr-cell{position:relative;border:1px solid var(--line);background:var(--panel2);border-radius:11px;padding:9px 8px 8px 11px;cursor:pointer;text-align:left;transition:transform .1s,border-color .12s,background .12s;color:var(--ink);overflow:hidden}
.tr-cell:hover{transform:translateY(-1px)}
.tr-cell .tn{font-weight:600;font-size:11.5px;letter-spacing:-.02em;white-space:nowrap;position:relative;z-index:1}
.tr-cell .th{font-size:9.5px;color:var(--faint);margin-top:2px;position:relative;z-index:1}
.tr-cell::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--dot);opacity:.5}
.tr-cell.on{border-color:var(--dot);background:var(--dotbg)}
.tr-cell.on .tn{color:var(--dot)}
.tr-cell.on .th{color:var(--dot);opacity:.8}
.tr-cell.on::before{opacity:1}
/* legend */
.tr-legend{margin-top:20px;font-size:12px;color:var(--dim);line-height:1.6}
.tr-legend .lh{color:var(--faint);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;margin:0 0 6px}
.tr-legend .row{display:flex;align-items:center;gap:8px;margin:4px 0}
.tr-legend .sw{width:11px;height:11px;border-radius:3px;flex:0 0 auto}
.tr-note{margin-top:22px;font-size:11.5px;color:var(--faint);line-height:1.6;border-top:1px solid var(--line);padding-top:14px}
.tr-note b{color:var(--dim);font-weight:600}
/* reading */
.tr-read{overflow:auto;min-height:0;position:relative}
.tr-doc{position:relative;max-width:34em;margin:0 auto;padding:70px 44px 90px;font-family:var(--serif);font-size:19px;line-height:2.2;color:var(--ink)}
.tr-sent{position:relative;border-radius:8px;padding:6px 12px;margin:30px -12px;transition:background .18s}
.tr-sent:first-child{margin-top:6px}
.tr-sent .fld{position:absolute;left:-4px;top:8px;bottom:8px;width:3px;border-radius:2px}
.tr-band{border-left:2px solid var(--bandc);padding-left:14px !important}
.tr-brk{display:block;font-family:var(--sans);font-size:10.5px;color:var(--dim);margin:14px 0 2px;letter-spacing:.01em;opacity:.85}
.tr-brk::before{content:'— ';color:var(--faint)}
.tr-arcs{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:2}
.tr-alabels{position:absolute;inset:0;pointer-events:none;z-index:3}
.tr-al{position:absolute;transform:translate(-50%,-100%);font-family:var(--mono);font-size:9.5px;letter-spacing:.02em;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:1.5px 7px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25)}
/* inline marks — quiet by default */
.tr-m{border-radius:3px;transition:background .12s}
.tr-ent{cursor:pointer;border-bottom:1.5px solid var(--entc,#5aa9e6);padding-bottom:1px}
.tr-ent:hover{background:var(--enth,rgba(90,169,230,.14))}
.tr-lens{cursor:pointer;border-bottom:1.5px dotted #d3a24a;padding-bottom:1px}
.tr-lens:hover{background:rgba(211,162,74,.14)}
.tr-link{cursor:pointer;color:var(--pos);font-style:italic;border-bottom:1px solid transparent}
.tr-link:hover{border-bottom-color:var(--pos)}
.tr-void{cursor:pointer;border-bottom:1.5px dashed #a882e6;padding-bottom:1px}
.tr-void:hover{background:rgba(168,130,230,.14)}
.tr-vmark{color:#a882e6;font-size:.62em;vertical-align:.35em;margin-left:1px;font-family:var(--sans)}
/* popover */
.tr-pop-wrap{position:fixed;inset:0;z-index:40}
.tr-pop{position:absolute;width:308px;font-family:var(--sans);background:var(--panel);border:1px solid var(--line);border-radius:15px;box-shadow:0 16px 48px rgba(0,0,0,.5);padding:16px 17px;font-size:14px;line-height:1.55}
.tr-pop .tk{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.tr-pop h4{margin:3px 0 0;font-size:16px;letter-spacing:-.01em}
.tr-pop .rule{height:1px;background:var(--line);margin:13px 0}
.tr-why{font-size:11.5px;color:var(--dim);margin-top:7px;line-height:1.5}
.tr-q{display:flex;gap:11px;align-items:baseline;padding:7px 7px;border-radius:9px}
.tr-q:hover{background:var(--panel2)}
.tr-q .g{font-family:var(--mono);color:var(--accent);width:16px;text-align:center;flex:0 0 auto}
.tr-q .qt{flex:1 1 auto}
.tr-q .op{font-family:var(--mono);font-size:10px;color:var(--faint)}
.tr-sense{padding:7px 7px;border-radius:9px}
.tr-sense .sl{font-weight:600}
.tr-sense .sg{color:var(--dim);font-size:12.5px;margin-top:1px}
.tr-vn{font-size:12.5px;color:var(--dim);line-height:1.55;background:var(--panel2);border-radius:9px;padding:9px 11px;margin-top:4px}
`;
