// EO: INS·NUL(Field → Entity,Void, Making,Clearing) — the models DOM surface
// surface.js — the model-manager surface. Framework-free (it drops into a standalone page or a
// panel) and it drives the REAL thing: every "Install" is a live createModel(id).load(onProgress),
// so the progress bar under a card is the actual weight download, not a mock. It reads and writes
// the same localStorage the reader does (eo_backend, eo_llm_speed, eo_claude_key, …), so setting a
// model active here is the exact switch the header chip makes — the reader inherits it.
//
// What it shows, per model: name · family · size / requirement, a live status badge (Not installed
// → Downloading 42% → Installed → Active, or Failed with the real error), and the actions that
// state affords — Install / Reinstall / Retry, Set active, Test, Forget. Hosted (Claude) and local
// servers (LM Studio / Ollama) are CONNECTED, not downloaded: they get an inline key / URL field.
//
// The surface holds only presentation state (which config panel is open, the last test output, the
// network verdict, what this device can run). Everything durable is the catalog folds (catalog.js)
// over localStorage; the surface is their projection plus the load driver.

import { createModel, availableBackends, describeModel, probeOrigins, explainReach } from '../../model/index.js';
import {
  buildCatalog, GROUPS, deriveStatus, installability, actionLabel, connecting,
  readInstalled, markInstalled, unmarkInstalled, writeInstalled, fmtBytes,
  ACTIVE_KEY, SPEED_KEY,
} from './catalog.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Tone → colour. One place so a badge, a progress fill, and a ring can't drift apart.
const TONE = {
  active:  'var(--ok)',
  ready:   'var(--ok)',
  busy:    'var(--warn)',
  error:   'var(--bad)',
  idle:    'var(--dim)',
  muted:   'var(--dim)',
  blocked: 'var(--bad)',
};

