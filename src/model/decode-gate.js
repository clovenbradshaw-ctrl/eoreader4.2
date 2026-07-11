// EO: SEG(Field → Field, Dissecting) — one decode at a time per local engine
// The decode gate — a per-backend serializer for generation calls.
//
// Both local runtimes are PHYSICALLY serial: web-llm drives one generation loop on one
// WebGPU engine, wllama one llama.cpp context in one WASM instance. Neither supports a
// second createCompletion while the first is decoding — a collision interleaves KV-cache
// state or throws deep inside the runtime. The app is *mostly* one-turn-at-a-time, but
// overlap happens in real sessions: a stopped/stalled turn whose decode outlives its turn
// (the orphan keeps the engine), a turn started in another topic while one is in flight,
// the at-load warmup racing a fast first question. Each was an intermittent "it just
// hangs / it broke this time" the moment two calls met the engine together.
//
// The gate is a plain promise chain: enter() runs `run` after every earlier entrant has
// SETTLED (resolved or rejected — a failed decode must never wedge the queue), and hands
// back run's own promise so the caller keeps its result and its error. Callers that abort
// while queued check their signal again on entry and skip the decode entirely, so a
// stopped turn never holds the engine it was waiting for.
//
// Pure and tiny so it unit-tests without a runtime: order, error isolation, and the
// skip-on-abort discipline are the whole contract.

export const makeDecodeGate = () => {
  let tail = Promise.resolve();
  return (run) => {
    const prev = tail;
    const turn = (async () => { await prev.catch(() => { /* an earlier decode's fault is its caller's, not ours */ }); return run(); })();
    tail = turn.catch(() => { /* keep the chain alive past a rejection */ });
    return turn;
  };
};
