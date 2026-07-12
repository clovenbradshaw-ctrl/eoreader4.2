// EO: NUL·SIG(Void,Entity → Void,Entity, Clearing,Tending) — the working feel + anti-rumination
// The short ring buffer of live impressions (the "working feel", spec §4) and the guards that
// keep a cheap continuous loop from spiralling (spec §8). Human inner monologue loops the same
// worry, amplifying it; an unguarded loop mistakes repetition for evidence. The guards:
//
//   · Decay          decayedIntensity = intensity · e^(−λ·ageSeconds); old impressions fade.
//   · No compounding a repeat of the SAME register about the SAME ref does not sum — the tenth
//                    "something's off" is the same alarm ringing, not ten times the evidence.
//                    Collapse to one live impression; refresh ts, DO NOT raise intensity.
//   · Refractory     after the narrator fires on a ref, mute it for a cooldown window.
//   · Perishability  ttl expiry drops impressions regardless of intensity.
//
// Impressions never persist beyond the session and are promotable to nothing (credence floor).

// The impression shape (spec §4). `phrase` is null until/unless the narrator wakes.
const makeImpression = ({ register, intensity, source, ref, vector = null, ts, ttl }) => ({
  kind: 'impression',            // NEVER "assertion" / "claim" / "event" (spec §9.1)
  register,
  intensity,                     // pre-decay
  decayedIntensity: intensity,   // recomputed on read (spec §8)
  source,                        // 'geometry' | 'narrator'
  phrase: null,
  ref,
  vector,
  ts,
  ttl,
});

// refKey — dedup identity: one live impression per (register, ref). Same register about the
// same step is the same alarm (spec §8, "no compounding").
const refKey = (register, ref) =>
  `${register}::${ref?.turnId ?? '?'}::${ref?.stepName ?? '?'}`;

export const decayed = (imp, now, lambda) => {
  const ageSec = Math.max(0, (now - imp.ts) / 1000);
  return imp.intensity * Math.exp(-lambda * ageSec);
};

// createWorkingFeel({ capacity, lambdaDecay, ttlMs, refractoryMs, now })
// `now` is injectable so replay/tests are deterministic (the codebase forbids Date.now in
// some harnesses; here it defaults to Date.now for live use).
export const createWorkingFeel = ({
  capacity = 64, lambdaDecay = 0.15, ttlMs = 45000, refractoryMs = 8000,
  now = () => Date.now(),
} = {}) => {
  const live = new Map();          // refKey → impression
  const narratorFiredAt = new Map(); // refKey → ts of last narrator fire (refractory)

  const prune = (t) => {
    for (const [k, imp] of live) if (t - imp.ts > imp.ttl) live.delete(k);
  };

  // Raise (or refresh) an impression. Returns the live impression. NO compounding: on a
  // duplicate we refresh the timestamp (so decay resets — the alarm is "still ringing") but
  // keep the existing intensity; a stronger reading may only RAISE the recorded intensity to
  // the max seen, never accumulate it.
  const raise = ({ register, intensity, source = 'geometry', ref, vector = null }) => {
    const t = now();
    prune(t);
    const key = refKey(register, ref);
    const existing = live.get(key);
    if (existing) {
      // Spec §8: refresh the timestamp (reset decay — the alarm is "still ringing"), but do NOT
      // raise the intensity. Not Math.max: a stronger LATER reading of the same worry must not
      // amplify it either — that is the rumination the guard exists to prevent.
      existing.ts = t;
      existing.decayedIntensity = existing.intensity;
      if (source === 'narrator') existing.source = source;
      return existing;
    }
    const imp = makeImpression({ register, intensity, source, ref, vector, ts: t, ttl: ttlMs });
    live.set(key, imp);
    // Bound the ring — evict the faintest (by decayed intensity) when over capacity.
    if (live.size > capacity) {
      let weakestKey = null, weakest = Infinity;
      for (const [k, v] of live) { const d = decayed(v, t, lambdaDecay); if (d < weakest) { weakest = d; weakestKey = k; } }
      if (weakestKey) live.delete(weakestKey);
    }
    return imp;
  };

  // The current working feel — non-expired impressions with decayedIntensity recomputed,
  // strongest first. Read-only projection; callers must not mutate.
  const feel = () => {
    const t = now();
    prune(t);
    return [...live.values()]
      .map(imp => ({ ...imp, decayedIntensity: decayed(imp, t, lambdaDecay) }))
      .sort((a, b) => b.decayedIntensity - a.decayedIntensity);
  };

  // The strongest live decayed intensity (0 when nothing is felt) — feeds the stream-hold
  // decision (spec §10).
  const peakIntensity = () => { const f = feel(); return f.length ? f[0].decayedIntensity : 0; };

  // Refractory gate for the narrator (spec §8): may it speak about this ref right now?
  const narratorMuted = (ref) => {
    const t = now();
    for (const reg of ['unease', 'surprise', 'drift', 'recognition']) {
      const last = narratorFiredAt.get(refKey(reg, ref));
      if (last != null && t - last < refractoryMs) return true;
    }
    return false;
  };
  const noteNarratorFired = (register, ref) => { narratorFiredAt.set(refKey(register, ref), now()); };

  return { raise, feel, peakIntensity, narratorMuted, noteNarratorFired,
           get size() { return live.size; }, clear() { live.clear(); narratorFiredAt.clear(); } };
};
