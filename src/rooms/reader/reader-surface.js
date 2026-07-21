// EO: SIG·INS(Lens,Void → Entity, Tending,Making) — the reader room, one engine at two widths.
// mountReaderSurface — the responsive shell of the reader room (integration guide §1/§2/§4). One
// corpus, two surfaces: a DESKTOP 3-region layout (left scope rail · centre overview/result · right
// meaning+ledger rail) and a MOBILE 3-tab layout (Overview · Ask · Sources, with a pushed ledger and
// a full-screen orbit overlay), collapsing between them under one width breakpoint. Both render the
// SAME QuestionResult (question-result.js assembleQuestionResult), so the convergence, the ledger and
// the meaning space are identical at both widths.
//
// The through-line the guide keeps insisting on, wired here for real:
//   · scope is a lens, never a place — toggling a source (either surface) reruns assembleQuestionResult
//     and re-feeds the ledger AND the orbit from the one scope, in place (spec §33). No page change.
//   · the ledger and the orbit are two projections of ONE tree — a click in either re-centres the
//     other (ledger claim → orbit.focus; orbit body → ledger.revealClaim).
//   · you can click ALL the way down — paradigm → atmosphere → lens → claim → base span → source —
//     from the ledger (onOpenSpan) AND from the orbit's own existence level (onSpan). Never a modal.
//   · Ask is a PIVOT, not a chat turn — a re-ask replaces the QuestionResult, never appends.
//
// Pure DOM + SVG (reuses mountSolarSystem / mountLedger as-is), own CSS-in-JS, no framework.

import { mountSolarSystem } from './solar-system.js';
import { mountLedger } from './ledger-surface.js';
import { assembleQuestionResult, STANDINGS } from './question-result.js';

