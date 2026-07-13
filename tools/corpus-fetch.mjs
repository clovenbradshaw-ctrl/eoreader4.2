// EO: INS·CON(Void → Field, Making,Binding) — fetch the larger open corpora
// Pull a bounded slice of an open corpus into data/corpus/ (gitignored), so shape-fit can fit a
// real assistant-register background and report coverage. The derived shapes.json is tiny and
// committed; the raw corpora are not. Direct HF `resolve` file URLs — the datasets-server rows
// API is flaky behind proxies, but the raw files resolve.
//
//   node tools/corpus-fetch.mjs dolly          — 15k human-written, task-labelled (CC-BY-SA)
//   node tools/corpus-fetch.mjs oasst          — OpenAssistant, human-written + ranked (Apache-2.0)
//
// Then:  node tools/shape-fit.mjs --reference data/corpus/dolly.jsonl --out data/shapes.enriched.json
//
// HelpSteer2 / HelpSteer3-Preference (nvidia, CC-BY-4.0) ship as parquet, not raw JSONL — convert
// with the `datasets` library offline, then feed the General subset through the helpSteer3Pairs
// adapter (tools/corpus/adapters.mjs) for the winner-vs-loser gradient in move-space. UltraChat
// 200k / Magpie are the synthetic-assistant NEGATIVE set — sample 20–30k; a 10×10 matrix converges
// long before the rest.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCES = {
  dolly: {
    url: 'https://huggingface.co/datasets/databricks/databricks-dolly-15k/resolve/main/databricks-dolly-15k.jsonl',
    out: 'data/corpus/dolly.jsonl',
    note: '15k human-written, task-labelled (CC-BY-SA)',
  },
  oasst: {
    url: 'https://huggingface.co/datasets/OpenAssistant/oasst1/resolve/main/2023-04-12_oasst_ready.trees.jsonl.gz',
    out: 'data/corpus/oasst.trees.jsonl.gz',
    note: 'OpenAssistant message trees, human-written + ranked (Apache-2.0) — gz, expand before fit',
  },
};

const fetchWithRetry = async (url, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === tries - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** i));   // 2s, 4s, 8s
  }
  throw new Error('unreachable');
};

const name = process.argv[2];
const src = SOURCES[name];
if (!src) {
  console.error(`usage: node tools/corpus-fetch.mjs <${Object.keys(SOURCES).join('|')}>`);
  for (const [k, v] of Object.entries(SOURCES)) console.error(`  ${k.padEnd(8)} ${v.note}`);
  process.exit(1);
}

mkdirSync(new URL('../data/corpus/', import.meta.url), { recursive: true });
const out = new URL(`../${src.out}`, import.meta.url);
console.log(`fetching ${name}: ${src.url}`);
const buf = await fetchWithRetry(src.url);
writeFileSync(out, buf);
console.log(`→ ${fileURLToPath(out)} (${(buf.length / 1e6).toFixed(1)} MB)`);
console.log(`next: node tools/shape-fit.mjs --reference ${src.out} --out data/shapes.enriched.json`);
