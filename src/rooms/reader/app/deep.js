// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// deep reading: the inner monologue at rest
import { promoteConnection } from '../../../enactor/connect/index.js';
import { speakTriples, talkThenVerify } from '../../../weave/write/index.js';
import { projectGraph } from '../../../core/index.js';
import { runCuriousResearch } from '../../../turn/index.js';
import { createDeepReader } from '../../../surfer/fold/index.js';
import { surfFold } from '../../../surfer/index.js';
import { REFLECTION_CAP, recordReflections, appendLog } from './guards.js';
import { nowIso, nowMs } from './util.js';

export const installDeep = (appCtx) => {
  const { emit, logIt, murmur, state } = appCtx;
  // ── deep reading: the inner monologue at rest ────────────────────────────────
  // When no turn is generating and the reader is quiet, the reading turns back on the
  // record: it surfs to the place of most interest (Bayesian surprise), folds it, and
  // voices a reflection — an ENACTED EVA held at band VOID. The firewall is the TYPE:
  // canWitness(reflection.prov) === false, so a reflection can never be mistaken for a
  // witnessed fact or ground an answer (docs/deep-reading.md, docs/monologue-significance.md).
  // Model-free and embedder-free — thinking needs no weights. Reflections stream into
  // state.reflections; the surface shows them in the master-log drawer's "Reflections" mode.
  // The reader never self-polls: an idle governor wakes it only in the lulls between turns.
  const deepReaders = new Map();     // docId → { reader, doc, anchor }
  let deepSettled = false, deepRunning = false, deepTimer = null, lastActivity = 0;
  // self-guided-learning pacing — the wander advances at most one step per `minStepMs` (human pace)
  // and never re-turns a reflection it has already learned from (anti-rumination).
  let lastWander = 0, wanderRunning = false;
  const wanderSeen = new Set();

  // A reflection deposits onto the log; layer it over the source's log in an overlay so the
  // stored record stays append-only truth and a reload re-reads clean.
  const overlayDoc = (base) => {
    const extra = [];
    const log = {
      append: (e) => { extra.push(e); return e; },
      snapshot: () => base.log.snapshot().concat(extra),
      get length() { return base.log.snapshot().length + extra.length; },
    };
    return { log, units: base.units, sentences: base.sentences, tokensBySentence: base.tokensBySentence, docId: base.docId };
  };

  // A figure the reading named by opaque id → its readable label, so the inner note reads as
  // prose; id-shaped tokens with no known label drop to "something" rather than show raw.
  const cleanLabels = (s, doc) => String(s ?? '').replace(/\b[a-z][a-z0-9]{4,}\b/g, (tok) => {
    if (!/[0-9]/.test(tok)) return tok;
    let lab = null; try { lab = doc?.admission?.labelOf?.(tok) ?? null; } catch { /* pass */ }
    if (lab && lab !== tok) return lab;
    return /^[a-z][0-9]/.test(tok) ? 'something' : tok;
  });

  const deepReaderFor = (src) => {
    const doc = appCtx.docFor(src);
    if (!doc || !(doc.sentences || doc.units || []).length) return null;
    let entry = deepReaders.get(src.docId);
    if (!entry) {
      try {
        const od = overlayDoc(doc);
        entry = { reader: createDeepReader({ doc: od, surf: surfFold }), doc: od, base: doc, anchor: 0 };
        deepReaders.set(src.docId, entry);
      } catch { return null; }
    }
    return entry;
  };

  // The record grew (a source landed) or the topic changed — wake the loop so the new
  // places get read at rest. Readers keep their per-place habituation (the rumination cure).
  const deepWake = () => { deepSettled = false; };

  // ONE governed pass over the topic's sources — arrive() runs until it quiesces (never spins).
  // Called by the idle governor, and by the surface's "Reflect now" (manual=true).
  const deepTick = (manual = false) => {
    if (deepRunning) return; deepRunning = true;
    try {
      if (state.busy && !manual) return;            // engaged — a turn is decoding
      if (deepSettled && !manual) return;           // quiesced until the record grows
      const srcs = appCtx.topicSources();
      if (!srcs.length) return;
      let anyFresh = false, allSettled = true;
      for (const src of srcs) {
        const entry = deepReaderFor(src);
        if (!entry) continue;
        const n = (entry.doc.sentences || entry.doc.units || []).length; if (!n) continue;
        let res; try { res = entry.reader.arrive({ anchor: entry.anchor }); } catch { continue; }
        const fresh = (res && res.reflections) || [];
        if (fresh.length) {
          anyFresh = true;
          state.reflectionsSeen = recordReflections(state.reflections, state.reflectionsSeen, fresh, (r) => ({
            t: nowIso(), docId: src.docId, sn: src.sn, title: src.title,
            peak: r.peak, note: cleanLabels(r.body, entry.base), verdict: r.verdict || '',
            surprise: r.surprise, canWitness: r.canWitness,   // false — the firewall, surfaced
          }));
          entry.anchor = Math.min(n - 1, fresh[fresh.length - 1].peak + 1);
        } else {
          entry.anchor += 8;
        }
        if (entry.anchor < n - 1 || fresh.length) allSettled = false;
      }
      deepSettled = allSettled && !anyFresh;
      if (anyFresh) {
        // ONE coalescing beat for the whole lull (see appendLog): every idle pass folds into this
        // single line, ticking its count, rather than stacking a new one — the Actions feed stays
        // about actions. The effect points to where the notes actually live, so the count reads as
        // a signpost ("go read them") instead of a bare number that touched nothing.
        const n = state.reflectionsSeen;
        logIt('reflection', `Reflected at rest — ${n} note${n === 1 ? '' : 's'} so far`,
          'read them in the Reflections tab', { coalesce: true });
        appCtx.persist(); emit('reflections');
      }
    } finally { deepRunning = false; }
  };

  // Voice the just-grounded connections as prose (phase E). Builds grounded subject→relation→object
  // propositions from the connection edges, labelled via the doc's own graph so real names surface,
  // then realises them — with the LOCAL model when it is loaded and free, else the deterministic
  // model-free realizer. The propositional veto (talkThenVerify) strips any drift, so the prose can
  // be no more wrong than the graph is. Returns '' when there is nothing (grounded) to say.
  const prosifyConnections = async (promoted) => {
    if (!promoted || !promoted.length) return '';
    const props = [];
    for (const { event, doc } of promoted) {
      let g = null; try { g = projectGraph(doc.log); } catch { /* skip this one */ }
      const rep = g?.representative || ((id) => id);
      const lab = (id) => g?.entities?.get?.(rep(id))?.label ?? id;
      if (event.src && event.via) props.push({ subj: lab(event.src), verb: event.via, obj: event.tgt ? lab(event.tgt) : null });
    }
    if (!props.length) return '';
    if (state.model?.state === 'ready') {
      try {
        const model = await appCtx.ensureModel();
        if (model && typeof model.phrase === 'function') {
          const out = await talkThenVerify({ propositions: props }, model, { doc: promoted[0].doc });
          const fluent = String(out?.fluent || '').trim();
          if (fluent && out.clean) return fluent;    // clean = no fabricated proposition survived the veto
        }
      } catch { /* a cold/slow/erroring model never costs the pass — fall through to model-free */ }
    }
    return speakTriples(props);
  };

  // The connective promotion pass (phase 4) — the VERIFY half of murmur's connective loop, run at
  // rest beside deep reading. It drains murmur's candidate connections (recognition impressions that
  // pointed back at an earlier locus) and lets the DOCUMENT decide: a document-corroborated relation
  // bridging the two passages is promoted to a real CON edge (Tier 2, nominatedBy:'murmur', grounded
  // by citation, reafferent so it can never self-witness); every other echo is held open as a
  // firewalled EVA/void margin note (Tier 1). Both ride the deep-reader OVERLAY (append-only over the
  // source's durable truth), so they enter the session graph exactly as reflections do, and surface
  // in the same Reflections drawer — "watch the app murmur" for free. Off the critical path: it never
  // runs while a turn decodes, and a bad candidate never breaks the loop.
  let connectRunning = false;
  const connectTick = async (manual = false) => {
    if (connectRunning) return 0; connectRunning = true;
    try {
      if (!murmur || typeof murmur.nominations !== 'function') return 0;
      if (state.busy && !manual) return 0;                  // engaged — a turn is decoding
      const cands = murmur.nominations();                   // DRAIN the read side-channel
      if (!cands.length) return 0;
      const overlayFor = (docId) => {
        const src = state.sources.find((s) => s.docId === docId);
        const entry = src ? deepReaderFor(src) : null;
        return entry ? { doc: entry.doc, src } : null;
      };
      const docForId = (docId) => overlayFor(docId)?.doc || null;
      const fresh = [];
      const promoted = [];                                  // Tier-2 events to prosify (phase E)
      for (const c of cands) {
        let res = null;
        try { res = await promoteConnection(c, { docFor: docForId }); }
        catch { continue; }                                 // a bad candidate never costs the pass
        if (!res || !res.event || res.tier === 0) continue;
        const home = overlayFor(res.docId);
        if (!home) continue;
        try { home.doc.log.append(res.event); } catch { continue; }
        if (res.tier === 2) promoted.push({ event: res.event, doc: home.doc });
        const label = res.event.echoes?.sharedLabel || res.shared || null;
        fresh.push({
          docId: res.docId, sn: home.src?.sn || null, title: home.src?.title || res.docId,
          peak: Number.isInteger(c?.from?.cursor) ? c.from.cursor : null,   // the "jump to" locus in the drawer
          tier: res.tier, connection: true, canWitness: false,   // the firewall, surfaced
          note: res.tier === 2
            ? `${label ? label + ' — ' : ''}connects to an earlier passage${res.event.citation ? ` (${res.event.citation})` : ''}`
            : (res.event.body || 'reads like an earlier passage'),
          citation: res.event.citation || null,
          verdict: res.tier === 2
            ? (res.event.echoes?.recurrence ? 'recurrence' : (res.verdict?.verdict || 'corroborated'))
            : '',
        });
      }
      // Phase E — PROSIFY the grounded connections. "If not otherwise occupied": run only at rest,
      // and use the LOCAL model when it is warm (webllm/wllama, nothing leaves the box), falling back
      // to the model-free realizer (speakTriples) otherwise — so the connections are always voiced,
      // the LLM is spent only when it is free and loaded. The propositional veto (talkThenVerify)
      // strips anything the talker invents, so the prose can be no more wrong than the graph is.
      const prose = await prosifyConnections(promoted);
      if (prose) {
        const pd = promoted[0]?.doc?.docId || null;
        const psrc = pd ? state.sources.find((s) => s.docId === pd) : null;
        fresh.push({ docId: pd, sn: psrc?.sn || null, title: psrc?.title || pd, prose: true, connection: true, tier: 2, canWitness: false, note: prose });
      }

      if (fresh.length) {
        state.reflectionsSeen = recordReflections(state.reflections, state.reflectionsSeen, fresh, (r) => ({
          t: nowIso(), ...r,
        }));
        const nT2 = fresh.filter((f) => f.tier === 2 && !f.prose).length;
        logIt('reflection', nT2
          ? `Connected at rest — ${nT2} grounded connection${nT2 === 1 ? '' : 's'} added to the graph`
          : `Noticed ${fresh.length} echo${fresh.length === 1 ? '' : 'es'} at rest`);
        appCtx.persist(); emit('reflections');
      }
      return fresh.length;
    } finally { connectRunning = false; }
  };

  // The murmur's stance, driven by the surface (Settings). Hidden ⇒ the wander PAUSES, so the
  // transparency rule holds by construction: there is no code path where murmur mutters or reaches
  // the web while the strip is not on screen ("no muttering you don't see"). 'off' fully disables.
  const setMurmurMode = (mode) => {
    const m = (mode === 'off' || mode === 'look' || mode === 'explore') ? mode : 'look';
    if (state.murmurMode === m) return;
    state.murmurMode = m; emit('murmur');
  };
  const setMurmurVisible = (on) => {
    const v = on !== false;
    if (state.murmurVisible === v) return;
    state.murmurVisible = v; emit('murmur');
  };

  // The labels the record already EXPLAINS — the entity names in the topic's document graphs. A
  // surprising term that is NOT here is something the reading NAMED but did not explain: the honest
  // outward lead for explore mode. Lowercased tokens so a multi-word label still shields its parts.
  const knownLabels = () => {
    const known = new Set();
    for (const src of appCtx.topicSources()) {
      let g = null; try { g = projectGraph(appCtx.docFor(src).log); } catch { continue; }
      if (!g || !g.entities) continue;
      for (const ent of g.entities.values()) {
        for (const w of String(ent?.label || '').toLowerCase().match(/[a-z][a-z0-9'’-]{2,}/g) || []) known.add(w);
      }
    }
    return known;
  };

  // Fold a fresh learning note into the notebook + broadcast it as a LIVE mutter so the strip paints
  // it (self-guided learning, visible by construction). Never a log write — murmur.mutter is a read
  // side-channel and the note is reafferent (canWitness===false).
  const noteLearning = (note, pick) => {
    if (!note) return;
    state.learningSeen += 1;
    state.learning.push({ id: `L${state.learningSeen}`, t: nowIso(),
      phrase: note.phrase, terms: note.terms, origin: note.origin, register: note.register,
      curiosity: note.curiosity, source: note.source, web: note.web, canWitness: false });
    if (state.learning.length > REFLECTION_CAP) state.learning.splice(0, state.learning.length - REFLECTION_CAP);
    try { murmur.mutter({ phrase: note.phrase, register: note.register || 'curiosity',
      intensity: Math.max(0.35, Math.min(1, (pick && pick.curiosity) || 0.5)), learning: note }); } catch { /* the strip must never cost the pass */ }
  };

  // THE WANDER (self-guided learning) — one human-paced step, run at rest beside deep reading. It
  // looks at the most INTERESTING place the reading just surfaced (a fresh reflection), lets the
  // notebook decide if it is worth turning over (curiosity = the one surprise pointed inward), and
  // — in EXPLORE mode, with a web license — follows ONE outward lead onto the web, folding what it
  // reads back as a learning note. Gated: mode≠off, strip visible, not engaged, and at most one step
  // per minStepMs. Everything is reafferent (canWitness===false) and off the critical path.
  let learnRunning = false;
  const wanderTick = async (manual = false) => {
    if (learnRunning) return 0; learnRunning = true;
    try {
      if (!murmur || !murmur.learn || typeof murmur.learn.wander !== 'function') return 0;
      if (state.murmurMode === 'off' || !state.murmurVisible) return 0;   // off / hidden ⇒ paused
      if (state.busy && !manual) return 0;                                // engaged — a turn is decoding
      const cfg = (murmur.config && murmur.config.learn) || {};
      const nowMs = Date.now();
      if (!manual && nowMs - lastWander < (cfg.minStepMs || 20000)) return 0;   // human pace
      lastWander = nowMs;

      // The most interesting places at rest = the freshest reflections the deep reader surfaced that
      // the wander hasn't turned over yet. Their note text is the candidate; the locus rides along.
      const cands = [];
      for (let i = state.reflections.length - 1; i >= 0 && cands.length < 6; i--) {
        const r = state.reflections[i];
        if (!r || wanderSeen.has(r.id) || r.prose) continue;   // skip prosified connection lines
        cands.push({ text: `${r.title ? r.title + '. ' : ''}${r.note || ''}`,
          source: { docId: r.docId, sn: r.sn, title: r.title, cursor: r.peak, reflId: r.id } });
      }
      if (!cands.length) return 0;

      const pick = murmur.learn.wander(cands, { floor: cfg.curiosityFloor });
      if (pick) { if (pick.source && pick.source.reflId) wanderSeen.add(pick.source.reflId); }
      else { for (const c of cands) if (c.source.reflId) wanderSeen.add(c.source.reflId); return 0; }  // nothing new — don't re-scan these

      const note = murmur.learn.learn(pick, { source: pick.source, origin: 'reading', register: 'curiosity' });
      noteLearning(note, pick);
      let learned = 1;

      // EXPLORE — reach ONE outward thread onto the web (opt-in; the surface enables it). Guarded on
      // the license, a working search seam, and web consent; a bad fetch never costs the pass.
      if (state.murmurMode === 'explore' && cfg.internet !== false && typeof appCtx.webSearchAdmit === 'function' && appCtx.webMode() !== 'off') {
        try {
          const lead = murmur.learn.outwardLead(note, { known: knownLabels(), anchor: pick.source?.title || '' });
          if (lead) {
            murmur.mutter({ phrase: `wondering about ${lead.term} — going to read a little`, register: 'outward', intensity: 0.5 });
            const walk = await runCuriousResearch(lead.query, { search: appCtx.webSearchAdmit, anchor: lead.query, maxHops: cfg.hopsPerReach || 1, k: 3 });
            for (const d of (walk.docs || []).slice(0, 2)) {
              const text = String(d?.text || d?.web?.excerpt || '').trim();
              if (!text) continue;
              const web = { url: d?.web?.url || d?.web?.final_url || '', title: d?.web?.title || d?.title || lead.term, gist: text.slice(0, 160) };
              const wnote = murmur.learn.learn({ text, source: pick.source }, { origin: 'web', register: 'discovery', web });
              noteLearning(wnote, { curiosity: 0.6 });
              learned += 1;
            }
          }
        } catch { /* the web is best-effort — a strayed or failed reach never breaks the wander */ }
      }

      const n = state.learningSeen;
      logIt('learning', `Learned at rest — ${n} note${n === 1 ? '' : 's'} so far`,
        'see them in the Learning layer', { coalesce: true });
      appCtx.persist(); emit('learning');
      return learned;
    } finally { learnRunning = false; }
  };

  // The idle governor: a light interval that fires a deep pass only when NOT engaged — no turn
  // generating, and the user quiet for a beat. A keystroke or tap resets the clock, so deep
  // reading never competes with an active reader; it fills the lulls. Browser only (no timers,
  // no window in tests — the whole loop is inert under node).
  const markActivity = () => { lastActivity = Date.now(); };
  const deepIdleStart = () => {
    if (deepTimer || typeof window === 'undefined') return;
    lastActivity = Date.now();
    const bump = () => markActivity();
    try {
      window.addEventListener('keydown', bump, { passive: true });
      window.addEventListener('pointerdown', bump, { passive: true });
    } catch { /* no window events — the governor still ticks on time alone */ }
    const IDLE_MS = 12000;
    deepTimer = setInterval(() => {
      try {
        if (state.busy) return;                             // engaged
        if (Date.now() - lastActivity < IDLE_MS) return;    // the user is active
        if (!appCtx.topicSources().length) return;                 // nothing recorded yet
        // Promote murmur's connections first (cheap: drains a queue), then read deeper. connectTick
        // has its own quiescence (an empty queue), so it does not gate on deepSettled the way the
        // reflection pass does — a fresh recognition can arrive while deep reading has settled.
        void connectTick(false);
        void wanderTick(false);                             // self-guided learning — self-throttled to human pace
        if (deepSettled) return;                            // quiesced until the record grows
        deepTick(false);
      } catch { /* a bad pass never breaks the governor */ }
    }, 4000);
  };

  const reflections = () => state.reflections.slice();

  // A snapshot the migration can't digest must degrade to a fresh session, not an
  // unhandled boot rejection with `ready` never emitted — that bricked the surface
  // on EVERY visit until the user cleared site data.
  appCtx.restore().catch(() => { if (!state.ready) { state.ready = true; emit('ready'); } });

  Object.assign(appCtx, { connectTick, deepIdleStart, deepReaders, deepTick, deepWake, reflections, setMurmurMode, setMurmurVisible, wanderTick });
};
