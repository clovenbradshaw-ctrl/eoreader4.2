// EO: SYN·SIG·CON(Network → Network,Field, Composing,Tracing,Binding) — the brief as RDF-star + EO annotations
// The brief as RDF-star — triples the LLM already knows, annotated with the EO richness.
//
// A flat x→relation→y triple is a standard an LLM has seen a million times (RDF/Turtle/OWL),
// so it is a good carrier. But a bare triple throws away everything that makes the edge an EO
// edge: WHICH operator drew it, WHERE on the cube it lands (the site terrain), HOW DEFINITELY
// it holds (the resolution band), WHEN it was constituted (the arrow of time), and WHOSE it is
// (the provenance door). We keep the triple as the spine and hang that richness off it with
// RDF-star quoted-triple annotations — `<< s p o >> eo:op … ; eo:site … ; eo:band …` — under a
// small eo: vocabulary. The LLM reads the triple as content and the annotations as how to say
// it: a hedged band → "seems to"; a firm one → asserted; the order → narrative sequence; a
// Network site → a recurring pattern, a Link → a single relation. Nothing distributional here —
// the annotations are read straight off the log's operators, so this is the EO graph expressed
// in a notation the model can consume, not a translation that loses it.

import { siteTerrainAt } from '../../surfer/index.js';

const PREFIXES = [
  '@prefix eo: <https://eoreader.dev/onto#> .',   // the EO vocabulary (operators, sites, bands, doors)
  '@prefix ex: <https://eoreader.dev/inst#> .',   // this document's instances (figures)
  '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
];

// a safe QName fragment from a label; entities → ex:, relations → eo:.
const localName = (s) => String(s).trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
const ent = (s) => `ex:${localName(s)}`;
const rel = (s) => `eo:${localName(s)}`;

// the resolution BAND from a bond's coupling/weight: firm (held), hedged (sub-unit, glimpsed),
// void (carved absent). The Born/deriveNull resolution, expressed as how definitely it holds.
const bandOf = (e) => {
  const w = e.coupling != null ? e.coupling : (e.w != null ? e.w : 1);
  if (w <= 0) return 'void';
  return w >= 1 ? 'firm' : 'hedged';
};

// briefRDF(doc, { max }) → the document's grounded edges as RDF-star Turtle, each triple
// annotated with its EO richness (operator · site terrain · resolution band · order · door).
// The OWL line types the figures and relations so the ontology travels too. Entity-valued
// objects are ex: resources; literal objects (a noun the graph did not admit) are strings.
export const briefRDF = (doc, { max = 12, only = null } = {}) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, e.label);
  const isEntity = (id) => label.has(id);
  const L = (id) => label.get(id) ?? id;

  const figures = new Set();
  const relations = new Set();
  const lines = [];
  let n = 0;
  for (const e of events) {
    if (!((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null)) continue;
    if (only && e.sentIdx != null && !only.has(e.sentIdx)) continue;   // restrict to the salient stops
    if (n >= max) break;
    n += 1;
    const s = ent(L(e.src));
    const p = rel(e.via);
    const oIsEnt = e.tgt != null && isEntity(e.tgt);
    const o = e.tgt == null ? '""' : (oIsEnt ? ent(L(e.tgt)) : JSON.stringify(String(L(e.tgt))));
    figures.add(s);
    if (oIsEnt) figures.add(o);
    relations.add(p);
    const order = e.sentIdx ?? 0;
    const site = siteTerrainAt(doc, order);
    // the spine triple, then its EO annotation as an RDF-star quoted triple. The door is read
    // off the event (EOT notes are the model's reafference → "enactor"; prose read from the
    // world → "perceiver"), so the talker can see what is witnessed vs what is interpreted.
    const door = e.door ?? (e.prov?.door) ?? 'perceiver';
    lines.push(`${s} ${p} ${o} .`);
    lines.push(`<< ${s} ${p} ${o} >> eo:op "${e.op}" ; eo:site "${site}" ; eo:band "${bandOf(e)}" ; eo:order ${order} ; eo:door "${door}" .`);
  }

  const decls = [
    ...[...figures].map((f) => `${f} a owl:NamedIndividual .`),
    ...[...relations].map((r) => `${r} a owl:ObjectProperty .`),
  ];
  return [...PREFIXES, '', ...decls, '', ...lines].join('\n');
};

// rdfRealizationPrompt(doc, opts) → feed the talker the EO graph in RDF-star, and teach it to
// READ the annotations as delivery cues. The triple is the fact; the eo: annotations are how
// to say it (band → certainty, order → sequence, site → one-off vs recurring). The veto
// (talkThenVerify) still strips any edge it invents — grounding enforced after, not nagged.
export const rdfRealizationPrompt = (doc, { max = 12, only = null } = {}) => Object.freeze({
  system: 'You are the voice that turns a reading into words. You are given a small RDF graph '
    + 'of relations from a text (Turtle, with RDF-star annotations). Each `s p o` triple is a '
    + 'fact; the `<< s p o >> eo:…` annotation is HOW to say it: eo:band "firm" → assert it, '
    + '"hedged" → say it tentatively ("seems to"), "void" → an absence; eo:order is the '
    + 'sequence to narrate in; eo:site "Network" is a recurring pattern, "Link" a single '
    + 'relation. Say it as fluent, natural speech, honouring those cues. Keep to the graph — '
    + 'add no relation it does not contain.',
  user: `${briefRDF(doc, { max, only })}\n\nNow say this graph as natural speech:`,
});
