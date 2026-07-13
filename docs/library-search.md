# The library shelf — easy search libraries, each with its own surface

> Every source the html can reach is a **library**, and every kind of thing deserves the surface
> it is. An encyclopedia hit is an article; a Gutenberg hit is a whole book; a Commons hit is a
> picture; a GitHub hit is a repository you can read the code of. One generic "title + snippet"
> row loses exactly what makes each shelf worth searching.

This is the search counterpart to the code organ (`docs/code-organ.md`): the code organ knows how
to *read* code into EOT and find issues from the dependency order; the **code shelf** here knows how
to *find and fetch* it. Both stand on the same one fetch primitive (`ctx.fetchUrl`, through the CORS
feed proxy) and the same admission core (`websource.js`), so a library hit is a normal, cited,
frozen source the moment it lands.

## Four featured shelves

Each is a search **kind** on the `(ctx, query, k) → items` contract (`webfetch.js SEARCH_SOURCES`)
with a **full-text hook** that reads the thing whole, and a **descriptor** (`libraries.js`) that
names the *customized surface* its hits wear.

| shelf | kind | surface | the thing | full text |
|---|---|---|---|---|
| **Wikipedia** | `wikipedia` | `article` | facts & entities | the clean API extract (no chrome) |
| **Project Gutenberg** | `gutenberg` | `book` | public-domain books | the **entire book**, boilerplate stripped |
| **Wikimedia Commons** | `commonsmedia` | `media` | free images/audio/video | attribution block + description-page extract |
| **GitHub** | `github` | `code` | repositories | the README — and, deliberately, the **whole codebase** |

`src/organs/ingest/libraries.js` is the registry both the engine and the surface read. Each
descriptor carries an `id`, `label`, `icon`, `accent`, the `kind` it searches, the `surface` layout
its cards wear, a tuned `placeholder`, `examples`, and a `card(item)` normalizer that turns a raw
search item (whatever fields its organ attached) into the fields the surface paints. `surfaceCard(item)`
is the one call the surface makes per hit; it routes by `source`/`kind` to the right normalizer and
degrades to an article card for anything off-shelf.

### The GitHub code shelf — ingest all code

`src/organs/ingest/github.js` is three motions on one contract:

- **Search** the public repository index (`api.github.com/search/repositories`, keyless, CORS-\*).
  Each hit is a repo — `owner/name`, stars, language, description, topics.
- **Full text** — under `fetchPages`, a repo reads its **README** (the project's own account of
  itself), the analogue of Gutenberg pulling the whole book.
- **Ingest** — `fetchGithubRepo(ref)` is the deliberate *"ingest all code"* path. It walks the
  repo's git tree (`git/trees/<branch>?recursive=1`), picks the source blobs
  (`pickCodeFiles` — the languages the code organ reads: JS/TS · Python · Go · Rust; vendored,
  minified, and oversize paths dropped; bounded by count and per-file size), pulls each through the
  same proxy, and hands the files to the **code organ** (`readCodebase` — code → EOT → issues from
  the dependency order). The whole codebase is admitted as one reading: README + a file manifest +
  the organ's findings. `fetchGithubFile(ref)` admits one file.

The code organ is reached by an **injected** `readCodebase` (default: a lazy `import`), so the
common search path never statically pulls the organ in, and the ingest is fully offline-testable.
`api.github.com`, `raw.githubusercontent.com`, and `objects.githubusercontent.com` all answer
cross-origin, so `direct-cors.js` lets the code shelf skip the proxy entirely.

### Wikimedia Commons — the media itself, not the descriptions

The old `commons` kind searched Commons the way every wiki is searched: `list=search` over the text
of File: description pages. But Commons is a **media repository** — its answer to "sunflower" is
photographs, not prose. `commonsmedia` (`wikimedia.js`) asks for the files: a `generator=search` in
the File namespace, each hit carrying its imageinfo (a thumbnail URL, the full-resolution URL, the
mime type, dimensions) and the license/author/description from `extmetadata`. `renderCommonsMedia`
turns a picture into a legible source — what it depicts, its type/dimensions, and its attribution —
because a media file has no prose body, so what is *known about it* is the source.

