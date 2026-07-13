// EO: NUL(Network,Lens → Void, Clearing) — mountDagSurface renderer
// mountDagSurface — the dag holon's own mountable surface (sibling to research's
// mountResearchSurface and doc's mountDocSurface). The holon owns its rendering; the app
// only hands it a container and the parsed sources. Pure DOM, browser-safe.
//
// It draws the two cursors over a live corpus of sources:
//   Cursor 2 — the causal DAG the sources are READ as asserting (stance-typed, sourced,
//              with the confounders / mechanisms / Pearl's question).
//   Cursor 1 — the reading flow within one document (sentences + discourse relations).
//
// Nothing it shows is a fact: every edge is a reading, traced to the passage that made it.

import { assertedDag, corpusDag, distinguishingEvidence, scopeAssertedDag } from './index.js';
import { discourseDag } from './discourse.js';

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const el = (t, a = {}, kids = []) => { const n = document.createElement(t);
  for (const k in a) { if (k === 'text') n.textContent = a[k]; else if (k === 'html') n.innerHTML = a[k]; else n.setAttribute(k, a[k]); }
  for (const c of [].concat(kids)) if (c) n.appendChild(c); return n; };
const S = (t, a = {}, kids = []) => { const n = document.createElementNS(NS, t);
  for (const k in a) n.setAttribute(k, a[k]);
  for (const c of [].concat(kids)) if (c) n.appendChild(c); return n; };

