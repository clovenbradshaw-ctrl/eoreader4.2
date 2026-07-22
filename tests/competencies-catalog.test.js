import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOG, DEFAULT_BUDGET, FOUNDER_IDS, competencyById, initialInstalled,
  competencyUpkeep, competencyCheckpoint, totalUpkeep, occupiedCells,
  canInstall, canUninstall, install, uninstall, projectBody,
  cellLabels, constitutionLine, opLabel,
} from '../src/rooms/competencies/catalog.js';

// The competencies room's pure half — the catalog and the three-gate fold the surface
// projects (checkpoint · requires · budget). Everything with a DOM is the surface's concern;
// these are the folds that decide WHAT can install, WHY a refusal happened, and what the
// installed set costs and occupies.

test('competencies/catalog: the catalog spans founders, extensions, and the one forbidden card', () => {
  assert.equal(CATALOG.length, 15);
  const founders = CATALOG.filter((c) => c.builtin);
  const extensions = CATALOG.filter((c) => !c.builtin && !c.forbidden);
  const forbidden = CATALOG.filter((c) => c.forbidden);
  assert.equal(founders.length, 5);
  assert.equal(extensions.length, 9);
  assert.equal(forbidden.length, 1);
  for (const id of ['entity-spotting', 'attribution', 'citation-binding', 'fact-check', 'void-keeping']) {
    assert.ok(founders.some((c) => c.id === id), `${id} is a founder`);
  }
  for (const id of [
    'close-reading', 'kind-forming', 'motif-tracing', 'corroboration', 'segment-census',
    'contradiction-radar', 'atmosphere-reading', 'long-form-synthesis', 'paradigm-shift',
  ]) {
    assert.ok(extensions.some((c) => c.id === id), `${id} is an extension`);
  }
  assert.equal(forbidden[0].id, 'fabricate-from-nothing');
  assert.equal(DEFAULT_BUDGET, 18);   // static tripwire
});

test('competencies/catalog: initialInstalled is exactly the five founders, always', () => {
  assert.deepEqual([...initialInstalled()].sort(), [...FOUNDER_IDS].sort());
  assert.equal(FOUNDER_IDS.length, 5);
  // every founder is builtin and requires nothing
  for (const id of FOUNDER_IDS) {
    const c = competencyById(id);
    assert.equal(c.builtin, true);
    assert.deepEqual(c.requires, []);
  }
});

test('competencies/catalog: competencyCheckpoint passes a normal cell, refuses the desert cell', () => {
  const closeReading = competencyById('close-reading');
  assert.equal(competencyCheckpoint(closeReading).ok, true);

  const forbidden = competencyById('fabricate-from-nothing');
  const check = competencyCheckpoint(forbidden);
  assert.equal(check.ok, false);
  assert.ok(check.reasons[0].includes('void-law'), `reason names the void-law: ${check.reasons[0]}`);
});

test('competencies/catalog: totalUpkeep of the founders alone is 6.8', () => {
  assert.equal(totalUpkeep(initialInstalled()), 6.8);
  assert.equal(occupiedCells(initialInstalled()).size, 5);
});

test('competencies/catalog: canInstall refuses an unknown id and an already-installed founder', () => {
  assert.equal(canInstall(initialInstalled(), 'no-such-thing').ok, false);
  const v = canInstall(initialInstalled(), 'entity-spotting');
  assert.equal(v.ok, false);
  assert.match(v.reason, /built-in/);
});

