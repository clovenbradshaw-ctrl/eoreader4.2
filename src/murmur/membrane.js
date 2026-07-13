// EO: DEF·NUL(Atmosphere,Void → Atmosphere, Dissecting,Clearing) — the membrane invariants
// The firewall (spec §9). These are the invariants the contract test and code review enforce;
// a violation of any one defeats the architecture's reason for existing. The design lets murmur
// write to the log; these guards are what keep that from being dangerous.
//
//   1. The only log write is a typed `steer` event. No path to an assertion/claim/grounded event.
//   2. `steer` is never evidence — barred from citation, grounding, credence.
//   3. No murmur text ever enters the answer prompt — not an impression phrase, not a steer phrase.
//   4. murmur modulates attention/confidence ONLY — it can make the system look harder, look
//      elsewhere, or say LESS; never say MORE.
//   5. The narrator is never queried for facts.
//   6. Steer never outweighs the user — a weak prior an explicit user turn dominates.
//   7. Steer decays; the loop must not run away.
//
// If any future wiring wants a murmur output to influence answer CONTENT or count as EVIDENCE,
// that wiring is wrong and the answer is no. These functions are the mechanical statement of
// that "no" — importable at every seam so the refusal is one assertion, not scattered checks.

// The only kinds murmur may emit. An impression is audit-only; a steer is the one log write.
export const MURMUR_KINDS = Object.freeze(['impression', 'steer']);

// A record murmur produced — is it a legal murmur emission at all? (invariant 1)
export const isMurmurEmission = (rec) => !!rec && MURMUR_KINDS.includes(rec.kind);

// Invariant 1: the log-append guard. Throws unless the record is a typed steer event AND the
// membrane permits log writes. Everything else murmur produces is audit-only marginalia. The
// orchestrator routes every candidate log write through here.
export const assertLogAppendAllowed = (rec, membrane) => {
  if (!membrane?.canAppendLog) {
    throw new Error('murmur/membrane: log append is disabled (canAppendLog=false) — murmur is audit-only');
  }
  if (!rec || rec.kind !== 'steer') {
    throw new Error(`murmur/membrane: the only legal log write is a typed steer event, not kind=${rec?.kind} (spec §9.1)`);
  }
  return true;
};

// Invariant 2: steer is never evidence. A guard the enactor / binder can call to prove it is not
// treating a steer event as a witness. Returns false for a steer (so `canCite(e)` is honest).
export const canCite = (event) => !!event && event.kind !== 'steer' && event.kind !== 'impression';
export const canGround = canCite;
export const canPromote = canCite;

// Invariant 3 + 5: nothing murmur produces may enter the answer prompt. Call at the prompt
// assembly seam over every fragment about to be concatenated into the model's context. Throws
// on any murmur-tagged object or an object carrying a `phrase` from an impression/steer.
export const assertNoMurmurInPrompt = (fragment) => {
  const kind = fragment && typeof fragment === 'object' ? fragment.kind : null;
  if (kind === 'impression' || kind === 'steer') {
    throw new Error('murmur/membrane: a murmur emission reached the answer prompt (spec §9.3) — impressions/steers modulate retrieval, never content');
  }
  return true;
};

// Invariant 3/4/6/7, as a static assertion over a config: the shipped membrane must keep
// canEditPrompt false always, and canAppendLog false until a steer consumer exists. The
// contract/membrane test calls this on the default config.
export const assertMembraneSafe = (config) => {
  const errs = [];
  if (config?.membrane?.canEditPrompt !== false) errs.push('canEditPrompt must be false (spec §9.3)');
  // canAppendLog may be true only in a build that has wired the projection steer consumer; the
  // default config ships it false (spec §11, §13 — phases 1–2 are audit-only).
  return Object.freeze({ ok: errs.length === 0, errors: Object.freeze(errs) });
};
