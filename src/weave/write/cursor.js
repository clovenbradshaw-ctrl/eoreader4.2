// EO: NUL·DEF·SIG(Entity,Field → Void,Lens, Clearing,Making,Tending) — the membrane; identity collapses to surface (§5)
// write/cursor.js — the membrane: the cursor contract. (SPEC §5)
//
// The substrate reasons over hashIds; the model sees only surface. The cursor is
// where identity collapses to words FOR THE MODEL AND THE AUDITOR BOTH — one act,
// two ends. It does double duty (cursor.mjs): the audit trail shows WHICH referent
// every beat is about, and the model is handed resolved identity at the point of
// use, so it can "think at a cursor" — subject fixed, predicate still open.
//
//   buildCursor(cell, fold, spans) → {
//     audit:  AuditLine,     integral names + open + provenance — the human trail
//     input:  Messages,      SURFACE ONLY; the integral handed per argument Site
//     expect: Set<hash>,     the Sites handed in — the witness's expected-set (§7)
//     budget: number,        max_tokens (turn/intent.js)
//   }
//
// THREE distinct renderings of a referent (conflating them is the coref wart, §5):
//   audit name     the integral (full)               → the human
//   model-input    the integral (full) + open held    → the model
//   speech surface the model's natural choice (he)     → the reader
// The substrate OVER-specifies the input (full integral per Site, to fix identity
// and kill mis-binding); the model UNDER-specifies the output (natural form).
//
// MULTI-SITE (§5): a beat has multiple referents. Hand the integral for EVERY
// argument Site, not just one focus — the object's integral prevents mis-bind as
// much as the subject's.
//
// MEMBRANE INVARIANT (§5): no hashId ever appears in `input`. Asserted here against
// /r#[0-9a-z]+/ over the serialized messages. Proven in contract.mjs; enforced now
// so a backend swap (stub → wllama) never leaks identity into the prompt.

import { HASHID_RE, sitesOf, isVoid } from '../../core/index.js';
import { buildCursorMessages } from '../../model/index.js';

// The default per-beat budget — the answer-task ceiling (turn/intent.js); a caller
// passes the turn's real budget. One fluent sentence rarely needs more.
const DEFAULT_BUDGET = 384;

// buildCursor — collapse identity at the cell and assemble the surface-only prompt.
//   cell    a scheduler cell: { id, op, site|sites|args, edge?, beat?, target?, res?, t? }
//   fold    the running fold (write/fold.js) — the integral source
//   spans   grounded substance for this beat (exafference)
//   opts    { t, budget, orientation, established, resolution }
//           `resolution` (optional) is the propagated Resolution band for this cell
//           (write/scheduler.js); absent → read the cell's own res.
export const buildCursor = (cell, fold, spans = [], opts = {}) => {
  const t = opts.t ?? cell.t ?? Infinity;
  const budget = opts.budget ?? cell.budget ?? DEFAULT_BUDGET;

  // Every argument Site of the beat (multi-Site, §5). Normalize to hashes.
  const argHashes = argHashesOf(cell);
  const expect = new Set(argHashes);

  // Collapse each Site to its integral (full standing name) + its open (void) attrs.
  const integrals = argHashes.map(h => fold.integralName(h, t));
  const open = [...new Set(integrals.flatMap(g => g.open))];

  // The propagated Resolution decides firm vs hedge (§3b). Void → the renderer must
  // hold the connection open, never overclaim.
  const band = bandOf(opts.resolution ?? cell.res);

  // The typed edge in SURFACE EOT (docs/eot-surface-syntax.md §5.3: a LINK is
  // `SUBJECT -> OBJECT : relation`), never a hash (contract.mjs) and never the retired
  // flat-arrow notation. A single named Site keeps the object slot open.
  const edge = cell.edge && integrals.length >= 2
    ? `${integrals[0].name} -> ${integrals[integrals.length - 1].name} : ${cell.edge}`
    : (cell.edge && integrals.length === 1 ? `${integrals[0].name} -> : ${cell.edge}` : '');

  // "Established so far" — the fold in surface terms (heads only), never hashes.
  const established = fold.appeared()
    .map(h => fold.headOf(h))
    .filter(Boolean)
    .join('; ');

  const input = buildCursorMessages({
    orientation: opts.orientation || '',
    established: opts.established ?? established,
    integrals,
    open,
    edge,
    beat: cell.beat || '',
    spans,
    target: cell.target || '',
    band,
    corrective: opts.corrective || cell.corrective || '',
  });

  // MEMBRANE CHECK — no hashId may reach the model (§5). One act of identity-
  // collapse upstream means the prompt is pure surface; a leak is a bug, not a
  // style nit, so it throws.
  assertNoLeak(input);

  // The audit line — the integral names + open + provenance, for the human trail.
  // This is the SAME integral the model got (one act, two ends), plus the hashes
  // and provenance the model must never see.
  const audit = buildAudit(cell, argHashes, integrals, open, fold, t, band);

  return Object.freeze({ audit, input, expect, budget, band });
};

// assertNoLeak — the membrane invariant, mechanical (§5). Serialize the whole
// message set and assert no r#… hashId survives. Exported so the witness and tests
// can reuse the exact check.
export const assertNoLeak = (messages) => {
  const serial = serialize(messages);
  if (HASHID_RE.test(serial)) {
    const leak = serial.match(HASHID_RE)?.[0];
    throw new Error(`cursor membrane leak: hashId ${leak} reached the model input`);
  }
  return true;
};

export const serialize = (messages) =>
  Array.isArray(messages) ? messages.map(m => `${m.role}\n${m.content}`).join('\n') : String(messages ?? '');

// ── helpers ──────────────────────────────────────────────────────────────────

// The argument hashes of a cell, tolerating cell.args (hashes), cell.sites, or the
// formal cell.event.site (Site | [Site]).
const argHashesOf = (cell) => {
  if (Array.isArray(cell.args)) return cell.args.map(asHash).filter(Boolean);
  if (cell.event) return sitesOf(cell.event).map(asHash).filter(Boolean);
  const s = cell.site ?? cell.sites ?? null;
  if (s == null) return [];
  const arr = Array.isArray(s) ? s : [s];
  return arr.map(asHash).filter(Boolean);
};
const asHash = (x) => (typeof x === 'string' ? x : x?.hash) ?? null;

const bandOf = (res) =>
  res == null ? 'void' : (typeof res === 'string' ? res : (isVoid(res) ? 'void' : 'firm'));

// The audit line is structured (so the UI/log can read fields) AND carries a
// one-line string for a plain trail. Provenance per Site is surfaced from the
// fold's dossier (read vs said, §8) where present.
const buildAudit = (cell, argHashes, integrals, open, fold, t, band) => {
  const sites = argHashes.map((h, i) => {
    const d = fold.dossierOf ? fold.dossierOf(h, t) : null;
    const prov = d?.descriptors?.map(x => x.prov).find(Boolean) ?? null;
    return { hash: h, name: integrals[i]?.name ?? fold.headOf(h), prov };
  });
  const line =
    `[t=${t === Infinity ? '∞' : t}] ${cell.op || cell.kind || '?'}(${argHashes.join(' , ')}; res=${band})` +
    (sites.length ? ` «${sites.map(s => s.name).join(' | ')}»` : '') +
    (open.length ? `  ⟂open: ${open.join('; ')}` : '');
  return Object.freeze({ line, cell: cell.id ?? null, op: cell.op || cell.kind || null, band, sites, open });
};
