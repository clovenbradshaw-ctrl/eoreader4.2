// EO: EVA·CON·DEF(Link,Field,Entity → Lens,Void, Binding,Tracing,Clearing) — rebind + source veto + type law (§7)
// write/witness.js — the witness: rebind, source veto, type law. (SPEC §7)
//
// The witness is INDEPENDENT of the renderer (it never renders). It runs after each
// spurt and owns every factual bind. Four steps:
//
//   7a. OUTBOUND MEMBRANE — bind the surface back to hashIds (coref on return).
//       The output's referents must bind to the union of Sites whose integrals were
//       handed in (`expect`, §5). A referent that was never handed in is suspect —
//       "his mother" at a cursor whose handed integral was Gregor is flagged
//       immediately. Legible audit and tight witness are the same annotation.
//   7b. SOURCE VETO — every FACTUAL claim is checked against the source spans.
//       Ungrounded claims are RETRACTED. Exafference can anchor; me cannot (§8).
//   7c. TYPE LAW (§8) — me-content organizes structure, never certifies. The
//       witness READS provenance as a type: only EXAFFERENT source (the perceiver
//       door, current ingest) may anchor a claim. The model's own spurt is
//       reafferent and is not of the witnessing type, so it can never ground itself,
//       and prior-self text reloaded as "source" (read-back-of-prior-self) cannot
//       either. The rule is not enforced as a policy; it falls out of the type.
//   7d. PAY THE RETRACTION — a forced retraction is LOGGED and SURFACED, never
//       hidden (§10). The append-only log, the void, and the type law are what keep
//       the learning signal from being counterfeit.
//
// Surf-the-spurt does STRUCTURE; veto-the-source does TRUTH (§7). Re-surfing the
// model's own production (spurt.js, §6) is admissible — it is reafference re-entering
// as perceivable — but every factual claim in that production is still vetoed against
// the source, because the production is the model's output, not evidence.

import { canWitness, classify, EXAFFERENCE } from '../../core/index.js';
import { flowVerdict } from '../../surfer/flow/index.js';

// The default grounding threshold: a claim is grounded when enough of its content
// words are carried by a single source span. The production grounder is
// src/ground/veto.js (edge-grounding); this lexical floor is the honest,
// dependency-free default, injectable via opts.grounded for the real veto.
const GROUND_OVERLAP = 0.5;

