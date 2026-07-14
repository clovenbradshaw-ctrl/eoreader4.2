// EO: EVA·DEF(Lens,Void → Lens, Binding,Dissecting) — web-search proposer
// The web-search PROPOSER — the model proposes, it never fetches (docs/web-search.md).
//
// When a turn measures a gap the document cannot close — a void, an answer bound to nothing,
// an unsettled referent, thin coverage — that gap is a question addressed to the world. The
// proposer turns it into a query a confirmed user action (or an explicit auto mode) can run.
// Proposer-only by construction: this returns a proposal; the fetch happens elsewhere, behind
// a go-ahead. Null when the answer is well-grounded — a sound turn never reaches for the net.

import { isUnbound, isAbstention, underCorroborated } from '../enactor/ground/index.js';
import { classifyTurn, resolveQuery, isReferentialStall } from './converse/index.js';

// The cost the user is told before any hop — the query reaches public engines via the proxy.
export const COST_NOTICE =
  'Searching the web sends this query to public search engines through the proxy. ' +
  'Nothing is sent without your go-ahead.';

// A third-person pronoun whose antecedent lives back in the conversation — mirrors
// dialogue-state.js's PRONOUN (internal there; the set is the closed English inventory,
// so the duplication cannot drift).
const PRONOUN = /\b(he|him|his|she|her|hers|it|its|they|them|their|theirs)\b/i;

// anchorTopicless(query, history) → the query to search, or NULL when nothing anywhere
// names a subject. A REFERENTIAL turn that names no topic of its own — a pronoun ask
// ("what did he do?") or a stall ("tell me more about that") — matches only its function
// words on a search engine: the exported "what did he do?" run fetched "What Did Jack
// Do?" and the Waco siege, and admitted them into the record. The subject such a turn
// leans on lives in the CONVERSATION, so anchor it there (resolveQuery: the open intent
// + the warm referent, deterministic, no model). When even the discourse names nothing,
// there is nothing to search FOR — return null and let the honest abstention stand
// rather than admit noise. A terse-but-plain ask that simply has thin words (the 'q'
// placeholder, "summarize") is NOT referential and passes through untouched.
export const anchorTopicless = (query, history = []) => {
  const q = String(query || '').trim();
  if (!q) return null;
  try {
    if (classifyTurn(q).topic.length > 0) return q;              // names its own topic — stands
    if (!PRONOUN.test(q) && !isReferentialStall(q)) return q;    // topicless but not referential — stands
    const anchored = resolveQuery(q, history || []);
    return classifyTurn(anchored).topic.length > 0 ? anchored : null;
  } catch { return q; }   // a discourse-read fault never suppresses a search — the raw turn stands
};

