// EO: NUL·SIG(Void → Field, Clearing,Tending) — the generalized entry point
// buildReadingFromBytes(bytes) → a Reading, for ANY input, with no caller-side
// format decision. This is the "any form of binary input, generalized" surface
// (docs/omnimodal-waveform.md §0): sniff what can be recognized reliably — a
// WAV file's own magic header, or bytes that decode as clean, mostly-printable
// UTF-8 — and route to the perceiver built for it; anything else falls through
// to the generic binary perceiver (perceiver/binary/), which makes no format
// assumption at all. The result is never a failure: some Reading always comes
// back, typed by `reading.meta.modality`.
//
// Lives here, not under src/perceiver/, on purpose: this module needs
// `ingestText` (organs/in) AND the perceivers (src/perceiver/index.js), and
// organs/ingest/read.js already imports FROM perceiver/index.js — so a
// perceiver-side dispatcher reaching back into organs/in would be a real
// import cycle (perceiver → organs/in → organs/ingest → perceiver), not just
// an architectural preference. organs/in already depends on perceiver in the
// same direction every other adapter here does (text.js's own attachReading);
// this file goes with that grain, not against it.
//
// Intentionally a THIN, conservative sniff, not a general-purpose file-type
// library: two positive identifications (WAV via magic bytes, text via a
// strict UTF-8 decode + a high printable ratio) and one honest fallback. A
// format worth reading precisely earns its own perceiver, called directly
// (buildTextReading, buildAudioReading, buildTabularReading) — this entry
// point exists for the caller who has bytes and does not yet know what they are.

import { ingestText } from './text.js';
import { buildTextReading, decodeWav, buildBinaryReading } from '../../perceiver/index.js';
// A declared seam (src/core/seams.js): perceiver/index.js deliberately does
// NOT re-export buildAudioReading, since audio/waveform.js's own dependency on
// organs/in/acoustic.js (via organs/ingest) would close a cycle back through
// this exact barrel the instant it did. Read straight from the leaf instead.
import { buildAudioReading } from '../../perceiver/audio/waveform.js';

const asUint8Array = (bytes) => (bytes instanceof Uint8Array ? bytes
  : bytes instanceof ArrayBuffer ? new Uint8Array(bytes)
  : Uint8Array.from(bytes));

const looksLikeWav = (buf) => buf.length >= 12
  && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46   // 'RIFF'
  && buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45; // 'WAVE'

// A generic byte-level read, inlined rather than imported from
// perceiver/binary/features.js: that module sits behind the perceiver
// entrance too, and printableRatio alone isn't worth a second cross-holon hop
// for a three-line loop.
const printableRatio = (buf) => {
  if (!buf.length) return 0;
  let printable = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if ((b >= 0x20 && b <= 0x7e) || b === 0x09 || b === 0x0a || b === 0x0d) printable++;
  }
  return printable / buf.length;
};

// A strict UTF-8 decode (fatal:true) throws on the invalid byte sequences a
// real binary blob almost always contains; a high printable-ASCII ratio then
// separates genuine prose/markup/source from a decodable-but-opaque edge case
// (a UTF-8-valid but mostly-control-character stream).
const TEXT_PRINTABLE_FLOOR = 0.85;
const decodeAsTextIfPlausible = (buf) => {
  let str;
  try { str = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return null; }
  if (!str.length) return null;
  return printableRatio(buf) >= TEXT_PRINTABLE_FLOOR ? str : null;
};

// buildReadingFromBytes — `bytes` is a Uint8Array/ArrayBuffer/byte-like array.
// `opts.text`/`opts.audio`/`opts.binary` forward to the matching perceiver's
// own options (e.g. `opts.audio.frameSize`).
export const buildReadingFromBytes = async (bytes, opts = {}) => {
  const buf = asUint8Array(bytes);

  if (looksLikeWav(buf)) {
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const { sampleRate, mono } = decodeWav(arrayBuffer);
    return buildAudioReading(mono, sampleRate, opts.audio);
  }

  const text = decodeAsTextIfPlausible(buf);
  if (text != null) {
    const doc = await ingestText(text, opts.text);
    return buildTextReading(doc, opts.text);
  }

  return buildBinaryReading(buf, opts.binary);
};
