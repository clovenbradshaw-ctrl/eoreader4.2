// A fast single-fold prompt lab: pick one doc + one cursor, fold it once, then try many
// prompt variants against the SAME packet without re-parsing/re-surfing each time. Meant
// for interactive prompt iteration against a real CPU model server — the bench
// (tools/fold-summary-bench.mjs) is the broad scoreboard; this is the tight loop.
//
//   node tools/fold-prompt-lab.mjs --doc novel-moby-dick --cursor 40 --base http://127.0.0.1:8811/v1

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseText } from '../src/perceiver/parse/index.js';
import { surfFold } from '../src/surfer/surf.js';
import {
  summaryFold, telegramSummary, packetSurface, summaryAdditions, cleanSummary,
} from '../src/surfer/fold/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/openai-local.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = join(ROOT, 'data', 'corpus', 'summary');

const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const DOC = arg('doc', 'novel-moby-dick');
const CURSOR = arg('cursor', null);
const BASE = arg('base', process.env.EO_LOCAL_LLM_BASE || 'http://127.0.0.1:8811/v1');
const SENTENCES = Number(arg('sentences', 3));

const manifest = JSON.parse(readFileSync(join(CORPUS, 'manifest.json'), 'utf8'));
const meta = manifest.docs.find((m) => m.id === DOC);
if (!meta) { console.error(`no such doc: ${DOC}\navailable: ${manifest.docs.map((m) => m.id).join(', ')}`); process.exit(1); }
const text = readFileSync(join(CORPUS, meta.file), 'utf8');
const doc = parseText(text);
const S = (doc.units || doc.sentences || []).length;
const cursor = CURSOR != null ? Number(CURSOR) : S >> 1;

const packet = summaryFold(doc, { surf: surfFold, scope: 'cursor', cursor, title: meta.title });
if (!packet) { console.error('no packet at this cursor'); process.exit(1); }

console.log(`doc: ${DOC} (${S} sentences) · cursor: ${cursor} (peak settled at ${packet.cursor}) · stops: ${packet.stops.length}`);
console.log(`spans:\n${packet.spans.map((s) => `  [${s.idx}] ${s.text}`).join('\n')}`);
console.log(`settled: ${packet.groups.settled.join(' | ')}`);
console.log(`held open: ${packet.groups.heldOpen.join(' | ') || '(none)'}`);
console.log('');
console.log(`telegram: ${telegramSummary(packet, { maxSentences: SENTENCES + 1 })}`);
console.log('');

const model = createModel('lmstudio', { baseURL: BASE });
await model.load();
const phrase = (m, o) => model.phrase(m, o);
const surface = packetSurface(packet);

// ── prompt variants under test ──────────────────────────────────────────────────────
// Each variant returns [{role,content}] messages for the SAME packet/ask, so the only
// thing that differs is the prompt text — the packet, decode opts, and gate stay fixed.
const head = packet.title ? `Title: ${packet.title}\n` : '';
const passagesBlock = packet.spans.map((s) => `- ${s.text}`).join('\n');
const notesBlock = () => {
  const parts = [];
  if (packet.groups.settled.length) parts.push(`Settled:\n${packet.groups.settled.map((l) => `- ${l}`).join('\n')}`);
  if (packet.groups.heldOpen.length) parts.push(`Held open (do not settle):\n${packet.groups.heldOpen.map((l) => `- ${l}`).join('\n')}`);
  return parts.join('\n');
};
const ask = `Summary (${SENTENCES} sentence${SENTENCES === 1 ? '' : 's'}):`;

const COMMON_RULES =
  ' Use only the people, places, works, dates and numbers that appear in the material.' +
  ' If the notes hold something open, report it as unsettled — never decide it.' +
  ' Plain prose only: no list, no heading, no preamble, and never mention notes,' +
  ' passages, documents-as-documents, or these instructions.';

const VARIANTS = {
  current: {
    system: 'You have just read a document. Below are its key passages and the reading notes —' +
      ' what it settles, what it holds open, where it turns. Write the summary a careful' +
      ' reader would give: what the document is about and what actually happens or is' +
      ' claimed in it, concrete and specific.' + COMMON_RULES,
    user: `${head}Passages:\n${passagesBlock}\n\nReading notes:\n${notesBlock()}\n\n${ask}`,
  },
  terse_imperative: {
    system: 'Summarize the passages below in your own words, ' + `${SENTENCES} sentences, concrete and specific.` +
      ' Only use names, places, dates and numbers that appear in the passages or notes.' +
      ' Do not mention "passages", "notes", or "the document". No preamble, no lists.',
    user: `${head}Passages:\n${passagesBlock}\n\nNotes:\n${notesBlock()}\n\n${ask}`,
  },
  few_shot: {
    system: 'Write a short, concrete summary of the passages below, in your own words.' + COMMON_RULES,
    user: `Example\nPassages:\n- The dog ran into the yard.\n- It chased a squirrel up a tree.\nNotes:\nSettled:\n- the dog chased a squirrel\nSummary (1 sentence):\nA dog chases a squirrel up a tree in the yard.\n\nNow do the same for this material.\n${head}Passages:\n${passagesBlock}\n\nNotes:\n${notesBlock()}\n\n${ask}`,
  },
  role_reader: {
    system: 'You are a careful reader giving a friend a quick, accurate account of a passage they' +
      ' have not read. Speak plainly and specifically — who, what, where. Stick to what the' +
      ' material actually says.' + COMMON_RULES,
    user: `${head}Passages:\n${passagesBlock}\n\nReading notes:\n${notesBlock()}\n\n${ask}`,
  },
  no_notes_passages_only: {
    system: 'Write the summary a careful reader would give of the passages below: what actually' +
      ' happens or is claimed, concrete and specific, in your own words.' + COMMON_RULES,
    user: `${head}Passages:\n${passagesBlock}\n\n${ask}`,
  },
  json_scratchpad: {
    system: 'Read the passages below. First list (silently, do not output) the key facts, then' +
      ' write ONLY the final summary as plain prose, ' + `${SENTENCES} sentences.` + COMMON_RULES,
    user: `${head}Passages:\n${passagesBlock}\n\nReading notes:\n${notesBlock()}\n\nFinal summary only, ${SENTENCES} sentences:`,
  },
};

const DECODE = { maxTokens: 220, temperature: 0, stop: ['\n\n'] };

for (const [name, v] of Object.entries(VARIANTS)) {
  const messages = [{ role: 'system', content: v.system }, { role: 'user', content: v.user }];
  const t0 = Date.now();
  let raw = '';
  try { raw = await phrase(messages, DECODE); } catch (e) { raw = `<error: ${e.message}>`; }
  const ms = Date.now() - t0;
  const cleaned = cleanSummary(raw, { maxSentences: SENTENCES + 1, maxLen: 900 });
  const additions = summaryAdditions(cleaned || raw, surface);
  const gated = additions.names.length || additions.numbers.length;
  console.log(`── ${name} (${ms}ms) ${gated ? 'GATED ⚠' : 'clean ✓'} ${cleaned ? '' : '(cleanSummary rejected)'}`);
  console.log(`   raw: ${raw.replace(/\n/g, ' ⏎ ')}`);
  if (gated) console.log(`   would-add: names=${additions.names.join(',')} numbers=${additions.numbers.join(',')}`);
  console.log('');
}
