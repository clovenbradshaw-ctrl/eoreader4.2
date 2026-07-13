import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeWatch, watchId, hostOf, upsertWatch, dropWatch, renameWatch,
  makeReading, recordReading, READING_CAP, latest, latestOk, series, trend, sparkPoints,
} from '../src/rooms/dashboard/spec.js';
import { readValue, inferKind } from '../src/rooms/dashboard/extract.js';
import { buildSelector, extractFromDoc, labelFor } from '../src/rooms/dashboard/select.js';
import { renderDashboard, relTime } from '../src/rooms/dashboard/render.js';
import { createDashboardStore } from '../src/rooms/dashboard/store.js';

// The dashboard holon is the live-metric surface: pin an element on a web page and watch it. This
// pins its PURE core — the watch spec, the append-only reading log and its projections, the value
// reading, the selector builder, the renderer, and the persisted store — the parts a browser is
// not needed to prove. The DOM halves (picker.js, mount.js) rest on exactly these functions.

// ── the watch spec ──────────────────────────────────────────────────────────
test('a watch has a stable identity from what it points at', () => {
  const a = makeWatch({ url: 'https://x.com/p', selector: '.price', kind: 'money' });
  const b = makeWatch({ url: 'https://x.com/p', selector: '.price', kind: 'money' });
  assert.equal(a.id, b.id, 'same url+selector+attr → same id');
  assert.equal(a.id, watchId('https://x.com/p', '.price', ''));
  const c = makeWatch({ url: 'https://x.com/p', selector: '.other' });
  assert.notEqual(a.id, c.id, 'a different selector is a different watch');
});

test('a watch normalizes its fields and defaults its label to the host', () => {
  const w = makeWatch({ url: 'https://finance.example.com/q?x=1', selector: '.v' });
  assert.equal(w.kind, 'auto');
  assert.equal(w.label, 'finance.example.com');
  assert.equal(w.unit, '');
  assert.equal(w.refreshMs, 0);
  assert.equal(makeWatch({ url: 'u', selector: 's', kind: 'nonsense' }).kind, 'auto', 'a bad kind falls back to auto');
});

test('hostOf reads the host, and degrades on a malformed URL', () => {
  assert.equal(hostOf('https://a.b.com/x'), 'a.b.com');
  assert.equal(hostOf('not a url'), 'not a url');
});

test('upsert replaces same-identity, drop and rename target by id', () => {
  let ws = [];
  ws = upsertWatch(ws, makeWatch({ url: 'u', selector: '.a', label: 'A' }));
  ws = upsertWatch(ws, makeWatch({ url: 'u', selector: '.a', label: 'A2' }));
  assert.equal(ws.length, 1, 're-pinning the same element does not stack');
  assert.equal(ws[0].label, 'A2');
  const id = ws[0].id;
  ws = renameWatch(ws, id, 'renamed');
  assert.equal(ws[0].label, 'renamed');
  ws = dropWatch(ws, id);
  assert.equal(ws.length, 0);
});

// ── the append-only reading log + its projections ────────────────────────────
test('readings append and are capped oldest-first', () => {
  let log = [];
  for (let i = 0; i < READING_CAP + 25; i++) log = recordReading(log, makeReading({ at: `t${i}`, value: i, ok: true }));
  assert.equal(log.length, READING_CAP, 'the log is a sliding window');
  assert.equal(latest(log).value, READING_CAP + 24, 'the newest reading is last');
  assert.equal(log[0].value, 25, 'the oldest 25 were dropped');
});

test('a failed pull is itself a reading, and latestOk holds the last good value', () => {
  let log = [];
  log = recordReading(log, makeReading({ at: 't1', raw: '$10', value: 10, display: '$10', ok: true }));
  log = recordReading(log, makeReading({ at: 't2', ok: false, error: 'element not found' }));
  assert.equal(latest(log).ok, false, 'the newest reading witnesses the failure');
  assert.equal(latestOk(log).value, 10, 'the tile can still show the last number read');
});

test('trend compares the two most recent numeric readings', () => {
  let log = [];
  log = recordReading(log, makeReading({ at: 't1', value: 100, ok: true }));
  assert.equal(trend(log), null, 'one point is not a trend');
  log = recordReading(log, makeReading({ at: 't2', value: 125, ok: true }));
  const up = trend(log);
  assert.equal(up.dir, 'up');
  assert.equal(up.delta, 25);
  assert.equal(up.pct, 25);
  log = recordReading(log, makeReading({ at: 't3', ok: false, error: 'x' }));
  assert.equal(trend(log).cur, 125, 'a non-numeric reading is not a trend point');
});

