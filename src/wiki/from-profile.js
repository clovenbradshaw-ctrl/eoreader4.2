// EO: SIG·INS·DEF·CON(Entity → Lens,Field, Making,Tracing) — adapter: live entity profile → article
// The reader's entity dossier (rooms/reader/app/levels.js `entityProfile`) predates
// src/wiki/ and returns a flat packet — { label, defs, mentions, relations, sourceTitle,
// ... } — not an event log. This is the ONLY new logic entity-panel-terrain-hero.md's
// wiring adds: profileToEventLog maps that packet onto the typed events renderArticle
// (project.js) already knows how to fold. No new terrain math, no new absence math, no
// new projection — this module is an adapter, not an engine. Pure and synchronous: no
// I/O, no model call, unit-testable with a plain object.
//
// What this deliberately does NOT do (v1 scope — stated here so it is never silently
// assumed to be doing more; see docs/entity-panel-terrain-hero.md §2):
//
//   Multiple standing DEFs. rankProperties (levels.js) already orders `profile.defs` by
//   evidential strength. Only defs[0] becomes the DEF (lede) event. Folding every def to
//   a DEF event would let project.js's currentDef() read defs[1:] as SUPERSEDED PRIOR
//   FRAMINGS — which they are not; they are concurrent standing properties ("occupation:
//   captain" and "age: 28" are both true at once, not a revision history). Fabricating a
//   reframing that never happened is worse than not showing it, so defs[1:] fold in as
//   INS attestations instead — kept, visible, correctly typed as evidence, never as REC.
//
//   NUL (typed absence). The live profile has no "looked for and not found" signal; it
//   only reports properties that exist. The hero's "Not established" section is honestly
//   empty in v1 — never fabricated to look populated. Real absence detection is future
//   work (the spec's Build order, step 3), not invented here to make the section busier.
//
//   Terrain diversity. Every dossier subject types as Entity (Existence × Figure) — the
//   SAME terrain the reader already assigns entities elsewhere (app/wiki.js `tieredData`,
//   `topicTieredData` both hardcode `terrain: 'Entity'`). This reuses that existing
//   convention rather than inventing new terrain-detection for the panel.

import { renderArticle } from './project.js';

const t0 = (v) => (Number.isFinite(v) ? v : 0);

// profileToEventLog(profile) → a synthetic, well-formed EO event log. Pure, sync.
export const profileToEventLog = (profile) => {
  const log = [];
  let seq = 0;
  const push = (e) => log.push({ seq: seq++, ...e });

  // SIG registration — the infobox row, and the ONLY event carrying `facets`, so Entity's
  // identityKey/deriveName (terrains.js/naming.js) resolve the referent from real data
  // rather than falling back to a placeholder.
  push({
    op: 'SIG', kind: 'register',
    address: profile.label || '', at: profile.sourceTitle || null,
    facets: { referent: profile.label || '' },
    t: -1,
  });

  // defs[0] (top-ranked standing property) → the DEF lede.
  const defs = Array.isArray(profile.defs) ? profile.defs : [];
  const [topDef, ...restDefs] = defs;
  if (topDef) {
    push({
      op: 'DEF', kind: 'define', id: 'def:0',
      text: topDef.value,
      by: topDef.witnesses?.[0]?.text || null,
      t: t0(topDef.idx),
    });
  }
  // defs[1:] → INS attestations (evidence, not reframing — see module header).
  for (const d of restDefs) {
    push({
      op: 'INS', kind: 'attest', text: d.value,
      source: profile.sourceTitle || null, span: d.witnesses?.[0]?.text || null,
      t: t0(d.idx),
    });
  }

  // mentions → INS attestations (the passages that name this figure).
  for (const m of (Array.isArray(profile.mentions) ? profile.mentions : [])) {
    if (!m || !m.text) continue;
    push({ op: 'INS', kind: 'attest', text: m.text, source: profile.sourceTitle || null, span: null, t: t0(m.idx) });
  }

  // relations → CON relation events (the bonds this figure carries).
  for (const r of (Array.isArray(profile.relations) ? profile.relations : [])) {
    if (!r) continue;
    push({
      op: 'CON', kind: 'relation', text: r.via || r.op || 'connects to',
      to: r.tgtLabel || null, from: r.srcLabel || null, t: t0(r.idx),
    });
  }

  return log;
};

// articleFromProfile(profile, { terrain, asOf }) → renderArticle's output, or null.
// terrain defaults to 'Entity' — see module header on why v1 does not attempt to
// distinguish other terrains for a dossier subject.
export const articleFromProfile = (profile, { terrain = 'Entity', asOf = null } = {}) => {
  if (!profile) return null;
  const log = profileToEventLog(profile);
  return renderArticle(log, terrain, asOf);
};
