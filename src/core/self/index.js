// EO: NUL·SIG(Entity → Entity, Clearing,Tending) — the self/world line
// core/self/index.js — the self/world line + attenuation (add-on 3 §2/§3/§4/§6).
//
// The self is not a thing or a place in the system. It is the CLOSED LOOP where
// the system's prediction of its own output meets the return of that output and
// they match. Perception is the open loop: the world comes in, unauthored.
// Production-with-feedback is the closed loop: authored, and returning to its
// author. The me is the closure — and the closure is constituted HERE, in the
// core, modality-blind, by the one monitor's comparison.
//
// This module is the self/world line itself: the tags the monitor writes, the
// attenuation that follows a SELF tag, and the ONE self model the tags accumulate
// in. There is one self model, not one per output organ (§4): efference copies and
// sensed returns are propositions and the comparator is modality-blind, so one
// closure mechanism serves every modality — one loop, one me. Turning off an
// output organ removes a renderer, not a self.

export const SELF = 'self';            // a return matching an outstanding efference copy — me-ness
export const WORLD = 'world';          // a sensed prop matching no copy — the not-me, unbidden
export const SELF_MISMATCH = 'self-mismatch';   // a self-prediction diverged — the world pushed back

export const isSelf = (tag) => tag === SELF;

// A SELF-tagged return is ATTENUATED — sensed but not processed as news. The
// confirmation of one's own prediction carries no information the system did not
// already author (this is why you cannot tickle yourself). WORLD is news (the
// world, unbidden); a self-prediction MISMATCH is news too (the world interfering
// with an act).
export const attenuates = (tag) => tag === SELF;

// The one self model — the ledger the monitor writes its tagged observations to.
// Me-ness accumulates here: every SELF tag is one closure of prediction and
// return. Modality-blind and singular by construction; the monitor that feeds it
// is the only writer.
export const createSelfModel = () => {
  const observations = [];
  return Object.freeze({
    record(obs) { observations.push(obs); return obs; },
    observations: () => observations.slice(),
    tags: () => observations.map(o => o.tag),
    count: (tag) => observations.filter(o => o.tag === tag).length,
    get size() { return observations.length; },
  });
};
