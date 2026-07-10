// EO: CON·EVA·SYN(Entity,Field → Link,Atmosphere, Binding,Making) — coref-as-proposal
// Coreference as proposal — the talker's coref strength cashed in honestly.
//
// The talker is good at coreference: it binds "the trooper," "Sgt. Topps," "the
// off-duty officer," and "he" to one person across long spans and through
// paraphrase, better than the document SYN does. That capability is real. But
// inside the fact-check, letting the talker RESOLVE the endpoints of its own
// claim is the witness grading its own testimony (edge-grounding §5). So the
// talker may PROPOSE bindings and may never resolve them.
//
// The talker finds the candidate; the measuring readers confirm it on
// document-side evidence. The proposal enters as a talker-witnessed perception,
// deposited as capped, tagged conversational mass through the same
// reinforce-as-deposition path as any other talker contribution. A GROUNDING
// reader must corroborate before the merge commits: the geometric reader finding
// the two spans near in the document's own meaning space, or the distribution
// supporting it. The merge commits when a grounding reader seconds the proposal
// and HOLDS when none does. Tip, never originate — the proposal and the
// confirmation come from different readers with different witnesses, which is
// exactly what captures the talker's coref strength without the
// witness-grades-itself problem.

import { corefPerception, depositConversational, TALKER } from '../../turn/converse/index.js';
import { boundedNull } from '../../core/index.js';

// Nearness floor — the cosine two spans must clear, in the DOCUMENT's meaning
// space, for the geometric reader to second a proposed merge. Too loose merges
// two distinct people, too tight never corroborates a true paraphrase.
//
// This is the FALLBACK, not the boundary. The boundary is derived (geometricSecond
// below): the bounded-signal Born line over the document's own chance span-pairings
// (core/voidnull.boundedNull), with alpha the one knob. The constant rules only
// when no background is supplied — which, today, is always: the coref-corroboration
// holon is built but not yet wired into a live turn, so nothing hands it the
// document's span cosines yet. The derived path is in place and waiting for that
// caller; until then this reads as the constant, by construction.
export const NEARNESS_FLOOR = 0.6;

// The tolerated probability of seconding a chance span-pairing as a true coref —
// a policy, not a cosine. Matches the adjacency reader's budget (classify/phasepost).
export const NEARNESS_ALPHA = 0.05;

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
};

// Propose a coref. Deposit capped conversational warmth on both spans (the
// talker may warm the room) through the ordinary deposition path, and return the
// talker-witnessed proposal event. The deposit is warmth only — it can never
// clear the merge on its own; the subtract-and-check would strip it.
export const proposeCoref = ({ a, b, cursor = null, turn = null, field = null }) => {
  const event = corefPerception({ a, b, cursor, turn });
  if (field) depositConversational(field, event);
  return event;
};

// A grounding reader's "second", built from the geometric organ: the two spans
// are near in the document's own meaning space. Gated by `measuresMeaning` — under
// the hash organ the cosine is spelling, not meaning, so it cannot second and the
// proposal holds (§4/§10). Returns an async verdict the corroborator awaits.
//
// `background` is the document's chance span-pairings — the cosines of spans that
// are NOT coreferent, the field's samples of what nearness chance produces. When
// the caller supplies them the nearness line is derived from that distribution
// (boundedNull, leave-one-out this pair), so a true paraphrase clears whatever the
// field's own noise sets, not a number. Absent (the holon is unwired today) it
// falls back to NEARNESS_FLOOR.
export const geometricSecond = ({
  embedder, textA, textB, floor = NEARNESS_FLOOR, background = null, alpha = NEARNESS_ALPHA,
}) => async () => {
  if (!embedder?.measuresMeaning) return { seconds: false, by: 'geometric', reason: 'weak-embedder' };
  const [va, vb] = await Promise.all([embedder.embed(textA), embedder.embed(textB)]);
  const score = cosine(va, vb);
  const line = Array.isArray(background) && background.length
    ? boundedNull(background, { alpha, leaveOut: score, fallback: floor })
    : floor;
  return { seconds: score >= line, by: 'geometric', score, line };
};

// Corroborate a coref proposal. The talker PROPOSED; a grounding reader DISPOSES.
// `second` is the grounding reader's verdict (a function → { seconds, by, ... }),
// injected the same way the embedder is — the geometric reader, a distribution
// reader, or a fake under test. Commit a SYN merge only on a second, witnessed by
// THAT reader and never by the talker, so the committed identity is grounded and
// survives subtraction of talker mass by construction. Holds (no merge) when no
// reader seconds — and, critically, when the proposer is the only support.
//
// The returned `merge` is a SYN event the caller appends to the document log; the
// projection unifies the referents on the next fold (the subtract-and-check
// invariant then applies to the merge like any other committed reading). We do
// not append it here — the holon proposes the event; the caller owns the log.
export const corroborateCoref = async (proposal, { second, cursor = null } = {}) => {
  if (proposal?.witness !== TALKER || proposal?.kind !== 'coref-proposal')
    return { committed: false, reason: 'not-a-proposal' };
  const verdict = typeof second === 'function' ? await second(proposal) : { seconds: false, reason: 'no-reader' };
  if (!verdict?.seconds)
    return { committed: false, reason: verdict?.reason || 'no-corroboration', verdict };

  const merge = Object.freeze({
    op: 'SYN', kind: 'merge',
    from: proposal.a, to: proposal.b,
    witness: verdict.by || 'geometric',   // the grounding reader, never the talker
    source: 'coref-proposal',
    sentIdx: cursor ?? proposal.cursor ?? null,
  });
  return { committed: true, merge, verdict };
};
