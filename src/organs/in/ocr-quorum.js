// EO: DEF·EVA·REC(Lens → Lens,Paradigm, Binding,Tracing,Composing) — OCR quorum: many eyes, one elected reading, a learned rule
// The OCR quorum — a set of witnesses reading one image, reconciled.
//
// A single OCR engine is one eye: it reads a scan and ASSERTS a line, and there is no
// second look to catch the letter it misread. This module is the second look — and the
// third. Several engines (Tesseract, a VLM's OCR, any adapter that returns lines with
// boxes) read the SAME image; each is an independent WITNESS. Where they AGREE, the
// reading is corroborated and believed; where they DISAGREE, the line is flagged rather
// than silently trusting whichever ran first. This is exactly the move the ear already
// makes for a waveform (organs/in/hear.js resolveTranscript): a reading is an assertion,
// not a fact, so it is BELIEVED — and the truth-witness that grounds the belief is not
// the model's own confidence but the AGREEMENT of independent eyes.
//
// The whole reconciliation lives in the Interpretation column of the cube — the three
// operators this fires are the request said plainly, "DEF EVA REC":
//
//   · DEF (assert)   — each eye asserts its reading; the quorum DEFs the elected one.
//   · EVA (evaluate) — the eyes' competing frames are weighed; which reading is best,
//                       and where they disagreed (the shaky lines a reader must check).
//   · REC (learn)    — a rule is learned from the page itself: how often each eye agreed
//                       with the consensus — its RELIABILITY — so "which eye is best" is
//                       measured, never hand-declared.
//
// Model-free and DOM-free on purpose. It reads only the shape an eye returns — lines with
// text, a box, and an optional confidence — so the tests drive it in Node exactly as the
// browser does. The eyes themselves (the CDN model loads) live in the reader
// (rooms/reader/eo/ocr-eyes.js); this is the pure brain they feed.
//
// TWO PRINCIPLES it holds, from which the rest follows:
//
//   • The ELECTED reading is one an eye ACTUALLY produced — never a per-character
//     Frankenstein stitched from three eyes. A reading is a witness's assertion; a line
//     no eye ever read is a line no witness will stand behind. The quorum PICKS; it does
//     not fabricate.
//   • CONSENSUS is the truth-witness. Two independent eyes agreeing is the OCR analog of
//     the waveform grounding a heard word — the primary signal. The engine's own
//     confidence is only a weaker second witness (a model sure of a letter the pixels
//     barely support is not trusted). A line ONE eye saw has no corroboration at all —
//     the corroboration bar is two (enactor/ground/corroboration.js) — so it is kept as a
//     real passage but believed only on that one eye's say-so.

import { CONVERSATIONAL_CAP } from '../../turn/converse/index.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const isNum = (x) => typeof x === 'number' && isFinite(x);

// A single eye is one of the two witnesses corroboration requires. So a reading no second
// eye ever saw is believed at most HALF as far as a corroborated one — one voice of the two
// the bar asks for (enactor/ground/corroboration.js: "the bar is TWO"). Not a tuned knob:
// the ratio IS the definition of corroboration, read off the same place the rest of the
// engine reads it.
const SINGLE_EYE_CEIL = 0.5;

// A GROUND-TRUTH eye is not a reading of pixels at all — it is the document's OWN declared
// text (a PDF's born-digital text layer, handed straight from the file's content stream).
// It stands outside the corroboration bar: the source is not a witness that could misread
// itself, so a line the text layer carries is believed at the witness cap even when no OCR
// eye looked. When an OCR eye DOES look and reads something different, that divergence is
// still flagged (an EVA on the log) — a "searchable PDF" whose hidden text layer is a stale
// OCR is exactly the case a reader wants surfaced — but the divergence does not lower the
// belief of the document's own text below what the source itself declares.

