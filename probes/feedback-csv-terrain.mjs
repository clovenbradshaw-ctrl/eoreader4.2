// Feedback-CSV terrain reading — pure logic, no DOM, no Node-only APIs (Node + browser).
//
// A CSV of short customer comments is not one document; it is many independent
// utterances that happen to share a column. Reading each row in isolation gives
// the parser nothing to work with (a single generic sentence like "the company
// was helpful" repeats no noun within itself, so common-noun admission — the
// only thing that can turn "the company"/"customer support" into a figure —
// never fires; every row comes back Void). Reading the WHOLE column as one
// corpus, one row per paragraph, gives the recurring nouns across rows for
// admission to find, and turns the per-row terrain typing (src/surfer/terrain.js
// siteTerrainAt) into a real, differentiated reading instead of a flat Void.
//
// The corpus join uses a BLANK-LINE separator (`\n\n`), not a space: the sentence
// splitter (perceiver/parse/sentences.js) cuts into paragraphs on `\n{2,}` BEFORE
// any sentence-boundary logic runs and always flushes a paragraph's trailing text
// as its own unit — so each row lands as exactly one sentence regardless of
// whether it ends in punctuation, and one row's ending word can never suppress
// the boundary before the next row (the "single capital = an initial" abbreviation
// rule the splitter applies within a paragraph cannot reach across one). The only
// remaining risk is a row with its OWN internal sentence-ending punctuation (many
// of these comments read "...the company. the product was..."); neutralizeUnit
// folds those internal marks to commas so one row never splits into two.
// buildFeedbackReading still verifies the row<->sentence alignment before trusting
// it, and falls back to independent per-row parsing (weaker signal, but never a
// silently wrong row<->terrain assignment) if some input defeats the above.

import { parseText } from '../src/perceiver/parse/index.js';
import { siteTerrainAt } from '../src/surfer/terrain.js';
import { TERRAINS, DOMAINS, GRAINS } from '../src/core/index.js';

// The nine terrains in cube order (domain rows × grain columns) — the fixed order
// every consumer (report, chart) renders and colors by, never re-sorted by count.
export const ALL_TERRAINS = Object.freeze(DOMAINS.flatMap((d) => GRAINS.map((g) => TERRAINS[d][g])));

const PLACEHOLDER_EMPTY = '(no comment).';

// ── CSV parsing (RFC4180-ish: quoted fields, embedded commas/quotes/newlines) ──
export const parseCSV = (raw) => {
  const text = String(raw ?? '');
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && next === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { header: [], records: [] };
  const header = rows[0].map((h) => String(h ?? '').trim());
  const records = rows.slice(1)
    .filter((r) => r.length > 1 || (r[0] ?? '') !== '')
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
  return { header, records };
};

// Fold every INTERNAL sentence-ending mark (a row that itself reads as two clauses,
// "...the company. the product...") to a comma, keeping at most the row's own final
// one — so segmentSentences can never cut this row into more than one unit.
export const neutralizeUnit = (text) => {
  const t = String(text ?? '').trim();
  if (!t) return '';
  const hasEnd = /[.!?]$/.test(t);
  const body = hasEnd ? t.slice(0, -1) : t;
  const safe = body.replace(/[.!?]+(\s+)/g, ', ');
  return hasEnd ? safe + t.slice(-1) : safe;
};

// Guess which column carries the free-text feedback: the column with the longest,
// most varied, most multi-word values — never an id/category column.
export const detectTextColumn = (header, records) => {
  if (!header.length) return null;
  if (!records.length) return header[0];
  let best = null, bestScore = -1;
  for (const col of header) {
    const vals = records.map((r) => String(r[col] ?? ''));
    const nonBlank = vals.filter((v) => v.trim());
    if (!nonBlank.length) continue;
    const avgLen = nonBlank.reduce((a, v) => a + v.length, 0) / nonBlank.length;
    const avgWords = nonBlank.reduce((a, v) => a + v.trim().split(/\s+/).filter(Boolean).length, 0) / nonBlank.length;
    const distinctRatio = new Set(vals).size / vals.length;
    const score = avgLen * (avgWords >= 3 ? 1 : 0.15) * (distinctRatio > 0.3 ? 1 : 0.4);
    if (score > bestScore) { bestScore = score; best = col; }
  }
  return best ?? header[0];
};

// Columns worth grouping/faceting by: a handful of repeating short values — never
// the free-text column, never an all-distinct id, never a long-form field.
export const detectFacetColumns = (header, records, { exclude = [] } = {}) => {
  const n = records.length || 1;
  const cap = Math.min(20, Math.max(2, Math.ceil(n * 0.2)));
  return header.filter((col) => {
    if (exclude.includes(col)) return false;
    const vals = records.map((r) => String(r[col] ?? '').trim()).filter(Boolean);
    if (!vals.length) return false;
    const distinct = new Set(vals).size;
    const avgLen = vals.reduce((a, v) => a + v.length, 0) / vals.length;
    return distinct >= 2 && distinct <= cap && avgLen <= 40;
  });
};

