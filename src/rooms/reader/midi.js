// EO: SIG·INS(Void → Entity,Field, Making,Tending) — Standard MIDI File reader
// midi.js — a dependency-free reader for Standard MIDI Files (.mid/.midi/.kar).
//
// A MIDI file is not audio; it is a SCORE — a timed list of performance events (which
// key went down, when, how hard, on which instrument). So the reader treats it the way
// it treats any other document: it turns the bytes into the bare signal a score carries
// — a sequence of pitched notes on a clock — and hands that to the music organ, which
// raises each pitch class as a recurring entity and each melodic step as a bond. Nothing
// here decides what is significant; it only decodes the notes the file literally stores.
//
// The format (SMF 0/1/2, McGill spec): a 14-byte header chunk (MThd) states the format,
// the track count, and the division (ticks per quarter note); then one MTrk chunk per
// track, each a stream of (delta-time, event) pairs. Delta-times are variable-length
// quantities; channel events may omit their status byte (running status). Absolute ticks
// are converted to seconds by walking the tempo map (the µs-per-quarter-note the file
// sets with FF 51 meta events; 120 BPM until it says otherwise).
//
// Pure and self-contained — no CDN, no browser API — so the browserless CI tests it
// directly against hand-built byte arrays.

const PC_NAME = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// A MIDI note number → its scientific-pitch name. 60 → "C4" (middle C), 69 → "A4" (A440).
// The octave numbering is the convention the music organ's toMidi() inverts, so a name
// this makes round-trips back to the same number.
export const midiNoteName = (n) => {
  const pc = ((n % 12) + 12) % 12;
  const octave = Math.floor(n / 12) - 1;
  return `${PC_NAME[pc]}${octave}`;
};
export const pitchClassName = (n) => PC_NAME[((n % 12) + 12) % 12];

// General MIDI program numbers → the instrument each names. Index = program byte (0-127).
// A MIDI file carries no instrument audio; it carries this NUMBER, and the GM standard
// fixes what a conformant synth plays for it — so "program 0" reads back as "Acoustic
// Grand Piano" the way a font name reads back as a typeface.
const GM_NAMES = [
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano',
  'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet',
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone', 'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ', 'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
  'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)', 'Electric Guitar (clean)',
  'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics',
  'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass',
  'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
  'Violin', 'Viola', 'Cello', 'Contrabass', 'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
  'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2',
  'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit',
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet', 'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax', 'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute', 'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)',
  'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
  'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)',
  'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)',
  'FX 1 (rain)', 'FX 2 (soundtrack)', 'FX 3 (crystal)', 'FX 4 (atmosphere)',
  'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)', 'FX 8 (sci-fi)',
  'Sitar', 'Banjo', 'Shamisen', 'Koto', 'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai',
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock', 'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
  'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet', 'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot',
];
export const gmInstrumentName = (program) => GM_NAMES[program & 0x7f] || `Program ${program}`;

// The 15 sharp/flat key names a FF 59 key-signature meta event addresses, indexed by its
// signed count of accidentals (-7…+7); the second byte picks major (0) or minor (1).
const KEY_MAJOR = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const KEY_MINOR = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];
const keyName = (sf, mi) => {
  const idx = sf + 7;
  const tonic = (mi ? KEY_MINOR : KEY_MAJOR)[idx];
  if (tonic == null) return null;
  return `${tonic} ${mi ? 'minor' : 'major'}`;
};

// A little cursor over the byte array: the file is read strictly forward, and every read
// advances the position, so a truncated chunk fails loudly at the read that runs past its
// end rather than silently returning zeros.
class Reader {
  constructor(bytes) { this.b = bytes; this.p = 0; }
  get eof() { return this.p >= this.b.length; }
  u8() { if (this.p >= this.b.length) throw new RangeError('MIDI: read past end'); return this.b[this.p++]; }
  u16() { return (this.u8() << 8) | this.u8(); }
  u32() { return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0; }
  bytes(n) { const out = this.b.subarray(this.p, this.p + n); this.p += n; return out; }
  str(n) { return String.fromCharCode(...this.bytes(n)); }
  // A variable-length quantity: 7 bits per byte, high bit set on every byte but the last.
  varLen() {
    let value = 0, byte;
    do { byte = this.u8(); value = (value << 7) | (byte & 0x7f); } while (byte & 0x80);
    return value >>> 0;
  }
}

const asBytes = (input) => {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (Array.isArray(input)) return Uint8Array.from(input);
  throw new TypeError('MIDI: expected bytes');
};

