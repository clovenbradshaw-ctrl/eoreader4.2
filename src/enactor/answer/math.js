// EO: EVA·DEF(Void → Lens, Binding,Dissecting) — the math answerer (math.js)
// The math answerer — math.js, wired in for responding to math problems.
//
// This is the one mechanical short-circuit the engine keeps live. The rest were
// retired (answer/mechanical.js header, turn/stages.js `route`) because they shipped
// confident, UNGROUNDED claims past the veto/fact-check layer — the load-bearing harm
// being "when was this written?" answering a Project Gutenberg release date as if it
// were the work's composition. Arithmetic is the opposite case: the answer is provably
// correct, independent of any document, so there is nothing for the grounding layer to
// adjudicate. `2 + 2 = 4` is true whether or not a file is loaded, so it terminates at
// the route and never warms the model.
//
// Two engines, one contract:
//   • In the BROWSER, math.js (mathjs, loaded from the same jsdelivr CDN the model
//     backends use) is the primary evaluator — it covers far more than arithmetic
//     (big numbers, implicit multiplication, a deep function library).
//   • Offline / in Node tests (where the CDN import is unavailable), a small,
//     dependency-free recursive-descent evaluator (evalExpression) computes the same
//     answer. No `eval`/`Function` — the expression is parsed, never executed as code.
//
// The GATE is strict on purpose: only a question that reduces to a pure math expression
// short-circuits. Anything carrying real words ("what happened in chapter 2") fails the
// whitelist and falls straight through to the grounded/chat turn, byte-identical.

// ── the allowed surface ────────────────────────────────────────────────────
// Function names and constants the gate admits. Anything else parsed as an identifier
// makes the whole question NOT a math query — so "2 apples" or "log of the chapter"
// never short-circuit. Kept aligned with what evalExpression and mathjs both know.
const CONSTS = {
  pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2,
};
const factorial = (n) => {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
};
const FUNCS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, log: Math.log, log10: Math.log10, log2: Math.log2,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sign: Math.sign, trunc: Math.trunc, factorial,
  // variadic / multi-argument
  pow: (a, b) => Math.pow(a, b),
  min: (...a) => Math.min(...a), max: (...a) => Math.max(...a),
  hypot: (...a) => Math.hypot(...a),
  atan2: (a, b) => Math.atan2(a, b),
  mod: (a, b) => a % b,
  nthRoot: (a, n) => (n == null ? Math.sqrt(a) : Math.sign(a) * Math.pow(Math.abs(a), 1 / n)),
  gcd: (...a) => a.map((x) => Math.abs(Math.round(x))).reduce((x, y) => { while (y) { [x, y] = [y, x % y]; } return x; }),
  lcm: (...a) => a.map((x) => Math.abs(Math.round(x))).reduce((x, y) => (x && y ? (x / (((p) => { while (p[1]) { [p[0], p[1]] = [p[1], p[0] % p[1]]; } return p[0]; })([x, y])) * y) : 0)),
};
const ALLOWED_NAMES = new Set([...Object.keys(FUNCS), ...Object.keys(CONSTS)]);

