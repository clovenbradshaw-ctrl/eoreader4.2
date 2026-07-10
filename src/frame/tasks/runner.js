// EO: SEG·INS·SYN(Field,Network → Network,Entity,Field, Unraveling,Making,Composing) — runTaskGraph driver
// tasks/runner.js — runTaskGraph: drive a goal down to leaves a small LLM can
// generate, re-projecting the graph after every event.
//
// The runner is the only stateful piece, and the state it owns is the one durable
// thing: the append-only TaskEvent log. Everything else — the nested graph, the
// statuses, the assembled output — is PROJECTED from that log. After each event
// it re-projects and hands the fresh graph to `onUpdate`, so a UI watches the
// tree fill in and a small model only ever sees one leaf-sized goal at a time.
//
// TWO INJECTED FACES, no LLM imported here (the holon stays pure and testable):
//
//   decompose(view) → [subGoal, ...] | []   the planner. Returns sub-goals while
//     a goal is too big for one reach; returns [] (or null) when it is small
//     enough to generate directly. May be a small LLM, or a heuristic, or a fixed
//     plan. This is what makes the levels NESTED — a returned sub-goal is expanded
//     by the same recursion, so depth is whatever the planner asks for.
//
//   generate(view) → string | { output, sources }   the generative engine, run
//     ONCE PER LEAF. Because every leaf is small by construction, a small model
//     can produce it. This is the whole point: decomposition turns "write the
//     long answer" — which a small model fumbles — into a forest of one-bite
//     generations it can each do well.
//
// `view` is a read-only descriptor: { id, goal, depth, parentId, ancestry, grain,
// object, cell } where ancestry is the goal chain root→parent, and the cube
// fields tell each face what grain it is operating at — the decomposer sees the
// goal's declared grain, the leaf generator KNOWS it is a Figure-maker (INS at
// Figure), so neither has to guess its place on the cube.

import { MAX_DEPTH, MAX_FANOUT, MAX_NODES } from './constants.js';
import { openEvent, decomposeEvent, stepEvent, completeEvent, failEvent } from './events.js';
import { projectTaskGraph } from './project.js';
import { assembleOutput, assembleSources, progressOf } from './node.js';
import { cellOf, GRAINS } from '../../core/index.js';
import { TASK_OPS, FIGURE } from './grain.js';

// The leaf's cube identity, fixed: a single generation MAKES a specific thing —
// INS at Figure, the Making/Entity cell. Handed to the generator so it knows the
// grain it works at.
const FIGURE_CELL = cellOf(TASK_OPS.generate, FIGURE);

const throwIfAborted = (signal) => {
  if (signal && signal.aborted) {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  }
};

// Accept the two return shapes a planner may use — bare strings or { goal, grain }
// — and drop the empties, the way the arc drops a sub-claim with no spans. A
// cube-aware planner may declare each sub-goal's Object grain; a plain one omits
// it and the grain is read structurally.
const normalizeSubGoals = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .map((g) => (typeof g === 'string' ? { goal: g, grain: null } : (g && { goal: g.goal, grain: g.grain ?? null })))
    .map((g) => g && { goal: String(g.goal ?? '').trim(), grain: GRAINS.includes(g.grain) ? g.grain : null })
    .filter((g) => g && g.goal);

// Accept the two return shapes a generator may use — a bare string or
// { output, sources } — so the simplest leaf is just `() => 'text'`.
const normalizeGen = (raw) => {
  if (raw == null) return { output: '', sources: [] };
  if (typeof raw === 'string') return { output: raw, sources: [] };
  return { output: String(raw.output ?? ''), sources: Array.isArray(raw.sources) ? raw.sources : [] };
};

