// EO: SIG·SEG(Field → Lens, Binding,Dissecting) — the attribution frame detectors
// attribution-frames.js — dissect one text into the voices wrapped inside it.
//
// perspective.js reads a figure's DIRECT quotes: X said "…". But a voice rarely reaches the
// page bare — it arrives WRAPPED in the tellings that relayed it: the narrator reports that a
// study found that the villagers said the river was rising. This leaf reads ONE layer of that
// wrapping: every attribution CONSTRUCTION in a single text, as a flat list of frames. The
// recursion that stacks them into the Russian nest-doll, and the lens chain read off it, is
// attribution-nesting.js's; this file only knows how to dissect a text into its bearers.
//
// Same discipline as every reader here: pure over a text, no DOM, no state, no model; whether
// a word BEARS a voice is the ledger's call (isSpeech / isReport), the same seam scanQuotes
// uses; a bearer that is not a NAME still stands when the CONSTRUCTION carries the gravity
// ("the study found that …") — gravity, not a bare noun sweep, because the report-verb-plus-
// complementizer is what admits the frame, never the noun alone; and it FAILS TOWARD SILENCE —
// an anonymous relay ("it is said that …") keeps a null bearer rather than inventing one.
//
//   frame     one attribution construction: a BEARER (who), a MODE (how the voice is worn),
//             and the CONTENT span it delegates — the words that belong to the bearer, not the
//             teller. `content` is text.slice(contentStart, contentEnd) — re-scannable, so the
//             nesting layer can descend into it for the next doll down.

import { createConventions } from '../core/index.js';
import { scanQuotes } from './perspective.js';

// The speech register (SEED_SPEECH) governs a direct quote and a bare "X said that …". The
// REPORT register is wider: the verbs research and reportage write in — "found that", "argues
// that", "shows that" — a claim handed on under a that-clause. A seed like SEED_SPEECH: the
// conventions that have already held, injectable so a live ledger widens it (opts.isReport).
const DEF_C = createConventions();
const defIsSpeech = (w) => DEF_C.isAttributionVerb(String(w || '').toLowerCase());
const SEED_REPORT = new Set([
  'found', 'find', 'finds', 'showed', 'show', 'shows', 'argues', 'argue', 'argued',
  'claims', 'claim', 'claimed', 'suggests', 'suggest', 'suggested', 'notes', 'note', 'noted',
  'reports', 'report', 'reported', 'concludes', 'conclude', 'concluded', 'demonstrates',
  'demonstrate', 'demonstrated', 'contends', 'contend', 'contended', 'maintains', 'maintain',
  'maintained', 'holds', 'hold', 'reveals', 'reveal', 'revealed', 'indicates', 'indicate',
  'indicated', 'states', 'state', 'stated', 'asserts', 'assert', 'asserted', 'posits', 'posit',
  'posited', 'proposes', 'propose', 'proposed', 'estimates', 'estimate', 'estimated', 'predicts',
  'predict', 'predicted', 'warns', 'warn', 'warned', 'observes', 'observe', 'recounts', 'recount',
  'recounted', 'describes', 'describe', 'described', 'believes', 'believe', 'believed', 'fears',
  'fear', 'feared', 'suspects', 'suspect', 'suspected', 'alleges', 'allege', 'alleged',
]);
const defIsReport = (w) => { const s = String(w || '').toLowerCase(); return defIsSpeech(s) || SEED_REPORT.has(s); };

// Source-nouns: the common-noun bearers a report construction promotes. NOT read on their own —
// only when they SUBJECT a report-verb-plus-that ("the novel says that …") does the noun bear a
// voice, so this is a seed that gates a construction, not a noun the scan ever admits alone. The
// user's spine: a NOVEL quotes RESEARCH that cites a STUDY. Learnable later, seeded now.
const SEED_SOURCE_NOUN = [
  'study', 'studies', 'report', 'reports', 'paper', 'papers', 'novel', 'novels', 'book', 'books',
  'article', 'articles', 'research', 'survey', 'surveys', 'analysis', 'review', 'reviews', 'essay',
  'essays', 'letter', 'letters', 'account', 'accounts', 'findings', 'data', 'evidence', 'theory',
  'theories', 'model', 'models', 'author', 'authors', 'scientists', 'researchers', 'experiment',
  'experiments', 'poll', 'polls', 'memo', 'document', 'documents', 'text', 'texts', 'story',
  'stories', 'chapter', 'manuscript', 'dossier', 'transcript', 'testimony', 'statement', 'abstract',
];

