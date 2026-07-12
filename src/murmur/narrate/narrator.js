// EO: INS·NUL(Void,Atmosphere → Entity, Making,Clearing) — the tiny-LM mutter
// The language layer exists only to put WORDS to a feeling that has ALREADY crossed a
// threshold (spec §6). It does not scan, monitor, or judge continuously — the sense runs
// continuously; the narrator wakes only when the sense twitches past a trigger. Feeling first,
// wording second.
//
// The narrator is allowed to be wrong. It is NOT allowed to be consulted for truth (spec §9.5):
// its output is a register CONFIRMATION and a phrase for audit/steer legibility, full stop. It
// is never queried for facts, and its phrase is never injected into the answer prompt (§9.3).
//
// The model is pluggable and INJECTED — wiring a real tiny LM in-browser is a resource decision
// (spec §14: share the answer weights vs a separate model). This module owns the DISCIPLINE
// around the call (refractory gating, output cap, register framing); the caller supplies the
// backend. With no backend the narrator stays silent — phases 1–2 ship audit-only with no
// narrator, and the geometry alone flags the failures (spec §13).

// The register-framed instruction — a mutter, not an analysis. Kept here so the prompt is one
// place and obviously carries NO retrieved content and NO question about truth (spec §6, §9.5).
export const narratorPrompt = (register, passageText) =>
  `You feel a faint "${register}" about what you're reading. In ONE short phrase (a mutter, ` +
  `not an analysis, no more than a dozen words), say what feels ${register}. Do not state facts ` +
  `or answer anything.\n\nReading: ${String(passageText || '').slice(0, 600)}`;

const capTokens = (text, maxTokens) => {
  // Coarse whitespace token cap — the model backend enforces its own hard stop; this is a
  // belt-and-braces trim so a chatty backend can't smuggle an essay into the audit.
  const toks = String(text || '').trim().split(/\s+/).filter(Boolean);
  return toks.slice(0, maxTokens).join(' ');
};

// createNarrator({ backend, maxTokens, refractoryMs, workingFeel })
//   backend:     async (prompt, { maxTokens }) => string   (optional; silent when absent)
//   workingFeel: the ring (valence/ring.js) — provides the refractory gate + fired-marker
export const createNarrator = ({ backend = null, maxTokens = 32, refractoryMs = 8000, workingFeel = null } = {}) => {
  const available = typeof backend === 'function';

  // mutter({ register, ref, passageText }) → phrase | null.
  // Returns null when: no backend, the ref is in its refractory window, or the backend throws.
  const mutter = async ({ register, ref, passageText }) => {
    if (!available) return null;
    if (workingFeel && workingFeel.narratorMuted(ref)) return null;   // refractory (spec §8)
    let phrase = null;
    try {
      const raw = await backend(narratorPrompt(register, passageText), { maxTokens });
      phrase = capTokens(raw, maxTokens);
    } catch { phrase = null; }                                        // never cost the turn (spec §6)
    if (phrase) workingFeel?.noteNarratorFired?.(register, ref);
    return phrase || null;
  };

  return { available, mutter, maxTokens, refractoryMs };
};
