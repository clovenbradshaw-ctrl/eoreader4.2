// EO: SYN·EVA·NUL(Field,Link → Field,Lens,Void, Composing,Binding,Clearing) — pass two: join, gated
// The second pass hands the model its OWN pass-one sentences back and asks it only to JOIN them —
// reorder, add connectives, elide the repetition, make it read (docs/topline.md). And here the
// check is mechanical and model-free: every content word and every number in the output must
// already appear in the input (contain.js). The join may LOSE information; it may never ADD any.
// A new proper noun, a new figure, a new hedge that implies a source — and the join is rejected
// and the telegram ships instead.
//
// The model's ENTIRE freedom is word order and connective tissue. It cannot add, it cannot decide,
// it cannot judge, and it cannot pad — padding would require having something to say, and the
// inventory is closed. So there is no second call that "improves" the topline by reaching outside
// it: there is only arranging, and the gate proves it was only arranging.

import { speak } from '../../model/index.js';
import { containedIn, addedBy } from './contain.js';

// The telegram: the pass-one sentences in the machinery's order, joined as-is. Always safe — it is
// nothing but the objects, each already phrased in isolation. This is what ships whenever the join
// is rejected or there is no model.
export const telegram = (sentences) =>
  (sentences || []).map((s) => String(s.text || s).trim()).filter(Boolean).join(' ');

const JOIN_SYSTEM =
  'You are given sentences that are each already true, complete, and in the right order. Join them ' +
  'into one short, smooth passage: reorder only if it reads better, add connectives, and remove ' +
  'repeated words. Do NOT introduce any fact, name, number, place, date, or qualifier that is not ' +
  'already present, and never negate anything. Return only the joined passage.';

// Join the pass-one sentences. A one-object inventory is one sentence and STOPS — no join, no
// model. Otherwise the model is asked only to arrange; its result is accepted only if it adds
// nothing (the containment gate). On rejection, or no model, or any fault: the telegram.
//
// Returns { text, joined, telegram, rejected? } — `joined` true only when a model passage passed
// the gate; `rejected` carries what it tried to add, for the audit.
export const joinTopline = async (sentences, { model = null, signal = null } = {}) => {
  const tele = telegram(sentences);
  const clean = (sentences || []).map((s) => String(s.text || s).trim()).filter(Boolean);
  if (clean.length <= 1) return { text: tele, joined: false, telegram: tele };   // one sentence, and it stops
  if (!model) return { text: tele, joined: false, telegram: tele };

  const numbered = clean.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const draft = await speak(model, [
    { role: 'system', content: JOIN_SYSTEM },
    { role: 'user', content: numbered },
  ], { fallback: '', maxTokens: Math.min(320, 40 + clean.length * 40), ...(signal ? { signal } : {}) });

  const joined = String(draft || '').replace(/\s+/g, ' ').trim();
  if (!joined) return { text: tele, joined: false, telegram: tele };
  const input = clean.join(' ');
  if (!containedIn(joined, input)) {
    return { text: tele, joined: false, telegram: tele, rejected: addedBy(joined, input) };
  }
  return { text: joined, joined: true, telegram: tele };
};
