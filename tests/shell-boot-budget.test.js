import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// PHASE-1 BUDGET (holon-architecture-refactor): index.html is a static boot shell now, not the
// whole application — the DC template + controller live in src/rooms/reader/ui/, fetched at
// runtime by shell-loader.js. These are the enforceable guarantees that keep it that way: a hard
// size ceiling, and a guard against the inline <x-dc>/<script data-dc-script> ever creeping back
// in (which would silently balloon this file back toward its pre-refactor ~1.1MB size).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_HTML = join(ROOT, 'index.html');

test('index.html stays under the 20KB boot-shell budget', () => {
  const bytes = statSync(INDEX_HTML).size;
  assert.ok(bytes < 20 * 1024, `index.html is ${bytes} bytes — over the 20KB Phase-1 budget`);
});

test('index.html carries no inline DC template or controller (they live in src/rooms/reader/ui/)', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.ok(!/<x-dc[\s>]/.test(html), 'a literal <x-dc> root would mean the template crept back inline');
  assert.ok(!html.includes('data-dc-script'), 'a literal data-dc-script would mean the controller crept back inline');
});

test('index.html loads the shell-loader module and the boot shell markup', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /<script type="module" src="src\/rooms\/reader\/ui\/shell-loader\.js"><\/script>/,
    'shell-loader.js is the one module entry that installs the reader surface');
  assert.match(html, /id="eo-boot-shell"/, 'the static loading shell is still the first thing painted');
});