const CSS = `
.mdl{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36;
  --accent:#7bd0ff;--accent2:#b98bff;--ok:#59c08a;--warn:#e0b24a;--bad:#e06a5a;
  --mono:'SFMono-Regular',ui-monospace,Menlo,Consolas,monospace;--sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.5;
  display:flex;flex-direction:column;min-height:100%}
@media (prefers-color-scheme:light){.mdl{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec;--accent:#2a7fd0;--accent2:#7d4fd0;--ok:#1e8a50;--warn:#9a6b12;--bad:#c0392b}}
:root[data-theme="dark"] .mdl{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36}
:root[data-theme="light"] .mdl{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec}
.mdl *{box-sizing:border-box}
.mdl a{color:var(--accent)}
.mdl button{font-family:var(--sans);font-size:12.5px;font-weight:600;padding:7px 13px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);cursor:pointer;transition:.12s;white-space:nowrap}
.mdl button:hover:not(:disabled){border-color:var(--accent)}
.mdl button:disabled{opacity:.45;cursor:not-allowed}
.mdl button.primary{background:var(--accent);border-color:var(--accent);color:#08121c}
.mdl button.primary:hover:not(:disabled){filter:brightness(1.08)}
.mdl input{font-family:var(--mono);font-size:12.5px;padding:8px 11px;border-radius:9px;border:1px solid var(--line);background:var(--bg);color:var(--ink);width:100%}
.mdl input:focus{outline:none;border-color:var(--accent)}
/* hero */
.mdl-hero{position:relative;overflow:hidden;padding:52px 28px 36px;border-bottom:1px solid var(--line);
  background:radial-gradient(130% 150% at 12% -20%,color-mix(in srgb,var(--accent) 24%,var(--panel)) 0%,var(--panel) 58%)}
.mdl-hero::before{content:"";position:absolute;right:-140px;top:-140px;width:420px;height:420px;border-radius:50%;
  background:radial-gradient(circle,color-mix(in srgb,var(--accent2) 26%,transparent),transparent 70%);pointer-events:none}
.mdl-hero-inner{max-width:900px;margin:0 auto;position:relative;z-index:1}
.mdl-eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
.mdl-hero-h1{font-size:35px;line-height:1.06;font-weight:800;letter-spacing:-.6px;margin:12px 0 0;
  background:linear-gradient(92deg,var(--ink),color-mix(in srgb,var(--accent) 78%,var(--ink)));-webkit-background-clip:text;background-clip:text;color:transparent}
.mdl-hero-sub{color:var(--dim);font-size:14.5px;line-height:1.55;margin:13px 0 0;max-width:62ch}
/* the featured slab — a big install CTA, or (mid-download) the big loader */
.mdl-feature{margin:26px 0 2px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:21px 22px;box-shadow:0 22px 48px -30px rgba(0,0,0,.6)}
.mdl-feature.on{border-color:var(--accent)}
.mdl-feat-row{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.mdl-feat-main{flex:1 1 260px;min-width:0}
.mdl-feat-nm{font-size:18.5px;font-weight:750;display:flex;align-items:center;gap:11px;flex-wrap:wrap}
.mdl-feat-nm .tag{font-size:11px;font-weight:600;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);padding:3px 10px;border-radius:999px;letter-spacing:.01em}
.mdl-feat-note{color:var(--dim);font-size:13px;line-height:1.5;margin-top:7px;max-width:56ch}
.mdl-feat-cta{flex:0 0 auto;display:flex;gap:9px}
.mdl-btn-xl{font-size:14px;font-weight:700;padding:13px 22px;border-radius:12px;background:var(--accent);border:1px solid var(--accent);color:#08121c;cursor:pointer;transition:.12s;box-shadow:0 10px 26px -12px color-mix(in srgb,var(--accent) 85%,transparent);white-space:nowrap}
.mdl-btn-xl:hover:not(:disabled){filter:brightness(1.08)}
.mdl-btn-xl.ghost{background:transparent;color:var(--ink);border-color:var(--line);box-shadow:none}
.mdl-btn-xl:disabled{opacity:.5;cursor:not-allowed}
/* the big loader — the download made a first-class thing */
.mdl-loader{width:100%}
.mdl-loader-top{display:flex;align-items:baseline;justify-content:space-between;gap:14px}
.mdl-loader-nm{font-size:17px;font-weight:700}
.mdl-loader-pct{font-family:var(--mono);font-size:24px;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}
.mdl-track-xl{position:relative;height:15px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);overflow:hidden;margin-top:14px}
.mdl-fill-xl{position:relative;height:100%;width:0;border-radius:9px;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .3s ease;min-width:8px}
.mdl-fill-xl::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 20%,rgba(255,255,255,.45) 50%,transparent 80%);background-size:220% 100%;animation:mdlShimmer 1.25s linear infinite}
@keyframes mdlShimmer{0%{background-position:180% 0}100%{background-position:-180% 0}}
.mdl-loader-sub{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:11px;font-size:12.5px;color:var(--dim);font-family:var(--mono)}
.mdl-loader-sub .ph{display:inline-flex;align-items:center;gap:9px;min-width:0}
.mdl-loader-sub .ph span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mdl-dotpulse{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:var(--accent);animation:mdlPulse 1s ease-in-out infinite}
@keyframes mdlPulse{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}
.mdl-facts{display:flex;gap:8px;flex-wrap:wrap;margin-top:22px}
.mdl-fact{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;color:var(--dim);background:color-mix(in srgb,var(--panel) 70%,transparent);border:1px solid var(--line);border-radius:999px;padding:5px 11px;backdrop-filter:blur(4px)}
.mdl-fact b{color:var(--ink);font-weight:600}
.mdl-fact .d{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
/* body */
.mdl-body{flex:1 1 auto;padding:20px 28px 60px;max-width:900px;width:100%;margin:0 auto}
.mdl-group{margin:26px 0 0}
.mdl-group:first-child{margin-top:6px}
.mdl-gh{display:flex;align-items:baseline;gap:10px;margin:0 0 12px;padding:0 2px}
.mdl-gh h2{font-size:12px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--dim);margin:0}
.mdl-gh span{font-size:12px;color:var(--dim);opacity:.8}
/* card */
.mdl-card{border:1px solid var(--line);background:var(--panel);border-radius:13px;padding:15px 16px;margin-bottom:11px;transition:border-color .12s}
.mdl-card.active{border-color:var(--ok);box-shadow:inset 3px 0 0 var(--ok)}
.mdl-card.busy{border-color:var(--warn)}
.mdl-crow{display:flex;align-items:flex-start;gap:14px}
.mdl-cmain{flex:1 1 auto;min-width:0}
.mdl-cname{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.mdl-cname .nm{font-size:15px;font-weight:650}
.mdl-cname .fam{font-size:12px;color:var(--dim)}
.mdl-badge{font-size:11px;font-weight:700;letter-spacing:.02em;padding:3px 9px;border-radius:999px;border:1px solid;white-space:nowrap}
.mdl-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.mdl-chip{font-size:11px;color:var(--dim);background:var(--panel2);border:1px solid var(--line);border-radius:7px;padding:3px 8px;font-family:var(--mono)}
.mdl-note{color:var(--dim);font-size:12.5px;line-height:1.5;margin-top:9px;max-width:62ch}
.mdl-actions{flex:0 0 auto;display:flex;flex-direction:column;gap:7px;align-items:stretch;min-width:118px}
.mdl-actions .lnk{background:none;border:none;color:var(--dim);font-weight:500;font-size:11.5px;padding:2px;text-align:center}
.mdl-actions .lnk:hover{color:var(--accent);border:none}
/* progress */
.mdl-prog{margin-top:13px}
.mdl-track{height:7px;border-radius:6px;background:var(--panel2);overflow:hidden;border:1px solid var(--line)}
.mdl-fill{height:100%;width:0;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .18s ease}
.mdl-phase{display:flex;justify-content:space-between;gap:10px;margin-top:6px;font-size:11.5px;color:var(--dim);font-family:var(--mono)}
.mdl-err{margin-top:10px;font-size:12px;color:var(--bad);background:color-mix(in srgb,var(--bad) 12%,transparent);border:1px solid color-mix(in srgb,var(--bad) 35%,transparent);border-radius:9px;padding:8px 11px;line-height:1.45}
/* config panel (key / server url / native pull) */
.mdl-cfg{margin-top:13px;padding-top:13px;border-top:1px dashed var(--line)}
.mdl-cfg-row{display:flex;gap:8px;margin-top:9px}
.mdl-cfg-row button{flex:0 0 auto}
.mdl-cfg .hint{font-size:11.5px;color:var(--dim);line-height:1.5}
.mdl-cmd{display:flex;align-items:center;gap:9px;margin-top:9px;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px 11px}
.mdl-cmd code{flex:1 1 auto;font-family:var(--mono);font-size:12px;color:var(--accent);overflow-x:auto;white-space:nowrap}
/* speed toggle */
.mdl-seg{display:inline-flex;gap:6px;margin-top:11px}
.mdl-seg button{padding:5px 11px;font-size:11.5px}
.mdl-seg button.on{background:color-mix(in srgb,var(--accent) 18%,transparent);border-color:var(--accent);color:var(--ink)}
/* test output */
.mdl-test{margin-top:12px;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:11px 13px;font-size:13px;line-height:1.55;white-space:pre-wrap;max-height:220px;overflow:auto}
.mdl-test .q{color:var(--dim);font-family:var(--mono);font-size:11.5px;display:block;margin-bottom:6px}
/* footer / storage */
.mdl-foot{margin-top:34px;padding-top:18px;border-top:1px solid var(--line);display:flex;align-items:center;gap:14px;flex-wrap:wrap;color:var(--dim);font-size:12.5px}
.mdl-foot .sp{flex:1 1 auto}
.mdl-reach{margin-top:12px;font-size:12.5px;line-height:1.5;padding:9px 12px;border-radius:9px}
.mdl-reach.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 10%,transparent)}
.mdl-reach.bad{color:var(--bad);background:color-mix(in srgb,var(--bad) 10%,transparent)}
@media (max-width:620px){
  .mdl-crow{flex-direction:column}
  .mdl-actions{flex-direction:row;flex-wrap:wrap;min-width:0}
  .mdl-hero,.mdl-body{padding-left:16px;padding-right:16px}
  .mdl-hero{padding-top:34px}
  .mdl-hero-h1{font-size:27px}
  .mdl-feat-row{flex-direction:column;align-items:flex-start}
  .mdl-feat-cta{width:100%}
  .mdl-btn-xl{width:100%;text-align:center}
}
`;

