// EO: SEG·EVA(Paradigm,Lens → Lens, Unraveling,Tracing) — the ledger outline.
// mountLedger — the reading as a COLLAPSIBLE OUTLINE (integration guide §1/§4): the holon tree
// (paradigm ⊃ atmosphere ⊃ lens) rendered as a nested list, each claim carrying its standing as a
// MUTED dot-label (never a loud verdict chip — the reading is the load-bearing structure, the
// standing is secondary metadata), and — the point of the whole surface — each claim DRILLING ALL
// THE WAY DOWN to its base spans: the verbatim witnessing passages, each resolvable to an exact
// source jump (anchor.js resolveAnchor). The descent never dead-ends at a passage count.
//
//   paradigm → atmosphere → lens → claim → base span → source
//
// It is the LIST projection of exactly the tree holonMeaningData feeds the orbit (question-result.js),
// so a click here re-centres the orbit and a click there scrolls/selects here — two projections of
// one reading. Pure DOM, own CSS-in-JS, no framework; returns { destroy, update }.
//
//   ledger      buildLedger(reading) output — { nodes, byId, roots }
//   selectedId  the frame/claim currently centred in the orbit (shared selection)
//   onSelectFrame(nodeId)   a frame row tapped — pivot the orbit to it
//   onOpenSpan(spanRef)     a base span tapped — jump to the source at that exact passage
//   resolveSpan(spanRef)    optional: resolveAnchor wrapper → { status, text } for the drift badge

import { mannerOf } from '../../core/index.js';

const STYLE_ID = 'eo-ledger-style';
const CSS = `
.eo-lg{font-family:var(--sans,system-ui,sans-serif);color:var(--lg-ink,#1b1b1f);font-size:13px;}
.eo-lg *{box-sizing:border-box;}
.eo-lg__head{font-size:9.5px;font-weight:700;letter-spacing:1px;color:var(--lg-kicker,#6f6a90);margin:0 0 10px;}
.eo-lg__intro{font-size:11.5px;line-height:1.45;color:var(--lg-dim,#8a8a92);margin:0 0 12px;}
.eo-lg__node{display:flex;align-items:center;gap:9px;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;width:100%;padding:9px 2px 5px;color:inherit;}
.eo-lg__node:hover .eo-lg__nodeLabel{text-decoration:underline;text-underline-offset:2px;}
.eo-lg__node--sel{background:var(--lg-selbg,rgba(124,116,230,0.12));border-radius:9px;}
.eo-lg__dot{border-radius:50%;flex:none;}
.eo-lg__nodeLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.eo-lg__tierName{font-size:8px;font-weight:700;letter-spacing:0.7px;color:var(--lg-tier,#a6a0b8);flex:none;}
.eo-lg__chev{width:13px;height:13px;flex:none;transition:transform .15s;color:var(--lg-tier,#a6a0b8);}
.eo-lg__claim{background:var(--lg-claimbg,#fff);border:1px solid var(--lg-line,#ececf0);border-left:3px solid var(--lg-claimrail,#e8e8ee);border-radius:4px 12px 12px 4px;padding:11px 12px;margin:4px 0;cursor:pointer;}
.eo-lg__claim:hover{border-color:var(--lg-line2,#dcdce2);}
.eo-lg__claimHead{display:flex;align-items:center;gap:6px;margin-bottom:7px;flex-wrap:wrap;}
.eo-lg__standing{display:flex;align-items:center;gap:5px;font-size:8.5px;font-weight:600;letter-spacing:0.4px;color:var(--lg-dim,#8a8a92);}
.eo-lg__standingDot{width:6px;height:6px;border-radius:50%;flex:none;}
.eo-lg__manner{font-size:9.5px;font-style:italic;color:var(--lg-tier,#a6a0b8);}
.eo-lg__meta{font-size:9.5px;color:var(--lg-tier,#a6a0b8);}
.eo-lg__claimText{font-size:12.5px;line-height:1.45;color:var(--lg-ink,#26262b);text-wrap:pretty;}
.eo-lg__srcRow{display:flex;gap:5px;margin-top:8px;flex-wrap:wrap;}
.eo-lg__srcChip{font-family:var(--mono,ui-monospace,monospace);font-size:9.5px;font-weight:500;color:var(--lg-chip,#7a6ef0);background:var(--lg-chipbg,#f0eefe);padding:2px 6px;border-radius:5px;}
.eo-lg__spansHint{font-size:9.5px;color:var(--lg-tier,#a6a0b8);margin-top:8px;display:flex;align-items:center;gap:5px;}
.eo-lg__spans{margin-top:9px;padding-top:9px;border-top:1px dashed var(--lg-line,#ececf0);display:flex;flex-direction:column;gap:7px;}
.eo-lg__span{display:block;width:100%;text-align:left;background:var(--lg-spanbg,#faf9ff);border:1px solid var(--lg-line,#ececf0);border-radius:9px;padding:9px 10px;cursor:pointer;font-family:inherit;color:inherit;}
.eo-lg__span:hover{background:var(--lg-spanhover,#f3f1ff);}
.eo-lg__spanTop{display:flex;align-items:center;gap:7px;margin-bottom:5px;}
.eo-lg__spanId{font-family:var(--mono,ui-monospace,monospace);font-size:9px;font-weight:600;color:var(--lg-chip,#7a6ef0);background:var(--lg-chipbg,#f0eefe);padding:2px 6px;border-radius:5px;}
.eo-lg__spanHost{font-family:var(--mono,ui-monospace,monospace);font-size:9.5px;color:var(--lg-tier,#8a8a92);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.eo-lg__spanStatus{font-size:8px;font-weight:700;letter-spacing:0.5px;padding:2px 6px;border-radius:5px;flex:none;}
.eo-lg__spanQuote{font-family:var(--serif,'Newsreader',Georgia,serif);font-size:12.5px;line-height:1.5;color:var(--lg-ink,#26262b);}
.eo-lg__jump{font-size:9.5px;font-weight:600;color:var(--lg-chip,#7a6ef0);margin-top:6px;display:inline-flex;align-items:center;gap:3px;}
.eo-lg__empty{padding:18px 4px;color:var(--lg-dim,#8a8a92);font-size:12px;}
`;

