// EO — canonical per-source processing-stage derivation (comprehension roadmap: canonical counts
// and processing states). A source's processing state today lives on several independently-evolved
// signals — entCount (null while a deferred background parse is still building referents),
// transcription (an audio/video source's separate speech-to-text pass), and coverage (what an
// import extractor could and could not read). This does not change what those signals mean; it
// gives them one name a user actually reads, so a source is never shown as unconditionally "Ready"
// while its own reading disagrees.

export const SOURCE_STAGE_TONE = Object.freeze({
  structuring: { fg: '#8A6D2F', bg: '#FBF4E6', bd: '#F0DFC0' },
  reading: { fg: '#5B4BE6', bg: '#F1EFFE', bd: '#DED8FD' },
  ready: { fg: '#1E8A50', bg: '#E7F6EC', bd: '#CDEBD8' },
  'ready-limited': { fg: '#9A6B12', bg: '#FBF1DA', bd: '#F0DFC0' },
  failed: { fg: '#B23A2E', bg: '#FBE9E6', bd: '#F3CFC8' },
});

// What a coverage receipt (import-file.js / picture.js) says was left out — the "ready with
// limitations" grounds. Reads only fields those receipts actually set; returns null when the
// receipt reports a complete, unremarkable read.
const coverageGaps = (src) => {
  const cov = src && src.coverage;
  if (!cov) return null;
  const notes = [];
  const addAll = (arr) => { if (Array.isArray(arr)) for (const x of arr) if (x) notes.push(String(x)); };
  // cov.dropped already carries a readable account of any textless/undecoded pages (import-file.js
  // fromPdf/fromVideo etc. compose it), so reading it is enough — no need to re-derive from the
  // raw page-number arrays those receipts also carry.
  if (cov.complete === false) addAll(cov.dropped);
  if (cov.disagreements) notes.push(`${cov.disagreements} line${cov.disagreements === 1 ? '' : 's'} where OCR readers disagreed`);
  if (cov.video && cov.video.complete === false) addAll(cov.video.dropped);
  return notes.length ? notes : null;
};

// deriveSourceStage(src) → { stage, label, detail, fg, bg, bd }. Pure — reads only fields already
// present on the source object, so it is safe to call on every render.
export const deriveSourceStage = (src) => {
  if (!src) return { stage: 'structuring', label: 'Structuring', detail: '', ...SOURCE_STAGE_TONE.structuring };
  const asr = src.transcription || null;
  if (asr && asr.state === 'error') {
    const detail = `Speech transcription failed${asr.reason ? ` — ${asr.reason}` : ''}. The waveform is available; retry the transcript.`;
    return { stage: 'failed', label: 'Failed', detail, ...SOURCE_STAGE_TONE.failed };
  }
  if (asr && (asr.state === 'pending' || asr.state === 'running')) {
    const detail = asr.state === 'running'
      ? `Transcribing the signal${asr.pct != null ? ` — ${asr.pct}%` : ''}…`
      : 'Queued for transcription…';
    return { stage: 'reading', label: 'Reading', detail, ...SOURCE_STAGE_TONE.reading };
  }
  // An image's picture is already on the record by the time this ever runs (it lands before its
  // reading, app/image.js) — imageRead names what's still in flight: recognising the picture's
  // text or scene, the way `asr` names an audio clip's still-in-flight transcript above.
  const imgRead = src.imageRead || null;
  if (imgRead && imgRead.state === 'error') {
    const detail = `Reading the picture failed${imgRead.reason ? ` — ${imgRead.reason}` : ''}. The image is available; retry the read.`;
    return { stage: 'failed', label: 'Failed', detail, ...SOURCE_STAGE_TONE.failed };
  }
  if (imgRead && (imgRead.state === 'pending' || imgRead.state === 'running')) {
    const detail = imgRead.state === 'running' ? 'Reading the picture for text and a scene description…' : 'Queued to read the picture…';
    return { stage: 'reading', label: 'Reading', detail, ...SOURCE_STAGE_TONE.reading };
  }
  if (src.entCount == null) {
    return { stage: 'structuring', label: 'Structuring', detail: 'Extracting referents and structure from the text…', ...SOURCE_STAGE_TONE.structuring };
  }
  const gaps = coverageGaps(src);
  if (gaps) return { stage: 'ready-limited', label: 'Ready with limitations', detail: gaps.join('; '), ...SOURCE_STAGE_TONE['ready-limited'] };
  return { stage: 'ready', label: 'Ready', detail: '', ...SOURCE_STAGE_TONE.ready };
};

export const installSourceStage = (appCtx) => {
  const sourceStage = (snId) => deriveSourceStage(appCtx.sourceBySn(snId));
  Object.assign(appCtx, { sourceStage });
};
