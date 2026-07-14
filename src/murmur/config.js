// EO: NUL(Kind → Kind, Clearing) — murmur config (thresholds, decay, membrane flags)
// The one place the peripheral sense is tuned. Every number here is a threshold the
// replay harness (tests/murmur-replay.test.js) has to earn: no register or trigger
// ships unless a recorded failure would have fired it AND the phatic/clean control
// stays silent (spec §12, "earn your trigger"). Start conservative — precision over
// recall — and loosen only against replay evidence.
//
// membrane.* are the firewall flags (spec §9, §11). They MUST default false in the
// phase-1/2 build: murmur is audit-only until a steer channel is wired, and it never
// edits the answer prompt. tests/murmur-membrane.test.js asserts these two stay false.

export const MURMUR = Object.freeze({
  enabled: true,

  sense: Object.freeze({
    updateEvery: 'fold-stop',   // when `sense` recomputes — one snapshot per fold stop
    lambdaDecay: 0.15,          // e^(−λ·ageSeconds); older impressions fade (spec §8)
    ttlMs: 45000,               // hard expiry — impressions are perishable (spec §4, §8)
    historyTurns: 24,           // prior-turn reading centroids kept for novelty/recognition
    topicDecay: 0.25,           // EMA weight folding a fresh on-topic query into the anchor
    topicShiftFloor: 0.35,      // cos(query, topic) below this on a CONTENT query = a genuine
                                // topic shift (relocate the anchor), not drift (spec §14)
    deicticMaxWords: 4,         // a query this short (in content words) is treated as deictic
  }),

  // Start conservative; earn each in replay (spec §11). Signals are 0..1.
  triggers: Object.freeze({
    driftNarrate: 0.55,         // drift ≥ → `drift`/`unease` register raised
    concentrationFloor: 0.20,   // concentration below → contributes `unease`
    noveltyNarrate: 0.60,       // novelty ≥ → `surprise` register raised
    recognitionFloor: 0.85,     // cos to a prior turn ≥ → `recognition`
    streamHold: 0.70,           // decayedIntensity ≥ → hold the stream for the checkers
  }),

  narrator: Object.freeze({
    maxTokens: 32,              // hard output cap — a mutter, not an analysis (spec §6)
    refractoryMs: 3000,         // after firing on a ref, mute the narrator for it (spec §8) — brisk
  }),

  // SELF-GUIDED LEARNING (murmur/learn, docs/murmur.md). At rest the sense WANDERS: it looks at the
  // most interesting place in the reading, mutters it, and keeps a NOTE (a toggleable graph layer).
  // `internet` is the LICENSE to reach the web — OFF by default: the murmur looks and thinks about
  // what's interesting without any network until the user opts in (a Settings mode). `minStepMs` is
  // the HUMAN PACE — at least this long between wander steps, so it reads at a person's speed, not a
  // machine's. Notes are always reafferent (canWitness===false); this block tunes WHEN, never the
  // firewall (the membrane below still governs the log/prompt).
  learn: Object.freeze({
    enabled: true,              // the wander runs at rest (still gated on the strip being VISIBLE)
    internet: false,            // reach the web only when the user opts into "explore" (opt-in)
    curiosityFloor: 0.08,       // bits below which a place taught nothing new → not learned
    minStepMs: 7000,            // ≥7s between wander steps — brisk pace, not a leisurely read
    maxNotes: 200,              // the notebook / graph-layer cap
    hopsPerReach: 1,            // web leads followed per outward reach — ONE thread, never a fan-out
  }),

  // The membrane (spec §9, §11). These are the load-bearing invariants; they must stay
  // false through phases 1–3. A steer channel (phase 2 wiring) flips canAppendLog true
  // ONLY once the projection's steer consumer exists; canEditPrompt is never true.
  membrane: Object.freeze({
    canAppendLog: false,
    canEditPrompt: false,
  }),
});

// A shallow, validated override — merge a partial config over the defaults without
// letting a caller resurrect a forbidden membrane flag by accident. The membrane is
// frozen to the defaults unless EXPLICITLY overridden, and even then canEditPrompt is
// pinned false (spec §9.3: no murmur text ever enters the answer prompt).
export const murmurConfig = (over = {}) => Object.freeze({
  enabled: over.enabled ?? MURMUR.enabled,
  sense: Object.freeze({ ...MURMUR.sense, ...(over.sense || {}) }),
  triggers: Object.freeze({ ...MURMUR.triggers, ...(over.triggers || {}) }),
  narrator: Object.freeze({ ...MURMUR.narrator, ...(over.narrator || {}) }),
  learn: Object.freeze({ ...MURMUR.learn, ...(over.learn || {}) }),
  membrane: Object.freeze({
    canAppendLog: over.membrane?.canAppendLog === true,   // opt-in only
    canEditPrompt: false,                                  // never, by construction
  }),
});
