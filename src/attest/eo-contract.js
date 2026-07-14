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
  'src/attest/wayback.js': contract({
    ops: ['INS', 'SIG'], targets: ['Entity'], products: ['Entity', 'Lens'],
    stances: ['Making', 'Binding'], note: 'Wayback/IA request shapes + parsers (no-key availability flow + legacy keyed SPN2)',
  }),
  // Attestation ladder (§5): EVA the span against the witness (a judgment on a Lens), DEF the
  // divergence cause. Per span, never per page.
  'src/attest/ladder.js': contract({
    ops: ['EVA', 'DEF'], targets: ['Lens'], products: ['Lens', 'Atmosphere'],
    stances: ['Dissecting', 'Tracing', 'Binding'], note: 'the attestation ladder — does the span survive in the witness',
  }),
  // Anchor (§6): SYN a Merkle root from many leaves (a derived whole — Network), EVA an
  // inclusion proof, SIG the timestamp attributes. Certificate Transparency, applied to a ledger.
  'src/attest/anchor.js': contract({
    ops: ['SYN', 'EVA', 'SIG'], targets: ['Network'], products: ['Network', 'Lens'],
    stances: ['Composing', 'Tracing', 'Binding'], note: 'Merkle-anchor the ledger, prove inclusion',
  }),
  // Watch (§7): SIG the digest change / withdrawal, EVA the re-attested span (SCRUBBED), NUL the
  // absence a withdrawal leaves. The archive as an instrument.
  'src/attest/watch.js': contract({
    ops: ['SIG', 'EVA', 'NUL'], targets: ['Entity', 'Lens'], products: ['Entity', 'Lens', 'Void'],
    stances: ['Binding', 'Tracing', 'Dissecting', 'Clearing'], note: 'CDX watch — scrub + withdrawal detection',
  }),
  // Frontier (§8): NUL the encountered-and-passed span (an absence at an address), SIG a
  // re-collapse, EVA the ablation judgment. Selective preservation, with the decision on the record.
  'src/attest/frontier.js': contract({
    ops: ['NUL', 'SIG', 'EVA'], targets: ['Void', 'Entity'], products: ['Void', 'Entity', 'Lens'],
    stances: ['Clearing', 'Dissecting', 'Binding', 'Tracing'], note: 'selective preservation frontier — the logged decision',
  }),
  // EOT layer (§9): render attestation records back into EOT surface — the inverse renderer, a
  // reading cleared into the tape's own line syntax (mirrors ingest/eot-emit.js).
  'src/attest/eot.js': contract({
    ops: ['NUL'], targets: ['Network'], products: ['Void'], stances: ['Clearing'],
    note: 'attestation records rendered to EOT surface',
  }),
  // The holon entrance — one door for the whole attest subsystem.
  'src/attest/index.js': contract({
    ops: ['INS', 'SIG', 'EVA', 'SYN', 'NUL', 'CON'], targets: ['Void', 'Entity', 'Lens', 'Network'],
    products: ['Entity', 'Lens', 'Network', 'Void'],
    stances: ['Making', 'Binding', 'Tracing', 'Composing', 'Clearing', 'Dissecting'], note: 'barrel',
  }),
});
