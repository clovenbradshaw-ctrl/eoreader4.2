// EO: SYN·CON·EVA·DEF(Field,Network,Link → Network,Link,Lens, Composing,Binding,Making) — runEssay — section loop / writer
// essay/driver.js — runEssay: the section loop, the ONLY writer of the
// EssayEvent log (docs/longform-generation.md).
//
// The inversion, enacted: per section the driver EXPLORES candidate claims
// cheaply (claim level, never exploratory prose), CONSOLIDATES by binding to
// spans and vetoing the unbound, and RENDERS one prose pass from the
// surviving commitments. Between sections only the carry crosses the doorway;
// the essay-so-far lives in the log; declared dependencies are re-illuminated
// from it on entry. Spine motion is bounded (insert / split / merge fire off
// measured triggers scaled by revisionAggression; replan fires only when a
// bound claim contradicts the thesis, and only through the injected replan
// fold). Generation repeats only in explore and render — and explore is
// model-free by default (extractive candidates always bind), so the whole
// loop runs spans-only exactly like the research driver without a model.
//
// Everything injectable is injectable: `model` ({ phrase }) for the one
// render call per section, `explore` for candidate proposal, `retrieve` for
// per-section supply, `replan` for the whole-log re-fold, `threads` for
// promise extraction. `t` is logical time continued from the log's tail, so
// pausing at a checkpoint and resuming (same log back in, optionally with a
// human-corrected carry) is seamless: the log is the state.

import { bindCitations } from '../../enactor/ground/index.js';
import { bindAndVeto } from '../../enactor/ground/index.js';
import { generateSection, stripUnboundCorrective } from '../arc/index.js';
import {
  planDrafted, sectionEntered, depRelit, spansLit, claimProposed, claimBound,
  candidateVetoed, threadOpened, threadPaid, threadDeferred, spineRevised,
  sectionAccepted, carryCheckpoint, reconcileFinding, EKIND,
} from './events.js';
import { makeSpine, sectionOf, renderOrder, withState, insert as spineInsert, split as spineSplit, merge as spineMerge, replan as spineReplan } from './spine.js';
import { initCarry, updateCarry, capCarry, replanCarry, threadsDue } from './carry.js';
import { runGates } from './gates.js';
import { termsOf, termSimilarity, contradicts, repeats, claimSimilarity, polarityOf } from './terms.js';
import { makeProposition, propositionOf, numbersIn, propsConflict } from './proposition.js';
import { renderChart, renderPullquote, renderDivider, validateSurface } from './renderers.js';
import { projectEssay } from './project.js';
import { reconcile } from './reconcile.js';
import { speak } from '../../model/index.js';

export const KNOB_DEFAULTS = Object.freeze({
  candidates: 2,           // N candidate folds per section — two or three; N is a budget
  exploreWidth: 5,         // candidate claims per fold before consolidation
  supplyWidth: 12,         // spans lit per section
  revisionAggression: 0.5, // how strong a surfaced claim must be to move the spine
  maxInserts: 2,           // runaway-insert backstop per run
  maxReplans: 1,           // replan is expensive; once per run unless raised
  fitFloor: 0.2,           // intent contact below this = "fits no existing intent"
  thesisFloor: 0.34,       // thesis contact above this = "serves the thesis"
  splitFloor: 0.15,        // max cross-cluster contact for a split
  mergeFloor: 0.6,         // intent overlap for folding a thin section away
  thin: 2,                 // fewer survivors than this = a thin section
  payThreshold: 0.34,      // commitment contact that pays a thread
  sectionFloor: 60,        // render budget (advisory floor, hard ceiling)
  sectionCeiling: 360,     // paragraph or more — the grain of GENERATION, never of verification
  renderBindFloor: 0.5,    // below this bound fraction the render regenerates once
  carry: Object.freeze({ maxLedger: 64 }),
  gate: Object.freeze({}),
  reconcilePasses: 1,
});

// The end-of-essay due point a thread defers to when no later section exists;
// reconcile reads threads still open there as unpaid promises.
export const END = 'end';

