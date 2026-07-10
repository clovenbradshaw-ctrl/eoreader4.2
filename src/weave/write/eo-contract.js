// EO contracts for the write holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/weave/write/assemble.js': contract({ ops: ['SYN', 'EVA', 'CON'], targets: ['Network', 'Field'], products: ['Field', 'Network'], stances: ['Composing', 'Tracing', 'Binding'], note: 'assemble the full LLM payload in one call' }),
  'src/weave/write/brief.js': contract({ ops: ['SYN', 'CON', 'EVA'], targets: ['Network', 'Field'], products: ['Field', 'Lens'], stances: ['Composing', 'Binding', 'Tracing'], note: 'phraser -> talker hand-off + propositional veto' }),
  'src/weave/write/concept-tokens.js': contract({ ops: ['CON', 'SYN', 'SIG'], targets: ['Entity', 'Field'], products: ['Link', 'Network'], stances: ['Binding', 'Composing', 'Tending'], note: 'the bridge; concept->token map + entity trie (Track B)' }),
  'src/weave/write/cursor.js': contract({ ops: ['NUL', 'DEF', 'SIG'], targets: ['Entity', 'Field'], products: ['Void', 'Lens'], stances: ['Clearing', 'Making', 'Tending'], note: 'the membrane; identity collapses to surface (§5)' }),
  'src/weave/write/eva.js': contract({ ops: ['EVA'], targets: ['Lens'], products: ['Lens'], stances: ['Binding', 'Tending'], note: 'a grammar rule held & tested (the write-side EVA)' }),
  'src/weave/write/fold.js': contract({ ops: ['INS', 'SIG', 'NUL'], targets: ['Entity'], products: ['Entity', 'Void'], stances: ['Making', 'Binding', 'Tending'], note: 'frontier + integral; the running state (§2)' }),
  'src/weave/write/folds.js': contract({ ops: ['EVA', 'DEF', 'NUL'], targets: ['Network', 'Field'], products: ['Lens', 'Paradigm'], stances: ['Binding', 'Tracing', 'Tending'], note: 'Map<Holder,Fold>; beliefOf/modelOf (§3,§9,§20)' }),
  'src/weave/write/frame.js': contract({ ops: ['EVA', 'DEF'], targets: ['Field', 'Network'], products: ['Lens'], stances: ['Tracing', 'Making'], note: 'piece-grain frame; the beat\'s site (streaming answer §8)' }),
  'src/weave/write/genders.js': contract({ ops: ['SIG', 'EVA'], targets: ['Entity', 'Network'], products: ['Kind'], stances: ['Binding', 'Tending'], note: 'gender inferred by reading, not a table' }),
  'src/weave/write/gravity.js': contract({ ops: ['SYN', 'EVA', 'DEF'], targets: ['Network', 'Field'], products: ['Network', 'Field', 'Lens'], stances: ['Composing', 'Tracing', 'Making'], note: 'weight of the turn; the arc broadcast' }),
  'src/weave/write/idle.js': contract({ ops: ['INS', 'EVA', 'REC'], targets: ['Void', 'Field'], products: ['Entity', 'Void'], stances: ['Cultivating', 'Tending', 'Composing'], note: 'the governed idle loop (§15)' }),
  'src/weave/write/index.js': contract({ ops: ['INS', 'CON', 'SYN', 'DEF', 'EVA'], targets: ['Network', 'Field', 'Entity'], products: ['Field', 'Lens', 'Network', 'Void'], stances: ['Making', 'Composing', 'Binding', 'Tracing'], note: 'barrel' }),
  'src/weave/write/lens-port.js': contract({ ops: ['SIG', 'EVA', 'DEF'], targets: ['Field', 'Lens'], products: ['Field', 'Void'], stances: ['Tending', 'Binding', 'Clearing'], note: 'the port; logit-bias lens steering (Tracks A,C,D)' }),
  'src/weave/write/morph.js': contract({ ops: ['DEF', 'NUL'], targets: ['Void'], products: ['Void'], stances: ['Making', 'Clearing'], note: 'past-tense morphology (the productive rules)' }),
  'src/weave/write/paragraphs.js': contract({ ops: ['DEF', 'SEG', 'NUL'], targets: ['Field'], products: ['Field', 'Void'], stances: ['Making', 'Dissecting', 'Clearing'], note: 'paragraph loop; one paragraph per model call' }),
  'src/weave/write/plan.js': contract({ ops: ['SEG', 'CON', 'INS'], targets: ['Field', 'Network'], products: ['Network', 'Link'], stances: ['Dissecting', 'Binding', 'Making'], note: 'span->cell resolver (streaming answer §2)' }),
  'src/weave/write/rdf.js': contract({ ops: ['SYN', 'SIG', 'CON'], targets: ['Network'], products: ['Network', 'Field'], stances: ['Composing', 'Tracing', 'Binding'], note: 'the brief as RDF-star + EO annotations' }),
  'src/weave/write/realize.js': contract({ ops: ['SYN', 'EVA'], targets: ['Field'], products: ['Field'], stances: ['Composing', 'Binding'], note: 'grammatical encoding; clause aggregation' }),
  'src/weave/write/refer.js': contract({ ops: ['DEF', 'EVA', 'INS'], targets: ['Entity', 'Field'], products: ['Field', 'Lens'], stances: ['Making', 'Binding'], note: 'referring generation; inverse coref + the self line' }),
  'src/weave/write/scheduler.js': contract({ ops: ['CON', 'EVA', 'SEG'], targets: ['Network'], products: ['Network', 'Lens'], stances: ['Tracing', 'Binding', 'Dissecting'], note: 'the DAG + two gates + posture (§3,§4)' }),
  'src/weave/write/think.js': contract({ ops: ['INS', 'SIG', 'REC'], targets: ['Network', 'Void'], products: ['Void', 'Field'], stances: ['Cultivating', 'Tending', 'Composing'], note: 'inner speech turned inward; voids as fuel' }),
  'src/weave/write/traverse.js': contract({ ops: ['SEG', 'CON', 'SYN'], targets: ['Network'], products: ['Field', 'Link'], stances: ['Composing', 'Tracing', 'Unraveling'], note: 'concept -> traverse -> words' }),
  'src/weave/write/voice.js': contract({ ops: ['SIG', 'SYN', 'EVA'], targets: ['Paradigm', 'Kind'], products: ['Atmosphere', 'Lens'], stances: ['Tending', 'Composing', 'Binding'], note: 'personality + trained register (lens-port Track E)' }),
  'src/weave/write/voids.js': contract({ ops: ['SIG', 'EVA'], targets: ['Entity', 'Network'], products: ['Void'], stances: ['Tending', 'Binding'], note: 'open-Resolution ledger; idle fuel (§15,§16)' }),
  'src/weave/write/witness.js': contract({ ops: ['EVA', 'CON', 'DEF'], targets: ['Link', 'Field', 'Entity'], products: ['Lens', 'Void'], stances: ['Binding', 'Tracing', 'Clearing'], note: 'rebind + source veto + type law (§7)' }),
});
