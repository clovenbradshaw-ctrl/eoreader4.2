// EO: SIG(Lens → Lens, Tending) — the modality-blind render (docs/omnimodal-waveform.md §5)
// Consumes ONLY a WaveformModel — never a Reading, never a source. This is the
// correctness baseline: if the strict render looks wrong for a modality, the fix
// is in the perceiver, never here.
//
// Split in two on purpose:
//   buildScene(model, opts)       — pure. WaveformModel → a plain-object Scene
//                                    (every draw decision, no DOM). This is what
//                                    gets tested.
//   renderToContainer(model, el, opts) — the DOM adapter. Paints an inline SVG
//                                    from buildScene's output into `el`, wires
//                                    click/hover through INJECTED callbacks
//                                    (never imports app state) so a click lands
//                                    on `opts.onNavigate(locator)` and a hover
//                                    lands on `opts.onHover(discardEntry)`.
//
// Rendering invariants carried from docs/deviation-waveform.md: no numeric
// axis labels anywhere in the default view; two continuous traces max
// (baseline as a muted filled area, strain as the one bold line); turns get
// ticks, echoes get arcs, never a third line; low-confidence zones visibly
// de-emphasized, never silently omitted; one peak callout by default; the
// gauge is a word + an arc-fill, no needle, no number, and mutes itself when
// the document has no stable expected floor to be confident against.

const MIN_SAMPLES = 4;

