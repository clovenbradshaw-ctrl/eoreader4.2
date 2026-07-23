// EO: SEG·DEF(Field,Link → Field,Lens, Dissecting,Making) — emergent section names
// The chapter/window spine (digest.js) heads each stretch of an entity's passage through the reading.
// A stretch's name is not positional decoration where the content can do better: it is the
// DISTINCTIVE term of that stretch — the word concentrated HERE and rare across the rest of the
// entity's passage. The move (and the discipline) is section-answer.js's, kept here as a small pure
// module so the digest stays lean and never reaches across faculties: the recurring subject is
// frequent everywhere and loses to the concentrated topic, so a referent's spine is never headed by
// the referent it belongs to; a stretch with nothing concentrated enough keeps its positional
// placeholder (placeholder ≠ junk). Deterministic and source-grounded — no model, no invented text.

const STOP = new Set(('the a an of to in on for and or but with without into from by as at it its this ' +
  'that these those they them he she his her him you your we our us i me my is are was were be been being ' +
  'do does did has have had not no so then than also more most such which who whom whose what when where ' +
  'why how using used use their there here across through one first over about out up down off away back ' +
  'many much few some any all both each other another same different new old said says say according would ' +
  'could should shall will can may might must now just only very upon while when after before during').split(/\s+/));
// Strip a trailing possessive ('s) the same way `norm` (below) does, so a distinctive term found
// here can still be RE-LOCATED in the original mention text during phrase-widening — "Ada's" and
// "Ada" must canon to the same token, or the widening loop silently fails to find `best` and the
// label stays a bare, un-widened possessive ("Ada's") instead of the surrounding phrase.
const contentToks = (s) => (String(s || '').toLowerCase().match(/[a-z][a-z'-]{3,}/g) || [])
  .map((t) => t.replace(/'s$/, ''))
  .filter((t) => t.length >= 3 && !STOP.has(t));
const titleCase = (s) => String(s || '').trim().replace(/\s+/g, ' ').split(' ').slice(0, 4)
  .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
const labelOk = (t) => { const s = String(t || '').trim(); return s.length >= 3 && /[a-z]/i.test(s) && !STOP.has(s.toLowerCase()); };

// The global content-term frequency across a set of mention-groups (the denominator distinctiveness
// is scored against), plus the words of the entity's own name — excluded from every label so the
// spine is never headed by the referent it belongs to.
export const labelContext = (groups, label) => {
  const global = new Map();
  for (const g of groups) for (const t of contentToks((g || []).map((m) => m.text).join(' '))) global.set(t, (global.get(t) || 0) + 1);
  return { global, exclude: new Set(contentToks(label)) };
};

// The distinctive-term name for one group, scored against the global frequency across all groups —
// a term concentrated HERE wins; a term spread everywhere (the subject itself) loses. Returns an
// earned, title-cased phrase, or '' when nothing is concentrated enough to name honestly.
export const emergentLabel = (groupMentions, { global, exclude }) => {
  const text = (groupMentions || []).map((m) => String(m.text || '')).join(' ');
  const segFreq = new Map();
  for (const t of contentToks(text)) segFreq.set(t, (segFreq.get(t) || 0) + 1);
  let best = null; let bestScore = -Infinity; let bestDistinct = 0;
  for (const [t, c] of segFreq) {
    if (!labelOk(t) || exclude.has(t)) continue;
    const rest = (global.get(t) || 0) - c;                          // occurrences of t OUTSIDE this stretch
    const distinct = c / (1 + rest);                                // concentration here vs elsewhere
    const score = distinct + c * 0.01;                              // tie-break to the more-repeated term
    if (score > bestScore) { bestScore = score; best = t; bestDistinct = distinct; }
  }
  // Only name when EARNED — the term is genuinely concentrated in this stretch (distinct ≥ 1.5), not
  // merely present. Otherwise the caller keeps the positional placeholder — an honest non-name.
  if (!best || bestDistinct < 1.5) return '';
  // Clip a short phrase AROUND the distinctive term's first occurrence, straight out of the source
  // sentence — a title reads as "Sixth X-15 Flight", not the bare word "Flight". Walk outward from the
  // term word-by-word and stop at the first stopword / excluded (referent-name) / too-short word on
  // each side, so the phrase never runs into the subject the spine must never be headed by. Still
  // grounded: every word is lifted verbatim from an actual mention, never invented.
  const norm = (t) => String(t).toLowerCase().replace(/'s$/, '').replace(/[^a-z'-]/g, '');
  const blocked = (t) => { const w = norm(t); return w.length < 3 || STOP.has(w) || exclude.has(w); };
  let phraseWords = [best];
  for (const m of (groupMentions || [])) {
    const toks = String(m.text || '').match(/[A-Za-z][A-Za-z'-]*/g) || [];
    const i = toks.findIndex((t) => norm(t) === best);
    if (i < 0) continue;
    const pre = [];
    for (let j = i - 1; j >= 0 && pre.length < 3; j--) { if (blocked(toks[j])) break; pre.unshift(toks[j]); }
    const post = [];
    for (let j = i + 1; j < toks.length && post.length < 2; j++) { if (blocked(toks[j])) break; post.push(toks[j]); }
    phraseWords = [...pre, toks[i], ...post];
    break;
  }
  return titleCase(phraseWords.join(' '));
};
