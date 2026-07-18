// EO: DEF·EVA(Lens → Lens, Dissecting,Tracing) — the ChangeReading verdict
// Three axes, not five values (docs/code-holons.md §4): structuralChange (what
// identity.js classified), semanticVerdict (what it means), evaluationState (is
// this judgment current). The equivalence ladder (§4.1) reads the tier off the
// same five fingerprint hashes identity.js already computed — no re-analysis.

const LADDER = [
  { key: 'mechanicalHash', tier: 'mechanical', label: 'whitespace/comments only' },
  { key: 'normalizedSyntaxHash', tier: 'local', label: 'bound identifiers renamed; free references, control flow, and literals unchanged' },
];

// Which tier a `modified` pair sits at, reading the fingerprint hashes most
// conservative-claim-last: mechanical, then local, then apparent (reference
// shape + control flow + literal profile all hold, even though the concrete
// tree differs), else no equivalence claim at all.
const tierOf = (oldFp, newFp) => {
  for (const { key, tier, label } of LADDER) {
    if (oldFp[key] === newFp[key]) return { tier, label };
  }
  const apparentKeys = ['referenceShapeHash', 'controlFlowHash', 'literalProfileHash'];
  if (apparentKeys.every((k) => oldFp[k] === newFp[k])) {
    return { tier: 'apparent', label: 'same references, same control shape, same literals; the concrete tree still differs' };
  }
  return null;
};

const LEVEL_LABEL = Object.freeze({
  0: 'level 0: bytes',
  1: 'level 1: syntax',
  2: 'level 2: lexical binding',
  3: 'level 3: language semantics (analyzer-witnessed)',
  4: 'level 4: project/toolchain evidence (analyzer-witnessed)',
});

// changeReadingFor(entry) -> a ChangeReading for one identity.js reconciliation
// entry ({old, new, category, grounds, exported?, verification?, candidates?}).
export const changeReadingFor = (entry) => {
  const { category } = entry;
  const holon = entry.new ?? entry.old;
  const base = { structuralChange: category, evaluationState: 'fresh', propagation: [] };

  if (category === 'same') {
    return Object.freeze({ ...base, semanticVerdict: 'equivalent', equivalenceTier: null, level: 0, grounds: 'no change: witness and anchor identical' });
  }

  if (category === 'modified') {
    const t = tierOf(entry.old.fingerprint, entry.new.fingerprint);
    if (t) return Object.freeze({ ...base, semanticVerdict: 'equivalent', equivalenceTier: t.tier, level: 2, grounds: `Equivalent at the ${t.tier} tier (${t.label}).` });
    return Object.freeze({ ...base, semanticVerdict: 'changed', equivalenceTier: null, level: 2, grounds: 'literal/operator profile, reference shape, or control flow differs' });
  }

  if (category === 'renamed') {
    if (entry.exported) {
      return Object.freeze({ ...base, semanticVerdict: 'changed', equivalenceTier: null, level: 1, grounds: entry.grounds });
    }
    if (entry.verification?.verified) {
      return Object.freeze({ ...base, semanticVerdict: 'equivalent', equivalenceTier: 'local', level: 2, grounds: `Equivalent at the local tier (declared name changed; reference sites checked within the given corpus only — ${entry.grounds}).` });
    }
    return Object.freeze({ ...base, semanticVerdict: 'contested', equivalenceTier: null, level: 2, grounds: entry.grounds });
  }

  if (category === 'moved' || category === 'moved-file') {
    return Object.freeze({ ...base, semanticVerdict: 'equivalent', equivalenceTier: 'apparent', level: 2, grounds: entry.grounds });
  }

  if (category === 'ambiguous') {
    return Object.freeze({ ...base, semanticVerdict: 'unknown', equivalenceTier: null, level: 1, grounds: entry.grounds });
  }

  // added | removed
  return Object.freeze({ ...base, semanticVerdict: 'changed', equivalenceTier: null, level: 1, grounds: entry.grounds });
};

// Diagnostics as evidence (docs/code-holons.md §7): a witness whose verdict
// disagrees with the structural reading flips it to `contested` and appends
// its diagnostic to `grounds`. Agreement leaves the reading untouched — a
// witness confirming the structural read is not new information.
export const applyWitnesses = (reading, holonId, witnesses = []) => {
  const relevant = witnesses.filter((w) => w.holonId === holonId);
  if (!relevant.length) return reading;
  const disagreeing = relevant.filter((w) => w.verdict !== reading.semanticVerdict);
  if (!disagreeing.length) return reading;
  const diagnostics = disagreeing.map((w) => `${w.analyzer}${w.version ? `@${w.version}` : ''}: ${w.diagnostic}`).join('; ');
  return Object.freeze({
    ...reading,
    semanticVerdict: 'contested',
    equivalenceTier: null,
    level: Math.max(reading.level, 3),
    grounds: `${reading.grounds} — contested by analysis: ${diagnostics}`,
  });
};

export const markStale = (reading) => Object.freeze({ ...reading, evaluationState: 'stale' });

// A typed NUL (nul.js) covering the holon's span downgrades an `equivalent`
// claim to `unknown` — a dynamic construct inside the span means the
// fingerprint's "nothing meaningfully changed" cannot be trusted, even when
// every hash agrees (docs/code-holons.md §5's own table). It never touches a
// `changed`/`contested` reading (a hash-backed difference is still a real
// finding) and never touches `same` (a byte-identical span asserts nothing new).
export const applyNulls = (reading, holon, nulls = []) => {
  if (reading.semanticVerdict !== 'equivalent') return reading;
  const span = holon?.witness;
  if (!span) return reading;
  const covering = nulls.filter((n) => n.span && n.span.start < span.byteEnd && n.span.end > span.byteStart);
  if (!covering.length) return reading;
  const grounds = covering.map((n) => `${n.reason}: ${n.grounds}`).join('; ');
  return Object.freeze({
    ...reading,
    semanticVerdict: 'unknown',
    equivalenceTier: null,
    grounds: `Equivalence could not be confirmed — ${grounds}`,
  });
};

// The plain-language pairing table (docs/code-holons.md §4.1) — generated from
// the axis pair, never hand-authored per case.
export const renderSummary = (reading) => {
  if (reading.evaluationState === 'stale') return 'Needs reevaluation.';
  if (reading.evaluationState === 'pending') return 'Awaiting analysis.';
  if (reading.evaluationState === 'failed') return 'Analysis failed — no verdict available.';
  if (reading.semanticVerdict === 'equivalent') {
    if (reading.equivalenceTier === 'mechanical') return 'No meaningful change.';
    if (reading.equivalenceTier === 'apparent') return 'Structure changed; meaning appears equivalent.';
    return 'Structure changed; meaning appears equivalent (locally verified).';
  }
  if (reading.semanticVerdict === 'contested') return 'Structure changed; meaning contested.';
  if (reading.semanticVerdict === 'unknown') return 'Meaning could not be determined.';
  return 'Behavior changed.';
};

// The full sentence form, with grounds and the licensing analysis level —
// docs/code-holons.md §8's own worked example, generated rather than hand-written.
export const renderVerdict = (reading) => `${reading.grounds} (${LEVEL_LABEL[reading.level] ?? `level ${reading.level}`}).`;
