// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// the research trail — the live "what am I researching / thinking" stream
import { toPast } from '../../../weave/write/index.js';
import { runTurn } from '../../../turn/index.js';
import { foldNarrative } from '../fold-narrative.js';
import { nowMs } from './util.js';

export const installTrail = (appCtx) => {
  const { audit, emit, ledger, murmur } = appCtx;
  // ── the research trail — the live "what am I researching / thinking" stream ────
  // 4.1 surfaced a web search as a collapsible, Claude-style THINKING TRAIL in the answer bubble:
  // one typed beat per search / page read / lead followed / page set aside, ticking a clock, then
  // settling to "Researched N sources · M hops". 4.2 had regressed this to a single transient busy
  // label with nothing rendered. These helpers rebuild that trail on the message as plain data the
  // surface renders. `beat` appends one step (deduped against the previous), `emit`ing so it streams.
  const beat = (msg, kind, text, mode = 'research', extra = null) => {
    appCtx.stallGuard?.feed();   // a research beat is progress — re-arm the no-progress watchdog
    const t = String(text || '').trim();
    if (!msg || !t) return;
    if (!msg.research) msg.research = { steps: [], mode, t0: nowMs(), tEnd: 0, done: false, summary: '' };
    const steps = msg.research.steps;
    const last = steps[steps.length - 1];
    if (last && last.kind === kind && last.text === t) return;   // don't stack a repeated status
    steps.push({ kind, text: t, ...(extra || {}) });
    emit('messages');
  };
  // Narrate the fold: turn each completed pipeline stage into one trail beat, so the answer
  // bubble shows the reading think — read the record, fold it, phrase, bind, check — BEFORE
  // the answer lands (never a dead, labelless wait). onStep hands (name, ctx, data); we pass
  // only the SAFE `data` projection to fold-narrative.js. mode 'think' so a plain document
  // turn's trail reads "Thinking…", not "Researching…" (a web walk creates the trail first,
  // with mode 'research', and the first-writer's mode wins).
  //
  // VERBOSE is a DEVELOPER trace, OFF by default: on, every stage dumps its raw `data` cells (the
  // route/task/gates fields, the internal `eo` operator strings) — machine notation, not meaning to a
  // regular reader. Default is the CURATED trail alone. Re-enable: ?trace=verbose or eo_trace storage.
  const traceVerbose = (() => { try { return /(^|[?&])trace=verbose(&|$)/.test(location.search || '') || localStorage.getItem('eo_trace') === 'verbose'; } catch { return false; } })();
  const foldBeat = (msg, name, data) => {
    const b = foldNarrative(name, data || {}, { verbose: traceVerbose });
    if (!b) return;
    const { kind, text, ...extra } = b;
    beat(msg, kind, text, 'think', Object.keys(extra).length ? extra : null);
  };
  // The pre-fetch beat: what the walk is about to search THIS hop. A followed lead names the term it
  // is chasing ("Following 'X' — searching 'Y'"); the seed / a plain hop just names the query.
  const hopBeat = (msg, hop, seed) => {
    if (!hop) return;
    const q = String(hop.query || '').trim();
    if (!q) return;
    if (hop.term && q.toLowerCase() !== String(seed || '').toLowerCase())
      beat(msg, 'lead', `Following “${hop.term}” — searching “${q}”`);
    else
      beat(msg, 'search', `Searching the web for “${q}”`);
  };
  // The after-fetch beat: the hop's OUTCOME — what it read, or why it was set aside. Mirrors 4.1's
  // honest "Kept / Set aside" narration so the leash is legible, not a black box.
  const hopDoneBeat = (msg, hop) => {
    if (!hop) return;
    if (hop.kept && hop.results) {
      const lead = (hop.leads && hop.leads.length) ? ` — picked up ${hop.leads.slice(0, 3).join(', ')}` : '';
      // Carry the actual pages this hop read onto the beat, so the trail's "Read N sources" line
      // can be clicked through to what the surf returned (title + url per source), not just a count.
      const sources = (hop.sources || []).filter((s) => s && (s.url || s.title));
      beat(msg, 'read', `Read ${hop.results} source${hop.results === 1 ? '' : 's'}${lead}`, 'research', sources.length ? { sources } : null);
    } else if (hop.reason === 'strayed') {
      beat(msg, 'warn', `Set aside “${hop.query}” — drifted off the question`);
    } else if (hop.reason === 'empty') {
      beat(msg, 'warn', `Nothing came back for “${hop.query}”`);
    }
  };
  // Settle the trail: the one-line summary the collapsed header shows. `research` is the walk trace
  // (turn/research.js). Called once the gather is done, before the answer is phrased.
  const settleTrail = (msg, research) => {
    if (!msg?.research) return;
    if (research) {
      const nH = (research.hops || []).length;
      const n = research.results || 0;
      msg.research.summary = `Researched ${n} source${n === 1 ? '' : 's'} · ${nH} hop${nH === 1 ? '' : 's'}`;
    }
    beat(msg, 'done', msg.research.summary || 'Done researching');
  };
  // Mark the trail finished (the clock stops). The surface reads `done`/`tEnd` to collapse it.
  const finishTrail = (msg) => {
    if (!msg?.research) return;
    msg.research.done = true;
    msg.research.tEnd = nowMs();
  };

  // Release the composer the moment the answer is FORMED — the `bind` stage — instead of when
  // the whole turn settles. The delay a user feels between "the answer finished appearing" and
  // "I can send again" is the post-answer TAIL: on the streaming path the text is final at bind
  // (pipeline.js: "the answer is FORMED at `bind` and only ANNOTATED after it"), yet
  // factcheck → veto → absence → validate → settle and the epilogue (reflection · self-line ·
  // ledger · assembleBrief) still run before runTurn resolves — a MiniLM fact-check per claim,
  // an assembleBrief that scales with the document, and, when the draft earned no witness, a
  // whole extra model decode in `validate`. None of them can rewrite a STREAMED draft (revise,
  // absence, and validate all exempt it — turn/stages.js), so the bubble only GAINS its
  // citations/flags as they finish; nothing the user is reading changes. So we settle the
  // message here — `.pending` gates both the composer (index.html `_generating`) and whether
  // the turn counts toward the next turn's history — and let that grounding finish in the
  // background: the trail keeps ticking until finishTrail, the header keeps its busy label off
  // `onStep`, and finishMessage folds in the verdicts when runTurn returns. Idempotent, and
  // scoped to `bind`, so a turn that terminates before it (smalltalk, math, a gated decline) is
  // untouched and still settles at the `finally`. The onStep guard (`turnSignal.aborted`) keeps
  // this from firing on a stopped turn, so a Stop still freezes the partial exactly as before.
  const releaseOnAnswer = (pending, name, ctx) => {
    if (name !== 'bind' || !pending || pending.pending !== true) return;
    // Swap in the bound answer (citations attached) so the settled text — and thus any history a
    // fast follow-up reads — matches what finishMessage would set, whether or not the tail is done.
    if (ctx && typeof ctx.answer === 'string' && ctx.answer) pending.text = ctx.answer;
    pending.pending = false;
    emit('messages');
  };

  // Feed the peripheral sense (murmur, docs/murmur.md) one fold snapshot per turn. Called from the
  // turn's onStep at the `fold` stop and run FIRE-AND-FORGET, strictly off the critical path: the
  // sense POINTS ("we've wandered" / "this doesn't smell right"), it never adds answer content
  // (spec §9.4). The wiring site extracts the fields here so murmur imports nothing from the turn
  // pipeline. concentration is always available off the fold's referential read (zero embedding
  // cost); drift/novelty need a meaning-measuring embedder (MiniLM warm) — absent it the geometric
  // channel stays null and only the concentration/unease signal can fire (honest degradation).
  // The ACTUAL propositions the fold parsed at this reading — the reader's own grounded x→relation→y
  // claims (`ctx.note.levels.structure`, the same graph serializeEOT renders). Each edge is said as one
  // short past-tense claim using the ENGINE'S OWN conjugation (toPast), applied to the verb HEAD only
  // so a phrasal via ("premiere in") reads "premiered in", not "premiere ined". This is what the murmur
  // strip voices — so it reads like a mind reading the document, not a canned reaction to the geometry.
  // Negated edges are skipped (every shown claim stays clean and correct; contradictions live in the
  // Significance note, not the ambient strip). Bounded — the strip shows ≤2; a couple more give a choice.
  const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const sayEdge = (subj, verb, obj) => {
    const parts = String(verb).split(/\s+/).filter(Boolean);
    const pred = [toPast(parts[0]), parts.slice(1).join(' '), obj].filter(Boolean).join(' ');
    return `${capFirst(subj)} ${pred}.`;
  };
  const parsedPropositions = (ctx, max = 4) => {
    const st = ctx && ctx.note && ctx.note.levels && ctx.note.levels.structure;
    if (!st) return [];
    const out = [];
    const seen = new Set();
    for (const r of (st.relations || [])) {
      if (out.length >= max) break;
      if (!r || !r.src || !r.tgt || r.polarity === '−') continue;   // skip negated — keep every claim clean
      const subj = String(r.src.label || '').trim();
      const obj = String(r.tgt.label || '').trim();
      const verb = String(r.via || '').trim();
      if (!subj || !verb) continue;
      const key = `${subj}|${verb}|${obj}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let text = sayEdge(subj, verb, obj || null);
      if (text.length > 120) text = text.slice(0, 117).replace(/\s+\S*$/, '') + '…';
      out.push({ text, subj });
    }
    for (const d of (st.defs || [])) {
      if (out.length >= max) break;
      const subj = String((d && d.label) || '').trim();
      const val = String((d && d.value) || '').trim();
      if (!subj || !val || seen.has(`def|${subj}`)) continue;
      seen.add(`def|${subj}`);
      out.push({ text: `${capFirst(subj)} — ${val}.`, subj });
    }
    return out;
  };

  // The same grounded x→relation→y edges parsedPropositions realises to template speech, kept as
  // RAW TRIPLES { subj, verb, obj } so the idle prosifier (app/deep.js) can hand them to the local
  // model for a fluent re-voicing when it is warm and free — the LLM murmur the mockup calls for,
  // behind the propositional veto so the prose can be no more wrong than the reader's own graph.
  const parsedTriples = (ctx, max = 4) => {
    const st = ctx && ctx.note && ctx.note.levels && ctx.note.levels.structure;
    if (!st) return [];
    const out = [];
    const seen = new Set();
    for (const r of (st.relations || [])) {
      if (out.length >= max) break;
      if (!r || !r.src || !r.tgt || r.polarity === '−') continue;   // skip negated — keep every claim clean
      const subj = String(r.src.label || '').trim();
      const obj = String(r.tgt.label || '').trim();
      const verb = String(r.via || '').trim();
      if (!subj || !verb) continue;
      const key = `${subj}|${verb}|${obj}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ subj, verb, obj: obj || null });
    }
    return out;
  };

  const observeMurmur = (ctx) => {
    if (!murmur || !ctx) return;
    try {
      const auditTurn = (audit && audit.turns && audit.turns.length) ? audit.turns[audit.turns.length - 1] : null;
      // The reading's LOCUS, not just the turn: which doc + which sentence indices the fold
      // assembled from. This rides into the recognition ring so a later "seen this before" names
      // the specific earlier passage the connective nominator (phase 4) can go read and verify.
      const spanIdxs = Array.isArray(ctx.spans) ? ctx.spans.map((s) => s && s.idx).filter((i) => Number.isInteger(i)) : [];
      const cursor = (ctx.surf && Number.isInteger(ctx.surf.peak)) ? ctx.surf.peak : (spanIdxs.length ? spanIdxs[0] : null);
      const ref = {
        turnId: auditTurn ? auditTurn.id : null, stepName: 'fold', t: nowMs(),
        docId: (ctx.doc && ctx.doc.docId) || null, sentIdxs: spanIdxs, cursor,
      };
      const r = ctx.referential || null;
      const concentration = {
        concentrated: r ? r.concentrated : undefined,
        margin: r ? r.margin : undefined,
        w: r ? r.w : undefined,
        top: (ctx.spans && ctx.spans[0]) ? ctx.spans[0].score : undefined,
        focus: ctx.surf ? ctx.surf.focus : undefined,
      };
      const emb = ctx.geometricEmbedder;
      const measures = !!(emb && emb.measuresMeaning && typeof emb.embed === 'function');
      const queryText = String(ctx.retrievalQuery || ctx.question || '');
      const readingText = ctx.note && ctx.note.text ? String(ctx.note.text) : '';
      const base = { ref, query: ctx.question || '', concentration, passageText: readingText.slice(0, 400), propositions: parsedPropositions(ctx) };
      // Stash this fold's raw triples for the idle prosifier — the CPU model re-voices them as
      // fluent murmur prose at rest (never here, on the turn's critical path). Best-effort.
      try { if (appCtx.stashMurmurTriples) appCtx.stashMurmurTriples(parsedTriples(ctx), ref.docId); } catch { /* prosify is optional */ }
      if (!measures || !queryText) {
        // no meaning space this stop — concentration-only (drift/novelty null by construction).
        void Promise.resolve(murmur.observe({ ...base, measuresMeaning: false }, { turn: auditTurn })).catch(() => {});
        return;
      }
      // Two cheap, cache-backed embeddings: the query (the drift anchor) and the fold's assembled
      // note (this turn's reading). A flaky embed must never disturb the turn, so it is swallowed.
      Promise.all([
        emb.embed(queryText),
        readingText ? emb.embed(readingText) : Promise.resolve(null),
      ]).then(([queryVec, readingVec]) => murmur.observe({
        ...base, queryVec, readingVecs: readingVec ? [readingVec] : null, measuresMeaning: true,
      }, { turn: auditTurn })).catch(() => { /* the sense must never cost a turn */ });
    } catch { /* never let the peripheral sense throw into the pipeline */ }
  };

  Object.assign(appCtx, { beat, finishTrail, foldBeat, hopBeat, hopDoneBeat, observeMurmur, releaseOnAnswer, settleTrail });
};
