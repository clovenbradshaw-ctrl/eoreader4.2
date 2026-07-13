// EO: EVA·DEF·NUL(Void,Field,Link,Network,Entity → Lens,Void, Binding,Dissecting,Clearing) — mechanical answerers (confirm/relation/who/smalltalk)
// Mechanical answerers. Cheap, deterministic, no model load.
// Each returns either {route, text, sources} or null.
//
// Routing tries these first — if a question is mechanical, the model
// is never warmed for it. This is the single largest UX win on cold start.

import { tok } from '../../perceiver/parse/index.js';
import { editWithin, fuzzCeiling } from '../../perceiver/parse/index.js';
import { projectGraph, boundedNull } from '../../core/index.js';
import { typeOf, areDisjoint } from '../../core/index.js';
import { answerMathSync } from './math.js';

// The non-relational confirm "Yes" line. It is DERIVED (boundedNull) from the
// field's own chance overlap, not declared; CONFIRM_FLOOR is only the fallback,
// reached when the field is too thin or coarse to measure a line below 1 (a
// one-sentence doc, a two-token question). CONFIRM_ALPHA is the tolerated rate of
// reading chance overlap as an answer — a policy, not an overlap value.
const CONFIRM_FLOOR = 0.6;
const CONFIRM_ALPHA = 0.05;

// The mechanical (sync, model-free) math answerer. The single-operator regex this used
// to be is retired — it is now math.js (answer/math.js): a full expression evaluator
// (parentheses, powers, functions, constants) backed by mathjs in the browser. This sync
// re-export keeps tryMechanical and the unit tests on the dependency-free path.
export const answerMath = answerMathSync;

// A relational confirm question — "is grete his mother?" — types its relation and
// resolves its subject, or returns null (not a relation the algebra knows, or a
// subject the document never admitted). The OBJECT ("his") is not resolved here;
// it is recovered as the owner of whichever document edge already gives the
// subject a role, so the conflict is checked on a real pair, never an invented one.
const confirmClaim = (doc, q) => {
  const m = q.match(/^\s*(?:is|are|was|were)\s+([A-Za-z][a-z]+)\s+(?:his|her|their|the)?\s*([a-z]+)\b/i);
  if (!m) return null;
  const subj = resolveEntityId(doc, m[1]);
  const rel  = m[2].toLowerCase();
  if (!subj || !typeOf(rel)) return null;          // only relations the algebra knows
  return { subj, rel };
};

const labelOf = (doc, id) => (doc.admission?.labelOf && doc.admission.labelOf(id)) || id;

export const answerConfirm = (doc, question) => {
  const q = String(question || '').trim();
  if (!/^(is|are|was|were|does|do|did)\s+/i.test(q)) return null;

  // ── relational confirm: consult the graph BEFORE token overlap (the t8 fix) ──
  // The token-overlap fallback below would rubber-stamp "is grete his mother?" as
  // "Yes." on the mere co-occurrence of the words — it never types the relation.
  // For a typed relation we consult the reading instead, and the rubber-stamp is
  // dead at the route, not flagged after the fact.
  const claim = confirmClaim(doc, q);
  if (claim) {
    const graph = projectGraph(doc.log);
    const rep   = graph.representative || ((id) => id);
    const subj  = rep(claim.subj);
    const claimType = typeOf(claim.rel);

    // Kinship/social CON edges are logged owner → relative, so the relation
    // describes the `to` node. The questioned subject is that relative, so its
    // role edges are the typed edges pointing AT it. (This is the direction the
    // edge actually carries; matching `from` would miss every kinship bond.)
    const incident = (graph.edges || []).filter(e => rep(e.to) === subj && typeOf(e.via));

    // Disjoint axiom on the same pair → refuse, citing the witnessing edge.
    const conflict = incident.find(e => areDisjoint(claim.rel, e.via));
    if (conflict) {
      const owner = labelOf(doc, rep(conflict.from));
      const role  = String(conflict.via).replace(/-of$/, '');
      return {
        route: 'confirm',
        text: `No — the document has ${labelOf(doc, subj)} as ${owner ? `${owner}'s ` : ''}${role}` +
              `${conflict.sentIdx != null ? ` [s${conflict.sentIdx}]` : ''}, which rules that out.`,
        sources: conflict.sentIdx != null ? [conflict.sentIdx] : [],
      };
    }
    // Same primitive on the same relative → witnessed → confirm with the edge cite.
    const support = incident.find(e => typeOf(e.via).type === claimType.type);
    if (support) {
      return {
        route: 'confirm',
        text: `Yes${support.sentIdx != null ? ` [s${support.sentIdx}]` : ''}.`,
        sources: support.sentIdx != null ? [support.sentIdx] : [],
      };
    }
    // Typed relation, no role edge either way → don't rubber-stamp; say so plainly.
    return { route: 'confirm', text: 'The document does not say.', sources: [] };
  }

  // ── non-relational confirm: the token-overlap path ──
  // The "Yes" line is no longer a constant. The best sentence's overlap must beat
  // what chance overlap throws up across the OTHER sentences (boundedNull, leave-
  // one-out the peak — core/voidnull): a bounded-signal Born line, since overlap is
  // a fraction in [0,1] read at a coarse grain (one shared token = 1/qLen). When the
  // field is too thin or coarse to measure a line below 1 — a one-sentence doc, a
  // two-token question — it falls back to CONFIRM_FLOOR. The 0.2 does-not-say floor
  // and the deferral band above it are unchanged: asserting the void itself is the
  // answerability reader's call (surfer/answerable), not this cheap confirm's.
  const qTokens = tok(q);
  if (qTokens.length === 0) return null;
  const scores = [];
  let best = null;
  for (let i = 0; i < doc.sentences.length; i++) {
    const sentSet = doc.tokensBySentence[i];
    let hits = 0;
    for (const t of qTokens) if (sentSet.has(t)) hits++;
    const score = hits / qTokens.length;
    scores.push(score);
    if (!best || score > best.score) best = { idx: i, score };
  }
  const yesLine = boundedNull(scores, {
    alpha: CONFIRM_ALPHA, grain: 1 / qTokens.length, leaveOut: best?.score, fallback: CONFIRM_FLOOR,
  });
  if (best && best.score >= yesLine) {
    return { route: 'confirm', text: `Yes. [s${best.idx}]`, sources: [best.idx] };
  }
  if (best && best.score < 0.2) {
    return { route: 'confirm', text: 'The document does not say.', sources: [] };
  }
  return null;
};

