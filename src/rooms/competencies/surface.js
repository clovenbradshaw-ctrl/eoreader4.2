// EO: INS·NUL(Field → Entity,Void, Making,Clearing) — the competencies DOM surface
// surface.js — the install surface. Framework-free (drops into a standalone page or a panel),
// and it is a thin projection over catalog.js's pure fold: every card, gauge, and disabled
// button is recomputed from (installed, budget) on every render, never tracked separately.
//
// Three sections mirror the catalog's three groups — Founders (built-in, always on),
// Extensions (installable, gated by the checkpoint · requires · budget), and the one
// forbidden card (always refused, shown on purpose so the void-law is visible). A budget
// stepper lets a person feel the third gate directly: lower it and installed faculties stay
// (a shrinking budget never evicts), but new installs start refusing once upkeep would cross it.
//
// The install-set persists to this browser's storage (shared key, fail-soft); the budget is a
// what-if dial for this session only — nothing here is wired to the reading engine yet.

import {
  CATALOG, DEFAULT_BUDGET, FOUNDER_IDS, competencyById, initialInstalled,
  competencyUpkeep, canInstall, canUninstall, install, uninstall, projectBody,
  cellLabels, constitutionLine,
} from './catalog.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const INSTALLED_KEY = 'eo_competencies_installed';
const BUDGET_MIN = 0;
const BUDGET_MAX = 99;
const INSTALLABLE = CATALOG.filter((c) => !c.forbidden);

