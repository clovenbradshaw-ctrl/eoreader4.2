// EO: SYN·SEG·EVA(Void,Field → Entity,Network, Making,Composing) — the referent holon
// Referent-first identity, assembled. A surface is a mention (mentions.js); the quotient over
// mentions is the referent field (field.js); a proposal is checked against negative evidence
// (evaluate.js). This module wires them into the doc API and SEEDS the field.
//
// SEEDING is the migration the spec names (step 10, done live rather than over saved files): the
// existing label quotient — the parser's firm entity roots — is read ONCE, and each firm root
// becomes one opaque referent every mention of it denotes. The referent id is a fresh `ref-N`,
// NOT the root's slug (invariant 2), so "Victor"/"Frankenstein" land on one OPAQUE referent with
// no canonical name (the intended Frankenstein shape), and "Alphonse Frankenstein" — a distinct
// firm root — lands on its own. From there the reader/model channel (assert/propose/split/retract)
// moves identity by APPENDING, and the whole quotient is a fold, so undo is a retraction, never a
// rewrite (invariant 6). The seed assignments carry warrant:'legacy-label-quotient' so they stay
// auditable and revisable — nothing here is promoted to truth by being a spelling.
import { projectGraph } from '../../core/index.js';
import { observeMentions } from './mentions.js';
import { foldReferents, createMinter } from './field.js';
export { foldReferents };   // re-exported: fold the SAME quotient at an arbitrary seq slice
import { evaluateConvergence } from './evaluate.js';

const EMIT = Object.freeze({ src: 'src/perceiver/referents/index.js' });
const tokensOf = (label) => String(label || '').trim().split(/\s+/).filter(Boolean);

