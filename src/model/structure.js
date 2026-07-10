// EO: SYN·INS(Field,Network → Entity, Composing,Making) — structure backend, graph retelling
// The structure backend — generation from the engine's OWN structure, no LLM, no network.
//
// Every other backend draws the reply from a language model. This one does not: it reads
// the grounded excerpts the surfer selected (the same "What you read:" block echo speaks
// from), PARSES them back into a concept graph, TRAVERSES that graph from its warmest hub,
// and REALISES the walk as surface text — concept → traverse → words → grammar, the
// embedder-free path (src/write/). Reference is resolved by inverse coref (a pronoun only
// where the reader's field resolves it back), and adjacent same-subject clauses are
// aggregated. It is honest about what it is: a structural RETELLING of what was read, not
// an answer drawn from a trained model. When there is no structure to speak from, it says so.
//
// This is the alt chat modality: select it to watch the engine generate from structure
// alone, with nothing distributional anywhere in the path.

import { registerBackend } from './interface.js';
import { EXCERPTS_HEADER } from './prompt.js';
import { emitSurface } from './stream.js';
import { parseText } from '../perceiver/parse/index.js';
import { phraserBrief, speakTriples, inferGenders, think, worthSayingAloud } from '../weave/write/index.js';

registerBackend('structure', () => {
  return {
    id: 'structure',
    kind: 'local',
    isLoaded: () => true,
    async load(onProgress) { onProgress?.({ phase: 'ready', pct: 1 }); },
    async phrase(messages, opts = {}) {
      return emitSurface(structuralTelling(messages), opts.onToken);
    },
  };
});

// Pull the grounded excerpts out of the prompt — the surfer's "What you read:" block (the
// same source echo speaks from), with the legacy [sN] and a bare-text fallback.
const excerptsFrom = (messages) => {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const userText = lastUser?.content || '';
  const at = userText.indexOf(EXCERPTS_HEADER);
  if (at >= 0) {
    const lines = userText.slice(at + EXCERPTS_HEADER.length).split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length) return lines.join(' ');
  }
  const tagged = [...userText.matchAll(/\[s\d+\]\s+([^\n]+)/g)].map(m => m[1]);
  if (tagged.length) return tagged.join(' ');
  return '';
};

// Read the excerpts as a concept graph and speak the traversal. Returns a plain string.
// Gender is inferred by reading (write/genders.js — γ-recency over the committed entities
// and the gender of the pronouns that corefer to them), not from a name table; where the
// text gives no evidence, the entity is named rather than mis-pronouned.
const structuralTelling = (messages) => {
  const text = excerptsFrom(messages);
  if (!text || text.length < 8) {
    return 'There is no document structure to speak from — select a document to ground in, and I will retell what its graph holds (structure only, no model).';
  }
  // genderCoref on: a title or a resolved pronoun fixes gender causally, so a later "she"
  // will not bind to a masculine antecedent — the reference line the retelling rides on.
  const doc = parseText(text, { docId: 'grounded-excerpts', genderCoref: true });
  const genders = inferGenders(doc);
  // Speak FROM THE TRIPLES, not from the re-realised surface. phraserBrief gives the grounded
  // x→relation→y edges; speakTriples says them as natural speech (compound predicates,
  // pronouns, past tense) generated from the structure — so it can be no more wrong than the
  // graph, and it never compounds a parse glitch into word salad the way the surface realiser
  // did ("Grete aloned dared"). The content is the edges'; the clean form is the renderer's.
  const brief = phraserBrief(doc, { genders, max: 10 });
  const retelling = brief.propositions.length
    ? speakTriples(brief.propositions, { genders })
    : 'I read the excerpts but their graph held no traversable relations to retell.';

  // Think before finishing: run the inner-speech wander over the same graph and surface the
  // open question it found — a figure it kept hearing about that never acts. This is the
  // "Open" ledger made conversational: the backend says what it can ground, THEN names, in its
  // own voice, what it could not resolve. It never fabricates an answer to its own question —
  // a thought cannot witness; only a further document could close it. So this is honest
  // not-knowing surfaced, not a guess dressed as fact.
  const thought = think(doc, { genders });
  const open = worthSayingAloud(thought, { limit: 1 })[0];
  return open
    ? `${retelling} One figure stays open for me, though — ${open.figure} is in the scene but never acts. ${open.question}`
    : retelling;
};
