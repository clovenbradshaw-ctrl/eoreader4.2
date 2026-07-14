// EO: DEF·SEG(Lens,Network → Lens,Paradigm, Dissecting,Clearing) — route the web organ's intake decisions onto the judgment log
// The intake recorder — the sibling of judgments.js for the INTAKE grain (docs/the-web-organ-spec.md
// §10). The keep decision the web organ (organs/in/web.js) made — whether an open-web span earned
// custody in the log — is the highest-stakes same-vs-other cut in the system, so it lands as a typed,
// witnessed, revisable DEF on the same log as every other cut, never a scalar threshold at the front
// door. Kept beside judgments.js rather than in it because that file is at its size-ratchet pin; the
// two are one family (a pure FOLD of pre-computed decisions, never the organ itself — the layering is
// one-way, turn → core, exactly as the binding/reference/void recorders are).
//
// The four fates map onto the log (§4): COLLAPSED writes an intake DEF carrying its verdict (the
// span's relation to the log) and its witness — the sub-cut chain, the specific INDEPENDENT prior
// spans it acted on, the ruled-out other, and the provenance bundle (§6, via `provenanceFor`).
// REJECTED writes a DEF with a stated rejection reason (OFF_DIAGONAL for the confabulation shape, else
// UNSUPPORTED — the span could not be seated). ENCOUNTERED / NEAR-MISS write NO DEF: they are frontier
// lines (address + amplitude + seed), returned for the caller to log beside the tape, not about it.
//
// `of` is the span's ADDRESS, not its text (§1) — addresses are cheap, which is what lets a million
// passed-over spans cost the space of a photograph, and what makes two DEFs of one span supersede.

import { DEF_GRAINS as GRAINS, VERDICTS, isVerdict } from '../core/index.js';

const REJECTION_VERDICT = (reason) => (reason === 'off-diagonal' ? VERDICTS.OFF_DIAGONAL : VERDICTS.UNSUPPORTED);

// recordIntakeDefs(log, decisions, opts) → { defs, frontier }. `decisions` is a webOrgan() reading
// or its `.decisions` array; each collapsed/rejected decision is judged, each encountered/near-miss
// is returned as a frontier line. Best-effort and pure: no log → an empty fold, never a throw.
export const recordIntakeDefs = (log, decisions, { provenanceFor = null } = {}) => {
  if (!log) return { defs: [], frontier: [] };
  const list = Array.isArray(decisions) ? decisions : (Array.isArray(decisions?.decisions) ? decisions.decisions : []);
  const defs = [], frontier = [];
  for (const d of list) {
    if (!d || typeof d.address !== 'string') continue;
    const of = `intake:${d.address}`;
    if (d.fate === 'collapsed') {
      const provenance = typeof provenanceFor === 'function' ? (provenanceFor(d.address) || null) : (d.provenance || null);
      defs.push(log.judge({
        verdict: d.verdict, grain: GRAINS.INTAKE, of,
        witness: {
          address: d.address,
          cuts: Array.isArray(d.cuts) ? d.cuts : [],
          ...(d.ruledOut ? { ruledOut: d.ruledOut } : {}),
          priors: d.gain?.independentPriors || [],
          bridges: d.gain?.bridges || [],
          amplitude: d.amplitude ?? 0, phase: d.phase ?? 'assert',
          seed: d.seed ?? null, draw: d.draw ?? null,
          ...(d.contest ? { contest: d.contest } : {}),
          ...(provenance ? { provenance } : {}),
        },
      }));
    } else if (d.fate === 'rejected') {
      defs.push(log.judge({
        verdict: d.verdict && isVerdict(d.verdict) ? d.verdict : REJECTION_VERDICT(d.reason),
        grain: GRAINS.INTAKE, of,
        witness: {
          address: d.address, rejected: d.reason || 'rejected',
          ...(Array.isArray(d.cuts) && d.cuts.length ? { cuts: d.cuts } : {}),
        },
      }));
    } else {
      // encountered / near-miss — a frontier line, not a DEF (the selection leaves a trace, §8.3).
      frontier.push({ address: d.address, amplitude: d.amplitude ?? 0, phase: d.phase ?? 'assert', seed: d.seed ?? null, reason: d.reason, tier: d.fate });
    }
  }
  return { defs, frontier };
};
