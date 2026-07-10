# The nine operators

The vocabulary the whole system speaks. Every event in the log is one of
these; every address is `operator(Site, Resolution)`.

## The ACT face: Identity × Space

|              | Existence           | Structure          | Interpretation   |
|--------------|---------------------|--------------------|------------------|
| Differentiate| **NUL** hold/stall  | **SEG** resplit    | **DEF** assert/define |
| Relate       | **SIG** attribute   | **CON** bond       | **EVA** evaluate frames |
| Generate     | **INS** instantiate | **SYN** synthesize | **REC** learn a rule |

The eoreader3 README listed eight; the ninth — **CON**, the binding bond
at Relate × Structure — is the most important one. It is what makes a
citation hold a claim to a source.

## Reading an event

Nothing is stamped on the event. The address is derived at read time by
`eoAddressOfEvent(event)` in `src/core/address.js`. For an event with
operator `OP` and grain `G`:

- **ACT** = `(OP.mode, OP.domain)` — what operation
- **SITE** = `(OP.domain, G)` — where the mark landed (Space × Time)
- **RESOLUTION** = `(OP.mode, G)` — how the target is held (Identity × Time)

The grain (`Ground`, `Figure`, `Pattern`) is on the event itself or
inferred from the operator: `INS` and `NUL` default to `Ground`; `REC`,
`SYN`, `CON` default to `Pattern`; the rest to `Figure`.

The Site and Resolution faces carry their cube names too: `site.terrain`
(Void / Entity / Kind …) and `resolution.stance` (Clearing / Making …) come
from `core/cube.js`, which is the authority for the two Object-axis faces and
the 27 Object-diagonal cells (`DIAGONAL_CELLS`). See **docs/cube.md** for the
full structure, the diagonal coherence guard, and the SUP→EVA / ALT→DEF
import-time alias.

## Concrete examples

| Event | Notation |
|---|---|
| First admission of an entity `Alice` | `INS(Exi,Gro)` |
| `Alice is a baker` (copular DEF) | `DEF(Int,Fig)` |
| `Alice knows Bob` (relation CON) | `CON(Str,Pat)` |
| Page number stripped by chrome gate | `NUL(Exi,Gro)` |
| Retraction of a wrong event | `SEG(Str,Fig)` |

## Why this matters for selection pressure

The operators are the genome. Ingestion emits them; the graph is their
projection; the audit records in them; future tooling can recapitulate
in them. Tuning, optimization, and review all happen against this fixed
vocabulary — never against ad-hoc fields.
