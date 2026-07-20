// Read the reader surface's extracted DC parts (src/rooms/reader/ui/) for tests that used to
// pull them out of index.html via regex — the content moved (index.html is now a thin boot
// shell; shell-loader.js fetches these at runtime), the tests just need to point at the new
// files. See src/rooms/reader/ui/shell-loader.js for how the app assembles them at boot.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'rooms', 'reader', 'ui');

export const readShellCss = () => readFileSync(join(UI_DIR, 'shell.css'), 'utf8');
export const readShellTemplate = () => readFileSync(join(UI_DIR, 'shell.template.html'), 'utf8');
export const readShellLogic = () => readFileSync(join(UI_DIR, 'shell.logic.js'), 'utf8');

// The Component class the DC runtime evaluates shell.logic.js into (support.js `evalDcLogic`),
// built here against a minimal stub base class — the same shape tests already exercised when
// this source lived inline in index.html's <script data-dc-script>.
export const evalShellComponent = (StubDCLogic) => {
  class DefaultStub { constructor() {} setState() {} subscribe() { return () => {}; } }
  return new Function('DCLogic', readShellLogic() + '\nreturn Component;')(StubDCLogic || DefaultStub);
};
