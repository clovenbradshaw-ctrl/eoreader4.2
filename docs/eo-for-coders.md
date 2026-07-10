# EO for Coders
### A progressive reference for AI systems building applications on the operator algebra

> Version: 0.2 (proposal). Canon: the EO wiki at experientialontology.org,
> the nine operators as implemented in eoreader4.1 `core/operators.js`, the
> three faces as defined in `core/faces.js` and `core/cube.js`. This document
> is domain-invariant. Every example could be a hospital, a newsroom, a
> school, a supply chain, or a kitchen. If a section uses a domain-specific
> example, a second example from a different domain follows so the pattern is
> visible and the domain is visibly incidental.

---

## How to read this document

This document has five layers. Start at Layer 0. Move to the next layer only
when your current task requires it. Most app generation lives in Layers 0--2.
Layers 3--4 are for diagnostic work when something goes wrong or when the
composition is structurally complex.

Each layer is self-contained. If you find yourself reaching for a later layer
on a simple task, you are overcomplicating the task.

---

## The two laws

Everything in this document follows from two laws. Learn them before Layer 0.

**Law 1 -- every part declares a contract, and every contract has the same
shape.** A part is anything you emit: a room, a surface, a filter, an app.
Every part declares, in the same three fields, what it is allowed to do:

```
contract = { ops, terrains, stances }
```

`ops` is the Act face: which of the nine operators the part may fire.
`terrains` is the Site face: where its events may land. `stances` is the
Stance face: how its events may resolve. The kernel checks every event the
part emits against its declared contract, and checks the three faces of every
event for grain coherence. There is no second contract shape. A room's
contract, a surface's contract, a filter's contract, and an app's contract
are the same three fields at different scales. If you learn the shape once,
you have learned it everywhere.

**Law 2 -- every app is assembled the good watchmaker's way.** Two
watchmakers, Hora and Tempus, both made watches of a thousand parts. Tempus
built each watch as one long sequence, so every interruption collapsed the
whole assembly. Hora built stable sub-assemblies of ten, each a whole that
held together on its own, then assembled those. Interruption cost Hora only
the sub-assembly in hand. Hora prospered; Tempus went broke.

You are Hora. You never emit an app as one long sequence. You emit it as a
chain of assemblies -- rooms, then links, then surfaces, then filters, then
the app -- and you close each assembly with a validation checkpoint before
starting the next. The checkpoint is the watchmaker's set-down: the assembly
must hold together alone, validated with only its own lines plus what came
before it. If validation fails, you revise only the assembly in hand. The
completed assemblies stand. Nothing upstream is re-opened, nothing downstream
has been started. A Tempus emission -- the whole app in one unvalidated block
-- is a spec violation even if every line in it happens to be correct,
because a single error anywhere would invalidate everything and teach you
nothing about where.

The two laws are one law seen twice. A contract is what makes an assembly
checkable alone; the checkpoint is where it is checked. Contracts without
checkpoints are documentation. Checkpoints without contracts have nothing to
check. Together they are the discipline: **declare, assemble, set down,
verify, compose.**

---

# Layer 0 -- The Legend

**When you need this:** always. This is the minimum.

You are building applications by emitting structured descriptions that a
kernel validates and a substrate renders. You do not write code. You write
lines of text in a surface syntax called EOT, using punctuation shapes you
already know:

```
:       type         "cameras : room" means cameras IS a room
.x =    property     "cameras.name = Sunrise" means set the name to Sunrise
->      connection   "cameras -> records" means cameras is linked to records
~       absence      "cameras.end = ~" means the end date is absent/void
!OP     explicit     "!SEG cameras.zone" means draw a boundary (rare; Layer 1)
!EVA    checkpoint   "!EVA cameras" means validate this assembly now, alone
```

That is the entire production surface. You emit colons, dots, equals signs,
arrows, and checkpoints. A deterministic ingester recovers the operator, the
address, and the provenance from these shapes. You do not choose operators.
You do not validate your own output. You propose; the kernel disposes.

**A complete app in EOT, assembled the watchmaker's way:**

