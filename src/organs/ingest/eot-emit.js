// EO: NUL(Network → Void, Clearing) — inverse renderer: log -> EOT surface
// EOT emission — the inverse of the ingester (docs/eot-surface-syntax.md, ingest/eot.js).
//
// The ingester lowers EOT surface → canonical EO tuples → the live engine log. This module
// goes the other way: it renders a reading (the live log, or a list of canonical tuples) back
// INTO EOT surface, so every reading the engine holds can be read out in the same line-oriented
// syntax a model writes. "Processed into EO into EOT" both directions, one renderer.
//
// THE DISCIPLINE, made operational here:
//
//   • Nothing inert is emitted. A line that does not change the reading does not exist on the
//     surface: an EOT line already produced is deduped, a DEF that re-asserts a value the slot
//     already holds is skipped, a SYN that re-merges an already-merged pair is skipped. The
//     surface is exactly the events that moved the reading — no ceremony, no repeats.
//
//   • Only some things fire a REC. EOT can express ONE kind of REC — the vocabulary remap
//     (§5.5, the spec's only surface-expressible REC). The engine's OTHER RECs are rule-ledger
//     and paradigm-reground events (conventions learn/defeat, helix/horizon regrounds) with no
//     remap body; those are NOT dressed up as `!rec` — they are reported as skipped, honestly,
//     never silently dropped (§9). So a `!rec` on the surface always means a real remap.
//
//   • What EOT cannot express is reported, not discarded. A held `same_as?` (the asterisk —
//     identity unestablished, no surface), a SEG retract, a verdict EVA on a merge: each is
//     skipped WITH a reason, mirroring the ingester's malformed-line diagnostic (§9). The
//     surface never claims to carry what it dropped.
//
// This is a leaf: pure functions over plain event objects, no core imports, no model.

// ── value literals (§4.5), the inverse of parseValue in eot.js ─────────────────
// A bareword that would re-parse as a number, bool, or null MUST be quoted, or the round-trip
// would change its type ("30" the string → 30 the number). Everything else with a space or a
// reserved glyph is quoted; the safe identifier-shaped rest rides bare.
const NUMBER_RE = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
const BARE_RE   = /^[A-Za-z0-9_.:\-]+$/;
const needsQuote = (s) =>
  s === '' || s === 'nil' || s === '∅' || s === 'true' || s === 'false' ||
  NUMBER_RE.test(s) || !BARE_RE.test(s);

