// EO: NUL·SIG·INS(Entity,Field → Void,Entity, Clearing,Tending,Making) — the remote-talk privacy membrane
// model/redact-remote.js — keep real ENTITIES off the wire when the talker is HOSTED.
//
// weave/write/redact.js runs the redaction membrane over the RDF/EOT PROJECTION of a doc (the
// prosification path). This wraps the same one act of identity-collapse around the CHAT model
// itself: every message the turn pipeline hands the backend passes through here, every real
// entity name collapses to an opaque token on the way OUT, and the model's answer is restored
// to the real names on the way IN — including live, token by token, while it streams.
//
//   messages (real names) ──redact──▶ tokens ──▶ REMOTE model ──▶ tokens ──restore──▶ real names
//                                        (the model does STRUCTURE over opaque handles)
//
// THE MEMBRANE INVARIANT (mirror of write/redact.js): no real name may reach the model input.
// assertNoNameLeak serializes the whole outgoing prompt and THROWS before anything leaves — a
// leak is fail-closed, not a warning: if we cannot prove the send clean, we do not send.
//
// SCOPE. Only a REMOTE backend needs this — a local model already runs in the same browser as
// the names. wrapRedacting is a transparent passthrough for a local/echo model (or an empty
// name set), so the in-browser golden path stays byte-identical. The token↔name table is built
// fresh per call from the names the caller supplies and never serialized into a prompt or log.
//
// This defends name confidentiality; it does NOT defeat re-identification of a distinctive
// relational graph (same residual risk write/redact.js discloses — docs/llm-prosification-security.md).

// Opaque, per-entity, RDF-QName-safe and prose-stable — reads as a proper noun so a talker
// echoes it verbatim instead of "correcting" it. Same token shape as write/redact.js.
const ENTITY_PREFIX = 'Referent';
const TOKEN_RE = () => /\bReferent\d+\b/g;

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// buildTable(names) → { alias: Map<name, token>, back: Map<token, name>, lc: Map<lowerName, token> }.
// Deterministic and order-stable: the nth distinct name is Referent{n}. `lc` lets the redactor
// resolve a case-varied mention ("meridian corp" for the admitted "Meridian Corp") to one token.
export const buildTable = (names = []) => {
  const alias = new Map();
  const back = new Map();
  const lc = new Map();
  let n = 0;
  for (const raw of names) {
    const name = String(raw ?? '');
    if (!name || alias.has(name)) continue;
    const token = `${ENTITY_PREFIX}${++n}`;
    alias.set(name, token);
    back.set(token, name);
    if (!lc.has(name.toLowerCase())) lc.set(name.toLowerCase(), token);
  }
  return { alias, back, lc };
};

// A word-bounded, case-insensitive matcher over ALL names at once, longest surface first so a
// containing name ("New York City") wins over a contained one ("New York"). Bounded on
// alphanumerics (not \b) so a name carrying punctuation ("Dr. Awad") still matches cleanly and
// a name is never grabbed mid-word ("Awad" inside "Awadi").
const nameMatcher = (names) => {
  const ordered = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!ordered.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${ordered.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
};

// redactText(text, table) → the text with every real name replaced by its opaque token.
export const redactText = (text, table) => {
  const str = String(text ?? '');
  if (!table || !table.alias.size) return str;
  const re = nameMatcher([...table.alias.keys()]);
  if (!re) return str;
  return str.replace(re, (m) => table.alias.get(m) || table.lc.get(m.toLowerCase()) || m);
};

// restore(text, table) → de-pseudonymize: every token back to its real name. An unknown token
// is left untouched (never guessed). Mirror of write/redact.js restore().
export const restore = (text, back) =>
  String(text ?? '').replace(TOKEN_RE(), (m) => (back && back.get(m)) || m);

const serialize = (messages) => (Array.isArray(messages)
  ? messages.map((m) => `${m?.role ?? ''}\n${m?.content ?? ''}`).join('\n')
  : String(messages ?? ''));

// assertNoNameLeak(messages, names) — the membrane invariant, mechanical (mirror of
// write/redact.js). Serialize the whole outgoing prompt and THROW if any real name survives,
// word-bounded and case-insensitive. Fail-closed: a leak is a bug, so it throws before the send.
export const assertNoNameLeak = (messages, names) => {
  const serial = serialize(messages);
  for (const raw of names) {
    const name = String(raw ?? '');
    if (!name) continue;
    if (new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, 'iu').test(serial)) {
      throw new Error(`redaction leak: entity "${name}" reached the remote model input`);
    }
  }
  return true;
};

