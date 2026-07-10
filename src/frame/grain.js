// EO: DEF·EVA(Network,Paradigm → Lens,Kind, Dissecting,Binding) — the cube reading + confab guard
// frame/grain.js — the holon tree, read onto the EO cube. Factored out of
// tasks/grain.js (which re-exports it unchanged) because nothing in it is a text
// or task fact: it reads BUILT NODES — children, declared grain — and the cube.
// The grain tree above the leaves is already modality-blind (docs/omnimodal-
// task-language.md); this is that claim as one shared implementation.
//
// A task is a holon, and every holon operates AT A GRAIN. The cube already names
// the grain axis (Object: Ground / Figure / Pattern) and the rule that does more
// work than anything else in the system — "the grain of the move must match the
// grain of the terrain", the confabulation guard. This module reads a node's
// place on that cube, reusing core/cube.js as the authority rather than minting a
// second vocabulary.
//
// THE THREE ACTS ARE CUBE OPERATORS (the Act face, core/operators.js):
//
//   decompose  cut a goal into parts          → SEG (Differentiate × Structure)
//   generate   make the one specific thing     → INS (Generate × Existence)
//   assemble   compose the children into a whole → SYN (Generate × Structure)
//
// TWO SENSES OF GRAIN, both from the existing vocabulary:
//
//   Object grain (cube)  Ground / Figure / Pattern — the categorical role.
//     A LEAF is a FIGURE: a specific thing one generation MAKES. INS at Figure is
//     the Making/Entity cell — "the gravity well, the densest cell" (cube.js), the
//     single small-LLM reach that produces text. A BRANCH is a PATTERN: a
//     regularity COMPOSED from its children (SYN at Pattern → Composing/Network)
//     and UNRAVELLED into them (SEG at Pattern → Unraveling/Network). The ambient
//     goal the whole tree rides in is the GROUND — the document, the conversation
//     field; the frame, not a node.
//
//   Holonic grain (stack)  the integer of core/event.js: 0 at first appearance,
//     +1 each SYN promotion. A leaf is grain 0; each assembly up the tree is a SYN
//     that promotes one grain. So a node's holonic grain is its HEIGHT above the
//     leaves — the number of SYN promotions it took to build it.
//
// THE CONFABULATION GUARD, OPERATIONALISED. INS-at-Figure (Making the specific
// thing) is on the diagonal; INS asked to make a Ground (Making at a Void) is the
// Kafka confab the cube rejects. For this tree that is exactly: a Figure-maker
// handed a goal that is really Pattern/Ground-grained — a goal too big for one
// reach, jammed into a single generation because a guard capped the decomposition
// or the planner stopped splitting too early. `grainCoherence` flags it; the
// decomposer reads it as a STOPPING RULE — keep splitting while a goal is
// Pattern-grained, make a leaf only once it is Figure-grained. At the frame
// grain the same flag reads: a digression too big for one reach, handed to one
// leaf anyway.

import { cellOf, coherence, GRAINS } from '../core/index.js';

// The cube operator each act IS. Imported here as ids; core/cube fixes their
// Mode and Domain, so the cells below are derived, never hand-declared.
export const TASK_OPS = Object.freeze({ decompose: 'SEG', generate: 'INS', assemble: 'SYN' });

export const GROUND = 'Ground', FIGURE = 'Figure', PATTERN = 'Pattern';

const isBranch = (node) => !!(node && node.children && node.children.length);

// The structural Object grain of a built node: a branch is a Pattern (it is the
// regularity over its children), a leaf is a Figure (the one thing made).
export const objectGrainOf = (node) => (isBranch(node) ? PATTERN : FIGURE);

// The holonic grain — the SYN-promotion level, height above the leaves. Pure over
// the built tree (recurses on children already built by the projection).
export const holonGrainOf = (node) => {
  if (!node) return 0;
  const kids = node.children || [];
  if (!kids.length) return 0;
  return 1 + Math.max(...kids.map(holonGrainOf));
};

// The cube cell a node's PRIMARY act lands in — leaf: INS@Figure (Making/Entity);
// branch: SYN@Pattern (Composing/Network). Reuses cellOf, so the stance and
// terrain come straight off the cube.
export const cubeCellOf = (node) => {
  const grain = objectGrainOf(node);
  const op = grain === FIGURE ? TASK_OPS.generate : TASK_OPS.assemble;
  return cellOf(op, grain);
};

// Every act a node performs, as cube cells. A branch both UNRAVELS its goal into
// children (SEG) and COMPOSES their outputs back (SYN); a leaf only MAKES (INS).
export const actsOf = (node) =>
  isBranch(node)
    ? Object.freeze({ decompose: cellOf(TASK_OPS.decompose, PATTERN), assemble: cellOf(TASK_OPS.assemble, PATTERN) })
    : Object.freeze({ generate: cellOf(TASK_OPS.generate, FIGURE) });

// grainCoherence — is the node on the Object diagonal?
//
// A normal leaf (INS@Figure) and a normal branch (SYN@Pattern) always are, by
// construction — core/cube's `coherence` confirms it. The guard bites when a node
// carries a DECLARED grain that disagrees with its structural one: a Figure-maker
// handed a Pattern/Ground goal. That is "do not apply a Figure fix to a Ground
// problem", read at the task layer.
export const grainCoherence = (node, declaredGrain = node?.declaredGrain ?? null) => {
  const structural = objectGrainOf(node);
  const op = structural === FIGURE ? TASK_OPS.generate : TASK_OPS.assemble;
  const base = coherence({ op, grain: structural });   // the structural cell, always diagonal
  const declared = declaredGrain && GRAINS.includes(declaredGrain) ? declaredGrain : null;
  if (declared && declared !== structural) {
    const act = structural === FIGURE ? 'generation' : 'assembly';
    return Object.freeze({
      ok: false,
      reason: `grain-confab: a ${structural} ${act} for a ${declared} goal — keep decomposing`,
      structural, declared, cell: base.cell,
    });
  }
  return Object.freeze({ ok: base.ok, reason: base.reason, structural, declared: declared ?? structural, cell: base.cell });
};

// annotateGrain — attach the cube reading to a built node (the projection calls
// this). `declaredGrain` is what the planner asked the goal to be (or 'Pattern'
// when a guard FORCED a still-splitting goal into a leaf); null on a plain leaf.
export const annotateGrain = (node, declaredGrain = null) => {
  if (!node) return node;
  node.object = objectGrainOf(node);
  node.holonGrain = holonGrainOf(node);
  node.cell = cubeCellOf(node);
  node.acts = actsOf(node);
  const coh = grainCoherence(node, declaredGrain);
  node.coherent = coh.ok;
  node.grainNote = coh.reason;   // null when on-diagonal
  return node;
};