// A name span (perspective.js's NAME, kept in step): capitalised words, internal apostrophe/
// hyphen, a joined title's trailing period. Resolution to a referent is admission's job.
const NAME = String.raw`[A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*)*`;
const DET = String.raw`the|a|an|this|that|these|those|his|her|their|its|one|another|recent|earlier|later|prior|new|old`;
const SOURCE = SEED_SOURCE_NOUN.join('|');
// Two normalisations, deliberately different. `clean` is the bearer's SURFACE label — whitespace
// collapsed, edge punctuation trimmed, CASE PRESERVED so "Smith"/"Jones" still resolve to an
// admitted referent. `norm` is the case-insensitive KEY used only for cycle-detection and dedup,
// where "the Novel" and "the novel" must count as the same doll.
const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ').replace(/^[,;:.\s]+|[,;:.\s]+$/g, '');
const norm = (s) => clean(s).toLowerCase();

// Resolve a bearer surface name to an admitted referent id — the whole name, then its surname,
// then its given name (perspective.js's resolveSpeaker, kept local so this module imports no
// perspective state). Returns null on no match; the frame keeps its surface label regardless.
const resolveBearer = (name, admission) => {
  if (!admission || !name) return null;
  const whole = String(name).trim().replace(/\s+/g, ' ');
  if (admission.isAdmitted?.(whole)) return admission.idOf(whole);
  const toks = whole.split(' ');
  if (toks.length > 1) {
    const last = toks[toks.length - 1];
    if (admission.isAdmitted?.(last)) return admission.idOf(last);
    const first = toks[0];
    if (admission.isAdmitted?.(first)) return admission.idOf(first);
  }
  return null;
};

// ── The frame detectors ───────────────────────────────────────────────────────────────
// Each is pure over one text and returns raw frames { mode, bearer, verb, year, marker,
// triggerStart, contentStart, contentEnd }. `content` is text.slice(contentStart, contentEnd) —
// the span that belongs to the bearer, which the recursion re-scans for the next doll. A frame
// whose content sits BEFORE its trigger (a trailing "…, according to X") reads content backwards
// from the marker; that is just as re-scannable a substring.

// Direct quotation, via the shared quote scanner (the same seam perspective.js reads with).
const quoteFrames = (text, isSpeech, admission) => {
  const out = [];
  for (const q of scanQuotes(text, { isSpeech, admission })) {
    const start = q.index, inner = text.indexOf(q.quote, start);
    const cs = inner >= 0 ? inner : start + 1;
    out.push({ mode: 'quote', bearer: q.speakerLabel || null, verb: null, year: null,
      marker: 'quote', triggerStart: start, contentStart: cs, contentEnd: cs + q.quote.length });
  }
  return out;
};

// Reported speech — "<subject> <report-verb> that <content>". The subject is a NAME, or a
// determined source-noun the construction promotes; an optional adverb and a narrative
// citation year ("Smith (2019) argued that …") are stepped over so the verb still lands.
const reportFrames = (text, isReport) => {
  const out = [];
  const named = new RegExp(String.raw`(${NAME})\s+(?:\(\s*(\d{4}[a-z]?)\s*\)\s+)?(?:\w+ly\s+)?(\w+)\s+that\b`, 'g');
  let m;
  while ((m = named.exec(text)) !== null) {
    if (!isReport(m[3])) continue;
    const cs = m.index + m[0].length;
    out.push({ mode: 'report', bearer: m[1], verb: m[3].toLowerCase(), year: m[2] || null,
      marker: 'that', triggerStart: m.index, contentStart: cs, contentEnd: text.length });
  }
  const sourced = new RegExp(String.raw`\b((?:${DET})\s+)?(${SOURCE})\s+(?:\w+ly\s+)?(\w+)\s+that\b`, 'gi');
  while ((m = sourced.exec(text)) !== null) {
    if (!isReport(m[3])) continue;
    // Skip when the source-noun head is itself part of a NAME the named pass already took
    // (a capitalised "Study"): the two passes must not both frame one construction.
    if (out.some((f) => f.mode === 'report' && f.triggerStart <= m.index && m.index < f.contentStart)) continue;
    const cs = m.index + m[0].length;
    out.push({ mode: 'report', bearer: clean((m[1] || '') + m[2]), verb: m[3].toLowerCase(), year: null,
      marker: 'that', triggerStart: m.index, contentStart: cs, contentEnd: text.length });
  }
  // Agentless relay — "it is said / has been argued that …": a real lens with a NULL bearer.
  const anon = /\bit (?:is|was|has been|had been) (?:said|reported|argued|claimed|believed|thought|noted|estimated|suggested|held|alleged) that\b/gi;
  while ((m = anon.exec(text)) !== null) {
    const cs = m.index + m[0].length;
    out.push({ mode: 'report', bearer: null, verb: null, year: null, marker: 'it-is-said',
      triggerStart: m.index, contentStart: cs, contentEnd: text.length });
  }
  return out;
};

