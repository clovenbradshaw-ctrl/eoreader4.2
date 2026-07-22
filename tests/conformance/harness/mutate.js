// Deterministic-per-seed fuzz mutators (docs/parse-conformance-spec.md Tier 1
// #4: "10,000 mutated fixtures (bit flips, truncation, byte insertion, invalid
// UTF-8 sequences, lone surrogates, nested control chars)"). Scaled down in the
// test itself (see tests/conformance-tier1-determinism.test.js) for runtime —
// this module is the generator, reusable at any N.
//
// A tiny xorshift32 PRNG, not Math.random(): a fuzz run has to be reproducible
// (the same seed reproduces the same failing input for debugging), and
// Math.random() cannot be pinned — exactly the kind of hidden nondeterminism
// readWithSeed's header note warns about. This generator is self-contained and
// never touches Math.random()/Date.now().
export const makeRng = (seed) => {
  let s = (seed >>> 0) || 0xC0FFEE;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xFFFFFFFF;
  };
};

const randInt = (rng, n) => Math.floor(rng() * n);

export const bitFlip = (bytes, rng) => {
  const out = Buffer.from(bytes);
  if (!out.length) return out;
  const i = randInt(rng, out.length);
  const bit = 1 << randInt(rng, 8);
  out[i] ^= bit;
  return out;
};

export const truncate = (bytes, rng) => {
  if (!bytes.length) return Buffer.alloc(0);
  const cut = 1 + randInt(rng, bytes.length);
  return Buffer.from(bytes.subarray(0, cut));
};

export const insertBytes = (bytes, rng) => {
  const n = 1 + randInt(rng, 8);
  const junk = Buffer.alloc(n);
  for (let i = 0; i < n; i++) junk[i] = randInt(rng, 256);
  const at = randInt(rng, bytes.length + 1);
  return Buffer.concat([Buffer.from(bytes.subarray(0, at)), junk, Buffer.from(bytes.subarray(at))]);
};

// Splice in a byte sequence that is invalid as UTF-8 on its own (a lone
// continuation byte run, 0x80-0xBF with no leading byte) — decoding must not
// throw (TextDecoder with fatal:false, as readWithSeed uses) and the parse must
// not choke on the U+FFFD replacement characters that result.
export const invalidUtf8 = (bytes, rng) => {
  const n = 1 + randInt(rng, 4);
  const junk = Buffer.alloc(n, 0);
  for (let i = 0; i < n; i++) junk[i] = 0x80 + randInt(rng, 0x40);   // 0x80..0xBF: continuation byte, invalid alone
  const at = randInt(rng, bytes.length + 1);
  return Buffer.concat([Buffer.from(bytes.subarray(0, at)), junk, Buffer.from(bytes.subarray(at))]);
};

// A lone (unpaired) UTF-16 surrogate, injected via a JS string round-trip
// (surrogates are a JS-string/UTF-16 concept, not a raw-byte one — this
// mutator operates after decoding, unlike the others, and re-encodes to bytes
// so the fuzz harness's byte-in/byte-out contract stays uniform).
export const loneSurrogate = (bytes, rng) => {
  const text = bytes.toString('utf8');
  const at = Math.min(text.length, randInt(rng, text.length + 1));
  const HIGH = ['\uD800', '\uD83D', '\uDBFF'];
  const surrogate = HIGH[randInt(rng, HIGH.length)];
  const mutated = text.slice(0, at) + surrogate + text.slice(at);
  return Buffer.from(mutated, 'utf8');   // Node encodes a lone surrogate as UTF-8 U+FFFD-safe replacement per WHATWG
};

export const nestedControlChars = (bytes, rng) => {
  const controls = [0x00, 0x01, 0x07, 0x08, 0x0B, 0x0C, 0x0E, 0x1B, 0x1F, 0x7F];
  const n = 1 + randInt(rng, 3);
  const junk = Buffer.alloc(n);
  for (let i = 0; i < n; i++) junk[i] = controls[randInt(rng, controls.length)];
  const at = randInt(rng, bytes.length + 1);
  return Buffer.concat([Buffer.from(bytes.subarray(0, at)), junk, Buffer.from(bytes.subarray(at))]);
};

export const MUTATORS = Object.freeze({
  bitFlip, truncate, insertBytes, invalidUtf8, loneSurrogate, nestedControlChars,
});

// mutateFixture(bytes, seed) -> { kind, bytes } — applies ONE randomly-chosen
// mutator, deterministically keyed by `seed`, so `seed` alone reproduces both
// the mutation kind and its exact effect.
export const mutateFixture = (bytes, seed) => {
  const rng = makeRng(seed);
  const kinds = Object.keys(MUTATORS);
  const kind = kinds[randInt(rng, kinds.length)];
  return { kind, bytes: MUTATORS[kind](Buffer.from(bytes), rng) };
};