const STYLE_ID = 'dg-surface-style';
const CSS = `
.dagsurf{--dg-ess:#3b46c4;--dg-gen:#0c8f7f;--dg-acc:#8a94a6;--dg-warm:#c9760a;--dg-con:#c0344d;
  --dg-ink:var(--ink,#15181e);--dg-muted:var(--ink3,#6b7280);--dg-line:var(--line2,#e5e7eb);
  --dg-panel:var(--card,#fff);--dg-panel2:var(--app,#f7f8fb);--dg-focus:#3b46c4;
  font-family:var(--sans,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif);color:var(--dg-ink);font-size:14px;line-height:1.5;padding:12px 14px 40px}
@media (prefers-color-scheme:dark){.dagsurf{--dg-ess:#7c85f2;--dg-gen:#37bcaa;--dg-acc:#6c7684;--dg-warm:#e0942f;--dg-con:#e26a82;--dg-focus:#7c85f2}}
:root[data-theme="dark"] .dagsurf{--dg-ess:#7c85f2;--dg-gen:#37bcaa;--dg-acc:#6c7684;--dg-warm:#e0942f;--dg-con:#e26a82;--dg-focus:#7c85f2}
:root[data-theme="light"] .dagsurf{--dg-ess:#3b46c4;--dg-gen:#0c8f7f;--dg-acc:#8a94a6;--dg-warm:#c9760a;--dg-con:#c0344d;--dg-focus:#3b46c4}
.dagsurf .dg-mono{font-family:var(--mono,ui-monospace,'SF Mono',Menlo,Consolas,monospace)}
.dagsurf .dg-thesis{font-family:var(--serif,Georgia,serif);font-style:italic;font-size:12.5px;color:var(--dg-muted);max-width:70ch;margin:14px 0 0;line-height:1.5}
.dagsurf .dg-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 4px}
.dagsurf .dg-chip{font-family:var(--mono,monospace);font-size:11px;background:var(--dg-panel2);border:1px solid var(--dg-line);border-radius:999px;padding:3px 9px;color:var(--dg-muted)}
.dagsurf .dg-chip b{color:var(--dg-ink)}
.dagsurf .dg-tabs{display:flex;gap:4px;margin:12px 0 0;border-bottom:1px solid var(--dg-line)}
.dagsurf .dg-tab{background:none;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;font-size:12.5px;font-weight:600;color:var(--dg-muted);padding:7px 10px;cursor:pointer}
.dagsurf .dg-tab[aria-selected="true"]{color:var(--dg-ink);border-bottom-color:var(--dg-focus)}
.dagsurf .dg-note{font-size:12px;color:var(--dg-muted);margin:11px 0 4px;max-width:64ch}
.dagsurf .dg-stage{background:var(--dg-panel);border:1px solid var(--dg-line);border-radius:12px;margin-top:10px;overflow:hidden}
.dagsurf .dg-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 12px;border-bottom:1px solid var(--dg-line);background:var(--dg-panel2)}
.dagsurf .dg-legend{display:flex;flex-wrap:wrap;gap:11px;font-size:11px;color:var(--dg-muted)}
.dagsurf .dg-lg{display:flex;align-items:center;gap:5px;white-space:nowrap}
.dagsurf .dg-toggle{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dg-ink);cursor:pointer}
.dagsurf .dg-toggle input{accent-color:var(--dg-warm)}
.dagsurf .dg-scroll{overflow-x:auto}
.dagsurf svg.dg-graph,.dagsurf svg.dg-flow{display:block;width:100%;height:auto;font-family:var(--mono,monospace)}
.dagsurf svg.dg-graph{min-width:280px}.dagsurf svg.dg-flow{min-width:520px}
.dagsurf .dg-node rect{fill:var(--dg-panel);stroke:var(--dg-line);stroke-width:1.5;filter:drop-shadow(0 1px 2px rgba(20,20,30,.08))}
.dagsurf .dg-node text{fill:var(--dg-ink);font-size:12.5px;font-weight:600;font-family:var(--sans,system-ui,sans-serif)}
.dagsurf .dg-node .dg-sub{fill:var(--dg-muted);font-size:9px}
.dagsurf .dg-node.dim{opacity:.3}.dagsurf .dg-node.warm rect{stroke:var(--dg-warm);stroke-width:2.5}
.dagsurf .dg-node.sel rect{stroke:var(--dg-focus);stroke-width:2.5}
.dagsurf .dg-edge{fill:none;cursor:pointer}.dagsurf .dg-edge.dim{opacity:.13}
.dagsurf .dg-hit{fill:none;stroke:transparent;stroke-width:16;cursor:pointer}
.dagsurf .dg-elabel{font-size:10.5px;font-weight:600;font-family:var(--sans,system-ui,sans-serif);cursor:pointer;
  paint-order:stroke;stroke:var(--dg-panel);stroke-width:4px;stroke-linejoin:round}
.dagsurf .dg-elabel.dim{opacity:.13}
.dagsurf .dg-cring{fill:none;stroke:var(--dg-con);stroke-width:1.3;stroke-dasharray:2 3;opacity:.85}
.dagsurf .dg-cunder{fill:none;stroke:var(--dg-con);stroke-width:6;opacity:.18;stroke-linecap:round}
.dagsurf .dg-edge{transition:opacity .15s}.dagsurf .dg-node rect{transition:opacity .15s}
.dagsurf .dg-insp{border-top:1px solid var(--dg-line)}
.dagsurf .dg-insp-empty{padding:14px 12px;color:var(--dg-muted);font-size:12.5px}
.dagsurf .dg-insp-head{padding:11px 12px 4px;display:flex;gap:9px;align-items:baseline;flex-wrap:wrap}
.dagsurf .dg-insp-title{font-family:var(--mono,monospace);font-size:14px;font-weight:600}
.dagsurf .dg-insp-sub{font-size:11.5px;color:var(--dg-muted)}
.dagsurf .dg-claims{list-style:none;margin:0;padding:4px 12px 14px;display:flex;flex-direction:column;gap:8px}
.dagsurf .dg-claim{border:1px solid var(--dg-line);border-radius:9px;padding:9px 11px;background:var(--dg-panel2)}
.dagsurf .dg-ctop{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:5px}
.dagsurf .dg-stance{font-family:var(--mono,monospace);font-size:10px;font-weight:600;padding:2px 7px;border-radius:999px;color:#fff}
.dagsurf .dg-stance.essential{background:var(--dg-ess)}.dagsurf .dg-stance.generative{background:var(--dg-gen)}.dagsurf .dg-stance.accidental{background:var(--dg-acc)}
.dagsurf .dg-srcid{font-family:var(--mono,monospace);font-size:10px;color:var(--dg-muted)}
.dagsurf .dg-passage{font-family:var(--mono,monospace);font-size:11.5px;color:var(--dg-ink);line-height:1.5}
.dagsurf .dg-passage mark{background:color-mix(in srgb,var(--dg-focus) 22%,transparent);color:var(--dg-ink);padding:0 2px;border-radius:3px}
.dagsurf .dg-meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:10px;color:var(--dg-muted);font-family:var(--mono,monospace)}
.dagsurf .dg-rc{display:inline-flex;align-items:center;gap:4px}
.dagsurf .dg-rcbar{width:40px;height:5px;border-radius:3px;background:var(--dg-line);overflow:hidden}
.dagsurf .dg-rcbar i{display:block;height:100%;background:var(--dg-focus)}
.dagsurf .dg-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:14px}
.dagsurf .dg-card{background:var(--dg-panel);border:1px solid var(--dg-line);border-radius:12px;padding:13px 14px}
.dagsurf .dg-card h4{margin:0 0 3px;font-size:12px;display:flex;align-items:center;gap:7px}
.dagsurf .dg-card .dot{width:8px;height:8px;border-radius:50%}
.dagsurf .dg-card p.k{font-size:11px;color:var(--dg-muted);margin:1px 0 8px}
.dagsurf .dg-item{font-size:12px;padding:8px 0;border-top:1px solid var(--dg-line)}
.dagsurf .dg-item:first-of-type{border-top:0}
.dagsurf .dg-item code{font-family:var(--mono,monospace);background:var(--dg-panel2);border:1px solid var(--dg-line);border-radius:5px;padding:1px 4px;font-size:11px}
.dagsurf .dg-q{font-family:var(--serif,Georgia,serif);font-style:italic;font-size:12px;color:var(--dg-ink);margin:2px 0 5px}
.dagsurf .dg-silent{font-family:var(--mono,monospace);font-size:10px;color:var(--dg-con);font-weight:600}
.dagsurf .dg-snode circle{fill:var(--dg-panel2);stroke:var(--dg-line);stroke-width:1.5;cursor:pointer}
.dagsurf .dg-snode.sel circle{stroke:var(--dg-focus);stroke-width:2.5}
.dagsurf .dg-snum{font-size:10px;fill:var(--dg-muted)}
.dagsurf .dg-darc{fill:none;stroke-width:2}
.dagsurf .dg-sread{padding:12px;border-top:1px solid var(--dg-line);font-family:var(--mono,monospace);font-size:12px;line-height:1.55}
.dagsurf .dg-intra{display:inline-block;font-family:var(--mono,monospace);font-size:10px;padding:1px 6px;border-radius:999px;margin:2px 4px 0 0;border:1px solid var(--dg-line)}
.dagsurf .dg-empty{padding:22px 4px;color:var(--dg-muted);font-size:13px;max-width:60ch}
.dagsurf .dg-hidden{display:none}
.dagsurf .dg-scope{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11.5px;color:var(--dg-muted);background:var(--dg-panel2);border:1px solid var(--dg-line);border-radius:8px;padding:6px 10px;margin:8px 0 2px}
.dagsurf .dg-scope b{color:var(--dg-ink);font-weight:600}
.dagsurf .dg-scope-clear{margin-left:auto;border:1px solid var(--dg-line);background:var(--dg-panel);color:var(--dg-focus);border-radius:999px;font-size:11px;font-weight:600;padding:3px 10px;cursor:pointer}
.dagsurf .dg-scope-clear:hover{background:var(--dg-panel2)}
`;

