// Shared canonicalization primitives for the parse-conformance suite
// (docs/parse-conformance-spec.md, "Shared harness").
//
// readingHash needs to be an INSTRUMENT, not a source of noise: two reads of the
// same document must hash identically regardless of Map/Set iteration order or
// float accumulation order, and must NOT hash identically just because we forgot
// to quantize a float that jittered in the ninth decimal. Every helper here exists
// to make that true.
import { createHash } from 'node:crypto';

// Quantize a float to a fixed number of decimal digits, returning a NUMBER (not a
// string) so canonicalStringify's numeric formatting stays uniform. -0 folds to 0
// so it sorts/compares identically to 0 (Object.is(-0, 0) is false, JSON is not).
export const quantize = (x, digits = 6) => {
  if (typeof x !== 'number' || !Number.isFinite(x)) return x;
  const q = Number(x.toFixed(digits));
  return q === 0 ? 0 : q;
};

// Recursively quantize every finite number in a plain JSON-ish structure.
export const quantizeDeep = (value, digits = 6) => {
  if (Array.isArray(value)) return value.map((v) => quantizeDeep(v, digits));
  if (typeof value === 'number') return quantize(value, digits);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = quantizeDeep(value[k], digits);
    return out;
  }
  return value;
};

// A canonical (order-independent, key-sorted) JSON stringifier. Object keys are
// sorted so { a:1, b:2 } and { b:2, a:1 } hash identically; arrays keep their
// order (order IS the signal for a units[] sequence) unless the caller has
// already sorted them (readingHash sorts every collection that has no intrinsic
// order — referents, sightings, edges — before handing it here).
export const canonicalStringify = (value) => {
  const seen = new WeakSet();
  const walk = (v) => {
    if (v === undefined) return null;
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) throw new TypeError('canonicalStringify: cyclic structure');
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v instanceof Map) return walk(Object.fromEntries([...v.entries()].sort(([a], [b]) => cmp(a, b))));
    if (v instanceof Set) return walk([...v].sort(cmp));
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
    return out;
  };
  return JSON.stringify(walk(value));
};

const cmp = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

// Sort an array of plain objects by a stable composite key, so iteration-order
// leakage (Map/Set traversal, insertion order of a JS object) can never change a
// hash. `keyOf` returns a primitive or array of primitives.
export const sortBy = (arr, keyOf) =>
  [...arr].sort((a, b) => {
    const ka = [].concat(keyOf(a)), kb = [].concat(keyOf(b));
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const c = cmp(ka[i], kb[i]);
      if (c !== 0) return c;
    }
    return 0;
  });

export const sha256Hex = (input) =>
  createHash('sha256').update(typeof input === 'string' ? input : canonicalStringify(input)).digest('hex');

// Volatile keys that carry no reading content — wall-clock provenance the log
// stamps at append time (core/log.js: `t: event.t ?? Date.now()`). No caller can
// pin this from outside (append() takes no clock injection), so readingHash must
// ignore it deliberately rather than let two honest re-reads of the same bytes
// hash differently. See tests/conformance/README.md "Known gaps" — this is the
// one confirmed non-determinism source Tier 1 exists to find, and the fix lives
// here (strip it at the hash boundary) rather than in a source-level patch.
export const VOLATILE_EVENT_KEYS = Object.freeze(['t']);

export const stripVolatile = (event, keys = VOLATILE_EVENT_KEYS) => {
  const out = {};
  for (const k of Object.keys(event)) if (!keys.includes(k)) out[k] = event[k];
  return out;
};
