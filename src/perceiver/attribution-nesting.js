// EO: SIG·CON·SYN(Field → Network, Binding,Tracing,Composing) — the attribution nest
// attribution-nesting.js — who is speaking, and through whose mouth.
//
// attribution-frames.js dissects one text into a flat list of bearer-frames — a single layer
// of the wrapping a voice reaches the page in. This file STACKS them: it recurses into each
// frame's content for the frames wrapped inside it, building the Russian nest-doll a novel
// makes when it quotes research that cites other research that quotes people who cite research
// based on novels. Four bearers, one claim — and only the innermost is ASSERTING it; the shells
// outside are RELAYING. The claim's epistemic weight lives not in the words but in the STACK of
// lenses it passed through to reach you, and this reads that stack as a first-class object.
//
// It keeps the engine's two laws. A stack that would loop forever — novels → research → novels
// — is CUT at the first repeated bearer (cycle:true), never chased: the record stays finite the
// way defeasibility keeps every claim finite. And it FAILS TOWARD SILENCE — an anonymous relay
// keeps its null bearer, an unresolved name keeps its surface label, nothing is invented to fill
// a shell. Pure over (text) / (doc) / (perspective packet); no DOM, no state, no model in the loop.
//
//   inner     the frames found INSIDE a frame's content — the next doll down (the recursion)
//   chain     one root-to-leaf path through the nest: the ordered lenses a claim is seen through,
//             outermost teller first, innermost asserter last ("whose perspective" is the last one)
//   cycle     a bearer that already stands OUTWARD on the same path — the recursion stops there

import {
  outermostFrames, resolveBearer, norm, defIsSpeech, defIsReport, defIsSourceNoun, frameRegistersFor,
} from './attribution-frames.js';

const MAX_DEPTH = 6;

// THE NEST. Recursively read `text` into a forest of frames, each carrying the frames found
// inside its content. `seen` is the bearer keys standing OUTWARD on this path: when a frame's
// bearer is already among them the recursion STOPS (cycle:true) — the novels→research→novels
// loop is cut at its first repeat, never chased. Depth-capped for a runaway text. `depth` is the
// frame's shell number (0 = outermost). Pure; bearers unresolved (ids attached by the doc read).
//
// The frame registers (which verbs report, which nouns bear a voice) come from the caller's
// ledger when there is one (opts.isReport / opts.isSourceNoun — a parsed doc's corpus-induced
// conventions). With none, the OUTERMOST call SELF-INDUCES them off this very text and threads
// them down — so a standalone scan learns its own registers, no seed list, no corpus needed.
export const nestFrames = (text, opts = {}, depth = 0, seen = new Set()) => {
  const s = String(text || '');
  if (!s.trim() || depth >= (opts.maxDepth ?? MAX_DEPTH)) return [];
  if (depth === 0 && !opts.isReport && !opts.isSourceNoun) {
    const reg = frameRegistersFor(s);
    opts = { ...opts, isSpeech: opts.isSpeech || reg.isSpeech, isReport: reg.isReport, isSourceNoun: reg.isSourceNoun };
  }
  const isSpeech = opts.isSpeech || defIsSpeech;
  const isReport = opts.isReport || defIsReport;
  const isSourceNoun = opts.isSourceNoun || defIsSourceNoun;
  const admission = opts.admission || null;
  const frames = outermostFrames(s, isSpeech, isReport, isSourceNoun, admission);
  const out = [];
  for (const f of frames) {
    const key = f.bearer ? norm(f.bearer) : null;
    const cycle = !!key && seen.has(key);
    const content = s.slice(f.contentStart, f.contentEnd).trim();
    const node = {
      mode: f.mode, bearer: f.bearer || null, bearerId: null, verb: f.verb, year: f.year,
      marker: f.marker, depth, content, cycle, inner: [],
    };
    if (!cycle) {
      const nextSeen = key ? new Set(seen).add(key) : seen;
      node.inner = nestFrames(content, opts, depth + 1, nextSeen);
    }
    out.push(node);
  }
  return out;
};

// ── The lens chain — the stack of voices a claim is seen through ──────────────────────
// Every root-to-leaf path through the nest is one CHAIN: the ordered lenses, outermost teller
// first, innermost asserter last. A leaf carries the perspective the claim is finally SPOKEN
// from ("whose perspective"); the shells above it are who RELAYS it, and to whom the reader
// should attribute the claim vs. merely the telling. A cycle-cut leaf ends the chain honestly.
export const attributionChains = (nested) => {
  const chains = [];
  const walk = (node, path) => {
    const step = { bearer: node.bearer, mode: node.mode, verb: node.verb, year: node.year, cycle: node.cycle };
    const here = [...path, step];
    if (!node.inner || node.inner.length === 0) chains.push(here);
    else for (const child of node.inner) walk(child, here);
  };
  for (const n of nested || []) walk(n, []);
  return chains;
};

