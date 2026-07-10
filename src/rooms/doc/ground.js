// EO: CON·EVA(Field,Link → Link,Lens, Binding) — the grounding check
// doc/ground.js — the grounding check every edit passes through.
//
// A sentence entering a document must bind to something already in the Record —
// a recorded span you have actually read — or be marked as the writer's own
// (grounded to the void). The check is the app's default grounding: a
// content-word overlap. If enough of the edit's content words appear together in
// one recorded span, the edit is grounded to that span; otherwise it "leaves the
// record" and can only be kept as void, marked honestly.
//
// This is deliberately the same shape as the reader's own grounding rule ("the
// default grounding is a content-word overlap; function-word claims ground
// trivially") so a document and an answer are held to one standard.

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
  'and', 'or', 'but', 'nor', 'so', 'yet', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'am', 'it', 'its', 'this', 'that', 'these', 'those', 'they', 'them',
  'their', 'he', 'she', 'his', 'her', 'we', 'our', 'you', 'your', 'i', 'me', 'my',
  'not', 'no', 'do', 'does', 'did', 'has', 'have', 'had', 'will', 'would', 'can',
  'could', 'may', 'might', 'must', 'shall', 'should', 'if', 'then', 'than', 'there',
  'here', 'which', 'who', 'whom', 'what', 'when', 'where', 'how', 'all', 'any',
  'some', 'each', 'into', 'out', 'up', 'down', 'over', 'about', 'more', 'most',
]);

// The content words of a string — lowercased tokens of length ≥ 3 that are not
// function words. Numbers count (a figure is content), apostrophes are kept.
export const contentWords = (s) =>
  (String(s || '').toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) || [])
    .filter((w) => w.replace(/['’-]/g, '').length >= 3 && !STOP.has(w));

// Check a candidate sentence against the Record. `record` is an array of
// { id, text, srcId, host } recorded spans. Returns the grounding result:
//   { grounded:true, overlap, frac, span, srcId, host } when it binds, else
//   { grounded:false, overlap, frac, span }  (best near-miss carried for context)
// Grounded means at least half of the edit's content words, and no fewer than
// two, appear together in a single recorded span — a claim standing on a real
// passage, not scattered coincidence across the corpus.
export const groundText = (text, record, opts = {}) => {
  const minFrac = opts.minFrac ?? 0.5;
  const minHits = opts.minHits ?? 2;
  const words = contentWords(text);
  const want = new Set(words);
  if (!want.size) return { grounded: false, overlap: 0, frac: 0, span: null };

  let best = null;
  for (const r of record || []) {
    const rset = new Set(contentWords(r.text));
    if (!rset.size) continue;
    let hit = 0;
    for (const w of want) if (rset.has(w)) hit++;
    const frac = hit / want.size;
    if (!best || frac > best.frac || (frac === best.frac && hit > best.hit)) best = { frac, hit, span: r };
  }
  if (!best) return { grounded: false, overlap: 0, frac: 0, span: null };

  const grounded = best.frac >= minFrac && best.hit >= minHits;
  return grounded
    ? { grounded: true, overlap: best.hit, frac: Number(best.frac.toFixed(3)), span: best.span, srcId: best.span.srcId || null, host: best.span.host || null }
    : { grounded: false, overlap: best.hit, frac: Number(best.frac.toFixed(3)), span: best.span };
};

// The block-grounding a change carries once reviewed: a grounded change commits
// as a source block (bound to its span); an ungrounded one, accepted as void,
// commits as the writer's own words, marked.
export const blockGrounding = (checkResult) =>
  checkResult && checkResult.grounded
    ? { kind: 'source', span: checkResult.span, srcId: checkResult.srcId || null, host: checkResult.host || null, overlap: checkResult.overlap }
    : { kind: 'void' };