export const runEssay = async ({
  spine: spineIn = null, thesis = '', sections = null, frame = null,
  spans = [], retrieve = null, explore = null, threads: threadHook = null,
  replan: replanFold = null, model = null, doc = null, classify = null,
  knobs: knobsIn = {}, onEvent = null, log = [], carry: carryIn = null,
  pauseAfter = null, signal = null,
} = {}) => {
  const knobs = { ...KNOB_DEFAULTS, ...knobsIn, carry: { ...KNOB_DEFAULTS.carry, ...(knobsIn.carry || {}) } };
  let t = log.length ? (log[log.length - 1].t ?? log.length - 1) + 1 : 0;
  const emit = (e) => { log.push(e); if (onEvent) onEvent(e); return e; };

  // ── Resume: the log is the state ──────────────────────────────────────────
  const prior = log.length ? projectEssay(log) : null;
  let spine = prior?.spine || null;
  if (!spine) {
    spine = spineIn && spineIn.thesis
      ? makeSpine(spineIn)
      : makeSpine({ thesis, frame, sections: sections || [] });
    emit(planDrafted({ spine, t: t++ }));
  }
  // The checkpoint is the intervene boundary: a caller-supplied carry (the
  // human's correction at the seam) wins over the checkpointed one.
  let carry = carryIn || prior?.carry || initCarry(spine);
  if (carry.thesis !== spine.thesis) carry = replanCarry(carry, spine.thesis);

  // Deterministic id mints, continued across resume by counting the log.
  let claimN = log.filter((e) => e.kind === EKIND.PROPOSE).length;
  let threadN = log.filter((e) => e.kind === EKIND.THREAD_OPEN).length;
  let sectionN = 0;
  const mintSection = () => {
    let id;
    do { id = `sec:x${++sectionN}`; } while (sectionOf(spine, id));
    return id;
  };

  // Re-illumination material for accepted sections (rebuilt on resume), and
  // the LEFT NEIGHBOR the next seam renders from (last accepted, by time).
  const acceptedMaterial = new Map();
  let prevAccepted = null;
  if (prior) for (const s of prior.sections) {
    if (s.state !== 'accepted') continue;
    const mat = { id: s.id, intent: s.intent, terminalClaim: s.terminalClaim, commitments: s.commitments, prose: s.prose };
    acceptedMaterial.set(s.id, mat);
    if (!prevAccepted || (s.acceptedAt ?? 0) > (prevAccepted.acceptedAt ?? 0)) prevAccepted = { ...mat, acceptedAt: s.acceptedAt };
  }
  const failed = new Set((prior?.findings || []).filter((f) => f.kind === 'gate-failed').map((f) => f.sectionId));

  let inserts = 0;
  let replans = 0;

  const supply = normalizeSpans(spans);

  // ── The section loop ──────────────────────────────────────────────────────
  for (;;) {
    if (signal?.aborted) return result(false);
    const order = renderOrder(spine);
    const nextId = order.find((id) => sectionOf(spine, id).state !== 'accepted' && !failed.has(id));
    if (!nextId) break;
    let section = sectionOf(spine, nextId);

    // enter — the workspace opens; declared dependencies are named…
    emit(sectionEntered({ sectionId: section.id, deps: section.dependsOn, t: t++ }));
    // …and re-illuminated from the log: the real texture, not the carry's trace.
    const deps = section.dependsOn.map((id) => acceptedMaterial.get(id)).filter(Boolean);
    if (section.dependsOn.length) emit(depRelit({ sectionId: section.id, dependsOn: section.dependsOn, t: t++ }));

    // supply — the section's own spans; dep-cited spans ride along.
    const secSpans = retrieve
      ? normalizeSpans(await retrieve(section, { carry, frame: spine.frame, deps }))
      : defaultRetrieve(section, supply, deps, knobs);
    emit(spansLit({ sectionId: section.id, spanIds: secSpans.map((s) => `s${s.idx}`), t: t++ }));
    // Claims bind against the whole supply, not only the lit set: an injected
    // explore may perturb the envelope toward anchors outside this section's
    // fold, and a claim is a commitment wherever its span lives in the log.
    const bindPool = unionByIdx(supply, secSpans);

    // explore → consolidate, with one retry carrying the failing gates as a
    // corrective. Two passes at most: gates are constraints, not a treadmill.
    let pass = null;
    let corrective = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      pass = await explorePass({
        section, spine, carry, deps, secSpans, bindPool, explore, doc, classify, knobs, corrective,
        mint: () => `claim:${claimN++}`, emit, tick: () => t++, attempt,
      });
      if (signal?.aborted) return result(false);

      // Bounded spine revision — the mechanism, not the exception.
      const moved = reviseSpine(pass);
      if (moved === 'replan') { section = null; break; } // re-enter the loop under the new spine
      if (moved === 'merged') { section = null; break; } // folded away; the merged section will run
      if (moved === 'split') section = sectionOf(spine, nextId); // part A keeps the id

      // The post-revision sweep: a claim consolidation held only for its
      // thesis service, and the revision did not move, does not belong to
      // this section — struck loudly, never shipped off-intent.
      for (const c of [...pass.survivors]) {
        if (fitOf(c.claim, section.intent) < knobs.fitFloor) {
          emit(candidateVetoed({ sectionId: section.id, claimId: c.claimId, claim: c.claim, reason: 'off-intent', t: t++ }));
          pass.survivors = pass.survivors.filter((x) => x.claimId !== c.claimId);
        }
      }
      if (pass.surfaced) {
        const keep = new Set(pass.survivors.map((c) => c.claimId));
        pass.surfaced = {
          a: pass.surfaced.a.filter((c) => keep.has(c.claimId)),
          b: pass.surfaced.b.filter((c) => keep.has(c.claimId)),
        };
      }

      const nextIntent = intentAfter(spine, order, nextId);
      const terminalClaim = pickTerminal(pass.survivors, nextIntent);
      const due = threadsDue(carry, section.id);
      const { paid, deferred } = settleThreads(carry, section, pass.survivors, order, knobs);

      const gate = runGates({
        section, commitments: pass.survivors, terminalClaim, carry, deps,
        due, paid, deferred, nextIntent,
      }, knobs.gate);

      // Soft drops (ledger repeats without new grounding) are struck loudly.
      for (const claimId of gate.drops) {
        const c = pass.survivors.find((x) => x.claimId === claimId);
        if (!c) continue;
        emit(candidateVetoed({ sectionId: section.id, claimId, claim: c.claim, reason: 'repeats-ledger', t: t++ }));
        pass.survivors = pass.survivors.filter((x) => x.claimId !== claimId);
      }

      if (gate.pass) {
        pass.terminalClaim = terminalClaim;
        pass.paid = paid;
        pass.deferred = deferred;
        break;
      }
      pass.gateFailures = gate.failures;
      corrective = gate.failures.map((f) => `${f.gate}: ${f.reason}`).join('\n');
      pass = null;
    }

    if (section === null) continue; // replanned or merged away — pick up the new order

    if (!pass) {
      // Would not pass after its retry: recorded, skipped, never silently shipped.
      emit(reconcileFinding({ kind: 'gate-failed', sectionId: nextId, detail: { corrective }, t: t++ }));
      failed.add(nextId);
      continue;
    }

    // Commitments become events only now — after divergence and revision have
    // settled which claims are THIS section's.
    for (const c of pass.survivors) {
      emit(claimBound({ sectionId: section.id, claimId: c.claimId, claim: c.claim, prop: c.prop, spanRefs: c.spanRefs, t: t++ }));
    }

    // Threads: pay, defer (with a new due point — never dropped), open.
    for (const id of pass.paid) emit(threadPaid({ threadId: id, sectionId: section.id, t: t++ }));
    for (const d of pass.deferred) emit(threadDeferred({ threadId: d.id, sectionId: section.id, dueBy: d.dueBy, t: t++ }));
    const opened = [];
    const declared = [...section.opens, ...((threadHook && await threadHook({ section, commitments: pass.survivors })) || [])];
    for (const o of declared) {
      const th = { id: `thread:${threadN++}`, text: o.text, openedAt: section.id, dueBy: o.dueBy ?? null };
      opened.push(th);
      emit(threadOpened({ threadId: th.id, text: th.text, openedAt: th.openedAt, dueBy: th.dueBy, t: t++ }));
    }

    // render — the ONE pass in the slot's OWN modality, from the surviving
    // commitments; the claim-grain verify strikes what a text render smuggled,
    // and a non-text surface is a deterministic projection of the same
    // payloads, checked by the cross-modal validator.
    const rendered = await render({ section, pass, secSpans, model, doc, carry, knobs, signal, emit, tick: () => t++ });

    // The seam INTO this section — a form-owned transition slot, rendered
    // from both neighbors (the productive half of the handoff gate).
    const seam = await renderSeam({ prev: prevAccepted, section, survivors: pass.survivors, carry, model, knobs, signal, emit, tick: () => t++ });

    // accept → update the carry → flush at the doorway (checkpoint).
    emit(sectionAccepted({
      sectionId: section.id, terminalClaim: pass.terminalClaim, prose: rendered.prose,
      sentences: rendered.sentences, dropped: rendered.dropped,
      modality: section.modality, surface: rendered.surface ?? null, seam,
      model: model?.name ?? (model ? 'model' : null), prompt: rendered.prompt, raw: rendered.raw, t: t++,
    }));
    spine = withState(spine, section.id, 'accepted');
    const mat = { id: section.id, intent: section.intent, terminalClaim: pass.terminalClaim, commitments: pass.survivors, prose: rendered.prose };
    acceptedMaterial.set(section.id, mat);
    prevAccepted = mat;

    carry = capCarry(updateCarry(carry, {
      terminalClaim: pass.terminalClaim,
      commitments: pass.survivors,
      paid: pass.paid,
      opened,
      deferred: pass.deferred,
    }), knobs.carry);
    emit(carryCheckpoint({ sectionId: section.id, carry, t: t++ }));

    if (pauseAfter === section.id) return result(false);
  }

  // ── Global reconciliation — one pass over the assembled draft ─────────────
  if (knobs.reconcilePasses > 0) {
    for (const f of reconcile(projectEssay(log))) {
      emit(reconcileFinding({ kind: f.kind, sectionId: f.sectionId, detail: f.detail, t: t++ }));
    }
  }
  return result(true);

  function result(done) {
    const report = projectEssay(log);
    return { log, report, essay: report.assembled, spine, carry, done };
  }

  // Bounded spine motion off the consolidation's measured triggers. Returns
  // the motion taken so the loop knows whether the current section survived.
  function reviseSpine(pass) {
    // replan — the only motion that touches the thesis; trigger: a bound,
    // un-vetoable claim contradicts it. Without the injected fold, the
    // contradiction is recorded (reconciliation's business), never hidden.
    if (pass.replanTrigger) {
      const claim = pass.replanTrigger;
      if (replanFold && replans < knobs.maxReplans) {
        replans += 1;
        const next = spineReplan(spine, replanFold({ spine, carry, claim }));
        spine = next;
        carry = replanCarry(carry, spine.thesis);
        emit(spineRevised({ op: 'replan', sectionIds: spine.sections.map((s) => s.id), detail: { spine: rawSpine(spine) }, t: t++ }));
        return 'replan';
      }
      emit(reconcileFinding({ kind: 'thesis-contradiction', sectionId: pass.section.id, detail: { claim: claim.claim }, t: t++ }));
      pass.replanTrigger = null;
    }

    // split — exploration keeps producing two non-coherent claim clusters,
    // both spine-relevant. Strength = cluster separation, scaled by the knob.
    const clusters = pass.clusters;
    if (clusters && clusters.separation >= Math.max(1 - knobs.revisionAggression, knobs.splitFloor)
      && clusters.a.length >= knobs.thin && clusters.b.length >= knobs.thin) {
      const bId = mintSection();
      const partA = { id: pass.section.id, intent: pass.section.intent, anchors: pass.section.anchors, dependsOn: pass.section.dependsOn, opens: pass.section.opens, divergence: pass.section.divergence };
      // Part B inherits the original coherence edges — an edge to part A would
      // be provenance, not coherence: the clusters are non-coherent by
      // construction, which is exactly why they split.
      const partB = { id: bId, intent: clusters.b[0].claim, anchors: clusters.b.flatMap((c) => c.spanRefs), dependsOn: pass.section.dependsOn };
      spine = spineSplit(spine, pass.section.id, [partA, partB]);
      emit(spineRevised({ op: 'split', sectionIds: [pass.section.id, bId], detail: { of: pass.section.id, into: [partA, partB] }, t: t++ }));
      // Cluster B's claims move to the new section (not struck — moved).
      for (const c of clusters.b) {
        emit(candidateVetoed({ sectionId: pass.section.id, claimId: c.claimId, claim: c.claim, reason: `moved-to-${bId}`, t: t++ }));
      }
      pass.survivors = clusters.a;
      pass.clusters = null;
      return 'split';
    }

    // merge — a thin section whose intent another pending section already
    // covers folds into it; its material re-derives there.
    if (pass.survivors.length < knobs.thin) {
      const other = spine.sections.find((s) =>
        s.id !== pass.section.id && s.state === 'pending'
        && claimSimilarity(s.intent, pass.section.intent).sim >= knobs.mergeFloor);
      if (other) {
        const merged = { id: other.id, intent: other.intent, divergence: other.divergence };
        try {
          spine = spineMerge(spine, [pass.section.id, other.id], merged);
        } catch {
          return null; // a merge that would knot the DAG simply does not fire
        }
        emit(spineRevised({ op: 'merge', sectionIds: [pass.section.id, other.id], detail: { of: [pass.section.id, other.id], into: merged }, t: t++ }));
        return 'merged';
      }
    }

    // insert — a bound claim that serves the thesis and fits no existing
    // intent gets its own pending section, downstream of this one.
    for (const c of [...pass.survivors]) {
      if (inserts >= knobs.maxInserts) break;
      const fit = fitOf(c.claim, pass.section.intent);
      const serve = fitOf(c.claim, spine.thesis);
      const strength = serve - fit;
      if (fit < knobs.fitFloor && serve >= knobs.thesisFloor && strength >= (1 - knobs.revisionAggression)
        && !fitsAnyIntent(spine, c.claim, knobs.fitFloor)) {
        inserts += 1;
        const id = mintSection();
        // No dependsOn back to this section: the claim fits no existing
        // intent, so a coherence edge to the section that surfaced it would
        // be provenance dressed as coherence (and would fail its own gate).
        const sec = { id, intent: c.claim, anchors: [...c.spanRefs], dependsOn: [] };
        spine = spineInsert(spine, sec, { afterId: pass.section.id });
        emit(spineRevised({ op: 'insert', sectionIds: [id], detail: { section: sec, afterId: pass.section.id }, t: t++ }));
        emit(candidateVetoed({ sectionId: pass.section.id, claimId: c.claimId, claim: c.claim, reason: `moved-to-${id}`, t: t++ }));
        pass.survivors = pass.survivors.filter((x) => x.claimId !== c.claimId);
      }
    }
    return null;
  }
};

