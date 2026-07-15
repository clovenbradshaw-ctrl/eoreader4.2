// EO: REC·EVA·NUL(Lens → Paradigm,Void, Composing,Tracing,Clearing) — a fold against its past
// fold-delta.js — what CHANGED between two runs of the same fold.
//
// Everything in this engine is a recomputed projection of an append-only log, so a saved fold is
// never stale — re-running it against a grown corpus is free. This module makes the DIFFERENCE
// between the old run and the new one a first-class object, so a standing Rashomon comparison or
// transmission can say what moved since you last looked: a conflict that appeared, one that
// resolved, an agreement gained or lost, an idea that spread to another voice or newly mutated.
//
// Pure: (prev, curr) → delta. `prev`/`curr` are the surface-safe projections the reader app
// returns (rashomon* → conflict/shared/divergent; transmission* → ideas). Keyed on the stable
// text those projections already carry, so the delta needs no ids and survives a re-parse.

const conflictKey = (c) => `${c.subject}∷${c.a}∷${c.b}`;
const norm = (s) => String(s ?? '').trim();
const minus = (a, b, key) => { const bs = new Set(b.map(key)); return a.filter((x) => !bs.has(key(x))); };

// ── Compare-mode delta (two figures diffed) ───────────────────────────────────────────
export const compareDelta = (prev, curr) => {
  const p = prev || { conflict: [], shared: [], divergent: [] };
  const c = curr || { conflict: [], shared: [], divergent: [] };
  const newConflicts = minus(c.conflict, p.conflict, conflictKey);
  const resolved = minus(p.conflict, c.conflict, conflictKey);
  const newAgreements = minus(c.shared, p.shared, (x) => norm(x.text));
  const lostAgreements = minus(p.shared, c.shared, (x) => norm(x.text));
  const newDivergent = minus(c.divergent, p.divergent, (x) => norm(x.subject));
  const summary = [];
  if (newConflicts.length) summary.push(`${newConflicts.length} new conflict${newConflicts.length > 1 ? 's' : ''}`);
  if (resolved.length) summary.push(`${resolved.length} resolved`);
  if (newAgreements.length) summary.push(`${newAgreements.length} new agreement${newAgreements.length > 1 ? 's' : ''}`);
  if (lostAgreements.length) summary.push(`${lostAgreements.length} agreement${lostAgreements.length > 1 ? 's' : ''} lost`);
  if (newDivergent.length) summary.push(`${newDivergent.length} newly divergent`);
  return {
    kind: 'compare', changed: summary.length > 0,
    newConflicts, resolved, newAgreements, lostAgreements, newDivergent,
    counts: { newConflicts: newConflicts.length, resolved: resolved.length, newAgreements: newAgreements.length, lostAgreements: lostAgreements.length, newDivergent: newDivergent.length },
    summary: summary.length ? summary.join(' · ') : 'no change since you saved this',
  };
};

// ── Trace-mode delta (an idea's circulation) ──────────────────────────────────────────
const flips = (idea) => (idea.hops || []).filter((h) => h.relation === 'flipped').length;
export const traceDelta = (prev, curr) => {
  const p = prev || { ideas: [] };
  const c = curr || { ideas: [] };
  const prevBy = new Map((p.ideas || []).map((i) => [norm(i.text), i]));
  const newIdeas = (c.ideas || []).filter((i) => !prevBy.has(norm(i.text)));
  const spread = [], newlyMutated = [];
  for (const i of c.ideas || []) {
    const was = prevBy.get(norm(i.text));
    if (!was) continue;
    if ((i.hops || []).length > (was.hops || []).length) spread.push(i);   // reached another voice
    if (flips(i) > flips(was)) newlyMutated.push(i);                        // inverted by a new voice
  }
  const summary = [];
  if (newIdeas.length) summary.push(`${newIdeas.length} new idea${newIdeas.length > 1 ? 's' : ''} changed hands`);
  if (spread.length) summary.push(`${spread.length} spread further`);
  if (newlyMutated.length) summary.push(`${newlyMutated.length} newly mutated`);
  return {
    kind: 'trace', changed: summary.length > 0,
    newIdeas, spread, newlyMutated,
    counts: { newIdeas: newIdeas.length, spread: spread.length, newlyMutated: newlyMutated.length },
    summary: summary.length ? summary.join(' · ') : 'no change since you saved this',
  };
};

// Dispatch by result shape — a transmission carries `ideas`, a comparison carries `conflict`.
export const foldDelta = (prev, curr) =>
  (curr && Array.isArray(curr.ideas)) || (prev && Array.isArray(prev.ideas))
    ? traceDelta(prev, curr) : compareDelta(prev, curr);