// buildReferents(ctx) → the doc.* referent API. ctx carries the leaf state the layer reads:
//   { log, sentences, admission, corefField, deixis, docId }
// Called ONLY under referentIdentity:'mention'; when off it never runs, so the parse is
// byte-identical (acceptance 10).
export const buildReferents = ({ log, sentences, admission, corefField, deixis, docId = 'doc' } = {}) => {
  const snapshot = () => (log.snapshot ? log.snapshot() : log.events);
  const mentions = observeMentions(sentences, { docId });
  const mentionById = new Map(mentions.map((m) => [m.id, m]));

  // The firm label quotient — the parser's own entity roots — read once for seeding.
  const g = projectGraph(log);
  const rep = g.representative || ((x) => x);

  // firm root → opaque referent id, minted lazily and deterministically (first-denoted order).
  const refOfRoot = new Map();
  const minter = createMinter(snapshot());
  const refForRoot = (root) => {
    let r = refOfRoot.get(root);
    if (!r) { r = minter.mint(); refOfRoot.set(root, r); }
    return r;
  };

  // The functional attributes on the log, per firm root — the evaluator's conflict evidence.
  const bornByRoot = new Map();   // root → Set(year)
  for (const e of snapshot())
    if (e.op === 'DEF' && e.kind === 'attr' && e.key === 'bornOn' && e.id != null) {
      const root = rep(e.id);
      let s = bornByRoot.get(root); if (!s) bornByRoot.set(root, s = new Set());
      s.add(String(e.value));
    }
  // Contested surnames — a surname ending ≥2 distinct firm roots' multi-word names (Armstrong).
  const rootsBySurname = new Map();
  const surnameOfRoot = new Map();
  for (const [label, id] of admission.admitted) {
    const t = tokensOf(label);
    if (t.length < 2) continue;
    const sn = t[t.length - 1].toLowerCase();
    const root = rep(id);
    surnameOfRoot.set(root, sn);
    let s = rootsBySurname.get(sn); if (!s) rootsBySurname.set(sn, s = new Set());
    s.add(root);
  }
  const surnameContested = (root) => {
    const sn = surnameOfRoot.get(root);
    return !!sn && (rootsBySurname.get(sn)?.size || 0) >= 2;
  };

  // ── Seed: emit one denotes per resolvable mention ──────────────────────────────
  // A NAME resolves to the firm root of its admitted id; a DESCRIPTION to the figure its head was
  // admitted as (a unnamed referent / common noun), else it opens a HELD referent of its own; a
  // PRONOUN/DEIXIS resolves through the coreference field at its sentence, if that field is
  // concentrated enough to name one referent. Nothing borrows a label it did not earn — an
  // unresolved anaphor stays held (referentOf → null), an identity void, never a silent merge.
  const seedDenote = (surfaceId, refId, warrant, confidence, evidence) => {
    log.append({ op: 'SYN', kind: 'denotes', from: surfaceId, to: refId, warrant,
                 confidence, evidence, defeasible: true }, EMIT);
  };
  for (const m of mentions) {
    if (m.form === 'name') {
      // A name that cleared admission denotes its firm root; one that never earned gravity ("When
      // Victor", a bare month) stays HELD — no minted referent, an identity void, not a guess.
      if (admission.isAdmitted(m.label)) {
        const root = rep(admission.idOf(m.label));
        seedDenote(m.id, refForRoot(root), 'legacy-label-quotient', 0.95, ['name-admission']);
      }
    } else if (m.form === 'description') {
      // A description whose head was admitted as a figure (a unnamed referent / common noun) denotes
      // that figure; an ordinary setting-description ("the room") stays HELD.
      if (admission.isAdmitted(m.normalized)) {
        const root = rep(admission.idOf(m.normalized));
        seedDenote(m.id, refForRoot(root), 'legacy-label-quotient', 0.8, ['description-figure']);
      }
    } else if (m.form === 'deixis' && deixis?.tellerAt) {
      // First person names the current TELLER, not the nearest named figure — the same deixis
      // frame the main read binds "I" through (parse/deixis.js), never the raw field-concentration
      // test below: an addressee this very sentence happens to be hottest about is exactly what
      // the teller channel exists to NOT borrow salience from.
      const teller = deixis.tellerAt(m.sentIdx);
      if (teller?.id) {
        const root = rep(teller.id);
        seedDenote(m.id, refForRoot(root), 'deixis-teller', Math.min(0.9, teller.w ?? 0.5),
                   ['first-person-continuity']);
      }
      // else: held — the teller channel has not grounded a bearer here yet (fails toward silence).
    } else {
      // pronoun (third person) — resolve through the field's posterior BEFORE this sentence
      // would be circular; the field at the mention's own sentIdx already reflects the reading
      // to here. Also the fallback for deixis when no deixis frame was threaded through.
      const field = corefField?.field ? corefField.field(m.sentIdx) : [];
      const top = field[0], next = field[1];
      const concentrated = top && (!next || (top.w ?? 0) - (next.w ?? 0) >= 0.15);
      if (concentrated) {
        const root = rep(top.id);
        seedDenote(m.id, refForRoot(root), 'coref-field', Math.min(0.9, top.w ?? 0.5),
                   [m.form === 'deixis' ? 'first-person-continuity' : 'anaphor-salience']);
      }
      // else: held — no denotation, an identity void the reader can later fill.
    }
  }

  // ── The live quotient + API (a fold over the log, recomputed per call) ──────────
  const fold = () => foldReferents(snapshot());
  const seqOfLastAppend = (predicate) => { let hit = null; for (const e of snapshot()) if (predicate(e)) hit = e.seq; return hit; };

  const rootOfSurface = (surfaceId, f = fold()) => f.referentOf(surfaceId);
  // Ensure a surface has a referent to operate on (a held anaphor the user is about to assert):
  // mint + denote it, then return the fresh id. Append-only.
  const ensureRef = (surfaceId, warrant) => {
    const existing = rootOfSurface(surfaceId);
    if (existing) return existing;
    const id = createMinter(snapshot()).mint();
    seedDenote(surfaceId, id, warrant || 'user-observed', 0.5, ['ensured']);
    return id;
  };

  const displayOf = (surfaceIds) => {
    const names = [], others = [];
    for (const sid of surfaceIds) {
      const m = mentionById.get(sid); if (!m) continue;
      (m.form === 'name' ? names : others).push(m.text);
    }
    const uniq = [...new Set(names.length ? names : others)];
    return uniq.slice(0, 3).join(' / ') || '(unnamed referent)';   // a convenience string — NOT the id (invariant 8)
  };

  const factsFor = (refRoot, f) => {
    // A referent's underlying firm roots (there can be several after ref-merges): read bornOn /
    // surname evidence off each. In the seed phase a referent is one firm root; this generalises.
    const roots = new Set();
    for (const sid of f.surfacesOf(refRoot)) {
      const m = mentionById.get(sid); if (!m) continue;
      if (m.form === 'name' && admission.isAdmitted(m.label)) roots.add(rep(admission.idOf(m.label)));
      else if (m.form === 'description' && admission.isAdmitted(m.normalized)) roots.add(rep(admission.idOf(m.normalized)));
    }
    const bornOn = new Set(), surnames = new Set();
    let contested = false;
    for (const r of roots) {
      for (const y of (bornByRoot.get(r) || [])) bornOn.add(y);
      if (surnameOfRoot.has(r)) surnames.add(surnameOfRoot.get(r));
      if (surnameContested(r)) contested = true;
    }
    return { bornOn: [...bornOn], surname: surnames.size === 1 ? [...surnames][0] : null,
             surnameContested: contested, coactors: new Set() };
  };

  return {
    referentIdentity: 'mention',
    surfaceMentions: () => mentions.slice(),
    referents: ({ frame } = {}) => {   // frame reserved for γ-reweighting; grouping is frame-free
      const f = fold();
      return f.roots.map((root) => {
        const surfaces = f.surfacesOf(root);
        return { id: root, status: surfaces.length ? 'firm' : 'held',
                 surfaces, display: displayOf(surfaces) };
      });
    },
    referentOf: (surfaceId /*, { speculative } = {} */) => rootOfSurface(surfaceId),
    surfacesOf: (refId) => fold().surfacesOf(refId).map((sid) => mentionById.get(sid)).filter(Boolean),

    // The mechanical / model proposer — CHECKED against negative evidence (evaluate.js). Converges
    // only when no conflict; a conflict is reported and NOTHING is merged (invariant: conflict
    // defeats convergence). `evidence` records the positive warrant on the assertion.
    proposeCoreference: (surfaceIds, evidence = {}) => {
      const ids = [...new Set(surfaceIds || [])];
      if (ids.length < 2) return { verdict: 'held', reason: 'need-two-surfaces' };
      const f = fold();
      const anchor = ensureRef(ids[0], 'proposal');
      const f2 = fold();
      const results = [];
      for (const sid of ids.slice(1)) {
        const other = ensureRef(sid, 'proposal');
        const fa = factsFor(rootOfSurface(ids[0]) || anchor, fold());
        const fb = factsFor(rootOfSurface(sid) || other, fold());
        const a = rootOfSurface(ids[0]) || anchor, b = rootOfSurface(sid) || other;
        const ev = evaluateConvergence(a, b, fa, fb, { isSplit: fold().isSplit });
        if (ev.verdict === 'converge') {
          const e = log.append({ op: 'SYN', kind: 'ref-merge', from: a, to: b,
                                 warrant: evidence.warrant || 'proposed-coreference',
                                 evidence: evidence.evidence || ev.evidence, confidence: evidence.confidence ?? 0.7,
                                 defeasible: true }, EMIT);
          log.append({ op: 'EVA', site: 'denotation', ref: e.seq, verdict: 'CORROBORATED', reason: ev.reason }, EMIT);
        } else if (ev.verdict === 'conflict') {
          log.append({ op: 'EVA', site: 'denotation', verdict: 'CONTRADICTED', reason: ev.reason, a, b }, EMIT);
        }
        results.push({ surface: sid, ...ev });
      }
      const conflict = results.find((r) => r.verdict === 'conflict');
      return conflict ? { verdict: 'conflict', reason: conflict.reason, results }
                      : { verdict: 'converge', results };
    },

    // The reader / model channel — provenance-carrying, authoritative. Unifies the referents of
    // the selected surfaces and RETURNS the assertion seq so it can be retracted (invariant 6).
    assertCoreference: (surfaceIds, metadata = {}) => {
      const ids = [...new Set(surfaceIds || [])];
      if (ids.length < 2) return { ok: false, reason: 'need-two-surfaces' };
      const anchor = ensureRef(ids[0], 'user-assert');
      const seqs = [];
      for (const sid of ids.slice(1)) {
        const other = ensureRef(sid, 'user-assert');
        const a = rootOfSurface(ids[0]) || anchor, b = rootOfSurface(sid) || other;
        if (a === b) continue;
        const e = log.append({ op: 'SYN', kind: 'ref-merge', from: a, to: b, user: true,
                               warrant: metadata.warrant || 'reader-assertion',
                               evidence: metadata.evidence || ['user'], confidence: metadata.confidence ?? 1,
                               defeasible: true }, EMIT);
        seqs.push(e.seq);
      }
      return { ok: true, seqs };
    },

    // Assert two surfaces denote DIFFERENT referents — a split that BLOCKS speculative regrouping
    // (field.js honours it over any ref-merge of the pair). Returns the split seq.
    assertDistinct: (surfaceIds, metadata = {}) => {
      const ids = [...new Set(surfaceIds || [])];
      if (ids.length < 2) return { ok: false, reason: 'need-two-surfaces' };
      const a = ensureRef(ids[0], 'user-split');
      let b = rootOfSurface(ids[1]);
      // If the two surfaces currently share one referent (the reading grouped them), CLEAVE the
      // second onto a fresh referent — a later denotes for a surface supersedes its seed in the
      // fold. Then the ref-split blocks any re-merge of the two (conflict dominates convergence).
      if (b == null || b === a) {
        b = createMinter(snapshot()).mint();
        seedDenote(ids[1], b, 'user-split', 1, ['cleaved']);
      }
      const e = log.append({ op: 'SYN', kind: 'ref-split', from: a, to: b, user: true,
                             warrant: metadata.warrant || 'reader-distinction' }, EMIT);
      return { ok: true, seq: e.seq };
    },

    // Undo by APPENDING (never a rewrite). The assertionId is the seq of a denotes/ref-merge/
    // ref-split event; a retraction supersedes it in the fold.
    retractIdentity: (assertionId, reason = 'retracted') => {
      if (assertionId == null) return { ok: false, reason: 'no-assertion' };
      const e = log.append({ op: 'SEG', kind: 'retract', refSeq: assertionId, reason }, EMIT);
      return { ok: true, seq: e.seq };
    },

    // Relations bound to referent ids, with surface spans kept as provenance (invariant 7). Read
    // off the firm graph edges: each figure endpoint resolves through the referent quotient at its
    // own sentence cursor; an np/lemma endpoint (a bare referent, not a figure) is left as-is.
    referentEdges: () => {
      const f = fold();
      const rootToRef = (root) => refOfRoot.get(root) ? f.rootOf(refOfRoot.get(root)) : null;
      const out = [];
      for (const e of snapshot()) {
        if (e.op !== 'CON' && e.op !== 'SIG') continue;
        if (e.srcKind === 'prop' || e.tgtKind === 'prop') continue;   // proposition-to-proposition links
        const srcRef = rootToRef(rep(e.src));
        // The target resolves to a referent through the SAME rep→ref path — including an np-lemma
        // node the unnamed-referent read unioned onto a figure ("the wretch" pursued → the creature). Only when
        // no referent claims it does the bare lemma stand as the endpoint (a genuine np referent).
        const tgtRef = rootToRef(rep(e.tgt)) || e.tgt;
        if (!srcRef) continue;   // subject is not a referent figure (an np subject etc.)
        out.push({ op: e.op, src: srcRef, tgt: tgtRef, via: e.via, sentIdx: e.sentIdx,
                   ...(e.tgtKind ? { tgtKind: e.tgtKind } : {}),
                   surfaceArgs: e.argspan != null ? { seq: e.argspan } : undefined });
      }
      return out;
    },
  };
};

// referentApiFor(doc) — the referent-first identity API for a doc, built LAZILY and cached on
// the doc itself (doc._referentApi). buildReferents ships off by a parse-time flag
// (referentIdentity:'mention', byte-identical when unset) and no reading path threads that flag
// through today, so `doc.referents` is never already a function on an ordinarily-parsed doc —
// every caller that wants referent-quotient identity (not the raw union-find) must build it
// post-hoc, off the already-parsed doc's own log/sentences/admission/corefField. The single
// shared entry point, so a re-render or a second caller (the entity explorer, the cross-source
// crosswalk) never rebuilds it twice, or worse, silently reads an empty `[]` because it forgot to.
export const referentApiFor = (doc) => {
  if (!doc || !doc.log || doc.modality !== 'text') return null;
  if (typeof doc.referents === 'function') return doc;   // flag was already on upstream
  if (doc._referentApi === undefined) {
    try {
      doc._referentApi = buildReferents({
        log: doc.log, sentences: doc.sentences, admission: doc.admission,
        corefField: doc.corefField, deixis: doc.deixis, docId: doc.docId,
      });
    } catch { doc._referentApi = null; }
  }
  return doc._referentApi;
};
