// EO: SEG·NUL(Network → Network, Clearing,Composing) — the graph time axis + its folds
// time-axis.js — one axis every graph can carry: WHEN each node entered the record.
//
// A graph node knows its place in the web; this adds a second reading of the same
// nodes — their order and spacing in TIME — and lets that reading be FOLDED at any
// grain. Folding is the operative act (the fold faculty): the raw instants are the
// unfolded axis; each coarser grain (hour → day → week → month → quarter → year →
// decade → all) folds more of the timeline into a single band, until `all` folds it
// away entirely. `sequence` is the fully-unfolded axis — one band per node, in the
// order they were recorded, spacing discarded.
//
// Pure and DOM-free, so it is unit-testable and any renderer can consume it. It reads
// only a time off each item (default `item.t`) and returns ordered bands the renderer
// lays out along whichever screen axis it likes.
//
//   foldTime(items, grain, opts) → { grain, requested, bands, span, dated, undated }
//   bands: [{ key, label, t0, t1, index, items:[…the original items…] }]
//
// A band's `items` are the caller's own objects, untouched — the fold groups, it never
// rewrites. Items with no usable time collect into a trailing `undated` band (never
// interleaved with the dated ones, so the axis stays honest about what it doesn't know).

// The fold grains, coarsest interval → finest, bracketed by the two limits: `all`
// (time folded away — one band) and `sequence` (time fully unfolded — one band each,
// in record order). `auto` is resolved from the data's span by suggestGrain.
export const TIME_GRAINS = Object.freeze([
  { id: 'auto',     label: 'auto',     short: '·' },
  { id: 'all',      label: 'all',      short: '∞' },
  { id: 'decade',   label: 'decade',   short: '10y' },
  { id: 'year',     label: 'year',     short: 'y' },
  { id: 'quarter',  label: 'quarter',  short: 'Q' },
  { id: 'month',    label: 'month',    short: 'mo' },
  { id: 'week',     label: 'week',     short: 'wk' },
  { id: 'day',      label: 'day',      short: 'd' },
  { id: 'hour',     label: 'hour',     short: 'h' },
  { id: 'sequence', label: 'sequence', short: '1·2·3' },
]);

export const GRAIN_IDS = Object.freeze(TIME_GRAINS.map((g) => g.id));
export const DEFAULT_GRAIN = 'auto';

// Coarse → fine, the calendar grains only (no auto/all/sequence) — the ladder
// suggestGrain climbs and the ⊕/⊖ fold steppers walk.
const LADDER = Object.freeze(['decade', 'year', 'quarter', 'month', 'week', 'day', 'hour']);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

// A time may arrive as epoch-ms (event `t`, source recordedAt) or an ISO string
// (`retrieved`). Normalise to ms; a non-positive number or an unparseable string is
// "undated" (the openEvent default t=0 is exactly this sentinel), returned as null.
const toMs = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const p = Date.parse(v);
  return Number.isNaN(p) ? null : p;
};

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);

// The bucket a millisecond falls in, for a calendar grain: its start ms (t0), a stable
// key, and a compact label. All arithmetic is UTC so the fold is deterministic across
// timezones — the same log always folds to the same bands.
const bucketOf = (ms, grain) => {
  const d = new Date(ms);
  const y = d.getUTCFullYear(), mo = d.getUTCMonth(), date = d.getUTCDate(), hr = d.getUTCHours();
  switch (grain) {
    case 'decade': { const dec = Math.floor(y / 10) * 10;
      return { t0: Date.UTC(dec, 0, 1), key: 'dec' + dec, label: dec + 's' }; }
    case 'year':
      return { t0: Date.UTC(y, 0, 1), key: 'y' + y, label: '' + y };
    case 'quarter': { const q = Math.floor(mo / 3);
      return { t0: Date.UTC(y, q * 3, 1), key: y + 'q' + q, label: 'Q' + (q + 1) + ' ' + y }; }
    case 'month':
      return { t0: Date.UTC(y, mo, 1), key: y + 'm' + mo, label: MON[mo] + ' ' + y };
    case 'week': {
      const d0 = Date.UTC(y, mo, date);
      const dow = (new Date(d0).getUTCDay() + 6) % 7;   // Monday = 0
      const t0 = d0 - dow * DAY_MS, s = new Date(t0);
      return { t0, key: 'w' + t0, label: 'wk ' + MON[s.getUTCMonth()] + ' ' + s.getUTCDate() }; }
    case 'day':
      return { t0: Date.UTC(y, mo, date), key: 'd' + Date.UTC(y, mo, date), label: MON[mo] + ' ' + date + ', ' + y };
    case 'hour':
      return { t0: Date.UTC(y, mo, date, hr), key: 'h' + Date.UTC(y, mo, date, hr), label: MON[mo] + ' ' + date + ' ' + pad2(hr) + ':00' };
    default: {   // an instant (the `sequence` fold) — label unambiguous across years
      const mi = d.getUTCMinutes();
      const day = y + '-' + pad2(mo + 1) + '-' + pad2(date);
      return { t0: ms, key: 't' + ms, label: (hr || mi) ? day + ' ' + pad2(hr) + ':' + pad2(mi) : day };
    }
  }
};

