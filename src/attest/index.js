// EO: INS·SIG·EVA·SYN·NUL·CON(Void,Entity,Lens,Network → Entity,Lens,Network,Void, Making,Binding,Tracing,Composing,Clearing,Dissecting) — barrel
// The attest holon — the four attestation functions (custody, witness, anchor, watch) plus the
// selective-preservation frontier and the EOT layer (docs/attestation-spec.md). One entrance:
// outside this boundary only this index.js is visible.
//
//   Custody is yours. Attestation is theirs. Never confuse the two.

// Custody (§3) — the bytes I read, pinned.
export {
  PATHS, PROVENANCE_CLASSES,
  formatContainer, parseContainer,
  computePayloadSha256, wasAuthenticated, captureId,
  mkCapture, capturePin, captureSpanId, verifyCustody, admissible, scopeAdmits,
  createCustodyStore,
} from './custody.js';

// Witness (§4) — third-party co-signers, and their diversity.
export {
  SERVICES, WITNESS_STATUS,
  idReplayUrl, waybackToIso,
  saveTriggerRequest, availabilityRequest, parseAvailability, waybackSnapshotUrl, isFreshCapture,
  spnSaveRequest, spnStatusRequest, parseSaveResponse, parseStatusResponse,
  cdxRequest, parseCdxRows, newestCdxDigest,
  mkWitness, createWitnessQueue, nearMissRequest, witnessDiversity, witnessed,
} from './witness.js';

// Attestation ladder (§5) — does the span survive in the witness.
export {
  ATTEST_STATES, DIVERGENCE_CAUSES,
  normalize, charDice, runLadder, triageDivergence, attest,
  attestationSig, humanReviewSig,
} from './ladder.js';

// Anchor (§6) — Merkle the ledger, anchor the root.
export {
  canonicalJson, merkleRoot, inclusionProof, verifyInclusion,
  mkAnchor, verifyChain, requestRfc3161, requestOts, publishRoot, anchorRootSig,
} from './anchor.js';

// Watch (§7) — the archive as an instrument.
export {
  WATCH_CADENCE, pollCadence, mkWatch,
  latestCapture, digestChanged, detectWithdrawal, scanForScrubs, watchScan,
  digestChangedSig, scrubbedSig, removedFromLiveSig, withdrawnSig,
} from './watch.js';

// Frontier (§8) — selective preservation, with the decision on the record.
export {
  PRESERVATION_TIERS,
  unitDraw, classify,
  mkFrontier, frontierFromDecision, recollapse,
  ablate, publishFrontier,
  mkEnvelope, withinEnvelope, nullResultReading,
  frontierNulSig, frontierEvaSig,
} from './frontier.js';

// EOT layer (§9) — attestation rendered to the tape's own surface.
export {
  custodyAssembly, witnessAssembly, attestationAssembly,
  anchorAssembly, watchAssembly, frontierAssembly, emitAttestation,
} from './eot.js';
