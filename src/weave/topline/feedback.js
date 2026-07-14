// EO: EVA·SEG·NUL(Lens,Network → Network,Void, Binding,Dissecting,Clearing) — feedback as steering
// A way to give the topline feedback so it updates (docs/topline.md). The inventory is CLOSED, so
// feedback can never add a fact — that is the whole point, and honouring it would be fabrication.
// What feedback CAN do is steer the closed set: cap its length, suppress an object the reader says
// is wrong or irrelevant, or pin one they want led with. The steer is a projection over the
// objects the machinery already decided; it re-orders, filters, and bounds — it never manufactures.
//
// A request that reaches OUTSIDE the inventory ("say more about Napoleon" when the record never
// named him) is recorded and reported as UNMET rather than satisfied. The honest answer to "you
// left out X" is either to surface the X the record does carry, or to say the record does not carry
// it — never to invent an X so the reader stops asking. This is the same discipline as the void
// answerer: the machinery would rather say "not here" than speak from an empty field.

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(('the a an of to in on at by for with and or but is are was were be it this that ' +
  'about more less say said tell told make made just please can could would should i you it me my your ' +
  'summary topline it its them they').split(/\s+/));
const contentWords = (s) => norm(s).split(' ').filter((w) => w && w.length > 2 && !STOP.has(w));

// The words the reader wants gone, and the words they want led with, read off plain feedback. Purely
// mechanical: the triggers below scope the following words. Everything else is kept as a free note.
const DROP = /\b(?:wrong|incorrect|not true|untrue|remove|drop|delete|leave out|without|don'?t mention|ignore|cut|no mention of|not about)\b/i;
const PIN  = /\b(?:focus on|focus|emphasi[sz]e|lead with|mainly|mostly|it'?s about|really about|highlight|centre on|center on)\b/i;
const SHORTER = /\b(shorter|too long|briefer|brief|trim|tighten|less|cut it down|one line|one sentence|condense)\b/i;
const LONGER  = /\b(longer|more detail|expand|fuller|too short|say more|elaborate)\b/i;

// Interpret one piece of feedback into a steer. Deterministic; no model. Returns
// { cap, suppress:[word], pin:[word], note } — cap null means "no length change".
export const interpretFeedback = (text) => {
  const t = String(text || '').trim();
  const steer = { cap: null, suppress: [], pin: [], note: t };
  if (!t) return steer;
  if (SHORTER.test(t)) steer.cap = /one sentence|one line/i.test(t) ? 1 : 2;
  if (LONGER.test(t)) steer.cap = 0;                      // 0 ⇒ uncap (show the whole inventory)
  const after = (re) => { const m = t.match(new RegExp(re.source + '\\s+(.{0,60})', re.flags)); return m ? contentWords(m[1]) : []; };
  if (DROP.test(t)) steer.suppress = after(DROP);
  if (PIN.test(t)) steer.pin = after(PIN);
  // a bare noun phrase with no trigger is read as a focus request (the commonest feedback shape)
  if (!steer.suppress.length && !steer.pin.length && steer.cap == null) steer.pin = contentWords(t).slice(0, 4);
  return steer;
};

// Fold a new steer onto the standing one. Suppress and pin accumulate as sets; cap takes the latest
// explicit value. Persisted on the summary so every regeneration re-applies the whole history.
export const mergeSteer = (prev, next) => {
  const p = prev || { cap: null, suppress: [], pin: [], notes: [] };
  const uniq = (xs) => [...new Set(xs)];
  return {
    cap: next.cap == null ? (p.cap ?? null) : next.cap,
    suppress: uniq([...(p.suppress || []), ...(next.suppress || [])]),
    pin: uniq([...(p.pin || []), ...(next.pin || [])]),
    notes: [...(p.notes || []), ...(next.note ? [next.note] : [])],
  };
};

const haystack = (obj) => {
  const f = obj.fields || {};
  return contentWords([f.subject, f.value, f.via, f.object, f.term, ...(f.about || []), ...(f.under || [])]
    .filter(Boolean).join(' '));
};
const mentions = (obj, words) => { const h = new Set(haystack(obj)); return (words || []).some((w) => h.has(w)); };

// Apply a merged steer to a freshly-built inventory. Returns { inventory, unmet } — a re-ordered,
// filtered, bounded projection of the SAME objects, plus the steer terms that matched nothing (the
// reader asked about something the record does not carry). Never adds an object.
export const applySteer = (inventory, steer) => {
  if (!steer) return { inventory, unmet: [] };
  let objects = [...inventory.objects];
  const unmet = [];

  // suppress: drop objects the reader flagged. If every object would go, the request cannot be
  // honoured (there would be nothing to say) — keep the lead object and report it unmet.
  if (steer.suppress?.length) {
    const kept = objects.filter((o) => !mentions(o, steer.suppress));
    if (kept.length) objects = kept;
    else unmet.push(...steer.suppress);
    for (const w of steer.suppress) if (!inventory.objects.some((o) => mentions(o, [w]))) unmet.push(w);
  }

  // pin: objects the reader wants led with move to the front, keeping their relative order. A pin
  // term that matches nothing in the inventory is unmet — the record does not carry it.
  if (steer.pin?.length) {
    const pinned = objects.filter((o) => mentions(o, steer.pin));
    const rest = objects.filter((o) => !mentions(o, steer.pin));
    if (pinned.length) objects = [...pinned, ...rest];
    for (const w of steer.pin) if (!inventory.objects.some((o) => mentions(o, [w]))) unmet.push(w);
  }

  // cap: length falls out of the count, but the reader may bound it. 0 ⇒ uncap. Never drops the
  // final safety objects (a lone gap, a moved notice) below one.
  if (steer.cap && steer.cap > 0) objects = objects.slice(0, Math.max(1, steer.cap));

  return {
    inventory: Object.freeze({ ...inventory, objects: Object.freeze(objects) }),
    unmet: [...new Set(unmet)],
  };
};