// The innermost bearer of a nest — whose perspective the claim is finally presented from, read
// off the deepest chain. Null when the deepest voice is anonymous or there is no frame at all.
export const innermostBearer = (nested) => {
  const chains = attributionChains(nested);
  if (!chains.length) return null;
  const deepest = chains.reduce((a, b) => (b.length > a.length ? b : a));
  return deepest[deepest.length - 1]?.bearer || null;
};

// The deepest shell count across the nest — how many lenses stack at the most-relayed point.
export const nestDepth = (nested) => {
  let d = 0;
  for (const n of nested || []) d = Math.max(d, 1 + nestDepth(n.inner));
  return d;
};

// Resolve every bearer in a nest to an admitted referent id where one exists (so a stack can be
// graph-collapsed, "Reyes" ↔ its referent), in place. Bearers with no admitted match keep a null
// id and their surface label — the unresolved fallback the whole engine reads by.
const resolveIds = (nodes, admission) => {
  for (const n of nodes) {
    n.bearerId = n.bearer ? resolveBearer(n.bearer, admission) : null;
    resolveIds(n.inner, admission);
  }
  return nodes;
};

// ── The document read — every sentence's attribution nest, bearers resolved ────────────
// Over doc.sentences: nest each, resolve bearers, and summarise the weave — how deep attribution
// stacks, how many sentences are RELAYED rather than told plain, and where it cycles. Pure over
// (doc). The frame registers come from the doc's OWN learned ledger — the report verbs and source
// nouns Pass 0 induced off this corpus (conventions.isReport / .isSourceNoun) — so what counts as
// a relayed voice is what this text taught, not a list. Falls back to the seed floor if unparsed.
export const attributionNesting = (doc, opts = {}) => {
  const sentences = Array.isArray(doc?.sentences) ? doc.sentences : [];
  const conv = doc?.conventions || null;
  const isSpeech = opts.isSpeech || conv?.isAttributionVerb || defIsSpeech;
  const isReport = opts.isReport || conv?.isReport || defIsReport;
  const isSourceNoun = opts.isSourceNoun || conv?.isSourceNoun || defIsSourceNoun;
  const admission = doc?.admission || null;
  const out = [];
  let maxDepth = 0, relayed = 0, cyclic = 0;
  const modes = { quote: 0, report: 0, attribution: 0, cite: 0 };
  const countModes = (nodes) => { for (const n of nodes) { modes[n.mode] = (modes[n.mode] || 0) + 1; if (n.cycle) cyclic += 1; countModes(n.inner); } };
  for (let i = 0; i < sentences.length; i++) {
    const nested = resolveIds(nestFrames(sentences[i], { isSpeech, isReport, isSourceNoun, admission, maxDepth: opts.maxDepth }), admission);
    if (!nested.length) continue;
    const depth = nestDepth(nested);
    maxDepth = Math.max(maxDepth, depth);
    if (depth >= 2) relayed += 1;
    countModes(nested);
    out.push({ idx: i, text: String(sentences[i]).replace(/\s+/g, ' ').trim().slice(0, 280),
      depth, nested, chains: attributionChains(nested) });
  }
  return { units: sentences.length, sentences: out,
    summary: { framed: out.length, maxDepth, relayed, cyclic, modes } };
};

// ── Deepening a figure's perspective — whom this figure is RELAYING ───────────────────
// perspectiveOf gives a figure its own quotes and the fold their words instantiate. This reads
// the NEXT shell inward: inside the figure's own words, whom are THEY quoting or citing? Reyes
// does not only assert — Reyes relays "the report", which relays "the vendor". Pure over a
// perspective packet (no re-parse, no import of perspectiveOf), so a caller composes the two.
export const relaysOfPerspective = (persp, opts = {}) => {
  if (!persp) return { relays: [], byQuote: [], maxDepth: 0 };
  const admission = opts.admission || null;
  const o = { ...opts, admission };
  // The shells the figure's whole voice invokes — nest their fold text (their words, joined).
  const relays = resolveIds(nestFrames(persp.fold?.text || '', o), admission);
  // Per quote: the matryoshka a single utterance opens — a quote that itself quotes or cites.
  const byQuote = (persp.quotes || []).map((q) => {
    const text = q && q.text != null ? q.text : q;
    const nested = resolveIds(nestFrames(text, o), admission);
    return { idx: q?.idx ?? null, text, nested, depth: nestDepth(nested) };
  }).filter((x) => x.nested.length);
  const maxDepth = Math.max(nestDepth(relays), ...byQuote.map((q) => q.depth), 0);
  return { relays, byQuote, maxDepth };
};
