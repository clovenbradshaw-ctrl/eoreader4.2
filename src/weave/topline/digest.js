// EO: SYN·SEG·EVA(Network,Field → Network,Lens, Composing,Dissecting,Tracing) — the entity digest
// The explore-model companion to the topline (docs/topline.md). A topline is ONE settled line about
// an entity; a digest is the profile a reader DIGS INTO — a deterministic spine that is always there
// (the chapter bullets: where this referent moves through the reading, chapter by chapter) plus two
// on-demand readings the reader pulls only when they lean in: what the record MOST witnesses about it
// (Most important) and what stands out AGAINST that through-line (Most surprising).
//
// The discipline is the topline's, unchanged: the model never sees the source, only a CLOSED set of
// objects the machinery already decided. Every phrasing here is phraseAll — one object, one bullet,
// each gated by containment (contain.js), so a bullet can rephrase but never add. "Most surprising"
// is a SELECTION from the closed set (the outlier claim), never a judgement the model reaches for —
// the surprise is measured off the record's own footing; the model only phrases the claim it picks.
//
// Nothing here reads source text or wall-clock time. Selection is pure; the caller stamps the time.

import { entityInventory } from './adapt.js';
import { buildInventory } from './inventory.js';
import { phraseAll } from './phrase.js';
import { generateTopline } from './topline.js';

const cite = (xs) => (xs || []).map((x) => (typeof x === 'number' ? x : x?.idx)).filter((n) => Number.isInteger(n));
const words = (v) => (String(v || '').toLowerCase().match(/\p{L}+/gu) || []);
const wordSet = (v) => new Set(words(v));