test('series and sparkPoints skip non-numeric readings and normalize 0..1', () => {
  let log = [];
  [10, 20, 30].forEach((v, i) => { log = recordReading(log, makeReading({ at: `t${i}`, value: v, ok: true })); });
  log = recordReading(log, makeReading({ at: 'bad', ok: false }));
  assert.deepEqual(series(log).map((p) => p.value), [10, 20, 30]);
  const pts = sparkPoints(log);
  assert.equal(pts.length, 3);
  assert.equal(pts[0].y, 0, 'min normalizes to 0');
  assert.equal(pts[2].y, 1, 'max normalizes to 1');
  assert.equal(pts[0].x, 0);
  assert.equal(pts[2].x, 1);
});

// ── reading a pulled string as a value (reuses data/values.js) ────────────────
test('readValue reads money, number, date, and text', () => {
  assert.deepEqual(pick(readValue('$1,240.50', 'money')), { kind: 'money', value: 1240.5, display: '$1,240.5' });
  assert.deepEqual(pick(readValue('3,201 online', 'number')), { kind: 'number', value: 3201, display: '3,201' });
  assert.equal(readValue('98% uptime', 'number').value, 98);
  assert.equal(readValue('2026-07-13', 'date').display, '2026-07-13');
  assert.equal(readValue('Operational', 'text').value, null);
  assert.equal(readValue('Operational', 'text').display, 'Operational');
});

test('auto kind infers from the string', () => {
  assert.equal(inferKind('$99'), 'money');
  assert.equal(inferKind('4,120'), 'number');
  assert.equal(inferKind('2025-01-02'), 'date');
  assert.equal(inferKind('Sold out'), 'text');
  assert.equal(readValue('£180k', 'auto').value, 180000, 'auto reads a magnitude suffix');
  assert.equal(readValue('nothing numeric', 'auto').value, null, 'unreadable → null, never a fake 0');
});

// ── the selector builder (fake DOM nodes — no browser) ───────────────────────
// A minimal element the builder can walk: only the properties buildSelector/labelFor read.
const node = (tag, opts = {}) => {
  const el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    id: opts.id || '',
    classList: opts.classes || [],
    textContent: opts.text || '',
    children: [],
    parentElement: null,
    previousElementSibling: null,
    getAttribute: (k) => (opts.attrs && opts.attrs[k]) || null,
  };
  el.parentNode = null;
  return el;
};
const adopt = (parent, kids) => {
  parent.children = kids;
  kids.forEach((k, i) => { k.parentElement = parent; k.parentNode = parent; k.previousElementSibling = i ? kids[i - 1] : null; });
  return parent;
};

test('buildSelector anchors on a good id', () => {
  const el = node('span', { id: 'price-today', text: '$5' });
  assert.equal(buildSelector(el), '#price-today');
});

