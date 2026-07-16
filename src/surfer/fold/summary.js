// EO: SEG·SYN·EVA(Field,Network → Lens, Clearing,Composing,Tracing) — the summary fold; fold → summary packet
// fold/summary.js — the FOLD → SUMMARY pipeline, fold side.
//
// The topline (weave/topline) composes a summary from controller-side scraps — ranked
// properties and tallies — and never reads the fold. The fold (integral.js, substrate.js,
// project.js) already computes the richest reading the engine has of a place: the settled
// bonds, the held-open tensions, the located turns, every line carrying its witness. This
// module is the missing join: it walks the surfer to a place (or over the whole document),
// folds there, and packages the result as ONE object — the SUMMARY PACKET — that both a
// deterministic telegram and a model voice (summary-prompt.js) can realize, and that a
// bench can score without re-deriving anything.
//
// The packet is scoped four ways — the four summaries a reader actually asks for:
//
//   full     the whole document: adaptive-reach surf (the noise null decides how much is
//            structure), fold at the peak, spans at every stop. "What is this?"
//   cursor   a PLACE: the reading around one sentence — the fold the deep reader takes,
//            exposed as a summary scope so any point of the document can be summarized
//            from where it stands. "What is going on here?"
//   entity   a REFERENT: the fold turns on a named figure — everything tied to it,
//            coreference collapsed (figureSurface), the surf thread-conditioned toward it
//            so the spans are its spans, not the document's loudest. "What does this
//            document say about X?"
//   topic    a THEME: the surf is thread-conditioned on the topic's terms; the packet is
//            the reading of the document AS IT BEARS ON the topic. "What does this say
//            about warfare / the landing / the trial?"
//
// Holon discipline: `surf` is INJECTED, exactly as deep-reading.js injects it — fold/
// imports no surfer internals, the caller wires surfFold (or a test double). Everything
// else the packet carries is computed from the doc's own log and the perceiver's surfaces.
//
// Every line of the packet is MEMBRANE-SAFE (labels and prose, no ids, no [sN]); the
// witness indices ride on `sources`/`spans[].idx` — the machine channel — never in text.

import { namedReferents, figureSurface, rankProperties, plainRel } from '../../perceiver/index.js';
import { tok } from '../../perceiver/parse/index.js';
import { foldNote } from './integral.js';
import { projectNotes } from './project.js';
import { arcStops } from './summary-arc.js';

const DEFAULTS = Object.freeze({ maxSpans: 8, maxRelations: 6, maxProperties: 6, maxFigures: 8 });

// The thread a topic or entity phrase activates — a bare term Map in the shape
// surfer/salience.js reads (term → weight). Stop-words are already outside `tok`.
const termThread = (phrase) => {
  const m = new Map();
  for (const t of tok(String(phrase || ''))) m.set(t, (m.get(t) || 0) + 1);
  return m;
};

const sentAt = (doc) => (i) => String((doc.units || doc.sentences || [])[i] ?? '');

// The verbatim spans a summary reads beside the notes: the surf's stops (strongest
// first), re-ordered to reading order so the passage block reads as the document does.
const spansAtStops = (doc, stops, scoreAt, max) => {
  const say = sentAt(doc);
  const picked = [...stops].sort((a, b) => scoreAt(b) - scoreAt(a)).slice(0, max);
  return picked.sort((a, b) => a - b).map((idx) => ({ idx, text: say(idx) })).filter((s) => s.text.trim());
};

