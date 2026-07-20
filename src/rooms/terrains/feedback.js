// EO: SEG·INS·CON·DEF(Field,Void → Entity,Link,Atmosphere,Paradigm, Dissecting,Making,Binding)
// feedback.js — a CSV/tabular feedback export → the terrains room's scene shape (scene.js's own
// shape: TITLE, SENTENCES, ENTITIES, LINKS, LENSES, VOIDS, FIELD, ATMOSPHERE, PARADIGM), DERIVED
// from the table instead of hand-authored. Pure and deterministic — the same table folds to the
// same scene every time, so loading a CSV twice paints the same nine terrains.
//
// Row order stands in for corpus order: a feedback export rarely carries a date column, and this
// module never invents one. Where a real derivation isn't available, it says so in a `note`
// rather than fabricating a reading (the one law that survives every faculty: you may dwell in
// what a table is silent on, but you may never fabricate from it).
//
// The pipeline, terrain by terrain:
//   Entity    a recurring FEATURE PHRASE ("customer support", "the delivery"), found by cutting
//             each row's text into clauses (its own sentences, then its own connectors) and
//             matching the noun phrase in front of a small set of state verbs/prepositions. A
//             phrase that never recurs across the table is noise, not a feature, and is dropped.
//   Kind      the phrase's category, from a small keyword→category table (support / product /
//             delivery / speed / staff / process / service / experience / general).
//   Network   the table's own category column's MAJORITY value among the rows that mention the
//             phrase — a real co-occurrence tally, not a repeat of Kind.
//   Link      two known phrases that literally co-occur in one row. Short feedback rarely
//             mentions two features in one breath, so this terrain stays sparse on purpose;
//             nothing is invented to fill it out.
//   Field     how many distinct known phrases a row raises, scaled 0..1 by the table's own max.
//   Atmosphere the row's own sentiment column, painted straight — the one terrain a labelled
//             feedback table already carries ground truth for. A tiny lexicon stands in when
//             there is no sentiment column at all.
//   Paradigm  a rolling-window majority of Atmosphere's tone over ROW ORDER, with a break where
//             it turns. A table whose rows are not time-ordered will show a noisy paradigm —
//             an honest result (there is no dominant frame to find), not a bug in the fold.
//   Void      a row flagged by a resolution/follow-up column whose text never says what, if
//             anything, resolved it.
//   Lens      a feature phrase read under two or more different sentiments across the table —
//             the same named thing, praised in some rows and faulted in others.

import { parseCSV } from '../../store/index.js';

