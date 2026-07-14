// EO: CON·INS·SIG·NUL(Network,Void,Field → Link,Entity,Void, Binding,Making,Tending,Clearing) — barrel
// The archive room's one entrance (holon law: outside the boundary, only index.js
// is visible). The permanent-archive membrane: the optional Matrix session, the
// Archive.org deposit, checkpoints + genome autosave, the encrypted vault and its
// shared-room variant, workspace sync, and the span pin.
export { createMatrixSession } from './matrix.js';
export {
  depositToArchive, missingConsent, archiveMediatype, REQUIRED_CONSENT, KINDS,
  ARCHIVE_CASES_WEBHOOK,
} from './deposit.js';
export { createCheckpointLog, checkpointId } from './checkpoints.js';
export { createGenomeAutosave } from './autosave.js';
export { createVault } from './vault.js';
export { createRoomVault } from './room-vault.js';
export { createSpaceSync } from './space-sync.js';
export { mountVaultLauncher } from './vault-mount.js';
export { spanFragment, spanAnchor, resolveArchivePin, pinPayload, locateSpan } from './pin.js';
