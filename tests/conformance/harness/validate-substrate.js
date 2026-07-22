// A recursive numeric validator over a whole parsed substrate (docs/parse-
// conformance-spec.md Tier 1 #4: "Assert this with a recursive numeric
// validator over the whole substrate, not spot checks.").
//
// Walks every array/object reachable from `value` (Maps and Sets included,
// since a `doc` carries several) and reports every NaN, +/-Infinity, or bare
// `undefined` it finds, with a JSON-pointer-ish path to each. Deliberately
// works on the RAW object, not a JSON-round-tripped copy — JSON.stringify
// silently drops an `undefined` property, which is exactly the failure mode
// this exists to catch, so round-tripping first would hide it.
const BAD_NUMBER = (x) => typeof x === 'number' && !Number.isFinite(x);

export const findInvalidNumerics = (value, { maxIssues = 200 } = {}) => {
  const issues = [];
  const seen = new WeakSet();
  const visit = (v, p) => {
    if (issues.length >= maxIssues) return;
    if (v === undefined) { issues.push({ path: p, kind: 'undefined' }); return; }
    if (BAD_NUMBER(v)) { issues.push({ path: p, kind: Number.isNaN(v) ? 'NaN' : 'Infinity', value: v }); return; }
    if (v === null || typeof v !== 'object') return;
    if (typeof v === 'function') return;               // functions (e.g. doc.projectGraph) are not data
    if (seen.has(v)) return;                            // cyclic / shared reference — do not loop forever
    seen.add(v);
    if (Array.isArray(v)) { v.forEach((x, i) => visit(x, `${p}[${i}]`)); return; }
    if (v instanceof Map) { for (const [k, x] of v) visit(x, `${p}[Map:${String(k)}]`); return; }
    if (v instanceof Set) { let i = 0; for (const x of v) visit(x, `${p}{Set:${i++}}`); return; }
    for (const k of Object.keys(v)) visit(v[k], p ? `${p}.${k}` : k);
  };
  visit(value, '$');
  return issues;
};

export const assertNoInvalidNumerics = (value, label = 'substrate') => {
  const issues = findInvalidNumerics(value);
  if (issues.length) {
    const sample = issues.slice(0, 10).map((i) => `${i.path} (${i.kind}${i.value != null ? `: ${i.value}` : ''})`).join('; ');
    throw new Error(`${label}: ${issues.length} invalid numeric(s) found — ${sample}${issues.length > 10 ? '; ...' : ''}`);
  }
};

// The fields worth validating on a `doc` — everything a downstream surface
// (waveform, cast lanes, coverage treemap) could read. Excludes `doc.log`'s
// raw event array's `t` field is fine (a real Date.now() ms integer, always
// finite) so no exclusion is needed there. Function-valued fields
// (projectGraph, sentenceEmbeddings, ...) are skipped by findInvalidNumerics
// itself.
export const docSubstrateForValidation = (doc) => ({
  sentences: doc.sentences,
  log: doc.log ? doc.log.snapshot() : null,
  metadata: doc.metadata,
  metaFields: doc.metaFields,
  mentions: doc.admission ? doc.admission.mentions : null,
  admitted: doc.admission ? doc.admission.admitted : null,
  admissionFloor: doc.admission ? doc.admission.admissionFloor : null,
  graph: doc.projectGraph ? (() => {
    const g = doc.projectGraph();
    return { entities: g.entities, edges: g.edges, held: g.held, voids: g.voids };
  })() : null,
});