const norm = (s) => String(s ?? '').trim();
const lower = (s) => norm(s).toLowerCase();
const slugify = (s) => lower(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
const uniq = (xs) => [...new Set(xs)];

// ── column detection — name-pattern first, a structural fallback second ────────────────────

const looksNumeric = (v) => v !== '' && Number.isFinite(Number(String(v).replace(/[,$%\s]/g, '')));
const numericCoverage = (rows, col) => {
  const vals = rows.map((r) => norm(r[col])).filter((v) => v !== '');
  if (!vals.length) return 0;
  return vals.filter(looksNumeric).length / vals.length;
};

const TEXT_NAME = /comment|feedback|review|message|note|text|description/i;
const avgLen = (rows, c) => rows.reduce((s, r) => s + norm(r[c]).length, 0) / (rows.length || 1);
export const detectTextColumn = (rows, columns) => {
  // Name alone isn't enough — "comment_id" also matches "comment". Among every name-matched
  // candidate, the actual PROSE column is the one whose values run long (an id or a code is
  // short); fall back to the single longest-average column when no name matches at all.
  const named = columns.filter((c) => TEXT_NAME.test(c) && rows.some((r) => norm(r[c]).length > 0));
  const pool = named.length ? named : columns;
  let best = null, bestLen = -1;
  for (const c of pool) {
    const avg = avgLen(rows, c);
    if (avg > bestLen) { bestLen = avg; best = c; }
  }
  return best;
};

const SENTIMENT_NAME = /sentiment|tone|polarity/i;
const SENTIMENT_WORDS = new Set(['positive', 'negative', 'neutral', 'pos', 'neg', 'neu', 'mixed']);
export const detectSentimentColumn = (rows, columns, exclude = []) => {
  const candidates = columns.filter((c) => !exclude.includes(c));
  const named = candidates.find((c) => SENTIMENT_NAME.test(c));
  if (named) return named;
  for (const c of candidates) {
    const vals = uniq(rows.map((r) => lower(r[c])).filter(Boolean));
    if (vals.length && vals.length <= 5 && vals.every((v) => SENTIMENT_WORDS.has(v))) return c;
  }
  return null;
};

// No \b boundaries — column names are usually snake_case ("service_area"), and "_" counts as a
// word character in JS regex, so \barea\b would never match inside it.
const CATEGORY_STRONG = /area|category|department|dept|segment/i;
const CATEGORY_WEAK = /type|topic|group/i;
export const detectCategoryColumn = (rows, columns, exclude = []) => {
  const candidates = columns.filter((c) => !exclude.includes(c));
  const byPattern = (re) => candidates.find((c) => re.test(c));
  const named = byPattern(CATEGORY_STRONG) || byPattern(CATEGORY_WEAK);
  if (named) return named;
  let best = null, bestCard = Infinity;
  for (const c of candidates) {
    if (numericCoverage(rows, c) >= 0.8) continue;              // a rating/measure, not a category
    const vals = uniq(rows.map((r) => lower(r[c])).filter(Boolean));
    if (vals.length < 2 || vals.length > Math.max(8, rows.length * 0.2)) continue;
    if (vals.length < bestCard) { bestCard = vals.length; best = c; }
  }
  return best;
};

const FLAG_NAME = /resolution|follow.?up|escalat|action.?needed|unresolved|reopen/i;
const TRUTHY = new Set(['1', 'true', 'yes', 'y']);
export const detectFlagColumn = (rows, columns, exclude = []) =>
  columns.filter((c) => !exclude.includes(c)).find((c) => FLAG_NAME.test(c)) || null;
const isTruthy = (v) => TRUTHY.has(lower(v));

// ── feature-phrase extraction — corpus-frequency-driven, not a fixed vocabulary ─────────────

const CONNECTORS = /\b(?:because|since|although|though)\b|,?\s*\b(?:but|and)\b/i;
const BOUNDARY = '(?:with|of|by|in|for|on|was|is|were|arrived|felt|seemed|did not meet)';
const PHRASE_VERB = new RegExp(`^([a-z][a-z']*(?:\\s+[a-z']+){0,3}?)\\s+${BOUNDARY}\\b`, 'i');
const REJECT_FIRST = new Set(['i', 'you', 'he', 'she', 'we', 'they', 'am', 'was', 'is', 'are',
  'would', 'will', 'had', 'have', 'has', 'did', 'do', 'there', 'this', 'that', 'it']);

// One comment → its clauses: its own sentences, then each sentence's own connectors. A clause
// is still a literal slice of the original string (only split, never rewritten), so a phrase
// matched inside one is guaranteed to be a literal substring of the row's raw text.
const clausesOf = (text) => String(text || '')
  .split(/(?<=[.!?])\s+/)
  .flatMap((sent) => sent.split(CONNECTORS))
  .map((c) => c.trim())
  .filter(Boolean);

// The one feature phrase a clause most likely names — the noun phrase sitting in front of a
// state verb or preposition ("customer support was", "the experience with"). Generic clause
// openers ("I am very satisfied with…") are rejected by their own first word, not by a fixed
// domain vocabulary, so this generalizes past this one file's exact wording.
const phraseOf = (clause) => {
  let c = clause;
  c = c.replace(/^overall,?\s*/i, '');
  c = c.replace(/^the company\s+/i, '');
  c = c.replace(/^(?:my|our|your|the|a|an)\s+/i, '');
  const m = c.match(PHRASE_VERB);
  if (!m) return null;
  const p = m[1].trim().toLowerCase();
  if (p.length < 3 || REJECT_FIRST.has(p.split(' ')[0])) return null;
  return p;
};

// The literal (case-preserved) substring of `text` a lowercase canonical phrase names, or null
// if it isn't actually there (a fixture typo shows as a no-op here too, never a crash).
const literalOf = (text, phraseLower) => {
  const i = lower(text).indexOf(phraseLower);
  return i < 0 ? null : { text: text.slice(i, i + phraseLower.length), start: i };
};

// extractFeaturePhrases(texts) → { byRow: string[][], vocabulary: string[] } — the canonical
// (lowercased) phrases per row, restricted to phrases that recur at least `minCount` times, with
// a longer phrase that merely wraps a shorter known one ("company customer support" around
// "customer support") folded into the shorter, cleaner phrase.
export const extractFeaturePhrases = (texts, { minCount = 2 } = {}) => {
  const rawByRow = texts.map((t) => uniq(clausesOf(t).map(phraseOf).filter(Boolean)));
  const freq = new Map();
  for (const phrases of rawByRow) for (const p of phrases) freq.set(p, (freq.get(p) || 0) + 1);
  // Shortest-first so a longer wrap-around ("company customer support") folds onto the shorter,
  // cleaner phrase it contains ("customer support") rather than standing as its own entity.
  const known = [...freq.entries()].filter(([, n]) => n >= minCount).map(([p]) => p)
    .sort((a, b) => a.split(' ').length - b.split(' ').length);
  const knownSet = new Set(known);
  // A phrase canonicalizes to itself when known, to a shorter known phrase it wraps, or to
  // nothing (dropped as a one-off) when neither holds.
  const canonicalOf = (p) => {
    if (knownSet.has(p)) return p;
    const wrapped = known.find((k) => p.endsWith(k));
    return wrapped ?? null;
  };
  const byRow = rawByRow.map((phrases) => uniq(phrases.map(canonicalOf).filter(Boolean)));
  const vocabulary = uniq(byRow.flat());
  return { byRow, vocabulary };
};

// ── kind (a phrase's own type) — a small keyword table, generic across feedback domains ─────
const KIND_KEYWORDS = [
  [/support/, 'support'],
  [/product|quality/, 'product'],
  [/deliver/, 'delivery'],
  [/response time|\btime\b/, 'speed'],
  [/staff|professional/, 'staff'],
  [/process/, 'process'],
  [/service/, 'service'],
  [/experience/, 'experience'],
];
const kindOf = (phrase) => (KIND_KEYWORDS.find(([re]) => re.test(phrase)) || [null, 'general'])[1];

// ── sentiment fallback lexicon — only used when the table carries no sentiment column ───────
const POS_WORDS = /great|excellent|helpful|satisfied|professional|fast|on time|met my expectations/i;
const NEG_WORDS = /disappointed|damaged|delayed|issues|not helpful|slow|not meet|would not recommend|bad experience/i;
const lexiconSentiment = (text) => {
  const pos = POS_WORDS.test(text), neg = NEG_WORDS.test(text);
  return pos && !neg ? 'positive' : neg && !pos ? 'negative' : 'neutral';
};
const ATMOSPHERE_HUE = { positive: 'green', negative: 'amber', neutral: 'blue' };

// ── the fold ─────────────────────────────────────────────────────────────────────────────────

// sceneFromRows(rows, opts?) — rows: array of plain objects keyed by column name (strings).
// opts: { title?, columns?, textColumn?, sentimentColumn?, categoryColumn?, flagColumn?,
//         minPhraseCount?, paradigmWindow?, maxRows? }
export const sceneFromRows = (rows, opts = {}) => {
  const columns = opts.columns || uniq(rows.flatMap((r) => Object.keys(r)));
  const maxRows = opts.maxRows ?? 800;
  const truncated = rows.length > maxRows;
  const allRows = truncated ? rows.slice(0, maxRows) : rows;

  const textCol = opts.textColumn || detectTextColumn(allRows, columns);
  const kept = allRows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => textCol && norm(r[textCol]).length > 0);
  const SENTENCES = kept.map(({ r }) => norm(r[textCol]));

  const sentimentCol = opts.sentimentColumn || detectSentimentColumn(allRows, columns, [textCol]);
  const categoryCol = opts.categoryColumn || detectCategoryColumn(allRows, columns, [textCol, sentimentCol].filter(Boolean));
  const flagCol = opts.flagColumn || detectFlagColumn(allRows, columns, [textCol].filter(Boolean));

  const sentimentOf = (r) => {
    const v = sentimentCol ? lower(r[sentimentCol]) : '';
    if (v === 'pos') return 'positive'; if (v === 'neg') return 'negative'; if (v === 'neu') return 'neutral';
    if (SENTIMENT_WORDS.has(v)) return v;
    return lexiconSentiment(norm(r[textCol]));
  };
  const tones = kept.map(({ r }) => sentimentOf(r));
  const categories = kept.map(({ r }) => (categoryCol ? norm(r[categoryCol]) : ''));

  // ── Entity + Kind + Network ──
  const { byRow, vocabulary } = extractFeaturePhrases(SENTENCES, { minCount: opts.minPhraseCount ?? 2 });
  const clusterVotes = new Map();  // phrase → Map(category → count)
  vocabulary.forEach((p) => clusterVotes.set(p, new Map()));
  byRow.forEach((phrases, sent) => {
    const cat = categories[sent];
    if (!cat) return;
    for (const p of phrases) { const m = clusterVotes.get(p); m.set(cat, (m.get(cat) || 0) + 1); }
  });
  const clusterOf = (p) => {
    const m = clusterVotes.get(p);
    if (!m || !m.size) return kindOf(p);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  const ENTITIES = [];
  const entitySpanByRow = [];   // sent → [{ id, start, text }] (occurrence order) for Link-pairing
  byRow.forEach((phrases, sent) => {
    const spans = [];
    for (const p of phrases) {
      const lit = literalOf(SENTENCES[sent], p);
      if (!lit) continue;
      const id = slugify(p);
      ENTITIES.push({ id, sent, text: lit.text, kind: kindOf(p), cluster: clusterOf(p) });
      spans.push({ id, start: lit.start, text: lit.text });
    }
    entitySpanByRow.push(spans.sort((a, b) => a.start - b.start));
  });

  // ── Link — only real, literal co-occurrence inside one row; nothing invented ──
  const LINKS = [];
  entitySpanByRow.forEach((spans, sent) => {
    if (spans.length < 2) return;
    const [a, b] = spans;
    const between = SENTENCES[sent].slice(a.start + a.text.length, b.start);
    const conn = between.match(CONNECTORS);
    const anchor = (conn ? conn[0] : between).trim() || between;
    const tone = tones[sent];
    LINKS.push({
      sent, text: anchor, src: a.id, tgt: b.id,
      rel: conn ? conn[0].trim().replace(/^,\s*/, '') : 'also mentions',
      ...(tone !== 'neutral' ? { polarity: tone === 'positive' ? '+' : '−' } : {}),
    });
  });

  // ── Field — how many distinct known phrases a row raises, 0..1 of the table's own max ──
  const counts = byRow.map((p) => p.length);
  const maxCount = Math.max(1, ...counts);
  const FIELD = counts.map((n) => n / maxCount);

  // ── Atmosphere — the table's own sentiment, painted straight ──
  const ATMOSPHERE = tones.map((tone, sent) => ({
    tone, hue: ATMOSPHERE_HUE[tone] || 'blue',
    note: categoryCol ? `${tone} · ${categories[sent] || 'uncategorised'}` : tone,
  }));

  // ── Paradigm — a rolling-window majority of tone over row order (no date column to read) ──
  const W = Math.max(1, Math.min(opts.paradigmWindow ?? 25, tones.length || 1));
  const frames = tones.map((_, i) => {
    const window = tones.slice(Math.max(0, i - W + 1), i + 1);
    const tally = new Map();
    for (const t of window) tally.set(t, (tally.get(t) || 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  });
  const PARADIGM = frames.map((frame, i) => {
    const brk = i > 0 && frame !== frames[i - 1];
    return {
      frame, break: brk,
      ...(brk ? { note: `the feedback stream's dominant tone turns to ${frame} here (rows are in table order — there is no date column, so order stands in for time)` } : {}),
    };
  });

  // ── Void — a flagged row whose text never says what, if anything, resolved it ──
  const VOIDS = [];
  if (flagCol) kept.forEach(({ r }, sent) => {
    if (!isTruthy(r[flagCol])) return;
    const marked = entitySpanByRow[sent][0];
    let text = marked ? marked.text : null;
    if (!text) {
      const words = SENTENCES[sent].replace(/[.?!]+\s*$/, '').split(/\s+/);
      text = words.slice(-4).join(' ');
    }
    if (!text || !SENTENCES[sent].includes(text)) return;
    VOIDS.push({ sent, text, note: `flagged by \`${flagCol}\` — the record captures the complaint but never says what, if anything, resolved it.` });
  });

  // ── Lens — a phrase read under 2+ different sentiments across the table ──
  const LENSES = [];
  const SENSE_LABEL = { positive: 'praised', negative: 'faulted', neutral: 'read neutrally' };
  for (const p of vocabulary) {
    const bySent = new Map();
    byRow.forEach((phrases, sent) => { if (phrases.includes(p)) { const t = tones[sent]; if (!bySent.has(t)) bySent.set(t, sent); } });
    if (bySent.size < 2) continue;
    const [firstTone, firstSent] = [...bySent.entries()][0];
    const lit = literalOf(SENTENCES[firstSent], p);
    if (!lit) continue;
    LENSES.push({
      id: slugify(p), sent: firstSent, text: lit.text,
      senses: [...bySent.entries()].map(([tone, sent]) => ({
        label: SENSE_LABEL[tone] || tone, gloss: `e.g. "${SENTENCES[sent]}"`,
      })),
    });
  }

  const title = opts.title || `Customer feedback — ${SENTENCES.length} row${SENTENCES.length === 1 ? '' : 's'}${truncated ? ` (first ${maxRows} of ${rows.length})` : ''}`;
  return { TITLE: title, SENTENCES, ENTITIES, LINKS, LENSES, VOIDS, FIELD, ATMOSPHERE, PARADIGM,
    meta: { textColumn: textCol, sentimentColumn: sentimentCol, categoryColumn: categoryCol, flagColumn: flagCol, truncated, rows: rows.length } };
};

// sceneFromTable({ columns, rows }) — rows may be plain objects OR arrays aligned to columns
// (the same two shapes organs/in/table.js's ingestTable accepts).
export const sceneFromTable = ({ columns = [], rows = [] } = {}, opts = {}) => {
  const objRows = rows.map((row) => {
    if (!Array.isArray(row)) return row;
    const o = {}; columns.forEach((c, i) => { o[c] = row[i] ?? ''; }); return o;
  });
  return sceneFromRows(objRows, { ...opts, columns });
};

// sceneFromCSV(text) — the one entrance a file/paste box needs: raw CSV text → a scene.
export const sceneFromCSV = (text, opts = {}) => {
  const grid = parseCSV(text);
  if (!grid.length) throw new Error('empty CSV');
  const columns = grid[0].map((c) => norm(c));
  const rows = grid.slice(1).map((row) => {
    const o = {}; columns.forEach((c, i) => { o[c] = row[i] ?? ''; }); return o;
  });
  return sceneFromRows(rows, { ...opts, columns });
};
