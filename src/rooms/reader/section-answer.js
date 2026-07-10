// EO: SEG·DEF(Field,Link → Field,Lens, Dissecting,Making) — section headings by field-shift
// sectionAnswer — mechanically impose section headings on a flat prose answer, by watching the
// ENTITY FIELD shift across its sentences. This is the same move detectStructure (app.dc.js) makes
// on a read document — a field-shift boundary detector with a mechanically-derived label — applied
// here to the answer the machine just wrote. The point of the metacognition-steers-the-shape change
// is that the talker writes grounded prose it is good at and never formats; the machine imposes the
// structure. Headings become an OUTPUT of the reading, not an instruction to the writer — so even a
// small model that will not emit "##" gets a sectioned answer.
//
// Dependency-light on purpose: the core is a PURE function over an already-parsed doc ({sentences,
// log}), so the reader can hand it the engine's own parse (this.E.parseText) with no heavy raw
// import graph. Labels are PLACEHOLDER-FIRST but EARNED: a segment is headed only when a discourse
// `lead` lands in it or a term is genuinely concentrated there; a summary/conclusion tail with no
// distinctive topic gets no heading and flows on as prose. The Born-salient figure per segment
// (surfer/metacognition.meaningfulness) is the documented upgrade path for richer labels.

const STOP = new Set('the a an of to in on for and or but with without into from by as at it its this that these those they them he she his her him you your we our i me my is are was were be been being do does did has have had not no so then than also more most such which who whom whose what when where why how using used use their there here across through than one first over about into out up down off away back many much few some any all both each other another same different new old great good better best'.split(' '));

