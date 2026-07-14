# the-web-organ-spec — open-web collapse: keep-criterion and witness

Status: ratified, implemented. Extends `the-work-v3-spec` and `docs/attestation-spec.md`. Binds to
`core/def.js` (§0), `core/verdicts.js`, `core/cut.js`, `metabolism/defscore.js` (§1),
`organs/in/web.js` + `organs/in/web-keep.js` (the organ), `turn/intake.js` (§10), and the attest
holon (`attest/frontier.js`, `attest/witness.js`, `attest/wayback.js`, `attest/custody.js`,
`attest/ladder.js`, `attest/anchor.js`) for §6.

## §0 — Scope

This specifies **one decision and its record**: when the surf encounters a span on the open web,
whether to *collapse* it (admit it to the append-only log, retain its bytes, witness it), and what
DEF that decision emits. It does not re-specify binding, reference, or the local surf/fold. The web
organ reuses that machinery; it adds an *intake grain* in front of it and a *provenance discipline*
behind it.

The governing constraint: **the keep decision is the highest-stakes same-vs-other cut in the
system.** It happens at the open web, against motivated adversaries, on material nobody vetted. If it
is a scalar threshold, `about≠says` has been re-inherited at the front door, where it is least
visible and most expensive. So the keep decision is a typed, witnessed, revisable DEF, on the same
terms as every other cut — and nothing about "the web is big" relaxes that.

## §1 — The keep decision is a DEF, not a threshold

`INTAKE` is a grain in `GRAINS` (`core/def.js`). An intake DEF is `makeDef({ verdict, grain: INTAKE,
of: <span address>, witness, t })`. `of` is the span's **address** (span-id: live URL + holon path +
byte range), not its text — addresses are cheap (~100 bytes), which lets a million passed-over spans
cost the space of a photograph. Bytes are retained only for `collapsed` outcomes (§4).

The verdict is not a truth-claim about the span's content. It is the span's *relation to the log* —
corroborate, contradict, or fail to connect. Truth-of-content is downstream. Intake rules only on
earning custody.

## §2 — The keep-criterion (the four gates + the MDL test)

Before the criterion runs, the **membrane** (the four gates) rejects or NULs a span: (1) we already
have it → a NUL; (2) it isn't salient → below candidacy; (3) we can't point to a source → no pin, do
not index; (4) we'd keep it for formatting → never, structure is stripped before any judgment and
before any model sees it, so magnitude is computed on content alone.

Past the membrane the criterion has three factors; the decision is a seeded sample over them.

**(a) Gross magnitude — salience.** Proximity, exact-string hits (case numbers, entity names),
nearness to kept spans, surprise. Decides whether the span is a *candidate*.

**(b) Explanatory gain — the MDL test.** Surprise is necessary but not sufficient: a typo is
maximally surprising and worthless. A candidate earns custody only if absorbing it *compresses the
rest of the corpus*, in both directions: `ΔL_back` (bits refunded re-encoding already-read,
**independently-sourced** spans given this one — retrodiction, a SYN move) + `ΔL_fwd` (bits saved
tightening the rolling prediction — the seed of a REC). Surprising-but-repaying-nothing is noise;
repaying-but-unsurprising is redundant; the keeper is both. **`ΔL_back` is model-free**: a span's
encode cost is its distinct content-token dictionary, and the bits saved co-encoding it with an
independent prior are the tokens they share, each weighted by rarity (idf) so a case number dominates
and a function word self-discounts. `ΔL_fwd` is measured upstream and passed in.

**(c) Phase — polarity.** Assert vs deny. Phase does **not** gate keeping; it decides reinforce
(corroborate) vs cancel (contradict), and feeds CONTESTED (§4).

**Combine:** `amplitude = magnitude modulated by explanatory-gain`, carrying phase. Then **sample, do
not threshold**: keep ~ `Bernoulli(|amplitude|_gross)` from a logged seed. The tail is sampled, so
misses are random and recoverable rather than structural and permanent; the seed is in the DEF so the
miss set is reproducible and cannot be quietly tuned. **Keep on gross magnitude, record phase
separately** — netting amplitude would vanish exactly the phase-cancelling pairs that are the
contested claims.

## §3 — The witness

The witness is the **decomposition**, not a scalar margin (`core/cut.js`): presence (NUL/SIG),
argument-sameness (INS), predicate/relation-strength (residual — the authored kernel, does not ground
on its own). It records the specific prior spans acted on (by address), the **ruled-out other** (the
strongest near-miss the collapse cut away — a DEF is well-witnessed only if it survived a
discriminating difference), and the provenance bundle (§6). A witness that names no specific prior
span is `MALFORMED` — the aboutness bug in the uniform of provenance.

## §4 — Verdicts and the four fates

| fate | bytes | DEF |
|---|---|---|
| **collapsed** | kept | intake DEF |
| **rejected** | none | DEF with a stated rejection reason |
| **encountered & passed** | none | frontier line (`address, amplitude, seed`) only — no DEF |
| **never reached** | — | not an event; the *boundary* is (§7) |

Verdict on a collapsed span (its relation to the log): `CORROBORATED` (aligned phase, positive
`ΔL_back` against **independent** priors, §5); `CONTRADICTED` (opposed phase against a kept span —
**this is a keep, not a drop**: a contradiction is a finding, retain and flag); `INDETERMINATE` (high
magnitude, decomposition stalled at predicate-strength — a surprising, unexplained-yet residual);
`OFF_DIAGONAL` (a Figure-grain claim asserted where the log holds only Void — the confabulation
shape; reject/flag).

