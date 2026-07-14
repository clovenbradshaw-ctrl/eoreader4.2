// EO — one group of the turn's fold (split from turn/stages.js, 2026-07 compliance
// pass: "no file over ~250 lines" / "no 760-line orchestrator", docs/architecture.md).
// SUPPORT: the helpers more than one group reads (shape, fold summary, confabulation, orientation).
// The methods are VERBATIM from stages.js; stages.js assembles the groups back
// into the one named-stage map the pipeline walks. Same holon, same seams.
import { orientationLine } from '../model/index.js';

// The `validate` stage's budget and its typed absence. The reaction is a sentence or two, so
// a small cap keeps it cheap; the absence is the canonical honest miss (the same phrasing
// SYSTEM_GROUND names and register-plainspoken.test.js pins), spoken when the reader's own
// reaction weighed negative and it could not answer again.
export const ASSESS_MAX_TOKENS = 160;
export const VALIDATION_ABSENCE = "I didn't find that in what I read.";

// The corrective handed to the talker on the rewrite pass — a REFINE, not a retreat. It
// names the specific over-reach (a connection the passages don't support) and asks for a
// truer answer in the model's own words, dropping the unsupported link — NOT for a blanket
// "the document does not say." We are still trusting the talker; we are only steering it
// off the one claim the reading could not witness.
export const CONFAB_CORRECTIVE =
  'A previous attempt asserted a specific connection between named figures — a cause, an ' +
  'action, an identity, a relationship — that the lines do not actually support. Answer ' +
  'again in your own words, keeping to what the lines support. State the connection only ' +
  'if it is really there; otherwise answer the part you can and leave the unsupported link out.';

// The §5 corrective — handed when the GATE engaged (a refusing edge-grounded veto, or a
// from-nowhere unbound answer), distinct from the confab refine. It steers the talker
// back onto the lines and names the honest absence as a real option: under the subjective
// frame "I did not find it" is coherent, so the regenerate can reach it.
export const GROUNDING_CORRECTIVE =
  'Read the lines again. Part of what you just said is not in them — either it is not ' +
  'there at all, or it conflicts with what they show. Answer again, keeping strictly to ' +
  'what the lines say. If the answer is not in them, tell them plainly you did not find it.';

// THE CONTENT-FREE SHAPE DESCRIPTOR (turn/shape.js). The form library matches the nearest
// sample answer to read off the wanted SHAPE — but handing a weak talker that sample's verbatim
// text made it copy the sample's FACTS (a court transcript answered with an ML paper's "quarter
// of the training cost"; docs/answer-expectation.md). The shape is register and length, and
// those are exactly what the exemplar's own `shape_tags` name — so we hand the talker a
// descriptor built from the SAFE tags (register + length) and nothing else: no facts to copy, and
// no move-structure (e.g. 'quote-then-gloss') a small model would turn into a fabricated quote.
// This is the content-free form the golden 'exemplar' case was always written for. Empty when no
// safe tag matched → the exemplar band simply does not ride.
const SHAPE_LENGTH_TAGS = { 'one-liner': 'one-line', short: 'short', paragraph: 'one-paragraph',
  'multi-paragraph': 'multi-paragraph', 'essay-length': 'essay-length' };
const SHAPE_REGISTER_TAGS = new Set(['crisp', 'warm', 'formal', 'dry', 'playful', 'analytical',
  'committed', 'humble', 'tender', 'provisional', 'emphatic', 'wry', 'prose']);


export const shapeDescriptor = (tags) => {
  const t = Array.isArray(tags) ? tags : [];
  let length = '';
  for (const k of Object.keys(SHAPE_LENGTH_TAGS)) if (t.includes(k)) { length = SHAPE_LENGTH_TAGS[k]; break; }
  const registers = t.filter((x) => SHAPE_REGISTER_TAGS.has(x)).slice(0, 2);
  const body = [length, ...registers].filter(Boolean).join(', ');
  return body ? `A ${body} answer.` : '';
};

// THE FOLD SUMMARY (docs/topline.md) handed to the prompt: the standing topline the reading
// already composed for the source, plus the toplines of the figures THIS turn centres on — the
// fold's settled focus and the entities the mechanical draft named (turn/stages.js `predict`).
// Both are grounded, containment-checked summaries, so the talker phrases them rather than
// re-deriving from raw lines. Entity summaries are matched by label (case-insensitively) against
// the caller's map and capped, so only the few the turn is about ride. Empty when nothing was
// threaded → the foldSummary band does not fire → byte-identical prompt.
const FOLD_SUMMARY_ENTITY_CAP = 3;

