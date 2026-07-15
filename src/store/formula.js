// EO: EVA·DEF·REC(Lens → Paradigm, Binding,Composing) — formula + rollup engine
//
// An Airtable-dialect formula evaluator for computed columns, plus rollups that
// aggregate across a foreign-key relation. Field references are {Bracketed};
// expressions are tokenized and parsed to an AST and walked — never eval()'d, so
// a formula string is untrusted-safe. Pure, no DOM.
//
//   evaluate("{Qty} * {Unit Price}", { record })       → { ok, value, error }
//   evaluateRollup({ via:'line', field:'total', fn:'sum' }, { record, connections, rowsById })

import { recordLabel } from './rows.js';

// ── coercion shared by every function ────────────────────────────────────────
function num(v) {
  if (typeof v === 'number') return v;
  if (v === undefined || v === null || v === '' || v === false) return 0;
  if (v === true) return 1;
  const n = parseFloat(String(v).replace(/[^0-9.eE+-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}
function truthy(v) {
  if (v === undefined || v === null) return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return !!v;
}
function stringify(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
const flatten = (arr) => (Array.isArray(arr) ? arr.flat(Infinity) : [arr]);
const isBlank = (v) => v === undefined || v === null || v === '';

class FormulaError extends Error {}
const fail = (msg) => { throw new FormulaError(msg); };

// ── date helpers ─────────────────────────────────────────────────────────────
const toDate = (v) => {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  const t = Date.parse(v);
  return Number.isNaN(t) ? fail('bad date') : new Date(t);
};
const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
const DATE_UNIT_MS = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000, weeks: 604800000 };
function dateAdd(d, amount, unit = 'days') {
  const date = toDate(d), a = num(amount);
  if (unit === 'months') { const r = new Date(date); r.setMonth(r.getMonth() + a); return r; }
  if (unit === 'years') { const r = new Date(date); r.setFullYear(r.getFullYear() + a); return r; }
  return new Date(date.getTime() + a * (DATE_UNIT_MS[unit] || DATE_UNIT_MS.days));
}
function dateFormat(d, fmt = 'YYYY-MM-DD') {
  const x = toDate(d);
  const map = {
    YYYY: x.getFullYear(), YY: pad(x.getFullYear() % 100), MM: pad(x.getMonth() + 1), M: x.getMonth() + 1,
    DD: pad(x.getDate()), D: x.getDate(), HH: pad(x.getHours()), H: x.getHours(),
    mm: pad(x.getMinutes()), m: x.getMinutes(), ss: pad(x.getSeconds()), s: x.getSeconds(),
  };
  return fmt.replace(/YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s/g, (t) => map[t]);
}
const DIFF_MS = { ...DATE_UNIT_MS, months: 2629800000, years: 31557600000 };
function dateDiff(a, b, unit = 'days') {
  const d = toDate(a).getTime() - toDate(b).getTime();
  return Math.trunc(d / (DIFF_MS[unit] || DIFF_MS.days));
}

// ── the function library ─────────────────────────────────────────────────────
const FUNCS = {
  // numeric
  SUM: (...a) => flatten(a).reduce((s, v) => s + num(v), 0),
  AVG: (...a) => { const f = flatten(a); return f.length ? f.reduce((s, v) => s + num(v), 0) / f.length : 0; },
  AVERAGE: (...a) => FUNCS.AVG(...a),
  MIN: (...a) => Math.min(...flatten(a).map(num)),
  MAX: (...a) => Math.max(...flatten(a).map(num)),
  COUNT: (...a) => flatten(a).filter((v) => !isBlank(v) && !Number.isNaN(parseFloat(v))).length,
  COUNTA: (...a) => flatten(a).filter((v) => !isBlank(v)).length,
  COUNTALL: (...a) => flatten(a).length,
  ROUND: (n, d = 0) => { const p = 10 ** num(d); return Math.round(num(n) * p) / p; },
  ROUNDUP: (n, d = 0) => { const p = 10 ** num(d); return Math.ceil(num(n) * p) / p; },
  ROUNDDOWN: (n, d = 0) => { const p = 10 ** num(d); return Math.trunc(num(n) * p) / p; },
  ABS: (n) => Math.abs(num(n)),
  FLOOR: (n, sig = 1) => Math.floor(num(n) / num(sig)) * num(sig),
  CEIL: (n) => Math.ceil(num(n)),
  CEILING: (n, sig = 1) => Math.ceil(num(n) / num(sig)) * num(sig),
  INT: (n) => Math.trunc(num(n)),
  EVEN: (n) => { const v = num(n); const c = Math.ceil(Math.abs(v)); return (v < 0 ? -1 : 1) * (c % 2 ? c + 1 : c); },
  ODD: (n) => { const v = num(n); const c = Math.ceil(Math.abs(v)); return (v < 0 ? -1 : 1) * (c % 2 ? c : c + 1); },
  POW: (a, b) => num(a) ** num(b),
  POWER: (a, b) => num(a) ** num(b),
  SQRT: (n) => Math.sqrt(num(n)),
  EXP: (n) => Math.exp(num(n)),
  LOG: (n, base) => base === undefined ? Math.log10(num(n)) : Math.log(num(n)) / Math.log(num(base)),
  MOD: (a, b) => num(a) % num(b),
  VALUE: (v) => { const m = String(stringify(v)).match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0; },

  // logic
  AND: (...a) => a.every(truthy),
  OR: (...a) => a.some(truthy),
  XOR: (...a) => a.reduce((acc, v) => acc !== truthy(v), false),
  NOT: (a) => !truthy(a),
  TRUE: () => true,
  FALSE: () => false,
  BLANK: (v) => isBlank(v),
  ERROR: (m) => fail(stringify(m) || 'ERROR'),
  SWITCH: (expr, ...pairs) => {
    for (let i = 0; i + 1 < pairs.length; i += 2) if (expr === pairs[i]) return pairs[i + 1];
    return pairs.length % 2 ? pairs[pairs.length - 1] : '';
  },

  // string
  CONCAT: (...a) => a.map(stringify).join(''),
  CONCATENATE: (...a) => a.map(stringify).join(''),
  LEN: (s) => stringify(s).length,
  LOWER: (s) => stringify(s).toLowerCase(),
  UPPER: (s) => stringify(s).toUpperCase(),
  TRIM: (s) => stringify(s).trim(),
  LEFT: (s, n) => stringify(s).slice(0, num(n)),
  RIGHT: (s, n) => { const str = stringify(s); return str.slice(str.length - num(n)); },
  MID: (s, start, len) => stringify(s).substr(Math.max(0, num(start) - 1), num(len)),
  FIND: (needle, hay, start = 0) => stringify(hay).indexOf(stringify(needle), num(start)) + 1,
  SEARCH: (needle, hay, start = 0) => { const i = stringify(hay).toLowerCase().indexOf(stringify(needle).toLowerCase(), num(start)); return i < 0 ? '' : i + 1; },
  SUBSTITUTE: (s, find, rep, index) => {
    const str = stringify(s), f = stringify(find);
    if (index === undefined) return str.split(f).join(stringify(rep));
    let n = 0; return str.replace(new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (m) => (++n === num(index) ? stringify(rep) : m));
  },
  REPLACE: (s, start, count, rep) => { const str = stringify(s); const i = num(start) - 1; return str.slice(0, i) + stringify(rep) + str.slice(i + num(count)); },
  REPT: (s, n) => stringify(s).repeat(Math.max(0, num(n))),
  T: (v) => (typeof v === 'string' ? v : ''),
  EXACT: (a, b) => stringify(a) === stringify(b),
  ENCODE_URL_COMPONENT: (s) => encodeURIComponent(stringify(s)),

  // regex
  REGEX_MATCH: (s, p) => { try { return new RegExp(p).test(stringify(s)); } catch { return false; } },
  REGEX_EXTRACT: (s, p) => { try { const m = stringify(s).match(new RegExp(p)); return m ? m[0] : ''; } catch { return ''; } },
  REGEX_REPLACE: (s, p, r) => { try { return stringify(s).replace(new RegExp(p, 'g'), stringify(r)); } catch { return stringify(s); } },

  // array
  ARRAYJOIN: (arr, sep = ',') => flatten([arr]).map(stringify).join(stringify(sep)),
  ARRAYCOMPACT: (...a) => flatten(a).filter((v) => !isBlank(v)),
  ARRAYFLATTEN: (...a) => flatten(a),
  ARRAYUNIQUE: (...a) => Array.from(new Set(flatten(a))),

  // date
  TODAY: () => dateFormat(new Date(), 'YYYY-MM-DD'),
  NOW: () => new Date().toISOString(),
  YEAR: (d) => toDate(d).getFullYear(),
  MONTH: (d) => toDate(d).getMonth() + 1,
  DAY: (d) => toDate(d).getDate(),
  HOUR: (d) => toDate(d).getHours(),
  MINUTE: (d) => toDate(d).getMinutes(),
  SECOND: (d) => toDate(d).getSeconds(),
  WEEKDAY: (d) => toDate(d).getDay(),
  DATEADD: (d, amount, unit) => dateAdd(d, amount, unit).toISOString(),
  DATESTR: (d) => dateFormat(d, 'YYYY-MM-DD'),
  TIMESTR: (d) => dateFormat(d, 'HH:mm:ss'),
  DATETIME_FORMAT: (d, fmt) => dateFormat(d, fmt),
  DATETIME_PARSE: (s) => { const t = Date.parse(s); return Number.isNaN(t) ? null : new Date(t).toISOString(); },
  DATETIME_DIFF: (a, b, unit) => dateDiff(a, b, unit),
  IS_BEFORE: (a, b) => toDate(a).getTime() < toDate(b).getTime(),
  IS_AFTER: (a, b) => toDate(a).getTime() > toDate(b).getTime(),
  IS_SAME: (a, b, unit = 'milliseconds') => {
    const x = toDate(a), y = toDate(b);
    if (unit === 'year') return x.getFullYear() === y.getFullYear();
    if (unit === 'month') return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth();
    if (unit === 'day') return dateFormat(x, 'YYYY-MM-DD') === dateFormat(y, 'YYYY-MM-DD');
    return x.getTime() === y.getTime();
  },
  WEEKNUM: (d) => { const x = toDate(d); const start = new Date(x.getFullYear(), 0, 1); return Math.ceil(((x - start) / 86400000 + start.getDay() + 1) / 7); },
  FROMNOW: (d) => String(Math.abs(dateDiff(new Date(), d, 'days'))),
  TONOW: (d) => String(Math.abs(dateDiff(new Date(), d, 'days'))),
  SET_TIMEZONE: (d) => d,
  SET_LOCALE: (d) => d,
};

const CONSTS = { VOID: null, PI: Math.PI, E: Math.E };
const NULLARY = new Set(['TRUE', 'FALSE', 'NOW', 'TODAY', 'RECORD_ID', 'CREATED_TIME', 'LAST_MODIFIED_TIME']);

// ── tokenizer ────────────────────────────────────────────────────────────────
function tokenize(src) {
  const toks = [];
  let i = 0;
  const two = new Set(['==', '!=', '<=', '>=', '&&', '||']);
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    if (ch === '"' || ch === "'") {
      const q = ch; let s = ''; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') { s += src[i + 1]; i += 2; } else s += src[i++]; }
      i++; toks.push({ t: 'str', v: s }); continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1]))) {
      let s = ''; let dot = false;
      while (i < src.length && (/[0-9]/.test(src[i]) || (src[i] === '.' && !dot))) { if (src[i] === '.') dot = true; s += src[i++]; }
      toks.push({ t: 'num', v: parseFloat(s) }); continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let s = '';
      while (i < src.length && /[A-Za-z0-9_$]/.test(src[i])) s += src[i++];
      toks.push({ t: 'id', v: s }); continue;
    }
    const pair = src.slice(i, i + 2);
    if (two.has(pair)) { toks.push({ t: 'op', v: pair }); i += 2; continue; }
    if ('+-*/%<>!&(),='.includes(ch)) { toks.push({ t: 'op', v: ch }); i++; continue; }
    fail(`unexpected character: ${ch}`);
  }
  return toks;
}

