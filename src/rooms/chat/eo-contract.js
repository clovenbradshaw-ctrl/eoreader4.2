// EO contracts for the chat holon — the Act/Site/Stance faces of every module, the
// Site face split into targets (read) and products (written). Validated by
// tests/contracts.test.js against the cube's coherence guard. The chat holon is the
// E2EE messaging room: it makes key material from the Void, binds it to peers and
// rooms over the Structure terrains (Field/Link/Network), and renders the timeline.
// See docs/element-e2ee.md and docs/eo-for-coders.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/chat/opfs-store.js': contract({ ops: ['CON', 'INS'], targets: ['Field'], products: ['Link'], stances: ['Binding', 'Making'], note: 'chat-opfs-store: OPFS keystore persistence' }),
  'src/rooms/chat/crypto.js': contract({ ops: ['INS', 'CON'], targets: ['Void', 'Field'], products: ['Entity', 'Link'], stances: ['Making', 'Binding'], note: 'chat-crypto: E2EE key material (Olm/Megolm)' }),
  'src/rooms/chat/client.js': contract({ ops: ['SIG', 'CON'], targets: ['Network', 'Field'], products: ['Link'], stances: ['Binding', 'Tending'], note: 'chat-client: Matrix transport' }),
  'src/rooms/chat/index.js': contract({ ops: ['CON', 'SIG'], targets: ['Network', 'Field'], products: ['Link', 'Entity'], stances: ['Binding', 'Making'], note: 'chat: the E2EE chat room controller' }),
  'src/rooms/chat/mount.js': contract({ ops: ['SIG', 'INS'], targets: ['Field'], products: ['Entity'], stances: ['Making', 'Binding'], note: 'chat-mount: the chat panel DOM surface' }),
});
