// EO: INS·NUL(Void,Atmosphere → Entity, Making,Clearing) — the model-free inner voice
// The narrator (narrator.js) puts words to a twitch WITH a tiny LM. This is its twin for when no
// model is wired (phases 1–2, the common case): it puts WORDS to the feeling (spec §6) — but the
// words are not INVENTED. The strip should read like a mind READING, not a dashboard and not a bank
// of canned reactions to the geometry.
//
// So the inner voice surfaces the ACTUAL propositions the reader is parsing at this fold — the
// grounded x→relation→y claims the fold extracted (`ctx.note.levels.structure`), realized to natural
// speech by the ENGINE'S OWN realizer (weave/write speakTriples, done at the wiring site so murmur
// imports nothing from the pipeline). What flows through the strip is what the reader is really
// reading — "Ryan Coogler directed Sinners." — tinted by the FEELING the sense has about it (the
// dominant register's colour). A live wander phrase leads in its own words; when nothing was parsed
// it shows the passage being read; only truly idle does it fall to a spare state line.
//
// Same discipline as the narrator: this is a VOICING of impressions, never a logged claim
// (kind:'impression', canWitness===false) — never a citable fact and never in the answer prompt
// (§9.3/§9.5). It only re-voices content the reader already grounded; it adds nothing of its own.
// Pure and offline: unit-testable with hand-fed propositions — no model, no clock, no randomness.

// The first sentence/clause of a passage, so the "what I'm literally reading" fallback reads like a
// thought and not a paragraph. Lookbehind-free for old-engine safety.
const condenseClause = (text, maxWords = 14) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = t.match(/^(.*?[.!?])(\s|$)/);
  const cut = m ? m[1] : t;
  const ws = cut.split(' ');
  return ws.length > maxWords ? ws.slice(0, maxWords).join(' ').replace(/[.,;:—–-]+$/, '') + '…' : cut;
};

// The strongest live register — the FEELING that tints the claims (its colour, not its words). Null
// when nothing has crossed, so an untroubled reading shows its propositions in neutral ink.
const dominantRegister = (impressions = []) => {
  let best = null;
  for (const i of impressions) {
    if (!i || typeof i.decayedIntensity !== 'number' || i.decayedIntensity <= 0.02) continue;
    if (!best || i.decayedIntensity > best.decayedIntensity) best = i;
  }
  return best ? best.register : null;
};

const RESTING = `still — nothing to read just yet.`;
const alongLine = (signal) => {
  const foot = signal && typeof signal.concentration === 'number' ? signal.concentration : null;
  return (foot != null && foot < 0.4) ? `reading along — nothing's come into focus yet.` : `reading along.`;
};

// innerVoice({ signal, impressions, propositions, passageText, mutter }) → Array<{ text, register }>,
// ≤2, in reading salience order. `propositions` are the fold's grounded claims already realized to
// short natural speech (strings, or { text }); `register` is the feeling that tints them. Never
// returns empty — a quiet reading still has a line.
export const innerVoice = ({ signal = null, impressions = [], propositions = [], passageText = '', mutter = null } = {}) => {
  const reg = (mutter && mutter.register) ? mutter.register : dominantRegister(impressions);
  const out = [];

  // 1. the wander's own words about what it's reading lead verbatim.
  if (mutter && mutter.phrase) out.push({ text: String(mutter.phrase), register: mutter.register || reg });

  // 2. the ACTUAL propositions the fold parsed — the real claims flowing through, tinted by the feeling.
  for (const p of (propositions || [])) {
    if (out.length >= 2) break;
    const text = p && (typeof p === 'string' ? p : p.text);
    if (!text) continue;
    out.push({ text: String(text), register: reg });
  }

  // 3. nothing structured, but there IS a passage → voice what it is literally reading (still real content).
  if (out.length === 0 && passageText) {
    const clause = condenseClause(passageText);
    if (clause) out.push({ text: clause, register: reg });
  }

  // 4. truly idle — a spare state line, never a fabricated reaction to content.
  if (out.length === 0) {
    const hasSignal = signal && typeof signal.concentration === 'number';
    out.push({ text: hasSignal ? alongLine(signal) : RESTING, register: null });
  }

  return out.slice(0, 2);
};
