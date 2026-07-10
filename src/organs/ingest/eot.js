// EO: INS·SIG·DEF(Field → Entity,Network, Making,Binding,Dissecting) — EOT ingester: surface -> tuples/log
// EOT — Existential-Operator Triples: a conforming ingester. (docs/eot-surface-syntax.md)
//
// Surface → canonical EO tuples. The producer writes punctuation shapes it already knows
// (`X : T`, `X.f = v`, `X -> Y : r`) and never a 9-way operator classification; this module
// RECOVERS the operator from shape + running state (§7), mints anchors and keeps the sign
// table (§8.4), derives the Site-face cell and decal (Appendix B), and emits one fully-
// specified event per line (§8.1). A malformed line is never dropped — it becomes a
// diagnostic (§9). Regular, line-oriented: the parser is a handful of regexes.
//
// PROVENANCE — the load-bearing point. EOT is NOT the world. It is the model's NOTES of a
// reading — its representation of its own interpretation, not a record of what happened. So an
// EOT event is REAFFERENCE (the enactor door): mine, and by the §8 type law it CANNOT witness.
// The source text is the exafference (the world, what happened); the EOT is the conjecture
// read off it, held defeasibly. So `door` defaults to 'enactor', and the events are stamped
// with fromEnactor — canWitness(prov) is false. Only an EXTERNAL import (OWL/Airtable, real
// data) is exafference, and the caller passes door:'perceiver' for that. A prior EOT reloaded
// later comes back READ_BACK-of-prior-self via the indexical reload — never fresh world.

import { isOperator, mintHash, terrainOf, createLog, fromEnactor, fromPerceiver } from '../../core/index.js';
import { tok } from '../../perceiver/parse/index.js';
import { attachReading } from './read.js';

// ── Site / decal derivation (Appendix B) ──────────────────────────────────────
// The Act face is the operator (Mode × Domain). The SITE is WHERE it lands — the target's
// domain × the object grain — which is why a DEF on an entity's slot is an Entity site, not the
// operator's own Interpretation row. ω (the decal) is the object position; the Site-face cell
// follows from the site domain and the grain ω names.
const GRAIN_OF = { '+': 'Figure', '*': 'Pattern', '−': 'Ground' };
const OP_SITE = Object.freeze({
  INS: { domain: 'Existence',      omega: '+' },   // an entity → Entity
  SIG: { domain: 'Existence',      omega: '+' },   // a re-designation of an entity → Entity
  DEF: { domain: 'Existence',      omega: '+' },   // a value on an entity's slot → Entity
  NUL: { domain: 'Existence',      omega: '+' },   // an absence at an entity's slot → Entity
  CON: { domain: 'Structure',      omega: '+' },   // a link → Link
  SEG: { domain: 'Structure',      omega: '*' },   // a partition → Network
  SYN: { domain: 'Structure',      omega: '*' },   // a derived whole / identity → Network
  EVA: { domain: 'Interpretation', omega: '+' },   // a judgment → Lens
  REC: { domain: 'Interpretation', omega: '*' },   // a reframe → Paradigm
});
const siteOf = (op) => {
  const s = OP_SITE[op];
  if (!s) return { site: null, omega: null };
  return { site: terrainOf(s.domain, GRAIN_OF[s.omega]), omega: s.omega };
};

// ── Lexical helpers ───────────────────────────────────────────────────────────
// strip a trailing comment — a `#` that is not inside a quoted string (§4.2).
const stripComment = (line) => {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === '#' && !q) return line.slice(0, i);
  }
  return line;
};

// pull the trailing provenance trailer (§5.7): `@agent` and `~ts`, order-independent, both
// optional, after the body. Returns { body, agent, ts }.
const splitMeta = (line) => {
  let body = line;
  let agent = null;
  let ts = null;
  let m;
  // a trailing @… or ~… token (whitespace-separated), stripped repeatedly so order is free.
  while ((m = body.match(/\s+([@~])([^\s@~]+)\s*$/))) {
    if (m[1] === '@') agent = m[2]; else ts = m[2];
    body = body.slice(0, m.index).replace(/\s+$/, '');
  }
  return { body, agent, ts };
};