// Resolve a queried name to an admitted entity id — alias-aware, so "gregor"
// finds the referent even after "Gregor" was synthesised into "Gregor Samsa", and
// FUZZY as a last resort, so a near-spelling ("greta") still lands on "Grete".
const resolveEntityId = (doc, name) => {
  if (!doc || !doc.admission) return null;
  const n = name.toLowerCase();
  for (const [label, id] of doc.admission.admitted) {
    if (label.toLowerCase() === n) return id;
  }
  for (const [label, id] of doc.admission.admitted) {
    const l = label.toLowerCase();
    if (l.includes(n) || n.includes(l)) return id;
  }
  // Last resort: a near-spelling of an admitted label. Bounded edit distance, so
  // "greta"→"Grete" lands but unrelated names do not; only fires when exact and
  // substring both missed. The closest label wins (deterministic over admitted order).
  let best = null;
  for (const [label, id] of doc.admission.admitted) {
    const l = label.toLowerCase();
    const ceil = fuzzCeiling(Math.max(n.length, l.length));
    if (ceil === 0) continue;
    const d = editWithin(n, l, ceil);
    if (d > 0 && d <= ceil && (!best || d < best.d)) best = { id, d };
  }
  return best ? best.id : null;
};

// A "who/what is X" answer wants a predicate NOMINATIVE — a noun phrase naming
// what X IS ("a travelling salesman", "the chief clerk") — not a transient state
// the copula happened to introduce ("sleeping since…", "talking, … were struck…").
// The DEF-predicate channel records BOTH (anything after a copula), and the old
// lookup took the LAST one, so a narrative figure answered with whatever state it
// was last caught in. Take the FIRST clean nominal instead; when the document holds
// none, DEFER (return null) so the turn falls through to the grounded reading —
// which now centres on the referent and answers far better than a copula fragment.
const NOMINAL_DEF = /^(?:an?|the)\s+[a-z]/i;          // a/an/the + a noun head
const cleanDefinition = (defs) => {
  for (const d of defs) {
    const v = String(d.value || '').trim();
    if (NOMINAL_DEF.test(v) && !v.includes(',') && v.split(/\s+/).length <= 6) return d;
  }
  return null;
};