```eot
# ── assembly 1: the patients room ──────────────────────────────
patients : room
patients.name = "Patient Registry"
patients.contract.ops = INS, DEF, CON, REC
patients.contract.terrains = Entity, Kind
patients.contract.stances = Making, Dissecting, Binding
patients.schema : kind
patients.schema.name = "text"
patients.schema.dob = "date"
patients.schema.ward = "text"
patients.schema.status = "choice:admitted,discharged,transferred"
!EVA patients                       # set down: room validates alone

# ── assembly 2: the rounds room ────────────────────────────────
rounds : room
rounds.name = "Daily Rounds"
rounds.contract.ops = INS, DEF, CON
rounds.contract.terrains = Entity, Kind
rounds.contract.stances = Making, Binding
rounds.schema : kind
rounds.schema.patient = "text"
rounds.schema.date = "date"
rounds.schema.notes = "text"
rounds.schema.attending = "text"
!EVA rounds                         # set down: room validates alone

# ── assembly 3: the link ───────────────────────────────────────
patients -> rounds
!EVA patients, rounds               # set down: link validates against both

# ── assembly 4: the surfaces ───────────────────────────────────
patient_table : table
patient_table.room = patients
!EVA patient_table                  # set down: surface contract vs room contract

rounds_table : table
rounds_table.room = rounds
!EVA rounds_table

ward_board : board
ward_board.room = patients
ward_board.column = "ward"
ward_board.card = "name"
!EVA ward_board

# ── assembly 5: the app ────────────────────────────────────────
registry : app
registry.name = "Ward Registry"
registry.surfaces = patient_table, rounds_table, ward_board
registry.home = ward_board
registry.filter.ward = "ward"
!EVA registry                       # set down: app contract is the envelope
                                    # of its parts; kernel verifies closure
```

Five assemblies, five checkpoints. If assembly 4 fails, assemblies 1 through 3
stand and assembly 5 has not been started. You revise the surface in hand.
That is the whole discipline.

**Contract shorthand.** Every catalog surface ships with a default contract
(Appendix A). Writing `patient_table : table` inherits the table's default
contract; you declare a contract explicitly only to narrow it (a read-only
table drops INS and Making) or when the kernel asks. Rooms have no defaults
-- a room's contract is yours to declare, because only you know what the
room is for. When in doubt, declare narrowly. A contract can be widened later
by REC; silent width is how apps rot.

---

# Layer 1 -- The Nine Operators

**When you need this:** when the `!OP` escape is required, when you need to
understand a validation error, or when composing surfaces that do more than
type/property/link.

Every transformation that can happen to data, in any domain, decomposes into
exactly one of nine operators or a composition of them. This closure is
verified computationally against Codd's relational algebra. No operator can
be removed without losing expressiveness. No tenth operator is needed.

The nine are grouped into three triads, each addressing one domain of
reality:

### Existence -- whether things are

| operator | glyph | what it does | when it fires |
|---|---|---|---|
| **NUL** | ∅ | **hold** -- non-transformation; encounter without changing | observing, reading, receiving, the quiet before the verb |
| **SIG** | ○ | **attribute** -- direct attention, register a difference | noticing, flagging, tagging, the first "this is distinct" |
| **INS** | ● | **instantiate** -- create an enduring instance with a stable identity | creating a record, minting an entity, the colon in EOT |

### Structure -- how things connect

| operator | glyph | what it does | when it fires |
|---|---|---|---|
| **SEG** | ｜ | **resplit** -- draw or dissolve a boundary | partitioning, zoning, splitting, grouping, the `!SEG` escape |
| **CON** | ⋈ | **bond** -- establish or sever a connection across a boundary | linking, referencing, joining, the arrow in EOT |
| **SYN** | △ | **synthesize** -- produce an emergent whole from parts | merging, composing an app from surfaces, generating a report from sources |

### Significance -- what things mean

| operator | glyph | what it does | when it fires |
|---|---|---|---|
| **DEF** | ⊢ | **assert/define** -- establish what holds within a frame | setting a value, defining a term, declaring a contract, the `.x =` in EOT |
| **EVA** | ⊨ | **evaluate** -- render judgment by testing against definitions | validating, scoring, approving, the checkpoint, the kernel's coherence check |
| **REC** | ↬ | **learn rule** -- restructure the frame itself when evaluation breaks it | schema migration, contract widening, the moment the old categories stop working |

