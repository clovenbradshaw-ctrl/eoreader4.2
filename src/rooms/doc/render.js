// EO: NUL(Network → Void, Clearing) — Google-Docs page renderer
// doc/render.js — the document as a Google-Docs-style page: a paper canvas of
// grounded blocks, with pending edits shown as suggestions (Google Docs'
// "Suggesting" mode) and a margin card per change to accept or reject.
//
// Pure string work over projectDoc(log): render twice, get the same bytes. The
// surface (surface.js) owns interaction and re-renders on every log append.
//
// Prior art adopted: Google Docs suggesting mode (insertions coloured +
// underlined, deletions struck, a margin card per suggestion with ✓/✗) and its
// three view modes (Editing · Suggesting · Viewing). The EO twist: the colour is
// the GROUNDING — green when the edit binds to the Record, amber when it "leaves
// the record" and can only be kept as void.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The provenance marker worn by a committed block: green ⚓ when it stands on a
// recorded span, grey ○ when it is the writer's own (the void), marked so.
const blockMark = (g) => g && g.kind === 'source'
  ? `<sup class="doc-pm doc-pm-src" data-span="${esc((g.span && g.span.id) || '')}" title="Grounded to a recorded read${g.srcId ? ' · ' + esc(g.srcId) : ''}${g.host ? ' · ' + esc(g.host) : ''} — click to see the passage">⚓</sup>`
  : `<sup class="doc-pm doc-pm-void" title="The writer's own words — grounded to the void, not to a recorded span">○</sup>`;

// The HTML tag a block type renders as. Lists render as paragraphs with a
// CSS-drawn marker (so the block model stays flat — one editable element per
// line — while reading like a real list).
const TAG = { p: 'p', h1: 'h1', h2: 'h2', h3: 'h3', quote: 'blockquote', ul: 'p', ol: 'p' };
// A block's body: its sanitized inline rich HTML when it has formatting, else the
// escaped plain text. (The surface sanitizes on commit, so stored html is trusted.)
const body = (b) => b.html ? b.html : esc(b.text);
const typeCls = (t) => ' doc-b-' + (t || 'p');

// One committed block, optionally shown with the replace/delete suggestion that
// targets it (suggesting mode only).
const committedBlock = (b, { mode, replace, del }) => {
  const tag = TAG[b.type] || 'p';
  const cls = 'doc-block' + typeCls(b.type);
  if (mode === 'suggesting' && del) {
    return `<${tag} class="${cls} doc-sugg-del" data-block="${esc(b.id)}"><span class="doc-strike">${body(b)}</span>${blockMark(b.grounding)}</${tag}>`;
  }
  if (mode === 'suggesting' && replace) {
    const tone = replace.grounding && replace.grounding.grounded ? 'src' : 'void';
    return `<${tag} class="${cls}" data-block="${esc(b.id)}"><span class="doc-strike">${body(b)}</span> <span class="doc-ins doc-ins-${tone}">${esc(replace.text)}</span></${tag}>`;
  }
  // No inline controls inside the editable element — a nested contenteditable=false
  // node breaks text selection and execCommand. Deletion is: empty the line, blur.
  const editable = mode === 'editing' ? ' contenteditable="true" spellcheck="false"' : '';
  const mark = mode === 'editing' ? '' : blockMark(b.grounding);
  return `<${tag} class="${cls}"${editable} data-block="${esc(b.id)}" data-type="${esc(b.type || 'p')}">${body(b)}${mark}</${tag}>`;
};

// A pending insert shown at its anchor as a ghost line (suggesting mode).
const insertGhost = (ch) => {
  const tone = ch.grounding && ch.grounding.grounded ? 'src' : 'void';
  const tag = TAG[ch.type] || 'p';
  return `<${tag} class="doc-block${typeCls(ch.type)} doc-ghost" data-block="ghost:${esc(ch.id)}"><span class="doc-ins doc-ins-${tone}">${ch.html || esc(ch.text)}</span></${tag}>`;
};

