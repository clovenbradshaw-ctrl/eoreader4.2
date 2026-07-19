// EO: SIG(Link → Void, Tending) — sync export: re-timed SRT
// srtPlan — the flagship deliverable: given a sync's anchors, produce a corrected/re-timed
// subtitle file. `timeSide`/`textSide` pick which source supplies the clock and which
// supplies the caption text (typically opposite sides — the audio/video's own timing, the
// caption file's own words) — a role-assignment choice the caller makes explicit, never
// guessed. Only anchors that survived the born-rule gate (core/sync/align.js) reach here,
// so a wrong-caption-file run — abstain:true, zero anchors — produces an empty plan, not a
// force-fit re-timing.
//
// PURE: this builds the plan (an ordered list of cues). renderSrt stringifies it, kept
// separate the way organs/out/publish/pdf.js splits pdfPlan from applyPdfPlan.

const fmtTime = (sec) => {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${pad(h)}:${pad(m)}:${pad(ss)},${pad(ms, 3)}`;
};

// anchors: core/sync/anchors.js AnchorRecord[]. timeSide/textSide ∈ 'A'|'B'.
export const srtPlan = (anchors, { timeSide = 'A', textSide = 'B', minDur = 0.8, maxDur = 6 } = {}) => {
  const rows = (anchors || [])
    .map((a) => ({ t: a[`t${timeSide}`], text: a[`text${textSide}`] }))
    .filter((r) => Number.isFinite(r.t) && r.text)
    .sort((a, b) => a.t - b.t);
  const cues = [];
  for (let i = 0; i < rows.length; i++) {
    const start = rows[i].t;
    const next = rows[i + 1] ? rows[i + 1].t : start + minDur;
    const end = Math.max(start + minDur, Math.min(start + maxDur, next));
    cues.push({ index: cues.length + 1, start, end, text: rows[i].text });
  }
  return cues;
};

export const renderSrt = (cues) =>
  (cues || []).map((c) => `${c.index}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}\n`).join('\n');
