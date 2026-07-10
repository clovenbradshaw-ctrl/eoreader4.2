// EO: INS(Kind → Entity, Making) — backend registry + createModel
// The model interface.
//
// A backend is a factory: createBackend(opts) → {
//   id, kind, isLoaded(),
//   load(onProgress) → Promise<void>,
//   phrase(messages, opts) → Promise<string>,        // the golden path — sample-then-return
//   propose?(messages, opts) → AsyncIterator<Dist>,  // OPTIONAL — the grounded-speech path
// }
//
// `phrase` is the sample-then-return contract: the backend draws the whole
// reply and hands back the string. It stays for the golden path and for any
// backend without logit access — the talker falls back to it transparently.
//
// `propose` is the new, OPTIONAL capability the grounded-speech gate drives
// (enactor/gate.js). It exposes the next-token distribution at the current
// position WITHOUT the backend sampling — the enactor drives sampling through
// the gate, one proposition past the committed edge, and rolls back what fails
// to ground. A backend that cannot expose its distribution simply omits
// `propose`; the talker detects its absence (model.propose == null) and uses
// phrase()+veto, byte-identical to today.
//
//   Dist = { tokens: [{ token, logprob }, …] }   // the distribution at this position
//
// The consumer drives the iterator with `.next(pick)`: it inspects the yielded
// Dist, chooses a token (the gate's sampler), and passes it back to commit that
// token and advance. No weights are touched — `propose` is a decode-path read.
//
// An embedder is a separate thing entirely:
//   { id, isWarm(), warm() → Promise, embed(text) → Promise<Float32Array> }
//
// The turn pipeline takes a model and an embedder by dependency injection.
// No turn code ever knows which backend it has.

const backends = new Map();

export const registerBackend = (name, factory) => {
  if (typeof factory !== 'function') {
    throw new TypeError(`registerBackend: factory must be a function`);
  }
  backends.set(name, factory);
};

export const availableBackends = () => [...backends.keys()];

export const createModel = (name, opts = {}) => {
  const factory = backends.get(name);
  if (!factory) throw new Error(`unknown backend: ${name}`);
  return factory(opts);
};
