// EO: INS·EVA(Lens → Entity,Lens, Making,Tracing) — run generated code, read back the verdict
// sandbox-run.js — the Code tab's verify step. This is the "run it and see"
// half of a plan → generate → run → observe → fix loop: a model-written
// document is mounted in the SAME sandboxed-iframe machinery the Facing
// renderer already uses (src/rooms/render/facing.js — runnableSrcdoc, the
// console-capture shim), off-screen and headless, and its console/error
// stream is read back as a typed verdict. No new sandbox is invented; this
// is that one reused for a different caller (an automated loop instead of a
// person watching a preview pane).
//
// Security posture is identical to the visible renderer: `sandbox="allow-
// scripts"`, deliberately WITHOUT `allow-same-origin` — a `srcdoc` iframe
// under that combination gets an opaque origin, so the generated code (which
// may be wrong, and is never trusted) cannot reach this page's DOM,
// localStorage, or cookies, whatever it does inside its own frame.

import { runnableSrcdoc, consoleLineOf } from '../render/index.js';

const DEFAULT_TIMEOUT_MS = 6000;   // hard ceiling — a hung script still resolves the verify step
const DEFAULT_SETTLE_MS = 700;     // quiet period after the last console/error line before we call it done

// runInSandbox(source, opts) -> Promise<{ ok, logs, errors }>
//   source   anything runnableSrcdoc accepts — a full HTML string, an HTML
//            fragment, or a { html, css, js } triple
//   logs     every console/error line the shim captured, in order
//   errors   the subset at level 'error' (console.error, window.onerror,
//            an unhandled rejection) — `ok` is exactly `errors.length === 0`
//
// Resolves, never rejects: a sandboxed iframe that never posts anything
// (a clean, silent success) still resolves ok after one quiet settle window,
// and a script that hangs forever still resolves at the hard timeout rather
// than leaving the caller's loop stuck.
export const runInSandbox = (source, { timeoutMs = DEFAULT_TIMEOUT_MS, settleMs = DEFAULT_SETTLE_MS } = {}) =>
  new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve({ ok: true, logs: [], errors: [] }); return; }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.title = 'generation sandbox (headless)';
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';

    const logs = [];
    let done = false;
    let settleTimer = null;
    let hardTimer = null;

    const cleanup = () => {
      window.removeEventListener('message', onMsg);
      clearTimeout(settleTimer);
      clearTimeout(hardTimer);
      iframe.remove();
    };
    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      const errors = logs.filter((l) => l.level === 'error');
      resolve({ ok: errors.length === 0, logs, errors });
    };
    const armSettle = () => { clearTimeout(settleTimer); settleTimer = setTimeout(finish, settleMs); };

    const onMsg = (ev) => {
      if (ev.source !== iframe.contentWindow) return;   // not this run's frame — ignore
      const line = consoleLineOf(ev.data);
      if (!line) return;
      if (line.level !== 'ready') logs.push(line);
      armSettle();   // every line (including 'ready') resets the quiet-period clock
    };

    window.addEventListener('message', onMsg);
    hardTimer = setTimeout(finish, timeoutMs);
    document.body.appendChild(iframe);
    iframe.srcdoc = runnableSrcdoc(source);
    armSettle();   // arm even before the shim's 'ready' — a doc with no script at all still settles
  });
