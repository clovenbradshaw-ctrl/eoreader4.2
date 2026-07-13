// EO: INS·NUL(Field → Entity,Void, Making,Clearing) — the Replay DOM surface
// surface.js — a surface for watching something get read. Framework-free, so it owes
// nothing to the host runtime and drops into any element (a standalone page or a panel).
//
// Everything it paints is a projection of collapse.foldReading(scene, { enabled, cursor }).
// It holds three pieces of state — which sources are switched on, where the cursor is, and
// the transport speed — and re-derives the whole reading from them on every frame. There is
// no saved transcript: flip a source and the words re-collapse in front of you; scrub back
// and the graph un-grows. The state is a replay, never a save.

import {
  foldReading, collapseToken, totalCorpusMass, corpusMass, CORPUS_BASE,
} from './collapse.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The transport speeds. 1× is not real time — it is READING speed, the pace a person can
// follow the structured output. `ms` is milliseconds per segment (one facing-page line).
// ⚡instant is what runs in production; the others exist so a person can watch and disagree.
const SPEEDS = [
  { key: '0.25', label: '¼×', sub: 'slow',    ms: 9600 },
  { key: '1',    label: '1×', sub: 'read',    ms: 2600 },
  { key: '4',    label: '4×', sub: 'skim',    ms: 650 },
  { key: '16',   label: '16×', sub: 'scan',   ms: 170 },
  { key: 'inf',  label: '⚡instant', sub: 'done', ms: 0 },
];

