// EO: NUL·SIG(Entity → Entity, Clearing,Tending) — leased store + shredder
// The archive — where a parsed-but-not-salient research reading is STORED, not lost — and the
// shredder that eventually destroys it.
//
// A curiosity walk (research.js, deep-research.js) PARSES every page it fetches, then leashes: a
// page whose Born overlap with the question falls below the floor has STRAYED, and a strayed page
// is not grounded — it never becomes a source, the answer never stands on it, and the provenance
// never lists it (docs/deep-research.md, "the strayed page never reached the ground"). That gate
// is right: an off-topic page should not appear in the sources. But until now the strayed reading
// was thrown away the instant it strayed, and the reading had already HAPPENED — the fetch, the
// parse, the surprise/saliency measurement all cost work, and a strayed page is often on the very
// EDGE of the question. The next hop, or a sibling facet, can make it salient after all; discarding
// it means re-reading from scratch if the walk circles back.
//
// The archive is the middle ground: parse every source, but if it is not salient to the discourse
// do NOT store it as a source — file the READING in the archive instead. Each stored reading is
// leased, and when the lease runs out the reading goes to the SHREDDER — deleted. The lease is set
// by HOW MUCH CONTENT was processed, not a flat clock: a big page read and set aside is worth
// keeping longer than a snippet (more work sunk into it, more chance it pays back), so the lease
// scales with the reading's character count (shredTtl), floored so even a snippet gets a real grace
// window and capped so nothing survives the shredder forever.
//
// Pure and clock-injectable. `makeArchive({ clock })` takes `now` from an injected clock (default
// Date.now), so a walk stamps DETERMINISTIC shred times in a unit test and real ones in the browser
// — the same discipline the rest of the turn holon keeps (offline-testable, no wall clock baked in).
// `shredExpired(entries, at)` is the same shredder over a plain array, for a session that files
// readings from many walks in one archive and runs the shredder on a timer.

// shredTtl(chars, opts) → milliseconds a reading of `chars` characters survives in the archive
// before it goes to the shredder. The lease is set by CONTENT PROCESSED, not a flat time: linear
// in the characters actually read, floored so even a snippet gets a real grace window, capped so
// one huge page can't outlast the shredder forever.
//   msPerChar   how long a single character of processed content buys — the content→time rate.
//   min / max   the lease floor and ceiling (default 30s … 1h).
export const shredTtl = (chars, { msPerChar = 40, min = 30_000, max = 3_600_000 } = {}) => {
  const c = Math.max(0, Number(chars) || 0);
  return Math.min(max, Math.max(min, Math.round(c * msPerChar)));
};

// readingText(reading) → the parsed prose an archive entry is measured by. Accepts the same shapes
// a walk holds: a doc ({ text }), an admitted result ({ doc: { text } }), or a bare string. Falls
// back to the source excerpt a snippet-only result still carries — the same accessor the walks read.
const readingText = (reading) =>
  String(reading?.text ?? reading?.doc?.text ?? reading?.web?.excerpt ?? reading?.excerpt ??
         (typeof reading === 'string' ? reading : '') ?? '');

const docIdOf = (reading) => reading?.docId ?? reading?.doc?.docId ?? null;
const webOf   = (reading) => reading?.web ?? reading?.doc?.web ?? null;

// makeArchive({ clock, ...ttlOpts }) → a small store for strayed readings, with a shredder. `clock()`
// supplies `now` (default Date.now) so shred times are deterministic under an injected clock. The ttl
// options (msPerChar/min/max) flow straight into shredTtl. Not a durable store — an in-memory archive
// the walk fills and the caller drains; a session persists it by reading `entries()` and re-filing them.
export const makeArchive = ({ clock = () => Date.now(), ...ttlOpts } = {}) => {
  const items = [];
  const now = () => { try { const t = Number(clock()); return Number.isFinite(t) ? t : 0; } catch { return 0; } };

  // file(reading, meta) — take a strayed reading OUT of the discourse and INTO the archive, leased
  // for shredTtl(its content length). `meta` records WHY it was set aside (the thread, the surprise
  // and saliency that failed the leash, the reason) so a later audit can see what was filed and why.
  const file = (reading, meta = {}) => {
    const text = readingText(reading);
    const chars = text.length;
    const ttlMs = shredTtl(chars, ttlOpts);
    const t = now();
    const web = webOf(reading);
    const entry = {
      docId: docIdOf(reading),
      title: meta.title ?? web?.title ?? '',
      url: meta.url ?? web?.url ?? web?.final_url ?? '',
      text,                                   // the reading itself — stored so a circle-back re-uses it
      chars, ttlMs, archivedAt: t, shredAt: t + ttlMs,
      ...meta,
    };
    items.push(entry);
    return entry;
  };

  // shred(at) — run the SHREDDER: destroy every reading whose lease has run out (shredAt ≤ at) and
  // return the entries shredded, so a caller can log what a pass reclaimed. Mutates in place.
  const shred = (at = now()) => {
    const shredded = [];
    for (let i = items.length - 1; i >= 0; i--) if (items[i].shredAt <= at) shredded.push(items.splice(i, 1)[0]);
    return shredded;
  };

  // nextShred() → the soonest shred time (a single timer can be armed to it), or null if empty.
  const nextShred = () => items.reduce((m, e) => (m == null || e.shredAt < m ? e.shredAt : m), null);

  return {
    file, shred, nextShred,
    entries: () => items.slice(),
    get size() { return items.length; },
  };
};

// shredExpired(entries, at) → { kept, shredded } — the SHREDDER over a PLAIN array, non-mutating.
// A session that files the readings from many walks in one archive runs it with this: `kept` is the
// readings whose lease still runs, `shredded` the ones destroyed at time `at`.
export const shredExpired = (entries, at) => {
  const kept = [], shredded = [];
  for (const e of Array.isArray(entries) ? entries : []) ((e && e.shredAt <= at) ? shredded : kept).push(e);
  return { kept, shredded };
};

// nextShredTime(entries) → the soonest shred time across a plain archive array, or null if empty —
// the timestamp a session arms its single shredder timer to.
export const nextShredTime = (entries) =>
  (Array.isArray(entries) ? entries : []).reduce((m, e) => (e && (m == null || e.shredAt < m) ? e.shredAt : m), null);
