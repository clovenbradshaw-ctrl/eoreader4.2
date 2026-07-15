// EO: INS·NUL(Network → Lens,Void, Making,Clearing) — the Rashomon DOM surface
// surface.js — the whole Rashomon interface, framework-free so it drops into a standalone page
// or a panel (the reader's Rashomon tab). It reads the reader session's real folds through one
// membrane — app.rashomonCandidates / rashomonSource / rashomonTopic — and paints the diff of
// two figures' universes: where they agree, where they conflict, where they see one thing two
// ways, and what each names alone. The surface computes nothing; every judgment is the engine's.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
.rz{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36;
  --accent:#7bd0ff;--a:#5aa9e6;--b:#e0a24a;--agree:#5ecb8f;--clash:#e0655a;--void:#b98bff;
  --mono:'SFMono-Regular',ui-monospace,Menlo,Consolas,monospace;--sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.55;display:flex;flex-direction:column;height:100%;min-height:0}
@media (prefers-color-scheme:light){.rz{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec}}
:root[data-theme="light"] .rz{--bg:#f4f6fa;--panel:#fff;--panel2:#eef1f6;--ink:#141821;--dim:#5a6474;--line:#dde3ec}
:root[data-theme="dark"] .rz{--bg:#0c0e12;--panel:#14171e;--panel2:#1b1f28;--ink:#e7ecf3;--dim:#8b93a2;--line:#252b36}
.rz *{box-sizing:border-box}
.rz-head{flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid var(--line);background:var(--panel)}
.rz-title{font-weight:600;font-size:15px;letter-spacing:.2px;margin-right:4px}
.rz-seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}
.rz-seg button{border:0;background:var(--panel2);color:var(--dim);font:inherit;font-size:12.5px;padding:6px 12px;cursor:pointer}
.rz-seg button.on{background:var(--accent);color:#04121c}
.rz select{font:inherit;font-size:13px;padding:5px 9px;border-radius:8px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);max-width:42vw}
.rz .lbl{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.rz-body{flex:1 1 auto;min-height:0;overflow:auto;padding:16px 18px 40px}
.rz-metric{display:flex;flex-wrap:wrap;gap:14px;align-items:center;color:var(--dim);font-size:12.5px;margin-bottom:16px}
.rz-metric b{color:var(--ink);font-variant-numeric:tabular-nums}
.rz-basis{font-family:var(--mono);font-size:11px;padding:2px 7px;border-radius:6px;border:1px solid var(--line);background:var(--panel2)}
.rz-sec{margin:0 0 18px}
.rz-sec h3{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin:0 0 8px;font-weight:600}
.rz-row{padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel);margin-bottom:7px}
.rz-agree{border-left:3px solid var(--agree)}
.rz-clash{border-left:3px solid var(--clash);display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center}
.rz-div{border-left:3px solid var(--void)}
.rz-div .who{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px}
.rz-div .who .side{font-size:13px}
.rz-a{color:var(--a)} .rz-b{color:var(--b)}
.rz-vs{font-size:11px;color:var(--dim);font-family:var(--mono)}
.rz-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:760px){.rz-cols,.rz-div .who,.rz-clash{grid-template-columns:1fr}}
.rz-subj{font-weight:600}
.rz-learned{font-size:10px;font-family:var(--mono);color:var(--accent);border:1px solid var(--line);border-radius:5px;padding:1px 5px;margin-left:6px}
.rz-chip{display:inline-block;font-size:12px;padding:3px 9px;border-radius:20px;border:1px solid var(--line);background:var(--panel2);margin:0 5px 5px 0}
.rz-empty{color:var(--dim);font-size:13px;padding:26px 4px;max-width:64ch}
.rz-note{color:var(--dim);font-size:12px;margin-top:2px}`;

const optionList = (cands, keyFn, sel) => cands.map((c) => {
  const k = keyFn(c), n = c.quotes != null ? ` · ${c.quotes} said` : '';
  return `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(c.label)}${esc(n)}</option>`;
}).join('');

const rowLines = (arr, cls) => arr.length
  ? arr.map((t) => `<div class="rz-row ${cls}">${esc(t)}</div>`).join('')
  : `<div class="rz-note">— nothing —</div>`;

export const mountRashomon = (el, { app, scope = 'topic', sn = null } = {}) => {
  const root = document.createElement('div');
  root.className = 'rz';
  root.innerHTML = `<style>${CSS}</style><div class="rz-head"></div><div class="rz-body"></div>`;
  el.appendChild(root);
  const head = root.querySelector('.rz-head'), body = root.querySelector('.rz-body');

  const srcs = () => { try { return app.topicSources() || []; } catch { return []; } };
  const st = { scope, sn: sn ?? (srcs()[0]?.sn ?? null), a: null, b: null, diff: null, loading: false };

  const candidates = () => {
    try { return st.scope === 'source' ? app.rashomonCandidates({ sn: st.sn }) : app.rashomonCandidates(); }
    catch { return []; }
  };
  const keyOf = (c) => (st.scope === 'source' ? c.id : c.label);

  const run = async () => {
    if (st.a == null || st.b == null || st.a === st.b) { st.diff = null; render(); return; }
    st.loading = true; render();
    try {
      st.diff = st.scope === 'source'
        ? await app.rashomonSource(srcs().find((s) => s.sn === st.sn)?.docId, st.a, st.b)
        : await app.rashomonTopic(st.a, st.b);
    } catch { st.diff = null; }
    st.loading = false; render();
  };

  const pickDefaults = () => {
    const c = candidates();
    st.a = c[0] ? keyOf(c[0]) : null;
    st.b = c[1] ? keyOf(c[1]) : null;
  };

  head.addEventListener('click', (e) => {
    const seg = e.target.closest('[data-scope]');
    if (!seg) return;
    st.scope = seg.getAttribute('data-scope');
    if (st.scope === 'source' && st.sn == null) st.sn = srcs()[0]?.sn ?? null;
    pickDefaults(); run();
  });
  head.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-src]')) { st.sn = t.value; pickDefaults(); run(); }
    else if (t.matches('[data-a]')) { st.a = t.value; run(); }
    else if (t.matches('[data-b]')) { st.b = t.value; run(); }
  });

  function renderHead() {
    const c = candidates();
    const srcSel = st.scope === 'source'
      ? `<span class="lbl">source</span><select data-src>${srcs().map((s) => `<option value="${esc(s.sn)}"${s.sn === st.sn ? ' selected' : ''}>${esc(s.title || ('Source ' + s.sn))}</option>`).join('')}</select>` : '';
    head.innerHTML = `
      <span class="rz-title">Rashomon</span>
      <span class="rz-seg">
        <button data-scope="source" class="${st.scope === 'source' ? 'on' : ''}">This source</button>
        <button data-scope="topic" class="${st.scope === 'topic' ? 'on' : ''}">Whole topic</button>
      </span>
      ${srcSel}
      <span class="lbl rz-a">A</span><select data-a>${optionList(c, keyOf, st.a)}</select>
      <span class="lbl rz-b">B</span><select data-b>${optionList(c, keyOf, st.b)}</select>`;
  }

  function renderBody() {
    const c = candidates();
    if (c.length < 2) {
      body.innerHTML = `<div class="rz-empty">Rashomon reads the same events from two people's points of view — their quotes, and the little world each one's words build. This ${st.scope === 'source' ? 'source' : 'topic'} names fewer than two figures with a voice, so there is nothing yet to compare. Ingest sources where people <i>speak</i>, then pick two.</div>`;
      return;
    }
    if (st.loading) { body.innerHTML = `<div class="rz-empty">Reading both folds…</div>`; return; }
    const d = st.diff;
    if (!d) { body.innerHTML = `<div class="rz-empty">Pick two different figures to compare.</div>`; return; }
    const m = d.metric;
    const conflict = d.conflict.map((x) => `<div class="rz-row rz-clash"><span class="rz-a">${esc(x.a)}</span><span class="rz-vs">vs</span><span class="rz-b">${esc(x.b)}</span></div>`).join('') || `<div class="rz-note">— none —</div>`;
    const shared = d.shared.map((x) => `<div class="rz-row rz-agree">${esc(x.text)}${x.learned ? '<span class="rz-learned">meaning</span>' : ''}</div>`).join('') || `<div class="rz-note">— none —</div>`;
    const diverg = d.divergent.map((x) => `<div class="rz-row rz-div"><span class="rz-subj">${esc(x.subject)}</span><div class="who"><div class="side"><span class="rz-a lbl">${esc(d.a.label)}</span><br>${x.a.map(esc).join('<br>')}</div><div class="side"><span class="rz-b lbl">${esc(d.b.label)}</span><br>${x.b.map(esc).join('<br>')}</div></div></div>`).join('') || `<div class="rz-note">— none —</div>`;
    const chips = (arr) => arr.length ? arr.map((l) => `<span class="rz-chip">${esc(l)}</span>`).join('') : '<span class="rz-note">— none —</span>';
    body.innerHTML = `
      <div class="rz-metric">
        <span class="rz-basis" title="lexical: spelling only. meaning: the learned same-assertion judgment (MiniLM) is warm and lifting the diff.">${esc(m.basis)}</span>
        <span>claim overlap <b>${Math.round(m.claimOverlap * 100)}%</b></span>
        <span>cast overlap <b>${Math.round(m.castOverlap * 100)}%</b></span>
        <span><b>${m.shared}</b> agree · <b>${m.conflicts}</b> conflict · <b>${m.divergentSubjects}</b> diverge</span>
        ${d.scope === 'topic' && d.sources ? `<span>across <b>${d.sources.length}</b> sources</span>` : ''}
      </div>
      <div class="rz-sec"><h3>They conflict — the same thing, opposite</h3>${conflict}</div>
      <div class="rz-sec"><h3>Same thing, two lenses</h3>${diverg}</div>
      <div class="rz-sec"><h3>They agree</h3>${shared}</div>
      <div class="rz-cols">
        <div class="rz-sec"><h3 class="rz-a">Only ${esc(d.a.label)} says</h3>${rowLines(d.onlyA, '')}</div>
        <div class="rz-sec"><h3 class="rz-b">Only ${esc(d.b.label)} says</h3>${rowLines(d.onlyB, '')}</div>
      </div>
      <div class="rz-sec"><h3>The cast</h3>
        <div class="rz-note">both name</div>${chips(d.cast.shared)}
        <div class="rz-note" style="margin-top:8px">only ${esc(d.a.label)}</div>${chips(d.cast.onlyA)}
        <div class="rz-note" style="margin-top:8px">only ${esc(d.b.label)}</div>${chips(d.cast.onlyB)}
      </div>`;
  }

  function render() { renderHead(); renderBody(); }

  pickDefaults();
  render();
  run();
  return { destroy() { try { root.remove(); } catch { /* gone */ } } };
};