// ── boxes — the geometry every eye speaks, in one shape ──────────────────────────
//
// An eye may hand back a Tesseract box ({x0,y0,x1,y1}), a W3C xywh array ([x,y,w,h]), or a
// VLM quad ([x1,y1,x2,y2,x3,y3,x4,y4] — the four corners Florence-2's OCR_WITH_REGION
// returns). All reduce to one rectangle {x0,y0,x1,y1}; a line with no box at all reads as
// null and simply cannot be spatially aligned (it becomes its own single-eye cluster).
export const normBox = (b) => {
  if (!b) return null;
  if (Array.isArray(b)) {
    if (b.length === 4) { const [x, y, w, h] = b.map(Number); return isFinite(x) && isFinite(y) ? { x0: x, y0: y, x1: x + Math.max(0, w || 0), y1: y + Math.max(0, h || 0) } : null; }
    if (b.length === 8) { const xs = [b[0], b[2], b[4], b[6]].map(Number), ys = [b[1], b[3], b[5], b[7]].map(Number); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; }
    return null;
  }
  const { x0, y0, x1, y1 } = b;
  if (!isNum(x0) || !isNum(y0)) return null;
  return { x0, y0, x1: isNum(x1) ? x1 : x0, y1: isNum(y1) ? y1 : y0 };
};

const xywh = (r) => r ? [r.x0, r.y0, Math.max(0, r.x1 - r.x0), Math.max(0, r.y1 - r.y0)] : null;
const area = (r) => r ? Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0) : 0;
const unionBox = (rs) => rs.reduce((a, r) => !r ? a : !a ? { ...r } : { x0: Math.min(a.x0, r.x0), y0: Math.min(a.y0, r.y0), x1: Math.max(a.x1, r.x1), y1: Math.max(a.y1, r.y1) }, null);

// The overlap of two boxes as a FRACTION of the smaller — a fact about whether two eyes
// looked at the same patch of the page, not a chosen IoU bar. 1.0 means one box sits wholly
// inside the other (the same line, one eye's box a touch tighter); 0 means they are
// disjoint. Intersection over the SMALLER (not the union) so a short word inside a long
// line still reads as "the same place", which is what alignment needs.
const overlap = (a, b) => {
  if (!a || !b) return 0;
  const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (ix <= 0 || iy <= 0) return 0;
  const inter = ix * iy;
  const denom = Math.min(area(a), area(b)) || inter;
  return denom > 0 ? inter / denom : 0;
};

// ── text — the norm the vote reads ───────────────────────────────────────────────
//
// Two eyes "agree" when they read the same LINE, not the same bytes: case, runs of
// whitespace, and the punctuation OCR most often trips on do not make two readings a
// disagreement. Lowercased, non-alphanumerics collapsed to single spaces, trimmed. The
// ELECTED surface keeps its original casing and punctuation (see below) — this norm is only
// the ballot the vote is counted on.
const normLine = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// A confidence in [0,1]: an eye may report 0..100 (Tesseract) or 0..1, or nothing (a VLM
// that offers no per-line score). >1 is read as a percent; absent stays null so the belief
// function knows the difference between "sure it's zero" and "did not say".
const normConf = (c) => {
  if (!isNum(c)) return null;
  const v = c > 1 ? c / 100 : c;
  return clamp01(v);
};

// ── ocrBelief — a reading is an assertion, held below authored text ──────────────
//
// The coupling one reconciled line earns, in [0, cap]. Structurally the ear's hearingBelief
// (organs/in/hear.js §2a), with AGREEMENT standing where the waveform stood: the truth is
// what the independent eyes converge on, so consensus leads and the model's own confidence
// only tempers. The blend is the ear's, unchanged — truth 0.65, model 0.35 — because the
// story is the same one, told about pixels instead of pressure waves.
//
//   agreement  0..1  the fraction of the eyes at this line that back the elected reading
//                    (the consensus witness — primary, the "truth" analog). null if a lone eye.
//   confidence 0..1  the elected eye's own score (the weaker second witness). null if unsaid.
//   eyes       int   how many eyes read this line at all.
//
// A line only ONE eye saw has no consensus to ground it — the corroboration bar is two — so
// however sure that eye was, it is capped at the single-eye ceiling (the veto analog of a
// heard word that never cleared its own noise null). Whatever the witnesses say, it tops out
// at the witness ceiling CONVERSATIONAL_CAP: an OCR line is SEEN, never authored.
export const ocrBelief = ({ agreement = null, confidence = null, eyes = 1, groundTruth = false } = {}, cap = CONVERSATIONAL_CAP) => {
  const a = isNum(agreement)  ? clamp01(agreement)  : null;   // consensus (the truth, 1st witness)
  const c = isNum(confidence) ? clamp01(confidence) : null;   // the eye's score (2nd witness)
  // The document's own declared text — the source, not a witness. Believed at the witness cap
  // however many pixel-eyes did or did not corroborate it (a divergence is flagged, not deducted).
  if (groundTruth) return +cap.toFixed(4);
  let w;
  if (eyes >= 2) {
    if (a != null && c != null) w = 0.65 * a + 0.35 * c;   // consensus leads, confidence tempers
    else if (a != null)         w = a;                     // agreement alone
    else if (c != null)         w = 0.85 * c;              // confidence alone — extra doubt, no consensus
    else                        w = 0.7;                   // unmeasured — a neutral seen prior
  } else {
    // One eye — no second witness. Believed only as far as its own confidence, and never past
    // the single-eye ceiling: one voice of the two corroboration asks for.
    w = Math.min(c != null ? c : 0.7, SINGLE_EYE_CEIL);
  }
  return +(cap * clamp01(w)).toFixed(4);
};