// witness — run the four steps over one spurt. Returns the audit the loop logs and
// surfaces (§7d); it mutates nothing (append-only is the caller's to honor).
//
//   spurtText  the model's collapsed beat (one or more sentences)
//   expect     Set<hash> — the Sites handed in at the cursor (§5)
//   source     the grounded spans for this beat ([{ text, idx, prov? }]); a span
//              with reafferent provenance cannot anchor (the type law)
//   fold       the running fold — its referents are the rebind vocabulary
//   opts.flow  { prior, prevStep, doc } — OPTIONAL flow-witness (src/flow). When
//              wired, the beat is also scored against the corpus flow prior and the
//              verdict is attached to the audit as `flow`. A flow flag is surfaced
//              (like a source finding), NOT a hard fail — `ok` is unchanged by it.
//              Absent (no prior/doc) → `flow: null` and behavior is identical.
export const witness = (spurtText, expect, source = [], fold, opts = {}) => {
  const text = String(spurtText ?? '');
  const expected = expect instanceof Set ? expect : new Set(expect || []);

  // 7a — outbound membrane: surface → hashId, flag any referent ∉ expect.
  const { bound, surfaces } = rebind(text, fold);
  const flagged = bound.filter(h => !expected.has(h));

  // 7c — the type law: only EXAFFERENT source may anchor (§8). A span that arrives
  // reafferent (prior-self text reloaded as "source") is filtered OUT of the
  // anchoring set here — not by a policy check, by its type.
  const anchors = (source || []).filter(s => canWitness(s?.prov ?? null) || classify(s?.prov ?? null) === EXAFFERENCE);
  const inadmissibleSource = (source || []).filter(s => !anchors.includes(s));

  // 7b — source veto: every factual claim checked against the exafferent anchors.
  const ground = opts.grounded || groundedClaim;
  const claims = claimsOf(text);
  const retractions = [];
  const kept = [];
  for (const claim of claims) {
    if (ground(claim, anchors, opts)) kept.push(claim);
    else retractions.push(Object.freeze({ claim, reason: 'ungrounded — no exafferent span carries it' }));
  }

  // 7d — pay the retraction: the record is the surfaced void, logged beside the kept
  // beat (suppress-never-erase). `ok` is the witness verdict for this beat.
  const ok = flagged.length === 0 && retractions.length === 0;

  // FLOW WITNESS (§7, optional) — does this beat MOVE the way the corpus moves? The
  // flow verdict is a structural finding, not a truth veto: a lurch (delta > p90) or
  // an off-manifold step (residual > p95) is surfaced for EVA to weigh, never a hard
  // fail. It rides beside the source veto so the same surface carries both. Off by
  // default: no prior wired ⇒ flow === null and `ok` is exactly the veto verdict.
  const flow = opts.flow ? flowVerdict(opts.flow.prior, opts.flow.prevStep, opts.flow.doc, opts.flow) : null;

  return Object.freeze({
    bound: Object.freeze(bound),
    surfaces: Object.freeze(surfaces),
    flagged: Object.freeze(flagged),
    kept: Object.freeze(kept),
    retractions: Object.freeze(retractions),
    inadmissibleSource: Object.freeze(inadmissibleSource.map(s => s?.idx ?? null)),
    ok,
    flow: flow ? Object.freeze(flow) : null,
  });
};

// rebind — the outbound membrane (contract.mjs, generalized). For each referent the
// fold knows, test its head and pronoun surfaces against the text; a hit that is in
// the frontier binds to that hash. The real witness uses the perceiver's coref
// posterior; this is the honest first cut the kernel proved.
export const rebind = (text, fold) => {
  const bound = [];
  const surfaces = [];
  if (!fold || !fold.refs) return { bound, surfaces };
  for (const [hash, r] of fold.refs) {
    const forms = [r.head, r.pron?.subj, r.pron?.obj].filter(Boolean);
    const hit = forms.find(f => wordHit(text, f));
    if (hit && (fold.has ? fold.has(hash) : true)) { bound.push(hash); surfaces.push(hit); }
  }
  return { bound, surfaces };
};

// ── claim grounding (the default lexical veto) ───────────────────────────────
// A claim is grounded when a single source span carries at least GROUND_OVERLAP of
// its content words. Function words are stripped; short claims (a clause of pure
// function words) ground trivially. The production path swaps in ground/veto.js.
export const groundedClaim = (claim, spans, { overlap = GROUND_OVERLAP } = {}) => {
  const cw = contentWords(claim);
  if (cw.length === 0) return true;
  for (const s of spans || []) {
    const sw = new Set(contentWords(s.text ?? s));
    const hits = cw.filter(w => sw.has(w)).length;
    if (hits / cw.length >= overlap) return true;
  }
  return false;
};

export const claimsOf = (text) =>
  String(text ?? '')
    .split(/(?<=[.!?])\s+|;\s+/)
    .map(s => s.trim())
    .filter(Boolean);

const STOP = new Set(('a an the of to in on at by for with and or but nor so yet as is was were are be been being it its he she they them his her their him this that these those not no into out over under up down off then than now once would will to do did had has have').split(' '));
const contentWords = (s) =>
  String(s ?? '').toLowerCase().match(/[a-z']{3,}/g)?.filter(w => !STOP.has(w)) || [];

const wordHit = (text, form) => {
  const f = String(form ?? '').trim();
  if (!f) return false;
  const re = new RegExp(`\\b${escapeRe(f)}\\b`, 'i');
  return re.test(text);
};
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
