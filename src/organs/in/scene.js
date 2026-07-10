// EO: CON·SYN(Void → Link,Field, Binding,Composing) — scene composer (vision, pure)
// The scene composer — a vision model's structured output, made into the DETECTIONS
// the image organ already eats. This is the pure half of the vision organ; the model
// wiring (Florence-2 via Transformers.js) lives in src/reader/eo/vision.js and is
// injected, never bundled (image.js's rule).
//
// The economics decide the shape. In a VLM the cost is not looking at the image, it is
// the autoregressive DECODE — every token of "a dog in the foreground, a tree behind
// it" is a separate forward pass. So the model is driven through its structured task
// tokens only (region → label → box, plus one short gist sentence), and everything
// spatial — foreground/background, behind, left-of, containment — is DERIVED here from
// the box geometry, in plain arithmetic, at zero decode cost. The prose the reader
// sees is composed from that derivation, which also means every sentence knows exactly
// which regions it speaks about: a claim like "behind the dog, a tree" either resolves
// to two boxes or was never uttered. Grounding by construction, not by trust.
//
// Depth is read the way a photograph encodes it: an object whose box reaches lower in
// the frame (its base nearer the camera) and covers more of it is nearer. That is a
// heuristic, honestly so — it is recorded as CON edges ('behind', 'in', 'left of') a
// later witness can contest, not as fact.

const DET = /^(a|an|the|two|three|four|five|several|some|many|its|his|her|their|\d+)\b/i;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ensureDot = (s) => (/[.!?]$/.test(s.trim()) ? s.trim() : s.trim() + '.');

// "black dog" → "a black dog"; "apples" / "two dogs" / "the sky" pass through untouched.
const phraseOf = (label) => {
  const l = String(label || 'thing').trim().toLowerCase();
  if (DET.test(l) || /s$/.test(l)) return l;
  return (/^[aeiou]/.test(l) ? 'an ' : 'a ') + l;
};
// The way a later sentence refers back: "the dog" (leading determiner stripped).
const refOf = (label) => 'the ' + (String(label || 'it').trim().toLowerCase().replace(DET, '').trim() || 'it');

// How far a depth reading must separate two boxes before 'behind' is claimed.
const DEPTH_GAP = 0.12;

