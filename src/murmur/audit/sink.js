// EO: INS·NUL·SIG(Void,Entity,Atmosphere → Atmosphere,Entity, Making,Tending,Clearing) — the impression sink
// The impression stream sink — writes rooms/audit ONLY (spec §3). Every impression is flushed
// here as marginalia tagged `impression`; nothing here reaches the append-only record. This is
// the safe terminus for the impressions that DON'T collapse (spec §4a, §9.1): they inform the
// human-legible monologue and die with the session.
//
// The sink is deliberately incapable of the dangerous write. It records via the audit turn's
// `step()` channel (marginalia) or its own session ring, and it REFUSES any object that is not
// tagged `impression` (or a steer's audit shadow) — an assertion/claim can never pass through
// (spec §9.1). It has no handle to a grounded-event append path.

const OK_KINDS = new Set(['impression', 'steer']);

// createImpressionSink({ audit, capacity })
//   audit:    optional rooms/audit log (createAuditLog) — when present, impressions are written
//             as a `murmur` marginalia step on the current turn. Absent → ring-only (replay).
export const createImpressionSink = ({ audit = null, capacity = 500 } = {}) => {
  const stream = [];   // the session marginalia ring (export/inspection)

  const accept = (rec) => {
    // The firewall (spec §9.1): the sink only ever holds impressions / steer shadows. Anything
    // that smells like a grounded event is rejected loudly — this is a bug in the caller.
    if (!rec || !OK_KINDS.has(rec.kind)) {
      throw new Error(`murmur/audit: refused to sink a non-impression record (kind=${rec?.kind}) — impressions never become evidence`);
    }
    stream.push(rec);
    while (stream.length > capacity) stream.shift();
    return rec;
  };

  // Flush the working-feel snapshot (and any narrator phrase) onto an audit turn as marginalia.
  // `turn` is the rooms/audit turn object (has .step). Safe to call with turn=null (ring-only).
  const flush = (turn, impressions = [], extra = {}) => {
    const tagged = (impressions || []).map(imp => accept({ ...imp, tag: 'impression' }));
    const marginalia = {
      tag: 'impression',
      count: tagged.length,
      registers: tagged.map(i => ({ register: i.register, decayedIntensity: round3(i.decayedIntensity), source: i.source, phrase: i.phrase ?? null })),
      ...extra,
    };
    // rooms/audit ONLY — a step is marginalia, never a grounded/citable event (spec §9.1).
    if (turn && typeof turn.step === 'function') {
      try { turn.step('murmur', marginalia); } catch { /* the sense must never cost a turn */ }
    }
    return marginalia;
  };

  // Record a steer's audit shadow (legibility) — the phrase is kept HERE for the human trail,
  // not in the prompt. Steer events themselves are appended by the orchestrator only when the
  // membrane permits; this is the audit copy.
  const noteSteer = (turn, steer) => {
    const rec = accept({ kind: 'steer', tag: 'impression', amplitude: round3(steer?.amplitude), phrase: steer?.phrase ?? null, ref: steer?.ref ?? null, ts: steer?.ts });
    if (turn && typeof turn.step === 'function') {
      try { turn.step('murmur-steer', { tag: 'impression', amplitude: rec.amplitude, phrase: rec.phrase }); } catch { /* best-effort */ }
    }
    return rec;
  };

  return { flush, noteSteer, get stream() { return stream.slice(); }, clear() { stream.length = 0; } };
};

const round3 = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x);
