// EO: SEG·EVA·NUL(Lens,Field → Lens,Void, Dissecting,Tracing,Clearing) — answer from inside a fold
// perspective-answer.js — answer a question AS THE RECORD HOLDS IT from inside one figure's fold.
//
// perspective.js gives a figure its own universe — the claims ITS words assert, its verbatim
// quotes. This answers a question against ONLY that universe: not what is true, not what the
// document says, but what THIS figure's own words commit to. It is a mechanically bounded
// projection, not roleplay — the answer is composed from the figure's own claim phrases, and the
// same referential gate the summary voice runs behind (referentiallyContained) confirms it never
// introduces a name or number the figure never used. When the figure's words do not address the
// question, it DWELLS in the void — says so — rather than fabricating an answer. That is the one
// law of the engine (SYN·Ground, the desert cell): you may hold an unbound thread, never invent
// from it. Pure and model-free, so the bound is arithmetic, not a prompt the model might ignore.

import { claimPhrase } from '../perceiver/index.js';
import { referentiallyContained, summaryAdditions } from './fold/index.js';

const STOP = new Set(('the a an of to in on at for and or but is are was were be been being it its this that these those with as by from about into over under out up down not no yes do does did has have had will would can could should may might must their they them he she his her him who what when where why how which whose whom own say says said tell told ask asked').split(/\s+/));
const terms = (s) => [...new Set((String(s || '').toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || []).filter((w) => w.length > 2 && !STOP.has(w)))];

// The vocabulary a figure is ALLOWED to use — their claims and their quotes, plus their own name.
// Any proper name or number outside this surface is an escape from their fold.
export const foldSurface = (persp) => {
  const claims = (persp?.fold?.claims || []).map(claimPhrase);
  const quotes = (persp?.quotes || []).map((q) => (q && q.text != null ? q.text : q));
  return [persp?.label || '', ...claims, ...quotes].join('. ');
};

// The gate: a candidate answer stays INSIDE the figure's fold iff it introduces no name/number the
// fold never carried. foldEscape reports exactly what stepped outside (empty ⇔ contained).
export const withinFold = (text, persp) => referentiallyContained(String(text || ''), foldSurface(persp));
export const foldEscape = (text, persp) => summaryAdditions(String(text || ''), foldSurface(persp));

const claimTerms = (c) => terms(`${c.subject || ''} ${c.value || ''} ${c.via || ''} ${c.object || ''}`);
const overlap = (a, bset) => { let n = 0; for (const t of a) if (bset.has(t)) n++; return n; };

// Answer `question` from inside `persp`'s fold. Returns { addressed, label, answer, claims,
// quotes, contained }. `addressed:false` is the honest void — the figure's words say nothing to
// the question; the answer names that and asserts nothing. `contained` is the gate's verdict on
// the produced answer (always true for the model-free floor, since it is built from the fold).
export const answerFromPerspective = (persp, question, { max = 4 } = {}) => {
  const label = persp?.label || 'This figure';
  const qterms = terms(question);
  const claims = persp?.fold?.claims || [];
  if (!qterms.length) return { addressed: false, label, answer: `Ask ${label} something specific.`, claims: [], quotes: [], contained: true };

  const qset = new Set(qterms);
  const scored = claims
    .map((c) => ({ c, s: overlap(claimTerms(c), qset) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max);

  if (!scored.length) return { addressed: false, label, answer: `${label}'s own words don't address that.`, claims: [], quotes: [], contained: true };

  const used = scored.map((x) => ({ text: claimPhrase(x.c), claim: x.c }));
  const quotes = (persp?.quotes || [])
    .filter((q) => { const qt = new Set(terms(q && q.text != null ? q.text : q)); return qterms.some((t) => qt.has(t)); })
    .slice(0, 3).map((q) => (q && q.text != null ? q.text : q));
  const answer = `${label}: ` + used.map((u) => u.text).join('; ') + '.';
  return { addressed: true, label, answer, claims: used, quotes, contained: withinFold(answer, persp) };
};