// Attribution — "according to X, <content>" / "per X, <content>" and the trailing mirror
// "<content>, according to X." The bearer runs to the delimiting comma; content is the clause
// the frame governs (ahead of a leading marker, behind a trailing one).
const attributionFramesRaw = (text) => {
  const out = [];
  let m;
  const lead = /\b(?:according to|per)\s+([^,:.;]{2,70})[,:]\s*(?=\S)/gi;
  while ((m = lead.exec(text)) !== null) {
    const cs = m.index + m[0].length;
    out.push({ mode: 'attribution', bearer: clean(m[1]), verb: null, year: null, marker: 'according-to',
      triggerStart: m.index, contentStart: cs, contentEnd: text.length });
  }
  const trail = /,\s*according to\s+([^,.;]{2,70})\.?\s*$/i;
  const tm = trail.exec(text);
  if (tm) out.push({ mode: 'attribution', bearer: clean(tm[1]), verb: null, year: null, marker: 'according-to',
    triggerStart: tm.index, contentStart: 0, contentEnd: tm.index });
  return out;
};

// Citation — a source a claim is PINNED to, distinct from a voice that speaks it. The
// parenthetical author-year "(Smith, 2019)" and the relay chain "as cited in / quoted in X":
// in both the content is the claim TEXT (ahead of the marker), the bearer the source cited.
const citeFrames = (text) => {
  const out = [];
  let m;
  const paren = /\(([A-Z][\w'’.-]+(?:\s+(?:et al\.?|and|&)\s+[A-Z][\w'’.-]+)*),?\s+(\d{4}[a-z]?)\)/g;
  while ((m = paren.exec(text)) !== null) {
    out.push({ mode: 'cite', bearer: clean(m[1]), verb: null, year: m[2], marker: 'author-year',
      triggerStart: m.index, contentStart: 0, contentEnd: m.index });
  }
  const relay = /\b(?:as cited in|cited in|quoted in|as quoted in|cited by|quoted by|citing)\s+([^,.;]{2,70})/gi;
  while ((m = relay.exec(text)) !== null) {
    out.push({ mode: 'cite', bearer: clean(m[1]), verb: null, year: null, marker: 'cited-in',
      triggerStart: m.index, contentStart: 0, contentEnd: m.index });
  }
  return out;
};

// All frames in one text, de-nested to the OUTERMOST layer: a frame kept only when its trigger
// does not sit inside another frame's content span. The ones dropped here are not lost — the
// recursion re-finds them when it re-scans the surviving frame's content, one doll deeper.
const outermostFrames = (text, isSpeech, isReport, admission) => {
  const all = [
    ...quoteFrames(text, isSpeech, admission),
    ...reportFrames(text, isReport),
    ...attributionFramesRaw(text),
    ...citeFrames(text),
  ];
  const inside = (f, g) => g !== f && g.contentStart <= f.triggerStart && f.triggerStart < g.contentEnd
    && (g.contentEnd - g.contentStart) > (f.contentEnd - f.contentStart);
  const kept = all.filter((f) => !all.some((g) => inside(f, g)));
  kept.sort((a, b) => a.triggerStart - b.triggerStart);
  return kept;
};

// The seam attribution-nesting.js reads through: the outermost-layer detector plus the shared
// bearer helpers (resolution, the two normalisations) and the default register predicates.
export { outermostFrames, resolveBearer, clean, norm, defIsSpeech, defIsReport, SEED_REPORT, SEED_SOURCE_NOUN };