Two of these operators are the two laws wearing glyphs. A contract
declaration is DEF -- establishing what holds within the part's frame. A
checkpoint is EVA -- testing the assembly against its declarations. The
watchmaker discipline is not a convention layered on the algebra. It is the
Significance triad applied to the act of building: DEF the contract, EVA the
assembly, REC the revision when EVA fails. You are running the same loop the
substrate runs.

### The helix -- dependency ordering

The nine compose into a strict dependency chain:

```
NUL → SIG → INS → SEG → CON → SYN → DEF → EVA → REC
```

This is a dependency map, not a checklist. Existence must be established
before Structure can organize it. Structure must exist before Significance
can operate on it. Within each triad: you cannot attribute (SIG) without
first encountering (NUL); you cannot bond (CON) without first drawing
boundaries (SEG); you cannot restructure the frame (REC) without first
evaluating against it (EVA). Of 1,296 possible orderings, 1,295 fail
non-degeneracy criteria. One survives.

**The assembly order is the helix at composition grain.** Rooms before links
(INS before CON). Links before surfaces (CON before the SYN that composes
views over data). Surfaces before the app (parts before the emergent whole).
The app last, closed by the final EVA. When you wonder what order to emit
assemblies in, read the helix. When the kernel rejects an emission for a
dependency violation, you have emitted against the helix: a CON between rooms
not yet INS'd, a surface over a room whose schema has no DEF, a REC on a
frame that has never been EVA'd.

### The EOT recovery map

Most operators are recovered automatically from punctuation. The six that
need explicit `!OP` escapes and when:

| operator | when you need `!OP` | example |
|---|---|---|
| `!NUL` | explicitly marking observation (rare) | `!NUL patients` -- observe without changing |
| `!SEG` | drawing a boundary or partition | `!SEG patients.zone = "ICU"` -- split by zone |
| `!SYN` | merging entities or composing a whole | `!SYN ward_5 = bed_a, bed_b, bed_c` -- synthesize a ward from beds |
| `!EVA` | the checkpoint; also explicit evaluation of data | `!EVA rounds` -- validate the assembly / `!EVA rounds.compliance` -- evaluate a field |
| `!REC` | restructuring a schema, frame, or contract | `!REC patients.contract.ops += SEG` -- widen a contract |
| `!SIG` | flagging attention without setting a value | `!SIG patients.p-0042` -- flag this patient |

INS, DEF, and CON almost never need the escape because `:`, `.x =`, and `->`
recover them.

---

# Layer 2 -- The Three Faces

**When you need this:** when writing or narrowing a contract, when a
validation error names a terrain or stance, or when choosing which surface
fits which data.

A cell in the algebra has three axes: Mode (how), Domain (where), Object
(what grain). Taken two at a time, they produce three faces -- the three
fields of every contract:

### The Act face (Mode by Domain) -- WHAT is done -- the `ops` field

This is the operator itself. Layer 1 covers it. When you write
`contract.ops = INS, DEF, CON`, you are declaring the part's Act face: the
column of transformations it is allowed to fire.

### The Site face (Domain by Object) -- WHERE it lands -- the `terrains` field

The Site face answers: what kind of reality is the target? Before any
operator fires, the target sits on a terrain. There are nine:

```
                Ground          Figure          Pattern
Existence       Void            Entity          Kind
Structure       Field           Link            Network
Significance    Atmosphere      Lens            Paradigm
```

**Void** -- the ambient substrate of being. Team chemistry. Market confidence.
Gets bigger when you try to measure it.

**Entity** -- a specific existent. This person, this record, this event.
Bounded, nameable. Language is richest here, which is why most systems
default here regardless of where the problem lives.

**Kind** -- a type, category, or rate. Not any particular patient but "the
class of patients." Demographics, aggregates, schemas.

**Field** -- the ambient relational environment. The unwritten rules of the
room. Where most organizational problems live.

**Link** -- a specific connection. This bond, this dependency, this contract
between two named things.

**Network** -- an architecture of connections. The system viewed as a
structural whole.

**Atmosphere** -- the ambient interpretive weather. The meaning-conditions
that make certain readings feel obvious.

**Lens** -- a specific reading. One frame applied to one situation. A
diagnosis, a verdict.

**Paradigm** -- a worldview. The hardest terrain to move, because it requires
the full helix through REC.

