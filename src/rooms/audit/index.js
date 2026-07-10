// EO: INS·NUL·SIG(Void,Entity,Kind,Atmosphere → Void,Entity,Kind,Atmosphere, Making,Tending,Binding,Clearing) — barrel
// The audit holon: the structured trail of every turn.

export { createAuditLog }  from './log.js';
export { SCHEMA_VERSION }  from './schema.js';

// The EOT ledger + its live terminal surface (docs/eot-ledger.md): the audit at a
// second grain — every operation the app performs, read out in EOT and tailed in a
// terminal drawer. The ledger is a pure leaf; the terminal is browser-only DOM.
export { createEotLedger, lineOf, slug, LEDGER_OPS, PERCEIVER, ENACTOR } from './eot-ledger.js';
export { mountEotTerminal } from './eot-terminal.js';
