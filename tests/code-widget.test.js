// The widget target — an EOT blueprint → a full HTML widget that RENDERS and RESPONDS
// (src/organs/code/widget.js). The real-browser proof (Chromium via Playwright) is an
// out-of-band demo — CI has no browser — so here the emitted behavior is driven against
// a tiny DOM stub: state, render, and the data-on bindings run for real, clicks mutate
// state, and the re-render reflects it. Plus the organ's checkpoint: a template slot or
// handler that references a name the state never declares is caught before the widget
// is trusted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeWidget, composeWidgetAndVerify } from '../src/organs/code/widget.js';

const COUNTER = `
counter : Widget
counter.title = "Counter"
counter.state = "count: 0, step: 1"
counter.template = "<div id='n'>{{count}}</div><button data-on='click:inc'>+</button><button data-on='click:dec'>-</button><button data-on='click:reset'>reset</button>"
inc : Handler
inc.body = "state.count += state.step;"
inc -> counter : handlerOf
dec : Handler
dec.body = "state.count -= state.step;"
dec -> counter : handlerOf
reset : Handler
reset.body = "state.count = 0;"
reset -> counter : handlerOf`;

// a minimal DOM the emitted shell can drive: innerHTML holds the rendered markup, and
// each data-on element binds its handler by name; click(name) fires it and lets the
// shell's __draw re-render. Exactly the surface widget.js's runtime touches.
const drive = (script) => {
  const bound = new Map();
  let html = '';
  const root = {
    set innerHTML(h) { html = h; },
    get innerHTML() { return html; },
    querySelectorAll() {
      bound.clear();
      return [...html.matchAll(/data-on=['"]([^'"]+)['"]/g)].map((m) => ({
        getAttribute: () => m[1],
        addEventListener: (_ev, fn) => bound.set(m[1].split(':')[1], fn),
      }));
    },
  };
  const document = { getElementById: () => root };
  // eslint-disable-next-line no-new-func
  new Function('document', script)(document);
  return {
    html: () => html,
    click: (name) => { const fn = bound.get(name); assert.ok(fn, `no handler ${name}`); fn({ target: {} }); },
  };
};

test('the counter widget validates, renders, and responds to clicks', () => {
  const v = composeWidgetAndVerify(COUNTER, { path: 'counter' });
  assert.equal(v.diagnostics.length, 0, 'the blueprint is valid EOT');
  assert.ok(v.ok, `the organ must pass the widget's behavior:\n${v.report}`);
  assert.ok(v.html.startsWith('<!doctype html>'), 'a complete, self-contained document');
  assert.ok(v.html.includes('<script type="module">') && v.html.includes('data-on'));

  const w = drive(v.script);
  const shown = () => /id=['"]n['"]>(-?\d+)</.exec(w.html())?.[1];
  assert.equal(shown(), '0', 'initial render shows the initial state');
  w.click('inc'); w.click('inc'); w.click('inc');
  assert.equal(shown(), '3', '+1 ×3');
  w.click('dec');
  assert.equal(shown(), '2', '-1');
  w.click('reset');
  assert.equal(shown(), '0', 'reset');
});

test('a helper function used in the template is emitted and callable', () => {
  const v = composeWidgetAndVerify(`
clock : Widget
clock.state = "h: 9, m: 5"
clock.template = "<span>{{pad(h)}}:{{pad(m)}}</span>"
pad : Function
pad.params = "n"
pad.expr = "String(n).padStart(2, '0')"`, { path: 'clock' });
  assert.ok(v.ok, v.report);
  const w = drive(v.script);
  assert.ok(w.html().includes('09:05'), `expected 09:05, got ${w.html()}`);
});

test('the checkpoint rejects a template slot referencing an undeclared state field', () => {
  const v = composeWidgetAndVerify(`
broken : Widget
broken.state = "count: 0"
broken.template = "<div>{{count}} of {{total}}</div>"`, { path: 'broken' });
  assert.equal(v.ok, false, 'a slot the state never declares must not pass');
  assert.ok(v.findings.some((f) => f.law === 'unbound' && f.name === 'total'),
    'the organ names the undeclared slot inside the render function');
});

test('the widget is deterministic — same blueprint, byte-identical HTML', () => {
  assert.equal(composeWidget(COUNTER).html, composeWidget(COUNTER).html);
});