const CSS = `
.rp{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36;
  --accent:#7bd0ff;--warn:#e0a24a;--void:#b98bff;--hot:#5bd08a;--edge:#4aa3df;--absence:#b98bff;
  --mono:'SFMono-Regular',ui-monospace,Menlo,Consolas,monospace;--sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.55;
  display:flex;flex-direction:column;height:100%;min-height:0}
@media (prefers-color-scheme:light){.rp{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec}}
:root[data-theme="dark"] .rp{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36}
:root[data-theme="light"] .rp{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec}
.rp *{box-sizing:border-box}
.rp button{font-family:var(--sans);font-size:13px;padding:6px 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);cursor:pointer;transition:.12s}
.rp button:hover{border-color:var(--accent)}

/* transport */
.rp-transport{flex:0 0 auto;background:var(--panel);border-bottom:1px solid var(--line);padding:12px 16px}
.rp-tline{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.rp-title{font-weight:650;font-size:14px}
.rp-clock{font-family:var(--mono);font-size:12.5px;color:var(--dim);margin-left:auto}
.rp-tp{display:flex;align-items:center;gap:8px;margin-top:11px}
.rp-tp .rp-ctrl{min-width:38px;font-family:var(--mono);font-size:13px;padding:6px 9px}
.rp-scrub{flex:1;height:12px;border-radius:6px;background:var(--panel2);border:1px solid var(--line);position:relative;cursor:pointer;overflow:hidden}
.rp-scrub .rp-fill{position:absolute;top:0;left:0;bottom:0;background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 55%,transparent),var(--accent));width:0}
.rp-scrub .rp-head{position:absolute;top:-2px;width:3px;height:16px;background:var(--ink);border-radius:2px;transform:translateX(-1px)}
.rp-speed{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;align-items:flex-end}
.rp-speed .rp-sp{display:flex;flex-direction:column;align-items:center;gap:2px}
.rp-speed .rp-sp button{min-width:52px}
.rp-speed .rp-sp .lab{font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.6px}
.rp-speed .rp-sp button.on{background:var(--accent);color:#08121b;border-color:transparent;font-weight:700}

/* body grid */
.rp-body{flex:1 1 auto;min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr);gap:14px;padding:14px 16px 40px}
@media (max-width:900px){.rp-body{grid-template-columns:1fr}}
.rp-panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 15px;margin-bottom:14px}
.rp-h{font-family:var(--mono);font-size:10.5px;text-transform:uppercase;letter-spacing:1px;color:var(--dim);margin:0 0 11px}
.rp-rail{min-width:0}

/* facing page */
.rp-facing{display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:0}
@media (max-width:620px){.rp-facing{grid-template-columns:1fr}}
.rp-page{padding:2px 16px}
.rp-page.left{border-right:1px solid var(--line)}
.rp-colh{font-family:var(--mono);font-size:10px;letter-spacing:1px;color:var(--dim);text-transform:uppercase;margin-bottom:14px}
.rp-seg{padding:8px 10px;border-radius:10px;margin:2px -10px;border-left:2px solid transparent}
.rp-seg.cur{background:color-mix(in srgb,var(--accent) 9%,transparent);border-left-color:var(--accent)}
.rp-seg .rp-t{font-family:var(--mono);font-size:11px;color:var(--dim)}
.rp-seg .rp-spk{font-weight:650;font-size:12.5px;margin:2px 0 3px}
.rp-seg .rp-spk .newv{font-family:var(--mono);font-size:9.5px;color:var(--warn);border:1px solid var(--warn);border-radius:20px;padding:1px 7px;margin-left:8px;text-transform:uppercase;letter-spacing:.5px}
.rp-seg .rp-text{font-size:14px}
.rp-mark{color:var(--warn);border-bottom:1px dashed var(--warn);cursor:pointer;padding:0 1px;white-space:nowrap}
.rp-mark:hover{background:color-mix(in srgb,var(--warn) 16%,transparent);border-radius:3px}
.rp-mark .br{opacity:.55;font-family:var(--mono)}
.rp-note{margin:2px 0}
.rp-note.say{color:var(--ink);opacity:.92}
.rp-note.turn{color:var(--accent);border-left:2px solid var(--accent);padding-left:9px;font-size:13px}
.rp-note.card{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:7px 10px;font-family:var(--mono);font-size:12px}
.rp-note.edge{font-family:var(--mono);font-size:12px;color:var(--edge);background:color-mix(in srgb,var(--edge) 8%,transparent);border-radius:7px;padding:4px 9px}
.rp-legend{font-size:11.5px;color:var(--dim);margin-top:10px;padding:0 16px}
.rp-empty{color:var(--dim);text-align:center;padding:26px}

/* popover */
.rp-pop{position:fixed;z-index:40;width:min(360px,92vw);background:var(--panel);border:1px solid var(--accent);border-radius:13px;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:14px 15px}
.rp-pop h4{font-family:var(--mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--dim);margin:0 0 10px}
.rp-pop .rp-cand{display:grid;grid-template-columns:64px 1fr 42px;gap:8px;align-items:center;margin:5px 0;font-size:13px}
.rp-pop .rp-cand .w{font-weight:600}
.rp-pop .rp-cand.top .w{color:var(--accent)}
.rp-pop .rp-bar{height:11px;border-radius:5px;background:var(--panel2);overflow:hidden}
.rp-pop .rp-bar i{display:block;height:100%;background:var(--accent)}
.rp-pop .rp-cand.top .rp-bar i{background:var(--accent)}
.rp-pop .rp-cand:not(.top) .rp-bar i{background:var(--dim)}
.rp-pop .rp-p{font-family:var(--mono);font-size:12px;text-align:right;color:var(--dim)}
.rp-pop .rp-why{margin-top:12px;border-top:1px solid var(--line);padding-top:10px;font-size:12.5px;color:var(--ink);opacity:.95}
.rp-pop .rp-why b{color:var(--accent)}
.rp-pop .rp-why .flip{color:var(--warn)}
.rp-pop .rp-x{position:absolute;top:8px;right:10px;background:none;border:none;color:var(--dim);cursor:pointer;font-size:15px;padding:2px 6px}

/* reading against */
.rp-src{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:8px;cursor:pointer}
.rp-src:hover{background:var(--panel2)}
.rp-src input{width:15px;height:15px;accent-color:var(--accent)}
.rp-src .lab{flex:1;font-size:13px}
.rp-src .cnt{font-family:var(--mono);font-size:11px;color:var(--dim)}
.rp-src.itself{margin-top:6px;border-top:1px dashed var(--line);padding-top:11px}
.rp-src.itself .lab{font-style:italic;color:var(--void)}
.rp-recol{font-size:11.5px;color:var(--dim);margin-top:10px;display:flex;gap:7px;align-items:flex-start}
.rp-recol .g{color:var(--hot)}

/* attention field */
.rp-fig{display:grid;grid-template-columns:96px 1fr auto;gap:9px;align-items:center;margin:6px 0;font-size:12.5px}
.rp-fig .fl{color:var(--ink)}
.rp-fig .fbar{height:12px;border-radius:6px;background:var(--panel2);overflow:hidden}
.rp-fig .fbar i{display:block;height:100%;background:var(--hot);transition:width .5s ease}
.rp-fig .fn{font-size:11px;color:var(--dim);white-space:nowrap}
.rp-spark{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}
.rp-spark .row{display:flex;align-items:flex-end;gap:3px;height:52px}
.rp-spark .bar{flex:1;background:color-mix(in srgb,var(--warn) 45%,transparent);border-radius:2px 2px 0 0;min-height:2px}
.rp-spark .bar.peak{background:var(--warn)}
.rp-spark .cap{font-size:11px;color:var(--dim);margin-top:8px}
.rp-spark .cap b{color:var(--warn)}

/* graph */
.rp-graph svg{width:100%;height:auto;display:block}
.rp-node rect{fill:var(--panel2);stroke:var(--line);stroke-width:1.2}
.rp-node.voice rect{stroke:var(--accent);stroke-width:1.6}
.rp-node.named rect{stroke:var(--warn)}
.rp-node.subject rect{stroke:var(--edge)}
.rp-node.external rect{stroke-dasharray:2 3;fill:none}
.rp-node.absence rect{stroke:var(--absence);stroke-dasharray:3 4;fill:none}
.rp-node text{fill:var(--ink);font-size:12px;font-family:var(--sans)}
.rp-node.absence text{fill:var(--absence)}
.rp-gedge{stroke:var(--edge);stroke-width:1.4;fill:none;marker-end:url(#rp-arrow)}
.rp-gedge.dashed{stroke-dasharray:4 4;opacity:.7}
.rp-gelabel{fill:var(--dim);font-size:10.5px;font-family:var(--mono)}
.rp-gnote{fill:var(--dim);font-size:10.5px;font-style:italic}
.rp-close{margin-left:8px}
`;

