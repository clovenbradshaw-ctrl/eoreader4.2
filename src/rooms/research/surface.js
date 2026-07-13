// EO: NUL·SIG(Void,Network → Void, Clearing,Tending) — mountResearchSurface — the DOM UI
// research/surface.js — the deep-research surface, mountable anywhere.
//
// The main app mounts it in the right panel (reader/app.dc.js →
// onOpenDeepResearch). Framework-free DOM so it owes nothing to the host's
// runtime — it can be dropped into any DOM element.
//
// The surface is the two projections side by side (docs/deep-research-log.md):
// while the driver runs, the LIVE view (live.js) — the frame panel, the strain
// bar filling toward the REC threshold, the coverage grid filling cell by
// cell, questions surfacing as in-flow cards; when it lands, the REPORT
// (render.js) — every clause tethered to its span, pins, voids, the trace.
// Both are projectReport(log) at a cursor; nothing here is a second state.

import { createResearchSession, pendingClarification, refocusQuery } from './session.js';
import { liveView, describeEvent } from './live.js';
import { renderReportFragment, renderTraceFragment, renderReportHTML, REPORT_CSS } from './render.js';
import { modelDisambiguator } from '../../turn/disambiguate.js';

const PROXY = 'https://n8n.intelechia.com/webhook';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A small readable-text extraction for fetched pages — enough for the pinned
// corpus; the main app can inject its richer extractor via opts.fetchPage.
const htmlToText = (html) => {
  const noScript = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|footer|header|aside|form|noscript)[\s\S]*?<\/\1>/gi, ' ');
  const title = (noScript.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  const text = noScript
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 40).join('\n');
  return { title, text };
};

const defaultFetchPage = async (url) => {
  const r = await fetch(PROXY + '/feed?url=' + encodeURIComponent(url));
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const { title, text } = htmlToText(await r.text());
  if (text.length < 200) throw new Error('page too thin to pin');
  return { url, title: title || url, text };
};

// The default search for the standalone page: Wikipedia, CORS-direct (no proxy,
// no key). One call finds the topical titles, one more pulls their plain-text
// extracts — enough for the gather loop to pin a real corpus. A host with a
// richer web client (the main app) injects its own via opts.search; any failure
// degrades to an empty result, and the driver records a measured VOID.
const WIKI = 'https://en.wikipedia.org/w/api.php';
const defaultSearch = async (query, { k = 5 } = {}) => {
  const q = String(query || '').trim();
  if (!q) return [];
  let titles = [];
  try {
    const p = new URLSearchParams({ action: 'query', list: 'search', srsearch: q, srlimit: String(k), format: 'json', origin: '*' });
    const j = await (await fetch(WIKI + '?' + p)).json();
    titles = (j?.query?.search || []).map((x) => x.title).filter(Boolean);
  } catch { return []; }
  if (!titles.length) return [];
  try {
    const p = new URLSearchParams({ action: 'query', prop: 'extracts', explaintext: '1', exsectionformat: 'plain', redirects: '1', titles: titles.join('|'), format: 'json', origin: '*' });
    const j = await (await fetch(WIKI + '?' + p)).json();
    return Object.values(j?.query?.pages || {}).map((pg) => ({
      url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(String(pg.title).replace(/ /g, '_')),
      title: pg.title, text: String(pg.extract || ''),
    })).filter((x) => x.text.length > 200);
  } catch { return []; }
};

