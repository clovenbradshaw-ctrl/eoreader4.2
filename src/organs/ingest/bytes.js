// EO: SIG·SEG·INS·CON·SYN(Void → Field,Network, Clearing,Binding,Composing) — universal byte ingestion
// Ingest ANYTHING — even the binary. Every input the machine can hold is a byte stream; a text is
// only the special case where the bytes happen to spell a language. So the floor of ingestion is
// not "parse this format" but "read the structure the bytes themselves carry", with the SAME
// scale-free induction the reader uses on words (core/conventions/slots.js): a byte is a unit, its
// company is the bytes around it, byte-values that keep the same company fall into the same CLASS
// (letters cluster apart from digits apart from control bytes — with no charset, no format), and
// the record PERIOD falls out of the stream's self-similarity. Lift the bytes to their classes and
// the same operation reads the next rung (fields within a record). No parser, no magic numbers, no
// language — structure discovered from units alone, the creature's method taken down to the byte.
//
// Pure and dependency-free but for the kernel primitive: give it bytes (or anything coercible to
// bytes) and it returns a structural reading. The organ layer can then admit that reading like any
// other source; this module only DISCOVERS the structure.

import { createSlotField } from '../../core/conventions/slots.js';

// toBytes(input) → a Uint8Array from whatever was handed in: raw bytes, an ArrayBuffer, a byte
// array, or a string (UTF-8 encoded — a string is just one byte-encoding of itself).
export const toBytes = (input) => {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (Array.isArray(input)) return Uint8Array.from(input, (b) => b & 0xff);
  if (typeof input === 'string') return new TextEncoder().encode(input);
  return new Uint8Array(0);
};

// A stable, collision-free key per byte value (0..255) — the unit the induction clusters.
const keyOf = (b) => 'b' + (b < 16 ? '0' : '') + b.toString(16);
const valOf = (k) => parseInt(k.slice(1), 16);

// periodOf(bytes) → the record structure the stream repeats at: the lag whose shifted copy best
// matches the original (self-similarity / autocorrelation). A fixed-width table, a packed struct,
// a line-oriented log all show a clear peak; free prose shows none. `score` is the fraction of
// positions that agree at that lag, `baseline` the agreement expected by chance (so a caller can
// tell a real period from noise). Bounded work — samples a prefix for a long input.
export const periodOf = (bytes, { maxLag = 512, sample = 200000 } = {}) => {
  const n = Math.min(bytes.length, sample);
  if (n < 8) return { lag: 0, score: 0, baseline: 0 };
  // baseline: P(two random positions equal) = Σ p_v² over the value distribution.
  const hist = new Array(256).fill(0);
  for (let i = 0; i < n; i++) hist[bytes[i]]++;
  let baseline = 0; for (const h of hist) { const p = h / n; baseline += p * p; }
  const top = Math.min(maxLag, (n >> 2));
  const score = new Array(top + 1).fill(0);
  let maxScore = 0;
  for (let lag = 1; lag <= top; lag++) {
    let m = 0; const lim = n - lag;
    for (let i = 0; i < lim; i++) if (bytes[i] === bytes[i + lag]) m++;
    score[lag] = m / lim;
    if (score[lag] > maxScore) maxScore = score[lag];
  }
  // The RECORD STRIDE is the FUNDAMENTAL — the smallest strong peak, not the longest match. A
  // table of 4-byte records whose data field cycles every 13 repeats fully only at lag 52; the
  // structure the reader wants is the stride 4. So take the smallest lag that clears both a floor
  // above chance and a good fraction of the strongest peak (its harmonics sit at 8, 12, 52…).
  const floor = Math.max(baseline + 0.15, maxScore * 0.5);
  let lag = 0;
  for (let L = 1; L <= top; L++) if (score[L] >= floor) { lag = L; break; }
  return { lag, score: lag ? score[lag] : maxScore, baseline };
};

// A readable gloss of a byte class — the ranges/kinds of value it holds (printable ASCII shown as
// characters, the rest as hex), so a caller can see WHAT the induction grouped without a charset.
const glossClass = (vals) => {
  const printable = vals.filter((v) => v >= 32 && v < 127);
  const ctrl = vals.filter((v) => v < 32);
  const high = vals.filter((v) => v >= 127);
  const bits = [];
  if (printable.length) bits.push(printable.map((v) => JSON.stringify(String.fromCharCode(v)).slice(1, -1)).join(''));
  if (ctrl.length) bits.push('ctrl{' + ctrl.map((v) => '0x' + v.toString(16)).join(',') + '}');
  if (high.length) bits.push('hi{' + high.length + '}');
  return bits.join(' ');
};

// ingestBytes(input, opts) → the structural reading of any input:
//   size        bytes read
//   byteClasses the induced value-classes (each a sorted list of byte values + a gloss)
//   period      the record structure (lag/score/baseline)
//   rung2       the next rung: classes over the LIFTED (class-id) stream — field structure
//   textLike    a read-off, not an assumption: are most bytes printable? (the caller may then
//               hand the decoded text to the language reader — but binary is ingested all the same)
export const ingestBytes = (input, {
  maxUnits = 500000, frameSize = 48, minFreq = 2, simFloor = 0.30, k = 12,
} = {}) => {
  const all = toBytes(input);
  const bytes = all.length > maxUnits ? all.subarray(0, maxUnits) : all;
  const stream = Array.from(bytes, keyOf);

  const field = createSlotField({ frameSize, clusterTop: 256, minFreq, simFloor, k }).observe(stream);
  const { slots, slotOf } = field.cluster();
  const byteClasses = slots.map((g) => {
    const vals = g.map(valOf).sort((a, b) => a - b);
    return { size: vals.length, values: vals, gloss: glossClass(vals) };
  });

  const period = periodOf(bytes);

  // The next rung: rewrite the bytes as their class ids and induce again — structure OVER the
  // classes (which class follows which — the shape of a record's fields).
  const lifted = field.lift(stream, slotOf);
  const rung2field = createSlotField({ frameSize, clusterTop: 256, minFreq, simFloor, k }).observe(lifted);
  const rung2 = rung2field.cluster().slots.map((g) => g.slice(0, 8));

  let printable = 0; for (let i = 0; i < bytes.length; i++) { const b = bytes[i]; if ((b >= 32 && b < 127) || b === 9 || b === 10 || b === 13) printable++; }
  const textLike = bytes.length > 0 && printable / bytes.length > 0.85;

  return {
    size: bytes.length,
    truncated: all.length > bytes.length,
    byteClasses,
    period,
    rung2,
    textLike,
    // A one-line structural reading — what the bytes ARE, before any format is assumed.
    describe() {
      const per = period.score > period.baseline + 0.15 && period.lag > 1
        ? `record period ≈ ${period.lag} (self-similarity ${period.score.toFixed(2)} vs ${period.baseline.toFixed(2)} chance)`
        : 'no fixed record period (free-form / prose-like)';
      return `${bytes.length} bytes${this.truncated ? '+' : ''} · ${byteClasses.length} byte-classes `
        + `[${byteClasses.slice(0, 4).map((c) => c.gloss || c.size).join(' | ')}] · ${per}`
        + ` · ${textLike ? 'printable (text-like)' : 'binary'}`;
    },
  };
};
