// The fold → summary bench. Runs the whole pipeline (src/surfer/fold/summary*.js)
// over the four-register corpus (data/corpus/summary/, tools/corpus-fetch-summary.mjs)
// and scores every summary it produces — the harness the pipeline is falsified with,
// not a demo of it.
//
// WHAT IT RUNS, per document:
//   · full        the whole-document packet (adaptive-reach surf)
//   · cursor@…    a SEEDED-RANDOM cursor plus the head / middle / tail — the fold
//                 summarized from wherever it stands, which is the pipeline's claim
//   · entity      pivot on the document's warmest admitted figure
//   · topic       pivot on the document's own top content terms
// and per Armstrong probe group (docs sharing `group` in the manifest):
//   · cross-source, BOTH modes — sequential (the discipline) and joint (the hard
//     condition) — with the collapse and attribution metrics over each output.
//
// WHAT IT SCORES:
//   · fabrication — names/numbers a summary uses that its packet never carried
//                   (0 by construction for telegram and gated-model output; the RAW
//                   model column shows what the gate actually catches)
//   · coverage    — how many of the packet's top figures the summary mentions
//   · compression — summary chars / document chars
//   · coref       — cross-source referent collapse (packet level) + attribution
//                   errors and bare-namesake ambiguity (surface level)
//
// MODEL: any OpenAI-compatible local server (llama.cpp / LM Studio / Ollama) through
// the engine's own openai-local backend — a real CPU model, the pipeline's intended
// talker. Absent a reachable server the bench still runs every condition model-free
// (telegram floor) and marks the model columns BLOCKED, falsify-f3 style.
//
//   node tools/fold-summary-bench.mjs                       # telegram floor only
//   node tools/fold-summary-bench.mjs --base http://localhost:8080/v1
//   node tools/fold-summary-bench.mjs --base … --seed 7 --sentences 3 --json out.json --report out.md

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseText } from '../src/perceiver/parse/index.js';
import { surfFold } from '../src/surfer/surf.js';
import { tok } from '../src/perceiver/parse/index.js';
import {
  summaryFold, telegramSummary, packetSurface,
  summaryAdditions, realizeSummary, realizeCrossSummary, cleanSummary, summaryMessages,
  crossSourceSummaryFold, telegramCrossSummary, summaryAttributionErrors,
  seededRng,
} from '../src/surfer/fold/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/openai-local.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = join(ROOT, 'data', 'corpus', 'summary');

// ── args ─────────────────────────────────────────────────────────────────────────────
const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const BASE = arg('base', process.env.EO_LOCAL_LLM_BASE || null);
const SEED = Number(arg('seed', 42));
const SENTENCES = Number(arg('sentences', 3));
const JSON_OUT = arg('json', null);
const REPORT_OUT = arg('report', null);

// ── model (optional; the bench never needs it to run) ───────────────────────────────
const connectModel = async () => {
  if (!BASE) return null;
  try {
    const model = createModel('lmstudio', { baseURL: BASE });
    await model.load();
    const probe = await model.phrase([{ role: 'user', content: 'Say ok.' }], { maxTokens: 4 });
    if (typeof probe !== 'string') throw new Error('no text back');
    return model;
  } catch (e) {
    console.error(`model BLOCKED (${e.message || e}) — running model-free`);
    return null;
  }
};

// ── scoring ──────────────────────────────────────────────────────────────────────────
const stem = (w) => String(w || '').toLowerCase().replace(/(?:es|s)$/, '');

const coverage = (text, packet) => {
  const figs = (packet.figures || []).map((f) => stem((f.label || '').split(/\s+/).pop())).filter(Boolean);
  if (!figs.length) return null;
  const t = new Set((String(text).toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) || []).map(stem));
  const hit = figs.filter((f) => t.has(f)).length;
  return hit / figs.length;
};

const score = (text, packet, docChars) => {
  const additions = summaryAdditions(text, packetSurface(packet));
  return {
    chars: text.length,
    fabricatedNames: additions.names.length,
    fabricatedNumbers: additions.numbers.length,
    coverage: coverage(text, packet),
    compression: docChars ? +(text.length / docChars).toFixed(4) : null,
  };
};

const fmt = (x) => (x == null ? '—' : typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(2)) : String(x));

