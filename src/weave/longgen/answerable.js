// EO: DEF·EVA(Field,Network → Lens, Dissecting,Binding) — answerability gate (§3)
// answerable — the answerability gate, in FRONT of the navigate face (spec-planner.md §3).
//
// A grounded system can still lie, and the lie is not a false fact — it is a false
// SHAPE. The worked failure: a directions question against a corpus that holds an
// address, a sentence that the place is seven miles out by a trail, and a map link,
// but NO route. The honest answer is one atom: the sources do not contain the
// directions, here is the address and the link. A shapeless walk instead inflates
// the three thin spans into "Getting there" / "Transportation Options" sections — a
// procedure that does not exist, every word grounded, the shape invented. The void
// gate cannot catch it: the lie is not at the token grain, it is the gap between
// what the question asked for and what the ground can give, papered with grounded
// filler.
//
// So before the walk, read the question and TYPE what it wants — a fact, a
// procedure, a route, a comparison, a definition, a judgment, a list, a summary —
// then ask whether the ground can supply THAT TYPE, not whether it holds anything
// at all. If the wanted type is not a type the ground can supply, the walk does not
// run: the response is the refusal atom and nothing more. The SAME gate licenses the
// follow-up offer — "want me to go deeper on X" is an offer to walk again next turn,
// so it may only name regions the field can actually develop.
//
// Pure, deterministic, no model — the same discipline answerability.md already runs
// on the response, lifted to the SHAPE the question wants. This complements
// surfer/answerable.js (is there ANYTHING here) with the orthogonal question (does
// what is here answer the TYPE asked).

// ── The wanted-type test ─────────────────────────────────────────────────────

export const WANTED_TYPES = Object.freeze([
  'route', 'procedure', 'comparison', 'definition', 'judgment', 'list', 'summary', 'fact',
]);

