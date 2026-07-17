// EO: SIG(Void → Field, Tending) — generic byte-level features
// The features any binary blob has, regardless of what it turns out to be: a
// byte-value histogram (a "spectrum" of the byte stream — literally the same
// move as audio's log-band binning, one level down, over byte VALUES instead
// of frequency bins), the Shannon entropy of the chunk (compressed/encrypted
// regions read high; structured/repetitive regions read low), and the
// printable-ASCII ratio (text-like regions read high; opaque binary reads
// low). None of these know the file's FORMAT — they are properties of any
// byte sequence at all, which is what lets one perceiver cover every format
// nothing else in the tree recognizes.

// byteHistogram — bin the 256 possible byte values into `numBins` buckets,
// log-compressed and L2-normalised (same discipline as
// perceiver/audio/dsp.js's logBandEnergies, for the same reason: two chunks
// with the same byte-value SHAPE but different length/density read as
// identical under cosine, which is the right invariance for "is this the same
// kind of data", not "is this the same size").
export const byteHistogram = (bytes, numBins = 32) => {
  const counts = new Float64Array(numBins);
  const perBin = 256 / numBins;
  for (let i = 0; i < bytes.length; i++) counts[Math.min(numBins - 1, Math.floor(bytes[i] / perBin))]++;
  const out = new Array(numBins);
  for (let b = 0; b < numBins; b++) out[b] = Math.log(1 + counts[b]);
  let norm = 0; for (const x of out) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let b = 0; b < numBins; b++) out[b] /= norm;
  return out;
};

// shannonEntropy — bits per byte, over the byte-value distribution actually
// present in this chunk. 0 for a constant run (padding, silence); up to 8 for
// uniformly-random bytes (compressed or encrypted data).
export const shannonEntropy = (bytes) => {
  if (!bytes.length) return 0;
  const counts = new Float64Array(256);
  for (let i = 0; i < bytes.length; i++) counts[bytes[i]]++;
  let bits = 0;
  for (let v = 0; v < 256; v++) {
    if (!counts[v]) continue;
    const p = counts[v] / bytes.length;
    bits -= p * Math.log2(p);
  }
  return bits;
};

// printableRatio — the fraction of bytes in the common printable-ASCII +
// whitespace range. High for prose/markup/source, low for packed binary.
export const printableRatio = (bytes) => {
  if (!bytes.length) return 0;
  let printable = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 0x20 && b <= 0x7e) || b === 0x09 || b === 0x0a || b === 0x0d) printable++;
  }
  return printable / bytes.length;
};
