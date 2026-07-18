// EO: CON·EVA(Entity → Link,Lens, Binding,Tracing) — witness/anchor/fingerprint
// identity reconciliation
// Bonds an old holon to its new counterpart (or its absence) and renders the
// continuation verdict (docs/code-holons.md §3). No rule manufactures a stable
// identity across an ambiguous or removed case — an unresolved continuation is
// reported unresolved, never silently picked.
//
// holon.js's `id` is keyed on the declared-name path from the module down
// (docs/code-holons.md §3), so it is stable across an ordinary edit but changes
// the instant the holon's OWN name (or an ancestor's) changes. That makes id
// equality a clean, cheap first pass for "same/modified" — but a rename can
// never be found by id lookup, only by residue matching below (same parent,
// full fingerprint match minus name).

import { fingerprintsEqual } from './fingerprint.js';

const KIND_ORDER = ['module', 'class', 'function'];

// In-corpus reference-site check for a non-exported rename (docs/code-holons.md
// §4.2): every reference to the OLD name in the old file, checked against the
// NEW file — verified only if zero references to the old name remain and at
// least as many references to the new name appear. Scoped to the given facts
// only; a call site outside the corpus handed to readCodeChange is invisible to
// this check by construction, and callers are told so via `grounds`.
export const verifyRenameReferences = (oldFacts, newFacts, oldName, newName) => {
  const countOf = (facts, name) => facts.uses.filter((u) => u.name === name).length;
  const oldRefs = countOf(oldFacts, oldName);
  const staleOldRefs = countOf(newFacts, oldName);
  const newRefs = countOf(newFacts, newName);
  return { verified: staleOldRefs === 0 && newRefs >= oldRefs, oldRefs, staleOldRefs, newRefs };
};

// Reconcile ONE file's old holon set against its new holon set. Returns one entry
// per old-or-new holon (a holon present in both sides has one entry carrying
// both). `oldFacts`/`newFacts` (organs/code/facts.js output) are required only
// for in-corpus rename verification (§4.2); pass null to skip it (the pair still
// classifies as `renamed`, just without the reference-site check, tier left
// `contested`).
export const reconcileHolons = (oldHolons, newHolons, { oldFacts = null, newFacts = null } = {}) => {
  const oldById = new Map(oldHolons.map((h) => [h.id, h]));
  const newById = new Map(newHolons.map((h) => [h.id, h]));
  const claimedNew = new Set();
  const out = [];

  for (const oldHolon of oldHolons) {
    const newHolon = newById.get(oldHolon.id);
    if (!newHolon) continue;                          // no same-name-path holon — handled in the residue pass below
    claimedNew.add(newHolon.id);
    if (oldHolon.witness.textHash === newHolon.witness.textHash) {
      out.push({ old: oldHolon, new: newHolon, category: 'same', grounds: 'witness byte range and text identical' });
    } else {
      out.push({ old: oldHolon, new: newHolon, category: 'modified', grounds: 'anchor identical; witness text differs' });
    }
  }

  // residue: old holons with no id match (id is name-path keyed — see holon.js
  // — so residue here means "no same-named holon at this position", which
  // covers both a genuine rename AND a plain insertion/deletion elsewhere that
  // never should have touched this holon at all). Two sub-passes, most
  // conservative first:
  //   1. same PARENT id, same kind, full fingerprint match -> `renamed`. The
  //      parent already matching means nothing shifted around this holon; only
  //      its own name changed. This must run BEFORE the broad fingerprint pass
  //      below, or a same-parent rename and an unrelated cross-parent/cross-file
  //      fingerprint coincidence could race for the same candidate.
  //   2. same kind, full fingerprint match, ANYWHERE in the file -> `moved`.
  const residueOld = oldHolons.filter((h) => !out.some((e) => e.old === h));
  const residueNew = newHolons.filter((h) => !claimedNew.has(h.id) && !out.some((e) => e.new === h));

  const usedNew = new Set();
  const stillOld = [];
  for (const oldHolon of residueOld) {
    if (oldHolon.kind === 'module') { stillOld.push(oldHolon); continue; }
    const sameParent = residueNew.filter((h) => !usedNew.has(h.id) && h.kind === oldHolon.kind && h.anchor.parentId === oldHolon.anchor.parentId && fingerprintsEqual(h.fingerprint, oldHolon.fingerprint));
    if (sameParent.length === 1) {
      usedNew.add(sameParent[0].id);
      let verification = null;
      if (oldFacts && newFacts && !oldHolon.exported) {
        verification = verifyRenameReferences(oldFacts, newFacts, oldHolon.anchor.declaredName, sameParent[0].anchor.declaredName);
      }
      out.push({
        old: oldHolon, new: sameParent[0], category: 'renamed', exported: oldHolon.exported, verification,
        grounds: oldHolon.exported
          ? 'declared name changed on an exported holon — public contract severed unless a compatibility alias exists'
          : 'declared name changed under an unchanged parent; full fingerprint identical',
      });
    } else {
      stillOld.push(oldHolon);
    }
  }

  for (const oldHolon of stillOld) {
    const candidates = residueNew.filter((h) => !usedNew.has(h.id) && h.kind === oldHolon.kind && fingerprintsEqual(h.fingerprint, oldHolon.fingerprint));
    if (candidates.length === 1) {
      usedNew.add(candidates[0].id);
      out.push({ old: oldHolon, new: candidates[0], category: 'moved', grounds: 'anchor (parent) differs; full fingerprint identical' });
    } else if (candidates.length > 1) {
      out.push({ old: oldHolon, new: null, category: 'ambiguous', candidates, grounds: `${candidates.length} new-side holons tie on fingerprint — no continuation asserted` });
    } else {
      out.push({ old: oldHolon, new: null, category: 'removed', grounds: 'no positional or fingerprint match on the new side' });
    }
  }
  for (const newHolon of residueNew) {
    if (usedNew.has(newHolon.id)) continue;
    if (out.some((e) => e.category === 'ambiguous' && e.candidates?.includes(newHolon))) continue;
    out.push({ old: null, new: newHolon, category: 'added', grounds: 'no positional or fingerprint match on the old side' });
  }

  return out.sort((a, b) => KIND_ORDER.indexOf((a.new ?? a.old).kind) - KIND_ORDER.indexOf((b.new ?? b.old).kind));
};

