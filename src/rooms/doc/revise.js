// EO: SEG·EVA·SYN(Field → Field,Network, Dissecting,Tracing,Composing) — block-by-block revision core
// doc/revise.js — revising a standing document, block by block.
//
// The reader ships a long answer as one text; when the user asks to edit it —
// "better sections", "body paragraphs", "cut the football part", "make it
// shorter" — we treat that text as a standing document (doc/events.js) and
// change it ONE BLOCK AT A TIME, because the whole piece never fits the small
// model's context. This module is the pure core: split the answer into blocks,
// re-ground each against the answer's own retained passages, decide which blocks
// change and how, and shape the single-block revise prompt. No DOM, no model —
// the same purity as project.js, so it is unit-tested in isolation and the app
// driver (_reviseReply) only appends the ops it returns to the doc log.
//
// Nothing here matches the USER's words to decide anything. WHICH blocks change
// and HOW is Born measurement (bornSalience over the block terms) and the read's
// own leads — the same "measure, don't parse" discipline the router runs
// (docs/discourse-routing.md). Regex appears only in blocksFromText, and there it
// PARSES document text (a paragraph split, a literal "## " heading), which is not
// a steering decision.

import { tok, segmentSentences } from '../../perceiver/parse/index.js';
import { bornSalience } from '../../surfer/index.js';
import { groundText, blockGrounding } from './ground.js';

// A term-count profile of one text, the basis bornSalience projects against
// (same shape meta-route.js builds from exemplar phrases).
const profileOf = (text) => {
  const m = new Map();
  for (const t of tok(text)) m.set(t, (m.get(t) || 0) + 1);
  return m;
};

