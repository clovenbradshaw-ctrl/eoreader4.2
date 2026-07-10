// EO: INS·CON·SIG(Entity,Field → Field,Link,Network, Making·Binding·Tending) — the built habitat
// metabolism/commons.js — the APPRECIATING face of the shared pool. scarcity.js is the pool the
// population DEPLETES; this is the pool it BUILDS. That difference is the whole reframe: an arena
// is a resource you fight over, an ecosystem is a habitat you construct; an enclosure depletes, a
// commons appreciates. The reputation substrate holds the SOCIAL commons (mutual cooperation);
// this holds the EPISTEMIC one — the grounded work the population has already done.
//
// NICHE CONSTRUCTION (Odling-Smee & Laland): organisms remake the environment that selects them,
// and the next cohort inherits the world its ancestors built, not a fixed one. Here it is literal.
// A genome that grounds a claim CONTRIBUTES it to a shared store keyed by topic; a later turn whose
// work OVERLAPS a prior contribution is SUBSIDIZED — the grounding is already cached, so it costs
// less and lifts more. What the population contributes becomes the habitat the next cohort is
// selected in (ecological inheritance). A genome that enriches the commons improves EVERYONE's
// environment — which is how mutualism becomes adaptive instead of hand-coded. (Contributing bears
// a private cost for a shared benefit, so within one group a free-rider out-competes a contributor;
// the accountant that makes contributing PAY is multi-level selection — see demes.js.)
//
// A MAINTAINED DIFFERENCE. The commons DECAYS — cached grounding goes stale — so it is not a
// one-time gift but a standing structure the population must keep building or lose. The same
// "something to lose" the whole faculty turns on, lifted to the shared habitat. DNA-blind: a
// contribution is a topic key and a scalar strength, never document text, so the commons composes
// with the DNA-only ecology without smuggling content across the membrane.

// createCommons — the shared, appreciating store. `decay` is how much a topic's built strength
// carries to the next period (ecological inheritance with staleness); `cap` bounds any one topic;
// `saturation` sets how fast the subsidy saturates (the first grounding of a topic buys the most).
export const createCommons = ({ decay = 0.98, cap = 4, saturation = 3 } = {}) => {
  const store = new Map();   // topic key → accumulated grounded strength — the built habitat
  let age = 0;

  // subsidy(key) — how much the EXISTING commons lowers the cost / raises the lift of a turn on
  // this topic, in [0,1). Saturating, so the marginal contribution shrinks; ZERO on an empty
  // commons — an unbuilt habitat subsidizes nothing, which is the honest baseline every arena has.
  const subsidy = (key) => {
    const s = store.get(key) || 0;
    return s > 0 ? round(1 - Math.exp(-s / saturation)) : 0;
  };

  // contribute(key, quality) — deposit a grounded claim; the habitat appreciates on this topic.
  // Returns the subsidy now available there. Capped so no single topic can monopolize the pool.
  const contribute = (key, quality = 1) => {
    const q = Math.max(0, Math.min(1.5, Number(quality) || 0));
    store.set(key, Math.min(cap, (store.get(key) || 0) + q));
    return subsidy(key);
  };

  // step() — one period of ECOLOGICAL INHERITANCE: the commons decays (stale grounding) and the
  // enriched-but-fading habitat is handed to the next cohort. Deterministic — replay-stable.
  const step = () => {
    age += 1;
    for (const [k, v] of store) {
      const nv = round(v * decay);
      if (nv < 1e-3) store.delete(k); else store.set(k, nv);
    }
    return level();
  };

  // level() — how enriched the shared habitat is now: the mean built strength across topics,
  // normalized by the per-topic cap → [0,1]. This is the commonsLevel the room monitor
  // (reputation.js classifyRoom) reads: starve it and the instrument names the wrong room.
  const level = () => {
    if (store.size === 0) return 0;
    let sum = 0; for (const v of store.values()) sum += v;
    return round((sum / store.size) / cap);
  };

  return Object.freeze({
    contribute, subsidy, step, level,
    topics: () => store.size,
    total: () => { let s = 0; for (const v of store.values()) s += v; return round(s); },
    snapshot: () => Object.freeze(Object.fromEntries(store)),   // the habitat, for inheritance/inspection
    age: () => age,
  });
};

const round = (x) => Math.round(x * 1000) / 1000;
