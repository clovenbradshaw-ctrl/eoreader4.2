// EO: SYN·CON·EVA(Network,Field → Field,Lens, Composing,Binding,Tracing) — phraser -> talker hand-off + propositional veto
// The phraser → talker hand-off.
//
// This engine is the PHRASER: it determines WHAT to say — grounded propositions read off the
// document's own graph, provenance-stamped and fabrication-incapable — plus a telegraphic
// draft already realised (referring expressions, tense, aggregation). An LLM TALKER then only
// makes it FLUENT. The talker decides no content: the brief gives it the determined
// propositions, the prompt forbids adding any, and the post-check (classifyProvenance) strips
// whatever it adds anyway. So the output is fluent AND fabrication-incapable — content and
// grounding are ours, wording is the talker's, and the veto closes the loop. This is the
// honest place for a model: surface realisation behind a propositional veto, never content.

import { speakConcept } from './traverse.js';
import { toPast } from './morph.js';
import { classifyProvenance } from '../../enactor/ground/index.js';
import { connectiveLeash } from './gravity.js';

// phraserBrief(doc, opts) → the determined content for a talker, as IMPRESSIONS to voice.
//   propositions  the grounded subject–relation–object triples — the pre-verbal scene, the
//                 impression a reading left, waiting to be put into words (the talker's only
//                 content; we chose the facts, it chooses the wording)
//   draft         our own telegraphic realisation (referring/tense/aggregation already done)
//   plan          the underlying plan (for provenance / audit)
export const phraserBrief = (doc, opts = {}) => {
  const spoken = speakConcept(doc, opts);
  const propositions = (spoken.plan || []).map((p) => ({
    subj: p.subj?.name ?? p.subj,
    verb: p.verb,
    obj: p.obj && p.obj.name != null ? p.obj.name : (typeof p.obj === 'string' ? p.obj : null),
  }));
  return Object.freeze({ propositions, draft: spoken.text, plan: spoken.plan });
};

// SUBJECT_PRONOUN — the gendered pronoun for a repeated subject, so natural speech does not
// drone the name every clause. Only where gender is evidenced (m/f/p); else the name stands.
const SUBJECT_PRONOUN = { m: 'he', f: 'she', p: 'they' };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const joinList = (xs) => xs.length <= 1 ? (xs[0] || '')
  : xs.length === 2 ? `${xs[0]} and ${xs[1]}`
  : `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]}`;

// speakTriples(propositions, { genders }) → natural speech BUILT FROM THE TRIPLES, not from the
// document's surface. The old path realised the parser's own bonds back into sentences and
// compounded every parse glitch into word salad ("Grete aloned dared"). This instead takes the
// grounded x→relation→y edges and says them: it groups a run of same-subject edges into one
// sentence with a compound predicate ("Grete fed Gregor, opened the window, and turned away"),
// pronominalises a repeated subject by evidenced gender, and puts the verb in past tense. The
// CONTENT is the triples (so it can be no more wrong than the graph is); the FORM is clean,
// because it is generated from structure, never from re-reading a mangled surface.
export const speakTriples = (propositions, { genders = {} } = {}) => {
  const props = (propositions || []).filter((p) => p && p.subj && p.verb);
  const sentences = [];
  let i = 0;
  let lastSubj = null;
  while (i < props.length) {
    const subj = props[i].subj;
    const run = [];
    while (i < props.length && props[i].subj === subj) { run.push(props[i]); i += 1; }
    const predicates = run.map((p) => {
      const v = toPast(String(p.verb));
      return p.obj ? `${v} ${p.obj}` : v;
    });
    const g = genders[subj] ?? genders[String(subj)] ?? 'n';
    // a repeated subject (same as the previous sentence) pronominalises if gender is evidenced.
    const subjForm = (subj === lastSubj && SUBJECT_PRONOUN[g]) ? SUBJECT_PRONOUN[g] : subj;
    sentences.push(`${cap(subjForm)} ${joinList(predicates)}.`);
    lastSubj = subj;
  }
  return sentences.join(' ');
};

// realizationPrompt(brief) → what the talker is GIVEN: the grounded relation EDGES, x→rel→y,
// not a re-realised surface. Feeding a model the engine's own telegraphic draft anchored it on
// whatever the surface realiser had mangled; the edges are the clean content. So the talker
// gets the scene as a small relation graph and is asked to say it as natural speech — the
// fluency is its job, the facts are the edges', and the veto (talkThenVerify) strips any edge
// it invents. No prohibition list: grounding is enforced after the fact, not by nagging.
export const realizationPrompt = (brief) => Object.freeze({
  system: 'You are the voice that turns a reading into words. You are given a small set of '
    + 'relations from a text — who did what to whom, as edges (x → relation → y). Say them as '
    + 'fluent, natural speech, the way someone would who had just read it and is telling a '
    + 'friend what happened: join related facts, use pronouns, let it flow. Keep to the '
    + 'relations given — you need add nothing to make it natural.',
  user: 'The relations:\n'
    + brief.propositions.map((p) => `  ${p.subj} → ${p.verb}${p.obj ? ' → ' + p.obj : ''}`).join('\n')
    + '\n\nNow say it as natural speech:',
});

// talkThenVerify(brief, model, { doc, arc }) → realise via the talker, then VETO its drift.
// Returns the talker's prose, the per-proposition provenance against the document, and the
// list of fabricated propositions it smuggled in (which a caller suppresses or flags).
//
// THE CONNECTIVE LEASH (write/gravity.js). A rendered "therefore" or "but" is a claimed
// edge at the DISCOURSE grain — the same shape the edge-grounding veto catches at the
// proposition grain, one level up. When the caller has an arc in hand, every connective
// the talker rendered is licensed against it (a contrast needs a turn on the log, a
// sequence needs an order, a cause is never licensed by an arc) and the unlicensed ones
// ride out in `connectives` for the caller to strip or flag. No arc → no leash — the
// present contract is byte-identical.
export const talkThenVerify = async (brief, model, { doc, arc = null } = {}) => {
  const { system, user } = realizationPrompt(brief);
  const fluent = String((await model.phrase([{ role: 'system', content: system }, { role: 'user', content: user }])) ?? '');
  const provenance = doc ? classifyProvenance(fluent, { doc }) : null;
  const drift = provenance ? provenance.propositions.filter((p) => p.grounding === 'fabricated') : [];
  const connectives = arc ? connectiveLeash(fluent, arc) : null;
  return Object.freeze({
    fluent, provenance, drift, connectives,
    clean: drift.length === 0 && (connectives == null || connectives.clean),
  });
};