// blocksFromText(text) → [{text, type}] — the answer split into blocks on blank
// lines (exactly what the walk joins paragraphs on, walk.js), one block per
// paragraph so boundaries are preserved (unlike the lossy ≤8-sentence _docSeed).
// A leading #/##/### is a heading, > a quote, an all-bulleted / all-numbered run
// a list; everything else is a paragraph. This is text PARSING, not steering.
export const blocksFromText = (text) => {
  const runs = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  return runs.map((run) => {
    const h = /^(#{1,3})\s+([\s\S]*)$/.exec(run);
    if (h) return { text: h[2].replace(/\s+/g, ' ').trim(), type: 'h' + h[1].length };
    if (/^>\s+/.test(run)) return { text: run.replace(/^>\s+/gm, '').replace(/\s+/g, ' ').trim(), type: 'quote' };
    const lines = run.split('\n');
    if (lines.length && lines.every((l) => /^\s*[-*]\s+/.test(l))) return { text: lines.map((l) => l.replace(/^\s*[-*]\s+/, '')).join('\n'), type: 'ul' };
    if (lines.length && lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return { text: lines.map((l) => l.replace(/^\s*\d+[.)]\s+/, '')).join('\n'), type: 'ol' };
    return { text: run.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(), type: 'p' };
  });
};

// docToMarkdown(doc) → the committed document rendered back to markdown, so the
// chat card re-renders with headings (## …), lists (- …), quotes (> …). Inverse
// of blocksFromText for the block types it recognizes.
export const docToMarkdown = (doc) => {
  const blocks = (doc && doc.blocks) || [];
  return blocks.map((b) => {
    const t = b.type || 'p';
    if (t === 'h1') return '# ' + b.text;
    if (t === 'h2') return '## ' + b.text;
    if (t === 'h3') return '### ' + b.text;
    if (t === 'quote') return String(b.text || '').split('\n').map((l) => '> ' + l).join('\n');
    if (t === 'ul') return String(b.text || '').split('\n').map((l) => '- ' + l).join('\n');
    if (t === 'ol') return String(b.text || '').split('\n').map((l, i) => (i + 1) + '. ' + l).join('\n');
    return b.text;
  }).filter((s) => s && s.trim()).join('\n\n');
};

// outlineOf(doc) → a terse per-block outline (type + first sentence, clipped) —
// the ONLY whole-document object a per-block revise call is ever given, so the
// model has context without the whole essay entering a prompt.
export const outlineOf = (doc, { clip = 84 } = {}) => {
  const blocks = (doc && doc.blocks) || [];
  return blocks.map((b, i) => {
    const first = String(b.text || '').split(/(?<=[.!?])\s/)[0].slice(0, clip);
    const tag = (b.type && b.type !== 'p') ? '[' + b.type + '] ' : '';
    return (i + 1) + '. ' + tag + first;
  }).join('\n');
};

// groundBlock(text, record) → the block's grounding ({kind:'source',…}|{kind:'void'}).
// A whole paragraph has too many content words to clear groundText's 0.5 frac, so
// we ground its STRONGEST sentence and carry that — the honest "this block stands
// on a recorded span" signal, at the grain the span actually supports.
const bestGround = (text, record) => {
  let sents = null;
  try { sents = segmentSentences(text); } catch (_) { sents = null; }
  const spans = (sents && sents.length) ? sents : [String(text || '')];
  let best = { grounded: false, overlap: 0, frac: 0, span: null };
  for (const s of spans) {
    const g = groundText(s, record);
    if ((g.grounded && !best.grounded) || g.frac > best.frac) best = g;
  }
  return best;
};
export const groundBlock = (text, record) => blockGrounding(bestGround(text, record));

// headingLabel(sectionBlocks) → a short section title, the top content words of
// the section by frequency, title-cased. Measurement, not generation — the
// structural revision adds headings with zero model calls.
const headingLabel = (sectionBlocks) => {
  const freq = new Map();
  for (const b of sectionBlocks) for (const t of tok(b.text)) if (t.length >= 4) freq.set(t, (freq.get(t) || 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map((e) => e[0]);
  if (!top.length) return 'Section';
  return top.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

// sectionBoundaries(blocks, {target}) → the block indices where a new section
// begins (always includes 0). Adjacent paragraphs that share little vocabulary
// are a topic shift; we cut at the lowest-similarity gaps (bornSalience between
// neighbours), enough of them to reach ~target sections. Deterministic and
// model-free — the same projection the router rides, applied to the draft itself.
export const sectionBoundaries = (blocks, { target } = {}) => {
  const n = blocks.length;
  if (n <= 2) return [0];
  const want = Math.min(6, Math.max(2, target || Math.round(n / 2)));
  if (want <= 1) return [0];
  const gaps = [];
  for (let i = 0; i < n - 1; i++) {
    const sim = bornSalience(profileOf(blocks[i].text), new Set(tok(blocks[i + 1].text)));
    gaps.push({ i, sim });
  }
  const cuts = gaps.slice().sort((a, b) => a.sim - b.sim || a.i - b.i).slice(0, want - 1).map((g) => g.i + 1);
  return [...new Set([0, ...cuts])].sort((a, b) => a - b);
};

// planRevision({doc, op, leads, record}) → { op, ops:[…] } — the edit set for the
// instruction, WITHOUT loading the whole doc into any model call. Each op is a
// doc change (insert/replace/delete) the driver appends to the log. STRUCTURAL is
// the first slice and generates no prose at all; cut/add/tone follow.
export const planRevision = ({ doc, op = 'structural', leads = [], record = [] } = {}) => {
  const blocks = (doc && doc.blocks) || [];

  if (op === 'structural') {
    // Regroup the paragraphs into sections and insert an h2 heading before each
    // (after the first — the opening paragraph stands as the intro, and the doc
    // insert can only place a block AFTER an existing one). Headings are measured
    // from their section's own words: no model call.
    const starts = sectionBoundaries(blocks);
    const ops = [];
    for (let k = 0; k < starts.length; k++) {
      const s = starts[k];
      if (s === 0) continue;                       // no block to anchor a heading before the first section
      const end = (k + 1 < starts.length) ? starts[k + 1] : blocks.length;
      const label = headingLabel(blocks.slice(s, end));
      ops.push({ kind: 'insert', type: 'h2', afterId: blocks[s - 1].id, text: label });
    }
    return { op: 'structural', ops };
  }

  if (op === 'cut') {
    // Delete the blocks whose vocabulary aligns with the topic the read named
    // (leads = the metacognition's own novel terms, meta-route leadsOf) — measured
    // overlap, never a keyword peel of the user's words. Nothing aligns → no-op.
    const leadSet = new Set((leads || []).flatMap((l) => tok(l)));
    if (!leadSet.size) return { op: 'cut', ops: [] };
    const scored = blocks.map((b) => ({ b, w: bornSalience(profileOf(b.text), leadSet) }));
    const max = scored.reduce((m, x) => Math.max(m, x.w), 0);
    if (max <= 0) return { op: 'cut', ops: [] };
    const ops = scored.filter((x) => x.w >= Math.max(0.12, max * 0.6) && (x.b.type || 'p') === 'p')
      .map((x) => ({ kind: 'delete', targetId: x.b.id, before: x.b.text }));
    return { op: 'cut', ops };
  }

  // add / tone are shaped by the driver with per-block model calls (reviseBlockMessages).
  return { op, ops: [] };
};

// reviseBlockMessages({block, instruction, outline, span}) → the messages for the
// ONE small model call that rewrites a single block. The block's prior text is fed
// as the SUBJECT to edit (intentionally bypassing the history-poisoning firewall
// for exactly this block), the outline is context only, and the grounding span
// keeps the rewrite faithful. The whole essay never enters the prompt.
export const reviseBlockMessages = ({ block, instruction, outline = '', span = null } = {}) => {
  const text = String((block && block.text) || block || '');
  const parts = [
    'You are revising ONE block of a document you already wrote.',
    ...(outline ? ['Document outline (context only — do not reproduce it):\n' + outline] : []),
    'The block to revise — edit THIS text, keep it about the same thing:\n"""\n' + text + '\n"""',
    ...(span && span.text ? ['It stands on this source line; stay faithful to it:\n"' + span.text + '"'] : []),
    'Change to make: ' + String(instruction || ''),
    'Output only the revised block — no preamble, no "here is", no explanation.',
  ];
  return [{ role: 'user', content: parts.join('\n\n') }];
};
