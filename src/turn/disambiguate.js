// EO: DEF·EVA·SEG(Field,Lens → Lens,Paradigm, Dissecting,Binding) — the sense-disambiguation prior
// disambiguate.js — commit to ONE sense of a homonymous subject BEFORE the gather, and only
// divert if the first grounding legitimately pulls the other way. (docs/curiosity-research.md)
//
// The research walks (research.js, deep-research.js) leash every hop to a FIXED topic frame — a
// bag of the query's own content words (ANCHOR_W each), enriched once by the seed page. That leash
// keeps a walk on the QUESTION, but it cannot tell two SENSES of the same word apart: the frame for
// "dolphins" is {dolphins}, and a Miami-Dolphins page shares that word by SPELLING, not by sense.
// So the football pages ride the leash right alongside the marine-mammal ones and both surface "in
// the fold" — the homonym the retrieval damp already names (surfer/retrieve/hybrid.js applyTopicPrior),
// but on the GATHER side, where nothing yet commits.
//
// This is the thumb on the scale, and it lives at the TOP of the flow, before a single page is
// fetched. The pipeline is: (0) capture the subject and any sense HINTS the user gave; (1) the
// ambiguity GATE — the model answers "one sense, or many?", and a subject with one basin
// ("photosynthesis") passes straight through, no steer, no cost; (2) for an ambiguous subject, the
// model (the only reader with world knowledge of what "dolphins" can mean) commits to the SINGLE most
// likely sense and names the terms that DISTINGUISH it. Those terms are chosen to DISCRIMINATE: an
// anchor must co-occur with the target basin and NOT the collision — "cetacean" (animal only) leads,
// "ocean" (both — the team sits by one too) is dropped, because a term shared by both senses steers
// toward nothing (discriminate()). The surviving, anchor-first vocabulary is folded into the topic
// frame at anchor strength, so the frame is no longer {dolphins} but {dolphins, cetacean, blowhole,
// marine, …}: now a football page overlaps only the shared word and falls off the leash, while a
// marine page lies right along it. The walk commits to the chosen sense from hop zero instead of
// holding both open — and it logs which anchor it steered ON and which sense it steered AWAY FROM, so
// the disambiguation is a glass box, not a guess.
//
// AND ONLY DIVERT IF THE RESEARCH PULLS THAT WAY. The commit is a PRIOR, not a verdict. The seed page
// is the first EVIDENCE, and it gets a vote: chooseSense normalises the seed's alignment to each sense
// into a proper field and reads it with the SAME concentration margin the coref referent uses
// (perceiver/referent.js REFERENT_MARGIN). If the seed grounding concentrates on a DIFFERENT sense than
// the model committed to, the evidence overrules the prior and the frame commits to what the page
// actually is; a near-tie leaves the model's prior to break it. So the sense is chosen by prior AND
// evidence at the one point the frame freezes — Bayesian, not a guess that ignores the world.
//
// Opt-in by construction: no injected disambiguator and no precomputed prior → the walks build exactly
// the bag-of-words frame they always did, and every offline test is byte-identical. The model call
// (modelDisambiguator) mirrors formulateSearchQuery / modelPlanner — a tiny temperature-0 utility that
// returns null on an unambiguous subject or any failure, so the network- and model-free paths never
// change. Pure but for that one injected call.

import { researchTerms } from './research.js';
import { referentialConfidence, REFERENT_MARGIN } from '../perceiver/referent.js';
import { discourseFrame } from './converse/index.js';

// The weight a committed sense's DISTINGUISHING terms carry in the topic frame — the pressure of the
// thumb. Set to the walks' own ANCHOR_W (3): the sense vocabulary presses as hard as the subject
// word itself, so the discrimination it adds is decisive, not a tie-breaker the seed-page enrichment
// (presence weight 1) can wash out. The shared subject word stays in the frame at anchor weight too,
// so a genuinely on-sense page that happens to omit the vocabulary is still held by the leash.
export const SENSE_W = 3;

// A crude singular↔plural fold, so "dolphin"/"dolphins" and "mammal"/"mammals" compare equal when we
// scrub the subject word or test whether a term collides with another sense.
const stem = (t) => String(t).toLowerCase().replace(/(?:es|s)$/, '');

