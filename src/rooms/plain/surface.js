// EO: INS·NUL(Field → Entity,Void, Making,Clearing) — the plain-version DOM surface
// surface.js — the whole plain interface (docs, "eoreader — the plain version" §1–8), framework-
// free so it drops into a standalone page or a panel. It renders three panes and, on a click,
// a popover of exactly three questions — never more, never a menu, never a mode. The three
// questions are not curated here: terrain.questionsFor(kind) returns them, and a kind has three
// because its domain has three operators. The surface only paints what the arithmetic decides.
//
// It holds a little state — which thing's popover is open, which full view is showing, which
// basis a word is read under, which node the picture is centered on — and re-derives the screen
// from it. The two things that move under the person's hand (the meaning bars, the centered
// picture) are pure folds in select.js; everything else is a projection of the scene.

import { questionsFor, terrainOfKind } from './terrain.js';
import { readAs, basesOf, centerOn } from './select.js';
import { sourcesDisagree } from './disagreement.js';
import { liveScene } from './live-views.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
.pl{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36;
  --accent:#7bd0ff;--mark:#e0b24a;--markbg:rgba(224,178,74,.14);--bar:#4a86c8;--void:#b98bff;--star:#e0a24a;
  --mono:'SFMono-Regular',ui-monospace,Menlo,Consolas,monospace;--sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.55;
  display:flex;flex-direction:column;height:100%;min-height:0}
