// EO: INS·NUL(Field → Entity, Making,Clearing) — echo backend, verbatim excerpts
// The echo backend. Always available, zero-latency, deterministic.
// Useful for tests and for the cold-page experience: the pipeline runs
// end-to-end before any real model is loaded.
//
// It "phrases" by returning the first few document EXCERPTS verbatim, which
// gives the citation binder something realistic to bind against. The excerpts
// no longer carry an [sN] label (the talker never sees indices, §3), so we find
// them under the excerpts header instead of by the old tag.

import { registerBackend } from './interface.js';
import { EXCERPTS_HEADER } from './prompt.js';
import { emitSurface } from './stream.js';

registerBackend('echo', () => {
  return {
    id: 'echo',
    kind: 'local',
    isLoaded: () => true,
    async load(onProgress) {
      onProgress?.({ phase: 'ready', pct: 1 });
    },
    // The streaming capability (model/stream.js §): echo's target is the verbatim
    // excerpts, so it surfaces them token by token through `onToken` when one is
    // handed — a deterministic decode-grain stream for the answer loop and its
    // tests. Absent `onToken` it is byte-identical to the old draw-then-return.
    async phrase(messages, opts = {}) {
      return emitSurface(echoTarget(messages), opts.onToken);
    },
    // The cleanest backend for the gate (§2): echo is deterministic and its
    // "distribution" is already span-grounded — its target is the verbatim
    // excerpts. So `propose` walks that target one token at a time, yielding a
    // one-hot Dist at each position (logprob 0 → amplitude 1). The gate's pick
    // is ignored because echo has no alternative to offer; that makes echo a
    // pure test of the COLLAPSE / VOID paths, with no sampling noise to confound
    // them. A real backend yields a real distribution here; the contract is the
    // same async iterator either way.
    async *propose(messages, _opts) {
      const toks = surfaceTokens(echoTarget(messages));
      for (let i = 0; i < toks.length; i++) {
        yield { tokens: [{ token: toks[i], logprob: 0 }] };
      }
    },
  };
});

// The echo target — the first few excerpts verbatim, the span-grounded string
// both phrase() and propose() speak.
const echoTarget = (messages) => {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const userText = lastUser?.content || '';
  const at = userText.indexOf(EXCERPTS_HEADER);
  if (at >= 0) {
    const lines = userText.slice(at + EXCERPTS_HEADER.length)
      .split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length) return lines.slice(0, 3).join(' ');
  }
  // Legacy [sN] form, then a bare fallback.
  const tagged = [...userText.matchAll(/\[s\d+\]\s+([^\n]+)/g)].map(m => m[1]);
  if (tagged.length) return tagged.slice(0, 3).join(' ');
  return `(echo) ${userText.slice(0, 200)}`;
};

// Split a string into surface tokens (words and punctuation), preserving the
// material the segmenter needs to re-read SVO and clause boundaries. A token is
// a word run or a single non-space, non-word character (so '.' / ',' arrive on
// their own and the boundary heuristic can see clause-final punctuation).
const surfaceTokens = (s) => String(s || '').match(/[A-Za-z0-9'’]+|[^\sA-Za-z0-9]/g) || [];
