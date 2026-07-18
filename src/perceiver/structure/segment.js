// EO: SEG·INS·CON·NUL(Void,Field → Field,Network,Void, Dissecting,Making,Clearing,Binding) — container segmentation (§5)
// A file holding multiple documents (mbox, zip, a scanned letter-bundle PDF, a quoted-and-forwarded
// email chain) requires an explicit SEG pass BEFORE any entity-level work touches it. This is that
// pass, and it is deliberately NOT a special "level-2 routine": a zone that resolves to "this is
// itself a container" is INS'd as a CHILD-FRAME and the IDENTICAL step is called on its own output
// (§5, §8). Recursion falls out; only the termination (VOID) and the descent cost (economic
// guardrail) are made explicit.
//
// The order is exactly the spec's:
//   1. meta-level SEG runs the §3 detectors over the raw blob to find candidate zone boundaries —
//      no assumption about what the zones ARE.
//   2. each zone is checked against the existing pattern LIBRARY FIRST (cheap, per lineup's economic
//      precedence) before falling back to fresh detection.
//   3. a zone that resolves to a container gets INS'd as a child-frame, its own horizon, recursively
//      subject to the same pass.
//   4. unmatched zones produce new CLMs (candidate patterns), NOT errors.
//   5. zones where detection fails to converge get an explicit ZONE-LEVEL VOID — "untyped structure
//      here" — surfaced the same way binding-VOID is, never silently merged into a neighbour.
//
// Pure and model-free: `library` (promoted patterns), `matchScore` (zone × pattern → number), and the
// detector are all injected, so this runs identically in a unit test and the browser.

import { detectStructure, boundaryProposals, containerBoundaries } from './signals.js';
import { nestTurn, childAddress } from './nesting.js';

// Split a unit list at the boundary indices into contiguous zones. A boundary at index i starts a new
// zone BEFORE unit i (signals.js convention). Always yields ≥1 zone.
const cutZones = (units, boundaries) => {
  const cuts = [...new Set(boundaries)].filter((b) => b > 0 && b < units.length).sort((a, b) => a - b);
  const zones = [];
  let start = 0;
  for (const b of cuts) { zones.push({ start, end: b }); start = b; }
  zones.push({ start, end: units.length });
  return zones.map(({ start, end }) => ({ start, end, units: units.slice(start, end), blob: units.slice(start, end).join('\n') }));
};

// matchLibrary(zone, library, matchScore, floor) → the best promoted pattern for this zone, or null.
// LIBRARY-FIRST (§5.2): this is the cheap path lineup's economic precedence prefers over re-deriving
// structure from raw signal. `floor` is the minimum score to accept a match; below it the zone falls
// through to fresh detection rather than being forced onto a poor pattern.
const matchLibrary = (zone, library = [], matchScore, floor = 0) => {
  if (!library.length || typeof matchScore !== 'function') return null;
  let best = null;
  for (const p of library) {
    const score = matchScore(zone, p);
    if (score > (best?.score ?? floor)) best = { pattern: p, score };
  }
  return best;
};

