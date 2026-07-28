// EO: TEND(Void → Field, Tending) — the one build step, run only at deploy time.
// The src/** tree stays a buildless ES-module graph for local dev (npm run serve serves it
// as-is, unbundled — no build step in the loop). This script exists ONLY so the deployed
// GitHub Pages site doesn't have to make ~800 separate HTTP requests for the module graph
// on every load: it bundles the SAME graph, starting from the SAME entry (boot.js), into
// one file plus a few lazy chunks, and writes them back into src/rooms/reader/ (never
// committed — see .gitignore) so relative `new URL('./x.js', import.meta.url)` lazy-import
// sites (eo/pdf-eyes.js, eo/vision.js, eo/ocr-eyes.js, video-frames.js — files the bundler
// can't statically resolve because the specifier isn't a literal) keep resolving exactly
// where they already live, unbundled, fetched only when actually used.
//
// Remote ESM imports (CDN URLs — pdf.js, readability, papaparse, xlsx, transformers.js) and
// Node builtins (dynamic `import('node:fs/promises')`, reachable only from Node-only code
// paths) are left alone: `external` tells esbuild not to try to resolve them into the graph.
import { build } from 'esbuild';

const OUT_DIR = 'src/rooms/reader';

await build({
  entryPoints: { 'boot.bundle': 'src/rooms/reader/boot.js' },
  bundle: true,
  splitting: true,
  format: 'esm',
  outdir: OUT_DIR,
  chunkNames: 'chunk-[hash]',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: true,
  external: ['node:*', 'https://*', 'http://*'],
  logLevel: 'info',
});
