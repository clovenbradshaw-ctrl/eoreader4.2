// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// one grounded question per topic — the topic-per-question model
import { describeModel } from '../../../model/index.js';
import { buildChatExport } from '../chat-export.js';
import { composeProvenance, APP_NAME, APP_VERSION } from '../provenance.js';
import { DEFAULT_TOPIC_TITLE } from '../topic-name.js';
import { nowIso } from './util.js';

export const installTopicQuestion = (appCtx) => {
  const { audit, emit, logIt, state } = appCtx;
  // ── one grounded question per topic — the topic-per-question model ───────────
  // The engine answers a SINGLE grounded question coherently from the record — or abstains
  // honestly ("the record does not say"); a back-and-forth thread is what it does worst, so
  // the Ask surface refuses to accrete one. A question asked while the current topic ALREADY
  // holds a question opens a CHILD topic beneath it and asks THERE — a fresh line of inquiry
  // the sidebar tree shows nested under the question it followed. The child INHERITS the
  // parent's sources, so the record it reads is unchanged; the parent's answer stays intact
  // on its own surface, one clean question-and-answer apiece. The child also inherits the
  // lineage's CONVERSATION as discourse context (ask() reads history off topicThread): the
  // surfaces stay one-question-apiece, but a follow-up's pronouns and back-references still
  // resolve against the quest it followed — without that, "what did he do?" bound no referent
  // and its verbatim words went to the web (the exported Waco-siege junk). A question in a
  // topic that has not been asked one yet (a "New topic", or one that only holds ingested
  // sources) fills THAT topic in place — the first question never orphans a placeholder.
  // Delegates to ask() on the now-active topic and returns its pending message. topicNew
  // already makes the child active and auto-naming (from the first question) then names it.
  // opts.newQuest — a DELIBERATE new quest (the Ask surface's "New quest" affordance): a fresh
  // TOP-LEVEL topic in the same workspace rather than a child, still inheriting the current record
  // so a new line of inquiry starts without re-recording the sources. Without it the default holds:
  // the first question fills the current topic in place, and every question after branches a CHILD
  // quest beneath it (both inherit the parent's sources).
  const askQuestion = (question, opts = {}) => {
    const q = String(question || '').trim();
    if (!q) return Promise.resolve(null);
    const cur = appCtx.topic();
    const alreadyAsked = !!(cur && cur.messages.some((m) => m && m.role === 'user'));
    if (opts.newQuest && alreadyAsked) {
      const fresh = appCtx.topicNew(DEFAULT_TOPIC_TITLE, { workspaceId: (cur && cur.workspaceId) || state.activeWorkspaceId });
      fresh.sourceSns = [...((cur && cur.sourceSns) || [])];   // a new quest still reads the same record
      appCtx.persist(); emit('topics');
    } else if (cur && alreadyAsked) {
      const child = appCtx.topicNew(DEFAULT_TOPIC_TITLE, { parentId: cur.id, workspaceId: cur.workspaceId });
      child.sourceSns = [...(cur.sourceSns || [])];   // the child reads the same record as its parent
      appCtx.persist(); emit('topics');
    }
    return appCtx.chat(q, opts);
  };

  const stageLabel = (name) => ({
    route: 'Routing…', retrieve: 'Retrieving from the record…', fold: 'Folding the reading…',
    gate: 'Gating…', prompt: 'Building the grounded prompt…', llm: 'Phrasing…',
    bind: 'Binding citations…', factcheck: 'Fact-checking against the record…',
    veto: 'Vetoing unsupported claims…', settle: 'Settling…',
  }[name] || `${name}…`);

  const finishMessage = (msg, result, mode = appCtx.webMode()) => {
    appCtx.localWedges = 0;    // a completed answer means the engine is alive — clear the wedge streak
    appCtx.finishTrail(msg);   // stop the research trail's clock; the surface collapses it to its summary
    // Prefer the marked projection — the answer with ungrounded FACTS underlined ([no source],
    // creative prose left clean) — so the disclosure rides in every mode. The chat answer
    // already carries its marks in `answer` (turn/stages.js bind), so `marked` is undefined
    // there and this falls through unchanged; the long-form modes supply `marked` explicitly.
    msg.text = result.marked || result.answer || msg.text;
    msg.route = result.route;
    msg.grounding = result.grounding;
    // The VERBATIM prompt this turn handed the model — the audit turn's own record
    // (turn/stages.js promptText, riding the pipeline result as `turn`). Stashed on the
    // message — unlike the derived answerEot projection, it is a fact of the turn, not
    // re-computable — so the facing panel can show exactly what the talker was prompted,
    // and still show it after a reload (the in-memory audit ring does not survive one).
    // Null when no talker prompt exists for this answer (a phatic line, an errored turn).
    msg.prompt = (result.turn && result.turn.prompt) || null;
    // Carry the flag's human sentence (`message`, or `note`) so the chip shows a plain label + hover.
    msg.flags = (result.flags || []).map((f) => ({ id: f.id, note: f.note || f.message || '' }));
    msg.unbound = !!result.unbound;
    msg.stopped = !!result.stopped;
    msg.grounded = (result.sources || []).length > 0 && !result.unbound;
    // The "Search the web" button belongs to confirm mode only: auto already fetched (and
    // suppresses via webFetched), and off means the user opted out of reaching the net — so
    // a proposal is offered as a button only when the user asked to be the one to approve it.
    // Keyed on THIS turn's effective mode (passed in), not the global — so a turn a caller pinned
    // record-only (the `web: 'off'` override, e.g. an offline test) never surfaces the button even
    // when the global mode is 'confirm'.
    msg.webProposal = (result.webProposal && !result.webFetched && mode === 'confirm')
      ? { query: result.webProposal.query, rationale: result.webProposal.rationale || '' } : null;
    msg.bound = (result.bound || []).map((b) => ({ claim: b.claim, citation: b.citation || null, cited: b.cited || b.text || null }));
    msg.verdicts = (result.verdicts || []).map((v) => ({
      // Keep the verdict's own SENTENCE as the claim — edgeVerdicts carry the parsed sentence, and
      // the findings projection joins Contested onto bound claims by it (claims.js sameClaim). The
      // entity-id join ([src tgt]) is the last resort, kept only for verdict shapes with no text.
      verdict: v.verdict || v.status || '', claim: v.claim || v.text || v.sentence || [v.src, v.via, v.tgt].filter(Boolean).join(' '),
    }));
    msg.cites = Object.entries(result.citeOrigins || {}).map(([idx, docId]) => {
      const src = state.sources.find((s) => s.docId === docId);
      // `unit` is the SOURCE-LOCAL sentence index (pipeline citeUnitsOf) — the durable half of the
      // cite. `idx` stays the turn's composite index (what the [sN] marks in the answer refer to);
      // anything that outlives the turn (a pin anchor, a findings passage key) must read `unit`.
      const unit = (result.citeUnits || {})[idx];
      return { idx: Number(idx), unit: unit != null ? Number(unit) : Number(idx), docId, sn: src?.sn || null, reg: src?.reg || null, title: src?.title || docId, text: (result.citeTexts || {})[idx] || '' };
    });
    msg.reflection = result.reflection || null;
    // the self/world line's reading for this turn (echoes / push-back / commitments)
    msg.selfLine = result.selfLine || null;
    // What the web search brought back — the query, why, and the sources it fetched. The
    // gap/witness answer already streamed the re-run over these; a verify AUGMENTS instead,
    // so append what the web said (with its sources) as a plainly-marked addendum, keeping
    // the model's own answer above it untouched (docs/web-search.md, "verify — don't restrict").
    msg.webFetched = result.webFetched
      ? {
          query: result.webFetched.query || '', trigger: result.webFetched.trigger || '',
          results: result.webFetched.results || 0,
          sources: (result.webFetched.sources || []).map((s) => ({ title: s.title || '', url: s.url || '', docId: s.docId || '' })),
        }
      : null;
    const aug = result.webFetched && result.webFetched.augmented;
    if (aug && aug.answer) {
      const add = String(aug.answer).replace(/\[s\d+(?:,\s*s?\d+)*\]/g, '').replace(/[ \t]+\n/g, '\n').trim();
      const srcLines = (aug.sources || []).slice(0, 4).map((s) => `· ${s.title || s.url || s.docId}`).filter(Boolean).join('\n');
      if (add) msg.text = `${msg.text}\n\n— From the web —\n${add}${srcLines ? `\n\nSources:\n${srcLines}` : ''}`;
    }
    // What the corroboration walk found (turn/corroborate.js): an independent second source that
    // supports the answer, or — after real hops — the confident absence of one. Surfaced as a flag
    // beside the answer (it never rewrites it) and, when found, as the source to click through to.
    if (result.corroboration && result.corroboration.sought) {
      const c = result.corroboration;
      msg.corroboration = {
        verdict: c.verdict, corroborated: !!c.corroborated, query: c.query || '',
        sources: (c.sources || []).map((s) => ({ title: s.title || '', url: s.url || '' })),
      };
      const src = (c.sources || [])[0];
      msg.flags = [...msg.flags, c.corroborated
        ? { id: 'corroborated', note: `Independently corroborated${src ? ` — ${src.title || src.url}` : ''}.` }
        : { id: 'single-source', note: 'Rests on a single source — I searched but couldn’t find an independent one that corroborates it.' }];
      logIt(c.corroborated ? 'search' : 'skip',
        c.corroborated ? `Corroborated by an independent source${src ? ` — ${src.title || src.url}` : ''}` : 'No independent corroboration found', `"${c.query || ''}"`);
    } else {
      msg.corroboration = null;
    }
    for (const f of msg.flags) {
      if (/contradic/i.test(f.id)) logIt('conflict', `Contradiction flagged — ${f.note || f.id}`);
    }
    if (msg.webFetched) {
      logIt('search', `Grounded in ${msg.webFetched.results} web source${msg.webFetched.results === 1 ? '' : 's'}`, `"${msg.webFetched.query}"`);
    }
    logIt('claim', `Answered "${msg.text.slice(0, 60)}${msg.text.length > 60 ? '…' : ''}"`,
      `${msg.cites.length} citation${msg.cites.length === 1 ? '' : 's'}`);
  };

  // Export one whole chat (a topic) with its full audit trail folded under each turn — the
  // conversation is the record, the audit ring the receipt. The app is the one place that
  // holds BOTH the topics and the audit, so it assembles the bundle; chat-export.js renders
  // it (Markdown or JSON). Returns { text, ext, mime, filename } for the surface to Blob-
  // download, or null when the topic has nothing to export.
  const exportChat = (topicId = state.activeTopicId, format = 'md') => {
    const t = state.topics.find((x) => x.id === topicId) || appCtx.topic();
    if (!t) return null;
    // Compose the provenance fresh: the app + the build/latest cached at boot, plus the CURRENT
    // talker (describeModel) and the export clock. chat-export.js also reads each turn's own model
    // record, so a conversation that switched models mid-way names each — this is the session's
    // current one, and the header's app/build/freshness. Pure and total: null pieces just render as
    // "unstamped"/"not recorded", never blocking the download.
    const provenance = composeProvenance({
      app: APP_NAME, version: APP_VERSION,
      build: appCtx.provBuild, latest: appCtx.provLatest, repo: appCtx.provRepo,
      model: describeModel(appCtx.model),
      exportedAt: nowIso(),
    });
    return buildChatExport(
      { topic: t, turns: (audit && audit.turns) || [], sources: state.sources, provenance },
      format,
      t.title || 'chat',
    );
  };

  Object.assign(appCtx, { askQuestion, exportChat, finishMessage, stageLabel });
};