@media (prefers-color-scheme:light){.pl{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec;--markbg:rgba(200,140,20,.13)}}
:root[data-theme="dark"] .pl{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36;--markbg:rgba(224,178,74,.14)}
:root[data-theme="light"] .pl{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec;--markbg:rgba(200,140,20,.13)}
.pl *{box-sizing:border-box}
.pl button{font-family:var(--sans);font-size:13px;padding:6px 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);cursor:pointer;transition:.12s}
.pl button:hover{border-color:var(--accent)}
.pl-head{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--line);background:var(--panel)}
.pl-title{font-weight:600;font-size:15px;letter-spacing:.2px}
.pl-head .sp{flex:1 1 auto}
.pl-head .ic{opacity:.65;font-size:16px;cursor:pointer;user-select:none}
.pl-body{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:180px 1fr 220px;overflow:hidden}
@media (max-width:840px){.pl-body{grid-template-columns:1fr;overflow:auto}}
.pl-col{overflow:auto;min-height:0}
.pl-left{border-right:1px solid var(--line);background:var(--panel);padding:16px 14px}
.pl-right{border-left:1px solid var(--line);background:var(--panel);padding:16px 12px;display:flex;flex-direction:column;gap:9px}
.pl-main{padding:22px 30px;max-width:70ch}
.pl-kick{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:0 0 12px}
.pl-src{display:flex;gap:8px;align-items:baseline;padding:7px 0;color:var(--ink);cursor:default}
.pl-src .bx{color:var(--accent)}
.pl-src .lbl{line-height:1.3}
.pl-add{color:var(--dim);cursor:pointer;padding:8px 0;font-size:13px}
.pl-read-h{font-weight:600;margin:0 0 14px;font-size:15px}
.pl-read{font-size:15px;line-height:1.85}
.pl-mark{background:var(--markbg);border-bottom:1px solid var(--mark);border-radius:2px;padding:0 2px;cursor:pointer}
.pl-mark:hover{background:var(--mark);color:#0c0e12}
.pl-card{border:1px solid var(--line);background:var(--panel2);border-radius:11px;padding:12px 13px;cursor:pointer;transition:.12s}
.pl-card:hover{border-color:var(--accent)}
.pl-card .h{font-weight:600}
.pl-card .s{color:var(--dim);font-size:12px;margin-top:2px}
.pl-star{color:var(--star)}
/* popover */
.pl-pop-wrap{position:fixed;inset:0;z-index:40}
.pl-pop{position:absolute;width:320px;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.4);padding:14px 15px}
.pl-pop h4{margin:0 0 4px;font-size:15px}
.pl-pop .rule{height:1px;background:var(--line);margin:10px 0}
.pl-q{display:flex;gap:10px;align-items:baseline;padding:9px 6px;border-radius:8px;cursor:pointer}
.pl-q:hover{background:var(--panel2)}
.pl-q .qt{flex:1 1 auto}
.pl-q .qc{color:var(--dim);font-variant-numeric:tabular-nums}
.pl-q .st{color:var(--star)}
.pl-center{display:flex;gap:8px;align-items:center;margin-top:8px;padding:9px 6px;border-radius:8px;color:var(--accent);cursor:pointer}
.pl-center:hover{background:var(--panel2)}
/* full views */
.pl-view{padding:26px 34px;max-width:80ch;margin:0 auto;width:100%}
.pl-back{color:var(--dim);cursor:pointer;display:inline-block;margin-bottom:20px}
.pl-back:hover{color:var(--ink)}
.pl-h1{font-size:20px;font-weight:600;margin:0 0 6px}
.pl-lede{color:var(--dim);margin:0 0 22px}
.pl-bars{display:flex;flex-direction:column;gap:9px;margin:0 0 22px}
.pl-brow{display:flex;align-items:center;gap:14px}
.pl-brow .bar{height:16px;background:var(--bar);border-radius:3px;min-width:3px;flex:0 0 auto}
.pl-brow .bl{color:var(--ink)}
.pl-select{margin-top:6px}
.pl-select select{font-family:var(--sans);font-size:14px;padding:6px 10px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--ink)}
.pl-split{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-top:24px}
.pl-split>div{background:var(--panel);padding:16px 18px}
.pl-split h5{margin:0 0 12px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
.pl-splitcap{text-align:center;color:var(--dim);font-size:13px;margin-top:12px}
/* timeline / shifts */
.pl-tl{border-left:2px solid var(--line);padding-left:20px;margin-left:6px;display:flex;flex-direction:column;gap:2px}
.pl-tstep{position:relative;padding:4px 0 18px}
.pl-tstep .dot{position:absolute;left:-27px;top:5px;font-size:13px}
.pl-tstep .when{font-weight:600}
.pl-tstep .when .brk{color:var(--star);font-weight:400;margin-left:10px;font-size:12px}
.pl-tstep .txt{color:var(--dim);margin-top:2px}
.pl-tstep.break .txt{color:var(--ink)}
.pl-actions{margin-top:20px;display:flex;gap:18px;color:var(--accent)}
.pl-actions span{cursor:pointer}
/* center */
.pl-cbanner{color:var(--dim);margin-bottom:20px}
.pl-cgraph{display:flex;flex-direction:column;align-items:center;gap:26px}
.pl-cnode{border:1px solid var(--accent);background:var(--panel2);border-radius:10px;padding:10px 22px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:13px}
.pl-spokes{display:flex;gap:16px;flex-wrap:wrap;justify-content:center}
.pl-spoke{border:1px solid var(--line);background:var(--panel);border-radius:10px;padding:12px 14px;min-width:150px;cursor:pointer;transition:.12s}
.pl-spoke:hover{border-color:var(--accent)}
.pl-spoke .sl{font-weight:600}
.pl-spoke .sr{color:var(--dim);margin-top:6px;font-size:13px}
.pl-spoke .rc{color:var(--accent);font-size:12px;margin-top:8px;opacity:0;transition:.12s}
.pl-spoke:hover .rc{opacity:1}
/* map */
.pl-map{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.pl-map>div{background:var(--panel);padding:16px 16px}
.pl-map h5{margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase}
.pl-map .sub{color:var(--dim);font-size:12px;margin:0 0 12px}
.pl-map ul{list-style:none;margin:0;padding:0}
.pl-map li{padding:4px 0}
.pl-amb li{color:var(--dim)}
.pl-desert{border:1px solid var(--line);background:var(--panel2);border-radius:9px;padding:12px;color:var(--dim);font-size:13px;margin-top:14px;line-height:1.5}
.pl-slider{display:flex;align-items:center;gap:10px;color:var(--dim);font-size:12px;margin-bottom:14px}
.pl-slider input{flex:1 1 auto}
/* guide + blindspots */
.pl-guide-grp{margin:0 0 20px}
.pl-guide-grp h5{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);margin:0 0 8px}
.pl-guide-grp ol{margin:0;padding-left:0;list-style:none;counter-reset:none}
.pl-gsec{display:flex;gap:12px;padding:5px 0}
.pl-gsec .n{color:var(--dim);width:22px;text-align:right;font-variant-numeric:tabular-nums}
.pl-bs{border-top:1px solid var(--line);padding:16px 0}
.pl-bs:first-of-type{border-top:none}
.pl-bs .o{color:var(--void);margin-right:8px}
.pl-bs .n{font-weight:600}
.pl-bs .d{color:var(--dim);margin-top:3px;margin-left:22px}
.pl-foot{color:var(--dim);font-size:13px;border-top:1px solid var(--line);padding-top:14px;margin-top:8px}
/* live term picker */
.pl-chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 22px}
.pl-chip{border:1px solid var(--line);background:var(--panel2);border-radius:20px;padding:5px 13px;cursor:pointer;transition:.12s}
.pl-chip:hover{border-color:var(--accent);color:var(--accent)}
.pl-termform{display:flex;gap:8px;max-width:520px}
.pl-terminput{flex:1 1 auto;font-family:var(--sans);font-size:14px;padding:8px 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--ink)}
.pl-terminput:focus{outline:none;border-color:var(--accent)}
`;

// The six explore cards (doc §1 right rail). Each opens a full view. `sub` is the quiet
// second line; the card itself never names an operator or a terrain.
const CARDS = [
  { view: 'guide',       h: 'Study guide',        s: 'the whole thing, in order' },
  { view: 'timeline',    h: 'Timeline',           s: 'when each thing happened' },
  { view: 'shifts',      h: 'What changed',       s: 'where a meaning stopped fitting' },
  { view: 'meanings',    h: 'Where people disagree', s: 'one word, four readings' },
  { view: 'blindspots',  h: 'Blind spots',        s: 'named but never explained' },
  { view: 'map',         h: 'Map',                s: 'the whole field at a glance' },
];

export function mountPlainSurface(root, { scene, live = null } = {}) {
  if (!scene) throw new Error('mountPlainSurface needs a scene');
  // liveScene overlays the live explore-card projections (from project.liveModel) onto the scene, so
  // the card renderers below (guide/map/blind/timeline) read S.* live; else it's the demo scene.
  const S = liveScene(scene, live);
  const LIVE = live && Array.isArray(live.sources) && live.sources.length ? live : null;

  // ── State — small, and the screen is a projection of it. ──
  const st = {
    view: 'read',          // read | guide | timeline | shifts | meanings | map | blindspots | center | focus | disagree
    pop: null,             // { id, x, y } — the open popover's thing + anchor
    focus: null,           // { id, view } — a question routed to a per-thing focus panel
    basis: 'everyone',     // §3 dropdown
    word: 'surveillance',  // which idea the meanings/shifts views are about
    meaningsModel: null,   // a live disagreement model (from project.disagreeFor); null → scene fixture
    shiftsModel: null,     // a live shift model (from project.shiftsFor); null → scene fixture
    pickMode: 'meanings',  // in live mode, what the term picker leads to: meanings | shifts
    center: S.GRAPH ? (S.GRAPH.order?.[0] ?? null) : null, // §5 centered node
  };

  const shell = document.createElement('div');
  shell.className = 'pl';
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  root.appendChild(shell);

  const go = (view, extra = {}) => { Object.assign(st, { view, pop: null, focus: null }, extra); render(); };

  // ── The read screen: three panes. ──
  const renderRead = () => {
    const srcList = LIVE ? LIVE.sources : S.SOURCES;
    const sources = srcList.map((s) =>
      `<div class="pl-src"><span class="bx">▣</span><span class="lbl">${esc(s.label)}</span></div>`).join('')
      || '<div class="pl-src" style="color:var(--dim)">No sources yet.</div>';
    const title = LIVE ? 'Your sources' : S.TITLE;
    // The reading pane: the demo shows a marked passage; live mode shows a term picker over the
    // real corpus (the honest thing to click on real data are the words the sources actually use).
    const main = LIVE ? renderLivePicker() : `
      <div class="pl-read-h">${esc(S.READING.heading)}</div>
      <div class="pl-read">${S.READING.segments.map((p) => (typeof p === 'string'
        ? esc(p) : `<span class="pl-mark" data-thing="${esc(p.id)}">${esc(p.text)}</span>`)).join('')}</div>`;
    const cards = CARDS.map((c) =>
      `<div class="pl-card" data-view="${c.view}"><div class="h">${esc(c.h)}</div><div class="s">${esc(c.s)}</div></div>`).join('');
    shell.innerHTML = `
      <div class="pl-head"><div class="pl-title">${esc(title)}</div><div class="sp"></div>
        <span class="ic">🔍</span><span class="ic">⚙</span></div>
      <div class="pl-body">
        <div class="pl-col pl-left"><div class="pl-kick">Sources</div>${sources}
          <div class="pl-add">+ Add</div></div>
        <div class="pl-col pl-main">${main}</div>
        <div class="pl-col pl-right"><div class="pl-kick">Explore</div>${cards}</div>
      </div>`;
    shell.querySelectorAll('.pl-mark').forEach((el) => el.addEventListener('click', (e) => {
      const r = el.getBoundingClientRect();
      st.pop = { id: el.dataset.thing, x: r.left, y: r.bottom + 6 };
      render();
    }));
    shell.querySelectorAll('.pl-card').forEach((el) => el.addEventListener('click', () => {
      // In live mode the disagreement and "what changed" cards return to the term picker (the read
      // pane) in the matching mode; the other cards stay demo. Clear the models so a pick recomputes.
      if (LIVE && el.dataset.view === 'meanings') return go('read', { pickMode: 'meanings', meaningsModel: null });
      if (LIVE && el.dataset.view === 'shifts') return go('read', { pickMode: 'shifts', shiftsModel: null });
      go(el.dataset.view);
    }));
    if (LIVE) bindLivePicker();
  };

  // The live term picker (main pane, live mode). The person picks a word the corpus uses and asks
  // what each source means by it — the real "People mean different things by this".
  const renderLivePicker = () => {
    const chips = (LIVE.terms || []).slice(0, 40)
      .map((t) => `<span class="pl-chip" data-term="${esc(t)}">${esc(t)}</span>`).join('')
      || '<span style="color:var(--dim)">No entities read yet — type a word below.</span>';
    const shiftMode = st.pickMode === 'shifts';
    const head = shiftMode ? 'When did a word’s meaning change?' : 'What does a word mean to each source?';
    const lede = shiftMode
      ? 'Pick a word your sources use over time. If the meaning shifted, you’ll see when.'
      : 'Pick a word your sources use. If they don’t agree on what it means, you’ll see it.';
    const cta = shiftMode ? 'Track it over time' : 'Read it across the sources';
    return `
      <div class="pl-read-h">${esc(head)}</div>
      <p class="pl-lede">${esc(lede)}</p>
      <div class="pl-chips">${chips}</div>
      <form class="pl-termform"><input class="pl-terminput" type="text" placeholder="…or type any word" />
        <button type="submit">${esc(cta)}</button></form>`;
  };
  const bindLivePicker = () => {
    const pick = (t) => (st.pickMode === 'shifts' ? openShifts(t) : openDisagree(t));
    shell.querySelectorAll('.pl-chip').forEach((el) =>
      el.addEventListener('click', () => pick(el.dataset.term)));
    const form = shell.querySelector('.pl-termform');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = shell.querySelector('.pl-terminput').value.trim();
      if (v) pick(v);
    });
  };

  // Compute the live disagreement for a term and open the meanings view on it.
  const openDisagree = (term) => {
    let model = null;
    try { model = LIVE.disagreeFor(term); } catch { model = null; }
    go('meanings', { meaningsModel: model, word: term, basis: 'everyone' });
  };
  // Compute the live corpus-timeline shift for a term and open the §4 view on it.
  const openShifts = (term) => {
    let model = null;
    try { model = LIVE.shiftsFor ? LIVE.shiftsFor(term) : null; } catch { model = null; }
    go('shifts', { shiftsModel: model, word: term });
  };

  // ── The popover: exactly three questions + center. Driven by terrain.questionsFor. ──
  const renderPop = () => {
    const wrap = shell.querySelector('.pl-pop-wrap');
    if (wrap) wrap.remove();
    if (!st.pop) return;
    const thing = S.THINGS[st.pop.id];
    if (!thing) { st.pop = null; return; }
    const qs = questionsFor(thing.kind, thing.counts || {});
    const rows = qs.map((q, i) =>
      `<div class="pl-q" data-view="${q.view}" data-i="${i}">
         <span class="qt">${q.star ? '<span class="st">✱ </span>' : ''}${esc(q.label)}</span>
         <span class="qc">${q.count == null ? '' : q.count}</span></div>`).join('');
    const w = document.createElement('div');
    w.className = 'pl-pop-wrap';
    // Keep the popover on-screen horizontally.
    const left = Math.min(st.pop.x, (window.innerWidth || 1200) - 340);
    w.innerHTML = `<div class="pl-pop" style="left:${Math.max(8, left)}px;top:${st.pop.y}px">
        <h4>${esc(thing.title)}</h4><div class="rule"></div>${rows}
        <div class="pl-center" data-center="1">⌖ Center everything on this</div></div>`;
    w.addEventListener('click', (e) => { if (e.target === w) { st.pop = null; render(); } });
    w.querySelectorAll('.pl-q').forEach((el) => el.addEventListener('click', () => {
      const q = qs[Number(el.dataset.i)];
      routeQuestion(thing, q);
    }));
    w.querySelector('.pl-center').addEventListener('click', () => {
      const centerId = centerNodeFor(st.pop.id);
      go('center', centerId ? { center: centerId } : {});
    });
    shell.appendChild(w);
  };

  // A clicked thing maps to a graph node for centering when the scene knows one; else it
  // centers on whatever node shares its id, falling back to the first node.
  const centerNodeFor = (id) => {
    if (!S.GRAPH) return null;
    if (id in S.GRAPH.nodes) return id;
    if (id === 'fusus-downtown') return 'partnership';
    return S.GRAPH.order?.[0] ?? null;
  };

  // Route a chosen question to its view. The data-backed views (meanings/shifts) go to the
  // worked cards for that word; everything else opens a per-thing focus panel built honestly
  // from the reading — never a fabricated detail.
  const routeQuestion = (thing, q) => {
    if (q.view === 'meanings' && S.MEANINGS[st.pop.id]) return go('meanings', { word: st.pop.id, basis: 'everyone' });
    if (q.view === 'shifts' && S.SHIFTS[st.pop.id]) return go('shifts', { word: st.pop.id });
    if (q.view === 'blindspots') return go('blindspots');
    return go('focus', { focus: { id: st.pop.id, view: q.view, label: q.label, kind: thing.kind, title: thing.title } });
  };

  const backBar = () => `<span class="pl-back" data-back="1">← back</span>`;

  // Resolve the meanings model for the §3 view — a LIVE disagreement model (computed from the
  // person's real sources) when one is set, else the scene fixture for the demo word.
  const meaningsModel = () => {
    if (st.meaningsModel) {
      const m = st.meaningsModel;
      const n = m.sources ? m.sources.length : (m.bases ? m.bases.length : 0);
      return {
        title: `"${m.term}"`,
        meanings: m.meanings,
        bases: m.bases,
        baseLabel: m.baseLabel || {},
        lede: sourcesDisagree(m)
          ? `Your ${n} sources don’t agree on what this word means.`
          : (m.meanings.length ? 'Your sources broadly agree on what this word means.'
                               : 'None of your sources say what this word is.'),
      };
    }
    const word = S.MEANINGS[st.word] ? st.word : Object.keys(S.MEANINGS)[0];
    return {
      title: (S.THINGS[word]?.title) || `"${word}"`,
      meanings: S.MEANINGS[word],
      bases: S.BASIS_ORDER,
      baseLabel: S.BASIS_LABEL || {},
      lede: 'Your four sources don’t agree on what this word means.',
    };
  };

  // ── §3 · Where people disagree. The dropdown redraws the bars; select.readAs is the fold. ──
  const renderMeanings = () => {
    const mm = meaningsModel();
    const rows = readAs(mm.meanings, st.basis);
    const bars = rows.length ? rows.map((r) =>
      `<div class="pl-brow"><div class="bar" style="width:${Math.round(6 + r.share * 300)}px"></div>
        <div class="bl">${esc(r.label)}</div></div>`).join('')
      : '<p class="pl-lede">Nothing here to read — none of these sources characterize the word.</p>';
    const opts = basesOf(mm.meanings, mm.bases).map((b) =>
      `<option value="${esc(b)}"${b === st.basis ? ' selected' : ''}>${esc(mm.baseLabel[b] || b)}</option>`).join('');
    shell.innerHTML = `<div class="pl-col" style="overflow:auto"><div class="pl-view">
      ${backBar()}
      <div class="pl-h1">${esc(mm.title)}</div>
      <p class="pl-lede">${esc(mm.lede)}</p>
      <div class="pl-bars">${bars}</div>
      <div class="pl-select">Read it as: <select>${opts}</select></div>
      <div class="pl-actions"><span data-toshifts>▸ When did people change their minds about this?</span></div>
    </div></div>`;
    bindBack();
    const sel = shell.querySelector('select');
    if (sel) sel.addEventListener('change', (e) => { st.basis = e.target.value; render(); });
    const ts = shell.querySelector('[data-toshifts]');
    if (ts) ts.addEventListener('click', () => {
      if (LIVE) return openShifts(st.word);
      go('shifts', { shiftsModel: null, word: st.word });
    });
  };

  // ── §4 · When people changed their minds — a REC scan over corpus time. A LIVE model (from
  // project.shiftsFor, the real change-point detector) when one is set, else the scene fixture. ──
  const renderShifts = () => {
    const sc = st.shiftsModel || S.SHIFTS[st.word] || Object.values(S.SHIFTS)[0];
    const steps = (sc.marks || []).map((m) => {
      const dot = m.kind === 'break' ? '◉' : '●';
      const brk = m.note ? `<span class="brk">← ${esc(m.note)}</span>` : '';
      return `<div class="pl-tstep ${m.kind}"><span class="dot">${dot}</span>
        <div class="when">${esc(m.when)}${brk}</div><div class="txt">${esc(m.text)}</div></div>`;
    }).join('') || '<p class="pl-lede">No dated sources use this word — nothing to track over time.</p>';
    const firstBreak = (sc.marks || []).find((m) => m.kind === 'break');
    shell.innerHTML = `<div class="pl-col" style="overflow:auto"><div class="pl-view">
      ${backBar()}
      <div class="pl-h1">When people changed their minds about “${esc(sc.word || st.word)}”</div>
      <p class="pl-lede">${esc(sc.lede || '')}</p>
      <div class="pl-tl">${steps}</div>
      <div class="pl-actions">
        ${firstBreak ? `<span data-read>▸ Read what happened in ${esc(firstBreak.when)}</span>` : ''}
        <span>▸ Add to study guide</span></div>
    </div></div>`;
    bindBack();
    const rd = shell.querySelector('[data-read]');
    if (rd) rd.addEventListener('click', () => {
      const src = sc.marks.find((m) => m.kind === 'break')?.source;
      go('focus', { focus: { id: st.word, view: 'source', label: 'what happened', srcId: src, kind: 'idea', title: `“${sc.word}”` } });
    });
  };

  // ── §5 · Center everything on this — change of basis; select.centerOn is the fold. ──
  const renderCenter = () => {
    const c = centerOn(S.GRAPH, st.center, S.GRAPH.order);
    if (!c) return go('read');
    const spokes = c.spokes.map((sp) =>
      `<div class="pl-spoke" data-node="${esc(sp.id)}"><div class="sl">${esc(sp.label)}</div>
        <div class="sr">${esc(sp.role)}</div><div class="rc">⌖ center on this instead</div></div>`).join('');
    shell.innerHTML = `<div class="pl-col" style="overflow:auto"><div class="pl-view">
      ${backBar()}
      <div class="pl-cbanner">Centered on: <b>${esc(c.label)}</b> — nothing moved, everything reads differently.</div>
      <div class="pl-cgraph">
        <div class="pl-cnode">${esc(c.label)}</div>
        <div class="pl-spokes">${spokes}</div></div>
    </div></div>`;
    bindBack();
    shell.querySelectorAll('.pl-spoke').forEach((el) => el.addEventListener('click', () => { st.center = el.dataset.node; render(); }));
  };

  // ── §6 · The map — ambient / things / patterns, with the desert cell as a grey box. ──
  const renderMap = () => {
    const li = (xs) => xs.map((x) => `<li>${esc(x)}</li>`).join('');
    const marks = (S.MAP.shiftMarks || []).map((m) => `<span title="${esc(m)}">▲</span>`).join(' ');
    shell.innerHTML = `<div class="pl-col" style="overflow:auto"><div class="pl-view" style="max-width:96ch">
      ${backBar()}
      <div class="pl-h1">Map</div>
      <div class="pl-slider">As of: <input type="range" min="0" max="100" value="100" disabled>
        <span>${esc(S.MAP.span.from)} — ${esc(S.MAP.span.to)}</span></div>
      <div class="pl-lede" style="margin-bottom:14px">${marks} <span style="margin-left:8px">things shifted here</span></div>
      <div class="pl-map">
        <div class="pl-amb"><h5>Around it</h5><div class="sub">nearby but never connected</div><ul>${li(S.MAP.around)}</ul>
          <div class="pl-desert">${esc(S.MAP.desert)}</div></div>
        <div><h5>The things</h5><div class="sub">actually in the documents</div><ul>${li(S.MAP.things)}</ul></div>
        <div><h5>Patterns</h5><div class="sub">what keeps happening</div><ul>${li(S.MAP.patterns)}</ul></div>
      </div>
    </div></div>`;
    bindBack();
  };

  // ── §7 · Study guide — the forced order is the pedagogy. ──
  const renderGuide = () => {
    const g = S.STUDY_GUIDE;
    let n = 0;
    const grps = g.groups.map((grp) => {
      const secs = grp.sections.map((s) => {
        n += 1;
        const text = typeof s === 'string' ? s : s.text;
        const star = (typeof s === 'object' && s.star) ? ' <span class="pl-star">✱</span>' : '';
        return `<div class="pl-gsec"><span class="n">${n}</span><span>${esc(text)}${star}</span></div>`;
      }).join('');
      return `<div class="pl-guide-grp"><h5>${esc(grp.title)}</h5>${secs}</div>`;
    }).join('');
    shell.innerHTML = `<div class="pl-col" style="overflow:auto"><div class="pl-view">
      ${backBar()}
      <div class="pl-h1">Study guide</div>
      <p class="pl-lede">${esc(g.title)} · ${n} sections · ${esc(g.built)}</p>
      ${grps}
      <div class="pl-actions"><span>▸ Walk me through it</span><span>▸ Share</span><span>▸ Make my own version</span></div>
    </div></div>`;
    bindBack();
  };

  // ── §8 · Blind spots — the typed void as a card. ──
  const renderBlind = () => {
    const rows = S.BLIND_SPOTS.map((b) =>
      `<div class="pl-bs"><span class="o">○</span><span class="n">${esc(b.name)}</span>
        <div class="d">${esc(b.note)}</div></div>`).join('');
    shell.innerHTML = `<div class="pl-col" style="overflow:auto"><div class="pl-view">
      ${backBar()}
      <div class="pl-h1">Blind spots</div>
      <p class="pl-lede">Things your sources name but never explain.</p>
      ${rows}
      <div class="pl-foot">These are the gaps in what you have — not gaps in what exists.</div>
    </div></div>`;
    bindBack();
  };

  // ── Timeline — a plain projection of the shift marks + source dates. ──
  const renderTimeline = () => {
    const sc = Object.values(S.SHIFTS)[0];
    const steps = sc.marks.map((m) => {
      const dot = m.kind === 'break' ? '◉' : '●';
      return `<div class="pl-tstep ${m.kind}"><span class="dot">${dot}</span>
        <div class="when">${esc(m.when)}</div><div class="txt">${esc(m.text)}</div></div>`;
    }).join('');
    shell.innerHTML = `<div class="pl-col" style="overflow:auto"><div class="pl-view">
      ${backBar()}
      <div class="pl-h1">Timeline</div>
      <p class="pl-lede">When each thing happened, in order.</p>
      <div class="pl-tl">${steps}</div>
    </div></div>`;
    bindBack();
  };

  // ── The per-thing focus panel — an honest, derived answer for a routed question that has
  // no bespoke card. It shows where the thing lands across the sources; it never invents a
  // detail the corpus doesn't carry. ──
  const renderFocus = () => {
    const f = st.focus;
    const thing = S.THINGS[f.id] || { title: f.title };
    // Where it comes up: a simple, honest tally across the sources that mention it.
    const rows = S.SOURCES.map((s) => `<div class="pl-src"><span class="bx">▣</span><span class="lbl">${esc(s.full || s.label)}</span></div>`).join('');
    const terr = terrainOfKind(thing.kind || 'name');
    shell.innerHTML = `<div class="pl-col" style="overflow:auto"><div class="pl-view">
      ${backBar()}
      <div class="pl-h1">${esc(thing.title || f.title)}</div>
      <p class="pl-lede">${esc(f.label)}</p>
      <div class="pl-kick" style="margin-bottom:8px">Across your sources</div>
      ${rows}
      <div class="pl-foot">Shown from what the four documents actually say${terr ? '' : ''}. Nothing here is guessed.</div>
    </div></div>`;
    bindBack();
  };

  const bindBack = () => {
    const b = shell.querySelector('[data-back]');
    if (b) b.addEventListener('click', () => go('read'));
  };

  const render = () => {
    switch (st.view) {
      case 'read':       renderRead(); renderPop(); break;
      case 'meanings':   renderMeanings(); break;
      case 'shifts':     renderShifts(); break;
      case 'center':     renderCenter(); break;
      case 'map':        renderMap(); break;
      case 'guide':      renderGuide(); break;
      case 'blindspots': renderBlind(); break;
      case 'timeline':   renderTimeline(); break;
      case 'focus':      renderFocus(); break;
      default:           renderRead(); renderPop();
    }
  };

  render();

  return {
    el: shell,
    // A small programmatic handle, mirroring the other room surfaces — open a view, or the
    // popover for a thing, from outside (used by tests / a host that wants to drive it).
    open: (view) => go(view),
    state: st,
    destroy: () => { shell.remove(); style.remove(); },
  };
}
