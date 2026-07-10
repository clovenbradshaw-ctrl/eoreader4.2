// EO: INS·CON(Void → Entity,Link,Field, Making,Binding) — frequency adapter (raw Hz)
// The frequency adapter — meaning from raw Hz, with NO music theory at all.
//
// The music adapter still carried one prior: it keyed notes by pitch class
// (midi % 12), which bakes in octave equivalence and 12-tone equal temperament.
// This adapter removes it. The only input is a set of raw fundamental
// frequencies. Nothing is quantized to a scale, nothing is folded mod an octave,
// no interval is named, no ratio is privileged. Every note is its OWN entity —
// so if a note and the one at twice its frequency turn out to be "the same", the
// engine has to DISCOVER that, not be told it.
//
// The one physical fact we do use is not theory, it is what a vibrating string
// or column of air actually does: a tone is a fundamental plus overtones at
// integer multiples (f, 2f, 3f, …). We hand the engine each note's partials and
// stop. Octave equivalence and consonance are then nothing but SHARED OVERTONES
// — two tones an octave apart share half their partials, a fifth shares a third
// of them, a tritone almost none (Helmholtz, 1863). That overlap is measured by
// the engine's OWN Level-1 existence reading — `hits / qLen` over token sets
// (retrieve/lexical.js) — with each note's "tokens" being its partials. The same
// set-overlap the engine runs over the words of a sentence, run over the
// overtones of a note, recovers the harmonic series with no scale in sight.

import { createLog }         from '../../core/index.js';
import { projectGraph }      from '../../core/index.js';
import { createConventions } from '../../core/conventions/index.js';

// A partial lands in a bin if it falls within TOL of it — a frequency-resolution
// grain, the finest distinction the reader is asked to make. It is NOT a scale:
// at 0.5% the grid has ~140 steps per octave, none of them a named pitch. Exact
// overtone coincidences (3f from one note = 2f from another at a 3:2) share a bin
// regardless; the tolerance only forgives real-world detuning.
const TOL = 0.005;
const bin = (f) => `h${Math.round(Math.log(f) / Math.log(1 + TOL))}`;

const hz = (note) => (typeof note === 'number' ? note : note.hz);

export const ingestFrequencies = (spec = {}) => {
  const { name = `tones-${Date.now()}`, notes = [], partials = 16, label } = spec;
  const fmt = label || ((f) => `${f.toFixed(1)}Hz`);
  // Which multiples of the fundamental to sound. The default is the HARMONIC
  // series (1f, 2f, 3f, …) — what a real string does, and the source of octave
  // equivalence and consonance. A control can pass INHARMONIC multipliers (random,
  // non-integer) to confirm the structure comes from the harmonics and not the
  // overlap machinery: under inharmonic partials the consonance curve must flatten.
  const mults = spec.partialMultipliers || Array.from({ length: partials }, (_, k) => k + 1);

  const log = createLog({ docId: name });
  const units = [], sentences = [], tokensBySentence = [], partialTokens = [], noteHz = [];
  const mentions = new Map();

  notes.forEach((note, i) => {
    const f0 = hz(note);
    const toks = [];
    for (const mlt of mults) toks.push(bin(f0 * mlt));
    const set = new Set(toks);

    const id = `n${i}`;
    log.append({ op: 'INS', id, label: fmt(f0), sentIdx: i });
    mentions.set(id, [i]);
    // The reading line: bond to the previous note, labelled by the bare frequency
    // ratio (arithmetic on the two fundamentals — a number, never an interval name).
    if (i > 0) {
      log.append({ op: 'CON', src: `n${i - 1}`, tgt: id, via: `x${(f0 / hz(notes[i - 1])).toFixed(3)}`, sentIdx: i });
    }

    units.push(fmt(f0));
    sentences.push(fmt(f0));        // display is the frequency; the SPECTRUM is the token set
    tokensBySentence.push(set);     // the note's "tokens" are its overtones
    partialTokens.push([...set]);
    noteHz.push(f0);
  });

  const doc = {
    docId: name, modality: 'frequency',
    units, sentences, tokensBySentence, partialTokens, noteHz,
    log, mentions,
    conventions: createConventions(),
    // The universal contract's metadata slot (organs/in: every doc carries one). The
    // bare spectrum carries none; a caller may pass any it has (a capture's date, source).
    metadata: spec.metadata || {},
    projectGraph: (frame = {}) => projectGraph(log, frame),
  };

  // The query a note poses to the existence reader: its own spectrum. Pass this
  // to retrieveLexical(doc, query) and the engine ranks every other note by
  // shared overtones — harmonic relatedness, measured by hits/qLen and nothing else.
  doc.spectrumQuery = (i) => partialTokens[i].join(' ');

  return doc;
};