const SPAN_STATUS = {
  exact:     { label: 'EXACT',     bg: 'rgba(63,157,109,0.16)',  fg: '#2f7a55' },
  relocated: { label: 'RELOCATED', bg: 'rgba(224,134,63,0.18)',  fg: '#b45f1e' },
  approx:    { label: 'APPROX',    bg: 'rgba(224,134,63,0.14)',  fg: '#b45f1e' },
  moved:     { label: 'MOVED',     bg: 'rgba(154,160,173,0.20)', fg: '#7a7a83' },
};
const TIER_NAME = { paradigm: 'PARADIGM', atmosphere: 'ATMOSPHERE', lens: 'LENS' };
const NODE_STYLE = [
  { pad: 0,  dot: 13, fs: 14,   fw: 700 },
  { pad: 18, dot: 10, fs: 12.5, fw: 600 },
  { pad: 36, dot: 7,  fs: 12,   fw: 600 },
];
const CLAIM_PAD = [18, 36, 54];
const DARK_VARS = {
  '--lg-ink': '#cbc7e0', '--lg-kicker': '#6f6a90', '--lg-dim': '#8983a5', '--lg-tier': '#565274',
  '--lg-line': 'rgba(255,255,255,0.09)', '--lg-line2': 'rgba(255,255,255,0.16)',
  '--lg-claimbg': 'rgba(255,255,255,0.035)', '--lg-claimrail': 'rgba(255,255,255,0.12)',
  '--lg-chip': '#a99bff', '--lg-chipbg': 'rgba(124,116,230,0.16)', '--lg-selbg': 'rgba(124,116,230,0.18)',
  '--lg-spanbg': 'rgba(255,255,255,0.03)', '--lg-spanhover': 'rgba(255,255,255,0.06)',
};

