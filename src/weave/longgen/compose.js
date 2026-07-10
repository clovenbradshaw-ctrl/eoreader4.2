// EO: NUL(Network → Network, Tending) — back-compat face over walk
// compose — the back-compat face over `walk` (walk.js). The multi-paragraph-walk
// spec fixed the v1 contract: the loop is `walk`, its ground pool is the FOLD, its
// carved shape the DESIGN, and its resumable statistic carries `design`. This file
// keeps the older `composeParagraphs` name — ground/demand/outline/skeleton —
// alive as a mapping onto that contract, so callers written to the earlier shape
// keep working while the walk is the one implementation underneath. Where the two
// disagree the spec wins: this is a translation, not a second walk.
//
//   composeParagraphs({ ground, demand, outline })  →  walk({ fold, design: { demand, outline } })
//   res.design  →  res.skeleton     (the carved shape, under its older name)
//
// The EVA gate (evaSplice), the frame-leak check (frameLeak), and the slice picker
// all live in walk.js now and are re-exported here so the earlier import paths
// resolve unchanged.

import { walk } from './walk.js';

export { evaSplice, frameLeak, sliceFor, walk } from './walk.js';

// Map the walk's spec-shaped result back to the older field names. `design` is the
// carved shape; the earlier contract called it `skeleton`, and its resumable state
// carried `skeleton` too — so we alias both, without dropping the new names.
const asCompose = (res) => {
  if (!res) return res;
  const { design, state, ...rest } = res;
  return {
    ...rest,
    design,
    skeleton: design,   // the older name for the carved shape
    state: state ? { ...state, skeleton: state.design } : state,
  };
};

export const composeParagraphs = async ({
  ground = [],
  question = '',
  demand = null,          // the length demand ("5 paragraphs") — the design's ceiling
  outline = null,         // the emergent sections-of-findings from corpus processing
  model,
  genre = '',             // an optional cold-start genre declaration
  state = null,           // resumable state from a prior message
  maxBeats = Infinity,    // write at most this many NEW beats this call (the rest resume)
  signal = null,
} = {}) => asCompose(await walk({
  fold: ground,
  design: state?.design || state?.skeleton || { demand, outline, question },
  question,
  model,
  genre,
  state: state ? { ...state, design: state.design || state.skeleton } : null,
  maxBeats,
  signal,
}));
