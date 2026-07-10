// EO: EVA·SEG·DEF·NUL(Entity,Network,Lens → Link,Lens,Void, Binding,Dissecting,Clearing) — credence write side
// createCredenceBook — the write side of the credence holon (spec §7).
//
// It mirrors createParser: the instance owns the write-time state (the per-
// channel changepoint detectors and the trajectory clock) on itself, never at
// module scope. The three channels are EVA scoring acts; each appends an
// append-only event and nothing else (§3, §8). The state is never stored — it is
// the fold of those events, read back by projectCredence (§7).
//
// The detector runs HERE, at observation time, so the regime boundary it finds is
// recorded as a SEG changepoint event on the trail. The projection then folds
// that event deterministically; it never re-detects, so replay is byte-identical
// whether the book is warm or rebuilt cold from the log (conformance §3, §7).
//
// Writing is GATED. With the channels off (the default), the book is never asked
// to observe, so no credence event is ever written and every existing path is
// byte-identical. The book is the opt-in faculty, not a change to the spine.

import { createLog } from '../../core/index.js';
import { createPageHinkley } from './detect.js';
import {
  projectCredence, credence, CLASS, DEFAULT_CREDENCE_RULES, weightByIndep,
} from './project.js';

const clamp01 = (x) => Math.min(1, Math.max(0, Number(x) || 0));

