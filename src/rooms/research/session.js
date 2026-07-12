// EO: NUL·SIG(Network → Void,Atmosphere, Clearing,Tending) — session state / chat reply
// research/session.js — the LIVE research surface's state: one append-only log
// across many chat asks (docs/deep-research-log.md).
//
// The surface is not a dead artifact. It is projectReport(log) over a log that
// KEEPS GROWING: every further research ask via chat appends a new frame tree
// (and its pins, reads, extracts, evas, cons, recs, voids, asks, promotes,
// phrases) to the SAME log, and every subscriber re-projects. The report
// populates and adjusts because it was never stored — it is always the log
// made visible. Coverage, corroboration, the convergence badge, and the
// residue all aggregate across asks for free, because they are folds.
//
// The chat gets its reply from the same run: formatChatReply reads the newest
// run's sections off the projection — the phrased, bind-checked sentences with
// their citation numbers, the voids stated as measured absences — so the chat
// answer and the surface are one projection, never two stories.

import { runGroundedResearch } from './driver.js';
import { projectReport } from './project.js';
import { liveView } from './live.js';

export const createResearchSession = (defaults = {}) => {
  const log = [];
  const listeners = new Set();
  let running = false;
  let runs = 0;

  const notify = (event) => {
    for (const fn of listeners) { try { fn(log, event); } catch { /* a broken view never stops the log */ } }
  };

  // One more research ask, appended to the SAME log. Per-ask opts override the
  // session defaults (fresh sources, a different alpha); the log and the run's
  // root id are the session's. Serialized: a second ask queues behind the
  // first by awaiting the same promise chain (the log is append-only and the
  // arrow of time is per-log, so two interleaved runs would shuffle t).
  let chain = Promise.resolve();
  const research = (question, opts = {}) => {
    const p = chain.then(async () => {
      running = true;
      notify(null);
      try {
        const rootId = runs === 0 ? 'root' : `r${runs}`;
        runs++;
        const { report } = await runGroundedResearch(question, {
          ...defaults, ...opts,
          log, rootId,
          onEvent: (e, l) => { notify(e); if (opts.onEvent) opts.onEvent(e, l); else if (defaults.onEvent) defaults.onEvent(e, l); },
        });
        return { log, report, rootId };
      } finally {
        running = false;
        notify(null);
      }
    });
    chain = p.catch(() => {});
    return p;
  };

  return {
    get log() { return log; },
    get running() { return running; },
    get runs() { return runs; },
    research,
    report: (cursor = null) => projectReport(log, cursor),
    view: (cursor = null) => liveView(log, cursor),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    exportJSONL: () => log.map((e) => JSON.stringify(e)).join('\n'),
  };
};

// ── The clarification popup's projection (surface.js) ─────────────────────────
// The surface pops a non-blocking card when the run raises a "which sense did you
// mean?" ask (a homonym subject, driver.js). WHICH card to show — and hence the
// whole "don't nag" behaviour — is a pure fold over the log, factored out here so
// it is testable without a DOM.

// pendingClarification(log, resolved) → { ask, question } | null — the disambiguate
// ask the popup should still be offering: the NEWEST one that is neither answered in
// the log nor in `resolved` (the ask ids the user already picked or dismissed in the
// UI). Null when there is nothing to offer, so the card stays hidden.
export const pendingClarification = (log, resolved = new Set()) => {
  const answered = new Set((log || []).filter((e) => e.kind === 'answer').map((e) => e.askId));
  let ask = null;
  for (const e of (log || [])) {
    if (e.kind === 'ask' && e.trigger === 'disambiguate' && !answered.has(e.id) && !resolved.has(e.id)) ask = e;
  }
  if (!ask) return null;
  const open = (log || []).find((e) => e.kind === 'open' && e.id === ask.frameId);
  return { ask, question: open ? String(open.question || '') : '' };
};

