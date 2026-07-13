// EO: NUL(Field → Void, Clearing) — the dashboard, rendered from the reading log
// dashboard/render.js — a dashboard is a grid of tiles, and each tile is a PROJECTION of one
// watch's append-only reading log (spec.js): the latest value big, the change since last pull as
// a coloured arrow, a sparkline of the recent history, and the page it came from. Pure string
// work over (watch, readings) — no DOM, no fetch — so the same render can be pinned in a test and
// the surface (mount.js) only has to swap innerHTML and wire the data-action buttons.

import { latest, latestOk, trend, sparkPoints, hostOf } from './spec.js';
import { readValue } from './extract.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A relative "when" for a reading's timestamp — "just now", "4m ago", "yesterday" — read against
// a `now` the caller passes (pure: no clock in here). Falls back to the raw value on a bad date.
export const relTime = (at, now) => {
  const t = Date.parse(at || '');
  const ref = Number.isFinite(now) ? now : Date.parse(at || '');
  if (!Number.isFinite(t) || !Number.isFinite(ref)) return '';
  const s = Math.max(0, Math.round((ref - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
};

// A sparkline as an inline SVG polyline from the normalized points (spec.sparkPoints). y is
// flipped so a rising value rises on screen. Empty (too few points) → a flat baseline hint.
const sparkline = (readings) => {
  const pts = sparkPoints(readings, 32);
  const W = 108, H = 30, pad = 2;
  if (pts.length < 2) return `<svg class="eo-dash-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" y1="${H - pad}" x2="${W}" y2="${H - pad}" class="eo-dash-spark-base"/></svg>`;
  const xy = pts.map((p) => `${(pad + p.x * (W - 2 * pad)).toFixed(1)},${(pad + (1 - p.y) * (H - 2 * pad)).toFixed(1)}`);
  const last = xy[xy.length - 1].split(',');
  return `<svg class="eo-dash-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`
    + `<polyline points="${xy.join(' ')}" fill="none" class="eo-dash-spark-line"/>`
    + `<circle cx="${last[0]}" cy="${last[1]}" r="2.2" class="eo-dash-spark-dot"/></svg>`;
};

// One tile's inner HTML from its watch + reading log. Shows the last GOOD value (so a momentary
// empty pull doesn't blank the tile), the trend arrow, the sparkline, the source host, and a
// small status line when the most recent pull failed — the failure surfaced, never hidden behind
// a stale number.
const tile = (watch, readings, now) => {
  const good = latestOk(readings);
  const last = latest(readings);
  const tr = trend(readings);
  const display = good ? (good.display != null ? good.display : readValue(good.raw, watch.kind).display) : '—';
  const arrow = tr ? (tr.dir === 'up' ? '▲' : tr.dir === 'down' ? '▼' : '▬') : '';
  const pct = tr && tr.pct != null ? `${tr.pct >= 0 ? '+' : ''}${tr.pct.toFixed(tr.pct === 0 ? 0 : 1)}%` : '';
  const trendCls = tr ? `eo-dash-trend eo-dash-${tr.dir}` : 'eo-dash-trend';
  const stale = last && !last.ok;
  const when = good ? relTime(good.at, now) : '';
  return `
    <div class="eo-dash-tile" data-id="${esc(watch.id)}">
      <div class="eo-dash-tile-head">
        <span class="eo-dash-label" title="${esc(watch.label)}">${esc(watch.label)}</span>
        <span class="eo-dash-tools">
          <button data-action="refresh" data-id="${esc(watch.id)}" title="Refresh now">↻</button>
          <button data-action="open" data-id="${esc(watch.id)}" title="Open the page">↗</button>
          <button data-action="remove" data-id="${esc(watch.id)}" title="Remove">✕</button>
        </span>
      </div>
      <div class="eo-dash-value">${esc(display)}${watch.unit ? `<span class="eo-dash-unit">${esc(watch.unit)}</span>` : ''}</div>
      <div class="eo-dash-meta">
        ${tr ? `<span class="${trendCls}">${arrow} ${esc(pct)}</span>` : '<span class="eo-dash-trend eo-dash-flat">new</span>'}
        ${sparkline(readings)}
      </div>
      <div class="eo-dash-foot">
        <span class="eo-dash-src" title="${esc(watch.url)}">${esc(hostOf(watch.url))}</span>
        <span class="eo-dash-when">${stale ? `<span class="eo-dash-err" title="${esc(last.error || 'could not read')}">⚠ ${esc(last.error || 'unread')}</span>` : esc(when)}</span>
      </div>
    </div>`;
};

// renderDashboard(watches, readingsMap, { now }) → the whole grid. Empty state invites the first
// pin. `readingsMap` is { watchId: [reading] }.
export const renderDashboard = (watches, readingsMap = {}, { now } = {}) => {
  const list = watches || [];
  if (!list.length) {
    return `<div class="eo-dash-empty">
      <div class="eo-dash-empty-glyph">📊</div>
      <p><b>No metrics yet.</b></p>
      <p>Paste a page's URL, then click the exact number, price, or status you want to watch — no code. It refreshes every time you open this dashboard.</p>
    </div>`;
  }
  return `<div class="eo-dash-grid">${list.map((w) => tile(w, readingsMap[w.id] || [], now)).join('')}</div>`;
};

export const DASHBOARD_CSS = `
.eo-dash{display:flex;flex-direction:column;height:100%;min-height:320px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1b1f24;background:#f7f8fa}
.eo-dash-bar{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #e6e8ec;background:#fff}
.eo-dash-bar h3{margin:0;font-size:14px;font-weight:800;flex:1}
.eo-dash-add{padding:7px 12px;border:0;border-radius:8px;background:#4338ca;color:#fff;font-weight:650;cursor:pointer;font-size:13px}
.eo-dash-add:hover{background:#3730a3}
.eo-dash-refreshall{padding:7px 10px;border:1px solid #dde0e5;border-radius:8px;background:#fff;color:#4338ca;cursor:pointer;font-size:13px}
.eo-dash-refreshall[disabled]{opacity:.5;cursor:default}
.eo-dash-body{flex:1;min-height:0;overflow:auto;padding:12px}
.eo-dash-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
.eo-dash-tile{background:#fff;border:1px solid #e6e8ec;border-radius:12px;padding:12px 13px;display:flex;flex-direction:column;gap:7px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.eo-dash-tile-head{display:flex;align-items:flex-start;gap:6px}
.eo-dash-label{flex:1;font-size:11.5px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.eo-dash-tools{display:flex;gap:2px;opacity:0;transition:opacity .12s}
.eo-dash-tile:hover .eo-dash-tools{opacity:1}
.eo-dash-tools button{width:22px;height:22px;border:0;border-radius:6px;background:transparent;color:#9aa1ab;cursor:pointer;font-size:13px;line-height:1}
.eo-dash-tools button:hover{background:#f0f1f3;color:#1b1f24}
.eo-dash-value{font-size:26px;font-weight:800;line-height:1.05;font-variant-numeric:tabular-nums;word-break:break-word}
.eo-dash-unit{font-size:14px;font-weight:600;color:#9aa1ab;margin-left:4px}
.eo-dash-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:30px}
.eo-dash-trend{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.eo-dash-up{color:#15803d}.eo-dash-down{color:#b91c1c}.eo-dash-flat{color:#9aa1ab}
.eo-dash-spark{width:108px;height:30px;flex:0 0 auto}
.eo-dash-spark-line{stroke:#4338ca;stroke-width:1.6;vector-effect:non-scaling-stroke}
.eo-dash-spark-dot{fill:#4338ca}
.eo-dash-spark-base{stroke:#e6e8ec;stroke-width:1;vector-effect:non-scaling-stroke}
.eo-dash-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:#9aa1ab}
.eo-dash-src{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:55%}
.eo-dash-err{color:#b45309}
.eo-dash-empty{margin:auto;max-width:320px;text-align:center;color:#6b7280;padding:26px}
.eo-dash-empty-glyph{font-size:34px;margin-bottom:6px}
.eo-dash-empty p{margin:6px 0}
`;
