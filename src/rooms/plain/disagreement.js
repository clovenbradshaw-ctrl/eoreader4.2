// EO: DEF·SIG(Lens,Entity → Lens, Dissecting,Tracing) — how the sources disagree (real DEF)
// disagreement.js — the engine behind "People mean different things by this" (doc §3), computed
// from the ACTUAL text of the sources, not a hand-authored table. Given a term and several
// sources, it reads out, per source, the ways that source characterizes the term — every "X is
// a Y", "X, a Y,", "described X as Y", "X means Y" — buckets them into distinct meanings, and
// tallies each meaning per source. select.readAs then re-reads the word under any one source as
// a basis. Change the basis and the bars redraw; nobody is told they changed the measurement.
//
// This is the DEF operator (assert/define) at the Lens terrain, read across witnesses. It is the
// same cheap structural sweep the perceiver's own relations.js runs (a regex over copulas and
// appositives, not a full parser), so it stays honest: it reports what the documents literally
// say the word is, and nothing they don't. When a parsed reading is available, engine-extracted
// predicate DEFs (perceiver/parse) are folded in too — the surface sweep is the reliable floor,
// the parser's admissions the enrichment.
//
// Pure: (sources, term) → meanings-by-basis. No DOM, no state. Pinned across fiction, non-fiction,
// and academic corpora by tests/plain-disagreement.test.js.