// ── explore + consolidate ────────────────────────────────────────────────────
// Candidates perturb ATTENTION, not decoding: each fold starts the read at a
// different arrest (a different offset into the ranked supply), so a
// different set of spans crosses threshold. An injected `explore` replaces
// the proposer wholesale (frame/envelope perturbation live there).
const explorePass = async ({ section, spine, carry, deps, secSpans, bindPool, explore, doc, classify, knobs, corrective, mint, emit, tick, attempt }) => {
  const n = Math.max(1, knobs.candidates | 0);
  let candidateSets;
  if (explore) {
    const out = await explore({ section, carry, deps, spans: secSpans, n, width: knobs.exploreWidth, corrective, attempt });
    candidateSets = Array.isArray(out?.[0]) ? out : [out || []];
  } else {
    candidateSets = [];
    for (let k = 0; k < n; k++) {
      const off = k + attempt; // the retry shifts every fold's arrest one further
      candidateSets.push(secSpans.slice(off, off + knobs.exploreWidth).map((s) => s.text));
    }
  }

  // Propose once per distinct claim — the claim, not the fold, is the unit.
  const byText = new Map();
  const sets = candidateSets.map((claims) => claims.map((text) => {
    const key = String(text).trim();
    if (!byText.has(key)) {
      const claimId = mint();
      byText.set(key, { claimId, claim: key });
      emit(claimProposed({ sectionId: section.id, claimId, claim: key, t: tick() }));
    }
    return byText.get(key);
  }).filter(Boolean));

  // Consolidate: bind to spans, veto the unbound, keep what coheres — with
  // the ledger, with the batch so far, and with this section's intent (a
  // claim that serves only the thesis is held for the revision to move).
  // Vetoes are emitted here; BINDs wait until revision settles.
  const status = new Map(); // claimId → { ...claim, spanRefs } | null
  let replanTrigger = null;
  for (const { claimId, claim } of byText.values()) {
    const bound = bindCitations(claim, bindPool, { doc });
    const spanRefs = [...new Set(bound.filter((b) => b.citation).map((b) => b.citation))];
    if (!spanRefs.length) {
      emit(candidateVetoed({ sectionId: section.id, claimId, claim, reason: 'unbound', t: tick() }));
      status.set(claimId, null);
      continue;
    }
    // The payload drops below language here: the claim string is the text
    // projection of a typed proposition, and every other modality projects
    // the same payload (proposition.js). An injected `classify` — the
    // phasepost/graph reader when one is warm — replaces the lexical fallback
    // WHOLESALE, the same contract as the research driver's addressOf; the
    // shape is enforced either way (makeProposition), so the cue lists never
    // decide when a real reader is on hand.
    const prop = classify
      ? makeProposition(await classify(claim, { spanRefs, spans: bindPool }))
      : propositionOf(claim);
    const commitment = { claimId, claim, prop, spanRefs, sectionId: section.id };
    // A bound claim that contradicts the THESIS is un-vetoable — it is the
    // replan trigger, not a candidate to strike.
    if (contradicts(claim, spine.thesis)) {
      replanTrigger = commitment;
      status.set(claimId, commitment);
      continue;
    }
    // Contradiction has two readings now that the payload is typed: the
    // string one (shared vocabulary, flipped polarity) and the NUMERIC one
    // (same relation, same time, disjoint quantities — the payload's own
    // field disagreeing with itself, which no negation word marks).
    const denies = (l) => contradicts(claim, l.claim)
      || (claimSimilarity(claim, l.claim).sim >= 0.5 && propsConflict(commitment.prop, l.prop));
    const clash = carry.ledger.find(denies);
    if (clash) {
      emit(candidateVetoed({ sectionId: section.id, claimId, claim, reason: `contradicts-ledger:${clash.sectionId}`, t: tick() }));
      status.set(claimId, null);
      continue;
    }
    // The batch coheres with itself too: a candidate contradicting a claim
    // already kept this section loses to it (arrival order breaks the tie —
    // the earlier claim has already been weighed).
    const batchClash = [...status.values()].find((k) => k && denies(k));
    if (batchClash) {
      emit(candidateVetoed({ sectionId: section.id, claimId, claim, reason: `contradicts-ledger:${section.id}`, t: tick() }));
      status.set(claimId, null);
      continue;
    }
    const repeat = carry.ledger.find((l) => repeats(claim, l.claim));
    if (repeat) {
      const known = new Set(repeat.spanRefs);
      if (!spanRefs.some((r) => !known.has(r))) {
        emit(candidateVetoed({ sectionId: section.id, claimId, claim, reason: `repeats-ledger:${repeat.sectionId}`, t: tick() }));
        status.set(claimId, null);
        continue;
      }
    }
    // Intent fit: a claim with no real contact with this section's intent is
    // struck now — unless it serves the thesis, in which case it rides to the
    // revision (insert may give it its own section; the sweep strikes it if not).
    if (fitOf(claim, section.intent) < knobs.fitFloor && fitOf(claim, spine.thesis) < knobs.thesisFloor) {
      emit(candidateVetoed({ sectionId: section.id, claimId, claim, reason: 'off-intent', t: tick() }));
      status.set(claimId, null);
      continue;
    }
    status.set(claimId, commitment);
  }

  const surviving = (set) => set.map((c) => status.get(c.claimId)).filter(Boolean);
  const survivorSets = sets.map(surviving);
  const union = dedupe(survivorSets.flat());

  // Divergence: if the folds disagree after veto, the document
  // underdetermines the section. The section's intent sets the policy —
  // commit (the spine breaks the tie) or surface (write the divergence).
  let survivors = union;
  let surfaced = null;
  if (survivorSets.length > 1) {
    const [a, b] = mostDivergent(survivorSets);
    if (a && b && jaccard(a, b) < 0.5) {
      if (section.divergence === 'commit') {
        const best = survivorSets
          .map((set) => ({ set, fit: setFit(set, section.intent) }))
          .sort((x, y) => y.fit - x.fit)[0].set;
        const keep = new Set(best.map((c) => c.claimId));
        for (const c of union) {
          if (!keep.has(c.claimId)) {
            emit(candidateVetoed({ sectionId: section.id, claimId: c.claimId, claim: c.claim, reason: 'divergence-commit', t: tick() }));
          }
        }
        survivors = dedupe(best);
      } else {
        surfaced = { a: dedupe(a), b: dedupe(b.filter((c) => !a.some((x) => x.claimId === c.claimId))) };
      }
    }
  }

  return {
    section, survivors, surfaced, replanTrigger,
    clusters: clusterSurvivors(survivors, section, knobs),
  };
};

