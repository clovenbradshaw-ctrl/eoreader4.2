// EO: INS·DEF(Void,Field → Entity,Void, Making,Clearing) — doc surface: mount + writer
// doc/surface.js — mount the EO change-tracking document into any element.
//
// A Google-Docs-style page whose model is an append-only edit log. The reader
// docks it like the deep-research surface; a document is projected from the log
// (project.js) and re-rendered on every append. Three modes (Google Docs' own):
//   Suggesting — edits become tracked changes, grounding-checked, reviewed in the
//                margin with ✓/✗; an ungrounded edit can only be kept as void.
//   Editing    — edits commit immediately (a change proposed AND accepted in one
//                step, still recorded and grounding-checked — nothing is silent).
//   Viewing    — the clean committed page, suggestions hidden.
//
// The only writer is this surface; the only truth is the log. Chat can drive it
// through proposeFromText (the "add a closing recommendation" path).

import { docCreate, blockAdd, blockEdit, changePropose, changeAccept, changeReject, docRevert } from './events.js';
import { groundText } from './ground.js';
import { projectDoc } from './project.js';
import { projectHistory } from './history.js';
import { renderDocFragment, renderHistoryFragment, docStatLine, DOC_CSS } from './render.js';

let _cssInjected = false;
const injectCss = (doc) => {
  if (_cssInjected) return;
  const s = doc.createElement('style');
  s.setAttribute('data-doc-surface', '');
  s.textContent = DOC_CSS;
  doc.head.appendChild(s);
  _cssInjected = true;
};

