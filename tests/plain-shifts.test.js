// "When people changed their minds" — REC over a dated corpus, tested as change-point detection on
// a term's dominant meaning through time. These feed the detector dated corpora — non-fiction (a
// word that moves through three framings), academic (a scientific term across paradigms), and
// fiction (a figure re-read over a narrative) — and pin that the shifts land at the right dates,
// name the right old→new meanings, ignore a lone contrarian source, and emit real REC events
// (docs, plain version §4).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectShifts, recEvents, toMs, fmt } from '../src/rooms/plain/shifts.js';

const breaks = (m) => m.marks.filter((x) => x.kind === 'break');

// ── the time axis ───────────────────────────────────────────────────────────────────────────────
test('toMs reads ms, bare years, and date strings; fmt renders them', () => {
  assert.equal(fmt(toMs('2025-02')), 'Feb 2025');
  assert.equal(fmt(toMs('February 2025')), 'Feb 2025');
  assert.equal(fmt(toMs(2025)), '2025');          // a bare year shows as a year
  assert.ok(Number.isNaN(toMs('no date here')));  // unreadable → NaN (excluded, not guessed)
});

// ── NON-FICTION · one word through three framings over two years ────────────────────────────────
test('non-fiction: "surveillance" shifts tool → capability → procurement, at the right dates', () => {
  const sources = [
    { id: 'a', date: '2023-06', text: 'Surveillance is a tool. Here, surveillance is a tool.' },
    { id: 'b', date: '2024-01', text: 'Surveillance is a tool that fights crime.' },
    { id: 'c', date: '2025-02', text: 'Surveillance is a capability. Surveillance is a sensing capability.' },
    { id: 'd', date: '2025-06', text: 'Surveillance is a capability.' },
    { id: 'e', date: '2025-11', text: 'Surveillance is a procurement.' },
    { id: 'f', date: '2025-12', text: 'Surveillance is a procurement.' },
  ];
  const m = detectShifts(sources, 'surveillance');
  assert.equal(m.shifted, true);
  assert.equal(m.shifts, 2);
  const bs = breaks(m);
  assert.deepEqual(bs.map((b) => [b.from.sense, b.to.sense]), [['tool', 'capability'], ['capability', 'procurement']]);
  assert.deepEqual(bs.map((b) => b.when), ['Feb 2025', 'Nov 2025']);
});

test('a lone contrarian source does not manufacture a shift (blip smoothing)', () => {
  const sources = [
    { id: 'a', date: '2025-01', text: 'Surveillance is a capability.' },
    { id: 'b', date: '2025-02', text: 'Surveillance is a capability.' },
    { id: 'x', date: '2025-03', text: 'Surveillance is a tool.' },          // one dissenting source
    { id: 'c', date: '2025-04', text: 'Surveillance is a capability.' },
    { id: 'd', date: '2025-05', text: 'Surveillance is a capability.' },
  ];
  const m = detectShifts(sources, 'surveillance');
  assert.equal(m.shifted, false, 'a single blip between agreeing runs is not a paradigm shift');
});

// ── ACADEMIC · a scientific term across paradigms ───────────────────────────────────────────────
test('academic: "atom" moves particle → nucleus → cloud across the decades', () => {
  const sources = [
    { id: 'p1', date: '1890', text: 'The atom is a particle. The atom is an indivisible particle.' },
    { id: 'p2', date: '1905', text: 'The atom is a particle.' },
    { id: 'n1', date: '1915', text: 'The atom is a nucleus. The atom is a nucleus with electrons.' },
    { id: 'n2', date: '1920', text: 'The atom is a nucleus.' },
    { id: 'c1', date: '1927', text: 'The atom is a cloud. The atom is a probability cloud.' },
    { id: 'c2', date: '1932', text: 'The atom is a cloud.' },
  ];
  const m = detectShifts(sources, 'the atom');
  assert.equal(m.shifts, 2);
  assert.deepEqual(breaks(m).map((b) => b.to.sense), ['nucleus', 'cloud']);
  assert.deepEqual(breaks(m).map((b) => b.when), ['1915', '1927']);
});

// ── FICTION · a figure re-read over a narrative ─────────────────────────────────────────────────
test('fiction: "the creature" turns from monster to wretch partway through', () => {
  const sources = [
    { id: 'ch1', date: '1801', text: 'The creature is a monster. The creature is a monster that hunts.' },
    { id: 'ch2', date: '1802', text: 'The creature is a monster.' },
    { id: 'ch3', date: '1803', text: 'The creature is a wretch. The creature is a wretch to be pitied.' },
    { id: 'ch4', date: '1804', text: 'The creature is a wretch.' },
  ];
  const m = detectShifts(sources, 'the creature');
  assert.equal(m.shifts, 1);
  assert.equal(breaks(m)[0].from.sense, 'monster');
  assert.equal(breaks(m)[0].to.sense, 'wretch');
});

// ── steady, undated, and the REC events ─────────────────────────────────────────────────────────
test('a steady term reports no shift', () => {
  const m = detectShifts([
    { id: 'a', date: '2020', text: 'Gravity is a force. Gravity is a force.' },
    { id: 'b', date: '2021', text: 'Gravity is a force.' },
    { id: 'c', date: '2022', text: 'Gravity is a force.' },
  ], 'gravity');
  assert.equal(m.shifted, false);
  assert.equal(m.marks.filter((x) => x.kind === 'steady').length, 1);
});

test('undated sources are excluded from the timeline, not guessed into it', () => {
  const m = detectShifts([
    { id: 'a', date: '2020', text: 'X is a tool.' },
    { id: 'b', date: '', text: 'X is a weapon.' },        // no date → cannot be placed
    { id: 'c', date: '2021', text: 'X is a tool.' },
  ], 'x');
  assert.equal(m.undated, 1);
  assert.equal(m.shifted, false); // the undated "weapon" reading never enters the sequence
});

test('each break is emitted as a real REC event, in-grammar', () => {
  const m = detectShifts([
    { id: 'a', date: '2023', text: 'Power is a tool.' },
    { id: 'b', date: '2024', text: 'Power is a tool.' },
    { id: 'c', date: '2025', text: 'Power is a relation.' },
    { id: 'd', date: '2026', text: 'Power is a relation.' },
  ], 'power');
  const events = recEvents(m);
  assert.equal(events.length, 1);
  assert.equal(events[0].op, 'REC');
  assert.equal(events[0].kind, 'paradigm-shift');
  assert.equal(events[0].from, 'tool');
  assert.equal(events[0].to, 'relation');
  assert.equal(events[0].when, '2025');
});