// segmentContainer(blob, opts) → a zone tree. Each zone is one of:
//   { kind:'matched',   pattern, score }                     — resolved cheaply against the library
//   { kind:'child-frame', address, children:[…zones] }       — a container; the SAME pass, recursed
//   { kind:'candidate', clms:[…] }                           — unmatched → new CLMs (candidate patterns)
//   { kind:'void' }                                          — detection did not converge → zone-VOID
// opts: { library, matchScore, matchFloor, detect, address, depth, priorDensity }
export const segmentContainer = (blob, {
  library = [], matchScore = null, matchFloor = 0,
  detect = detectStructure, address = 'container', depth = 1, priorDensity = null,
} = {}) => {
  const detection = detect(blob);
  const units = detection.units;

  // (5) whole-blob non-convergence → a single zone-level VOID, surfaced, never silently merged.
  if (detection.void && depth === 1)
    return Object.freeze({
      address, depth, detection,
      zones: Object.freeze([Object.freeze({ kind: 'void', address: childAddress(address, 'zone:0'), start: 0, end: units.length, note: 'detection did not converge — untyped structure here (zone-level VOID §5)' })]),
    });

  // (1) meta-level SEG → candidate zone boundaries at the COARSE, record/document grain (a new
  // header block, a new table), NOT every blank line — so a multi-document file splits into its
  // documents rather than its fragments.
  const boundaries = containerBoundaries(detection);
  const rawZones = cutZones(units, boundaries);

  const zones = rawZones.map((z, i) => {
    const zAddr = childAddress(address, `zone:${i}`);

    // (2) library-first.
    const hit = matchLibrary(z, library, matchScore, matchFloor);
    if (hit) return Object.freeze({ kind: 'matched', address: zAddr, start: z.start, end: z.end, pattern: hit.pattern.record_id ?? hit.pattern, score: hit.score });

    // Fresh detection on the zone — is it itself a container worth descending into? The economic
    // guardrail (§8) decides, not a max-depth: a shallow zone grades idle and stops by cost. A zone is
    // only a CONTAINER if its OWN detection finds an INTERNAL boundary (a proper cut, 0 < b < len) —
    // without one there is no sub-frame to descend into, so it can never recurse onto itself.
    const zoneDetection = detect(z.blob);
    // The recursion gate reads the COARSE, no-fallback boundary set: descend only into a zone with a
    // genuine RECURRING structural block (a real nested container — a zip of mboxes), never into a
    // single document that merely has a blank line.
    const internalCuts = containerBoundaries(zoneDetection, { fallback: false }).filter((b) => b > 0 && b < z.units.length);
    const turn = nestTurn({ blob: z.blob, detection: zoneDetection }, { detect, priorDensity: turnDensity(detection), depth: depth + 1 });

    // (3) a zone that resolves to a container gets INS'd as a child-frame, recursed by the SAME pass.
    if (internalCuts.length >= 1 && turn.descend) {
      const child = segmentContainer(z.blob, { library, matchScore, matchFloor, detect, address: zAddr, depth: depth + 1, priorDensity: turn.density });
      return Object.freeze({ kind: 'child-frame', address: zAddr, start: z.start, end: z.end, grade: turn.grade, density: turn.density, children: child.zones });
    }

    // (5) a leaf zone whose own detector VOIDed → zone-level VOID.
    if (zoneDetection.void)
      return Object.freeze({ kind: 'void', address: zAddr, start: z.start, end: z.end, note: 'detection did not converge on this zone — zone-level VOID (§5)' });

    // (4) unmatched but structured → new CLMs (candidate patterns), not an error.
    return Object.freeze({ kind: 'candidate', address: zAddr, start: z.start, end: z.end, clms: zoneDetection.clms });
  });

  return Object.freeze({ address, depth, detection, zones: Object.freeze(zones) });
};

// The parent frame's corroboration density, read off how many of its zones carried a boundary — the
// priorDensity the child's economic grade compares against (a sharp drop → idle → stop).
const turnDensity = (detection) => {
  const clms = detection?.clms || [];
  const segCount = clms.filter((c) => c.kind === 'SEG').length;
  return clms.length ? segCount / clms.length : 0;
};

// flattenZones(tree) → every leaf zone in source order, with its full nested address — the queryable
// projection an entity-level pass reads to know which zone (at any depth) a span belongs to.
export const flattenZones = (tree) => {
  const out = [];
  const walk = (zones) => {
    for (const z of zones || []) {
      if (z.kind === 'child-frame') walk(z.children);
      else out.push(z);
    }
  };
  walk(tree?.zones);
  return Object.freeze(out);
};

// maxDepthReached(tree) → the deepest zone address depth in the tree — logged as a queryable fact so
// the economic guardrail's cutoff can be tuned empirically (§8, §11), never a cap baked into code.
export const maxDepthReached = (tree) => {
  let max = tree?.depth ?? 1;
  const walk = (zones, d) => { for (const z of zones || []) { max = Math.max(max, d); if (z.kind === 'child-frame') walk(z.children, d + 1); } };
  walk(tree?.zones, tree?.depth ?? 1);
  return max;
};
