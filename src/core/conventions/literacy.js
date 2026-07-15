// EO: REC(Field → Kind,Paradigm, Composing) — the literacy bootstrap (sediment, not seeds)
// HOW THE READER LEARNS ITS FIRST LANGUAGE. The registers the ledger once carried as
// hand-written seeds are INDUCED here from one real book — the bootstrap read — by the same
// distributional moves the rest of the system runs on. The output is SEDIMENT: register entries
// with provenance ("induced from <book>"), loaded by the ledger exactly where the hand seeds sat,
// defeasible like everything else. Nothing in this module knows English; every list below is a
// STRUCTURAL signature any alphabetic language exhibits, and reading a Russian book would deposit
// Russian sediment by the same code.
//
//   function      cap-rate: a word the book ranges predominantly lowercase is never a name-like
//                 content head (the entities.js discriminator, run at book scale)
//   starter       capitalised at clause-start, lowercase-dominant elsewhere — position, not sense
//   preposition   short, hyper-frequent, precedes nominals (article/capital), never clause-final
//   copula        the linking frame [Name|Pronoun] X [article] — "Alice is a baker"; the copula
//                 is whatever the book puts between a subject and a re-description
//   speech        QUOTE-ANCHORED: the verb beside a quotation mark and a name — «"…," said X» —
//                 attribution read off the orthography itself, one sighting is enough
//   abbreviation  a token that (nearly) always wears a period and hands off to a capital —
//                 "Mr." never appears bare, "street." does; the dot-rate tells them apart
//   modifier      the -ly family (one suffix attested across many stems = derivation, so the
//                 whole family is adverbial) plus the auxiliaries the copula frame over-catches
//
// Pure: (text) → { register → [{ token, weight }] }. The tool tools/bootstrap-read.mjs runs this
// over a book and writes src/core/conventions/sediment-en.js; regenerate against any text.

