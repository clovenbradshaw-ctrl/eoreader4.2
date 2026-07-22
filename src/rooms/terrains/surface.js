// EO: INS·CON·EVA(Entity,Link,Lens → …, Making,Binding) — the terrain-overlay DOM surface
// surface.js — framework-free, so it drops into a standalone page (terrains.html) or a panel
// the same way plain/replay/render do. It paints the buildOverlay() fold over one passage and
// lets the person toggle which of the nine terrains is drawn.
//
// The switcher IS the cube. It renders core/cube.js TERRAINS as a 3×3 grid (domain rows × grain
// columns), so the choices on offer are literally the Site face. The grain of a terrain dictates
// HOW it can be drawn, and the surface honours that: Figure → crisp inline marks that STACK;
// Pattern → a categorical recolour of the figures, or a region tint; Ground → the ambient medium
// (absence-marks or a page wash). Because a page washes one way and figures recolour one way,
// recolour and wash are single-select; only the marks stack. That restraint is the grain speaking.
//
// Click any mark → the three operators of that terrain's domain (operatorsByDomain), the same §9
// move the plain room makes: the thing you clicked already is a terrain.
//
// The scene the surface paints is not fixed to the worked passage: the source bar can load any
// CSV/TSV of short feedback-shaped text through feedback.js's sceneFromCSV, which folds a table
// into this same nine-terrain shape (see feedback.js's own header for the per-terrain pipeline).
// Every lookup below reads the CURRENT scene, never the imported fixture, so the two sources are
// interchangeable.

import { buildOverlay } from './overlay.js';
import * as SCENE from './scene.js';
import { sceneFromCSV } from './feedback.js';
import { TERRAINS, DOMAINS, terrainInfo, operatorsByDomain } from '../../core/index.js';
import {
  esc, withAlpha, CSS, ACTION, DOMAIN_HUE, KIND_HUE, CLUSTER_HUE, TONE_HUE, FRAME_HUE,
  identityHues, hueForEntity, huesForKeys,
} from './theme.js';
import { drawArcs } from './draw.js';

const COLS = ['Figure', 'Pattern', 'Ground'];   // the answer's order
const IDENT_INK = '#7f8a9c';                     // identity entities: one quiet underline, not a rainbow

