// EO: SIG·CON(Entity,Field → Entity,Link, Making,Binding) — engine → terrain-scene bridge
// project.js — where scene.js is a hand-read passage for the standalone demo, this reads whatever
// the person has actually ingested and builds the SAME scene shape from it, so the Terrains tab
// paints real documents. It reads the active topic's first source, parses it once, and derives the
// terrains we can honestly recover from the parse:
//
//   Entity (Existence·Figure)  the INS figures, coref-collapsed to a stable id
//   Link   (Structure·Figure)  the CON/SIG relations, with the surface verb + endpoints
//   Field  (Structure·Ground)  relational density per sentence
//
// The interpretive terrains (Lens/Paradigm/Atmosphere) and the categorical patterns (Kind/Network)
// are left empty here — they take a reading the parse alone doesn't give — so the surface dims those
// cells in live mode. Everything is best-effort and defensive: a missing method or an empty topic
// returns null, and the surface falls back to the worked demo scene.

import { parseText } from '../../perceiver/parse/index.js';
import { projectGraph } from '../../core/index.js';

// The active topic's sources (same read as the plain room), each with its recorded text.
const liveSources = (app) => {
  if (!app) return [];
  let srcs = [];
  try { srcs = app.topicSources ? app.topicSources() : (app.state && app.state.sources) || []; } catch { srcs = []; }
  return (srcs || []).map((s) => ({
    id: String(s.sn ?? s.id ?? s.docId ?? s.title ?? ''),
    label: s.title || s.label || s.url || (s.sn != null ? `source ${s.sn}` : 'source'),
    text: s.text || '',
  })).filter((s) => s.id && s.text);
};

const events = (doc) => (typeof doc.log?.snapshot === 'function' ? doc.log.snapshot() : (doc.log?.events || []));

// Build a terrain scene from one source's recorded text. Pure given the injected parser.
export const sceneFromText = (text, { label = 'source', docId = 'live', parse = parseText, maxSent = 40 } = {}) => {
  const doc = parse(text || '', { docId });
  const sentences = (doc.sentences || []).slice(0, maxSent);
  if (!sentences.length) return null;
  const inWindow = (i) => Number.isInteger(i) && i >= 0 && i < sentences.length;

  const rep = (() => { try { return projectGraph(doc.log).representative || ((id) => id); } catch { return (id) => id; } })();
  const label_ = new Map();
  const evs = events(doc);
  for (const e of evs) if (e.op === 'INS' && !label_.has(e.id)) label_.set(e.id, e.label);

  // Entities: each INS mention placed in its sentence, coref-collapsed to a stable id. The surface
  // resolves the surface form to a span by substring, so a label the parser normalised away simply
  // doesn't mark — never a wrong offset.
  const ENTITIES = [];
  const seen = new Set();
  for (const e of evs) {
    if (e.op !== 'INS' || !inWindow(e.sentIdx) || !e.label) continue;
    const id = rep(e.id);
    const key = `${id}@${e.sentIdx}`;
    if (seen.has(key)) continue; seen.add(key);
    if (!sentences[e.sentIdx].includes(e.label)) continue;   // only mark what we can actually find
    ENTITIES.push({ id, sent: e.sentIdx, text: e.label });
  }

  // Links: the CON/SIG relations, verb + endpoints, in their sentence. Density (Field) counts them.
  const LINKS = [];
  const density = new Array(sentences.length).fill(0);
  for (const e of evs) {
    if ((e.op !== 'CON' && e.op !== 'SIG') || !inWindow(e.sentIdx)) continue;
    if (inWindow(e.sentIdx)) density[e.sentIdx] += 1;
    if (!e.via || !sentences[e.sentIdx].includes(e.via)) continue;
    LINKS.push({ sent: e.sentIdx, text: e.via, src: rep(e.src), tgt: rep(e.tgt), rel: e.via, polarity: e.polarity || '+' });
  }
  const maxD = Math.max(1, ...density);
  const FIELD = density.map((d) => d / maxD);

  return {
    TITLE: label, SENTENCES: sentences,
    ENTITIES, LINKS, FIELD,
    LENSES: [], VOIDS: [], ATMOSPHERE: [], PARADIGM: [],   // interpretive terrains: not recovered here
    live: true,
  };
};

// The live scene for the Terrains tab: the active topic's first readable source, or null when the
// person has ingested nothing yet (the surface then shows the worked demo scene).
export const liveScene = (app, { parse = parseText } = {}) => {
  const src = liveSources(app)[0];
  if (!src) return null;
  try { return sceneFromText(src.text, { label: src.label, docId: src.id, parse }); }
  catch { return null; }
};
