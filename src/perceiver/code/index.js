// EO: SEG·INS·CON·EVA(Void,Field → Entity,Lens, Dissecting,Making,Binding,Tracing)
// — readCodeChange, the code-holon perceiver's one mouth
// A codebase is one more omnimodal source (docs/code-holons.md). Given two
// states of the same corpus — [{path,text}] before and after, like
// organs/code/readCodebase's own contract, the organ never touches a
// filesystem — this reconciles holon identity across the edit and returns an
// inspectable ChangeReading per holon, the typed NUL ledger, typed-edge
// staleness propagation, and the typed operator event log.

import { extractFacts } from '../../organs/code/index.js';
import { admitFacts } from './holon.js';
import { codeVariants } from './fingerprint.js';
import { reconcileHolons, matchAcrossFiles } from './identity.js';
import { changeReadingFor, applyNulls, applyWitnesses, markStale, renderSummary, renderVerdict } from './change-reading.js';
import { detectNulls } from './nul.js';
import { propagateStaleness, renderPropagation } from './propagation.js';
import { emitEvents, witnessRevisionEvent } from './events.js';

const readAll = (files) => {
  const byPath = new Map();
  for (const f of files ?? []) byPath.set(f.path, f.text);
  return byPath;
};

// readCodeChange(oldFiles, newFiles, opts) -> {
//   oldHolons, newHolons,     // { path: CodeHolon[] }
//   changes,                  // { path: [{entry, reading}] } — identity.js entry + change-reading.js ChangeReading
//   nulls,                    // { path: NUL[] }
//   propagation,              // propagation.js's per-changed-export list
//   events,                   // events.js's typed operator log
//   report,                   // the plain-language render
// }
// opts.analysisWitnesses: AnalysisWitness[] (docs/code-holons.md §7), optional.
export const readCodeChange = (oldFiles = [], newFiles = [], opts = {}) => {
  const { analysisWitnesses = [] } = opts;
  const oldByPath = readAll(oldFiles);
  const newByPath = readAll(newFiles);
  const allPaths = new Set([...oldByPath.keys(), ...newByPath.keys()]);
  const corpusPaths = [...newByPath.keys()];

  const oldFactsByFile = {};
  const oldHolonsByFile = {};
  for (const path of allPaths) {
    const text = oldByPath.get(path);
    if (text == null) continue;
    const facts = extractFacts(text, { path });
    oldFactsByFile[path] = facts;
    oldHolonsByFile[path] = admitFacts(facts, text, { path });
  }

  const newFactsByFile = {};
  const newHolonsByFile = {};
  const nullsByFile = {};
  const retainedByFile = {};
  for (const path of allPaths) {
    const text = newByPath.get(path);
    if (text == null) continue;
    const facts = extractFacts(text, { path });
    const variants = codeVariants(text);
    const nulls = detectNulls(facts, variants, corpusPaths);
    nullsByFile[path] = nulls;

    const hasGap = nulls.some((n) => n.reason === 'parse-gap');
    if (hasGap && oldHolonsByFile[path]) {
      // §5: a malformed new read is never trusted over a prior successful one —
      // retain the last successfully-admitted holon set, mark it stale downstream.
      newFactsByFile[path] = oldFactsByFile[path];
      newHolonsByFile[path] = oldHolonsByFile[path];
      retainedByFile[path] = true;
    } else {
      newFactsByFile[path] = facts;
      newHolonsByFile[path] = admitFacts(facts, text, { path });
    }
  }

  const perFile = {};
  for (const path of allPaths) {
    perFile[path] = reconcileHolons(oldHolonsByFile[path] ?? [], newHolonsByFile[path] ?? [], {
      oldFacts: oldFactsByFile[path] ?? null,
      newFacts: newFactsByFile[path] ?? null,
    });
  }
  matchAcrossFiles(perFile);

  const readingsByHolonId = new Map();
  const witnessRevisions = [];
  const changesByFile = {};
  for (const [path, entries] of Object.entries(perFile)) {
    changesByFile[path] = entries.map((entry) => {
      const holon = entry.new ?? entry.old;
      let reading = changeReadingFor(entry);
      reading = applyNulls(reading, holon, nullsByFile[path] ?? []);
      if (retainedByFile[path]) reading = markStale(reading);
      const before = reading.semanticVerdict;
      reading = applyWitnesses(reading, holon.id, analysisWitnesses);
      if (reading.semanticVerdict !== before) witnessRevisions.push(witnessRevisionEvent(path, holon, reading.grounds));
      readingsByHolonId.set(holon.id, reading);
      return { entry, reading };
    });
  }

  const propagation = propagateStaleness(perFile, newFactsByFile);
  const events = [...emitEvents(perFile, propagation, nullsByFile, readingsByHolonId), ...witnessRevisions];

  const propagationByHolonId = new Map(propagation.map((p) => [p.holonId, p]));
  const reportLines = [];
  for (const [path, list] of Object.entries(changesByFile)) {
    for (const { entry, reading } of list) {
      if (entry.category === 'same') continue;
      const holon = entry.new ?? entry.old;
      if (holon.kind === 'module') continue;             // the file-level entry is noise for the report
      reportLines.push(`${path} ${holon.anchor.declaredName ?? `<${holon.kind}>`} — ${renderSummary(reading)} ${renderVerdict(reading)}`);
      const p = propagationByHolonId.get(holon.id);
      if (p) reportLines.push(`  ${renderPropagation(p)}`);
    }
  }

  return Object.freeze({
    oldHolons: Object.freeze(oldHolonsByFile),
    newHolons: Object.freeze(newHolonsByFile),
    changes: Object.freeze(changesByFile),
    nulls: Object.freeze(nullsByFile),
    propagation,
    events,
    report: reportLines.join('\n'),
  });
};

export { renderEventLog } from './events.js';
export { admitFacts } from './holon.js';
export { reconcileHolons, reconcileCorpus, matchAcrossFiles, verifyRenameReferences } from './identity.js';
export { changeReadingFor, applyNulls, applyWitnesses, markStale, renderSummary, renderVerdict } from './change-reading.js';
export { detectNulls, findParseGap, findDynamicBindings, findMissingDependencies } from './nul.js';
export { dependencyEdges, propagateStaleness, renderPropagation } from './propagation.js';
export { fingerprintOf, fingerprintsEqual, codeVariants, hashText } from './fingerprint.js';