// ── alignment — which readings are the SAME physical line ─────────────────────────
//
// Each eye returns its own list of lines; the same line of the page appears once per eye,
// at (nearly) the same box. Alignment groups those into CLUSTERS — one cluster per physical
// line, holding every eye that read it. The grouping is MUTUAL NEAREST NEIGHBOUR over box
// overlap (the same parameter-free primitive hear.js folds name variants with, and
// perceiver/equivalence.js formalises): line a from eye A and line b from eye B fold into
// one cluster only when b is a's best-overlapping line in B AND a is b's best-overlapping
// line in A — and they overlap at all. No IoU threshold we invented; a line whose nearest
// neighbour in another eye is a mere coincidence overlaps it weakly and is out-competed by
// the true match, or overlaps nothing and stays its own cluster. Lines from the SAME eye
// never fold — one eye reads a physical line once. Lines on DIFFERENT PAGES never fold
// either — a physical line lives on one page, and a PDF's geometry repeats page to page
// (the box at (72,100) on p.1 is not the box at (72,100) on p.5), so page is part of the
// address, not just the box.
const alignReadings = (items) => {
  const n = items.length;
  const parent = items.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { parent[find(i)] = find(j); };

  // best[i][eye] = the index of eye `eye`'s line that overlaps items[i] most (and > 0).
  const bestInEye = items.map((it) => {
    const best = new Map();     // eye → { j, ov }
    items.forEach((jt, j) => {
      if (jt.eye === it.eye) return;             // same eye — never a match for itself
      if (jt.page !== it.page) return;           // a physical line lives on ONE page
      const ov = overlap(it.box, jt.box);
      if (ov <= 0) return;
      const cur = best.get(jt.eye);
      // Ties break on the closer box centre, then lower index — deterministic.
      if (!cur || ov > cur.ov + 1e-9) best.set(jt.eye, { j, ov });
    });
    return best;
  });

  for (let i = 0; i < n; i++) {
    for (const [eye, { j }] of bestInEye[i]) {
      const back = bestInEye[j].get(items[i].eye);
      if (back && back.j === i) union(i, j);      // mutual nearest → same physical line
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(i); }
  return [...groups.values()];
};

// ── the election — DEF the reading, EVA the frames, REC the rule ─────────────────
//
// resolveOcr(readings, opts) — the whole quorum, pure.
//
//   readings  [{ engine, lines: [{ text, bbox, confidence?, page? }] }]  — one entry per eye.
//   opts.page the default page for lines that carry none.
//
// Returns:
//   { eyes, blocks, reliability, best, disagreements, ledger }
//     eyes          the engine names that read, in the order given.
//     blocks        the reconciled lines in reading order, each ready for assembleDocument,
//                   its ref carrying { confidence, belief, agreement, eyes, elected,
//                   witnesses, disagreement }.
//     reliability   [{ engine, reliability, checked, agreed }] sorted best-first — the REC
//                   rule, measured only over lines where a SECOND eye existed to check
//                   against (a line one eye saw teaches nothing about who to trust).
//     best          the most reliable engine (the DEF of "which is best"), or null when no
//                   line had two eyes to compare.
//     disagreements the clusters where the eyes did not all agree — the EVA worklist.
//     ledger        the DEF/EVA/REC events, for the audit and for ocr.js to lay on the log.
export const resolveOcr = (readings = [], { page = 1 } = {}) => {
  const eyes = readings.map((r) => r.engine);
  // Flatten to one list of eye-tagged lines, keeping each eye's reading order for tie-breaks.
  // `truth` rides each line from its eye's `groundTruth` flag — the born-digital text layer
  // is the document's own text, not a pixel reading (see SINGLE_EYE_CEIL's neighbour above).
  const items = [];
  readings.forEach((r) => {
    const truth = !!r.groundTruth;
    (r.lines || []).forEach((ln, idx) => {
      const text = String(ln.text ?? '').trim();
      if (!text) return;
      items.push({ eye: r.engine, text, norm: normLine(text), conf: normConf(ln.confidence), box: normBox(ln.bbox), page: ln.page ?? page, ord: idx, truth });
    });
  });

  const clusters = alignReadings(items).map((idxs) => idxs.map((i) => items[i]));

  // Order the physical lines by PAGE first, then top-to-bottom, then left-to-right, by the
  // union box of each cluster — reading order, so the assembled document flows as the pages
  // do. (Alignment is page-scoped, so a cluster is on one page; __page reads it off any
  // member.) Clusters with no geometry keep their arrival order after the boxed ones on the
  // same page.
  const clusterBox = (c) => unionBox(c.map((m) => m.box));
  clusters.forEach((c, i) => { c.__box = clusterBox(c); c.__i = i; c.__page = c[0]?.page ?? 1; });
  clusters.sort((a, b) => {
    if (a.__page !== b.__page) return a.__page - b.__page;
    if (a.__box && b.__box) return (a.__box.y0 - b.__box.y0) || (a.__box.x0 - b.__box.x0) || (a.__i - b.__i);
    if (a.__box) return -1; if (b.__box) return 1; return a.__i - b.__i;
  });

  const blocks = [];
  const disagreements = [];
  // Per-eye tallies for the REC rule: over clusters with ≥2 eyes, how often each eye's
  // reading matched the one the quorum elected.
  const checked = new Map(eyes.map((e) => [e, 0]));
  const agreed  = new Map(eyes.map((e) => [e, 0]));

  clusters.forEach((cluster, i) => {
    const eyeCount = new Set(cluster.map((m) => m.eye)).size;

    // The ballot: group the readings by their norm, and let the group backed by the most
    // eyes win. Ties fall to the group whose readings the eyes were most confident of, then
    // to the larger raw count, then lexical — a stable, content-based order.
    const byNorm = new Map();
    for (const m of cluster) {
      const g = byNorm.get(m.norm) || { norm: m.norm, members: [], confSum: 0, eyeSet: new Set() };
      g.members.push(m); g.eyeSet.add(m.eye); g.confSum += (m.conf ?? 0);
      byNorm.set(m.norm, g);
    }
    const groups = [...byNorm.values()].sort((x, y) =>
      (y.eyeSet.size - x.eyeSet.size) || (y.confSum - x.confSum) || (y.members.length - x.members.length) || (x.norm < y.norm ? -1 : 1));

    // Election within a physical line, most confident first, ties to the earliest-listed eye,
    // then reading order — a stable, content-based pick of an ACTUAL eye's reading.
    const pick = (members) => members.slice().sort((x, y) =>
      ((y.conf ?? -1) - (x.conf ?? -1)) || (eyes.indexOf(x.eye) - eyes.indexOf(y.eye)) || (x.ord - y.ord))[0];

    // The elected SURFACE — an actual eye's reading (original casing + punctuation). When a
    // GROUND-TRUTH eye (the born-digital text layer) read this line, IT is elected: the
    // document's own bytes are not put to a vote against OCR eyes that might share a misread.
    // Otherwise the winning group's most-confident reading wins. Never a stitched line.
    const truthMembers = cluster.filter((m) => m.truth);
    const groundTruth = truthMembers.length > 0;
    const elected = groundTruth ? pick(truthMembers) : pick(groups[0].members);
    const winner = byNorm.get(elected.norm);
    const agreement = eyeCount > 0 ? winner.eyeSet.size / eyeCount : null;

    const disagreement = eyeCount >= 2 && winner.eyeSet.size < eyeCount;
    const belief = ocrBelief({ agreement: eyeCount >= 2 ? agreement : null, confidence: elected.conf, eyes: eyeCount, groundTruth });

    // Tally the rule: every eye present in a ≥2-eye cluster is CHECKED; those whose reading
    // fell in the winning group AGREED with the consensus.
    if (eyeCount >= 2) {
      for (const eye of new Set(cluster.map((m) => m.eye))) {
        checked.set(eye, (checked.get(eye) || 0) + 1);
        if (winner.eyeSet.has(eye)) agreed.set(eye, (agreed.get(eye) || 0) + 1);
      }
    }

    const witnesses = cluster
      .slice()
      .sort((x, y) => eyes.indexOf(x.eye) - eyes.indexOf(y.eye))
      .map((m) => ({ engine: m.eye, text: m.text, confidence: m.conf != null ? +m.conf.toFixed(3) : null, agreed: m.norm === winner.norm }));

    blocks.push({
      text: elected.text,
      bbox: xywh(cluster.__box),
      page: elected.page,
      kind: 'line',
      ref: {
        confidence: elected.conf != null ? +(elected.conf * 100).toFixed(1) : null,
        belief,
        agreement: agreement != null ? +agreement.toFixed(3) : null,
        eyes: eyeCount,
        elected: elected.eye,
        witnesses,
        disagreement,
        ...(groundTruth ? { groundTruth: true } : {}),
      },
    });

    // A line is worth flagging when the eyes split, or when a lone PIXEL eye saw it with no
    // second witness. A lone GROUND-TRUTH line is NOT flagged: the born-digital text layer is
    // the document itself, not an uncorroborated pixel reading — there is nothing to review.
    // But a ground-truth line the OCR eyes DISAGREED with is still flagged (that divergence is
    // exactly the "searchable PDF with a stale text layer" a reader wants to see).
    if (disagreement || (eyeCount < 2 && !groundTruth)) {
      disagreements.push({ index: blocks.length - 1, kind: eyeCount < 2 ? 'single-eye' : 'split', elected: elected.eye, readings: witnesses.map((w) => ({ engine: w.engine, text: w.text })) });
    }
  });

  // ── REC — the learned reliability rule ─────────────────────────────────────────
  // Only lines with a second eye teach anything about trust; a lone eye is never wrong-by-
  // consensus because there was no consensus. reliability = agreed / checked, or null when an
  // eye was never checked. Sorted best-first; the top is "which eye is best" — measured.
  const reliability = eyes
    .map((engine) => {
      const c = checked.get(engine) || 0, g = agreed.get(engine) || 0;
      return { engine, reliability: c > 0 ? +(g / c).toFixed(3) : null, checked: c, agreed: g };
    })
    .sort((x, y) => ((y.reliability ?? -1) - (x.reliability ?? -1)) || (y.checked - x.checked) || (eyes.indexOf(x.engine) - eyes.indexOf(y.engine)));
  const rankable = reliability.filter((r) => r.reliability != null);
  const best = rankable.length ? rankable[0].engine : null;

  // ── the ledger — DEF · EVA · REC, the trail ocr.js lays on the log ──────────────
  const ledger = [];
  // DEF — the elected reading of every line (the assertion the quorum stands behind).
  blocks.forEach((b, i) => ledger.push({ op: 'DEF', index: i, kind: 'elected', value: b.text, elected: b.ref.elected, belief: b.ref.belief, agreement: b.ref.agreement, eyes: b.ref.eyes }));
  // EVA — the frames weighed: every line where the eyes did not all agree, or only one looked.
  disagreements.forEach((d) => ledger.push({ op: 'EVA', index: d.index, reason: d.kind === 'single-eye' ? 'ocr-quorum-single-eye' : 'ocr-quorum-disagreement', value: d.readings.map((r) => `${r.engine}:"${r.text}"`).join(' | ') }));
  // REC — the rule learned: each eye's reliability, and the DEF of the most reliable.
  rankable.forEach((r) => ledger.push({ op: 'REC', kind: 'eye-reliability', engine: r.engine, weight: r.reliability, checked: r.checked }));
  if (best) ledger.push({ op: 'DEF', kind: 'most-reliable-eye', value: best });

  return { eyes, blocks, reliability, best, disagreements, ledger };
};