// parse a value literal (§4.5): quoted string, ∅/nil, bool, number, else bareword string.
const parseValue = (raw) => {
  const t = raw.trim();
  if (t === '∅' || t === 'nil') return { value: null, isNull: true };
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') return { value: t.slice(1, -1), isNull: false };
  if (t === 'true' || t === 'false') return { value: t === 'true', isNull: false };
  if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return { value: Number(t), isNull: false };
  return { value: t, isNull: false };
};

// a target is a SIGN or PATH — no whitespace, no unbalanced quotes; a literal here is an error.
const looksLikeTarget = (s) => /^[A-Za-z0-9_:.\-]+$/.test(s);
const rootSign = (target) => String(target).split('.')[0];
const parseList = (inner) => inner.split(',').map((x) => x.trim()).filter(Boolean);

// ── The ingester ──────────────────────────────────────────────────────────────
// parseEOT(text, context) → { events, diagnostics, signs }
//   context  the ingestion envelope: { agent, ts, mode, frame } (§8.3). Defaults applied
//            when a line carries no @/~ trailer.
//   events   one canonical tuple per well-formed statement (§8.1)
//   diagnostics  { line, raw, expected } for each malformed line (§9) — never silent
//   signs    the final sign→anchor table (§8.4)
export const parseEOT = (text, context = {}) => {
  const ctx = {
    agent: context.agent ?? 'model:eot',
    mode: context.mode ?? 'asserted',
    frame: context.frame ?? 'eot',
    ts: context.ts ?? null,
    // EOT is the model's interpretation by default → the ENACTOR door (reafference, cannot
    // witness). An external import (real data) is exafference → the caller passes 'perceiver'.
    door: context.door === 'perceiver' ? 'perceiver' : 'enactor',
  };
  const signs = new Map();        // sign → anchor (minted at first INS, §8.4)
  let seq = 0;
  let uid = 0;
  const events = [];
  const diagnostics = [];

  const mintAnchor = (sign) => {
    if (signs.has(sign)) return signs.get(sign);
    const anchor = mintHash(seq++);
    signs.set(sign, anchor);
    return anchor;
  };
  const anchorOf = (target) => signs.get(rootSign(target)) ?? null;

  // assemble a canonical tuple, deriving site/decal and stamping provenance.
  const emit = (op, target, operand, meta, { mintFor = null, anchor = null } = {}) => {
    if (!isOperator(op)) { diagnostics.push({ line: meta.lineNo, raw: meta.raw, expected: `unknown operator ${op}` }); return; }
    const a = mintFor ? mintAnchor(mintFor) : (anchor ?? anchorOf(target));
    const { site, omega } = siteOf(op);
    events.push(Object.freeze({
      uuid: `evt-${uid++}`,
      op, target,
      anchor: a,
      operand: Object.freeze(operand),
      addr: Object.freeze({ omega }),
      site,
      agent: meta.agent ?? ctx.agent,
      ts: meta.ts ?? ctx.ts,
      mode: ctx.mode,
      frame: ctx.frame,
      door: ctx.door,              // enactor (the model's notes) unless an external import
      line: meta.lineNo,           // the source line (1-based) — the arrow of time for the log
    }));
  };

  const lines = String(text ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i].replace(/\r$/, '');
    const noComment = stripComment(raw).trim();
    if (!noComment) continue;                                      // empty / comment-only (§4.2)
    const { body, agent, ts } = splitMeta(noComment);
    const meta = { agent, ts, lineNo, raw };
    const bad = (expected) => diagnostics.push({ line: lineNo, raw, expected });

    // ── tagged statements: the flag forces the operator (§5.4) ──
    if (body[0] === '!') {
      const tm = body.match(/^!([A-Za-z]+)\s+(.*)$/);
      if (!tm) { bad('a tag must be "!flag body"'); continue; }
      const flag = tm[1].toLowerCase();
      const rest = tm[2].trim();
      if (flag === 'nul') {
        const t = rest.replace(/\s*=\s*(∅|nil)\s*$/, '').trim();
        if (!looksLikeTarget(t)) { bad('!nul expects a path'); continue; }
        emit('NUL', t, { value: null }, meta);
      } else if (flag === 'sig' || flag === 'clm') {
        const m = rest.match(/^(\S+)\s*:\s*(\S.*)$/);
        if (!m) { bad(`!${flag} expects "SIGN : SIGN"`); continue; }
        const op = flag === 'clm' ? { register: 'claim' } : {};
        emit('SIG', m[1], { designation: m[2].trim(), ...op }, meta, { anchor: anchorOf(m[1]) ?? mintAnchor(m[1]) });
      } else if (flag === 'seg') {
        const m = rest.match(/^(\S+)\s*\|\s*(\S.*)$/);
        if (!m) { bad('!seg expects "SIGN | KEY"'); continue; }
        emit('SEG', m[1], { key: m[2].trim() }, meta, { anchor: anchorOf(m[1]) });
      } else if (flag === 'syn') {
        const m = rest.match(/^(\S+)\s*<-\s*\[(.*)\]\s*$/);
        if (!m) { bad('!syn expects "SIGN <- [a, b, ...]"'); continue; }
        emit('SYN', m[1], { parts: parseList(m[2]) }, meta, { mintFor: m[1] });
      } else if (flag === 'eva') {
        // PATH (":" old)? "->" new
        const m = rest.match(/^(\S+?)(?:\s*:\s*(\S.*?))?\s*->\s*(\S.*)$/);
        if (!m) { bad('!eva expects "PATH : old -> new" or "PATH -> new"'); continue; }
        const from = m[2] != null ? parseValue(m[2]).value : null;
        emit('EVA', m[1], { from, to: parseValue(m[3]).value }, meta, { anchor: anchorOf(m[1]) });
      } else if (flag === 'rec') {
        const ev = parseRec(rest);
        if (!ev) { bad('!rec expects "PATH {a,b} => {c,d}" or "PATH => {k:[...]}"'); continue; }
        emit('REC', ev.target, ev.operand, meta);
      } else {
        bad(`unknown flag !${flag}`);
      }
      continue;
    }

    // ── sugar + core, by the first distinguishing sigil (recovery §7.2) ──
    let m;
    if ((m = body.match(/^(\S+)\s*==\s*(\S+)$/))) {                 // identity → SYN(identity)
      emit('SYN', m[1], { same_as: m[2], mode: 'identity' }, meta, { anchor: anchorOf(m[1]) ?? mintAnchor(m[1]) });
    } else if ((m = body.match(/^(\S+)\s*<-\s*\[(.*)\]\s*$/))) {    // aggregate → SYN(aggregate)
      emit('SYN', m[1], { parts: parseList(m[2]) }, meta, { mintFor: m[1] });
    } else if (body.includes('->')) {                              // LINK → CON (§5.3)
      m = body.match(/^(\S+)\s*->\s*(\S+)\s*:\s*(\S[\w.\-]*)\s*$/);
      if (!m) { bad('a link must be "A -> B : relation" (the : relation label is required)'); continue; }
      emit('CON', m[1], { to: m[2], relation: m[3] }, meta, { anchor: anchorOf(m[1]) ?? mintAnchor(m[1]) });
    } else if ((m = body.match(/^(\S+)\s*\|\s*(\S.*)$/))) {         // partition sugar → SEG
      emit('SEG', m[1], { key: m[2].trim() }, meta, { anchor: anchorOf(m[1]) });
    } else if ((m = body.match(/^([A-Za-z0-9_:.\-]+)\s*=\s*(?![=>])(.+)$/))) {   // ASSIGN → DEF / NUL
      const v = parseValue(m[2]);
      if (v.isNull) emit('NUL', m[1], { value: null }, meta);
      else emit('DEF', m[1], { value: v.value }, meta);
    } else if ((m = body.match(/^([A-Za-z0-9_:.\-]+)\s+:\s+(\S.*)$/))) {   // IS-A → INS (first) / SIG (later)
      const subj = m[1];
      const type = m[2].trim();
      if (!looksLikeTarget(type.replace(/^"|"$/g, '')) && !/^[A-Za-z]/.test(type)) { bad('IS-A type must be a sign, not a literal'); continue; }
      if (signs.has(subj)) emit('SIG', `${subj}.type`, { designation: type }, meta, { anchor: signs.get(subj) });
      else emit('INS', subj, { type }, meta, { mintFor: subj });
    } else if (/\s:\S|\S:\s/.test(body)) {                         // a one-sided colon (§4.3, §9)
      bad('colon adjacent to whitespace on only one side — " : " is IS-A, tight ":" is a namespace');
    } else {
      bad('not a recognized statement (expected X : T, X.f = v, or X -> Y : r)');
    }
  }

  return Object.freeze({ events, diagnostics, signs });
};

