// EO: INS·NUL(Void,Atmosphere → Entity, Making,Clearing) — the model-free inner voice
// The narrator (narrator.js) puts words to a twitch WITH a tiny LM. This is its twin for when no
// model is wired (phases 1–2, the common case): it puts WORDS to the feeling (spec §6) — but the
// words are not INVENTED. The strip should read like a mind READING, not a dashboard and not a bank
// of canned reactions to the geometry.
//
// So the inner voice surfaces the ACTUAL propositions the reader is parsing at this fold — the
// grounded x→relation→y claims the fold extracted (`ctx.note.levels.structure`), realized to natural
// speech by the ENGINE'S OWN realizer (weave/write speakTriples, done at the wiring site so murmur
// imports nothing from the pipeline). What flows through the strip is what the reader is really
// reading — "Ryan Coogler directed Sinners." — tinted by the FEELING the sense has about it (the
// dominant register's colour). A live wander phrase leads in its own words; when nothing was parsed
// it shows the passage being read; only truly idle does it fall to a spare state line.
//
// Each voiced thought also carries its NATIVE-EOT TUPLE — the event the reader's act reads as in the
// engine's own nine-operator vocabulary (core/operators.js, core/event.js): `op(site…, res)`. A
// grounded claim is a CON (the central bond); the feeling picks the operator for a register-led
// mutter (surprise→SIG, recognition→CON, drift→SEG, …); an untroubled hold is a NUL. The site is the
// referent's opaque existence handle, minted DETERMINISTICALLY from the referent text so the same
// figure recurs with the same address (coref BINDS, never re-mints — §1); the resolution is the void/
// firm how-definitely (void is the default — definiteness must be earned, §3b). This is a RENDERING
// of the real impression into EOT notation, exactly as the prose is a rendering of it into speech —
// both are voicings, never facts.
//
// Same discipline as the narrator: this is a VOICING of impressions, never a logged claim
// (kind:'impression', canWitness===false) — never a citable fact and never in the answer prompt
// (§9.3/§9.5). It only re-voices content the reader already grounded; it adds nothing of its own.
// Pure and offline: unit-testable with hand-fed propositions — no model, no clock, no randomness.

// The first sentence/clause of a passage, so the "what I'm literally reading" fallback reads like a
// thought and not a paragraph. Lookbehind-free for old-engine safety.
const condenseClause = (text, maxWords = 14) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = t.match(/^(.*?[.!?])(\s|$)/);
  const cut = m ? m[1] : t;
  const ws = cut.split(' ');
  return ws.length > maxWords ? ws.slice(0, maxWords).join(' ').replace(/[.,;:—–-]+$/, '') + '…' : cut;
};

// The strongest live register — the FEELING that tints the claims (its colour, not its words). Null
// when nothing has crossed, so an untroubled reading shows its propositions in neutral ink.
const dominantRegister = (impressions = []) => {
  let best = null;
  for (const i of impressions) {
    if (!i || typeof i.decayedIntensity !== 'number' || i.decayedIntensity <= 0.02) continue;
    if (!best || i.decayedIntensity > best.decayedIntensity) best = i;
  }
  return best ? best.register : null;
};

// ── The native-EOT tuple for a voiced thought ────────────────────────────────
// The feeling → the operator it reads as (core/operators.js). A register-led mutter takes its op
// from here; a grounded proposition is always a CON (the central bond) regardless of the tint; a
// bare passage the reader is turning over is a SEG (resplit within the figure); a quiet hold is NUL.
const REG_OP = Object.freeze({
  unease:      'DEF',   // a doubt is a hedged/refused assertion — Diff × Interpretation
  drift:       'SEG',   // wandered attention re-splits the figure — Diff × Structure
  surprise:    'SIG',   // the first mark against the field — Rel × Existence
  recognition: 'CON',   // an echo BINDS two loci — Rel × Structure (the central op)
  curiosity:   'REC',   // the wander's reach folds into a rule it keeps — Gen × Interpretation
  outward:     'INS',   // a lead mints a new anchor from the outside — Gen × Existence
  discovery:   'SYN',   // what it found folds into a higher-grain figure — Gen × Structure
});

