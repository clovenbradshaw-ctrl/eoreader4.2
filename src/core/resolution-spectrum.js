// EO: DEF·EVA(Network,Paradigm → Lens,Paradigm, Dissecting,Tracing) — witness axis of coref
// resolution-spectrum.js — where a coreference/identity decision sits on the one
// axis that actually matters: DOES RESOLVING IT NEED THE WITNESS CHANNEL TO READ
// MEANING?
//
// The tempting axis is hand-coded-vs-learned. That is the wrong cut, and naming it
// that way reintroduces the very conflation this module exists to prevent: the
// engine's middle tier already contains a LEARNED-STATISTICAL layer — the
// Fellegi-Sunter m/u weights, discriminativeness (inverse value-frequency), the REC
// ledger's support/strain. Those are learned from the corpus, not hand-written, and
// they are emphatically NOT the model. The boundary is the WITNESS CHANNEL: a
// witness reads meaning (open-domain world-knowledge, physical reasoning, the
// trigger word's sense) and deposits defeasible weight into the field; it never
// decides. Everything reachable WITHOUT that channel — deterministic rules PLUS
// corpus-learned statistics — is one (correctly large) region; only what genuinely
// needs to read meaning crosses the line.
//
// So the axis is `needsWitness`, and the tier is a finer placement on it:
//
//   resolved — structure already settled it (a name alias, a clear field winner).
//   engine   — resolvable by deterministic rules + CORPUS-LEARNED STATISTICS, no
//              witness channel. The large middle. (Learned ≠ model.)
//   mixed    — straddles: a deterministic/learned core with a witness-needing tail
//              or sub-case. The straddle is itself the evidence the axis is real.
//   model    — needs the witness channel to read meaning. The genuine frontier.
//
// This module is a READER of decisions, not a maker of them: it emits nothing into
// the log, so it is parity-safe by construction, and it depends on nothing outside
// core. The conformance panel and the answer layer consult it to be honest about
// which abstentions are the next deterministic build and which actually justify the
// model.

import { projectGraph } from './project.js';

export const TIER = Object.freeze({
  RESOLVED: 'resolved',
  ENGINE:   'engine',
  MIXED:    'mixed',
  MODEL:    'model',
});

// `needsWitness` for a tier: does crossing it require reading meaning?
export const needsWitness = (tier) =>
  tier === TIER.MODEL ? true : tier === TIER.MIXED ? 'tail' : false;

// ── The static spectrum — the TYPES of identity/coref situations, each placed on
// the witness axis. This is the taxonomy; `classifyResolutions` maps a document's
// actual decisions onto it. `engineKind` names WHICH no-witness machinery resolves
// it — `rule` (deterministic) or `learned` (corpus statistics) — so the middle tier
// is never mistaken for hand-coding OR for the model.
export const SPECTRUM = Object.freeze([
  {
    type: 'name-alias', tier: TIER.RESOLVED, engineKind: 'rule',
    reason: 'a surface form contains, initialises, or is the given name of an admitted name',
    needs: '— structure settles it (head/tail/initialism alias, defeasibly)',
  },
  {
    type: 'surname-collision', tier: TIER.ENGINE, engineKind: 'learned',
    reason: 'a surname borne by ≥2 distinct full names is non-individuating — the eager tail merge is defeated',
    needs: 'the learned population statistic (the surname proved shared) — no witness',
  },
  {
    type: 'functional-veto', tier: TIER.ENGINE, engineKind: 'learned',
    reason: 'two candidates disagree on a high-functionality key (a birth date): a near-veto',
    needs: 'the LEARNED functional weight (Fellegi-Sunter m/u) + the injected conflict oracle — no witness',
  },
  {
    type: 'contested-key', tier: TIER.MIXED, engineKind: 'learned',
    reason: 'one entity, one identical name, two values of a one-valued key — the F-S indeterminate middle',
    needs: 'engine DETECTS the dispute (learned functionality); choosing the TRUE value needs an external source/witness',
  },
  {
    type: 'held-near-identity', tier: TIER.MIXED, engineKind: 'learned',
    reason: 'distinct names sharing a surname AND a discriminator (role/org) — corroboration short of identity',
    needs: 'engine DETECTS the candidate (surname + shared discriminator, corpus statistics); resolving it under a conflict needs co-attestation',
  },
  {
    type: 'entity-typing', tier: TIER.ENGINE, engineKind: 'rule',
    reason: 'the type follows from verb-selection — “acquired / reported earnings” ⇒ organisation, independent of case',
    needs: 'the injected typing bridge (verb→type); only a NOVEL predicate falls to the witness',
  },
  {
    type: 'casing-detection', tier: TIER.MIXED, engineKind: 'rule',
    reason: 'a referent recognised only because it was capitalised — fragile on a lowercased/ASR source',
    needs: 'clean lowercased text: engine (source-class gate + S1–S4); genuine ASR/OCR NOISE: the witness',
  },
  {
    type: 'pronoun-structural', tier: TIER.RESOLVED, engineKind: 'learned',
    reason: 'a pronoun with a clear field winner (recency or standing-role salience)',
    needs: '— the decaying field settles it; the coupling weight carries the residual uncertainty',
  },
  {
    type: 'pronoun-semantic', tier: TIER.MODEL,
    reason: 'two equally-salient, same-type candidates; only the trigger word’s MEANING picks (a Winograd schema)',
    needs: 'the witness channel — open-domain world-knowledge no field salience or symbolic table covers',
  },
  {
    type: 'same-name-split', tier: TIER.MIXED, engineKind: 'learned',
    reason: 'two people under one identical name — distinctness must come from somewhere other than the string',
    // The straddle, rendered as sub-cases — flattening it throws away the evidence for the axis.
    subcases: Object.freeze([
      { case: 'by-functional-key', tier: TIER.ENGINE, engineKind: 'learned',
        reason: 'a conflicting birth date / EIN splits them deterministically — this is literally the D4 orthogonality' },
      { case: 'by-soft-role', tier: TIER.MODEL,
        reason: 'distinguished only by incompatible real-world roles (senator vs plumber, both holdable) — world-knowledge' },
    ]),
    needs: 'engine where a functional key separates them; the witness where only soft roles do',
  },
]);