// The default independence heuristic (§10), the soft spot named as such. Start at
// fully independent and discount for the ways two sources can secretly be one:
// shared author/byline, shared wire feed or funder, direct citation, near-
// identical timestamps, high text overlap. Exposed and overridable — treat the
// weight as the thing most likely to be wrong.
const jaccard = (a, b) => {
  const ta = new Set(String(a).toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(String(b).toLowerCase().split(/\W+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
};

// The effective number of INDEPENDENT corroborators (§10). The soft spot of the
// whole system: K is only as good as this. Counting a like-author cluster as N
// voices is exactly the failure mode the sock-puppet conformance test exists to
// catch. The classic effective-sample-size of a correlated set captures it:
//
//   eff = (Σ wᵢ)² / Σᵢⱼ wᵢ wⱼ ρᵢⱼ ,   ρᵢⱼ = 1 − independence(i, j),  ρᵢᵢ = 1
//
// k identical sources (ρ = 1) collapse to eff ≈ 1; k independent ones (ρ = 0) give
// eff = k. We then discount by the corroborators' average independence FROM the
// bound source, so a source corroborating itself adds nothing. Computed at write
// time, where the source descriptors live; the result rides on the event so the
// projection reads a number and stays pure.
const effectiveIndependent = (corrs, against, indep) => {
  const k = corrs.length;
  if (k === 0) return 0;
  let sumRho = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      sumRho += i === j ? 1 : (1 - clamp01(indep(corrs[i], corrs[j])));
    }
  }
  const effCluster = sumRho > 0 ? (k * k) / sumRho : k;
  let srcIndep = 1;
  if (against) {
    let s = 0;
    for (const c of corrs) s += clamp01(indep(against, c));
    srcIndep = s / k;
  }
  return effCluster * srcIndep;
};

export const defaultIndependence = (a, b, { tsWindow = 0 } = {}) => {
  if (!a || !b) return 1;
  if (a.id != null && a.id === b.id) return 0;            // the same source agreeing with itself
  let w = 1;
  if (a.author && b.author && a.author === b.author) w *= 0.1;
  if (a.feed && b.feed && a.feed === b.feed) w *= 0.2;
  if (a.funder && b.funder && a.funder === b.funder) w *= 0.5;
  if (Array.isArray(a.cites) && a.cites.includes(b.id)) w *= 0.3;
  if (Array.isArray(b.cites) && b.cites.includes(a.id)) w *= 0.3;
  if (a.t != null && b.t != null && Math.abs(a.t - b.t) <= tsWindow) w *= 0.4;
  if (a.text && b.text) {
    const ov = jaccard(a.text, b.text);
    if (ov > 0.8) w *= 0.2; else if (ov > 0.5) w *= 0.6;
  }
  return Math.min(1, Math.max(0, w));
};

export const createCredenceBook = (opts = {}) => {
  const rules = { ...DEFAULT_CREDENCE_RULES, ...(opts.rules || {}) };
  const log = opts.log || createLog({ docId: opts.docId || 'credence' });
  const independence = opts.independence || ((a, b) => defaultIndependence(a, b, opts));

  // Write-time state owned on the instance (createParser discipline).
  let clock = 0;                       // the trajectory's monotonic time index
  const detectors = new Map();         // `${source}␟${domain}␟${channel}` → PageHinkley
  const asserted = new Set();          // (source,domain) the DEF bullshitter call already fired for
  const inited = new Set();            // (source,domain) the NUL never-set marker was written for

  const key = (s, d, c) => `${s}␟${d}␟${c}`;
  const detectorFor = (s, d, c) => {
    const k = key(s, d, c);
    let det = detectors.get(k);
    if (!det) {
      det = createPageHinkley({
        delta: rules.ph_delta, threshold: rules.ph_threshold, warmup: rules.ph_warmup,
      });
      detectors.set(k, det);
    }
    return det;
  };

  // NUL: mark a (source, domain) as touched-but-never-set. Held distinct from a
  // low score and from a cleared regime (§2, §10).
  const init = (source_id, domain, cursor) => {
    const k = `${source_id}␟${domain}`;
    if (inited.has(k)) return;
    inited.add(k);
    log.append({ op: 'NUL', kind: 'credence_init', source_id, domain, cursor: cursor ?? clock++ });
  };

  // Run a channel's detector and, on a firing, record the regime boundary as a
  // SEG changepoint event with its run-length drop (§6).
  const maybeChangepoint = (source_id, domain, channel, value, cursor) => {
    if (!rules.ph_channels.includes(channel)) return;   // §6: only the bounded channels segment
    const fired = detectorFor(source_id, domain, channel).observe(value);
    if (fired) {
      log.append({
        op: 'SEG', kind: 'changepoint', source_id, domain,
        channel, cursor, run_length_drop: fired.magnitude, direction: fired.direction,
      });
      // A break re-opens the verdict — the next regime must earn its own DEF.
      asserted.delete(`${source_id}␟${domain}`);
    }
  };

  // ── Channel one: coherence (EVA) ──
  // x ∈ [0,1] is the source's claim-cluster coherence on one probe — high when the
  // claims interfere under one model, low when there is no model under them. The
  // cheap channel; needs no other source and no ground truth (§3).
  const observeCoherence = (source_id, domain, x, { weight = 1, cursor, span_ids, payload } = {}) => {
    const at = cursor ?? clock++;
    log.append({
      op: 'EVA', kind: 'coherence_obs', source_id, domain,
      x: clamp01(x), weight, cursor: at, span_ids, payload,
    });
    maybeChangepoint(source_id, domain, 'coherence', clamp01(x), at);
    return at;
  };

  // ── Channel two: corroboration survival (EVA) ──
  // x ∈ [0,1] is the fraction of the claim that survives triangulation against
  // sources that could not have coordinated with it. The corroborators carry the
  // independence weights — the slow channel, the operational stand-in for
  // alignment (§3). Pass corroborators with explicit `w_indep`, or with source
  // descriptors and let the book's independence() weigh them against `against`.
  const observeCorroboration = (source_id, domain, x, { corroborators = [], against = null, cursor, claim_id, payload } = {}) => {
    const at = cursor ?? clock++;
    // Two ways to declare independence. Explicit `w_indep` per corroborator is
    // taken as each one's independence FROM the source, and they are summed as a
    // mutually-independent set. Bare descriptors (author/feed/…) get the full
    // effective-independent count, which discounts intra-cluster collusion — the
    // sock-puppet guard (§10).
    const hasExplicit = corroborators.length > 0 && corroborators.every(c => c && c.w_indep != null);
    const indep_weight = hasExplicit
      ? corroborators.reduce((s, c) => s + clamp01(c.w_indep), 0)
      : effectiveIndependent(corroborators, against, independence);
    const weighted = corroborators.map(c => ({
      id: c && c.id,
      ...(c && c.w_indep != null ? { w_indep: clamp01(c.w_indep) } : {}),
    }));
    log.append({
      op: 'EVA', kind: 'corroboration_obs', source_id, domain,
      x: clamp01(x), corroborators: weighted, indep_weight, cursor: at, claim_id, payload,
    });
    maybeChangepoint(source_id, domain, 'corroboration', clamp01(x), at);
    return at;
  };

  // ── Channel three: revision (EVA) ──
  // r ∈ [−1,1] is the source's response when the record moves against a prior
  // claim: moving toward the disconfirmation is positive, doubling down is near
  // zero or negative with low variance, no structured response is high variance
  // around zero — the bullshitter again, seen in motion (§3).
  const observeRevision = (source_id, domain, r, { cursor, disconf_id, claim_pair, payload } = {}) => {
    const at = cursor ?? clock++;
    const rr = Math.min(1, Math.max(-1, Number(r) || 0));
    log.append({
      op: 'EVA', kind: 'revision_obs', source_id, domain,
      r: rr, cursor: at, disconf_id, claim_pair, payload,
    });
    maybeChangepoint(source_id, domain, 'revision', rr, at);
    return at;
  };

  // Project the trajectory at a cursor (§6). Pure delegate to projectCredence over
  // the book's own log.
  const project = (frame = {}) =>
    projectCredence(log, { ...frame, rules: { ...(frame.rules || {}), credence: rules } });

  const at = (source_id, domain, frame = {}) => credence(project(frame), source_id, domain);

  // DEF: the one closed verdict the system asserts — and only the bullshitter call,
  // because it needs no ground truth (§5, §8). O never gets a DEF: a SEEKER or LIAR
  // is an interval that tightens and never closes (§8, §13), so this loop asserts
  // strictly the BULLSHITTER class and nothing on the orientation axis. Returns the
  // verdicts newly asserted on this flush.
  const flushVerdicts = (frame = {}) => {
    const book = project(frame);
    const out = [];
    for (const [source_id, byDomain] of book) {
      for (const [domain, state] of byDomain) {
        const k = `${source_id}␟${domain}`;
        if (state.classification === CLASS.BULLSHITTER && !asserted.has(k)) {
          asserted.add(k);
          const ev = log.append({
            op: 'DEF', kind: 'credence_verdict',
            id: `credence:${source_id}:${domain}`,   // namespaced — never a graph entity id
            source_id, domain, verdict: CLASS.BULLSHITTER,
            M: state.M, cursor: clock,
          });
          out.push(ev);
        }
      }
    }
    return out;
  };

  return {
    log,
    rules,
    independence,
    observeCoherence,
    observeCorroboration,
    observeRevision,
    init,
    project,
    at,
    flushVerdicts,
    get clock() { return clock; },
    set clock(v) { clock = v; },
  };
};
