// EO: REC(Field → Kind, Composing) — attribution-verb induction (Pass 0)
// Pass 0 — attribution-verb induction.
//
// Before the reading loop reads a word, it learns how *this* document
// marks speech. A fixed whitelist ("said", "asked") misses a text whose
// dialogue runs on "transmitted", "pinged", "signed". So we look at the verbs
// that sit against quotation marks and let the document teach us its own
// convention. The high (a learned rule) sets the probabilities for the low
// (how the next thousand segments are classified).
//
// This is induction, not decision: every candidate carries a count that
// becomes a weight. Nothing is hard-coded true; the convention is whatever the
// text keeps doing.

const QUOTE = '["“”“”]';

// verb immediately before an opening quote:  Gregor said, "…"
const PRE  = new RegExp(String.raw`\b([a-z]{2,})\s*[,:]?\s*${QUOTE}`, 'g');
// verb just after a closing quote, before a subject:  …," replied Grete
const POST = new RegExp(String.raw`${QUOTE}\s*,?\s*([a-z]{2,})\s+(?:[A-Z][a-z]+|he|she|they|the)\b`, 'g');

// Tokens that hug quotes but are not attribution verbs.
const NOT_VERB = new Set([
  'the', 'and', 'but', 'that', 'with', 'for', 'his', 'her', 'their', 'this',
  'then', 'when', 'while', 'because', 'about', 'into', 'from',
]);

const verbish = (w) =>
  /(?:ed|s|t)$/.test(w) || ['say', 'ask', 'cry', 'tell', 'add', 'go', 'reply'].includes(w);

export const induceAttributionVerbs = (segments) => {
  const counts = new Map();
  const bump = (w) => {
    const t = w.toLowerCase();
    if (NOT_VERB.has(t) || !verbish(t)) return;
    counts.set(t, (counts.get(t) || 0) + 1);
  };
  for (const s of segments) {
    if (!new RegExp(QUOTE).test(s)) continue;
    let m;
    const pre = new RegExp(PRE.source, 'g');
    while ((m = pre.exec(s)) !== null) bump(m[1]);
    const post = new RegExp(POST.source, 'g');
    while ((m = post.exec(s)) !== null) bump(m[1]);
  }
  return [...counts.entries()]
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count);
};

// ── Pass 0 (cont.) — attribution-FRAME induction ──────────────────────────────────────
// The nest a claim reaches the page in — the narrator reports that a study found that … —
// has two lexical classes the reader must learn, not be handed: the REPORT VERBS (the verbs a
// claim is handed on under a complement clause) and the SOURCE NOUNS (the common nouns that
// bear a voice in "the STUDY found that …"). Neither is enumerated in any language; both are
// read off their SLOT, exactly as induceAttributionVerbs reads speech verbs off the quotation
// mark. The complementizer is the anchor here, and it too is induced — the closed-class token
// that most often follows a known speech verb — so the only English string this needs is a
// last-resort default marker, and even that is overridden the moment the text teaches its own.
//
// Discipline: nothing is decided, everything is counted (weights, defeasible). The register is
// allowed to be noisy because the CONSTRUCTION that consumes it is selective — a mis-learned
// noun never fires a frame, because real text has no "⟨name⟩ ⟨that-noun⟩ that …". Pure over
// (segments); `isSpeech` / `isClosedClass` are the ledger seams (both optional — it degrades to
// the default marker and no closed-class filter), so it stays model-free and language-neutral.
const DETERMINER_HINT = /^(?:the|a|an|this|that|these|those|his|her|its|their|our|my|your|one|another|some|any|each|every|no)$/i;

