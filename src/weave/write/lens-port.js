// EO: SIG·EVA·DEF(Field,Lens → Field,Void, Tending,Binding,Clearing) — the port; logit-bias lens steering (Tracks A,C,D)
// lens-port.js — THE PORT (spec-the-lens-port.md, Tracks A, C, D; the E/F hooks).
//
// The Significance column READS the field through the lens by the Born rule; this writes
// the surface through the SAME lens by a logit bias. One operator, one port: WebLLM's
// LogitProcessor. The interface is three methods that pre-draw the architecture —
// processLogits (apply the bias), processSampledToken (advance running state), resetState
// (return to the ground between turns) — and this is a pure, model-free implementation of
// exactly that shape (verified against @mlc-ai/web-llm: the interface is
// { processLogits:(Float32Array)=>Float32Array; processSampledToken:(number)=>void;
// resetState:()=>void; }). webllm.js registers an instance through logitProcessorRegistry
// on the in-thread MLCEngine; everything testable lives here, decoupled from the engine.
//
// The steering equation:
//
//   bias(token, t) = g(H_t) · [ λ·personality(token) + μ·relevance(token | surf_t) ] + void(token)
//
//   • personality — the Horizon's departure from σ, projected to tokens (voice.js); a
//     sparse Map<tokenId, delta> supplied per turn via configure(). Identically zero when
//     ρ = σ, so a Horizon that has not committed is characterless by construction.
//   • relevance   — the surfer's Born-rule salience over figures, carried as a Born
//     distribution figureWeights:Map<label, p> and realised on tokens through the bridge.
//   • void        — the veto battery moved PRE-HOC: a numeral/date gate and a permitted-
//     entity trie. It sits OUTSIDE the entropy gate (a conscience does not relax at
//     confident positions) and suppresses fact-bearing tokens, never grammar.
//   • g(H_t)      — the entropy gate. At low entropy the model is forced (grammar,
//     connective tissue) and perturbing it only breaks fluency → g→0; at high entropy it
//     is at a content choice point, exactly where salience should decide → g→1. This is
//     the write-side twin of the read side's von Neumann entropy: "how mixed is the state",
//     measured over tokens here, over the lens basis there.
//
// Each term is held by a createRule (write/eva.js), so a failing soft bias toggles OFF and
// a hard suppression relaxes only under span-gated re-grounding (Track F) — the chemistry
// of a bond with hysteresis, asymmetric on purpose so the grounding floor cannot erode.

import { createRule } from './eva.js';

// ── numeric helpers (pure, exported for the noise-null probe and tests) ───────────────────
// softmax with the usual max-shift for stability.
export const softmax = (logits) => {
  const n = logits.length;
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (logits[i] > max) max = logits[i];
  const p = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) { const e = Math.exp(logits[i] - max); p[i] = e; sum += e; }
  if (sum > 0) for (let i = 0; i < n; i++) p[i] /= sum;
  return p;
};

// Shannon entropy (nats) of the softmax distribution — computed by logsumexp so no second
// allocation is needed: H = logZ − max − (1/Z) Σ z_i (logit_i − max).
export const shannonEntropy = (logits) => {
  const n = logits.length;
  if (!n) return 0;
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (logits[i] > max) max = logits[i];
  let Z = 0, weighted = 0;
  for (let i = 0; i < n; i++) {
    const z = Math.exp(logits[i] - max);
    Z += z; weighted += z * (logits[i] - max);
  }
  if (Z <= 0) return 0;
  return Math.log(Z) - weighted / Z;
};

// The entropy gate g(H): a smoothstep from 0 (forced) to 1 (open) between lo and hi nats.
export const entropyGate = (H, { lo = 1.0, hi = 3.0 } = {}) => {
  if (hi <= lo) return H >= hi ? 1 : 0;
  const t = (H - lo) / (hi - lo);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);   // smoothstep
};

// applyBias — add a sparse finite bias to a copy of `logits`. Pure; used by the probe and
// the noise-null discipline as well as by the stack.
export const applyBias = (logits, biasMap) => {
  const out = Float32Array.from(logits);
  for (const [token, delta] of biasMap) {
    if (token >= 0 && token < out.length && Number.isFinite(delta)) out[token] += delta;
  }
  return out;
};

const NEG_INF = -Infinity;