test('competencies/catalog: canInstall gates on requires before budget', () => {
  // motif-tracing requires close-reading, which is not installed yet.
  const blocked = canInstall(initialInstalled(), 'motif-tracing', { budget: 999 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.gate, 'requires');
  assert.match(blocked.reason, /Close reading/);

  // once close-reading is present, motif-tracing clears the requires gate.
  const withCloseReading = install(initialInstalled(), 'close-reading').installed;
  const allowed = canInstall(withCloseReading, 'motif-tracing', { budget: 999 });
  assert.equal(allowed.ok, true);
});

test('competencies/catalog: canInstall gates on budget — founders (6.8) + close-reading (0.8) = 7.6', () => {
  const tooLow = canInstall(initialInstalled(), 'close-reading', { budget: 7 });
  assert.equal(tooLow.ok, false);
  assert.equal(tooLow.gate, 'budget');
  assert.match(tooLow.reason, /over budget/);

  const exact = canInstall(initialInstalled(), 'close-reading', { budget: 7.6 });
  assert.equal(exact.ok, true);
  assert.equal(exact.after, 7.6);

  const withDefault = canInstall(initialInstalled(), 'close-reading', { budget: DEFAULT_BUDGET });
  assert.equal(withDefault.ok, true);
});

test('competencies/catalog: the forbidden card refuses at any budget, including an absurdly large one', () => {
  const v = canInstall(initialInstalled(), 'fabricate-from-nothing', { budget: 1e9 });
  assert.equal(v.ok, false);
  assert.equal(v.gate, 'checkpoint');
  const r = install(initialInstalled(), 'fabricate-from-nothing', { budget: 1e9 });
  assert.equal(r.changed, false);
  assert.deepEqual([...r.installed], [...initialInstalled()]);
});

test('competencies/catalog: install/uninstall are a pure fold — the input array is never mutated', () => {
  const before = initialInstalled();
  const beforeCopy = [...before];
  const r = install(before, 'close-reading');
  assert.deepEqual(before, beforeCopy, 'the input array is untouched');
  assert.equal(r.changed, true);
  assert.ok(r.installed.includes('close-reading'));
  assert.ok(Object.isFrozen(r.installed));

  // a refused move returns an equal (not mutated, not the same object) set
  const refused = install(r.installed, 'entity-spotting');
  assert.equal(refused.changed, false);
  assert.deepEqual([...refused.installed], [...r.installed]);
});

test('competencies/catalog: installed ids come back in catalog order regardless of install order', () => {
  const a = install(install(initialInstalled(), 'close-reading').installed, 'kind-forming').installed;
  const b = install(install(initialInstalled(), 'kind-forming').installed, 'close-reading').installed;
  const expectedOrder = CATALOG.map((c) => c.id).filter((id) => a.includes(id));
  assert.deepEqual([...a], expectedOrder);
  assert.deepEqual([...a], [...b]);
});

test('competencies/catalog: canUninstall blocks a founder and anything still required by a dependent', () => {
  const founderBlock = canUninstall(initialInstalled(), 'entity-spotting');
  assert.equal(founderBlock.ok, false);
  assert.match(founderBlock.reason, /built-in/);

  let installed = install(initialInstalled(), 'close-reading').installed;
  installed = install(installed, 'motif-tracing', { budget: 999 }).installed;
  assert.ok(installed.includes('motif-tracing'));

  const dependentBlock = canUninstall(installed, 'close-reading');
  assert.equal(dependentBlock.ok, false);
  assert.match(dependentBlock.reason, /Motif tracing/);

  // remove the dependent first, then close-reading is free to leave
  const withoutMotif = uninstall(installed, 'motif-tracing').installed;
  const nowAllowed = canUninstall(withoutMotif, 'close-reading');
  assert.equal(nowAllowed.ok, true);
  const afterUninstall = uninstall(withoutMotif, 'close-reading');
  assert.equal(afterUninstall.changed, true);
  assert.ok(!afterUninstall.installed.includes('close-reading'));
});

test('competencies/catalog: projectBody recomputes organs, upkeep, occupancy, and the desert left', () => {
  const founders = projectBody(initialInstalled());
  assert.equal(founders.count, 5);
  assert.equal(founders.organs.length, 5);
  assert.equal(founders.upkeep, 6.8);
  assert.equal(founders.occupied, 5);
  assert.equal(founders.desert, 22);

  const withCloseReading = install(initialInstalled(), 'close-reading').installed;
  const grown = projectBody(withCloseReading);
  assert.equal(grown.count, 6);
  assert.equal(grown.upkeep, 7.6);
  assert.equal(grown.occupied, 6);
  assert.equal(grown.desert, 21);
});

test('competencies/catalog: cellLabels resolves a real glyph/stance/terrain for an installed and the forbidden cell', () => {
  const closeReading = competencyById('close-reading');
  const labels = cellLabels(closeReading);
  assert.equal(labels.length, 1);
  assert.notEqual(labels[0].glyph, '·');
  assert.equal(labels[0].op, 'SEG');
  assert.ok(labels[0].key);

  const forbidden = competencyById('fabricate-from-nothing');
  const forbiddenLabels = cellLabels(forbidden);
  assert.equal(forbiddenLabels[0].op, 'SYN');
  assert.equal(forbiddenLabels[0].terrain, 'Field');
  assert.equal(forbiddenLabels[0].stance, 'Cultivating');
});

test('competencies/catalog: constitutionLine surfaces the void-law verbatim, and opLabel falls back to the raw code', () => {
  const line = constitutionLine();
  assert.match(line, /dwell-in-Void/);
  assert.match(line, /never-fabricate-from-it/);
  assert.equal(opLabel('SYN'), 'synthesize');
  assert.equal(opLabel('not-a-real-op'), 'not-a-real-op');
});
