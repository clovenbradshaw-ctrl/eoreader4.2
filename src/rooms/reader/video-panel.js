// EO: NUL·SEG(Field → Lens, Clearing,Dissecting) — video panel view-models (the video surface thread)
// The Listen surface's VIDEO leaf, as PURE builders. index.html is at its size cap, so the surface
// carries only a thin template pointer; the view-models — the activity strip, the shot cuts, the
// keyframe thumbnails, the dwell timeline, the picture-read status, and the moment-search result rows
// with their witnesses — are shaped here, from a source's persisted videoMeta + live _vis + the raw
// search candidates. No DOM — pinned by a browserless test the way scene.js's composition is.

const clockOf = (sec) => {
  const s = Math.max(0, sec || 0);
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};

const verdictWord = (v) => (v === 'present-still' ? 'holds' : v === 'void' ? 'empty' : '?');

// The suite of processing-option lenses — each a projection of the one read the viewer can flip on/off
// (the video twin of replay.html's "Reading against" switches). Default: all on.
export const VIDEO_LENSES = Object.freeze([
  { id: 'activity', label: 'Activity', hint: 'the motion envelope over time' },
  { id: 'shots', label: 'Shots', hint: 'the cuts that segment the clip' },
  { id: 'keyframes', label: 'Keyframes', hint: 'one settled frame per shot' },
  { id: 'dwells', label: 'Dwell', hint: 'where something persists, and for how long' },
]);

// videoStripVM(videoMeta, lenses) → the drawable reading: activity bars (tinted active/calm), the cut
// markers, the keyframe thumbnails, the dwell timeline, and the stat pills — each gated by its lens.
export const videoStripVM = (videoMeta, lenses = {}) => {
  const on = (id) => !lenses || lenses[id] !== false;
  const m = videoMeta || {};
  const dur = m.duration || 0;
  const pct = (t) => (dur > 0 ? Math.min(100, Math.max(0, (t / dur) * 100)) : 0);

  let bars = [];
  if (on('activity') && Array.isArray(m.peaks) && m.peaks.length) {
    let mx = 0, sum = 0; for (const p of m.peaks) { if (p.amp > mx) mx = p.amp; sum += p.amp; }
    mx = mx || 1; const mean = sum / m.peaks.length;
    bars = m.peaks.map((p) => ({ hPct: String(Math.max(3, Math.round((p.amp / mx) * 100))), bg: p.amp >= mean ? '#6D5EF5' : '#D7D3F2' }));
  }
  const cuts = on('shots') ? (m.shots || []).filter((sh) => sh.start > 0).map((sh) => ({ leftPct: String(pct(sh.start).toFixed(2)) })) : [];
  const keyframes = on('keyframes') ? (m.shots || []).map((sh, i) => ({
    i, t: sh.t, label: clockOf(sh.t), thumb: sh.thumb || null, hasThumb: !!sh.thumb,
  })) : [];
  const dwells = on('dwells') ? (m.dwells || []).map((dw) => ({
    leftPct: String(pct(dw.start).toFixed(2)),
    widthPct: String(Math.max(0.6, (dur > 0 ? ((dw.end - dw.start) / dur) * 100 : 0)).toFixed(2)),
    verdict: dw.verdict, t: dw.start, durLabel: `${verdictWord(dw.verdict)} ${clockOf(dw.dur)}`,
    bg: dw.verdict === 'present-still' ? '#C79A3A' : dw.verdict === 'void' ? '#D7D7DE' : '#B9B4E0',
  })) : [];

  const stats = [];
  stats.push({ label: 'Length', val: clockOf(dur) });
  stats.push({ label: 'Shots', val: String(m.shotCount || 0) });
  stats.push({ label: 'Cuts', val: String(m.cutCount || 0) });
  if (m.motionPct != null) stats.push({ label: 'Motion', val: `${Math.round(m.motionPct)}%` });
  if (m.trackCount) stats.push({ label: 'Moving things', val: String(m.trackCount) });

  return {
    bars, hasBars: bars.length > 0,
    cuts, keyframes, hasKeyframes: keyframes.length > 0,
    dwells, hasDwells: dwells.length > 0,
    stats, hasStats: stats.length > 0,
  };
};

// videoStatusVM(vis, videoMeta) → the picture-read banner + the CTA that (re-)runs the CV naming pass.
export const videoStatusVM = (vis, videoMeta) => {
  if (!vis && !videoMeta) return { show: false };
  const st = vis && vis.state;
  const shotN = videoMeta ? (videoMeta.shotCount || 0) : 0;
  let label = '', tone = '#6E6E78', bg = '#F2F2F6', busy = false, hasCta = false, ctaLabel = '';
  if (st === 'pending' || st === 'running') {
    busy = true; tone = '#5B4BE6'; bg = '#F1EFFE';
    label = `${vis.cv ? 'Naming what is on screen' : 'Reading the picture'}…${vis.pct != null ? ` ${vis.pct}%` : ''}`;
  } else if (st === 'error') {
    tone = '#B4402F'; bg = '#FBEAE6'; label = `Picture read failed — ${vis.reason || 'error'}`; hasCta = true; ctaLabel = 'Try again';
  } else if (st === 'stopped') {
    tone = '#8A6D2F'; bg = '#FBF4E6'; label = 'Picture read stopped'; hasCta = true; ctaLabel = 'Resume';
  } else {
    const named = (vis && vis.named) || 0;
    if (vis && vis.cv && named) { tone = '#1E8A50'; bg = '#E7F6EC'; label = `Named ${named} of ${shotN} shot${shotN === 1 ? '' : 's'}`; hasCta = true; ctaLabel = 'Re-name'; }
    else { label = `Read ${shotN} shot${shotN === 1 ? '' : 's'} — name what's on screen to search the picture`; hasCta = true; ctaLabel = 'Name the shots'; }
  }
  return { show: true, label, tone, bg, busy, hasCta, ctaLabel };
};

// momentResultsVM(results) → render-ready rows: the in/out range, the verdict badge (match vs the
// honest maybe), the witness (which words / concepts / OCR, from which witness), and the seek time.
export const momentResultsVM = (results) => (results || []).map((r) => ({
  range: `${clockOf(r.span[0])}–${clockOf(r.span[1])}`,
  t: r.span[0],
  isMatch: r.verdict === 'match',
  badge: r.verdict === 'match' ? 'match' : 'maybe',
  badgeFg: r.verdict === 'match' ? '#1E8A50' : '#8A6D2F',
  badgeBg: r.verdict === 'match' ? '#E7F6EC' : '#FBF4E6',
  why: r.why || '',
  durLabel: (r.dur >= 1) ? clockOf(r.dur) : `${(r.dur || 0).toFixed(1)}s`,
  witness: (r.witness || []).slice(0, 5).map((w) => ({
    kind: w.kind, text: String(w.text || '').slice(0, 70), witness: w.witness || '',
  })),
}));

export { clockOf as videoClock };
