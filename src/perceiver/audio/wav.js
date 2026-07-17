// EO: SIG(Void → Field, Tending) — a minimal WAV decoder
// RIFF/WAVE is simple enough to read without a dependency: a 12-byte header,
// then a sequence of [id(4) size(4) data(size)] chunks. We read the `fmt `
// chunk for the sample layout and the `data` chunk for the samples, skipping
// anything else (LIST, fact, cue, …) — no assumption about chunk order.
// Multi-channel audio is downmixed to mono by averaging, since every
// perceiver downstream (dsp.js, waveform.js) reads one channel of samples.

const readAscii = (view, offset, len) => {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
};

// Sign-extend a 24-bit little-endian sample read as three bytes.
const readInt24LE = (view, offset) => {
  const b0 = view.getUint8(offset), b1 = view.getUint8(offset + 1), b2 = view.getUint8(offset + 2);
  let v = b0 | (b1 << 8) | (b2 << 16);
  if (v & 0x800000) v -= 0x1000000;
  return v;
};

// decodeWav(bytes) — bytes is anything DataView accepts (ArrayBuffer, or a
// Uint8Array's .buffer). Returns { sampleRate, channels, bitDepth, mono } —
// `mono` a Float64Array in [-1, 1], the same shape organs/in/acoustic.js and
// the audio perceiver already expect.
export const decodeWav = (bytes) => {
  const buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const view = new DataView(buf);
  if (view.byteLength < 12 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('decodeWav: not a RIFF/WAVE file');
  }

  let sampleRate = null, channels = null, bitDepth = null, audioFormat = null;
  let dataOffset = null, dataSize = 0;

  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const bodyStart = offset + 8;
    if (id === 'fmt ') {
      audioFormat = view.getUint16(bodyStart, true);
      channels = view.getUint16(bodyStart + 2, true);
      sampleRate = view.getUint32(bodyStart + 4, true);
      bitDepth = view.getUint16(bodyStart + 14, true);
    } else if (id === 'data') {
      dataOffset = bodyStart;
      dataSize = Math.min(size, view.byteLength - bodyStart);
    }
    offset = bodyStart + size + (size % 2);   // chunks are word-aligned
  }

  if (sampleRate == null || dataOffset == null) {
    throw new Error('decodeWav: missing fmt or data chunk');
  }

  const bytesPerSample = bitDepth / 8;
  const frameCount = Math.floor(dataSize / (bytesPerSample * channels));
  const mono = new Float64Array(frameCount);

  const readSample = (byteOffset) => {
    if (audioFormat === 3 && bitDepth === 32) return view.getFloat32(byteOffset, true);
    if (audioFormat === 3 && bitDepth === 64) return view.getFloat64(byteOffset, true);
    if (bitDepth === 8) return (view.getUint8(byteOffset) - 128) / 128;           // unsigned 8-bit PCM
    if (bitDepth === 16) return view.getInt16(byteOffset, true) / 32768;
    if (bitDepth === 24) return readInt24LE(view, byteOffset) / 8388608;
    if (bitDepth === 32) return view.getInt32(byteOffset, true) / 2147483648;
    throw new Error(`decodeWav: unsupported bit depth ${bitDepth} (format ${audioFormat})`);
  };

  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    const frameStart = dataOffset + f * bytesPerSample * channels;
    for (let c = 0; c < channels; c++) sum += readSample(frameStart + c * bytesPerSample);
    mono[f] = sum / channels;
  }

  return { sampleRate, channels, bitDepth, mono };
};
