// EO: NUL·DEF·SIG(Entity,Field → Void,Lens, Clearing,Making,Tending) — the redaction membrane; NAMES collapse to tokens
// write/redact.js — the redaction membrane: run the cursor membrane BACKWARDS.
//
// cursor.js keeps hashIds OUT of the model input so the model sees clean real NAMES
// (assertNoLeak throws on /r#…/). That membrane protects CORRECTNESS. This one protects
// CONFIDENTIALITY: it keeps real NAMES out so a REMOTE model sees only opaque TOKENS. Same
// one act of identity-collapse, aimed the other way.
//
//   fold (names)  ──pseudonymize──▶  redacted RDF-star  ──▶  remote model  ──▶  redacted prose
//        │                            (tokens + the typed EO shape)                    │
//        └───────────────── de-pseudonymize (memory-local table) ─────────────────────┘
//                                                    │
//                              local grammar cleanup (fixArticles + write/ realizer)
//
// The model does STRUCTURE over opaque handles — ordering, subordination, how to bridge the
// relations, how firmly to assert by the band — all the rhetorical work a big model is better
// at than the local NLG. It never learns that `Referent7` is "Dr. Awad". The token→name table
// is memory-local and never serialized into a prompt, a log, or a cached transcript.
//
// The final linguistic pass — the part that NEEDS the real name because grammar depends on it
// (the a/an choice, agreement, morphology) — runs LOCALLY, after restoration, with the rule
// libraries already in write/. The a/an fix is the clean demonstration of the thesis: the model
// could not have got it right, because it never saw the real word.
//
// THE MEMBRANE INVARIANT (mirror of cursor.js §5): no real name may appear in the model input.
// assertNoNameLeak serializes the whole prompt and throws if any referent surface — raw or in
// its RDF QName form — survives. Mechanical, not a matter of prompt wording.
//
// SCOPE. This defends name/value confidentiality and verbatim non-egress. It does NOT defend
// against re-identifying a sufficiently distinctive relational graph; keep the sent subgraph
// minimal (the surf already prunes to the salient stops) and treat structure-linkage as
// residual risk to disclose, not defeat. See docs/llm-prosification-security.md.

import { rdfRealizationPrompt } from './rdf.js';
import { emitEot } from '../../organs/ingest/index.js';

// ── tokens ───────────────────────────────────────────────────────────────────
// Opaque, per-referent, stable within a turn. Chosen to be RDF-QName-safe (alnum, so
// ex:Referent1 survives localName mangling) AND prose-stable (they read as proper nouns, so a
// talker echoes them verbatim instead of "correcting" them). Entities → Referent{n}; literal
// objects (numbers, dates, un-admitted nouns — identity too, §5) → Value{n}.
const ENTITY_PREFIX = 'Referent';
const LITERAL_PREFIX = 'Value';

// A token in text, optionally still wearing its ex: QName prefix (how it leaves the RDF).
const TOKEN_RE = () => /\b(?:ex:)?((?:Referent|Value)\d+)\b/g;

// ── the alias table ────────────────────────────────────────────────────────────

const snapshot = (doc) =>
  typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);

// scanReferents(doc, { only, max }) → the referents briefRDF would write, in first-appearance
// order, each tagged entity|literal. Mirrors briefRDF's own traversal EXACTLY (same op filter,
// same `only` stop-set, same `max` cap) so the alias covers precisely what the graph emits.
const scanReferents = (doc, { only = null, max = 24 } = {}) => {
  const events = snapshot(doc);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, e.label);
  const isEntity = (id) => label.has(id);
  const L = (id) => label.get(id) ?? id;

  const seen = new Set();
  const refs = [];
  const add = (lab, kind) => {
    const key = String(lab);
    if (seen.has(key)) return;                 // one token per surface, first kind wins
    seen.add(key);
    refs.push({ label: key, kind });
  };
  let n = 0;
  for (const e of events) {
    if (!((e.op === 'CON' || e.op === 'SIG') && e.via && e.src != null)) continue;
    if (only && e.sentIdx != null && !only.has(e.sentIdx)) continue;
    if (n >= max) break;
    n += 1;
    add(L(e.src), 'entity');
    if (e.tgt != null) add(L(e.tgt), isEntity(e.tgt) ? 'entity' : 'literal');
  }
  return refs;
};

// buildTable(refs) → { alias: Map<name, token>, back: Map<token, name> }. Deterministic and
// order-stable: the nth distinct entity is Referent{n}, the nth distinct literal Value{n}.
export const buildTable = (refs) => {
  const alias = new Map();
  const back = new Map();
  let e = 0;
  let l = 0;
  for (const { label, kind } of refs) {
    if (alias.has(label)) continue;
    const token = kind === 'literal' ? `${LITERAL_PREFIX}${++l}` : `${ENTITY_PREFIX}${++e}`;
    alias.set(label, token);
    back.set(token, label);
  }
  return { alias, back };
};