// ── parser (precedence-climbing) ─────────────────────────────────────────────
const BIN = [['||'], ['&&'], ['==', '=', '!=', '<', '<=', '>', '>='], ['+', '-', '&'], ['*', '/', '%']];

function parse(toks) {
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  const expect = (v) => { const t = next(); if (!t || t.v !== v) fail(`expected ${v}`); };

  function parseBin(level) {
    if (level >= BIN.length) return parseUnary();
    let left = parseBin(level + 1);
    while (peek() && peek().t === 'op' && BIN[level].includes(peek().v)) {
      const op = next().v;
      const right = parseBin(level + 1);
      left = { type: 'bin', op, left, right };
    }
    return left;
  }
  function parseUnary() {
    const t = peek();
    if (t && t.t === 'op' && (t.v === '!' || t.v === '-' || t.v === '+')) { next(); return { type: 'un', op: t.v, arg: parseUnary() }; }
    return parseAtom();
  }
  function parseAtom() {
    const t = next();
    if (!t) fail('unexpected end of formula');
    if (t.t === 'num') return { type: 'num', v: t.v };
    if (t.t === 'str') return { type: 'str', v: t.v };
    if (t.v === '(') { const e = parseBin(0); expect(')'); return e; }
    if (t.t === 'id') {
      if (peek() && peek().v === '(') {
        next(); const args = [];
        if (peek() && peek().v !== ')') { args.push(parseBin(0)); while (peek() && peek().v === ',') { next(); args.push(parseBin(0)); } }
        expect(')');
        return { type: 'call', name: t.v, args };
      }
      return { type: 'id', name: t.v };
    }
    fail(`unexpected token: ${t.v}`);
  }

  const ast = parseBin(0);
  if (pos < toks.length) fail('trailing tokens in formula');
  return ast;
}

