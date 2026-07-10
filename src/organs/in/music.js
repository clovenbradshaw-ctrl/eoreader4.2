// EO: INS·CON(Void → Entity,Link, Making,Binding) — music adapter (melody)
// The music adapter — a third modality, to test the engine honestly.
//
// The image adapter ingests a vision model's *already-extracted* detections:
// the labels and the relations arrive pre-made, so the engine only re-folds
// meaning that was handed to it. This adapter takes the opposite tack. The only
// input is a raw note sequence — the bare signal, the way text is bare
// characters. No key, no phrase marks, no significance, no hand-labelled
// relations. Everything structural is a mechanical transform of the signal:
//
//   • each note is an INS of its pitch class (so every C is "the same note",
//     the way every "Gregor" tokenizes to one entity) — sightings accumulate
//     mass exactly as repeated mentions do in text;
//   • a CON bonds each note to the next, via the interval between them, derived
//     by arithmetic on the two pitch numbers (up7, down2) — adjacency in time,
//     the music's reading line, never a semantic judgement.
//
// Nothing here says which note is the tonic, where the phrases fall, or what is
// significant. Those are left for the engine's own γ-mass fold and L3 surprise
// math to EXTRACT — the same surfaces that read a novel, run over a melody.

import { createLog }         from '../../core/index.js';
import { projectGraph }      from '../../core/index.js';
import { createConventions } from '../../core/conventions/index.js';
import { tok }               from '../../perceiver/parse/index.js';

const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PC_NAME  = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// "C4", "F#5", "Bb3" → MIDI number. Pure arithmetic on the name; no theory.
const toMidi = (note) => {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(note).trim());
  if (!m) return null;
  const [, letter, acc, oct] = m;
  let n = SEMITONE[letter.toUpperCase()];
  if (acc === '#') n += 1;
  if (acc === 'b') n -= 1;
  return n + 12 * (Number(oct) + 1);
};

const interval = (a, b) => {
  const d = b - a;                       // signed semitones, the melodic step
  return d === 0 ? 'rep' : (d > 0 ? `up${d}` : `down${-d}`);
};

export const ingestMusic = (score = {}) => {
  const { name = `melody-${Date.now()}`, notes = [] } = score;

  const log = createLog({ docId: name });
  const units = [];
  const sentences = [];
  const mentions = new Map();
  const sequence = [];   // [{ note, midi, pc, id, unitIdx }]

  let prev = null;
  notes.forEach((note, unitIdx) => {
    const midi = toMidi(note);
    if (midi == null) return;
    const pc = PC_NAME[((midi % 12) + 12) % 12];
    const id = pc;                          // pitch class is the recurring entity

    log.append({ op: 'INS', id, label: pc, sentIdx: unitIdx });
    mentions.set(id, [...(mentions.get(id) || []), unitIdx]);

    // The reading line: bond this note to the one before it, labelled by the
    // interval the two pitch numbers imply. Same pitch class twice is a held
    // note, not a tie — no self-edge.
    if (prev && prev.id !== id) {
      log.append({ op: 'CON', src: prev.id, tgt: id, via: interval(prev.midi, midi), sentIdx: unitIdx });
    }

    units.push(`${note} (beat ${unitIdx})`);
    sentences.push(pc);
    sequence.push({ note, midi, pc, id, unitIdx });
    prev = { id, midi };
  });

  const tokensBySentence = sentences.map(s => new Set(tok(s)));

  const doc = {
    docId: name, modality: 'music',
    units, sentences, sequence, tokensBySentence,
    log, mentions,
    conventions: createConventions(),
    // The universal contract's metadata slot (organs/in: every doc carries one). A
    // score's equivalent of front matter is its ID3 / sheet header (title, composer,
    // performer, year), passed in by the caller; the bare note signal carries none.
    metadata: score.metadata || {},
    projectGraph: (frame = {}) => projectGraph(log, frame),
  };

  // Cached per embedder organ — hash-space and MiniLM-space vectors are not
  // interchangeable, so a single unkeyed cache would return the wrong space to a
  // later caller (see organs/in/text.js).
  const vecByOrgan = new Map();
  doc.sentenceEmbeddings = async (embedder) => {
    const key = embedder?.id || 'default';
    if (!vecByOrgan.has(key)) vecByOrgan.set(key, Promise.all(sentences.map(s => embedder.embed(s))));
    return vecByOrgan.get(key);
  };

  return doc;
};
