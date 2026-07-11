// Load the vendored libolm (vendor/olm) as a real, initialised Olm namespace for
// tests. In the browser the app loads olm.js via a <script> tag (it sets window.Olm);
// under node the file's UMD/emscripten wrapper does not survive `require` cleanly, so
// we evaluate it in a fresh CommonJS-shaped scope and hand it the wasm via locateFile.
// The result is the SAME artifact the browser runs — tests exercise real Olm/Megolm.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OLM_DIR = path.join(HERE, '..', '..', 'vendor', 'olm');

let cached = null;

export const loadOlm = async () => {
  if (cached) return cached;
  const code = readFileSync(path.join(OLM_DIR, 'olm.js'), 'utf8');
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__filename', '__dirname',
    code + '\nreturn module.exports;');
  const Olm = fn(mod, mod.exports, require, path.join(OLM_DIR, 'olm.js'), OLM_DIR);
  await Olm.init({ locateFile: () => path.join(OLM_DIR, 'olm.wasm') });
  cached = Olm;
  return Olm;
};