// proposeWebSearch(ctx) → { query, rationale, trigger, cost } | null. Reads the SAME gaps the
// answer loop already measures, scoped to the pointed `answer` task (a whole-document task's
// connective gaps are not lookups to the world).
export const proposeWebSearch = (ctx) => {
  if (!ctx) return null;

  // A CHAT turn answers from the model's own general knowledge — and that is fine. We do not
  // replace it; we CHECK it. The proposal is a `verify` trigger: search the web on the question
  // and flag whether the result supports the answer, leaving the answer itself alone. (Smalltalk
  // / math / metadata short-circuit at `route`, so a chat turn here is a real question.)
  if (ctx.route === 'chat') {
    // Anchored the same way as the grounded query below: a referential chat turn with no
    // discourse to bind it ("what did he do?" as a first ask) verifies against nothing but
    // its own function words — skip the fetch and let the answer ride unverified instead.
    const q = anchorTopicless(ctx.question, ctx.history);
    return q ? { query: q, rationale: 'answered from general knowledge — checking it against the web',
      trigger: 'verify', cost: COST_NOTICE } : null;
  }

  if (ctx.route !== 'grounded') return null;
  if (ctx.task && ctx.task !== 'answer') return null;

  const flags = new Set((ctx.vetoes || []).map(v => v.id));

  // GAP triggers — the document cannot close it, so reach out to FILL it.
  const reasons = [];
  if (ctx.voidMeasure) reasons.push('the document does not cover it');
  if (isUnbound(ctx.bound || [], ctx.rawOutput || '')) reasons.push('the answer ties to nothing in the document');
  if (ctx.referential && ctx.referential.id != null && ctx.referential.concentrated === false)
    reasons.push('the passage does not settle who it is about');
  // The ABSTENTION gap — the clearest "the sources don't contain it" signal there is: the reader
  // said, in plain words, that it did not find the answer in what it read. The reading-level
  // triggers above miss this exact case — isUnbound and low-coverage both self-suppress on an
  // abstention (it claims nothing to be unbound or under-covered — enactor/ground/veto.js), and
  // voidMeasure only fires when the geometric read happened to measure a void, flaky under the
  // default hash embedder. So a polite "I didn't find that in what I read" produced NO proposal and
  // no search — the gap the user hit ("if the sources don't contain the question, that should
  // trigger a web search"). Read the SETTLED answer (the honest word the floor/absence stage put
  // there) directly: if it abstained, the gap is real and belongs to the world.
  if (isAbstention(ctx.answer || ctx.rawOutput || '')) reasons.push('the reading did not contain the answer');
  // The DISCOURSE gap — the metacognition's measured research current (turn/meta-route.js,
  // null-gated Born weight, never a keyword). The reading-level triggers above see what the
  // document failed to close; this one sees what the CONVERSATION itself says lives outside
  // the reading ("this is about last week's election") before any grounding failure has to
  // happen. Opt-in by construction: no ctx.discourse → byte-identical.
  if (ctx.discourse && ctx.discourse.researchDrive > 0)
    reasons.push('the conversation itself asks past the reading');
  // LOW-COVERAGE is a gap only when the document did NOT actually ground the answer. When a
  // document is loaded and the answer earned a citation into it, a low-coverage flag is
  // incidental — a few tangential spans (e.g. cross-turn fragments) dragging the ratio down —
  // not a reason to spend a web search while the answer is sitting in the loaded document. A
  // genuinely from-nowhere answer is still caught by the `unbound` trigger above; this only
  // suppresses the redundant fetch over a document-grounded answer.
  const docGrounded = !!ctx.doc && ((ctx.sources || []).length > 0 || (ctx.bound || []).some(b => b.citation));
  if (flags.has('low-coverage') && !docGrounded) reasons.push('few of the claims are grounded in the document');

  // WITNESS trigger — the answer is grounded but only on the engine's OWN reading (reafference,
  // e.g. an EOT/notes source); reach out to CONFIRM it against the world. A gap, if present,
  // dominates (fill before confirm); interpretation-only proposes a witness-seek.
  let trigger = reasons.length ? 'gap' : null;
  if (flags.has('interpretation')) {
    reasons.push('the answer rests on the engine’s own reading, not on anything witnessed');
    trigger = trigger || 'witness';
  }
  // CORROBORATION — the answer is otherwise sound (no gap, no witness-seek) but rests on a SINGLE
  // meaningfully-distinct source: the reflection witnessed its claims, yet they collapse to fewer
  // than two independent voices (enactor/ground/corroboration.js — mirrors, reprints, and one
  // publisher all count once). A fact standing on one voice is not yet corroborated, so reach out
  // for an INDEPENDENT second source (docs/multi-source-corroboration.md). Dominated by any real gap
  // or witness-seek above (a void is not "single-source" — it is "no source"). Opt-in by
  // construction: no ctx.reflection → underCorroborated is false and the proposer stays byte-identical.
  if (!reasons.length && underCorroborated(ctx.reflection, ctx.corroborationEnrich || {})) {
    reasons.push('the answer rests on a single source — seeking an independent corroboration');
    trigger = 'corroborate';
  }
  if (!reasons.length) return null;

  // The query: the question, sharpened with the figure the reading centres on when we have a
  // proper name for it and the question does not already carry it. Without this, a bare
  // question like "what happens at the end?" goes to the world with no subject and matches
  // whatever shares its words — a film called "What Happens Later", not the document — and
  // those irrelevant pages then pollute the answer scope. The reading's surf `focus` (the
  // figure the fold settled on, e.g. "Gregor Samsa") is the subject when no prediction or
  // referent target named one, so it backstops the fallback chain.
  // When the fold's referent DIFFUSED (concentrated === false), the surf's focus is the
  // WANDERING figure — the loud, wrong one the reading rode to (Vaporwave for "fastest
  // dolphin") — so sharpening the query with it would send exactly the wrong subject to the
  // world. In that case go with the bare question and let the caller's formulateSearchQuery /
  // sense-commit disambiguate it afresh. Otherwise sharpen as before.
  const q = String(ctx.question || '').trim();
  const diffuse = ctx.referential?.concentrated === false;
  const figure = diffuse ? '' : (ctx.refTarget?.label || ctx.prediction?.primaryName || ctx.surf?.focus || '');
  const query = (figure && !q.toLowerCase().includes(String(figure).toLowerCase()))
    ? `${q} ${figure}`.trim() : q;

  // A referential turn no figure sharpened ("what did he do?" with the referent diffuse) is
  // anchored on the DISCOURSE before it may ride as a query — and when even the discourse
  // names no subject, NOTHING is proposed: searching the turn's function words verbatim can
  // only fetch junk into the record (the exported Waco-siege run). The honest abstention,
  // flags intact, is the better answer than noise dressed as research.
  const anchored = anchorTopicless(query || q, ctx.history);
  if (anchored == null) return null;

  return { query: anchored, rationale: reasons.join('; '), trigger, cost: COST_NOTICE };
};

