// EO: SYN·EVA·DEF(Network,Field,Lens → Network,Lens, Composing,Binding,Dissecting) — web-search turn orchestration
// runTurnWithWeb — the orchestration that lets "search the internet to respond" actually fire.
// (docs/web-search.md)
//
// Run the turn. If it PROPOSES a web search (a measured gap the document can't close), get a
// go-ahead — automatically in `auto` mode, or via a `confirm(proposal)` callback in `confirm`
// mode — then fetch+admit the results (the caller's `webSearch`) and RE-RUN the turn with those
// sources added to the scope. Proposer-only is preserved: nothing is fetched without approval,
// and the engine itself never touches the network — `webSearch` does, outside the pipeline.
//
// `runTurnImpl` is injected (defaults to the real runTurn) so the orchestration is testable
// without a model or the network.

import { runTurn } from './pipeline.js';
import { RESEARCH_STOPWORDS } from './research.js';
import { createCompositeDoc } from '../organs/in/index.js';
import { createAuditLog } from '../rooms/audit/index.js';
import { discourseFrame } from './converse/index.js';
import { speak } from '../model/index.js';

// verifyAgainstWeb(answer, corpus) → does the web corpus SUPPORT the answer? An embedder-free
// lexical check: how many of the answer's salient (content) terms appear in the fetched text.
// `supported` when enough do; `missing` names the ones it couldn't find — the honest "couldn't
// confirm this" signal (true contradiction needs the meaning classifier; this flags absence).
// The stopword list is research.js's RESEARCH_STOPWORDS (this file's old copy was an exact
// prefix of it); only the dedup-before-filter shape here is web.js's own.
const terms = (s) => [...new Set((String(s || '').toLowerCase().match(/[a-z][a-z0-9'’-]{2,}/g) || []))].filter(t => !RESEARCH_STOPWORDS.has(t));

export const verifyAgainstWeb = (answer, corpus, { question = '', floor = 0.5 } = {}) => {
  // Check the answer's DISTINCTIVE terms — the ones it adds beyond the question. "Lyon" in "the
  // capital of France is Lyon" is the claim; "capital"/"France" are just the question echoed, and
  // a wrong answer shares those too. So the discriminating signal is the novel term's presence.
  const q = new Set(terms(question));
  const novel = terms(answer).filter(t => !q.has(t));
  const check = novel.length ? novel : terms(answer);
  if (!check.length) return { supported: true, overlap: 1, missing: [] };
  const c = new Set(terms(corpus));
  const hit = check.filter(t => c.has(t));
  const overlap = Math.round((hit.length / check.length) * 100) / 100;
  return { supported: overlap >= floor, overlap, missing: check.filter(t => !c.has(t)) };
};

// runWebFollowup(args, first, opts) → the post-approval half: fetch+admit the proposal's query
// and either VERIFY the first answer against it or RE-RUN the turn with the web sources in scope.
// Split out of runTurnWithWeb so a UI can render the first answer immediately, surface the
// proposal as its own confirmation step, and run THIS only on a go-ahead — instead of blocking
// the whole turn behind a popup. `query` overrides the proposal's query (the confirmation card
// lets the user sharpen it before searching); absent, the proposal's own query stands.
// Formulate a real SEARCH QUERY from the conversation — the fix for "web search is useless".
// The proposer hands over the raw chat question ("no there's a newer one", "who is making the
// new series as of 2026?"), which a search engine matches to nonsense (songs containing "no
// there's"; random 2026 TV series) because the SUBJECT lives earlier in the thread, never in
// the question. This rewrites the latest turn into a standalone query with references resolved
// (the thread's "new series" → "X-Files (2025 revival)").
//
// DISCOURSE-AWARE by construction. Before the model is ever consulted, the live turn is read
// against the DIALOGUE STATE (converse/dialogue-state.js): its operator (a pronoun, a stall like
// "tell me more", a redirect like "no, the musician"), the WARM REFERENT the conversation is on
// (the figure the cast holds), and the OPEN INTENT it left dangling. `resolveQuery` binds those
// in deterministically — so "who is making it?" becomes "…making it <the figure in focus>" even
// with NO model. That resolved query is (a) the answer when there is no model and (b) the discourse
// frame handed to the model when there is one, so the search chases the CONVERSATION's subject, not
// the latest sentence read in isolation. The answer firewall is preserved end to end: only the
// user's own words and GROUNDED referent labels ride (never the talker's claims — the audit's
// invented "Chris Carter, Frank Darabont" that once became the literal next search). Fully guarded:
// a discourse-read fault, no model, a thin/odd rewrite, or any throw → the discourse-anchored query
// (worst case the raw turn) stands, so behaviour only ever improves. Returns a plain string.
export const formulateSearchQuery = async ({ model, question, history = [], fallback = '', signal = null } = {}) => {
  const base = String(question || fallback || '').trim();
  if (!base) return base;

  // Read the turn against the discourse: the deterministically-anchored query, the subject in
  // focus, and the open intent (converse/dialogue-state.js). Best-effort by construction.
  const { resolved, subject, open: openIntent } = discourseFrame(base, history);

  if (!model?.phrase) return resolved;   // no model: the discourse-anchored query, not the raw turn

  // The verbatim thread is the USER's turns only — never the talker's prior answers. A small
  // talker's earlier reply may be a guess or a hallucination, and folding it in here makes the
  // query chase that guess. The grounded discourse SUBJECT (below) is the sanctioned coref channel;
  // the raw assistant text is not. Same discipline as groundedConversation (stages.js).
  const thread = (history || [])
    .filter(m => m && m.role === 'user' && m.content)
    .slice(-6)
    .map(m => `U: ${String(m.content).replace(/\s+/g, ' ').slice(0, 240)}`)
    .join('\n');
  // The discourse frame handed to the model: WHO the conversation is currently about and WHAT it
  // left open — read off the dialogue state, not guessed from six flat lines — so the rewrite is
  // anchored on the discourse subject instead of whatever the latest sentence's words happen to be.
  const frame = [
    subject ? `Subject in focus: ${subject}` : '',
    openIntent ? `Open question: ${openIntent}` : '',
  ].filter(Boolean).join('\n');
  // THE TASK-FRAMING + TYPO GUARD (the "wrtie me an essay about dolphins" run). The deterministic
  // subject peel (app.dc.js _subjectOf) is spelling-exact on the leading verb, so a typo — "wrtie"
  // for "write" — passes the whole framed sentence through to HERE. If this prompt only says "no
  // filler", a small model doesn't read "essay about" as filler and keeps it, so the query becomes
  // "essay about dolphins" — which Wikipedia matches to "Island of the Blue Dolphins", never the
  // Dolphin article, and the whole turn grounds to void off the wrong topic. So the instruction now
  // names the produce-a-piece framing explicitly (write/compose an essay/report/… about X → X), tells
  // the model to drop the task verb and the piece noun, and to read through typos — the LLM doing the
  // subject extraction the regex can't, exactly where the raw sentence lands.
  const messages = [
    { role: 'system', content:
      'You turn a chat turn into ONE web search query — just the SUBJECT to look up. You are given ' +
      'the DISCOURSE STATE: the subject the conversation is currently about and the question it left ' +
      'open. Resolve every pronoun and back-reference against that discourse so the query stands ' +
      'alone, and KEEP THE SUBJECT in focus — never drop it for a name you are unsure of. When the ' +
      'turn asks you to PRODUCE something about a topic — "write me an essay about X", "give me a ' +
      'report on Y", "summarize Z", "tell me about W" — search for the topic itself (X, Y, Z, W) and ' +
      'DROP the task: never keep the instruction verb (write, compose, draft, make, give) or the kind ' +
      'of piece (essay, report, article, summary, overview, story, paper) in the query — those say ' +
      'what to DO with the subject, not what to look up. But KEEP every word that NARROWS the subject — ' +
      'a category, medium, era, or type ("films", "songs", "the 2022 movie") — dropping it points the ' +
      'search at the wrong thing (the man "elvis" instead of "elvis films"). Read through obvious typos ' +
      'and search for the correctly-spelled subject. Keep it short — the keywords a search engine needs, ' +
      'no filler, no question words, no quotes. Output ONLY the query. ' +
      'For example, "wrtie me an essay about dolphins" becomes: dolphins; ' +
      '"research elvis films and tell me the best one" becomes: elvis films' },
    { role: 'user', content:
      `${frame ? `Discourse state:\n${frame}\n\n` : ''}${thread ? `User's earlier turns:\n${thread}\n\n` : ''}Latest turn: ${base}\n\nSearch query:` },
  ];
  // maxTokens 32 with minPredict 0: a query is a few words. The reasoning-floor backends
  // (pleias / onnx) otherwise pad every call up to their 384–768 token floor, turning this tiny
  // utility call into a second full-length decode (~80s on CPU/WASM) for no reason — a large
  // share of the "chat is slow" in auto mode, where this runs before every answer.
  // The turn's signal rides along so a Stop/stall actually halts this decode —
  // unabortable, it kept running as an orphan and held the engine against the next turn.
  const out = await speak(model, messages, { fallback: null, maxTokens: 32, temperature: 0, minPredict: 0, signal });
  if (out != null) {
    const q = String(out || '')
      .split('\n').map(s => s.trim()).find(Boolean) || '';     // first non-empty line
    const cleaned = q.replace(/^(search query|query)\s*:\s*/i, '').replace(/^["'`]+|["'`]+$/g, '').trim();
    // Guard: a usable rewrite is short and not the model refusing/echoing. Else keep the
    // discourse-anchored query (still better than the raw turn — the subject is already bound in).
    // Regrow a clipped subject over the user's own adjacent words ("elvis" → "elvis films")
    // before accepting it — a bare head noun searches the wrong thing.
    if (cleaned && cleaned.length <= 120 && !/^i (cannot|can't|am unable)/i.test(cleaned))
      return extendClippedSubject(cleaned, base);
  }
  // A faulted decode (fallback: null) falls through to the discourse-anchored query.
  return resolved;
};

// A weak formulator can clip a multi-word subject down to its head noun — "research elvis
// films and tell me the best one" → "elvis", dropping the qualifier that says WHICH elvis
// (the films, not the man). That points the whole walk at the wrong subject. This grows a
// short, bare rewrite back to its full noun phrase: when the model's query appears verbatim
// in the user's own turn, re-absorb the contiguous CONTENT words that sit right beside it,
// stopping at the first connector ("and", "the", "to") or task word ("tell", "best", "essay").
// It only ever EXTENDS the model's own subject with the user's OWN adjacent words — it never
// invents, and it no-ops on a query the model enriched with resolved context (that will not
// appear verbatim in the turn) or on an already well-formed multi-word query.
const CONNECTOR = new Set(('and or but nor so then the a an to of in on at for with by from as that this ' +
  'these those it its his her their your our we you they not no do does did will would can could should ' +
  'me us him them what who how why when where which about').split(/\s+/));
const NON_SUBJECT = new Set(('research write compose draft create generate produce make prepare give given tell ' +
  'show find list summarize summarise explain describe discuss analyze analyse compare recommend suggest rank ' +
  'essay essays report reports article articles summary overview overviews story stories paper papers guide guides ' +
  'review reviews post posts writeup writeups best worst top favorite favourite one ones').split(/\s+/));
const subjectWord = (t) => (String(t || '').toLowerCase().match(/[a-z][a-z0-9'’-]{2,}/) || [''])[0];
export const extendClippedSubject = (query, turn) => {
  const q = String(query || '').trim();
  const qTokens = q.split(/\s+/).filter(Boolean);
  if (!q || qTokens.length > 3) return q;                       // only regrow a short, clipped subject
  const tTokens = String(turn || '').trim().split(/\s+/).filter(Boolean);
  const lq = qTokens.map(subjectWord), lt = tTokens.map(subjectWord);
  if (!lt.length || lq.some(w => !w)) return q;
  // Where does the query's word sequence sit contiguously in the turn's word stream?
  let at = -1;
  for (let i = 0; i + lq.length <= lt.length && at < 0; i++)
    if (lq.every((w, j) => w === lt[i + j])) at = i;
  if (at < 0) return q;                                         // not the user's own words → leave the rewrite alone
  const out = tTokens.slice(at, at + lq.length);
  for (let k = at + lq.length, grew = 0; k < tTokens.length && grew < 3; k++, grew++) {
    const w = lt[k];
    if (!w || CONNECTOR.has(w) || NON_SUBJECT.has(w)) break;    // a connector or a task word ends the noun phrase
    out.push(tTokens[k]);
  }
  // Strip the edge punctuation the turn's raw tokens carry ("japan?" → "japan"), never a query char.
  return out.map(t => t.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9'’-]+$/, '')).filter(Boolean).join(' ');
};

export const runWebFollowup = async (args, first, {
  webSearch,
  k = 4,
  runTurnImpl = runTurn,
  query,
  formulate = formulateSearchQuery,
} = {}) => {
  const proposal = first?.webProposal;
  if (!proposal || !webSearch) return first;
  // A user-sharpened query (the confirmation card) wins outright. Otherwise reformulate the
  // proposal's raw query against the conversation so the engine gets keywords, not chat filler.
  const q = (query != null && String(query).trim())
    ? String(query).trim()
    : await formulate({ model: args?.model, question: proposal.query, history: args?.history || [], fallback: proposal.query, signal: args?.signal });

  // Pick the source per trigger: a WITNESS confirms an interpretation against FACTS (Wikipedia);
  // verify (chat) and gap both want to FIND the answer in the wild, so auto-route and pull the
  // actual result pages (real websites) — the content a good web-grounded answer is built from.
  const opts = proposal.trigger === 'witness'
    ? { k, kind: 'wikipedia', signal: args?.signal }
    : { k, kind: 'auto', fetchPages: true, signal: args?.signal };
  let admitted = [];
  try { admitted = await webSearch(q, opts); } catch { admitted = []; }
  const webDocs = (admitted || []).map(a => a?.doc).filter(Boolean);
  if (!webDocs.length) return { ...first, webFetched: { query: q, trigger: proposal.trigger, results: 0 } };

  const sourceList = (docs) => docs.map(d => ({
    docId: d.docId, title: d.web?.title || d.title || '', url: d.web?.url || d.web?.final_url || '',
  }));

  // VERIFY (a chat turn) — AUGMENT, don't replace. The model's own answer stays; we ALSO answer
  // the question from the real pages we just pulled and present THAT as a "From the web" addendum
  // with its sources. The effort goes into a good web-grounded answer, not into checking or
  // editing the model's words. Generated by a grounded re-run over the web docs, with the UI
  // callbacks stripped so it never streams over the original answer's bubble.
  if (proposal.trigger === 'verify') {
    const baseDocs = args.docs || (args.doc ? [args.doc] : []);
    let augmented = null;
    try {
      const grounded = await runTurnImpl({
        ...args, doc: undefined, docs: [...baseDocs, ...webDocs],
        onToken: undefined, onStep: undefined, stream: false,   // a side answer — don't touch the live bubble
        auditLog: createAuditLog(),                             // a DETACHED log — runTurn needs one, but this
                                                                // sub-step must not add a turn to the user's audit pane
        groundGraph: true,                                      // feed the talker the MEANING GRAPH of the web
                                                                // content — reason over the relations, not raw lines
      });
      const route = grounded?.route || grounded?.turn?.route;
      if (grounded?.answer && route !== 'error')
        augmented = { answer: grounded.answer, sources: sourceList(webDocs), graph: grounded.fedGraph || '' };
    } catch { augmented = null; }
    return { ...first, webProposal: proposal,
      webFetched: { query: q, trigger: 'verify', results: webDocs.length,
                    augmented, sources: sourceList(webDocs) } };
  }

  // GAP / WITNESS — re-run with the web sources added to the answer scope, so the second answer
  // can stand on (and cite) what the search brought back. On a WITNESS trigger the same sources
  // ALSO ride as `witnessSource`, so the veto's witness-seek confirms the reading against the
  // world and the `interpretation` flag can clear.
  const baseDocs = args.docs || (args.doc ? [args.doc] : []);
  const extra = proposal.trigger === 'witness'
    ? { witnessSource: webDocs.length === 1 ? webDocs[0] : createCompositeDoc(webDocs) }
    : {};
  const second = await runTurnImpl({ ...args, doc: undefined, docs: [...baseDocs, ...webDocs], ...extra });
  return {
    ...second,
    webProposal: proposal,
    webFetched: { query: q, trigger: proposal.trigger, results: webDocs.length,
                  sources: webDocs.map(d => ({ docId: d.docId, title: d.web?.title || d.title || '', url: d.web?.url || d.web?.final_url || '' })) },
  };
};

export const runTurnWithWeb = async (args, {
  webSearch,                 // (query, { k }) → [{ doc, … }] admitted web sources
  mode = 'confirm',          // 'confirm' | 'auto' | 'off'
  confirm = null,            // (proposal) → boolean | Promise<boolean>, for confirm mode
  k = 4,
  runTurnImpl = runTurn,
} = {}) => {
  const first = await runTurnImpl(args);
  const proposal = first.webProposal;
  if (mode === 'off' || !proposal || !webSearch) return first;

  const approved = mode === 'auto' ? true : (confirm ? await confirm(proposal) : false);
  if (!approved) return first;     // proposer-only: no go-ahead, nothing fetched

  return runWebFollowup(args, first, { webSearch, k, runTurnImpl });
};