// Pick a sensible calendar grain from a span of milliseconds — enough bands to read a
// trend, few enough to stay legible. Returned by foldTime when the grain is `auto`.
export const suggestGrain = (spanMs) => {
  if (!(spanMs > 0)) return 'all';
  const days = spanMs / DAY_MS;
  if (days > 3650) return 'decade';
  if (days > 730)  return 'year';
  if (days > 180)  return 'quarter';
  if (days > 45)   return 'month';
  if (days > 10)   return 'week';
  if (days > 1.5)  return 'day';
  return 'hour';
};

// Step the fold one notch coarser (folding more time together) or finer, walking
// all → decade → … → hour → sequence. `auto` resolves against the given span first,
// so ⊕/⊖ move relative to what auto chose. Returns a concrete grain id.
export const stepGrain = (grain, dir, spanMs = 0) => {
  const chain = ['all', ...LADDER, 'sequence'];
  let cur = grain === 'auto' ? suggestGrain(spanMs) : grain;
  let i = chain.indexOf(cur);
  if (i < 0) i = chain.indexOf('all');
  const j = Math.max(0, Math.min(chain.length - 1, i + (dir < 0 ? -1 : 1)));
  return chain[j];
};

// Fold `items` into ordered time bands at `grain`.
//   items    any objects carrying a time (read via opts.timeOf, default o => o.t)
//   grain    a GRAIN_IDS value; 'auto' resolves from the span
//   opts.timeOf(item) → epoch-ms | ISO string | null
// Bands come back oldest → newest; undated items (if any) trail in one `undated` band.
export const foldTime = (items = [], grain = DEFAULT_GRAIN, opts = {}) => {
  const timeOf = opts.timeOf || ((o) => (o ? o.t : null));
  const dated = [], undated = [];
  let min = Infinity, max = -Infinity;
  for (const it of items) {
    const ms = toMs(timeOf(it));
    if (ms == null) { undated.push(it); continue; }
    dated.push({ it, ms });
    if (ms < min) min = ms;
    if (ms > max) max = ms;
  }
  const span = dated.length ? { min, max } : { min: null, max: null };
  const requested = GRAIN_IDS.includes(grain) ? grain : DEFAULT_GRAIN;
  let resolved = requested === 'auto' ? suggestGrain(dated.length ? max - min : 0) : requested;

  const bands = [];
  const trailUndated = () => {
    if (undated.length) bands.push({ key: 'undated', label: 'undated', t0: Infinity, t1: Infinity, index: bands.length, items: undated });
  };

  if (!dated.length) {
    // nothing to place on the axis — one band, either the undated bucket or empty `all`
    if (undated.length) trailUndated();
    else bands.push({ key: 'all', label: 'all', t0: null, t1: null, index: 0, items: [] });
    return { grain: resolved, requested, bands, span, dated: 0, undated: undated.length };
  }

  if (resolved === 'all') {
    bands.push({ key: 'all', label: 'all', t0: min, t1: max, index: 0, items: dated.map((d) => d.it) });
  } else if (resolved === 'sequence') {
    dated.slice().sort((a, b) => a.ms - b.ms || 0)
      .forEach((d, i) => { const b = bucketOf(d.ms, 'instant');
        bands.push({ key: 'seq' + i, label: b.label, t0: d.ms, t1: d.ms, index: i, items: [d.it] }); });
  } else {
    const by = new Map();
    for (const d of dated) {
      const b = bucketOf(d.ms, resolved);
      let g = by.get(b.key);
      if (!g) by.set(b.key, g = { key: b.key, label: b.label, t0: b.t0, t1: b.t0, items: [] });
      g.items.push(d.it);
      if (d.ms > g.t1) g.t1 = d.ms;
    }
    [...by.values()].sort((a, b) => a.t0 - b.t0).forEach((g, i) => { g.index = i; bands.push(g); });
  }
  trailUndated();
  return { grain: resolved, requested, bands, span, dated: dated.length, undated: undated.length };
};
