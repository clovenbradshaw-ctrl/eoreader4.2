// EO: INS·NUL(Network → Lens,Void, Making,Clearing) — the Rashomon DOM surface
// surface.js — the whole "two figures, same events" interface, framework-free so it drops into a
// standalone page or the reader's Rashomon tab. Two lenses on the reader session's real folds:
//   COMPARE  two figures diffed — agree / conflict / same-thing-two-lenses / each own
//   TRACE    a claim followed as it changes hands — origin → hops, marking where it mutated
// It reads one membrane (rashomon* / transmission* on the app) and computes nothing; every
// judgment is the engine's. Both lenses work at one source or across the whole topic.

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
.rz-a{color:var(--a)} .rz-b{color:var(--b)}
.rz-vs{font-size:11px;color:var(--dim);font-family:var(--mono)}
.rz-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:760px){.rz-cols,.rz-div .who,.rz-clash{grid-template-columns:1fr}}
.rz-subj{font-weight:600}
.rz-chip{display:inline-block;font-size:12px;padding:3px 9px;border-radius:20px;border:1px solid var(--line);background:var(--panel2);margin:0 5px 5px 0}
.rz-empty{color:var(--dim);font-size:13px;padding:26px 4px;max-width:64ch}
.rz-note{color:var(--dim);font-size:12px;margin-top:2px}
.rz-idea{padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel);margin-bottom:9px}
.rz-orig{font-weight:600}.rz-orig .who{color:var(--accent)}
.rz-hop{margin-top:5px;font-size:13px;color:var(--dim);display:flex;gap:8px;align-items:baseline}
.rz-hop .arr{font-family:var(--mono);color:var(--dim)}
.rz-echo{color:var(--agree)}.rz-flip{color:var(--clash);font-weight:600}
.rz-btn{border:1px solid var(--line);background:var(--panel2);color:var(--ink);border-radius:8px;padding:6px 11px;font:inherit;font-size:12.5px;cursor:pointer}
.rz-btn:hover{border-color:var(--accent)}
.rz-watched{margin-bottom:14px;display:flex;flex-wrap:wrap;gap:8px}
.rz-watch{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;padding:5px 11px;border:1px solid var(--line);border-radius:20px;background:var(--panel2)}
.rz-watch b{font-weight:600}
.rz-watch .ic{cursor:pointer;opacity:.65;font-family:var(--mono)}.rz-watch .ic:hover{opacity:1;color:var(--accent)}
.rz-watch .rz-delta{color:var(--accent);font-size:11.5px}
.rz-ask input{font:inherit;font-size:13px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);min-width:220px}
.rz-said{padding:12px 14px;border:1px solid var(--line);border-left:3px solid var(--a);border-radius:10px;background:var(--panel);font-size:14.5px;line-height:1.6}
.rz-void{padding:12px 14px;border:1px dashed var(--line);border-radius:10px;color:var(--dim);font-style:italic}`;

const optionList = (cands, keyFn, sel) => cands.map((c) => {
  const k = keyFn(c), n = c.quotes != null ? ` · ${c.quotes} said` : '';
  return `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(c.label)}${esc(n)}</option>`;
}).join('');
const rowLines = (arr) => arr.length ? arr.map((t) => `<div class="rz-row">${esc(t)}</div>`).join('') : `<div class="rz-note">— nothing —</div>`;

export const mountRashomon = (el, { app, scope = 'topic', sn = null, mode = 'compare' } = {}) => {
  const root = document.createElement('div');
  root.className = 'rz';
  root.innerHTML = `<style>${CSS}</style><div class="rz-head"></div><div class="rz-body"><div class="rz-watched"></div><div class="rz-panels"></div></div>`;
  el.appendChild(root);
  const head = root.querySelector('.rz-head'), body = root.querySelector('.rz-panels'), watchedEl = root.querySelector('.rz-watched');

  const srcs = () => { try { return app.topicSources() || []; } catch { return []; } };
  const st = { mode, scope, sn: sn ?? (srcs()[0]?.sn ?? null), a: null, b: null, diff: null, trace: null, frag: null, chrono: null, answer: null, askQ: '', loading: false, watched: [], deltas: {} };
  const speakerless = (mo) => mo === 'fragile' || mo === 'timeline';
  const needTwo = (mo) => mo === 'compare' || mo === 'trace';
  const refreshWatched = () => { try { st.watched = app.standingList ? app.standingList() : []; } catch { st.watched = []; } };

  const candidates = () => { try { return st.scope === 'source' ? app.rashomonCandidates({ sn: st.sn }) : app.rashomonCandidates(); } catch { return []; } };
  const keyOf = (c) => (st.scope === 'source' ? c.id : c.label);
  const docId = () => srcs().find((s) => s.sn === st.sn)?.docId;

  const run = async () => {
    st.loading = true; render();
    try {
      if (st.mode === 'ask') st.answer = (st.a != null && st.askQ.trim()) ? (st.scope === 'source' ? await app.askFigureSource(docId(), st.a, st.askQ) : await app.askFigureTopic(st.a, st.askQ)) : null;
      else if (st.mode === 'timeline') st.chrono = st.scope === 'source' ? await app.chronologySource(st.sn) : await app.chronologyTopic();
      else if (st.mode === 'fragile') st.frag = st.scope === 'source' ? await app.fragilitySource(st.sn) : await app.fragilityTopic();
      else if (st.mode === 'trace') st.trace = st.scope === 'source' ? await app.transmissionSource(st.sn) : await app.transmissionTopic();
      else if (st.a != null && st.b != null && st.a !== st.b) st.diff = st.scope === 'source' ? await app.rashomonSource(docId(), st.a, st.b) : await app.rashomonTopic(st.a, st.b);
      else st.diff = null;
    } catch { st.diff = null; st.trace = null; st.frag = null; st.chrono = null; }
    st.loading = false; render();
  };
  const pickDefaults = () => { const c = candidates(); st.a = c[0] ? keyOf(c[0]) : null; st.b = c[1] ? keyOf(c[1]) : null; };

  const save = async () => {
    if (!app.standingSave) return;
    const spec = { kind: st.mode === 'trace' ? 'trace' : 'compare', scope: st.scope, sn: st.sn, docId: docId(), a: st.a, b: st.b };
    try { await app.standingSave(spec); } catch { /* nothing to save */ }
    refreshWatched(); renderWatched();
  };
  head.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mode]'), s = e.target.closest('[data-scope]');
    if (e.target.closest('[data-watch]')) { save(); return; }
    if (m) { st.mode = m.getAttribute('data-mode'); run(); }
    else if (s) { st.scope = s.getAttribute('data-scope'); if (st.scope === 'source' && st.sn == null) st.sn = srcs()[0]?.sn ?? null; pickDefaults(); run(); }
  });
  watchedEl.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-refresh]'), u = e.target.closest('[data-unwatch]');
    if (r) { const id = r.getAttribute('data-refresh'); try { const res = await app.standingRefresh(id); st.deltas[id] = res?.delta?.summary || '—'; } catch { st.deltas[id] = '—'; } refreshWatched(); renderWatched(); }
    else if (u) { const id = u.getAttribute('data-unwatch'); try { app.standingRemove(id); } catch { /* gone */ } delete st.deltas[id]; refreshWatched(); renderWatched(); }
  });
  head.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-src]')) { st.sn = t.value; pickDefaults(); run(); }
    else if (t.matches('[data-a]')) { st.a = t.value; if (st.mode !== 'ask') run(); }
    else if (t.matches('[data-b]')) { st.b = t.value; run(); }
  });
  head.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) st.askQ = e.target.value; });
  head.addEventListener('keydown', (e) => { if (e.target.matches('[data-q]') && e.key === 'Enter') run(); });
  head.addEventListener('click', (e) => { if (e.target.closest('[data-ask]')) run(); });

  function renderHead() {
    const c = candidates();
    const srcSel = st.scope === 'source' ? `<span class="lbl">source</span><select data-src>${srcs().map((s) => `<option value="${esc(s.sn)}"${s.sn === st.sn ? ' selected' : ''}>${esc(s.title || ('Source ' + s.sn))}</option>`).join('')}</select>` : '';
    const pickers = st.mode === 'compare' ? `<span class="lbl rz-a">A</span><select data-a>${optionList(c, keyOf, st.a)}</select><span class="lbl rz-b">B</span><select data-b>${optionList(c, keyOf, st.b)}</select>` : '';
    const asker = st.mode === 'ask' ? `<span class="lbl">figure</span><select data-a>${optionList(c, keyOf, st.a)}</select><span class="rz-ask"><input data-q placeholder="Ask them something…" value="${esc(st.askQ)}"></span><button class="rz-btn" data-ask>Ask</button>` : '';
    head.innerHTML = `
      <span class="rz-title">Rashomon</span>
      <span class="rz-seg">
        <button data-mode="compare" class="${st.mode === 'compare' ? 'on' : ''}">Compare two</button>
        <button data-mode="trace" class="${st.mode === 'trace' ? 'on' : ''}">Trace an idea</button>
        <button data-mode="fragile" class="${st.mode === 'fragile' ? 'on' : ''}">What's fragile</button>
        <button data-mode="timeline" class="${st.mode === 'timeline' ? 'on' : ''}">Timeline</button>
        <button data-mode="ask" class="${st.mode === 'ask' ? 'on' : ''}">Ask a figure</button>
      </span>
      <span class="rz-seg">
        <button data-scope="source" class="${st.scope === 'source' ? 'on' : ''}">This source</button>
        <button data-scope="topic" class="${st.scope === 'topic' ? 'on' : ''}">Whole topic</button>
      </span>
      ${srcSel}${pickers}${asker}
      ${speakerless(st.mode) || st.mode === 'ask' ? '' : '<button class="rz-btn" data-watch title="Save this view; later, see what changed since">★ Watch this</button>'}`;
  }

  function renderWatched() {
    if (!st.watched.length) { watchedEl.innerHTML = ''; return; }
    watchedEl.innerHTML = st.watched.map((w) => {
      const d = st.deltas[w.id];
      return `<span class="rz-watch"><b>${esc(w.label)}</b>${d ? `<span class="rz-delta">${esc(d)}</span>` : ''}<span class="ic" data-refresh="${esc(w.id)}" title="Check what changed">↻</span><span class="ic" data-unwatch="${esc(w.id)}" title="Stop watching">✕</span></span>`;
    }).join('');
  }

  function renderCompare() {
    const d = st.diff;
    if (!d) { body.innerHTML = `<div class="rz-empty">Pick two different figures to compare.</div>`; return; }
    const m = d.metric;
    const conflict = d.conflict.map((x) => `<div class="rz-row rz-clash"><span class="rz-a">${esc(x.a)}</span><span class="rz-vs">vs</span><span class="rz-b">${esc(x.b)}</span></div>`).join('') || `<div class="rz-note">— none —</div>`;
    const shared = d.shared.map((x) => `<div class="rz-row rz-agree">${esc(x.text)}${x.learned ? ' <span class="rz-basis">meaning</span>' : ''}</div>`).join('') || `<div class="rz-note">— none —</div>`;
    const diverg = d.divergent.map((x) => `<div class="rz-row rz-div"><span class="rz-subj">${esc(x.subject)}</span><div class="who"><div><span class="rz-a lbl">${esc(d.a.label)}</span><br>${x.a.map(esc).join('<br>')}</div><div><span class="rz-b lbl">${esc(d.b.label)}</span><br>${x.b.map(esc).join('<br>')}</div></div></div>`).join('') || `<div class="rz-note">— none —</div>`;
    const chips = (arr) => arr.length ? arr.map((l) => `<span class="rz-chip">${esc(l)}</span>`).join('') : '<span class="rz-note">— none —</span>';
    body.innerHTML = `
      <div class="rz-metric"><span class="rz-basis" title="lexical: spelling only. meaning: the learned same-assertion judgment (MiniLM) is warm.">${esc(m.basis)}</span>
        <span>claim overlap <b>${Math.round(m.claimOverlap * 100)}%</b></span><span>cast overlap <b>${Math.round(m.castOverlap * 100)}%</b></span>
        <span><b>${m.shared}</b> agree · <b>${m.conflicts}</b> conflict · <b>${m.divergentSubjects}</b> diverge</span>
        ${d.scope === 'topic' && d.sources ? `<span>across <b>${d.sources.length}</b> sources</span>` : ''}</div>
      <div class="rz-sec"><h3>They conflict — the same thing, opposite</h3>${conflict}</div>
      <div class="rz-sec"><h3>Same thing, two lenses</h3>${diverg}</div>
      <div class="rz-sec"><h3>They agree</h3>${shared}</div>
      <div class="rz-cols"><div class="rz-sec"><h3 class="rz-a">Only ${esc(d.a.label)} says</h3>${rowLines(d.onlyA)}</div><div class="rz-sec"><h3 class="rz-b">Only ${esc(d.b.label)} says</h3>${rowLines(d.onlyB)}</div></div>
      <div class="rz-sec"><h3>The cast</h3><div class="rz-note">both name</div>${chips(d.cast.shared)}<div class="rz-note" style="margin-top:8px">only ${esc(d.a.label)}</div>${chips(d.cast.onlyA)}<div class="rz-note" style="margin-top:8px">only ${esc(d.b.label)}</div>${chips(d.cast.onlyB)}</div>`;
  }

  function renderTrace() {
    const t = st.trace;
    if (!t) { body.innerHTML = `<div class="rz-empty">Reading who said what…</div>`; return; }
    const m = t.metric;
    const ideas = t.ideas.map((idea) => {
      const hops = idea.hops.map((h) => `<div class="rz-hop"><span class="arr">└→</span><span><b>${esc(h.label)}</b> <span class="${h.relation === 'flipped' ? 'rz-flip' : 'rz-echo'}">${h.relation}</span>${h.relation === 'flipped' ? `: ${esc(h.text)}` : ''}</span></div>`).join('');
      return `<div class="rz-idea"><div class="rz-orig">“${esc(idea.text)}” <span class="who">— first said by ${esc(idea.origin.label)}</span></div>${hops}</div>`;
    }).join('') || `<div class="rz-note">No idea here was voiced by two different people yet — nothing has changed hands.</div>`;
    body.innerHTML = `
      <div class="rz-metric"><span class="rz-basis" title="lexical: spelling only. meaning: paraphrases/inversions clustered by the learned judgment.">${esc(m.basis)}</span>
        <span><b>${m.ideas}</b> ideas changed hands</span><span><b>${m.mutations}</b> mutated (inverted as they spread)</span>
        ${t.scope === 'topic' && t.sources ? `<span>across <b>${t.sources.length}</b> sources</span>` : ''}</div>
      <div class="rz-sec"><h3>Ideas as they moved through the cast</h3>${ideas}</div>`;
  }

  function renderFragile() {
    const f = st.frag;
    if (!f) { body.innerHTML = `<div class="rz-empty">Reading what the record rests on…</div>`; return; }
    const m = f.metric;
    const items = f.items.map((it) => {
      const dep = it.dependents.length ? `<div class="rz-note" style="margin-top:6px">If this is wrong, these also come into question:</div>${it.dependents.map((d) => `<div class="rz-row">${esc(d)}</div>`).join('')}` : `<div class="rz-note" style="margin-top:6px">little else in the record rests on this — cheap to be wrong about.</div>`;
      return `<div class="rz-idea rz-div"><div><span class="rz-subj">${esc(it.subject)}</span> <span class="rz-basis">${esc(it.kind)}</span> <span class="rz-delta">load ${it.load}${it.sources ? ` · ${it.sources} sources` : ''}</span></div><div class="rz-note" style="margin-top:3px">${esc(it.description)}</div>${dep}</div>`;
    }).join('') || `<div class="rz-note">No disagreement found in this ${f.scope === 'source' ? 'source' : 'topic'} yet — nothing is contested, so nothing is load-bearing.</div>`;
    body.innerHTML = `
      <div class="rz-metric"><span class="rz-basis">lexical</span><span><b>${m.contested}</b> contested</span><span><b>${m.loadBearing}</b> load-bearing</span>${f.scope === 'topic' && f.sources ? `<span>across <b>${f.sources.length}</b> sources</span>` : ''}</div>
      <div class="rz-sec"><h3>Contested claims, most load-bearing first</h3>${items}</div>`;
  }

  function renderTimeline() {
    const c = st.chrono;
    if (!c) { body.innerHTML = `<div class="rz-empty">Reading when things happened…</div>`; return; }
    const m = c.metric;
    const events = c.timeline.map((e) => `<div class="rz-row rz-agree"><b>${esc(e.when)}</b> — ${esc(e.text)}${e.source != null && c.scope === 'topic' ? ` <span class="rz-note">· S${esc(e.source)}</span>` : ''}</div>`).join('')
      || `<div class="rz-note">No stated dates found in this ${c.scope === 'source' ? 'source' : 'topic'} — nothing to place on a timeline yet.</div>`;
    const jumps = c.reorderings.map((r) => `<div class="rz-row rz-div">the telling jumps back — from <b>${esc(r.from)}</b> to <b>${esc(r.to)}</b>: “${esc(r.text)}”</div>`).join('') || `<div class="rz-note">told in order — no flashbacks.</div>`;
    body.innerHTML = `
      <div class="rz-metric"><span class="rz-basis">dated</span><span><b>${m.dated}</b> events placed</span><span><b>${m.undated}</b> undated</span><span><b>${m.reorderings}</b> flashback${m.reorderings === 1 ? '' : 's'}</span>${c.span ? `<span>${esc(c.span.first)} → ${esc(c.span.last)}</span>` : ''}</div>
      <div class="rz-sec"><h3>What happened, in order</h3>${events}</div>
      <div class="rz-sec"><h3>Where the telling runs against time</h3>${jumps}</div>`;
  }

  function renderAsk() {
    const a = st.answer;
    if (!a) { body.innerHTML = `<div class="rz-empty">Pick a figure and ask a question. They answer from <i>their own words only</i> — what the record has them commit to — and say so plainly when their words don't address it. Nothing another figure said, and nothing the document asserts on its own, leaks in.</div>`; return; }
    if (!a.addressed) { body.innerHTML = `<div class="rz-void">${esc(a.answer)}</div><div class="rz-note" style="margin-top:8px">The figure's words don't reach this question — so nothing is asserted (the record won't fabricate on their behalf).</div>`; return; }
    const quotes = a.quotes.length ? `<div class="rz-sec" style="margin-top:16px"><h3>In their words</h3>${a.quotes.map((q) => `<div class="rz-row">“${esc(q)}”</div>`).join('')}</div>` : '';
    const cites = a.claims.length ? `<div class="rz-sec" style="margin-top:14px"><h3>Drawn only from</h3>${a.claims.map((c) => `<div class="rz-row">${esc(c.text)}</div>`).join('')}</div>` : '';
    body.innerHTML = `<div class="rz-said">${esc(a.answer)}</div><div class="rz-note" style="margin-top:6px">${a.contained ? 'bounded — every name and number here is one the figure used' : '⚠ this stepped outside the fold'}</div>${quotes}${cites}`;
  }

  function render() {
    renderHead(); renderWatched();
    if (needTwo(st.mode) && candidates().length < 2) { body.innerHTML = `<div class="rz-empty">This ${st.scope === 'source' ? 'source' : 'topic'} names fewer than two figures with a voice. Compare and Trace read the same events from two people's points of view — ingest sources where people <i>speak</i>. (Try <b>What's fragile</b> or <b>Timeline</b> — they need no speakers.)</div>`; return; }
    if (st.mode === 'ask' && candidates().length < 1) { body.innerHTML = `<div class="rz-empty">No figure here has a voice yet — Ask a figure answers from what a person is quoted saying. Ingest a source where someone <i>speaks</i>.</div>`; return; }
    if (st.loading) { body.innerHTML = `<div class="rz-empty">Reading…</div>`; return; }
    if (st.mode === 'ask') renderAsk(); else if (st.mode === 'timeline') renderTimeline(); else if (st.mode === 'fragile') renderFragile(); else if (st.mode === 'trace') renderTrace(); else renderCompare();
  }

  pickDefaults(); refreshWatched(); render(); run();
  return { destroy() { try { root.remove(); } catch { /* gone */ } } };
};
