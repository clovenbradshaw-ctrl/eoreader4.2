// EO: INS·CON·EVA(Void,Network → Entity,Lens, Making·Binding·Tracing) — the answerer
// metabolism/answerer.js — the system under evolution answering a challenge THE WAY A REAL CHAT DOES.
//
// challenger.js runs the loop abstractly: Claude poses a challenge, an `answerer(challenge)` answers,
// Claude judges how well the answer rendered its RETRIEVED SOURCES into grounded, flowing output.
// This is the concrete answerer the surface reaches for — NOT the echo stand-in that folded the
// challenge's own material back at it, but the SAME turn pipeline a real chat runs: turn/runTurn,
// and — because an evolve challenge arrives with NOTHING on the record — the multi-hop web-research
// walk (turn/runTurnWithResearch) that formulates a real query, fetches live pages, folds every kept
// one, and answers GROUNDED over them. So an evolve turn is, step for step, the reader's empty-record
// "search the web" path (rooms/reader/app.js `answerFromWeb`). The web search fires AS NEEDED: here it
// is the whole answer, because the model must go find its own sources rather than fold info from a log.
//
// Everything the pipeline needs is INJECTED, never imported here as a singleton: the answering MODEL
// (EOReader's OWN — never the judge; Claude poses and grades, it does not answer its own exam), the
// embedder, the audit log, and the `search` fetch+admit primitive. So this is testable offline with a
// stubbed client and runs in the browser against the live web with no change. The returned answerer
// hands back { answer, sources, trail }: the rendered answer, the retrieved pages carrying their TEXT
// (so grounding is judged against what it actually fetched, not the evaluator's own knowledge), and
// the research trail (the hops). All three flow into the audit — the web research is FULLY AUDITABLE.

import { runTurnWithResearch, formulateSearchQuery } from '../turn/index.js';

export const createResearchAnswerer = ({
  model,                       // EOReader's answering model, or an async ()=>model resolver; NOT the judge
  embedder,                    // the hash embedder the retrieve stage rides
  geometricEmbedder = null,    // the MiniLM organ when warm; null degrades honestly
  auditLog,                    // the turn's audit ring (the pipeline requires one)
  search,                      // (query, { k }) → admitted[] — the fetch+admit web primitive (searchAndAdmit)
  maxHops = 4,                 // bound the walk — the honest cost of "go slower and actually research"
  k = 3,
  onResearch = null,           // (ev) → void — live trail beats for a surface: { phase:'start'|'hop'|'hopDone'|'done'|'error', ... }
  formulate = formulateSearchQuery,
  runResearch = runTurnWithResearch,
} = {}) => {
  if (typeof search !== 'function') throw new Error('createResearchAnswerer needs a `search` primitive');
  if (!auditLog) throw new Error('createResearchAnswerer needs an `auditLog`');

  return async (challenge) => {
    const question = typeof challenge === 'string' ? challenge : String(challenge?.question || '').trim();
    if (!question) return { answer: '', sources: [], trail: null };
    const m = typeof model === 'function' ? await model() : model;

    // Formulate a real search query from the question (falls back to the question itself on any fault).
    let seed = question;
    try { seed = (await formulate({ model: m, question, history: [], fallback: question })) || question; }
    catch { seed = question; }
    onResearch?.({ phase: 'start', query: seed });

    // Collect every fetched page's TEXT as the walk admits it. The research summary the walk returns
    // carries only titles/urls; the challenger grounds its verdict against the BODIES, so we keep them.
    const retrieved = new Map();   // id → { docId, title, url, text }
    const collectingSearch = async (query, opts = {}) => {
      const admitted = await search(query, opts);
      for (const a of admitted || []) {
        const d = a?.doc; if (!d) continue;
        const id = d.docId || d.web?.url || d.web?.final_url || `r${retrieved.size}`;
        if (!retrieved.has(id)) retrieved.set(id, {
          docId: d.docId || null,
          title: d.web?.title || d.title || a.record?.title || a.item?.title || '',
          url: d.web?.url || d.web?.final_url || a.record?.url || a.item?.url || '',
          text: typeof d.text === 'string' ? d.text : (a.record?.text || ''),
        });
      }
      return admitted || [];
    };

    let result;
    try {
      result = await runResearch({
        question, docs: [], model: m,
        embedder, geometricEmbedder: geometricEmbedder || undefined,
        auditLog, history: [], grounding: 'auto',
      }, {
        search: collectingSearch, seed, maxHops, k,
        onHop: (h) => onResearch?.({ phase: 'hop', hop: h }),
        onHopDone: (h) => onResearch?.({ phase: 'hopDone', hop: h }),
      });
    } catch (err) {
      onResearch?.({ phase: 'error', error: String(err?.message || err) });
      return { answer: '', sources: [...retrieved.values()], trail: null };
    }

    const research = result.research || {};
    // The sources the ANSWER grounded on — the walk's kept pages (research.sources), rehydrated with
    // the page text we collected. If the walk reported none, fall back to everything we fetched.
    const keptIds = new Set((research.sources || []).map((s) => s.docId).filter(Boolean));
    let sources = [...retrieved.values()].filter((s) => keptIds.size === 0 || (s.docId && keptIds.has(s.docId)));
    if (!sources.length) sources = [...retrieved.values()];

    const trail = Object.freeze({
      seed,
      results: research.results ?? sources.length,
      kept: research.kept ?? sources.length,
      hops: (research.hops || []).map((h) => Object.freeze({ query: h.query, term: h.term ?? null, results: h.results ?? 0, kept: !!h.kept, salience: h.salience ?? null })),
      sources: (research.sources || []).map((s) => Object.freeze({ title: s.title || '', url: s.url || '' })),
    });
    onResearch?.({ phase: 'done', sources, trail });
    return { answer: String(result.answer || ''), sources, trail };
  };
};
