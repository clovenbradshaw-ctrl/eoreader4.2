// EO: INS·CON·SIG(Entity,Link → Entity,Network, Making·Binding·Tending) — the provenance chain
// metabolism/persist.js — heritability's outward face: genome EDITS ONLY, hash-chained
// into a tamper-evident ledger and committed to a permanent, provenanced archive.
//
// Only genome edits leave the tab — the moments the champion's DNA actually changed (a
// promotion / an inherit), never a per-turn beat. Each edit is a BLOCK carrying the hash
// of the prior block (the chain — the "blockchain"): the gene changes, the fitness delta,
// the strain that forced it, the season, and an identity for provenance. Altering any
// past block changes its hash and breaks every hash after it. The chain is committed to a
// permanent archive (archive.org via the ingest webhook), each upload bonded to the last
// by `parent_identifier` — permanence and cryptographic fixity on top of the app-level
// hash chain — and a Matrix identity travels with each post so the record is attributable.
//
// TWO INVARIANTS, both load-bearing because these are PERMANENT, PUBLIC writes:
//
//  1. DNA ONLY. A block is built from an explicit allowlist of DNA fields. No raw turn,
//     outcome, document, question, or answer can enter a block even by accident. The
//     genome is just DNA — allocation parameters and their lineage. The Matrix identity
//     (an MXID, a public handle) is provenance, not content, and is the only non-DNA
//     field admitted. Any access TOKEN stays in the transient request headers and is
//     never written into a block or the chain — a secret must not be archived.
//
//  2. GATED. Nothing leaves the tab unless an endpoint AND an identity are set AND posting
//     is armed. Dry-run by default: `record` forms the block, extends the chain, and
//     builds the exact request it WOULD send, but fires nothing until `arm()` is called.
//     A permanent public write is a deliberate act, never an autonomous side effect.

// The allowlist — the only fields a block may carry from an edit. Everything else is dropped.
const DNA_FIELDS = ['op', 'kind', 'gene', 'changes', 'before', 'after', 'delta', 'reason',
  'strain', 'fitnessDelta', 'championFit', 'challengerFit', 'energy', 'pop', 'period', 'season'];

// sanitize — reduce an edit to pure DNA. The genome is kept as gene→number only (via the
// caller-supplied gene name set), so no stray key rides along into a permanent record.
const sanitizeEdit = (edit, geneNames) => {
  const dna = {};
  for (const k of DNA_FIELDS) if (edit[k] !== undefined) dna[k] = edit[k];
  if (edit.genome && typeof edit.genome === 'object') {
    const g = {};
    for (const n of geneNames) if (typeof edit.genome[n] === 'number') g[n] = edit.genome[n];
    dna.genome = g;
  }
  return dna;
};

// cyrb53 — a fast, deterministic, dependency-free 53-bit content hash for the chain links.
// It gives ordering and tamper-evidence (change a block → change its hash → break the
// chain), which is what the app-level "blockchain" needs; the CRYPTOGRAPHIC fixity comes
// from the archive layer (archive.org stores md5/sha1 per file on upload). Deterministic,
// so a replayed lineage reproduces the same chain. Injectable via `hash` for a real SHA.
const cyrb53 = (str, seed = 0x9e3779b9) => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
};

// memoryStore — the default chain store (in-memory). In the browser, inject a
// localStorage/OPFS-backed store so the chain (and thus the parent_identifier link)
// survives across sessions — the heritability that lets evolution accumulate.
export const memoryStore = () => { let s = null; return { load: () => s, save: (v) => { s = v; } }; };