// The margin card for one pending change — author, what it grounds to, ✓/✗.
const changeCard = (ch) => {
  const grounded = !!(ch.grounding && ch.grounding.grounded);
  const tone = grounded ? 'src' : 'void';
  const verb = ch.kind === 'insert' ? 'suggested a line' : ch.kind === 'replace' ? 'suggested a rewrite' : 'suggested a deletion';
  const groundLine = grounded
    ? `<span class="doc-card-ground doc-card-ground-src"><span class="doc-i">⚓</span>grounds to ${esc(ch.grounding.srcId || 'the record')}${ch.grounding.host ? ' · ' + esc(ch.grounding.host) : ''}</span>`
    : `<span class="doc-card-ground doc-card-ground-void"><span class="doc-i">⚠</span>leaves the record</span>`;
  const passage = grounded && ch.grounding.span
    ? `<div class="doc-card-passage">“${esc(ch.grounding.span.text)}”</div>` : '';
  const note = grounded ? '' :
    `<div class="doc-card-note">No recorded passage backs this. Accepting it moves the line to the void — the writer's own words, marked so.</div>`;
  const acceptLabel = grounded ? '✓ Accept' : '✓ Accept as void';
  const before = ch.kind !== 'insert' && ch.before
    ? `<div class="doc-card-before">${esc(ch.before)}</div>` : '';
  const after = ch.kind !== 'delete'
    ? `<div class="doc-card-after doc-ins-${tone}">${esc(ch.text)}</div>` : '';
  return `<div class="doc-card doc-card-${tone}" data-card="${esc(ch.id)}" data-anchor="${esc(ch.kind === 'insert' ? (ch.afterId || '') : ch.targetId || '')}">
    <div class="doc-card-head"><span class="doc-card-who">${esc(ch.author || 'you')}</span> ${verb}${ch.when ? ` <span class="doc-card-when">· ${esc(ch.when)}</span>` : ''}</div>
    ${before}${after}
    <div class="doc-card-groundrow">${groundLine}</div>${passage}${note}
    <div class="doc-card-actions">
      <button class="doc-accept doc-accept-${tone}" data-accept="${esc(ch.id)}">${acceptLabel}</button>
      <button class="doc-reject" data-reject="${esc(ch.id)}">✕ Reject</button>
    </div>
  </div>`;
};

// The paper's inner HTML: committed blocks in order, with pending inserts shown
// as ghost lines at their anchor (suggesting mode only). Shared by the live
// document and the history view (which renders a past projection read-only).
const paperInner = (doc, mode) => {
  const changes = mode === 'suggesting' ? doc.changes : [];
  const replaceOf = new Map(), delOf = new Set(), insAfter = new Map();
  for (const ch of changes) {
    if (ch.kind === 'replace' && ch.targetId) replaceOf.set(ch.targetId, ch);
    else if (ch.kind === 'delete' && ch.targetId) delOf.add(ch.targetId);
    else if (ch.kind === 'insert') { const k = ch.afterId || '__end__'; (insAfter.get(k) || insAfter.set(k, []).get(k)).push(ch); }
  }
  const rows = [];
  for (const b of doc.blocks) {
    rows.push(committedBlock(b, { mode, replace: replaceOf.get(b.id), del: delOf.has(b.id) }));
    for (const ch of (insAfter.get(b.id) || [])) rows.push(insertGhost(ch));
  }
  for (const ch of (insAfter.get('__end__') || [])) rows.push(insertGhost(ch));
  const empty = doc.blocks.length === 0
    ? `<p class="doc-empty">An empty page. Everything you write here is grounded to the Record — or marked as your own.</p>` : '';
  return rows.join('') || empty;
};

// The document body: paper (blocks + ghosts) on the left, the suggestions margin
// on the right. mode ∈ 'suggesting' | 'editing' | 'viewing'.
export const renderDocFragment = (doc, mode = 'suggesting') => {
  const changes = mode === 'suggesting' ? doc.changes : [];
  const cards = changes.length
    ? changes.map(changeCard).join('')
    : (mode === 'suggesting' ? `<div class="doc-card-none">No pending changes. Every line is committed and grounded.</div>` : '');

  return `<div class="doc-canvas">
    <div class="doc-paper" data-mode="${esc(mode)}">${paperInner(doc, mode)}</div>
    <div class="doc-margin">${cards}</div>
  </div>`;
};

