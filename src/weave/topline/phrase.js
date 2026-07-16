// EO: INS·DEF·EVA(Entity,Lens → Entity,Lens, Making,Binding) — pass one: one object, one sentence
// The first pass phrases ONE object at a time (docs/topline.md). Each object is turned into a
// single sentence in isolation. It cannot smuggle anything between objects because it never sees
// two at once, and it cannot invent a fact because it was given no facts to interpolate between.
// This is safe and it reads like a telegram.
//
// Every object type has a MECHANICAL phrasing — deterministic, model-free, always available. That
// is the guaranteed pass-one sentence (the telegram, and the fallback). A model may OPTIONALLY be
// handed the same single object to phrase more fluently, but its sentence is accepted only if it
// passes containment against that object's own fields (contain.js) — so even in pass one the model
// can rephrase, never add. The moment it reaches for a word the object did not carry, the
// mechanical sentence stands.

import { speak } from '../../model/index.js';
import { isObjectFunctional } from '../../core/index.js';
import { containedIn } from './contain.js';

const cap = (s) => { const t = String(s || '').trim(); return t ? t[0].toUpperCase() + t.slice(1) : t; };
// Terminate a sentence. A lifted claim value can carry trailing punctuation of its own ("near
// Gordonsville, Virginia,") — strip a dangling comma/semicolon/colon first so we never emit ",."
const dot = (s) => { const t = String(s || '').trim().replace(/[,;:]+$/, '').trim(); return /[.!?]$/.test(t) ? t : `${t}.`; };
const list = (xs) => {
  const a = (xs || []).map((x) => String(x).trim()).filter(Boolean);
  if (a.length <= 1) return a[0] || '';
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
};

// The mechanical sentence for each object type — the telegram. Total over every type the inventory
// can emit; an unknown type degrades to its subject rather than throwing (the topline must never
// cost its caller an exception).
export const phraseMechanical = (obj) => {
  const f = obj.fields || {};
  const neg = f.polarity === '−';
  switch (obj.type) {
    case 'claim': {
      if (obj.relational) {
        // a kinship / role bond reads possessively ("Grete is Gregor's sister"); an action reads
        // verbally ("the father drove Gregor"). The controller marks the role bonds via `kinship`.
        // But a CHANGE-OF-STATE bond carries a VERB on its `via` ("became", "transformed"), not a
        // role noun, so the possessive template mints garbage — "Henry Clerval is Clerval's became".
        // Read it verbally regardless of the flag: the object-functional primitive (relation-types.js)
        // IS the change-of-state marker, so "Henry Clerval became Clerval" falls out of the same algebra.
        const possessive = f.kinship && !isObjectFunctional(f.via);
        return possessive
          ? dot(`${cap(f.subject)} is ${neg ? 'not ' : ''}${f.object}'s ${f.via}`)
          : dot(`${cap(f.subject)} ${neg ? 'did not ' : ''}${f.via} ${f.object}`);
      }
      return dot(`${cap(f.subject)} is ${neg ? 'not ' : ''}${f.value}`);
    }
    case 'fact':
      return f.kind === 'value'
        ? dot(`${cap(f.verb || 'is')} ${f.value}`)
        : dot(`${cap(f.verb || 'has')} ${f.n} ${f.noun}`);
    case 'inference':
      // marked as OURS: a reading across the claims, never the record's own line.
      return dot(`Read together, these centre on ${list(f.about)}`);
    case 'part':
      return 'The two cannot both hold.';
    case 'moved':
      return dot(`The ground moved under ${list(f.under)} — ${f.count} ${f.count === 1 ? 'claim awaits' : 'claims await'} re-checking`);
    case 'gap': {
      const receipt = f.scanned ? `, across ${f.scanned.n} ${f.scanned.noun} scanned` : '';
      return dot(`${cap(f.term)} is named here but the record says nothing further${receipt}`);
    }
    default:
      return dot(cap(f.subject || obj.subject || ''));
  }
};

// The envelope of words a pass-one sentence for THIS object may draw on: the object's own field
// values plus its mechanical phrasing. The model's fluent sentence is accepted only if it stays
// inside this envelope (plus the free connectives contain.js allows). So pass one, like pass two,
// can rephrase but never add.
const objectEnvelope = (obj) => {
  const f = obj.fields || {};
  const vals = [f.subject, f.value, f.via, f.object, f.verb, f.term, f.n, ...(f.about || []), ...(f.under || [])];
  return `${phraseMechanical(obj)} ${vals.filter((v) => v != null && v !== '').join(' ')}`;
};

const PASS1_SYSTEM =
  'You are handed ONE fact, already decided, as fields plus a plain draft of it. Rewrite it as a ' +
  'single short, natural sentence. Use ONLY the words already present; add no other name, number, ' +
  'place, date, or qualifier, and never negate what is not negated. Output the one sentence only.';

// Phrase one object. With no model, or on any fault, the mechanical sentence — always. With a
// model, the fluent rewrite is used only if it adds nothing the object did not carry.
export const phraseObject = async (obj, { model = null, signal = null } = {}) => {
  const mech = phraseMechanical(obj);
  if (!model) return { text: mech, cite: obj.cite || [], type: obj.type, key: obj.key, fluent: false };
  const envelope = objectEnvelope(obj);
  const draft = await speak(model, [
    { role: 'system', content: PASS1_SYSTEM },
    { role: 'user', content: `Fields: ${JSON.stringify(obj.fields)}\nDraft: ${mech}` },
  ], { fallback: '', maxTokens: 60, ...(signal ? { signal } : {}) });
  const one = firstSentence(draft);
  const ok = one && containedIn(one, envelope);
  return { text: ok ? dot(one) : mech, cite: obj.cite || [], type: obj.type, key: obj.key, fluent: !!ok };
};

// Pass one over the whole inventory. Each object phrased in isolation; the sequence the machinery
// fixed is preserved. Model-optional — with none, this is the deterministic telegram.
export const phraseAll = async (inventory, { model = null, signal = null } = {}) => {
  const out = [];
  for (const obj of inventory.objects) out.push(await phraseObject(obj, { model, signal }));
  return out;
};

const firstSentence = (s) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim().replace(/^["'“‘]+/, '');
  const m = t.match(/^[^.!?]*[.!?]/);
  return (m ? m[0] : t).trim();
};