export const runTaskGraph = async ({
  goal,
  decompose = () => [],
  generate = () => '',
  onUpdate = null,
  rootId = 'root',
  maxDepth = MAX_DEPTH,
  maxFanout = MAX_FANOUT,
  maxNodes = MAX_NODES,
  signal = null,
} = {}) => {
  const log = [];
  const dropped = [];   // runaway-guard firings, recorded — never silent
  let seq = 0;          // a monotonic step counter; the event `t`. Not wall-clock,
                        // so the same run replays to the same log (replay-stable).
  let nodeCount = 0;

  const emit = (event) => {
    log.push(event);
    if (onUpdate) {
      try { onUpdate(projectTaskGraph(log), event); } catch { /* a subscriber must never sink the run */ }
    }
    return event;
  };

  const expand = async (id, nodeGoal, depth, parentId, ancestry, declaredGrain = null) => {
    throwIfAborted(signal);

    // A guard FORCES a leaf when depth or node budget is spent — the planner is
    // not even consulted. A forced leaf is the cube's confab risk: a goal that may
    // be Pattern-grained, jammed into a single Figure-making generation because we
    // ran out of room, not because the goal was small enough. The open event
    // records it so the projection's grain-coherence flags the Figure-maker.
    const forced = depth >= maxDepth || nodeCount >= maxNodes;
    emit(openEvent({ id, parentId, goal: nodeGoal, depth, grain: declaredGrain, forced, t: seq++ }));

    let subGoals = [];
    if (!forced) {
      subGoals = normalizeSubGoals(await decompose({
        id, goal: nodeGoal, depth, parentId, ancestry,
        grain: declaredGrain,                  // what the parent asked this goal to be
      }));
    }

    // Demand caps supply: truncate to the fanout, and again to whatever node
    // budget remains. Both truncations are recorded.
    if (subGoals.length > maxFanout) {
      dropped.push({ id, guard: 'fanout', kept: maxFanout, asked: subGoals.length });
      subGoals = subGoals.slice(0, maxFanout);
    }
    const budget = Math.max(0, maxNodes - nodeCount);
    if (subGoals.length > budget) {
      dropped.push({ id, guard: 'nodes', kept: budget, asked: subGoals.length });
      subGoals = subGoals.slice(0, budget);
    }

    if (subGoals.length) {
      const childIds = subGoals.map((_, i) => `${id}.${i}`);
      emit(decomposeEvent({ id, childIds, t: seq++ }));
      for (let i = 0; i < subGoals.length; i++) {
        nodeCount += 1;
        // Depth-first, left-to-right: a leaf completes and every ancestor's
        // rollup recomputes on the next projection before the next leaf starts —
        // so the graph fills in the order a reader would read it.
        await expand(childIds[i], subGoals[i].goal, depth + 1, id, [...ancestry, nodeGoal], subGoals[i].grain);
      }
      return;
    }

    // A leaf: the small-LLM reach. It is a FIGURE-MAKER (INS at Figure) — that
    // cube identity is handed to the generator so it knows the grain it works at.
    emit(stepEvent({ id, note: 'generating', t: seq++ }));
    try {
      const { output, sources } = normalizeGen(
        await generate({
          id, goal: nodeGoal, depth, parentId, ancestry,
          grain: declaredGrain, object: FIGURE, cell: FIGURE_CELL, holonGrain: 0,
        }),
      );
      emit(completeEvent({ id, output, sources, t: seq++ }));
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      emit(failEvent({ id, error: String(err?.message || err), t: seq++ }));
    }
  };

  nodeCount = 1; // the root counts against the node budget
  await expand(rootId, String(goal ?? ''), 0, null, []);

  const graph = projectTaskGraph(log);

  // The confab flags: Figure-makers handed Pattern/Ground goals (a guard forced a
  // leaf, or the planner declared a grain it then didn't honour). Surfaced beside
  // `dropped` so a caller can see where the decomposition stopped too coarse.
  const incoherent = [];
  for (const node of graph.byId.values()) {
    if (node.coherent === false) incoherent.push({ id: node.id, goal: node.goal, reason: node.grainNote });
  }

  return {
    graph,
    log,
    dropped,
    incoherent,
    output: assembleOutput(graph.root),
    sources: assembleSources(graph.root),
    progress: progressOf(graph.root),
  };
};