// The reader's own default when eo_backend is unset (app.js backendPref): WebGPU → the Llama
// talker, otherwise the CPU one. Mirrored here so the "Active" mark is right on a first visit
// before the person has ever picked anything.
const defaultActive = (env) => (env.webgpu === false ? 'wllama' : 'webllm');

export function mountModelsSurface(root, { store = safeLocalStorage(), make = createModel } = {}) {
  // Presentation state only — everything durable is localStorage, read fresh each render.
  const st = {
    env: { webgpu: null },     // null until probed; false / true after
    storage: null,             // { usage, quota } from navigator.storage.estimate
    reach: null,               // { ok, text } network verdict, or null
    open: null,                // which model's config panel is expanded
    test: null,                // { id, q, out } live test output
  };
  // Live, this-session load state, id → { state:'installing'|'ready'|'error', pct, phase, error }.
  const session = {};
  // Loaded backend handles, kept so Test reuses the instance instead of reloading it.
  const handles = new Map();
  const registered = availableBackends();
  const catalog = buildCatalog({ registered });

  const shell = document.createElement('div');
  shell.className = 'mdl';
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  root.appendChild(shell);

  const byId = (id) => shell.querySelector(`#${CSS_ID(id)}`);
  const activeId = () => {
    try { const v = store.getItem(ACTIVE_KEY); if (v) return v; } catch { /* default below */ }
    return defaultActive(st.env);
  };
  const speed = () => { try { return store.getItem(SPEED_KEY) === 'fluent' ? 'fluent' : 'fast'; } catch { return 'fast'; } };

  // ── render ─────────────────────────────────────────────────────────────────────
  const render = () => {
    const installed = readInstalled(store);
    const active = activeId();
    const ctx = { installed, activeId: active, session, env: st.env };
    const groupsHtml = GROUPS.map((g) => {
      const rows = catalog.filter((m) => m.group === g.key);
      if (!rows.length) return '';
      const cards = rows.map((m) => cardHtml(m, deriveStatus(m, ctx), { active, speed: speed() })).join('');
      return `<section class="mdl-group"><div class="mdl-gh"><h2>${esc(g.title)}</h2><span>${esc(g.sub)}</span></div>${cards}</section>`;
    }).join('');

    shell.innerHTML = `
      ${heroHtml()}
      <div class="mdl-body">
        ${groupsHtml}
        ${footHtml()}
      </div>`;
    bind();
  };

  // THE HERO — a real landing band. It leads with the download made a first-class thing: while
  // anything is installing it shows the big animated loader; otherwise it features the one model
  // this device should reach for first, with a single large Install call-to-action.
  const heroHtml = () => {
    const installingId = Object.keys(session).find((id) => session[id] && session[id].state === 'installing');
    const slab = installingId ? loaderHtml(installingId) : featureHtml();
    return `
      <header class="mdl-hero"><div class="mdl-hero-inner">
        <div class="mdl-eyebrow">Models</div>
        <h1 class="mdl-hero-h1">Run a model, right here.</h1>
        <p class="mdl-hero-sub">Install a talker and it downloads once, caches to disk, and runs entirely in your browser — nothing leaves the machine. Or connect a hosted or native one. Whatever you make active here is the model the reader uses.</p>
        <div class="mdl-feature ${installingId ? 'on' : ''}">${slab}</div>
        <div class="mdl-facts">${factsHtml()}</div>
      </div></header>`;
  };

  const factsHtml = () => {
    const gpu = st.env.webgpu;
    const gpuFact = gpu == null
      ? fact('#8b93a2', 'WebGPU', 'checking…')
      : gpu ? fact('var(--ok)', 'WebGPU', 'available') : fact('var(--warn)', 'WebGPU', 'unavailable · CPU only');
    const store_ = st.storage
      ? fact('var(--accent)', 'On disk', `${fmtBytes(st.storage.usage)} used`)
      : fact('#8b93a2', 'On disk', '—');
    const active = activeId();
    const activeRow = catalog.find((m) => m.id === active);
    return fact('var(--ok)', 'Active model', activeRow ? activeRow.label : active) + gpuFact + store_;
  };

  const fact = (dot, label, val) =>
    `<span class="mdl-fact"><span class="d" style="background:${dot}"></span><b>${esc(label)}</b> ${esc(val)}</span>`;

  // The model this device should try first — the fuller in-browser talker where WebGPU is present,
  // the universal CPU one otherwise (and while the probe is still running, so the CTA is always live
  // and never offers a download this device can't finish).
  const featuredId = () => (st.env.webgpu === true ? 'webllm' : 'wllama');

  // The big loader — one download, made loud: name, a huge live percentage, a thick shimmering bar,
  // the current phase, and the size it's fetching. The ids let onProgress paint it without a re-render.
  const loaderHtml = (id) => {
    const m = catalog.find((x) => x.id === id) || {};
    const live = session[id] || {};
    const pct = Math.round((live.pct || 0) * 100);
    const verb = connecting(m) ? 'Connecting to' : 'Downloading';
    return `
      <div class="mdl-loader">
        <div class="mdl-loader-top"><span class="mdl-loader-nm">${esc(verb)} ${esc(m.label || id)}</span><span class="mdl-loader-pct" id="${CSS_ID('hpct-' + id)}">${pct}%</span></div>
        <div class="mdl-track-xl"><div class="mdl-fill-xl" id="${CSS_ID('hfill-' + id)}" style="width:${pct}%"></div></div>
        <div class="mdl-loader-sub"><span class="ph"><span class="mdl-dotpulse"></span><span id="${CSS_ID('hphase-' + id)}">${esc(live.phase || 'starting…')}</span></span><span>${esc(connecting(m) ? m.requires : m.size)}</span></div>
      </div>`;
  };

  // The idle hero slab — feature the recommended model with one large Install button, or, once it is
  // installed, offer to test it / make it active.
  const featureHtml = () => {
    const id = featuredId();
    const m = catalog.find((x) => x.id === id);
    if (!m) return '';
    const status = deriveStatus(m, { installed: readInstalled(store), activeId: activeId(), session, env: st.env });
    const ready = status.key === 'installed' || status.key === 'active' || status.key === 'ready';
    const detecting = st.env.webgpu === null;
    const tag = ready
      ? (status.key === 'active' ? 'active now' : 'installed')
      : (detecting ? 'checking your device…' : (m.id === 'webllm' ? 'recommended · your GPU can run it' : 'recommended · runs on any CPU'));
    const chips = `<div class="mdl-chips" style="margin-top:11px">${[m.params, m.size, m.requires].map(chip).join('')}</div>`;
    const cta = ready
      ? `<div class="mdl-feat-cta"><button class="mdl-btn-xl" data-act="test" data-id="${esc(id)}">Test it</button>${status.key === 'active' ? '' : `<button class="mdl-btn-xl ghost" data-act="active" data-id="${esc(id)}">Set active</button>`}</div>`
      : `<div class="mdl-feat-cta"><button class="mdl-btn-xl" data-act="install" data-id="${esc(id)}">Install${/^~/.test(m.size || '') ? ` · ${esc(m.size)}` : ''}</button></div>`;
    return `
      <div class="mdl-feat-row">
        <div class="mdl-feat-main">
          <div class="mdl-feat-nm">${esc(m.label)} <span class="tag">${esc(tag)}</span></div>
          <div class="mdl-feat-note">${esc(m.note)}</div>
          ${chips}
        </div>
        ${cta}
      </div>`;
  };

  const cardHtml = (m, status, { active, speed: sp }) => {
    const isActive = m.id === active;
    const live = session[m.id];
    const installing = live && live.state === 'installing';
    const tone = TONE[status.tone] || 'var(--dim)';
    const badge = `<span class="mdl-badge" id="${CSS_ID('badge-' + m.id)}" style="color:${tone};border-color:${tone};background:color-mix(in srgb,${tone} 12%,transparent)">${esc(status.label)}</span>`;
    const chips = [
      m.params && m.params !== 'no model' ? chip(m.params) : '',
      chip(m.size),
      chip(m.requires),
    ].join('');

    // Actions vary by state and kind. Built-ins and native rows have no install button.
    const actions = actionsHtml(m, status, { isActive });

    // Progress lives under the row while installing; the error sits there after a failure.
    const prog = installing
      ? `<div class="mdl-prog" id="${CSS_ID('prog-' + m.id)}">
           <div class="mdl-track"><div class="mdl-fill" id="${CSS_ID('fill-' + m.id)}" style="width:${Math.round((live.pct || 0) * 100)}%"></div></div>
           <div class="mdl-phase"><span id="${CSS_ID('phase-' + m.id)}">${esc(live.phase || 'starting…')}</span><span id="${CSS_ID('pct-' + m.id)}">${Math.round((live.pct || 0) * 100)}%</span></div>
         </div>`
      : (live && live.state === 'error'
          ? `<div class="mdl-err">${esc(live.error || 'load failed')}</div>`
          : '');

    // The webllm size lever, inline on its card only.
    const speedSeg = m.speed
      ? `<div class="mdl-seg">
           <button data-speed="fast"   class="${sp === 'fast' ? 'on' : ''}">Fast · 1B</button>
           <button data-speed="fluent" class="${sp === 'fluent' ? 'on' : ''}">Fluent · 3B</button>
         </div>`
      : '';

    const cfg = st.open === m.id ? cfgHtml(m) : '';
    const test = st.test && st.test.id === m.id ? testHtml(st.test) : '';

    const cls = ['mdl-card', isActive ? 'active' : '', installing ? 'busy' : ''].filter(Boolean).join(' ');
    return `
      <div class="${cls}" id="${CSS_ID('card-' + m.id)}">
        <div class="mdl-crow">
          <div class="mdl-cmain">
            <div class="mdl-cname"><span class="nm">${esc(m.label)}</span><span class="fam">${esc(m.family)}</span>${badge}</div>
            <div class="mdl-chips">${chips}</div>
            <div class="mdl-note">${esc(m.note)}</div>
            ${speedSeg}
          </div>
          <div class="mdl-actions">${actions}</div>
        </div>
        ${prog}${cfg}${test}
      </div>`;
  };

  const chip = (t) => (t && t !== '—' ? `<span class="mdl-chip">${esc(t)}</span>` : '');

  const actionsHtml = (m, status, { isActive }) => {
    if (m.runtime === 'builtin') {
      return isActive ? '' : `<button data-act="active" data-id="${esc(m.id)}">Set active</button>`;
    }
    if (m.group === 'native') {
      return m.pull
        ? `<button data-act="pull" data-id="${esc(m.id || m.label)}">How to run</button>`
        : `<span class="mdl-actions" style="color:var(--dim);font-size:11.5px;text-align:center">native only</span>`;
    }
    const inst = installability(m, { webgpu: st.env.webgpu !== false });
    const busy = status.key === 'installing';
    const ready = status.key === 'installed' || status.key === 'active' || status.key === 'ready';
    const out = [];
    // The primary verb.
    if (m.needsKey || m.needsServer) {
      out.push(`<button class="${ready ? '' : 'primary'}" data-act="config" data-id="${esc(m.id)}" ${busy ? 'disabled' : ''}>${esc(busy ? '…' : actionLabel(m, status))}</button>`);
    } else {
      out.push(`<button class="${ready ? '' : 'primary'}" data-act="install" data-id="${esc(m.id)}" ${busy || !inst.ok ? 'disabled' : ''} title="${esc(inst.ok ? '' : inst.reason)}">${esc(busy ? '…' : actionLabel(m, status))}</button>`);
    }
    // Set active — offered once it can actually answer (ready), and not already active.
    if (ready && !isActive) out.push(`<button data-act="active" data-id="${esc(m.id)}">Set active</button>`);
    // Test — a one-line proof it works, for anything ready.
    if (ready) out.push(`<button class="lnk" data-act="test" data-id="${esc(m.id)}">Test it →</button>`);
    // Forget — clear the local "installed" record.
    if (ready && !connecting(m)) out.push(`<button class="lnk" data-act="forget" data-id="${esc(m.id)}">Forget</button>`);
    return out.join('');
  };

  // The inline config panel — a key for Claude, a base URL for a local server.
  const cfgHtml = (m) => {
    if (m.needsKey) {
      let cur = ''; try { cur = store.getItem('eo_claude_key') || ''; } catch { /* none */ }
      return `<div class="mdl-cfg">
        <div class="hint">Paste an Anthropic API key (<span class="mdl-chip">sk-ant-…</span>). It is stored only in this browser and sent to api.anthropic.com — nowhere else. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Get a key ↗</a></div>
        <div class="mdl-cfg-row"><input id="${CSS_ID('key-' + m.id)}" type="password" placeholder="sk-ant-…" value="${esc(cur)}" autocomplete="off" /><button class="primary" data-act="savekey" data-id="${esc(m.id)}">Verify</button></div>
      </div>`;
    }
    if (m.needsServer) {
      const def = m.id === 'lmstudio' ? 'http://localhost:1234/v1' : 'http://localhost:11434/v1';
      let cur = ''; try { cur = store.getItem('eo_' + m.id + '_base') || ''; } catch { /* none */ }
      return `<div class="mdl-cfg">
        <div class="hint">${esc(m.note)}</div>
        <div class="mdl-cfg-row"><input id="${CSS_ID('base-' + m.id)}" placeholder="${esc(def)}" value="${esc(cur)}" /><button class="primary" data-act="savebase" data-id="${esc(m.id)}">Connect</button></div>
        <div class="hint" style="margin-top:7px">Leave blank for the default (${esc(def)}). It auto-discovers whatever model the server has loaded.</div>
      </div>`;
    }
    return '';
  };

  const testHtml = (t) =>
    `<div class="mdl-test"><span class="q">${esc(t.q)}</span>${esc(t.out || '…')}</div>`;

  const footHtml = () => {
    const reach = st.reach
      ? `<div class="mdl-reach ${st.reach.ok ? 'ok' : 'bad'}">${esc(st.reach.text)}</div>`
      : '';
    const quota = st.storage && st.storage.quota ? ` of ~${fmtBytes(st.storage.quota)} available` : '';
    return `
      <div class="mdl-foot">
        <span>Downloaded weights use <b style="color:var(--ink)">${fmtBytes(st.storage?.usage)}</b>${quota}.</span>
        <span class="sp"></span>
        <button data-act="reach">Check network</button>
        <button data-act="clear">Clear all downloads</button>
      </div>
      ${reach}`;
  };

  // ── event binding ────────────────────────────────────────────────────────────────
  const bind = () => {
    shell.querySelectorAll('[data-act]').forEach((el) => {
      el.addEventListener('click', () => onAct(el.dataset.act, el.dataset.id));
    });
    shell.querySelectorAll('[data-speed]').forEach((el) => {
      el.addEventListener('click', () => { try { store.setItem(SPEED_KEY, el.dataset.speed); } catch { /* session */ } render(); });
    });
  };

  const onAct = (act, id) => {
    const m = catalog.find((x) => (x.id || x.label) === id);
    switch (act) {
      case 'install':  return install(m);
      case 'config':   st.open = st.open === id ? null : id; return render();
      case 'savekey':  return saveKey(m);
      case 'savebase': return saveBase(m);
      case 'active':   return setActive(m);
      case 'test':     return runTest(m);
      case 'forget':   return forget(m);
      case 'pull':     st.open = st.open === id ? null : id; return render();
      case 'reach':    return checkReach();
      case 'clear':    return clearAll();
      default: return undefined;
    }
  };

  // ── install: the real load, with live progress ───────────────────────────────────
  const install = async (m, opts = {}) => {
    if (!m || !m.id) return;
    session[m.id] = { state: 'installing', pct: 0, phase: 'starting…' };
    st.test = null;
    render();
    const modelOpts = m.id === 'webllm' ? { speed: speed() } : {};
    try {
      const inst = make(m.id, { ...modelOpts, ...opts });
      await inst.load((p) => onProgress(m.id, p));
      handles.set(m.id, inst);
      session[m.id] = { state: 'ready' };
      markInstalled(store, m.id);
      // First working model with nothing yet chosen? Make it active so the reader has a talker.
      try { if (!store.getItem(ACTIVE_KEY)) store.setItem(ACTIVE_KEY, m.id); } catch { /* session */ }
      st.open = null;
    } catch (err) {
      session[m.id] = { state: 'error', error: oneLine(err) };
    }
    await refreshStorage();
    render();
  };

  // onProgress fires many times a second during a download — update the bar's DOM directly rather
  // than re-rendering the whole surface. The card is rebuilt once, on the terminal transition.
  const onProgress = (id, p) => {
    const live = session[id];
    if (!live || live.state !== 'installing') return;
    const pct = clamp01(p && typeof p.pct === 'number' ? p.pct : live.pct || 0);
    live.pct = pct;
    live.phase = (p && p.phase) ? String(p.phase) : live.phase;
    const shown = Math.round(pct * 100);
    const verb = connecting(catalog.find((m) => m.id === id) || {}) ? 'Connecting' : 'Downloading';
    // The per-card bar…
    const fill = byId('fill-' + id), phase = byId('phase-' + id), pctEl = byId('pct-' + id), badge = byId('badge-' + id);
    if (fill)  fill.style.width = shown + '%';
    if (phase) phase.textContent = live.phase || '';
    if (pctEl) pctEl.textContent = shown + '%';
    if (badge) badge.textContent = `${verb} ${shown}%`;
    // …and the big hero loader, when this download is the one it's showing.
    const hfill = byId('hfill-' + id), hphase = byId('hphase-' + id), hpct = byId('hpct-' + id);
    if (hfill) hfill.style.width = shown + '%';
    if (hphase) hphase.textContent = live.phase || '';
    if (hpct) hpct.textContent = shown + '%';
  };

  const saveKey = (m) => {
    const el = byId('key-' + m.id);
    const v = el ? el.value.trim() : '';
    try { if (v) store.setItem('eo_claude_key', v); } catch { /* session */ }
    if (!v) { session[m.id] = { state: 'error', error: 'paste a key first' }; return render(); }
    install(m);   // load() proves the key with a free count_tokens call
  };

  const saveBase = (m) => {
    const el = byId('base-' + m.id);
    const v = el ? el.value.trim() : '';
    const def = m.id === 'lmstudio' ? 'http://localhost:1234/v1' : 'http://localhost:11434/v1';
    try {
      if (v && v !== def) store.setItem('eo_' + m.id + '_base', v);
      else store.removeItem('eo_' + m.id + '_base');
    } catch { /* session */ }
    install(m);
  };

  const setActive = (m) => {
    try { store.setItem(ACTIVE_KEY, m.id); } catch { /* session */ }
    // If the reader engine happens to share this context (panel mode), switch it live too.
    try { window.EO?.app?.setBackend?.(m.id, { force: true }); } catch { /* standalone page — persistence is enough */ }
    render();
  };

  const forget = (m) => {
    unmarkInstalled(store, m.id);
    handles.delete(m.id);
    delete session[m.id];
    render();
  };

  // Test — a single grounded-free line through the loaded model, streamed into the card. Proof the
  // install actually answers, not just that it downloaded.
  const runTest = async (m) => {
    const q = 'Say hello in one short sentence.';
    st.test = { id: m.id, q, out: '' };
    st.open = null;
    render();
    try {
      let inst = handles.get(m.id);
      if (!inst || !inst.isLoaded?.()) {
        inst = make(m.id, m.id === 'webllm' ? { speed: speed() } : {});
        await inst.load(() => {});
        handles.set(m.id, inst);
      }
      const messages = [
        { role: 'system', content: 'You are a helpful assistant. Answer in one short sentence.' },
        { role: 'user', content: q },
      ];
      const out = await inst.phrase(messages, {
        maxTokens: 64,
        onToken: (piece) => {
          if (!st.test || st.test.id !== m.id) return;
          st.test.out += piece;
          const el = byId('card-' + m.id)?.querySelector('.mdl-test');
          if (el) el.textContent = '';   // rebuild cheaply
          if (el) { const s = document.createElement('span'); s.className = 'q'; s.textContent = q; el.appendChild(s); el.appendChild(document.createTextNode(st.test.out)); }
        },
      });
      if (st.test && st.test.id === m.id) { st.test.out = (st.test.out || out || '(no output)').trim(); render(); }
    } catch (err) {
      if (st.test && st.test.id === m.id) { st.test.out = 'Test failed — ' + oneLine(err); render(); }
    }
  };

  const checkReach = async () => {
    st.reach = { ok: true, text: 'Checking the model hosts…' };
    render();
    try {
      const results = await probeOrigins();
      const down = explainReach(results);
      st.reach = down
        ? { ok: false, text: down }
        : { ok: true, text: 'All model hosts are reachable from this network — downloads should work.' };
    } catch {
      st.reach = { ok: false, text: 'Could not run the reachability probe here.' };
    }
    render();
  };

  const clearAll = async () => {
    const ok = typeof confirm === 'function'
      ? confirm('Delete all downloaded model weights from this browser? They will re-download the next time you install a model.')
      : true;
    if (!ok) return;
    // web-llm (MLC) caches weights in the Cache Storage API; wllama streams GGUF to OPFS. Clear both,
    // best-effort — a browser without one simply has nothing to clear there.
    try {
      if (typeof caches !== 'undefined' && caches.keys) {
        const names = await caches.keys();
        await Promise.all(names.filter((n) => /webllm|mlc/i.test(n)).map((n) => caches.delete(n)));
      }
    } catch { /* no Cache Storage */ }
    try {
      const rootDir = await navigator.storage?.getDirectory?.();
      if (rootDir) {
        // Only model weights live at the OPFS root in this app.
        for await (const [name] of rootDir.entries?.() ?? []) {
          try { await rootDir.removeEntry(name, { recursive: true }); } catch { /* in use / gone */ }
        }
      }
    } catch { /* no OPFS */ }
    writeInstalled(store, new Set());
    handles.clear();
    for (const k of Object.keys(session)) delete session[k];
    await refreshStorage();
    render();
  };

  const refreshStorage = async () => {
    try {
      if (navigator.storage?.estimate) {
        const e = await navigator.storage.estimate();
        st.storage = { usage: e.usage || 0, quota: e.quota || 0 };
      }
    } catch { /* no estimate API */ }
  };

  const detectWebGPU = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) { st.env.webgpu = false; return; }
      const adapter = await navigator.gpu.requestAdapter();
      st.env.webgpu = !!adapter;
    } catch { st.env.webgpu = false; }
  };

  // ── boot ──────────────────────────────────────────────────────────────────────
  render();
  detectWebGPU().then(render);
  refreshStorage().then(render);

  // The unmount hook, matching the plain surface's contract.
  return () => { try { root.removeChild(shell); root.removeChild(style); } catch { /* already gone */ } };
}

// A DOM-id-safe token — model ids are simple, but a coder id can carry a dot ('qwen-coder-1.5b'),
// which is a class selector inside querySelector. Swap the awkward chars for '_'.
const CSS_ID = (raw) => 'mdl_' + String(raw).replace(/[^a-zA-Z0-9_-]/g, '_');

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

// One honest line from an error for the badge / panel.
const oneLine = (err) => String((err && (err.message || err)) || 'something went wrong').split('\n')[0].slice(0, 240);

// A localStorage that never throws (private mode, sandboxed embed) — falls back to an in-memory map
// so the surface still works for the session, it just won't persist across a reload.
function safeLocalStorage() {
  try {
    if (typeof localStorage !== 'undefined') { localStorage.getItem('__mdl_probe'); return localStorage; }
  } catch { /* blocked — memory shim below */ }
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
}