const SPECTRUM_BY_TYPE = new Map(SPECTRUM.map((s) => [s.type, s]));
export const spectrumOf = (type) => SPECTRUM_BY_TYPE.get(type) || null;

// ── Live classification — map THIS document's decisions onto the spectrum ─────
//
// Reads the log and the projected graph (no embedder, no model). Returns the
// observed situations, each carrying its spectrum placement, plus a tier tally and
// the witness-channel split. Pure: it adds nothing to the log.
export const classifyResolutions = (doc) => {
  const events = doc?.log?.snapshot ? doc.log.snapshot()
    : doc?.log?.events ?? (Array.isArray(doc?.events) ? doc.events : []);
  const graph = doc?.log ? projectGraph(doc.log) : null;
  const items = [];
  const at = (type, extra = {}) => {
    const s = spectrumOf(type);
    if (s) items.push(Object.freeze({ type, tier: s.tier, engineKind: s.engineKind ?? null,
      needsWitness: needsWitness(s.tier), reason: s.reason, needs: s.needs,
      ...(s.subcases ? { subcases: s.subcases } : {}), ...extra }));
  };

  // Which merges were overturned, and why — a defeated alias is a DIFFERENT situation
  // than one that stood (the surname proved shared, or a functional key conflicted).
  const retracted = new Map();   // refSeq → retract reason
  for (const e of events)
    if (e.op === 'SEG' && e.kind === 'retract' && e.refSeq != null) retracted.set(e.refSeq, e.reason);

  for (const e of events) {
    if (e.op === 'SYN' && (e.match === 'head' || e.match === 'initialism'))
      at('name-alias', { ref: e.seq, detail: `${e.match}: ${e.from ?? ''}→${e.to ?? ''}` });
    if (e.op === 'SYN' && e.match === 'tail') {
      const why = retracted.get(e.seq);
      // A defeated tail merge is not a successful alias. Surname-collision is its own
      // (engine, learned) resolution; a functional-key defeat is already counted from
      // its EVA below, so it is not double-emitted here.
      if (why === 'surname-shared-by-distinct-agents') at('surname-collision', { ref: e.seq, detail: `surname “${e.surname}” shared` });
      else if (why !== 'functional-key-conflict')      at('name-alias', { ref: e.seq, detail: `tail: ${e.from ?? ''}→${e.to ?? ''}` });
    }
    if (e.op === 'SYN' && e.kind === 'same_as?')
      at('held-near-identity', { ref: e.seq, detail: `${e.from ?? ''} ?= ${e.to ?? ''}` });
    if (e.op === 'EVA' && e.reason === 'functional-key-conflict')
      at('functional-veto', { ref: e.ref, detail: `${e.key}: distinct` });
    if (e.op === 'EVA' && e.reason === 'functional-key-contested')
      at('contested-key', { ref: e.id, detail: `${e.key}: ${(e.values || []).join(' vs ')}` });
    if (e.op === 'EVA' && e.reason === 'near-identity-contested')
      at('held-near-identity', { ref: e.seq, detail: `${e.a} ?= ${e.b} (surname “${e.surname}”, ${e.key} conflicts)` });
  }

  // A held identity question the projection surfaced (an open asterisk) — engine
  // detected it; whether it merges or splits is the F-S middle.
  for (const c of graph?.sameAs || [])
    if (!items.some((i) => i.type === 'held-near-identity' && i.detail?.includes(c.a)))
      at('held-near-identity', { ref: c.seq, detail: `${c.a} ?= ${c.b}` });

  // Detection coverage — every admitted referent today is caps-gated, so on a
  // lowercased/ASR source it is at risk. One summary item, not per-entity noise.
  const admitted = doc?.admission?.admitted?.size ?? 0;
  if (admitted > 0) at('casing-detection', { detail: `${admitted} referent(s) recognised via capitalisation` });

  const byTier = { resolved: 0, engine: 0, mixed: 0, model: 0 };
  for (const i of items) byTier[i.tier] = (byTier[i.tier] || 0) + 1;
  const witnessBound = items.filter((i) => i.needsWitness === true).length;
  const witnessTail  = items.filter((i) => i.needsWitness === 'tail').length;

  return Object.freeze({
    items: Object.freeze(items),
    byTier: Object.freeze(byTier),
    // The headline the axis is for: how many of this document's open situations
    // genuinely need the witness channel vs are reachable by more engine.
    summary: Object.freeze({
      total: items.length, witnessBound, witnessTail,
      engineReachable: items.filter((i) => i.needsWitness === false).length,
    }),
  });
};