const A = '(?:a|an|the|one|any|some|its|his|her|their|our|your|my)';           // an opening determiner
// Words that, right after the term, introduce a characterization of it.
const COPULA = '(?:is|are|was|were|be|been|being|remains?|remained|becomes?|became|represents?|means?|signifies|denotes?|serves?\\s+as|acts?\\s+as|functions?\\s+as|amounts?\\s+to|constitutes?)';
const AS = '(?:described|defined|referred\\s+to|treated|used|seen|regarded|understood|viewed|framed|cast|painted|characteri[sz]ed|portrayed|imagined|reads?)\\s+(?:as|to\\s+be)';
// A predicate that is really a negation ("is not a…", "is never…") is not a sense — skip it.
const NEG = /^(?:not|no|never|n['’]t|neither|nothing|hardly|barely)\b/i;

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Split a blob into sentences the cheap way — the sweep runs per sentence so a term only picks
// up characterizations stated in the same sentence it appears in.
const sentencesOf = (text) => norm(text).split(/(?<=[.;!?])\s+/).filter(Boolean);

// The head of a predicate NP — the noun the meaning turns on. Cut the phrase at the first
// preposition / relativizer, drop a leading determiner and any adjectives, take the last word,
// and singularize it lightly. "a line item in the contract" → item; "a person who records" →
// person; "a neural network with layers" → network. This is the SENSE key: two characterizations
// with the same head are the same meaning; different heads are the disagreement.
const CUT = /\s+(?:in|of|with|that|who|whom|whose|which|for|to|on|at|by|from|about|between|over|per|into|as|done|used|called|named|meant|where|when|worn|built|run)\b.*$/i;
// A copular predicate that opens with one of these is really an "X was described as Y" — let the
// AS pattern read it, so the copula sweep doesn't mistake "described" for the meaning.
const AS_VERB = /^(?:described|defined|referred|treated|used|seen|regarded|known|viewed|framed|cast|characteri[sz]ed|portrayed|understood|reads?|imagined|painted)\b/i;
const headOf = (phrase) => {
  let p = norm(phrase).toLowerCase().replace(/^(?:a|an|the|one|any|some|its|his|her|their|our|your|my)\s+/, '');
  p = p.replace(CUT, '').trim();
  const words = p.split(/[\s-]+/).filter(Boolean);
  let head = words[words.length - 1] || p;
  if (head.length > 3 && /[^s]s$/.test(head) && !/(?:ss|us|is)$/.test(head)) head = head.slice(0, -1); // plural → singular
  return head || norm(phrase).toLowerCase();
};

// Tidy a raw predicate capture into a readable meaning label: drop a trailing subordinate clause,
// strip filler, cap the length so a bar's label stays a phrase, not a sentence.
const labelOf = (phrase) => {
  let p = norm(phrase)
    .replace(/,\s+(?:said|according|which|who|that|because|and|but|so|though|as|while|although|when|where|per|since|before|after)\b.*$/i, '')
    .replace(/^(?:just|simply|really|actually|basically|essentially|merely|only|kind\s+of|sort\s+of)\s+/i, '')
    .replace(/[.,;:—–-]+$/, '')
    .trim();
  if (p.length > 52) p = p.slice(0, 49).replace(/\s+\S*$/, '') + '…';
  return p;
};

// Every characterization of `term` stated in `text`. Returns [{ label, sense, sentIdx, via }].
// `via` records which pattern found it (copula / as / apposition / dash / engine) — audit, not shown.
export const characterize = (text, term, { extra = [] } = {}) => {
  const T = esc(norm(term));
  if (!T) return [];
  const pats = [
    { via: 'copula',     re: new RegExp(`\\b${T}\\b\\s+${COPULA}\\s+(${A}\\s+)?([^.;!?]+)`, 'i') },
    { via: 'as',         re: new RegExp(`\\b${T}\\b[^.;!?]*?\\b${AS}\\s+(${A}\\s+)?([^.;!?,]+)`, 'i') },
    { via: 'apposition', re: new RegExp(`\\b${T}\\b\\s*,\\s+(${A}\\s+)([^.;!?,]+),`, 'i') },
    { via: 'dash',       re: new RegExp(`\\b${T}\\b\\s*[—–]\\s*(${A}\\s+)?([^.;!?—–]+)`, 'i') },
  ];
  const out = [];
  const sents = sentencesOf(text);
  sents.forEach((sent, sentIdx) => {
    if (!new RegExp(`\\b${T}\\b`, 'i').test(sent)) return;
    for (const { via, re } of pats) {
      const m = sent.match(re);
      if (!m) continue;
      const det = m[1] || '';
      const rest = m[2] || '';
      if (NEG.test(rest.trim())) continue;                 // "is not a…" is not a meaning
      if (via === 'copula' && AS_VERB.test(rest.trim())) continue; // "is described as …" → AS pattern reads it
      const label = labelOf((det + rest));
      if (label.replace(/\W/g, '').length < 2) continue;    // empty / punctuation only
      out.push({ label, sense: headOf(det + rest), sentIdx, via });
    }
  });
  // Fold in engine-extracted predicate DEFs (perceiver/parse) when the caller supplies them —
  // e.g. { value: 'a line item in the contract' } from doc.log DEF events about this term.
  for (const e of extra) {
    const v = norm(e && (e.value ?? e.label ?? e));
    if (!v || NEG.test(v)) continue;
    out.push({ label: labelOf(v), sense: headOf(v), sentIdx: -1, via: 'engine' });
  }
  return out;
};

// The disagreement across sources. `sources` is [{ id, label, text, extra? }]; `term` is the word.
// Returns { term, meanings, bases, baseLabel } where meanings is [{ label, sense, by:{ id: n } }],
// ready for select.readAs / basesOf. `by[id]` is how many times source `id` characterizes the term
// that way — the weight of that meaning's bar under that source. An optional `synonyms` map folds
// two heads into one sense (e.g. { camera: 'recorder', recorder: 'recorder' }).
export const disagree = (sources, term, { synonyms = null } = {}) => {
  const bySense = new Map();          // senseKey → { label, sense, by }
  const baseLabel = { everyone: 'everyone' };
  const bases = [];
  for (const src of sources) {
    const id = src.id;
    bases.push(id);
    baseLabel[id] = src.label || id;
    for (const c of characterize(src.text || '', term, { extra: src.extra || [] })) {
      const key = (synonyms && synonyms[c.sense]) || c.sense;
      let m = bySense.get(key);
      if (!m) { m = { label: c.label, sense: key, by: {} }; bySense.set(key, m); }
      // Prefer the shortest clean label as the meaning's display name.
      if (c.label.length < m.label.length) m.label = c.label;
      m.by[id] = (m.by[id] || 0) + 1;
    }
  }
  return { term, meanings: [...bySense.values()], bases, baseLabel };
};

// True when the sources genuinely disagree — more than one distinct meaning carries weight, and no
// single meaning is the top one under every source. Used to decide whether the "disagree" card is
// worth showing at all (one source, or perfect agreement → nothing to see).
export const sourcesDisagree = ({ meanings, bases } = { meanings: [], bases: [] }) => {
  if (!meanings || meanings.length < 2) return false;
  const topUnder = (basis) => {
    let best = null, bestW = 0;
    for (const m of meanings) {
      const w = basis === 'everyone'
        ? Object.values(m.by).reduce((a, b) => a + b, 0)
        : (m.by[basis] || 0);
      if (w > bestW) { bestW = w; best = m.sense; }
    }
    return best;
  };
  const tops = new Set((bases || []).map(topUnder).filter(Boolean));
  return tops.size > 1;
};
