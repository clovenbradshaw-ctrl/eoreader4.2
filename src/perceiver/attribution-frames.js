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

import { createConventions, induceAttributionFrames } from '../core/index.js';
import { scanQuotes } from './perspective.js';

// The lexical fillers of a frame — which VERBS hand a claim on ("argues that …") and which NOUNS
// bear a voice ("the study found that …") — are NOT a list this file carries. They are registers,
// learn-only and language-neutral: a report verb is whatever occupies the ⟨subject⟩ ___ ⟨marker⟩
// slot, a source noun whatever recurrently subjects such a frame (conventions/induce.js). The only
// floor is the SPEECH register (isAttributionVerb, itself sedimentable); source nouns have no floor
// — they emerge or the frame stays silent. `defIsReport`/`defIsSourceNoun` read that floor; a caller
// with a live ledger (a parsed doc's `conventions`, corpus-induced) passes richer predicates.
const DEF_C = createConventions();
const defIsSpeech = (w) => DEF_C.isAttributionVerb(String(w || '').toLowerCase());
const defIsReport = (w) => DEF_C.isReport(String(w || '').toLowerCase());
const defIsSourceNoun = (w) => DEF_C.isSourceNoun(String(w || '').toLowerCase());

// Self-induction — when the nest is handed a bare text with no ledger (a standalone scan, a folded
// quote), it learns the frame registers off THAT text before reading it, exactly as the parse
// pipeline's Pass 0 does over a whole document. So `nestFrames("the study found that …")` works
// with no corpus and no seed: the slot in the very sentence teaches "found" and "study". Seeded
// with the speech register so the marker can bootstrap; the closed-class filter comes free if the
// ledger induced a slot field (it has not here), else the determiner heuristic alone guards it.
export const frameRegistersFor = (text) => {
  const segs = String(text || '').split(/(?<=[.!?"”])\s+/).filter(Boolean);
  const c = createConventions();
  const fr = induceAttributionFrames(segs.length ? segs : [String(text || '')], {
    isSpeech: c.isAttributionVerb, isClosedClass: c.isClosedClass,
  });
  for (const { token, count } of fr.reportVerbs) c.learnReport(token, count);
  for (const { token, count } of fr.sourceNouns) c.learnSourceNoun(token, count);
  return { isSpeech: c.isAttributionVerb, isReport: c.isReport, isSourceNoun: c.isSourceNoun };
};

// A name span (perspective.js's NAME, kept in step): capitalised words, internal apostrophe/
// hyphen, a joined title's trailing period. Resolution to a referent is admission's job.
const NAME = String.raw`[A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*)*`;
// A determiner opens a source-NP bearer ("THE study"); a small closed-class set, the one
// structural hint the source-noun detector needs — the head noun itself is the induced register.
const DET = String.raw`the|a|an|this|that|these|those|his|her|their|its|one|another|recent|earlier|later|prior|new|old`;
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
// `isReport` and `isSourceNoun` are the induced registers, not lists — the verb and the noun
// are admitted by what the text taught, so a novel reporting verb or bearer noun frames the
// moment its slot recurs, and the seed floor (speech only) frames just the plainest cases.
const reportFrames = (text, isReport, isSourceNoun) => {
  const out = [];
  const named = new RegExp(String.raw`(${NAME})\s+(?:\(\s*(\d{4}[a-z]?)\s*\)\s+)?(?:\w+ly\s+)?(\w+)\s+that\b`, 'g');
  let m;
  while ((m = named.exec(text)) !== null) {
    if (!isReport(m[3])) continue;
    const cs = m.index + m[0].length;
    out.push({ mode: 'report', bearer: m[1], verb: m[3].toLowerCase(), year: m[2] || null,
      marker: 'that', triggerStart: m.index, contentStart: cs, contentEnd: text.length });
  }
  // Source-NP subject: a determiner opens it, the head noun is the INDUCED source register, and
  // the verb the INDUCED report register — no baked noun list. A capitalised head is a NAME the
  // pass above already took, not a common source noun, so it is skipped here.
  const sourced = new RegExp(String.raw`\b((?:${DET})\s+)?([a-z][a-z'’-]{2,})\s+(?:\w+ly\s+)?(\w+)\s+that\b`, 'gi');
  while ((m = sourced.exec(text)) !== null) {
    const noun = m[2], verb = m[3];
    if (/^[A-Z]/.test(noun)) continue;
    if (!isReport(verb) || !isSourceNoun(noun)) continue;
    if (out.some((f) => f.mode === 'report' && f.triggerStart <= m.index && m.index < f.contentStart)) continue;
    const cs = m.index + m[0].length;
    out.push({ mode: 'report', bearer: clean((m[1] || '') + noun), verb: verb.toLowerCase(), year: null,
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
const outermostFrames = (text, isSpeech, isReport, isSourceNoun, admission) => {
  const all = [
    ...quoteFrames(text, isSpeech, admission),
    ...reportFrames(text, isReport, isSourceNoun),
    ...attributionFramesRaw(text),
    ...citeFrames(text),
  ];
  const inside = (f, g) => g !== f && g.contentStart <= f.triggerStart && f.triggerStart < g.contentEnd
    && (g.contentEnd - g.contentStart) > (f.contentEnd - f.contentStart);
  const kept = all.filter((f) => !all.some((g) => inside(f, g)));
  kept.sort((a, b) => a.triggerStart - b.triggerStart);
  return kept;
};

// The seam attribution-nesting.js reads through: the outermost-layer detector, the shared bearer
// helpers (resolution, the two normalisations), the floor register predicates, and the self-
// induction (frameRegistersFor) a bare-text scan learns its own registers with.
export { outermostFrames, resolveBearer, clean, norm, defIsSpeech, defIsReport, defIsSourceNoun };
