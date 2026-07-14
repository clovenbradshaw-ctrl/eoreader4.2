// EO contracts for the attest holon — custody, witness, attestation, anchor, watch, frontier.
// The Act/Site/Stance faces of every module, Site split into targets (reads) / products
// (writes). Validated by tests/contracts.test.js against the cube's coherence guard.
// See docs/attestation-spec.md and docs/eo-for-coders.md.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  // Custody (§3): admit the bytes read as a pinned Entity, DEF its attributes (pin, path,
  // authenticated, class). SIG·INS on the Existence door, DEF differentiating the record's slots.
  'src/attest/custody.js': contract({
    ops: ['SIG', 'INS', 'DEF'], targets: ['Void'], products: ['Entity', 'Atmosphere'],
    stances: ['Making', 'Binding', 'Dissecting'], note: 'local custody of the bytes read — the payload_sha256 pin',
  }),
  // Witness (§4): INS a witness Entity per third party, CON the capture -> witness link, EVA the
  // witness's reading (its status, its diversity). A witness is a Lens.
  'src/attest/witness.js': contract({
    ops: ['INS', 'CON', 'EVA'], targets: ['Entity'], products: ['Entity', 'Link', 'Lens'],
    stances: ['Making', 'Binding', 'Tracing'], note: 'third-party witnesses (SPN2, archive.today) of a capture',
  }),
});
