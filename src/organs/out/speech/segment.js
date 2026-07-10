// EO: SEG(Void → Field, Dissecting) — SEG the murmur → candidate propositions
// talker/segment.js — SEG over the murmur (§3).
//
// The model proposes tokens; the gate measures propositions; SEG finds the
// boundary between them. As the talker advances the proposal (drawing tokens
// from the backend's `propose` distribution under the gate's control, §5), SEG
// watches the forming surface for a complete unit of meaning — a clause with a
// filled SVO, the same boundary operator the reader runs (parse/clauses.js),
// turned INWARD on the talker's own surface (the holon). At a proposition
// boundary it closes the candidate and hands it to the gate.
//
//   segment(distStream, opts) → async generator of candidateProp
//   candidateProp = {
//     surface,                       // the tokens, rendered — emitted if it collapses
//     svo: { subj, rel, obj } | { subj, attr } | null,   // the unit the gate matches
//     modelAmplitude,                // the proposal's own weight for this unit
//   }
//
// SEG owns sampling and accumulation; the gate owns proposition-level control
// (collapse / rollback / VOID). The split is the spec's: SEG cuts, the gate
// measures. After each emitted candidate the accumulation RESETS to the
// committed edge — the talker never builds the next proposition on the tokens
// of one the gate may reject (§6). A failed candidate is simply not fed back as
// committed context; rollback is the absence of an append, not an edit.
//
// Cheap heuristic, as the spec asks (it must not stall the loop): clause-final
// punctuation closes a candidate, and a light SVO read of the surface fills its
// unit. The SVO read is INJECTED (`opts.parseProp`) so SEG stays decoupled from
// the document organ and testable with a stub; the orchestrator wires the real
// document-resolved parser (talker/index.js).

// Clause-final punctuation — the boundary marker. A newline counts too (a
// proposal may end a thought with a line break before any terminal mark).
const CLAUSE_FINAL = /[.!?;\n]/;

// Render a token onto the forming surface: a space before a word, nothing
// before clause/word punctuation, so "Grete opened the window ." reads back as
// "Grete opened the window." for the SVO parse and the emitted text alike.
const NO_LEADING_SPACE = /^[.,!?;:)\]}'’”…—–%]/;
const appendToken = (surface, token) => {
  const t = String(token ?? '');
  if (!surface) return t;
  if (NO_LEADING_SPACE.test(t)) return surface + t;
  return surface + ' ' + t;
};

// The proposal's own weight for a proposition: the mean amplitude of its tokens,
// where a token's amplitude is exp(logprob) (a one-hot proposal → 1, a hedged
// one → less). This is the modelAmplitude the gate multiplies by support,
// relevance and non-redundancy — the talker's confidence, before grounding.
const propAmplitude = (tokens) => {
  if (!tokens.length) return 0;
  let sum = 0;
  for (const t of tokens) sum += Math.exp(Number.isFinite(t.logprob) ? t.logprob : 0);
  return sum / tokens.length;
};

// Default sampler: the argmax of the distribution (greedy), honouring a
// discourage set so a rolled-back direction is pushed elsewhere (§6 open risk —
// a cheap, honest first cut, not the final discouragement). Returns the chosen
// { token, logprob }.
const argmaxSampler = (dist, discourage) => {
  const toks = dist?.tokens || [];
  let best = null;
  for (const t of toks) {
    if (discourage && discourage.has(t.token)) continue;
    if (!best || (t.logprob ?? -Infinity) > (best.logprob ?? -Infinity)) best = t;
  }
  // If discouragement emptied the field, fall back to the raw argmax (better a
  // repeat the gate will reject again than a stall).
  if (!best) for (const t of toks) if (!best || (t.logprob ?? -Infinity) > (best.logprob ?? -Infinity)) best = t;
  return best;
};

// segment — drive the distribution stream, accumulate a surface, and emit a
// candidateProp at each proposition boundary. `distStream` is any async
// iterable of Dist ({ tokens:[{token,logprob}] }) — a backend's propose(), or a
// plain array in a test. The consumer (the gate) may pass control back through
// `.next(control)`: `control.discourage` (an iterable of tokens) seeds the
// sampler away from a rolled-back direction on the next proposition.
export async function* segment(distStream, opts = {}) {
  const parseProp = opts.parseProp || (() => null);
  const sampler   = opts.sampler   || argmaxSampler;
  const discourage = new Set();

  let surface = '';
  let tokens  = [];

  const it = distStream[Symbol.asyncIterator]
    ? distStream[Symbol.asyncIterator]()
    : arrayIterator(distStream);

  let res = await it.next();
  while (!res.done) {
    const dist = res.value;
    const pick = sampler(dist, discourage);
    const token = pick?.token ?? '';
    surface = appendToken(surface, token);
    tokens.push({ token, logprob: pick?.logprob ?? 0 });

    // A boundary: clause-final punctuation on a non-empty surface. Read the SVO;
    // a clause with a filled unit is a candidate proposition, otherwise keep
    // accumulating (a bare "Yes." carries no truth condition to measure).
    if (CLAUSE_FINAL.test(token) && surface.trim()) {
      const svo = parseProp(surface.trim());
      if (svo) {
        const candidate = {
          surface: surface.trim(),
          svo,
          modelAmplitude: propAmplitude(tokens),
        };
        const control = yield candidate;
        // RESET to the committed edge — the next proposition starts clean, never
        // built on this candidate's tokens (the gate decides if it was kept).
        surface = '';
        tokens  = [];
        if (control && control.discourage) for (const t of control.discourage) discourage.add(t);
      }
    }
    res = await it.next();
  }

  // Flush a trailing, unterminated proposition if it carries a unit — a proposal
  // that ran out of tokens mid-thought still offers what it managed to form.
  if (surface.trim()) {
    const svo = parseProp(surface.trim());
    if (svo) yield { surface: surface.trim(), svo, modelAmplitude: propAmplitude(tokens) };
  }
}

async function* arrayIterator(arr) {
  for (const x of arr || []) yield x;
}

export { appendToken, propAmplitude, argmaxSampler };
