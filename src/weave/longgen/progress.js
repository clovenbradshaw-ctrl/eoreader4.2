// EO: EVA·SIG(Network,Field → Lens, Tracing,Binding) — progress fold, how far
// progress — how far along the output is toward its skeleton, as a pure fold
// (docs/paragraph-at-a-time.md). Message 1's "how far along," under the essay
// doc's discipline: workspace-state, NEVER a percentage bar ("Progress is not a
// bar … Show the workspace, not a percentage"). A beat is COVERED when an accepted
// paragraph cites its anchor span; the rest are PENDING. The fold is pure on
// (skeleton, accepted) and re-projects identically. "3 of 5" is honest here in a
// way it is not inside the essay organ — the denominator is the user's own stated
// demand, fixed unless they change it, so it does not move mid-walk.

// progressAgainst — fold the accepted paragraphs onto the skeleton. `accepted` are
// the paragraph records the composer keeps ({ beat, sources, closes, … }).
export const progressAgainst = (skeleton = null, accepted = []) => {
  if (!skeleton) return null;
  const cited = new Set((accepted || []).flatMap(p => p.sources || []));
  const beats = skeleton.beats.map(b => Object.freeze({
    id: b.id, topic: b.topic, kind: b.kind,
    state: cited.has(b.idx) ? 'covered' : 'pending',
  }));
  const covered = beats.filter(b => b.state === 'covered').length;
  const landed = (accepted || []).some(p => p.closes);

  // Section-grain progress: a section is complete when every paragraph in it is
  // covered. The paragraph count is the fine grain; the section is the coarse one
  // — both shown, so the workspace reads as sections-with-their-paragraphs.
  const sections = (skeleton.sections || []).map((sec) => {
    const secBeats = skeleton.beats.filter(b => b.sectionId === sec.id);
    const cov = secBeats.filter(b => cited.has(b.idx)).length;
    return Object.freeze({
      id: sec.id, heading: sec.heading, topic: sec.topic,
      planned: secBeats.length, covered: cov,
      complete: secBeats.length > 0 && cov >= secBeats.length,
    });
  });

  return Object.freeze({
    planned: skeleton.planned,
    covered,
    remaining: Math.max(0, skeleton.planned - covered),
    // The workspace, not a bar: the topics still owed, named — a visible debt.
    pending: Object.freeze(beats.filter(b => b.state === 'pending').map(b => b.topic)),
    beats: Object.freeze(beats),
    sections: Object.freeze(sections),
    sectionsComplete: sections.filter(s => s.complete).length,
    landed,
    // The honest-floor read carried from the skeleton, so a caller can say "the
    // sources cover 3 of the 5 you asked for" rather than pad to five.
    short: skeleton.short,
    shortfall: skeleton.shortfall,
    // Shape-aware "done": every planned beat covered. This is the completion the
    // emergent loop lacks — a stop against the demand, not just local saturation.
    complete: skeleton.planned > 0 && covered >= skeleton.planned,
  });
};
