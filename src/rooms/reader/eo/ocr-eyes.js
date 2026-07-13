// EO: SIG·INS(Void → Entity,Field, Making,Tending) — the OCR eyes: a pluggable set of witnesses
// The OCR eyes — a set of witnesses, loaded on demand, each reading the same scan.
//
// One engine is one eye. This is the registry of eyes the reader can open, and the policy for
// WHEN to open the expensive ones. Each eye returns the same shape — lines with a box and an
// optional confidence — so the quorum (organs/in/ocr-quorum.js) can reconcile them without
// knowing which model spoke. Adding a third eye (PaddleOCR, TrOCR, a cloud engine) is one entry
// in EYES; nothing downstream changes.
//
// TWO KINDS OF EYE, and the cost policy between them:
//   · deterministic (Tesseract) — no model download, reproducible, milliseconds. Always run.
//   · vlm (Florence-2 OCR) — ~200 MB of weights, seconds per page, but reads hands and hard
//     scans the deterministic eye cannot. Woken only when it is worth the spend.
//
// The default policy is 'auto': the cheap eye reads first, and the VLM eye is woken only when
// that first reading is DOUBTFUL — sparse, or low mean confidence — because that is exactly
// where a second witness changes the answer. A clean, confident scan stays a one-eye, no-download
// read; a smudged or handwritten one earns a second pair of eyes. 'all' forces every eye (maximum
// corroboration, for a record where accuracy outweighs latency); 'fast' is the deterministic eye
// alone. The policy governs SPEND, never correctness — which reading is believed is the quorum's
// call, decided by agreement, not by which eye happened to run.
//
// Browser-only glue: the CDN loads live here, thin and best-effort (one eye failing to load
// never breaks the others — the reader's "inject the library, bundle nothing" seam). The pure
// reconciliation and the belief math are organs/in/ocr-quorum.js, tested in Node.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm';

// The deterministic eye — Tesseract's line hierarchy, each line a box + a 0..100 confidence.
const tesseractEye = {
  id: 'tesseract',
  kind: 'deterministic',
  async run({ url, blob }, { onProgress } = {}) {
    const Tesseract = (await import(/* @vite-ignore */ TESSERACT_URL)).default;
    const say = typeof onProgress === 'function' ? onProgress : () => {};
    const { data } = await Tesseract.recognize(url || blob, 'eng', {
      logger: (m) => { if (m.status === 'recognizing text' && m.progress != null) say('Tesseract reading… ' + Math.round(m.progress * 100) + '%'); },
    });
    const lines = (data.lines || [])
      .map((ln) => ({ text: String(ln.text || '').trim(), bbox: ln.bbox, confidence: ln.confidence }))
      .filter((l) => l.text);
    // A single blob of text with no line boxes still counts as one line the quorum can hold.
    if (!lines.length && (data.text || '').trim()) lines.push({ text: data.text.trim(), bbox: null, confidence: data.confidence });
    return { engine: 'tesseract', lines };
  },
};

// The VLM eye — Florence-2's <OCR_WITH_REGION>, reusing the reader's already-warm vision organ
// (rooms/reader/eo/vision.js) so a scan and its scene reading share one model load and one cache.
const florenceEye = {
  id: 'florence2-ocr',
  kind: 'vlm',
  async run({ blob }, { getVision, onProgress } = {}) {
    if (typeof getVision !== 'function') return { engine: 'florence2-ocr', lines: [] };
    const vision = await getVision();     // loads ~200 MB of weights — only reached when this eye is woken
    if (!vision || typeof vision.ocr !== 'function') return { engine: 'florence2-ocr', lines: [] };
    const out = await vision.ocr(blob, { onProgress: (m) => { if (typeof onProgress === 'function' && m && m.status === 'progress' && m.progress != null) onProgress('Second eye (Florence-2) loading… ' + Math.round(m.progress) + '%'); } });
    return { engine: 'florence2-ocr', lines: out.lines || [] };
  },
};

// The registry — the eyes, in the order they are consulted. Deterministic first, VLM after.
export const EYES = [tesseractEye, florenceEye];

// Is the deterministic reading DOUBTFUL enough to be worth a second eye? A COST heuristic (when
// to spend the VLM), not a correctness bar: it reads a document but the mean line confidence is
// low, or it read almost nothing. Correctness is the quorum's job; this only decides the spend.
const looksDoubtful = (reading) => {
  const lines = reading?.lines || [];
  if (!lines.length) return true;                                   // read nothing — a hard scan
  const scored = lines.filter((l) => typeof l.confidence === 'number');
  if (!scored.length) return false;                                 // no scores to doubt
  const mean = scored.reduce((s, l) => s + l.confidence, 0) / scored.length;
  return mean < 80 || lines.length < 2;                             // shaky or sparse → corroborate
};

// readWithEyes(src, opts) → { readings:[{engine,lines}], eyes:[name], woke:[name] }
//
//   src        { blob, url } — the image, and an object URL for the deterministic eye.
//   opts.policy 'auto' (default) · 'all' · 'fast' — see the header.
//   opts.getVision  () → the warm Florence vision organ (rooms/reader/eo/vision.js), for the VLM eye.
//   opts.onProgress a status sink.
//
// Best-effort per eye: an eye that fails to load or throws is skipped, never fatal. Returns only
// the eyes that produced at least one line — the witnesses the quorum will reconcile.
export const readWithEyes = async (src, { policy = 'auto', getVision, onProgress } = {}) => {
  const readings = [];
  const woke = [];

  for (const eye of EYES.filter((e) => e.kind === 'deterministic')) {
    try { const r = await eye.run(src, { onProgress }); if (r && r.lines && r.lines.length) { readings.push(r); woke.push(eye.id); } }
    catch { /* this eye is unavailable — the others still read */ }
  }

  const cheap = readings[0] || null;
  const wakeVlm = policy === 'all' || (policy !== 'fast' && looksDoubtful(cheap));
  if (wakeVlm) {
    for (const eye of EYES.filter((e) => e.kind === 'vlm')) {
      try { const r = await eye.run(src, { getVision, onProgress }); if (r && r.lines && r.lines.length) { readings.push(r); woke.push(eye.id); } }
      catch { /* the VLM eye is best-effort too — the deterministic reading still stands */ }
    }
  }

  return { readings, eyes: readings.map((r) => r.engine), woke };
};
