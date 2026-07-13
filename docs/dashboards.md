# Live dashboards — pin any element on any page and watch it

`src/rooms/dashboard/` · surfaced by the floating **📊** launcher (`boot.js` →
`mountDashboardLauncher`) · `window.EO.dashboards`

A dashboard is a grid of **metrics pulled from the live web**. A user who understands
nothing about code pastes a page's URL, **clicks the exact number, price, or status** they
care about, and gets a tile that re-pulls that page and re-reads that exact place every time
they open the dashboard. There is no selector to write, no script, no API — you point at what
you want and the picker reads its address for you.

> Every pull **appends** a reading to an append-only log. The tile you see — its value, its
> delta, its sparkline — is a **recomputed projection** of that log. Same discipline as the
> rest of the engine: the log is the truth.

## The idea, mechanically

1. **Pull** the page through the same CORS feed proxy the reader ingests with
   (`organs/ingest` `createWebClient().fetchUrl`) — raw HTML comes back.
2. **Pick** an element (`picker.js`). The HTML is rendered in a **sandboxed, script-free
   iframe** (`sandbox="allow-same-origin"`, *no* `allow-scripts` — the page's own JavaScript
   never runs). Hovering highlights the element under the cursor; a click reads:
   - a **durable CSS selector** for it (`select.js` `buildSelector`) — anchored on a good
     `id` when there is one, otherwise a short `tag.class` / `:nth-of-type` path, dropping
     volatile state classes (`is-active`, hashy CSS-module names) that would break next pull;
   - the **value** currently there, read the way a spreadsheet cell is read (`extract.js`
     reuses `rooms/data/values.js`): `$1,240.50` → money, `3,201 online` → the number 3201,
     `2026-07-13` → a date, anything else → text;
   - a **default label** from a nearby heading / `aria-label` (`select.js` `labelFor`).
3. **Watch** — the pick becomes a `watch` (`spec.js`): `{ url, selector, attr, kind, label }`
   with a stable id derived from what it points at (re-pinning the same element replaces, never
   stacks).
4. **Refresh** — opening the dashboard (or hitting *Refresh all*) re-pulls every watch's page,
   re-reads the pinned place, and **appends a reading** (`mount.js` `refreshWatch`). A pull that
   can't find the element is *itself* a reading (`ok:false`) — the failure is witnessed, never
   hidden behind a stale value.

## What a tile projects

From one watch's reading log (`spec.js` projections):

- **value** — the latest *good* reading (`latestOk`), so a momentary empty pull doesn't blank
  the tile;
- **trend** — the delta / percent change vs the previous numeric reading (`trend`), as a
  coloured ▲/▼;
- **sparkline** — the recent history normalized to a band (`sparkPoints` → an inline SVG in
  `render.js`);
- **source + freshness** — the page's host and how long ago it was read.

## The pieces (holon map)

| module | what it is |
|---|---|
| `spec.js` | the watch + its append-only reading log — pure state math + projections (`latest`, `trend`, `sparkPoints`). No DOM, no clock, no storage. |
| `extract.js` | a pulled string → the quantity it names (money / number / date / text), reusing `rooms/data/values.js`. Pure. |
| `select.js` | a clicked element → a durable CSS handle; a selector + a fetched document → the raw value. |
| `render.js` | the reading log → a grid of tiles (pure HTML + CSS). |
| `store.js` | watches + reading logs, persisted (storage injected — `localStorage` in the browser, a plain object in a test). |
| `picker.js` | the point-and-click element selector (sandboxed, script-free iframe). |
| `mount.js` | the dashboard surface, the floating launcher, and the pull → read → append refresh cycle. |

The pure core (`spec` · `extract` · `select` · `render` · `store`) is pinned in
`tests/dashboard.test.js` without a browser; the point-and-click flow is exercised
end-to-end in Chromium during development (paste a URL, click a price, get a tile).

## Persistence & privacy

Watches and their reading logs are persisted to `localStorage` (`eo_dashboard_v1`), so a
metric keeps its history across reloads. Pages are pulled through the reader's feed proxy —
the same path every ingested source already takes — and nothing about a dashboard leaves the
browser beyond those fetches. The picker never executes the fetched page's scripts.

## Reaching it in code

```js
window.EO.dashboards.store          // the live store (watches + reading logs)
window.EO.dashboards.fetchUrl(url)  // pull a page through the feed proxy → { text }
window.EO.dashboards.mountLauncher(host)   // drop the 📊 launcher somewhere else
```