// A structural heading read off a coarse-unit's opening line (mirrors surfer/levels.js HEADING_RE,
// kept local so the digest doesn't reach across faculties). A short line that OPENS a division the
// author already cut — CHAPTER / BOOK / PART / a bare roman or arabic numeral.
const HEADING_RE = /^\s*(chapter|book|part|canto|act|scene|volume|epilogue|prologue|preface)\b|^\s*[IVXLCDM]{1,7}\.?\s*$|^\s*\d{1,3}\.?\s*$/i;
const headingLabel = (s) => {
  const t = String(s || '').replace(/^#{1,6}\s+/, '').replace(/\s*#+$/, '').trim();
  if (!t) return '';
  return t.length <= 64 ? t : t.slice(0, 61).trim() + '…';
};

// The salient mention in a group — the one that best CHARACTERISES the entity there. Prefer the
// longest span (most content) but cap the reach so one runaway sentence never wins on length alone;
// tie-break to the earliest, so a chapter's bullet reads in reading order.
const salientMention = (mentions) => {
  let best = null; let bestScore = -1;
  for (const m of mentions) {
    const len = Math.min(String(m.text || '').length, 240);
    if (len > bestScore) { best = m; bestScore = len; }
  }
  return best || mentions[0] || null;
};

// ── the chapter spine — deterministic, model-free, always present ─────────────
// Group an entity's mentions into the document's coarse grain and emit one bullet per chapter it
// appears in. STRUCTURAL grain (the author's own chapter lines) uses the heading as the label; any
// other grain (a short or unstructured document) is split into a few even quantile windows over the
// mention span, so the spine is legible whether or not the author cut chapters.
//
//   bounds  — the coarse-unit starts, as sentence indices (surfer/levels.js detectGrain .bounds)
//   mode    — 'structural' | 'window' | 'sentence' | 'empty' (detectGrain .mode)
//   sentences — the document's sentences (only sentences[bound] is read, for the label)
//   mentions  — [{ idx, text, t0?, t1? }] the entity's mentions (app.entityProfile .mentions)
//
// Returns [{ chapterIdx, label, start, end, mentionCount, bullet:{ idx, text }, mentions }],
// chapterIdx a STABLE id (the bound's position for structural; the window ordinal otherwise), so a
// pulled-on-demand reading can be cached against it.
export const chapterBullets = ({ bounds = [], mode = 'window', sentences = [], mentions = [] } = {}) => {
  const ms = (mentions || []).filter((m) => Number.isInteger(m.idx) && m.text).sort((a, b) => a.idx - b.idx);
  if (!ms.length) return [];
  const n = sentences.length || (ms[ms.length - 1].idx + 1);

  // STRUCTURAL: real chapters, bounded by the author's heading lines. Keep only the chapters the
  // entity actually appears in, but number them by their true position so the id stays stable.
  if (mode === 'structural' && bounds.length >= 2) {
    const out = [];
    for (let k = 0; k < bounds.length; k++) {
      const start = bounds[k];
      const end = k + 1 < bounds.length ? bounds[k + 1] : n;
      const inChap = ms.filter((m) => m.idx >= start && m.idx < end);
      if (!inChap.length) continue;
      const head = HEADING_RE.test(String(sentences[start] || '')) ? headingLabel(sentences[start]) : '';
      const label = head || (k === 0 ? 'Opening' : `Part ${k + 1}`);
      out.push({ chapterIdx: k, label, start, end, mentionCount: inChap.length, bullet: salientMention(inChap), mentions: inChap });
    }
    if (out.length) return out;
  }

  // OTHERWISE (short / unstructured): split the mentions into a handful of even quantile windows,
  // each a contiguous run of mentions, so every part carries content. One part when the mentions are
  // few; up to five when they are many. Labelled by position in the reading.
  const K = Math.max(1, Math.min(5, Math.ceil(ms.length / 2)));
  if (K === 1) {
    return [{ chapterIdx: 0, label: 'The reading', start: ms[0].idx, end: n, mentionCount: ms.length, bullet: salientMention(ms), mentions: ms }];
  }
  const per = Math.ceil(ms.length / K);
  const PLACE = ['Opening', 'Early on', 'Midway', 'Later', 'Toward the end'];
  const out = [];
  for (let k = 0; k < K; k++) {
    const grp = ms.slice(k * per, (k + 1) * per);
    if (!grp.length) continue;
    const start = grp[0].idx;
    const end = k + 1 < K && ms[(k + 1) * per] ? ms[(k + 1) * per].idx : n;
    const label = K <= PLACE.length ? PLACE[k] : `Part ${k + 1}`;
    out.push({ chapterIdx: k, label, start, end, mentionCount: grp.length, bullet: salientMention(grp), mentions: grp });
  }
  return out;
};

// ── Most important — the record's strongest standing about this entity ────────
// The closed set is exactly the entity's ranked properties (adapt.entityInventory already selects
// and orders them); phraseAll turns each into one grounded bullet. This is the topline's inventory,
// read as a LIST rather than joined into a line — the reader wanted the parts laid out, not fused.
const importantBullets = async (profile, { model = null, signal = null } = {}) => {
  const inv = entityInventory(profile, { maxClaims: 4, maxRelations: 2 });
  // Drop the pure tally facts (appears in N passages / linked to N) — they are the header's job, not
  // a "most important" bullet. Keep claims, relations, and the gap.
  const objects = inv.objects.filter((o) => o.type !== 'fact');
  if (!objects.length) return [];
  const bullets = await phraseAll({ ...inv, objects }, { model, signal });
  return bullets.map((b) => ({ text: b.text, cite: b.cite || [], type: b.type }));
};

// ── Most surprising — the outlier, measured off the record's own footing ──────
// The surprise of a standing property, scored from what the record already recorded about it — never
// from the model. A property SURPRISES when it reverses (a negation), rests on unusual footing (a
// hedged / non-realis modality), is a singular specific detail (witnessed once, but a full phrase),
// or diverges in content from the entity's dominant property. The through-line — the thing witnessed
// again and again — is the LEAST surprising, so frequency counts against surprise.
const surpriseScore = (d, topWords) => {
  let s = 0;
  if (d.polarity === '−') s += 3;                                   // a reversal of expectation
  if (d.modality && d.modality !== 'realis') s += 1.5;             // stated on hedged / possible footing
  const w = words(d.value);
  s += Math.min(w.length, 8) * 0.22;                              // a fuller phrase is a more specific detail
  const cnt = d.count || 1;
  s += cnt === 1 ? 1 : (cnt >= 3 ? -1.2 : 0);                     // the singular detail vs the through-line
  if (topWords && topWords.size) {                                 // content divergence from the dominant property
    const ct = wordSet(d.value);
    const shared = [...ct].filter((t) => topWords.has(t)).length;
    const div = ct.size ? 1 - shared / ct.size : 0;
    s += div * 1.5;
  }
  return s;
};
const SURPRISE_FLOOR = 1.6;

const surprisingBullets = async (profile, { model = null, signal = null, exclude = new Set() } = {}) => {
  const defs = (profile?.defs || []).filter((d) => d.value && !exclude.has(String(d.value).toLowerCase()));
  if (defs.length < 2) return [];                                  // nothing to stand OUT against
  const top = defs[0];                                             // the dominant (highest-ranked) property
  const topWords = wordSet(top.value);
  const scored = defs.slice(1)                                     // never the dominant property itself
    .map((d) => ({ d, s: surpriseScore(d, topWords) }))
    .filter((x) => x.s >= SURPRISE_FLOOR)
    .sort((a, b) => b.s - a.s)
    .slice(0, 2);
  if (!scored.length) return [];
  const label = profile?.label || profile?.subject || 'this entity';
  const claims = scored.map(({ d }) => ({
    subject: label, value: d.value, cite: cite(d.witnesses?.length ? d.witnesses : [d.idx]),
    count: d.count || 1, polarity: d.polarity, modality: d.modality,
  }));
  const inv = buildInventory({ subject: label, claims, relations: [], facts: [], gap: null, allowInference: false });
  if (!inv.objects.length) return [];
  const bullets = await phraseAll(inv, { model, signal });
  return bullets.map((b) => ({ text: b.text, cite: b.cite || [], type: b.type }));
};

// The whole digest for an entity: the two on-demand readings. The chapter spine is computed
// separately (chapterBullets) because it is deterministic and needs no model — it is always shown,
// while THIS is pulled only when the reader leans in. Model-optional: with none, the mechanical
// telegram bullets stand (still honest, still grounded). Never throws.
export const composeEntityDigest = async (profile, { model = null, signal = null } = {}) => {
  let important = []; let surprising = [];
  try { important = await importantBullets(profile, { model, signal }); } catch { important = []; }
  // Don't repeat an important bullet's claim as a surprise — exclude the dominant property's value.
  const exclude = new Set((profile?.defs || []).slice(0, 1).map((d) => String(d.value || '').toLowerCase()));
  try { surprising = await surprisingBullets(profile, { model, signal, exclude }); } catch { surprising = []; }
  return {
    important, surprising,
    hasImportant: important.length > 0, hasSurprising: surprising.length > 0,
    modelless: !model,
  };
};

// ── going deeper — the fold-prompted reading of an entity WITHIN one chapter ──
// The reader has opened a chapter bullet and wants to read closer. The FOLD is that chapter: the
// entity's mentions inside its bounds and the standing properties the record witnesses there. We
// scope the profile to that fold and run the ordinary two-pass topline over it, so the reading is
// this chapter's reading of the referent — grounded, containment-gated, cited to passages in range.
//
//   chapter — one entry from chapterBullets ({ start, end, mentions, ... })
//   profile — the full entity profile (its defs carry witnessing sentence indices)
export const composeChapterReading = async (profile, chapter, { model = null, signal = null } = {}) => {
  const start = chapter?.start ?? 0;
  const end = chapter?.end ?? Infinity;
  const inRange = (i) => Number.isInteger(i) && i >= start && i < end;
  // The properties this chapter witnesses — a def whose witnessing passages fall in the fold.
  const defs = (profile?.defs || [])
    .map((d) => ({ ...d, witnesses: (d.witnesses || []).filter((w) => inRange(w.idx ?? w)) }))
    .filter((d) => d.witnesses.length);
  const mentions = (chapter?.mentions || []);
  // figures dropped so the GLOBAL "linked to N other entities" tally never leaks into a chapter's
  // reading — the fold is this chapter, and only its in-range mentions/properties belong to it.
  const scoped = { ...profile, defs, mentions, figures: [] };
  const inv = entityInventory(scoped, { mentionCount: mentions.length, sourceCount: 1 });
  const reading = await generateTopline({ inventory: inv, model, signal });
  return {
    label: chapter?.label || '', start, end,
    text: reading.text, telegram: reading.telegram, joined: reading.joined,
    objects: reading.objects, cites: reading.cites, kind: reading.kind,
    modelless: !model,
  };
};

// ── zooming in — the passage, and the fold-prompted close reading of one moment ──
// The reader has opened a chapter and clicked a single mention: they want to ZOOM into that moment.
// Zooming is the same fold discipline, tightened — the fold is now just this passage's NEIGHBOURHOOD,
// the few sentences around it. `passageNeighborhood` is the deterministic context (always shown, no
// model): the sentence itself and its neighbours, the centre marked. `composePassageReading` runs the
// two-pass topline over that tight window alone, so the reading is of the referent AT this instant —
// the deepest zoom, still grounded and cited to passages inside the window.

// The neighbourhood of a passage — a small symmetric window of sentences around `idx`, the centre
// marked. Pure and model-free; the context the reader reads while zoomed in. Clamped to the document.
export const passageNeighborhood = ({ sentences = [], idx = 0, radius = 2 } = {}) => {
  const n = sentences.length;
  if (!n || !Number.isInteger(idx)) return { center: idx, start: idx, end: idx, lines: [] };
  const start = Math.max(0, idx - radius);
  const end = Math.min(n - 1, idx + radius);
  const lines = [];
  for (let i = start; i <= end; i++) {
    const text = String(sentences[i] || '').trim();
    if (text) lines.push({ idx: i, text, center: i === idx });
  }
  return { center: idx, start, end, lines };
};

// The fold-prompted close reading of one moment — the two-pass topline scoped to a passage's
// neighbourhood [idx-radius, idx+radius]. The tightest fold: only the entity's mentions and the
// properties the record witnesses inside that window. Reuses composeChapterReading over a synthetic
// window "chapter", so the zoom is the same grounded, containment-gated reading, one level deeper.
//
//   idx     — the centre sentence (the mention the reader clicked)
//   windowMentions — the entity's mentions that fall inside the window (app builds these from range)
export const composePassageReading = async (profile, { idx = 0, radius = 2, windowMentions = [], label = '' } = {}, { model = null, signal = null } = {}) => {
  const start = Math.max(0, idx - radius);
  const end = idx + radius + 1;                       // exclusive upper bound (composeChapterReading uses < end)
  const chapter = { label: label || `¶${idx}`, start, end, mentions: windowMentions };
  const reading = await composeChapterReading(profile, chapter, { model, signal });
  return { ...reading, center: idx };
};