// ── helpers ──────────────────────────────────────────────────────────────────

const normalizeSpans = (spans = []) =>
  spans.map((s, i) => ({ idx: s.idx ?? i, text: String(s.text ?? s), score: s.score ?? 0 }));

const unionByIdx = (a, b) => {
  const seen = new Set(a.map((s) => s.idx));
  return [...a, ...b.filter((s) => !seen.has(s.idx))];
};

// Intent/thesis contact with a minimum-shared-terms guard: one incidental
// shared word is not fit, however small the target term set makes the ratio.
const fitOf = (claim, target) => {
  const targetTerms = termsOf(target);
  const { sim, shared } = termSimilarity(termsOf(claim), targetTerms);
  return shared >= Math.min(2, targetTerms.length) ? sim : 0;
};

// Default supply: contact with the intent + anchors, dep-cited spans boosted —
// re-illumination pays for section 2's texture only when section 8 asks.
const defaultRetrieve = (section, supply, deps, knobs) => {
  const target = termsOf(`${section.intent} ${section.anchors.join(' ')}`);
  const depRefs = new Set(deps.flatMap((d) => d.commitments.flatMap((c) => c.spanRefs)));
  const scored = supply.map((s) => {
    const { sim } = termSimilarity(termsOf(s.text), target);
    return { ...s, _r: sim + (depRefs.has(`s${s.idx}`) ? 0.25 : 0) };
  });
  const ranked = scored.sort((a, b) => (b._r - a._r) || (a.idx - b.idx));
  const lit = ranked.filter((s) => s._r > 0);
  return (lit.length ? lit : ranked).slice(0, knobs.supplyWidth).map(({ _r, ...s }) => s);
};

