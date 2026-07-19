// EO: SIG·INS(Void → Entity,Field, Making,Tending) — subtitle/caption import extractor
// Split out of import-file.js to keep that file's line count under the god-module ratchet
// (tests/size-ratchet.test.js) — the same reason MIDI parsing (midi.js) and the reader's
// other heavy extractors already live in their own files rather than inline there.
//
// A subtitle file is read as timed cues, not a text blob — cues become src.words-shaped
// tokens (interpolated word-level timing, organs/in/subtitle.js) so a caption file can stand
// as one side of a sync alignment (core/sync/align.js) exactly like an ASR transcript can.
const IN = () => import(new URL('../../organs/in/index.js', import.meta.url).href);

// Never throws — a file that claims to be a caption file but has no readable cues falls back
// to a plain text read (import-file.js's universal "nothing is refused" discipline), rather
// than failing the whole import.
export async function fromSubtitle(file, title, name) {
  const text = await file.text();
  try {
    const { parseSrt, cuesToWords, ingestSubtitle } = await IN();
    const cues = parseSrt(text);
    if (!cues.length) throw new Error('no cues found');
    const words = cuesToWords(cues);
    const doc = ingestSubtitle({ name, cues, metadata: { title } });
    return { text: doc.text, title, meta: { modality: 'subtitle', doc, words,
      coverage: { complete: true, cues: cues.length, words: words.length, dropped: [] } } };
  } catch (e) {
    return { text, title, meta: { modality: 'text', coverage: { complete: true, chars: text.length, dropped: [] } } };
  }
}