// ── the run ──────────────────────────────────────────────────────────────────────────
async function main() {
  const manifest = JSON.parse(readFileSync(join(CORPUS, 'manifest.json'), 'utf8'));
  const model = await connectModel();
  const phrase = model ? (m, o) => model.phrase(m, o) : null;
  const rng = seededRng(SEED);

  const docsById = new Map();
  for (const m of manifest.docs) {
    const text = readFileSync(join(CORPUS, m.file), 'utf8');
    docsById.set(m.id, { meta: m, text, doc: parseText(text) });
  }
  console.error(`corpus: ${docsById.size} docs · model: ${model ? BASE : 'BLOCKED (telegram floor only)'} · seed ${SEED}`);

  const rows = [];
  const gateCatches = [];

  // per-document conditions
  for (const { meta, text, doc } of docsById.values()) {
    const S = (doc.units || doc.sentences || []).length;
    const conditions = [];
    conditions.push({ kind: 'full', opts: { scope: 'full', title: meta.title } });
    const positions = [
      ['cursor@head', 0],
      ['cursor@mid', S >> 1],
      ['cursor@tail', Math.max(0, S - 3)],
      ['cursor@rand', Math.floor(rng() * S)],
    ];
    for (const [kind, at] of positions) conditions.push({ kind, opts: { scope: 'cursor', cursor: at, title: meta.title } });
    // entity pivot: the warmest admitted multi-word figure, else the warmest figure
    const admitted = [...(doc.admission?.admitted || new Map()).entries()]
      .map(([label, id]) => ({ label, n: (doc.mentions?.get?.(id) || []).length, multi: label.trim().includes(' ') }))
      .sort((a, b) => (b.multi - a.multi) || (b.n - a.n));
    if (admitted[0]) conditions.push({ kind: `entity:${admitted[0].label}`, opts: { scope: 'entity', entity: admitted[0].label, title: meta.title } });
    // topic pivot: the doc's own top content terms
    const tf = new Map();
    for (const t of tok(text)) tf.set(t, (tf.get(t) || 0) + 1);
    const topTerms = [...tf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
    if (topTerms.length) conditions.push({ kind: `topic:${topTerms.join(' ')}`, opts: { scope: 'topic', topic: topTerms.join(' '), title: meta.title } });

    for (const c of conditions) {
      let packet = null;
      try { packet = summaryFold(doc, { surf: surfFold, ...c.opts }); } catch (e) { packet = null; }
      if (!packet) { rows.push({ doc: meta.id, register: meta.register, condition: c.kind, error: 'no packet' }); continue; }

      const tele = telegramSummary(packet, { maxSentences: SENTENCES + 1 });
      const row = {
        doc: meta.id, register: meta.register, condition: c.kind,
        cursor: packet.cursor, stops: packet.stops.length,
        telegram: { text: tele, ...score(tele, packet, text.length) },
      };
      if (phrase) {
        const r = await realizeSummary(packet, { phrase, sentences: SENTENCES });
        row.model = { via: r.via, text: r.text, ...score(r.text, packet, text.length) };
        // what the gate caught, before the fallback hid it — the RAW column
        if (r.via === 'telegram-gated') {
          gateCatches.push({ doc: meta.id, condition: c.kind, rejected: r.rejected, additions: r.additions });
          row.model.rawRejected = r.rejected;
          row.model.rawAdditions = r.additions;
        }
      }
      rows.push(row);
      console.error(`  ${meta.id} · ${c.kind} · tele ${row.telegram.chars}ch${row.model ? ` · model(${row.model.via}) ${row.model.chars}ch` : ''}`);
    }
  }

  // cross-source probe groups
  const groups = new Map();
  for (const { meta } of docsById.values()) {
    if (!meta.group) continue;
    if (!groups.has(meta.group)) groups.set(meta.group, []);
    groups.get(meta.group).push(meta.id);
  }
  const cross = [];
  for (const [group, ids] of groups) {
    const entries = ids.map((id) => ({ doc: docsById.get(id).doc, title: docsById.get(id).meta.title }));
    // the probe name: the contested surname the group is about (manifest `about` tokens)
    const abouts = ids.map((id) => docsById.get(id).meta.about).filter(Boolean);
    const nameTok = abouts.length ? abouts[0].split(/\s+/).pop() : group;
    const rep = crossSourceSummaryFold(entries, { name: nameTok });
    const top = rep.referents.filter((r) => r.docs.length >= 2).slice(0, 2);
    const g = {
      group, name: nameTok, sources: ids.length,
      referents: rep.referents.map((r) => ({ referent: r.referent, sources: r.docs.length, members: r.members.length })),
      contested: rep.contested,
      collapse: rep.collapse,
    };
    if (top.length >= 2) {
      const tele = telegramCrossSummary(top);
      g.telegram = { text: tele, attribution: summaryAttributionErrors(tele, top, { contested: rep.contested }) };
      if (phrase) {
        for (const mode of ['sequential', 'joint']) {
          const r = await realizeCrossSummary(top, { phrase, sentences: SENTENCES + 1, telegram: telegramCrossSummary, mode });
          const att = summaryAttributionErrors(r.text, top, { contested: rep.contested });
          g[mode] = { via: r.via, text: r.text, attributionErrors: att.errors, ambiguous: att.ambiguous };
          console.error(`  cross[${group}] ${mode}: via ${r.via} · attribution errors ${att.errors.length} · ambiguous ${att.ambiguous.length}`);
        }
      }
    }
    cross.push(g);
  }

  // ── the scoreboard ─────────────────────────────────────────────────────────────────
  const agg = (sel) => {
    const xs = rows.map(sel).filter((r) => r && r.chars != null);
    if (!xs.length) return null;
    const mean = (k) => {
      const vs = xs.map((x) => x[k]).filter((v) => v != null);
      return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
    };
    return {
      n: xs.length, fabricatedNames: mean('fabricatedNames'), fabricatedNumbers: mean('fabricatedNumbers'),
      coverage: mean('coverage'), compression: mean('compression'), chars: mean('chars'),
    };
  };
  const teleAgg = agg((r) => r.telegram);
  const modelAgg = agg((r) => r.model);
  const modelVias = rows.filter((r) => r.model).reduce((m, r) => { m[r.model.via] = (m[r.model.via] || 0) + 1; return m; }, {});

  const board = [];
  board.push(`fold-summary bench · ${rows.length} summaries over ${docsById.size} docs · seed ${SEED}`);
  board.push(`model: ${model ? BASE : 'BLOCKED — telegram floor only'}`);
  board.push('');
  board.push(`telegram   n=${teleAgg?.n}  fabricated names ${fmt(teleAgg?.fabricatedNames)}  numbers ${fmt(teleAgg?.fabricatedNumbers)}  coverage ${fmt(teleAgg?.coverage)}  compression ${fmt(teleAgg?.compression)}`);
  if (modelAgg) {
    board.push(`model      n=${modelAgg.n}  fabricated names ${fmt(modelAgg.fabricatedNames)}  numbers ${fmt(modelAgg.fabricatedNumbers)}  coverage ${fmt(modelAgg.coverage)}  compression ${fmt(modelAgg.compression)}`);
    board.push(`model via: ${Object.entries(modelVias).map(([k, v]) => `${k} ${v}`).join(' · ')}  (gate caught ${gateCatches.length} fabrications)`);
  }
  for (const g of cross) {
    board.push('');
    board.push(`cross[${g.group}] referents kept apart: ${g.referents.filter((r) => r.sources >= 2).map((r) => `${r.referent} (${r.sources} sources)`).join(' · ')}`);
    board.push(`  packet collapse rate ${g.collapse.rate} (${g.collapse.collapsed.length} collapsed of ${g.collapse.groups} groups)`);
    if (g.telegram) board.push(`  telegram attribution errors ${g.telegram.attribution.errors.length}`);
    for (const mode of ['sequential', 'joint']) {
      if (g[mode]) board.push(`  ${mode.padEnd(10)} via ${g[mode].via} · attribution errors ${g[mode].attributionErrors.length} · bare-namesake ambiguity ${g[mode].ambiguous.length}`);
    }
  }
  console.log(board.join('\n'));

  const out = { seed: SEED, sentences: SENTENCES, base: model ? BASE : null, rows, cross, gateCatches,
    aggregate: { telegram: teleAgg, model: modelAgg, modelVias } };
  if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify(out, null, 2) + '\n'); console.error(`json -> ${JSON_OUT}`); }
  if (REPORT_OUT) { writeFileSync(REPORT_OUT, renderReport(out, board)); console.error(`report -> ${REPORT_OUT}`); }
}

