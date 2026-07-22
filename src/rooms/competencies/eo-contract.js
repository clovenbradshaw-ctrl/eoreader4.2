// EO contracts for the competencies holon — the Act/Site/Stance faces of every module, with
// the Site face split into targets (what it reads) and products (what it writes). Validated by
// tests/contracts.test.js against the cube's coherence guard. See docs/eo-for-coders.md.
//
// The competencies holon is the human-facing install surface for a faculty: catalog.js is the
// pure description + the three-gate fold (checkpoint · requires · budget); surface.js drives
// the real DOM and holds only presentation state. See catalog.js's own header for the concept.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/competencies/index.js': contract({ ops: ['INS', 'SEG', 'NUL'], targets: ['Kind', 'Field'], products: ['Entity', 'Lens', 'Void'], stances: ['Making', 'Dissecting', 'Clearing'], note: 'barrel — the competencies room entrance' }),
  'src/rooms/competencies/catalog.js': contract({ ops: ['INS', 'SEG', 'EVA'], targets: ['Kind', 'Field'], products: ['Kind', 'Lens'], stances: ['Making', 'Dissecting', 'Binding'], note: 'the competency catalog + install-fold — checkpoint · requires · budget gates, install/uninstall, projectBody (its literal per-competency `op:` cells are data, not emissions — see tests/op-fidelity.test.js EXEMPT)' }),
  'src/rooms/competencies/surface.js': contract({ ops: ['INS', 'NUL'], targets: ['Field'], products: ['Entity', 'Void'], stances: ['Making', 'Clearing'], note: 'the competencies DOM surface — cards, the budget/upkeep gauge, install/uninstall, the always-refused forbidden card' }),
});