// Parse one MTrk body (already sliced to its own bytes) into a flat list of events, each
// stamped with the absolute tick it occurs at. Running status is honored: a channel event
// may drop its status byte and inherit the previous one.
function parseTrackEvents(body, warnings) {
  const r = new Reader(body);
  const events = [];
  let tick = 0, runningStatus = 0;
  while (!r.eof) {
    // A truncated tail must not cost the events already read: any read that runs past the
    // (possibly clipped) body breaks the walk and returns what stands, rather than throwing
    // the whole track away.
    try {
      tick += r.varLen();
      let status = r.u8();
      if (status < 0x80) {
        // Running status: this byte is really the first data byte; reuse the last status.
        if (!runningStatus) { warnings.push('running status with no prior status byte'); break; }
        r.p--; status = runningStatus;
      }
      if (status === 0xff) {
        // Meta event: type byte, then a var-length payload.
        const type = r.u8();
        const len = r.varLen();
        const data = r.bytes(len);
        events.push({ tick, meta: type, data });
        if (type === 0x2f) break;   // end of track
      } else if (status === 0xf0 || status === 0xf7) {
        // SysEx — length-prefixed; recorded as opaque, it carries no notes.
        const len = r.varLen();
        r.bytes(len);
        events.push({ tick, sysex: true });
      } else {
        runningStatus = status;
        const hi = status & 0xf0, channel = status & 0x0f;
        // Program change (0xC) and channel pressure (0xD) take one data byte; the rest take two.
        const nData = (hi === 0xc0 || hi === 0xd0) ? 1 : 2;
        const d1 = r.u8();
        const d2 = nData === 2 ? r.u8() : 0;
        events.push({ tick, status: hi, channel, d1, d2 });
      }
    } catch (e) {
      if (e instanceof RangeError) break;   // truncated event — stop, keep the rest
      throw e;
    }
  }
  return events;
}

