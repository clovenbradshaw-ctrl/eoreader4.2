// EO: DEF(Void → Field, Clearing) — the perceiver contract (docs/omnimodal-waveform.md §2)
// A Reading is the entire vocabulary the deviation-waveform core is allowed to see.
// Modality lives here, in the perceiver, and is gone by the time a Reading crosses
// into src/weave/waveform/ — no function past this seam may branch on modality.
//
// This module owns two things: the shape (documented below, enforced nowhere but in
// prose — plain JS, no TS) and the seam (validateReading), which is enforced. A
// Reading that fails validation never reaches buildWaveform.
//
// Reading {
//   units:      Unit[]                          ordered, ordinal-indexed
//   metric:     (a:Field, b:Field) => number     deviation between two fields; 0 at f,f
//   segments:   Segment[]                        the perceiver's proposed labeled structure
//   referents:  Referent[]                       the cast — recurring identities found
//   sightings:  Sighting[]                       per-unit presence of referents
//   vocab:      RoleVocab                        display words for the three invariant roles
//   resolve:    (span:Span) => SourceLocator     provenance back to bytes/samples/rows
//   meta:       { modality:string, perceiverVersion:string }
// }
//
// Unit { id:string, ordinal:int, span:Span, field:Field, weight?:number }
// Field = number[]  — fixed length within a Reading; meaning is perceiver-private.
// Segment { start:int, end:int, label:string, level:'coarse'|'fine' }
// Referent { key:string, display_name:string }
// Sighting { referent:string, ordinal:int, role:Role, evidence?:number }
// Role = 'FOREGROUND' | 'PRESENT' | 'LATENT'
// RoleVocab { FOREGROUND:string, PRESENT:string, LATENT:string }
//
// The three roles are structural, not semantic (§2.1): FOREGROUND is the identity
// the unit is OF (full mass); PRESENT is in the unit but not foregrounded (partial
// mass); LATENT is oriented-toward but not sounding — referred to, awaited, implied,
// forecast (coupling, never mass — the mechanism that produces a protogon).
//
// What the contract deliberately EXCLUDES (§2.2): a perceiver never emits strain,
// surprise, frames, turns, echoes, referent types, or confidence. Those are all
// core-derived. A perceiver that pre-computes them is where modality would leak
// back in, and is rejected in review, not just here.

export const ROLES = Object.freeze({
  FOREGROUND: 'FOREGROUND',
  PRESENT: 'PRESENT',
  LATENT: 'LATENT',
});

const isFiniteNum = (x) => typeof x === 'number' && Number.isFinite(x);

// A single readable failure — a validateReading caller needs to know WHAT broke and
// WHERE, not just that the Reading is bad (accountable loss extends to the seam
// itself: a rejected Reading is a typed rejection, not a silent false).
const fail = (errors, code, detail) => errors.push({ code, detail });

// Sample a handful of (field,field) pairs to check metric(f,f)≈0 and symmetry,
// rather than every pair (O(n) is enough to catch a broken metric; O(n²) is not
// the seam's job — buildWaveform's own use of metric will surface a pathological
// one downstream anyway).
const METRIC_SAMPLE = 8;
const METRIC_EPS = 1e-6;

export const validateReading = (reading) => {
  const errors = [];
  if (!reading || typeof reading !== 'object') {
    return { ok: false, errors: [{ code: 'not-an-object', detail: null }] };
  }

  const units = Array.isArray(reading.units) ? reading.units : null;
  if (!units) fail(errors, 'units-missing', null);
  else {
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u || u.ordinal !== i) fail(errors, 'ordinal-not-contiguous', { index: i, ordinal: u && u.ordinal });
      if (!u || !Array.isArray(u.field)) fail(errors, 'field-missing', { ordinal: i });
    }
    // Every field vector shares one length.
    const lens = new Set(units.filter((u) => Array.isArray(u && u.field)).map((u) => u.field.length));
    if (lens.size > 1) fail(errors, 'field-length-mismatch', { lengths: [...lens] });
  }

  if (typeof reading.metric !== 'function') fail(errors, 'metric-missing', null);
  else if (units && units.length) {
    const sampleAt = (k) => units[k % units.length].field;
    for (let i = 0; i < Math.min(METRIC_SAMPLE, units.length); i++) {
      const f = sampleAt(i);
      if (!Array.isArray(f)) continue;
      let self = null, cross = null, crossRev = null;
      try { self = reading.metric(f, f); } catch { self = NaN; }
      if (!isFiniteNum(self) || Math.abs(self) > METRIC_EPS) {
        fail(errors, 'metric-not-zero-at-self', { ordinal: i, value: self });
      }
      const g = sampleAt(i + 1);
      if (Array.isArray(g) && g !== f) {
        try { cross = reading.metric(f, g); crossRev = reading.metric(g, f); } catch { cross = NaN; crossRev = NaN; }
        if (!isFiniteNum(cross) || !isFiniteNum(crossRev) || Math.abs(cross - crossRev) > METRIC_EPS) {
          fail(errors, 'metric-not-symmetric', { ordinal: i, forward: cross, backward: crossRev });
        }
      }
    }
  }

  const segments = Array.isArray(reading.segments) ? reading.segments : [];
  const n = units ? units.length : 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const boundsOk = s && Number.isInteger(s.start) && Number.isInteger(s.end)
      && s.start >= 0 && s.end <= n && s.start < s.end;
    if (!boundsOk) fail(errors, 'segment-out-of-range', { index: i, segment: s });
    if (s && s.level !== 'coarse' && s.level !== 'fine') fail(errors, 'segment-level-invalid', { index: i, level: s && s.level });
  }

  const referentKeys = new Set((Array.isArray(reading.referents) ? reading.referents : []).map((r) => r && r.key));
  const sightings = Array.isArray(reading.sightings) ? reading.sightings : [];
  for (let i = 0; i < sightings.length; i++) {
    const s = sightings[i];
    if (!s || !Number.isInteger(s.ordinal) || s.ordinal < 0 || s.ordinal >= n) {
      fail(errors, 'sighting-ordinal-out-of-range', { index: i, sighting: s });
    }
    if (!s || !referentKeys.has(s.referent)) {
      fail(errors, 'sighting-referent-unresolved', { index: i, referent: s && s.referent });
    }
    if (!s || (s.role !== ROLES.FOREGROUND && s.role !== ROLES.PRESENT && s.role !== ROLES.LATENT)) {
      fail(errors, 'sighting-role-invalid', { index: i, role: s && s.role });
    }
  }

  if (typeof reading.resolve !== 'function') fail(errors, 'resolve-missing', null);
  else if (units && units.length) {
    try {
      const probe = units[0].span;
      const loc = reading.resolve(probe);
      if (loc == null) fail(errors, 'resolve-returned-nothing', { span: probe });
    } catch (e) {
      fail(errors, 'resolve-threw', { message: String(e && e.message || e) });
    }
  }

  if (!reading.vocab || !reading.vocab.FOREGROUND || !reading.vocab.PRESENT || !reading.vocab.LATENT) {
    fail(errors, 'vocab-incomplete', { vocab: reading.vocab });
  }

  return { ok: errors.length === 0, errors };
};

// Convenience: validate and throw with the accumulated errors serialized, for
// callers (perceivers, tests) that want a hard fail instead of a result object.
export const assertReading = (reading) => {
  const { ok, errors } = validateReading(reading);
  if (!ok) {
    throw new Error(`validateReading: rejected — ${errors.map((e) => `${e.code}${e.detail ? ' ' + JSON.stringify(e.detail) : ''}`).join('; ')}`);
  }
  return reading;
};