// Type the question by what it WANTS. Order matters: the more specific patterns
// (a route is a procedure of movement; a definition is a narrowed fact) are tried
// first, and `fact` is the lenient default.
export const classifyWantedType = (question = '') => {
  const q = String(question || '').toLowerCase().trim();
  if (!q) return 'fact';

  if (/\b(directions?|route|how (do|can|would) (i|you|one) (get|drive|travel|walk|navigate)|how to get|get (there|to)\b)/.test(q))
    return 'route';
  if (/\b(how (do|to|can)\b|steps?\b|step[- ]by[- ]step|process\b|procedure\b|instructions?\b|how is .* (made|done))/.test(q))
    return 'procedure';
  if (/\b(compare|comparison|versus|\bvs\b|difference between|differ|better than|worse than|which is (better|worse))/.test(q))
    return 'comparison';
  if (/^(what|whats|what's) (is|are|was|were)\b|\bdefine\b|\bdefinition of\b|\bmeaning of\b|what does .* mean/.test(q))
    return 'definition';
  if (/\b(should\b|is it (good|bad|worth|right|wrong)|do you think|your opinion|evaluate|assess|is .* (better|worth it)|recommend)/.test(q))
    return 'judgment';
  if (/\b(list\b|what are the\b|examples? of\b|enumerate|name (the|some)|which (ones|of))/.test(q))
    return 'list';
  if (/\b(summar(y|ize|ise)|overview|tl;?dr|gist\b|main points|in short)/.test(q))
    return 'summary';
  return 'fact';
};

// ── Does the ground supply that type? ────────────────────────────────────────

// Movement/imperative tokens that mark a route step, and sequence markers that mark
// any procedure step. A `route` needs movement steps; a `procedure` needs sequence
// or imperative steps. Both need at least two — one instruction is not a sequence.
const MOVE_VERB = /\b(turn|head|go|drive|walk|follow|take|continue|merge|exit|proceed|cross|bear|veer|keep|stay|enter|arrive|return)\b/;
const SEQ_MARK = /\b(first|second|third|then|next|after that|afterwards?|finally|lastly|begin by|start by|once you)\b|^\s*\d+[.)]/;
const IMPERATIVE = /^(add|press|click|select|open|close|set|enter|choose|insert|remove|run|install|configure|connect|tap|hold|release|mix|pour|heat|cut|place)\b/;

const stepSpans = (ground, { movement = false } = {}) =>
  (ground || []).filter((s) => {
    const t = String(s?.text || '').trim().toLowerCase();
    if (!t) return false;
    if (movement) return MOVE_VERB.test(t) && /\b(left|right|north|south|east|west|onto|toward|towards|past|until|exit|road|street|highway|mile|block|turn)\b/.test(t);
    return SEQ_MARK.test(t) || IMPERATIVE.test(t);
  });

// Distinct figures (proper nouns) the ground names — the constituents a comparison
// needs two of, with an edge between them.
const distinctFigures = (ground) => {
  const set = new Set();
  for (const s of ground || []) {
    for (const m of String(s?.text || '').match(/\b[A-Z][A-Za-z'’-]{2,}\b/g) || []) set.add(m);
  }
  return set;
};
const CONTRAST = /\b(than|whereas|while|but|however|unlike|compared|more|less|better|worse|faster|slower|larger|smaller)\b/;

// A defining span — one that says what a thing IS, not merely mentions it.
const DEFINING = /\b(is a|is an|is the|are|means|refers to|defined as|known as|consists of|denotes)\b/;

// Does the ground supply the wanted TYPE? Returns { ok, reason } — `reason` names
// what was missing when it does not, so the refusal atom can be specific.
export const groundSupplies = (wantedType, ground = [], graph = null) => {
  const hasContent = (ground || []).some(s => String(s?.text || '').trim().length > 0);
  if (!hasContent) return { ok: false, reason: 'no-ground' };

  switch (wantedType) {
    case 'route': {
      const steps = stepSpans(ground, { movement: true });
      return steps.length >= 2
        ? { ok: true, reason: null }
        : { ok: false, reason: 'no-route' };
    }
    case 'procedure': {
      const steps = stepSpans(ground, { movement: false });
      return steps.length >= 2
        ? { ok: true, reason: null }
        : { ok: false, reason: 'no-procedure' };
    }
    case 'comparison': {
      const figs = distinctFigures(ground);
      const edge = (ground || []).some(s => CONTRAST.test(String(s?.text || '')))
        || (graph && (graph.relations || graph.edges || []).length > 0);
      return figs.size >= 2 && edge
        ? { ok: true, reason: null }
        : { ok: false, reason: 'no-comparison' };
    }
    case 'definition': {
      const def = (ground || []).some(s => DEFINING.test(String(s?.text || '')));
      return def ? { ok: true, reason: null } : { ok: false, reason: 'no-definition' };
    }
    // fact, list, summary, judgment — any real content supplies these; the floor and
    // the void gate catch an invented claim on the way back. Lenient by design: a
    // false refusal of an answerable question is worse than a missed one.
    default:
      return { ok: true, reason: null };
  }
};

// ── The named-subject test ───────────────────────────────────────────────────
//
// The hole the wanted-type test alone does not close. "Write a long essay about
// Grok" against a corpus that holds only Errol Musk types as a whole-document task
// (essay / summary / explain), and those are LENIENT by design — any content
// supplies them, because "summarize this" must never come back "the document does
// not say." But an essay ABOUT a named subject is not a summary of whatever is
// there: it asserts the subject is in the corpus. When the corpus never names it,
// the lenient pass becomes a licence to confabulate a whole essay about a figure
// the ground has never heard of — the observed Grok failure, where the model
// narrated its own void ("I don't have any information about Grok from the
// reading") and then invented a Robert E. Howard novel anyway.
//
// So when the question names a subject, the subject must be a figure the corpus
// knows before the walk is licensed. This is the SAME absence test as the void
// gate, lifted from the token to the topic: a name with no node behind it is
// struck before generation, not after.

// Subjects the question names, drawn from its capitalised content words (the same
// proper-noun shape figureSurface labels carry). Question words and the leading
// word are dropped so "Write about Grok" yields {Grok}, not {Write}.
const STOPWORDS = new Set([
  'write', 'tell', 'give', 'explain', 'describe', 'summarize', 'summarise', 'discuss',
  'what', 'who', 'when', 'where', 'why', 'how', 'is', 'are', 'was', 'were', 'the', 'a',
  'an', 'about', 'me', 'long', 'short', 'essay', 'on', 'of', 'for', 'and', 'or',
]);
export const namedSubjects = (question = '') => {
  const out = new Set();
  for (const m of String(question || '').match(/\b[A-Z][A-Za-z'’-]{2,}\b/g) || []) {
    if (!STOPWORDS.has(m.toLowerCase())) out.add(m);
  }
  return [...out];
};

// The question's content words, lowercased and de-duped — what a held snippet should
// be centred on so the fragment shown carries the part that bears on the ask, not the
// lead-in that merely comes first. Same STOPWORDS the subject test drops, but caps-
// independent: "what is the tallest house?" yields [tallest, house] where namedSubjects,
// being proper-noun-only, finds nothing to centre on.
export const queryTerms = (question = '') => {
  const out = [];
  const seen = new Set();
  for (const m of String(question || '').toLowerCase().match(/[a-z0-9][a-z0-9'’-]{2,}/g) || []) {
    if (STOPWORDS.has(m) || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
};

// The corpus's known figure labels. From the graph the gate is handed — projectGraph's
// `entities` Map (label per id), plus any explicit relation surfaces — lowercased for a
// case-insensitive contains test. Empty when no graph is available (the test then no-ops
// and the wanted-type test alone governs, which is the conservative default).
export const knownFigures = (graph = null, ground = []) => {
  const labels = new Set();
  const add = (s) => { const t = String(s || '').trim().toLowerCase(); if (t) labels.add(t); };
  if (graph) {
    const ents = graph.entities;
    if (ents && typeof ents.values === 'function') for (const e of ents.values()) add(e?.label || e?.id);
    for (const r of (graph.relations || graph.edges || [])) {
      add(r?.src?.label ?? r?.subject ?? r?.from); add(r?.tgt?.label ?? r?.object ?? r?.to);
    }
  }
  // Fall back to the ground text itself when no graph is threaded — every capitalised
  // token the spans actually contain is a figure the corpus names.
  for (const s of ground || []) for (const m of String(s?.text || '').match(/\b[A-Z][A-Za-z'’-]{2,}\b/g) || []) add(m);
  return labels;
};

// Does the corpus know the subjects the question names? A subject is known when its
// surface appears in (or contains, or is contained by) a known figure label — so
// "Musk" matches "Errol Musk" and vice versa. Returns { ok, missing } where `missing`
// is the named subjects with no figure behind them. When the question names nothing
// (a bare "summarize this"), there is no subject to be absent → ok.
export const subjectsKnown = (question = '', graph = null, ground = []) => {
  const subjects = namedSubjects(question);
  if (!subjects.length) return { ok: true, missing: [] };
  const figures = knownFigures(graph, ground);
  if (!figures.size) return { ok: true, missing: [] };   // no graph to test against → no-op
  const known = (s) => {
    const t = s.toLowerCase();
    for (const f of figures) if (f === t || f.includes(t) || t.includes(f)) return true;
    return false;
  };
  const missing = subjects.filter((s) => !known(s));
  // Licensed when at least one named subject is known. A question that names a known
  // figure AND an unknown aside still walks (the aside is caught downstream); only a
  // question whose subjects are ALL absent is refused — the Grok case.
  return { ok: missing.length < subjects.length, missing };
};

// ── The gate ─────────────────────────────────────────────────────────────────

// The phrasing for each unmet type, used in the refusal atom.
const MISSING_PHRASE = Object.freeze({
  'no-route': 'directions or a route',
  'no-procedure': 'step-by-step instructions',
  'no-comparison': 'a comparison',
  'no-definition': 'a definition',
  'no-ground': 'anything on this',
  'no-subject': 'anything on what was asked',
});

// The licensing decision. When a `question` is given, type it and test the ground
// against the type. `licensed:false` carries a `refusal` atom — the response when
// the walk must not run. No question → licensed (nothing to type-test; the loop's
// other stops still apply).
export const answerabilityGate = ({ question = '', ground = [], graph = null } = {}) => {
  if (!question) return { licensed: true, wantedType: null, reason: null, refusal: null };
  const wantedType = classifyWantedType(question);
  const focus = queryTerms(question);   // centre the held snippets on what the question asked

  // The named-subject test runs FIRST: a question whose every named subject is absent
  // from the corpus is unanswerable whatever its wanted type, and this is the one the
  // lenient whole-document types (essay / summary / explain) would otherwise wave
  // through. The Grok case is caught here, not by groundSupplies.
  const subj = subjectsKnown(question, graph, ground);
  if (!subj.ok) {
    return {
      licensed: false,
      wantedType,
      reason: 'no-subject',
      missing: subj.missing,
      refusal: refusalAtom('no-subject', ground, subj.missing, focus),
    };
  }

  const supply = groundSupplies(wantedType, ground, graph);
  if (supply.ok) return { licensed: true, wantedType, reason: null, refusal: null };
  return {
    licensed: false,
    wantedType,
    reason: supply.reason,
    refusal: refusalAtom(supply.reason, ground, [], focus),
  };
};

// The refusal atom — one unit: the sources do not contain <wanted type>, here is
// what they DO hold. Grounded on the held spans (so it cites, never invents), and
// short by construction (the honest one-sentence answer).
export const refusalAtom = (reason, ground = [], missing = [], focus = []) => {
  const phrase = reason === 'no-subject' && missing.length
    ? `anything about ${missing.join(' or ')}`
    : (MISSING_PHRASE[reason] || 'what was asked');
  const held = (ground || [])
    .filter(s => String(s?.text || '').trim())
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3);
  const sources = held.map(s => s.idx).filter(Number.isInteger);
  // Each held span is a display fragment centred on the ask; a member's own full stop
  // is redundant before the '; ' separator, so drop it. The closing '.' is added only
  // when the list does not already end in an ellipsis — no more "…." at the seam.
  const parts = held.map(s => trim(s.text, 80, focus).replace(/\.$/, ''));
  const list = parts.join('; ');
  const heldText = held.length
    ? ' They do hold: ' + list + (/…$/.test(list) ? '' : '.')
    : '';
  const text = `The sources do not contain ${phrase}.` + heldText;
  return Object.freeze({ refusal: true, reason, text, sources, spans: held });
};

// ── The follow-up offer, gated by the same test ──────────────────────────────

// Regions the field can actually develop next turn — uncovered spans with enough
// mass and content to support a further walk without confabulating. A region the
// ground holds one thin sentence about is NOT developable: offering to go deeper on
// it is an invitation to confabulate, and the gate forbids it.
const DEVELOPABLE_SCORE = 0.4;   // a region thinner than this is not worth offering
const DEVELOPABLE_LEN = 24;      // and one too short to develop is not offered either

export const developableRegions = (ground = [], covered = new Set(), { max = 3 } = {}) => {
  const cov = covered instanceof Set ? covered : new Set(covered || []);
  return (ground || [])
    .map((s, idx) => ({ ...s, idx: s.idx ?? idx }))
    .filter(s => !cov.has(s.idx))
    .filter(s => (s.score || 0) >= DEVELOPABLE_SCORE && String(s.text || '').trim().length >= DEVELOPABLE_LEN)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, max)
    .map(s => ({ idx: s.idx, topic: trim(s.text, 60) }));
};

// The follow-up offer string, or '' when no region is developable (no offer is
// better than an offer to confabulate).
export const followUpOffer = (ground = [], covered = new Set()) => {
  const regions = developableRegions(ground, covered);
  if (!regions.length) return '';
  const list = regions.map(r => r.topic.replace(/\.$/, '')).join('; ');
  return 'I can go deeper on: ' + list + (/…$/.test(list) ? '' : '.');
};

const ELLIPSIS = '…';

// Index one past the last sentence terminator ('.', '!', '?' followed by a space or the
// string's end) that sits at or beyond `min`; 0 when there is none. The trailing-space
// guard keeps a decimal point ("4.4 meters") from reading as a sentence break.
const lastSentenceBreak = (window, min) => {
  let cut = 0;
  for (let i = Math.max(0, min); i < window.length; i++) {
    const c = window[i];
    if ((c === '.' || c === '!' || c === '?') && (i + 1 >= window.length || window[i + 1] === ' '))
      cut = i + 1;
  }
  return cut;
};

// Collapse one held span to a display fragment of at most `n` characters. The plain
// version cut a flat `n` from the head and stuck an ellipsis on, so it showed each
// source's lead-in — severing the very clause that bore on the ask — and could leave a
// dangling "…, 1977,…". Three disciplines instead:
//   • centred — when a `focus` term (the question's content words) hides past the head
//     window, slide the window onto it and mark the dropped head with a leading '…';
//   • bounded — close on a sentence break inside the window when one sits late enough,
//     so the fragment ends as a sentence rather than a guillotined word;
//   • clean — otherwise drop the trailing partial word and any ',;:—' before the mark.
const trim = (s, n = 80, focus = []) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;

  // Centre: the earliest focus hit the head window [0,n) would not already show.
  let start = 0;
  if (Array.isArray(focus) && focus.length) {
    const lower = t.toLowerCase();
    let hit = -1;
    for (const term of focus) {
      const i = term ? lower.indexOf(term) : -1;
      if (i >= 0 && (hit < 0 || i < hit)) hit = i;
    }
    if (hit >= 0 && hit + Math.min(12, n) > n) {
      start = Math.max(0, hit - Math.floor(n * 0.3));
      const sp = t.indexOf(' ', start);            // open on a word, not mid-token
      if (start > 0 && sp >= 0 && sp - start < 16) start = sp + 1;
    }
  }

  const lead = start > 0 ? ELLIPSIS + ' ' : '';
  const room = Math.max(1, n - lead.length);
  const end = Math.min(t.length, start + room);
  const window = t.slice(start, end);

  // The window runs to the end of the span — nothing was cut off the tail, no mark.
  if (end >= t.length) return (lead + window).trim();

  // Bounded: close on the last sentence break that still leaves a substantial fragment.
  const boundary = lastSentenceBreak(window, Math.floor(room * 0.55));
  if (boundary > 0) return (lead + window.slice(0, boundary)).trim();

  // Clean: drop the dangling partial word and trailing clause punctuation, then mark.
  const cut = window.replace(/\s+\S*$/, '').replace(/[\s,;:—-]+$/, '');
  return (lead + cut + ELLIPSIS).trim();
};
