// EO: INS·NUL(Void,Atmosphere → Entity, Making,Clearing) — the model-free inner voice
// The narrator (narrator.js) puts words to a twitch WITH a tiny LM. This is its twin for when no
// model is wired (phases 1–2, the common case): the same holon's job — putting WORDS to a feeling
// that has already crossed a threshold (spec §6) — done deterministically, from the geometry alone.
//
// It exists because the strip should read like a MIND, not a dashboard. A gauge ("drift 88%") is a
// metric; a mind mutters oppositions — "we've drifted far off what you asked; a lead worth
// following, or are we just lost?" Every line here is a real EITHER/OR: the tension the sense is
// actually caught in, phrased first-person and tentative, the way a thought flows through your head.
//
// The discipline is the narrator's, unchanged: it VOICES a register (spec §7), it never reports a
// number, never states a fact, never answers anything (spec §9.5). Its text is audit/legibility only
// and can never enter the answer prompt (§9.3) — a voicing, not a finding. Pure and offline: the
// grade, the rotation, and the templates are all unit-testable with a hand-fed signal, no model,
// no clock, no randomness (the caller passes a monotonic `rotate` so a run reads varied yet replays).

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Each register grades its OWN 0..1 intensity into a felt degree (0 faint · 1 clear · 2 strong) and
// splices a graded WORD into the opposition — so "drift 0.88" reads "drifted FAR off", not a bar at
// 88%. Same information the gauge carried; prose, not a metric. Recognition's band is compressed
// (it only fires ≥0.85), so it grades on its own tighter cutoffs.
const OPP = Object.freeze({
  // drift — the conversation's topic vs where the reading actually is (spec §5). lead ⟷ lost.
  drift: {
    grade: (x) => (x < 0.66 ? 0 : x < 0.82 ? 1 : 2),
    heat: ['a little', 'well', 'far'],
    say: [
      (h) => `we've drifted ${h} off what you asked — a lead worth following, or are we just lost?`,
      (h) => `we're ${h} off the question now. chasing something real, or only wandering?`,
      (h) => `that pulled us ${h} off track — a thread to pull, or is it time to turn back?`,
    ],
  },
  // unease — drift over thin footing (spec §5 caveat). trust ⟷ doubt.
  unease: {
    grade: (x) => (x < 0.62 ? 0 : x < 0.78 ? 1 : 2),
    heat: ['thin', 'loose', 'giving way'],
    say: [
      (h) => `the ground's ${h} underfoot — do I trust this, or hold back?`,
      (h) => `something's off; the footing's ${h}. believe it, or wait?`,
      (h) => `not sure of where we've landed — the ground's ${h}. sure enough, or reaching?`,
    ],
  },
  // surprise — a semantic-novelty spike (spec §7). genuinely new ⟷ too neat to trust.
  surprise: {
    grade: (x) => (x < 0.68 ? 0 : x < 0.82 ? 1 : 2),
    heat: ['unfamiliar', 'new', 'wholly new'],
    say: [
      (h) => `this is ${h} to me — real new ground, or just something I hadn't met yet?`,
      (h) => `didn't see that coming; it reads ${h}. a find, or a claim too neat to trust?`,
      (h) => `${h} territory here — worth digging into, or too good to be true?`,
    ],
  },
  // recognition — this reading sits on an earlier turn's (spec §7). the same ⟷ only rhyming.
  recognition: {
    grade: (x) => (x < 0.9 ? 0 : x < 0.95 ? 1 : 2),
    heat: ['near', 'close to', 'right on top of'],
    say: [
      (h) => `this sits ${h} an earlier passage — the same thing again, or only rhyming with it?`,
      (h) => `we've circled back ${h} something I read before. a real repeat, or just an echo?`,
      (h) => `familiar ground — ${h} an earlier read. genuinely the same, or my mind matching patterns?`,
    ],
  },
  // the wander registers (murmur/learn) usually arrive WITH a phrase already (the murmur's own words
  // for what caught it); the inner voice yields to that. These fire only if the register is raised
  // without a voiced phrase — still an opposition, never a bare label.
  curiosity: {
    grade: () => 1, heat: ['', '', ''],
    say: [() => `something here keeps catching me — worth turning over, or a passing snag?`],
  },
  outward: {
    grade: () => 1, heat: ['', '', ''],
    say: [() => `there's a thread here I could chase — follow it out, or stay with the page?`],
  },
  discovery: {
    grade: () => 1, heat: ['', '', ''],
    say: [() => `I just read something new — does it change the picture, or only fill it in?`],
  },
});

// The quiet mind still carries the faintest opposition: the pull that ISN'T there yet. Graded off
// the footing/drift the geometry reports even when nothing crossed a trigger — so a silent strip
// still reads like attention, not an idle widget.
const alongLine = (signal) => {
  const foot = signal && typeof signal.concentration === 'number' ? signal.concentration : null;
  const drift = signal && typeof signal.drift === 'number' ? signal.drift : null;
  if (foot != null && foot < 0.4) return `reading along, though the footing's a little loose — nothing pulling yet, but I'm watching it.`;
  if (drift != null && drift > 0.4) return `reading along — easing off the question a touch, nothing I'd call a wander yet.`;
  return `reading along — on the question, ground solid enough. nothing tugging either way.`;
};

const RESTING = `still — nothing pulling one way or the other. just reading along.`;

// innerVoice({ signal, impressions, mutter, rotate }) → Array<{ text, register }>, ≤2, most-felt
// first. A thought that already carries WORDS (a wander mutter / a wired narrator) leads verbatim —
// those are the murmur's own words. The rest are synthesized oppositions off the crossed registers.
// `rotate` (a monotonic int the caller supplies) picks the phrasing so a session reads varied and a
// replay is exact. Never returns empty — the quiet mind still has a line.
export const innerVoice = ({ signal = null, impressions = [], mutter = null, rotate = 0 } = {}) => {
  const active = (impressions || [])
    .filter((i) => i && typeof i.decayedIntensity === 'number' && i.decayedIntensity > 0.02)
    .slice()
    .sort((a, b) => b.decayedIntensity - a.decayedIntensity);

  const out = [];
  const seen = new Set();
  let r = Number.isFinite(rotate) ? Math.abs(Math.trunc(rotate)) : 0;

  // a live wander/narrator phrase IS the prose — put it first, in its own words.
  const voiced = mutter && mutter.phrase ? String(mutter.phrase) : null;
  if (voiced) { out.push({ text: voiced, register: mutter.register || 'curiosity' }); seen.add(mutter.register); }

  for (const imp of active) {
    if (out.length >= 2) break;
    const reg = imp.register;
    if (seen.has(reg)) continue;
    if (imp.phrase && String(imp.phrase) !== voiced) { out.push({ text: String(imp.phrase), register: reg }); seen.add(reg); continue; }
    const opp = OPP[reg];
    if (!opp) continue;
    const g = opp.grade(imp.decayedIntensity);
    const heatWord = opp.heat[Math.max(0, Math.min(opp.heat.length - 1, g))];
    out.push({ text: opp.say[r % opp.say.length](heatWord), register: reg });
    seen.add(reg);
    r += 1;
  }

  if (out.length === 0) {
    const hasSignal = signal && (typeof signal.concentration === 'number' || typeof signal.drift === 'number');
    out.push({ text: hasSignal ? alongLine(signal) : RESTING, register: null });
  }

  return out.slice(0, 2);
};