// ── version history (the log view) ──────────────────────────────────────────
// A relative time label, deterministic given (ts, now). When ts is 0 (a log with
// no wall clock — e.g. a replay in tests) there is no time to show.
const agoLabel = (ts, now) => {
  if (!ts || !now) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 8) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.round(h / 24); return d + 'd ago';
};
const clipL = (s, n) => (s || '').length > n ? '…' + s.slice(s.length - n) : (s || '');
const clipR = (s, n) => (s || '').length > n ? s.slice(0, n) + '…' : (s || '');

// The inline glyph of one revision — for a fine edit, the EXACT characters that
// went in (green) and came out (struck): this is the "by character" grain. Older,
// coalesced revisions read as a tinted line or a session count.
const revInline = (rev) => {
  if (rev.kind === 'create') return `<span class="doc-rev-orig">Original · ${rev.lines} line${rev.lines === 1 ? '' : 's'}</span>`;
  if (rev.kind === 'revert') return `<span class="doc-rev-restore">⤺ restored${rev.label ? ' to “' + esc(clipR(rev.label, 40)) + '”' : ''}</span>`;
  if (rev.kind === 'session') {
    const parts = []; if (rev.insN) parts.push('+' + rev.insN); if (rev.delN) parts.push('−' + rev.delN);
    return `<span class="doc-rev-sess">${rev.count} edits · ${rev.blocks} line${rev.blocks === 1 ? '' : 's'}${parts.length ? ' · ' + parts.join('/') + ' chars' : ''}</span>`;
  }
  if (rev.kind === 'add') return `<span class="doc-rev-ctx doc-rev-plus">＋</span><span class="doc-ins doc-ins-src">${esc(clipR(rev.snippet, 72))}</span>`;
  if (rev.kind === 'delete') return `<span class="doc-rev-ctx doc-rev-minus">－</span><span class="doc-strike">${esc(clipR(rev.snippet, 72))}</span>`;
  const d = rev.diff;
  if (!d) return `<span>${esc(clipR(rev.snippet, 72))}</span>`;
  return `<span class="doc-rev-ctx">${esc(clipL(d.pre, 20))}</span>` +
    (d.del ? `<span class="doc-strike">${esc(clipR(d.del, 44))}</span>` : '') +
    (d.ins ? `<span class="doc-ins doc-ins-src">${esc(clipR(d.ins, 44))}</span>` : '') +
    `<span class="doc-rev-ctx">${esc(clipR(d.suf, 20))}</span>`;
};

const revRow = (rev, sel, now) => {
  const selected = rev.anchorIdx === sel;
  const when = rev.current ? 'Current version' : (agoLabel(rev.ts, now) || ('step ' + rev.anchorIdx));
  const cls = 'doc-rev' + (selected ? ' sel' : '') + (rev.current ? ' current' : '') + (rev.kind === 'revert' ? ' revert' : '') + (rev.kind === 'create' ? ' orig' : '');
  const actions = selected ? `<div class="doc-rev-actions">
      <button class="doc-rev-btn doc-rev-restore-btn" data-restore="${rev.anchorIdx}"${rev.current ? ' disabled title="This is already the current version"' : ' title="Roll the document back to this version — kept on the log, so you can undo it"'}>⤺ Restore</button>
      <button class="doc-rev-btn doc-rev-fork-btn" data-fork="${rev.anchorIdx}" title="Open a new document that starts from this version">⑂ Fork</button>
    </div>` : '';
  return `<button class="${cls}" data-rev="${rev.anchorIdx}">
    <div class="doc-rev-top"><span class="doc-rev-dot"></span><span class="doc-rev-when">${esc(when)}</span><span class="doc-rev-by">${esc(rev.author || 'you')}</span></div>
    <div class="doc-rev-body">${revInline(rev)}</div>${actions}</button>`;
};