// createLensStack — the registered LogitProcessor. `tokenizer` is the injected seam
// (concept-tokens.js semantics); `logSink(event)` receives every steering event for the
// Given-Log; `gate` overrides the entropy-gate band.
export const createLensStack = ({ tokenizer = null, logSink = null, gate = {} } = {}) => {
  // Track-F rules. Suppression seeds HIGH support (expensive to relax — the asymmetric
  // hysteresis); the soft biases seed at 1 (cheap to toggle off on a failed noise-null).
  const rules = {
    void:        createRule({ support: 8 }),
    relevance:   createRule({ support: 1 }),
    personality: createRule({ support: 1 }),
  };

  let cfg = blankConfig();
  const state = freshState();
  const events = [];
  // Track F: surfaces a span-gated REC re-grounded — entities the trie missed but a SOURCE SPAN
  // justifies. Session-scoped (NOT cleared by resetState, which only wipes per-generation state),
  // so the gate tightens itself across turns. The next turn folds these back into the bridge.
  const approved = new Set();

  const emit = (type, data) => {
    const ev = { type, t: state.step, ...data };
    events.push(ev);
    if (events.length > 512) events.shift();
    try { logSink?.(ev); } catch { /* best-effort, never sink a decode */ }
  };

  // configure — called by the backend before each generation with the turn's lens context.
  // ρ-personality is re-supplied here (the persistent accumulation lives in the Horizon),
  // and the relevance distribution is recomputed per beat upstream; within a beat both are
  // static, so processSampledToken only advances running surface/entity state.
  const configure = (next = {}) => {
    cfg = { ...blankConfig(), ...next };
  };

  // resetState — the maximally mixed ground between turns: clear transient surface/cursor
  // state. Personality is NOT stored here, so this never has to "forget" ρ — it forgets
  // only the in-generation surface. web-llm calls this at the start of each completion.
  const resetState = () => {
    Object.assign(state, freshState());
    emit('reset', {});
  };

  // processLogits — apply the bias and return the modified vector.
  const processLogits = (logits) => {
    state.step += 1;
    if (!cfg.enabled || !logits || !logits.length) return logits;

    const H = shannonEntropy(logits);
    const g = entropyGate(H, gate);
    const boundary = wordBoundaryOpen(state.surface);

    // ── gated finite biases: relevance (μ) + personality (λ) ──────────────────────────
    const bias = new Map();
    const add = (token, delta) => {
      if (token == null || token < 0 || token >= logits.length || !delta) return;
      bias.set(token, (bias.get(token) || 0) + delta);
    };
    if (g > 0 && boundary) {
      if (rules.relevance.on && cfg.mu > 0 && cfg.figureWeights && cfg.conceptMap) {
        for (const [label, p] of cfg.figureWeights) {
          add(cfg.conceptMap.firstTokenOf(label), g * cfg.mu * p);
        }
      }
      if (rules.personality.on && cfg.lambda > 0 && cfg.personality) {
        for (const [token, delta] of cfg.personality) add(token, g * cfg.lambda * delta);
      }
    }

    // ── ungated void term: numeral gate + permitted-entity continuation mask ──────────
    const suppress = new Set();          // sparse −∞ (numerals); function/grammar never here
    let allow = null;                    // when mid grounded-name: the only admitted next ids
    if (rules.void.on && cfg.conceptMap) {
      // numeral/date gate — a number-shaped token not carried by any span is ungrounded.
      if (cfg.voidNumerals !== false) {
        // only worth scanning the model's current top-k (cheap, and the safety valve below
        // re-checks): suppress ungrounded numbers among the live candidates.
        for (const i of topKIndices(logits, 64)) {
          if (cfg.conceptMap.isNumberToken(i) && !cfg.conceptMap.isGroundedNumberToken(i)) suppress.add(i);
        }
      }
      // entity trie — once a word has opened on a grounded entity's first token, admit only
      // grounded continuations until the name closes (the invented-name lie made unsayable).
      if (cfg.voidEntities !== false && state.entityNode) {
        allow = new Set(state.entityNode.children.keys());
      }
    }

    // The explicit grammar mask (port-at-infinity): a hard enumerated set, the ModelOracle
    // as the same code path with weights at −∞. Composes with the entity allow-set.
    if (cfg.grammarMask instanceof Set) {
      allow = allow ? new Set([...allow].filter(x => cfg.grammarMask.has(x))) : new Set(cfg.grammarMask);
    }

    // ── compose and apply, with the syntax safety valve ───────────────────────────────
    const out = applyBias(logits, bias);
    for (const i of suppress) out[i] = NEG_INF;
    if (allow) for (let i = 0; i < out.length; i++) if (!allow.has(i)) out[i] = NEG_INF;

    // Never empty the nucleus: if masks+void killed all of the model's own top-k, fall back
    // to the unbiased decode and log a void-conflict for review (the queue for tightening the
    // trie / re-grounding, Track F). A logged lapse beats a stalled or garbled decode.
    if (suppress.size || allow) {
      const top = topKIndices(logits, 8);
      const survives = top.some(i => Number.isFinite(out[i]));
      if (!survives) {
        const topToken = top[0] ?? null;
        let surface = '';
        try { surface = topToken != null && tokenizer ? tokenizer.decode([topToken]) : ''; } catch { surface = ''; }
        emit('void-conflict', { reason: allow ? 'entity-trie' : 'numeral-gate', topToken, surface: surface.trim() });
        rules.void.break();   // the EVA break signal; the SPAN-GATED REC decision is recGate(), below
        return logits;        // unbiased argmax survives
      }
    }
    if (suppress.size) emit('suppress', { kind: 'numeral', n: suppress.size });
    state.lastBias = { biased: bias.size, suppressed: suppress.size, masked: !!allow, g: round(g), H: round(H) };
    return out;
  };

  // processSampledToken — advance the running surface, the word-boundary cursor, and the
  // entity-trie cursor from the chosen token (history alone, per the interface contract).
  const processSampledToken = (token) => {
    let piece = '';
    try { piece = tokenizer ? tokenizer.decode([token]) : ''; } catch { piece = ''; }
    state.surface += piece;
    state.tokens.push(token);

    const trie = cfg.conceptMap?.entityTrie;
    if (trie) {
      if (state.entityNode) {
        const next = trie.step(state.entityNode, token);
        // diverged off every grounded path (the mask let it through, or the valve fired) or
        // reached a complete leaf name → leave entity mode; the sentence continues freely.
        state.entityNode = (!next || (trie.isWord(next) && next.children.size === 0)) ? null : next;
      } else if (wordBoundaryOpen(state.surface.slice(0, state.surface.length - piece.length)) && trie.opens(token)) {
        state.entityNode = trie.step(trie.root, token);
      }
    }
  };

  return {
    // the LogitProcessor contract
    processLogits, processSampledToken, resetState,
    // the turn-layer surface
    configure,
    rules,
    recordVoidConflict: (info) => emit('void-conflict', info || {}),

    // ── Track F: the DEF·EVA·REC loop closed (the lens-port addendum) ─────────────────────
    // recGate — the SPAN-GATED re-grounding decision. A void-conflict is an EVA break: the model
    // reached for a name/number the mask forbade. REC decides WHY: did the trie miss a real,
    // SOURCE-SUPPORTED entity (widen it), or did the model reach past the field (review only)? A
    // conflict may widen the trie ONLY if a source span justifies it — otherwise the conflict log
    // stays a review queue, never an auto-accept, or we rebuild the self-corroboration loop the
    // whole provenance stance exists to close. The activation energy is asymmetric on purpose
    // (rules.void seeds high support): cheap to toggle a soft bias off, expensive to relax the
    // grounding floor, so it cannot erode under repeated model pressure.
    recGate: (surface, sources = []) => {
      const s = String(surface || '').trim().toLowerCase();
      const supported = !!s && (Array.isArray(sources) ? sources : []).some(
        sp => String(sp?.text ?? sp ?? '').toLowerCase().includes(s));
      const decision = supported ? 'widen' : 'review';
      if (supported) { approved.add(s); rules.void.hold(); }   // a span re-grounds it; relax the strain
      emit('rec', { surface: s, supported, decision });
      return { surface: s, supported, decision };
    },
    // The surfaces re-grounded by a span — folded back into the next turn's bridge so the gate
    // tightens over time (fewer false suppressions, no new holes).
    approvedSurfaces: () => [...approved],
    // A soft term that keeps failing noise-null toggles off; one that passes relaxes its strain.
    noteNoiseNull: (term, passed) => { const r = rules[term]; if (r) (passed ? r.hold() : r.break()); },
    // Staleness (invariant #4's departure): a steering rule good for one document should not keep
    // firing once the field has moved — on a re-ground, decay the soft terms back toward σ.
    decay: ({ regrounded = false } = {}) => { if (regrounded) { rules.relevance.break(); rules.personality.break(); } },

    audit: () => Object.freeze({
      steps: state.step,
      lastBias: state.lastBias,
      rules: { void: rules.void.state, relevance: rules.relevance.state, personality: rules.personality.state },
      events: events.slice(),
    }),
    drainEvents: () => { const e = events.slice(); events.length = 0; return e; },
  };
};