// senseTokens(terms, { without }) → the distinguishing tokens of a sense, run through the SAME
// stop/length filter the walk tokenises pages with (research.js researchTerms), deduped, and with the
// subject's own words dropped (`without`) — the subject word does not distinguish a sense, it is what
// both senses share. So "marine mammal, cetacean" → [marine, mammal, cetacean]; "dolphin" is scrubbed.
export const senseTokens = (terms, { without = [] } = {}) => {
  const drop = new Set((without || []).map(stem));
  const joined = (Array.isArray(terms) ? terms : [terms]).map((t) => String(t || '')).join(' ');
  return [...new Set(researchTerms(joined))].filter((t) => !drop.has(stem(t)));
};

// discriminate(terms, collisions) → the committed sense's tokens KEPT ONLY where they discriminate —
// Stage 2's whole trick. A term that also names a collision sense (it co-occurs with both basins, the
// way "ocean" sits with the animal AND, say, a shipping sense) steers toward nothing, so it is dropped;
// the model already listed the most-discriminating first, so the surviving order is anchor-first. Never
// empties: if every term collides, the first stands, so there is always something to steer with.
export const discriminate = (terms = [], collisions = []) => {
  const bad = new Set(collisions.map(stem));
  const kept = terms.filter((t) => !bad.has(stem(t)));
  return kept.length ? kept : terms.slice(0, 1);
};

// senseAlign(terms, keys) → what FRACTION of a sense's distinguishing tokens the page shows, 0..1.
// A fraction, not a raw count or a cosine, so senses that declare different numbers of terms are
// compared fairly (a 3-term sense and a 6-term sense both top out at 1.0). This is the per-sense
// evidence the seed page carries: "how much does this page look like THAT sense?"
export const senseAlign = (terms, keys) => {
  const toks = senseTokens(terms);
  if (!toks.length) return 0;
  const k = keys instanceof Set ? keys : new Set(keys);
  let hit = 0;
  for (const t of toks) if (k.has(t)) hit += 1;
  return hit / toks.length;
};

// chooseSense(seedKeys, prior, { margin }) → { sense, terms, diverted } | null — the commit, with the
// seed grounding's vote. `prior` is the model's read: { sense, senseTerms, alternatives:[{sense,terms}] }.
// The committed sense leads the field; each alternative is a rival. Each is scored by how much of its
// vocabulary the seed page shows (senseAlign), the scores are normalised into a proper distribution,
// and the concentration is read with the coref referent's own margin (referentialConfidence): the
// field commits to its top sense ONLY when that sense leads the runner-up by ≥ margin — otherwise the
// prior (id 0, the model's commit) breaks the near-tie. `diverted` is true when the seed evidence
// overruled the prior, i.e. concentrated on an alternative. Null when there is no prior to lean on.
export const chooseSense = (seedKeys, prior, { margin = REFERENT_MARGIN } = {}) => {
  if (!prior || !Array.isArray(prior.senseTerms) || !prior.senseTerms.length) return null;
  const committed = { sense: String(prior.sense || ''), terms: prior.senseTerms };
  const alts = (Array.isArray(prior.alternatives) ? prior.alternatives : [])
    .map((a) => ({ sense: String(a?.sense || ''), terms: Array.isArray(a?.terms) ? a.terms : [] }))
    .filter((a) => a.terms.length);
  const senses = [committed, ...alts];
  // read(id) → the commit record for the chosen sense, carrying the anchor it steers ON and the
  // collision it steers AWAY FROM — the glass-box fields the trail and audit read.
  const read = (id) => {
    const chosen = senses[id] || committed;
    return {
      sense: chosen.sense, terms: chosen.terms, anchor: chosen.terms[0] || null,
      diverted: id !== 0,
      // steering away FROM the runner-up: the original commit when the evidence diverted us off it,
      // else the prior's named collision (or the top alternative).
      collision: id !== 0 ? committed.sense : (prior.collision || alts[0]?.sense || null),
    };
  };
  const keys = seedKeys instanceof Set ? seedKeys : new Set(seedKeys);
  const raw = senses.map((s) => senseAlign(s.terms, keys));
  const total = raw.reduce((a, b) => a + b, 0);
  // The seed matched no sense's vocabulary at all → no evidence either way; keep the model's commit.
  if (total <= 0) return read(0);
  // A proper field (weights sum to 1), hottest first — exactly the shape referentialConfidence reads.
  const field = raw.map((w, i) => ({ id: i, w: w / total })).sort((a, b) => b.w - a.w);
  const conf = referentialConfidence(field, { margin });
  return read(conf.concentrated ? conf.id : 0);   // concentrated → the evidence's sense; a tie → the prior
};