// The history view: the document AS OF the selected revision (read-only) beside a
// newest-first timeline. `histDoc` is projectDoc(log.slice(0, sel+1)); `history`
// is projectHistory(log); `sel` is the selected anchor index; `now` a wall clock
// for the "ago" labels. Selecting a revision re-projects the paper to that point.
export const renderHistoryFragment = (histDoc, history, sel, now = 0) => {
  const revs = history.revisions || [];
  const current = revs.length ? revs[0].anchorIdx : sel;
  const viewingOld = sel !== current;
  const selRev = revs.find((r) => r.anchorIdx === sel);
  const banner = viewingOld ? `<div class="doc-hist-banner">
      <span class="doc-hist-banner-txt">⏳ Viewing a past version${selRev && agoLabel(selRev.ts, now) ? ' · ' + esc(agoLabel(selRev.ts, now)) : ''} — read only</span>
      <span class="doc-hist-banner-acts">
        <button class="doc-hist-b" data-restore="${sel}">⤺ Restore this version</button>
        <button class="doc-hist-b" data-fork="${sel}">⑂ Fork from here</button>
        <button class="doc-hist-b doc-hist-b-ghost" data-histlive="1">Back to latest</button>
      </span></div>` : '';
  const list = revs.length
    ? revs.map((r) => revRow(r, sel, now)).join('')
    : `<div class="doc-card-none">No edits yet — the timeline fills as you write.</div>`;
  return `${banner}<div class="doc-canvas doc-canvas-hist">
    <div class="doc-paper doc-paper-hist" data-mode="viewing">${paperInner(histDoc, 'viewing')}</div>
    <div class="doc-margin doc-timeline">
      <div class="doc-tl-head">Version history <span class="doc-tl-sub">${history.count} edit${history.count === 1 ? '' : 's'} · finest first, oldest coalesced</span></div>
      <div class="doc-tl-list">${list}</div>
    </div>
  </div>`;
};

// The honesty stat line for the toolbar — how much of the page stands on the Record.
export const docStatLine = (doc) => {
  const s = doc.stats;
  const pct = Math.round(s.boundFrac * 100);
  return `${s.blocks} line${s.blocks === 1 ? '' : 's'} · ${s.grounded} grounded · ${s.void} void · ${pct}% on the Record`;
};

