// EO: NUL(Atmosphere → Atmosphere, Clearing) — provenance standards — capability toggles (config)
// Provenance standards — capability toggles, one per corner, all OFF by default.
//
// A nanopub bundles four concerns (docs/nanopublications.md): a minimal assertion unit,
// provenance, publication/attribution metadata, and content-addressed immutable identity.
// The "neighbors" each own one corner better than the monolith does — C2PA on the output
// side, Robust Links + Memento on citation, transparency logs on immutability, and so on.
//
// The stance here is the repo's opt-in discipline (the RULES_REV pattern, organs/out/speech):
// each standard is a NAMED capability that ships OFF, so adopting one is flipping a flag, not
// a fork. With every flag off, the emitters produce exactly what they produce today — the
// bespoke provenance already hand-built — so the default path stays byte-identical. Flip a
// flag on (per call, or via its env var) and that corner's emitter adds the standard's form.
//
// This module is the SETTINGS SURFACE, not the implementations: it declares the toggles and
// resolves them (default ← env ← per-call override). Each emitter reads `provenanceFlags()`
// and, for now, mostly no-ops when its flag is on — the flag is the seam the standard lands
// behind. `status` says honestly how far each is wired, so a flipped-on flag that is still
// 'planned' is a request for that work, not a silent lie.

// The registry: one entry per standard. `owns` is the nanopub corner it nails; `envVar` is
// the process-env switch (RULES_REV-style: 1/true/on); `status` is how far it is actually
// wired today; `doc` points at the analysis. Pure data — no behaviour, no imports.
export const PROVENANCE_STANDARDS = Object.freeze({
  // Output corner — the signed, tamper-evident manifest bound to a published artifact.
  c2pa: Object.freeze({
    id: 'c2pa', label: 'C2PA / Content Credentials', owns: 'publication + attribution',
    envVar: 'EO_PROV_C2PA', default: false, status: 'planned',
    note: 'publish organ emits bespoke embedded provenance today (organs/out/publish/pdf.js); flag adds a signed C2PA manifest.',
  }),
  // Citation corner — a citation that survives link rot: original + snapshot + datetime.
  robustLinks: Object.freeze({
    id: 'robustLinks', label: 'Robust Links + Memento (RFC 7089)', owns: 'citation / archived-passage',
    envVar: 'EO_PROV_ROBUST_LINKS', default: false, status: 'planned',
    note: 'warc.js already carries a dated, hashed source; flag emits Robust Links markup + Memento datetime.',
  }),
  // Immutability corner — "we did not rewrite history" as a proof, not a promise.
  transparencyLog: Object.freeze({
    id: 'transparencyLog', label: 'Transparency log (Merkle / Rekor discipline)', owns: 'immutable identity (as proof)',
    envVar: 'EO_PROV_TRANSPARENCY_LOG', default: false, status: 'planned',
    note: 'the EO event log is append-only by convention; flag adds Merkle chaining + inclusion proofs.',
  }),
  // Addressing corner — Trusty URIs generalized: a self-describing content hash.
  contentAddressing: Object.freeze({
    id: 'contentAddressing', label: 'IPLD/CID + Hashlink (Trusty URIs)', owns: 'content-addressed identity',
    envVar: 'EO_PROV_CID', default: false, status: 'partial',
    note: 'websource.webContentHash already content-addresses payloads (fnv:); flag emits self-describing CIDs / Trusty URIs.',
  }),
  // Signed living attestations — issuer asserts a signed claim about a subject.
  verifiableCredentials: Object.freeze({
    id: 'verifiableCredentials', label: 'Verifiable Credentials + DIDs (W3C)', owns: 'attributable signed claim',
    envVar: 'EO_PROV_VC', default: false, status: 'planned',
    note: 'issuer = NPJ, subject = the civic entity, evidence = the archived passage.',
  }),
  // Argument structure — claim + evidence + support/challenge, not a flat assertion.
  micropublications: Object.freeze({
    id: 'micropublications', label: 'Micropublications (Clark/Ciccarese)', owns: 'assertion unit (as argument)',
    envVar: 'EO_PROV_MICROPUB', default: false, status: 'planned',
    note: 'models the contribution graph — span-level EVA edits as support/challenge — better than a flat nanopub.',
  }),
  // Annotation targets — "this comment targets that passage span" (literally the EVA target).
  webAnnotation: Object.freeze({
    id: 'webAnnotation', label: 'Web Annotation (W3C)', owns: 'assertion unit (targeting)',
    envVar: 'EO_PROV_WEB_ANNOTATION', default: false, status: 'partial',
    note: 'document.js spans are already annotation-shaped targets; flag emits the W3C Web Annotation model.',
  }),
  // The scientific-assertion monolith itself — four graphs, Trusty-named.
  nanopub: Object.freeze({
    id: 'nanopub', label: 'Nanopublication data model', owns: 'all four corners (bundled)',
    envVar: 'EO_PROV_NANOPUB', default: false, status: 'planned',
    note: 'the assertion/provenance/pubinfo TriG + head graph; take the model + Trusty URIs, defer the network.',
  }),
});

// Read a RULES_REV-style env switch: 1/true/on (case-insensitive) → true, else the default.
const envOn = (name, dflt) => {
  if (typeof process === 'undefined' || !process.env || process.env[name] == null) return dflt;
  return /^(1|true|on)$/i.test(process.env[name]);
};

// provenanceFlags(overrides?) → a plain { id: boolean } settings object. Resolution per flag:
// registry default ← its env var ← the per-call override. An emitter calls this once and reads
// the corner it cares about; a caller flips a corner on for one publish without touching env.
export const provenanceFlags = (overrides = {}) => {
  const out = {};
  for (const [id, spec] of Object.entries(PROVENANCE_STANDARDS)) {
    out[id] = overrides[id] != null ? !!overrides[id] : envOn(spec.envVar, spec.default);
  }
  return out;
};

// isProvenanceEnabled(id, overrides?) → boolean, for a single-corner check at a call site.
export const isProvenanceEnabled = (id, overrides = {}) => {
  if (!(id in PROVENANCE_STANDARDS)) throw new Error(`unknown provenance standard: ${id}`);
  return provenanceFlags(overrides)[id];
};
