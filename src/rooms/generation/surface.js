// EO: INS·NUL(Field → Entity,Void, Making,Clearing) — the generation room DOM surface
// surface.js — the Generation room: three modes over the one leaf-model
// discipline (docs/model-as-contracted-part.md, the wired-in-a-frontier-model
// essay). Write (write-panel.js) drives weave/essay's runEssay over pasted
// source material — a grounded, multi-section piece, the model spent only
// rendering commitments the driver already chose. Build (build-panel.js)
// drives src/coder's build() over a model-proposed set of EOT intents — the
// model spent only naming which catalog surfaces to compose, the mask ·
// checkpoint · repair · ledger disposing exactly as they do in the test
// suite. Code (code-panel.js) is the Claude-Code-shaped loop scoped to what a
// browser tab can actually prove: plan → write one self-contained document →
// run it in a sandboxed frame (sandbox-run.js) → correct it against real
// observed errors, capped. Framework-free, like rooms/models/surface.js: one
// shell, full re-render on structural change, direct DOM reads for free-text
// fields so a re-render never steals focus out of a textarea.

import { connectModel, activeBackendName } from './model-connect.js';
import { writeHtml, createWritePanel } from './write-panel.js';
import { buildHtml, createBuildPanel } from './build-panel.js';
import { codeHtml, createCodePanel } from './code-panel.js';
import { CSS } from './styles.js';
import { esc, oneLine } from './util.js';

export function mountGenerationSurface(root, { connect = connectModel } = {}) {
  const st = {
    tab: 'write',
    model: null, modelDesc: null, modelBusy: false, modelError: null,
    write: { busy: false, error: null, log: [], result: null },
    build: { busy: false, error: null, dropped: 0, raw: '', intentsJson: '', buildResult: null },
    code: { task: '', planBusy: false, planError: null, plan: null, genBusy: false, genError: null, attempts: [], final: null },
  };

  const shell = document.createElement('div');
  shell.className = 'gen';
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);
  root.appendChild(shell);

  const byId = (id) => shell.querySelector('#' + id);

  const ensureModel = async () => {
    if (st.model) return st.model;
    st.modelBusy = true; st.modelError = null; render();
    try {
      const { model, description } = await connect();
      st.model = model; st.modelDesc = description;
      return model;
    } catch (err) {
      st.modelError = oneLine(err);
      throw err;
    } finally {
      st.modelBusy = false; render();
    }
  };

  const ctx = { st, byId, render: () => render(), ensureModel };
  const write = createWritePanel(ctx);
  const build = createBuildPanel(ctx);
  const code = createCodePanel(ctx);

  const PANELS = { write: () => writeHtml(st.write), build: () => buildHtml(st.build), code: () => codeHtml(st.code) };

  // ── render ─────────────────────────────────────────────────────────────────
  function render() {
    shell.innerHTML = `
      ${heroHtml()}
      <div class="gen-body">${PANELS[st.tab]()}</div>`;
    bind();
    if (st.tab === 'code') code.paintPreview();
  }

  const modelDotColor = () => (st.modelError ? 'var(--bad)' : st.model ? 'var(--ok)' : 'var(--dim)');
  const modelLabel = () => {
    if (st.modelBusy) return 'connecting…';
    if (st.modelError) return st.modelError;
    if (st.modelDesc) return st.modelDesc.label || st.modelDesc.model || st.modelDesc.backend;
    const pref = activeBackendName();
    return pref && pref !== 'none' ? `${pref} — not connected yet` : 'no model picked';
  };

  const heroHtml = () => `
    <header class="gen-hero"><div class="gen-hero-inner">
      <div class="gen-eyebrow">Generation</div>
      <h1 class="gen-h1">Write long-form, build small apps and real code.</h1>
      <p class="gen-sub">The model is a leaf, not the context: Write grounds every claim in material you paste and spends the model only rendering the commitments the driver already chose; Build spends one call proposing which catalog surfaces to compose, then the coder's own mask · checkpoint · repair · ledger decide the rest; Code plans first, then writes, RUNS, and self-corrects a document against the errors it actually produced.</p>
      <div class="gen-model">
        <span class="gen-dot" style="background:${modelDotColor()}"></span>
        <span>${esc(modelLabel())}</span>
        <span style="flex:1"></span>
        <a href="models.html" target="_blank" rel="noopener">Models ↗</a>
      </div>
      <div class="gen-tabs">
        <button class="gen-tab ${st.tab === 'write' ? 'on' : ''}" data-act="tab" data-id="write">Write</button>
        <button class="gen-tab ${st.tab === 'build' ? 'on' : ''}" data-act="tab" data-id="build">Build</button>
        <button class="gen-tab ${st.tab === 'code' ? 'on' : ''}" data-act="tab" data-id="code">Code</button>
      </div>
    </div></header>`;

  // ── actions ──────────────────────────────────────────────────────────────
  const onAct = (act, id) => {
    switch (act) {
      case 'tab': st.tab = id; return render();
      case 'write-run': return write.runWrite();
      case 'write-copy': return write.copyEssay();
      case 'build-propose': return build.runPropose();
      case 'build-run': return build.runBuild();
      case 'code-plan': return code.runPlan();
      case 'code-generate': return code.runGenerate();
      case 'code-copy': return code.copyCode();
      case 'code-download': return code.downloadCode();
      default: return undefined;
    }
  };

  const bind = () => {
    shell.querySelectorAll('[data-act]').forEach((el) => {
      el.addEventListener('click', () => onAct(el.dataset.act, el.dataset.id));
    });
  };

  render();
  return { destroy: () => { root.innerHTML = ''; } };
}
