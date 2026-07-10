// EO: NUL·SIG(Void,Entity → Void,Atmosphere, Tending,Binding,Clearing) — EOT operation ledger (append-only)
// The EOT ledger — the running terminal of the machine, read out in EOT.
//
// docs/eot-ledger.md. The audit holon already keeps the per-turn trail
// (audit/log.js); this is its sibling at a different grain: an append-only ring
// of EVERY operation the app performs — a source read, a search, a route, a
// prompt, a generation, a citation bind, a veto — each rendered as ONE EOT
// surface line (docs/eot-surface-syntax.md), with its `@agent ~ts` provenance
// trailer and its door.
//
// Why EOT and not a plain log line: the nine operators are the vocabulary the
// whole engine already speaks (docs/operators.md). Reading emits them, the graph
// projects them, the audit records in them. The ledger is one more reading of the
// same stream — so the terminal shows the machine in the machine's own syntax,
// and the whole ledger exports as a `.eot` document that re-parses through the
// ingester with no loss. Auditable means re-runnable, not just legible.
//
// THE DOOR IS LOAD-BEARING (core/provenance.js, tests/eot.test.js). An operation
// that brings the WORLD in — reading a page, a search result — comes through the
// PERCEIVER door: exafference, it can witness. An operation the model AUTHORS —
// a route, a prompt, a generation — comes through the ENACTOR door: reafference,
// mine, and by the §8 type law it CANNOT witness. The ledger stamps the door on
// every line, so the trail never lets the model's own conjecture pass for the
// world it read. That distinction is the point of auditing a generative machine.
//
// This is a leaf: pure functions + a closure, no core imports, no DOM. The line
// renderer is the deliberate inverse of ingest/eot.js, kept in lockstep by
// tests/eot-ledger.test.js (which round-trips the export through parseEOT and
// checks the door against core's canWitness).

// ── the nine operators, the doors ─────────────────────────────────────────────
export const LEDGER_OPS = Object.freeze(['INS', 'SIG', 'DEF', 'NUL', 'CON', 'SYN', 'SEG', 'EVA', 'REC']);
export const PERCEIVER = 'perceiver';   // exafference — the world it read; CAN witness
export const ENACTOR   = 'enactor';     // reafference — the model's own act; CANNOT witness

// ── value literals (§4.5) — the inverse of parseValue, matching ingest/eot-emit.js ──
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

const metaTrailer = (agent, ts) => {
  let out = '';
  if (agent) out += ` @${agent}`;
  if (ts) out += ` ~${ts}`;
  return out;
};

// ── one record → one EOT surface line ─────────────────────────────────────────
// The tagged forms (SIG/SEG/SYN/EVA/REC) are used so an isolated ledger line is
// unambiguous when read back alone — exactly as ingest/eot-emit.js does.
export const lineOf = (rec) => {
  if (!rec || !rec.op) return null;
  const o = rec.operand || {};
  const meta = metaTrailer(rec.agent || null, rec.ts_iso || null);
  switch (rec.op) {
    case 'INS': return `${rec.target} : ${o.type}${meta}`;
    case 'SIG': return `!sig ${rec.target} : ${o.designation}${meta}`;
    case 'DEF': return `${rec.target} = ${valueLiteral(o.value)}${meta}`;
    case 'NUL': return `${rec.target} = nil${meta}`;
    case 'CON': return `${rec.target} -> ${o.to} : ${o.relation}${meta}`;
    case 'SYN':
      if (o.mode === 'identity' || o.same_as) return `${rec.target} == ${o.same_as}${meta}`;
      return `${rec.target} <- [${(o.parts || []).join(', ')}]${meta}`;
    case 'SEG': return `!seg ${rec.target} | ${o.key}${meta}`;
    case 'EVA':
      return o.from == null
        ? `!eva ${rec.target} -> ${valueLiteral(o.to)}${meta}`
        : `!eva ${rec.target} : ${valueLiteral(o.from)} -> ${valueLiteral(o.to)}${meta}`;
    case 'REC':
      return `!rec ${rec.target} {${(o.old_terms || []).join(',')}} => {${(o.new_terms || []).join(',')}}${meta}`;
    default: return null;
  }
};

