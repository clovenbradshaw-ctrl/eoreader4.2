// Full-size audit export: for every text that fed data/shapes.json, the actual content
// the shape was fit from (the "shape inspo") alongside its complete parse trace — every
// move buildMoveLog produced, tagged `kept` (survives into the fitted grammar) or masked
// (the enacted/cognition register: DEF/EVA/REC).
//
// This is the checkable half of the masking claim in shape-fit.mjs: rather than asserting
// "the shape can carry no judgment," this export lets a human read, per record, exactly
// which moves were read off the response and exactly which were dropped and why. Covers
// EVERYTHING the fit consumed, not a sample — an audit that samples is not an audit:
//   data/shapes-audit.jsonl           all 430 exemplars (the per-intent shapes' source)
//   data/shapes-audit-contrast.jsonl  all nav-corpus responses (the contrast grammars'
//                                     source), when data/nav-corpus.jsonl is present.
// The contrast audit is regenerable byte-for-byte from the committed pool (the parse is
// deterministic), so it is gitignored rather than committed — the ledger is the tool +
// the pool, not a 30MB artifact in history.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseToMoves, ENACTED_MASK } from './lib/moves.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXEMPLARS_PATH = join(ROOT, 'data', 'exemplars.jsonl');
const NAV_CORPUS_PATH = join(ROOT, 'data', 'nav-corpus.jsonl');
const OUT_PATH = join(ROOT, 'data', 'shapes-audit.jsonl');
const CONTRAST_OUT_PATH = join(ROOT, 'data', 'shapes-audit-contrast.jsonl');

const parseExemplars = (text) => {
  const out = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('//')) continue;
    try {
      const r = JSON.parse(t);
      if (r && typeof r.response === 'string' && r.intent) out.push(r);
    } catch { /* skip malformed line */ }
  }
  return out;
};

// Trim a move down to what the audit needs to show — the op, whether it survived, and
// enough address/position to place it back in the response (site, cursor, label). Drops
// `raw` (the underlying doc event) — that's an implementation detail, not audit content.
const trimMove = (m) => ({
  i: m.i, op: m.op, register: m.register, kept: m.kept, cursor: m.cursor,
  site: m.site ? `${m.site.domain}/${m.site.grain}` : null,
  label: m.label || null,
});

// Audit one batch of {id, response, ...header} records into a JSONL file. `header`
// picks the source fields carried alongside the trace (intent+tags for exemplars,
// register+source for the contrast pool). Parse failures are typed into the record —
// an audit line saying "this one didn't parse" — never dropped from the export.
const auditBatch = (records, outPath, header) => {
  const lines = [];
  let totalMoves = 0, totalKept = 0, totalMasked = 0, failed = 0;
  for (const r of records) {
    let moves;
    try { moves = parseToMoves(r.response, r.id).map(trimMove); }
    catch (e) {
      failed++;
      lines.push(JSON.stringify({ id: r.id, ...header(r), response: r.response, parseError: String(e?.message || e) }));
      continue;
    }
    const kept = moves.filter((m) => m.kept).length;
    const masked = moves.length - kept;
    totalMoves += moves.length; totalKept += kept; totalMasked += masked;
    lines.push(JSON.stringify({
      id: r.id, ...header(r), response: r.response,
      moveCount: moves.length, keptCount: kept, maskedCount: masked,
      moves,
    }));
  }
  writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`shape-audit: ${records.length} records -> ${outPath}`);
  console.log(`  total moves: ${totalMoves} (kept ${totalKept}, masked ${totalMasked} — ${[...ENACTED_MASK].join('/')})${failed ? `, parse failures: ${failed}` : ''}`);
  console.log(`  mean moves/response: ${(totalMoves / (records.length - failed || 1)).toFixed(1)}`);
};

const readJsonl = (path) => {
  const out = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip malformed line */ }
  }
  return out;
};

function main() {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const records = parseExemplars(readFileSync(EXEMPLARS_PATH, 'utf8'));
  if (!records.length) throw new Error(`shape-audit: no exemplars read from ${EXEMPLARS_PATH}`);
  auditBatch(records, OUT_PATH,
    (r) => ({ intent: r.intent, shape_tags: r.shape_tags || [], user_turn: r.user_turn }));

  if (existsSync(NAV_CORPUS_PATH)) {
    const pool = readJsonl(NAV_CORPUS_PATH).filter((r) => typeof r.response === 'string' && r.response.trim());
    auditBatch(pool, CONTRAST_OUT_PATH,
      (r) => ({ register: r.register, source: r.source, user_turn: r.text }));
  } else {
    console.log(`shape-audit: no ${NAV_CORPUS_PATH} — contrast audit skipped`);
  }
}

main();