// redactionTable(doc, opts) → the table alone (name ⇄ token) for the salient subgraph.
export const redactionTable = (doc, { only = null, max = 24 } = {}) =>
  buildTable(scanReferents(doc, { only, max }));

// ── the membrane check ─────────────────────────────────────────────────────────

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The same QName localization briefRDF applies (ex:/eo: fragments) — a name can leak in this
// mangled form even if the raw string does not survive.
const localName = (s) => String(s).trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';

const serializePrompt = (prompt) => {
  if (prompt && (prompt.system != null || prompt.user != null)) return `${prompt.system ?? ''}\n${prompt.user ?? ''}`;
  if (Array.isArray(prompt)) return prompt.map((m) => `${m.role}\n${m.content}`).join('\n');
  return String(prompt ?? '');
};

// assertNoNameLeak(prompt, names) — the membrane invariant, mechanical (mirror of cursor.js's
// assertNoLeak). Serialize the whole prompt and throw if any real referent surface survives,
// raw OR as its ex:/eo: QName fragment. A leak is a bug, not a style nit, so it throws.
export const assertNoNameLeak = (prompt, names) => {
  const serial = serializePrompt(prompt);
  for (const name of names) {
    const raw = String(name);
    if (!raw) continue;
    if (serial.includes(raw)) throw new Error(`redaction leak: name "${raw}" reached the model input`);
    const q = localName(raw);
    if (q && q !== raw && new RegExp(`\\b${escapeRe(q)}\\b`).test(serial)) {
      throw new Error(`redaction leak: name "${raw}" (as ${q}) reached the model input`);
    }
  }
  return true;
};

// ── the public membrane ─────────────────────────────────────────────────────────

// redact(doc, { only, max }) → the REDACTED talker payload + the local-only restore table.
//   prompt  { system, user } — the EO-annotated RDF-star brief with every referent tokenized;
//           safe to send to a remote model (assertNoNameLeak has proven it clean)
//   table   Map<token, name> — MEMORY-LOCAL; never send it anywhere
//   names   the real referent surfaces (for the caller's own leak audits)
//   alias   Map<name, token> — the forward map (for building matching local surfaces)
export const redact = (doc, { only = null, max = 24 } = {}) => {
  const refs = scanReferents(doc, { only, max });
  const { alias, back } = buildTable(refs);
  const prompt = rdfRealizationPrompt(doc, { max, only, alias });
  const names = [...alias.keys()];
  assertNoNameLeak(prompt, names);                // throws on any leak, before anything leaves
  return Object.freeze({ prompt, table: back, names, alias });
};

// ── the EOT carrier — the fuller richness, taught in-message ─────────────────────
// The RDF-star projection (rdf.js) carries ONLY CON/SIG edges + five annotations; it silently
// drops NUL (absence), DEF (attributes), SYN (identity/composition), SEG (partition), EVA
// (a judgment WITH its from→to transition), REC (remap), CON polarity (not-r), the claim vs
// designation register, and @agent. EOT — the system's native surface — carries all of it, in
// ONE dense line per event, and we already own a lossless log→EOT emitter (eot-emit.js). A
// capable model does not need EOT to be familiar; it needs it TAUGHT, once, per message — which
// is what the legend is. So this carrier hands the talker the full reading over tokens.

// EOT_LEGEND — the notation, taught in the system prompt each message. Compact by design: EOT
// is regular and line-oriented, so a short legend is enough for the model to read every shape.
export const EOT_LEGEND =
  'The reading is given as EOT — one fact per line, in this notation:\n'
  + '  X : T            X is a T (a kind / type)\n'
  + '  X.f = v          X\'s f is v (an attribute)\n'
  + '  X.f = nil        X has no f (a real, asserted ABSENCE — say it as an absence)\n'
  + '  X -> Y : r       X stands in relation r to Y\n'
  + '  X -> Y : not-r   X does NOT stand in relation r to Y (a negated relation)\n'
  + '  X == Y           X and Y are the same thing\n'
  + '  X <- [A, B]      X is composed of A and B\n'
  + '  X | k            X is partitioned / divided by k\n'
  + '  !eva X.f : a -> b   a JUDGEMENT: X\'s f changed from a to b (narrate the change)\n'
  + '  !sig X : T       X is (re)designated a T;  !clm marks it a claim, not a settled fact\n'
  + '  trailing @who ~when   who read it / when — provenance, not part of the sentence\n';

const EOT_SYSTEM =
  'You are the voice that turns a reading into words. '
  + EOT_LEGEND
  + '\nSay the reading as fluent, natural speech — join related facts, use pronouns, let it '
  + 'flow, and honour the shapes: an absence is an absence, a negated relation stays negated, a '
  + '!clm is tentative ("reportedly"), an !eva is a change over time. Keep strictly to the '
  + 'facts given — add no relation the lines do not contain.';

