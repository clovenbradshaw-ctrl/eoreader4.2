// EO: NUL(Void → Void, Tending) — memoize a pure fold over an append-only log
// memo-log.js — the one cache shape every projectX(log, ...) in the tree needs,
// factored out of core/project.js, frame/project.js, perceiver/credence/project.js,
// weave/essay/project.js, and rooms/research/project.js, which each hand-rolled it.
//
// The append-only log licenses two distinct, both-safe memoization shapes:
//
//   memoizeOnLog(compute, { sig })     — ONE slot per log, keyed by
//     (log.length, sig(...args)). Use when the fold reads the WHOLE log every
//     time and a parameter (a frame, a rules object) can change the result for
//     the SAME length — a longer log OR a changed sig invalidates the single
//     cached result. (core/project.js, frame/project.js,
//     perceiver/credence/project.js)
//
//   memoizeOnLogAt(compute)            — one slot PER cursor, kept forever.
//     Use when the fold is bounded to a fixed point in the log (a cursor
//     slicing "events up to here") — a fold at cursor C never changes once
//     computed, because the log only grows and nothing before C is rewritten,
//     so every cursor's result caches permanently and a later query at a
//     different cursor does not evict it. (weave/essay/project.js,
//     rooms/research/project.js)
//
// Both key on log IDENTITY (a WeakMap), never log CONTENTS — cheap, and the
// cache dies with the log.

export const memoizeOnLog = (compute, { sig = () => null } = {}) => {
  const memo = new WeakMap(); // log → { length, sig, result }
  const memoized = (log, ...args) => {
    const s = sig(...args);
    const cached = memo.get(log);
    if (cached && cached.length === log.length && cached.sig === s) return cached.result;
    const result = compute(log, ...args);
    memo.set(log, { length: log.length, sig: s, result });
    return result;
  };
  memoized.stats = (log) => {
    const c = memo.get(log);
    return c ? { cached: true, atLength: c.length, sig: c.sig } : { cached: false };
  };
  return memoized;
};

export const memoizeOnLogAt = (compute) => {
  const memo = new WeakMap(); // log → Map(at → result)
  return (log, at) => {
    let byCursor = memo.get(log);
    if (byCursor?.has(at)) return byCursor.get(at);
    const result = compute(log, at);
    if (!byCursor) { byCursor = new Map(); memo.set(log, byCursor); }
    byCursor.set(at, result);
    return result;
  };
};

// canonicalJSON — a deterministic, sorted-key JSON serialization of a plain
// value. Turns a memoization parameter (a frame, a rules object) into a
// comparable signature: same shape, same string, regardless of key order.
// core/project.js and perceiver/credence/project.js each defined this
// (canonicalFrame / canonical) verbatim; one copy here.
export const canonicalJSON = (v) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const keys = Object.keys(v).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJSON(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
};
