// EO contracts for the plain holon — the Act/Site/Stance faces of every module, with the Site
// face split into targets (what it reads) and products (what it writes). Validated by
// tests/contracts.test.js against the cube's coherence guard. See docs/eo-for-coders.md.
//
// The plain holon is the "plain version" surface (docs, "eoreader — the plain version"): the same
// engine, with no operator, terrain, or resolution ever named to the person. A click lands on a
// terrain, a terrain sits in a domain, a domain has exactly three operators — so the person is
// shown exactly three questions, always. terrain.js is the fold that makes that arithmetic, not a
// design choice; select.js is the two live redraws (read-as, center); scene.js is a worked corpus.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/plain/index.js': contract({ ops: ['SIG', 'INS', 'DEF', 'CON'], targets: ['Void', 'Entity', 'Field'], products: ['Entity', 'Field', 'Lens', 'Link'], stances: ['Making', 'Tending', 'Tracing', 'Binding'], note: 'barrel — the plain room entrance' }),
  'src/rooms/plain/terrain.js': contract({ ops: ['DEF', 'EVA'], targets: ['Kind'], products: ['Lens', 'Paradigm'], stances: ['Dissecting', 'Binding'], note: 'the three-questions fold — a clicked terrain → exactly the three operators of its domain (§9)' }),
  'src/rooms/plain/select.js':  contract({ ops: ['DEF', 'CON'], targets: ['Lens', 'Network'], products: ['Lens', 'Link'], stances: ['Dissecting', 'Binding'], note: 'the two live redraws — read a word under a basis (DEF), re-center the picture (CON), both pure' }),
  'src/rooms/plain/scene.js':   contract({ ops: ['SIG', 'INS'], targets: ['Void'], products: ['Entity', 'Field'], stances: ['Making', 'Tending'], note: 'the worked corpus — four sources on a city surveillance procurement, hand-authored as a reading emits' }),
  'src/rooms/plain/disagreement.js': contract({ ops: ['DEF', 'SIG'], targets: ['Lens', 'Entity'], products: ['Lens'], stances: ['Dissecting', 'Tracing'], note: 'how the sources disagree — read each source’s characterizations of a term, bucket into meanings, tally per source (real DEF at Lens)' }),
  'src/rooms/plain/shifts.js':       contract({ ops: ['REC', 'DEF'], targets: ['Paradigm', 'Lens'], products: ['Paradigm'], stances: ['Composing', 'Tracing'], note: 'when the meaning changed — change-point on a term’s dominant sense over a dated corpus; emits REC events (§4)' }),
  'src/rooms/plain/project.js':      contract({ ops: ['SIG', 'DEF', 'CON'], targets: ['Entity', 'Field'], products: ['Lens', 'Link'], stances: ['Tracing', 'Binding'], note: 'the live bridge — window.EO.app + perceiver/parse → the plain model; computes disagreement over real ingested sources' }),
  'src/rooms/plain/live-views.js':   contract({ ops: ['DEF', 'NUL', 'CON'], targets: ['Entity', 'Lens', 'Field'], products: ['Field', 'Void', 'Link'], stances: ['Dissecting', 'Clearing', 'Binding'], note: 'the live explore-card projections — blind spots (NUL), map, study guide, timeline over real sources; overlays a scene so the surface renders live with the same code' }),
  'src/rooms/plain/surface.js': contract({ ops: ['INS', 'NUL'], targets: ['Field'], products: ['Entity', 'Void'], stances: ['Making', 'Clearing'], note: 'the plain-version DOM surface — three panes, the three-questions popover, the six explore cards' }),
});