// ── internals ─────────────────────────────────────────────────────────────────────────
const blankConfig = () => ({
  enabled: false,
  conceptMap: null,
  figureWeights: null,      // Map<label, p>  (a Born distribution over figures)
  personality: null,        // Map<tokenId, delta>  (voice.js projection; empty when ρ=σ)
  lambda: 0, mu: 0, alpha: 0.05,
  voidNumerals: true, voidEntities: true,
  grammarMask: null,        // Set<tokenId> | null
});

const freshState = () => ({ step: 0, surface: '', tokens: [], entityNode: null, lastBias: null });

// A word boundary is OPEN (an up-weight on a word-initial token is safe) at the start, after
// whitespace, or after sentence/clause punctuation. Mirrors concept-tokens.wordBoundaryClosed.
const wordBoundaryOpen = (surface) => {
  const s = String(surface || '');
  if (s.length === 0) return true;
  return /[\s([{"'‘“.,;:!?–—-]$/.test(s);
};

// The model's own top-k token indices by raw logit — bounded work for the numeral scan and
// the safety-valve nucleus check.
const topKIndices = (logits, k) => {
  const n = logits.length;
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  idx.sort((a, b) => logits[b] - logits[a]);
  return idx.slice(0, Math.min(k, n));
};

const round = (x) => Math.round(x * 1e4) / 1e4;