// The human report: the scoreboard, then every cross-source output verbatim (the
// coref story wants reading, not just counting), then the gate's catch log.
const renderReport = (out, board) => {
  const L = [];
  L.push('# Fold → summary bench');
  L.push('');
  L.push('```');
  L.push(...board);
  L.push('```');
  L.push('');
  for (const g of out.cross) {
    L.push(`## Cross-source: ${g.group}`);
    L.push('');
    L.push(`Referents: ${g.referents.map((r) => `**${r.referent}** (${r.sources} sources, ${r.members} member labels)`).join(' · ')}`);
    L.push(`Contested names: ${g.contested.join(', ') || 'none'} · packet collapse: ${g.collapse.collapsed.length} of ${g.collapse.groups} groups`);
    L.push('');
    if (g.telegram) { L.push(`**telegram** (attribution errors ${g.telegram.attribution.errors.length}):`); L.push(`> ${g.telegram.text}`); L.push(''); }
    for (const mode of ['sequential', 'joint']) {
      if (!g[mode]) continue;
      L.push(`**${mode}** via ${g[mode].via} (attribution errors ${g[mode].attributionErrors.length}, ambiguous ${g[mode].ambiguous.length}):`);
      L.push(`> ${g[mode].text}`);
      for (const e of g[mode].attributionErrors) L.push(`> · ERROR: “${e.sentence}” gives ${e.referent} the figure “${e.foreignFigure}” (belongs to ${e.belongsTo})`);
      L.push('');
    }
  }
  if (out.gateCatches.length) {
    L.push('## What the referential gate caught');
    L.push('');
    for (const c of out.gateCatches) {
      L.push(`- **${c.doc} · ${c.condition}** added ${[...c.additions.names, ...c.additions.numbers].join(', ')}:`);
      L.push(`  > ${c.rejected}`);
    }
    L.push('');
  }
  return L.join('\n') + '\n';
};

main().catch((e) => { console.error(e); process.exit(1); });