test('buildSelector ignores a machine-generated id and builds a class/nth path', () => {
  const root = node('div', { id: 'app' });
  const card = node('div', { classes: ['card'] });
  const a = node('span', { classes: ['css-1x2y3z', 'value'], text: '$5' });   // hashy class dropped, `value` kept
  adopt(root, [card]);
  adopt(card, [a]);
  const sel = buildSelector(a);
  assert.match(sel, /^#app > div\.card > span\.value$/, `got ${sel}`);
});

test('buildSelector adds :nth-of-type only when siblings collide', () => {
  const ul = node('ul', { id: 'list' });
  const li1 = node('li', { text: 'a' });
  const li2 = node('li', { text: 'b' });
  adopt(ul, [li1, li2]);
  assert.equal(buildSelector(li2), '#list > li:nth-of-type(2)');
  const only = node('ul', { id: 'solo' });
  const li = node('li', { text: 'x' });
  adopt(only, [li]);
  assert.equal(buildSelector(li), '#solo > li', 'a lone child needs no nth-of-type');
});

test('buildSelector drops volatile state classes', () => {
  const root = node('div', { id: 'r' });
  const btn = node('button', { classes: ['tab', 'is-active', 'selected'], text: 'x' });
  adopt(root, [btn]);
  assert.equal(buildSelector(btn), '#r > button.tab', 'is-active / selected are not anchors');
});

test('labelFor prefers aria-label, then a nearby heading, then own text', () => {
  const aria = node('span', { text: '$5', attrs: { 'aria-label': 'Current price' } });
  assert.equal(labelFor(aria), 'Current price');
  const box = node('div');
  const h = node('h3', { text: 'Members online' });
  const val = node('span', { text: '4,120' });
  adopt(box, [h, val]);
  assert.equal(labelFor(val), 'Members online', 'a preceding heading names the value');
  assert.equal(labelFor(node('span', { text: 'lonely' })), 'lonely');
});

// ── extractFromDoc against a tiny querySelector shim ─────────────────────────
test('extractFromDoc reads text or an attribute, and witnesses a miss', () => {
  const doc = {
    querySelector: (sel) => {
      if (sel === '.v') return { textContent: '  $12.00 ', getAttribute: () => null };
      if (sel === 'time') return { textContent: 'yesterday', getAttribute: (k) => (k === 'datetime' ? '2026-07-13' : null) };
      return null;
    },
  };
  assert.deepEqual(extractFromDoc(doc, '.v'), { ok: true, raw: '$12.00', error: null });
  assert.deepEqual(extractFromDoc(doc, 'time', 'datetime'), { ok: true, raw: '2026-07-13', error: null });
  assert.equal(extractFromDoc(doc, '.missing').ok, false);
  assert.equal(extractFromDoc(doc, '.v', 'href').ok, false, 'a missing attribute is a miss');
});

// ── the renderer (pure HTML) ─────────────────────────────────────────────────
test('renderDashboard shows an empty state and, with data, the value + host', () => {
  assert.match(renderDashboard([], {}), /No metrics yet/);
  const w = makeWatch({ url: 'https://shop.example.com/x', selector: '.p', kind: 'money', label: 'Price' });
  const readings = { [w.id]: [makeReading({ at: '2026-07-13T10:00:00Z', raw: '$5', value: 5, display: '$5', ok: true })] };
  const html = renderDashboard([w], readings, { now: Date.parse('2026-07-13T10:00:30Z') });
  assert.match(html, /Price/);
  assert.match(html, /\$5/);
  assert.match(html, /shop\.example\.com/);
  assert.match(html, new RegExp(`data-id="${w.id}"`));
});

test('relTime reads a relative age', () => {
  const now = Date.parse('2026-07-13T12:00:00Z');
  assert.equal(relTime('2026-07-13T11:59:40Z', now), 'just now');
  assert.equal(relTime('2026-07-13T11:30:00Z', now), '30m ago');
  assert.equal(relTime('2026-07-13T09:00:00Z', now), '3h ago');
});

// ── the persisted store (injectable storage — no browser) ────────────────────
test('the store persists watches + reading logs and reloads them', () => {
  const mem = new Map();
  const backend = { get: (k) => (mem.has(k) ? mem.get(k) : null), set: (k, v) => mem.set(k, v) };
  const s1 = createDashboardStore(backend);
  const w = s1.addWatch({ url: 'https://x.com', selector: '.v', kind: 'number', label: 'Count' });
  s1.appendReading(w.id, makeReading({ at: 't1', raw: '10', value: 10, display: '10', ok: true }));
  s1.appendReading(w.id, makeReading({ at: 't2', raw: '12', value: 12, display: '12', ok: true }));

  const s2 = createDashboardStore(backend);   // a fresh store over the same storage = a reload
  assert.equal(s2.watches().length, 1);
  assert.equal(s2.watches()[0].label, 'Count');
  assert.equal(s2.readings(w.id).length, 2, 'the reading log survived');
  assert.equal(latest(s2.readings(w.id)).value, 12);

  s2.removeWatch(w.id);
  assert.equal(createDashboardStore(backend).watches().length, 0, 'removal persisted too');
});

test('the store notifies subscribers on change', () => {
  const s = createDashboardStore({ get: () => null, set: () => {} });
  let hits = 0;
  const off = s.subscribe(() => { hits++; });
  s.addWatch({ url: 'u', selector: '.a' });
  assert.equal(hits, 1);
  off();
  s.addWatch({ url: 'u', selector: '.b' });
  assert.equal(hits, 1, 'unsubscribed → no more notices');
});

const pick = (rv) => ({ kind: rv.kind, value: rv.value, display: rv.display });