const dedupe = (cs) => {
  const seen = new Set();
  return cs.filter((c) => (seen.has(c.claimId) ? false : (seen.add(c.claimId), true)));
};

const jaccard = (a, b) => {
  const A = new Set(a.map((c) => c.claimId)), B = new Set(b.map((c) => c.claimId));
  if (!A.size && !B.size) return 1;
  let shared = 0;
  for (const x of A) if (B.has(x)) shared++;
  return shared / (A.size + B.size - shared);
};

const mostDivergent = (sets) => {
  let best = [null, null], score = Infinity;
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
    const jac = jaccard(sets[i], sets[j]);
    if (jac < score) { score = jac; best = [sets[i], sets[j]]; }
  }
  return best;
};

const setFit = (set, intent) => {
  if (!set.length) return 0;
  let sum = 0;
  for (const c of set) sum += claimSimilarity(c.claim, intent).sim;
  return sum / set.length;
};

// Two-cluster read of the survivors: seed with the most mutually dissimilar
// pair, assign the rest greedily. `separation` = 1 − the strongest cross link.
const clusterSurvivors = (survivors, section, knobs) => {
  if (survivors.length < knobs.thin * 2) return null;
  let seedA = null, seedB = null, lo = Infinity;
  for (let i = 0; i < survivors.length; i++) for (let j = i + 1; j < survivors.length; j++) {
    const { sim } = claimSimilarity(survivors[i].claim, survivors[j].claim);
    if (sim < lo) { lo = sim; seedA = survivors[i]; seedB = survivors[j]; }
  }
  if (!seedA) return null;
  const a = [], b = [];
  for (const c of survivors) {
    const toA = claimSimilarity(c.claim, seedA.claim).sim;
    const toB = claimSimilarity(c.claim, seedB.claim).sim;
    (toA >= toB ? a : b).push(c);
  }
  let cross = 0;
  for (const x of a) for (const y of b) {
    const { sim } = claimSimilarity(x.claim, y.claim);
    if (sim > cross) cross = sim;
  }
  if (cross > knobs.splitFloor) return null;
  return { a, b, separation: 1 - cross };
};

