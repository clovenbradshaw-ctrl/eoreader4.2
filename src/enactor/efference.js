// EO: INS(Link → Entity, Making) — efference copy
// enactor/efference.js — the efference copy (add-on 3 §3, §5).
//
// Output is not terminal. At the moment of COMMITMENT the core does two things:
// it emits the committed proposition to an output organ (to be rendered into the
// world), AND it generates an EFFERENCE COPY — the predicted sensed-consequence
// of that commit, indexed to it, and held outstanding. When the system later
// perceives its own output through the ordinary senses, the monitor (Phase 4)
// compares each sensed proposition against the outstanding copies: a match is the
// system sensing what it produced — me-ness — and is attenuated; a sensed prop
// with no matching copy is the world.
//
// Two kinds of prediction live in the core, and the difference is what draws the
// self/world line (§3):
//
//   PERCEPTUAL  what will the world send next? not indexed to any action.
//               a miss is surprise (the perceiver's strain). [predict/]
//   EFFERENCE   what will I sense as a consequence of THIS commit? indexed to a
//               specific commitment. a match is me-ness. [here]
//
// They are one forward model pointed two ways (§5): the engine predicts forward
// over propositions whether the proposition's source is the world or the self.
// The efference copy is that engine pointed at the self — and for now, the
// skeleton prediction is IDENTITY: committing P, I predict I will sense P return
// (deepened later, when the forward model can predict a transformed consequence,
// with no shape change — the copy is already a proposition-keyed prediction).
//
// The copy is MODALITY-BLIND: it carries the proposition's identity, not the
// organ that rendered it. Talking while gesturing is two commits and two copies
// flowing through one monitor, not two monitors (§4). One copy form, one self.

import { propKey } from './props.js';

export const EFFERENCE = 'efference';

// efferenceCopy — the predicted sensed-consequence of committing `prop`, indexed
// to `commitId`. `predicted` is the proposition's identity key: what the monitor
// will match an incoming sensed proposition against. `modality` is recorded only
// as provenance (which organ rendered it) — the monitor does NOT read it; it is
// here so the ONE-ME test can show two modalities flowing through one comparator.
export const efferenceCopy = (prop, commitId, { modality = null } = {}) =>
  Object.freeze({
    kind: EFFERENCE,
    commitId,
    predicted: propKey(prop),
    prop,
    modality,
    status: 'outstanding',
  });

// efferenceCopiesOf — the copies born from a gate's committed propositions, one
// per commit, indexed in commitment order (offset by `startId` so a later turn's
// commits do not collide with an earlier turn's outstanding copies). Each
// committed item carries its proposition on `.svo` (enactor/segment feeds
// the gate candidateProps); a bare proposition is accepted too.
export const efferenceCopiesOf = (committed, { startId = 0, modality = null } = {}) =>
  (committed || []).map((c, i) =>
    efferenceCopy(c?.svo ?? c, startId + i, { modality }));
