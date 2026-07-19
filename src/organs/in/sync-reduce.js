// EO: INS(Field → Entity, Making) — timestamped-words → sync feature sequence
// reduceWordsToFeatures — the one reducer the sync engine (core/sync/align.js) needs for its
// first slice: turn `src.words`-shaped tokens (already produced by app/transcript.js for
// every ASR'd audio/video source, and by organs/in/subtitle.js for an imported SRT/VTT file)
// into the normalized {t, text, norm}[] shape alignSequences consumes. One reducer, reused by
// both producers, since they already share the same token shape — no per-source-kind
// branching needed. A future reducer (organs/in/music.js's MIDI note `sequence`, for a
// symbolic-music pairing) follows the same {t, text, norm}[] contract, not built here.

const normalize = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

// words: [{text, start, end, ...}] (src.words). Drops words with no usable text or no start
// time (a redacted/empty token would otherwise silently anchor to a wrong position).
export const reduceWordsToFeatures = (words) =>
  (Array.isArray(words) ? words : [])
    .filter((w) => w && typeof w.start === 'number' && String(w.text || '').trim())
    .map((w) => ({ t: w.start, text: String(w.text).trim(), norm: normalize(w.text) }))
    .filter((f) => f.norm);