export const induceAttributionFrames = (segments, { isSpeech = () => false, isClosedClass = null, markers = ['that'] } = {}) => {
  const toks = (s) => String(s || '').toLowerCase().match(/[a-z][a-z'’-]*/g) || [];
  const openClass = (w) => (isClosedClass ? !isClosedClass(w) : true);

  // Induce the complementizer: the closed-class token that most often sits right after a known
  // speech verb, before more words (not a quote). "he said THAT …" teaches "that" with no seed.
  const markerCount = new Map();
  for (const s of segments) {
    const t = toks(s);
    for (let i = 0; i < t.length - 1; i++) {
      if (!isSpeech(t[i])) continue;
      const nxt = t[i + 1];
      if (nxt.length > 5) continue;                       // a complementizer is short + closed-class
      if (isClosedClass && !isClosedClass(nxt)) continue;
      markerCount.set(nxt, (markerCount.get(nxt) || 0) + 1);
    }
  }
  const induced = [...markerCount.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const MARK = new Set([...(induced.length ? induced : markers)].map((m) => String(m).toLowerCase()));

  // Report verbs: the token in ⟨subject⟩ ___ ⟨marker⟩ whose left neighbour is NOT a determiner
  // (that excludes the noun-complement "the fact that", "the idea that" — the head there is
  // determined, a verb-subject is not). Open-class; counted, not decided.
  const verbCount = new Map();
  for (const s of segments) {
    const t = toks(s);
    for (let i = 1; i < t.length - 1; i++) {
      if (!MARK.has(t[i + 1])) continue;                  // right neighbour is the complementizer
      const cand = t[i], left = t[i - 1];
      if (cand.length < 3 || MARK.has(cand)) continue;
      if (DETERMINER_HINT.test(left)) continue;           // "the fact that" — left is a determiner
      if (!openClass(cand)) continue;                     // a verb is open-class
      verbCount.set(cand, (verbCount.get(cand) || 0) + 1);
    }
  }
  const reportSet = new Set(verbCount.keys());

  // Source nouns: the HEAD noun that sits right before a report-verb-plus-marker, when the noun
  // phrase is DETERMINER-licensed ("THE study found that …", "THE vendor report found that …").
  // The head is the token before the verb, so a modifier ("vendor") between the determiner and
  // the head is stepped over; the determiner-licence is what tells a source-NP ("the report")
  // from a bare agent ("residents said that") — the latter bears a voice too but is not the
  // common-noun SOURCE class this register is for. A residue of the construction, not a list.
  const nounCount = new Map();
  const isReport = (w) => reportSet.has(w) || isSpeech(w);
  for (const s of segments) {
    const t = toks(s);
    for (let i = 1; i < t.length - 1; i++) {
      if (!MARK.has(t[i + 1]) || !isReport(t[i])) continue;   // ⟨verb⟩ ⟨marker⟩
      const head = t[i - 1];
      if (head.length < 3 || DETERMINER_HINT.test(head) || !openClass(head)) continue;
      let licensed = false;                                   // a determiner opens the NP within reach
      for (let k = Math.max(0, i - 4); k < i; k++) if (DETERMINER_HINT.test(t[k])) { licensed = true; break; }
      if (licensed) nounCount.set(head, (nounCount.get(head) || 0) + 1);
    }
  }

  const rank = (m) => [...m.entries()].map(([token, count]) => ({ token, count })).sort((a, b) => b.count - a.count);
  return { markers: [...MARK], reportVerbs: rank(verbCount), sourceNouns: rank(nounCount) };
};

// Pass 0, whole — learn a document's attribution registers into its ledger: the SPEECH verbs
// (off quotation) and the RELAY registers (report verbs + source nouns, off the complementizer
// slot). One call the parse pipeline runs so the orchestrator stays lean; each token becomes a
// counted, defeasible REC entry, exactly as before.
export const induceAttributions = (conventions, segments) => {
  for (const { token, count } of induceAttributionVerbs(segments)) conventions.learnAttribution(token, count);
  const fr = induceAttributionFrames(segments, { isSpeech: conventions.isAttributionVerb, isClosedClass: conventions.isClosedClass });
  for (const { token, count } of fr.reportVerbs) conventions.learnReport(token, count);
  for (const { token, count } of fr.sourceNouns) conventions.learnSourceNoun(token, count);
  return fr;
};