// scanReferentsEot(doc, { max }) → the referents the EOT surface would expose, in stable order:
// every entity label (introduced by INS) as an entity, then every DEF/EVA literal VALUE. One
// token per surface (entity claims it first). Field keys, relations, types and operators are
// STRUCTURE and pass through — the same identity/structure line the RDF carrier draws.
const scanReferentsEot = (doc, { max = Infinity } = {}) => {
  const events = snapshot(doc);
  const refs = [];
  const claimed = new Set();
  const add = (lab, kind) => {
    const k = String(lab);
    if (!k || claimed.has(k)) return;
    claimed.add(k);
    refs.push({ label: k, kind });
  };
  let n = 0;
  for (const e of events) { if (n >= max) break; if (e.op === 'INS' && e.label != null) { add(e.label, 'entity'); n += 1; } }
  for (const e of events) {
    if (e.op === 'DEF' && e.kind !== 'void') { const v = e.value !== undefined ? e.value : e.tgt; if (v != null && v !== '') add(v, 'literal'); }
    if (e.op === 'EVA') { if (e.from != null) add(e.from, 'literal'); if (e.to != null) add(e.to, 'literal'); }
  }
  return refs;
};

// redactEot(doc, { max }) → the REDACTED EOT talker payload + the local-only restore table.
// Same membrane contract as redact(), but the carrier is native EOT (fuller richness) with the
// legend taught in the system prompt. assertNoNameLeak proves the whole prompt clean first.
export const redactEot = (doc, { max = Infinity } = {}) => {
  const refs = scanReferentsEot(doc, { max });
  const { alias, back } = buildTable(refs);
  const body = emitEot(doc?.log ?? doc, { max, alias });   // emitEot takes the log, not the doc
  const prompt = Object.freeze({
    system: EOT_SYSTEM,
    user: `${body.text}\n\nNow say this reading as natural speech:`,
  });
  assertNoNameLeak(prompt, [...alias.keys()]);       // fail-closed: throws on any surviving surface
  return Object.freeze({ prompt, table: back, names: [...alias.keys()], alias, skipped: body.skipped });
};

// ── restoration + local grammar cleanup ─────────────────────────────────────────

// restore(text, table) → de-pseudonymize: every token (bare or ex:-prefixed) back to its real
// name. An unknown token is left untouched (surfaced by realizeRestored as `unresolved`).
export const restore = (text, table) =>
  String(text ?? '').replace(TOKEN_RE(), (m, tok) => (table.get(tok) ?? m));

// A rough vowel-SOUND onset test for the a/an rule — letter-level, with the common silent-h
// and "yoo"/"wun" exceptions the letter alone gets wrong. A defeasible grammar rule (the same
// posture as write/eva.js): it is right on the vast majority and never invents content.
const startsVowelSound = (w) => {
  const s = String(w).toLowerCase();
  if (/^(hour|honest|heir|honou?r|homage)/.test(s)) return true;   // silent h → vowel sound
  if (/^(uni|use|user|usu|euro|eu[bcdfghjklmnpqrstvwxyz]|one|once|ubiqu)/.test(s)) return false;  // yoo-/wun- onset
  return /^[aeiou]/.test(s);
};

// fixArticles(text) → correct every indefinite article to its following word's sound. This is
// the pass that ONLY makes sense AFTER restoration: the model wrote "a Referent7" over an
// opaque token; once Referent7 becomes "Awad" the article must become "an". A purely local,
// deterministic English rule — no model, no content, un-fabricable.
export const fixArticles = (text) =>
  String(text ?? '').replace(/\b([Aa])n?\b(\s+)(\p{L}[\p{L}''-]*)/gu, (m, a, sp, word) => {
    const cap = a === 'A';
    const an = startsVowelSound(word);
    const art = an ? (cap ? 'An' : 'an') : (cap ? 'A' : 'a');
    return `${art}${sp}${word}`;
  });

// realizeRestored(text, table) → the full local cleanup seam: de-pseudonymize, then run the
// deterministic grammar fix that restoration makes newly relevant. Returns { text, unresolved }
// — `unresolved` lists any token the table could not map (a bound guard, never silently
// dropped). Callers can layer the richer write/ realizer (genders/refer/realize, keyed on the
// real names now present) on top; the a/an fix is the minimum that restoration itself demands.
export const realizeRestored = (text, table) => {
  const restored = restore(text, table);
  const fixed = fixArticles(restored);
  const unresolved = [...new Set((fixed.match(TOKEN_RE()) || []))];
  return Object.freeze({ text: fixed, unresolved });
};