// refocusQuery(subject, sense) → the query a focused re-run researches when the user
// picks a different sense from the popup: the subject sharpened by the chosen sense
// label ("dolphins" + "NFL team" → "dolphins NFL team"). Empty sense → the subject
// unchanged.
export const refocusQuery = (subject, sense) => `${String(subject || '').trim()} ${String(sense || '').trim()}`.trim();

// The chat-side rendering of one run — written for what a researcher actually
// wants back: the ANSWER first (phrased, bind-checked, each claim clickable to
// its exact span), then an honest account of what the finding rests on (a
// single-source run says so; disputed and missing things are first-class), and
// finally concrete FOLLOW-UPS drawn from the gaps the run measured — so the
// reply ends by offering to go further, not by overselling what it found.
// Plain text/markdown-ish, for a chat bubble; the surface carries the full
// projection. `rootId` scopes the reply to the frames of THAT ask.
export const formatChatReply = (report, rootId = 'root') => {
  const secs = report.sections.filter((s) => s.frameId === rootId || s.frameId.startsWith(rootId + '.'));
  if (!secs.length) return 'Nothing was researched — no frames opened.';
  const num = new Map(report.propositions.map((p, i) => [p.id, i + 1]));
  const runProps = [];
  for (const sec of secs) for (const p of sec.propositions) runProps.push(p);
  const pinIds = new Set(runProps.map((p) => p.pinId));
  const anyPhrase = secs.some((s) => s.phrase);
  const lines = [];

  // ── 0. THE CLARIFICATION, if the subject was ambiguous ──────────────────────
  // A preliminary DISAMBIGUATE ask (driver.js) is the run telling the user the
  // subject binds to more than one thing and which sense it chose. Since the
  // surface wires no interactive `ask`, the question would otherwise live only in
  // the trace — so lift an UNANSWERED one to the top of the reply as a one-line
  // offer to refocus. It leads (the user should see it before the findings) but
  // never blocks: the grounded answer to the best-guess sense follows right below.
  const clarify = report.questions.find(({ ask, answer }) =>
    ask.trigger === 'disambiguate' && ask.frameId === rootId && !answer);
  if (clarify) lines.push(`> ${clarify.ask.text.replace(/\s+/g, ' ').trim()}`);

  // ── 1. THE ANSWER, first ────────────────────────────────────────────────────
  // Phrased sentences carry their citation; glue carries none. No model → the
  // significance-ordered spans below ARE the answer (never worse than the spans).
  if (!anyPhrase && runProps.length) {
    lines.push('_No model connected — here are the grounded spans, most significant first._');
  }
  for (const sec of secs) {
    if (sec.frameId !== rootId) lines.push(`\n**${sec.question}**`);
    if (sec.phrase) {
      lines.push(sec.phrase.sentences.map((s) =>
        s.glue ? s.text : `${s.text} [${num.get(s.boundTo) ?? '•'}]`).join(' '));
    }
    for (const v of sec.voids) {
      lines.push(`_Couldn’t find this in the pinned sources_ (${v.terrain}${v.term ? `: ${v.term}` : ''}) — ${v.receipt}.`);
    }
  }

  // ── 2. SOURCES — the exact span under every [n] ─────────────────────────────
  // A bare footnote number pointing at a URL is the severed link this whole
  // design refuses: the reader must see, under every [n], the exact bytes the
  // claim stands on. Flags read in plain words, never operator codes.
  const cited = new Set(runProps.map((p) => p.id));
  if (cited.size) {
    lines.push('\n**Sources — the exact span under each claim:**');
    for (const p of report.propositions.filter((p) => cited.has(p.id))) {
      const pin = report.pinById[p.pinId];
      const where = pin?.snapshotUrl || pin?.url || pin?.title || (pin ? `local pin ${pin.contentHash.slice(0, 12)}…` : '');
      const flags = [];
      if (p.recForcing) flags.push('shifted the picture');
      if (p.contradictedBy.length) flags.push('⚠ disputed');
      if (p.corroboratedBy.length) flags.push(`corroborated ×${p.corroboratedBy.length}`);
      lines.push(`[${num.get(p.id)}] “${p.span.text}”`);
      lines.push(`    — ${where} · chars ${p.span.start}–${p.span.end}${flags.length ? ` · ${flags.join(' · ')}` : ''}`);
    }
  }

  // ── 3. WORTH KNOWING — the honesty band ─────────────────────────────────────
  const notes = [];
  if (runProps.length && pinIds.size === 1) {
    const only = report.pinById[[...pinIds][0]];
    const name = only?.title || only?.url || 'one source';
    notes.push(`Everything above comes from **one source** (${name}). Nothing here is cross-checked — treat it as a starting sketch, not verified fact.`);
  }
  const disputed = runProps.filter((p) => p.contradictedBy.length);
  if (disputed.length) {
    notes.push(`**${disputed.length} claim${disputed.length === 1 ? '' : 's'} disputed** — sources pull in opposite directions and nothing broke the tie (marked ⚠ above).`);
  }
  if (notes.length) {
    lines.push('\n**Worth knowing**');
    for (const n of notes) lines.push(`- ${n}`);
  }

  // ── 4. FOLLOW-UPS — offered, not blocking ───────────────────────────────────
  const follows = followupsFrom(report, secs, rootId, pinIds, runProps);
  if (follows.length) {
    lines.push('\n**Want me to go further? Just ask me to:**');
    for (const f of follows) lines.push(`- ${f}`);
  }

  // ── 5. FOOTER — honest, not a badge parade ──────────────────────────────────
  // "converging" only means something with more than one source; with a single
  // pin, corroboration is impossible, so the badge is withheld rather than shown.
  const bits = [`${runProps.length} grounded span${runProps.length === 1 ? '' : 's'}`, `${pinIds.size} source${pinIds.size === 1 ? '' : 's'}`];
  if (pinIds.size > 1 && report.recs.length) bits.push(report.convergence.badge);
  let foot = `_${bits.join(' · ')}_`;
  if (report.verify.sections) {
    foot += `\n_VERIFY: ${report.verify.bound}/${report.verify.sentences} sentences bind${report.verify.glue ? `, ${report.verify.glue} glue` : ''}._`;
  }
  lines.push('\n' + foot);
  return lines.join('\n');
};