// ── evaluator ────────────────────────────────────────────────────────────────
function makeEnv(ctx) {
  const record = ctx.record || {};
  const env = {
    __f: (name) => record[name],
    RECORD_ID: () => record._id ?? record._anchor ?? null,
    CREATED_TIME: () => record._created ?? null,
    LAST_MODIFIED_TIME: () => record._updated ?? record._created ?? null,
  };
  return env;
}

function evalNode(node, env) {
  switch (node.type) {
    case 'num': return node.v;
    case 'str': return node.v;
    case 'id': {
      const name = node.name;
      if (name in CONSTS || name.toUpperCase() in CONSTS) return CONSTS[name] ?? CONSTS[name.toUpperCase()];
      if (name in env) return env[name]();
      const up = name.toUpperCase();
      if (NULLARY.has(up) && (up in FUNCS || up in env)) return (env[up] || FUNCS[up])();
      fail(`unknown name: ${name}`);
      break;
    }
    case 'un': {
      if (node.op === '!') return !truthy(evalNode(node.arg, env));
      if (node.op === '-') return -num(evalNode(node.arg, env));
      return +num(evalNode(node.arg, env));
    }
    case 'bin': {
      const op = node.op;
      if (op === '&&') { const l = evalNode(node.left, env); return truthy(l) ? evalNode(node.right, env) : l; }
      if (op === '||') { const l = evalNode(node.left, env); return truthy(l) ? l : evalNode(node.right, env); }
      const l = evalNode(node.left, env), r = evalNode(node.right, env);
      switch (op) {
        case '+': return (typeof l === 'string' || typeof r === 'string') ? stringify(l) + stringify(r) : num(l) + num(r);
        case '&': return stringify(l) + stringify(r);
        case '-': return num(l) - num(r);
        case '*': return num(l) * num(r);
        case '/': return num(l) / num(r);
        case '%': return num(l) % num(r);
        case '==': case '=': return l === r;
        case '!=': return l !== r;
        case '<': return num(l) < num(r);
        case '<=': return num(l) <= num(r);
        case '>': return num(l) > num(r);
        case '>=': return num(l) >= num(r);
        default: fail(`bad operator ${op}`);
      }
      break;
    }
    case 'call': {
      const raw = node.name;
      const name = raw.toUpperCase();
      // lazy special forms
      if (name === 'IF') { return truthy(evalNode(node.args[0], env)) ? evalNode(node.args[1], env) : (node.args[2] ? evalNode(node.args[2], env) : ''); }
      if (name === 'ISERROR') { try { const v = evalNode(node.args[0], env); return typeof v === 'number' && !Number.isFinite(v); } catch { return true; } }
      if (name === 'IFERROR') { try { const v = evalNode(node.args[0], env); if (typeof v === 'number' && !Number.isFinite(v)) return evalNode(node.args[1], env); return v; } catch { return evalNode(node.args[1], env); } }
      // env holds the record-bound accessors (__f, RECORD_ID, …) case-sensitively;
      // the FUNCS library is case-insensitive (uppercase).
      const fn = env[raw] || FUNCS[name] || env[name];
      if (!fn) fail(`unknown function: ${node.name}`);
      return fn(...node.args.map((a) => evalNode(a, env)));
    }
    default: fail('bad node');
  }
}

