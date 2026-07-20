// EO: SYN·EVA·CON(Network,Field → Field,Network, Composing,Tracing,Binding) — assemble the full LLM payload in one call
// Assemble what the LLM would be told — the whole reading pipeline in one place.
//
// Every piece we built converges here. Given a document and the activated conversation thread,
// this runs: thread salience (the Born rule over terms · figures · links) → an adaptive surf
// that keeps as much as is salient → the salient relation edges → the EO-enriched RDF-star
// brief (each triple annotated with operator · site · band · order · door) → the realization
// prompt. The return is exactly the system+user the talker would receive, plus the structure
// behind it (the salient stops, the focus's trajectory) so the decision is legible. Nothing
// here decides content the model could fabricate — it selects, from the graph, what is grounded
// and salient, and hands it over in a notation the model can consume.

import { surfFold, threadBasis, trajectory, linksBySentence, linkSalience, bornSalience } from '../../surfer/index.js';
import { deriveNull } from '../../core/index.js';
import { rdfRealizationPrompt, briefRDF } from './rdf.js';
import { speakTriples } from './brief.js';
import { arcGravity, speakArc, arcLines, ARC_CUE, TERRAIN_GRAVITY } from './gravity.js';

// the doc's CON/SIG edges at the given sentence stops, as {subj, verb, obj} label triples,
// in arrow-of-time order — the salient propositions, the content the prompt is built from.
const edgesAtStops = (doc, stops, max) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, e.label);
  const L = (id) => label.get(id) ?? id;
  const out = [];
  for (const e of events) {
    if (!((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null)) continue;
    if (stops && e.sentIdx != null && !stops.has(e.sentIdx)) continue;
    out.push({ subj: L(e.src), verb: String(e.via), obj: e.tgt != null ? L(e.tgt) : null });
    if (out.length >= max) break;
  }
  return out;
};

// The EOT-native salience path. An EOT log has no prose surprise field (the surfer's bayes is
// a reading-of-prose artifact), so the surfer cannot select on it. But the edges are already
// clean and curated, so salience IS the link channel run straight over the log: each span's
// salience is its strongest link against the thread (the relation between thread figures beats
// the mere mention), and the noise null over those saliences keeps the salient set. Returns
// { stops, focus } — the salient sentence indices and the thread figure most often their subject.
const eotSalience = (doc, thread) => {
  const links = linksBySentence(doc);
  const hasThread = thread.figures.size > 0 || thread.terms.size > 0;
  const scored = [];
  for (const [idx, ls] of links) {
    const fig = ls.length ? Math.max(...ls.map((l) => linkSalience(thread.figures, l))) : 0;
    const term = bornSalience(thread.terms, doc.tokensBySentence?.[idx]);
    scored.push({ idx, score: Math.max(fig, term) });
  }
  if (!scored.length) return { stops: new Set(), focus: null };
  let stops;
  if (!hasThread) {
    stops = new Set(scored.map((s) => s.idx));                 // no thread → the whole graph
  } else {
    // an edge touching NOTHING on the thread (salience 0) is off-thread — out, regardless of
    // the null. Among the edges that DO touch it, the noise null ranks the rest (and on too few
    // samples it is permissive, so the touching set rides — better than admitting the unrelated).
    const live = scored.filter((s) => s.score > 0);
    if (!live.length) stops = new Set(scored.map((s) => s.idx));
    else {
      const series = live.map((s) => s.score);
      stops = new Set(live.filter((s) => s.score > deriveNull(series, { scale: 'linear', alpha: 0.05, leaveOut: s.score })).map((s) => s.idx));
      if (!stops.size) stops = new Set(live.map((s) => s.idx)); // null permissive/killed → keep the touching set
    }
  }
  // focus: the thread figure that is a salient subject AND most activated by the CURRENT thread.
  // threadBasis γ-weights the query over history, so a figure named in this turn outweighs one
  // carried from an earlier turn — the focus tracks where the conversation just moved, not
  // wherever the most edges happen to be. Recency (the figure's term weight) is primary; the
  // count of its salient edges only breaks ties.
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, e.label);
  const figWeight = (lab) => Math.max(0, ...String(lab).toLowerCase().split(/\s+/).map((t) => thread.terms.get(t) || 0));
  const count = new Map();
  for (const e of events) {
    if (!((e.op === 'CON' || e.op === 'SIG') && e.src != null && stops.has(e.sentIdx))) continue;
    const lab = String(label.get(e.src) ?? e.src).toLowerCase();
    if (thread.figures.has(lab)) count.set(label.get(e.src), (count.get(label.get(e.src)) || 0) + 1);
  }
  let focus = null; let bestW = -1; let bestN = 0;
  for (const [f, n] of count) {
    const w = figWeight(f);
    if (w > bestW || (w === bestW && n > bestN)) { bestW = w; bestN = n; focus = f; }
  }
  return { stops, focus };
};

// Above this many units the from-scratch adaptive surf (readingAt at EVERY unit — O(S), the
// whole document) is too costly to run on a caller's blocking path, so the fallback below drops
// to the bounded windowed reach instead. Only reached when no `surf` was handed in; the reuse
// path (the pipeline's audit brief always passes the turn's own surf) never pays this at all.
const ADAPTIVE_SURF_MAX_UNITS = 400;