// makeStreamRestorer(back) — restore tokens LIVE as the model streams, without ever emitting a
// half-restored token. A token is one alphanumeric run; we hold back the maximal trailing
// alphanumeric run (it might still be growing into a token), restore and emit the safe prefix,
// and flush() releases the tail at end of stream. Because every emitted chunk ends at a
// non-word boundary, no token is ever split across chunks — so restoring chunk-by-chunk equals
// restoring the whole draw. Returns { push(piece)→emit, flush()→emit }.
export const makeStreamRestorer = (back) => {
  let raw = '';
  let cut = 0;   // chars of `raw` already emitted (a safe, non-word boundary)
  const TAIL = /[\p{L}\p{N}]+$/u;
  const flushTo = (safe) => {
    if (safe <= cut) return '';
    const chunk = raw.slice(cut, safe);
    cut = safe;
    return restore(chunk, back);
  };
  return {
    push(piece) {
      raw += String(piece ?? '');
      const m = TAIL.exec(raw);
      return flushTo(raw.length - (m ? m[0].length : 0));
    },
    flush() { return flushTo(raw.length); },
  };
};

// wrapRedacting(model, getNames) → a model that redacts real entities before a REMOTE talker
// sees them and restores them in the reply. A transparent passthrough when:
//   · the model is falsy or not remote (a local model runs where the names already live), or
//   · getNames() yields no names this turn (nothing to hide).
// getNames is read FRESH per call (the active doc set changes between turns), so the alias
// always covers the entities in play now.
export const wrapRedacting = (model, getNames) => {
  if (!model || model.kind !== 'remote') return model;

  const namesNow = () => {
    try {
      return [...new Set((getNames?.() || []).map((n) => String(n)).filter((n) => n.length >= 3))];
    } catch { return []; }
  };

  const phrase = async (messages, opts = {}) => {
    const names = namesNow();
    if (!names.length) return model.phrase(messages, opts);   // nothing to hide → byte-identical

    const table = buildTable(names);
    const redacted = (Array.isArray(messages) ? messages : []).map((m) => ({ ...m, content: redactText(m?.content, table) }));
    assertNoNameLeak(redacted, names);                        // THROWS before anything leaves the box

    // Live restoration: the model streams opaque tokens; we hand the UI real names as they land.
    const sink = typeof opts.onToken === 'function' ? opts.onToken : null;
    const restorer = sink ? makeStreamRestorer(table.back) : null;
    const onToken = restorer ? (piece) => { const out = restorer.push(piece); if (out) sink(out); } : opts.onToken;

    const raw = await model.phrase(redacted, { ...opts, onToken });
    if (restorer) { const tail = restorer.flush(); if (tail) sink(tail); }
    // The returned string is the authoritative answer — restored wholesale (equals the concatenated
    // stream, since no token is split across chunks).
    return restore(String(raw ?? ''), table.back);
  };

  // Delegate identity/lifecycle to the wrapped backend; describe() discloses the redaction so the
  // audit and the chat export name it. `propose` is deliberately NOT surfaced: the grounded-speech
  // gate reads logits directly (canGroundedSpeak needs model.propose), an egress this membrane does
  // not govern — hiding it makes the pipeline fall back to the phrase() path, which we DO redact.
  return {
    id: model.id,
    kind: model.kind,
    isLoaded: (...a) => (typeof model.isLoaded === 'function' ? model.isLoaded(...a) : false),
    load: (...a) => model.load?.(...a),
    ...(model.reset ? { reset: (...a) => model.reset(...a) } : {}),
    describe: () => {
      let d = null;
      try { d = typeof model.describe === 'function' ? model.describe() : null; } catch { /* provenance never throws */ }
      d = d && typeof d === 'object' ? d : {};
      return { ...d, backend: d.backend ?? model.id, kind: d.kind ?? model.kind, redacted: true, label: d.label ? `${d.label} · redacted` : 'redacted' };
    },
    phrase,
  };
};