// Deterministic graph layout: a curated (col,row) for the scene's known referents, with a
// grid fallback so an unknown node still lands somewhere legible. Pure — position depends
// only on the node id, never on time — so the graph grows in place as the cursor advances.
const LAYOUT = {
  neighbor: [0, 0], drones: [1, 0], staff: [1, 2],
  resident: [0, 1], city: [2, 1], MNPD: [2, 2],
  form: [0, 2],
};
const GRID = { cols: 3, cellW: 150, cellH: 92, padX: 20, padY: 24, nodeW: 118, nodeH: 42 };
const nodePos = (id, i) => {
  const [c, r] = LAYOUT[id] || [i % GRID.cols, Math.floor(i / GRID.cols)];
  return {
    x: GRID.padX + c * GRID.cellW,
    y: GRID.padY + r * GRID.cellH,
    cx: GRID.padX + c * GRID.cellW + GRID.nodeW / 2,
    cy: GRID.padY + r * GRID.cellH + GRID.nodeH / 2,
  };
};

// mountReplaySurface(el, opts) → { destroy }
//   opts.scene    the reading (SOURCES-aware) — see scene.js
//   opts.sources  [{ id, label, spans }]
//   opts.onClose  optional close handler (renders a ✕)
export const mountReplaySurface = (el, opts = {}) => {
  const scene = opts.scene;
  const sources = opts.sources || [];
  const doc = el.ownerDocument || document;

  const root = doc.createElement('div');
  root.className = 'rp';
  const style = doc.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  const stage = doc.createElement('div');
  stage.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0';
  root.appendChild(stage);
  el.appendChild(root);

  // ── state ──────────────────────────────────────────────────────────────────────
  const N = scene.segments.length;
  const st = {
    enabled: new Set(sources.map((s) => s.id)),   // the corpus in the room
    prevEnabled: null,                              // remembered when "itself only" is on
    cursor: 0,                                      // segment cursor (0..N)
    speedKey: '1',
    playing: false,
    openTok: null,                                  // { seg, tok } of the open distribution popover
  };
  let raf = 0, lastTs = 0, acc = 0;

  const speed = () => SPEEDS.find((s) => s.key === st.speedKey) || SPEEDS[1];

  // ── the play loop — advances the cursor at reading speed; instant jumps to the end ──
  const stop = () => { st.playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
  const tick = (ts) => {
    if (!st.playing) return;
    const sp = speed();
    if (sp.ms === 0) { st.cursor = N; stop(); render(); return; }
    if (!lastTs) lastTs = ts;
    acc += ts - lastTs; lastTs = ts;
    while (acc >= sp.ms && st.cursor < N) { st.cursor += 1; acc -= sp.ms; }
    if (st.cursor >= N) { st.cursor = N; stop(); }
    render();
    if (st.playing) raf = requestAnimationFrame(tick);
  };
  const play = () => {
    if (st.cursor >= N) st.cursor = 0;   // replay from the top
    if (speed().ms === 0) { st.cursor = N; render(); return; }
    st.playing = true; lastTs = 0; acc = 0; raf = requestAnimationFrame(tick);
  };

  // ── render ─────────────────────────────────────────────────────────────────────
  const render = () => {
    const view = foldReading(scene, { enabled: st.enabled, cursor: st.cursor });
    stage.innerHTML = transportHTML(view) + bodyHTML(view);
    if (st.openTok) renderPopover(view);
  };

  const transportHTML = (view) => {
    const frac = N ? view.cursor / N : 0;
    const clockNow = view.revealed.length ? view.revealed[view.revealed.length - 1].t : '00:00';
    const speedBtns = SPEEDS.map((s) => `
      <div class="rp-sp">
        <button data-act="speed" data-key="${s.key}" class="${s.key === st.speedKey ? 'on' : ''}">${esc(s.label)}</button>
        <span class="lab">${esc(s.sub)}</span>
      </div>`).join('');
    return `
    <div class="rp-transport">
      <div class="rp-tline">
        <span class="rp-title">${esc(scene.title)}</span>
        <span class="rp-clock">${esc(clockNow)} / ${esc(scene.clock.total)}</span>
        ${opts.onClose ? '<button class="rp-close" data-act="close">✕</button>' : ''}
      </div>
      <div class="rp-tp">
        <button class="rp-ctrl" data-act="restart" title="Back to start">◀◀</button>
        <button class="rp-ctrl" data-act="playpause" title="Play / pause">${st.playing ? '❚❚' : '▶'}</button>
        <button class="rp-ctrl" data-act="end" title="To the end">▶▶</button>
        <div class="rp-scrub" data-act="scrub">
          <div class="rp-fill" style="width:${(frac * 100).toFixed(1)}%"></div>
          <div class="rp-head" style="left:${(frac * 100).toFixed(1)}%"></div>
        </div>
      </div>
      <div class="rp-speed">${speedBtns}</div>
    </div>`;
  };

  // one token → left-page HTML (plain, or an uncertain word marked for click)
  const tokenHTML = (t, segIdx, tokIdx) => {
    if (t.plain) return esc(t.text);
    return `<span class="rp-mark" data-act="mark" data-seg="${segIdx}" data-tok="${tokIdx}"><span class="br">⌇</span>${esc(t.surface)}<span class="br">⌇</span></span>`;
  };

  const segLeftHTML = (r, isCur) => {
    const spk = `<div class="rp-spk">${esc(r.speaker)}:${r.isNewVoice ? '<span class="newv">new voice</span>' : ''}</div>`;
    const text = r.tokens.map((t, j) => tokenHTML(t, r.index, j)).join(' ');
    return `<div class="rp-seg ${isCur ? 'cur' : ''}"><div class="rp-t">${esc(r.t)}</div>${spk}<div class="rp-text">${text}</div></div>`;
  };
  const noteHTML = (n) => `<div class="rp-note ${esc(n.kind)}">${n.kind === 'turn' ? '← ' : ''}${esc(n.text)}</div>`;
  const segRightHTML = (r, isCur) =>
    `<div class="rp-seg ${isCur ? 'cur' : ''}"><div class="rp-t">${esc(r.t)}</div>${(r.note || []).map(noteHTML).join('')}</div>`;

  const facingHTML = (view) => {
    if (!view.revealed.length) {
      return `<div class="rp-panel"><div class="rp-empty">Press ▶ to watch this get read. 1× is reading speed — the pace you can follow the reading, not the hour and fifty-two minutes of audio.</div></div>`;
    }
    const curIdx = view.cursor - 1;
    const left = view.revealed.map((r) => segLeftHTML(r, r.index === curIdx)).join('');
    const right = view.revealed.map((r) => segRightHTML(r, r.index === curIdx)).join('');
    return `
    <div class="rp-panel">
      <div class="rp-facing">
        <div class="rp-page left"><div class="rp-colh">What arrived</div>${left}</div>
        <div class="rp-page"><div class="rp-colh">What it's making of it</div>${right}</div>
      </div>
      <div class="rp-legend">⌇ a marked word is one the machine was not certain of — click it to see what else it heard, and why it landed where it did.</div>
    </div>`;
  };

  const readingAgainstHTML = (view) => {
    const rows = sources.map((s) => `
      <label class="rp-src">
        <input type="checkbox" data-act="src" data-id="${esc(s.id)}" ${st.enabled.has(s.id) ? 'checked' : ''} ${view.itselfOnly ? 'disabled' : ''}/>
        <span class="lab">${esc(s.label)}</span>
        <span class="cnt">${s.spans} spans</span>
      </label>`).join('');
    return `
    <div class="rp-panel">
      <div class="rp-h">Reading against</div>
      ${rows}
      <label class="rp-src itself">
        <input type="checkbox" data-act="itself" ${view.itselfOnly ? 'checked' : ''}/>
        <span class="lab">itself only</span>
      </label>
      <div class="rp-recol"><span class="g">⟲</span><span>Nothing is being re-transcribed. The audio has not moved — only the reading. Every word above is re-collapsed against exactly the sources ticked here.</span></div>
    </div>`;
  };

  const whatsLiveHTML = (view) => {
    if (!view.revealed.length) return '';
    const maxV = Math.max(0.001, ...view.surprise.map((s) => s.value));
    const bars = view.surprise.map((s) =>
      `<div class="bar ${view.peak && s.index === view.peak.index ? 'peak' : ''}" style="height:${Math.round((s.value / maxV) * 100)}%" title="${esc(s.t)} · ${s.value.toFixed(2)}"></div>`).join('');
    const figs = view.figures.map((f) => `
      <div class="rp-fig">
        <span class="fl">${esc(f.label)}</span>
        <span class="fbar"><i style="width:${Math.round(f.activation * 100)}%"></i></span>
        <span class="fn">${esc(f.note)}</span>
      </div>`).join('');
    const peakCap = view.peak
      ? `<div class="cap"><b>${esc(view.peak.t)}</b> · the biggest departure so far from the running average — the line the story turns on. No model told us that.</div>`
      : '';
    return `
    <div class="rp-panel">
      <div class="rp-h">What's live right now</div>
      ${figs || '<div class="rp-empty" style="padding:10px">nothing hot yet</div>'}
      <div class="rp-spark">
        <div class="row">${bars}</div>
        <div class="cap" style="margin-top:6px;color:var(--dim)">surprise — the reading's departure from what it expected</div>
        ${peakCap}
      </div>
    </div>`;
  };

  const graphHTML = (view) => {
    if (!view.nodes.length) return '';
    const posOf = {};
    view.nodes.forEach((n, i) => { posOf[n.id] = nodePos(n.id, i); });
    // Ensure any edge endpoint that isn't a drawn node (e.g. an external referent) still
    // has a slot, so the edge lands somewhere.
    let extra = view.nodes.length;
    for (const e of view.edges) for (const id of [e.from, e.to]) if (!posOf[id]) posOf[id] = nodePos(id, extra++);
    const maxRow = Math.max(0, ...Object.values(posOf).map((p) => (p.y - GRID.padY) / GRID.cellH));
    const maxCol = Math.max(0, ...Object.values(posOf).map((p) => (p.x - GRID.padX) / GRID.cellW));
    const w = GRID.padX * 2 + (maxCol) * GRID.cellW + GRID.nodeW;
    const h = GRID.padY * 2 + (maxRow) * GRID.cellH + GRID.nodeH;

    const edgeSVG = view.edges.map((e) => {
      const a = posOf[e.from], b = posOf[e.to];
      if (!a || !b) return '';
      const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
      return `<path class="rp-gedge ${e.dashed ? 'dashed' : ''}" d="M${a.cx},${a.cy} L${b.cx},${b.cy}"/>
        <text class="rp-gelabel" x="${mx}" y="${my - 4}" text-anchor="middle">${esc(e.label)}</text>`;
    }).join('');
    const nodeSVG = view.nodes.map((n) => {
      const p = posOf[n.id];
      const cls = `rp-node ${esc(n.kind || 'plain')}`;
      const note = n.kind === 'absence' ? `<text class="rp-gnote" x="${p.x + GRID.nodeW / 2}" y="${p.y + GRID.nodeH + 13}" text-anchor="middle">nothing answers this</text>` : '';
      return `<g class="${cls}"><rect x="${p.x}" y="${p.y}" width="${GRID.nodeW}" height="${GRID.nodeH}" rx="9"/>
        <text x="${p.x + GRID.nodeW / 2}" y="${p.y + GRID.nodeH / 2 + 4}" text-anchor="middle">${esc(n.label)}</text>${note}</g>`;
    }).join('');
    return `
    <div class="rp-panel rp-graph">
      <div class="rp-h">The graph, drawing itself</div>
      <svg viewBox="0 0 ${Math.ceil(w)} ${Math.ceil(h + 18)}" role="img" aria-label="referent graph">
        <defs><marker id="rp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--edge)"/></marker></defs>
        ${edgeSVG}${nodeSVG}
      </svg>
    </div>`;
  };

  const bodyHTML = (view) => `
    <div class="rp-body">
      <div class="rp-main">${facingHTML(view)}</div>
      <div class="rp-rail">
        ${readingAgainstHTML(view)}
        ${whatsLiveHTML(view)}
        ${graphHTML(view)}
      </div>
    </div>`;

  // ── the distribution popover ("what the machine heard") ──────────────────────────
  const renderPopover = (view) => {
    const { seg, tok } = st.openTok;
    const token = scene.segments[seg]?.tokens?.[tok];
    if (!token || !Array.isArray(token.cand)) { st.openTok = null; return; }
    const col = collapseToken(token, st.enabled);
    const chosenCand = token.cand.find((c) => c.w === col.chosen);
    const total = chosenCand ? corpusMass(chosenCand, st.enabled) : 0;
    const totalAll = chosenCand ? totalCorpusMass(chosenCand) : 0;
    const acousticCand = token.cand.find((c) => c.w === col.acousticChosen);
    const zero = token.cand.find((c) => c.w !== col.chosen && totalCorpusMass(c) === 0);

    const cands = col.candidates.map((c, i) => `
      <div class="rp-cand ${i === 0 ? 'top' : ''}">
        <span class="w">${esc(c.word)}</span>
        <span class="rp-bar"><i style="width:${Math.round(c.p * 100)}%"></i></span>
        <span class="rp-p">.${String(Math.round(c.p * 100)).padStart(2, '0')}</span>
      </div>`).join('');

    let why;
    if (view.itselfOnly) {
      why = `<div class="rp-why">You are reading against <b>nothing</b> — the audio alone. This is the transcript with every assumption stripped out. It is worse, and it is more honest: <b>${esc(col.chosen)}</b> is simply the loudest hypothesis the microphone left.</div>`;
    } else if (col.corpusDecided) {
      why = `<div class="rp-why"><b>Why it landed on ${esc(col.chosen)}</b><br>
        Not because the audio was clear. It wasn't — the microphone alone preferred <span class="flip">${esc(col.acousticChosen)}</span>.
        Because <b>${esc(col.chosen)}</b> appears <b>${total}</b> ${total === 1 ? 'time' : 'times'} across the sources in the room${totalAll !== total ? ` (${totalAll} across all listed)` : ''}, and <span class="flip">${esc(col.acousticChosen)}</span> appears never.<br>
        The sound was ambiguous. The corpus wasn't.</div>`;
    } else {
      why = `<div class="rp-why"><b>Why it landed on ${esc(col.chosen)}</b><br>
        Here the microphone and the corpus agree: the audio already favoured <b>${esc(col.chosen)}</b>${total ? `, and it appears ${total} ${total === 1 ? 'time' : 'times'} in the sources` : ''}. Turn a source off and watch whether it holds.</div>`;
    }

    const pop = doc.createElement('div');
    pop.className = 'rp-pop';
    pop.innerHTML = `<button class="rp-x" data-act="closepop">✕</button><h4>What it heard</h4>${cands}${why}`;
    root.appendChild(pop);
    // position near the marked word
    const markEl = stage.querySelector(`.rp-mark[data-seg="${seg}"][data-tok="${tok}"]`);
    const r = markEl ? markEl.getBoundingClientRect() : { left: 40, bottom: 80 };
    const pw = Math.min(360, (doc.defaultView?.innerWidth || 800) * 0.92);
    let left = Math.max(8, Math.min(r.left, (doc.defaultView?.innerWidth || 800) - pw - 8));
    let top = r.bottom + 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    // flip up if it would run off the bottom
    const ph = pop.getBoundingClientRect().height;
    if (top + ph > (doc.defaultView?.innerHeight || 600) - 8 && r.top - ph - 8 > 0) {
      pop.style.top = (r.top - ph - 8) + 'px';
    }
  };

  // ── events (delegation) ──────────────────────────────────────────────────────────
  const onClick = (ev) => {
    const t = ev.target.closest('[data-act]');
    if (!t) { if (st.openTok) { st.openTok = null; render(); } return; }
    const act = t.dataset.act;
    if (act === 'closepop' || act === 'mark') { /* handled below */ }
    else if (st.openTok && act !== 'src' && act !== 'itself') { st.openTok = null; }

    switch (act) {
      case 'close': opts.onClose && opts.onClose(); return;
      case 'playpause': st.playing ? stop() : play(); render(); return;
      case 'restart': stop(); st.cursor = 0; render(); return;
      case 'end': stop(); st.cursor = N; render(); return;
      case 'speed': {
        st.speedKey = t.dataset.key;
        if (st.playing) { stop(); play(); }
        else if (st.speedKey === 'inf') { st.cursor = N; }
        render(); return;
      }
      case 'scrub': {
        const box = t.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (ev.clientX - box.left) / box.width));
        stop(); st.cursor = Math.round(frac * N); render(); return;
      }
      case 'mark': {
        const seg = +t.dataset.seg, tok = +t.dataset.tok;
        st.openTok = (st.openTok && st.openTok.seg === seg && st.openTok.tok === tok) ? null : { seg, tok };
        render(); return;
      }
      case 'closepop': st.openTok = null; render(); return;
    }
  };
  const onChange = (ev) => {
    const t = ev.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'src') {
      const id = t.dataset.id;
      if (t.checked) st.enabled.add(id); else st.enabled.delete(id);
      render();   // the whole reading re-collapses — the demonstration
    } else if (t.dataset.act === 'itself') {
      if (t.checked) { st.prevEnabled = new Set(st.enabled); st.enabled = new Set(); }
      else { st.enabled = st.prevEnabled ? new Set(st.prevEnabled) : new Set(sources.map((s) => s.id)); st.prevEnabled = null; }
      render();
    }
  };
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);

  render();
  return {
    destroy: () => { stop(); root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.remove(); },
    // exposed for tests / external drivers
    state: st,
  };
};