// composeScene(seen) → detections for ingestImage, plus the composed narration.
//   seen: { name?, caption?, regions:[{ label, bbox, score? }], width?, height?,
//           bboxFormat?: 'xyxy'|'xywh' (Florence-2 emits corners — the default),
//           metadata?, witness? }
//   →     { name, width, height, regions (bbox as [x,y,w,h]), relations, metadata,
//           narration: [{ text, regions:[originalIdx…] }], text }
// `relations` index into `regions` in their ORIGINAL order — the contract image.js reads.
export const composeScene = (seen = {}) => {
  const {
    name = `image-${Date.now()}`,
    caption = '',
    regions: raw = [],
    width = 0, height = 0,
    bboxFormat = 'xyxy',
    metadata = {},
    witness = null,
  } = seen;

  const regions = raw
    .filter((r) => r && Array.isArray(r.bbox) && r.bbox.length === 4)
    .map((r) => {
      const b = r.bbox.map(Number);
      const bbox = bboxFormat === 'xywh'
        ? [b[0], b[1], Math.max(0, b[2]), Math.max(0, b[3])]
        : [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.abs(b[2] - b[0]), Math.abs(b[3] - b[1])];
      return { label: String(r.label ?? 'thing').trim() || 'thing', bbox, ...(r.score != null ? { score: r.score } : {}) };
    });

  const W = width  || Math.max(1, ...regions.map((r) => r.bbox[0] + r.bbox[2]));
  const H = height || Math.max(1, ...regions.map((r) => r.bbox[1] + r.bbox[3]));

  // The depth reading: base position in the frame, weighted with footprint.
  const nearness = regions.map(({ bbox: [, y, w, h] }) =>
    0.75 * Math.min(1, (y + h) / H) + 0.25 * Math.sqrt(Math.min(1, (w * h) / (W * H))));

  const area = ({ bbox: [, , w, h] }) => w * h;
  const tol = 0.02 * Math.max(W, H);
  // The smallest region whose box (with tolerance) encloses region i — its container.
  const containerOf = (i) => {
    const A = regions[i];
    let best = -1;
    for (let j = 0; j < regions.length; j++) {
      if (j === i) continue;
      const B = regions[j];
      const inside =
        A.bbox[0] >= B.bbox[0] - tol && A.bbox[1] >= B.bbox[1] - tol &&
        A.bbox[0] + A.bbox[2] <= B.bbox[0] + B.bbox[2] + tol &&
        A.bbox[1] + A.bbox[3] <= B.bbox[1] + B.bbox[3] + tol &&
        area(A) < 0.9 * area(B);
      if (inside && (best < 0 || area(B) < area(regions[best]))) best = j;
    }
    return best;
  };
  // 'behind' is only claimed when the two share a visual column — otherwise the depth
  // gap could just be layout, and a lateral relation is the honest reading.
  const sharesColumn = (a, b) => {
    const overlap = Math.min(a.bbox[0] + a.bbox[2], b.bbox[0] + b.bbox[2]) - Math.max(a.bbox[0], b.bbox[0]);
    return overlap >= 0.2 * Math.max(1, Math.min(a.bbox[2], b.bbox[2]));
  };

  // Walk the scene near → far: each region relates to the one placed before it (or to
  // its container), so the relations chain is a reading path, n-1 edges, never O(n²).
  const order = regions.map((_, i) => i).sort((a, b) => nearness[b] - nearness[a]);
  const relations = [];
  const narration = [];
  if (caption) narration.push({ text: cap(ensureDot(caption)), regions: [] });

  order.forEach((idx, k) => {
    const cur = regions[idx];
    const phrase = phraseOf(cur.label);
    if (k === 0) {
      const fg = order.length > 1 && nearness[idx] - nearness[order[order.length - 1]] >= DEPTH_GAP;
      narration.push({ text: cap((fg ? 'in the foreground, ' : '') + phrase + '.'), regions: [idx] });
      return;
    }
    const prevIdx = order[k - 1];
    const inside = containerOf(idx);
    let via, target;
    if (inside >= 0) { via = 'in'; target = inside; }
    else if (nearness[prevIdx] - nearness[idx] >= DEPTH_GAP && sharesColumn(cur, regions[prevIdx])) { via = 'behind'; target = prevIdx; }
    else {
      target = prevIdx;
      const dx = (cur.bbox[0] + cur.bbox[2] / 2) - (regions[target].bbox[0] + regions[target].bbox[2] / 2);
      const dy = (cur.bbox[1] + cur.bbox[3] / 2) - (regions[target].bbox[1] + regions[target].bbox[3] / 2);
      via = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left of' : 'right of') : (dy < 0 ? 'above' : 'below');
    }
    relations.push({ from: idx, to: target, kind: 'con', via });

    const ref = refOf(regions[target].label);
    const farthest = k === order.length - 1 && via === 'behind' && nearness[order[0]] - nearness[idx] >= 0.3;
    const text =
      farthest         ? `in the background, ${phrase}.` :
      via === 'behind' ? `behind ${ref}, ${phrase}.` :
      via === 'in'     ? `in ${ref}, ${phrase}.` :
      via === 'above'  ? `above ${ref}, ${phrase}.` :
      via === 'below'  ? `below ${ref}, ${phrase}.` :
      `to the ${via.split(' ')[0]} of ${ref}, ${phrase}.`;
    narration.push({ text: cap(text), regions: [idx, target] });
  });

  // The gist sentence and the witness ride in the FRONT MATTER, the modality-neutral
  // metadata slot every doc carries — so "what is this image?" answers like "who wrote
  // this?" does for text.
  const md = { ...metadata };
  if (caption && md.description == null) md.description = caption;
  if (witness && md.witness == null) md.witness = witness;

  return {
    name, width: W, height: H,
    regions, relations, metadata: md,
    narration,
    text: narration.map((n) => n.text).join(' '),
  };
};