const fitsAnyIntent = (spine, claim, floor) =>
  spine.sections.some((s) => fitOf(claim, s.intent) >= floor);

const intentAfter = (spine, order, id) => {
  const i = order.indexOf(id);
  for (let j = i + 1; j < order.length; j++) {
    const s = sectionOf(spine, order[j]);
    if (s && s.state !== 'accepted') return s.intent;
  }
  return null;
};

// The handoff: the survivor the next section's intent can best pick up.
const pickTerminal = (survivors, nextIntent) => {
  if (!survivors.length) return '';
  if (!nextIntent) return survivors[survivors.length - 1].claim;
  let best = survivors[survivors.length - 1], hi = -1;
  for (const c of survivors) {
    const { sim } = claimSimilarity(c.claim, nextIntent);
    if (sim > hi) { hi = sim; best = c; }
  }
  return best.claim;
};

// Pay what the commitments cover (due or not — early payment is payment);
// defer what is due and unpaid to the next pending doorway, END when none.
const settleThreads = (carry, section, survivors, order, knobs) => {
  const paid = [];
  for (const th of carry.threads) {
    const hit = survivors.some((c) => claimSimilarity(c.claim, th.text).sim >= knobs.payThreshold);
    if (hit) paid.push(th.id);
  }
  const paidSet = new Set(paid);
  const i = order.indexOf(section.id);
  const nextId = order.slice(i + 1).find((id) => id !== section.id) ?? END;
  const deferred = threadsDue(carry, section.id)
    .filter((th) => !paidSet.has(th.id))
    .map((th) => ({ id: th.id, dueBy: nextId }));
  return { paid, deferred };
};