const contentToks = (s) => (String(s || '').toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).filter((t) => !STOP.has(t));
const titleCase = (s) => String(s || '').trim().replace(/\s+/g, ' ').split(' ').slice(0, 5)
  .map((w) => w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
const labelOk = (s) => { const t = String(s || '').trim(); return t.length >= 3 && /[A-Za-z]/.test(t) && !STOP.has(t.toLowerCase()); };

// sectionAnswer(doc, {leads}) → { sectioned, sections:[{heading, level, sentences:[...] }] }.
// `doc` is a parsed doc: { sentences:[...], log:{snapshot()} }.
export const sectionAnswer = (doc, { leads = [], minPerSection = 2, minSections = 2, dissim = 0.55 } = {}) => {
  const sents = (doc && doc.sentences) || [];
  const N = sents.length;
  const single = () => ({ sectioned: false, sections: [{ heading: null, level: 0, sentences: sents.slice() }] });
  // Too short to section — one idea, a tight paragraph (the emergent ideal for a pointed answer).
  if (N < minPerSection * minSections) return single();

  // 1) entity set per sentence, from the log's INS/CON/SIG events.
  const events = doc.log && doc.log.snapshot ? doc.log.snapshot() : (doc.log && doc.log.events) || [];
  const perSent = sents.map(() => new Set());
  for (const e of events) {
    if (e.sentIdx == null || e.sentIdx < 0 || e.sentIdx >= N) continue;
    for (const id of [e.id, e.src, e.tgt].filter(Boolean)) perSent[e.sentIdx].add(id);
  }

  // 2) boundary strength at each seam: 1 − overlap between the windows either side. The field
  //    shifting and staying shifted across a small window is a topic boundary (detectStructure's
  //    fallback math, windowed for short answers).
  const W = Math.max(1, Math.round(N / 5));
  const win = (lo, hi) => { const s = new Set(); for (let k = Math.max(0, lo); k < Math.min(N, hi); k++) for (const e of perSent[k]) s.add(e); return s; };
  const seams = [];
  for (let i = 1; i < N; i++) {
    const L = win(i - W, i), R = win(i, i + W);
    if (L.size < 1 || R.size < 1) continue;
    let x = 0; for (const e of L) if (R.has(e)) x++;
    const d = 1 - x / Math.sqrt(L.size * R.size);
    if (d >= dissim) seams.push({ i, d });
  }
  seams.sort((a, b) => b.d - a.d);

  // 3) choose boundaries: strongest first, keep a min gap so no section is shorter than minPerSection.
  const bounds = [];
  const ok = (i) => (i >= minPerSection) && (N - i >= minPerSection) && bounds.every((b) => Math.abs(b - i) >= minPerSection);
  for (const s of seams) if (ok(s.i)) bounds.push(s.i);
  bounds.sort((a, b) => a - b);
  if (!bounds.length) return single();

  // 4) build segments and label each. The FIRST segment is the direct lead — no heading.
  const cuts = [0, ...bounds, N];
  const leadOrder = (leads || []).map((l) => String(l).toLowerCase());
  const leadSet = new Set(leadOrder);
  // Global content-term frequency, so a per-segment term can be scored for DISTINCTIVENESS — the
  // recurring subject ("Lindbergh") is frequent everywhere and loses to the concentrated topic.
  const segToks = sents.map((s) => contentToks(s));
  const global = new Map();
  for (const ts of segToks) for (const t of ts) global.set(t, (global.get(t) || 0) + 1);

  const sections = [];
  for (let s = 0; s < cuts.length - 1; s++) {
    const lo = cuts[s], hi = cuts[s + 1];
    const segSents = sents.slice(lo, hi);
    let heading = null;
    if (s > 0) {
      const segFreq = new Map();
      for (let k = lo; k < hi; k++) for (const t of segToks[k]) segFreq.set(t, (segFreq.get(t) || 0) + 1);
      let best = null, bestScore = -Infinity, bestLead = false, bestDistinct = 0;
      for (const [t, c] of segFreq) {
        if (!labelOk(t)) continue;
        const rest = (global.get(t) || 0) - c;
        const distinct = c / (1 + rest);
        const lead = leadSet.has(t);
        const score = (lead ? 100 - leadOrder.indexOf(t) : 0) + distinct + c * 0.01;
        if (score > bestScore) { bestScore = score; best = t; bestLead = lead; bestDistinct = distinct; }
      }
      // Only label when EARNED: a discourse lead, or a genuinely concentrated term (distinct ≥ 1.5).
      // A summary tail with no distinctive topic gets no heading — placeholder ≠ junk.
      if (best && (bestLead || bestDistinct >= 1.5)) {
        // Grow to a 1–2 word phrase only from a RARE modifier (global freq ≤ 1): "magnetic compass"
        // survives, but the recurring subject never gets prepended.
        const m = new RegExp('\\b([a-z][a-z\'-]{3,})\\s+' + best + '\\b', 'i').exec(segSents.join(' '));
        const mod = m && m[1].toLowerCase();
        heading = titleCase(mod && !STOP.has(mod) && (global.get(mod) || 0) <= 1 ? mod + ' ' + best : best);
      }
    }
    sections.push({ heading, level: s === 0 ? 0 : 2, sentences: segSents });
  }
  return { sectioned: sections.some((x) => x.heading), sections };
};

// sectionText(text, {parse, leads}) → sectionAnswer over a parse of `text`. `parse` is injected
// (the reader passes this.E.parseText, already loaded); absent, parse/pipeline.js is lazy-imported
// so nothing heavy loads until it is actually needed (and never in the browser, where parse is fed).
export const sectionText = async (text, { parse = null, ...opts } = {}) => {
  const p = parse || (await import('../../perceiver/parse/pipeline.js')).parseText;
  const doc = p(String(text || ''), { docId: 'answer', totalRead: true });
  return sectionAnswer(doc, opts);
};

// renderSectioned(result) → markdown string with "## Heading" before each labelled segment.
export const renderSectioned = (result) => {
  if (!result || !result.sections) return '';
  return result.sections.map((sec) => {
    const body = sec.sentences.map((s) => String(s).trim()).join(' ');
    return sec.heading ? `## ${sec.heading}\n${body}` : body;
  }).join('\n\n');
};