// searchAnnouncement(proposal) → a first-person, pre-search line for the chat bubble, or null.
//
// The proposer already decided WHETHER to search and WHAT for (the sharpened, disambiguated
// `query`) and WHY (`trigger` + `rationale`). This only PROMOTES that decision into conversational
// voice, said the moment the search fires — "let me look that up because…" — rather than leaving it
// as a diagnostic string in the audit panel after the fact. Pure string-mapping over the existing
// proposal: no new logic, no model call, so showing it costs nothing and reads as progress, not
// another wait. Accepts a bare { query } too (the auto path, where the search runs before any turn
// has produced a proposal) and falls back to a neutral "let me look that up".
export const searchAnnouncement = (proposal) => {
  if (!proposal) return null;
  const q = String(proposal.query || '').trim();
  if (!q) return null;
  return `${announceLead(proposal)} Searching the web for “${q}”…`;
};

// The "why", in the first person — keyed off the trigger, and for a gap off the measured reason
// (the same rationale phrases proposeWebSearch built above) so the promise to the user matches what
// the engine actually found: "I answered from memory, let me verify" is a genuinely different
// promise from "the document doesn't cover this", and the user can redirect on either.
const announceLead = (proposal) => {
  const r = String(proposal.rationale || '').toLowerCase();
  if (proposal.trigger === 'verify')
    return 'I answered from what I already know — let me check that against the web.';
  if (proposal.trigger === 'witness')
    return 'That rests on my own reading of the document, not on anything witnessed — let me confirm it against the web.';
  if (proposal.trigger === 'corroborate')
    return 'That rests on a single source — let me look for an independent one that corroborates it.';
  // gap (or an unlabelled/auto proposal): name the specific gap when the rationale carries it.
  if (r.includes('does not cover')) return "I don't think the document covers this — let me look it up.";
  if (r.includes('did not contain the answer')) return "I didn't find that in what I've read — let me look it up.";
  if (r.includes('ties to nothing')) return "I couldn't tie that to anything in the document — let me look it up.";
  if (r.includes('does not settle')) return "The passage doesn't settle who this is about — let me look it up.";
  if (r.includes('few of the claims')) return 'Little of that is grounded in the document — let me look it up.';
  if (r.includes('asks past the reading')) return "This asks past what we've read — let me look it up.";
  return 'Let me look that up.';
};