// Panel-native: the surface lives in the app's right column (≈380px), not a
// standalone page — one narrow scrolling column, compact type, no wide
// max-widths. Every section is sized to read at panel width so the whole run
// fits the same slot the entity panel uses.
const SURFACE_CSS = `
.drs{display:flex;flex-direction:column;height:100%;background:var(--card,#fff);color:#1a1c20;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px}
.drs *{box-sizing:border-box}
.drs-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 13px;background:var(--card,#fff);border-bottom:1px solid #e5e7eb;position:sticky;top:0;z-index:4}
.drs-close{margin-left:auto;width:24px;height:24px;border:none;background:transparent;color:#9aa1ab;border-radius:6px;cursor:pointer;font-size:14px;line-height:1}
.drs-close:hover{background:#eef0f3;color:#1a1c20}
.drs-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:12px 13px 40px}
.drs label{display:block;font-size:10.5px;font-weight:700;color:#5b6572;text-transform:uppercase;letter-spacing:.04em;margin:9px 0 4px}
.drs input[type=text],.drs textarea{width:100%;border:1px solid #d7dbe2;border-radius:8px;padding:8px 10px;font:inherit;background:#fff}
.drs textarea{min-height:52px;resize:vertical}
.drs-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.drs-btn{border:1px solid #d7dbe2;background:#fff;border-radius:8px;padding:7px 12px;font:inherit;font-weight:600;cursor:pointer}
.drs-btn:hover{background:#eef0f3}
.drs-btn-acc{background:#2563eb;border-color:#2563eb;color:#fff}
.drs-btn-acc:hover{background:#1d4ed8}
.drs-btn[disabled]{opacity:.5;cursor:default}
.drs-src{display:flex;align-items:center;gap:8px;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;margin:5px 0;font-size:12px;background:#fafbfc}
.drs-src .drs-x{margin-left:auto;border:none;background:none;cursor:pointer;color:#9aa2ad;font-size:13px}
.drs-hint{font-size:11px;color:#9aa2ad;line-height:1.5}
.drs-err{color:#991b1b;font-size:12px;margin-top:7px}
/* — the ask box: the trigger, always at the top of the panel — */
.drs-ask-box{border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#fafbfc}
.drs-ask-title{font-size:13px;font-weight:700;color:#1b1f24;margin:0 0 3px}
.drs-ask-sub{font-size:11px;color:#5b6572;margin:0 0 9px;line-height:1.45}
.drs-ask-box .drs-q{font-size:13.5px;padding:9px 11px;border-radius:9px}
.drs-ask-box .drs-q:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.13)}
.drs-opts{display:flex;flex-direction:column;gap:7px;margin-top:9px}
.drs-optrow{display:flex;align-items:center;gap:8px}
.drs-optlab{flex:0 0 62px;font-size:10px;font-weight:700;color:#9aa1ab;text-transform:uppercase;letter-spacing:.04em}
.drs-seg{display:inline-flex;background:#eef0f3;border-radius:8px;padding:3px;flex:1}
.drs-seg button{flex:1;border:none;background:none;font:inherit;font-size:11.5px;font-weight:600;color:#5b6572;padding:5px 4px;border-radius:6px;cursor:pointer}
.drs-seg button.on{background:#fff;color:#1a1c20;box-shadow:0 1px 2px rgba(16,24,40,.12)}
.drs-run{width:100%;margin-top:11px;padding:10px;font-size:13.5px;border-radius:9px}
.drs-adv-toggle{display:block;margin-top:10px;border:none;background:none;color:#2563eb;font:inherit;font-size:12px;font-weight:600;cursor:pointer;padding:0}
.drs-adv{margin-top:9px;border-top:1px solid #eaecef;padding-top:4px}
.drs-ask-box.running .drs-ask-sub,.drs-ask-box.running .drs-opts,.drs-ask-box.running .drs-adv-toggle,.drs-ask-box.running .drs-adv{display:none}
.drs-ask-box.running{padding:9px 10px}
.drs-ask-box.running .drs-ask-title{font-size:11px;color:#9aa1ab;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
/* — the live run — */
.drs-live{display:block;margin-top:14px}
.drs-settle-head{display:flex;align-items:baseline;gap:8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9aa1ab}
.drs-settle-label{margin-left:auto;font-size:11px;font-weight:700;text-transform:none;letter-spacing:0}
.drs-settle-bar{margin-top:6px;height:7px;border-radius:5px;background:#eef0f3;overflow:hidden}
.drs-settle-fill{height:100%;border-radius:5px;background:#5b34d6;width:0%;transition:width .5s cubic-bezier(.4,0,.2,1)}
.drs-status{margin-top:8px;display:flex;align-items:center;gap:7px;font-size:12px;color:#5a626d}
.drs-status-icon{font-size:12px;color:#5b34d6}
.drs-reading{margin-top:12px;border:1px solid #d8ccf7;background:#f1edfc;border-radius:11px;padding:9px 11px;display:flex;align-items:center;gap:9px}
.drs-reading-spin{width:13px;height:13px;flex:0 0 auto;border-radius:50%;border:2px solid #d8ccf7;border-top-color:#5b34d6;animation:drs-spin .8s linear infinite;display:inline-block;box-sizing:border-box}
@keyframes drs-spin{to{transform:rotate(360deg)}}
.drs-reading-title{font-size:12px;font-weight:700;color:#1b1f24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.drs-reading-sub{font-size:10.5px;color:#5a626d;margin-top:1px}
.drs-sec{margin-top:15px;margin-bottom:7px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9aa1ab}
.drs-sec-note{font-weight:500;text-transform:none;letter-spacing:0;color:#9aa1ab}
/* — terms being researched: what it's actually looking for — */
.drs-terms{display:flex;flex-wrap:wrap;gap:5px}
.drs-term{font-size:11.5px;font-weight:600;color:#3730a3;background:#eef2ff;border:1px solid #d8ddfb;border-radius:99px;padding:3px 10px}
.drs-term.on{color:#fff;background:#5b34d6;border-color:#5b34d6}
.drs-subs{display:flex;flex-direction:column;gap:2px}
.drs-sub{display:flex;align-items:center;gap:8px;padding:5px 2px}
.drs-sub-mark{flex:0 0 auto;width:16px;display:flex;align-items:center;justify-content:center}
.drs-sub-done{width:16px;height:16px;border-radius:50%;background:rgba(21,128,61,.10);color:#15803d;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700}
.drs-sub-spin{width:9px;height:9px;border-radius:50%;border:2px solid #d8ccf7;border-top-color:#5b34d6;animation:drs-spin .8s linear infinite;display:inline-block;box-sizing:border-box}
.drs-sub-dot{width:8px;height:8px;border-radius:50%;background:#dde0e5;display:inline-block}
.drs-sub-t{flex:1;min-width:0;font-size:12px;color:#1b1f24;line-height:1.35}
.drs-sub-t.q{color:#9aa1ab}
.drs-sub-st{margin-left:auto;flex:0 0 auto;font-size:10px;color:#9aa1ab}
.drs-finds{display:flex;flex-direction:column;gap:5px}
.drs-find{display:flex;align-items:baseline;gap:8px;padding:7px 9px;border-radius:9px;background:#f5f6f8;border:1px solid #e6e8ec}
.drs-find.warn{background:#fef3e2;border-color:#f4d9ad}
.drs-find-i{flex:0 0 auto;font-size:11px;width:14px;text-align:center;color:#9aa1ab}
.drs-find.warn .drs-find-i{color:#b45309}
.drs-find-t{font-size:12px;color:#1b1f24;line-height:1.4}
.drs-find.warn .drs-find-t{color:#92400e}
.drs-find-h{font-size:10px;color:#9aa1ab;margin-top:2px}
.drs-cov{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.drs-cov-cell{border:1px solid #e6e8ec;border-radius:9px;padding:7px 8px;background:#fff}
.drs-cov-cell.grn{background:rgba(21,128,61,.10)}
.drs-cov-cell.amb{background:#fef3e2;border-color:#f4d9ad}
.drs-cov-cell.acc{background:#f1edfc}
.drs-cov-v{font-size:16px;font-weight:800;line-height:1}
.drs-cov-l{font-size:9px;color:#9aa1ab;margin-top:4px;line-height:1.2}
.drs-covnote{margin-top:8px;line-height:1.5}
.drs-report-wrap{background:#fff;border:1px solid #e5e7eb;border-radius:11px;padding:14px 15px;margin-top:14px}
.drs-mark{font-size:13px;font-weight:700;letter-spacing:.01em}
/* — state A: the gap is the door — */
.drs-gap{margin-top:12px;border:1px dashed #cbb8f0;background:#faf8ff;border-radius:12px;padding:12px 13px}
.drs-gap-tag{font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7c3aed;margin-bottom:5px}
.drs-gap-q{font-size:14px;font-weight:700;color:#2a2140;line-height:1.35}
.drs-gap-note{font-size:11.5px;color:#5a626d;margin-top:5px;line-height:1.45}
/* — the search, audited — */
.drs-audit{margin-top:12px;border:1px solid #f4d9ad;background:#fff9ef;border-radius:12px;padding:11px 13px}
.drs-audit-big{font-size:13px;color:#1b1f24;line-height:1.4}
.drs-audit-big b{font-size:15px;font-weight:800;color:#92400e}
.drs-audit-big em{font-style:normal;font-weight:700;color:#92400e}
.drs-audit-sub{font-size:11px;color:#5a626d;margin-top:5px;line-height:1.4}
.drs-audit-stop{font-size:11.5px;color:#5b21b6;margin-top:6px;font-weight:600;line-height:1.4}
/* — the disambiguation popup: an OFFER to refocus, never a block — */
.drs-clarify{margin-top:12px;border:1px solid #d8ccf7;background:#faf8ff;border-radius:12px;padding:12px 13px;animation:drs-clarify-in .25s ease}
@keyframes drs-clarify-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.drs-clarify-head{display:flex;align-items:flex-start;gap:8px}
.drs-clarify-icon{flex:0 0 auto;font-size:14px;color:#5b34d6;line-height:1.3}
.drs-clarify-text{font-size:12.5px;color:#2a2140;line-height:1.45;font-weight:600}
.drs-clarify-x{margin-left:auto;flex:0 0 auto;border:none;background:none;color:#9aa1ab;cursor:pointer;font-size:13px;padding:0 2px;line-height:1}
.drs-clarify-x:hover{color:#5a626d}
.drs-clarify-opts{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.drs-clarify-opt{font:inherit;font-size:12px;font-weight:600;color:#3730a3;background:#eef2ff;border:1px solid #c9d2fb;border-radius:99px;padding:5px 12px;cursor:pointer}
.drs-clarify-opt:hover{background:#e0e7ff}
.drs-clarify-opt.cur{color:#fff;background:#5b34d6;border-color:#5b34d6}
.drs-clarify-or{margin-top:10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9aa1ab}
.drs-clarify-row{display:flex;gap:6px;margin-top:5px}
.drs-clarify-in{flex:1;min-width:0;font:inherit;font-size:12px;border:1px solid #d7dbe2;border-radius:8px;padding:6px 9px}
.drs-clarify-go{font:inherit;font-size:12px;font-weight:600;color:#fff;background:#5b34d6;border:1px solid #5b34d6;border-radius:8px;padding:6px 12px;cursor:pointer;flex:0 0 auto}
.drs-clarify-go:hover{background:#4a29b8}
${REPORT_CSS}
`;

