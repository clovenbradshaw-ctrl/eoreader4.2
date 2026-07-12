// Fetch samples of larger third-party corpora into data/corpus/raw/*.jsonl — a local,
// regenerable pool for tools/nav-sample.mjs (navigation) and the background/negative
// grammar fit (tools/shape-fit.mjs's --background mode). Nothing here is authored by
// Cleo: it is a CONTRAST/NAVIGATION set, never a source for the per-intent shapes,
// which stay sourced only from data/exemplars.jsonl.
//
// Sourced via the HuggingFace datasets-server `rows` API (JSON, paginated) rather than
// downloading and parsing parquet/gzip files directly — one uniform fetch path for every
// source, no per-format parser, no native deps.
//
// Each source is fetched as several EVENLY SPACED WINDOWS of contiguous rows (not single
// scattered offsets — the API's row cap per request is 100, and a window preserves local
// structure, e.g. a message's neighbouring reply in OASST2's flat message list). Spacing
// across the full row range matters because these files are not shuffled — HelpSteer3 is
// literally sorted into contiguous domain blocks (verified: rows 0..8418 domain=code,
// 8419..26125 domain=general, 26126..30798 stem, 30799..38458 multilingual), so a single
// head-of-file read would silently return only one domain.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data', 'corpus', 'raw');

const API = 'https://datasets-server.huggingface.co';
const PAGE = 100; // datasets-server's per-request row cap

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, { retries = 4 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (res.status === 401 || res.status === 403) {
        const err = new Error(`HTTP ${res.status} (gated/unauthorized)`);
        err.gated = true;
        throw err;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (e.gated || attempt === retries) throw e;
      await sleep(2000 * 2 ** attempt);
    }
  }
}

const getNumRows = async (dataset, config, split) => {
  const j = await fetchJson(`${API}/size?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(config)}`);
  const s = (j.size?.splits || []).find((x) => x.split === split);
  return s?.num_rows ?? j.size?.config?.num_rows ?? 0;
};

const fetchRows = async (dataset, config, split, offset, length) => {
  const url = `${API}/rows?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(config)}` +
    `&split=${encodeURIComponent(split)}&offset=${offset}&length=${length}`;
  const j = await fetchJson(url);
  return (j.rows || []).map((r) => r.row);
};

// Evenly spaced window starts covering [rangeStart, rangeEnd) — enough windows of PAGE
// rows each to reach ~targetRows, spread across the whole range so a sorted/blocked file
// (like HelpSteer3) still gets surveyed rather than read from one end.
const planWindows = (rangeStart, rangeEnd, targetRows) => {
  const span = rangeEnd - rangeStart;
  if (span <= 0) return [];
  const nWindows = Math.max(1, Math.min(Math.ceil(targetRows / PAGE), Math.ceil(span / PAGE)));
  const starts = [];
  for (let i = 0; i < nWindows; i++) {
    const start = rangeStart + Math.floor((i * span) / nWindows);
    starts.push(Math.min(start, rangeEnd - 1));
  }
  return starts;
};

const fetchWindowed = async (dataset, config, split, { rangeStart, rangeEnd, targetRows, filter, map }) => {
  const starts = planWindows(rangeStart, rangeEnd, targetRows);
  const out = [];
  for (const start of starts) {
    const len = Math.min(PAGE, rangeEnd - start);
    const rows = await fetchRows(dataset, config, split, start, len);
    for (const row of rows) {
      if (filter && !filter(row)) continue;
      out.push(map ? map(row) : row);
    }
  }
  return out;
};

// ── sources ──────────────────────────────────────────────────────────────────────────
const SOURCES = [
  {
    name: 'helpsteer2',
    dataset: 'nvidia/HelpSteer2', config: 'default', split: 'train',
    targetRows: 3000,
    map: (r) => ({
      source: 'helpsteer2', prompt: r.prompt, response: r.response,
      attrs: { helpfulness: r.helpfulness, correctness: r.correctness, coherence: r.coherence,
        complexity: r.complexity, verbosity: r.verbosity },
    }),
  },
  {
    name: 'helpsteer3-general',
    dataset: 'nvidia/HelpSteer3', config: 'preference', split: 'train',
    // Verified contiguous domain=general block — see header comment.
    range: { start: 8419, end: 26126 },
    targetRows: 3000,
    filter: (r) => r.domain === 'general' && r.language === 'english',
    map: (r) => ({
      source: 'helpsteer3-general', prompt: r.context?.at(-1)?.content ?? null,
      response_a: r.response1, response_b: r.response2, overall_preference: r.overall_preference,
    }),
  },
  {
    name: 'oasst2',
    dataset: 'OpenAssistant/oasst2', config: 'default', split: 'train',
    targetRows: 3000,
    filter: (r) => r.lang === 'en' && r.deleted !== true,
    map: (r) => ({
      source: 'oasst2', message_id: r.message_id, parent_id: r.parent_id,
      role: r.role, text: r.text, rank: r.rank,
    }),
  },
  {
    name: 'dolly15k',
    dataset: 'databricks/databricks-dolly-15k', config: 'default', split: 'train',
    targetRows: 3000,
    map: (r) => ({
      source: 'dolly15k', prompt: r.instruction, response: r.response, category: r.category,
    }),
  },
  {
    name: 'magpie-pro',
    dataset: 'Magpie-Align/Magpie-Pro-300K-Filtered', config: 'default', split: 'train',
    targetRows: 3000,
    map: (r) => {
      const human = r.conversations?.find((t) => t.from === 'human');
      const gpt = r.conversations?.find((t) => t.from === 'gpt');
      return { source: 'magpie-pro', uuid: r.uuid, prompt: human?.value ?? null, response: gpt?.value ?? null };
    },
    filter: (r) => (r.conversations?.length ?? 0) >= 2,
  },
];

// GAIR/lima is gated (requires an accepted-terms HF token this session doesn't have) —
// noted, not silently dropped. Fetch it manually and drop a lima.jsonl into
// data/corpus/raw/ if you want it folded into nav-sample.mjs.
const SKIPPED = [{ name: 'lima', dataset: 'GAIR/lima', reason: 'gated dataset — no HF auth token in this session' }];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const src of SOURCES) {
    const numRows = await getNumRows(src.dataset, src.config, src.split);
    const rangeStart = src.range?.start ?? 0;
    const rangeEnd = src.range?.end ?? numRows;
    const rows = await fetchWindowed(src.dataset, src.config, src.split, {
      rangeStart, rangeEnd, targetRows: src.targetRows, filter: src.filter, map: src.map,
    });
    const path = join(OUT_DIR, `${src.name}.jsonl`);
    writeFileSync(path, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`${src.name}: ${rows.length} rows (of ${rangeEnd - rangeStart} in range) -> ${path}`);
  }
  for (const s of SKIPPED) console.log(`SKIPPED ${s.name} (${s.dataset}): ${s.reason}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
