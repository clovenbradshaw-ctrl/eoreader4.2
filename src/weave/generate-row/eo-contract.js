// EO contracts for the generate-row holon — docs/generate-row-stance-templates.md.
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/weave/generate-row/stance.js': contract({ ops: ['REC', 'CON'], targets: ['Lens'], products: ['Link', 'Atmosphere', 'Lens', 'Paradigm'], stances: ['Binding', 'Cultivating', 'Making', 'Composing'], note: 'row-stance legality over ρ (stanceLegality, legalCellFor)' }),
  'src/weave/generate-row/join.js': contract({ ops: ['CON', 'EVA'], targets: ['Lens'], products: ['Link', 'Network'], stances: ['Binding', 'Tracing'], note: 'grounded row joins — agree/oppose/causal/temporal/measure/contrasts/qualifies (proposeJoin, groundJoin)' }),
  'src/weave/generate-row/slots.js': contract({ ops: ['DEF'], targets: ['Lens'], products: ['Lens'], stances: ['Dissecting'], note: 'the closed slot-role vocabulary and per-shape palettes (SLOT_PALETTES, legalSlots)' }),
  'src/weave/generate-row/render.js': contract({ ops: ['REC', 'DEF'], targets: ['Lens'], products: ['Lens'], stances: ['Making', 'Dissecting'], note: 'deterministic row rendering + the bounded prosifier (realizeSlot, prosify)' }),
  'src/weave/generate-row/tokenize.js': contract({ ops: ['SEG'], targets: ['Link'], products: ['Link'], stances: ['Dissecting'], note: 'the one tokenizer render.js and row-veto.js share' }),
  'src/weave/generate-row/plan.js': contract({ ops: ['REC', 'DEF', 'EVA'], targets: ['Lens', 'Paradigm'], products: ['Lens', 'Paradigm'], stances: ['Composing', 'Making', 'Binding'], note: 'the eight composed row plans (planTemplate, PLANS, plus the gapReport/caption bypasses)' }),
  'src/weave/generate-row/index.js': contract({ ops: ['REC'], targets: ['Paradigm'], products: ['Paradigm'], stances: ['Composing'], note: 'barrel' }),
});