// assembleBrief(doc, { question, history, max, surf }) → the LLM-facing payload + the reasoning.
//   prompt        { system, user } — EXACTLY what the talker would be handed (RDF-star, EO-
//                 annotated, restricted to the salient stops)
//   propositions  the salient edges as plain triples (the no-LLM render reads these)
//   draft         speakTriples over them — the natural-speech the engine produces with no LLM
//   thread        the activated figures the salience rode
//   surf          { peak, stops, recCursors, focus } — what the surfer kept and why
//   trajectory    the focus's arc (a Network reading), when a focus settled
//   arc           the trajectory LIFTED (write/gravity.js): turns weighted by rewrite
//                 magnitude, relations scored against the thread — the payload the draft
//                 and the prompt now render, not just report
//
// `surf` (optional): the reading the CALLER already did (the turn's fold-stage surf). When given
// it is reused verbatim instead of re-surfing the document from scratch. The default path below
// runs surfFold with ADAPTIVE reach — readingAt at every unit, O(S) — which on a large document
// (a big source, or several fetched pages folded into one) runs for tens of seconds; assembleBrief's
// one caller invokes it after the answer is already produced, purely to reconstruct the audit brief,
// so that cost lands as a post-answer hang the turn cannot make progress through. Reusing the surf
// the turn ALREADY computed makes this diagnostic effectively free AND more faithful — it shows what
// was actually read, not a second, idealized whole-document re-reading.
export const assembleBrief = (doc, { question = '', history = [], max = 24, surf = null } = {}) => {
  const thread = threadBasis({ query: question, history, doc });
  const hasThread = thread.terms.size > 0 || thread.figures.size > 0;

  // Three ways to a salient stop set + focus, one selector contract. An EOT document is a clean,
  // curated graph with no prose surprise field, so its salience IS the link channel run over the
  // log (eotSalience). Otherwise, if the caller handed in the reading it already did, reuse it;
  // failing that, ride the adaptive surf (bounded on a large document — see the cap above).
  let stops; let focus; let recCursors = []; let surfRead = null;
  if (doc.eot) {
    const sel = eotSalience(doc, thread);
    stops = sel.stops; focus = sel.focus;
  } else if (surf && Array.isArray(surf.stops)) {
    surfRead = surf;
    stops = new Set(surf.stops); focus = surf.focus ?? null; recCursors = surf.recCursors || [];
  } else {
    const S = (doc.units || doc.sentences || []).length;
    const reach = S <= ADAPTIVE_SURF_MAX_UNITS
      ? (hasThread ? { reach: 'adaptive', thread } : { reach: 'adaptive' })  // small doc: as much as it needs
      : (hasThread ? { thread } : {});                                       // large doc: the bounded window, never O(S)
    surfRead = surfFold(doc, 0, reach);
    stops = new Set(surfRead.stops); focus = surfRead.focus; recCursors = surfRead.recCursors;
  }
  const only = stops.size ? stops : null;

  const propositions = edgesAtStops(doc, only, max);
  const traj = focus ? trajectory(doc, { focus, segments: recCursors }) : null;

  // THE BROADCAST (write/gravity.js, docs/weight-of-the-turn.md). The trajectory used to
  // be computed here and returned as legible structure only — the prompt and the draft
  // were built from the flat propositions alone, so the reader got the conclusions
  // without the arriving-at. Now the arc — the phases, the turns weighted by rewrite
  // magnitude, the relations scored against the live thread — is rendered INTO both
  // surfaces: the no-LLM draft voices the movement (at first…, then…) before saying the
  // remaining edges flat, and the talker prompt carries the arc block plus the cue that
  // teaches turn-rendering. No turn on the log → arc is silent → both surfaces are
  // byte-identical to before, which is the correct failure: a turn is only ever rendered
  // where a REC actually fired.
  const arc = traj ? arcGravity(traj, { surf: surfRead, thread, doc, terrainAware: TERRAIN_GRAVITY }) : null;
  const arcSpeech = arc ? speakArc(arc, {}) : null;
  const arcSection = arc ? arcLines(arc) : '';

  const norm = (s) => String(s ?? '').toLowerCase();
  const draft = arcSpeech
    ? [arcSpeech, speakTriples(propositions.filter((p) => norm(p.subj) !== norm(focus)), {})]
        .filter(Boolean).join(' ')
    : speakTriples(propositions, {});

  const base = rdfRealizationPrompt(doc, { max, only });
  const prompt = arcSection
    ? Object.freeze({
        system: `${base.system} ${ARC_CUE}`,
        user: `${briefRDF(doc, { max, only })}\n\n${arcSection}\n\nNow say this graph as natural speech:`,
      })
    : base;

  return Object.freeze({
    prompt,
    propositions,
    draft,
    rdf: briefRDF(doc, { max, only }),
    thread: [...thread.figures],
    surf: { stops: [...stops], recCursors, focus },
    trajectory: traj,
    arc,
  });
};