const STYLE_ID = 'eo-reader-style';
const CSS = `
.eo-rd{--rd-violet:#6355f2;font-family:var(--sans,'Onest',system-ui,sans-serif);color:#1b1b1f;height:100%;display:flex;min-height:0;overflow:hidden;background:#f4f4f6;}
.eo-rd *{box-sizing:border-box;}
.eo-rd__col{display:flex;flex-direction:column;min-height:0;}
/* ── left scope rail (desktop) ── */
.eo-rd__scope{width:258px;flex:none;background:#fafafb;border-right:1px solid #ececf0;overflow:hidden;}
.eo-rd__scopeHead{padding:16px 18px 8px;flex:none;}
.eo-rd__kicker{font-size:9.5px;font-weight:700;letter-spacing:0.8px;color:#9b9ba3;}
.eo-rd__scopeNote{font-size:11px;color:#a0a0a8;line-height:1.4;margin-top:6px;}
.eo-rd__scopeBtns{display:flex;gap:7px;margin-top:11px;}
.eo-rd__btn{border:none;border-radius:9px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;background:#f2f2f5;color:#5a5a63;}
.eo-rd__btn--v{background:#ece9fe;color:#5a49e8;}
.eo-rd__btn--dark{background:#17171a;color:#fff;}
.eo-rd__btn--full{width:100%;margin-top:9px;}
.eo-rd__srcList{flex:1;min-height:0;overflow-y:auto;padding:8px 12px;display:flex;flex-direction:column;gap:8px;}
.eo-rd__srcCard{background:#fff;border:1px solid #ececf0;border-radius:13px;padding:12px;}
.eo-rd__srcCard--off{background:#f6f6f8;border-color:#efeff2;}
.eo-rd__srcTop{display:flex;align-items:flex-start;gap:10px;}
.eo-rd__srcAvatar{width:30px;height:30px;border-radius:8px;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex:none;font-family:var(--mono,'JetBrains Mono',monospace);}
.eo-rd__srcHost{font-family:var(--mono,'JetBrains Mono',monospace);font-size:12px;font-weight:600;color:#1b1b1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.eo-rd__srcContrib{font-size:10.5px;color:#9b9ba3;margin-top:2px;}
.eo-rd__toggle{background:none;border:none;cursor:pointer;padding:0;flex:none;}
.eo-rd__track{width:38px;height:22px;border-radius:20px;position:relative;display:inline-block;transition:background .15s;}
.eo-rd__knob{position:absolute;top:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.25);transition:left .15s;}
.eo-rd__badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px;}
.eo-rd__badge{font-size:8px;font-weight:700;letter-spacing:0.4px;padding:2px 6px;border-radius:5px;}
/* ── centre ── */
.eo-rd__main{flex:1;min-width:0;background:#f4f4f6;}
.eo-rd__askbar{flex:none;padding:18px 28px 12px;border-bottom:1px solid #ececf0;}
.eo-rd__ask{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e4e4ea;border-radius:14px;padding:12px 15px;}
.eo-rd__askInput{flex:1;min-width:0;font-size:15px;font-weight:500;color:#2f2f36;border:none;outline:none;background:none;font-family:inherit;}
.eo-rd__seg{display:flex;gap:7px;flex:none;}
.eo-rd__segBtn{border:none;border-radius:9px;padding:7px 13px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;background:#f2f2f5;color:#5a5a63;}
.eo-rd__segBtn--on{background:#17171a;color:#fff;}
.eo-rd__scroll{flex:1;min-height:0;overflow-y:auto;}
.eo-rd__centre{max-width:680px;margin:0 auto;padding:24px 28px 44px;display:flex;flex-direction:column;gap:14px;}
.eo-rd__card{background:#fff;border:1px solid #ececf0;border-radius:20px;padding:20px 22px;}
.eo-rd__pill{display:inline-block;font-size:10px;font-weight:700;letter-spacing:1px;color:#9b9ba3;background:#f2f2f5;padding:4px 9px;border-radius:6px;}
.eo-rd__topic{font-family:var(--serif,'Newsreader',Georgia,serif);font-size:28px;line-height:1.14;font-weight:500;margin:14px 0 10px;color:#17171a;text-wrap:pretty;}
.eo-rd__sub{font-size:12.5px;color:#7a7a83;}
.eo-rd__section{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:13px;}
.eo-rd__sectionT{font-size:11px;font-weight:700;letter-spacing:0.6px;color:#5a5a63;}
.eo-rd__sectionN{font-size:10.5px;color:#a6a6ae;}
.eo-rd__conv{display:flex;gap:10px;margin-bottom:13px;}
.eo-rd__convStat{flex:1;text-align:center;}
.eo-rd__convN{font-family:var(--mono,'JetBrains Mono',monospace);font-size:26px;font-weight:600;line-height:1;}
.eo-rd__convL{font-size:10.5px;color:#9b9ba3;margin-top:6px;}
.eo-rd__convBar{display:flex;height:13px;border-radius:7px;overflow:hidden;gap:2px;background:#f4f4f6;}
.eo-rd__convSummary{font-size:12.5px;line-height:1.5;color:#3a3a41;margin-top:13px;text-wrap:pretty;}
.eo-rd__verdict{border:1px solid #ececf0;border-radius:16px;padding:15px 18px;}
.eo-rd__verdictKick{display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:0.6px;padding:3px 9px;border-radius:6px;}
.eo-rd__verdictText{font-size:15px;line-height:1.45;color:#26262b;margin-top:10px;text-wrap:pretty;}
.eo-rd__verdictMeta{font-size:11.5px;color:#8a8a92;margin-top:10px;}
.eo-rd__consequence{display:flex;gap:9px;align-items:flex-start;background:#f8f7ff;border:1px dashed #e6e1f7;border-radius:12px;padding:11px 14px;font-size:12px;color:#8580ab;line-height:1.45;}
.eo-rd__split{display:flex;gap:14px;flex-wrap:wrap;}
.eo-rd__splitCol{flex:1;min-width:120px;}
.eo-rd__quote{font-family:var(--serif,'Newsreader',Georgia,serif);font-size:15px;line-height:1.4;color:#26262b;}
.eo-rd__srcTag{font-family:var(--mono,'JetBrains Mono',monospace);font-size:10.5px;color:#7a6ef0;}
/* ── right rail (desktop) — dark, orbit over ledger ── */
.eo-rd__right{width:360px;flex:none;background:#0d0d15;border-left:1px solid #211f30;color:#eceaf5;}
.eo-rd__rightHead{flex:none;display:flex;align-items:center;gap:8px;padding:14px 16px 10px;}
.eo-rd__rightKicker{font-size:9.5px;font-weight:700;letter-spacing:1.2px;color:#8b83c9;}
.eo-rd__rightSub{font-size:11px;color:#7c779e;margin-top:2px;}
.eo-rd__iconBtn{flex:none;width:26px;height:26px;border-radius:7px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:#cfc9ee;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;}
.eo-rd__stage{flex:none;padding:8px 12px 0;}
.eo-rd__ledgerWrap{flex:1;min-height:0;overflow-y:auto;padding:12px 14px 22px;}
.eo-rd__rightStrip{width:46px;flex:none;background:#0d0d15;border-left:1px solid #211f30;display:flex;flex-direction:column;align-items:center;padding:16px 0;gap:14px;cursor:pointer;}
.eo-rd__stripLabel{writing-mode:vertical-rl;transform:rotate(180deg);font-size:10px;font-weight:700;letter-spacing:1.5px;color:#8b83c9;}
/* ── mobile ── */
.eo-rd--mobile{flex-direction:column;}
.eo-rd__tabs{display:flex;background:#fff;border-top:1px solid #efeff2;padding:8px 4px 10px;flex:none;}
.eo-rd__tab{flex:1;background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;padding:4px 0;font-family:inherit;font-size:10px;font-weight:600;}
.eo-rd__srcPanel{position:absolute;left:16px;right:16px;bottom:16px;background:#17171a;color:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 8px 30px rgba(0,0,0,0.3);z-index:60;}
.eo-rd__overlay{position:absolute;inset:0;z-index:50;display:flex;flex-direction:column;background:radial-gradient(120% 90% at 50% 38%,#14131f 0%,#0b0b12 62%,#08080e 100%);color:#eceaf5;}
.eo-rd__pos{position:relative;flex:1;min-height:0;}
`;

