// EO contracts for the terrains holon — a prototype room that paints the cube's nine
// Site-face terrains over one passage. Each module spelled on all three faces, validated by
// tests/contracts.test.js against the cube's coherence guard. See docs/eo-for-coders.md (Law 1).
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  // The worked passage: it INSTANTIATES the figures (entities/links/lenses) out of the void.
  'src/rooms/terrains/scene.js': contract({ ops: ['INS'], targets: ['Void'], products: ['Entity'], stances: ['Making'], note: 'the worked passage the demo reads' }),
  // The fold: it DISSECTS each sentence into atoms (SEG) and BONDS the relation arcs (CON).
  'src/rooms/terrains/overlay.js': contract({ ops: ['SEG', 'CON'], targets: ['Field', 'Link'], products: ['Link', 'Network'], stances: ['Dissecting', 'Binding'], note: 'segment text + build arcs/washes' }),
  // The palette + stylesheet: it DEFINES how each terrain reads (a Lens on the reading).
  'src/rooms/terrains/theme.js': contract({ ops: ['DEF'], targets: ['Atmosphere'], products: ['Lens'], stances: ['Dissecting'], note: 'palette + CSS' }),
  // The arc renderer: it BONDS subject to object over the laid-out text.
  'src/rooms/terrains/draw.js': contract({ ops: ['CON'], targets: ['Link'], products: ['Link'], stances: ['Binding'], note: 'relation-arc renderer' }),
  // The surface: it INSTANTIATES the marks and EVALUATES the click into three operators.
  'src/rooms/terrains/surface.js': contract({ ops: ['INS', 'EVA'], targets: ['Void', 'Lens'], products: ['Entity', 'Lens'], stances: ['Making', 'Binding'], note: 'the terrain-overlay DOM surface' }),
  // The barrel — one entrance, the union of the room's faces.
  'src/rooms/terrains/index.js': contract({ ops: ['INS', 'SEG', 'CON', 'DEF', 'EVA'], targets: ['Void', 'Field', 'Link', 'Atmosphere', 'Lens'], products: ['Entity', 'Link', 'Network', 'Lens'], stances: ['Making', 'Dissecting', 'Binding'], note: 'barrel' }),
});
