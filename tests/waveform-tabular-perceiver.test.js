import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestTable } from '../src/organs/in/table.js';
import { buildTabularReading } from '../src/perceiver/tabular/waveform.js';
import { validateReading } from '../src/perceiver/contract.js';
import { buildWaveform } from '../src/weave/waveform/build.js';

// THE TABULAR PERCEIVER — a synthetic hourly weather table with two distinct
// multichannel regimes (calm high-pressure, then a storm, then calm again),
// the meteorological motivating case from docs/omnimodal-waveform.md §4.3: the
// storm should read as its own tracked regime, and the calm regime returning
// afterward should be recognised as a recurrence of the SAME regime, not a
// third one — the tabular analogue of the audio perceiver's returning tone.

const jitter = (i, amp) => amp * Math.sin(i * 1.3);

const calmRow = (i) => ({
  pressure: (1020 + jitter(i, 0.6)).toFixed(1),
  temp: (15 + jitter(i, 0.4)).toFixed(1),
  wind: (5 + jitter(i, 0.3)).toFixed(1),
  visibility: (10 + jitter(i, 0.2)).toFixed(1),
  station: `S${i}`,
});
const stormRow = (i) => ({
  pressure: (980 + jitter(i, 0.6)).toFixed(1),
  temp: (8 + jitter(i, 0.4)).toFixed(1),
  wind: (45 + jitter(i, 0.3)).toFixed(1),
  visibility: (2 + jitter(i, 0.2)).toFixed(1),
  station: `S${i}`,
});

const buildRows = () => {
  const rows = [];
  for (let i = 0; i < 15; i++) rows.push(calmRow(i));           // [0,15) calm
  for (let i = 15; i < 30; i++) rows.push(stormRow(i));         // [15,30) storm
  for (let i = 30; i < 45; i++) rows.push(calmRow(i));          // [30,45) calm again
  return rows;
};

const buildDoc = () => ingestTable({
  name: 'weather',
  columns: ['pressure', 'temp', 'wind', 'visibility', 'station'],
  rows: buildRows(),
});

test('buildTabularReading: detects the numeric channels, leaves the categorical column out of the field', () => {
  const doc = buildDoc();
  const reading = buildTabularReading(doc);
  assert.deepEqual(new Set(reading.meta.numericColumns), new Set(['pressure', 'temp', 'wind', 'visibility']));
  assert.equal(reading.units[0].field.length, 4);
});

test('buildTabularReading: produces a valid Reading, one row per unit', () => {
  const doc = buildDoc();
  const reading = buildTabularReading(doc);
  const { ok, errors } = validateReading(reading);
  assert.equal(ok, true, `expected a valid Reading, got ${JSON.stringify(errors)}`);
  assert.equal(reading.units.length, doc.records.length);
  assert.equal(reading.meta.modality, 'tabular');
});

test('buildTabularReading: the returning calm regime is recognised as the SAME tracked regime, not a new one', () => {
  const doc = buildDoc();
  const reading = buildTabularReading(doc);
  const sightingsByReferent = new Map();
  for (const s of reading.sightings) {
    if (!sightingsByReferent.has(s.referent)) sightingsByReferent.set(s.referent, []);
    sightingsByReferent.get(s.referent).push(s.ordinal);
  }
  let matched = false;
  for (const [, ordinals] of sightingsByReferent) {
    const early = ordinals.some((o) => o < 15);
    const late = ordinals.some((o) => o >= 30);
    if (early && late) { matched = true; break; }
  }
  assert.ok(matched, `expected a regime to span both calm stretches, got ${JSON.stringify([...sightingsByReferent.entries()])}`);
});

test('buildTabularReading: the storm gets its own distinct tracked regime', () => {
  const doc = buildDoc();
  const reading = buildTabularReading(doc);
  assert.ok(reading.referents.length >= 2, `expected at least 2 tracked regimes, got ${JSON.stringify(reading.referents)}`);
});

test('buildWaveform over a real tabular Reading: the airmass change confirms as a Turn near row 15', () => {
  const doc = buildDoc();
  const reading = buildTabularReading(doc);
  const model = buildWaveform(reading);
  assert.equal(model.strain.length, doc.records.length);
  const nearBreak = model.turns.some((t) => Math.abs(t.ordinal - 15) <= 3);
  assert.ok(nearBreak, `expected a turn near row 15, got ${JSON.stringify(model.turns.map((t) => t.ordinal))}`);
});

test('buildTabularReading: a table with no numeric columns at all degrades honestly rather than throwing', () => {
  const doc = ingestTable({ name: 'names-only', columns: ['name'], rows: [{ name: 'Alice' }, { name: 'Bob' }] });
  const reading = buildTabularReading(doc);
  const { ok } = validateReading(reading);
  assert.equal(ok, true);
  assert.equal(reading.units[0].field.length, 0);
});