// parseMidi(bytes) → the decoded score. Never throws on a well-formed file; a malformed
// tail is recorded in `warnings` and the notes read so far are still returned.
export function parseMidi(input) {
  const bytes = asBytes(input);
  const r = new Reader(bytes);
  const warnings = [];

  if (r.str(4) !== 'MThd') throw new Error('not a Standard MIDI File (missing MThd header)');
  const headerLen = r.u32();
  const format = r.u16();
  const declaredTracks = r.u16();
  const division = r.u16();
  if (headerLen > 6) r.bytes(headerLen - 6);   // skip any header padding a future spec adds

  // Division: the top bit distinguishes ticks-per-quarter-note (0) from SMPTE frames (1).
  let ppq = division & 0x7fff;
  let smpte = null;
  if (division & 0x8000) {
    const framesPerSec = 256 - ((division >> 8) & 0xff);   // stored as a negative frame rate
    const ticksPerFrame = division & 0xff;
    smpte = { framesPerSec, ticksPerFrame };
    ppq = 0;   // SMPTE timing carries its own seconds-per-tick; no tempo map needed
  }
  if (!ppq && !smpte) { warnings.push('zero division; assuming 480 ticks/quarter'); ppq = 480; }

  // Read each track's raw events first (absolute ticks). A track's length field bounds it,
  // so a corrupt event can't run into the next track.
  const rawTracks = [];
  while (!r.eof && rawTracks.length < (declaredTracks || Infinity)) {
    const tag = r.str(4);
    const len = r.u32();
    if (tag !== 'MTrk') { r.bytes(len); continue; }   // unknown chunk — skip its whole body
    const body = r.bytes(len);
    try { rawTracks.push(parseTrackEvents(body, warnings)); }
    catch (e) { warnings.push(`track ${rawTracks.length}: ${e.message}`); rawTracks.push([]); }
  }
  if (declaredTracks && rawTracks.length < declaredTracks)
    warnings.push(`header declared ${declaredTracks} tracks, found ${rawTracks.length}`);

  // The tempo map — every FF 51 across all tracks, on the shared clock, in tick order. In
  // an SMF-1 file the tempo usually lives only on track 0, but the spec allows it anywhere.
  const tempoEvents = [];
  for (const ev of rawTracks.flat()) {
    if (ev.meta === 0x51 && ev.data && ev.data.length === 3)
      tempoEvents.push({ tick: ev.tick, usPerQuarter: (ev.data[0] << 16) | (ev.data[1] << 8) | ev.data[2] });
  }
  tempoEvents.sort((a, b) => a.tick - b.tick);

  // Ticks → seconds. With SMPTE division the rate is fixed; otherwise integrate over the
  // tempo map, so a piece that speeds up midway keeps every note on the true wall clock.
  const secPerTickSmpte = smpte ? 1 / (smpte.framesPerSec * smpte.ticksPerFrame) : 0;
  const tickToSec = (tick) => {
    if (smpte) return tick * secPerTickSmpte;
    let sec = 0, lastTick = 0, usPerQ = 500000;   // MIDI default: 120 BPM
    for (const t of tempoEvents) {
      if (t.tick > tick) break;
      sec += ((t.tick - lastTick) * usPerQ) / (ppq * 1e6);
      lastTick = t.tick; usPerQ = t.usPerQuarter;
    }
    sec += ((tick - lastTick) * usPerQ) / (ppq * 1e6);
    return sec;
  };

  // Walk each track: pair note-ons with their note-offs (a note-on with velocity 0 is the
  // idiomatic note-off), collecting timed notes and the track's name / instrument.
  const tracks = [];
  const allNotes = [];
  const timeSignatures = [];
  const keySignatures = [];
  let markers = [];
  let lyrics = [];
  let overallName = null;
  let hangingNotes = 0;

  rawTracks.forEach((events, index) => {
    const notes = [];
    // Open note-ons keyed by "channel:pitch" so overlapping voices don't cross-cancel.
    const open = new Map();
    let name = null, instrument = null, program = null, channel = null;
    for (const ev of events) {
      if (ev.meta != null) {
        const txt = ev.data ? String.fromCharCode(...ev.data) : '';
        if (ev.meta === 0x03) { name = txt; if (index === 0 && !overallName) overallName = txt; }
        else if (ev.meta === 0x04) instrument = txt;
        else if (ev.meta === 0x06) markers.push({ sec: tickToSec(ev.tick), text: txt });
        else if (ev.meta === 0x05) lyrics.push({ sec: tickToSec(ev.tick), text: txt });
        else if (ev.meta === 0x58 && ev.data.length >= 2)
          timeSignatures.push({ sec: tickToSec(ev.tick), numerator: ev.data[0], denominator: 2 ** ev.data[1] });
        else if (ev.meta === 0x59 && ev.data.length >= 2) {
          const sf = ev.data[0] > 127 ? ev.data[0] - 256 : ev.data[0];   // signed byte
          keySignatures.push({ sec: tickToSec(ev.tick), name: keyName(sf, ev.data[1]) });
        }
        continue;
      }
      if (ev.status == null) continue;
      if (channel == null) channel = ev.channel;
      if (ev.status === 0xc0) { program = ev.d1; if (channel !== 9) instrument = instrument || gmInstrumentName(ev.d1); continue; }
      const isOn = ev.status === 0x90 && ev.d2 > 0;
      const isOff = ev.status === 0x80 || (ev.status === 0x90 && ev.d2 === 0);
      const key = `${ev.channel}:${ev.d1}`;
      if (isOn) {
        open.set(key, { tick: ev.tick, velocity: ev.d2, channel: ev.channel });
      } else if (isOff && open.has(key)) {
        const on = open.get(key); open.delete(key);
        const start = tickToSec(on.tick), end = tickToSec(ev.tick);
        notes.push({
          midi: ev.d1, name: midiNoteName(ev.d1), pc: pitchClassName(ev.d1),
          start, dur: Math.max(0, end - start), velocity: on.velocity,
          channel: on.channel, track: index, tick: on.tick,
        });
      }
    }
    // Any note left hanging (an off that never came) still counts — closed at its own onset
    // so it lands on the spine rather than vanishing; the truncation is noted.
    if (open.size) {
      hangingNotes += open.size;
      warnings.push(`track ${index}: ${open.size} note(s) left sounding (no note-off)`);
    }
    notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
    // Channel 9 (0-based) is the GM percussion channel — its "pitches" are drum voices.
    const isPercussion = channel === 9;
    if (isPercussion && !instrument) instrument = 'Percussion';
    tracks.push({
      index, name, instrument, program, channel, isPercussion,
      notes, noteCount: notes.length,
    });
    for (const n of notes) allNotes.push(n);
  });

  allNotes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  const durationSec = allNotes.reduce((m, n) => Math.max(m, n.start + n.dur), 0);
  const tempos = tempoEvents.map((t) => ({ sec: tickToSec(t.tick), bpm: Math.round((6e7 / t.usPerQuarter) * 10) / 10 }));
  if (!tempos.length) tempos.push({ sec: 0, bpm: 120 });

  return {
    format, ppq: smpte ? null : ppq, smpte, division,
    trackCount: rawTracks.length,
    name: overallName,
    tracks, notes: allNotes,
    durationSec, tempos, timeSignatures, keySignatures,
    markers, lyrics, hangingNotes, warnings,
  };
}

export default parseMidi;
