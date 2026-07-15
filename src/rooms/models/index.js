// EO: INS·SEG·NUL(Kind,Field → Entity,Lens,Void, Making,Dissecting,Clearing) — the models room entrance
// The models room's one entrance (holon law: outside the boundary, only index.js is visible).
// The model-manager surface — a real place to install the local talkers and watch them download,
// connect a hosted / local-server model, set which one the reader uses, and reclaim the disk they
// take. The surface drives the actual backend load() machinery (model/index.js); the catalog is
// the pure description + status folds it projects.
export { mountModelsSurface } from './surface.js';
export {
  buildCatalog, buildCoders, GROUPS, TALKERS, BUILTINS,
  deriveStatus, installability, actionLabel, connecting,
  readInstalled, writeInstalled, markInstalled, unmarkInstalled,
  fmtBytes, INSTALLED_KEY, ACTIVE_KEY, SPEED_KEY,
} from './catalog.js';