// Concrete, sendable follow-ups from the run's MEASURED gaps — the driver logs
// an askUser on every void / fork / thin-corpus, but its prompts are terse and
// system-voiced; here we phrase the same conditions as plain next-questions the
// chat can act on ("research X", "dig deeper" already route). Capped at three,
// deduped, most actionable first.
const followupsFrom = (report, secs, rootId, pinIds, runProps) => {
  const outs = [];
  const seen = new Set();
  const add = (t) => { const k = t.toLowerCase(); if (t && !seen.has(k) && outs.length < 3) { seen.add(k); outs.push(t); } };
  // A measured absence → a concrete search or a source to add.
  for (const sec of secs) for (const v of sec.voids) {
    if (v.terrain === 'elsewhere' && v.term) add(`Search the web for “${v.term}” — it isn’t in the sources pinned so far.`);
    else add(`Add a source that covers “${sec.question}”.`);
  }
  // A live contradiction → settle it.
  if (runProps.some((p) => p.contradictedBy.length)) add('Dig into the disputed claim and work out which source is right.');
  // A single source → corroborate it.
  if (runProps.length && pinIds.size === 1) add('Pull in a second source so these findings can be cross-checked.');
  // Anything the driver flagged that the conditions above didn’t already cover.
  for (const { ask, answer } of report.questions) {
    if (answer || outs.length >= 3) break;
    if (!(ask.frameId === rootId || ask.frameId.startsWith(rootId + '.'))) continue;
    if (ask.trigger === 'rec') add('Keep going on the reframed topic — the picture shifted partway through the read.');
  }
  return outs;
};
