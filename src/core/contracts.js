// The EO contract registry — every module in the tree, spelled on all three faces.
// A projection of the per-holon manifests (src/<holon>/eo-contract.js), merged into one
// path -> contract map. This is the conformance surface: tests/contracts.test.js reads it
// to prove 100% coverage and cube coherence. See docs/eo-for-coders.md (Law 1).
import { CONTRACTS as answer } from '../enactor/answer/eo-contract.js';
import { CONTRACTS as arc } from '../weave/arc/eo-contract.js';
import { CONTRACTS as archive } from '../rooms/archive/eo-contract.js';
import { CONTRACTS as audit } from '../rooms/audit/eo-contract.js';
import { CONTRACTS as chorus } from '../weave/chorus/eo-contract.js';
import { CONTRACTS as classify } from '../perceiver/classify/eo-contract.js';
import { CONTRACTS as commission } from '../weave/commission/eo-contract.js';
import { CONTRACTS as converse } from '../turn/converse/eo-contract.js';
import { CONTRACTS as core_ } from './eo-contract.js';
import { CONTRACTS as credence } from '../perceiver/credence/eo-contract.js';
import { CONTRACTS as dag } from '../surfer/dag/eo-contract.js';
import { CONTRACTS as data } from '../rooms/data/eo-contract.js';
import { CONTRACTS as doc } from '../rooms/doc/eo-contract.js';
import { CONTRACTS as enact } from '../enactor/enact/eo-contract.js';
import { CONTRACTS as enactor } from '../enactor/eo-contract.js';
import { CONTRACTS as essay } from '../weave/essay/eo-contract.js';
import { CONTRACTS as factcheck } from '../enactor/factcheck/eo-contract.js';
import { CONTRACTS as flow } from '../surfer/flow/eo-contract.js';
import { CONTRACTS as fold } from '../surfer/fold/eo-contract.js';
import { CONTRACTS as frame } from '../frame/eo-contract.js';
import { CONTRACTS as ground } from '../enactor/ground/eo-contract.js';
import { CONTRACTS as ingest } from '../organs/ingest/eo-contract.js';
import { CONTRACTS as longgen } from '../weave/longgen/eo-contract.js';
import { CONTRACTS as metabolism } from '../metabolism/eo-contract.js';
import { CONTRACTS as model } from '../model/eo-contract.js';
import { CONTRACTS as organs } from '../organs/eo-contract.js';
import { CONTRACTS as perceiver } from '../perceiver/eo-contract.js';
import { CONTRACTS as predict } from '../perceiver/predict/eo-contract.js';
import { CONTRACTS as reader } from '../rooms/reader/eo-contract.js';
import { CONTRACTS as reason } from '../surfer/reason/eo-contract.js';
import { CONTRACTS as research } from '../rooms/research/eo-contract.js';
import { CONTRACTS as retrieve } from '../surfer/retrieve/eo-contract.js';
import { CONTRACTS as surfer } from '../surfer/eo-contract.js';
import { CONTRACTS as tasks } from '../frame/tasks/eo-contract.js';
import { CONTRACTS as turn } from '../turn/eo-contract.js';
import { CONTRACTS as workspace } from '../rooms/workspace/eo-contract.js';
import { CONTRACTS as write } from '../weave/write/eo-contract.js';

export const CONTRACTS = Object.freeze({ ...answer, ...arc, ...archive, ...audit, ...chorus, ...classify, ...commission, ...converse, ...core_, ...credence, ...dag, ...data, ...doc, ...enact, ...enactor, ...essay, ...factcheck, ...flow, ...fold, ...frame, ...ground, ...ingest, ...longgen, ...metabolism, ...model, ...organs, ...perceiver, ...predict, ...reader, ...reason, ...research, ...retrieve, ...surfer, ...tasks, ...turn, ...workspace, ...write });

export const contractOf = (repoRelPath) => CONTRACTS[repoRelPath] ?? null;
export const contractedPaths = () => Object.freeze(Object.keys(CONTRACTS).sort());
