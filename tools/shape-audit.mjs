// Full-size audit export: for every exemplar in data/exemplars.jsonl, the actual
// content the shape was fit from (the "shape inspo" — user_turn + response) alongside
// its complete parse trace — every move buildMoveLog produced, tagged `kept` (survives
// into the fitted grammar) or masked (the enacted/cognition register: DEF/EVA/REC).
//
// This is the checkable half of the masking claim in shape-fit.mjs: rather than asserting
// "the shape can carry no judgment," this export lets a human read, per exemplar, exactly
// which moves were read off the response and exactly which were dropped and why. Covers
// all 430 exemplars, not a sample — an audit that samples is not an audit.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseToMoves, ENACTED_MASK } from './lib/moves.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXEMPLARS_PATH = join(ROOT, 'data', 'exemplars.jsonl');
const OUT_PATH = join(ROOT, 'data', 'shapes-audit.jsonl');

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

function main() {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const raw = readFileSync(EXEMPLARS_PATH, 'utf8');
  const records = parseExemplars(raw);
  if (!records.length) throw new Error(`shape-audit: no exemplars read from ${EXEMPLARS_PATH}`);

  const lines = [];
  let totalMoves = 0, totalKept = 0, totalMasked = 0;
  for (const r of records) {
    const moves = parseToMoves(r.response, r.id).map(trimMove);
    const kept = moves.filter((m) => m.kept).length;
    const masked = moves.length - kept;
    totalMoves += moves.length; totalKept += kept; totalMasked += masked;
    lines.push(JSON.stringify({
      id: r.id, intent: r.intent, shape_tags: r.shape_tags || [],
      user_turn: r.user_turn, response: r.response,
      moveCount: moves.length, keptCount: kept, maskedCount: masked,
      moves,
    }));
  }

  writeFileSync(OUT_PATH, lines.join('\n') + '\n');

  console.log(`shape-audit: ${records.length} exemplars -> ${OUT_PATH}`);
  console.log(`  total moves: ${totalMoves} (kept ${totalKept}, masked ${totalMasked} — ${[...ENACTED_MASK].join('/')})`);
  console.log(`  mean moves/response: ${(totalMoves / records.length).toFixed(1)}`);
}

main();
