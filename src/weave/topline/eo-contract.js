// EO contracts for the topline holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Validated by tests/contracts.test.js against the cube's coherence guard.
// See docs/eo-for-coders.md and docs/topline.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/weave/topline/index.js': contract({ ops: ['SYN', 'EVA', 'SEG', 'NUL'], targets: ['Network', 'Link', 'Field'], products: ['Field', 'Lens', 'Void'], stances: ['Composing', 'Binding', 'Clearing'], note: 'barrel' }),
  'src/weave/topline/contain.js': contract({ ops: ['EVA', 'SEG'], targets: ['Field', 'Link'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'the set-containment safety gate' }),
  'src/weave/topline/surface.js': contract({ ops: ['EVA', 'SEG', 'SYN'], targets: ['Field', 'Link', 'Lens'], products: ['Lens', 'Void'], stances: ['Binding', 'Dissecting', 'Composing'], note: 'the form surface — the summarizer contract and its verifier' }),
  'src/weave/topline/inventory.js': contract({ ops: ['SEG', 'CON', 'NUL'], targets: ['Network', 'Link', 'Field'], products: ['Lens', 'Void'], stances: ['Dissecting', 'Binding', 'Clearing'], note: 'the closed, ordered inventory' }),
  'src/weave/topline/adapt.js': contract({ ops: ['SEG', 'CON'], targets: ['Network', 'Link'], products: ['Network'], stances: ['Dissecting', 'Binding'], note: 'profile → closed inventory' }),
  'src/weave/topline/phrase.js': contract({ ops: ['INS', 'DEF', 'EVA'], targets: ['Entity', 'Lens'], products: ['Entity', 'Lens'], stances: ['Making', 'Binding'], note: 'pass one — one object, one sentence' }),
  'src/weave/topline/join.js': contract({ ops: ['SYN', 'EVA', 'NUL'], targets: ['Field', 'Link'], products: ['Field', 'Lens', 'Void'], stances: ['Composing', 'Binding', 'Clearing'], note: 'pass two — join, containment-gated' }),
  'src/weave/topline/feedback.js': contract({ ops: ['EVA', 'SEG', 'NUL'], targets: ['Lens', 'Network'], products: ['Network', 'Void'], stances: ['Binding', 'Dissecting', 'Clearing'], note: 'feedback as steering over the closed set' }),
  'src/weave/topline/topline.js': contract({ ops: ['SYN', 'EVA'], targets: ['Network', 'Field'], products: ['Field', 'Lens'], stances: ['Composing', 'Binding'], note: 'the two-pass generator' }),
  'src/weave/topline/contextual.js': contract({ ops: ['SYN'], targets: ['Network', 'Field', 'Lens'], products: ['Field'], stances: ['Composing'], note: 'the fold-aware contextual definition (writer)' }),
  'src/weave/topline/definer.js': contract({ ops: ['EVA', 'SEG'], targets: ['Field', 'Network'], products: ['Lens', 'Atmosphere'], stances: ['Binding', 'Tracing', 'Tending'], note: "the definer's un-authored fitness" }),
  'src/weave/topline/chorus.js': contract({ ops: ['SYN', 'SEG', 'EVA'], targets: ['Network', 'Field'], products: ['Network', 'Lens'], stances: ['Composing', 'Dissecting', 'Tracing'], note: 'the evolving definer chorus' }),
  'src/weave/topline/digest.js': contract({ ops: ['SYN', 'SEG', 'EVA'], targets: ['Network', 'Field'], products: ['Network', 'Lens'], stances: ['Composing', 'Dissecting', 'Tracing'], note: 'the entity digest — chapter spine + on-demand important/surprising + passage zoom' }),
  'src/weave/topline/emergent-name.js': contract({ ops: ['SEG', 'DEF'], targets: ['Field', 'Link'], products: ['Field', 'Lens'], stances: ['Dissecting', 'Making'], note: 'emergent section names — the distinctive term of a stretch' }),
});
