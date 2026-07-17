// EO: SYN·EVA(Field,Network → Network,Lens, Composing,Tracing) — the Write tab
// write-panel.js — the Write tab's markup and its two actions (generate, copy).
// Split out of surface.js to keep every file in this room under the tree's
// own god-module line; the shared mutable pieces (state, a DOM lookup, the
// re-render, the model connector) ride in as `ctx` rather than each function
// threading its own copy of them.

import { runLongform, describeEvent } from './longform.js';
import { esc, oneLine } from './util.js';

const SECTION_TONE = { accepted: 'var(--ok)', pending: 'var(--dim)', exploring: 'var(--warn)', consolidating: 'var(--warn)' };

export const writeHtml = (w) => `
  <div class="gen-panel">
    <div class="gen-field">
      <label class="gen-label">Thesis</label>
      <input id="gen-thesis" placeholder="The one claim the whole piece argues" value="${esc(w.thesis ?? '')}" />
    </div>
    <div class="gen-field">
      <label class="gen-label">Outline — one section topic per line (optional)</label>
      <textarea id="gen-outline" style="min-height:64px" placeholder="Leave blank for a single open section the driver may still grow">${esc(w.outline ?? '')}</textarea>
    </div>
    <div class="gen-field">
      <label class="gen-label">Source material</label>
      <textarea id="gen-source" style="min-height:220px" placeholder="Paste the notes, transcript, or draft this piece should be built from — every claim in the output traces back to a line in here.">${esc(w.sourceText ?? '')}</textarea>
      <div class="gen-hint">Nothing renders without a source: the driver binds every kept claim to a span here and vetoes the rest, so an empty box means an honest, empty section rather than an invented one.</div>
    </div>
    <div class="gen-row">
      <button class="primary" data-act="write-run" ${w.busy ? 'disabled' : ''}>${w.busy ? 'Writing…' : 'Generate'}</button>
    </div>
    ${w.error ? `<div class="gen-err">${esc(w.error)}</div>` : ''}
    ${w.log.length ? `<div class="gen-log" id="gen-log">${w.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div>` : ''}
  </div>
  ${w.result ? writeResultHtml(w.result) : ''}`;

export const writeResultHtml = (res) => {
  const secs = res.report?.sections || [];
  return `
    <div class="gen-out">
      <h2>Essay</h2>
      <div class="gen-prose">${esc(res.essay || '(nothing bound — try more source material, or a narrower thesis)')}</div>
      <button class="gen-copy" data-act="write-copy">Copy text</button>
      <div class="gen-sections">
        ${secs.map((s) => `<div class="gen-sec"><span class="gen-badge" style="color:${SECTION_TONE[s.state] || 'var(--dim)'};border-color:${SECTION_TONE[s.state] || 'var(--dim)'}">${esc(s.state)}</span><b>${esc(s.intent)}</b><span>· ${s.commitments.length} commitment${s.commitments.length === 1 ? '' : 's'}</span></div>`).join('')}
      </div>
      ${res.report?.findings?.length ? `<div class="gen-hint" style="margin-top:10px">${res.report.findings.length} reconcile finding(s) — see the log above for detail.</div>` : ''}
    </div>`;
};

// createWritePanel(ctx) -> { runWrite, copyEssay } — the Write tab's two
// data-act handlers, closed over the shared state/DOM/model-connect ctx.
export const createWritePanel = (ctx) => {
  const { st, byId, render, ensureModel } = ctx;

  // The log grows many times a second across a multi-section essay — patch
  // its DOM directly rather than re-rendering the whole shell, the same
  // discipline models/surface.js uses for its download progress bar.
  const paintLog = () => {
    const el = byId('gen-log');
    if (!el) return;
    el.innerHTML = st.write.log.map((l) => `<div>${esc(l)}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  };

  const runWrite = async () => {
    const w = st.write;
    w.thesis = byId('gen-thesis')?.value || '';
    w.outline = byId('gen-outline')?.value || '';
    w.sourceText = byId('gen-source')?.value || '';
    w.busy = true; w.error = null; w.log = []; w.result = null;
    render();
    try {
      const model = await ensureModel();
      w.result = await runLongform({
        thesis: w.thesis, sourceText: w.sourceText, outline: w.outline, model,
        onEvent: (e) => { w.log.push(describeEvent(e)); paintLog(); },
      });
    } catch (err) {
      w.error = oneLine(err);
    } finally {
      w.busy = false; render();
    }
  };

  const copyEssay = () => {
    const text = st.write.result?.essay || '';
    try { navigator.clipboard?.writeText?.(text); } catch { /* clipboard denied — no worse than before */ }
  };

  return { runWrite, copyEssay };
};