const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Standing → the muted card colours the guide's grounded-synthesis section uses.
const CARD_STYLE = {
  corroborated:    { bg: '#fff',     border: '#ececf0', kick: 'CORROBORATED',  kickC: '#2f7a55', kickBg: '#dcf0e5' },
  contested:       { bg: '#fffaf4',  border: '#f2e2cf', kick: 'CONTESTED',     kickC: '#c2410c', kickBg: '#fbe4d3' },
  'single-source': { bg: '#fbfbfc',  border: '#ececf0', kick: 'ONE SOURCE',    kickC: '#5a6472', kickBg: '#eceef2' },
  void:            { bg: '#fbfbfc',  border: '#ececf0', kick: 'VOID',          kickC: '#7a7a83', kickBg: '#eeeef1' },
};

export const mountReaderSurface = (host, opts = {}) => {
  const doc = host.ownerDocument || document;
  if (!doc.getElementById(STYLE_ID)) { const st = doc.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; doc.head.appendChild(st); }

  const reading = opts.reading || { query: '', sources: [], frames: null, claims: [] };
  const o = { ...opts };
  const state = {
    sources: (reading.sources || []).map((s) => ({ ...s, active: s.active !== false })),
    view: 'overview',      // desktop centre + mobile ask-result
    tab: 'overview',       // mobile bottom tab
    push: null,            // mobile: 'ledger'
    overlay: null,         // mobile: 'meaning'
    rightOpen: true, orbitOpen: true,
    selectedId: null, meaningFocus: null,
    consequence: null,
    result: null,
    mode: opts.mode || 'desktop',
    sourcePanel: null,     // mobile demo landing target for a span jump
  };

  const breakpoint = opts.breakpoint || 860;
  let ledgerHandle = null, orbitHandle = null;

  const recompute = () => {
    state.result = assembleQuestionResult({
      query: reading.query, frames: reading.frames, claims: reading.claims,
      sources: state.sources,
    });
  };
  recompute();

  // ── the base-span jump: the bottom of the descent, wired once, used by both projections ──────
  // A span carries { sn, docId, unit, quote }. If the host gave a real resolver we resolve to exact
  // offsets and hand the host onOpenSource(sn, text) — the same affordance every source row in the
  // app already uses (anchor.js resolveAnchor → openViewer → scrollToText). With no host wiring
  // (the standalone demo), we surface the resolved passage in place so the click still lands.
  const openSource = (span) => {
    let text = span.quote || span.text || '';
    let status = null;
    if (o.resolveSpan) { try { const r = o.resolveSpan(span); if (r) { text = r.text || text; status = r.status || null; } } catch { /* best-effort */ } }
    if (o.onOpenSource) { try { o.onOpenSource(span.sn, text, span); return; } catch { /* fall to panel */ } }
    state.sourcePanel = { sn: span.sn, host: span.host || span.docId || '', text, status };
    render();
  };

  // ── the two projections share one selection ──────────────────────────────────────────────────
  const onOrbitSelect = (node) => {
    if (!node) return;
    if (node.id && node.id.startsWith('c:')) { const claimId = node.id.slice(2); state.selectedId = claimId; if (ledgerHandle) ledgerHandle.revealClaim(claimId); }
    else if (node.id && node.id.startsWith('f:')) { const fid = node.id.slice(2); state.selectedId = fid; if (ledgerHandle) ledgerHandle.select(fid); }
  };
  const onLedgerSelectClaim = (claimId) => { state.selectedId = claimId; if (orbitHandle) { try { orbitHandle.focus('c:' + claimId); } catch { /* best-effort */ } } };

  // ── the orbit (mountSolarSystem, reused as-is) ───────────────────────────────────────────────
  const mountOrbit = (stage, { width, height }) => {
    const m = state.result.meaning;
    try {
      orbitHandle = mountSolarSystem(stage, {
        nodes: m.nodes, edges: m.edges, spans: m.spans, centreId: m.centreId, count: m.spans.length,
        countsLabel: m.countsLabel, width, height,
        focusId: state.meaningFocus, onFocus: (id) => { state.meaningFocus = id; },
        onSelect: onOrbitSelect,
        onSpan: (span) => openSource(span),                       // existence level → base span → source
        onOpen: (node) => { if (node && node.ref && node.ref.sn) openSource({ sn: node.ref.sn }); },
      });
    } catch { stage.appendChild(Object.assign(doc.createElement('div'), { textContent: 'Meaning map failed to render.', style: 'color:#8a8a92;font-size:12px;padding:14px;' })); }
  };

  const mountLedgerInto = (container, dark) => {
    ledgerHandle = mountLedger(container, {
      ledger: state.result.ledger, standings: STANDINGS, selectedId: state.selectedId, dark,
      resolveSpan: o.resolveSpan || null,
      onSelectFrame: (id) => { state.selectedId = id; },
      onSelectClaim: onLedgerSelectClaim,
      onOpenSpan: (span) => openSource(span),                     // ledger claim → base span → source
    });
  };

  // ── the source scope card (shared by desktop rail and mobile sheet) ──────────────────────────
  const scopeConsequence = (fn) => {
    // capture per-claim standings, run the toggle, diff, and name the change (spec §33 consequence).
    const before = {};
    for (const n of state.result.ledger.nodes) for (const c of n.claims) before[c.text] = c.standing;
    fn(); recompute();
    let changed = null;
    for (const n of state.result.ledger.nodes) for (const c of n.claims) { if (before[c.text] && before[c.text] !== c.standing) { changed = { text: c.text, from: before[c.text], to: c.standing }; break; } }
    state.consequence = changed;
    render();
  };
  const toggleSource = (sn) => scopeConsequence(() => { const s = state.sources.find((x) => (x.sn ?? x.id) === sn); if (s) s.active = !s.active; });
  const setAll = (v) => scopeConsequence(() => state.sources.forEach((s) => { s.active = v; }));

  const renderSourceCard = (s) => {
    const card = doc.createElement('div');
    card.className = 'eo-rd__srcCard' + (s.active ? '' : ' eo-rd__srcCard--off');
    const badges = (s.badges || []).map((b) => `<span class="eo-rd__badge" style="color:${b.c};background:${b.bg};">${esc(b.t)}</span>`).join('');
    card.innerHTML =
      '<div class="eo-rd__srcTop">' +
        `<div class="eo-rd__srcAvatar" style="background:${s.abg || '#eceafd'};color:${s.afg || '#6355f2'};">${esc(s.letter || (s.sn || '').replace(/\D/g, '') || '•')}</div>` +
        `<div style="flex:1;min-width:0;"><div class="eo-rd__srcHost">${esc(s.host || s.sn)}</div><div class="eo-rd__srcContrib">${esc(s.contrib || '')}</div></div>` +
        `<button class="eo-rd__toggle" aria-label="Toggle ${esc(s.sn)}"><span class="eo-rd__track" style="background:${s.active ? '#6355f2' : '#dcdce2'};"><span class="eo-rd__knob" style="left:${s.active ? 18 : 2}px;"></span></span></button>` +
      '</div>' +
      (badges ? `<div class="eo-rd__badges">${badges}</div>` : '');
    card.querySelector('.eo-rd__toggle').addEventListener('click', () => toggleSource(s.sn ?? s.id));
    return card;
  };

  const renderScopeRail = () => {
    const col = doc.createElement('aside'); col.className = 'eo-rd__col eo-rd__scope';
    const sc = state.result.sourceScope;
    const head = doc.createElement('div'); head.className = 'eo-rd__scopeHead';
    head.innerHTML =
      `<div style="display:flex;align-items:center;justify-content:space-between;"><span class="eo-rd__kicker">EVIDENCE SCOPE</span><span style="font-size:11px;font-weight:600;color:#7a7a83;">${sc.active} of ${sc.total} sources</span></div>` +
      '<div class="eo-rd__scopeNote">Toggling recomputes the answer, the ledger and the meaning space in place. Scope is never a separate page.</div>' +
      '<div class="eo-rd__scopeBtns"><button class="eo-rd__btn eo-rd__btn--v" data-all>All</button><button class="eo-rd__btn" data-none>None</button></div>' +
      '<button class="eo-rd__btn eo-rd__btn--v eo-rd__btn--full" data-add>+ Add source</button>';
    head.querySelector('[data-all]').addEventListener('click', () => setAll(true));
    head.querySelector('[data-none]').addEventListener('click', () => setAll(false));
    head.querySelector('[data-add]').addEventListener('click', () => { if (o.onAddSource) o.onAddSource(); });
    col.appendChild(head);
    const list = doc.createElement('div'); list.className = 'eo-rd__srcList';
    for (const s of state.sources) list.appendChild(renderSourceCard(s));
    col.appendChild(list);
    return col;
  };

  // ── convergence strip (Σ of the standings in scope) ──────────────────────────────────────────
  const renderConvergence = (scoped) => {
    const box = doc.createElement('div'); box.className = 'eo-rd__card';
    const { settled, contested, void: vd } = state.result.convergence;
    const total = Math.max(1, settled + contested + vd);
    const pct = (n) => Math.round((n / total) * 100);
    box.innerHTML =
      `<div class="eo-rd__section"><span class="eo-rd__sectionT">CONVERGENCE</span><span class="eo-rd__sectionN">${scoped || `across ${state.result.sourceScope.active} active sources`}</span></div>` +
      '<div class="eo-rd__conv">' +
        `<div class="eo-rd__convStat"><div class="eo-rd__convN" style="color:#3f9d6d;">${settled}</div><div class="eo-rd__convL">settled</div></div>` +
        `<div class="eo-rd__convStat"><div class="eo-rd__convN" style="color:#d97a34;">${contested}</div><div class="eo-rd__convL">contested</div></div>` +
        `<div class="eo-rd__convStat"><div class="eo-rd__convN" style="color:#9aa0ad;">${vd}</div><div class="eo-rd__convL">void</div></div>` +
      '</div>' +
      '<div class="eo-rd__convBar">' +
        (settled ? `<div style="width:${pct(settled)}%;background:#3f9d6d;border-radius:6px 0 0 6px;"></div>` : '') +
        (contested ? `<div style="width:${pct(contested)}%;background:#e0863f;"></div>` : '') +
        (vd ? `<div style="width:${pct(vd)}%;background:repeating-linear-gradient(45deg,#d5d5dd,#d5d5dd 3px,#e6e6ec 3px,#e6e6ec 6px);border-radius:0 6px 6px 0;"></div>` : '') +
      '</div>';
    return box;
  };

  // ── direct verdict cards (grounded synthesis) — pulled from the ledger's own claims ──────────
  const directCards = () => {
    const claims = [];
    for (const n of state.result.ledger.nodes) for (const c of n.claims) claims.push({ ...c, frameLabel: n.label });
    const pick = (st) => claims.filter((c) => c.standing === st);
    const out = [];
    const corr = pick('corroborated').sort((a, b) => b.origins - a.origins)[0]; if (corr) out.push(corr);
    const cont = pick('contested')[0]; if (cont) out.push(cont);
    const vd = pick('void')[0]; if (vd) out.push(vd);
    if (!out.length && claims.length) out.push(claims[0]);
    return out;
  };
  const renderVerdictCard = (c) => {
    const cs = CARD_STYLE[c.standing] || CARD_STYLE['single-source'];
    const card = doc.createElement('div'); card.className = 'eo-rd__verdict'; card.style.background = cs.bg; card.style.borderColor = cs.border;
    if (c.standing === 'contested') {
      // Two readings side by side (spec §6.2): the claim and its rival. The disagreement IS the
      // answer — never collapsed into a prose compromise. Both columns keep their source roster.
      const mySns = (c.support.length ? c.support : c.spanRefs).map((w) => w.sn).filter(Boolean);
      const rival = c.rival || (c.contest.length ? { text: c.contest[0].quote, sns: c.contest.map((w) => w.sn) } : null);
      card.innerHTML =
        `<span class="eo-rd__verdictKick" style="color:${cs.kickC};background:${cs.kickBg};">CONTESTED · ${esc(c.meta || '')}</span>` +
        '<div class="eo-rd__split" style="margin-top:12px;">' +
          `<div class="eo-rd__splitCol"><div class="eo-rd__quote">“${esc(c.text)}”</div><div class="eo-rd__srcTag">${mySns.join(' ')}</div></div>` +
          (rival ? `<div class="eo-rd__splitCol"><div class="eo-rd__quote">“${esc(rival.text || 'A rival reading')}”</div><div class="eo-rd__srcTag">${(rival.sns || []).join(' ')}</div></div>` : '') +
        '</div>';
    } else {
      card.innerHTML =
        `<span class="eo-rd__verdictKick" style="color:${cs.kickC};background:${cs.kickBg};">${cs.kick}</span>` +
        `<div class="eo-rd__verdictText">${esc(c.text)}</div>` +
        `<div class="eo-rd__verdictMeta">${esc(c.meta || '')}</div>`;
    }
    return card;
  };

  // ── centre: overview or question result ─────────────────────────────────────────────────────
  const renderCentre = (mobileMeaning) => {
    const scroll = doc.createElement('div'); scroll.className = 'eo-rd__scroll';
    const centre = doc.createElement('div'); centre.className = 'eo-rd__centre';
    const sc = state.result.sourceScope;
    const nClaims = state.result.ledger.nodes.reduce((a, n) => a + n.claims.length, 0);

    if (state.view === 'overview') {
      const hero = doc.createElement('div'); hero.className = 'eo-rd__card';
      hero.innerHTML =
        '<div class="eo-rd__pill">RESEARCH TOPIC</div>' +
        `<div class="eo-rd__topic">${esc(reading.title || reading.query)}</div>` +
        `<div class="eo-rd__sub">${sc.active} of ${sc.total} sources · ${nClaims} claims · ${state.result.convergence.contested} contested · ${sc.independentOrigins} independent origins</div>`;
      centre.appendChild(hero);
      centre.appendChild(renderConvergence());
      const note = doc.createElement('div'); note.className = 'eo-rd__consequence';
      note.innerHTML = '<span>✦</span><span>The meaning space and the ledger are two projections of one nested reading — paradigm › atmosphere › lens. Click any frame in either to pivot the whole picture to it; open a claim to read the base spans it stands on.</span>';
      centre.appendChild(note);
    } else {
      const head = doc.createElement('div'); head.style.padding = '0 2px';
      head.innerHTML =
        '<div class="eo-rd__kicker" style="letter-spacing:1px;">QUESTION RESULT</div>' +
        `<div class="eo-rd__topic" style="font-size:25px;">${esc(reading.query)}</div>` +
        `<div class="eo-rd__sub">Based on ${sc.active} of ${sc.total} sources · ${sc.independentOrigins} independent origins · a submit is a pivot, not a chat turn</div>`;
      centre.appendChild(head);
      centre.appendChild(renderConvergence('how the evidence sits'));
      const synth = doc.createElement('div'); synth.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 2px 0;';
      synth.innerHTML = '<span style="font-size:13px;font-weight:700;color:#17171a;">Grounded synthesis</span><span style="flex:1;height:1px;background:#e4e4ea;"></span><span style="font-size:10.5px;color:#a6a6ae;">every line traces</span>';
      centre.appendChild(synth);
      for (const c of directCards()) centre.appendChild(renderVerdictCard(c));
    }

    if (state.consequence) {
      const note = doc.createElement('div'); note.className = 'eo-rd__consequence';
      note.innerHTML = `<span>⇄</span><span>Recomputed from ${sc.active} active sources — “${esc(clip(state.consequence.text, 46))}” moved from <b>${esc(state.consequence.from)}</b> to <b>${esc(state.consequence.to)}</b>.</span>`;
      centre.appendChild(note);
    }

    // mobile: the meaning card + ledger preview live in the centre (desktop puts them in the rail)
    if (mobileMeaning) {
      const mcard = doc.createElement('div'); mcard.className = 'eo-rd__card'; mcard.style.cssText = 'background:#0d0d15;border-color:#211f30;cursor:pointer;padding:14px 16px;';
      mcard.innerHTML = '<div style="display:flex;align-items:center;gap:8px;"><span class="eo-rd__rightKicker">MEANING SPACE</span><span style="flex:1;"></span><span style="font-size:11px;font-weight:600;color:#9a90ea;">Explore ›</span></div><div style="font-size:11px;color:#7c779e;line-height:1.4;margin-top:8px;">The paradigms your sources fall into, with their atmospheres and lenses. Tap to pivot and descend to the base spans.</div>';
      mcard.addEventListener('click', () => { state.overlay = 'meaning'; render(); });
      centre.appendChild(mcard);
      const seeAll = doc.createElement('button'); seeAll.className = 'eo-rd__btn eo-rd__btn--v eo-rd__btn--full'; seeAll.textContent = 'See the ledger ›';
      seeAll.addEventListener('click', () => { state.push = 'ledger'; render(); });
      centre.appendChild(seeAll);
    }

    scroll.appendChild(centre);
    return scroll;
  };

  const renderAskbar = () => {
    const bar = doc.createElement('div'); bar.className = 'eo-rd__askbar';
    const ask = doc.createElement('div'); ask.className = 'eo-rd__ask';
    const input = doc.createElement('input'); input.className = 'eo-rd__askInput'; input.value = state.view === 'result' ? reading.query : ''; input.placeholder = 'Ask about this topic…'; input.setAttribute('aria-label', 'Ask');
    // Ask submit = pivot, not a chat turn (spec §13): a re-ask REPLACES the result.
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) { reading.query = input.value.trim(); state.view = 'result'; if (o.onAsk) o.onAsk(input.value.trim()); recompute(); render(); } });
    const seg = doc.createElement('div'); seg.className = 'eo-rd__seg';
    const ov = doc.createElement('button'); ov.className = 'eo-rd__segBtn' + (state.view === 'overview' ? ' eo-rd__segBtn--on' : ''); ov.textContent = 'Overview'; ov.addEventListener('click', () => { state.view = 'overview'; render(); });
    const rs = doc.createElement('button'); rs.className = 'eo-rd__segBtn' + (state.view === 'result' ? ' eo-rd__segBtn--on' : ''); rs.textContent = 'Question result'; rs.addEventListener('click', () => { state.view = 'result'; render(); });
    seg.appendChild(ov); seg.appendChild(rs);
    ask.appendChild(input); ask.appendChild(seg); bar.appendChild(ask);
    return bar;
  };

  // ── right rail (desktop): orbit over ledger, both collapsible ────────────────────────────────
  const renderRightRail = () => {
    if (!state.rightOpen) {
      const strip = doc.createElement('aside'); strip.className = 'eo-rd__rightStrip';
      strip.innerHTML = '<button class="eo-rd__iconBtn" aria-label="Open meaning rail">‹‹</button><div class="eo-rd__stripLabel">MEANING SPACE · LEDGER</div>';
      strip.addEventListener('click', () => { state.rightOpen = true; render(); });
      return strip;
    }
    const col = doc.createElement('aside'); col.className = 'eo-rd__col eo-rd__right';
    const head = doc.createElement('div'); head.className = 'eo-rd__rightHead';
    head.innerHTML =
      `<button class="eo-rd__iconBtn" data-orbit aria-label="Fold orbit">${state.orbitOpen ? '▾' : '▸'}</button>` +
      '<div style="flex:1;min-width:0;"><div class="eo-rd__rightKicker">MEANING SPACE</div><div class="eo-rd__rightSub">click a body or ledger row to pivot · descend to the base spans</div></div>' +
      '<button class="eo-rd__iconBtn" data-close aria-label="Collapse rail">››</button>';
    head.querySelector('[data-orbit]').addEventListener('click', () => { state.orbitOpen = !state.orbitOpen; render(); });
    head.querySelector('[data-close]').addEventListener('click', () => { state.rightOpen = false; render(); });
    col.appendChild(head);
    if (state.orbitOpen) {
      const stage = doc.createElement('div'); stage.className = 'eo-rd__stage';
      col.appendChild(stage);
      // mounted after append so the orbit's isConnected liveness check reads true from frame 1.
      queueMicrotask(() => { if (stage.isConnected) mountOrbit(stage, { width: 336, height: 250 }); });
    }
    const lw = doc.createElement('div'); lw.className = 'eo-rd__ledgerWrap';
    col.appendChild(lw);
    queueMicrotask(() => { if (lw.isConnected) mountLedgerInto(lw, true); });
    return col;
  };

  // ── mobile: full-screen orbit overlay + pushed ledger ────────────────────────────────────────
  const renderOverlay = () => {
    const ov = doc.createElement('div'); ov.className = 'eo-rd__overlay';
    const head = doc.createElement('div'); head.style.cssText = 'flex:none;display:flex;align-items:center;gap:10px;padding:16px;';
    head.innerHTML = '<button class="eo-rd__iconBtn" data-back aria-label="Back">‹</button><div style="flex:1;"><div class="eo-rd__rightKicker">MEANING SPACE</div><div class="eo-rd__rightSub">tap a body to pivot · descend to the base spans</div></div>';
    head.querySelector('[data-back]').addEventListener('click', () => { state.overlay = null; render(); });
    ov.appendChild(head);
    const stage = doc.createElement('div'); stage.style.cssText = 'flex:1;min-height:0;padding:0 12px;';
    ov.appendChild(stage);
    queueMicrotask(() => { if (stage.isConnected) mountOrbit(stage, { width: 380, height: 460 }); });
    return ov;
  };

  const renderPushedLedger = () => {
    const wrap = doc.createElement('div'); wrap.className = 'eo-rd__col'; wrap.style.cssText = 'flex:1;min-height:0;background:#f4f4f6;';
    const head = doc.createElement('div'); head.style.cssText = 'flex:none;display:flex;align-items:center;gap:11px;padding:16px 14px 12px;border-bottom:1px solid #efeff2;background:#fff;';
    head.innerHTML = '<button class="eo-rd__iconBtn" data-back style="background:#f2f2f5;color:#5a5a63;" aria-label="Back">‹</button><div style="font-size:14px;font-weight:600;">The ledger</div>';
    head.querySelector('[data-back]').addEventListener('click', () => { state.push = null; render(); });
    wrap.appendChild(head);
    const lw = doc.createElement('div'); lw.style.cssText = 'flex:1;min-height:0;overflow-y:auto;padding:16px 14px 28px;';
    wrap.appendChild(lw);
    queueMicrotask(() => { if (lw.isConnected) mountLedgerInto(lw, false); });
    return wrap;
  };

  // ── source-jump landing panel (demo fallback so a span click always lands) ────────────────────
  const renderSourcePanel = () => {
    const p = doc.createElement('div'); p.className = 'eo-rd__srcPanel';
    const sp = state.sourcePanel;
    p.innerHTML =
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="font-family:var(--mono,monospace);font-size:10px;font-weight:600;color:#a99bff;background:rgba(124,116,230,0.25);padding:2px 7px;border-radius:5px;">${esc(sp.sn || '—')}</span><span style="font-family:var(--mono,monospace);font-size:11px;color:#b8b3d6;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;">${esc(sp.host)}</span>${sp.status ? `<span style="font-size:8px;font-weight:700;color:#9a90ea;">${esc(sp.status.toUpperCase())}</span>` : ''}<button data-x style="background:none;border:none;color:#9a94bd;cursor:pointer;font-size:16px;">×</button></div>` +
      `<div style="font-family:var(--serif,'Newsreader',Georgia,serif);font-size:14.5px;line-height:1.55;color:#e9e6f5;">“${esc(sp.text)}”</div>` +
      '<div style="font-size:10px;color:#8a84ad;margin-top:8px;">This is the base span the claim stands on — in the app it opens the source at this exact passage.</div>';
    p.querySelector('[data-x]').addEventListener('click', () => { state.sourcePanel = null; render(); });
    return p;
  };

  // ── the shell ────────────────────────────────────────────────────────────────────────────────
  const root = doc.createElement('div');
  host.appendChild(root);

  const render = () => {
    // tear down live child surfaces before rebuilding
    if (ledgerHandle) { try { ledgerHandle.destroy(); } catch { /* noop */ } ledgerHandle = null; }
    if (orbitHandle) { try { orbitHandle.destroy(); } catch { /* noop */ } orbitHandle = null; }
    root.innerHTML = '';
    const mobile = state.mode === 'mobile';
    root.className = 'eo-rd' + (mobile ? ' eo-rd--mobile' : '');

    if (mobile) {
      // one relative-positioned column so the overlay/panel can absolutely cover it
      const pos = doc.createElement('div'); pos.className = 'eo-rd__col eo-rd__pos';
      if (state.overlay === 'meaning') { pos.appendChild(renderOverlay()); }
      else if (state.push === 'ledger') { pos.appendChild(renderPushedLedger()); }
      else {
        pos.appendChild(renderAskbar());
        if (state.tab === 'sources') { const s = renderScopeRail(); s.className = 'eo-rd__col'; s.style.cssText = 'flex:1;min-height:0;background:#fafafb;'; pos.appendChild(s); }
        else { pos.appendChild(renderCentre(true)); }
      }
      if (state.sourcePanel) pos.appendChild(renderSourcePanel());
      root.appendChild(pos);
      // bottom tabs
      const tabs = doc.createElement('div'); tabs.className = 'eo-rd__tabs';
      const mkTab = (key, label) => { const b = doc.createElement('button'); b.className = 'eo-rd__tab'; b.style.color = state.tab === key && !state.push && !state.overlay ? '#6355f2' : '#9b9ba3'; b.textContent = label; b.addEventListener('click', () => { state.tab = key; state.push = null; state.overlay = null; state.view = key === 'ask' ? 'result' : 'overview'; render(); }); return b; };
      tabs.appendChild(mkTab('overview', 'Overview')); tabs.appendChild(mkTab('ask', 'Ask')); tabs.appendChild(mkTab('sources', 'Sources'));
      root.appendChild(tabs);
    } else {
      root.appendChild(renderScopeRail());
      const main = doc.createElement('main'); main.className = 'eo-rd__col eo-rd__main';
      main.appendChild(renderAskbar());
      main.appendChild(renderCentre(false));
      if (state.sourcePanel) { const rel = doc.createElement('div'); rel.style.cssText = 'position:relative;'; rel.appendChild(renderSourcePanel()); main.appendChild(rel); }
      root.appendChild(main);
      root.appendChild(renderRightRail());
    }
  };

  render();

  // ── responsive: switch layouts under the width breakpoint ────────────────────────────────────
  let ro = null;
  if (!opts.mode && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width || host.clientWidth || 0;
      const next = w && w < breakpoint ? 'mobile' : 'desktop';
      if (next !== state.mode) { state.mode = next; render(); }
    });
    try { ro.observe(host); } catch { /* best-effort */ }
  }

  return {
    el: root,
    destroy() { if (ro) { try { ro.disconnect(); } catch { /* noop */ } } if (ledgerHandle) { try { ledgerHandle.destroy(); } catch { /* noop */ } } if (orbitHandle) { try { orbitHandle.destroy(); } catch { /* noop */ } } root.remove(); },
    setMode(mode) { state.mode = mode; render(); },
    recompute() { recompute(); render(); },
    result: () => state.result,
  };
};
