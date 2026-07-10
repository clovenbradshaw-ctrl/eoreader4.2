// EO contracts for the metabolism holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Validated by tests/contracts.test.js against the cube's coherence guard. See
// docs/eo-for-coders.md (Law 1). The metabolism is Ground-row, Significance-column
// work — the ambient, autonomic self-maintenance the essay "Something to Lose" argues
// makes the system a Holon rather than a Protogon: it EVA's its own operation and REC's
// its own allocation frame, under an external scarcity it cannot author.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/metabolism/scarcity.js': contract({ ops: ['DEF', 'SEG'], targets: ['Atmosphere', 'Field'], products: ['Atmosphere', 'Field'], stances: ['Clearing', 'Cultivating', 'Tending'], note: 'the external scarcity — currency, seasonal budget, the lean season' }),
  'src/metabolism/genome.js':   contract({ ops: ['REC', 'DEF'], targets: ['Paradigm', 'Network'], products: ['Paradigm', 'Lens'], stances: ['Composing', 'Making', 'Tracing'], note: 'the heritable genome — allocation params; REC is the mutation' }),
  'src/metabolism/fitness.js':  contract({ ops: ['EVA'], targets: ['Field', 'Network'], products: ['Lens', 'Atmosphere'], stances: ['Binding', 'Tracing', 'Tending'], note: 'the metabolic ratio — quality per unit resource, Goodhart-anchored' }),
  'src/metabolism/select.js':   contract({ ops: ['SEG', 'EVA'], targets: ['Network', 'Lens'], products: ['Link', 'Network'], stances: ['Dissecting', 'Binding', 'Tracing'], note: 'selection under scarcity — cull the wasteful, carry the fit forward' }),
  'src/metabolism/index.js':    contract({ ops: ['DEF', 'EVA', 'REC', 'SEG'], targets: ['Atmosphere', 'Network', 'Field'], products: ['Lens', 'Paradigm', 'Atmosphere'], stances: ['Tending', 'Tracing', 'Making', 'Composing', 'Dissecting'], note: 'the bloodstream — spend, measure, vary, select, inherit' }),
});