const SC = { essential: 'var(--dg-ess)', generative: 'var(--dg-gen)', accidental: 'var(--dg-acc)' };
const DC = { contrast: 'var(--dg-con)', consequence: 'var(--dg-gen)', reason: 'var(--dg-ess)', condition: 'var(--dg-warm)', sequence: 'var(--dg-muted)', elaboration: 'var(--dg-acc)' };

// Mount the surface into `root`. `sources` is [{ docId, sentences }]; `primaryId` names the
// document cursor 1 reads (defaults to the first). Returns { destroy }.
export function mountDagSurface(root, { sources = [], primaryId = null, hidden = null, focus = null, focusLabel = null, onFocusClear = null, onFocus = null } = {}) {
  if (!document.getElementById(STYLE_ID)) document.head.appendChild(el('style', { id: STYLE_ID, text: CSS }));
  root.innerHTML = '';
  const wrap = el('div', { class: 'dagsurf' });
  root.appendChild(wrap);

  const usable = (sources || []).filter((s) => s && (s.sentences || []).length);
  if (!usable.length) {
    wrap.appendChild(el('div', { class: 'dg-empty', text: 'No source read yet — import a document or read a URL, then reopen this panel.' }));
    return { destroy() { wrap.remove(); } };
  }

  // Cursor 2 over the whole corpus, then SCOPED to what the viewer left on (entity on/off toggles)
  // and, when a focus entity is named, to that entity's causal neighbourhood — the "DAG for this
  // one entity". The unscoped graph is kept so a "show all" clears back to the entire topic.
  const asserted = assertedDag(usable);
  const scoped = scopeAssertedDag(asserted, { hidden, focus });
  const visKeys = new Set(scoped.nodes.map((n) => n.key));
  const dist = distinguishingEvidence(corpusDag(usable))
    .filter((d) => d.edge.split('→').every((k) => visKeys.has(k)));
  const primary = usable.find((s) => s.docId === primaryId) || usable[0];
  const discourse = discourseDag({ docId: primary.docId, sentences: primary.sentences });
  const isScoped = scoped !== asserted;   // hidden and/or focus are in force

  // Counts — the always-true trio, plus the trouble counts only when they exist
  // (a row of zeroes reads as noise, not reassurance).
  const chips = el('div', { class: 'dg-chips' });
  [['edges', scoped.edges.length], ['nodes', scoped.nodes.length], ['sources', usable.length],
   ['contested', scoped.edges.filter((e) => e.contested).length],
   ['confounders', scoped.complexities.confounding.length], ['mechanisms', scoped.complexities.mechanism.length]]
    .filter(([k, v], i) => i < 3 || v > 0)
    .forEach(([k, v]) => chips.appendChild(el('span', { class: 'dg-chip' }, [el('b', { text: String(v) }), document.createTextNode(' ' + k)])));
  wrap.appendChild(chips);

  // The scope banner — names what is being shown (one entity's neighbourhood, and/or a count of
  // entities turned off) and offers one click back to the whole topic. The toggles themselves are
  // the host's control column; this only reflects and clears the scope.
  if (isScoped) {
    const banner = el('div', { class: 'dg-scope' });
    const focusName = focus ? (focusLabel || focus) : null;
    const nHidden = hidden ? (hidden instanceof Set ? hidden.size : (hidden.length || 0)) : 0;
    banner.appendChild(document.createTextNode(focusName ? 'Showing ' : 'Showing the whole topic'));
    if (focusName) banner.appendChild(el('b', { text: focusName }));
    if (nHidden) banner.appendChild(document.createTextNode(` · ${nHidden} ${nHidden === 1 ? 'entity' : 'entities'} hidden`));
    if (onFocusClear) {
      const clr = el('button', { class: 'dg-scope-clear', text: focusName ? 'show the whole topic' : 'show all entities' });
      clr.onclick = () => { try { onFocusClear(); } catch (e) { /* host owns the reset */ } };
      banner.appendChild(clr);
    }
    wrap.appendChild(banner);
  }

  const tabs = el('div', { class: 'dg-tabs', role: 'tablist' });
  const t2 = el('button', { class: 'dg-tab', role: 'tab', 'aria-selected': 'true', text: 'Causal map · what the sources claim' });
  const t1 = el('button', { class: 'dg-tab', role: 'tab', 'aria-selected': 'false', text: 'Reading flow · sentence by sentence' });
  tabs.appendChild(t2); tabs.appendChild(t1); wrap.appendChild(tabs);

  const view2 = el('div');
  const view1 = el('div', { class: 'dg-hidden' });
  wrap.appendChild(view2); wrap.appendChild(view1);
  t2.onclick = () => { t2.setAttribute('aria-selected', 'true'); t1.setAttribute('aria-selected', 'false'); view2.classList.remove('dg-hidden'); view1.classList.add('dg-hidden'); };
  t1.onclick = () => { t1.setAttribute('aria-selected', 'true'); t2.setAttribute('aria-selected', 'false'); view1.classList.remove('dg-hidden'); view2.classList.add('dg-hidden'); };

  buildCursor2(view2, scoped, dist, { onFocus, focus });
  buildCursor1(view1, discourse, primary.docId);

  // No causal claim read in this scope — open on the reading flow, which renders for ANY
  // doc with sentences, so the surface never lands on the empty-cursor message. The causal
  // map (and its "no causal claim" account) stays one tab away.
  if (!scoped.edges.length) t1.onclick();

  // The honesty framing — real, but a footnote, not a gate the reader must climb over
  // before seeing the graph.
  wrap.appendChild(el('p', { class: 'dg-thesis', html:
    'A causal effect is a counterfactual — not in any text. So nothing here says “X causes Y”: every arrow is what the reader <b>reads the sources as claiming</b>, traced to the passage, typed by the stance the source proposed — and never upgraded, because only a design can.' }));

  return { destroy() { wrap.remove(); } };
}

