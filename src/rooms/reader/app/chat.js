// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// chat
import { wrapRedacting } from '../../../model/index.js';
import { runTurn, runWebFollowup, formulateSearchQuery, searchAnnouncement, anchorTopicless, runTurnWithResearch, researchAnnouncement, modelDisambiguator, senseAnnouncement, runTurnWithCorroboration, corroborationAnnouncement, corroborationSettled, readDiscourse, clarifyDemandOf } from '../../../turn/index.js';
import { scopeSources } from '../scope-sources.js';
import { outstandingQuestion, answersAwaited } from '../../../frame/index.js';
import { senseGate } from '../../../turn/index.js';
import { answerSmalltalk } from '../../../enactor/answer/index.js';
import { answerMathTurn } from './math-door.js';
import { keepGuardAlive } from './guards.js';
import { nowIso, RESEARCH_HOPS, wantsLongform, LONGFORM_MAX_TOKENS } from './util.js';

export const installChat = (appCtx) => {
  const { audit, emit, ledger, logIt, monitor, state } = appCtx;
  // ── chat ───────────────────────────────────────────────────────────────────
  // `abort` (turn) + `opAbort` (ingest) + `stallGuard` are declared up in the ingest section so
  // `stop()` reaches EVERY long op, not just a chat turn — the universal Stop. Stop trips whichever
  // signals are in flight (turn, ingest, or both) and clears the busy label AT ONCE, so the UI
  // reflects "stopped" immediately even when a slow backend or a hung proxy is still unwinding in
  // the background (the op's own finally is a no-op by then). It never throws: a settled op has
  // already nulled its controller.
  //
  // The module `abort`/`stallGuard` refs only name the NEWEST turn — but turns can OVERLAP (ask
  // in one topic, switch, ask in another), so every in-flight turn's controller is ALSO tracked
  // in `liveTurns` and Stop halts them all; each turn cleans up only its own kit (armTurn below).
  // When the module refs were the only handle, the first turn's finally cleared the second turn's
  // live watchdog and nulled its controller — leaving that turn unstoppable and unsettleable:
  // the eternal "● reading the record" with a dead Stop button.
  const liveTurns = new Set();   // every in-flight turn's controller
  const stop = () => {
    for (const c of [...liveTurns]) { try { c.abort(); } catch { /* already done */ } }
    try { appCtx.opAbort?.abort(); } catch { /* already done */ }
    appCtx.setBusy(null);
  };

  // A NO-PROGRESS WATCHDOG — 4.1's `_stallGuard`, which 4.2 had dropped (the regression behind
  // "it gets stuck and I can't even hit Stop"). A turn's model decode or a web fetch can stall
  // OUTRIGHT — a promise that neither resolves nor rejects — leaving the answer bubble spinning
  // with nothing able to recover it. This aborts the turn's OWN signal (`ctrl`, captured — never
  // the module ref, which by trip time may be another turn's) AND rejects `race` when no
  // progress (a streamed token, a pipeline step, a research beat) arrives for `ms`, so the turn
  // always settles, the `finally` always runs, and the bubble always finalizes with whatever
  // streamed. `feed()` re-arms the deadline on every sign of life; a live-but-slow model runs on.
  const makeStallGuard = (ctrl, ms = 45000) => {
    let timer = null, tripped = false, stalled = false, trip = null;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const doTrip = (err) => { if (tripped) return; tripped = true; clear(); if (trip) trip(err); };
    const feed = () => {
      if (tripped) return;
      clear();
      timer = setTimeout(() => {
        stalled = true;   // the WATCHDOG fired — no progress for `ms`, distinct from a user Stop
        try { ctrl?.abort(); } catch { /* already aborted */ }
        doTrip(Object.assign(new Error('the turn stalled — no progress'), { stalled: true }));
      }, ms);
    };
    const race = new Promise((_, rej) => { trip = rej; });
    race.catch(() => {});   // a tripped guard nobody is racing must never surface as unhandled
    // A user Stop settles the turn AT ONCE — the bubble finalizes immediately even if the
    // backend is slow to unwind its decode, so Stop never feels dead.
    if (ctrl?.signal) ctrl.signal.addEventListener('abort',
      () => doTrip(Object.assign(new Error('stopped'), { stopped: true })), { once: true });
    feed();
    // `stalled()` is true ONLY when the no-progress timer fired (a wedge to recover from), never on a
    // user Stop — resetWedgedLocalModel keys off it so a deliberate Stop never reloads a healthy model.
    return { feed, clear, race, tripped: () => tripped, stalled: () => stalled };
  };

  // armTurn() → one turn's whole cancellation kit, SCOPED TO THAT TURN:
  //   ctrl       its AbortController (the walk's / the backends' signal)
  //   guard      its no-progress watchdog
  //   raceGuard  race a turn await against ITS watchdog: a stall rejects (and the signal
  //              aborts) so control returns instead of hanging
  //   keepAlive  feed ITS watchdog while an OPAQUE model call runs (keepGuardAlive above):
  //              query formulation / sense disambiguation stream nothing, so without this a
  //              slow local decode trips the 45s guard and reads as a stall. keepAliveFn
  //              wraps an injected async utility (the walk's disambiguator) the same way.
  //   disarm     the finally: clear ITS guard, drop ITS controller, and release the module
  //              refs only if they are still its own — never another turn's.
  const armTurn = () => {
    const ctrl = new AbortController();
    // The watchdog runs on the ADAPTIVE budget: 45s until a stall-probe proves this machine is
    // merely slow, then doubled per proof (capped) so honest long decodes stop being aborted.
    const guard = makeStallGuard(ctrl, appCtx.stallBudgetMs);
    liveTurns.add(ctrl);
    appCtx.abort = ctrl; appCtx.stallGuard = guard;   // the newest turn is what the beats feed
    const keepAlive = (p, opts) => keepGuardAlive(guard, p, opts);
    return {
      ctrl, guard, keepAlive,
      raceGuard: (p) => Promise.race([p, guard.race]),
      keepAliveFn: (fn) => (typeof fn === 'function' ? (...a) => keepAlive(fn(...a)) : fn),
      disarm: () => {
        guard.clear();
        liveTurns.delete(ctrl);
        if (appCtx.stallGuard === guard) appCtx.stallGuard = null;
        if (appCtx.abort === ctrl) appCtx.abort = null;
      },
    };
  };

  // markStoppedPartial(pending, stoppedOrStalled, hadPartial) — reconcile a STOPPED/STALLED turn's
  // metadata on the catch path. Stop (or the 45s watchdog) settles the turn by rejecting the guard
  // race, so the catch below runs and finishMessage NEVER does — which means the grounding pipeline
  // (bind → factcheck → veto, plus the "underline the unsourced facts" marking) never ran over
  // whatever streamed. Left alone, the frozen partial reads as a normal answer wearing only a small
  // "ungrounded" chip, and its metadata lies: the "New topic" export showed route "stopped" while
  // `stopped` stayed false, `grounding` null, `flags` empty — the fingerprint of finishMessage being
  // skipped. Set the record straight so a frozen partial can never read — in the bubble OR a later
  // export/audit — as a checked answer: `stopped` true (finishMessage would have set it), never
  // grounded, and — when real prose streamed before the cut — flagged `unverified` so the surface
  // bands it as an unchecked draft. A stop with nothing streamed (only the fallback line) needs no
  // draft banner: the honest stopped/route flags already say it.
  const markStoppedPartial = (pending, stoppedOrStalled, hadPartial) => {
    if (!stoppedOrStalled) return;
    pending.stopped = true;
    pending.grounded = false;
    if (hadPartial) {
      pending.unverified = true;
      // APPEND, don't overwrite: any flags the turn already surfaced (a referent-diffuse
      // decline, a factcheck-limited note) are honest signals that must survive the stop, not
      // be replaced wholesale by the lone 'unverified' band. De-dupe so a re-entry can't stack it.
      const prior = Array.isArray(pending.flags) ? pending.flags.filter((f) => f && f.id !== 'unverified') : [];
      pending.flags = [...prior, { id: 'unverified', note: 'Stopped before grounding — this draft was not checked against your record.' }];
    }
  };

  // answerFromWeb(pending, q) — the empty-record auto path. Nothing is on the record, but the ask
  // is substantive, so REACH for the web the way 4.1 did: not a single fetch but a multi-hop
  // CURIOSITY WALK (runTurnWithResearch) — formulate a real query (the "write me an essay about
  // dolphins" → "dolphins" rewrite lives in web.js), then follow what surprises it while it stays on
  // topic, fold every kept page in, and answer GROUNDED over the seam it mined. Each hop streams a
  // beat into the answer's research trail, so the user SEES what it is searching and reading — the
  // disclosure 4.1 had and 4.2 had dropped to a lone busy label. Browser-only in practice (needs
  // fetch + a model); in Node it degrades to the "couldn't pull anything" line rather than throwing.
  const answerFromWeb = async (pending, q, { onToken = null } = {}) => {
    appCtx.warmMinilm();
    // Arm the abort + watchdog BEFORE the first await, so a stalled model load or a hung fetch
    // is always recoverable (and Stop always has something to abort), not just the walk itself.
    // The kit is THIS TURN'S OWN (armTurn): its callbacks — which outlive the turn while a slow
    // backend unwinds its decode — read the captured signal/guard, never the module refs,
    // which by then may belong to another turn (or be null).
    const turn = armTurn();
    const { raceGuard, keepAlive, keepAliveFn } = turn;
    const turnSignal = turn.ctrl.signal;
    // The lineage thread (topicThread), MINUS the question just pushed — so a follow-up asked
    // from a child quest still resolves its pronouns/back-references against the quest it
    // followed, even on this empty-record path (the record being empty says nothing about the
    // conversation being new). Before this, `history: []` here meant the query formulator and
    // the walk both read the turn in isolation.
    const thread = appCtx.topicThread(appCtx.topic())
      .slice(0, -1)
      .map((x) => ({ role: x.role, content: x.text, ...(x.unbound ? { unbound: true } : {}) }));
    // A referential turn nothing can anchor — "what did he do?" as the FIRST ask, with no
    // thread naming who "he" is. This path walks the web directly (no proposer gate in
    // front of it), and searching the turn's function words verbatim admits whatever
    // matches them into the record — the exported junk. Say what's missing instead.
    if (anchorTopicless(q, thread) == null) {
      turn.disarm(); appCtx.setBusy(null);
      pending.text = 'I can\'t tell yet who or what that refers to — nothing earlier in this quest names it. Say the name (or ask the full question), or drop a URL, file, or pasted text in the bar above.';
      pending.route = 'empty';
      pending.pending = false;
      appCtx.persist(); emit('messages');
      return pending;
    }
    try {
      const m = await raceGuard(appCtx.ensureModel());
      appCtx.setBusy({ kind: 'search', label: 'Looking this up on the web…' });
      const query = await raceGuard(keepAlive(formulateSearchQuery({ model: m, question: q, history: thread, fallback: q, signal: turnSignal })));
      appCtx.beat(pending, 'start', researchAnnouncement(query, { maxHops: RESEARCH_HOPS }) || `Searching the web for “${query}”…`);
      appCtx.setBusy({ kind: 'search', label: `Searching the web — ${query}` });
      logIt('search', `Web research "${query}"`, 'auto · nothing on record');
      const result = await raceGuard(runTurnWithResearch({
        question: q, docs: [], model: m,
        embedder: appCtx.hashEmb,
        geometricEmbedder: (appCtx.minilm?.isWarm?.() ? appCtx.minilm : null) || undefined,
        shapeLibrary: appCtx.shapeLib || undefined,   // the form predictor (turn/shape.js) — inert until built
        auditLog: audit, history: thread, now: new Date(),   // live clock → a time-relative web answer is dated from fact
        stream: true,
        // A backend slow (or unable) to honor the abort keeps handing us tokens after Stop; appending
        // them to the already-finalized bubble is the "I hit Stop but it kept typing" bug. Once the
        // turn's signal is aborted the bubble is settled and no longer ours to write — drop them.
        onToken: (tok) => { if (turnSignal.aborted) return; turn.guard.feed(); pending.text += String(tok); if (onToken) onToken(tok); emit('stream'); },
        signal: turnSignal,
        monitor, ledger,   // the session's self/world line and commitment ledger (enactor)
        onStep: (name, ctx, data) => { if (turnSignal.aborted) return; turn.guard.feed(); appCtx.setBusy({ kind: 'turn', label: appCtx.stageLabel(name) }); appCtx.foldBeat(pending, name, data); if (name === 'fold') appCtx.observeMurmur(ctx); appCtx.releaseOnAnswer(pending, name, ctx); },
      }, {
        search: appCtx.webSearchAdmit, seed: query, maxHops: RESEARCH_HOPS, k: 3,
        // The meaning leash: score each hop for MEANING against the topic (the formulated seed query,
        // enriched by the seed page) so a same-surname namesake strays off the leash, and SAVE only the
        // pages the walk keeps (onKeep) — never the strayed ones — by fetching with register:false.
        embed: appCtx.walkEmbed(),
        onKeep: (docs) => { for (const d of docs) appCtx.saveWalkDoc(d); },
        searchOpts: { kind: 'auto', fetchPages: true, register: false },
        // The thumb: when the subject is a homonym, commit to ONE sense before gathering and search
        // for it, so "dolphins" doesn't fetch a mix of the animal and the football team (disambiguate.js).
        // keepAliveFn: this 220-token decode runs before the first hop's beat — feed the guard while it thinks.
        disambiguate: keepAliveFn(modelDisambiguator(m, { history: thread, question: q, signal: turnSignal })),
        onHop: (h) => appCtx.hopBeat(pending, h, query),
        onHopDone: (h) => appCtx.hopDoneBeat(pending, h),
        signal: turnSignal,
      }));
      const committedSense = senseAnnouncement(result.research && result.research.sense);
      if (committedSense) appCtx.beat(pending, 'read', committedSense);
      const gathered = (result.research && result.research.results) || 0;
      if (!gathered) {
        appCtx.beat(pending, 'warn', `Couldn't pull anything readable for “${query}”.`);
        appCtx.settleTrail(pending, result.research);
        pending.text = `I searched the web for “${query}” but couldn't pull anything readable back. The web proxy may be unreachable — try again, or drop a URL, file, or pasted text in the bar above.`;
        pending.route = 'empty';
        return pending;
      }
      appCtx.settleTrail(pending, result.research);
      appCtx.finishMessage(pending, {
        ...result,
        webFetched: {
          query, trigger: 'gap', results: gathered,
          sources: (result.research && result.research.sources) || [],
        },
      });
    } catch (e) {
      // A stall (watchdog) or a user Stop keeps whatever streamed; only a genuine fault gets the
      // error line, so a stopped/stalled turn never reads as a crash.
      const stalledOut = turn.guard.stalled();   // the no-progress WATCHDOG fired — a wedge, not a user Stop
      const stoppedOrStalled = turn.guard.tripped() || turnSignal.aborted;
      const hadPartial = !!pending.text;   // the walk streamed prose before the stop cut in
      appCtx.settleTrail(pending, null);
      // A wedged local engine — reload it / fall to the backup so "try again" isn't advice to
      // re-hit a dead singleton. BOTH wedge shapes count: dark from the first token, and the
      // frozen-session shape — a preamble streams, THEN the decode dies (the export that led
      // here hung exactly so, and the old `nothing streamed` gate left that engine standing,
      // wedging every turn after it). A 45s all-quiet stall can only be the decode: fetches
      // self-cut at 20s and every beat feeds the guard. The partial is kept and banded
      // unverified (markStoppedPartial); a user Stop (stalled() false) never reloads a healthy
      // model. Read `model` before the reset nulls it.
      const wedged = stalledOut && appCtx.model?.kind === 'local';
      if (wedged) appCtx.resetWedgedLocalModel();
      pending.text = pending.text || (wedged
        ? 'The turn stalled — I’m checking the in-browser model and will reload it if it died. Try again in a moment.'
        : stoppedOrStalled
          ? 'The web lookup stalled and was stopped before it could finish. Try again, or drop a URL, file, or pasted text in the bar above.'
          : (state.model.state === 'error'
            ? `${state.model.note}. Pick a model from the chip in the header, then retry — or drop a URL, file, or pasted text in the bar above.`
            : `The web lookup failed: ${String(e?.message || e)}`));
      pending.route = stoppedOrStalled ? 'stopped' : 'error';
      markStoppedPartial(pending, stoppedOrStalled, hadPartial);
    } finally {
      turn.disarm();
      appCtx.finishTrail(pending);   // stop the trail clock on the empty/error paths too (finishMessage
                              // does it on the success path; the early returns bypass it)
      appCtx.setBusy(null);
      pending.pending = false;
      appCtx.persist(); emit('messages');
    }
    return pending;
  };

  // answerFromRecordOnly() — Audit mode's no-model answer path. It never calls
  // ensureModel(), never reaches the web, and never invents prose beyond a receipt of
  // what the deterministic record search found. This keeps Chat useful when optional
  // synthesis is off: Search/Reader/Findings remain the authority, and the answer is
  // explicitly a mechanical index into them.
  const answerFromRecordOnly = (pending, q, docs, { mode = 'auto', floorTalk = null } = {}) => {
    if (floorTalk) {
      pending.text = floorTalk.text;
      pending.route = 'phatic';
      pending.pending = false;
      appCtx.persist(); emit('messages');
      return pending;
    }
    if (!docs.length) {
      pending.text = mode === 'off'
        ? 'Audit mode is on and nothing is recorded yet. Add a URL, file, or pasted text; the reader core will analyze it without an LLM.'
        : 'Audit mode is on and nothing is recorded yet. Add a source first, or switch Optional synthesis to CPU/WebGPU/hosted if you want a web-research answer.';
      pending.route = 'empty';
      pending.pending = false;
      appCtx.persist(); emit('messages');
      return pending;
    }
    let r = null;
    try { r = appCtx.searchRecord(q); } catch { r = null; }
    const entities = r?.entities || [];
    const claims = r?.claims || [];
    const passages = r?.passages || [];
    const sources = r?.sources || [];
    const total = entities.length + claims.length + passages.length + sources.length;
    const lines = [
      '## Audit mode',
      'No generative model ran. I searched the recorded sources mechanically and kept the answer to record evidence.',
    ];
    if (passages.length) {
      lines.push('', '## Matching passages');
      for (const p of passages.slice(0, 3)) {
        const idx = (pending.cites?.length || 0) + 1;
        pending.cites = pending.cites || [];
        pending.cites.push({ idx, sn: p.sn, reg: p.reg, title: p.title, docId: p.docId, unit: p.unit, text: p.text });
        lines.push(`> ${String(p.text || '').slice(0, 260)} [s${idx}]`);
      }
    }
    if (entities.length) {
      lines.push('', '## Entities');
      lines.push(entities.slice(0, 5).map((e) => `**${e.label}** · ${e.mentions || 0} mention${(e.mentions || 0) === 1 ? '' : 's'}`).join('  \n'));
    }
    if (claims.length) {
      lines.push('', '## Claims on record');
      for (const c of claims.slice(0, 3)) lines.push(`- ${c.text || c.quote || c.subject}`);
    }
    if (!total) {
      lines.push('', 'No exact record hit found. Try the Search tab for lexical matches, or record more sources.');
    } else {
      lines.push('', `_${total} deterministic hit${total === 1 ? '' : 's'} found. Use Search, Graph, Findings, or Pins to inspect and save the evidence._`);
    }
    pending.text = lines.join('\n');
    pending.route = 'record-only';
    pending.grounded = passages.length > 0 || claims.length > 0 || entities.length > 0;
    pending.pending = false;
    appCtx.persist(); emit('messages');
    return pending;
  };

  // phaticReply(model, {question, hasDoc, …}) → one short warm social line IN THE MODEL'S OWN VOICE
  // — the phatic door's whole answer. No regex: the same model that read the turn as social now says
  // the word back, inviting a question (a document in scope) or a recorded source (none). Fail-soft
  // to a single neutral line if the decode comes back empty, so the door always speaks.
  const phaticReply = async (model, { question, hasDoc, signal, raceGuard, keepAlive }) => {
    const sys = hasDoc
      ? 'The user sent a social message — a greeting, a thanks, or a goodbye — while a document is open. Reply in ONE short, warm, natural sentence, and gently invite them to ask about what they have open. Do not answer a question they did not ask; no lists.'
      : 'The user sent a social message — a greeting, a thanks, or a goodbye. Reply in ONE short, warm, natural sentence. You may mention that they can record a source (a URL, a file, or pasted text) and ask about it. No lists.';
    try {
      const out = await raceGuard(keepAlive(model.phrase(
        [{ role: 'system', content: sys }, { role: 'user', content: String(question || '') }],
        { maxTokens: 64, temperature: 0.6, signal })));
      const text = String(out || '').replace(/\s+/g, ' ').trim();
      if (text) return text;
    } catch { /* fall through to the neutral line */ }
    return hasDoc
      ? 'Hey — ask me anything about what you have open.'
      : 'Hey — record a source and ask me about it, or ask me anything.';
  };

  const chat = async (question, { onToken = null, web = null } = {}) => {
    const t = appCtx.topic();
    const q = String(question || '').trim();
    if (!t || !q) return null;
    const userMsg = { id: `m${++appCtx.mn}`, role: 'user', text: q, at: nowIso() };
    t.messages.push(userMsg);
    emit('messages');
    appCtx.topicAutoName(t);   // the first question names a placeholder topic, live in the sidebar

    const docs = appCtx.topicDocs();
    const pending = { id: `m${++appCtx.mn}`, role: 'assistant', text: '', at: nowIso(), pending: true, cites: [], grounded: false };
    t.messages.push(pending);
    emit('messages');

    // The MATH FRONT DOOR (app/math-door.js): a pure-arithmetic turn is computed by math.js here — no model, no web — ahead of every reach; not-math falls through untouched.
    if (await answerMathTurn(q, pending, appCtx)) return pending;

    // The web reach for THIS turn. A caller may pin it (`web` — a test that must stay offline, an
    // internal call that must not touch the net); otherwise the persisted global stands. BOTH
    // surfaces honor it (default `auto`): Ask is record-FIRST — it grounds in the record, and a
    // measured gap reaches the web (docs/web-search.md); a global `off` keeps both record-only.
    const mode = web || appCtx.webMode();
    const floorTalk0 = answerSmalltalk(q, { hasDoc: docs.length > 0 });
    if (appCtx.synthesisEnabled && !appCtx.synthesisEnabled()) {
      return answerFromRecordOnly(pending, q, docs, { mode, floorTalk: floorTalk0 });
    }

    // ── THE FRONT DOOR — the phatic short-circuit is DETERMINISTIC (docs/response-demand.md) ──────
    // A turn is answered with one warm social line (and NEVER reaches retrieval / grounding / the
    // web) ONLY when the offline floor `answerSmalltalk` recognizes it as social from the user's own
    // words — a greeting, a thanks, a goodbye, a how-are-you. The tiny-model discourse read
    // (readDiscourse) is STILL taken once per turn, but it no longer decides phatic: it feeds only
    // the clarify gate below. This reverses the earlier "physics, not a regex" phatic door, where the
    // PHATIC CURRENT of the model's paragraph (phaticFromSpeech → metaRoute) could win the route
    // relaxation and short-circuit the turn. On a 1B/1.5B model that read is unreliable AND biased —
    // it routinely describes a real question ("what is the best elvis movie?") as a casual/social ask,
    // and the phatic exemplars then out-score ground/research — so a genuine question was
    // intermittently swallowed as chit-chat, the sources never consulted and no search fired, and the
    // SAME question flipped answer to answer (the exported "works sometimes, not another" flakiness).
    // Deciding phatic on the deterministic floor makes routing reproducible and can never discard a
    // real question; the cost is a paraphrased greeting the floor misses ("you around?") gets a normal
    // turn instead of a warm line — the safe direction. Fail-soft: no model / empty read / any throw
    // still proceeds as a substantive turn; a clear greeting is honored even if the model faults.
    appCtx.warmMinilm();
    // This turn's cancellation kit, armed BEFORE the front-door decode so even that read is watched,
    // stoppable, and signal-threaded (see answerFromWeb) — never a fresh way for a turn to hang.
    const turn = armTurn();
    const { raceGuard, keepAlive, keepAliveFn } = turn;
    const turnSignal = turn.ctrl.signal;

    // The settled dialogue is the topic's LINEAGE thread, not its own messages alone — a
    // follow-up lives in a fresh child quest (askQuestion), whose only message is the question
    // just pushed. topicThread walks the ancestor chain so the discourse read, the clarify
    // fold below, and the turn's own history all see the conversation the user actually had.
    const settledMsgs = appCtx.topicThread(t);
    const priorHistory = settledMsgs.slice(0, -1).map((x) => ({ role: x.role, content: x.text }));
    // THE INSTANT FLOOR (docs/response-demand.md, rung 3) — the phatic gate's OFFLINE layer, read off
    // the user's OWN words with no model. A bare greeting/thanks/goodbye is unmistakably social from
    // the message alone, so it settles phatic HERE without depending on the tiny model's discourse read
    // landing phatic. It composes with (does not replace) the graded model door below: the floor catches
    // the clear cases deterministically, the read catches the paraphrases it misses ("you around?"). A
    // FLOOR, not the decision — answerSmalltalk is folded in the way isExplicitCompose is at the route
    // grain: it informs, it does not decide. This is the layer the front-door refactor dropped: without
    // it, a one-word "hi" whose 1B discourse read did not cohere to the phatic door fell through to the
    // grounding pipeline ("The document does not say — scanned N sentences") and, in auto web mode,
    // spent a corpus-steered web walk on a hello.
    const floorTalk = floorTalk0 || answerSmalltalk(q, { hasDoc: docs.length > 0 });
    let discourse = '';
    try {
      appCtx.setBusy({ kind: 'turn', label: 'Reading the turn…' });
      const m0 = await raceGuard(appCtx.ensureModel());
      // The floor already settled a clear greeting — don't spend the discourse read on it. Otherwise
      // the read is taken for the clarify gate below (it no longer decides phatic).
      discourse = floorTalk ? '' : await raceGuard(keepAlive(readDiscourse(m0, { history: priorHistory, now: new Date(), scope: t.title || '', signal: turnSignal })(q)));
      if (floorTalk) {
        pending.text = await phaticReply(m0, { question: q, hasDoc: docs.length > 0, signal: turnSignal, raceGuard, keepAlive });
        pending.route = 'phatic';
        pending.pending = false;
        turn.disarm(); appCtx.setBusy(null);   // the warm word IS this turn's answer — release its kit
        appCtx.persist(); emit('messages');
        return pending;
      }
    } catch (_) {
      // The graded read is best-effort — a fault proceeds to the normal turn. But if the OFFLINE floor
      // already found the turn social (and this was a real fault, not a user Stop), honor it with the
      // floor's own warm line rather than grounding a greeting: the model may have failed to warm, and
      // the floor never needed it.
      if (floorTalk && !turnSignal.aborted) {
        pending.text = floorTalk.text;
        pending.route = 'phatic';
        pending.pending = false;
        turn.disarm(); appCtx.setBusy(null);
        appCtx.persist(); emit('messages');
        return pending;
      }
    }

    // The front-door read shares THIS turn's abort signal. If it was stopped (the user hit Stop
    // during "Reading the turn…") or the watchdog tripped, the signal is now aborted — and the
    // grounded turn below would decode NOTHING, because every backend returns '' immediately on a
    // pre-aborted signal. That is the empty "stopped" answer that STILL grinds the whole pipeline
    // and even proposes a web search — the export's "llm outputLen:0 · ms:0 → propose-web →
    // stopped" fingerprint. Settle it honestly and at once instead of running a doomed turn on a
    // dead signal. Inert on every normal turn (the signal is only aborted on a Stop/stall).
    if (turnSignal.aborted) {
      const hadPartial = !!pending.text;               // did real prose stream first? (front door: usually none)
      const stalledOut = turn.guard.stalled();         // the 45s watchdog fired — a wedge, not a user Stop
      const wedged = stalledOut && appCtx.model?.kind === 'local';
      if (wedged) appCtx.resetWedgedLocalModel();
      pending.text = pending.text || (wedged
        ? 'The turn stalled — I’m checking the in-browser model and will reload it if it died. Ask again and it should answer.'
        : 'Stopped before the answer finished. Ask again to retry.');
      pending.route = 'stopped';
      markStoppedPartial(pending, true, hadPartial);
      turn.disarm(); appCtx.finishTrail(pending); appCtx.setBusy(null);
      pending.pending = false; appCtx.persist(); emit('messages');
      return pending;
    }

    if (!docs.length) {
      // An empty record is not a dead end for a substantive ask: it reaches for the web when web
      // mode allows it — `auto` fetches real pages and answers grounded in them (answerFromWeb);
      // `confirm`/`off` leave it as a one-click web-search proposal so the first question fetches
      // its own sources on the button. (A phatic turn was already answered by the front door above.)
      turn.disarm(); appCtx.setBusy(null);   // answerFromWeb arms its own kit; the off/confirm lines need none
      if (mode === 'auto') return answerFromWeb(pending, q, { onToken });
      pending.text = 'Nothing is on the record yet, so I can\'t ground an answer to that. I can search the web and record what comes back — or read any URL, file, or pasted text you drop in the bar above.';
      pending.route = 'empty';
      // Offer the one-click search button in confirm mode; in off, respect the opt-out. `question`
      // rides along so the go-ahead (approveWebSearch) re-runs THIS turn with the web engaged.
      if (mode === 'confirm') pending.webProposal = { query: q, question: q, rationale: 'no sources recorded yet', trigger: 'gap' };
      pending.pending = false;
      appCtx.persist(); emit('messages');
      return pending;
    }

    // ── subject-sense disambiguation (docs/response-demand.md, Stage 1) ──────────────────────────
    // Before grounding/searching, decide whether the question turns on a sense the user must pin
    // down. The recorded corpus (senseGate) can only see that a subject's SPELLING collides across
    // entities — "dolphin" names the animal AND the Miami Dolphins — so on its own it asks a choice
    // question on ANY such collision, including a plainly clear ask ("what is the smallest dolphin").
    // Whether to ACT on it is the physics' call, read with the router's Born currents off the SAME
    // discourse statement the front door already spoke (clarifyDemandOf on `discourse`) — no second
    // decode. The corpus supplies the OPTIONS; the physics decides whether to ask at all. If THIS
    // turn is a reply to a question we asked, we NEVER reopen disambiguation on it — the reply folds
    // back onto the original ask (a literal choice recovers the chosen option; any other reply rides
    // in whole as a sense hint). Fail-soft: a fault here never costs the turn, and with no discourse
    // the clarify current is empty and nothing is asked (the safe direction).
    let effectiveQ = q;
    try {
      const settled = settledMsgs;
      // the current user turn (q) is already appended; the fold before this turn drops it, so the
      // "outstanding" question is the assistant's clarify, not read past by the new message.
      const awaiting = outstandingQuestion(settled.slice(0, -1));
      // the ask a question of ours was ABOUT: the user turn before our last assistant message.
      const originalAsk = () => {
        for (let i = settled.length - 1; i >= 0; i--) {
          if (settled[i].role === 'assistant') {
            for (let j = i - 1; j >= 0; j--) if (settled[j].role === 'user') return String(settled[j].text || '');
            return '';
          }
        }
        return '';
      };
      if (awaiting) {
        // A REPLY to a question we posed. Never re-open disambiguation on it (the loop); fold it back
        // onto the original ask so the subject is not lost.
        const prior = answersAwaited({ awaiting }, q);
        const original = originalAsk();
        if (prior && prior.answered) {
          const scope = (prior.choice && prior.choice.length ? prior.choice : (prior.polarity ? [prior.polarity] : [])).join(' ');
          if (original) effectiveQ = scope ? `${original} ${scope}` : original;
        } else if (original) {
          effectiveQ = `${original} ${q}`;
        }
      } else {
        // A FRESH ask. Only a real corpus collision is even a candidate for disambiguation; whether
        // to ACT is the physics' call, read off the discourse the front door already spoke.
        const gate = senseGate(q, docs);
        if (gate && gate.resolution === 'ask' && clarifyDemandOf(discourse) === 'clarify') {
          pending.text = gate.ask.question;
          pending.route = 'clarify';
          pending.pending = false;
          turn.disarm(); appCtx.setBusy(null);   // the clarify IS this turn's answer — release its kit
          appCtx.persist(); emit('messages');
          return pending;
        }
      }
    } catch (_) { /* disambiguation is best-effort; fall through to the normal turn */ }

    try {
      const m0 = await raceGuard(appCtx.ensureModel());
      // The confidentiality lever: when redact-when-hosted is on, wrap the talker in the privacy
      // membrane so a REMOTE backend sees only tokens (a no-op for a local model, or when off).
      const m = appCtx.redactRemote() ? wrapRedacting(m0, appCtx.redactionNames) : m0;
      // The conversation handed to the turn is the settled dialogue MINUS this turn's own
      // question (it rides separately as `question`). Drop exactly one — the current user turn,
      // which is last after the empty pending assistant is filtered out — so the most recent
      // assistant reply STAYS in. The old `-2` dropped that reply too, so the grounded prompt's
      // "conversation so far" band only ever showed the user's turns (the exported bug: a bare
      // "You: research elvis films…" with the answer it refers to missing), leaving a follow-up
      // like "which is the best?" nothing to resolve against. `-1` matches priorHistory above.
      // Read off the LINEAGE thread (settledMsgs = topicThread(t)): a follow-up lives in a
      // fresh child quest whose own messages hold nothing before this question, and handing
      // the turn an empty history is what left "what did he do?" with no referent to bind.
      // foldConversation then holds the recent window to its token budget and folds the rest.
      const history = settledMsgs
        .slice(0, -1)
        .map((x) => ({ role: x.role, content: x.text, ...(x.unbound ? { unbound: true } : {}) }));
      // A long-form ask ("write me an essay …") gets a large budget so the answer can develop
      // past the pointed-answer cap; a normal ask keeps the per-task budget the pipeline picks.
      const longform = wantsLongform(effectiveQ);
      // Separate signal from noise: ground this turn on the sources that bear on the
      // question (the substantial documents + any small source it distinctly names),
      // not the whole topic pile. `docs` above still holds the full set for the front
      // door and the disambiguation gate; only what the answer GROUNDS on is scoped.
      // Set-aside is logged, never silent — the reader can see the focus it took.
      const scopedSources = scopeSources(effectiveQ, appCtx.topicSources());
      const scopedDocs = scopedSources.map(appCtx.docFor).filter(Boolean);
      const setAside = docs.length - scopedDocs.length;
      if (setAside > 0) logIt('skip', `Focused on ${scopedDocs.length} of ${docs.length} sources for this question — set aside ${setAside} unrelated to it`, appCtx.topic()?.id);
      const groundDocs = scopedDocs.length ? scopedDocs : docs;
      // The fold-composed toplines (docs/topline.md), handed to the turn so the model phrases what
      // the reading already decided rather than re-deriving from raw lines. `foldSummary` is the
      // standing summary of the source(s) the turn grounds on (auto-composed on record); the entity
      // map lets the turn fold in the toplines of the figures it centres on. Both are grounded and
      // containment-checked — pre-digested, safe to lean on. Aligned with groundDocs above.
      const summarySources = (scopedSources.length ? scopedSources : appCtx.topicSources()).slice(0, 6);
      const foldSummary = summarySources.map((s) => (s.summary?.text || '').trim()).filter(Boolean).join('\n\n') || null;
      const entitySummaries = appCtx.entitySummaryMap();
      const args = {
        question: effectiveQ, docs: groundDocs, model: m,
        embedder: appCtx.hashEmb,
        geometricEmbedder: (appCtx.minilm?.isWarm?.() ? appCtx.minilm : null) || undefined,
        shapeLibrary: appCtx.shapeLib || undefined,   // the form predictor (turn/shape.js) — inert until built
        foldSummary, entitySummaries,          // the fold-composed toplines, pre-digested (docs/topline.md)
        auditLog: audit, history, now: new Date(),   // live clock (bands.js currentMomentLine) → date/time answered from fact, not the "no real-time clock" confabulation
        stream: true,
        // Arm the reaction-weighing stage: when a grounded answer earned no witness and the
        // mechanical read already doubts it, the reader is asked to REACT to its own draft and
        // the reaction is put through the Born rule. While streaming (the reader has already
        // seen the text) a negative reaction rides as a refusing flag; off-stream it sends the
        // draft back for another pass. Off elsewhere by default — golden turns stay byte-identical.
        validate: true,
        ...(longform ? { maxTokens: LONGFORM_MAX_TOKENS, longform: true } : {}),
        // A backend slow (or unable) to honor the abort keeps handing us tokens after Stop; appending
        // them to the already-finalized bubble is the "I hit Stop but it kept typing" bug. Once the
        // turn's signal is aborted the bubble is settled and no longer ours to write — drop them.
        onToken: (tok) => { if (turnSignal.aborted) return; turn.guard.feed(); pending.text += String(tok); if (onToken) onToken(tok); emit('stream'); },
        signal: turnSignal,
        monitor, ledger,   // the session's self/world line and commitment ledger (enactor)
        onStep: (name, ctx, data) => { if (turnSignal.aborted) return; turn.guard.feed(); appCtx.setBusy({ kind: 'turn', label: appCtx.stageLabel(name) }); appCtx.foldBeat(pending, name, data); if (name === 'fold') appCtx.observeMurmur(ctx); appCtx.releaseOnAnswer(pending, name, ctx); },
      };
      let result = await raceGuard(runTurn(args));
      // The document turn measured a gap it couldn't close (or an answer worth confirming
      // against the world). In `auto` we take the go-ahead the moment it's proposed.
      // `off`/`confirm` leave the proposal for the in-chat "Search the web" button.
      if (result.webProposal && mode === 'auto') {
        const proposal = result.webProposal;
        // The document turn only PROPOSED the web; the real answer is still coming (a curiosity
        // walk that clears and re-streams this bubble, or a verify/witness re-run). So if bind
        // already released the composer on the first draft, re-hold it — this turn is not done.
        // The continuation threads the same onStep, so releaseOnAnswer fires again when the
        // web-grounded answer binds; the `finally` is the backstop either way.
        pending.pending = true; emit('messages');
        if (proposal.trigger === 'gap') {
          // A GAP the record couldn't close — go WIDE the way 4.1 did: a multi-hop curiosity walk,
          // not one fetch, streaming its search/read beats into the trail. Clear the first ("not in
          // the document") draft so the grounded re-run's stream replaces it rather than appends.
          const query = await raceGuard(keepAlive(formulateSearchQuery({ model: m, question: proposal.query, history, fallback: proposal.query, signal: turnSignal })));
          appCtx.beat(pending, 'start', researchAnnouncement(query, { maxHops: RESEARCH_HOPS }) || `Searching the web for “${query}”…`);
          appCtx.setBusy({ kind: 'search', label: `Searching the web — ${query}` });
          pending.text = ''; emit('stream');
          const walked = await raceGuard(runTurnWithResearch(args, {
            search: appCtx.webSearchAdmit, seed: query, maxHops: RESEARCH_HOPS, k: 3,
            // The meaning leash + keep-gated save: score hops for meaning against the topic so a
            // namesake strays, and record only the pages the walk keeps (never the strayed ones).
            embed: appCtx.walkEmbed(),
            onKeep: (docs) => { for (const d of docs) appCtx.saveWalkDoc(d); },
            searchOpts: { kind: 'auto', fetchPages: true, register: false },
            // The thumb: commit to one sense of a homonymous subject before gathering (disambiguate.js).
            // keepAliveFn feeds the guard through this pre-hop decode so a slow model can't false-stall the walk.
            disambiguate: keepAliveFn(modelDisambiguator(m, { history, question: proposal.query, signal: turnSignal })),
            onHop: (h) => appCtx.hopBeat(pending, h, query),
            onHopDone: (h) => appCtx.hopDoneBeat(pending, h),
            signal: turnSignal,
          }));
          const committedSense = senseAnnouncement(walked.research && walked.research.sense);
          if (committedSense) appCtx.beat(pending, 'read', committedSense);
          appCtx.settleTrail(pending, walked.research);
          result = {
            ...walked, webProposal: proposal,
            webFetched: {
              query, trigger: 'gap', results: (walked.research && walked.research.results) || 0,
              sources: (walked.research && walked.research.sources) || [],
            },
          };
        } else if (proposal.trigger === 'corroborate') {
          // The answer is grounded but rests on a SINGLE meaningfully-distinct source. Keep the
          // answer already streamed — go find an INDEPENDENT second source that corroborates it,
          // hopping until it does or can be said not to exist (turn/corroborate.js). The trail
          // streams the search; the outcome rides back as a flag, it never rewrites the answer.
          const query = await raceGuard(keepAlive(formulateSearchQuery({ model: m, question: effectiveQ, history, fallback: effectiveQ, signal: turnSignal })));
          appCtx.beat(pending, 'start', corroborationAnnouncement(query) || `Looking for an independent source for “${query}”…`);
          appCtx.setBusy({ kind: 'search', label: `Corroborating — ${query}` });
          // Enrich the answer's own sources with their host/byline so the walk knows which voices a
          // corroborator must be distinct FROM (a same-host reprint is not a second source).
          const enrich = {};
          for (const s of (state.sources || [])) if (s.docId) enrich[s.docId] = { url: s.url || s.web?.url || s.host || '', author: s.byline || s.author || null };
          result = await raceGuard(keepAlive(runTurnWithCorroboration(args, result, {
            search: appCtx.webSearchAdmit, enrich, k: 3, formulate: async () => query,
            onHop: (h) => { turn.guard.feed(); appCtx.hopBeat(pending, h, query); },
            onHopDone: (h) => { turn.guard.feed(); appCtx.hopDoneBeat(pending, h); },
            signal: turnSignal,
          })));
          const settled = corroborationSettled(result.corroboration);
          if (settled) appCtx.beat(pending, 'read', settled);
          if (result.corroboration) pending.research && (pending.research.summary = settled || 'Sought corroboration');
          appCtx.settleTrail(pending, null);
        } else {
          // A verify (check the general-knowledge answer, keep it) or witness (confirm the reading)
          // is a targeted single-shot, not a walk — augment/re-run through runWebFollowup as before.
          const note = searchAnnouncement(proposal);
          appCtx.setBusy({ kind: 'search', label: note || 'Searching the web…' });
          if (note) appCtx.beat(pending, 'start', note);
          if (proposal.trigger !== 'verify') { pending.text = ''; emit('stream'); }
          // keepAlive: the verify re-run inside is a full grounded turn with the UI callbacks
          // stripped (it must not stream over the live bubble) — so it feeds the watchdog
          // nothing on its own, and an honest slow re-run read as a stall. The turn's signal
          // (in args) still stops it for real; the guard only stops BLAMING it.
          result = await raceGuard(keepAlive(runWebFollowup(args, result, { webSearch: appCtx.webSearchAdmit, k: 4 })));
          const n = (result.webFetched && result.webFetched.results) || 0;
          if (result.webFetched) appCtx.beat(pending, 'read', `Read ${n} web source${n === 1 ? '' : 's'}`);
          if (pending.research) pending.research.summary = `Checked ${n} web source${n === 1 ? '' : 's'}`;
          appCtx.settleTrail(pending, null);
        }
      }
      appCtx.finishMessage(pending, result, mode);
      // The confirm go-ahead re-asks the ORIGINAL question (finishMessage keeps only the sharpened query).
      if (pending.webProposal) pending.webProposal.question = q;
    } catch (e) {
      // A stall (watchdog trip) or a user Stop keeps whatever streamed rather than blanking the
      // bubble to an error — only a genuine mid-turn fault gets the error line.
      const stalledOut = turn.guard.stalled();   // the no-progress WATCHDOG fired — a wedge, not a user Stop
      const stoppedOrStalled = turn.guard.tripped() || turnSignal.aborted;
      const hadPartial = !!pending.text;   // the model streamed prose before the stop cut in
      // A local decode the watchdog caught has wedged its WebGPU engine — reload it (or fall to
      // the smaller/CPU backup) so the retry we suggest can actually work, instead of hitting the
      // same dead singleton. BOTH wedge shapes count: dark from the first token, and the
      // frozen-session shape — a preamble streams, THEN the decode dies mid-stream (the old
      // `nothing streamed` gate left that engine standing, and every later turn queued behind
      // its orphaned decode). The partial is kept and banded unverified (markStoppedPartial);
      // a user Stop (stalled() false) never reloads a healthy model. Compute this BEFORE the
      // reset nulls `model`.
      const wedged = stalledOut && appCtx.model?.kind === 'local';
      if (wedged) appCtx.resetWedgedLocalModel();
      pending.text = pending.text || (wedged
        ? 'The turn stalled — I’m checking the in-browser model and will reload it if it died. Ask again and it should answer.'
        : stoppedOrStalled
          ? 'Stopped before the answer finished. Ask again to retry.'
          : (state.model.state === 'error'
            ? `${state.model.note}. A WebGPU browser (Chrome/Edge) runs Llama 3.2; anything else runs SmolLM2 on CPU — or pick Claude (hosted API, needs a key) from the model chip in the header, then retry.`
            : `Something failed mid-turn: ${String(e?.message || e)}`));
      pending.pending = false; pending.route = stoppedOrStalled ? 'stopped' : 'error';
      markStoppedPartial(pending, stoppedOrStalled, hadPartial);
    } finally {
      turn.disarm();
      appCtx.finishTrail(pending);   // stop the trail clock even if the turn threw/aborted mid-walk, so a
                              // running trail can never be left spinning forever on an errored turn
      appCtx.setBusy(null);
      pending.pending = false;
      appCtx.persist(); emit('messages');
    }
    return pending;
  };

  Object.assign(appCtx, { chat, stop });
};