// A leading politeness/imperative the question may wrap the expression in. Stripped so
// "what is 2+2?" and "calculate 2+2" both reduce to the bare expression "2+2".
const PREFIX = /^(?:please\s+)?(?:what(?:'s|\s+is|\s+are|\s+does|\s+would)?\s+|how\s+(?:much|many)\s+(?:is|are)\s+|calculate\s+|compute\s+|evaluate\s+|eval\s+|solve\s+|work\s+out\s+|the\s+(?:value|answer|result)\s+(?:of|to|is)\s+|=\s*)/i;
const SUFFIX = /(?:\s*=\s*|\s*\?|\s*please|\s*\.)*$/i;

// Only these characters may appear in a math expression (after identifiers are checked
// against ALLOWED_NAMES). A stray letter, quote, or word makes it not-a-math-query.
const ALLOWED_CHARS = /^[0-9a-zA-Z_.,+\-*/^%()!\s]*$/;
// At least one genuine OPERATION must be present — a bare number ("42") or a lone name
// ("pi") is not a "math problem" to answer here. Binary operators, factorial, or a
// function call all count; a binary minus (digit/paren/name on its left) counts too.
const HAS_OP = /[+*/^%!]|(?:[\d).a-zA-Z]\s*-\s*[\d(.a-zA-Z])/;

// Reduce a question to a pure math expression, or null if it is not one. Pure and cheap
// (regex only) — this is the gate the route stage runs on every turn before doing any work.
export const extractExpression = (question) => {
  let s = String(question || '').trim();
  if (!s) return null;
  s = s.replace(PREFIX, '').replace(SUFFIX, '').trim();
  if (!s || !/\d/.test(s)) return null;                 // needs at least one number
  if (!ALLOWED_CHARS.test(s)) return null;              // any disallowed character → not math
  const ids = s.match(/[a-zA-Z_]\w*/g) || [];
  for (const id of ids) if (!ALLOWED_NAMES.has(id.toLowerCase())) return null;  // unknown word → not math
  const hasFunc = ids.some((id) => id.toLowerCase() in FUNCS);
  if (!hasFunc && !HAS_OP.test(s)) return null;         // no operation → nothing to compute
  return s;
};

export const isMathQuery = (question) => extractExpression(question) != null;

// ── the offline evaluator ──────────────────────────────────────────────────
// A safe recursive-descent calculator. Tokenises then parses; never executes the input
// as code. Returns a finite number, or null on any malformed / non-numeric expression.
//
// Grammar (precedence low→high):
//   expr    := term  (('+' | '-') term)*
//   term    := unary (('*' | '/' | '%') unary)*
//   unary   := ('+' | '-') unary | power
//   power   := postfix ('^' unary)?        // right-associative; exponent may be unary (2^-3)
//   postfix := primary ('!')*              // factorial
//   primary := number | const | func '(' args ')' | '(' expr ')'
const tokenize = (s) => {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.eE]/.test(s[j])) {
        // allow a signed exponent (1e-3) but not a stray sign elsewhere
        if ((s[j] === 'e' || s[j] === 'E') && (s[j + 1] === '+' || s[j + 1] === '-')) j++;
        j++;
      }
      const num = Number(s.slice(i, j));
      if (!Number.isFinite(num)) throw new Error('bad number');
      out.push({ t: 'num', v: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z_0-9]/.test(s[j])) j++;
      out.push({ t: 'name', v: s.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ('+-*/^%(),!'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error('bad char');
  }
  return out;
};

const parse = (tokens) => {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (v) => {
    const tk = tokens[pos];
    if (!tk || (v != null && tk.v !== v)) throw new Error('parse error');
    pos++;
    return tk;
  };

  const parseExpr = () => {
    let left = parseTerm();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = eat().v;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  const parseTerm = () => {
    let left = parseUnary();
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/' || peek().v === '%')) {
      const op = eat().v;
      const right = parseUnary();
      left = op === '*' ? left * right : op === '/' ? left / right : left % right;
    }
    return left;
  };
  const parseUnary = () => {
    if (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = eat().v;
      const v = parseUnary();
      return op === '-' ? -v : v;
    }
    return parsePower();
  };
  const parsePower = () => {
    const base = parsePostfix();
    if (peek() && peek().t === 'op' && peek().v === '^') {
      eat('^');
      return Math.pow(base, parseUnary());   // right-assoc, exponent can be unary
    }
    return base;
  };
  const parsePostfix = () => {
    let v = parsePrimary();
    while (peek() && peek().t === 'op' && peek().v === '!') {
      eat('!');
      v = factorial(v);
    }
    return v;
  };
  const parsePrimary = () => {
    const tk = peek();
    if (!tk) throw new Error('unexpected end');
    if (tk.t === 'num') { eat(); return tk.v; }
    if (tk.t === 'op' && tk.v === '(') {
      eat('(');
      const v = parseExpr();
      eat(')');
      return v;
    }
    if (tk.t === 'name') {
      eat();
      if (tk.v in CONSTS) return CONSTS[tk.v];
      const fn = FUNCS[tk.v];
      if (!fn) throw new Error('unknown name');
      eat('(');
      const args = [parseExpr()];
      while (peek() && peek().t === 'op' && peek().v === ',') { eat(','); args.push(parseExpr()); }
      eat(')');
      return fn(...args);
    }
    throw new Error('parse error');
  };

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error('trailing input');
  return result;
};

export const evalExpression = (expr) => {
  try {
    const v = parse(tokenize(String(expr)));
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
};

// ── math.js (mathjs) — the browser's primary engine ─────────────────────────
// Loaded lazily from the CDN the same way the model backends are (src/model/*). Cached
// after the first attempt; in Node / offline the import throws and we cache `null`, so the
// built-in evaluator carries the load and tests never touch the network.
const MATHJS_URL = 'https://cdn.jsdelivr.net/npm/mathjs@14/+esm';
let _mathjs;            // undefined = not tried, null = unavailable, object = loaded
export const loadMathjs = async () => {
  if (_mathjs !== undefined) return _mathjs;
  try {
    const mod = await import(/* @vite-ignore */ MATHJS_URL);
    const evaluate = mod.evaluate || mod.default?.evaluate;
    _mathjs = typeof evaluate === 'function' ? { evaluate } : null;
  } catch {
    _mathjs = null;
  }
  return _mathjs;
};

// Evaluate a (pre-extracted) expression: mathjs first when available, the built-in
// evaluator otherwise or as a fallback. Returns a finite number or null.
export const evaluateMath = async (expr) => {
  const mj = await loadMathjs();
  if (mj) {
    try {
      const v = mj.evaluate(expr);
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    } catch { /* fall through to the built-in evaluator */ }
  }
  return evalExpression(expr);
};

// ── formatting & the answer shape ───────────────────────────────────────────
// Trim binary-float noise without lying about the value: integers print whole, and a
// fractional result is rounded to 12 significant digits with trailing zeros dropped.
export const formatNumber = (v) => {
  if (Number.isInteger(v)) return String(v);
  let s = v.toPrecision(12);
  if (s.includes('.') && !s.includes('e') && !s.includes('E')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return String(Number(s));
};

// ── the computation record ──────────────────────────────────────────────────
// A computed figure should be auditable, not a bare number: which engine, the
// full expression, and each operation with its operands and running value
// ("sqrt(16) = 4", then "4 × 3 = 12"). Built on the SAME safe grammar as the
// evaluator — an AST is produced (nothing is executed as code) and folded
// bottom-up, recording each reduction as a step. Pure and dependency-free, so a
// record is available in the browser and offline alike; returns null on any
// malformed expression (the answer still stands, it simply carries no record).
const OP_SYM  = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', '%': 'mod' };
const OP_WORD = { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide', '^': 'exponent', '%': 'modulo' };

// A parallel recursive-descent that builds nodes instead of folding to a number,
// mirroring the evaluator's grammar exactly so it accepts precisely what evaluates.
const parseAst = (tokens) => {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (v) => { const tk = tokens[pos]; if (!tk || (v != null && tk.v !== v)) throw new Error('parse error'); pos++; return tk; };
  const expr = () => { let l = term(); while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) { const op = eat().v; l = { type: 'bin', op, a: l, b: term() }; } return l; };
  const term = () => { let l = unary(); while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/' || peek().v === '%')) { const op = eat().v; l = { type: 'bin', op, a: l, b: unary() }; } return l; };
  const unary = () => { if (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) { const op = eat().v; return { type: 'unary', op, a: unary() }; } return power(); };
  const power = () => { const base = postfix(); if (peek() && peek().t === 'op' && peek().v === '^') { eat('^'); return { type: 'bin', op: '^', a: base, b: unary() }; } return base; };
  const postfix = () => { let v = primary(); while (peek() && peek().t === 'op' && peek().v === '!') { eat('!'); v = { type: 'fact', a: v }; } return v; };
  const primary = () => {
    const tk = peek();
    if (!tk) throw new Error('unexpected end');
    if (tk.t === 'num') { eat(); return { type: 'num', v: tk.v }; }
    if (tk.t === 'op' && tk.v === '(') { eat('('); const v = expr(); eat(')'); return v; }
    if (tk.t === 'name') {
      eat();
      if (tk.v in CONSTS) return { type: 'const', name: tk.v };
      if (!FUNCS[tk.v]) throw new Error('unknown name');
      eat('(');
      const args = [expr()];
      while (peek() && peek().t === 'op' && peek().v === ',') { eat(','); args.push(expr()); }
      eat(')');
      return { type: 'call', name: tk.v, args };
    }
    throw new Error('parse error');
  };
  const root = expr();
  if (pos !== tokens.length) throw new Error('trailing input');
  return root;
};

// Fold the AST bottom-up, pushing a step for every non-trivial reduction.
const foldNode = (node, steps) => {
  switch (node.type) {
    case 'num': return node.v;
    case 'const': return CONSTS[node.name];
    case 'unary': { const a = foldNode(node.a, steps); return node.op === '-' ? -a : a; }
    case 'fact': { const a = foldNode(node.a, steps); const v = factorial(a); steps.push({ text: `${formatNumber(a)}! = ${formatNumber(v)}`, op: 'factorial', operands: [a], value: v }); return v; }
    case 'bin': {
      const a = foldNode(node.a, steps), b = foldNode(node.b, steps);
      const v = node.op === '+' ? a + b : node.op === '-' ? a - b : node.op === '*' ? a * b : node.op === '/' ? a / b : node.op === '%' ? a % b : Math.pow(a, b);
      steps.push({ text: `${formatNumber(a)} ${OP_SYM[node.op] || node.op} ${formatNumber(b)} = ${formatNumber(v)}`, op: OP_WORD[node.op] || node.op, operands: [a, b], value: v });
      return v;
    }
    case 'call': {
      const args = node.args.map((x) => foldNode(x, steps));
      const v = FUNCS[node.name](...args);
      steps.push({ text: `${node.name}(${args.map(formatNumber).join(', ')}) = ${formatNumber(v)}`, op: node.name, operands: args, value: v });
      return v;
    }
    default: throw new Error('bad node');
  }
};

// The leaf operands (literal numbers and named constants) in reading order.
const collectOperands = (node, out = []) => {
  if (!node) return out;
  if (node.type === 'num') out.push({ value: node.v, text: formatNumber(node.v) });
  else if (node.type === 'const') out.push({ value: CONSTS[node.name], text: node.name, name: node.name });
  else { if (node.a) collectOperands(node.a, out); if (node.b) collectOperands(node.b, out); if (node.args) node.args.forEach((x) => collectOperands(x, out)); }
  return out;
};

export const traceExpression = (expr, engine = 'math.js') => {
  try {
    const ast = parseAst(tokenize(String(expr)));
    const steps = [];
    const result = foldNode(ast, steps);
    if (typeof result !== 'number' || !Number.isFinite(result)) return null;
    const operators = [...new Set(steps.map((s) => s.op))];
    return { engine, expr: String(expr).trim(), result, resultText: formatNumber(result), steps, operators, operands: collectOperands(ast) };
  } catch {
    return null;
  }
};

// The async answerer the route stage uses — math.js (or the fallback) responds to a math
// problem. Returns the mechanical answer shape, or null when the question is not math.
export const answerMath = async (question) => {
  const expr = extractExpression(question);
  if (expr == null) return null;
  const v = await evaluateMath(expr);
  if (v == null || !Number.isFinite(v)) return null;
  const text = `${expr} = ${formatNumber(v)}`;
  return { route: 'math', text, answer: text, sources: [] };
};

// A synchronous variant (built-in evaluator only — no mathjs/network) for the legacy
// mechanical path (tryMechanical) and unit tests that want a pure, sync answer.
export const answerMathSync = (question) => {
  const expr = extractExpression(question);
  if (expr == null) return null;
  const v = evalExpression(expr);
  if (v == null || !Number.isFinite(v)) return null;
  const text = `${expr} = ${formatNumber(v)}`;
  return { route: 'math', text, answer: text, sources: [] };
};