// biasTopic(topic, terms, { weight }) → MUTATE the topic frame in place, folding a sense's
// distinguishing tokens in at `weight`. The thumb, applied. A token the anchor already carries only
// gains weight (harmless reinforcement). No terms → a no-op, so the frame is untouched when there is
// nothing to commit to. Returns the same map for chaining.
export const biasTopic = (topic, terms, { weight = SENSE_W } = {}) => {
  for (const t of senseTokens(terms)) topic.set(t, (topic.get(t) || 0) + weight);
  return topic;
};

// sharpenSeed(subject, prior, { max }) → the SEED QUERY, disambiguated. Searching the bare word is
// dumb: "dolphins" hands the sense choice to the search engine's own popularity ranking, so the first
// page back is a mixed bag we then have to leash-filter. When the model has committed to a sense, the
// seed carries it — "dolphins" → "dolphins marine mammal" — so the FIRST fetch is already on-sense, the
// way nextQuery(anchor, lead) keeps a discovered thread coherent. Appends the top `max` distinguishing
// terms not already in the subject (they are pre-tokenised, most-distinguishing first). No prior, or a
// subject that already names them → the subject unchanged, so the bare-seed behaviour is preserved.
export const sharpenSeed = (subject, prior, { max = 2 } = {}) => {
  const s = String(subject || '').trim();
  if (!s || !prior || !Array.isArray(prior.senseTerms) || !prior.senseTerms.length) return s;
  const have = new Set(researchTerms(s));
  const add = prior.senseTerms.filter((t) => !have.has(String(t).toLowerCase())).slice(0, Math.max(0, max));
  return add.length ? `${s} ${add.join(' ')}` : s;
};

// parseSensePrior(text, subject) → a validated prior | null. Tolerant of a model that wraps its JSON
// in prose or a ```json fence: the first {...} block is parsed. Null unless the model called the
// subject ambiguous AND handed back a named sense with at least one distinguishing term that is not
// just the subject word — without that there is nothing to lean the frame on, so the walk is left
// exactly as it was.
export const parseSensePrior = (text, subject = '') => {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj;
  try { obj = JSON.parse(m[0]); } catch { return null; }
  if (!obj || typeof obj !== 'object' || obj.ambiguous === false) return null;
  const subjToks = researchTerms(subject);
  const sense = String(obj.sense || '').trim();
  const rawTerms = senseTokens(obj.terms || [], { without: subjToks });   // model order kept: most-discriminating first
  if (!sense || !rawTerms.length) return null;
  const alternatives = (Array.isArray(obj.alternatives) ? obj.alternatives : [])
    .map((a) => ({ sense: String(a?.sense || '').trim(), terms: senseTokens(a?.terms || [], { without: subjToks }) }))
    .filter((a) => a.sense && a.terms.length)
    .slice(0, 4);
  // STAGE 2 — keep only the committed terms that DISCRIMINATE against the collision senses, so the
  // anchor we steer on is maximally separating ("cetacean", never "ocean"). The model's ordering is
  // preserved, so senseTerms[0] is the strongest anchor.
  const senseTerms = discriminate(rawTerms, alternatives.flatMap((a) => a.terms));
  return {
    subject: String(subject || '').trim(),
    sense,
    senseTerms,
    anchor: senseTerms[0] || null,                                          // the single most-discriminating term
    collision: String(obj.collision || '').trim() || alternatives[0]?.sense || null,  // the sense steered away from
    alternatives,
  };
};

