# Edge-grounding veto and coreference proposal — the fact-checker

> Follow-up to the phasepost perception spec and the conversational-provenance
> follow-up. The talker speaks the fold's arrows on the way out (the prompt) and
> is held to the fold's arrows on the way back (this veto). Same object, two
> directions.

`unbound` catches a claim with no node-level witness — an uncited sentence. It
looked at **nodes**, and the invented-location lie was shaped like a **link**, so
it slipped past. The edge-grounding veto is the link-shaped sibling: translate
the talker's output into EO notation and compare each claimed edge against the
document reading the fold built. A claimed edge with no corresponding document
edge is unbound in the link sense, the way an uncited claim is unbound in the
node sense.

## A correspondence between two readings, never a claim against truth

The graph is not ground truth. It is the document reading — Meant, defeasible,
folded to a cursor. The talker's parsed edge is also a reading, Meant, of the
talker's own prose. So the fact-check is whether a claimed edge **corresponds**
to an edge in the document reading at this cursor. Both sides are perceptions.

A mismatch does not mean the talker lied about the world. It means the talker
asserted a relation the document reading does not contain. That is the right
thing to catch, and it is all the check can honestly claim to catch: it makes the
talker faithful to the graph, **not the graph faithful to the world** (§10). The
graph's faithfulness to the document is upstream — in the SEG, the classifier,
the meaning reader, and in **defeasible identity** (`defeasible-identity.md`): if
the graph collapses the father into the son, this check faithfully adjudicates a
claim against a lie.

## Wired into the turn (the point of it)

This is **why** we do not gate what the talker may say. The model can answer from
its own memory; the safety is here, on the way back, where each propositional
assertion is contrasted against the graph. The check is a live pipeline stage —
`factcheck` in `turn/stages.js`, between `bind` and `veto` — that deposits the
per-claim verdicts into `ctx.edgeVerdicts`, which the veto battery reads. It is
**flag-and-tell**: a contradiction is surfaced as a flag, the model's own words
still ride; the answer is never substituted. The symbolic relation algebra runs
embedder-free, so a disjoint-kinship contradiction fires even under the hash
organ; the geometric verdicts go live when the classifier (MiniLM + centroids)
comes online, and degrade to indeterminate until then.

## The procedure (`src/enactor/factcheck/correspond.js`)

Per talker turn, reusing three organs already built and adding two:

1. **Parse** the prose into propositions — `parseRelations`, the same SVO clause
   parser that reads the page (`claimedEdges`).
2. **Resolve** each proposition's endpoints through the **document referent
   table** — never through the talker's own coreference (§5). `documentFieldAt`
   reconstructs the page's referent field from its mention positions; a leading
   pronoun in a talker claim binds to the hottest *document* referent there.
3. **Type** each relation to its phasepost cell — the centroid classifier, on the
   talker's relation and on the document edge's relation alike.
4. **Compare** by endpoints and by relation cell.
5. **Assign** one of four verdicts.

## The four verdicts

A boolean is wrong here, because absence has more than one cause.

| Verdict | Condition | Action |
|---|---|---|
| `corroborated` | a document edge has the same endpoints and the same or adjacent Pattern cell | stands, and **earns the document edge's citation** (§7) |
| `unsupported` | endpoints resolve, relation types, but no document edge connects them with that relation | stripped or flagged. Not false — **unwitnessed**. |
| `contradicted` | a document edge or an explicit VOID denies the claimed relation | **hard refusal**. The libel-grade catch. |
| `indeterminate` | endpoints won't resolve, OR the relation types to no-commit, OR the embedder cannot measure meaning | **held, not passed**. The check cannot run. |

The contradicted/unsupported split is the journalism. "Block by Block caused the
fire" checked against a graph holding an explicit no-cause-named VOID is
*contradicted* and refused; the same claim against a graph merely silent on
causation is *unsupported* and flagged. The verdicts differ because the absences
differ. The `indeterminate` row is the no-commit discipline applied to the
verdict: when meaning cannot be measured, the check withholds, the way the
classifier withholds the cell.

## Relation correspondence is geometric, not string (§4)

