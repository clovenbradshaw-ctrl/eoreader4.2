// EO: INS·EVA·NUL(Field → Entity,Lens,Void, Making,Binding,Clearing) — Priors installation surface
// Browser-only surface over catalog.js's pure install fold. The user-facing name is "Priors":
// inherited faculties that can be installed into the body, inspected against the cube checkpoint,
// and forgotten again when no installed Prior depends on them.
import {
  CATALOG, DEFAULT_BUDGET, initialInstalled, canInstall, canUninstall, install, uninstall,
  projectBody, totalUpkeep, competencyUpkeep, cellLabels, constitutionLine,
} from './catalog.js';

const STORE_KEY = 'eo_priors_installed_v1';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (store) => {
  try {
    const raw = JSON.parse(store?.getItem(STORE_KEY) || 'null');
    const ids = Array.isArray(raw) ? raw.filter((id) => CATALOG.some((c) => c.id === id)) : initialInstalled();
    return [...new Set([...initialInstalled(), ...ids])];
  } catch { return initialInstalled(); }
};
const write = (store, installed) => { try { store?.setItem(STORE_KEY, JSON.stringify(installed)); } catch {} };

const styles = `
.priors{min-height:100vh;padding:28px;background:linear-gradient(135deg,#0c0e12,#17121f);color:#eef2fb;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}.priors a{color:#9bd6ff}.priors-shell{max-width:1160px;margin:0 auto}.priors-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:20px}.eyebrow{font:700 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:#9bd6ff}.priors h1{font-size:42px;line-height:1.02;margin:8px 0 12px}.lede{max-width:760px;color:#b9c1d1;font-size:16px;line-height:1.55}.meter{min-width:250px;background:#10141d;border:1px solid #2a3447;border-radius:18px;padding:16px;box-shadow:0 14px 40px #0005}.meter strong{font-size:30px}.bar{height:10px;background:#252b38;border-radius:999px;overflow:hidden;margin:12px 0}.fill{height:100%;background:linear-gradient(90deg,#78f0b3,#9bd6ff)}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(286px,1fr));gap:14px}.card{background:#10141dcc;border:1px solid #293244;border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:12px}.card.installed{border-color:#72d69d}.card.blocked{opacity:.72}.card h2{font-size:18px;margin:0}.blurb{color:#b9c1d1;line-height:1.45}.chips{display:flex;gap:7px;flex-wrap:wrap}.chip{font:700 11px/1.2 ui-monospace,Menlo,monospace;background:#1b2230;border:1px solid #344056;border-radius:999px;padding:6px 8px;color:#dfe8f8}.reason{color:#ffcf86;font-size:12px;min-height:16px}.actions{margin-top:auto;display:flex;gap:8px}.btn{border:0;border-radius:12px;padding:10px 12px;font-weight:800;cursor:pointer;background:#8bd7ff;color:#071019}.btn.secondary{background:#273144;color:#e9eef8}.btn:disabled{cursor:not-allowed;opacity:.45}.foot{margin-top:18px;color:#98a3b7;font-size:13px;line-height:1.45}`;

const render = (mount, state) => {
  const body = projectBody(state.installed);
  const used = totalUpkeep(state.installed);
  const pct = Math.min(100, Math.round((used / state.budget) * 100));
  mount.innerHTML = `<style>${styles}</style><main class="priors"><div class="priors-shell"><section class="priors-top"><div><div class="eyebrow">EO Reader · Priors</div><h1>Install the Priors the reader is allowed to lean on.</h1><p class="lede">Priors are competency-organs: inherited reading faculties that occupy real cube cells, pass the constitution checkpoint, and cost upkeep while they remain live. Built-ins ship with the body; extensions can be installed only when their prerequisites and budget are satisfied.</p></div><aside class="meter"><div class="eyebrow">Body budget</div><strong>${esc(used)} / ${esc(state.budget)}</strong><div class="bar"><div class="fill" style="width:${pct}%"></div></div><div>${body.count} Priors · ${body.occupied} occupied cells · ${body.desert} desert cells</div></aside></section><section class="grid">${CATALOG.map((c) => card(c, state)).join('')}</section><p class="foot">${esc(constitutionLine())}</p><p class="foot"><a href="./index.html">← Reader</a></p></div></main>`;
};

const card = (c, state) => {
  const installed = state.installed.includes(c.id);
  const verdict = installed ? canUninstall(state.installed, c.id) : canInstall(state.installed, c.id, { budget: state.budget });
  const labels = cellLabels(c).map((x) => `<span class="chip">${esc(x.glyph)} ${esc(x.op)}·${esc(x.stance)}·${esc(x.grain)}</span>`).join('');
  return `<article class="card ${installed ? 'installed' : ''} ${!installed && !verdict.ok ? 'blocked' : ''}"><div class="eyebrow">${c.builtin ? 'built-in' : c.forbidden ? 'forbidden' : `upkeep ${competencyUpkeep(c)}`}</div><h2>${esc(c.name)}</h2><div class="blurb">${esc(c.blurb)}</div><div class="chips">${labels}</div><div class="reason">${verdict.ok ? '' : esc(verdict.reason)}</div><div class="actions">${installed ? `<button class="btn secondary" data-act="uninstall" data-id="${esc(c.id)}" ${verdict.ok ? '' : 'disabled'}>Forget Prior</button>` : `<button class="btn" data-act="install" data-id="${esc(c.id)}" ${verdict.ok ? '' : 'disabled'}>Install Prior</button>`}</div></article>`;
};

export const mountPriorsSurface = (mount, { store = globalThis.localStorage, budget = DEFAULT_BUDGET } = {}) => {
  const state = { installed: read(store), budget };
  const rerender = () => { write(store, state.installed); render(mount, state); };
  mount.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act][data-id]');
    if (!btn) return;
    const res = btn.dataset.act === 'install' ? install(state.installed, btn.dataset.id, { budget: state.budget }) : uninstall(state.installed, btn.dataset.id);
    state.installed = [...res.installed]; rerender();
  });
  rerender();
  return { state, destroy() { mount.innerHTML = ''; } };
};
export const mountCompetenciesSurface = mountPriorsSurface;
