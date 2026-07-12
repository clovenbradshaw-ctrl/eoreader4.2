// Stratified sample over data/corpus/raw/*.jsonl (tools/corpus-fetch.mjs) -> a single
// data/nav-corpus.jsonl: a pool of navigation prompts (denser neighbourhoods than the
// 430 exemplars alone give matchPrompt/kNN) plus, where the source carries one, a
// response tagged by REGISTER — 'human-authored' (OASST2, Dolly15k: a person wrote it)
// or 'assistant-synthetic' (HelpSteer2/3, Magpie-Pro: a model wrote it). The register
// tag is what tools/shape-fit.mjs's background extension (--background) reads to fit
// the chatbot-ese contrast grammar (s_yours − s_assistant) — never a source for the
// reader's own per-intent shapes, which stay data/exemplars.jsonl only.
//
// Output is ROUND-ROBIN INTERLEAVED across sources, not grouped, so a time-boxed runtime
// embedder reading the file sequentially gets breadth across all five sources within the
// first few hundred items rather than exhausting one source before touching the next —
// the same reasoning tools/corpus-fetch.mjs's windowed sampling used against a sorted
// upstream file, applied here against a sequential reader.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'data', 'corpus', 'raw');
const OUT_PATH = join(ROOT, 'data', 'nav-corpus.jsonl');

// Target pool size and the evenly-spread per-source quota. Not a hard promise — a source
// that yields fewer usable records than its quota just contributes what it has (logged,
// never silently topped up with junk).
const POOL_TARGET = 3600;

const readJsonl = (path) => {
  if (!existsSync(path)) return [];
  const out = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip malformed line */ }
  }
  return out;
};

// Evenly spaced deterministic downsample to `n` items — no Math.random(), reproducible.
const spread = (arr, n) => {
  if (arr.length <= n) return arr;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor((i * arr.length) / n)]);
  return out;
};

// ── per-source extraction: raw row -> { text, response?, register?, meta } ──────────
const extractHelpSteer2 = (rows) => rows
  .filter((r) => r.prompt && r.response)
  .map((r) => ({ text: r.prompt, response: r.response, register: 'assistant-synthetic', meta: { attrs: r.attrs } }));

const extractHelpSteer3 = (rows) => {
  const out = [];
  for (const r of rows) {
    if (!r.prompt) continue;
    // overall_preference < 0 favors response_a (response1), > 0 favors response_b (response2),
    // 0 a tie — carried through as `preferred`/`winMargin` for a future preference-gradient fit,
    // not consumed yet.
    if (r.response_a) out.push({ text: r.prompt, response: r.response_a, register: 'assistant-synthetic',
      meta: { pairId: `${r.prompt}`.slice(0, 40), side: 'a', preferred: r.overall_preference < 0, winMargin: -r.overall_preference } });
    if (r.response_b) out.push({ text: r.prompt, response: r.response_b, register: 'assistant-synthetic',
      meta: { pairId: `${r.prompt}`.slice(0, 40), side: 'b', preferred: r.overall_preference > 0, winMargin: r.overall_preference } });
  }
  return out;
};

// Reconstruct prompter->assistant pairs WITHIN the fetched window only (parent and child
// both had to land in the same ~100-row window to pair here) — a real but partial yield,
// logged rather than padded.
const extractOasst2 = (rows) => {
  const byId = new Map(rows.map((r) => [r.message_id, r]));
  const out = [];
  for (const r of rows) {
    if (r.role !== 'assistant' || !r.parent_id) continue;
    const parent = byId.get(r.parent_id);
    if (!parent || parent.role !== 'prompter') continue;
    out.push({ text: parent.text, response: r.text, register: 'human-authored', meta: { rank: r.rank } });
  }
  return out;
};

const extractDolly15k = (rows) => rows
  .filter((r) => r.prompt && r.response)
  .map((r) => ({ text: r.prompt, response: r.response, register: 'human-authored', meta: { category: r.category } }));

const extractMagpiePro = (rows) => rows
  .filter((r) => r.prompt && r.response)
  .map((r) => ({ text: r.prompt, response: r.response, register: 'assistant-synthetic', meta: { uuid: r.uuid } }));

const SOURCES = [
  { name: 'helpsteer2', file: 'helpsteer2.jsonl', extract: extractHelpSteer2 },
  { name: 'helpsteer3-general', file: 'helpsteer3-general.jsonl', extract: extractHelpSteer3 },
  { name: 'oasst2', file: 'oasst2.jsonl', extract: extractOasst2 },
  { name: 'dolly15k', file: 'dolly15k.jsonl', extract: extractDolly15k },
  { name: 'magpie-pro', file: 'magpie-pro.jsonl', extract: extractMagpiePro },
];

function main() {
  const perSourceQuota = Math.floor(POOL_TARGET / SOURCES.length);
  const bySource = [];
  for (const src of SOURCES) {
    const path = join(RAW_DIR, src.file);
    const rows = readJsonl(path);
    const extracted = src.extract(rows);
    const sampled = spread(extracted, perSourceQuota).map((rec, i) => ({
      id: `${src.name}-${i}`, source: src.name, ...rec,
    }));
    bySource.push({ name: src.name, available: extracted.length, sampled });
    console.log(`${src.name}: ${rows.length} raw -> ${extracted.length} usable -> ${sampled.length} sampled (quota ${perSourceQuota})`);
  }

  // Round-robin interleave across sources for breadth-first sequential reading.
  const out = [];
  const maxLen = Math.max(...bySource.map((s) => s.sampled.length));
  for (let i = 0; i < maxLen; i++) {
    for (const s of bySource) if (s.sampled[i]) out.push(s.sampled[i]);
  }

  writeFileSync(OUT_PATH, out.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const byRegister = out.reduce((acc, r) => { acc[r.register] = (acc[r.register] || 0) + 1; return acc; }, {});
  console.log(`\nnav-sample: ${out.length} total -> ${OUT_PATH}`);
  console.log(`  by register: ${JSON.stringify(byRegister)}`);
  if (out.length < POOL_TARGET) {
    console.log(`  NOTE: pool is ${out.length}, short of the ${POOL_TARGET} target — some source(s) yielded fewer usable rows than their quota (see per-source counts above). Not padded.`);
  }
}

main();