export const valueLiteral = (v) => {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  return needsQuote(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
};

// the trailing provenance clause (§5.7): `@agent ~ts`, both optional. Emitted only when present.
const metaTrailer = (agent, ts) => {
  let out = '';
  if (agent) out += ` @${agent}`;
  if (ts) out += ` ~${ts}`;
  return out;
};

// ── canonical tuple → one EOT line (the §8.1/§8.2 inverse) ─────────────────────
// Lossless against parseEOT: the operators a line recovers to are exactly the operators it was
// emitted from. Re-designation (SIG) and the rare six take their tagged forms so an isolated
// line is unambiguous; the common INS/DEF/NUL/CON ride the core shapes.
export const tupleToEotLine = (t) => {
  if (!t || !t.op) return null;
  const o = t.operand || {};
  const meta = metaTrailer(t.agent && t.agent !== 'model:eot' ? t.agent : null, t.ts);
  switch (t.op) {
    case 'INS': return `${t.target} : ${o.type}${meta}`;
    case 'SIG': {
      // target is `${subj}.type`; a re-designation is `!sig` (or `!clm` for the claim register),
      // so it never recovers as a fresh INS when read back alone.
      const subj = String(t.target).replace(/\.type$/, '');
      const flag = o.register === 'claim' ? '!clm' : '!sig';
      return `${flag} ${subj} : ${o.designation}${meta}`;
    }
    case 'DEF': return `${t.target} = ${valueLiteral(o.value)}${meta}`;
    case 'NUL': return `${t.target} = nil${meta}`;
    case 'CON': return `${t.target} -> ${o.to} : ${o.relation}${meta}`;
    case 'SYN':
      if (o.mode === 'identity' || o.same_as) return `${t.target} == ${o.same_as}${meta}`;
      return `${t.target} <- [${(o.parts || []).join(', ')}]${meta}`;
    case 'SEG': return `${t.target} | ${o.key}${meta}`;
    case 'EVA':
      return o.from == null
        ? `!eva ${t.target} -> ${valueLiteral(o.to)}${meta}`
        : `!eva ${t.target} : ${valueLiteral(o.from)} -> ${valueLiteral(o.to)}${meta}`;
    case 'REC': return recLine(t.target, o, meta);
    default: return null;
  }
};

// `!rec` body (§5.5): set form `{a,b} => {c,d}`, or the explicit map form `=> {k:[...]}`.
const recLine = (target, o, meta) => {
  if (!o || !o.old_terms || !o.new_terms) return null;   // a non-remap REC is not surface-expressible
  if (o.mapping) {
    const pairs = Object.entries(o.mapping)
      .map(([k, v]) => `${k}:[${(Array.isArray(v) ? v : [v]).join(',')}]`)
      .join(', ');
    return `!rec ${target} => {${pairs}}${meta}`;
  }
  return `!rec ${target} {${o.old_terms.join(',')}} => {${o.new_terms.join(',')}}${meta}`;
};

// Emit a whole tuple stream (parseEOT(...).events) as EOT text, deduped.
export const tuplesToEot = (tuples) => {
  const lines = [];
  const seen = new Set();
  for (const t of tuples || []) {
    const line = tupleToEotLine(t);
    if (line == null || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines;
};

// ── the live engine log → EOT (the reading, read out) ──────────────────────────
// The log is the flat in-engine shape (ids not signs, INS split from `SIG via:'is'`, the
// pipeline's DEF/CON/SEG/EVA variants), not canonical tuples. The reading is carried by SIGNS on
// the surface (§4.4): the immutable id rides the backend, the label is what a producer reads and
// writes, so the renderer maps every id back to its label.
//
// emitEot(logOrEvents, opts) → { lines, text, skipped }
//   lines    the EOT surface, in seq order, deduped, no-ops dropped
//   text     lines.join('\n')
//   skipped  [{ seq, op, reason }] — what EOT cannot express, reported not discarded (§9)
export const emitEot = (logOrEvents, { max = Infinity } = {}) => {
  const events = Array.isArray(logOrEvents)
    ? logOrEvents
    : (typeof logOrEvents?.snapshot === 'function' ? logOrEvents.snapshot()
       : Array.isArray(logOrEvents?.events) ? logOrEvents.events : []);

  // id → label, from every INS (and the SEG-carved segment INS). The label is the sign the
  // surface speaks; an unknown id falls back to itself so nothing is rendered as a dangling code.
  const labels = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null) labels.set(e.id, e.label ?? e.id);
  const sign = (id) => labels.get(id) ?? String(id);

  // Retractions (SEG kind:'retract') undo a referenced event — the retracted event is not part
  // of the reading, so it does not reach the surface (mirrors project.js's first pass).
  const retracted = new Set();
  for (const e of events) if (e.op === 'SEG' && e.kind === 'retract' && e.refSeq != null) retracted.add(e.refSeq);

  const lines = [];
  const seen = new Set();
  const skipped = [];
  const props = new Map();          // id → { field → value }, for the DEF no-op skip
  const parent = new Map();         // DSU, for the SYN re-merge no-op skip
  const find = (x) => { let p = parent.get(x) ?? x; while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p; return p; };

  const skip = (e, reason) => skipped.push({ seq: e.seq, op: e.op, reason });
  const push = (line) => {
    if (line == null || seen.has(line)) return;       // deduped — an already-stated line is inert
    seen.add(line);
    lines.push(line);
  };

  for (const e of events) {
    if (lines.length >= max) break;
    if (retracted.has(e.seq)) continue;
    const meta = metaTrailer(e.agent && e.agent !== 'model:eot' ? e.agent : null, e.ts);

    switch (e.op) {
      case 'INS':
        // Existence alone carries no surface line — it is re-minted on first reference, and an
        // is-a/type arrives as its own `SIG via:'is'`. A bare INS that changes nothing in the
        // reading produces nothing on the surface (the directive, exactly).
        break;

      case 'SIG': {
        const subj = sign(e.src);
        if (e.via === 'is') {
          // a type / re-designation — IS-A. The FIRST recovers to INS, a LATER to SIG (§7.2).
          push(`${subj} : ${e.tgt}${meta}`);
        } else {
          // projectGraph folds a non-`is` SIG as a relation edge, exactly like CON — so render
          // it as the LINK that reproduces that same edge on read-back (the reading is the edge).
          push(`${subj} -> ${sign(e.tgt)} : ${e.via}${meta}`);
        }
        break;
      }

      case 'DEF': {
        if (e.kind === 'void') { skip(e, 'identity/relation void — not a path assign'); break; }
        const id = e.id ?? e.src;
        const field = e.key ?? e.via ?? 'value';
        const value = e.value !== undefined ? e.value : e.tgt;
        const cur = props.get(id);
        if (cur && Object.prototype.hasOwnProperty.call(cur, field) && cur[field] === value) {
          skip(e, 'redundant DEF — slot already holds this value');     // no-op: does not change the reading
          break;
        }
        props.set(id, { ...(cur || {}), [field]: value });
        const path = e.kind === 'meta' ? id : `${sign(id)}.${field}`;   // meta ids are already path-shaped
        push(`${path} = ${valueLiteral(value)}${meta}`);
        break;
      }

      case 'NUL': {
        if (e.kind === 'chrome') { skip(e, 'chrome/frame drop — not a slot absence'); break; }
        const id = e.id ?? e.src;
        const field = e.key ?? e.via ?? 'value';
        push(`${sign(id)}.${field} = nil${meta}`);
        break;
      }

      case 'CON': {
        const neg = e.polarity === '−' ? 'not-' : '';
        push(`${sign(e.src)} -> ${sign(e.tgt)} : ${neg}${e.via}${meta}`);
        break;
      }

      case 'SYN': {
        if (e.kind === 'same_as?') { skip(e, 'held identity candidate (asterisk) — no surface for unestablished identity'); break; }
        if (Array.isArray(e.parts)) {
          push(`${sign(e.src ?? e.promotes)} <- [${e.parts.map(sign).join(', ')}]${meta}`);
          break;
        }
        const a = e.from ?? e.src, b = e.to ?? e.tgt ?? e.alias;
        if (a == null || b == null) { skip(e, 'SYN with no resolvable endpoints'); break; }
        if (find(a) === find(b)) { skip(e, 'redundant SYN — pair already merged'); break; }   // no-op
        parent.set(find(a), find(b));
        push(`${sign(a)} == ${sign(b)}${meta}`);
        break;
      }

      case 'SEG': {
        if (e.kind === 'retract') break;                          // the retraction itself carries no surface
        const key = e.key ?? (e.seg != null ? sign(e.seg) : null);
        if (key == null) { skip(e, 'SEG with no partition key'); break; }
        push(`${sign(e.src)} | ${key}${meta}`);
        break;
      }

      case 'EVA': {
        // A judgment on a path transition (`from -> to`) is the surface-expressible EVA. A verdict
        // on a merge/attr/identity (site set, no from/to) lives in the ledger, not the surface.
        if (e.from === undefined && e.to === undefined) { skip(e, `verdict EVA (site:${e.site ?? '?'}) — a ledger judgment, not a transition`); break; }
        const id = e.id ?? e.src;
        const field = e.via ?? 'state';
        push(e.from == null
          ? `!eva ${sign(id)}.${field} -> ${valueLiteral(e.to)}${meta}`
          : `!eva ${sign(id)}.${field} : ${valueLiteral(e.from)} -> ${valueLiteral(e.to)}${meta}`);
        break;
      }

      case 'REC': {
        const line = recLine(e.target, e, meta);
        if (line == null) { skip(e, 'rule-ledger / paradigm REC — only a vocabulary remap is surface-expressible (§5.5)'); break; }
        push(line);
        break;
      }

      default:
        skip(e, `no EOT surface for op ${e.op}`);
    }
  }

  return Object.freeze({ lines, text: lines.join('\n'), skipped });
};

// Convenience: just the surface text.
export const eotText = (logOrEvents, opts) => emitEot(logOrEvents, opts).text;