const CSS = `
.cmp{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36;
  --accent:#7bd0ff;--accent2:#b98bff;--ok:#59c08a;--warn:#e0b24a;--bad:#e06a5a;
  --mono:'SFMono-Regular',ui-monospace,Menlo,Consolas,monospace;--sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.5;
  display:flex;flex-direction:column;min-height:100%}
@media (prefers-color-scheme:light){.cmp{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec;--accent:#2a7fd0;--accent2:#7d4fd0;--ok:#1e8a50;--warn:#9a6b12;--bad:#c0392b}}
:root[data-theme="dark"] .cmp{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36}
:root[data-theme="light"] .cmp{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec}
.cmp *{box-sizing:border-box}
.cmp button{font-family:var(--sans);font-size:12.5px;font-weight:600;padding:7px 13px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);cursor:pointer;transition:.12s;white-space:nowrap}
.cmp button:hover:not(:disabled){border-color:var(--accent)}
.cmp button:disabled{opacity:.45;cursor:not-allowed}
.cmp button.primary{background:var(--accent);border-color:var(--accent);color:#08121c}
.cmp button.primary:hover:not(:disabled){filter:brightness(1.08)}
.cmp button.lnk{background:none;border:none;color:var(--dim);font-weight:500;font-size:11.5px;padding:2px 4px}
.cmp button.lnk:hover{color:var(--accent);border:none}
/* hero */
.cmp-hero{position:relative;overflow:hidden;padding:52px 28px 36px;border-bottom:1px solid var(--line);
  background:radial-gradient(130% 150% at 12% -20%,color-mix(in srgb,var(--accent) 24%,var(--panel)) 0%,var(--panel) 58%)}
.cmp-hero::before{content:"";position:absolute;right:-140px;top:-140px;width:420px;height:420px;border-radius:50%;
  background:radial-gradient(circle,color-mix(in srgb,var(--accent2) 26%,transparent),transparent 70%);pointer-events:none}
.cmp-hero-inner{max-width:900px;margin:0 auto;position:relative;z-index:1}
.cmp-eyebrow{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
.cmp-hero-h1{font-size:35px;line-height:1.06;font-weight:800;letter-spacing:-.6px;margin:12px 0 0;
  background:linear-gradient(92deg,var(--ink),color-mix(in srgb,var(--accent) 78%,var(--ink)));-webkit-background-clip:text;background-clip:text;color:transparent}
.cmp-hero-sub{color:var(--dim);font-size:14.5px;line-height:1.55;margin:13px 0 0;max-width:66ch}
/* the budget gauge */
.cmp-gauge{margin:24px 0 2px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px 20px;box-shadow:0 22px 48px -30px rgba(0,0,0,.6)}
.cmp-gauge-top{display:flex;align-items:baseline;justify-content:space-between;font-size:12.5px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em}
.cmp-gauge-top .val{font-family:var(--mono);font-size:19px;color:var(--ink);text-transform:none;letter-spacing:0}
.cmp-gauge-top .val i{font-style:normal;color:var(--dim);font-size:14px}
.cmp-track{position:relative;height:10px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);overflow:hidden;margin-top:10px}
.cmp-fill{height:100%;width:0;border-radius:7px;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .2s ease}
.cmp-fill.over{background:linear-gradient(90deg,var(--warn),var(--bad))}
.cmp-budget{display:flex;align-items:center;gap:9px;margin-top:13px}
.cmp-budget button{padding:5px 12px;font-size:14px;font-weight:700}
.cmp-budget .lab{font-size:11.5px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em}
.cmp-facts{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.cmp-fact{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;color:var(--dim);background:color-mix(in srgb,var(--panel) 70%,transparent);border:1px solid var(--line);border-radius:999px;padding:5px 11px;backdrop-filter:blur(4px)}
.cmp-fact b{color:var(--ink);font-weight:600}
.cmp-fact .d{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
/* body */
.cmp-body{flex:1 1 auto;padding:20px 28px 60px;max-width:900px;width:100%;margin:0 auto}
.cmp-group{margin:26px 0 0}
.cmp-group:first-child{margin-top:6px}
.cmp-gh{display:flex;align-items:baseline;gap:10px;margin:0 0 12px;padding:0 2px}
.cmp-gh h2{font-size:12px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--dim);margin:0}
.cmp-gh span{font-size:12px;color:var(--dim);opacity:.8}
/* card */
.cmp-card{border:1px solid var(--line);background:var(--panel);border-radius:13px;padding:15px 16px;margin-bottom:11px;transition:border-color .12s}
.cmp-card.on{border-color:var(--ok);box-shadow:inset 3px 0 0 var(--ok)}
.cmp-card.forbidden{border-color:var(--bad);border-style:dashed}
.cmp-crow{display:flex;align-items:flex-start;gap:14px}
.cmp-cmain{flex:1 1 auto;min-width:0}
.cmp-cname{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.cmp-cname .nm{font-size:15px;font-weight:650}
.cmp-badge{font-size:11px;font-weight:700;letter-spacing:.02em;padding:3px 9px;border-radius:999px;border:1px solid;white-space:nowrap}
.cmp-badge.builtin{color:var(--dim);border-color:var(--line);background:var(--panel2)}
.cmp-badge.on{color:var(--ok);border-color:var(--ok);background:color-mix(in srgb,var(--ok) 12%,transparent)}
.cmp-badge.forbidden{color:var(--bad);border-color:var(--bad);background:color-mix(in srgb,var(--bad) 12%,transparent)}
.cmp-cells{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cmp-chip{font-size:11px;color:var(--dim);background:var(--panel2);border:1px solid var(--line);border-radius:7px;padding:3px 8px;font-family:var(--mono)}
.cmp-chip.cell{color:var(--ink)}
.cmp-req{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}
.cmp-req .lab{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;margin-right:2px}
.cmp-note{color:var(--dim);font-size:12.5px;line-height:1.5;margin-top:9px;max-width:62ch}
.cmp-reason{margin-top:9px;font-size:12px;color:var(--bad);background:color-mix(in srgb,var(--bad) 10%,transparent);border:1px solid color-mix(in srgb,var(--bad) 32%,transparent);border-radius:9px;padding:7px 10px;line-height:1.45}
.cmp-actions{flex:0 0 auto;display:flex;flex-direction:column;gap:7px;align-items:stretch;min-width:104px}
/* footer */
.cmp-foot{margin-top:34px;padding-top:18px;border-top:1px solid var(--line);display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.cmp-foot .sp{flex:1 1 auto}
.cmp-ground{font-family:var(--mono);font-size:11.5px;color:var(--dim);line-height:1.5}
@media (max-width:620px){
  .cmp-crow{flex-direction:column}
  .cmp-actions{flex-direction:row;flex-wrap:wrap;min-width:0}
  .cmp-hero,.cmp-body{padding-left:16px;padding-right:16px}
  .cmp-hero{padding-top:34px}
  .cmp-hero-h1{font-size:27px}
}
`;

const clampBudget = (n) => Math.max(BUDGET_MIN, Math.min(BUDGET_MAX, Math.round(n)));

// The install-set is the one thing worth remembering across a reload; the budget is a what-if
// dial for this sitting, so it always starts back at DEFAULT_BUDGET. Fail-soft throughout — a
// corrupt or hand-edited value degrades to the founders rather than throwing.
const readInstalled = (store) => {
  try {
    const raw = store && store.getItem ? store.getItem(INSTALLED_KEY) : null;
    const arr = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(arr)) return initialInstalled();
    const known = arr.filter((id) => competencyById(id));
    const withFounders = [...new Set([...FOUNDER_IDS, ...known])];
    return CATALOG.map((c) => c.id).filter((id) => withFounders.includes(id));
  } catch { return initialInstalled(); }
};
const writeInstalled = (store, installed) => {
  try { store && store.setItem && store.setItem(INSTALLED_KEY, JSON.stringify(installed)); } catch { /* session only */ }
};