const median = (xs) => {
  const s = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

// The domain-dependent-utility rule (deviation-waveform.md): the aggregate gauge
// auto-mutes when the document's baseline-surprisal dispersion is too high for
// a stable "expected floor" to exist (the literary case — deviation IS the
// style, so there is nothing stable to be confident against). The exact cutoff
// is an open question (omnimodal-waveform.md §7); this constant is the current,
// adjustable placeholder for it, not a claimed final answer.
const GAUGE_RELATIVE_MAD_CUTOFF = 0.6;

const buildGauge = (baseline, strain, turnLine) => {
  const finite = baseline.filter(Number.isFinite);
  if (finite.length < MIN_SAMPLES) return { muted: true, label: null, fill: 0 };
  const m = median(finite);
  const dispersion = median(finite.map((x) => Math.abs(x - m)));
  const relative = m > 1e-9 ? dispersion / m : dispersion;
  if (relative > GAUGE_RELATIVE_MAD_CUTOFF) return { muted: true, label: null, fill: 0 };
  const total = strain.filter(Number.isFinite).length || 1;
  const flagged = Number.isFinite(turnLine)
    ? strain.filter((s) => Number.isFinite(s) && s > turnLine).length
    : 0;
  const fill = flagged / total;
  const label = fill === 0 ? 'quiet' : fill < 0.15 ? 'active' : 'restless';
  return { muted: false, label, fill };
};

// The one peak callout (§rendering: "hierarchy over completeness") — the hottest
// confirmed turn, or none at all when nothing clears the stricter salience null.
// Precision over recall: no callout is a correct answer, not a missing feature.
const pickPeak = (turns) => {
  const hot = turns.filter((t) => t.hot);
  if (!hot.length) return null;
  return hot.reduce((best, t) => (t.strain_delta > best.strain_delta ? t : best), hot[0]);
};

const VISIBILITY = Object.freeze({
  read:  Object.freeze({ waveform: false, ruler: false, bands: false, turns: false, echoes: false, cast: false, gauge: false }),
  skim:  Object.freeze({ waveform: false, ruler: false, bands: true,  turns: true,  echoes: false, cast: false, gauge: false }),
  study: Object.freeze({ waveform: true,  ruler: true,  bands: true,  turns: true,  echoes: true,  cast: true,  gauge: true }),
});

// buildScene — the entire rendering decision, pure. `mode` is the reading-intent
// ladder (Read/Skim/Study, deviation-waveform.md's Interaction section).
export const buildScene = (model, { mode = 'study' } = {}) => {
  const visibility = VISIBILITY[mode] || VISIBILITY.study;
  const n = model.strain.length;

  const bands = model.frames.map((f) => ({ start: f.start, end: f.end, label: f.label }));
  const turnMarks = model.turns.map((t) => ({ ordinal: t.ordinal, emphasized: !!t.hot }));
  const echoArcs = model.echoes.map((e) => ({ a: e.span_a, b: e.span_b }));
  const castLanes = model.cast.filter((c) => c.onCast);
  const confidenceZones = model.confidence.map((c, i) => ({ ordinal: i, deemphasized: c < 1 }));
  const peak = pickPeak(model.turns);
  const gauge = buildGauge(model.baseline, model.strain, model.discard.get(0) ? model.discard.get(0).turnLine : null);

  return {
    n,
    visibility,
    waveform: { baseline: model.baseline, strain: model.strain },
    ruler: model.ruler,
    bands,
    turnMarks,
    echoArcs,
    castLanes,
    confidenceZones,
    peakCallout: peak,
    gauge,
    vocab: model.vocab,
  };
};

// ---- the DOM adapter --------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
const clampX = (i, n, width) => (n <= 1 ? 0 : (i / (n - 1)) * width);

// renderToContainer — paints `buildScene`'s output as inline SVG into `el`
// (any object exposing `ownerDocument`/`appendChild`, or `el` itself carries a
// `.createElementNS`-capable document via `opts.doc`). Every mark is wired
// through injected callbacks, never app state: `opts.onNavigate(locator)` on
// click, `opts.onHover(discardEntry)` on hover. `model.provenance`/`model.discard`
// are read directly off the WaveformModel passed in — the render never
// recomputes them. `opts.skin` (skins/audio.js, skins/tabular.js), if given, is
// applied to the built Scene ONLY — restyle, never a new mark or threshold.
export const renderToContainer = (model, el, opts = {}) => {
  const doc = opts.doc || (el && el.ownerDocument) || (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new Error('renderToContainer: no document available — pass opts.doc in a non-browser context');
  const width = opts.width ?? 800;
  const height = opts.height ?? 160;
  const scene = typeof opts.skin === 'function' ? opts.skin(buildScene(model, opts)) : buildScene(model, opts);

  while (el.firstChild) el.removeChild(el.firstChild);
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', scene.style ? `waveform-strict waveform-theme-${scene.style.theme}` : 'waveform-strict');
  el.appendChild(svg);
  if (!scene.visibility.waveform && !scene.visibility.turns) return svg;   // Read mode — nothing painted

  const n = scene.n;

  if (scene.visibility.bands) {
    for (const b of scene.bands) {
      const rect = doc.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(clampX(b.start, n, width)));
      rect.setAttribute('width', String(clampX(b.end, n, width) - clampX(b.start, n, width)));
      rect.setAttribute('y', '0');
      rect.setAttribute('height', String(height));
      rect.setAttribute('class', b.label ? 'band band-labeled' : 'band band-unlabeled');
      if (b.label) rect.setAttribute('data-label', b.label);
      svg.appendChild(rect);
    }
  }

  if (scene.visibility.waveform) {
    const area = doc.createElementNS(NS, 'polyline');
    area.setAttribute('class', 'baseline-area');
    area.setAttribute('points', scene.waveform.baseline.map((v, i) => `${clampX(i, n, width)},${height - v * height}`).join(' '));
    svg.appendChild(area);

    const line = doc.createElementNS(NS, 'polyline');
    line.setAttribute('class', 'strain-line');
    line.setAttribute('points', scene.waveform.strain.map((v, i) => `${clampX(i, n, width)},${height - v * height}`).join(' '));
    svg.appendChild(line);

    for (const z of scene.confidenceZones) {
      if (!z.deemphasized) continue;
      const rect = doc.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(clampX(z.ordinal, n, width)));
      rect.setAttribute('width', '1');
      rect.setAttribute('y', '0');
      rect.setAttribute('height', String(height));
      rect.setAttribute('class', 'confidence-zone');
      svg.appendChild(rect);
    }
  }

  if (scene.visibility.turns) {
    for (const t of scene.turnMarks) {
      const tick = doc.createElementNS(NS, 'line');
      const x = clampX(t.ordinal, n, width);
      tick.setAttribute('x1', String(x)); tick.setAttribute('x2', String(x));
      tick.setAttribute('y1', '0'); tick.setAttribute('y2', String(height));
      tick.setAttribute('class', t.emphasized ? 'turn-tick turn-tick-emphasized' : 'turn-tick');
      wireMark(tick, t.ordinal, model, opts);
      svg.appendChild(tick);
    }
  }

  if (scene.visibility.echoes) {
    for (const e of scene.echoArcs) {
      const arc = doc.createElementNS(NS, 'path');
      const xa = clampX(e.a, n, width), xb = clampX(e.b, n, width);
      arc.setAttribute('d', `M ${xa} ${height} Q ${(xa + xb) / 2} ${height * 0.4} ${xb} ${height}`);
      arc.setAttribute('class', 'echo-arc');
      svg.appendChild(arc);
    }
  }

  if (scene.peakCallout) {
    const x = clampX(scene.peakCallout.ordinal, n, width);
    const callout = doc.createElementNS(NS, 'circle');
    callout.setAttribute('cx', String(x));
    callout.setAttribute('cy', '0');
    callout.setAttribute('r', '4');
    callout.setAttribute('class', 'peak-callout');
    wireMark(callout, scene.peakCallout.ordinal, model, opts);
    svg.appendChild(callout);
  }

  if (scene.visibility.gauge) {
    const g = doc.createElementNS(NS, 'text');
    g.setAttribute('class', scene.gauge.muted ? 'gauge gauge-muted' : 'gauge');
    g.textContent = scene.gauge.muted ? '' : scene.gauge.label;
    svg.appendChild(g);
  }

  return svg;
};

const wireMark = (node, ordinal, model, opts) => {
  if (typeof opts.onNavigate === 'function') {
    node.addEventListener?.('click', () => opts.onNavigate(model.provenance(ordinal)));
  }
  if (typeof opts.onHover === 'function') {
    node.addEventListener?.('mouseenter', () => opts.onHover(model.discard.get(ordinal)));
  }
};