// modelDisambiguator(model, { history, question, senseHints }) → async (subject) → prior | null — the
// injected thumb, backed by the talker. The same discipline as formulateSearchQuery/modelPlanner
// (web.js, deep-research.js): a tiny temperature-0 call, DISCOURSE-AWARE so context legitimately pulls
// the commit (a conversation already on football makes "dolphins" the team), the firewall held (only
// the user's own words and the grounded discourse subject ride, never the talker's claims). `senseHints`
// are Stage-0 signals the user gave ("animal", "not the football team") that steer the commit. Returns
// null on an unambiguous subject (the Stage-1 gate, answered by the model), a refusal, or any throw —
// so with no model, or a model that declines, the walk is byte-identical. Exported so the app injects it
// and the engine stays offline-testable.
export const modelDisambiguator = (model, { history = [], question = '', senseHints = [], signal = null } = {}) => async (subject) => {
  const s = String(subject || '').trim();
  if (!model?.phrase || !s) return null;
  const { subject: focus, open } = discourseFrame(question || s, history);
  const frame = [
    focus ? `Subject in focus: ${focus}` : '',
    open ? `Open question: ${open}` : '',
  ].filter(Boolean).join('\n');
  const hints = (Array.isArray(senseHints) ? senseHints : [senseHints]).map((h) => String(h || '').trim()).filter(Boolean);
  const messages = [
    { role: 'system', content:
      'A research subject can name more than one thing (a homonym): "dolphins" is a marine mammal AND ' +
      'an NFL team; "mercury" is a planet, a metal, a Roman god, a car. Given a subject — the DISCOURSE ' +
      'STATE saying what the conversation is about, and any SENSE HINTS the user gave ("animal", "not ' +
      'the football team") — decide the SINGLE most likely intended sense for a general research or essay ' +
      'request, name the OTHER plausible senses, and name the ONE you are steering away from. Resolve the ' +
      'sense against the discourse and hints (a conversation about the NFL, or a hint "team", makes ' +
      '"dolphins" the team). Reply as STRICT JSON, no prose, no code fence:\n' +
      '{"ambiguous":true,"sense":"<short label>","terms":["<words that DISTINGUISH this sense, ' +
      'MOST-DISCRIMINATING FIRST>"],"collision":"<the sense being steered away from>",' +
      '"alternatives":[{"sense":"<label>","terms":["<distinguishing words>"]}]}\n' +
      'Order the terms so the MOST DISCRIMINATING lead: a word that co-occurs ONLY with this sense and ' +
      'never with the others comes first (cetacean, blowhole), a word shared with another sense (ocean — ' +
      'the team sits by one too) comes last or is omitted. Never the subject word itself (both senses ' +
      'share it, so it distinguishes nothing). If the subject names only ONE thing, reply ' +
      '{"ambiguous":false}. Output ONLY the JSON.' },
    { role: 'user', content:
      `${hints.length ? `Sense hints: ${hints.join(', ')}\n` : ''}${frame ? `Discourse state:\n${frame}\n\n` : ''}Subject: ${s}\n\nJSON:` },
  ];
  try {
    // The turn's signal rides along: this 220-token decode runs before the first hop,
    // and unabortable it outlived a Stop/stall as an orphan holding the engine.
    const out = await model.phrase(messages, { maxTokens: 220, temperature: 0, minPredict: 0, signal });
    return parseSensePrior(out, s);
  } catch { return null; }
};

// senseAnnouncement(committed) → the first-person "I'm reading this as X" beat, or null. Promotes the
// commit into the research trail so the thumb is DISCLOSED, not silent — the user sees which dolphins the
// walk chose, the anchor term it steered ON, and the sense it steered AWAY FROM (the glass-box read),
// and that it will divert only if the sources pull the other way. Names the divert when the seed
// evidence overruled the model's first guess. Pure string-mapping, no model call.
export const senseAnnouncement = (committed) => {
  if (!committed || !committed.sense) return null;
  const via = committed.anchor ? ` (on “${committed.anchor}”)` : '';
  if (committed.diverted) return `The sources point to ${committed.sense}${via} — reading it that way.`;
  const away = committed.collision ? `, not ${committed.collision}` : '';
  return `Reading this as ${committed.sense}${via}${away} — I'll only follow another sense if the sources pull that way.`;
};