// Columns that are (almost) entirely numbers — candidates for "average X by terrain".
// An id-shaped column (name contains "id", or values are a near-bijective row index)
// is numeric but not a MEASURE — averaging a row number is noise, not a finding.
const looksLikeId = (col, records) => {
  if (/(^|[_-])id([_-]|$)/i.test(col)) return true;
  const vals = records.map((r) => String(r[col] ?? '').trim()).filter(Boolean);
  // Distinctness alone is a bad signal on a small sample (a 3-row rating column is
  // "all distinct" by chance) — only trust it with enough rows to mean something,
  // and only when the values ALSO look like a tight, ~contiguous run (1..N-ish),
  // the real signature of an autoincrement id, not a bounded measure like a 1-5 score.
  if (vals.length < 20) return false;
  if (new Set(vals).size < vals.length * 0.98) return false;
  const nums = vals.map(Number);
  if (!nums.every((n) => Number.isInteger(n))) return false;
  const min = Math.min(...nums), max = Math.max(...nums);
  return (max - min) <= vals.length * 1.5;
};
export const detectNumericColumns = (header, records, { exclude = [] } = {}) => {
  return header.filter((col) => {
    if (exclude.includes(col)) return false;
    const vals = records.map((r) => String(r[col] ?? '').trim()).filter(Boolean);
    if (!vals.length) return false;
    const numeric = vals.filter((v) => /^-?\d+(\.\d+)?$/.test(v));
    if (numeric.length / vals.length <= 0.9) return false;
    return !looksLikeId(col, records);
  });
};

// The corpus read: every row's text column as one paragraph, in row order, run
// through the real parser once (commonNouns:true — the recurring generic nouns
// this dataset repeats, "the company"/"customer support", are what admission
// needs across-row recurrence to catch). Verifies row<->sentence alignment before
// trusting it; falls back to independent per-row parses otherwise (reported via
// `mode`/`aligned` so a caller can show the difference honestly).
export const buildFeedbackReading = (records, textColumn, opts = {}) => {
  const raw = records.map((r) => String(r[textColumn] ?? '').trim());
  const neutralized = raw.map((t) => neutralizeUnit(t || PLACEHOLDER_EMPTY));
  const corpusText = neutralized.join('\n\n');
  const doc = parseText(corpusText, { docId: opts.docId || 'feedback', commonNouns: true, ...opts.parseOpts });

  let aligned = doc.sentences.length === records.length;
  if (aligned) for (let i = 0; i < neutralized.length; i++) if (doc.sentences[i] !== neutralized[i]) { aligned = false; break; }

  if (aligned) {
    const terrainOfRow = records.map((_, i) => siteTerrainAt(doc, i));
    return { doc, mode: 'joint', aligned: true, terrainOfRow };
  }
  // Fallback: independent per-row parses. Weaker (no cross-row recurrence, so
  // generic nouns go unrecognised and most rows read Void) but never misattributes
  // a terrain to the wrong row.
  const terrainOfRow = raw.map((text) => siteTerrainAt(parseText(text || PLACEHOLDER_EMPTY, { docId: 'row' }), 0));
  return { doc: null, mode: 'independent', aligned: false, terrainOfRow };
};

// ── aggregation (all pure, all read the terrainOfRow array the reading produced) ──

export const terrainDistribution = (terrainOfRow) => {
  const counts = {};
  for (const t of terrainOfRow) counts[t] = (counts[t] || 0) + 1;
  return { counts, total: terrainOfRow.length };
};

// value (the facet's own string) -> { terrain -> count }
export const crossTab = (records, terrainOfRow, column) => {
  const table = new Map();
  records.forEach((r, i) => {
    const key = String(r[column] ?? '').trim() || '(blank)';
    if (!table.has(key)) table.set(key, {});
    const bucket = table.get(key);
    const t = terrainOfRow[i];
    bucket[t] = (bucket[t] || 0) + 1;
  });
  return table;
};

export const numericAverageByTerrain = (records, terrainOfRow, column) => {
  const byTerrain = {};
  records.forEach((r, i) => {
    const v = parseFloat(r[column]);
    if (Number.isNaN(v)) return;
    (byTerrain[terrainOfRow[i]] ||= []).push(v);
  });
  const out = {};
  for (const [t, arr] of Object.entries(byTerrain)) out[t] = { avg: arr.reduce((a, b) => a + b, 0) / arr.length, n: arr.length };
  return out;
};

export const samplesByTerrain = (records, terrainOfRow, terrain, textColumn, { limit = 8 } = {}) => {
  const out = [];
  for (let i = 0; i < records.length && out.length < limit; i++) {
    if (terrainOfRow[i] === terrain) out.push({ index: i, text: records[i][textColumn], record: records[i] });
  }
  return out;
};

// The headline finding: for each facet column's value, which terrain is it MOST
// over-represented in relative to the dataset's own overall mix (lift = share-here
// / share-overall)? Ranked by lift, gated two ways: `minCount` so a facet value with
// a handful of rows can't produce a spurious ratio, and `minTerrainTotal` so a
// terrain that only occurs once or twice in the WHOLE corpus can't look like a 7x
// finding off a single coincidental row. This is the "highest level of meaning"
// synthesis — a plain finding ("negative feedback reads as Network"), not a table.
export const dominantTerrainInsights = (records, terrainOfRow, facetColumns, { minCount = 8, minTerrainTotal = 12, minLift = 1.15, topN = 6 } = {}) => {
  const { counts: totalCounts, total } = terrainDistribution(terrainOfRow);
  const insights = [];
  for (const col of facetColumns) {
    const table = crossTab(records, terrainOfRow, col);
    for (const [value, dist] of table) {
      const n = Object.values(dist).reduce((a, b) => a + b, 0);
      if (n < minCount) continue;
      let best = null;
      for (const [terrain, count] of Object.entries(dist)) {
        if ((totalCounts[terrain] || 0) < minTerrainTotal) continue;
        const shareOverall = (totalCounts[terrain] || 0) / (total || 1);
        if (shareOverall <= 0) continue;
        const shareHere = count / n;
        const lift = shareHere / shareOverall;
        if (!best || lift > best.lift) best = { terrain, lift, count, shareHere, shareOverall };
      }
      if (best && best.lift >= minLift) insights.push({ column: col, value, sampleSize: n, ...best });
    }
  }
  insights.sort((a, b) => b.lift - a.lift);
  return insights.slice(0, topN);
};