// createProvenance — the chain + the (gated) committer.
export const createProvenance = ({
  endpoint = null,                 // the archive ingest webhook URL (prod /webhook/…, not /webhook-test/…)
  identity = null,                 // { mxid, token } — Matrix provenance; mxid is archived, token is not
  hash = cyrb53,                   // the chain hash (swap for a real SHA if desired)
  store = memoryStore(),           // where the chain persists across sessions
  enabled = false,                 // ARMED? false → dry-run: form blocks + requests, fire nothing
  mediatype = 'data',
  license = 'CC-BY-4.0',
  idPrefix = 'eoreader-genome',
  geneNames = [],                  // the DNA gene names (from genome.js GENE_NAMES) — the genome allowlist
  post = null,                     // injected transport: (request) => Promise; null → never fires
  now = () => Date.now(),
} = {}) => {
  const saved = store.load();
  const chain = Array.isArray(saved?.chain) ? saved.chain.slice() : [];
  let head = saved?.head || null;
  let lastIdentifier = saved?.lastIdentifier || null;   // the prior archive item — the parent link
  let armed = !!enabled;
  const outbox = [];               // requests formed but not (yet) fired — the dry-run record

  const persistState = () => store.save({ chain, head, lastIdentifier });

  // canonical — deterministic serialization for hashing (sorted keys, no whitespace).
  const canonical = (obj) => JSON.stringify(obj, Object.keys(obj).sort());

  // buildRequest — the exact archive-webhook request for a set of blocks. Faithful to the
  // `archiveo-cases` contract: multipart POST, a JSONL `file`, metadata as query params,
  // parent_identifier bonding this upload to the last. The identity TOKEN rides only in
  // headers; the public MXID rides in the query for the server to attribute/verify.
  const buildRequest = (blocks, identifier) => {
    const jsonl = blocks.map((b) => JSON.stringify(b)).join('\n') + '\n';
    const q = new URLSearchParams({
      identifier,
      filename: `${identifier}.jsonl`,
      title: 'EO Reader genome edits',
      description: 'Hash-chained metabolism genome edits (DNA only — no content).',
      date: new Date(now()).toISOString().slice(0, 10),
      license, mime: 'application/x-ndjson', archiveMediatype: mediatype,
      tags: 'eoreader;metabolism;genome',
    });
    if (lastIdentifier) q.set('parent_identifier', lastIdentifier);
    if (identity?.mxid) q.set('mxid', identity.mxid);            // public provenance handle
    const headers = {};
    if (identity?.token) headers['Authorization'] = `Bearer ${identity.token}`;  // secret — headers only
    return Object.freeze({
      method: 'POST',
      url: endpoint ? `${endpoint}?${q}` : null,
      headers,
      multipart: { file: { name: `${identifier}.jsonl`, mime: 'application/x-ndjson', content: jsonl } },
      identifier, parentIdentifier: lastIdentifier, mxid: identity?.mxid || null,
    });
  };

  // record — add ONE genome edit to the chain, and (if armed) commit it. Returns the block
  // and the request that was or would be sent. This is the only writer.
  const record = (edit) => {
    const dna = sanitizeEdit(edit, geneNames);
    const seq = chain.length;
    const core = { seq, prevHash: head, mxid: identity?.mxid || null, t: now(), dna };
    const blockHash = hash(canonical(core));
    const block = Object.freeze({ ...core, hash: blockHash });
    chain.push(block);
    head = blockHash;

    const identifier = `${idPrefix}-${blockHash.slice(0, 12)}`;
    const request = buildRequest([block], identifier);
    let fired = false;
    if (armed && endpoint && identity && typeof post === 'function') {
      try { Promise.resolve(post(request)).catch(() => {}); fired = true; lastIdentifier = identifier; }
      catch { /* transport is best-effort; the chain stands regardless */ }
    } else {
      outbox.push(request);        // dry-run: the request is formed and inspectable, not sent
    }
    persistState();
    return Object.freeze({ block, request, fired, armed });
  };

  // verify — recompute every hash and confirm the chain is intact (tamper-evidence).
  const verify = () => {
    let prev = null;
    for (let i = 0; i < chain.length; i++) {
      const b = chain[i];
      if (b.seq !== i || b.prevHash !== prev) return { ok: false, brokenAt: i, reason: 'link' };
      const { hash: h, ...core } = b;
      if (hash(canonical(core)) !== h) return { ok: false, brokenAt: i, reason: 'hash' };
      prev = b.hash;
    }
    return { ok: true, length: chain.length, head };
  };

  return Object.freeze({
    record,
    verify,
    arm(opts = {}) { if (opts.endpoint !== undefined) endpoint = opts.endpoint; if (opts.identity !== undefined) identity = opts.identity; armed = true; return armed; },
    disarm() { armed = false; return armed; },
    armed: () => armed,
    chain: () => chain.slice(),
    head: () => head,
    outbox: () => outbox.slice(),                 // the dry-run requests, for inspection before arming
    exportJSONL: () => chain.map((b) => JSON.stringify(b)).join('\n') + (chain.length ? '\n' : ''),
    length: () => chain.length,
  });
};
