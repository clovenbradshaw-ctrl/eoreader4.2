import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPriorsSurface } from '../src/rooms/competencies/index.js';

const button = (html, label) => html.includes(`>${label}<`);

test('Priors surface renders installable priors and persists the installed fold', () => {
  const store = new Map();
  const localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const listeners = {};
  const mount = {
    innerHTML: '',
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const handle = mountPriorsSurface(mount, { store: localStorage, budget: 18 });
  assert.match(mount.innerHTML, /EO Reader · Priors/);
  assert.match(mount.innerHTML, /Install Prior/);
  assert.ok(button(mount.innerHTML, 'Forget Prior'), 'built-in Priors render as already installed');

  listeners.click({ target: { closest: () => ({ dataset: { act: 'install', id: 'close-reading' } }) } });
  assert.ok(handle.state.installed.includes('close-reading'));
  assert.match(store.get('eo_priors_installed_v1'), /close-reading/);

  handle.destroy();
  assert.equal(mount.innerHTML, '');
});