When you write `contract.terrains = Entity, Kind`, you are declaring the
part's Site face: where its events may land. A room that declares Entity and
Kind holds records and their schema, and an event landing at Atmosphere in
that room is a contract violation, caught at the room's own checkpoint.

### The Stance face (Mode by Object) -- HOW it is done -- the `stances` field

The Stance face answers: at what grain and in what manner does the
transformation land? There are nine stances:

```
                Ground          Figure          Pattern
Differentiate   Clearing        Dissecting      Unraveling
Relate          Tending         Binding         Tracing
Generate        Cultivating     Making          Composing
```

**Clearing** -- dissolving ambient conditions. Making space. Resetting.

**Dissecting** -- cutting a specific thing apart. Filtering. Sorting.

**Unraveling** -- pulling a pattern apart to see what holds it together.

**Tending** -- attending to ambient conditions without forcing change.

**Binding** -- holding a specific thing in relation. Citing. Linking.

**Tracing** -- following a pattern through its recurrences. Trends.

**Cultivating** -- generating ambient conditions. Setting a tone.

**Making** -- producing a specific thing. The gravity well of all language.

**Composing** -- generating a pattern. Synthesizing an architecture.

When you write `contract.stances = Making, Dissecting, Binding`, you are
declaring the part's Stance face: the manners in which its events may
resolve. A read-only chart declares Tracing and Dissecting; a Making event
arriving at it (someone trying to create data through a chart) is a contract
violation.

### The coherence guard -- three faces must agree

A well-formed event has an operator (Act), a terrain (Site), and a stance
(Stance) that agree on grain -- the shared Object axis of Ground, Figure, or
Pattern. Act and Site share Domain; Act and Stance share Mode; Site and
Stance share grain. If the three faces disagree, the event is **grain-mixed**
and the kernel rejects it. This is geometric, not conventional: the three
faces are three shadows of one cube, and incoherent shadows cannot come from
a real object.

The guard runs twice. At every event: is this event internally coherent? At
every checkpoint: is every event this assembly emitted inside the assembly's
declared contract? The first catches malformed events. The second catches
well-formed events fired by parts that had no right to fire them. Both are
deterministic. Neither involves a model's judgment.

One structural prohibition beyond grain-mixing: **the desert cell.** SYN at
Ground -- synthesizing a whole from pure ambient conditions -- is empty
across 41 tested languages, confirmed by computational analysis of 32,000+
verbs. No contract may declare it; the kernel rejects any that tries. An AI
that attempts to emit into the desert cell has attempted a transformation
human language has never found a word for.

### The canonical notation

A fully specified event is written:

```
operator(Site, Stance)
```

Examples:
- `CON(Link, Binding)` -- bonding a specific connection, holding it
- `DEF(Lens, Making)` -- asserting a specific interpretation, producing a verdict
- `REC(Paradigm, Composing)` -- restructuring a worldview
- `INS(Entity, Making)` -- instantiating a specific existent
- `EVA(Lens, Dissecting)` -- evaluating a specific reading, cutting it apart

When the event names a target, the holonic path is woven into the Site:

```
CON(patients.p-0042.rounds@Link, Binding)
```

A contract is therefore readable as a region of the cube: the set of
`operator(Site, Stance)` cells the part may occupy. The kernel's contract
check is a set-membership test on that region. When you narrow a contract,
you are shrinking a region. When `!REC` widens one, you are growing it, and
the growth is a logged, auditable event like everything else.

---

# Layer 3 -- Composition and the Pass

**When you need this:** when building multi-surface apps with shared state,
when the composition is non-trivial, or when you want to understand the
coder's own pipeline.

### An app is a composition of assemblies, each a holon

A holon is a part that is also a whole: verifiable alone, composable without
reaching into another's insides. Every assembly you emit is a holon, and the
proof is its checkpoint -- it validated with only its own lines plus what
came before. The app is a holon of holons: rooms inside links inside
surfaces inside the app, each level closed by its own EVA.

The composition has four parts, in helix order:

1. **Rooms** -- the data. Each room is an append-only, signed event stream
   with a declared contract and a schema (a Kind-terrain DEF). A room is the
   first stable assembly: it validates with nothing but the floor.
2. **Links** -- the bonds. Rooms are connected by CON. A link validates
   against exactly the two rooms it bonds, which must already stand.
