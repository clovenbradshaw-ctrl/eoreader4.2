// EO: SEG·CON(Entity,Link → Link,Lens, Dissecting,Binding) — the terrain-overlay fold
// overlay.js — the pure fold behind the demo: (scene, active channels) → one render
// model the surface paints. No DOM, no state. Render it twice, get the same model.
//
// The one non-trivial move is SEGMENTATION. Several inline terrains (Entity, Link,
// Lens, Void) can mark overlapping runs of the same sentence ("surveillance" is a Lens
// inside the Entity "a surveillance platform"). Rather than nest DOM (which breaks
// selection), we cut each sentence at every mark boundary into disjoint atoms, and each
// atom carries the set of terrains covering it. The surface styles an atom by its
// top-priority terrain but keeps them all, so a click can still route to any.
//
// Channels mirror what the grain of a terrain allows (see the answer / docs):
//   inline   Set of Figure/Void terrains drawn as crisp marks (they STACK)   — 'entity' | 'link' | 'lens' | 'void'
//   recolor  a Pattern-over-figures categorical recolor of the entity marks  — 'identity' | 'kind' | 'network'
//   wash     one ambient/regional background over the sentences              — 'none' | 'field' | 'atmosphere' | 'paradigm'
// The surface enforces single-select on recolor/wash (you can only tint the page one
// way); this fold just reports the geometry for whatever it is handed.

import * as SCENE from './scene.js';

// Resolve a { sent, text, occ? } anchor to a [start, end) span inside its sentence.
// occ (1-based) picks which occurrence when the surface form repeats; default first.
// Returns null when the anchor's text isn't found (a fixture typo shows as a no-op,
// never a crash or a wrong offset).
const spanOf = (sentence, anchor) => {
  const occ = anchor.occ && anchor.occ > 0 ? anchor.occ : 1;
  let from = 0, start = -1;
  for (let k = 0; k < occ; k += 1) {
    start = sentence.indexOf(anchor.text, from);
    if (start < 0) return null;
    from = start + 1;
  }
  return { start, end: start + anchor.text.length };
};

// Which terrains are drawn as inline marks, and the order in which one wins an atom's
// visible style when marks overlap. Lens sits ABOVE Entity so "surveillance" reads as
// a lens even inside the "surveillance platform" entity; Void sits above Link.
const INLINE_PRIORITY = ['lens', 'void', 'link', 'entity'];

// Build the disjoint atoms of one sentence given the marks that land on it. Each mark
// is { layer, start, end, ...payload }. Output atoms tile the sentence exactly, in
// order, each carrying every mark that covers it plus the winning `top` layer.
export const segment = (text, marks) => {
  if (!marks.length) return [{ text, start: 0, end: text.length, marks: [], top: null }];
  const cuts = new Set([0, text.length]);
  for (const m of marks) { cuts.add(m.start); cuts.add(m.end); }
  const points = [...cuts].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);
  const atoms = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i], end = points[i + 1];
    if (end <= start) continue;
    const covering = marks.filter((m) => m.start <= start && m.end >= end);
    let top = null;
    for (const layer of INLINE_PRIORITY) if (covering.some((m) => m.layer === layer)) { top = layer; break; }
    atoms.push({ text: text.slice(start, end), start, end, marks: covering, top });
  }
  return atoms;
};

// The colour key an entity mark carries under the active recolor channel: its own id
// (identity), its kind, or its network cluster. The surface maps the key to a hue.
const entityKey = (ent, recolor) =>
  recolor === 'kind' ? ent.kind : recolor === 'network' ? ent.cluster : ent.id;

// THE FOLD. (channels) → { sentences, arcs, entities, recolor, wash, legend }.
export const buildOverlay = ({ inline = new Set(), recolor = 'identity', wash = 'none' } = {}, scene = SCENE) => {
  const show = (t) => inline.has(t);
  const entitiesBySent = [];
  const sentences = scene.SENTENCES.map((text, sent) => {
    const marks = [];

    if (show('entity')) {
      for (const e of scene.ENTITIES) if (e.sent === sent) {
        const sp = spanOf(text, e); if (!sp) continue;
        marks.push({ layer: 'entity', ...sp, id: e.id, kind: e.kind, cluster: e.cluster,
          colorKey: entityKey(e, recolor) });
      }
    }
    if (show('link')) {
      for (const l of scene.LINKS) if (l.sent === sent) {
        const sp = spanOf(text, l); if (!sp) continue;
        marks.push({ layer: 'link', ...sp, rel: l.rel, src: l.src, tgt: l.tgt, polarity: l.polarity });
      }
    }
    if (show('lens')) {
      for (const x of scene.LENSES) if (x.sent === sent) {
        const sp = spanOf(text, x); if (!sp) continue;
        marks.push({ layer: 'lens', ...sp, id: x.id, senses: x.senses });
      }
    }
    if (show('void')) {
      scene.VOIDS.forEach((v, vi) => {
        if (v.sent !== sent) return;
        const sp = spanOf(text, v); if (!sp) return;
        marks.push({ layer: 'void', ...sp, note: v.note, vi });
      });
    }

    const atoms = segment(text, marks);
    // The chosen wash's value for this sentence (only the active channel is carried).
    const washCell =
      wash === 'field'      ? { kind: 'field', v: scene.FIELD[sent] ?? 0 } :
      wash === 'atmosphere' ? { kind: 'atmosphere', ...scene.ATMOSPHERE[sent] } :
      wash === 'paradigm'   ? { kind: 'paradigm', ...scene.PARADIGM[sent] } : null;

    entitiesBySent.push(marks.filter((m) => m.layer === 'entity'));
    return { sent, text, atoms, wash: washCell };
  });

  // Arcs: one per Link, drawn only when the Link layer is on. Both endpoints must be
  // marked entities that actually rendered (Entity layer on), else the arc is a stub
  // the surface anchors on the verb alone.
  const rendered = new Set();
  if (show('entity')) for (const row of entitiesBySent) for (const e of row) rendered.add(e.id);
  const arcs = show('link') ? scene.LINKS.map((l) => ({
    rel: l.rel, polarity: l.polarity, sent: l.sent, text: l.text,
    from: l.src, to: l.tgt,
    hasFrom: rendered.has(l.src), hasTo: l.tgt != null && rendered.has(l.tgt),
  })) : [];

  return { title: scene.TITLE, sentences, arcs, recolor, wash, inline: [...inline],
    legend: legendFor({ inline, recolor, wash }, scene) };
};

// A small legend the surface prints so a wash/recolor is readable without a manual.
const legendFor = ({ recolor, wash }, scene) => {
  const out = { recolor: null, wash: null };
  if (recolor === 'kind')    out.recolor = { by: 'type', keys: uniq(scene.ENTITIES.map((e) => e.kind)) };
  if (recolor === 'network') out.recolor = { by: 'cluster', keys: uniq(scene.ENTITIES.map((e) => e.cluster)) };
  if (wash === 'field')      out.wash = { of: 'relational density', lo: 'sparse', hi: 'dense' };
  if (wash === 'atmosphere') out.wash = { of: 'meaning-tone', keys: uniq(scene.ATMOSPHERE.map((a) => a.tone)) };
  if (wash === 'paradigm')   out.wash = { of: 'dominant frame', keys: uniq(scene.PARADIGM.map((p) => p.frame)) };
  return out;
};

const uniq = (xs) => [...new Set(xs)];