// mountResearchSurface(el, opts) → { destroy, session }
//   opts.session    a createResearchSession — SHARE the app's session and the
//                   surface stays live: research asked in chat appends to the
//                   same log and this surface re-projects (never a dead artifact)
//   opts.fetchPage  async (url) => { url, title, text } — the host's page fetcher
//   opts.model      { phrase } — the host's talker, for the one checked call/section
//   opts.fetch      network fetch for archive pinning (default window.fetch)
//   opts.onClose    show a close button that calls this
//   opts.sources    pre-seeded [{ url?, title?, text }] (the app hands over open sources)
export const mountResearchSurface = (el, opts = {}) => {
  const fetchPage = opts.fetchPage || defaultFetchPage;
  const search = opts.search || defaultSearch;
  const netFetch = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  const sources = [...(opts.sources || [])];
  const session = opts.session || createResearchSession({ model: opts.model || null, fetch: netFetch, now: () => Date.now() });

  const root = document.createElement('div');
  root.className = 'drs';
  const style = document.createElement('style');
  style.textContent = SURFACE_CSS;
  root.appendChild(style);
  root.insertAdjacentHTML('beforeend', `
    <div class="drs-head">
      <div class="drs-mark">⌕ Deep research</div>
      ${opts.onClose ? '<button class="drs-close" title="Close">✕</button>' : ''}
    </div>
    <div class="drs-body">
      <div class="drs-ask-box">
        <p class="drs-ask-title">Ask a research question</p>
        <p class="drs-ask-sub">It reads the web, pins every source, and grounds each claim in an exact quote you can click.</p>
        <textarea class="drs-q" rows="2" placeholder="e.g. What did the 2025 metro-contracts audit find?"></textarea>
        <div class="drs-opts">
          <div class="drs-optrow">
            <span class="drs-optlab">How much</span>
            <div class="drs-seg" data-group="size">
              <button data-value="brief">Brief</button>
              <button data-value="standard" class="on">Standard</button>
              <button data-value="deep">Deep</button>
            </div>
          </div>
          <div class="drs-optrow">
            <span class="drs-optlab">How to look</span>
            <div class="drs-seg" data-group="strategy">
              <button data-value="breadth" title="Many sources, each read lightly — survey the landscape">Breadth</button>
              <button data-value="depth" title="Few sources, followed deep — chase one thread far">Depth</button>
              <button data-value="holonic" class="on" title="Break the topic into facets and research each as its own whole">Holonic</button>
            </div>
          </div>
        </div>
        <button class="drs-btn drs-btn-acc drs-run">✦ Research</button>
        <div class="drs-err" style="display:none"></div>
        <button class="drs-adv-toggle" type="button">＋ Add sources or sub-questions</button>
        <div class="drs-adv" hidden>
          <label>Sub-questions <span style="font-weight:400;text-transform:none">(optional, one per line — overrides the automatic breakdown)</span></label>
          <textarea class="drs-subqs" placeholder="Who awarded the contract?&#10;What did the audit find?"></textarea>
          <label>Your own sources</label>
          <div class="drs-srclist"></div>
          <div class="drs-row" style="margin-top:6px">
            <input type="text" class="drs-url" placeholder="https:// … add a source" style="flex:1;min-width:150px" />
            <button class="drs-btn drs-addurl">Pin URL</button>
            <button class="drs-btn drs-addpaste">Paste…</button>
          </div>
          <div class="drs-paste" style="display:none;margin-top:6px">
            <input type="text" class="drs-paste-title" placeholder="Source title (e.g. 'City audit 2021, p.14')" style="margin-bottom:6px" />
            <textarea class="drs-paste-text" placeholder="Paste the source text…"></textarea>
            <div class="drs-row" style="margin-top:6px">
              <button class="drs-btn drs-paste-add">Add pasted source</button>
            </div>
          </div>
          <label style="margin-top:12px">How readily it flags gaps
            <select class="drs-alpha" style="margin-left:6px;font:inherit;border:1px solid #d7dbe2;border-radius:7px;padding:4px 6px;text-transform:none">
              <option value="0.01">flag more gaps</option>
              <option value="0.05" selected>balanced</option>
              <option value="0.15">flag fewer</option>
            </select>
          </label>
        </div>
      </div>
      <div class="drs-live" style="display:none">
        <div class="drs-settle-head"><span>How settled the picture is</span><span class="drs-settle-label"></span></div>
        <div class="drs-settle-bar"><div class="drs-settle-fill"></div></div>
        <div class="drs-status"><span class="drs-status-icon">◔</span><span class="drs-status-text"></span></div>
        <div class="drs-reading" style="display:none"><span class="drs-reading-spin"></span><div style="min-width:0;flex:1"><div class="drs-reading-title"></div><div class="drs-reading-sub"></div></div></div>
        <div class="drs-gap" style="display:none"></div>
        <div class="drs-audit" style="display:none"></div>
        <div class="drs-sec drs-sec-terms">Terms being researched</div>
        <div class="drs-terms"></div>
        <div class="drs-sec">The question, broken down</div>
        <div class="drs-subs"></div>
        <div class="drs-sec">Propositions found <span class="drs-sec-note">· each ties to a real quote</span></div>
        <div class="drs-finds"></div>
        <div class="drs-sec">Coverage so far</div>
        <div class="drs-cov"></div>
        <div class="drs-covnote drs-hint"></div>
      </div>
      <div class="drs-report-wrap" style="display:none">
        <div class="drs-row" style="justify-content:flex-end;margin-bottom:6px">
          <button class="drs-btn drs-dl">Download report</button>
          <button class="drs-btn drs-dl-log">Log (JSONL)</button>
        </div>
        <div class="drs-report-target"></div>
      </div>
    </div>
  `);
  el.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const srcList = $('.drs-srclist');
  const errBox = $('.drs-err');

  const showErr = (m) => { errBox.style.display = m ? '' : 'none'; errBox.textContent = m || ''; };

  const renderSources = () => {
    srcList.innerHTML = sources.length
      ? sources.map((s, i) => `<div class="drs-src"><span>📌</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.title || s.url || 'pasted text')}</span><span class="drs-hint">${(s.text || '').length.toLocaleString()} chars</span><button class="drs-x" data-i="${i}" title="Remove">✕</button></div>`).join('')
      : '<div class="drs-hint">No sources pinned yet. Add URLs or paste text — the corpus is pinned before it is read.</div>';
    srcList.querySelectorAll('.drs-x').forEach((b) => b.addEventListener('click', () => { sources.splice(+b.dataset.i, 1); renderSources(); }));
  };
  renderSources();

  if (opts.onClose) $('.drs-close').addEventListener('click', () => opts.onClose());

  $('.drs-addurl').addEventListener('click', async () => {
    const url = $('.drs-url').value.trim();
    if (!/^https?:\/\//.test(url)) return showErr('Enter a full http(s) URL.');
    showErr('');
    const btn = $('.drs-addurl');
    btn.disabled = true; btn.textContent = 'Fetching…';
    try {
      sources.push(await fetchPage(url));
      $('.drs-url').value = '';
      renderSources();
    } catch (e) { showErr(`Could not fetch ${url}: ${e.message}. Paste its text instead — the pin still records the hash.`); }
    btn.disabled = false; btn.textContent = 'Pin URL';
  });
  $('.drs-addpaste').addEventListener('click', () => {
    const p = $('.drs-paste');
    p.style.display = p.style.display === 'none' ? '' : 'none';
  });
  $('.drs-paste-add').addEventListener('click', () => {
    const text = $('.drs-paste-text').value.trim();
    if (text.length < 40) return showErr('Pasted source is too short to ground anything.');
    sources.push({ title: $('.drs-paste-title').value.trim() || null, text });
    $('.drs-paste-text').value = ''; $('.drs-paste-title').value = '';
    $('.drs-paste').style.display = 'none';
    showErr('');
    renderSources();
  });

  // The segmented controls (how much · how to look) and the Advanced disclosure.
  // The run never PARKS on a modal — it does not stop and wait for an answer. The
  // one question it may raise up front, "which sense of an ambiguous subject did
  // you mean?", surfaces as a non-blocking OFFER card (syncClarify below): the
  // research is already under way on the best guess, and the card just lets the
  // user redirect it. Every other question it raises stays READ-ONLY in the
  // report's "what to check next" band.
  const segValue = (group) => $(`.drs-seg[data-group="${group}"] button.on`)?.dataset.value;
  root.querySelectorAll('.drs-seg').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('.drs-adv-toggle').addEventListener('click', () => {
    const adv = $('.drs-adv');
    adv.hidden = !adv.hidden;
    $('.drs-adv-toggle').textContent = (adv.hidden ? '＋' : '－') + ' Add your own sources or sub-questions';
  });

  const paintLive = (log) => {
    const v = liveView(log);
    const lab = $('.drs-settle-label'); lab.textContent = v.settle.label; lab.style.color = v.settle.color;
    const fill = $('.drs-settle-fill'); fill.style.width = v.settle.pct + '%'; fill.style.background = v.settle.color;
    $('.drs-status-text').textContent = v.statusText;
    const si = $('.drs-status-icon'); si.textContent = v.phase === 'done' ? '✓' : '◔'; si.style.color = v.phase === 'done' ? '#15803d' : '#5b34d6';
    // now reading — the current source, not an id
    const rd = $('.drs-reading');
    if (v.reading) { rd.style.display = ''; $('.drs-reading-title').textContent = v.reading.title; $('.drs-reading-sub').textContent = v.reading.host + ' · ' + v.reading.note; }
    else rd.style.display = 'none';
    // state A — nothing grounded yet: the gap is the door.
    const gapEl = $('.drs-gap');
    if (v.gap) {
      gapEl.style.display = '';
      gapEl.innerHTML = `<div class="drs-gap-tag">Nothing here answers this</div>`
        + `<div class="drs-gap-q">${esc(v.gap.question)}</div>`
        + `<div class="drs-gap-note">${esc(v.gap.note)} These sources cannot settle it.</div>`;
    } else gapEl.style.display = 'none';
    // the search, audited — the three numbers that make this more than a search
    // box: how many searches went looking to be wrong, kept vs. thrown out, and
    // the stopping rule you can watch approach.
    const auditEl = $('.drs-audit');
    const a = v.searchAudit;
    if (a && a.total) {
      auditEl.style.display = '';
      const stop = v.stopRule;
      const stopLine = stop && stop.docGains.length
        ? (stop.willStopIn === 0
            ? 'Two quiet documents in a row — the picture has stopped moving.'
            : `${stop.willStopIn} more quiet document${stop.willStopIn === 1 ? '' : 's'} and it stops on its own.`)
        : '';
      auditEl.innerHTML =
        `<div class="drs-audit-big"><b>${a.disprove}</b> of <b>${a.total}</b> searches trying to prove the story <em>wrong</em></div>`
        + `<div class="drs-audit-sub">${a.disprove ? '' : 'None are — this is a search for agreement, and it will find some. '}`
        + `${v.documents.kept} kept · ${v.documents.setAside} set aside${v.documents.thrown ? ` · ${v.documents.thrown} thrown out` : ''}`
        + `${a.disproveFound ? ` · ${a.disproveFound} disproof search${a.disproveFound === 1 ? '' : 'es'} found something` : ''}</div>`
        + (stopLine ? `<div class="drs-audit-stop">${esc(stopLine)}</div>` : '');
    } else auditEl.style.display = 'none';
    // terms being researched — the load-bearing terms each frame reads against;
    // the ones the active frame is chasing right now are filled solid.
    const termsSec = $('.drs-sec-terms'); const termsBox = $('.drs-terms');
    if (v.terms && v.terms.length) {
      if (termsSec) termsSec.style.display = '';
      termsBox.style.display = '';
      termsBox.innerHTML = v.terms.map((t) => `<span class="drs-term${t.active ? ' on' : ''}">${esc(t.text)}</span>`).join('');
    } else { if (termsSec) termsSec.style.display = 'none'; termsBox.style.display = 'none'; }
    // the question, broken down
    $('.drs-subs').innerHTML = v.subs.map((s) => {
      const mark = s.state === 'done' ? '<span class="drs-sub-done">✓</span>' : s.state === 'reading' ? '<span class="drs-sub-spin"></span>' : '<span class="drs-sub-dot"></span>';
      return `<div class="drs-sub"><span class="drs-sub-mark">${mark}</span><span class="drs-sub-t${s.state === 'queued' ? ' q' : ''}">${esc(s.text)}</span><span class="drs-sub-st">${s.state === 'reading' ? 'reading…' : s.state}</span></div>`;
    }).join('') || '<div class="drs-hint">planning the lines of inquiry…</div>';
    // what it's found — real findings tied to real sources; off-topic set aside (amber)
    $('.drs-finds').innerHTML = v.findings.map((f) =>
      `<div class="drs-find${f.warn ? ' warn' : ''}"><span class="drs-find-i">${f.icon}</span><div style="min-width:0;flex:1"><div class="drs-find-t">${esc(f.text)}</div>${f.host ? `<div class="drs-find-h">${esc(f.host)}</div>` : ''}</div></div>`).join('') || '<div class="drs-hint">nothing read yet — starting the crawl…</div>';
    // coverage tiles (the plain-language grid)
    const covColor = { ink: '#1b1f24', ink2: '#5a626d', ink3: '#9aa1ab', grn: '#15803d', amb: '#b45309', acc: '#5b34d6' };
    $('.drs-cov').innerHTML = v.coverage.map((c) =>
      `<div class="drs-cov-cell ${c.tone === 'grn' ? 'grn' : c.tone === 'amb' ? 'amb' : c.tone === 'acc' ? 'acc' : ''}"><div class="drs-cov-v" style="color:${covColor[c.tone] || '#1b1f24'}">${esc(String(c.value))}</div><div class="drs-cov-l">${esc(c.label)}</div></div>`).join('');
    $('.drs-covnote').textContent = v.coverageNote;
  };

  // The live tether: anything that appends to the session's log — this panel's
  // Run button OR a research ask from the host's chat — repaints the live view
  // event by event, and re-projects the report when the run settles. The
  // surface adjusts because the report is a projection, not a saved artifact.
  const paintReport = () => {
    if (!session.log.length) return;
    $('.drs-report-target').innerHTML =
      renderReportFragment(session.report()) + renderTraceFragment(session.log);
    $('.drs-report-wrap').style.display = '';
  };
  // Once a run is under way the ask box collapses to just its question line + the
  // Research button (re-asking stays one click away), so the live read owns the
  // panel's height instead of a tall setup form sitting above it.
  const enterRun = () => { const b = $('.drs-ask-box'); if (b) b.classList.add('running'); };

  // ── One research run, from the panel OR from the clarification popup ─────────
  // `clarify` is on for the user's typed question (so a homonym gets the offer) and
  // OFF when the run IS the user resolving a homonym — they already chose, so the
  // refocused run must not turn round and ask again.
  // Safe to call while a run is in flight: session.research serializes, so a refocus
  // chosen mid-run queues behind the best-guess run rather than racing it.
  const startResearch = async (question, { clarify = true } = {}) => {
    const q = String(question || '').trim();
    if (!q) return;
    showErr('');
    const runBtn = $('.drs-run');
    runBtn.disabled = true; runBtn.textContent = 'Researching…';
    enterRun(); $('.drs-live').style.display = '';
    const subQuestions = $('.drs-subqs').value.split('\n').map((s) => s.trim()).filter(Boolean);
    try {
      await session.research(q, {
        // The gather-to-target loop: the size preset sets how much to gather, the
        // strategy shapes the search, and `search` is what lets it widen past the
        // sources you pinned by hand. No search → it stands on your own sources.
        sources: sources.map((s) => ({ ...s })),
        subQuestions,
        size: segValue('size') || 'standard',
        strategy: segValue('strategy') || 'holonic',
        search,
        model: opts.model || null,
        // The sense thumb: with a talker connected, let the run notice a homonym
        // subject and surface ONE up-front clarification (driver.js maybeAskDisambiguate).
        // No model → null → the run never asks, exactly as before.
        disambiguate: opts.model?.phrase ? modelDisambiguator(opts.model, { question: q }) : null,
        clarify,
        fetch: netFetch,
        now: () => Date.now(),
        alpha: parseFloat($('.drs-alpha').value) || 0.05,
      });
      $('.drs-q').value = '';
    } catch (e) {
      showErr('Run failed: ' + (e?.message || e));
    }
    runBtn.disabled = false; runBtn.textContent = 'Research';
  };

  // ── The clarification popup — an offer to refocus, never a gate ──────────────
  // When the run logs a "which sense did you mean?" ask (a homonym subject), pop a
  // card with each sense as a button PLUS a free field to type exactly what to
  // research. It never blocks: the research is already running on the best guess,
  // and the card only redirects it. Picking the sense already chosen (the first,
  // marked ✓) just dismisses; a different sense or typed text starts a focused
  // re-run (clarify off, so it doesn't re-ask). Acted-on asks are remembered so
  // the same card never re-pops.
  const resolvedAsks = new Set();
  let clarifyEl = null, clarifyAskId = null;
  const hideClarify = () => { if (clarifyEl) clarifyEl.remove(); clarifyEl = null; clarifyAskId = null; };
  const showClarify = (ask, question) => {
    if (clarifyAskId === ask.id) return;              // already offering this one
    hideClarify();
    clarifyAskId = ask.id;
    const options = ask.options || [];
    const el = document.createElement('div');
    el.className = 'drs-clarify';
    el.innerHTML = `
      <div class="drs-clarify-head">
        <span class="drs-clarify-icon">◑</span>
        <span class="drs-clarify-text">${esc(ask.text)}</span>
        <button class="drs-clarify-x" title="Dismiss — keep going as is">✕</button>
      </div>
      <div class="drs-clarify-opts">
        ${options.map((o, i) => `<button class="drs-clarify-opt${i === 0 ? ' cur' : ''}" data-i="${i}">${i === 0 ? '✓ ' : '⟳ '}${esc(o)}</button>`).join('')}
      </div>
      <div class="drs-clarify-or">…or tell me exactly what to research</div>
      <div class="drs-clarify-row">
        <input type="text" class="drs-clarify-in" placeholder="e.g. bottlenose dolphin social behaviour" />
        <button class="drs-clarify-go">Research this</button>
      </div>`;
    const body = $('.drs-body');
    body.insertBefore(el, body.firstChild);
    clarifyEl = el;
    // resolve(next) → mark this ask acted-on, close the card, and (if given) start a
    // focused re-run. Called by every path: an option, the typed field, the ✕.
    const resolve = (next) => {
      resolvedAsks.add(ask.id);
      hideClarify();
      if (next) startResearch(next, { clarify: false });
    };
    el.querySelectorAll('.drs-clarify-opt').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      // The first option is the sense the run already chose — confirming it is a
      // no-op; any other sense refocuses onto "<subject> <that sense>".
      resolve(i === 0 ? null : refocusQuery(question, options[i]));
    }));
    const submit = () => { const v = el.querySelector('.drs-clarify-in').value.trim(); if (v) resolve(v); };
    el.querySelector('.drs-clarify-go').addEventListener('click', submit);
    el.querySelector('.drs-clarify-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    el.querySelector('.drs-clarify-x').addEventListener('click', () => resolve(null));
  };
  // syncClarify(log) → show the newest unanswered, un-resolved disambiguate ask, or
  // hide the card if there is none. The "which card" decision is the pure
  // pendingClarification fold (session.js); this only reflects it into the DOM.
  const syncClarify = (log) => {
    const pending = pendingClarification(log, resolvedAsks);
    if (!pending) return hideClarify();
    showClarify(pending.ask, pending.question);
  };

  const unsubscribe = session.subscribe((log, event) => {
    if (event) { enterRun(); $('.drs-live').style.display = ''; paintLive(log); }
    else if (!session.running) { enterRun(); paintReport(); }
    syncClarify(log);
  });
  if (session.log.length) { enterRun(); $('.drs-live').style.display = ''; paintReport(); syncClarify(session.log); }

  $('.drs-run').addEventListener('click', () => {
    if (session.running) return;
    const q = $('.drs-q').value.trim();
    if (!q) return showErr('A research question first.');
    startResearch(q);
  });

  const download = (name, content, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $('.drs-dl').addEventListener('click', () => {
    if (!session.log.length) return;
    download('deep-research-report.html', renderReportHTML(session.report(), { log: session.log }), 'text/html');
  });
  $('.drs-dl-log').addEventListener('click', () => {
    if (!session.log.length) return;
    download('deep-research-log.jsonl', session.exportJSONL(), 'application/x-ndjson');
  });

  return { destroy: () => { unsubscribe(); root.remove(); }, session };
};
