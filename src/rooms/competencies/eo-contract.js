// EO contracts for the competencies holon — the Act/Site/Stance faces of every module, with the Site
// face split into targets (what it reads) and products (what it writes). Validated by
// tests/contracts.test.js against the cube's coherence guard. See docs/eo-for-coders.md.
//
// The competencies holon is the installable-faculty catalog: it reads the body's available cube
// cells, checkpoint laws, prerequisites, and upkeep budget, then projects them into a reversible
// install-set and body plan. It is an ontology-of-organs surface: competencies are kinds of organs
// before a person elects to instantiate them.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/competencies/catalog.js': contract({ ops: ['INS', 'DEF', 'EVA', 'REC'], targets: ['Kind', 'Lens', 'Field'], products: ['Kind', 'Entity', 'Lens', 'Paradigm'], stances: ['Making', 'Dissecting', 'Binding', 'Composing'], note: 'the competency catalog + install fold — organ kinds checkpointed, budgeted, and projected into an installed body' }),
});