// The band an operator naturally sits at when it fires. VOID is the honest default (a hold, a doubt,
// an unfocused drift); FIRM is earned (a mark arrived, a bond witnessed, a rule that held).
const OP_BAND = Object.freeze({
  NUL: 'void', SEG: 'void', DEF: 'void',
  SIG: 'firm', CON: 'firm', EVA: 'firm',
  INS: 'firm', SYN: 'firm', REC: 'firm',
});

const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
const round2 = (x) => Math.round(x * 100) / 100;

// The resolution — band + a proper-scorable p. Void withholds (low p); firm commits (high p). p is
// nudged by the feeling's live intensity so a louder impression reads a touch firmer, but never
// crosses the band's honest ceiling. Deterministic — same feeling in, same p out.
const resolutionFor = (band, intensity = 0) => {
  const i = clamp01(intensity);
  const p = band === 'firm'
    ? round2(Math.min(0.92, 0.60 + i * 0.30))
    : round2(Math.max(0.05, Math.min(0.45, 0.12 + i * 0.24)));
  return { band, p };
};

// mintSiteFrom — the EXISTENCE handle, opaque base36 under r#, mirroring core/event.js mintHash's
// shape (`r#` + 3 base36 chars). Here the seq is a STABLE hash of the referent text rather than an
// appearance counter, so the same referent always mints the same site: coref recurs by construction
// (the same figure is bound to, never re-minted — §1) and the strip stays pure (no shared mint state).
const hashText = (s) => {
  let h = 2166136261 >>> 0;                    // FNV-1a — small, stable, dependency-free
  const str = String(s == null ? '' : s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
};
const mintSiteFrom = (text, grain = 0, holder = null) => {
  const hash = 'r#' + (hashText(text) % 46656).toString(36).padStart(3, '0');   // 36^3 = 46656 → 3 chars
  return holder ? { hash, grain: grain | 0, holder } : { hash, grain: grain | 0 };
};

// Strip the punctuation that clings to a token's edges (a trailing sentence period, an opening
// quote) while keeping what's internal (`U.S.`, `O'Brien`), so the same referent keys to the same
// site whether it lands mid-claim or sentence-final — "Sinners" and "Sinners." must not diverge.
const trimEdges = (s) => {
  const t = String(s || '');
  let out = t;
  try { out = t.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ''); }
  catch { out = t.replace(/^[^\w]+|[^\w]+$/g, ''); }
  return out || t;
};

// A sentence-initial capital is not a referent — "The outpost…" opens with "The", not an entity. A
// small stoplist drops the function words that only capitalize because they lead the claim, so the
// site tracks the real figure (and the SAME figure recurs with the same site — coref, §1).
const STOP = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she',
  'they', 'we', 'you', 'i', 'his', 'her', 'their', 'in', 'on', 'at', 'of', 'to', 'for', 'and', 'but',
  'or', 'as', 'by', 'from', 'with', 'when', 'while', 'after', 'before', 'if', 'then', 'so']);

// The proper-noun-ish referents in a claim, in order — the figures a CON binds. Falls back to a
// word-split when the claim carries no capitalized spans, so CON always has two argument slots (the
// arity gate, §3a — a Relate operator reads two).
const referentsOf = (text) => {
  const t = String(text || '');
  let caps = [];
  try { caps = t.match(/[A-Z][\p{L}\d''.\-]*(?:\s+[A-Z][\p{L}\d''.\-]*)*/gu) || []; }
  catch { caps = t.match(/[A-Z][\w''.\-]*(?:\s+[A-Z][\w''.\-]*)*/g) || []; }   // engines without \p{L}
  return caps.map(trimEdges).filter((c) => c && !STOP.has(c.toLowerCase()));
};
const conSites = (text) => {
  const caps = referentsOf(text);
  if (caps.length >= 2) return [mintSiteFrom(caps[0]), mintSiteFrom(caps[caps.length - 1])];
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (caps.length === 1) {
    const tail = words.filter((w) => !caps[0].includes(w)).slice(-2).join(' ');
    return [mintSiteFrom(caps[0]), mintSiteFrom(tail || (words[words.length - 1] || (text + '·2')))];
  }
  const mid = Math.max(1, Math.floor(words.length / 2));
  return [mintSiteFrom(words.slice(0, mid).join(' ') || text), mintSiteFrom(words.slice(mid).join(' ') || (text + '·2'))];
};