const WORD = /[\p{L}'’]+/gu;

export const induceLiteracy = (text, {
  topArticles = 3,          // the top-K most frequent tokens serve as the article/nominal anchor
  minCount = 3,
} = {}) => {
  const src = String(text || '');
  const sentences = src.split(/(?<=[.!?])\s+|\n{2,}/).filter((s) => s.trim());

  // ── the raw counts: token frequency, cap/lower split, clause-final rate ──────
  const freq = new Map(), cap = new Map(), low = new Map(), fin = new Map(), dot = new Map();
  const startCap = new Map();               // capitalised at sentence start
  const bump = (m, k, by = 1) => m.set(k, (m.get(k) || 0) + by);
  for (const sent of sentences) {
    const ms = [...sent.matchAll(WORD)];
    for (let i = 0; i < ms.length; i++) {
      const w = ms[i][0], lc = w.toLowerCase();
      bump(freq, lc);
      if (/^\p{Lu}/u.test(w)) { bump(cap, lc); if (i === 0) bump(startCap, lc); }
      else bump(low, lc);
      const after = sent.slice(ms[i].index + w.length);
      const nxtCh = (after.match(/^\s*(.|$)/u) || [])[1] ?? '';
      if (nxtCh === '' || !/[\p{L}\s]/u.test(nxtCh)) bump(fin, lc);
      if (/^\./.test(after)) bump(dot, lc);
    }
  }
  const N = [...freq.values()].reduce((a, b) => a + b, 0) || 1;
  const rank = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const articles = new Set(rank.slice(0, topArticles));
  const capRate = (t) => (cap.get(t) || 0) / ((freq.get(t) || 0) || 1);
  const finRate = (t) => (fin.get(t) || 0) / ((freq.get(t) || 0) || 1);

  // ── function candidates: predominantly lowercase, frequent (assembled after the frame
  // pass, which lets the verb registers claim their own first) ────────────────
  const fnCand = [];
  for (const [t, n] of freq) {
    if (n < 5) continue;
    if (capRate(t) < 0.35 && n / N > 0.0002) fnCand.push({ token: t, weight: n });
  }

  // ── starter: capitalised AT CLAUSE START, lowercase-dominant elsewhere ────────
  const starter = [];
  for (const [t, n] of startCap) {
    if (n < minCount) continue;
    const l = low.get(t) || 0;
    if (l >= 2 * ((cap.get(t) || 0) - n) && l >= n) starter.push({ token: t, weight: n });
  }

  // ── preposition: short, frequent, pre-nominal, proclitic ─────────────────────
  const prep = [];
  for (const [t, n] of freq) {
    if (n < 20 || t.length > 5 || capRate(t) > 0.4 || finRate(t) > 0.05) continue;
    // pre-nominal: how often is it directly before an article or a capitalised word?
    let preNom = 0;
    // cheap second pass over sentences would be heavy; use the frame counts below instead
    prep.push({ token: t, weight: n, _hold: true });
  }

  // ── the frame pass: [prev] X [next] statistics for copula / speech / preposition ──
  const copulaScore = new Map(), preNominal = new Map(), speech = new Map(), prevCapCount = new Map(), ingNext = new Map(), afterArticle = new Map();
  const QUOTE = /["“”«»]/;
  for (const sent of sentences) {
    const ms = [...sent.matchAll(WORD)];
    for (let i = 0; i < ms.length; i++) {
      const w = ms[i][0], lc = w.toLowerCase();
      const prev = ms[i - 1]?.[0], next = ms[i + 1]?.[0];
      // copula frame: [clause-opening subject] X [article] — "He was a", "Justine is the".
      // The subject must OPEN the clause (i===1) or be a capitalised name, else "him and the"
      // scores conjunctions; the linking slot is the second position of a predication.
      if (prev && next && articles.has(next.toLowerCase())) {
        const subjLike = (i === 1 && (/^\p{Lu}/u.test(prev)))
          || (/^\p{Lu}/u.test(prev) && (low.get(prev.toLowerCase()) || 0) < (cap.get(prev.toLowerCase()) || 0));
        if (subjLike) bump(copulaScore, lc);
        bump(preNominal, lc);
      } else if (next && /^\p{Lu}/u.test(next)) bump(preNominal, lc);
      // the progressive frame: a copula is ALSO the -ing auxiliary ("was walking") — a
      // transitive that happens to link subject to article ("saw the…") never is.
      if (next && next.length > 4 && next.toLowerCase().endsWith('ing')) bump(ingNext, lc);
      // a capitalised token right BEFORE this one — verbs wear their subjects, prepositions don't
      if (prev && /^\p{Lu}/u.test(prev)) bump(prevCapCount, lc);
      if (prev && prev.toLowerCase() === rank[0]) bump(afterArticle, lc);   // "the X" → X is a noun
      // speech frame: a quote mark on one side, a capitalised word on the other
      const before = sent.slice(Math.max(0, ms[i].index - 3), ms[i].index);
      const after3 = sent.slice(ms[i].index + w.length, ms[i].index + w.length + 3);
      // ATTRIBUTION lives after a CLOSING quote (punctuation, then the mark), two shapes:
      //   A) «," said she/Felix»  — the verb right after the quote, the speaker right after it
      //   B) «," she asked»       — the speaker right after the quote, the verb after the speaker
      // A dialogue's own first words sit after an OPENING quote and match neither.
      const closingQ = (str) => /[,.!?;:—-]\s*["“”«»]\s*$/u.test(str);
      const speakerish = (t) => !!t && (/^\p{Lu}/u.test(t) || (freq.get(t.toLowerCase()) || 0) / N > 0.003);
      const before2 = ms[i - 1] ? sent.slice(Math.max(0, ms[i - 1].index - 3), ms[i - 1].index) : '';
      if (closingQ(before) && speakerish(next)) bump(speech, lc);                      // shape A
      if (closingQ(before2) && speakerish(prev)) bump(speech, lc);                     // shape B
    }
  }

  const preposition = prep
    .map(({ token, weight }) => ({ token, weight,
      nom: (preNominal.get(token) || 0) / weight,
      pcap: (prevCapCount.get(token) || 0) / weight }))
    .filter((p) => p.nom >= 0.25 && p.pcap <= 0.2)         // verbs wear their subjects; preps don't
    .map(({ token, weight }) => ({ token, weight }));

  const glue = new Set(rank.slice(0, 8));               // the absolute top glue words never link
  const prepSet = new Set(preposition.map((p) => p.token));   // a preposition never links either
  const copula = [...copulaScore.entries()]
    .filter(([t, n]) => n >= 8 && finRate(t) < 0.3 && capRate(t) < 0.4
                     && !glue.has(t) && !prepSet.has(t) && (ingNext.get(t) || 0) >= 3)
    .sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([token, weight]) => ({ token, weight }));


  const topRank = new Set(rank.slice(0, 60));           // a linking word is never an attribution verb
  const speechVerbs = [...speech.entries()]
    .filter(([t, n]) => n >= minCount && capRate(t) < 0.35 && !topRank.has(t)
                     && !(afterArticle.get(t) > 0))      // "the X" attested → a noun, not a verb
    .sort((a, b) => b[1] - a[1]).slice(0, 40)
    .map(([token, weight]) => ({ token, weight }));

  // ── abbreviation: (nearly) always wears its period, short, hands off to a capital ──
  const abbreviation = [];
  for (const [t, n] of dot) {
    if (n < minCount || t.length > 6) continue;
    const dotRate = n / (freq.get(t) || 1);
    if (dotRate < 0.8) continue;
    // a title-abbreviation is capitalised wherever it appears (Mr, St) or vowel-less (www is
    // frame噪 the driver strips); a clause-final content noun ("breast.") is neither.
    if (capRate(t) >= 0.8 || !/[aeiouy]/.test(t)) abbreviation.push({ token: t, weight: n });
  }

  // ── modifier: the -ly family (a derivational suffix attested across many stems) ──
  const lyStems = new Set();
  for (const [t] of freq) if (t.endsWith('ly') && t.length > 4 && freq.get(t.slice(0, -2))) lyStems.add(t);
  const modifier = [];
  const hasStem = (t) => {
    const b = t.slice(0, -2);
    return freq.has(b) || freq.has(b + 'e') || (b.endsWith('i') && freq.has(b.slice(0, -1) + 'y'));
  };
  if (lyStems.size >= 5)                                   // the suffix is productive in this book
    for (const [t, n] of freq) if (t.endsWith('ly') && t.length > 4 && n >= 2 && hasStem(t)) modifier.push({ token: t, weight: n });
  // plus the auxiliaries the copula frame over-catches (had/have/would…): everything the frame
  // scores that is NOT among the top copulas is an auxiliary/modal to step over, same skip-list.
  const copSet = new Set(copula.map((c) => c.token));
  for (const [t, n] of copulaScore)
    if (!copSet.has(t) && n >= 4 && capRate(t) < 0.4
        && !prepSet.has(t) && !glue.has(t)) modifier.push({ token: t, weight: n });

  // ── function: the CLOSED CLASS — not merely "lowercase and frequent" (that sweeps in the
  // verbs and mid-frequency nouns, and then isContent() goes blind: a speaker followed by
  // "said" earns no subject gravity). A function word is lowercase-frequent AND EITHER in the
  // hyper-frequent core (top ranks are glue in any language) OR morphologically FROZEN (an
  // open-class word inflects — asks/asking/asked, letters — a function word does not) and not
  // already claimed by a verb register (speech/copula) or the -ly family.
  const claimed = new Set([
    ...copula.map((e) => e.token),
    ...speechVerbs.map((e) => e.token),
    ...modifier.map((e) => e.token),
  ]);
  const coreRank = new Set(rank.slice(0, 20));
  // Frozen = it neither takes inflection (ask → asks/asked/asking) nor IS one (walked → walk):
  // an open-class word lives in a morphological family; a function word stands alone.
  const inflects = (t) => freq.has(t + 's') || freq.has(t + 'ed') || freq.has(t + 'ing')
    || (t.endsWith('e') && freq.has(t.slice(0, -1) + 'ing'))
    || (t.endsWith('ed') && (freq.has(t.slice(0, -2)) || freq.has(t.slice(0, -1))))
    || (t.endsWith('ing') && (freq.has(t.slice(0, -3)) || freq.has(t.slice(0, -3) + 'e')));
  // a verb register's claim beats even hyper-frequency ("said" outranks most glue in a
  // dialogue shelf and is still a verb); the core-rank exemption applies only to the unclaimed.
  const fn = fnCand.filter(({ token: t }) =>
    !claimed.has(t) && (coreRank.has(t) || !inflects(t)));

  return {
    function: fn.sort((a, b) => b.weight - a.weight),
    starter: starter.sort((a, b) => b.weight - a.weight),
    preposition: preposition.sort((a, b) => b.weight - a.weight),
    copula,
    'attribution-verb': speechVerbs,
    abbreviation: abbreviation.sort((a, b) => b.weight - a.weight),
    modifier: modifier.sort((a, b) => b.weight - a.weight),
  };
};