// eotDoc(text, context) → a FIRST-CLASS document, EOT minted straight into the engine's own
// append-only log. The graph stack (projectGraph, trajectory, salience, site-terrain) reads it
// natively — an EOT document is indistinguishable from a parsed-text one to those faculties.
//
// The sign↔anchor law (§4.4, §8.4) is the spine: the SIGN ("Alice") is surface — what the
// model writes and reads — but on the backend every referent is a SPAN with an immutable
// hashId, and every later mention of that sign (a coref) resolves to the SAME id. The label
// rides for display; the id is identity. And every SEG carves a new span, which gets its OWN
// hashId — a segment is a referent, not a mention.
export const eotDoc = (text, context = {}) => {
  const { events: tuples, diagnostics, signs: _signs } = parseEOT(text, context);
  const lines = String(text ?? '').split('\n').map((l) => l.replace(/\r$/, ''));
  const log = createLog({ docId: context.docId || 'eot' });

  // EOT is the model's interpretation → reafference (enactor), unless the caller marks it an
  // external import (perceiver). Every native event is stamped with this provenance, so the §8
  // type law holds: a note made of the reading CANNOT witness — it is the conjecture, not the
  // ground. The source text is the world; this is the reading of it.
  const door = context.door === 'perceiver' ? 'perceiver' : 'enactor';
  const frame = context.frame ?? 'eot';
  const prov = door === 'perceiver' ? fromPerceiver(frame) : fromEnactor(frame);
  const app = (event) => log.append({ ...event, door, prov });

  const anchors = new Map();     // sign → immutable hashId (the coref identity)
  let seq = 0;
  // mint-or-reuse the id for a sign, INS'ing it once. The label is surface; the id is identity.
  const idOf = (sign, sentIdx, label = sign) => {
    if (anchors.has(sign)) return anchors.get(sign);
    const id = mintHash(seq++);
    anchors.set(sign, id);
    app({ op: 'INS', id, label, sentIdx });
    return id;
  };
  const fieldOf = (path) => { const i = String(path).indexOf('.'); return i < 0 ? null : String(path).slice(i + 1); };

  for (const t of tuples) {
    const sentIdx = (t.line ?? 1) - 1;
    const op = t.op;
    if (op === 'INS') {
      const id = idOf(t.target, sentIdx);                          // mint the span, INS it
      app({ op: 'SIG', src: id, via: 'is', tgt: t.operand.type, sentIdx });   // is-a, as a readable attribute
    } else if (op === 'SIG') {
      const id = idOf(rootSign(t.target), sentIdx);
      app({ op: 'SIG', src: id, via: 'is', tgt: t.operand.designation, sentIdx, ...(t.operand.register ? { register: t.operand.register } : {}) });
    } else if (op === 'DEF') {
      const id = idOf(rootSign(t.target), sentIdx);
      app({ op: 'DEF', src: id, via: fieldOf(t.target) ?? 'value', tgt: t.operand.value, sentIdx });
    } else if (op === 'NUL') {
      const id = idOf(rootSign(t.target), sentIdx);
      app({ op: 'NUL', src: id, via: fieldOf(t.target) ?? 'value', sentIdx });
    } else if (op === 'CON') {
      const s = idOf(t.target, sentIdx);
      const o = idOf(t.operand.to, sentIdx);                       // the object is a span too — its own id
      app({ op: 'CON', src: s, tgt: o, via: t.operand.relation, sentIdx });
    } else if (op === 'SYN' && t.operand.mode === 'identity') {
      // reconcile two SIGNS onto ONE immutable id (the coref law). The left is canonical; the
      // right's sign is repointed at it so every LATER mention resolves to the survivor — all
      // corefs share the id. If the right was already its own span, the SYN records the
      // identity (history preserved, §8.6); if unseen, it is simply another sign for the span.
      const a = idOf(t.target, sentIdx);
      const bSign = t.operand.same_as;
      if (anchors.has(bSign)) app({ op: 'SYN', src: a, tgt: anchors.get(bSign), kind: 'identity', sentIdx });
      else app({ op: 'SYN', src: a, tgt: a, kind: 'identity', alias: bSign, sentIdx });
      anchors.set(bSign, a);
    } else if (op === 'SYN') {
      const whole = idOf(t.target, sentIdx);
      const parts = (t.operand.parts || []).map((p) => idOf(p, sentIdx));             // each part is its own span
      app({ op: 'SYN', src: whole, parts, promotes: whole, sentIdx });
    } else if (op === 'SEG') {
      const s = idOf(rootSign(t.target), sentIdx);
      const segId = mintHash(seq++);                               // the carved segment is its OWN referent
      app({ op: 'INS', id: segId, label: t.operand.key, sentIdx });
      app({ op: 'SEG', src: s, seg: segId, key: t.operand.key, sentIdx });
    } else if (op === 'EVA') {
      const id = idOf(rootSign(t.target), sentIdx);
      app({ op: 'EVA', src: id, via: fieldOf(t.target) ?? 'state', from: t.operand.from, to: t.operand.to, sentIdx });
    } else if (op === 'REC') {
      app({ op: 'REC', target: t.target, old_terms: t.operand.old_terms, new_terms: t.operand.new_terms, ...(t.operand.mapping ? { mapping: t.operand.mapping } : {}), sentIdx });
    }
  }

  const doc = {
    docId: log.docId, log, eot: true,
    sentences: lines,
    tokensBySentence: lines.map((l) => new Set(tok(l))),
    signs: anchors, diagnostics,
  };
  // An EoT document reads itself: the same lazy `doc.reading()` accessor, so a reloaded EoT
  // spine also carries its prediction and surprise, not only its structure (ingest/read.js).
  attachReading(doc);
  return Object.freeze(doc);
};

// parse the !rec remap body (§5.5): set form `{a,b} => {c,d}` or map form `=> {k:[...]}`.
const parseRec = (rest) => {
  let m;
  if ((m = rest.match(/^(\S+)\s*\{([^}]*)\}\s*=>\s*\{([^}]*)\}\s*$/))) {
    return { target: m[1], operand: { old_terms: parseList(m[2]), new_terms: parseList(m[3]) } };
  }
  if ((m = rest.match(/^(\S+)\s*=>\s*\{(.*)\}\s*$/))) {
    const mapping = {};
    const newTerms = new Set();
    // pairs: key : term  |  key : [a, b]
    for (const pair of m[2].split(/,(?![^[]*\])/)) {
      const pm = pair.match(/^\s*([\w"]+)\s*:\s*(.+)\s*$/);
      if (!pm) continue;
      const key = pm[1].replace(/^"|"$/g, '');
      const val = pm[2].trim();
      const targets = val.startsWith('[') ? parseList(val.replace(/^\[|\]$/g, '')) : [val];
      mapping[key] = targets;
      targets.forEach((x) => newTerms.add(x));
    }
    return { target: m[1], operand: { old_terms: Object.keys(mapping), new_terms: [...newTerms], mapping } };
  }
  return null;
};
