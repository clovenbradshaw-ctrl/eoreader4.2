// EO: REC·SEG(Void → Entity,Network, Composing,Unraveling) — terrain migration
// An article can change terrain (docs/terrain-typed-templates.md §7). A Void that gets
// named and bounded becomes an Entity. A Field whose rules get written down becomes a
// Network. A Lens enough people adopt becomes an Atmosphere; one that hardens into a way
// of reading everything becomes a Paradigm. This is the "as soon as something becomes
// TARGETED it becomes an Entity" dynamic, made explicit and logged.
//
// Migration is a REC event and it obeys SUPERSESSION, not overwrite (core/supersede.js):
// the old address is retained with a `supersedes` edge pointing from the new one. The
// article carries both addresses, the migration date, and what forced it. Nothing is
// rewritten — the past includes the stretch where the subject was read as a Void.
//
//   proposeMigration(article)  — READ-ONLY. Reads the log for migration signals and
//                                returns candidate target terrains with a cause and a
//                                confidence. Safe to run across the whole dataset as a
//                                probe (§7): three failed Void→Entity migrations logged
//                                in a row is a finding, not a maintenance backlog.
//   applyMigration(article, to, cause) — the ONE write: returns the REC event and the
//                                `supersedes` edge to APPEND. It touches nothing else.

import { profileOf, foldFacets, identityKeyOf } from './terrains.js';

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const has = (s) => clean(s).length > 0;
const timeOf = (e) => (Number.isFinite(e?.t) ? e.t : Number.isFinite(e?.turn) ? e.turn : e?.seq ?? 0);

// The canonical migration paths (§7). Each: from terrain, to terrain, and the SIGNAL
// that, read off the log/facets, proposes it. A signal returns a confidence in [0,1] and
// a one-line cause, or null when it does not fire.
const countEvents = (log, pred) => (Array.isArray(log) ? log : []).filter(pred).length;

const PATHS = [
  // Void → Entity: a naming that held (a bounded referent got attested and did not leak).
  {
    from: 'Void', to: 'Entity',
    signal: (article) => {
      const log = article.log || [];
      const held = log.some((e) => e.op === 'REC' && (e.kind === 'name' || e.kind === 'reframe') && e.held === true);
      const bounded = has(foldFacets(article).referent) || log.some((e) => e.op === 'SEG' && e.kind === 'boundary' && e.held === true);
      if (!held && !bounded) return null;
      const escapes = countEvents(log, (e) => e.op === 'REC' && e.held === false);
      // a naming that held raises confidence; repeated escapes LOWER it (the Emanon case)
      return { confidence: Math.max(0.15, 0.8 - 0.2 * escapes), cause: 'named and bounded — the boundary held', escapes };
    },
  },
  // Field → Network: the implicit rules got written down (fully explicitated).
  {
    from: 'Field', to: 'Network',
    signal: (article) => {
      const log = article.log || [];
      const rules = countEvents(log, (e) => e.op === 'INS' && (e.section === 'rules' || e.kind === 'attest'));
      const written = countEvents(log, (e) => e.op === 'REC' && (e.kind === 'explicitate' || e.section === 'explicitations'));
      if (!written || written < rules) return null;
      return { confidence: Math.min(0.9, 0.4 + 0.15 * written), cause: 'the unwritten rules have been written down' };
    },
  },
  // Lens → Atmosphere: adopted by ≥2 holders (a reading became weather).
  {
    from: 'Lens', to: 'Atmosphere',
    signal: (article) => {
      const log = article.log || [];
      const holders = new Set(log.filter((e) => e.op === 'REC' && e.kind === 'adopt' && has(e.by)).map((e) => clean(e.by)));
      if (holders.size < 2) return null;
      return { confidence: Math.min(0.9, 0.4 + 0.1 * holders.size), cause: `adopted by ${holders.size} holders — a reading has become weather`, holders: holders.size };
    },
  },
  // Lens → Paradigm: hardened into a way of reading everything (≥2 things it instances).
  {
    from: 'Lens', to: 'Paradigm',
    signal: (article) => {
      const log = article.log || [];
      const instanced = countEvents(log, (e) => e.op === 'REC' && e.kind === 'instances');
      if (instanced < 2) return null;
      return { confidence: Math.min(0.9, 0.4 + 0.15 * instanced), cause: 'hardened into a way of reading everything' };
    },
  },
];

// proposeMigration(article) → { terrain, identityKey, proposals: [{ to, confidence,
// cause, ... }], failedMigrations }. Read-only. `failedMigrations` counts the REC
// `held:false` escapes already logged — the Emanon signal (§7): a ground-dominant
// subject that keeps resisting figure-dominant instrumentation.
export const proposeMigration = (article) => {
  const terrain = article?.terrain;
  const p = profileOf(terrain);
  if (!p) return null;
  const log = Array.isArray(article.log) ? article.log : [];
  const proposals = [];
  for (const path of PATHS) {
    if (path.from !== terrain) continue;
    const s = path.signal(article);
    if (s) proposals.push(Object.freeze({ to: path.to, confidence: Math.round(s.confidence * 100) / 100, cause: s.cause, ...('escapes' in s ? { escapes: s.escapes } : {}), ...('holders' in s ? { holders: s.holders } : {}) }));
  }
  proposals.sort((a, b) => b.confidence - a.confidence);
  const failedMigrations = countEvents(log, (e) => e.op === 'REC' && e.held === false);
  return Object.freeze({
    terrain,
    identityKey: identityKeyOf(article),
    proposals: Object.freeze(proposals),
    failedMigrations,
    // §7: three failed migrations on a Void is a finding, not a backlog.
    emanonFinding: failedMigrations >= 3,
  });
};

// applyMigration(article, toTerrain, cause) → { events } — the REC event and the
// `supersedes` edge to APPEND to the log. Nothing is overwritten: the old terrain's
// address stays in the record, the new one carries a `supersedes` edge to it. Returns
// null if `toTerrain` is not a known terrain (a migration to nowhere is not a write).
export const applyMigration = (article, toTerrain, cause = null, { t = 0, turn = 0 } = {}) => {
  const from = article?.terrain;
  if (!profileOf(from) || !profileOf(toTerrain) || from === toTerrain) return null;
  const fromKey = identityKeyOf(article);
  const rec = Object.freeze({
    op: 'REC', kind: 'migrate', from, to: toTerrain,
    cause: clean(cause) || 'terrain migration',
    fromKey, t, turn,
  });
  // The supersession edge lives in the Meant-Graph (M) — logged as an EVENT, projected
  // never stored (edges.js §M). It points FROM the new address TO the old one.
  const supersedes = Object.freeze({
    op: 'REC', kind: 'edge', edge: 'supersedes', dir: 'out',
    to: fromKey, from: toTerrain, note: `migrated from ${from}`, t, turn,
  });
  return Object.freeze({ events: Object.freeze([rec, supersedes]) });
};

// The migration paths this terrain can take, for the render layer's "this could become…"
// affordance and for authoring guards. Read-only, no log needed.
export const migrationPathsFrom = (terrain) =>
  PATHS.filter((p) => p.from === terrain).map((p) => p.to);