export const composeFoldSummary = (ctx) => {
  const parts = [];
  const src = String(ctx.foldSummary || '').trim();
  if (src) parts.push(src);
  const ents = ctx.entitySummaries;
  if (ents && typeof ents === 'object') {
    const focus = [];
    if (ctx.surf?.focus) focus.push(ctx.surf.focus);
    for (const e of (ctx.prediction?.entities || [])) focus.push(e);
    const seen = new Set(), lines = [];
    for (const label of focus) {
      const key = String(label || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const text = String(ents[label] ?? ents[key] ?? '').trim();
      if (text && text !== src && !lines.some((l) => l.includes(text))) {
        lines.push(`- ${text}`);
        if (lines.length >= FOLD_SUMMARY_ENTITY_CAP) break;
      }
    }
    if (lines.length) parts.push(`On the figures it centres on:\n${lines.join('\n')}`);
  }
  return parts.join('\n\n');
};

// The corrective for a missed CONSTRAINT (turn/expect.js), by dimension. A REFINE, not a
// retreat: it names the one thing the draft got wrong and asks for it again, in the talker's
// own words. For a name the reading already resolved, hand it over outright — the engine knows
// it; the first draft simply failed to say it.


// Did the diagonal guard catch the confabulation proper — a specific claim asserted at
// a measured Void (the figure-at-a-void shape)? The hard case the rewrite targets.
export const confabulating = (ctx) =>
  (ctx.edgeVerdicts || []).some(v => v.verdict === 'off_diagonal' && v.void);

// The §5 GATE condition. Under the subjective frame, a REFUSING edge-grounded veto on the
// answer's load-bearing claim no longer rides: a relation the reading DENIES
// (factcheck.refuse — a confident contradiction), or a from-nowhere `unbound` answer whose
// claims tie to nothing, engages the gate and regenerates. Scoped to the default `answer`
// task — the pointed question where retrieval finding nothing IS the absence; a whole-
// document task's connective claims legitimately have no single witness. low-coverage, the
// weak contradiction, edge-unsupported, and the off-diagonal grain over-read stay flag-only.


// The recognition-free stand-in for the orientation's "filename" slot. An uploaded FILE
// keeps its name (`docId`, set from the file name). But a WEB source's docId is an opaque
// content-hash (`web-df554d79bc5d5a1f`), and a COMPOSITE's docId is those hashes joined with
// " + " (organs/in/composite.js) — internal identifiers, not anything the reader ever "saw".
// Handed to the talker as a filename they are pure noise: the model tries to parse a wall of
// hashes it can make no sense of. So a composite reduces to a COUNT of its sources ("29
// sources"), and a lone web page to its HOST ("en.wikipedia.org") — the domain is a
// filename-grade descriptor, recognition-free, never the page TITLE that §3 keeps out of the
// content prompt. Everything else falls back to docId, exactly as before.
const hostOfUrl = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

const orientationName = (doc) => {
  if (doc.isComposite) {
    const n = Array.isArray(doc.docIds) ? doc.docIds.length : 0;
    return n ? `${n} sources` : 'several sources';
  }
  if (doc.web || doc.sourceKind === 'web-source')
    return hostOfUrl(doc.web?.final_url || doc.web?.url) || 'a web page';
  return doc.docId || 'the document';
};

// The type slot of the orientation — the source's MEDIUM, so "this audio file" / "this
// video" / "this image" is answerable as itself. A transcribed recording keeps modality
// 'audio' (organs/in/audio.js) even after its words are laid into sentences, so labelling it
// "text" left the talker unable to connect "this audio file" to what it was reading — it
// answered "I couldn't find any information about the audio file itself". Only the genuinely
// non-text media take their own word; everything textual (text, webpage, pdf, document,
// table, json, composite…) stays 'text', recognition-free and byte-identical to before.
const ORIENT_TYPE = Object.freeze({
  audio: 'audio', video: 'video', image: 'image', music: 'music',
});

// The orientation line: the talker is handed a recognition-free NAME (orientationName), type,
// and length — and NOTHING that lets it narrate a famous text from memory (§3). The document's
// own metadata (title, author, date) does not ride here, nor anywhere in the content prompt; it
// is answered separately, as a distinct fact, by the metadata answerer (answer/metadata.js,
// routed in `route`).


// The orientation line: the talker is handed a recognition-free NAME (orientationName), type,
// and length — and NOTHING that lets it narrate a famous text from memory (§3). The document's
// own metadata (title, author, date) does not ride here, nor anywhere in the content prompt; it
// is answered separately, as a distinct fact, by the metadata answerer (answer/metadata.js,
// routed in `route`).
export const orientationOf = (doc) => {
  if (!doc) return '';
  const units = doc.units || doc.sentences || [];
  return orientationLine({
    filename: orientationName(doc),
    type:     ORIENT_TYPE[doc.modality] || 'text',
    length:   units.length,
  });
};

// buildLens — assemble the lens-port steering config for this turn, or null to leave the
// golden path untouched (spec-the-lens-port.md, Tracks B–D). Requires the toggle, a backend
// that exposes its tokenizer (the bridge seam), and a doc + surfer reading.