export const answerWho = (doc, question) => {
  const m = String(question || '')
    .match(/^\s*who\s+(?:is|was|were|are)\s+(?:the\s+|a\s+|an\s+)?(.+?)\s*[?.!]*$/i);
  if (!m) return null;
  const name = m[1].trim();
  if (!name) return null;
  // Bare-name lookup ONLY. A possessive ("gregor's sister") is a relational query —
  // answerRelation owns it, or it defers to the grounded reading; a multi-word run-on
  // ("gregor's sister and what does she do in the story") is not a name either. In
  // both, the phrase merely CONTAINS an admitted name, and resolveEntityId's substring
  // rule would bind the whole phrase to that name — the confidently-wrong path the
  // audit caught (Gregor answered for "Gregor's sister"). Defer instead.
  if (/['‘’]/.test(name) || name.split(/\s+/).length > 4) return null;
  const id = resolveEntityId(doc, name);
  if (!id) return null;
  const defs = doc.log.filter(e => e.op === 'DEF' && e.id === id && e.key === 'predicate');
  const def = cleanDefinition(defs);
  if (!def) return null;                              // no clean definition → defer to grounded
  const label = (doc.admission.labelOf && doc.admission.labelOf(id)) || titleCase(name);
  return {
    route: 'who',
    text: `${label} is ${def.value} [s${def.sentIdx}].`,
    sources: [def.sentIdx],
  };
};

// A relational "who" — "who is Gregor's sister?", "who is the captain of the ship?"
// — is not a definition lookup; it is a one-hop GRAPH SURF. The document already
// logged the tie as a typed CON edge (Gregor -> Grete : sister), so the answer is
// the node on the other end. We resolve the owner, TYPE the asked relation, and
// read the matching edge straight off the projection. Crucially this runs BEFORE
// the entity-name `answerWho`, which would otherwise bind "Gregor's sister" to
// Gregor himself (the bare name is a substring of the phrase) and answer with his
// predicate — the confidently-wrong path the user hit.
// The relation noun (possessive form) or the owner (of-form) may be followed by a
// CONJOINED clause — "who is gregor's sister AND what does she do" — so the match no
// longer anchors to the end of the string right after it. The possessive owner stays a
// single head (non-greedy, up to the first "'s"); the of-form owner stops at a trailing
// "and …". The typed-relation gate below keeps the looser match from over-firing: a
// noun the algebra doesn't know as a relation still returns null and defers.
const REL_POSSESSIVE = /^\s*who\s+(?:is|are|was|were)\s+(?:the\s+)?(.+?)'s\s+([A-Za-z]+)\b/i;
const REL_OF_FORM    = /^\s*who\s+(?:is|are|was|were)\s+(?:the\s+|a\s+|an\s+)?([A-Za-z]+)\s+of\s+(.+?)(?:\s+and\s+.*)?\s*[?.!]*$/i;

export const answerRelation = (doc, question) => {
  if (!doc || !doc.log) return null;
  const q = String(question || '').replace(/[‘’]/g, "'");   // normalise curly apostrophes

  let owner, relation, m;
  if ((m = q.match(REL_POSSESSIVE)))   { owner = m[1]; relation = m[2]; }
  else if ((m = q.match(REL_OF_FORM))) { relation = m[1]; owner = m[2]; }
  if (!owner || !relation) return null;

  const asked = typeOf(relation);
  if (!asked) return null;                            // not a relation the algebra knows → defer
  const ownerId = resolveEntityId(doc, owner.trim().replace(/^(?:the|a|an)\s+/i, ''));
  if (!ownerId) return null;

  // Match edges whose typed relation is the asked primitive. Kinship CON edges are
  // logged owner → relative, so the forward read (owner is `from`) answers with the
  // `to`, and there the edge's noun describes the answer — so a gendered query can
  // be gated by gender (a "sister" query never returns a brother). A SYMMETRIC
  // primitive (sibling, spouse) also holds in reverse, so an edge pointing AT the
  // owner answers with its `from`; but there the noun describes the OWNER, not the
  // answer, so a gendered reverse can't be verified and is left to retrieval —
  // reverse only answers a genderless query ("who is Grete's sibling").
  const graph = projectGraph(doc.log);
  const rep   = graph.representative || ((id) => id);
  const oid   = rep(ownerId);
  const found = new Map();                            // answerId → first witnessing sentIdx
  for (const e of graph.edges) {
    const t = typeOf(e.via);
    if (!t || t.type !== asked.type) continue;
    let aid = null;
    if (rep(e.from) === oid) {
      if (asked.gender && t.gender && asked.gender !== t.gender) continue;  // sister ≠ brother
      aid = rep(e.to);
    } else if (asked.symmetric && !asked.gender && rep(e.to) === oid) {
      aid = rep(e.from);
    }
    if (aid == null || aid === oid) continue;          // no match, or a self-loop
    if (!found.has(aid)) found.set(aid, e.sentIdx);
  }
  if (found.size === 0) return null;                  // the tie isn't in the graph → let retrieval try

  const names = [...found.keys()].map((id) => labelOf(doc, id));
  const cites = [...found.values()].filter((s) => s != null);
  const list  = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const cite  = cites.length ? ` [${cites.map((s) => `s${s}`).join(', ')}]` : '';
  return {
    route: 'who',
    text: `${labelOf(doc, oid)}'s ${relation.toLowerCase()} ${names.length > 1 ? 'are' : 'is'} ${list}${cite}.`,
    sources: cites,
  };
};

// Smalltalk routing: a greeting is the cheapest path of all — answered with a
// friendly line and no model, never grounded against the document. The anchors
// keep "hi, who is Gregor?" out: only an essentially-greeting message matches.
const GREET  = /^\s*(h(i+|ey+|ello|iya)|yo+|howdy|sup|greetings|good\s+(morning|afternoon|evening|day))\b[\s!.,]*$/i;
const BYE    = /^\s*(bye|goodbye|see\s+(you|ya)|farewell|good\s*night|cya)\b[\s!.,]*$/i;
const HOWRU  = /\b(how\s+are\s+you|how'?s\s+it\s+going|how\s+do\s+you\s+do|what'?s\s+up)\b/i;
const JUSTHI = /^\s*(i'?m\s+)?just\s+saying\s+(hi|hello|hey)\b[\s!.,]*$/i;
const THANKS = /^\s*(many\s+)?(thanks|thank\s+you|thx|ty|cheers)\b[\s!.,]*$/i;

// `hasDoc` tells the greeter a document is already open, so it does not tell the user to "open a
// document" at a book already loaded (docs/response-demand.md — the demand gate now runs WITH a doc
// in scope, not only on an empty record). Defaults false → the text is byte-identical to before for
// every existing caller (tryMechanical, the no-docs path).
export const answerSmalltalk = (question, { hasDoc = false } = {}) => {
  const s = String(question || '').trim();
  if (!s) return null;
  const talk = (text) => ({ route: 'smalltalk', text, sources: [] });
  if (JUSTHI.test(s)) return talk(hasDoc ? 'Hi there! Ask me anything about what you have open.' : 'Hi there! Ask me anything about the document.');
  if (GREET.test(s))  return talk(hasDoc ? 'Hello! Ask me anything about what you have open — or anything else.' : 'Hello! Open a document and ask me about it, or ask me anything.');
  if (BYE.test(s))    return talk('Goodbye.');
  if (HOWRU.test(s))  return talk(hasDoc ? 'Doing well — ready when you are. Ask me about what you have open.' : 'Doing well — ready when you are. Ask me about the document.');
  if (THANKS.test(s)) return talk("You're welcome.");
  return null;
};

// The phatic door's OFFLINE NEGATIVE floor — the mirror of answerSmalltalk. Where that
// asserts a clear greeting IS social, this asserts a clear REQUEST is NOT: a message that
// gives an instruction (a task verb) or asks a content question is work, however the tiny
// metacognition happened to describe it. The graded model door (phaticFromSpeech over the
// 1B's discourse read) over-fires on a directive — "no read the question i sent" was read
// social and answered with a confabulated "You sent a message saying 'Hello…'". This vetoes
// that at the door. It only ever PREVENTS phatic, never forces it (answerSmalltalk still
// owns the positive side), so a real greeting/thanks/goodbye/how-are-you — which carries
// none of these markers — is untouched, and a false veto merely routes a social line into a
// harmless "I didn't find that" instead of the confabulation a false accept produces.
const DIRECTIVE = /\b(re-?read|read|research|answer|summar(?:ise|ize|y|ize)|explain|describe|tell|find|look\s+up|search|write|list|compare|analy[sz]e|define|show|translate|calculate|check|prove|cite|quote|continue|expand|revise|rewrite|paraphrase|fix|give|help)\b/i;
const CONTENT_Q = /^\s*(what|who|whom|whose|where|when|why|how|which|can|could|does|do|did|is|are|was|were)\b/i;   // a question opener…
const SOCIAL_Q  = /^\s*(how\s+are\s+you|how'?s\s+it\s+going|how\s+do\s+you\s+do|what'?s\s+up|what'?s\s+new|how\s+are\s+things|are\s+you\s+(there|around|ok|okay))\b/i;   // …except the social formulas

export const looksDirective = (question) => {
  const s = String(question || '').trim();
  if (!s) return false;
  if (SOCIAL_Q.test(s)) return false;                 // "how are you", "you around?" stay social
  return DIRECTIVE.test(s) || CONTENT_Q.test(s);
};

const titleCase = (s) => s.replace(/\b\w/g, c => c.toUpperCase());

export const tryMechanical = (doc, question) =>
  answerSmalltalk(question)
  || answerMath(question)
  || answerConfirm(doc, question)
  || answerRelation(doc, question)
  || answerWho(doc, question)
  || null;