/** Evaluate a formula string against a record. Returns { ok, value, error }. */
export function evaluate(expr, ctx = {}) {
  try {
    const src = String(expr).replace(/\{([^}]+)\}/g, (_, name) => `__f(${JSON.stringify(name.trim())})`);
    const ast = parse(tokenize(src));
    const value = evalNode(ast, makeEnv(ctx));
    if (typeof value === 'number' && !Number.isFinite(value)) return { ok: false, error: 'non-finite result' };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// ── rollups: aggregate across a foreign-key relation ─────────────────────────
export const ROLLUP_FNS = Object.freeze(['sum', 'count', 'avg', 'min', 'max', 'list', 'concat', 'and', 'or']);

/**
 * Evaluate a rollup for a record: follow every `via` connection to its linked
 * rows, then aggregate `field` across them.
 *   cfg = { via, field?, fn }
 *   ctx = { record, connections, rowsById }
 */
export function evaluateRollup(cfg = {}, ctx = {}) {
  const { via, field } = cfg;
  const fn = cfg.fn || 'count';
  if (!via) return { ok: false, error: 'rollup needs a via relation' };
  const record = ctx.record || {};
  const id = record._id ?? record._anchor;
  const rowsById = ctx.rowsById;

  const linked = [];
  for (const c of ctx.connections || []) {
    if (c.type !== via) continue;
    const other = c.source === id ? c.target : c.target === id ? c.source : null;
    if (other == null) continue;
    const e = rowsById ? rowsById.get(other) : null;
    if (e && !e._removed) linked.push(e);
  }

  try {
    if (fn === 'count') return { ok: true, value: linked.length };
    if (fn === 'list') {
      const vals = field ? flatten(linked.map((e) => e[field])) : linked.map(recordLabel);
      return { ok: true, value: vals.filter((v) => !isBlank(v)).map(stringify).join(', ') };
    }
    if (!field && fn !== 'count') return { ok: false, error: `rollup needs field for fn=${fn}` };
    const raw = linked.map((e) => e[field]);
    if (fn === 'concat') return { ok: true, value: raw.filter((v) => !isBlank(v)).map(stringify).join(', ') };
    if (fn === 'and') return { ok: true, value: raw.every(truthy) };
    if (fn === 'or') return { ok: true, value: raw.some(truthy) };
    const nums = raw.map(num).filter((n) => Number.isFinite(n));
    if (fn === 'sum') return { ok: true, value: nums.reduce((a, b) => a + b, 0) };
    if (fn === 'avg') return { ok: true, value: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0 };
    if (!nums.length) return { ok: false, error: 'no values' };
    if (fn === 'min') return { ok: true, value: Math.min(...nums) };
    if (fn === 'max') return { ok: true, value: Math.max(...nums) };
    return { ok: false, error: `unknown rollup fn: ${fn}` };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export const FUNCTIONS = Object.freeze(Object.keys(FUNCS));