## Routing

`routeKind(query)` auto-routes when the caller asks for `'auto'` (`webfetch.js`): a **named** shelf
wins outright (`github …`, `gutenberg …`, `wikidata …`); then a repository/source-code ask →
`github` (kept before the book rule so "source code" never becomes a book); media-seeking phrasing
("photo of …", "free media …") → `commonsmedia`; the existing book/definition/quote/scholarly rules
follow. Picking a shelf explicitly (the surface's shelf chips) bypasses routing and searches that
shelf's own kind, so a Commons search is always a media grid, never the description text.

## The surface

`window.EO.app.libraries` is the shelf as plain, serializable data (each descriptor minus its card
function), exposed at `window.EO.libraries`. The reader's **Libraries** launcher opens a modal that
reads it: a row of shelf chips, a search box whose placeholder and example chips are tuned to the
picked shelf, and results rendered by type —

- **article** — title · lede · source link, **Add** to record;
- **book** — title · author · subjects, **Read whole book** (pulls the ebook entire);
- **media** — a thumbnail **grid**, each tile with its type, dimensions, license, and **Add**;
- **code** — `owner/repo` · language · ★stars · topics, **Ingest code** (the whole repo through the
  code organ) beside a **README** read.

Every result lands as a recorded source — hashed, citable, and frozen — like any other.

## The facing renderer — write HTML/JS, see it live

`src/rooms/render/` is the companion surface: a **facing-page WYSIWYG renderer** for the code the
shelf brings back. The source (HTML · CSS · JS) on one side, the **live render** on the other — the
same facing-page discipline as `replay.html` (`docs`/the replay surface), pointed at code instead of
a transcript. Type on the left; the right pane re-renders, executing the HTML and the JavaScript.

- `facing.js` is the pure fold: `splitSource` carves a pasted file into panes, `assembleDocument`
  welds the panes (plus a **console-capture shim**) into one iframe-ready `srcdoc` — a full HTML
  document is injected, never double-wrapped; a fragment is wrapped in a minimal page.
- `surface.js` (`mountFacingRenderer`) holds the editor state and a **sandboxed** iframe
  (`allow-scripts`, *not* `allow-same-origin` — the rendered code runs its own JS but cannot reach
  this origin, storage, or cookies; a deliberate toggle widens it). Under the render, a **console
  strip** shows what the code did — every `console.*` and every thrown error, mirrored back by the
  shim.

`render.html` is the standalone page (`npm run serve` → open it). It accepts a source three ways:
`?src=<url>` (fetched — a raw GitHub file loads straight in, direct-CORS or via the proxy), a
localStorage handoff from the reader (`window.EO.render.open(source)`), or nothing → a live demo.
`window.EO.render` also exposes `mount(el, opts)` to drop the renderer into a panel and the pure
`assembleDocument`/`splitSource`/`runnableSrcdoc` helpers.

## Files

```
src/organs/ingest/github.js       the code shelf — repos, files, whole codebases (via the code organ)
src/organs/ingest/wikimedia.js    + commonsmedia — the media itself (thumbs, mime, license)
src/organs/ingest/gutenberg.js    + clean author/subject fields for the book card
src/organs/ingest/libraries.js    the descriptor registry — the customized surface per kind
src/organs/ingest/webfetch.js     kinds + routing wired in
src/organs/ingest/direct-cors.js  + GitHub hosts (proxy-free)
src/rooms/render/facing.js        the facing renderer fold (pure)
src/rooms/render/surface.js       the facing renderer DOM surface
render.html                       the standalone facing renderer page
```

Tests: `tests/github.test.js`, `tests/commons-media.test.js`, `tests/libraries.test.js`,
`tests/facing-render.test.js` — all offline, with injected clients.
