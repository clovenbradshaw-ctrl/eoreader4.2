// EO: EVA·SYN(Field,Lens → Lens,Atmosphere, Binding·Composing) — the specimen driver: the pipeline run twice, partial then full
// The harness under the scoreboard (The Work v2 #1). Each specimen is a question, a small
// corpus, and a SCRIPTED talker draft, driven through the REAL turn pipeline twice — once on a
// partial parse (the first `partial` sentences), once on the full corpus — entirely offline:
// the model is a stub that returns the scripted draft (the same fixture discipline
// tests/one-act.test.js proved), the embedder is the deterministic hash embedder, nothing
// leaves the process. Two runs, one point: STABILITY UNDER FURTHER READING is measurable only
// if the same subjects are judged under less and more evidence — did the full read strengthen
// the partial read's suspensions, or overturn its commitments?
//
// The harness drives the pipeline and hands the LOGS to defscore.js; it decides nothing about
// the verdicts itself. When the judges are retyped (v2 #2–#4) the specimens stay, the drive
// stays, and only the scoreboard's numbers should move.

import { runTurn } from '../turn/pipeline.js';
import { parseText } from '../perceiver/parse/index.js';
import { createHashEmbedder } from '../model/embed-hash.js';
import { createAuditLog } from '../rooms/audit/index.js';
import { shapeAudit, matchGold, scoreStability, mergeRuns, scoreSpecimen, scoreboard } from './defscore.js';

// The scripted talker: every phrase() returns the specimen's draft, verbatim, every time.
// Deliberately deaf to its prompt — the specimen tests the JUDGES on a fixed draft, never the
// draft on the judges.
const stubModel = (script) => ({
  id: 'specimen-stub', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'specimen-stub', kind: 'local', model: 'specimen-stub', label: 'specimen' }),
  async load() {},
  async phrase() { return script; },
});

const labelReader = (doc) => (id) => {
  try { return doc?.admission?.labelOf?.(id) ?? null; } catch { return null; }
};

// runSpecimen — one specimen through the pipeline twice; returns the scored result. `oracle`
// (def-oracle.js) is optional and dry by default — when handed one, its witness audit rides
// along; it never gates the deterministic score.
export const runSpecimen = async (specimen, { oracle = null } = {}) => {
  const fullText = specimen.corpus.join(' ');
  const partialText = specimen.corpus.slice(0, specimen.partial).join(' ');
  const full = parseText(fullText, { docId: `${specimen.id}#full` });
  const partial = parseText(partialText, { docId: `${specimen.id}#partial` });

  const drive = (doc) => runTurn({
    question: specimen.question,
    doc,
    model: stubModel(specimen.answer),
    embedder: createHashEmbedder(),
    auditLog: createAuditLog({ capacity: 64 }),
  });
  const rp = await drive(partial);   // sequential on purpose — the decode gate is one lane anyway
  const rf = await drive(full);

  const labelOfPartial = labelReader(partial);
  const labelOfFull = labelReader(full);
  const scored = scoreSpecimen({
    id: specimen.id,
    shape: shapeAudit(rf.judgmentLog?.all() || []),
    rows: matchGold(rf.judgmentLog?.project() || new Map(), specimen.gold, { labelOf: labelOfFull }),
    stability: scoreStability(rp.judgmentLog?.project() || new Map(), rf.judgmentLog?.project() || new Map(),
      { labelOfPrev: labelOfPartial, labelOfNext: labelOfFull }),
  });
  const merged = mergeRuns(rp.judgmentLog, rf.judgmentLog, { labelOfPrev: labelOfPartial, labelOfNext: labelOfFull });

  return Object.freeze({
    ...scored,
    ratchet: !!specimen.ratchet,
    merged,
    turns: Object.freeze({ partial: rp, full: rf }),
    oracle: oracle
      ? await oracle.audit({ question: specimen.question, document: fullText,
          defs: [...(rf.judgmentLog?.project?.().values() || [])] })
      : null,
  });
};

// runBattery — every specimen, one aggregate. Failures are per-specimen and honest: a specimen
// whose drive throws is reported as { id, error } and excluded from the aggregate rather than
// silently dropped.
export const runBattery = async (specimens, opts = {}) => {
  const perSpecimen = [];
  const errors = [];
  for (const s of specimens) {
    try { perSpecimen.push(await runSpecimen(s, opts)); }
    catch (err) { errors.push(Object.freeze({ id: s.id, error: String(err?.message || err) })); }
  }
  return Object.freeze({ perSpecimen: Object.freeze(perSpecimen), scoreboard: scoreboard(perSpecimen), errors: Object.freeze(errors) });
};