function legendLine(color, dash) {
  const s = S('svg', { width: '24', height: '10', viewBox: '0 0 24 10' });
  s.appendChild(S('line', { x1: '1', y1: '5', x2: '23', y2: '5', stroke: color, 'stroke-width': '2.5', ...(dash ? { 'stroke-dasharray': '5 4' } : {}) }));
  return s;
}

const markerLabel = (m) => (m === 'cause-link' ? 'because' : m);
const STANCE_HINT = { essential: 'claims a cause', generative: 'shows a mechanism', accidental: 'correlation only' };

// The node's display label. The key stays the identity ("pavement"); the label is what
// a person reads ("impervious pavement"). Each phrase is cleaned of the leading
// connective/determiner an NP capture can drag along ("and runoff" → "runoff"), then the
// SHORTEST cleaned phrase still fuller than the key wins — the fullest is often a misread
// that swallowed the sentence frame ("some studies suggest tree cover"), the shortest
// fuller one is the construct itself ("tree cover").
const LEAD_NOISE = /^(?:and|or|but|so|nor|yet|the|a|an|its|their|his|her|our|your|my|this|that|these|those|some|any|also|then|thus|however)\s+/i;
const cleanLabel = (s) => { let t = String(s).trim(); for (let i = 0; i < 3 && LEAD_NOISE.test(t); i++) t = t.replace(LEAD_NOISE, ''); return t; };
export const dagNodeLabel = (n) => {
  const key = String(n.key || '');
  const cands = [...new Set((n.labels || []).map(cleanLabel).filter(Boolean))];
  const fuller = cands.filter((l) => l.length > key.length).sort((a, b) => a.length - b.length);
  return fuller[0] || cands[0] || key;
};
const bestLabel = dagNodeLabel;

// Wrap a label to at most two lines, split at the space nearest the middle. A one-word
// overflow is clipped with an ellipsis — the inspector shows the full phrase on click.
const wrapLabel = (s, max = 16) => {
  const t = String(s);
  if (t.length <= max) return [t];
  const ws = t.split(/\s+/).filter(Boolean);
  const clip = (x) => (x.length > max + 8 ? x.slice(0, max + 7) + '…' : x);
  if (ws.length === 1) return [clip(t)];
  let cut = 1, diff = Infinity;
  for (let i = 1; i < ws.length; i++) {
    const d = Math.abs(ws.slice(0, i).join(' ').length - ws.slice(i).join(' ').length);
    if (d < diff) { diff = d; cut = i; }
  }
  return [clip(ws.slice(0, cut).join(' ')), clip(ws.slice(cut).join(' '))];
};

