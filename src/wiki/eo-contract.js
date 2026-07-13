// EO contracts for the wiki holon — the Act/Site/Stance faces of every module, with the
// Site face split into targets (what it reads) and products (what it writes). Each entry
// mirrors the module's own EO header. Validated by tests/contracts.test.js against the
// cube's coherence guard: valid coordinates, on the diagonal, no desert cell (no module
// declares SYN·Cultivating). See docs/eo-for-coders.md and docs/terrain-typed-templates.md.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/wiki/terrains.js': contract({ ops: ['DEF', 'SEG'], targets: ['Kind'], products: ['Kind', 'Lens'], stances: ['Dissecting', 'Unraveling'], note: 'the nine terrain profiles + the identity/merge rule' }),
  'src/wiki/spine.js': contract({ ops: ['SYN', 'DEF'], targets: ['Network'], products: ['Kind'], stances: ['Composing', 'Unraveling'], note: 'the invariant nine-operator spine + sectionFor' }),
  'src/wiki/edges.js': contract({ ops: ['CON', 'EVA'], targets: ['Link'], products: ['Network', 'Paradigm'], stances: ['Binding', 'Tracing'], note: 'the typed edge grammar + cardinality checkpoint' }),
  'src/wiki/absence.js': contract({ ops: ['NUL', 'DEF'], targets: ['Void'], products: ['Void', 'Field'], stances: ['Clearing', 'Dissecting'], note: 'the typed absence of each terrain (headline content)' }),
  'src/wiki/naming.js': contract({ ops: ['DEF', 'SIG'], targets: ['Lens'], products: ['Entity', 'Field'], stances: ['Dissecting', 'Binding'], note: 'self-generating designators, cheap-first / model-gated' }),
  'src/wiki/project.js': contract({ ops: ['SYN', 'REC'], targets: ['Entity'], products: ['Network', 'Paradigm'], stances: ['Making', 'Composing'], note: 'renderArticle — the article as a read-time projection' }),
  'src/wiki/migrate.js': contract({ ops: ['REC', 'SEG'], targets: ['Void'], products: ['Entity', 'Network'], stances: ['Composing', 'Unraveling'], note: 'terrain migration — supersession, never overwrite' }),
  'src/wiki/render.js': contract({ ops: ['SIG', 'CON'], targets: ['Entity'], products: ['Lens', 'Atmosphere'], stances: ['Binding', 'Tending'], note: 'the narrow-panel + hero article view' }),
  'src/wiki/index.js': contract({ ops: ['SYN', 'SIG'], targets: ['Kind'], products: ['Network', 'Field'], stances: ['Composing', 'Binding'], note: 'the wiki holon barrel' }),
});
