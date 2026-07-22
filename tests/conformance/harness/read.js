// readWithSeed(bytes, opts) — the one entry point every conformance test reads
// through (docs/parse-conformance-spec.md, "Shared harness").
//
// "If any code path can reach Math.random() or Date.now() without going through
// here, Tier 1 will find it and you should route it through here rather than
// patching the test." An audit of the parse / individuation / text-waveform
// surface (tests/conformance/README.md "Known gaps") found exactly two reaches:
//
//   1. core/log.js stamps `t: event.t ?? Date.now()` on every event, with no
//      clock-injection door. readingHash strips it (canon.js `stripVolatile`)
//      since it carries no reading content — the other half of the fix is here:
//      readWithSeed pins `docId` explicitly so the SAME bytes never mint two
//      different identities across two reads.
//   2. organs/in/text.js's ingestText falls back to `doc-${Date.now()}` for
//      `docId`/`name` when handed a bare string. readWithSeed never hits that
//      fallback — it wraps the text in a minimal `{ name, text() }` object so
//      the docId ingestText reads is the one this module derived from the bytes.
//
// No other Math.random()/Date.now() reach exists on this surface as of this
// suite (grepped across src/perceiver/parse, src/core/{log,project}.js,
// src/perceiver/individuation.js, src/perceiver/text/waveform.js,
// src/model/embed-hash.js, src/weave/waveform — see README). If a future change
// introduces one, Tier 1's byte-identical-replay test is what will catch it, and
// the fix belongs here, in the pinning, not in that test.
import { createHash } from 'node:crypto';
import { parseText } from '../../../src/perceiver/parse/index.js';
import { ingestText } from '../../../src/organs/in/text.js';
import { projectGraph, areDisjoint } from '../../../src/core/index.js';
import { buildTextReading } from '../../../src/perceiver/text/waveform.js';

const decoder = new TextDecoder('utf-8', { fatal: false });

export const bytesToText = (bytes) =>
  typeof bytes === 'string' ? bytes : decoder.decode(bytes);

const deterministicDocId = (text, seed) =>
  `conformance:${createHash('sha256').update(text).update(String(seed ?? '')).digest('hex').slice(0, 16)}`;

// A minimal File-like wrapper so ingestText's `file.name` / `file.text()` path
// pins the SAME docId a bare-string call would otherwise let Date.now() decide.
class PinnedTextFile {
  constructor(text, name) { this._text = text; this.name = name; }
  async text() { return this._text; }
}

// readWithSeed(bytes, opts) -> Promise<doc>
//
//   bytes             Uint8Array | Buffer | string — the fixture's raw bytes (or
//                     a plain string, for tests that build text inline).
//   opts.seed         folded into the pinned docId only (no RNG in this pipeline
//                     to seed — see the header note); lets a caller mint two
//                     distinct doc identities from the same bytes without ever
//                     touching Date.now().
//   opts.docId        an explicit docId, overriding the derived one.
//   opts.priorLedger  an array from an earlier read's `doc.conventions.exportLedger()`
//                     — routes to parseText's `conventionsOpts.inherit` (Tier 7,
//                     "prior-version pinning"). Requires bypassing ingestText,
//                     which does not expose conventionsOpts, so this path builds
//                     the doc with parseText directly and attaches the same
//                     `projectGraph` convenience ingestText normally attaches.
//                     (`doc.clauses` / `doc.sentenceEmbeddings` / `attachReading`
//                     — ingestText's other augmentations — are NOT attached on
//                     this path; no conformance test needs them.)
//   opts.seeds        boolean, default true. `false` reads with the inherited-
//                     seed conventions OFF (core/conventions/ledger.js: "the
//                     substrate for TEST 1" — spec Tier 7 #33, "prior-free
//                     baseline"). Also routes through the parseText path above.
//   opts.parse        extra options forwarded to ingestText/parseText verbatim
//                     (rolesConflict, corefOpts, coordSubjects, unnamedReferents,
//                     referentIdentity, totalRead, commonNouns, ...).
export const readWithSeed = async (bytes, opts = {}) => {
  const text = bytesToText(bytes);
  const docId = opts.docId || deterministicDocId(text, opts.seed);
  const needsDirectParse = opts.priorLedger != null || opts.seeds === false;

  if (needsDirectParse) {
    // Mirror ingestText's own defaults (rolesConflict: areDisjoint, unnamedReferents:
    // true) so the ONLY difference between this path and the default one is the
    // conventions prior — never an incidental default drift between the two.
    const doc = await parseText(text, {
      docId,
      rolesConflict: areDisjoint,
      unnamedReferents: true,
      conventionsOpts: {
        seeds: opts.seeds !== false,
        ...(opts.priorLedger ? { inherit: opts.priorLedger } : {}),
      },
      ...opts.parse,
    });
    doc.projectGraph = (frame = {}) => projectGraph(doc.log, frame);
    return doc;
  }
  return ingestText(new PinnedTextFile(text, docId), opts.parse || {});
};

// buildReading(doc, opts) -> Promise<Reading> — the omnimodal Reading contract
// object (Tier 8 only), via the same deterministic embedder every text read uses
// by default (model/embed-hash.js — no warmup, no network, pure function of text).
export const buildReading = (doc, opts = {}) => buildTextReading(doc, opts);
