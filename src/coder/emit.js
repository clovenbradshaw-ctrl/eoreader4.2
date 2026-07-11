// EO: SYN·CON·EVA(Network,Lens → Lens, Composing,Binding,Tracing) — constrained emission
// The operational half of roadmap Stage 1: "the model proposes, the kernel
// disposes," made mechanical. A model supplies an INTENT — an assembly it wants to
// build, event by event, possibly malformed. The emitter re-emits each event face
// by face THROUGH THE MASK (src/coder/mask.js): at each face it takes the model's
// proposed value if the mask permits it, else the nearest legal value, and logs the
// divergence. The result is EOT that is, by construction, free of the three
// per-event token-block errors — grain-mixed, desert-cell, contract-violation — no
// matter what the model proposed.
//
// What emit GUARANTEES: a single emitted assembly cannot carry grain-mixed,
// desert-cell, or contract-violation. What it does NOT: dependency (a reference is
// a cross-assembly ordering fact, resolved by emitting in helix order, not by
// masking a face) and the composition/surface errors (they need the room's fields
// and the container — §4's bottom block). And, honestly, appropriateness: masking
// guarantees well-formedness, never that the well-formed thing is the right thing
// (roadmap Stage 1 overconstraint note). The divergence log is where a reviewer
// sees the model straining against the wall — Stage 1's requested research artifact.

import { maskField, legalRefs } from './mask.js';

const FACES = Object.freeze(['op', 'terrain', 'stance', 'grain']);

// constrainedEmit(intent, context) → { assembly, emissions }
// intent = { id, kind?, contract?, surface?, room?, parts?, container?,
//            events: [{ op?, terrain?, stance?, grain?, id?, ref? }] }
// emissions = [{ event, face, wanted, allowed, chosen, note? }] — the divergence log.
export const constrainedEmit = (intent, context = {}) => {
  const partial = { contract: intent?.contract };
  const emissions = [];
  const events = [];
  const src = Array.isArray(intent?.events) ? intent.events : [];
  const refs = legalRefs({ knownRefs: context.instances }, context);

  src.forEach((want, i) => {
    const draft = {};
    for (const face of FACES) {
      if (want?.[face] == null) continue;                 // the model left this face open — coherent to omit
      const allowed = maskField(face, draft, partial);
      let chosen = allowed.includes(want[face]) ? want[face] : (allowed[0] ?? null);
      if (chosen !== want[face])
        emissions.push(Object.freeze({ event: i, face, wanted: want[face], allowed: Object.freeze([...allowed]), chosen, ...(chosen == null ? { note: 'the mask left no legal value' } : {}) }));
      if (chosen == null) break;                            // a corner the model painted — emit what stands
      draft[face] = chosen;
    }

    if (!Object.keys(draft).length) return;                // nothing emittable for this event
    const ev = { ...draft };
    if (want?.id != null) ev.id = want.id;
    // a reference the known set cannot ground is a dependency the mask can't fix by
    // substitution — carry it as-is and let the checkpoint/repair see it (helix order).
    if (want?.ref != null) {
      ev.ref = want.ref;
      if (!refs.includes(want.ref))
        emissions.push(Object.freeze({ event: i, face: 'ref', wanted: want.ref, allowed: Object.freeze([...refs]), chosen: want.ref, note: 'reference not yet grounded — resolve by helix order' }));
    }
    events.push(Object.freeze(ev));
  });

  const assembly = Object.freeze({
    id: intent?.id ?? '_',
    kind: intent?.kind ?? null,
    contract: intent?.contract ?? null,
    ...(intent?.surface != null ? { surface: intent.surface } : {}),
    ...(intent?.room != null ? { room: intent.room } : {}),
    ...(intent?.parts != null ? { parts: intent.parts } : {}),
    ...(intent?.container != null ? { container: intent.container } : {}),
    events: Object.freeze(events),
    closed: true,
  });

  return Object.freeze({ assembly, emissions: Object.freeze(emissions) });
};