export const DOC_CSS = `
.doc-surface{position:absolute;inset:0;display:flex;flex-direction:column;background:#f4f5f7;font-family:var(--doc-sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif);color:#1b1f24}
.doc-bar{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:9px 14px;background:#fff;border-bottom:1px solid #e6e8ec}
.doc-bar .doc-title{font-size:14px;font-weight:700;color:#1b1f24;border:none;background:transparent;outline:none;min-width:120px;max-width:340px;flex:0 1 auto;padding:2px 4px;border-radius:6px}
.doc-bar .doc-title:focus{background:#f1edfc}
.doc-bar .doc-stat{font-size:11px;color:#9aa1ab;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.doc-modes{margin-left:auto;display:flex;gap:2px;background:#eef0f3;border-radius:9px;padding:3px}
.doc-modes button{font-size:11.5px;font-weight:600;color:#5a626d;background:transparent;border:none;border-radius:7px;padding:5px 11px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.doc-modes button.on{color:#5b34d6;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.doc-x{width:28px;height:28px;flex:0 0 auto;border:1px solid #dde0e5;background:#fff;border-radius:8px;color:#9aa1ab;font-size:15px;line-height:1;cursor:pointer}
.doc-x:hover{background:#f7f8fa;color:#1b1f24}
.doc-scroll{flex:1;min-height:0;overflow-y:auto;padding:22px 18px 60px}
.doc-canvas{position:relative;max-width:1040px;margin:0 auto;display:flex;gap:26px;align-items:flex-start}
.doc-paper{flex:1;min-width:0;max-width:720px;background:#fff;border:1px solid #e6e8ec;border-radius:3px;box-shadow:0 1px 3px rgba(20,24,30,.10),0 10px 30px rgba(20,24,30,.06);padding:56px 68px 80px;min-height:520px;counter-reset:docol}
.doc-paper[data-mode="editing"] .doc-block{outline:none}
.doc-paper[data-mode="editing"] .doc-block:hover{background:#fafbfc}
.doc-block{position:relative;margin:0 0 14px;font-size:15.5px;line-height:1.85;color:#1b1f24;border-radius:3px;padding:1px 2px}
.doc-block:focus{outline:none}
/* block types */
.doc-b-h1{font-size:27px;font-weight:800;line-height:1.25;letter-spacing:-.01em;margin:8px 0 10px}
.doc-b-h2{font-size:21px;font-weight:800;line-height:1.3;margin:6px 0 8px}
.doc-b-h3{font-size:17px;font-weight:700;line-height:1.35;margin:4px 0 6px}
.doc-b-quote{border-left:3px solid #d8ccf7;padding:2px 0 2px 15px;color:#5a626d;font-style:italic}
.doc-b-ul{padding-left:26px}
.doc-b-ul::before{content:'•';position:absolute;left:8px;color:#5a626d}
.doc-b-ol{padding-left:30px;counter-increment:docol}
.doc-b-ol::before{content:counter(docol) '.';position:absolute;left:3px;color:#5a626d;font-variant-numeric:tabular-nums}
/* inline rich formatting */
.doc-block b,.doc-block strong{font-weight:700}
.doc-block i,.doc-block em{font-style:italic}
.doc-block u{text-decoration:underline}
.doc-block s,.doc-block strike,.doc-block del{text-decoration:line-through}
.doc-block a{color:#2563eb;text-decoration:underline;cursor:text}
/* formatting toolbar (Google-Docs / Gmail set) */
.doc-toolbar{flex:0 0 auto;display:flex;align-items:center;gap:2px;padding:5px 12px;background:#fff;border-bottom:1px solid #e6e8ec;flex-wrap:wrap;overflow-x:auto}
.doc-tb-sel{height:28px;border:1px solid #dde0e5;border-radius:6px;background:#fff;font:inherit;font-size:12px;color:#3c4149;padding:0 6px;cursor:pointer;margin-right:3px}
.doc-tb-btn{min-width:28px;height:28px;border:none;background:transparent;border-radius:6px;color:#3c4149;font-size:13.5px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0 6px}
.doc-tb-btn:hover{background:#eef0f3}
.doc-tb-btn.on{background:#e9e2fb;color:#5b34d6}
.doc-tb-btn b{font-weight:800}.doc-tb-btn i{font-style:italic}.doc-tb-btn u{text-decoration:underline}.doc-tb-btn s{text-decoration:line-through}
.doc-tb-sep{width:1px;height:18px;background:#e6e8ec;margin:0 5px;flex:0 0 auto}
.doc-tb-color{position:relative}
.doc-tb-swatch{width:13px;height:13px;border-radius:3px;border:1px solid rgba(0,0,0,.15)}
.doc-tb-hint{margin-left:auto;font-size:10.5px;color:#9aa1ab;white-space:nowrap;padding-right:4px}
.doc-pm{font-size:9px;margin-left:5px;vertical-align:3px;cursor:pointer;user-select:none}
.doc-pm-src{color:#15803d}
.doc-pm-void{color:#9aa1ab;cursor:default}
.doc-strike{color:#9aa1ab;text-decoration:line-through;text-decoration-color:rgba(220,38,38,.55)}
.doc-ins{border-radius:2px;padding:0 1px}
.doc-ins-src{color:#15803d;border-bottom:1.5px solid rgba(21,128,61,.7)}
.doc-ins-void{color:#b45309;border-bottom:1.5px dotted rgba(180,83,9,.8)}
.doc-ghost{opacity:.96}
.doc-del{position:absolute;right:-2px;top:2px;opacity:0;border:none;background:transparent;color:#c0392b;font-size:12px;cursor:pointer;transition:opacity .1s}
.doc-block:hover .doc-del{opacity:.6}
.doc-block:hover .doc-del:hover{opacity:1}
.doc-empty{color:#9aa1ab;font-size:15px;line-height:1.8;font-style:italic}
.doc-margin{flex:0 0 274px;position:relative;min-height:10px}
.doc-card{background:#fff;border:1px solid #e6e8ec;border-radius:11px;box-shadow:0 1px 3px rgba(20,24,30,.08);padding:11px 13px;margin-bottom:11px;font-size:12px;line-height:1.5;transition:box-shadow .12s,border-color .12s}
.doc-card.active,.doc-card:hover{box-shadow:0 4px 14px rgba(20,24,30,.14)}
.doc-card-src{border-left:3px solid #15803d}
.doc-card-void{border-left:3px solid #b45309}
.doc-card-head{color:#5a626d;margin-bottom:7px}
.doc-card-who{font-weight:700;color:#1b1f24}
.doc-card-when{color:#9aa1ab}
.doc-card-before{color:#9aa1ab;text-decoration:line-through;text-decoration-color:rgba(220,38,38,.5);margin-bottom:3px}
.doc-card-after{color:#1b1f24;margin-bottom:7px}
.doc-card-groundrow{margin-bottom:2px}
.doc-card-ground{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;border-radius:6px;padding:2px 8px}
.doc-card-ground-src{color:#15803d;background:rgba(21,128,61,.10)}
.doc-card-ground-void{color:#b45309;background:#fef3e2}
.doc-i{font-size:11px}
.doc-card-passage{margin-top:6px;font-size:11.5px;line-height:1.5;color:#5a626d;border-left:2px solid #d8ccf7;padding:2px 0 2px 9px}
.doc-card-note{margin-top:6px;font-size:11px;line-height:1.45;color:#92400e}
.doc-card-actions{display:flex;gap:6px;margin-top:10px}
.doc-card-actions button{flex:1;font-size:11.5px;font-weight:600;border-radius:7px;padding:6px;cursor:pointer;border:1px solid transparent}
.doc-accept-src{color:#fff;background:#15803d;border-color:#15803d}
.doc-accept-src:hover{background:#136a34}
.doc-accept-void{color:#fff;background:#b45309;border-color:#b45309}
.doc-accept-void:hover{background:#98460a}
.doc-reject{color:#5a626d;background:#f4f5f7;border-color:#dde0e5!important}
.doc-reject:hover{color:#1b1f24;border-color:#c9ced6!important}
.doc-card-none{color:#9aa1ab;font-size:11.5px;line-height:1.5;padding:10px 4px;text-align:center}
.doc-compose{flex:0 0 auto;border-top:1px solid #e6e8ec;background:#fff;padding:10px 14px;display:flex;gap:9px;align-items:center}
.doc-compose input{flex:1;min-width:0;font:inherit;font-size:13px;color:#1b1f24;background:#f4f5f7;border:1px solid #dde0e5;border-radius:11px;padding:9px 13px;outline:none}
.doc-compose input:focus{border-color:#d8ccf7;background:#fff}
.doc-compose .doc-hint{font-size:10.5px;color:#9aa1ab;white-space:nowrap}
.doc-compose button{flex:0 0 auto;font-size:12.5px;font-weight:600;color:#fff;background:#5b34d6;border:none;border-radius:10px;padding:9px 15px;cursor:pointer}
.doc-compose button:hover{background:#4c29b8}
.doc-live{font-size:11px;color:#9aa1ab;padding:0 2px}
/* ── version history (the log view) ── */
.doc-hist-banner{flex:0 0 auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 16px;background:#fff7e8;border-bottom:1px solid #f2e2bf;font-size:12px;color:#8a5a00}
.doc-hist-banner-txt{font-weight:600}
.doc-hist-banner-acts{margin-left:auto;display:flex;gap:6px}
.doc-hist-b{font-size:11.5px;font-weight:600;color:#fff;background:#5b34d6;border:none;border-radius:8px;padding:6px 11px;cursor:pointer}
.doc-hist-b:hover{background:#4c29b8}
.doc-hist-b-ghost{color:#5a626d;background:#fff;border:1px solid #dde0e5}
.doc-hist-b-ghost:hover{color:#1b1f24;background:#f7f8fa}
.doc-paper-hist{cursor:default}
.doc-timeline{flex:0 0 300px;position:relative}
.doc-tl-head{font-size:12px;font-weight:800;color:#1b1f24;padding:2px 2px 10px;letter-spacing:-.01em}
.doc-tl-sub{display:block;font-size:10.5px;font-weight:500;color:#9aa1ab;margin-top:2px}
.doc-tl-list{position:relative;padding-left:14px}
.doc-tl-list::before{content:'';position:absolute;left:4px;top:6px;bottom:6px;width:2px;background:linear-gradient(#e6e8ec,#eef0f3)}
.doc-rev{display:block;width:100%;text-align:left;position:relative;background:#fff;border:1px solid #e6e8ec;border-radius:10px;box-shadow:0 1px 2px rgba(20,24,30,.05);padding:9px 11px;margin:0 0 9px;cursor:pointer;font:inherit;transition:box-shadow .12s,border-color .12s,transform .08s}
.doc-rev:hover{box-shadow:0 4px 14px rgba(20,24,30,.12);border-color:#d8ccf7}
.doc-rev.sel{border-color:#5b34d6;box-shadow:0 4px 16px rgba(91,52,214,.18)}
.doc-rev-dot{position:absolute;left:-14px;top:13px;width:9px;height:9px;border-radius:50%;background:#c9ced6;border:2px solid #fff;box-shadow:0 0 0 1px #e6e8ec}
.doc-rev.sel .doc-rev-dot{background:#5b34d6;box-shadow:0 0 0 1px #5b34d6}
.doc-rev.current .doc-rev-dot{background:#15803d;box-shadow:0 0 0 1px #15803d}
.doc-rev.revert .doc-rev-dot{background:#b45309;box-shadow:0 0 0 1px #b45309}
.doc-rev.orig .doc-rev-dot{background:#5a626d}
.doc-rev-top{display:flex;align-items:baseline;gap:7px;margin-bottom:4px}
.doc-rev-when{font-size:11.5px;font-weight:700;color:#1b1f24}
.doc-rev.current .doc-rev-when{color:#15803d}
.doc-rev-by{font-size:10.5px;color:#9aa1ab;margin-left:auto}
.doc-rev-body{font-size:11.5px;line-height:1.5;color:#5a626d;word-break:break-word;max-height:3.2em;overflow:hidden}
.doc-rev-ctx{color:#b6bcc6}
.doc-rev-plus{color:#15803d;font-weight:800;margin-right:3px}
.doc-rev-minus{color:#c0392b;font-weight:800;margin-right:3px}
.doc-rev-orig,.doc-rev-sess{color:#5a626d;font-weight:600}
.doc-rev-restore{color:#b45309;font-weight:600}
.doc-rev-actions{display:flex;gap:6px;margin-top:9px}
.doc-rev-btn{flex:1;font-size:11px;font-weight:600;border-radius:7px;padding:6px 4px;cursor:pointer;border:1px solid transparent}
.doc-rev-restore-btn{color:#fff;background:#5b34d6;border-color:#5b34d6}
.doc-rev-restore-btn:hover{background:#4c29b8}
.doc-rev-restore-btn:disabled{background:#eef0f3;color:#b6bcc6;border-color:#e6e8ec;cursor:default}
.doc-rev-fork-btn{color:#5b34d6;background:#f1edfc;border-color:#e3d9fa}
.doc-rev-fork-btn:hover{background:#e6ddfa}
@media (max-width:900px){.doc-canvas{flex-direction:column}.doc-margin{flex:1 0 auto;width:100%}.doc-paper{padding:40px 28px 60px}.doc-timeline{flex:1 0 auto}}
`;