// A relation worth a summary's attention: both endpoints named (a label, not an id
// residue) and the verb non-degenerate. The fold keeps everything; the SUMMARY packet
// is a ranked selection — what a reader would put in a summary, not a dump.
const summaryRelations = (relations, max) => {
  const seen = new Set();
  const out = [];
  for (const r of relations || []) {
    const via = plainRel(r.via);
    if (via === 'linked-to') continue;                     // a bond with no verb says nothing here
    const key = `${r.src.id}|${r.polarity === '−' ? 'not-' : ''}${via}|${r.tgt.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      subject: r.src.label, verb: via.replace(/-/g, ' '), object: r.tgt.label,
      polarity: r.polarity === '−' ? '−' : '+', idx: r.idx ?? null,
    });
    if (out.length >= max) break;
  }
  return out;
};

// summaryFold — doc → the summary packet, at one of the four scopes.
//   surf     INJECTED — (doc, anchor, opts) => surfFold result. Required.
//   scope    'full' | 'cursor' | 'entity' | 'topic'
//   cursor   the place, for scope 'cursor'
//   entity   the referent's name as a reader would say it, for scope 'entity'
//   topic    the theme phrase, for scope 'topic'
//   coverage 'peak' (the adaptive surf's own stops — the default, unchanged) | 'arc'
//            (full scope only: stops stratified across the whole work, for the
//            paragraph-tier "summarize the entire novel" packet)
//   grain    INJECTED, optional — (doc) => { bounds } (the caller wires detectGrain);
//            only read by the arc coverage, which falls back to even quantiles.
export const summaryFold = (doc, {
  surf, scope = 'full', cursor = null, entity = null, topic = null, title = null,
  coverage = 'peak', grain = null,
  maxSpans = DEFAULTS.maxSpans, maxRelations = DEFAULTS.maxRelations,
  maxProperties = DEFAULTS.maxProperties, maxFigures = DEFAULTS.maxFigures,
} = {}) => {
  if (typeof surf !== 'function') throw new Error('summaryFold: surf(doc, anchor, opts) must be injected');
  if (!doc || !doc.log) return null;
  const sents = doc.units || doc.sentences || [];
  if (!sents.length) return null;

  // Where the surf sets down, and what conditions it, per scope.
  let anchor = 0;
  let surfOpts = { reach: 'adaptive' };
  let focus = [];
  if (scope === 'cursor') {
    anchor = Math.max(0, Math.min(sents.length - 1, cursor | 0));
    surfOpts = {};                                          // the local reach — the deep reader's window
  } else if (scope === 'entity' && entity) {
    focus = namedReferents(doc, entity);
    // set down at the referent's first mention; ride the thread of its name AND its ids,
    // so the stops are the referent's places (coref-resolved), not the document's loudest.
    const firstMention = Math.min(...focus.map((id) => (doc.mentions?.get?.(id) || [Infinity])[0]));
    anchor = Number.isFinite(firstMention) ? firstMention : 0;
    surfOpts = { reach: 'adaptive', thread: { terms: termThread(entity), figures: new Set(focus) } };
  } else if (scope === 'topic' && topic) {
    surfOpts = { reach: 'adaptive', thread: termThread(topic) };
  }

  // The walk: one surf at the scope's anchor (the default), or — full scope, arc
  // coverage, a document long enough to have an arc — one local surf per sampled
  // segment so the stops span the whole work. A failed arc falls back to the peak
  // walk rather than returning nothing.
  let walk = null;
  const wantsArc = scope === 'full' && coverage === 'arc' && sents.length > 40;
  if (wantsArc) walk = arcStops(doc, surf, { grain, want: maxSpans });
  let surfed = null;
  if (!walk) {
    surfed = surf(doc, anchor, surfOpts) || null;
    if (!surfed || !Array.isArray(surfed.stops) || !surfed.stops.length) return null;
    const byIdx = new Map((surfed.field || []).map((f) => [f.idx, f.bayes]));
    walk = { stops: surfed.stops, peak: surfed.peak, scoreAt: (c) => byIdx.get(c) ?? 0 };
  }
  const s = { stops: walk.stops, peak: walk.peak };

  const spans = spansAtStops(doc, s.stops, walk.scoreAt, maxSpans);
  const fold = foldNote(spans, { doc, cursor: s.peak, focus, surf: surfed, grouped: true });

  // The three groups (settled / held open / turns) off the substrate when the grouped
  // fold produced one; else the flat note split to lines — either way membrane-safe.
  const groups = fold.substrate
    ? projectNotes(fold.substrate)
    : { settled: String(fold.text || '').split('\n').filter(Boolean), heldOpen: [], turns: [] };

  // The structure the properties/relations rank over: the referent's own neighbourhood
  // at entity scope (everything tied to it, coref collapsed), the window's otherwise.
  const structure = (scope === 'entity' && focus.length)
    ? figureSurface(doc, focus)
    : (fold.levels?.structure || { figures: [], relations: [], defs: [] });

  const properties = rankProperties(structure.defs).slice(0, maxProperties)
    .map(({ label, value, witnesses, count, score }) => ({ label, value, witnesses, count, score }));
  const relations = summaryRelations(structure.relations, maxRelations);
  const figures = (structure.figures || []).slice(0, maxFigures).map((f) => ({ label: f.label, count: f.count }));

  const labelOf = (id) => doc.admission?.labelOf?.(id) || id;

  return Object.freeze({
    scope, coverage: wantsArc && !surfed ? 'arc' : 'peak',
    docId: doc.docId ?? null, title: title || null,
    anchor, cursor: s.peak, stops: [...s.stops],
    focus: focus.map(labelOf),
    entity: entity || null, topic: topic || null,
    spans, groups, properties, relations, figures,
    sources: fold.sources || spans.map((x) => x.idx),
  });
};

// ── the telegram — the model-free floor ──────────────────────────────────────────────
// A summary that is ALWAYS available: the packet's strongest properties and bonds set
// down as short plain sentences, held-open matter voiced as held open. Never fluent,
// never false — the same floor discipline as the topline's telegram, but sourced from
// the fold. The model voice (summary-prompt.js) rewrites ON TOP of this packet and
// falls back here when its output adds a name or number the packet never carried.

const cleanValue = (v) => String(v || '').trim().replace(/\s+/g, ' ').replace(/[,;]$/, '');
const sentenceCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const ensureStop = (s) => (/[.!?]$/.test(s) ? s : s + '.');

// The property a summary should LEAD with: rankProperties orders by evidential
// strength, but a lead line also has to read as an identification. A value that
// opens on a bare number ("11, he dropped out of school") or dangles a clause
// fragment identifies nothing at the head of a summary — prefer the strongest
// property that reads nominal; fall back to rank order when none does.
export const pickLeadProperty = (properties) => {
  const ps = properties || [];
  const nominal = (v) => {
    const t = cleanValue(v);
    return t && !/^\d/.test(t) && !/^(?:he|she|it|they|who|which|that)\b/i.test(t) && t.split(/\s+/).length >= 2;
  };
  return ps.find((p) => nominal(p.value)) || ps[0] || null;
};

export const telegramSummary = (packet, { maxSentences = 5 } = {}) => {
  if (!packet) return '';
  const out = [];
  const said = new Set();
  const say = (s) => {
    const t = ensureStop(sentenceCase(cleanValue(s)));
    const key = t.toLowerCase();
    if (!t || said.has(key)) return;
    said.add(key);
    out.push(t);
  };

  // Lead: the strongest standing property of the packet's own centre that reads
  // as an identification.
  const lead = pickLeadProperty(packet.properties);
  if (lead) say(`${lead.label} — ${cleanValue(lead.value)}`);

  // The strongest bonds, one sentence each.
  for (const r of packet.relations || []) {
    if (out.length >= maxSentences - 1) break;
    say(`${r.subject} ${r.polarity === '−' ? 'does not ' : ''}${r.verb} ${r.object}`);
  }

  // A second property if room remains.
  const second = (packet.properties || []).find((p) => p !== lead);
  if (second && out.length < maxSentences - 1) say(`${second.label} — ${cleanValue(second.value)}`);

  // What the document holds open stays open — the void band voiced, never settled.
  const held = packet.groups?.heldOpen?.[0];
  if (held && out.length < maxSentences) say(`Left unsettled: ${held}`);

  return out.slice(0, maxSentences).join(' ');
};

// The packet's SURFACE — every word a summary is licensed to use. The membrane the
// referential gate (summary-prompt.js summaryAdditions) checks against: spans, group
// lines, properties, relations, figures, title, focus. One string, built once.
export const packetSurface = (packet) => {
  if (!packet) return '';
  const parts = [];
  for (const s of packet.spans || []) parts.push(s.text);
  const g = packet.groups || {};
  for (const line of [...(g.settled || []), ...(g.heldOpen || []), ...(g.turns || [])]) parts.push(line);
  for (const p of packet.properties || []) parts.push(`${p.label} ${p.value}`);
  for (const r of packet.relations || []) parts.push(`${r.subject} ${r.verb} ${r.object}`);
  for (const f of packet.figures || []) parts.push(f.label);
  if (packet.title) parts.push(packet.title);
  for (const f of packet.focus || []) parts.push(f);
  if (packet.entity) parts.push(packet.entity);
  if (packet.topic) parts.push(packet.topic);
  if (packet.referent) parts.push(packet.referent);              // a cross-source referent packet
  for (const d of packet.docs || []) if (d.title) parts.push(d.title);
  return parts.join('\n');
};
