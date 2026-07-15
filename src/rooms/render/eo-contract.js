// EO contracts for the render holon — the Act/Site/Stance faces of every module, with the Site
// face split into targets (what it reads) and products (what it writes). Validated by
// tests/contracts.test.js against the cube's coherence guard. See docs/eo-for-coders.md.
//
// The render holon is the facing-page WYSIWYG renderer: the source (HTML · CSS · JS) on one side,
// the live render on the other. facing.js is the pure fold — panes → one runnable document (plus a
// diagnostics shim); surface.js holds the state and the sandboxed iframe. The same facing-page
// discipline as the replay holon, pointed at code instead of a transcript.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/render/index.js': contract({ ops: ['SEG', 'SYN', 'INS', 'NUL'], targets: ['Field'], products: ['Network', 'Entity', 'Void'], stances: ['Dissecting', 'Composing', 'Making', 'Clearing'], note: 'barrel — the render room entrance' }),
  'src/rooms/render/facing.js': contract({ ops: ['SEG', 'SYN', 'INS'], targets: ['Field'], products: ['Network', 'Entity'], stances: ['Dissecting', 'Composing', 'Making'], note: 'the facing renderer fold — source panes → one runnable document + a console shim (pure)' }),
  'src/rooms/render/surface.js': contract({ ops: ['INS', 'NUL'], targets: ['Field'], products: ['Entity', 'Void'], stances: ['Making', 'Clearing'], note: 'the facing renderer DOM surface — editor panes, live sandboxed iframe, console strip' }),
});
