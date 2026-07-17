// EO: SYN·EVA(Network,Lens → Lens,Network, Composing,Tracing) — the Build tab
// build-panel.js — the Build tab's markup and its two actions (propose,
// build). Split out of surface.js to keep every file in this room under the
// tree's own god-module line; see write-panel.js for the same split on the
// Write side.

import { proposeIntents, runFromIntents } from './codegen.js';
import { CATALOG, SURFACE_NAMES, reportCatalogGaps } from '../../coder/index.js';
import { esc, oneLine } from './util.js';

const catalogHtml = () => SURFACE_NAMES
  .map((name) => `<span class="gen-chip" title="home: ${esc(CATALOG[name].home.join(', '))}">${esc(name)}</span>`)
  .join('');

export const buildHtml = (b) => `
  <div class="gen-panel">
    <div class="gen-field">
      <label class="gen-label">What should it build?</label>
      <textarea id="gen-task" style="min-height:90px" placeholder="e.g. a board for tracking cases, with a table view of the same entities">${esc(b.task ?? '')}</textarea>
      <div class="gen-hint">One model call proposes a small set of EOT intents from a closed vocabulary — the catalog below is all it may build from. Review the JSON before running it.</div>
      <div class="gen-catalog">${catalogHtml()}</div>
    </div>
    <div class="gen-row">
      <button class="primary" data-act="build-propose" ${b.busy ? 'disabled' : ''}>${b.busy ? 'Proposing…' : 'Propose'}</button>
    </div>
    ${b.error ? `<div class="gen-err">${esc(b.error)}</div>` : ''}
    ${b.intentsJson ? intentsEditorHtml(b) : ''}
    ${b.buildResult ? buildResultHtml(b.buildResult) : ''}
  </div>`;

const intentsEditorHtml = (b) => `
  <div class="gen-field" style="margin-top:16px">
    <label class="gen-label">Proposed intents ${b.dropped ? `— ${b.dropped} entr${b.dropped === 1 ? 'y' : 'ies'} dropped as unparseable` : ''}</label>
    <textarea id="gen-intents" style="min-height:200px">${esc(b.intentsJson)}</textarea>
    <div class="gen-row">
      <button class="primary" data-act="build-run">Build</button>
    </div>
  </div>`;

const buildResultHtml = (out) => {
  // The ledger's verdict entries carry findings as "error@address" strings
  // (ledger.js recordVerdict) — split them back into the shape
  // reportCatalogGaps reads, so the backlog is drawn from the SAME chain the
  // build report itself prints, not a second parallel bookkeeping.
  const findings = out.ledger.entries()
    .filter((e) => e.kind === 'verdict')
    .flatMap((e) => e.errors.map((s) => {
      const at = s.lastIndexOf('@');
      return { error: s.slice(0, at), address: s.slice(at + 1) };
    }));
  const gaps = reportCatalogGaps(findings);
  return `
    <div class="gen-out">
      <h2>Build report</h2>
      ${out.ok ? `<div class="gen-ok">shipped clean — ${out.provisioned.instances.length} instance(s), ${out.provisioned.rooms.length} room(s)</div>` : `<div class="gen-err">${out.vetoes.length} vetoed set-down(s) — nothing downstream of them was provisioned</div>`}
      <div class="gen-report">${esc(out.report)}</div>
      ${gaps.length ? `<div class="gen-hint" style="margin-top:10px">catalog gaps reached for: ${gaps.map((g) => `${esc(g.surface)} (×${g.requests})`).join(', ')}</div>` : ''}
    </div>`;
};

// createBuildPanel(ctx) -> { runPropose, runBuild } — the Build tab's two
// data-act handlers, closed over the shared state/DOM/model-connect ctx.
export const createBuildPanel = (ctx) => {
  const { st, byId, render, ensureModel } = ctx;

  const runPropose = async () => {
    const b = st.build;
    b.task = byId('gen-task')?.value || '';
    b.busy = true; b.error = null; b.intentsJson = ''; b.buildResult = null;
    render();
    try {
      const model = await ensureModel();
      const { intents, dropped, error, raw } = await proposeIntents({ task: b.task, model });
      if (error) { b.error = error; b.intentsJson = raw; }
      else { b.dropped = dropped; b.intentsJson = JSON.stringify(intents, null, 2); }
    } catch (err) {
      b.error = oneLine(err);
    } finally {
      b.busy = false; render();
    }
  };

  const runBuild = () => {
    const b = st.build;
    const raw = byId('gen-intents')?.value || '';
    let intents;
    try { intents = JSON.parse(raw); } catch { b.error = 'the edited JSON does not parse'; return render(); }
    if (!Array.isArray(intents)) { b.error = 'the intents must be a JSON array'; return render(); }
    b.error = null;
    b.intentsJson = raw;
    b.buildResult = runFromIntents(intents);
    render();
  };

  return { runPropose, runBuild };
};