The talker says "lives in," the graph has "located-in" — a string compare strips
a true claim. So we compare in the space where "lives in" and "located-in" are
near and "lives in" and "owns" are far: type both relations to their Pattern
cells and compare **cells**, not strings. Two edges correspond when their
endpoints resolve to the same referents and their Pattern cells are the same or
**adjacent in centroid space** — `createCellAdjacency`, the cosine between two
cell centroids over a **derived** floor: the bounded-signal Born line on the
centroid set's own chance pairings (`core/voidnull.boundedNull`, leave-one-out
the pair under test), with `ADJACENCY_FLOOR` kept only as the cold-start fallback
for a centroid set too thin to measure one. The boundary is read off the
geometry, never declared by hand; `ADJACENCY_ALPHA` (the tolerated false-adjacency
rate) is the one knob (§10). The bound is the *per-decision* one — a single pair
against the noise (N=2), not `deriveNull`'s extreme-value max-of-N, which would
overshoot a bounded cosine blob past 1.0 and find nothing adjacent.

This inherits the MiniLM dependency whole. Under the hash embedder you cannot
tell "lives in" from "owns" except by spelling, so **every relational verdict is
indeterminate** — the honest output until the meaning reader is wired.

## Coreference is an address — the talker proposes, it never resolves (§5, §6)

The talker is good at coreference — better than the document SYN. But letting it
resolve the endpoints of its own claim is the witness grading its own testimony:
it could make the check pass or fail by choosing which node "the trooper" lands
on. So coreference is **measured, not chosen by the party whose claim depends on
it**. In the veto, endpoints resolve through the document referent table by
document-side evidence; an endpoint that will not anchor there is *indeterminate*,
held, not passed on the talker's say-so.

The talker's strength cashes in as a **proposer** (`src/enactor/factcheck/coref.js`).
`proposeCoref` writes a talker-witnessed coreference perception and deposits
capped, tagged conversational warmth on both spans — the ordinary
reinforce-as-deposition path. `corroborateCoref` commits a SYN merge **only on a
grounding reader's second** (`geometricSecond`: the two spans near in the
document's own meaning space — inert under the hash organ), witnessed by *that*
reader, never by the talker. Its nearness line is derived the same way the
adjacency floor is — `boundedNull` over the document's chance span-pairings when a
caller supplies them, `NEARNESS_FLOOR` the fallback until the corroborator is
wired into a live turn to pass that background. The proposal and the confirmation come from
different readers with different witnesses, so the committed identity is grounded
and survives subtraction of talker mass by construction. Tip, never originate.

This is the long-conversation guard. Without it, the talker resolves coref a
little differently each turn and the referent identities drift toward whatever
the talker has been saying — three distinct people quietly merge because the
talker kept saying "the officer." The tag, the cap, and the
corroboration-before-commit are what take the talker's coref strength as a
proposal without letting it rewrite who is who.

## Promotion: corroboration earns the citation (§7)

The veto is not only a refusal. When a talker edge corresponds to a document
edge, that correspondence earns the source tag — fact-checking promotes a talker
sentence to grounded by finding its witness in the graph. The same machinery
that strips an invented relation cites a corroborated one. The veto and the
citation are the two outcomes of one correspondence.

## Where it lands in the battery (`src/enactor/ground/veto.js`)

Two predicates beside `unbound`, reading the four-way verdict the factcheck holon
computed (`ctx.edgeVerdicts`): `edge-contradicted` (refuses) and `edge-unsupported`
(flag-only). They stay inert when no fact-check ran, and under the hash organ
every verdict is indeterminate, so neither fires — the honest inert state.

## Honest seams (§10)

- **The boundary.** The check makes the talker faithful to the graph; it cannot
  make the graph faithful to the world. A wrong reading validates a talker claim
  grounded in that wrong reading. That is the boundary of a correspondence
  between two Meant structures, not a flaw to fix.
- **MiniLM, on two paths.** Relation correspondence needs meaning-distance to
  tell "located-in" from "owns"; coref corroboration needs it to confirm a merge
  on document-side nearness. Under the hash embedder both degrade to spelling, so
  the check returns indeterminate and coref proposals never corroborate. Honest,
  and inert until the meaning reader is wired.
- **Adjacency is a measured threshold**, tuned against the worked-example
  goldens, not a constant. Too loose passes "owns" against "holds"; too tight
  strips "lives in" against "located-in."
- **Contradiction depends on carved absences.** It fires only when the document
  carries an explicit VOID or an opposing edge. The current ingest emits no VOID
  events, so `graph.voids` is empty by default and contradiction degrades to
  unsupported — the gap between catching a false claim and merely failing to
  support it. VOID-carving at ingest is the precondition; `projectGraph` now
  collects `kind:'void'` events so the path is wireable the moment an emitter
  writes one.
- **Long-conversation drift is guarded, not eliminated.** The corroboration
  requirement and the subtract-and-check hold the line; surface the
  grounded-vs-conversational split in the audit so a human can see two people
  beginning to fuse before the guard's floor catches it.