export function mountCompetenciesSurface(root, { store = safeLocalStorage() } = {}) {
  // Presentation state: the install-set (persisted) and the budget dial (this session only).
  const st = { installed: readInstalled(store), budget: DEFAULT_BUDGET };

  const shell = document.createElement('div');
  shell.className = 'cmp';
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  root.appendChild(shell);

  const fact = (dot, label, val) =>
    `<span class="cmp-fact"><span class="d" style="background:${dot}"></span><b>${esc(label)}</b> ${esc(val)}</span>`;

  const cellChip = (cl) =>
    `<span class="cmp-chip cell" title="${esc(cl.op)} at grain ${esc(cl.grain)} → ${esc(cl.stance)}, ${esc(cl.terrain)}">${esc(cl.glyph)} ${esc(cl.op)}·${esc(cl.stance)}·${esc(cl.terrain)}</span>`;
  const cellsHtml = (comp) => cellLabels(comp).map(cellChip).join('');

  const requiresHtml = (comp) => (comp.requires && comp.requires.length)
    ? `<div class="cmp-req"><span class="lab">requires</span>${comp.requires.map((r) => `<span class="cmp-chip">${esc(competencyById(r)?.name || r)}</span>`).join('')}</div>`
    : '';

  const reasonHtml = (reason) => reason ? `<div class="cmp-reason">⊘ ${esc(reason)}</div>` : '';

  const founderCard = (comp) => `
    <div class="cmp-card founder">
      <div class="cmp-crow">
        <div class="cmp-cmain">
          <div class="cmp-cname"><span class="nm">${esc(comp.name)}</span><span class="cmp-badge builtin">built-in</span></div>
          <div class="cmp-cells">${cellsHtml(comp)}<span class="cmp-chip">upkeep ${competencyUpkeep(comp)}</span></div>
          <div class="cmp-note">${esc(comp.blurb)}</div>
        </div>
      </div>
    </div>`;

  const extensionCard = (comp) => {
    const isOn = st.installed.includes(comp.id);
    const verdict = isOn ? canUninstall(st.installed, comp.id) : canInstall(st.installed, comp.id, { budget: st.budget });
    const btn = isOn
      ? `<button data-act="uninstall" data-id="${esc(comp.id)}" ${verdict.ok ? '' : 'disabled'} title="${esc(verdict.ok ? 'Remove this faculty' : verdict.reason)}">Uninstall</button>`
      : `<button class="primary" data-act="install" data-id="${esc(comp.id)}" ${verdict.ok ? '' : 'disabled'} title="${esc(verdict.ok ? '' : verdict.reason)}">Install</button>`;
    return `
      <div class="cmp-card ${isOn ? 'on' : ''}">
        <div class="cmp-crow">
          <div class="cmp-cmain">
            <div class="cmp-cname"><span class="nm">${esc(comp.name)}</span>${isOn ? '<span class="cmp-badge on">installed</span>' : ''}</div>
            <div class="cmp-cells">${cellsHtml(comp)}<span class="cmp-chip">upkeep ${competencyUpkeep(comp)}</span></div>
            ${requiresHtml(comp)}
            <div class="cmp-note">${esc(comp.blurb)}</div>
            ${verdict.ok ? '' : reasonHtml(verdict.reason)}
          </div>
          <div class="cmp-actions">${btn}</div>
        </div>
      </div>`;
  };

  const forbiddenCard = (comp) => {
    const verdict = canInstall(st.installed, comp.id, { budget: st.budget });
    return `
      <div class="cmp-card forbidden">
        <div class="cmp-crow">
          <div class="cmp-cmain">
            <div class="cmp-cname"><span class="nm">${esc(comp.name)}</span><span class="cmp-badge forbidden">refused</span></div>
            <div class="cmp-cells">${cellsHtml(comp)}</div>
            <div class="cmp-note">${esc(comp.blurb)}</div>
            ${reasonHtml(verdict.reason)}
          </div>
          <div class="cmp-actions"><button data-act="noop" disabled title="${esc(verdict.reason)}">Refused</button></div>
        </div>
      </div>`;
  };

  const sectionHtml = (title, sub, cardsHtml) => `
    <section class="cmp-group">
      <div class="cmp-gh"><h2>${esc(title)}</h2><span>${esc(sub)}</span></div>
      ${cardsHtml}
    </section>`;

  const heroHtml = () => {
    const body = projectBody(st.installed);
    const pct = st.budget > 0 ? Math.min(100, Math.round((body.upkeep / st.budget) * 100)) : (body.upkeep > 0 ? 100 : 0);
    const over = body.upkeep > st.budget;
    return `
      <header class="cmp-hero"><div class="cmp-hero-inner">
        <div class="cmp-eyebrow">Competencies</div>
        <h1 class="cmp-hero-h1">Install a faculty, deliberately.</h1>
        <p class="cmp-hero-sub">A competency is the same object an organ is (metabolism/organ.js) — a contract claiming a cell of the cube. The metabolism grows organs on its own under scarcity; here, a person chooses which cell of the desert this body grows into. Every gate below is borrowed whole from that engine, not invented for this page.</p>
        <div class="cmp-gauge">
          <div class="cmp-gauge-top"><span>Upkeep</span><span class="val">${body.upkeep} <i>/ ${st.budget}</i></span></div>
          <div class="cmp-track"><div class="cmp-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
          <div class="cmp-budget">
            <button data-act="budget-" title="Lower the budget by 1">−</button>
            <span class="lab">budget</span>
            <button data-act="budget+" title="Raise the budget by 1">+</button>
            ${st.budget !== DEFAULT_BUDGET ? `<button class="lnk" data-act="budget-reset">reset to ${DEFAULT_BUDGET}</button>` : ''}
          </div>
        </div>
        <div class="cmp-facts">
          ${fact('var(--accent)', 'Installed', `${body.count} of ${INSTALLABLE.length}`)}
          ${fact('var(--ok)', 'Founders', `${FOUNDER_IDS.length} always on`)}
          ${fact(over ? 'var(--bad)' : 'var(--dim)', 'Desert left', `${body.desert} of 27 cube cells`)}
        </div>
      </div></header>`;
  };

  const footHtml = () => `
    <div class="cmp-foot">
      <span class="cmp-ground">${esc(constitutionLine())}</span>
      <span class="sp"></span>
      <button class="lnk" data-act="reset-founders">Reset to founders</button>
    </div>`;

  const render = () => {
    const founders = CATALOG.filter((c) => c.builtin);
    const extensions = CATALOG.filter((c) => !c.builtin && !c.forbidden);
    const forbidden = CATALOG.filter((c) => c.forbidden);
    shell.innerHTML = `
      ${heroHtml()}
      <div class="cmp-body">
        ${sectionHtml('Founders', 'built in — always on, never removable', founders.map(founderCard).join(''))}
        ${sectionHtml('Extensions', 'installable — claim a desert cell if the gates allow it', extensions.map(extensionCard).join(''))}
        ${sectionHtml('The one forbidden move', 'shown on purpose — the void-law is visible, not merely obeyed', forbidden.map(forbiddenCard).join(''))}
        ${footHtml()}
      </div>`;
    bind();
  };

  const doInstall = (id) => {
    const r = install(st.installed, id, { budget: st.budget });
    if (r.changed) { st.installed = r.installed; writeInstalled(store, st.installed); }
    render();
  };
  const doUninstall = (id) => {
    const r = uninstall(st.installed, id);
    if (r.changed) { st.installed = r.installed; writeInstalled(store, st.installed); }
    render();
  };
  const adjustBudget = (delta) => { st.budget = clampBudget(st.budget + delta); render(); };
  const resetFounders = () => { st.installed = initialInstalled(); writeInstalled(store, st.installed); render(); };

  const onAct = (act, id) => {
    switch (act) {
      case 'install': return doInstall(id);
      case 'uninstall': return doUninstall(id);
      case 'budget-': return adjustBudget(-1);
      case 'budget+': return adjustBudget(1);
      case 'budget-reset': st.budget = DEFAULT_BUDGET; return render();
      case 'reset-founders': return resetFounders();
      default: return undefined;
    }
  };

  const bind = () => {
    shell.querySelectorAll('[data-act]').forEach((el) => {
      el.addEventListener('click', () => onAct(el.dataset.act, el.dataset.id));
    });
  };

  render();
  return () => { try { root.removeChild(shell); root.removeChild(style); } catch { /* already gone */ } };
}

// A localStorage that never throws (private mode, sandboxed embed) — falls back to an in-memory
// map so the surface still works for the session, it just won't persist across a reload.
function safeLocalStorage() {
  try {
    if (typeof localStorage !== 'undefined') { localStorage.getItem('__cmp_probe'); return localStorage; }
  } catch { /* blocked — memory shim below */ }
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
}
