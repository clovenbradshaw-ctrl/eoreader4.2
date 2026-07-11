// The analyzer's false-positive floor — a battery of legal-but-tricky JS/ES idioms that
// must NOT raise an error-grade finding (src/organs/code/facts.js). A linter earns trust
// by what it stays silent about; this is the "broaden the tests" pass that pins the
// silence. Each idiom below has, at some point, been a false-positive risk for a
// heuristic (non-CST) reader; every one now reads clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCodebase } from '../src/organs/code/index.js';

const clean = (label, src) => test(`no false positive: ${label}`, () => {
  const r = readCodebase([{ path: `${label.replace(/\W+/g, '_')}.js`, text: src }], { doc: false });
  const errs = r.issues.filter((f) => f.severity === 'error');
  assert.equal(errs.length, 0,
    `${label} should read clean:\n${errs.map((f) => `  ${f.line}:${f.col} ${f.law} ${f.name} — ${f.message}`).join('\n')}`);
});

clean('optional chaining and nullish coalescing', `
export const f = (o) => o?.a?.b?.(1) ?? fallback(o);
const fallback = (o) => o ?? {};`);

clean('async generators and for-await-of', `
export async function* gen(items) {
  for await (const it of items) { yield it * 2; }
}`);

clean('tagged template literals', `
const tag = (strings, ...values) => strings.join('|') + values.length;
const x = 1, y = 2;
export const out = tag\`a \${x} b \${y}\`;`);

clean('private class fields, getters, setters, arrow-field, static', `
import * as ns from './base.js';
class Widget extends ns.Base {
  #count = 0;
  static kind = 'widget';
  get count() { return this.#count; }
  set count(v) { this.#count = v; }
  async *stream() { yield this.#count; }
  tick = () => { this.#count += 1; };
}
export const w = new Widget();`);

clean('labeled loops with break/continue to a label', `
export const scan = (grid) => {
  outer: for (const row of grid) {
    inner: for (const cell of row) {
      if (cell < 0) continue outer;
      if (cell > 9) break inner;
    }
  }
  return grid;
};`);

clean('nested destructuring with defaults, renames, and rest', `
export const pick = (src) => {
  const { a = 1, b: { c = 2 } = {}, ...rest } = src;
  return a + c + Object.keys(rest).length;
};
const compute = ([first, ...tail], { key = 'k' } = {}) => first + tail.length + key.length;
export const n = compute([1, 2, 3], {});`);

clean('object literals: computed keys, method shorthand, async/generator methods', `
const a = 1;
const obj = {
  [\`dyn_\${a}\`]: 1,
  method(z) { return z; },
  async af() { return 2; },
  *g() { yield 3; },
  get p() { return a; },
};
export const used = obj.method(a);`);

clean('dynamic import and import.meta', `
export const load = async () => {
  const m = await import('./lazy.js');
  return m.default ?? import.meta.url;
};`);

clean('regex literals that look like division or contain braces/quotes', `
export const clean = (s) => s.replace(/["'{}()]+/g, '').split(/\\s*,\\s*/);
const ratio = (a, b) => a / b / 2;
export const r = ratio(10, 2);`);

clean('IIFE, comma operator, and sequence expressions', `
export const config = (() => {
  const base = { a: 1 };
  return (base.b = 2, base);
})();`);

clean('try/catch/finally with an unused catch binding and optional catch', `
export const safe = (fn) => {
  try { return fn(); }
  catch { return null; }
  finally { cleanup(); }
};
const cleanup = () => undefined;`);

clean('generic-looking TS-free comparisons (less-than not a type param)', `
export const cmp = (a, b) => a < b && b > a;
const shift = (n) => n << 2 >> 1;
export const s = shift(8);`);
