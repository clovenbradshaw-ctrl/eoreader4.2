// EO: SIG·SEG(Field → Field, Clearing) — deixis frame (first-person teller channel)
// A first-person mention is a referent sighting by deixis: it names the current
// teller, not the nearest named figure. The frame records structural runs (depth
// changes, not speech-word lexicons), binds only when the ordinary grounded field
// clears a margin, and otherwise returns a held thread so callers emit no standing
// claim rather than borrowing salience from an addressee.
export const createDeixisFrame = ({
  depthAt = () => 0,
  field = () => [],
  minRun = 1,
} = {}) => {
  const frames = []; // { startSent, depth, bearer, bearerW, support, strain }

  // The frame FOR THIS DEPTH — the most recent one ever opened at it, wherever in the
  // history it sits. A dip to a nested depth and back (a short embedded quote closing)
  // must RESUME the outer run's own established bearer, not discard it and start over —
  // so this searches the whole stack by depth, not just the last-pushed frame.
  const frameAt = (depth) => {
    for (let i = frames.length - 1; i >= 0; i--) if (frames[i].depth === depth) return frames[i];
    return null;
  };

  const noteFirstPerson = (sentIdx = 0) => {
    const depth = depthAt(sentIdx) ?? 0;
    const cur = frameAt(depth);
    if (!cur) frames.push({ startSent: sentIdx, depth, bearer: null, support: 1, strain: 0 });
    else cur.support += 1;
  };

  const groundTeller = (sentIdx = 0, { margin = 0.15 } = {}) => {
    const cur = frameAt(depthAt(sentIdx) ?? 0);
    if (!cur || cur.support < minRun || cur.bearer) return;
    // Prefer the field AS OF THE RUN'S OWN OPENING — the moment the quote/section began is the
    // right anchor ("he thus began his tale" deposits the teller's own mass right there), and
    // staying there avoids drifting onto whatever the run's own content later happens to name
    // (a place the teller mentions partway through should never unseat the teller). Only fall
    // back to THIS call's own position when the opening truly had nothing grounded yet (a run
    // that started before any candidate had accrued mass at all) — so a run is not stuck
    // unground-able forever, but a run with a real anchor never drifts off it.
    const atOpen = field(cur.startSent).filter((c) => (c.grounded ?? 0) > 0);
    const ranked = atOpen.length ? atOpen : field(sentIdx).filter((c) => (c.grounded ?? 0) > 0);
    if (!ranked.length) return;
    const [top, next] = ranked;
    if (next && (top.w - next.w) < margin) return;
    // Keep the margin-clearing weight: it becomes the teller edge's coupling, so a
    // teller grounded against competition couples weaker than an uncontested one.
    cur.bearer = top.id; cur.bearerW = top.w;
  };

  const tellerAt = (sentIdx = 0) => {
    const depth = depthAt(sentIdx) ?? 0;
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      if (f.startSent <= sentIdx && f.depth === depth) return f.bearer ? { id: f.bearer, w: f.bearerW } : { held: true };
    }
    return { held: true };
  };

  const evaTeller = (sentIdx = 0, holds = true) => {
    const cur = frameAt(depthAt(sentIdx) ?? 0);
    if (!cur) return;
    if (holds) { if (cur.strain > 0) cur.strain -= 1; }
    else if (++cur.strain > cur.support) { cur.bearer = null; cur.bearerW = undefined; }
  };

  return { noteFirstPerson, groundTeller, tellerAt, evaTeller, frames };
};
