// EO — reader-app support (split from rooms/reader/app.js, 2026-07 compliance pass:
// "no god module — no file over ~250 lines", docs/architecture.md). Same holon.
// Model probes, the keep-alive guard, and the bounded record helpers.

// keepGuardAlive(guard, p, opts) → p, but while p is pending the no-progress `guard` is FED on a
// fixed interval, so an OPAQUE model call — formulateSearchQuery, the sense disambiguator — that
// streams no token and fires no step still reads as a sign of life. This is the fix for the false
// "the web lookup stalled" abort: the sense disambiguator alone is a 220-token temperature-0 decode
// (disambiguate.js), and it runs BEFORE the first hop's progress beat; on a modest device (or a first
// cold decode) that one call outlasts the 45s stall guard, which then aborts the turn mid-think and
// blames the web before a single page is ever fetched. A ping every `every` ms says "the engine is
// working" — the same sign-of-life the token / step / hop feeds carry for the phases that CAN report
// progress. It never masks a real hang: the interval is cleared the instant the call settles
// (`finally`), a Stop or a stall tripped elsewhere still settles the turn (a fed guard that is already
// tripped is a no-op), and a hard `maxMs` ceiling stops the feed so a genuinely stuck call is released
// to trip well past any real decode. Pure and injectable (`now`) so the cadence is unit-testable.
export const keepGuardAlive = (guard, p, { every = 8000, maxMs = 180000, now = () => Date.now() } = {}) => {
  const done = Promise.resolve(p);
  if (!guard || !every) return done;
  const t0 = now();
  const iv = setInterval(() => {
    if (guard.tripped?.() || (maxMs && now() - t0 >= maxMs)) { clearInterval(iv); return; }
    try { guard.feed?.(); } catch { /* feeding a settled guard is harmless */ }
  }, every);
  return done.finally(() => clearInterval(iv));
};

// probeModelAlive(m) → did the engine ANSWER a one-token decode inside the window? The wedge
// recovery below (resetWedgedLocalModel) used to pattern-match: 45s of no progress ⇒ the engine is
// dead ⇒ tear it down. But a no-progress stall has two very different causes — a genuinely wedged
// engine (a lost WebGPU device, a dead worker) and a merely SLOW one (a long prefill on a weak GPU,
// a CPU decode on a modest machine) — and tearing down a slow-but-alive engine forces a reload it
// never needed, then counts a "wedge" toward the downgrade ladder. Two slow turns in a row and the
// user's Llama pick silently became wllama: the model "didn't stay loaded". This probe is the
// evidence: a truly dead engine throws at once (its backend already dropped the handle) or never
// answers (the timeout catches it); a live one answers a 1-token draw in seconds. Resolves true/false,
// never throws. Exported for the tests; `timeoutMs` injectable for the same reason.
export const probeModelAlive = (m, { timeoutMs = 10000 } = {}) =>
  new Promise((resolve) => {
    let done = false;
    const settle = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => settle(false), timeoutMs);
    Promise.resolve()
      .then(() => m.phrase([{ role: 'user', content: 'ok' }], { maxTokens: 1, temperature: 0 }))
      .then(() => settle(true), () => settle(false));
  });

// The at-rest record is a ring buffer: it keeps at most REFLECTION_CAP notes so a long session's
// memory stays bounded (the oldest fall off the front). But the count we SURFACE — "… N notes so
// far" — has to be the running total the reading has ever voiced, NOT the retained buffer size, or
// it plateaus at the cap and reads as frozen the moment the session crosses it (the "200 notes"
// that never moves). So recordReflections mints ids and advances the tally from a monotonic `seen`
// that the trim never touches: the buffer caps, the count climbs, and ids stay unique past the cap
// (no repeated R201). `make(r)` builds the stored note from each fresh reflection; the id is added
// here. Returns the advanced `seen`. Pure and injectable (`cap`) so it is unit-testable without the
// engine — which matters because below the cap the bug is invisible; it only shows past REFLECTION_CAP.
export const REFLECTION_CAP = 200;
export const recordReflections = (record, seen, fresh, make, cap = REFLECTION_CAP) => {
  for (const r of fresh) { seen += 1; record.push({ id: `R${seen}`, ...make(r) }); }
  if (record.length > cap) record.splice(0, record.length - cap);
  return seen;
};

// The activity ledger is append-only — every discrete action (record, claim, conflict, search)
// gets its own line, in order. EXCEPT: a beat that repeats every idle pass — the at-rest
// reflection — would bury those actions under dozens of near-identical "Reflected at rest — N
// notes" lines (the idle governor fires every few seconds; a long lull over a big record voices a
// fresh batch each pass). So such a beat may COALESCE: when the tail entry already shares its
// kind, the tail is updated in place — new text/effect/time, its id kept so the surface's list
// keys don't churn — instead of a new line being appended. A run of idle passes collapses to ONE
// live line that ticks its count; the next DISCRETE action (which never opts into coalescing)
// appends past it, so the timeline still marks WHERE the lull sat. `mintId` is called only when a
// line is actually appended, so a coalesced beat never burns an id number. Pure and injectable
// (`cap`) so it is unit-testable without the engine — the same reason recordReflections is.
export const LOG_CAP = 400;
export const appendLog = (log, { kind, t, text, effect = '' }, mintId, { coalesce = false, cap = LOG_CAP } = {}) => {
  const tail = log[log.length - 1];
  if (coalesce && tail && tail.kind === kind) {
    tail.t = t; tail.text = text; tail.effect = effect;
  } else {
    log.push({ id: mintId(), t, kind, text, effect });
    if (log.length > cap) log.splice(0, log.length - cap);
  }
  return log;
};

