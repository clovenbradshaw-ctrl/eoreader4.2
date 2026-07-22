// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// bgSerial — the cooperative background queue: heavy post-ingest reads, ONE at a time.
//
// The problem this closes: recording a large source (a whole book) used to fire ALL of
// its heavy after-reads at once — the Bayesian-surprise turning-point spine (eotFor,
// O(budget · events)), the source summary, and a topline for each of its dominant
// figures (autoEntitySummaries, an O(events) log scan per figure). Fired together, and
// synchronously inside a render for the spine, they blocked the frame for as long as
// the whole document took to read — the tab "glitched out" the moment War and Peace
// landed. None of that work is on the critical path (the source is already recorded and
// on screen); it only fills in a reading a beat later.
//
// bgSerial runs those jobs THROUGH ONE QUEUE, one at a time, yielding to the browser
// between each — never a burst of parallel whole-document reads. `key` dedups a job that
// is already queued or in flight (so re-renders that ask for the same reading enqueue it
// once, not once per frame). Inert-safe under node (no requestIdleCallback → setTimeout).
export const installSchedule = (appCtx) => {
  const queue = [];
  const keys = new Set();     // in-flight/queued dedup keys — a job is enqueued once
  let draining = false;

  // Yield to the browser between jobs: an idle slice when one is offered (so the queue
  // never competes with layout/paint), a macrotask otherwise. setTimeout is the floor —
  // it is all node has, and it still lets the event loop turn between heavy reads.
  const yieldNext = (run) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => run(), { timeout: 300 });
    else setTimeout(run, 0);
  };

  const drain = () => {
    if (draining) return;                 // one job at a time — the whole point (never in parallel)
    const job = queue.shift();
    if (!job) return;
    draining = true;
    // The job body runs as its own microtask so a throw can't escape the scheduler; the
    // dedup key is held until it SETTLES (so a re-enqueue mid-run is skipped, not stacked),
    // then freed so a later genuine re-run (e.g. a reading invalidated by an edit) is allowed.
    Promise.resolve().then(job.fn)
      .catch(() => { /* a background read never breaks the queue */ })
      .finally(() => {
        if (job.key != null) keys.delete(job.key);
        draining = false;
        if (queue.length) yieldNext(drain);
      });
  };

  // bgSerial(fn, { key }) — run fn in the background, ONE job at a time, yielding between
  // jobs. `key` dedups: a job already queued or in flight under the same key is dropped, so
  // a burst of identical requests (repeated renders, a figure summarised twice) costs once.
  const bgSerial = (fn, { key = null } = {}) => {
    if (key != null && keys.has(key)) return;
    if (key != null) keys.add(key);
    queue.push({ fn, key });
    yieldNext(drain);
  };

  // How many jobs are waiting or in flight — for a surface that wants to say "still reading".
  const bgSerialPending = () => queue.length + (draining ? 1 : 0);

  Object.assign(appCtx, { bgSerial, bgSerialPending });
};