// ── render — one prose pass from the surviving commitments ──────────────────
// ASYMMETRIC GRANULARITY: generate at paragraph grain, verify at claim grain.
// By render time the propositions are chosen and bound — the model is doing
// surface realization, not fact generation, so the prose flows in one pass
// per section (the snowball has nothing to roll). The fine grain returns in
// the check: every rendered sentence is re-bound; a cited sentence keeps its
// citation, connective tissue that made lexical contact rides as glue, an
// assertive sentence bound to nothing is struck, and a sentence contradicting
// the ledger is struck whatever it cites — each strike a loud veto event.
// With no model: the extractive floor — the commitments themselves, in order;
// a surfaced divergence renders both framings, each grounded.
const render = async ({ section, pass, secSpans, model, doc, carry, knobs, signal, emit, tick }) => {
  const extractive = () => {
    const sentences = pass.survivors.map((c) => ({ text: c.claim, boundTo: c.spanRefs[0] ?? null, glue: false }));
    if (pass.surfaced) {
      const one = pass.surfaced.a.map((c) => c.claim).join(' ');
      const two = pass.surfaced.b.map((c) => c.claim).join(' ');
      return { prose: two ? `${one} Read under another frame: ${two}` : one, sentences, dropped: 0 };
    }
    return { prose: pass.survivors.map((c) => c.claim).join(' '), sentences, dropped: 0 };
  };

  // A non-text slot renders as a deterministic PROJECTION of the payloads —
  // no model call at all: by render time the propositions are chosen and
  // bound, so a chart is read off their quantities and a pull quote is a
  // bound claim verbatim. The cross-modal validator holds even these (a
  // regression tripwire — agreement is by construction, so a violation means
  // a renderer bug, and the slot falls back to the text projection).
  if (section.modality === 'chart' || section.modality === 'pullquote') {
    const surface = section.modality === 'chart'
      ? renderChart(pass.survivors)
      : renderPullquote(pass.survivors[pass.survivors.length - 1]);
    const check = validateSurface(surface, pass.survivors, { spans: secSpans });
    return { ...extractive(), surface: check.ok ? surface : null, prompt: null, raw: null };
  }

  if (!model) return { ...extractive(), surface: null, prompt: null, raw: null };

  const refs = new Set(pass.survivors.flatMap((c) => c.spanRefs));
  const boundSpans = secSpans.filter((s) => refs.has(`s${s.idx}`));
  const spec = { subClaim: section.intent, spans: boundSpans, floor: knobs.sectionFloor, ceiling: knobs.sectionCeiling };
  let corrective = pass.surfaced
    ? 'The sources support two readings; present both, each on its own evidence.'
    : '';
  let out = await generateSection(spec, { doc, model, corrective, signal, tail: carry.priorClaim });
  let bv = bindAndVeto(out.rawOutput, boundSpans, { question: section.intent });
  if (bv.boundFraction < knobs.renderBindFloor) {
    corrective = [corrective, stripUnboundCorrective(bv.bound)].filter(Boolean).join('\n');
    out = await generateSection(spec, { doc, model, corrective, signal, tail: carry.priorClaim });
    const retry = bindAndVeto(out.rawOutput, boundSpans, { question: section.intent });
    if (retry.boundFraction >= bv.boundFraction) bv = retry;
  }

  // The claim-grain verify over the paragraph-grain render. `allowed` is the
  // quantity vocabulary the payloads and their bound spans license — a cited
  // sentence whose number appears nowhere in them ALTERED a figure while
  // paraphrasing, the quiet cross-modal hallucination a citation alone
  // would let through.
  const allowed = new Set();
  for (const c of pass.survivors) {
    for (const q of c.prop?.quantities || []) allowed.add(q.value);
    if (c.prop?.time != null) allowed.add(+c.prop.time);
  }
  for (const s of boundSpans) for (const n of numbersIn(s.text)) allowed.add(n.value);

  const kept = [];
  let dropped = 0;
  for (const b of bv.bound) {
    const clash = carry.ledger.find((l) => contradicts(b.claim, l.claim))
      || pass.survivors.find((c) => contradicts(b.claim, c.claim));
    if (clash) {
      emit(candidateVetoed({ sectionId: section.id, claimId: null, claim: b.claim, reason: 'render-contradicts-ledger', t: tick() }));
      dropped += 1;
      continue;
    }
    if (numbersIn(b.claim).some((n) => !allowed.has(n.value))) {
      emit(candidateVetoed({ sectionId: section.id, claimId: null, claim: b.claim, reason: 'render-alters-quantity', t: tick() }));
      dropped += 1;
      continue;
    }
    if (b.citation) { kept.push({ text: b.claim, boundTo: b.citation, glue: false }); continue; }
    // Unbound: CONTACT is the measurement, not length — the binder's own
    // floor (ground/bind.js): a sentence whose amplitude made lexical contact
    // with the spans is connective tissue or a sub-threshold paraphrase and
    // rides as glue, marked; zero contact is prose from nowhere — struck,
    // however fluent. One carve-out, the seam rule again: connective tissue
    // may not DENY — an unbound negative is an assertion of absence (the
    // claim that needs grounding most), never glue.
    if (b.score > 0 && polarityOf(b.claim) === '+') {
      kept.push({ text: b.claim, boundTo: null, glue: true });
      continue;
    }
    emit(candidateVetoed({ sectionId: section.id, claimId: null, claim: b.claim, reason: 'render-unbound', t: tick() }));
    dropped += 1;
  }

  // A render the floor refuses — or that the verify emptied of bound content —
  // falls back to the commitments themselves: ungrounded fluency never ships
  // over bound claims.
  if (bv.refuse || !kept.some((k) => k.boundTo)) {
    return { ...extractive(), surface: null, dropped, prompt: out.messages, raw: out.rawOutput };
  }
  const prose = kept.map((k) => (k.boundTo ? `${k.text} [${k.boundTo}]` : k.text)).join(' ');
  return { prose, surface: null, sentences: kept, dropped, prompt: out.messages, raw: out.rawOutput };
};