// tupleFor(kind, text, register, intensity) → { op, sites, res }. The one place the feeling/content
// is read into the engine's operator grammar. `kind` is the entry's provenance in innerVoice below
// (a wander mutter / a parsed proposition / a passage clause / an idle hold), which fixes the op when
// the feeling doesn't.
const tupleFor = (kind, text, register, intensity) => {
  if (kind === 'idle')    return { op: 'NUL', sites: [mintSiteFrom(text || 'rest')], res: resolutionFor('void', 0) };
  if (kind === 'passage') return { op: 'SEG', sites: [mintSiteFrom(text)],           res: resolutionFor('void', intensity) };
  if (kind === 'mutter') {
    const op = REG_OP[register] || 'REC';
    if (op === 'CON') return { op, sites: conSites(text), res: resolutionFor('firm', intensity) };
    return { op, sites: [mintSiteFrom(text)], res: resolutionFor(OP_BAND[op] || 'firm', intensity) };
  }
  // kind === 'proposition' — a grounded x→relation→y bond: the central CON. Firm (the reader
  // grounded it), unless the sense is uneasy or adrift about it — then the how-definitely hedges void.
  const band = (register === 'unease' || register === 'drift') ? 'void' : 'firm';
  return { op: 'CON', sites: conSites(text), res: resolutionFor(band, intensity) };
};

// The live intensity of a given register in the working feel (0 when it isn't crossing), so the
// tuple's p tracks the same feeling the colour does.
const intensityOf = (impressions, register) => {
  if (!register) return 0;
  const hit = (impressions || []).find((i) => i && i.register === register && typeof i.decayedIntensity === 'number');
  return hit ? hit.decayedIntensity : 0;
};

const RESTING = `still — nothing to read just yet.`;
const alongLine = (signal) => {
  const foot = signal && typeof signal.concentration === 'number' ? signal.concentration : null;
  return (foot != null && foot < 0.4) ? `reading along — nothing's come into focus yet.` : `reading along.`;
};

// innerVoice({ signal, impressions, propositions, passageText, mutter }) → Array<{ text, register,
// op, sites, res }>, ≤2, in reading salience order. `propositions` are the fold's grounded claims
// already realized to short natural speech (strings, or { text }); `register` is the feeling that
// tints them; `op`/`sites`/`res` are the native-EOT tuple the act reads as. Never returns empty — a
// quiet reading still has a line (a NUL hold).
export const innerVoice = ({ signal = null, impressions = [], propositions = [], passageText = '', mutter = null } = {}) => {
  const reg = (mutter && mutter.register) ? mutter.register : dominantRegister(impressions);
  const out = [];

  const push = (text, register, kind) => {
    const tint = register ?? null;
    const { op, sites, res } = tupleFor(kind, text, tint, intensityOf(impressions, tint));
    out.push({ text: String(text), register: tint, op, sites, res });
  };

  // 1. the wander's own words about what it's reading lead verbatim.
  if (mutter && mutter.phrase) push(mutter.phrase, mutter.register || reg, 'mutter');

  // 2. the ACTUAL propositions the fold parsed — the real claims flowing through, tinted by the feeling.
  for (const p of (propositions || [])) {
    if (out.length >= 2) break;
    const text = p && (typeof p === 'string' ? p : p.text);
    if (!text) continue;
    push(text, reg, 'proposition');
  }

  // 3. nothing structured, but there IS a passage → voice what it is literally reading (still real content).
  if (out.length === 0 && passageText) {
    const clause = condenseClause(passageText);
    if (clause) push(clause, reg, 'passage');
  }

  // 4. truly idle — a spare state line (a NUL hold), never a fabricated reaction to content.
  if (out.length === 0) {
    const hasSignal = signal && typeof signal.concentration === 'number';
    push(hasSignal ? alongLine(signal) : RESTING, null, 'idle');
  }

  return out.slice(0, 2);
};