// A monotone clock the caller injects (Date.now is unavailable in some hosts and
// would break replay); defaults to Date.now in the browser.
const defaultNow = () => (typeof Date !== 'undefined' ? Date.now() : 0);

// A free-text reference (a URL, a query, a claim, an entity label) is not a bare
// SIGN — the ingester's target/object position is a plain IDENT (no spaces, no
// slashes; `.` and ` : ` are structural), so a raw URL would be a diagnostic on
// read-back. We slug it to a clean, re-parseable IDENT on the surface and keep the
// verbatim in `raw`. The surface stays canonical EOT; the audit keeps the original.
export const slug = (s) => {
  const str = String(s == null ? '' : s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
  return str || 'x';
};

// ── the ledger ────────────────────────────────────────────────────────────────
export const createEotLedger = ({ capacity = 500, now = defaultNow } = {}) => {
  const records = [];
  const subscribers = new Set();
  let seq = 0;
  let overflow = 0;   // how many the ring has dropped off the front (kept honest, never silent)

  const notify = (rec) => {
    for (const fn of subscribers) { try { fn(rec, records); } catch { /* best-effort */ } }
  };

  // The one primitive. Everything else is a thin, named shape over this.
  const record = ({ op, door = ENACTOR, agent = null, target, operand = {}, kind = null, raw = null } = {}) => {
    if (!LEDGER_OPS.includes(op)) throw new TypeError(`eot-ledger: unknown op ${op}`);
    if (door !== PERCEIVER && door !== ENACTOR) throw new TypeError(`eot-ledger: unknown door ${door}`);
    const ts = now();
    const ts_iso = isoOf(ts);
    const rec = {
      seq: ++seq, ts, ts_iso,
      op, door,
      witness: door === PERCEIVER,   // the §8 type law, read off the door — never asserted twice
      agent: agent || (door === PERCEIVER ? 'reader' : 'model:local'),
      target: String(target),
      operand, kind, raw,
    };
    rec.eot = lineOf(rec);
    records.push(rec);
    while (records.length > capacity) { records.shift(); overflow++; }
    notify(rec);
    return rec;
  };

  // ── named operations — the app's verbs, each a fixed EO shape ────────────────
  // Reading (perceiver door — the world came in, it can witness):
  const read    = ({ source, title, props, agent } = {}) =>
    record({ op: 'CON', door: PERCEIVER, agent, kind: 'read',
      target: 'session', operand: { to: slug(source), relation: 'read' },
      raw: { source, title: title || null, props: props ?? null } });

  const search  = ({ query, agent } = {}) =>
    record({ op: 'CON', door: PERCEIVER, agent, kind: 'search',
      target: 'session', operand: { to: slug(query), relation: 'searched' }, raw: { query } });

  const found   = ({ urls, agent } = {}) =>
    record({ op: 'SYN', door: PERCEIVER, agent, kind: 'found',
      target: 'sources', operand: { parts: (urls || []).map(slug) }, raw: { urls: urls || [] } });

  const learned = ({ entity, type, agent } = {}) =>
    record({ op: 'INS', door: PERCEIVER, agent, kind: 'learned',
      target: slug(entity), operand: { type: type || 'Entity' }, raw: { entity } });

  // Interpretation / generation (enactor door — the model's own act, cannot witness):
  const route    = ({ turn, route, task, agent } = {}) =>
    record({ op: 'SIG', door: ENACTOR, agent, kind: 'route',
      target: `turn:${turn}`, operand: { designation: route }, raw: { task: task || null } });

  const retrieve = ({ turn, n, top, agent } = {}) =>
    record({ op: 'DEF', door: ENACTOR, agent, kind: 'retrieve',
      target: `turn:${turn}.spans`, operand: { value: n ?? 0 }, raw: { n, top: top ?? null } });

  const prompt   = ({ turn, text, agent } = {}) =>
    record({ op: 'DEF', door: ENACTOR, agent, kind: 'prompt',
      target: `turn:${turn}.prompt`, operand: { value: `${(text || '').length} chars` },
      raw: { prompt: String(text || '') } });

  const generate = ({ turn, text, ms, agent } = {}) =>
    record({ op: 'CON', door: ENACTOR, agent, kind: 'generate',
      target: `turn:${turn}`, operand: { to: 'answer', relation: 'generated' },
      raw: { output: String(text || ''), ms: ms ?? null } });

  const bind     = ({ claim, cite, score, agent } = {}) =>
    record({ op: 'CON', door: ENACTOR, agent, kind: 'bind',
      target: slug(claim), operand: { to: slug(cite), relation: 'cites' }, raw: { score: score ?? null } });

  const veto     = ({ turn, id, from = 'asserted', to = 'refused', message, agent } = {}) =>
    record({ op: 'EVA', door: ENACTOR, agent, kind: 'veto',
      target: `turn:${turn}.${id || 'claim'}`, operand: { from, to }, raw: { message: message || null } });

  const revise   = ({ turn, why, agent } = {}) =>
    record({ op: 'SEG', door: ENACTOR, agent, kind: 'revise',
      target: `turn:${turn}.draft`, operand: { key: 'superseded' }, raw: { why: why || null } });

  const note     = ({ text, door = ENACTOR, agent, op = 'SIG', target = 'session', operand } = {}) =>
    record({ op, door, agent, kind: 'note',
      target, operand: operand || { designation: shortSign(text) }, raw: { text: String(text || '') } });

  // ── export & subscribe ───────────────────────────────────────────────────────
  const snapshot = () => records.slice();

  const subscribe = (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); };

  const clear = () => { records.length = 0; notify(null); };

  // The whole ledger, read out as a `.eot` document. Comments carry the door and
  // the drop count; the LINES are canonical EOT and re-parse through parseEOT.
  const exportEot = () => {
    const head = [
      '# eot-ledger — the machine, read out in EOT (docs/eot-ledger.md)',
      `# ${records.length} operations${overflow ? ` (+${overflow} rolled off the ring)` : ''}`,
      '# door: perceiver = the world it read (witnesses) · enactor = the model\'s own act (cannot witness)',
      '',
    ];
    const body = records.map(r =>
      `${r.eot}${r.eot && !r.eot.includes('#') ? `   # ${r.door}${r.kind ? ` · ${r.kind}` : ''}` : ''}`);
    return head.concat(body).join('\n');
  };

  // The auditable trail — one JSON record per line, raw payloads (verbatim prompt
  // and output) included. This is the load-bearing artifact (docs/audit-schema.md).
  const exportJsonl = () => records.map(r => {
    try { return JSON.stringify(r); }
    catch (err) { return JSON.stringify({ seq: r.seq, op: r.op, export_error: String(err?.message || err) }); }
  }).join('\n');

  return {
    record, read, search, found, learned,
    route, retrieve, prompt, generate, bind, veto, revise, note,
    snapshot, subscribe, clear, exportEot, exportJsonl,
    get overflow() { return overflow; },
    get size() { return records.length; },
  };
};

// ── small helpers ──────────────────────────────────────────────────────────────
const isoOf = (ms) => {
  try { return new Date(ms).toISOString(); } catch { return null; }
};

// A note's free text is not a sign; keep a short, bare-safe designation for the
// EOT line and stash the full text in raw.
const shortSign = (text) => {
  const s = String(text == null ? '' : text).replace(/\s+/g, '-').replace(/[^A-Za-z0-9_.:\-]/g, '').slice(0, 40);
  return s || 'note';
};
