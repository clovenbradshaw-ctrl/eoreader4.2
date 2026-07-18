// EO: SIG(Lens → Lens, Tending) — the operator clock (docs/coil-surfaces.md §3)
// Consumes ONLY a FoldTrace + a scrubber position — never a WaveformModel, never
// a source. The coil seen end-on: a 9-spoke radial dial, one spoke per HELIX
// operator, lit exactly when the fold nearest the scrubber's `pos` fired that
// operator (FoldTrace.ops_fired). No signal computed here that FoldTrace didn't
// already carry — this is a pure relabeling of one row into a dial.
//
// Split in two, same discipline as surfaces/waveform/render.strict.js:
//   buildScene(foldTrace, opts)        — pure. FoldTrace[] + {pos} => a plain Scene.
//   renderToContainer(foldTrace, el, opts) — the DOM adapter. Paints an inline SVG
//                                    dial, wires hover through an INJECTED callback
//                                    (opts.onHover(fold)) — never imports app state.
//
// REC break (docs/coil-surfaces.md §3 cross-cutting rule): a fold with
// rec_fired=true must interrupt the surface, never blend in as an ordinary lit
// spoke. Here that is a notch drawn across the REC spoke rather than a plain fill
// — if a future skin can't draw the notch, it must not light REC at all rather
// than render it as smooth accretion.

import { HELIX, glyphOf, nearestFoldIndex } from '../../core/index.js';

// buildScene — the entire rendering decision, pure. `pos` is the scrubber's
// current reading position; the fold rendered is the one FoldTrace itself
// resolves as nearest (core/fold-trace.js's own nearestFoldIndex, reused rather
// than re-derived, so the clock and the scrubber never disagree on "nearest").
export const buildScene = (foldTrace, { pos = 0 } = {}) => {
  const idx = nearestFoldIndex(foldTrace, pos);
  const fold = idx >= 0 ? foldTrace[idx] : null;
  const fired = new Set(fold ? fold.ops_fired.split(',').filter(Boolean) : []);

  const spokes = HELIX.map((op) => ({
    op,
    glyph: glyphOf(op),
    lit: fired.has(op),
    rec: op === 'REC' && fired.has('REC'),
  }));

  return {
    n: spokes.length,
    spokes,
    fold: fold ? {
      order_index: fold.order_index,
      address: fold.address,
      accepted: fold.accepted,
      reject_reason: fold.reject_reason,
    } : null,
  };
};

// ---- the DOM adapter --------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;

// renderToContainer — paints buildScene's output as an inline SVG radial dial
// into `el`. Every spoke is wired through an injected callback, never app
// state: hovering a spoke lands on `opts.onHover(spokeOrNull)`.
export const renderToContainer = (foldTrace, el, opts = {}) => {
  const doc = opts.doc || (el && el.ownerDocument) || (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new Error('renderToContainer: no document available — pass opts.doc in a non-browser context');
  const size = opts.size ?? 160;
  const cx = size / 2, cy = size / 2;
  const rOuter = size * 0.42, rInner = size * 0.14;
  const scene = buildScene(foldTrace, opts);

  while (el.firstChild) el.removeChild(el.firstChild);
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', scene.fold && !scene.fold.accepted ? 'operator-clock operator-clock-rejected' : 'operator-clock');
  el.appendChild(svg);

  const ring = doc.createElementNS(NS, 'circle');
  ring.setAttribute('cx', String(cx)); ring.setAttribute('cy', String(cy)); ring.setAttribute('r', String(rOuter));
  ring.setAttribute('class', 'clock-ring');
  svg.appendChild(ring);

  const n = scene.n;
  scene.spokes.forEach((s, i) => {
    const angle = (i / n) * TAU - Math.PI / 2;
    const x1 = cx + rInner * Math.cos(angle), y1 = cy + rInner * Math.sin(angle);
    const x2 = cx + rOuter * Math.cos(angle), y2 = cy + rOuter * Math.sin(angle);

    const spoke = doc.createElementNS(NS, 'line');
    spoke.setAttribute('x1', String(x1)); spoke.setAttribute('y1', String(y1));
    spoke.setAttribute('x2', String(x2)); spoke.setAttribute('y2', String(y2));
    spoke.setAttribute('class', spokeClass(s));
    spoke.setAttribute('data-op', s.op);
    wireSpoke(spoke, s, opts);
    svg.appendChild(spoke);

    // The REC break: a notch (a short cross-stroke) at the spoke's outer end,
    // instead of just a brighter fill — REC must interrupt, never blend in.
    if (s.rec) {
      const nx1 = x2 - 4 * Math.sin(angle), ny1 = y2 + 4 * Math.cos(angle);
      const nx2 = x2 + 4 * Math.sin(angle), ny2 = y2 - 4 * Math.cos(angle);
      const notch = doc.createElementNS(NS, 'line');
      notch.setAttribute('x1', String(nx1)); notch.setAttribute('y1', String(ny1));
      notch.setAttribute('x2', String(nx2)); notch.setAttribute('y2', String(ny2));
      notch.setAttribute('class', 'clock-rec-break');
      svg.appendChild(notch);
    }

    const label = doc.createElementNS(NS, 'text');
    label.setAttribute('x', String(cx + (rOuter + 12) * Math.cos(angle)));
    label.setAttribute('y', String(cy + (rOuter + 12) * Math.sin(angle)));
    label.setAttribute('class', s.lit ? 'clock-glyph clock-glyph-lit' : 'clock-glyph');
    label.setAttribute('text-anchor', 'middle');
    label.textContent = s.glyph;
    svg.appendChild(label);
  });

  return svg;
};

const spokeClass = (s) => {
  if (s.rec) return 'clock-spoke clock-spoke-rec';
  return s.lit ? 'clock-spoke clock-spoke-lit' : 'clock-spoke';
};

const wireSpoke = (node, spoke, opts) => {
  if (typeof opts.onHover === 'function') {
    node.addEventListener?.('mouseenter', () => opts.onHover(spoke));
    node.addEventListener?.('mouseleave', () => opts.onHover(null));
  }
};