3. **Surfaces** -- the views. Each surface renders one terrain of one room.
   A surface's checkpoint verifies its contract against its room's contract:
   the surface's terrains must be readable from the room's terrains, and the
   surface's ops and stances must be a subset of what the room permits. A
   surface never widens what a room allows.
4. **Filters and the app** -- the glue and the whole. A shared filter is a
   CON binding a column across rooms and surfaces. The app is a SYN: parts
   composed into an emergent whole. The app's checkpoint verifies
   **closure**: the app's contract is the envelope of its parts' contracts,
   and no part's contract exceeds the app's. Nothing inside the watch is
   loose.

### Contract flow: narrowing down, enveloping up

Contracts obey one direction of flow at each boundary:

**Downward, contracts narrow.** A surface's contract must fit inside its
room's. A filter's contract must fit inside the surfaces it binds. A part
never grants itself more than its container permits. If a surface needs an
op its room does not declare, the fix is a deliberate `!REC` on the room's
contract -- a logged widening -- never a silent surface-side assumption.

**Upward, contracts envelope.** The app's contract is computed, not
invented: the union of its parts' regions of the cube. Declaring an app
contract narrower than its parts is a closure violation (a part could fire
an event the app disavows). Declaring one wider is a width violation (the
app claims capacities no part has). The kernel computes the envelope at the
final checkpoint and rejects both.

This two-direction rule is what makes assemblies independent. A
room can be validated, shipped, and reused in another app without
renegotiation, because nothing above it can widen it and it makes no claims
about anything above it.

### The pass: how the coder works

The coder generates an app by running a pass -- the same three-faculty
sequence a reader uses to read a document:

```
perceive → surf → enact
```

**Perceive** the request: receive the natural-language description. Identify
the nouns (entities, relationships, actions). Mint referents for them.

**Surf** the catalog: segment the request into distinct surface needs. Match
each segment to a catalog surface by Site terrain. Plan the assembly chain:
which rooms, which links, which surfaces, which filters, in helix order.

**Enact** the composition, one assembly at a time: emit the assembly's
lines, close it with `!EVA`, read the verdict. On pass, proceed to the next
assembly. On fail, revise only the assembly in hand -- the typed error names
the face that failed (Appendix B) -- and re-emit it. Two revisions per
assembly is the cap; an assembly that cannot pass in two attempts is
surfaced to the person as "this part cannot be built as asked; here is what
failed," a veto, never a silent degradation.

The pass is not specific to app generation. A reader uses it to read. A
writer uses it to write. A coder uses it to build. The object changes. The
pass does not.

**What the checkpoint buys you, concretely.** Interruption at any point
loses one assembly. A schema error in room two does not touch room one. A
terrain mismatch in surface three does not reopen the rooms. The person can
stop you mid-generation and the completed assemblies are already valid,
provisioned, usable. And every checkpoint verdict is a logged event, so the
app's history shows not only what was built but the order it was built in
and every rejection along the way. The build is auditable the same way the
data is.

### Composition patterns

**Single-room app:** one room, multiple surfaces, one filter. Three
assemblies, three checkpoints.

**Multi-room app:** rooms, then links, then surfaces per room, then
cross-room filters, then the app. The checkpoint chain is longest here and
earns the most: a bad cross-room filter is caught at its own set-down with
every room and surface still standing.

**Hierarchical app:** rooms nested in a space (a room of rooms). Each ward a
room, the hospital a space. The space is itself an assembly with a contract
that envelopes its rooms -- the same closure rule, one level up.

**Public/private split:** one room, two projection surfaces with different
contracts: the public one read-only (`ops = NUL`, stances Tending and
Tracing), the private one read-write. The contract difference IS the
permission model. There is no separate ACL layer to misconfigure; visibility
is a narrower region of the cube, checked like everything else.

---

# Layer 4 -- The 27-Cell Ground

**When you need this:** when diagnosing a failure the shallower layers
cannot explain, or when the task is structural (designing an ontology, not
building an app).

The full capacity ground is a 3 by 3 by 3 cube: three Modes, three Domains,
three Objects. Each of the 27 cells is a unique combination of how, where,
and what-grain, with a coordinate address:

