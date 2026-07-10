// EO: SYN·SEG(Link → Network, Composing,Unraveling) — arc of an identity
// Trajectory — the arc of one identity's relations across a sequence, segmented at the
// frame-breaks, with the change read off as a delta. (the omnimodal "what changed")
//
// This is what to DO with a salient, time-ordered, REC-segmented surf. A "summary" of an arc
// is not a compression of its words — it is the answer to a structural question: how did the
// FOCUS's situation change across the SEQUENCE? That question is modality-independent, and so
// is everything this reads to answer it:
//
//   focus     an IDENTITY (an object file) — the warmest figure the surf settled on. Not a
//             person: a tracked object in video, a voice in audio, a channel in a sensor feed.
//   ordering  the arrow of time — the log's own order (sentIdx / event order). Plot order in a
//             story, frame order in video, sample order in a stream.
//   relations the focus's CON/SIG bonds — operators, not verbs. Spatial relations between
//             objects, harmonic relations between voices, couplings between channels.
//   turns     the REC frame-breaks — where the reading RESTRUCTURED. Plot reversals, shot
//             cuts, key changes, regime shifts / change-points. The segment boundaries.
//
// So this reads ONLY the event log (operator events) and a set of segment cursors (the surf's
// RECs). It never touches words. The same function that yields "Grete fed Gregor → [turn] →
// Grete renounced Gregor" yields, on a sensor stream, "X coupled to Y, rising → [change-point]
// → X decoupled" — because both are the same structure: an identity's couplings, segmented at
// the restructurings, differenced end to end. That is why the trajectory is omnimodal and the
// surface rendering (speakTrajectory, natural language) is a thin, replaceable last step.

// resolve a focus (a label, a name word, or an id) to an entity id, like traverse.js's cursor:
// id → exact label → a NAME WORD it contains ("Grete" → "Grete Samsa").
const resolveFocus = (focus, label) => {
  if (focus == null) return null;
  if (label.has(focus)) return focus;
  const f = String(focus).toLowerCase();
  for (const [id, lab] of label) if (String(lab).toLowerCase() === f) return id;
  for (const [id, lab] of label) if (String(lab).toLowerCase().split(/\s+/).includes(f)) return id;
  return focus;
};

// trajectory(doc, { focus, segments }) → the focus's relational arc, segmented at the turns.
//   focus     the identity to track (label/name/id). Null tracks the whole graph (every bond).
//   segments  the segment-boundary cursors — the surf's REC frame-breaks (surfFold.recCursors).
//             A bond at order t falls in the phase counting how many boundaries it is past.
// Returns { focus, focusId, phases, gained, lost, turns }:
//   phases    [{ phase, span:[lo,hi], relations:[{at, role, via, other}] }] — the focus's
//             couplings in each segment, in time order. role: is the focus the src or the tgt.
//   gained    relations the LAST phase holds that the FIRST did not — what the arc moved TO.
//   lost      relations the FIRST phase held that the LAST does not — what the arc moved FROM.
//   turns     the segment boundaries (the REC cursors), the restructurings the change pivots on.
// Modality-blind: reads e.op (CON/SIG), e.via (the relation), e.src/e.tgt (the coupled
// identities), e.sentIdx (the order). No lexicon, no surface — the omnimodal product.
export const trajectory = (doc, { focus = null, segments = [] } = {}) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, e.label);
  const L = (id) => label.get(id) ?? id;
  const focusId = resolveFocus(focus, label);

  // every bond the focus is party to, in the arrow-of-time order the reading constituted it.
  const bonds = [];
  for (const e of events) {
    if (!((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null)) continue;
    if (focusId != null && e.src !== focusId && e.tgt !== focusId) continue;
    const role = e.src === focusId ? 'subj' : (e.tgt === focusId ? 'obj' : 'subj');
    const otherId = role === 'subj' ? e.tgt : e.src;
    bonds.push({ at: e.sentIdx ?? 0, role, via: String(e.via), other: otherId != null ? L(otherId) : null });
  }
  bonds.sort((a, b) => a.at - b.at);

  // segment at the turns: a bond at order `at` is in the phase = how many boundaries precede it.
  const cuts = [...new Set(segments)].filter((c) => Number.isFinite(c)).sort((a, b) => a - b);
  const phaseIndex = (at) => { let p = 0; for (const c of cuts) if (at >= c) p += 1; return p; };
  const byPhase = new Map();
  for (const b of bonds) {
    const p = phaseIndex(b.at);
    if (!byPhase.has(p)) byPhase.set(p, { phase: p, span: [b.at, b.at], relations: [] });
    const ph = byPhase.get(p);
    ph.relations.push(b);
    ph.span[0] = Math.min(ph.span[0], b.at);
    ph.span[1] = Math.max(ph.span[1], b.at);
  }
  const phases = [...byPhase.values()].sort((a, b) => a.phase - b.phase);

  // the CHANGE: difference the first and last phase's relation sets. A relation is keyed by
  // (role, relation, other identity) so "subj:fed:gregor" and "subj:renounced:gregor" are
  // distinct — the delta is what the focus does/undergoes at the end but not the start.
  const key = (b) => `${b.role}:${b.via}:${b.other ?? ''}`.toLowerCase();
  const setOf = (ph) => new Set((ph?.relations || []).map(key));
  const firstSet = setOf(phases[0]);
  const lastSet = setOf(phases[phases.length - 1]);
  const pick = (ph, keep) => (ph?.relations || []).filter((b) => keep(key(b)));
  const gained = phases.length > 1 ? dedupe(pick(phases[phases.length - 1], (k) => !firstSet.has(k))) : [];
  const lost = phases.length > 1 ? dedupe(pick(phases[0], (k) => !lastSet.has(k))) : [];

  // The trajectory is a regularity OVER links — a pattern of relations across the sequence —
  // so on the Site face it is a NETWORK (Structure × Pattern). Each individual bond it reads is
  // a LINK (Structure × Figure). Naming the terrain is the omnimodal fix: the engine now knows
  // it is producing a Network here, in any modality, not an untyped 'Entity'.
  return Object.freeze({
    focus: focusId != null ? L(focusId) : null, focusId, phases, gained, lost, turns: cuts,
    terrain: 'Network', linkTerrain: 'Link',
  });
};

const dedupe = (bonds) => {
  const seen = new Set();
  const out = [];
  for (const b of bonds) { const k = `${b.role}:${b.via}:${b.other ?? ''}`.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(b); } }
  return out;
};

// speakTrajectory(traj) → a natural-language rendering of the arc. The THIN, replaceable last
// step: the trajectory itself is the modality-blind product; this is one way to voice it. A
// vision or audio front-end would render the same structure differently (a montage, a motif
// diff) — the synthesis above does not change.
export const speakTrajectory = (traj) => {
  if (!traj || !traj.phases.length) return null;
  const f = traj.focus || 'it';
  const say = (b) => `${b.via}${b.other ? ' ' + b.other : ''}`;
  const phaseText = traj.phases.map((ph) =>
    `${dedupe(ph.relations).filter((b) => b.role === 'subj').map(say).join(', ') || '—'}`);
  const arc = phaseText.filter(Boolean).join(' → ');
  const moved = traj.gained.length
    ? ` By the end ${f} ${traj.gained.filter((b) => b.role === 'subj').map(say).join(', ') || 'is changed'}, where at the start ${f} ${traj.lost.filter((b) => b.role === 'subj').map(say).join(', ') || 'did not'}.`
    : '';
  return `${f}: ${arc}.${moved}`.replace(/\s+/g, ' ').trim();
};
