// EO: EVA·SIG(Field,Paradigm → Paradigm, Tracing) — chorus Born-measure reader
// The chorus reader — the browser entry that wires the chorus holon
// (src/chorus/) to the EO Reader app (docs/chorus.md).
//
// The app read from one frame and spoke from one cell. This reads a clause and
// keeps the whole distribution: it embeds the clause in the MiniLM space the 27
// centroids were built in, projects onto every centroid (the signed amplitudes),
// centers them (the "fix the basis" step — the correlated centroids make the raw
// cosines spread flat; the signed residual is where concentration lives), takes
// the Born measure, and renders the weighted map. No argmax, no generation.
//
// It imports the REAL chorus modules (not a copy) — the whole src/ tree is served
// by the app at runtime, so there is one implementation. It degrades honestly:
// with no meaning-measuring embedder or no centroids, `read` returns { live:false }
// and the panel says the geometric reader is unavailable rather than faking a map.

import {
  cubeAmplitudes, centeredAmplitudes, bornDistribution,
} from '../../../weave/chorus/index.js';
import { renderLane } from '../../../weave/chorus/render.js';
import { cellCoords } from '../../../weave/chorus/marginals.js';
import { OPERATORS } from '../../../core/operators.js';

// A short, human label for a cube cell — "Making · Entity" (stance · terrain),
// with the operator code kept for the tooltip. No machinery leaks into the label
// beyond the cube's own vocabulary, which is what the map is FOR.
const cellLabel = (key) => {
  const c = cellCoords(key);
  if (!c) return { title: key, op: '', label: key };
  return { title: key, op: c.op, label: `${c.stance} · ${c.site}` };
};

// A face cell's label depends on the face: Act shows the operator, Site the
// terrain, Stance the stance — each is the marginal's own key.
const faceLabel = (face, key) =>
  face === 'act' ? `${key} · ${OPERATORS[key]?.label || ''}`.trim().replace(/ ·\s*$/, '') : key;

const pct = (w) => Math.round((w || 0) * 1000) / 10;   // one-decimal percent

// Build the reader. `centroids` is the 27-cell bundle ({ vectors }); `embedder`
// is the MiniLM organ (measuresMeaning:true). `coverage` is the governor's budget.
export const createChorusReader = ({ centroids, embedder, coverage = 0.8 } = {}) => {
  const vectors = centroids?.vectors || null;
  const live = !!(embedder?.measuresMeaning && vectors && Object.keys(vectors).length);

  const read = async (clause) => {
    const text = String(clause || '').trim();
    if (!live) return { live: false, reason: !embedder?.measuresMeaning ? 'weak-embedder' : 'no-centroids' };
    if (!text) return { live: true, empty: true };

    let q;
    try { q = await embedder.embed(text); }
    catch (e) { return { live: false, reason: 'embed-failed', error: String(e?.message || e) }; }

    // raw → centered → Born → the render lane (one level).
    const raw = cubeAmplitudes(q, vectors);
    const dist = bornDistribution(centeredAmplitudes(raw));
    const lane = renderLane(dist, { level: 0, coverage });

    // A flat display model the app maps straight to view props.
    const voiced = lane.cube.voiced.map((c) => ({ key: c.key, ...cellLabel(c.key), weight: c.weight, pct: pct(c.weight) }));
    const silent = lane.cube.silent.slice(0, 6).map((c) => ({ key: c.key, ...cellLabel(c.key), weight: c.weight, pct: pct(c.weight) }));
    const faces = ['act', 'site', 'stance'].map((face) => ({
      face,
      name: face === 'act' ? 'Act' : face === 'site' ? 'Site' : 'Stance',
      cells: lane.faces[face].voiced.map((c) => ({ key: c.key, label: faceLabel(face, c.key), weight: c.weight, pct: pct(c.weight) })),
    }));
    const evaSites = lane.evaSites.map((e) => ({
      hold: e.hold.map((k) => cellLabel(k).label),
      pcts: e.weights.map(pct),
    }));

    return {
      live: true, clause: text,
      coverage: lane.coverage,
      k: lane.cube.k,
      massVoiced: lane.cube.massVoiced,
      voiced, silent, faces, evaSites,
      silence: { cell: lane.silence.cell, pct: pct(lane.silence.weight) },
    };
  };

  return { read, isLive: () => live };
};
