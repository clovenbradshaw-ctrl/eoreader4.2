// EO: SYN·EVA(Lens,Network → Network,Lens, Composing,Tracing) — the Code tab
// code-panel.js — the Code tab's markup and its three actions (plan,
// generate, and the copy/download pair on the result). Split out of
// surface.js on the same discipline as write-panel.js/build-panel.js; the
// loop itself (plan → generate → sandbox-verify → fix) lives in codewrite.js,
// this file only paints it and drives the live preview iframe.

import { planCode, generateAndVerify, MAX_ATTEMPTS } from './codewrite.js';
import { runnableSrcdoc } from '../render/index.js';
import { esc, oneLine } from './util.js';

const planCardHtml = (plan) => `
  <div class="gen-field" style="margin-top:16px">
    <label class="gen-label">Plan</label>
    <div class="gen-plan">
      ${plan.summary ? `<p>${esc(plan.summary)}</p>` : ''}
      <ul>${plan.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      ${plan.checks.length ? `<div class="gen-hint">Proves it works: ${plan.checks.map(esc).join(' · ')}</div>` : ''}
    </div>
  </div>`;

const attemptLineHtml = (a, i) => {
  const n = a.verify.errors.length;
  const detail = a.verify.ok ? 'ran clean' : `${n} error${n === 1 ? '' : 's'} — ${esc(a.verify.errors[0]?.text || '')}`;
  return `<div>attempt ${i + 1}: ${detail}</div>`;
};

const finalHtml = (final) => `
  <div class="gen-out">
    <h2>Result</h2>
    ${final.verify.ok
      ? '<div class="gen-ok">ran clean in the sandbox — no console errors</div>'
      : `<div class="gen-err">${final.verify.errors.length} error(s) remain after ${MAX_ATTEMPTS} attempt(s) — shown below, honestly, never hidden</div>`}
    <iframe class="gen-preview" id="gen-code-preview" sandbox="allow-scripts allow-modals allow-popups" title="live preview"></iframe>
    <div class="gen-row">
      <button class="gen-copy" data-act="code-copy">Copy code</button>
      <button class="gen-copy" data-act="code-download">Download .html</button>
    </div>
    <pre class="gen-code">${esc(final.code)}</pre>
    ${!final.verify.ok ? `<div class="gen-report">${final.verify.errors.map((e) => esc(e.text)).join('\n')}</div>` : ''}
  </div>`;

export const codeHtml = (c) => `
  <div class="gen-panel">
    <div class="gen-field">
      <label class="gen-label">What should it build?</label>
      <textarea id="gen-code-task" style="min-height:90px" placeholder="e.g. a pomodoro timer with start/pause/reset and a session counter">${esc(c.task ?? '')}</textarea>
      <div class="gen-hint">Plan first — a short checklist you can read before any code is written. Generate then writes one self-contained document, runs it in a sandboxed frame, and corrects itself against real console errors up to ${MAX_ATTEMPTS} times.</div>
    </div>
    <div class="gen-row">
      <button class="primary" data-act="code-plan" ${c.planBusy ? 'disabled' : ''}>${c.planBusy ? 'Planning…' : (c.plan ? 'Re-plan' : 'Plan')}</button>
      ${c.plan ? `<button class="primary" data-act="code-generate" ${c.genBusy ? 'disabled' : ''}>${c.genBusy ? 'Writing…' : 'Generate'}</button>` : ''}
    </div>
    ${c.planError ? `<div class="gen-err">${esc(c.planError)}</div>` : ''}
    ${c.genError ? `<div class="gen-err">${esc(c.genError)}</div>` : ''}
    ${c.plan ? planCardHtml(c.plan) : ''}
    ${c.attempts.length ? `<div class="gen-log">${c.attempts.map(attemptLineHtml).join('')}</div>` : ''}
  </div>
  ${c.final ? finalHtml(c.final) : ''}`;

// createCodePanel(ctx) -> { runPlan, runGenerate, copyCode, downloadCode, paintPreview }
export const createCodePanel = (ctx) => {
  const { st, byId, render, ensureModel } = ctx;

  const runPlan = async () => {
    const c = st.code;
    c.task = byId('gen-code-task')?.value || '';
    c.planBusy = true; c.planError = null; c.plan = null; c.attempts = []; c.final = null;
    render();
    try {
      const model = await ensureModel();
      const { plan, error } = await planCode({ task: c.task, model });
      c.plan = plan; c.planError = error;
    } catch (err) {
      c.planError = oneLine(err);
    } finally {
      c.planBusy = false; render();
    }
  };

  const runGenerate = async () => {
    const c = st.code;
    c.genBusy = true; c.genError = null; c.attempts = []; c.final = null;
    render();
    try {
      const model = await ensureModel();
      const { final } = await generateAndVerify({
        task: c.task, plan: c.plan, model,
        // Each attempt is a full model round-trip — at most MAX_ATTEMPTS of
        // them, so a full re-render per attempt (rather than a DOM patch) is
        // cheap here, unlike the Write tab's much-higher-frequency event log.
        onAttempt: (a) => { c.attempts = [...c.attempts, a]; render(); },
      });
      c.final = final;
    } catch (err) {
      c.genError = oneLine(err);
    } finally {
      c.genBusy = false; render();
    }
  };

  const copyCode = () => {
    const text = st.code.final?.code || '';
    try { navigator.clipboard?.writeText?.(text); } catch { /* clipboard denied — no worse than before */ }
  };

  const downloadCode = () => {
    const text = st.code.final?.code || '';
    if (!text || typeof document === 'undefined') return;
    const blob = new Blob([text], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'generated.html';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  // A full render() rebuilds shell.innerHTML, which wipes any srcdoc a prior
  // paint set — so the live preview is repainted after every render call
  // rather than once at generation's end. Reading `final.code` back out of
  // state (not re-fetching) keeps this idempotent no matter how often it runs.
  const paintPreview = () => {
    const final = st.code.final;
    const el = byId('gen-code-preview');
    if (!el || !final) return;
    el.srcdoc = runnableSrcdoc(final.code);
  };

  return { runPlan, runGenerate, copyCode, downloadCode, paintPreview };
};