```
Mode:    Differentiate = 0    Relate = 1       Generate = 2
Domain:  Existence = -1       Structure = +1   Significance = sqrt(2)
Object:  Ground = 2           Figure = sqrt(2) Pattern = 2^sqrt(2)
```

The Object axis carries the transcendental: Pattern's coordinate (2^sqrt(2))
is transcendental by the Gelfond-Schneider theorem, unreachable by finite
algebraic process. Defeasibility is a mathematical theorem: no finite
sequence of operations reaches the Pattern coordinate exactly. Every claim
remains revisable. Every contract can be REC'd.

### The population gradient

The 27 cells are not equally populated. Across 41 languages, 11 families,
and 32,000+ classified verbs: **Figure > Pattern > Ground** at every Mode,
in every Domain. The Ground row is sparse in every language tested; the
desert cell (SYN at Ground) is the extreme, empty everywhere. This sparsity
is a structural feature of the algebra, and it has a practical reading for
contracts: a contract heavy in Ground-row cells (Clearing, Tending,
Cultivating; Void, Field, Atmosphere) describes a part doing ambient work
that language barely names and users will struggle to see. Such parts exist
-- a moderation policy is Atmosphere work; a defaults engine is Cultivating
work -- but they need more explanation surface than Figure-row parts, not
less.

### The three entity types

Configurations in the ground produce three entity types:

**Emanons** -- Ground-dominant. Diffuse, ambient, hard to name. They get
bigger when you try to measure them. Interventions aimed at Emanons through
Figure-terrain surfaces usually fail.

**Protogons** -- Figure-dominant, Pattern-seeking. Crystallizing identities,
forming relationships, theories under construction. Unstable because
patterns are seeking stability.

**Holons** -- balanced. Figure, Pattern, and Ground reinforce each other.
Self-maintaining. Holons can apply the framework's operations to themselves
without collapse.

**What this means for you:** the entity type of a room's contents tells you
what surfaces will be stable. Emanon-heavy data renders poorly on a table
and well on a chart or feed. Holon data renders well on anything. Protogon
data benefits from a board -- the surface that makes transition visible --
and may be premature for a chart, which assumes stable categories. And note
the reflexive reading: a correctly built app is itself a Holon. Its parts
(Figure), its contracts (Pattern), and its rooms' ambient conventions
(Ground) reinforce each other, which is exactly what the closure checkpoint
verifies. The watchmaker's stable assembly and the balanced entity type are
the same idea at two scales.

---

# Appendix A -- The Surface Catalog

The complete catalog, each surface with its default contract in the standard
form. Inheriting a surface type inherits this contract; declare explicitly
only to narrow.

| surface | contract.terrains | contract.ops | contract.stances | renderer |
|---|---|---|---|---|
| table | Entity, Kind | INS, DEF, CON, SEG, REC | Making, Dissecting, Binding | grid component |
| chart | Kind | NUL | Tracing, Dissecting | charting library |
| map | Field, Entity | INS, SEG | Making, Clearing, Binding | map tiles + markers |
| feed | Atmosphere | INS, CON, EVA | Making, Binding, Tending | reverse-chron list |
| form | Lens | DEF | Making | schema-driven input |
| board | Entity, Field | INS, DEF, SEG | Making, Dissecting | kanban lanes |
| graph | Link, Network | CON, SYN | Binding, Composing, Tracing | force-directed layout |
| calendar | Entity, Kind | INS, DEF | Making, Dissecting | temporal grid |
| card | Entity | NUL | Binding | detail panel |
| reader | Field, Lens | NUL, CON, EVA | Tending, Binding, Dissecting | document viewer |

Each surface is a pre-built, tested component. You select and compose; you
do not generate surfaces. A surface the catalog lacks is a catalog gap, not
a coder task: report it. It gets built by a human once, contracted, tested,
and added for all future compositions.

---

# Appendix B -- Validation Error Reference

Every checkpoint verdict is one of these typed errors. Each names the face
that failed and the fix. All errors are scoped to the assembly in hand.

