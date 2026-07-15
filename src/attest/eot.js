// EO: NUL(Network → Void, Clearing) — attestation records rendered to EOT surface
// The EOT layer of attestation (docs/attestation-spec.md §9). Attestation events belong IN the
// tape, because how well a source is witnessed is part of how you know what you know. This module
// is the inverse renderer — records (capture, witness, attestation, anchor, watch, frontier) →
// the line-oriented EOT surface a model writes and ingest/eot.js reads back — mirroring
// ingest/eot-emit.js (log → surface). A leaf: pure string building, no engine, no model.
//
// The five assemblies of §9, plus the frontier record of §8.3, each rendered from its record so
// the whole attestation state can be read out in the same syntax as any other reading. The load-
// bearing one is assembly 5: the scrub does not weaken the claim — the claim rests on the custody
// hash, anchored and attested BEFORE the removal — so the removal enters the tape as a NEW dated
// fact about the subject, not as a retraction.

// A value literal for the surface. Strings are quoted (matching §9); booleans, numbers and nil
// ride bare. Kept local so this leaf imports nothing — the attest surface is simple by design.
const lit = (v) => {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return JSON.stringify(String(v));
};

// An EOT anchor identifier from a record id — colons and hashes are not identifier chars, so a
// capture id `cap:9f2a` becomes the anchor `cap_9f2a`. Reversible enough for a reading.
const anchorRef = (id, prefix = '') => `${prefix}${String(id || '').replace(/[:#.]+/g, '_')}`;

const line = (ref, field, value) => `${ref}.${field} = ${lit(value)}`;
// Emit a field line only when the value is present — nothing inert on the surface (the eot-emit
// discipline: a line that does not move the reading does not exist).
const field = (ref, name, value) => (value === null || value === undefined ? null : line(ref, name, value));
const block = (lines) => lines.filter((l) => l != null).join('\n');

// ── assembly 1: custody (§9) ─────────────────────────────────────────────────────
// `!EVA cap` reads: INS(Entity, Making) — the bytes exist.
export const custodyAssembly = (capture, { ref } = {}) => {
  const r = ref || anchorRef(capture.id);
  return block([
    `${r} : capture`,
    field(r, 'source', capture.span_source),
    field(r, 'fetched_at', capture.fetched_at),
    field(r, 'payload_sha256', capture.payload_sha256),
    field(r, 'container', capture.container),
    field(r, 'authenticated', capture.authenticated),
    field(r, 'provenance_class', capture.provenance_class),
    `!EVA ${r}`,
  ]);
};

// ── assembly 2: a witness, and its link from the capture (§9) ─────────────────────
// A witness is a Lens. The `cap -> w` link with a joint `!EVA` reads: CON(Link, Binding).
export const witnessAssembly = (witness, { ref, captureRef } = {}) => {
  const r = ref || anchorRef(witness.job || witness.service + (witness.url || ''), 'w_');
  const lines = [
    `${r} : witness`,
    field(r, 'service', witness.service),
    field(r, 'requested_at', witness.requested_at),
    field(r, 'job', witness.job),
    field(r, 'captured_at', witness.captured_at),
    field(r, 'cdx_digest', witness.cdx_digest),
    field(r, 'replay', witness.replay),
    `!EVA ${r}`,
  ];
  if (captureRef) { lines.push(`${captureRef} -> ${r}`, `!EVA ${captureRef}, ${r}`); }
  return block(lines);
};

// ── assembly 3: attestation, per span (§9) ────────────────────────────────────────
// EVA(Lens, Dissecting) — a judgment rendered by testing the span against the witness. Each
// attestation is { spanId, witnessRef, state, human? }. A fuzzy (tier-3) verdict emits the
// human-review SIG — it never auto-passes.
export const attestationAssembly = (attestations = []) => block(attestations.flatMap((a) => {
  const out = [`!EVA ${a.spanId} @ ${a.witnessRef} = ${lit(a.state)}`];
  if (a.human || a.state === 'attested_fuzzy') out.push(`!SIG ${a.spanId}.review = "human"`);
  return out;
}));

// ── assembly 4: the anchor (§9) ───────────────────────────────────────────────────
// SYN(Network, Composing) — a root synthesized from many leaves.
export const anchorAssembly = (anchor, { rootRef, batchRef } = {}) => {
  const r = rootRef || anchorRef(anchor.root, 'root_');
  return block([
    `!SYN ${r} = ${batchRef || 'ledger.events'}`,
    field(r, 'sha256', anchor.root),
    field(r, 'rfc3161', anchor.rfc3161 && (anchor.rfc3161.token || anchor.rfc3161.tsa || JSON.stringify(anchor.rfc3161))),
    field(r, 'ots', anchor.ots && (anchor.ots.ots || JSON.stringify(anchor.ots))),
    field(r, 'published', anchor.published),
    `!EVA ${r}`,
  ]);
};

// ── assembly 5: the watch, months later (§9) ──────────────────────────────────────
// The digest changed, the span is gone. This is not an error — it is the reason the system
// exists. Custody is unaffected; the REMOVAL is now itself a dated, anchored, witnessed fact.
export const watchAssembly = ({ witnessRef, digestChangedAt, scrubbedSpanIds = [], captureRef } = {}) => block([
  digestChangedAt ? `!SIG ${witnessRef}.digest_changed = ${lit(digestChangedAt)}` : null,
  ...scrubbedSpanIds.flatMap((id) => [
    `!EVA ${id} @ ${witnessRef}.latest = "SCRUBBED"`,
    `!SIG ${id}.status = "removed-from-live-source"`,
  ]),
  captureRef ? `!EVA ${captureRef}` : null,
]);

// ── the frontier record (§8.3) ────────────────────────────────────────────────────
// Encountered, measured, not collapsed. No bytes kept — an address and a decision.
export const frontierAssembly = (frontier) => {
  const r = `frontier.${frontier.id}`;
  return block([
    `!NUL ${r}`,
    field(r, 'uri', frontier.uri),
    field(r, 'amplitude', frontier.amplitude),
    field(r, 'phase', frontier.phase),
    field(r, 'seed', frontier.seed),
    field(r, 'reason', frontier.reason),
    field(r, 'witness', frontier.witness),
    `!EVA ${r}`,
  ]);
};

// emitAttestation({ capture, witnesses, attestations, anchor, watch, frontier }) → the full tape
// section, only the assemblies whose records are present. The one place a reader gets the whole
// attestation of a source as EOT surface.
export const emitAttestation = ({ capture = null, witnesses = [], attestations = [], anchor = null, watch = null, frontier = null } = {}) => {
  const sections = [];
  const capRef = capture ? anchorRef(capture.id) : null;
  if (capture) sections.push(custodyAssembly(capture, { ref: capRef }));
  witnesses.forEach((w, i) => sections.push(witnessAssembly(w, { ref: anchorRef(w.job || `${w.service}_${i}`, 'w_'), captureRef: capRef })));
  if (attestations.length) sections.push(attestationAssembly(attestations));
  if (anchor) sections.push(anchorAssembly(anchor));
  if (watch) sections.push(watchAssembly(watch));
  if (frontier) sections.push(frontierAssembly(frontier));
  return sections.filter(Boolean).join('\n\n');
};
