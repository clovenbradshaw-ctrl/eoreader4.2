// EO: DEF·EVA(Field,Link → Field,Link, Dissecting,Tracing) — prompt contract (§6/§9)
// prompt — the prompt contract and the two clocks (spec-planner.md §6, §9).
//
// One atom, one prompt. Each prompt is a STABLE PREFIX and a small VOLATILE SUFFIX,
// and the split is the caching constraint made concrete: the prefix is identical on
// every call in the turn, so the prefill is cached and you pay only for the suffix.
// The one proposition being rendered goes LAST, always — get this wrong and
// multi-prompt is too slow to be the norm.
//
//   stable prefix   the system frame + the fold (the running situation). Invariant
//                   across atoms; `prefixCacheKey` hashes it so a caller can assert
//                   the prefill is reused.
//   read-window     the semi-volatile middle — the last sentence or two already
//                   written, so the new sentence opens with a real transition. It
//                   grows one atom at a time; witnessed, NOT bound again (§5).
//   volatile suffix the one proposition in prose-shaped form, last.
//
// The model never sees the graph, the operators, the cell names, or the plan. It
// sees a frame, a recap, the tail of the prose, and one small instruction with its
// source — the easiest possible job, repeatedly, the hard decisions already made.

import { predictDirection } from './direction.js';
import { resolveProposition } from './resolve.js';

// The system frame — invariant, the head of the stable prefix. No operator code and
// no cell name ever crosses into the model-facing prompt (the §6 discipline).
export const SYSTEM_WRITER =
  'You are a writer. Render exactly the one statement you are handed, in a single ' +
  'natural sentence that follows on from the prose so far. Add no facts. Introduce ' +
  'no name and no number that was not given to you.';

// The stable prefix for the turn — system frame plus the fold. Identical on every
// atom of a run (the history does not change mid-run), so the prefill caches.
export const stablePrefix = ({ fold = {} } = {}) => {
  const parts = [SYSTEM_WRITER];
  const notes = fold.notes || (fold.stats ? '' : fold.notes);
  if (notes) parts.push(`The situation so far:\n${notes}`);
  return parts.join('\n\n');
};

// A deterministic 32-bit hash of the stable prefix — the cache key. Equal keys ⇒ the
// prefill is reused; a changed key between atoms is the caching constraint violated.
export const prefixCacheKey = (prefix = '') => {
  let h = 0x811c9dc5;
  const s = String(prefix);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};

// The read-window — the last `n` atoms' text, witnessed, for the seam only.
export const readWindow = (units = [], n = 2) =>
  units.slice(-n).map(u => u.text).filter(Boolean).join(' ');

// The volatile suffix — the one proposition, prose-shaped, last. A firm band states
// it plainly; a void band asks the writer to hold it open, never assert it.
export const propositionInstruction = (prop = {}) => {
  const source = (prop.spans || []).map(s => s.text).filter(Boolean).join(' / ');
  // A self-op (essay-backwards) operates on prior atoms, so its instruction names a
  // RELATION between two ideas already in play, not a fresh fact: a REC recasts, a NUL
  // holds the line. The rest fall through to the existing single-idea forms.
  const lead = prop.band === 'void'
    ? `Write one sentence saying the document holds open ${prop.subClaim}; do not assert it.`
    : prop.recast
      ? `Write one sentence recasting "${prop.subClaim}"${prop.against ? ` in light of "${prop.against}"` : ''} — say what it really turns on.`
      : prop.nul
        ? `Write one sentence that holds the line on ${prop.subClaim}, adding nothing new.`
        : prop.against
          ? `Write one sentence weighing "${prop.subClaim}" against "${prop.against}".`
          : prop.closes
            ? `Write one closing sentence drawing together ${prop.subClaim}.`
            : `Write one sentence saying ${prop.subClaim}.`;
  const firmness = prop.band === 'void'
    ? 'This is not settled — say so.'
    : 'This is supported; state it plainly.';
  return `${lead}\nHere is the source line: ${source}\n${firmness}`;
};

// Assemble the three parts for one atom. Returns the parts and the cache key, so a
// caller can both build the messages and verify the prefix did not move.
export const atomPrompt = ({ fold = {}, units = [], proposition = {}, window = 2 } = {}) => {
  const prefix = stablePrefix({ fold });
  const win = readWindow(units, window);
  const suffix = propositionInstruction(proposition);
  return {
    stablePrefix: prefix,
    cacheKey: prefixCacheKey(prefix),
    readWindow: win,
    suffix,
  };
};

// ── Speculation across the weld (§9) ─────────────────────────────────────────

// The next move depends on this atom's verdict, so the chain is sequential — but
// most atoms bind and drift is the exception. So resolve the next move on the
// ASSUMPTION of a clean verdict (boundFraction = 1) and hand the loop the next
// proposition before the current verdict lands; the strain feedback stays exact, you
// just stop waiting on it when you do not have to. This is the FREE half — the
// symbolic resolve overlapped; the model-render overlap is the conservative seam
// left to the model layer (it needs rollback on a high-strain verdict).
export const speculateNext = ({ units = [], proposition = {}, ground = [], covered = new Set(), graph = null, temperature = 0 } = {}) => {
  // The optimistic unit: the one we are about to deposit, ASSUMED to bind clean.
  const optimistic = {
    move: proposition.move,
    boundFraction: 1,
    sources: proposition.spanSet || [],
  };
  const nextUnits = [...units, optimistic];
  const nextCovered = new Set(covered);
  for (const idx of proposition.spanSet || []) nextCovered.add(idx);

  const dir = predictDirection(nextUnits, { temperature });
  if (dir.flat) return { quiesce: true, move: dir.move, proposition: null };
  const next = resolveProposition({ move: dir.move, ground, covered: nextCovered, graph });
  return { quiesce: false, move: dir.move, proposition: next };
};