| error | face | meaning | fix |
|---|---|---|---|
| `grain-mixed` | all three | an event's operator, terrain, and stance disagree on grain | make all three faces target the same grain; the common cause is a Figure operator aimed at a Ground terrain |
| `desert-cell` | Act + Site | an event or contract lands on SYN at Ground | instantiate (INS) parts first, then synthesize; no contract may include the desert cell |
| `dependency` | Act (helix) | a prerequisite operator has not fired | read the helix: does the target exist (INS)? is the schema defined (DEF)? emit assemblies in helix order |
| `contract-violation` | any | a well-formed event fired outside its part's declared region | narrow the emission or deliberately widen the contract with a logged `!REC`; never assume width |
| `terrain-mismatch` | Site | a surface's home terrain has no matching data in its room | add the needed fields to the room (and re-checkpoint it) or choose a different surface |
| `stance-violation` | Stance | an interaction's stance is outside the surface's contract | the surface does not support that engagement; a chart cannot receive Making |
| `narrowing-violation` | composition | a part claims ops/terrains/stances its container does not permit | narrow the part, or `!REC` the container upward through each level explicitly |
| `closure-violation` | composition | the app's declared contract is not the envelope of its parts | recompute: the app contract is derived from the parts, not invented |
| `unassembled` | Law 2 | lines emitted past an assembly boundary with no checkpoint | close the assembly with `!EVA` before continuing; Tempus emissions are rejected whole |
| `unknown-surface` | catalog | the requested surface type is not in the catalog | a catalog gap; report it rather than inventing a surface |

---

# Appendix C -- Worked Examples

Each example shows the full watchmaker chain: assemblies in helix order,
contracts at every level, a checkpoint at every set-down.

### C.1 -- A school attendance tracker

Request: "Track student attendance by class, see who's absent today, and get
weekly attendance rates."

**Perceive:** students, attendance records, one relationship, two views.
**Surf:** absences -> table (Entity), rates -> chart (Kind), the link, a
class filter. Assembly plan: 2 rooms, 1 link, 2 surfaces, 1 app.

```eot
# ── assembly 1 ──
students : room
students.contract.ops = INS, DEF, CON
students.contract.terrains = Entity, Kind
students.contract.stances = Making, Binding
students.schema : kind
students.schema.name = "text"
students.schema.grade = "text"
students.schema.class = "text"
!EVA students

# ── assembly 2 ──
attendance : room
attendance.contract.ops = INS, DEF, CON
attendance.contract.terrains = Entity, Kind
attendance.contract.stances = Making, Dissecting, Binding
attendance.schema : kind
attendance.schema.student = "text"
attendance.schema.date = "date"
attendance.schema.status = "choice:present,absent,late"
!EVA attendance

# ── assembly 3 ──
students -> attendance
!EVA students, attendance

# ── assembly 4 ──
today : table
today.room = attendance
today.filter.date = "today"
today.filter.status = "absent"
!EVA today

weekly_rates : chart                 # inherits chart default: NUL only,
weekly_rates.room = attendance       # Kind terrain, Tracing + Dissecting
weekly_rates.x = "date"
weekly_rates.y = "status"
weekly_rates.group = "class"
weekly_rates.period = "week"
!EVA weekly_rates

# ── assembly 5 ──
tracker : app
tracker.name = "Attendance Tracker"
tracker.surfaces = today, weekly_rates
tracker.home = today
tracker.filter.class = "class"
!EVA tracker                         # closure: envelope of parts verified
```

### C.2 -- A neighborhood asset map, with a public/private split

Request: "Map the community gardens, libraries, and mutual aid stations,
with contact details behind each marker. The map is public; editing is for
our volunteers."

The split is two surfaces over one room with different contract widths --
the permission model is the contract difference.

```eot
# ── assembly 1 ──
assets : room
assets.contract.ops = INS, DEF, SEG
assets.contract.terrains = Field, Entity, Kind
assets.contract.stances = Making, Binding, Clearing
assets.schema : kind
assets.schema.name = "text"
assets.schema.type = "choice:garden,library,mutual_aid"
assets.schema.location = "geo"
assets.schema.contact = "text"
assets.schema.hours = "text"
!EVA assets

# ── assembly 2: the public map, narrowed to read-only ──
public_map : map
public_map.room = assets
public_map.geo_field = "location"
public_map.marker_label = "name"
public_map.contract.ops = NUL                 # narrowed from map default
public_map.contract.stances = Tending, Binding
public_map.visibility = "public"
!EVA public_map

# ── assembly 3: the volunteer editor, full width ──
edit_table : table
edit_table.room = assets
edit_table.visibility = "authenticated"
!EVA edit_table

# ── assembly 4 ──
neighborhood : app
neighborhood.name = "Neighborhood Assets"
neighborhood.surfaces = public_map, edit_table
neighborhood.home = public_map
neighborhood.filter.type = "type"
!EVA neighborhood
```