// The verb to print on an arrow — the wording of the edge's most confidently read claim
// ("reduces", "increases", "because"), with a count when several readings back it.
const edgeVerb = (e) => {
  const rep = e.claims.reduce((b, c) => (!b || c.readerConfidence > b.readerConfidence ? c : b), null);
  const verb = rep ? markerLabel(rep.marker) : '';
  return e.claims.length > 1 ? `${verb} ×${e.claims.length}` : verb;
};

function buildCursor2(root, a, dist, opts = {}) {
  root.appendChild(el('p', { class: 'dg-note', html: 'Arrows read downward — a source claims the upper box <b>affects</b> the lower, in the arrow’s own word. <span style="color:var(--dg-warm);font-weight:600">Amber</span> marks a common cause that may explain another arrow. Tap an arrow to read the exact sentences behind it.' }));
  if (!a.edges.length) {
    root.appendChild(el('div', { class: 'dg-empty', text: 'No causal claim was read in these sources. The reader fires only on an explicit causal or association word — a floor on what the corpus states, never a ceiling.' }));
    return;
  }
  // Confounder forks and stance predicates, computed up front — the legend shows only
  // the arrow kinds actually drawn, not the whole vocabulary.
  const confZ = new Set(a.complexities.confounding.map((c) => c.confounder));
  const forks = new Set(); a.complexities.confounding.forEach((c) => { const [x, y] = c.edge.split('→'); forks.add(c.confounder + '→' + x); forks.add(c.confounder + '→' + y); });
  const strongest = (e) => SC[e.strongestProposed] || 'var(--dg-acc)';
  const accOnly = (e) => e.stanceTally.essential === 0 && e.stanceTally.generative === 0;
  const plain = a.edges.filter((e) => !forks.has(e.from + '→' + e.to));

  const stage = el('div', { class: 'dg-stage' });
  const head = el('div', { class: 'dg-head' });
  const legend = el('div', { class: 'dg-legend' });
  [['claims a cause', 'var(--dg-ess)', false, plain.some((e) => !accOnly(e) && e.strongestProposed === 'essential')],
   ['shows how', 'var(--dg-gen)', false, plain.some((e) => !accOnly(e) && e.strongestProposed === 'generative')],
   ['correlation only', 'var(--dg-acc)', true, plain.some(accOnly)],
   ['common cause', 'var(--dg-warm)', false, forks.size > 0]]
    .filter(([, , , show]) => show)
    .forEach(([n, c, d]) => legend.appendChild(el('span', { class: 'dg-lg' }, [legendLine(c, d), document.createTextNode(n)])));
  head.appendChild(legend);
  stage.appendChild(head);

  const scroll = el('div', { class: 'dg-scroll' });
  // ── TOP-DOWN layered layout — fits a narrow side panel. Root causes at the top,
  // outcomes at the bottom; a barycenter pass orders each row to reduce crossings.
  const layer = {}; a.nodes.forEach((n) => layer[n.key] = 0);
  for (let pass = 0; pass < a.nodes.length; pass++) { let ch = false;
    a.edges.forEach((e) => { if (layer[e.to] < layer[e.from] + 1) { layer[e.to] = layer[e.from] + 1; ch = true; } }); if (!ch) break; }
  const maxL = Math.max(0, ...Object.values(layer));
  const rows = []; for (let L = 0; L <= maxL; L++) rows[L] = a.nodes.filter((n) => layer[n.key] === L).map((n) => n.key);
  const parents = {}; a.edges.forEach((e) => (parents[e.to] = parents[e.to] || []).push(e.from));
  const idx = {}; rows.forEach((col) => col.forEach((k, i) => idx[k] = i));
  const bc = (k) => { const ps = (parents[k] || []).filter((p) => layer[p] === layer[k] - 1); return ps.length ? ps.reduce((s, p) => s + idx[p], 0) / ps.length : idx[k]; };
  for (let L = 1; L <= maxL; L++) { rows[L].sort((x, y) => bc(x) - bc(y)); rows[L].forEach((k, i) => idx[k] = i); }

  // Every node draws its FULL phrase label (wrapped to two lines), not the bare head
  // key — "impervious pavement", never "pavement". Rows are sized to the real box
  // widths and the SVG renders 1:1 — a dense row scrolls sideways instead of crushing
  // every box into the panel width and clipping the labels to confetti.
  const byKey = {}; a.nodes.forEach((n) => byKey[n.key] = n);
  const lines = {}; a.nodes.forEach((n) => lines[n.key] = wrapLabel(bestLabel(n)));
  const PADX = 18, ROW = 108, TOP = 40, GAPX = 22, CHW = 7.6;
  const nw = (k) => Math.max(64, Math.max(...lines[k].map((l) => l.length)) * CHW + 24);
  const nh = (k) => (lines[k].length > 1 ? 48 : 34);
  const rowW = rows.map((col) => col.reduce((s, k) => s + nw(k), 0) + GAPX * Math.max(0, col.length - 1));
  const W = Math.max(360, ...rowW.map((w) => w + 2 * PADX));
  const pos = {};
  rows.forEach((col, L) => {
    let xc = (W - rowW[L]) / 2;
    col.forEach((k) => { pos[k] = { x: xc + nw(k) / 2, y: TOP + L * ROW }; xc += nw(k) + GAPX; });
  });
  const H = TOP + maxL * ROW + 52;
  const svg = S('svg', { class: 'dg-graph', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'causal DAG' });
  svg.style.width = W + 'px';   // natural size; .dg-scroll pans when the panel is narrower
  scroll.appendChild(svg); stage.appendChild(scroll);
  const insp = el('div', { class: 'dg-insp' }, [el('div', { class: 'dg-insp-empty', text: 'Tap an arrow to read the sentences behind it.' })]);
  stage.appendChild(insp); root.appendChild(stage);

  const defs = S('defs');
  [['essential', 'var(--dg-ess)'], ['generative', 'var(--dg-gen)'], ['accidental', 'var(--dg-acc)'], ['warm', 'var(--dg-warm)']]
    .forEach(([n, c]) => { const m = S('marker', { id: 'dgar-' + n, viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto' });
      m.appendChild(S('path', { d: 'M0,0 L10,5 L0,10 z', fill: c })); defs.appendChild(m); });
  svg.appendChild(defs);

  a.edges.forEach((e, ei) => {
    const p1 = pos[e.from], p2 = pos[e.to]; if (!p1 || !p2) return;
    const x1 = p1.x, y1 = p1.y + nh(e.from) / 2, x2 = p2.x, y2 = p2.y - nh(e.to) / 2, my = (y1 + y2) / 2;
    const d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
    const key = e.from + '→' + e.to, isFork = forks.has(key);
    const color = isFork ? 'var(--dg-warm)' : strongest(e);
    if (e.contested) svg.appendChild(S('path', { d, class: 'dg-cunder' }));
    const path = S('path', { d, class: 'dg-edge', 'data-edge': key, stroke: color, 'stroke-width': String(Math.min(4, 1.6 + e.claims.length * 0.55)),
      'marker-end': `url(#dgar-${isFork ? 'warm' : (accOnly(e) ? 'accidental' : e.strongestProposed)})`, ...(accOnly(e) && !isFork ? { 'stroke-dasharray': '6 5' } : {}) });
    svg.appendChild(path);
    const hit = S('path', { d, class: 'dg-hit', 'data-edge': key }); svg.appendChild(hit);
    // The arrow says its word: "causes", "reduces", "because" — the exact marker the
    // reader fired on, in the edge's own colour, haloed so it stays legible over lines.
    const lbl = S('text', { x: String((x1 + x2) / 2), y: String((y1 + y2) / 2 + (ei % 2 ? 12 : -5)),
      'text-anchor': 'middle', class: 'dg-elabel', 'data-edge': key, fill: color }, [document.createTextNode(edgeVerb(e))]);
    svg.appendChild(lbl);
    const sel = () => selectEdge(key); path.addEventListener('click', sel); hit.addEventListener('click', sel); lbl.addEventListener('click', sel);
  });
  a.nodes.forEach((n) => {
    const p = pos[n.key]; if (!p) return; const w = nw(n.key), h = nh(n.key), ls = lines[n.key];
    const g = S('g', { class: 'dg-node' + (confZ.has(n.key) ? ' warm' : ''), 'data-node': n.key });
    g.appendChild(S('rect', { x: String(p.x - w / 2), y: String(p.y - h / 2), width: String(w), height: String(h), rx: '9' }));
    ls.forEach((line, li) => {
      const y = ls.length > 1 ? p.y - 3 + li * 15 : p.y + 4;
      g.appendChild(S('text', { x: String(p.x), y: String(y), 'text-anchor': 'middle' }, [document.createTextNode(line)]));
    });
    g.style.cursor = 'pointer'; g.addEventListener('click', () => selectNode(n));
    svg.appendChild(g);
  });

  function clearHi() { svg.querySelectorAll('.dg-edge,.dg-node,.dg-elabel').forEach((x) => x.classList.remove('dim', 'sel')); }
  function selectEdge(key) { clearHi();
    svg.querySelectorAll('.dg-edge,.dg-elabel').forEach((p) => { if (p.getAttribute('data-edge') !== key) p.classList.add('dim'); });
    const [f, t] = key.split('→');
    svg.querySelectorAll('.dg-node').forEach((g) => { const k = g.getAttribute('data-node'); if (k !== f && k !== t) g.classList.add('dim'); else g.classList.add('sel'); });
    edgeInspector(a.edges.find((e) => e.from + '→' + e.to === key));
  }
  function selectNode(n) { clearHi();
    svg.querySelectorAll('.dg-node').forEach((g) => { if (g.getAttribute('data-node') !== n.key) g.classList.add('dim'); else g.classList.add('sel'); });
    svg.querySelectorAll('.dg-edge,.dg-elabel').forEach((p) => { const [f, t] = p.getAttribute('data-edge').split('→'); if (f !== n.key && t !== n.key) p.classList.add('dim'); });
    insp.innerHTML = '';
    const head = el('div', { class: 'dg-insp-head' }, [el('span', { class: 'dg-insp-title', text: bestLabel(n) }),
      el('span', { class: 'dg-insp-sub', text: `talked about in ${n.sources.length} source${n.sources.length > 1 ? 's' : ''}: ${n.sources.join(', ')}` })]);
    // "focus the DAG here" — scope cursor 2 to this node's causal neighbourhood (the DAG for this
    // one entity). Offered only when the host wired a focus handler and this isn't already the focus.
    if (opts.onFocus && opts.focus !== n.key) {
      const fb = el('button', { class: 'dg-scope-clear', text: 'focus the DAG here →' });
      fb.style.marginLeft = 'auto';
      fb.onclick = () => { try { opts.onFocus(n.key, n.key); } catch (e) { /* host owns focus */ } };
      head.appendChild(fb);
    }
    insp.appendChild(head);
    insp.appendChild(el('div', { class: 'dg-claims' }, [el('div', { class: 'dg-passage', text: 'read from: ' + n.labels.map((l) => '“' + l + '”').join('  ') })]));
  }
  function edgeInspector(e) {
    insp.innerHTML = '';
    const tally = Object.entries(e.stanceTally).filter(([, v]) => v).map(([k, v]) => `${STANCE_HINT[k] || k} ×${v}`).join(' · ');
    insp.appendChild(el('div', { class: 'dg-insp-head' }, [el('span', { class: 'dg-insp-title', text: `${e.from} → ${e.to}` }),
      el('span', { class: 'dg-insp-sub', text: `${e.claims.length} reading${e.claims.length > 1 ? 's' : ''}: ${tally}${e.contested ? ' — the sources disagree' : ''}` })]));
    const ul = el('ul', { class: 'dg-claims' });
    e.claims.forEach((c) => {
      const t = c.src.text, [s0, s1] = c.src.span;
      const passage = el('div', { class: 'dg-passage', html: esc(t.slice(0, s0)) + '<mark>' + esc(t.slice(s0, s1)) + '</mark>' + esc(t.slice(s1)) });
      const rc = el('span', { class: 'dg-rc' }, [document.createTextNode('read-conf')]);
      const bar = el('span', { class: 'dg-rcbar' }); const i = el('i'); i.style.width = Math.round(c.readerConfidence * 100) + '%'; bar.appendChild(i);
      rc.appendChild(bar); rc.appendChild(document.createTextNode(c.readerConfidence.toFixed(2)));
      ul.appendChild(el('li', { class: 'dg-claim' }, [
        el('div', { class: 'dg-ctop' }, [el('span', { class: 'dg-stance ' + c.stance, text: STANCE_HINT[c.stance] || c.stance, title: c.stance }), el('span', { class: 'dg-srcid', text: `${c.src.docId} · s${c.src.sentIdx}` })]),
        passage,
        el('div', { class: 'dg-meta' }, [el('span', { text: 'word: ' + markerLabel(c.marker) }), el('span', { text: c.polarity === '−' ? 'no effect found' : 'effect claimed' }), (c.modality === 'epistemic' ? el('span', { text: 'hedged' }) : null), rc].filter(Boolean)),
      ]));
    });
    insp.appendChild(ul);
  }

  // cards — only the ones with something to say. A wall of "(none surfaced)" placeholders
  // buried the graph; an absent card IS the report that nothing of that kind was read.
  const cards = el('div', { class: 'dg-cards' });
  const card = (title, color, sub, items) => {
    if (!items.length) return;
    const c = el('div', { class: 'dg-card' });
    const h = el('h4', {}, [el('span', { class: 'dot' }), document.createTextNode(title)]); h.querySelector('.dot').style.background = color; c.appendChild(h);
    if (sub) c.appendChild(el('p', { class: 'k', text: sub }));
    items.forEach((i) => c.appendChild(i));
    cards.appendChild(c);
  };
  card('Common causes', 'var(--dg-warm)', 'something the sources say drives both ends of another arrow',
    a.complexities.confounding.map((c) => el('div', { class: 'dg-item' }, [el('div', {}, [el('code', { text: c.confounder }), document.createTextNode(' may explain '), el('code', { text: c.edge.replace('→', ' → ') })]),
      el('div', { style: 'color:var(--dg-muted);font-size:11px;margin-top:3px', text: 'so that arrow could be a coincidence — the sources can’t rule it out, only a real experiment can.' })])));
  card('Mechanisms', 'var(--dg-gen)', 'a step-by-step path the sources spell out',
    a.complexities.mechanism.map((m) => el('div', { class: 'dg-item' }, [el('code', { text: m.path.join(' → ') })])));
  card('What would settle it', 'var(--dg-con)', 'the evidence that would decide — and whether the sources have it',
    dist.flatMap((d) => d.tests.map((t) => el('div', { class: 'dg-item' }, [el('div', {}, [el('code', { text: d.edge })]),
      el('div', { class: 'dg-q', text: t.question }), el('div', { class: 'dg-silent', text: t.corpusHas ? 'corpus contains this evidence' : 'NO — the corpus is silent on it' })]))));
  if (cards.childNodes.length) root.appendChild(cards);
  else root.appendChild(el('p', { class: 'dg-note', text: 'No common cause, mechanism chain, or cross-source disagreement was read in these sources — those panels appear when sources overlap or contradict.' }));
}

function buildCursor1(root, d, docId) {
  root.appendChild(el('p', { class: 'dg-note', html: `The flow of content within <b>${esc(docId)}</b> — its sentences in reading order and the discourse relations it draws between them. Blind to the described world: the same word “because” is a <span style="color:var(--dg-ess);font-weight:600">reason</span> arc here and a causal edge over there.` }));
  const stage = el('div', { class: 'dg-stage' });
  const head = el('div', { class: 'dg-head' });
  const legend = el('div', { class: 'dg-legend' });
  [['reason', 'var(--dg-ess)'], ['contrast', 'var(--dg-con)'], ['consequence', 'var(--dg-gen)'], ['sequence', 'var(--dg-muted)'], ['elaboration', 'var(--dg-acc)'], ['condition', 'var(--dg-warm)']]
    .forEach(([n, c]) => legend.appendChild(el('span', { class: 'dg-lg' }, [legendLine(c, false), document.createTextNode(n)])));
  head.appendChild(legend); stage.appendChild(head);
  const scroll = el('div', { class: 'dg-scroll' });
  const nodes = d.sentenceNodes, n = nodes.length;
  const W = Math.max(560, n * 78), PADX = 34, baseY = 118, VBH = 156;
  const svg = S('svg', { class: 'dg-flow', viewBox: `0 0 ${W} ${VBH}`, role: 'img' });
  scroll.appendChild(svg); stage.appendChild(scroll);
  const sread = el('div', { class: 'dg-sread', text: 'Select a sentence to read it, and its discourse moves.' });
  stage.appendChild(sread); root.appendChild(stage);
  const gap = (W - 2 * PADX) / Math.max(1, n - 1); const x = (i) => PADX + i * gap;
  svg.appendChild(S('line', { x1: String(x(0)), y1: String(baseY), x2: String(x(n - 1)), y2: String(baseY), stroke: 'var(--dg-line)', 'stroke-width': '2' }));
  d.discourseLinks.filter((l) => l.grain === 'inter').forEach((l) => {
    const x1 = x(l.from), x2 = x(l.to), h = baseY - 46;
    svg.appendChild(S('path', { d: `M${x1},${baseY - 10} C${x1},${h} ${x2},${h} ${x2},${baseY - 10}`, class: 'dg-darc', stroke: DC[l.type] || 'var(--dg-muted)' }));
    svg.appendChild(S('text', { x: String((x1 + x2) / 2), y: String(h - 4), 'text-anchor': 'middle', class: 'dg-elabel' }, [document.createTextNode(l.connective)]));
  });
  nodes.forEach((s, i) => {
    const g = S('g', { class: 'dg-snode', 'data-i': String(i) });
    g.appendChild(S('circle', { cx: String(x(i)), cy: String(baseY), r: '12' }));
    g.appendChild(S('text', { x: String(x(i)), y: String(baseY + 4), 'text-anchor': 'middle', class: 'dg-snum' }, [document.createTextNode(String(i + 1))]));
    g.addEventListener('click', () => {
      svg.querySelectorAll('.dg-snode').forEach((q) => q.classList.toggle('sel', +q.getAttribute('data-i') === i));
      sread.innerHTML = '';
      sread.appendChild(el('span', { style: 'color:var(--dg-muted)', text: `sentence ${i + 1} — ` }));
      sread.appendChild(document.createTextNode(s.text));
      const intra = d.discourseLinks.filter((l) => l.grain === 'intra' && l.at === i);
      if (intra.length) { const box = el('div'); intra.forEach((l) => { const c = el('span', { class: 'dg-intra', text: l.connective + ' · ' + l.type }); c.style.borderColor = DC[l.type] || 'var(--dg-line)'; c.style.color = DC[l.type] || 'var(--dg-muted)'; box.appendChild(c); }); sread.appendChild(box); }
    });
    svg.appendChild(g);
  });
}