export const mountDocSurface = (el, opts = {}) => {
  const D = el.ownerDocument || document;
  injectCss(D);
  const author = opts.author || 'you';
  const record = opts.record || [];
  let mode = opts.mode || 'suggesting';
  let seq = 0;
  const now = () => (opts.stamp ? opts.stamp() : (typeof Date !== 'undefined' && Date.now ? Date.now() : 0));
  const nid = (p) => p + (++seq) + '_' + now();
  let histSel = null;     // selected revision anchor (history view); null = latest

  // ── the log, and the writer ────────────────────────────────────────────────
  // The host may hand in an existing log (a document reopened from a tab); else
  // we seed a fresh one. Every change is mirrored back through onChange so the
  // host persists it — the document survives tab switches and reloads.
  const log = [];
  const notify = () => { try { opts.onChange && opts.onChange(log.slice()); } catch (e) {} };
  // Append an event. `silent` persists + notifies but skips the re-render — used
  // for burst edits while a block is focused, so replacing the paper's innerHTML
  // never yanks the caret out from under the typist (the DOM already shows the text).
  const appendEv = (e, silent) => { log.push(e); notify(); if (!silent) render(); };
  const append = (e) => appendEv(e, false);
  const project = () => projectDoc(log);

  // ground a candidate line against the Record (the reader's recorded reads)
  const ground = (text) => groundText(text, record);

  const seed = opts.seed || {};
  if (opts.log && opts.log.length) {
    for (const e of opts.log) log.push(e);
  } else {
    const ts0 = now();
    log.push(docCreate({ id: nid('doc'), title: seed.title || 'Untitled document', author, t: seq, ts: ts0 }));
    for (const b of (seed.blocks || [])) {
      const g = b.grounding || (() => { const r = ground(b.text); return r.grounded ? { kind: 'source', span: r.span, srcId: r.srcId, host: r.host, overlap: r.overlap } : { kind: 'void' }; })();
      log.push(blockAdd({ id: nid('e'), docId: 'doc', blockId: nid('b'), text: b.text, grounding: g, author, t: seq, ts: ts0 }));
    }
    notify();
  }

  // propose a change (insert unless told otherwise). accept:true commits at once
  // (Editing mode / a direct edit). Returns the changeId.
  const propose = ({ kind = 'insert', text = '', html = '', type = 'p', targetId = null, afterId = null, before = '', who = author, accept = false }) => {
    const cid = nid('c');
    const ts = now();
    const grounding = kind === 'delete' ? { grounded: false } : ground(text);
    log.push(changePropose({ id: cid, docId: 'doc', changeId: cid, kind, text, html, type, targetId, afterId, blockId: nid('b'), before, grounding, author: who, when: 'now', t: seq, ts }));
    if (accept) log.push(changeAccept({ id: nid('a'), docId: 'doc', changeId: cid, t: seq, ts }));
    notify();
    render();
    return cid;
  };

  // ── fine edit capture: one committed BLOCK_EDIT per typing burst ────────────
  // A burst is a run of keystrokes to one block that hasn't yet been committed.
  // We keep the text the burst STARTED from (`base`) so the committed edit carries
  // an honest before/after the history view diffs character by character. Bursts
  // close on: an idle pause, a word boundary (a typed space), crossing a size
  // threshold, a block switch, blur, or leaving Editing mode — whichever first.
  // The result: recent history is nearly keystroke-fine; it coalesces with age.
  const IDLE_MS = 550, BURST_CHARS = 24;
  let burst = null;         // { blockId, base, baseHtml }
  let burstTimer = null;
  const clearBurstTimer = () => { if (burstTimer) { try { D.defaultView.clearTimeout(burstTimer); } catch (e) {} burstTimer = null; } };
  // Commit the open burst if the block's text actually moved. `silent` skips the
  // re-render (true while the block is still focused — the caret must survive).
  const commitBurst = (silent) => {
    clearBurstTimer();
    if (!burst) return;
    const b = burst; burst = null;
    const bl = el.querySelector('.doc-paper .doc-block[data-block="' + CSS.escape(b.blockId) + '"]');
    const cap = bl ? captureBlock(bl) : null;
    const proj = project().blocks.find((x) => x.id === b.blockId);
    if (!cap || !proj) return;
    if (cap.text === b.base && cap.html === (b.baseHtml || '')) return;   // nothing net
    if (!cap.text) return;   // emptied → let blur record it as a single delete, not an edit-to-empty
    const grounding = ground(cap.text);
    appendEv(blockEdit({ id: nid('e'), docId: 'doc', blockId: b.blockId, text: cap.text, html: cap.html, type: proj.type || 'p', before: b.base, beforeHtml: b.baseHtml || '', grounding, author, t: seq, ts: now() }), silent);
  };
  // Note a keystroke in `bl`. Opens a burst against the committed text if none is
  // open, then schedules/forces the commit per the burst rules.
  const noteEdit = (bl, ev) => {
    const id = bl.dataset.block;
    if (!burst || burst.blockId !== id) {
      commitBurst(true);
      const proj = project().blocks.find((x) => x.id === id);
      burst = { blockId: id, base: proj ? proj.text : '', baseHtml: proj ? (proj.html || '') : '' };
    }
    const cap = captureBlock(bl);
    const delta = Math.abs(cap.text.length - burst.base.length);
    const boundary = ev && (ev.data === ' ' || ev.inputType === 'insertParagraph' || ev.inputType === 'insertLineBreak');
    if (delta >= BURST_CHARS || boundary) {
      commitBurst(true);                                          // close this burst…
      burst = { blockId: id, base: cap.text, baseHtml: cap.html }; // …and reopen from the committed text
    } else {
      clearBurstTimer();
      try { burstTimer = D.defaultView.setTimeout(() => commitBurst(true), IDLE_MS); } catch (e) {}
    }
  };

  // ── restore & fork (the history view) ──────────────────────────────────────
  const revertTo = (idx) => {
    commitBurst(true);
    const h = projectHistory(log);
    const rev = (h.revisions || []).find((r) => r.anchorIdx === idx);
    const label = rev ? (rev.snippet || rev.kind) : '';
    append(docRevert({ id: nid('rv'), docId: 'doc', toIndex: idx, label: String(label).slice(0, 60), author, t: seq, ts: now() }));
    histSel = null;
    setMode('editing');
  };
  const forkAt = (idx) => {
    commitBurst(true);
    const at = projectDoc(log.slice(0, idx + 1));
    const seedDoc = { title: (at.title || 'Untitled document') + ' (fork)', blocks: at.blocks.map((b) => ({ text: b.text, html: b.html, type: b.type, grounding: b.grounding })) };
    if (opts.onFork) { try { opts.onFork(seedDoc, { fromTitle: at.title, fromIdx: idx }); } catch (e) {} }
    return seedDoc;
  };

  // ── chrome (built once) ────────────────────────────────────────────────────
  el.classList.add('doc-surface');
  el.innerHTML = `
    <div class="doc-bar">
      <input class="doc-title" value="${(seed.title || 'Untitled document').replace(/"/g, '&quot;')}" aria-label="Document title">
      <span class="doc-stat"></span>
      <div class="doc-modes">
        <button data-mode="suggesting" title="Edits become tracked suggestions, reviewed in the margin">✎ Suggesting</button>
        <button data-mode="editing" title="Edits commit immediately — still recorded and grounding-checked">✐ Editing</button>
        <button data-mode="viewing" title="The clean committed page">👁 Viewing</button>
        <button data-mode="history" title="Every edit, newest first — restore or fork any version">🕘 History</button>
      </div>
      ${opts.onClose ? '<button class="doc-x" title="Close">✕</button>' : ''}
    </div>
    <div class="doc-toolbar">
      <select class="doc-tb-sel" data-tb="block" title="Text style">
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="quote">Quote</option>
      </select>
      <span class="doc-tb-sep"></span>
      <button class="doc-tb-btn" data-cmd="bold" title="Bold (⌘B)"><b>B</b></button>
      <button class="doc-tb-btn" data-cmd="italic" title="Italic (⌘I)"><i>I</i></button>
      <button class="doc-tb-btn" data-cmd="underline" title="Underline (⌘U)"><u>U</u></button>
      <button class="doc-tb-btn" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
      <span class="doc-tb-sep"></span>
      <button class="doc-tb-btn doc-tb-color" data-color="#dc2626" title="Red"><span class="doc-tb-swatch" style="background:#dc2626"></span></button>
      <button class="doc-tb-btn doc-tb-color" data-color="#15803d" title="Green"><span class="doc-tb-swatch" style="background:#15803d"></span></button>
      <button class="doc-tb-btn doc-tb-color" data-color="#2563eb" title="Blue"><span class="doc-tb-swatch" style="background:#2563eb"></span></button>
      <button class="doc-tb-btn doc-tb-color" data-color="#1b1f24" title="Default"><span class="doc-tb-swatch" style="background:#1b1f24"></span></button>
      <span class="doc-tb-sep"></span>
      <button class="doc-tb-btn" data-type="ul" title="Bulleted list">•—</button>
      <button class="doc-tb-btn" data-type="ol" title="Numbered list">1.</button>
      <span class="doc-tb-sep"></span>
      <button class="doc-tb-btn" data-cmd="createLink" title="Insert link">🔗</button>
      <button class="doc-tb-btn" data-cmd="removeFormat" title="Clear formatting">⨯</button>
      <span class="doc-tb-hint">formatting applies in Editing mode</span>
    </div>
    <div class="doc-scroll"><div class="doc-body"></div></div>
    <div class="doc-compose">
      <input class="doc-line" placeholder="Suggest a line — it is grounded to the Record, or marked as your own…" aria-label="Suggest a line">
      <span class="doc-hint doc-live"></span>
      <button class="doc-add">Suggest</button>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const body = $('.doc-body');
  const statEl = $('.doc-stat');
  const titleEl = $('.doc-title');
  const lineEl = $('.doc-line');
  const liveEl = $('.doc-live');

  // ── render + margin-card anchoring (Google Docs vertical alignment) ────────
  const render = () => {
    const doc = project();
    if (mode === 'history') {
      const history = projectHistory(log);
      const revs = history.revisions || [];
      const latest = revs.length ? revs[0].anchorIdx : (log.length - 1);
      if (histSel == null) histSel = latest;
      // the document as of the selected revision, read-only
      const histDoc = projectDoc(log.slice(0, histSel + 1));
      body.innerHTML = renderHistoryFragment(histDoc, history, histSel, now());
      statEl.textContent = `${history.count} edit${history.count === 1 ? '' : 's'} on the log`;
    } else {
      body.innerHTML = renderDocFragment(doc, mode);
      statEl.textContent = docStatLine(doc);
    }
    for (const b of el.querySelectorAll('.doc-modes button')) b.classList.toggle('on', b.dataset.mode === mode);
    // the compose bar makes sense only while writing (Suggesting / Editing)
    $('.doc-compose').style.display = (mode === 'viewing' || mode === 'history') ? 'none' : 'flex';
    $('.doc-toolbar').style.display = mode === 'history' ? 'none' : 'flex';
    if (mode !== 'history') layoutCards();
  };

  // Place each margin card next to the block it annotates, pushing overlaps down.
  const layoutCards = () => {
    const canvas = el.querySelector('.doc-canvas');
    const margin = el.querySelector('.doc-margin');
    if (!canvas || !margin) return;
    const cards = [...margin.querySelectorAll('.doc-card')];
    if (!cards.length || margin.clientWidth < 40) return; // stacked fallback (narrow / no cards)
    const cRect = canvas.getBoundingClientRect();
    let cursor = 0;
    for (const card of cards) {
      const anchorId = card.dataset.anchor;
      const anchor = anchorId ? el.querySelector('.doc-paper [data-block="' + CSS.escape(anchorId) + '"]') : null;
      const top = anchor ? (anchor.getBoundingClientRect().top - cRect.top) : cursor;
      const y = Math.max(top, cursor);
      card.style.position = 'absolute';
      card.style.top = y + 'px';
      card.style.left = '0';
      card.style.right = '0';
      cursor = y + card.offsetHeight + 10;
    }
    margin.style.minHeight = cursor + 'px';
  };

  // ── interaction (delegated, wired once) ────────────────────────────────────
  // Switching mode always flushes any open burst first (so the latest keystrokes
  // are on the log before we re-render); leaving History clears the selection.
  const setMode = (m) => { commitBurst(true); if (m !== 'history') histSel = null; mode = m; render(); };

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-mode],[data-accept],[data-reject],[data-del],[data-restore],[data-fork],[data-histlive],[data-rev],.doc-pm-src,.doc-x,.doc-add');
    if (!t) return;
    if (t.classList.contains('doc-x')) { opts.onClose && opts.onClose(); return; }
    if (t.classList.contains('doc-add')) { submitLine(); return; }
    if (t.dataset.mode) { setMode(t.dataset.mode); return; }
    if (t.dataset.accept) { append(changeAccept({ id: nid('a'), docId: 'doc', changeId: t.dataset.accept, t: seq, ts: now() })); return; }
    if (t.dataset.reject) { append(changeReject({ id: nid('r'), docId: 'doc', changeId: t.dataset.reject, t: seq, ts: now() })); return; }
    if (t.dataset.del) { propose({ kind: 'delete', targetId: t.dataset.del, before: blockText(t.dataset.del), accept: mode === 'editing' }); return; }
    // ── history view ──
    if (t.dataset.restore != null) { revertTo(parseInt(t.dataset.restore, 10)); return; }
    if (t.dataset.fork != null) { forkAt(parseInt(t.dataset.fork, 10)); return; }
    if (t.dataset.histlive != null) { const h = projectHistory(log); histSel = h.revisions.length ? h.revisions[0].anchorIdx : (log.length - 1); render(); return; }
    if (t.dataset.rev != null) { histSel = parseInt(t.dataset.rev, 10); render(); return; }
    if (t.classList.contains('doc-pm-src')) { showSpan(t); return; }
  });

  // Grounding is a fold over the whole Record — for each recorded span it
  // re-tokenises the passage and intersects it with the line. Running that on
  // every keystroke made typing lag, so we DON'T fold as you type: the input
  // handler only shows a neutral hint. The real grounding read-out is computed
  // once, on submission, and rendered in the margin card (render.js) — nothing
  // is lost, it just waits until you add the line.
  lineEl.addEventListener('input', () => {
    const v = lineEl.value.trim();
    liveEl.textContent = v ? 'grounding is checked when you add the line' : '';
    liveEl.style.color = '#9aa1ab';
  });
  lineEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitLine(); } });
  const submitLine = () => {
    const v = lineEl.value.trim();
    if (!v) return;
    const doc = project();
    const afterId = doc.blocks.length ? doc.blocks[doc.blocks.length - 1].id : null;
    propose({ kind: 'insert', text: v, afterId, accept: mode === 'editing' });
    lineEl.value = ''; liveEl.textContent = '';
  };

  // Editing mode: Enter commits the block (blur); Shift+Enter would be a soft break.
  body.addEventListener('keydown', (e) => {
    const bl = e.target.closest('.doc-block[contenteditable="true"]');
    if (bl && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); bl.blur(); }
  });
  // Every keystroke in an editable block feeds the burst tracker — which commits a
  // fine BLOCK_EDIT per burst (see noteEdit). Guarded to Editing mode; suggesting/
  // viewing blocks are not contenteditable, so this never fires there.
  body.addEventListener('input', (e) => {
    if (mode !== 'editing') return;
    const bl = e.target.closest && e.target.closest('.doc-block[contenteditable="true"]');
    if (bl) noteEdit(bl, e);
  });
  // On blur: flush the block's open burst (its net keystrokes land on the log),
  // then — DEFERRED to the next tick so we never replace the paper's innerHTML from
  // inside the blur event — reconcile an emptied line to a delete and re-render the
  // clean paper (committed marks, fresh stats).
  body.addEventListener('blur', (e) => {
    const bl = e.target.closest && e.target.closest('.doc-block[contenteditable="true"]');
    if (!bl) return;
    const id = bl.dataset.block;
    const cap = captureBlock(bl);
    if (burst && burst.blockId === id) commitBurst(true);
    setTimeout(() => {
      const b = project().blocks.find((x) => x.id === id);
      if (!b) { render(); return; }
      if (!cap.text) { propose({ kind: 'delete', targetId: id, before: b.text, accept: true }); return; } // emptied → delete (renders)
      render();
    }, 0);
  }, true);

  titleEl.addEventListener('input', () => { opts.onTitle && opts.onTitle(titleEl.value.trim() || 'Untitled document'); });
  const blockText = (id) => { const b = project().blocks.find((x) => x.id === id); return b ? b.text : ''; };

  // ── rich formatting (Editing mode) ─────────────────────────────────────────
  // Inline styling rides execCommand (the Gmail-era workhorse): it edits the
  // focused block's DOM live; the sanitised HTML is captured on the deferred blur
  // commit. Block SHAPE (heading/list/quote) is a block TYPE set directly, so one
  // editable element stays one line — no nested <ul>/<h1> to fight.
  let focusedBlock = null;
  body.addEventListener('focusin', (e) => {
    const bl = e.target.closest && e.target.closest('.doc-block[contenteditable="true"]');
    if (bl) { focusedBlock = bl; syncToolbar(); }
  });
  const syncToolbar = () => {
    const sel = el.querySelector('.doc-tb-sel');
    if (sel && focusedBlock) sel.value = focusedBlock.dataset.type || 'p';
    for (const b of el.querySelectorAll('.doc-tb-btn[data-cmd]')) {
      let on = false; try { on = !!(D.queryCommandState && D.queryCommandState(b.dataset.cmd)); } catch (e) {}
      b.classList.toggle('on', on);
    }
  };
  // The toolbar's mousedown-preventDefault keeps the block's selection alive, so
  // execCommand acts on it directly — calling focus() here would collapse it.
  const exec = (cmd, val) => { try { D.execCommand(cmd, false, val); syncToolbar(); } catch (e) {} };
  const toolbar = el.querySelector('.doc-toolbar');
  toolbar.addEventListener('mousedown', (e) => { if (e.target.closest('.doc-tb-btn')) e.preventDefault(); }); // keep the block's selection
  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.doc-tb-btn'); if (!btn) return;
    if (mode !== 'editing') { setMode('editing'); return; }
    if (btn.dataset.cmd) {
      if (btn.dataset.cmd === 'createLink') { const url = D.defaultView.prompt('Link URL:'); if (url) exec('createLink', url); }
      else exec(btn.dataset.cmd);
      syncToolbar();
    } else if (btn.dataset.color) { exec('foreColor', btn.dataset.color); }
    else if (btn.dataset.type && focusedBlock) { setBlockType(focusedBlock.dataset.block, btn.dataset.type); }
  });
  el.querySelector('.doc-tb-sel').addEventListener('change', (e) => {
    if (mode !== 'editing') { setMode('editing'); return; }
    if (focusedBlock) setBlockType(focusedBlock.dataset.block, e.target.value);
  });
  const setBlockType = (id, type) => {
    commitBurst(true);   // fold any pending keystrokes before the structural change
    const bl = el.querySelector('.doc-paper .doc-block[data-block="' + CSS.escape(id) + '"]');
    const b = project().blocks.find((x) => x.id === id);
    if (!b) return;
    const cap = bl ? captureBlock(bl) : { text: b.text, html: b.html || '' };
    propose({ kind: 'replace', targetId: id, text: cap.text || b.text, html: cap.html, type, before: b.text, accept: true });
  };

  // Whitelist-sanitise edited HTML down to inline formatting only (no script, no
  // block structure, no rogue attributes) — the stored html is then trusted by render.
  const ALLOWED = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, A: 1, SPAN: 1, FONT: 1, BR: 1 };
  const sanitizeInline = (html) => {
    const tmp = D.createElement('div');
    tmp.innerHTML = html;
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) continue;
        if (child.nodeType !== 1) { child.remove(); continue; }
        if (!ALLOWED[child.tagName]) { const f = D.createDocumentFragment(); while (child.firstChild) f.appendChild(child.firstChild); child.replaceWith(f); walk(node); return; }
        for (const at of [...child.attributes]) { const n = at.name.toLowerCase(); const keep = (child.tagName === 'A' && n === 'href') || n === 'style' || (child.tagName === 'FONT' && n === 'color'); if (!keep) child.removeAttribute(at.name); }
        if (child.tagName === 'A') { const h = child.getAttribute('href') || ''; if (/^\s*javascript:/i.test(h)) child.removeAttribute('href'); else { child.setAttribute('rel', 'noopener'); child.setAttribute('target', '_blank'); } }
        const st = child.getAttribute && child.getAttribute('style');
        if (st) { const keep = (st.match(/(?:^|;)\s*(color|background-color|font-weight|font-style|text-decoration)\s*:[^;]+/gi) || []).join(';').replace(/^;/, ''); if (keep) child.setAttribute('style', keep); else child.removeAttribute('style'); }
        walk(child);
      }
    };
    walk(tmp);
    return tmp.innerHTML.trim();
  };
  const captureBlock = (bl) => {
    const clone = bl.cloneNode(true);
    for (const x of clone.querySelectorAll('.doc-del,.doc-pm')) x.remove();
    const html = sanitizeInline(clone.innerHTML);
    const tmp = D.createElement('div'); tmp.innerHTML = html;
    const text = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
    return { html: /[<]/.test(html) ? html : '', text };  // plain text → no html, renders as text
  };

  // A small popover with the recorded span a block stands on.
  const showSpan = (mark) => {
    const spanId = mark.dataset.span;
    const b = project().blocks.find((x) => x.grounding && x.grounding.span && x.grounding.span.id === spanId);
    const span = b && b.grounding.span;
    closeSpan();
    if (!span) return;
    const pop = D.createElement('div');
    pop.className = 'doc-span-pop';
    pop.style.cssText = 'position:fixed;z-index:2147483001;max-width:320px;background:#1b1f24;color:#e8eaed;border-radius:9px;padding:9px 11px;font-size:11.5px;line-height:1.5;box-shadow:0 12px 32px rgba(0,0,0,.34)';
    pop.innerHTML = '<div style="font-weight:700;color:#7ee2a8;margin-bottom:4px">⚓ In the record' + (span.srcId ? ' · ' + span.srcId : '') + (span.host ? ' · ' + span.host : '') + '</div>“' + String(span.text).replace(/</g, '&lt;') + '”';
    D.body.appendChild(pop);
    const r = mark.getBoundingClientRect();
    pop.style.left = Math.min(r.left, (D.defaultView.innerWidth || 1200) - 340) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    _pop = pop;
    setTimeout(() => D.addEventListener('click', closeSpan, { once: true }), 0);
  };
  let _pop = null;
  const closeSpan = () => { if (_pop) { _pop.remove(); _pop = null; } };

  window.addEventListener && window.addEventListener('resize', layoutCards);
  render();

  // the handle the host keeps — chat drives the doc through proposeFromText
  return {
    el,
    getLog: () => log.slice(),
    project,
    history: () => projectHistory(log),
    setMode,
    revertTo,
    forkAt,
    // "add a closing recommendation" → a grounded, tracked change the user reviews
    proposeFromText: (text, o = {}) => {
      const doc = project();
      const afterId = o.afterId || (doc.blocks.length ? doc.blocks[doc.blocks.length - 1].id : null);
      return propose({ kind: o.kind || 'insert', text, afterId, targetId: o.targetId || null, who: o.author || 'eo', accept: !!o.accept });
    },
    destroy: () => { clearBurstTimer(); closeSpan(); window.removeEventListener && window.removeEventListener('resize', layoutCards); el.innerHTML = ''; el.classList.remove('doc-surface'); },
  };
};