// Cross-file pass (docs/code-holons.md §3's `moved-file`): given an ALREADY
// per-file-reconciled corpus (each file's own reconcileHolons() output), match
// whatever `removed`/`added` residue is left across DIFFERENT files by full
// fingerprint, mutating those entries to `moved-file` in place. Deliberately
// conservative — two unrelated but textually-identical-after-normalization
// holons will report as moved rather than as an unrelated removed+added pair;
// that is the correct call under precision-over-recall (docs/code-holons.md §3).
// Split out from reconcileCorpus so a caller that needs to compute the per-file
// pass itself first (index.js, to fold in parse-gap retention — §5) can still
// run this pass over its own results.
export const matchAcrossFiles = (perFile) => {
  const removed = [];
  const added = [];
  for (const [path, entries] of Object.entries(perFile)) {
    for (const e of entries) {
      if (e.category === 'removed') removed.push({ path, entry: e });
      if (e.category === 'added') added.push({ path, entry: e });
    }
  }

  const usedAdded = new Set();
  for (const r of removed) {
    if (r.entry.old.kind === 'module') continue;       // a file disappearing is a removal, never a "move"
    const candidates = added.filter((a) => !usedAdded.has(a) && a.path !== r.path && a.entry.new.kind === r.entry.old.kind && fingerprintsEqual(a.entry.new.fingerprint, r.entry.old.fingerprint));
    if (candidates.length === 1) {
      usedAdded.add(candidates[0]);
      r.entry.category = 'moved-file';
      r.entry.new = candidates[0].entry.new;
      r.entry.movedToPath = candidates[0].path;
      r.entry.grounds = `absent from ${r.path}; a fingerprint-identical holon appears in ${candidates[0].path}`;
      candidates[0].entry.category = 'moved-file';
      candidates[0].entry.old = r.entry.old;
      candidates[0].entry.movedFromPath = r.path;
      candidates[0].entry.grounds = `fingerprint-identical to a holon removed from ${r.path}`;
    }
  }

  return perFile;
};

// Convenience wrapper: per-file reconciliation, then the cross-file move pass.
// Prefer this when the caller has no need for parse-gap retention (§5) between
// the two steps; index.js computes the per-file pass itself and calls
// matchAcrossFiles directly so a gap-retained file's holons are excluded from
// the residue before the cross-file match runs.
export const reconcileCorpus = (oldHolonsByFile, newHolonsByFile, factsByFile = {}) => {
  const files = new Set([...Object.keys(oldHolonsByFile), ...Object.keys(newHolonsByFile)]);
  const perFile = {};
  for (const path of files) {
    const oldFacts = factsByFile[path]?.old ?? null;
    const newFacts = factsByFile[path]?.new ?? null;
    perFile[path] = reconcileHolons(oldHolonsByFile[path] ?? [], newHolonsByFile[path] ?? [], { oldFacts, newFacts });
  }
  return matchAcrossFiles(perFile);
};
