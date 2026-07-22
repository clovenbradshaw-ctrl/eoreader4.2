// EO: DEF·EVA(Void → Entity,Kind, Tracing,Binding) — speaker-name guesses for transcripts
// Best-effort name attribution layered onto diarization's relative voices. The waveform can only say
// "Speaker 1"; the words sometimes say more ("I'm Maya", "this is Lee", "Sam speaking"). Treat
// those self-identifications as defeasible guesses, keep the original speaker id, and expose the guess
// on the roster so displays/exports can say who the voice probably is without pretending certainty.

const NAME_STOP = new Set(['i','im',"i\'m",'am','my','name','is','this','here','speaking','speaker','hello','hi','hey','thanks','thank','you','yes','no','okay','ok','and','the','a','an']);
const cleanName = (x) => String(x || '').replace(/^[^\p{L}]+|[^\p{L}'-]+$/gu, '');
const titleName = (x) => cleanName(x).replace(/^([\p{L}])([\p{L}'-]*)/u, (_, a, b) => a.toUpperCase() + b.toLowerCase());
const plausibleName = (x) => {
  const n = cleanName(x);
  return /^[\p{L}][\p{L}'-]{1,30}$/u.test(n) && !NAME_STOP.has(n.toLowerCase());
};

// Best-effort name attribution layered onto diarization's relative voices. The waveform can only say
// "Speaker 1"; the words sometimes say more ("I'm Maya", "this is Lee", "Sam speaking"). Treat
// those self-identifications as defeasible guesses, keep the original speaker id, and expose the guess
// on the roster so displays/exports can say who the voice probably is without pretending certainty.
export const guessSpeakerNames = (utterances = [], speakers = []) => {
  const votes = new Map();
  const add = (speaker, name, via, unitIdx) => {
    if (!Number.isInteger(speaker) || !plausibleName(name)) return;
    const label = titleName(name);
    if (!votes.has(speaker)) votes.set(speaker, new Map());
    const m = votes.get(speaker);
    const key = label.toLowerCase();
    const row = m.get(key) || { name: label, count: 0, evidence: [] };
    row.count += 1; row.evidence.push({ via, unitIdx }); m.set(key, row);
  };
  utterances.forEach((u, unitIdx) => {
    const speaker = Number.isInteger(u?.speaker) ? u.speaker : null;
    const ws = (u?.words || []).map(w => cleanName(w.text)).filter(Boolean);
    for (let i = 0; i < ws.length; i++) {
      const a = ws[i].toLowerCase(), b = (ws[i + 1] || '').toLowerCase(), c = ws[i + 2];
      if ((a === 'im' || a === "i'm" || (a === 'i' && b === 'am')) && plausibleName((a === 'im' || a === "i'm") ? ws[i + 1] : c)) add(speaker, (a === 'im' || a === "i'm") ? ws[i + 1] : c, 'self-introduction', unitIdx);
      if (a === 'my' && b === 'name' && (ws[i + 2] || '').toLowerCase() === 'is' && plausibleName(ws[i + 3])) add(speaker, ws[i + 3], 'self-introduction', unitIdx);
      if (a === 'this' && b === 'is' && plausibleName(c)) add(speaker, c, 'self-introduction', unitIdx);
      if (plausibleName(ws[i]) && b === 'speaking') add(speaker, ws[i], 'self-introduction', unitIdx);
    }
  });
  const roster = Array.isArray(speakers) && speakers.length ? speakers : [...new Set(utterances.map(u => u?.speaker).filter(Number.isInteger))].map(id => ({ id, label: `Speaker ${id + 1}` }));
  return roster.map((sp) => {
    const m = votes.get(sp.id);
    if (!m || !m.size) return sp;
    const best = [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0];
    return { ...sp, guess: best.name, guessKind: 'self-identification', guessConfidence: Math.min(0.95, 0.55 + best.count * 0.2), guessEvidence: best.evidence.slice(0, 3), label: `${best.name} (Speaker ${sp.id + 1})` };
  });
};