export function mountTerrainSurface(root, { scene: initialScene = SCENE } = {}) {
  let scene = initialScene;
  // Merged UNDER the fixed dictionaries so the worked passage's designed colours never move;
  // only keys a loaded scene invents (an open-ended CSV category, say) fall back to a generated
  // hue instead of uniform grey. Recomputed whenever the scene changes (loadScene below).
  let idHues, kindPalette, clusterPalette, tonePalette, framePalette;
  const recomputePalettes = () => {
    idHues = identityHues(scene.ENTITIES);
    kindPalette = { ...huesForKeys(scene.ENTITIES.map((e) => e.kind)), ...KIND_HUE };
    clusterPalette = { ...huesForKeys(scene.ENTITIES.map((e) => e.cluster)), ...CLUSTER_HUE };
    tonePalette = { ...huesForKeys(scene.ATMOSPHERE.map((a) => a.hue)), ...TONE_HUE };
    framePalette = { ...huesForKeys(scene.PARADIGM.map((p) => p.frame)), ...FRAME_HUE };
  };
  recomputePalettes();

  const st = {
    inline: new Set(['entity']),   // Figure/Void marks that stack — Entity on by default (calm)
    recolor: 'identity',           // identity | kind | network  (single-select)
    wash: 'none',                  // none | field | atmosphere | paradigm  (single-select)
    pop: null,                     // { mark, x, y }
  };
  // Source-bar state, kept out of `st` (which overlay.js's channels own) but reset the same way.
  const src = { kind: 'demo', label: 'the worked passage', note: '', error: null, pasteOpen: false };

  const shell = document.createElement('div');
  shell.className = 'tr';
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  root.appendChild(shell);

  const isOn = (terrain) => {
    const a = ACTION[terrain]; if (!a) return false;
    return a.channel === 'inline' ? st.inline.has(a.key)
      : a.channel === 'recolor' ? st.recolor === a.key : st.wash === a.key;
  };

  // Inline stacks; recolour/wash are single-select (click the active one to turn it off). A
  // recolour is OF the figures, so it turns entities on.
  const toggle = (terrain) => {
    const a = ACTION[terrain]; if (!a) return;
    if (a.channel === 'inline') st.inline.has(a.key) ? st.inline.delete(a.key) : st.inline.add(a.key);
    else if (a.channel === 'recolor') { st.recolor = st.recolor === a.key ? 'identity' : a.key; if (st.recolor !== 'identity') st.inline.add('entity'); }
    else st.wash = st.wash === a.key ? 'none' : a.key;
    st.pop = null; render();
  };

  // Swap the painted scene (demo passage ↔ a loaded CSV). A pure state change — the channels in
  // `st` carry over as-is, so switching source keeps whatever terrains were on.
  const setScene = (next, meta = {}) => {
    scene = next; recomputePalettes();
    src.kind = meta.kind || 'custom'; src.label = meta.label || ''; src.note = meta.note || ''; src.error = null;
    st.pop = null; render();
  };

  const describeCSV = (next, label) => {
    const m = next.meta || {};
    const parts = [`${next.SENTENCES.length} row${next.SENTENCES.length === 1 ? '' : 's'}`, `reading \`${m.textColumn || '?'}\``];
    if (m.sentimentColumn) parts.push(`sentiment from \`${m.sentimentColumn}\``);
    if (m.categoryColumn) parts.push(`grouped by \`${m.categoryColumn}\``);
    if (m.flagColumn) parts.push(`flags from \`${m.flagColumn}\``);
    if (m.truncated) parts.push(`first ${m.rows} rows only`);
    return `${label} · ${parts.join(' · ')}`;
  };

  const loadCSVText = (text, label) => {
    try {
      const next = sceneFromCSV(text);
      setScene(next, { kind: 'csv', label, note: describeCSV(next, label) });
    } catch (e) {
      src.error = `Could not read "${label}" as a feedback table: ${String((e && e.message) || e)}`;
      render();
    }
  };

  // ── the cube switcher (a projection of core/cube.js) ──
  const renderCube = () => {
    let html = `<div class="tr-cube">${COLS.map((g) => `<div class="tr-ch">${esc(g)}</div>`).join('')}`;
    for (const d of DOMAINS) {
      html += `<div class="tr-dh">${esc(d)}</div>`;
      for (const g of COLS) {
        const terrain = TERRAINS[d][g];
        const hue = DOMAIN_HUE[d];
        html += `<button class="tr-cell${isOn(terrain) ? ' on' : ''}" data-terrain="${esc(terrain)}"
          style="--dot:${hue};--dotbg:${withAlpha(hue, .13)}">
          <div class="tn">${esc(terrain)}</div><div class="th">${esc(ACTION[terrain]?.hint || '')}</div></button>`;
      }
    }
    return html + `</div>`;
  };

  // ── the source bar — demo passage vs. a loaded CSV of feedback (feedback.js) ──
  const renderSource = () => `
    <div class="tr-source">
      <div class="tr-src-row">
        <span class="tr-src-label">${src.kind === 'csv' ? '▦ table' : '¶ passage'}</span>
        <button class="tr-src-btn${src.kind === 'demo' ? ' on' : ''}" data-src="demo">Demo passage</button>
        <button class="tr-src-btn" data-src="file">Load CSV…</button>
        <button class="tr-src-btn${src.pasteOpen ? ' on' : ''}" data-src="paste">Paste CSV</button>
        <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" class="tr-src-file" hidden />
      </div>
      ${src.pasteOpen ? `<div class="tr-src-paste">
        <textarea placeholder="header row, then one feedback row per line…" rows="4"></textarea>
        <button class="tr-src-use">Use this</button>
      </div>` : ''}
      ${src.note ? `<div class="tr-src-stat">${esc(src.note)}</div>` : ''}
      ${src.error ? `<div class="tr-src-err">${esc(src.error)}</div>` : ''}
    </div>`;

  const renderLegend = (model) => {
    const rows = [];
    if (model.legend.recolor) {
      const pal = st.recolor === 'kind' ? kindPalette : clusterPalette;
      rows.push(`<div class="lh">entities · by ${esc(model.legend.recolor.by)}</div>`);
      for (const k of model.legend.recolor.keys)
        rows.push(`<div class="row"><span class="sw" style="background:${pal[k] || '#8b93a2'}"></span>${esc(k)}</div>`);
    }
    if (model.legend.wash) {
      rows.push(`<div class="lh" style="margin-top:${rows.length ? '12px' : '0'}">page · ${esc(model.legend.wash.of)}${model.legend.wash.lo ? ` (${esc(model.legend.wash.lo)}→${esc(model.legend.wash.hi)})` : ''}</div>`);
      if (st.wash === 'atmosphere') for (const k of model.legend.wash.keys)
        rows.push(`<div class="row"><span class="sw" style="background:${tonePalette[scene.ATMOSPHERE.find((a) => a.tone === k)?.hue] || '#8b93a2'}"></span>${esc(k)}</div>`);
      if (st.wash === 'paradigm') for (const k of model.legend.wash.keys)
        rows.push(`<div class="row"><span class="sw" style="background:${framePalette[k] || '#8b93a2'}"></span>${esc(k)}</div>`);
    }
    return rows.length ? `<div class="tr-legend">${rows.join('')}</div>` : '';
  };

  // ── one sentence: its atoms wrapped by their top layer, plus a wash ──
  const renderSentence = (s) => {
    const atoms = s.atoms.map((atom) => {
      if (!atom.top) return esc(atom.text);
      if (atom.top === 'entity') {
        const m = atom.marks.find((x) => x.layer === 'entity');
        const hue = st.recolor === 'identity' ? IDENT_INK : hueForEntity(m, st.recolor, idHues, kindPalette, clusterPalette);
        return `<span class="tr-m tr-ent" data-mark="entity" data-ent="${esc(m.id)}" data-sent="${s.sent}"
          style="--entc:${hue};--enth:${withAlpha(hue, .16)}">${esc(atom.text)}</span>`;
      }
      if (atom.top === 'lens') {
        const m = atom.marks.find((x) => x.layer === 'lens');
        return `<span class="tr-m tr-lens" data-mark="lens" data-lens="${esc(m.id)}" data-sent="${s.sent}">${esc(atom.text)}</span>`;
      }
      if (atom.top === 'link') {
        const m = atom.marks.find((x) => x.layer === 'link');
        return `<span class="tr-m tr-link" data-mark="link" data-rel="${esc(m.rel)}" data-sent="${s.sent}">${esc(atom.text)}</span>`;
      }
      if (atom.top === 'void') return `<span class="tr-m tr-void" data-mark="void" data-vi="${atom.marks.find((x) => x.layer === 'void')?.vi ?? 0}" data-sent="${s.sent}">${esc(atom.text)}<span class="tr-vmark">○</span></span>`;
      return esc(atom.text);
    }).join('');

    const w = s.wash;
    let cls = 'tr-sent', st2 = '', bar = '', brk = '';
    if (w?.kind === 'field') bar = `<span class="fld" style="background:linear-gradient(${withAlpha('#5bc6c2', 0.1)}, ${withAlpha('#5bc6c2', 0.15 + 0.7 * (w.v || 0))})"></span>`;
    if (w?.kind === 'atmosphere') { const h = tonePalette[w.hue] || '#8b93a2'; cls += ' tr-band'; st2 = `--bandc:${h};background:${withAlpha(h, .06)}`; }
    if (w?.kind === 'paradigm') {
      const h = framePalette[w.frame] || '#8b93a2'; cls += ' tr-band'; st2 = `--bandc:${h};background:${withAlpha(h, .055)}`;
      if (w.break) brk = `<span class="tr-brk">${esc(w.note || 'the frame turns here')}</span>`;
    }
    return `${brk}<div class="${cls}" style="${st2}">${bar}${atoms}</div>`;
  };

  const render = () => {
    const model = buildOverlay(st, scene);
    shell.innerHTML = `
      <div class="tr-head">
        <div class="tr-title">Terrains over text · ${esc(model.title)}</div>
        <div class="tr-sub">The nine terrains of the cube's Site face, painted over one passage. Figure marks stack · Pattern recolours or tints a region · Ground washes the page. Tap a terrain; click any mark for its three operators.</div>
      </div>
      ${renderSource()}
      <div class="tr-body">
        <div class="tr-side">
          <div class="tr-kick">The cube — tap a terrain</div>
          ${renderCube()}
          ${renderLegend(model)}
          <div class="tr-note">This switcher is <b>core/cube.js</b> rendered directly — rows are the three domains, columns the three grains. The grain decides how each can be drawn, which is why washes and recolours are one at a time and only the marks stack.</div>
        </div>
        <div class="tr-read"><div class="tr-doc">
          ${model.sentences.map(renderSentence).join('')}
          <svg class="tr-arcs"></svg>
        </div></div>
      </div>`;

    shell.querySelectorAll('.tr-cell').forEach((el) => el.addEventListener('click', () => toggle(el.dataset.terrain)));
    shell.querySelectorAll('[data-mark]').forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      st.pop = { mark: { ...el.dataset }, x: r.left + r.width / 2, y: r.bottom + 8 }; renderPop();
    }));

    const demoBtn = shell.querySelector('[data-src="demo"]');
    if (demoBtn) demoBtn.addEventListener('click', () => setScene(SCENE, { kind: 'demo', label: 'the worked passage' }));
    const fileBtn = shell.querySelector('[data-src="file"]');
    const fileInput = shell.querySelector('.tr-src-file');
    if (fileBtn && fileInput) fileBtn.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      loadCSVText(await file.text(), file.name || 'CSV file');
    });
    const pasteBtn = shell.querySelector('[data-src="paste"]');
    if (pasteBtn) pasteBtn.addEventListener('click', () => { src.pasteOpen = !src.pasteOpen; render(); });
    const useBtn = shell.querySelector('.tr-src-use');
    const pasteArea = shell.querySelector('.tr-src-paste textarea');
    if (useBtn && pasteArea) useBtn.addEventListener('click', () => {
      if (pasteArea.value.trim()) loadCSVText(pasteArea.value, 'pasted CSV');
    });

    drawArcs(shell, model);
    renderPop();
  };

  // ── popover: the three operators of the clicked terrain's domain (the §9 move) ──
  const TERRAIN_OF_MARK = { entity: 'Entity', link: 'Link', lens: 'Lens', void: 'Void' };
  const WHY = {
    Entity: 'A Figure of Existence: a specific named thing — so it draws as a crisp inline mark.',
    Link:   'A Figure of Structure: a specific relation — a mark on the verb and an arc to its object.',
    Lens:   'A Figure of Interpretation: one reading of a word — its senses are the frames it can be read under.',
    Void:   'A Ground terrain: not a thing that is there, but the medium around it — so it marks an absence.',
  };
  const renderPop = () => {
    const old = shell.querySelector('.tr-pop-wrap'); if (old) old.remove();
    if (!st.pop) return;
    const terrain = TERRAIN_OF_MARK[st.pop.mark.mark]; if (!terrain) return;
    const info = terrainInfo(terrain);
    const ops = info?.domain ? operatorsByDomain(info.domain) : [];
    const rows = ops.map((o) => `<div class="tr-q"><span class="g">${esc(o.glyph)}</span><span class="qt">${esc(o.label)}</span><span class="op">${esc(o.id)}</span></div>`).join('');
    let extra = '';
    if (terrain === 'Lens') {
      const lx = scene.LENSES.find((l) => l.id === st.pop.mark.lens);
      if (lx) extra = `<div class="rule"></div><div class="tk" style="margin-bottom:5px">read it as</div>` +
        lx.senses.map((se) => `<div class="tr-sense"><div class="sl">${esc(se.label)}</div><div class="sg">${esc(se.gloss)}</div></div>`).join('');
    }
    if (terrain === 'Void') {
      const v = scene.VOIDS[Number(st.pop.mark.vi) || 0];
      if (v) extra = `<div class="rule"></div><div class="tk" style="margin-bottom:5px">what the record is silent on</div><div class="tr-vn">${esc(v.note)}</div>`;
    }
    const w = document.createElement('div');
    w.className = 'tr-pop-wrap';
    const left = Math.min(Math.max(8, st.pop.x - 154), (window.innerWidth || 1200) - 320);
    w.innerHTML = `<div class="tr-pop" style="left:${left}px;top:${st.pop.y}px">
      <div class="tk">${esc(info?.domain || '')} · ${esc(info?.grain || '')}</div>
      <h4>${esc(terrain)}</h4>
      <div class="tr-why">${esc(WHY[terrain] || '')}</div>
      <div class="rule"></div>
      <div class="tk" style="margin-bottom:4px">its three operators</div>
      ${rows}${extra}</div>`;
    w.addEventListener('click', (e) => { if (e.target === w) { st.pop = null; renderPop(); } });
    shell.appendChild(w);
  };

  const onResize = () => drawArcs(shell, buildOverlay(st, scene));
  window.addEventListener('resize', onResize);

  render();
  return { el: shell, state: st, toggle, setScene, destroy: () => { window.removeEventListener('resize', onResize); shell.remove(); style.remove(); } };
}
