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
  const frames = []; // { startSent, depth, bearer, support, strain }

  const current = () => frames[frames.length - 1] || null;

  const noteFirstPerson = (sentIdx = 0) => {
    const depth = depthAt(sentIdx) ?? 0;
    const cur = current();
    if (!cur || cur.depth !== depth) frames.push({ startSent: sentIdx, depth, bearer: null, support: 1, strain: 0 });
    else cur.support += 1;
  };

  const groundTeller = (_sentIdx = 0, { margin = 0.15 } = {}) => {
    const cur = current();
    if (!cur || cur.support < minRun || cur.bearer) return;
    const ranked = field(cur.startSent).filter((c) => (c.grounded ?? 0) > 0);
    if (!ranked.length) return;
    const [top, next] = ranked;
    if (next && (top.w - next.w) < margin) return;
    cur.bearer = top.id;
  };

  const tellerAt = (sentIdx = 0) => {
    const depth = depthAt(sentIdx) ?? 0;
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      if (f.startSent <= sentIdx && f.depth === depth) return f.bearer ? { id: f.bearer } : { held: true };
    }
    return { held: true };
  };

  const evaTeller = (_sentIdx = 0, holds = true) => {
    const cur = current();
    if (!cur) return;
    if (holds) { if (cur.strain > 0) cur.strain -= 1; }
    else if (++cur.strain > cur.support) cur.bearer = null;
  };

  return { noteFirstPerson, groundTeller, tellerAt, evaTeller, frames };
};
