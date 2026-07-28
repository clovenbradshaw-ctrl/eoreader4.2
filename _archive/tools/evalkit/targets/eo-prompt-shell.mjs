#!/usr/bin/env node
// evalkit `shell` target — the REAL prompt assembly behind the battery.
//
// The probe harness for docs/prompt-as-site.md Tier 2 (P2/P3/P4). The stock
// local-llm config feeds the model a hand-written static system prompt
// (prompts/local-bot.md) — a re-implementation that never touches the engine. This
// target assembles the prompt through src/model/prompt.js buildGroundedMessages —
// the same band projection production runs — so a probe flips REAL bands, not a
// markdown stand-in. Only retrieval is a stand-in (keyword overlap over corpus/),
// exactly the role local-bot.md's pasted corpus plays.
//
// Contract (tools/evalkit/targets.py ShellTarget): conversation history arrives as
// a JSON [{role, content}] array on stdin; the reply goes to stdout.
//
// Environment:
//   EO_PROBE        '' (baseline) | p2 | p3 | p4     which probe to arm
//                   p2  drop the Atmosphere + Field bands (Ground-row ablation)
//                   p3  grain-match the summary path: fold digest in, guard out
//                   p4  absence band BEFORE the material (helix order) instead of last
//   EO_LLM_URL      OpenAI-compatible chat endpoint (default http://127.0.0.1:8080/v1/chat/completions)
//   EO_LLM_MODEL    model name (default qwen2.5-1.5b-instruct)
//   EO_MAX_TOKENS   reply ceiling (default 220)
//   EO_CORPUS       corpus dir (default <this file>/../corpus)
//   EO_DRY          '1' → print the assembled messages as JSON and exit (no model);
//                   lets you diff exactly what each probe changes, offline
//
// Usage (from tools/evalkit):
//   EO_PROBE=p4 python3 evalkit.py --config config.probe.yaml

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGroundedMessages } from '../../../src/model/prompt.js';

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = process.env.EO_CORPUS || join(here, '..', 'corpus');
const PROBE = (process.env.EO_PROBE || '').trim().toLowerCase();

// ── stdin: the conversation history ─────────────────────────────────────────
const stdin = readFileSync(0, 'utf8');
let history = [];
try { history = JSON.parse(stdin); } catch { history = [{ role: 'user', content: stdin.trim() }]; }
const users = history.filter(m => m.role === 'user').map(m => String(m.content ?? ''));
const question = users.at(-1) ?? '';
const pastTurns = users.slice(0, -1).map(q => `You asked: ${q}`);

// ── the retrieval stand-in (keyword overlap over the corpus) ────────────────
const files = readdirSync(CORPUS_DIR).filter(f => /\.(md|txt)$/.test(f));
const sentences = [];
for (const f of files) {
  const body = readFileSync(join(CORPUS_DIR, f), 'utf8')
    .split('\n')
    .filter(l => !l.startsWith('#') && !l.startsWith('>'))   // headings/fixture notes are not source text
    .join('\n');
  for (const raw of body.split(/(?<=[.!?])\s+/)) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (s.length > 30) sentences.push({ text: s, file: f });
  }
}
const words = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9$]{4,}/g) || []);
const qw = words(question);
const scored = sentences
  .map(s => {
    const sw = words(s.text);
    let hit = 0;
    for (const w of qw) if (sw.has(w)) hit += 1;
    return { text: s.text, score: qw.size ? hit / qw.size : 0 };
  })
  .filter(s => s.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 6);

// ── task + probe ─────────────────────────────────────────────────────────────
const summary = /\b(summari[sz]e|summary|overview|what is it about)\b/i.test(question);
const task = summary ? 'summary' : 'answer';

let probe = null;
let graph = '';
if (PROBE === 'p2') probe = { drop: ['Atmosphere', 'Field'] };
if (PROBE === 'p4') probe = { absenceFirst: true };
if (PROBE === 'p3' && summary) {
  // Grain-match the summary path: hand the turn Pattern-grain material (a
  // mechanical fold digest of what retrieval surfaced — Network grain, the sense of
  // it, not more Entity lines) and drop the Composing instruction. The stance is
  // meant to fall out of the material's grain, not be declared beside it.
  probe = { dropBands: ['summary-guard'] };
  const tops = (scored.length ? scored : sentences.map(s => ({ ...s, score: 0 })).slice(0, 4))
    .slice(0, 4).map(s => s.text.split(/[,;:]/)[0].trim());
  graph = `The reading kept returning to: ${tops.join('; ')}.`;
}

const messages = buildGroundedMessages({
  question,
  spans: scored,
  orientation: files.length ? `${files[0]} · text · ${sentences.length} sentences` : '',
  task,
  strict: true,                       // the Grounded chip: absence voiced, never guessed
  conversation: pastTurns.length ? { pastTurns } : {},
  graph,
  probe,
});

if (process.env.EO_DRY === '1') {
  console.log(JSON.stringify({ probe: PROBE || 'baseline', messages }, null, 2));
  process.exit(0);
}

// ── the model (OpenAI-compatible, same server the local-llm config uses) ────
const url = process.env.EO_LLM_URL || 'http://127.0.0.1:8080/v1/chat/completions';
const body = {
  model: process.env.EO_LLM_MODEL || 'qwen2.5-1.5b-instruct',
  messages,
  max_tokens: Number(process.env.EO_MAX_TOKENS || 220),
  temperature: 0,
};
const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`model server ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const out = await res.json();
console.log(String(out?.choices?.[0]?.message?.content ?? '').trim());