### C.3 -- A reading group, with a deliberate contract widening

Request: "A place for our reading group to share notes on documents, discuss
them, and log what we've read. Later we decide members can also propose the
next book by vote."

The vote arrives after the app stands. It needs EVA on the library room --
which the room's original contract did not declare. The widening is a logged
`!REC`, then a new surface, then a re-closure of the app. No standing
assembly is re-opened except the two whose contracts change, and each change
is its own checkpointed assembly.

```eot
# ── assemblies 1-5: rooms, link, surfaces, app (as before) ──
library : room
library.contract.ops = INS, DEF, CON
library.contract.terrains = Entity, Kind
library.contract.stances = Making, Binding
library.schema : kind
library.schema.title = "text"
library.schema.author = "text"
library.schema.status = "choice:reading,finished,proposed"
!EVA library

discussion : room
discussion.type = "feed"
discussion.contract.ops = INS, CON, EVA
discussion.contract.terrains = Atmosphere
discussion.contract.stances = Making, Binding, Tending
!EVA discussion

library -> discussion
!EVA library, discussion

reading_log : table
reading_log.room = library
!EVA reading_log

group_feed : feed
group_feed.room = discussion
!EVA group_feed

reading_group : app
reading_group.name = "Reading Group"
reading_group.surfaces = reading_log, group_feed
reading_group.home = group_feed
!EVA reading_group

# ── later: the vote. assembly 6: widen the room's contract ──
!REC library.contract.ops += EVA              # logged, auditable widening
!REC library.contract.stances += Dissecting
!EVA library                                  # room re-checkpointed alone

# ── assembly 7: the voting surface, inside the widened contract ──
proposals : table
proposals.room = library
proposals.filter.status = "proposed"
proposals.vote = "!EVA row"                   # a row-vote is EVA(Lens, Dissecting)
!EVA proposals

# ── assembly 8: re-close the app envelope ──
!REC reading_group.surfaces += proposals
!EVA reading_group                            # closure recomputed with new part
```

The evolution pattern in C.3 is the general one: **change arrives as a new
assembly, never as an edit inside an old one.** Widen by `!REC`,
re-checkpoint the widened part alone, add the new part, re-close the
envelope. The log shows the app's whole life as a chain of set-downs.

---

# Appendix D -- What You Are Not

You are not an oracle. You do not know things. You emit punctuation shapes
that a deterministic kernel validates against a mathematical structure. The
kernel is the intelligence. You are the leaf.

You are not Tempus. You never emit an app as one long unvalidated sequence,
even when you are confident every line is correct. Confidence is not a
checkpoint. The chain of set-downs is what makes your work interruptible,
auditable, and revisable one assembly at a time, and it is what makes a
failure informative instead of catastrophic.

You do not generate code, rendering logic, or validation rules. You select
contracted surfaces from a catalog and compose them over contracted rooms.
If the catalog lacks a surface, you say so. You do not invent.

You do not validate your own output. The coherence guard validates. If you
find yourself reasoning about whether an event is well-formed, stop. Emit
it, close the assembly, read the verdict. A rejected assembly is
information scoped to one set-down. A self-censored emission teaches
nothing.

You do not widen silently. Every contract you declare is narrow by default.
Every widening is an explicit `!REC`, logged, attributable, and
re-checkpointed. Silent width is how apps rot, and the log will show whose
width it was.

You do not resolve ambiguity by guessing. "A project tracker" does not tell
you the columns. Ask -- a form rendered by the substrate itself, confirming
the schema before the room's first checkpoint. The person knows their
domain. You know the punctuation.

You carry provenance. Every line you emit records that it was emitted by
you, at this time, in response to this request, and every checkpoint verdict
is a logged event beside it. The app carries the auditable trace of its own
assembly: what was built, in what order, what failed on the way, and what
was widened when. You are not anonymous. You are accountable, by
construction -- and so is the watch.
