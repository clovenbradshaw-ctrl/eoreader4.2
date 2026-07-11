// Style edits — holon-addressed, layered, and checked at the Atmosphere grain
// (src/organs/code/style.js). The point the page composer proved and this pins: because
// every element is holonically addressable, an edit is a DEF at an address on a face —
// uniform across style and content — and a color set at Atmosphere is CHECKED for
// contrast (the look must still support the reading), not applied blind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretStyleEdit, styleCheck, contrastRatio, overridesToCss, parseColor } from '../src/organs/code/style.js';

test('contrast is computed by WCAG; the checkpoint flags an unreadable choice', () => {
  assert.ok(contrastRatio('#000000', '#ffffff') > 20, 'black on white is maximal');
  const bad = styleCheck({ background: 'red', text: '#e7ecf3' });
  assert.equal(bad.aa, false);
  assert.ok(bad.ratio < 4.5 && bad.suggestion, 'a low-contrast choice is flagged with a fix');
  // the suggestion keeps the hue (still a red) but is readable
  const fixed = styleCheck({ background: bad.suggestion, text: '#e7ecf3' });
  assert.ok(fixed.aa, `the suggested ${bad.suggestion} clears AA`);
  assert.ok(parseColor(bad.suggestion).r > parseColor(bad.suggestion).g, 'and it is still red-dominant');
});

test('"change the background to red" → a body DEF, carrying its contrast check', () => {
  const e = interpretStyleEdit('change the background to red', { text: '#e7ecf3' });
  assert.deepEqual(e.edits[0], { selector: 'body', decls: { background: 'red' }, why: 'change the background to red' });
  assert.equal(e.check.aa, false, 'the checkpoint rode along and flagged it');
});

test('"make the buttons look better" → a holon-CLASS edit (tag=button), taste from tokens', () => {
  const e = interpretStyleEdit('make the buttons look better', { accent: '#5eb0ff' });
  assert.ok(e.edits.some((x) => x.tag === 'button'), 'targets the button holon class, not an invented selector');
  assert.ok(e.edits[0].decls['border-radius'] && e.edits[0].decls.background === '#5eb0ff', 'derived from the page accent, not a hardcoded look');
});

test('overrides render as HOLON-addressed rules — the address is the selector', () => {
  const css = overridesToCss([
    { holon: 'site.root.hero.h1', decls: { 'font-size': '3rem' } },
    { tag: 'button', decls: { color: 'white' } },
    { selector: 'body', decls: { background: '#111' } },
  ]);
  assert.ok(css.includes('[data-h="site.root.hero.h1"] { font-size: 3rem }'), 'a specific holon');
  assert.ok(css.includes('[data-h-tag="button"] { color: white }'), 'a holon class');
  assert.ok(css.includes('body { background: #111 }'), 'the document canvas');
});

test('an unrecognized request resolves to nothing — never a guessed edit', () => {
  const e = interpretStyleEdit('do something cool', {});
  assert.equal(e.edits.length, 0);
  assert.ok(e.unresolved);
});