**CONTESTED vs THIN**: large gross magnitude + heavy cancellation → `CONTESTED` (a story, surface it
loudly); small magnitude → `THIN` (nothing). Every retrieval system renders these two as the same
number; the intake DEF must not.

## §5 — "The past" is the independently-sourced log

`ΔL_back` (§2b) is computed only against spans whose **provenance lineage differs** from the
candidate's. A self-consistent propaganda stream predicts its own future perfectly and "explains"
only the record it itself seeded; scored against its own lineage it corroborates itself and the
criterion becomes a press-release amplifier. So: **no `CORROBORATED` intake whose corroborating spans
all share provenance lineage with the candidate** — that intake downgrades to `INDETERMINATE`. A
falsifier (§9), not a guideline.

## §6 — Provenance: two tiers, no keys

A collapse triggers provenance capture **at time of contact**. Two tiers.

**Tier 1 — witness (a neutral third party saw it), the no-key flow:** three public GETs, no
credential (see `docs/attestation-spec.md §4.1`). (1) Fire `GET web.archive.org/save/{url}`. (2) Poll
`GET archive.org/wayback/available?url={url}` until the fresh `archived_snapshots.closest` lands
(timestamp ≈ now). (3) Read the newest CDX row's `digest` for the bundle fingerprint. Then **verify
the collapsed span is present in the returned capture** — a 200 that does not contain the paragraph
is provenance that looks like provenance and isn't (the one failure this project is against); on
verify-fail, flag `WITNESS_INCOMPLETE`, never silently ship. Rate limits are real: a 429 is
retry-later, never a failure. The keyed SPN2 job path still works for a credential holder but is not
required.

**Tier 2 — anchor (no one to subpoena):** hash the bytes *you actually read* (not the snapshot — live
pages skew, and a divergence between your hash and the capture is itself a logged finding);
OpenTimestamps the hash. Tier 2 does not depend on trusting IA at all.

**Only collapsed spans are archived.** Passed spans get an address + amplitude + seed, no save call.
This bounds archive traffic to the few-thousand-span budget and keeps the organ laptop-scale.

## §7 — Seed policy (the intake distribution)

A link-seeded gate goes confidently wrong: the link graph is a census of what someone *wanted* found.
Two defenses, as line items: **fund the anomaly** (a defended, seeded keep-rate for low-magnitude /
high-surprise spans the model argues against — raised by the sampler's exploration temperature); and
**seed from the unlinked** (court dockets, FOIA logs, bulk filings — sources nothing points at). The
boundary (seeds, domains, depth, date-range) is declared and logged as the **envelope**, so a null
result reads "outside my boundary", never "does not exist".

## §8 — Invariants

1. **Base case:** no intake ships `CORROBORATED` unless its decomposition terminates in grounded cuts
   (Invariant B1, `core/cut.js`).
2. **Gross-keep:** the gate reads gross magnitude; phase cancellation never removes a span from
   custody.
3. **Independence:** no `CORROBORATED` intake corroborated only by same-lineage sources (§5).
4. **Provenance-integrity:** every collapsed span's capture contains the span, or its provenance is
   `WITNESS_INCOMPLETE` (§6).
5. **Reproducibility:** re-running the surf with the logged seed reproduces the keep/pass partition.

## §9 — Acceptance / falsifiers

Each a test in `tests/web-organ.test.js`: **F-prov** (a capture not containing the span →
`WITNESS_INCOMPLETE`); **F-indep** (no `CORROBORATED` intake violates §5); **F-anomaly** (the anomaly
keep-rate is nonzero and rises with temperature, §7); **F-seed** (re-run with the logged seed
reproduces the partition, §8.5); **F-contested** (a planted contradicting pair surfaces `CONTESTED`,
not summed into "widely covered"). `metabolism/defscore.js` grades the `INTAKE` grain automatically
(the scorer is grain-agnostic), so confident-wrong and overturn rates track intake with no change.

## §10 — As built

- `core/def.js`: `INTAKE` added to `GRAINS`. No change to `makeDef`/`project`.
- `organs/in/web.js` (the organ) + `organs/in/web-keep.js` (the keep-criterion + witness): the four
  gates, the MDL gain, the seeded sample (reusing `attest/frontier.js` `classify`), the sub-cut
  witness (`core/cut.js`), source-independence, the verdict, the four fates, and the provenance
  bundle. Amplitude components are computed upstream (`surfer/salience.js`) and passed in, pure.
- `turn/intake.js`: `recordIntakeDefs(log, decisions, { provenanceFor })` — the pure fold of the
  organ's decisions onto the judgment log (a sibling of `turn/judgments.js`, kept separate only
  because that file is at its size-ratchet pin).
- `attest/wayback.js` + `attest/witness.js`: the no-key Availability flow (§6 tier 1), with the queue
  driving it by default. `attest/custody.js` (tier 2 hash), `attest/ladder.js` (span-verify),
  `attest/anchor.js` (Merkle + OpenTimestamps) are reused unchanged.

## Open questions

- **`ΔL` estimator.** The shipped `ΔL_back` is an idf-weighted shared-content-token proxy (model-free,
  auditable). A entropy-coder length-delta on the kept-span set would be more principled; the proxy is
  the defensible floor.
- **Anomaly budget size** — fixed fraction, or adaptive to how link-heavy the seed set is.
- **OTS batching** — one receipt per collapse is wasteful; batch per surf-session Merkle root
  (`attest/anchor.js` already builds the root) and store the inclusion path.
