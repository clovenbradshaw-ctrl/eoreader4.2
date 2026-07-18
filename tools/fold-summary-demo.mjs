// A demo of the fold → summary pipeline as the APP runs it: hand it a whole document and
// let the surfer FIND the fold — no hand-carved section, no pre-selected passage. The same
// summaryFold + realizeSummary the reader uses, with BOTH firewalls wired (the referential
// gate inside realizeSummary, and the grounding stack injected here). Prints, per fold: the
// deterministic telegram floor, the model voice, which voice shipped and why, and the
// grounding badge (does the summary stand on what was read, or on the model's own training).
//
//   node tools/fold-summary-demo.mjs <text-file> --base http://127.0.0.1:8811/v1 \
//        --topic "molecular symmetry" --entity "Bunker" --cursor 120 --cap 120000
//
// Scopes run: full (arc for long docs) + any --topic / --entity / --cursor given. The topic
// and entity pivots are the point: the document is the WHOLE journal / WHOLE novel, and the
// thread-conditioned surf sets down where that theme or figure actually lives — the app
// figuring out for itself which fold to summarize.

import { readFileSync } from 'node:fs';
import { parseText } from '../src/perceiver/parse/index.js';
import { nestComposite } from '../src/perceiver/nest.js';
// richSurf — the full-power surf (significance column + multi-level chorus). On a nested
// composite it drops the off-topic sub-documents and reads only the one the ask concerns.
import { richSurf, detectGrain } from '../src/surfer/index.js';
import { summaryFold, telegramSummary, realizeSummary, SUMMARY_DETAILS } from '../src/surfer/fold/index.js';
import { groundText } from '../src/enactor/ground/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/openai-local.js';

const arg = (name, dflt = null) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : dflt; };
const FILE = process.argv[2];
const BASE = arg('base', 'http://127.0.0.1:8811/v1');
const TOPIC = arg('topic', null);
const ENTITY = arg('entity', null);
const CURSOR = arg('cursor', null);
const CAP = Number(arg('cap', 120000));
const DETAIL = arg('detail', 'standard');
const NEST = process.argv.includes('--nest');
if (!FILE) { console.error('usage: node tools/fold-summary-demo.mjs <text-file> [--nest] [--topic X] [--entity Y] [--cursor N]'); process.exit(1); }

// Strip Project Gutenberg boilerplate the way the app's ingest would, so the fold reads the
// work, not the license. (A real ingest also strips journal apparatus; the surfer's deep
// reading refuses the rest — we feed the whole thing and let it find the content.)
const stripGutenberg = (raw) => {
  let t = String(raw).replace(/\r\n/g, '\n');
  const s = t.search(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*\*\*\*/i);
  if (s >= 0) t = t.slice(t.indexOf('\n', s) + 1);
  const e = t.search(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG/i);
  if (e >= 0) t = t.slice(0, e);
  return t.trim();
};

let text = stripGutenberg(readFileSync(FILE, 'utf8'));
if (text.length > CAP) text = text.slice(0, CAP);
let doc = parseText(text);
const S = (doc.units || doc.sentences || []).length;
// NEST: re-present a single-file composite (a journal of reviews, an mbox, a chaptered book)
// as its nested sub-documents, so the chorus can drop the off-topic parts and read only the one
// the ask concerns — the app finding the right sub-document on its own.
if (NEST) {
  const comp = nestComposite(doc);
  const { sourceRanges } = await import('../src/surfer/index.js');
  const n = sourceRanges(comp).length;
  console.log(`\n=== ${FILE} · ${text.length} chars · ${S} sentences · NESTED into ${n} sub-documents ===\n`);
  doc = comp;
} else {
  console.log(`\n=== ${FILE} · ${text.length} chars · ${S} sentences ===\n`);
}

const model = createModel('lmstudio', { baseURL: BASE });
await model.load();
const phrase = (m, o) => model.phrase(m, o);

const runFold = async (label, opts) => {
  let packet = null;
  try {
    packet = summaryFold(doc, { surf: richSurf, grain: (d) => detectGrain(d, { grain: 'auto' }), ...opts });
  } catch (e) { console.log(`── ${label}: fold error (${e.message})\n`); return; }
  if (!packet) { console.log(`── ${label}: no packet\n`); return; }

  const ground = (t) => groundText(t, {
    passages: (packet.spans || []).map((s) => ({ u: packet.docId, idx: s.idx, text: s.text })),
    doc,
  });
  const tier = SUMMARY_DETAILS[opts.detail || DETAIL];
  const telegram = telegramSummary(packet, { maxSentences: tier.maxSentences });
  const out = await realizeSummary(packet, {
    detail: opts.detail || DETAIL, phrase, telegram: () => telegram, ground,
  });

  console.log(`── ${label}  (surf set down at sentence ${packet.cursor}; ${packet.stops.length} stops)`);
  console.log(`   read here: “${(packet.spans[0]?.text || '').slice(0, 140)}${(packet.spans[0]?.text || '').length > 140 ? '…' : ''}”`);
  console.log(`   TELEGRAM (floor): ${telegram}`);
  const badge = out.ground ? `${out.ground.kind} · ${out.ground.source}/${out.ground.claims} spans on-source` : 'n/a';
  console.log(`   SHIPPED via ${out.via}${out.via !== 'model' ? ' (model voice vetoed → floor)' : ''} · ground: ${badge}`);
  console.log(`   SUMMARY: ${out.text}`);
  if (out.rejected && out.via !== 'model') console.log(`   (model wrote, but it didn't stand on the record: “${out.rejected}”)`);
  console.log('');
};

// full / arc — "what is this whole thing?"
await runFold('FULL (whole-document)', { scope: 'full', coverage: S > 40 ? 'arc' : 'peak', detail: S > 40 ? 'paragraph' : DETAIL });
if (TOPIC)  await runFold(`TOPIC pivot: "${TOPIC}"`, { scope: 'topic', topic: TOPIC });
if (ENTITY) await runFold(`ENTITY pivot: "${ENTITY}"`, { scope: 'entity', entity: ENTITY });
if (CURSOR != null) await runFold(`CURSOR @ ${CURSOR}`, { scope: 'cursor', cursor: Number(CURSOR) });
