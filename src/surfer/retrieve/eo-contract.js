// EO contracts for the retrieve holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/surfer/retrieve/chrome.js': contract({ ops: ['DEF'], targets: ['Field'], products: ['Lens'], stances: ['Dissecting'], note: 'reference-chrome filter' }),
  'src/surfer/retrieve/hybrid.js': contract({ ops: ['CON', 'SEG', 'SIG'], targets: ['Field', 'Network'], products: ['Field'], stances: ['Binding', 'Dissecting', 'Tracing'], note: 'fuse + reserve + trim' }),
  'src/surfer/retrieve/index.js': contract({ ops: ['SIG', 'SEG', 'CON', 'DEF'], targets: ['Field', 'Network'], products: ['Field', 'Lens'], stances: ['Tending', 'Dissecting', 'Tracing'], note: 'barrel' }),
  'src/surfer/retrieve/lexical.js': contract({ ops: ['SIG', 'SEG'], targets: ['Field'], products: ['Field'], stances: ['Tending', 'Dissecting'], note: 'forward token-set retrieval' }),
  'src/surfer/retrieve/semantic.js': contract({ ops: ['SIG', 'SEG'], targets: ['Field'], products: ['Field'], stances: ['Tending', 'Dissecting'], note: 'embedding cosine retrieval' }),
  'src/surfer/retrieve/structural.js': contract({ ops: ['SEG', 'SIG', 'DEF'], targets: ['Field', 'Network'], products: ['Field', 'Lens'], stances: ['Unraveling', 'Tracing'], note: 'skeleton + member retrieval' }),
});