// ── the seam — a form-owned transition slot, rendered from BOTH neighbors ───
// Two generators never smooth a seam by talking to each other; the FORM owns
// the slot and chooses its modality, never the model. A declared seam is
// honored; 'auto' phrases one connective sentence when a model is on hand and
// sets an honest divider when not. A phrased seam is connective tissue by
// construction: it may reuse only its neighbors' vocabulary and no numbers at
// all — one alien content term of slack, then it falls back to the divider,
// loudly. Sometimes the fluent move between two ideas IS a divider or the
// left neighbor's terminal claim pulled out as a quote.
const renderSeam = async ({ prev, section, survivors, carry, model, knobs, signal, emit, tick }) => {
  if (!prev) return null; // the first section opens the essay — no seam into it
  const declared = section.seam?.modality || 'auto';
  const mode = declared === 'auto' ? (model ? 'text' : 'divider') : declared;
  if (mode === 'divider') return renderDivider();
  if (mode === 'pullquote') {
    const src = (prev.commitments || []).find((c) => c.claim === prev.terminalClaim)
      || (prev.commitments || [])[prev.commitments.length - 1];
    return src ? renderPullquote(src) : renderDivider();
  }
  if (mode === 'chart') {
    // The fluent move from A to B is sometimes a figure: the quantity-bearing
    // payloads of BOTH neighbors, projected together. Deterministic like any
    // chart; thinner than two data points it degrades to the divider.
    const pool = [...(prev.commitments || []), ...survivors];
    const surface = renderChart(pool.filter((c) => c.prop?.quantities?.length));
    return surface.data.length >= 2 ? surface : renderDivider();
  }
  if (!model) return renderDivider();

  const left = prev.terminalClaim || '';
  const right = section.intent;
  const messages = [
    { role: 'system', content: 'You write one short connective sentence that carries a reader from one point to the next. Use only the ideas already on the page; add no new facts, names, or numbers.' },
    { role: 'user', content: `The previous section ended on: ${left}\nThe next section takes up: ${right}\nWrite the one transition sentence.` },
  ];
  const raw = await speak(model, messages, { maxTokens: 60, signal });
  const sentence = (raw.trim().split(/(?<=[.!?])\s+/)[0] || '').trim();
  const allowedTerms = new Set([
    ...termsOf(left), ...termsOf(right),
    ...(prev.commitments || []).flatMap((c) => termsOf(c.claim)),
    ...survivors.flatMap((c) => termsOf(c.claim)),
  ]);
  const alien = termsOf(sentence).filter((w) => !allowedTerms.has(w));
  if (!sentence || alien.length > 1 || numbersIn(sentence).length) {
    if (sentence) emit(candidateVetoed({ sectionId: section.id, claimId: null, claim: sentence, reason: 'seam-unbound', t: tick() }));
    return renderDivider();
  }
  // Vocabulary subset is blind to polarity — a seam built from its neighbors'
  // own words can still DENY them. Connective tissue may not contradict what
  // it connects, nor anything the ledger holds.
  const denies = (prev.commitments || []).some((c) => contradicts(sentence, c.claim))
    || survivors.some((c) => contradicts(sentence, c.claim))
    || carry.ledger.some((l) => contradicts(sentence, l.claim));
  if (denies) {
    emit(candidateVetoed({ sectionId: section.id, claimId: null, claim: sentence, reason: 'seam-contradicts-ledger', t: tick() }));
    return renderDivider();
  }
  return Object.freeze({ modality: 'text', text: sentence });
};

const rawSpine = (spine) => ({
  thesis: spine.thesis,
  frame: spine.frame,
  sections: spine.sections.map((s) => ({ ...s, anchors: [...s.anchors], dependsOn: [...s.dependsOn], opens: s.opens.map((o) => ({ ...o })) })),
});