export const mountLedger = (host, opts = {}) => {
  const doc = host.ownerDocument || document;
  if (!doc.getElementById(STYLE_ID)) { const st = doc.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; doc.head.appendChild(st); }

  let o = { ...opts };
  const state = { collapsed: new Set(opts.collapsedIds || []), expanded: new Set() };

  const root = doc.createElement('div');
  root.className = 'eo-lg';
  root.setAttribute('role', 'tree');
  root.setAttribute('aria-label', 'The ledger — claims by frame');
  if (o.dark) for (const [k, v] of Object.entries(DARK_VARS)) root.style.setProperty(k, v);
  host.appendChild(root);

  const svgEl = (paths, extra = '') => `<svg class="eo-lg__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"${extra}>${paths}</svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Depth-first walk of the frame tree honouring collapse, exactly the outline the guide asks for.
  const visibleRows = () => {
    const ledger = o.ledger || { nodes: [], byId: {}, roots: [] };
    const rows = [];
    for (const node of ledger.nodes) {
      // a node is hidden when any ancestor frame is collapsed
      let anc = node.parentId, hidden = false;
      while (anc) { if (state.collapsed.has(anc)) { hidden = true; break; } anc = (ledger.byId[anc] || {}).parentId; }
      if (hidden) continue;
      rows.push({ type: 'node', node });
      if (!state.collapsed.has(node.id)) for (const c of node.claims) rows.push({ type: 'claim', node, claim: c });
    }
    return rows;
  };

  const depthOf = (node) => { let d = 0, p = node.parentId, byId = (o.ledger || {}).byId || {}; while (p) { d++; p = (byId[p] || {}).parentId; } return Math.min(d, 2); };

  const renderSpan = (span, claim) => {
    const wrap = doc.createElement('button');
    wrap.className = 'eo-lg__span';
    wrap.setAttribute('type', 'button');
    let status = null, quote = span.quote;
    if (o.resolveSpan) { try { const r = o.resolveSpan(span); if (r) { status = r.status; if (r.text) quote = r.text; } } catch { /* best-effort */ } }
    const st = status && SPAN_STATUS[status];
    wrap.innerHTML =
      '<div class="eo-lg__spanTop">' +
        `<span class="eo-lg__spanId">${esc(span.sn || '—')}</span>` +
        `<span class="eo-lg__spanHost">${esc(span.host || span.docId || '')}</span>` +
        (st ? `<span class="eo-lg__spanStatus" style="background:${st.bg};color:${st.fg};">${st.label}</span>` : '') +
      '</div>' +
      `<div class="eo-lg__spanQuote">“${esc(quote)}”</div>` +
      '<span class="eo-lg__jump">open source at this passage ›</span>';
    wrap.addEventListener('click', (e) => { e.stopPropagation(); if (o.onOpenSpan) o.onOpenSpan(span, claim); });
    return wrap;
  };

  const renderClaim = (node, claim) => {
    const card = doc.createElement('div');
    card.className = 'eo-lg__claim';
    card.style.marginLeft = CLAIM_PAD[depthOf(node)] + 'px';
    const stand = (o.standings && o.standings[claim.standing]) || null;
    const standColor = (stand && stand.color) || '#9AA0AD';
    const standLabel = (stand && stand.label) || String(claim.standing || '').toUpperCase();
    const srcChips = (claim.sourceIds || []).map((s) => `<span class="eo-lg__srcChip">${esc(s)}</span>`).join('');
    const nSpans = (claim.spanRefs || []).filter((s) => s.quote).length;
    const open = state.expanded.has(claim.id);
    // The manner the claim was asserted in — distinguishes/links/introduces — is the SPECTRUM
    // reading next to the standing's POSITION: never shown as a code, only its plain English word,
    // and only when the claim actually carries one (an older/seed shape without it draws nothing).
    const manner = mannerOf(claim.op);
    card.innerHTML =
      '<div class="eo-lg__claimHead">' +
        `<span class="eo-lg__standing"><span class="eo-lg__standingDot" style="background:${standColor};"></span>${esc(standLabel)}</span>` +
        (manner ? `<span class="eo-lg__manner">${esc(manner)}</span>` : '') +
        (claim.meta ? `<span class="eo-lg__meta">· ${esc(claim.meta)}</span>` : '') +
      '</div>' +
      `<div class="eo-lg__claimText">${esc(claim.text)}</div>` +
      (srcChips ? `<div class="eo-lg__srcRow">${srcChips}</div>` : '') +
      (nSpans && !open ? `<div class="eo-lg__spansHint">▾ ${nSpans} base span${nSpans === 1 ? '' : 's'} — tap to read the evidence</div>` : '');
    card.dataset.claimId = claim.id;
    card.addEventListener('click', () => {
      const nowOpen = !state.expanded.has(claim.id);
      nowOpen ? state.expanded.add(claim.id) : state.expanded.delete(claim.id);
      o.selectedId = claim.id;
      if (nowOpen && o.onSelectClaim) o.onSelectClaim(claim.id);
      render();
    });
    if (open && nSpans) {
      const spans = doc.createElement('div');
      spans.className = 'eo-lg__spans';
      for (const s of claim.spanRefs) if (s.quote) spans.appendChild(renderSpan(s, claim));
      card.appendChild(spans);
    }
    return card;
  };

  const renderNode = (node) => {
    const d = depthOf(node);
    const ns = NODE_STYLE[d];
    const btn = doc.createElement('button');
    btn.className = 'eo-lg__node' + (o.selectedId === node.id ? ' eo-lg__node--sel' : '');
    btn.setAttribute('type', 'button');
    btn.style.paddingLeft = ns.pad + 'px';
    const collapsed = state.collapsed.has(node.id);
    const hasKids = node.claims.length || (o.ledger.nodes || []).some((n) => n.parentId === node.id);
    btn.innerHTML =
      `<span class="eo-lg__dot" style="width:${ns.dot}px;height:${ns.dot}px;background:${node.color};box-shadow:0 0 0 4px ${node.color}22;"></span>` +
      `<span class="eo-lg__nodeLabel" style="font-size:${ns.fs}px;font-weight:${ns.fw};">${esc(node.label)}</span>` +
      (node.void ? '' : `<span class="eo-lg__tierName">${esc(TIER_NAME[node.tier] || '')}</span>`) +
      (hasKids ? svgEl('<path d="M9 6l6 6-6 6"/>', ` style="transform:rotate(${collapsed ? 0 : 90}deg)"`) : '');
    // clicking the row pivots the orbit (shared selection); the chevron alone folds.
    btn.addEventListener('click', (e) => {
      const onChev = e.target.closest('.eo-lg__chev');
      if (onChev && hasKids) { state.collapsed.has(node.id) ? state.collapsed.delete(node.id) : state.collapsed.add(node.id); render(); return; }
      o.selectedId = node.id;
      if (o.onSelectFrame) o.onSelectFrame(node.id);
      render();
    });
    return btn;
  };

  const render = () => {
    root.innerHTML = '';
    root.appendChild(Object.assign(doc.createElement('div'), { className: 'eo-lg__head', textContent: 'THE LEDGER · claims by frame' }));
    if (o.intro !== false) root.appendChild(Object.assign(doc.createElement('div'), { className: 'eo-lg__intro', textContent: 'The reading, as an outline — each claim sits inside the lens, atmosphere and paradigm it belongs to, and carries how it stands against the sources. Tap a frame to pivot the meaning space; tap a claim to read its base spans.' }));
    const rows = visibleRows();
    if (!rows.length) { root.appendChild(Object.assign(doc.createElement('div'), { className: 'eo-lg__empty', textContent: 'No claims in scope yet.' })); return; }
    for (const r of rows) root.appendChild(r.type === 'node' ? renderNode(r.node) : renderClaim(r.node, r.claim));
  };

  render();

  return {
    el: root,
    destroy() { root.remove(); },
    update(next = {}) { o = { ...o, ...next }; if (o.dark) for (const [k, v] of Object.entries(DARK_VARS)) root.style.setProperty(k, v); render(); },
    // let a host (the orbit) drive selection into the outline without re-mounting
    select(id) { o.selectedId = id; render(); },
    // the orbit selected a claim → expand it here, un-fold its ancestors, scroll it into view
    revealClaim(claimId) {
      const ledger = o.ledger || { byId: {}, nodes: [] };
      // un-collapse every ancestor frame so the claim is visible
      const owner = (ledger.nodes || []).find((n) => (n.claims || []).some((c) => c.id === claimId));
      let p = owner ? owner.id : null;
      while (p) { state.collapsed.delete(p); p = (ledger.byId[p] || {}).parentId; }
      state.expanded.add(claimId);
      o.selectedId = claimId;
      render();
      const card = root.querySelector(`[data-claim-id="${claimId}"]`);
      if (card && card.scrollIntoView) { try { card.scrollIntoView({ block: 'nearest' }); } catch { /* best-effort */ } }
    },
  };
};
