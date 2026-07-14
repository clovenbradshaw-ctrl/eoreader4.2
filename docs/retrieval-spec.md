# eoreader4.2 — Retrieval Spec

**Status:** proposal, v0.1
**Scope:** how every source gets embedded, how retrieval is used, and why the embedding never enters the ledger.

> **In this repo.** This is the design of record for the pinned, cross-corpus retrieval
> index. The first two build-order assemblies have landed as pure, tested modules under
> `src/surfer/retrieve/`: **span addressing + pinning** (§5) in `pin.js`
> (`tests/retrieval-pin.test.js`) and **RRF fusion** (§4) in `rrf.js`
> (`tests/retrieval-rrf.test.js`). They stand alone — neither is wired into the live
> per-document retriever (`hybrid.js`), which keeps its own noisy-OR score fuse for the
> single-doc path — exactly the swappability §2 requires. Everything else below is
> proposal.

---

## 0. The one-sentence version

> **The index is a fast search tool. The tape is the truth.**

Embeddings find candidates. EOT carries provenance. These are separate systems and they must stay separate. Every design decision below follows from that sentence, and any future change that blurs it is a spec violation.

---

## 1. What the retriever is, and what it is not

The retriever answers exactly one question:

> *Which spans of which sources are worth looking at for this query?*

It returns **span addresses ranked by score**. It does not return content, does not return claims, and does not return summaries. It is a card catalog, not a book.

| The retriever IS | The retriever is NOT |
|---|---|
| A ranked list of pointers | A source of facts |
| Approximate, lossy, revisable | Evidence |
| Fast | Authoritative |
| A convenience | A dependency of correctness |

**The load-bearing consequence:** if the entire vector index were deleted, every claim in the ledger would still be reproducible from the tape alone. Retrieval is an accelerator on a path that must remain walkable without it. If deleting the index would break a claim, the claim was wrong.

### 1.1 Why this line matters more here than elsewhere

The standard RAG failure mode: retrieve chunk → model summarizes → summary drifts from chunk → citation stays attached. The citation now makes the drift look *verified*. That is epistemic stripping wearing a provenance badge, and it is worse than no citation at all, because it launders a fabrication through the machinery built to prevent fabrication.

A cosine score is not a warrant. Nothing may be asserted because it scored 0.87.

---

## 2. Architecture

```
                    ┌─────────────────────────────┐
   query ──────────▶│         RETRIEVER           │  ephemeral, rebuildable,
                    │  lexical (BM25) + dense     │  never cited, never in the tape
                    │  fused → ranked span IDs    │
                    └──────────────┬──────────────┘
                                   │  span IDs only
                                   ▼
                    ┌─────────────────────────────┐
                    │      SPAN RESOLVER          │  span ID → exact bytes
                    │  reads the tape, not the    │  from the pinned source
                    │  index                      │
                    └──────────────┬──────────────┘
                                   │  spans (verbatim)
                                   ▼
                    ┌─────────────────────────────┐
                    │       FOLD KERNEL           │  DEF/EVA/REC
                    │  proposes → validates →     │  holons enter the tape
                    │  admits or discards (typed) │
                    └─────────────────────────────┘
```

The one-way valve is between the retriever and the resolver. **Span IDs cross. Scores and vectors do not.** By the time content reaches the kernel, it is verbatim bytes from a pinned source, and the kernel cannot tell — and must not be able to tell — whether the span arrived by embedding, by lexical match, or because a human typed the address by hand.

This is what makes the retriever swappable. Change the embedding model, change the fusion weights, drop dense retrieval entirely — the ledger is unaffected, because the ledger never saw any of it.

---

## 3. The segment is the unit of everything

**Do not use a sliding token window.** A 512-token window with 50-token overlap produces chunks that straddle section boundaries, split tables from their headers, and orphan the sentence that names the subject. In a provenance-first system the chunk *is* the unit of citation, so an arbitrary chunk boundary is an arbitrary citation boundary, and your citations become mush.

**Embed SEG output.** The segmenter already draws boundaries where the document draws them: sections, clauses, table rows, docket entries, speaker turns. Those boundaries are semantically meaningful because a human author put them there.

```
NUL → SIG → INS → SEG → [embed here] → CON → SYN → DEF → EVA → REC
                   │
                   └── the segment is already a bounded, addressable,
                       provenance-bearing unit. Embed it as-is.
```

Consequences of embedding SEG output rather than windows:

- **Every vector already has a holon path.** No separate chunk→source mapping table to maintain and desynchronize.
- **Retrieval returns holons, not byte ranges.** A hit is already a citable thing.
- **Segmentation improvements improve retrieval for free**, and vice versa — one boundary system, not two.
- **The `!SEG` escape becomes a retrieval-tuning knob.** If a source retrieves badly, the fix is usually the segmentation, not the embedding.

### 3.1 Segments that are too small

Some SEG output is too short to embed usefully (a table cell, a date, a two-word docket status). Rule: **embed the segment with its ancestors' headers prepended as context, but pin the span to the segment alone.**

```
embed_text = ancestor_headers.join(" › ") + "\n\n" + segment.text
span_id    = segment.holon_path          # NOT the concatenation
```

The context improves the vector. The span stays precise. This is the single highest-leverage trick in the spec and it costs nothing.

---

## 4. Hybrid retrieval is mandatory

**Dense-only retrieval would be a downgrade on this corpus.** Embeddings are known-bad at rare literals — and this corpus is *made of* rare literals:

- case numbers (`23CV-4471`)
- parcel IDs
- LLC names (`Ridgetop Holdings II, LLC`)
- statute cites (`T.C.A. § 66-28-505`)
- dollar figures
- badge numbers, contract numbers, permit numbers

A dense retriever will cheerfully return something semantically adjacent to `23CV-4471` and miss `23CV-4471`. This is not a tuning problem; it is what dense vectors are.

Meanwhile lexical retrieval misses the thing embeddings are for: *surveillance vendor* not matching "public safety technology solutions"; *displacement* not matching "relocation of unsheltered individuals." That is the synonymy hole the modelless read path leaves open, and it is the actual reason to do any of this.

**Therefore: two retrievers, fused.**

| Channel | Strength | Weakness |
|---|---|---|
| Lexical (BM25) | Exact literals, names, numbers, quoted phrases | Synonymy, paraphrase, concept-level queries |
| Dense (embeddings) | Synonymy, paraphrase, "things like this" | Rare literals, negation, exact match |

Fuse with **Reciprocal Rank Fusion** — no score normalization, no tuning, ~15 lines:

```js
// k = 60 is the standard constant; it is not sensitive
function rrf(rankings, k = 60) {
  const scores = new Map();
  for (const ranking of rankings) {
    ranking.forEach((spanId, i) => {
      scores.set(spanId, (scores.get(spanId) ?? 0) + 1 / (k + i + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([spanId]) => spanId);
}
```

RRF is chosen deliberately over weighted score blending: it needs no calibration, it is robust to one channel returning garbage, and it has no hyperparameter anyone will be tempted to tune on a hunch. **Do not replace it with a learned reranker without a written justification** — a reranker is a model whose judgment enters the retrieval path, and it must then be versioned and pinned like any other model (§6).

> **Implemented** in `src/surfer/retrieve/rrf.js` (`rrf`, `rrfScored`, `RRF_K`). `rrf`
> returns bare span IDs so no score can cross the boundary (§9 step 7); a search UI that
> wants the number calls `rrfScored`. This is kept distinct from `hybrid.js`'s per-document
> noisy-OR, which fuses two channels' *scores* on a single loaded doc; RRF is the
> index-layer fuse across the cross-corpus span index, where only ranks are comparable.

> A reranking refinement — **Born-centered candidate weighting** — is specified in §14. It
> suppresses *non-meaningful* similarity (a shared surname, a shared literal prefix: the
> Louis-vs-Neil-Armstrong case) that survives fusion as a flat high spread. Like RRF it sits
> on the ordering side of the firewall and emits ranking only.

---

## 5. Source pinning — the provenance contract

Every embedded span carries an immutable address. **The address, not the text, is what the ledger cites.**

```
span_id := <source_uri>@<revision>#<holon_path>[<byte_start>:<byte_end>]
```

Source URIs by class:

| Source class | URI form | Revision pin |
|---|---|---|
| Local document | `sha256:<digest>` | The digest **is** the revision |
| Wikipedia | `enwiki:<Title>` | `@oldid=<N>` |
| Web page | `https://…` | `@<capture_sha256>` — you must archive it |
| Scraped record | `caselink:<case_no>` | `@<fetch_ts>+<row_sha256>` |
| Email / Matrix | `matrix:<event_id>` | Event IDs are already immutable |

**Rules:**

1. **No span without a pin.** A span whose source cannot be pinned to an immutable revision cannot be embedded. If you can't cite it stably, don't index it.
2. **Content-addressed where possible.** For local documents, the SHA-256 of the bytes *is* the identity. Rename the file, move it, mirror it — the span still resolves.
3. **Remote content requires the revision, not the URL.** `enwiki:Fusus` is a moving target. `enwiki:Fusus@oldid=1194837261` is a fact. Wikipedia serves pinned revisions natively; this is what makes remote content replayable, and it is the *only* thing that does.
4. **Web pages must be captured, not linked.** A bare URL is not a pin — the page will change or die. Archive the bytes, hash them, pin to the hash. The URL becomes metadata.

> **Implemented** in `src/surfer/retrieve/pin.js`: `formatSpanId` / `parseSpanId` (the
> grammar, parsed right-to-left so `@`/`#` inside a URI can't fool it), one minter per
> source class (`localSource`, `wikiSource`, `webSource`, `scrapeSource`, `matrixSource`),
> `spanId` to compose, and content addressing (`sha256Hex`, `pinLocalDoc`). Minting throws
> on a missing uri or holon path (rule 1, fail loud); parsing degrades to `null` (fail safe).

### 5.1 Verification on resolve

The span resolver **re-hashes on every resolve** and compares to the pin. On mismatch:

```
!SIG span.<id>.integrity = "mismatch"
```

The span is flagged, the discard is typed, and the claim depending on it is marked unverified. It is not silently dropped and it is not silently used. A source that changed under you is *information*, and on this beat it may be the story.

> **Implemented** as `verifyOnResolve` in `pin.js`, returning a typed verdict —
> `match` / `mismatch` / `immutable` (remote/event-pinned, nothing local to re-hash) /
> `unpinned` — and, on mismatch, the exact `!SIG span.<id>.integrity = "mismatch"` line.
> It never throws on a changed source; a changed source is information, returned not raised.

---

## 6. The embedding model enters the provenance chain

Embedding requires a model. This does **not** violate the modelless read path — the model runs at *lookup* time, on the query and on the corpus at index time, never inside extraction. The kernel still cannot see it. But it has consequences that must be recorded:

```yaml
index_manifest:
  model:        "bge-small-en-v1.5"
  model_sha256: "…"
  dim:          384
  quantization: "int8"          # see §7
  pooling:      "cls"
  normalize:    true
  segmenter:    "eo-seg@0.4.2"  # SEG version — changes chunking
  built_at:     "2026-07-14T…"
  span_count:   1483920
```

**Rules:**

1. **The manifest is content-addressed and stored with the index.** Not alongside it, not in a README — in it.
2. **A model change is a full re-index.** Vectors from two models are not comparable. There is no migration path; there is only rebuild.
3. **The manifest hash appears in any replay bundle**, so a reader can tell that a retrieval was performed under model X. It does not appear in the *claim*, because the claim does not depend on the model (§1). It appears so that "why did this span surface and not that one" is answerable.

---

## 7. Storage

### 7.1 Vector index

| Config | Bytes/vector (384-dim) | 1.5M spans |
|---|---|---|
| float32 | 1536 | 2.3 GB |
| **int8 (scalar quant)** | **384** | **576 MB** |
| PQ (64 subvectors) | 64 | 96 MB |

**Ship int8.** Scalar quantization costs ~1–2% recall and cuts storage 4×. PQ is a further 6× but loses enough recall to matter on a corpus where a missed document is a missed story. Revisit only if storage becomes the binding constraint.

Over-fetch and rescore: retrieve top-100 on quantized vectors, rescore the top-100 against float32 vectors held only for those hits. Recovers nearly all the quantization loss at trivial cost. (This requires keeping float32 vectors on disk — they are cold, they never load into memory, budget the disk.)

### 7.2 Substrate

OPFS, accessed through `createSyncAccessHandle` in a Worker. This matches the existing EO///DB materialized-view pattern.

```
/opfs/eoreader/index/
  manifest.json           # §6, content-addressed
  vectors.i8              # flat int8 array, span_ordinal-addressed
  vectors.f32             # cold, rescore-only
  spans.idx               # span_ordinal → span_id (§5), front-coded
  hnsw.bin                # ANN graph  (see 7.3)
  bm25/
    postings.bin          # block-compressed
    terms.fst             # front-coded term dictionary
```

**Quota discipline:**

- `navigator.storage.estimate()` before build; refuse to start if headroom is short.
- `navigator.storage.persist()` after build.
- **Eviction is all-or-nothing** — if the origin is evicted, OPFS goes with everything else. The index must therefore be *reconstructible from the tape*, and reconstruction must be a background job, not a modal error. Design for the index vanishing. It is a cache.
- iOS Safari will evict most aggressively. Assume it will happen.

### 7.3 ANN

Under ~200k spans, brute-force cosine over int8 is fast enough in a Worker (single-digit ms) and has zero build cost, zero index corruption modes, and perfect recall. **Do not build an HNSW you do not need.**

Above ~200k spans, HNSW (`M=16`, `efConstruction=200`, `efSearch=64`). Build in a Worker, checkpointed, resumable.

---

## 8. Indexing pipeline

Runs on the client. This is the correct place for it: these are *the user's documents*, they must not leave the machine, and unlike a public Wikipedia pack (which is a deterministic function of a public dump and should be built once and distributed), a private corpus is per-user by definition.

```
for each source:
  1. INS   — mint the source holon; compute the pin (§5)
  2. SEG   — segment (existing operator; no new machinery)
  3. for each segment:
       a. build embed_text = ancestor headers + segment text  (§3.1)
       b. embed → vector
       c. tokenize → BM25 postings
       d. write (span_id, ordinal, vector, postings)
  4. !EVA  — checkpoint: every span resolves, every pin verifies
```

**Incremental by default.** A new document indexes only itself. Re-segmentation of one document re-embeds only that document. The manifest tracks per-source `(pin, segmenter_version, model_version)`; anything stale re-indexes lazily on next touch.

**Never block the UI.** Indexing is a Worker job with a progress surface and a cancel. A half-built index is usable — it just has lower recall, which is exactly the failure mode you want.

---

## 9. Query path

```
1. Query arrives as text.
2. Embed the query (same model, same pooling, same normalization).
3. Dense: ANN → top-100 span ordinals.
4. Lexical: BM25 → top-100 span ordinals.
5. Fuse: RRF → ranked span IDs.                        (§4)
6. Resolve: span ID → verbatim bytes from pinned source. (§5)
7. Hand spans to the kernel. Discard scores.             (§2)
```

> **Optional refinement (§14).** Between fuse (5) and resolve (6), *Born-centered reranking*
> may re-weight the fused candidates to damp non-meaningful similarity — the namesake case,
> where a shared surname or literal leaves a real but meaningless score. It changes the order
> spans arrive in; it does not touch step 7 — the weight is still discarded, and the span
> still crosses as verbatim bytes.

**Step 7 is the spec.** The score is used for ordering and then thrown away. It does not travel with the span. It is not shown next to a claim. It is not stored in the ledger. A user may see it in a search UI — that is a search UI, and it is fine — but it never crosses into the tape.

### 9.1 Recall, not precision, is the retrieval objective

The kernel is the precision filter. Retrieval's job is to *not miss things*. Set `k` generously (50–100 spans into the fold, not 5). The classic RAG instinct — retrieve 3 chunks, stuff a context window — is optimizing for a token budget you do not have, because you are not stuffing a context window. You are handing candidates to a validator.

**A missed document is a missed story. A spurious candidate is a discard line.** These costs are not symmetric. Tune accordingly.

---

## 10. The EOT layer

Retrieval produces candidates. EOT records what happened to them. Every retrieval is itself an event in the tape — *that a search was run*, with what query, returning what spans — because on an investigative beat, **what you looked for is part of the record of how you know.**

```eot
# ── assembly 1: the source ──────────────────────────────────────
src_ndp_2025 : source
src_ndp_2025.uri = "sha256:9f2a…c41b"
src_ndp_2025.title = "NDP Board Minutes 2025-03-11"
src_ndp_2025.acquired = "2026-04-02"
src_ndp_2025.contract.ops = NUL, SIG, INS, SEG
src_ndp_2025.contract.terrains = Entity, Kind
src_ndp_2025.contract.stances = Making, Dissecting, Binding
!EVA src_ndp_2025

# ── assembly 2: the retrieval event ─────────────────────────────
# A search is a Lens: one reading applied to one situation.
q_0117 : query
q_0117.text = "camera network cost sharing"
q_0117.index = "manifest:sha256:4d1e…"     # §6 — which index answered
q_0117.k = 100
!EVA q_0117                                 # EVA(Lens, Dissecting)

# ── assembly 3: the candidates ──────────────────────────────────
# CON binds a span to the query that surfaced it. This is the ONLY
# place a retrieval score is permitted to appear, and it is an
# attribute of the LINK, never of the span or the claim.
q_0117 -> src_ndp_2025#sec-4.para-2
q_0117 -> src_ndp_2025#sec-7.para-1
q_0117 -> src_axon_rfp#sec-2.para-9
!EVA q_0117                                 # CON(Link, Binding)

# ── assembly 4: the fold ────────────────────────────────────────
# The span becomes a claim only by passing the kernel. The claim
# cites the SPAN, not the query. Sever the retrieval and the claim
# still stands — this is §1 made mechanical.
c_0042 : claim
c_0042.span = src_ndp_2025#sec-4.para-2
c_0042.text = "…"                           # verbatim; not a paraphrase
c_0042.contract.ops = NUL, DEF, CON
c_0042.contract.terrains = Entity, Lens
c_0042.contract.stances = Binding, Dissecting
!EVA c_0042                                 # DEF(Lens, Making)

# ── assembly 5: the typed discard ───────────────────────────────
# Spans that surfaced but did not survive are logged, not deleted.
# Coverage is meaningless without them.
!SIG q_0117.discarded.src_axon_rfp#sec-2.para-9 = "off-topic"
!SIG q_0117.discarded.src_ndp_2025#sec-7.para-1 = "duplicate-of:c_0042"
!EVA q_0117
```

**Read assembly 4 carefully.** `c_0042.span` points at the source. It does *not* point at `q_0117`. The query is how the span was *found*; the span is why the claim is *true*. Delete every query holon in the tape and no claim loses its warrant. That is the whole architecture in one line of EOT.

### 10.1 What the discard log buys

Accountable-loss extraction promises coverage, provenance, typed discard, replay. Retrieval threatens exactly one of those: **coverage**, because a span the retriever never surfaced is a span you never knew to discard — an absence that leaves no trace.

Partial mitigations, in order of cost:

1. **Log the query, k, and index hash** (§10, assembly 2). At minimum a reader knows what net was cast.
2. **Log the recall tail.** Record spans ranked k+1…k+20 as `not_reached`. It doesn't prove nothing was missed, but it shows where the cutoff fell.
3. **Ablation on demand.** Re-run with lexical-only, dense-only, and k×5. Diff the candidate sets. This is the only instrument that actually measures what retrieval hid from you, and it should be a button, not a research project.

**Be honest in the docs about what remains unmeasurable.** A missed span is an unknown unknown, and no ledger entry fixes that. This is the residual risk of using retrieval at all, and the reason for §9.1 (over-fetch aggressively) and for keeping a lexical channel that never lies about exact strings.

---

## 11. Wikipedia and Gutenberg, specifically

Both are **optional external sources indexed through the exact same pipeline**. No special-casing. No separate architecture. If they need special machinery, that is evidence they don't belong.

**Wikipedia** — index lead sections of a bounded, chosen subset (background concepts relevant to the beat: surveillance technology, municipal finance, housing law), pinned by `oldid`, content fetched on demand from the pinned revision rather than stored. Value: background definitions and entity typing. **Limit:** the entities that matter — local officials, vendor LLCs, Metro departments, BID boards — are *not in Wikipedia*, so it contributes background and nothing else. Do not expect it to help with the beat. Its most defensible use is as a **load test**: it is a large, free, well-structured corpus for validating the pipeline at scale before pointing it at documents that matter.

**Gutenberg** — no retrieval use. It contains nothing true and nothing local. Its only defensible use is as a **segmentation and long-range-coherence test corpus** for SEG and the walk. That is a dev asset. It does not ship.

Neither is a reason to build any of the above. The reason to build the above is *your own documents*, and both of these are downstream conveniences at best.

---

## 12. Failure modes to design against

| Failure | Mechanism that prevents it |
|---|---|
| Summary drifts from source, citation stays attached | Kernel only ever receives verbatim spans (§2). No summarization at the retrieval boundary. |
| A score becomes a warrant | Scores discarded at step 7 (§9). Score may attach only to a `query -> span` link (§10), never to a claim. |
| Index rot silently degrades recall | Manifest tracks segmenter + model version per source (§8); stale sources re-index lazily. |
| Source changed under you | Re-hash on resolve; `!SIG` the mismatch (§5.1). Never silently drop, never silently use. |
| Eviction destroys the index | Index is a cache, reconstructible from the tape (§7.2). Never load-bearing. |
| Dense retrieval misses an exact case number | Lexical channel, always on, fused (§4). Non-negotiable. |
| Retrieval hides something and no one knows | Log query + k + index hash + recall tail; ablation button (§10.1). Partial, and documented as partial. |
| Non-meaningful similarity surfaces a namesake (Louis vs Neil Armstrong) | Born-centered reranking damps the shared baseline before the fold (§14); the contested-surname guard prevents the merge if it reaches the fold anyway (`summary-cross.js`, `entity-merge.js`). |
| The retriever becomes an epistemic authority | §1. Reread it. |

---

## 13. Build order

Watchmaker's way — each assembly stands alone, checkpointed, before the next begins.

1. **Span addressing + pinning** (§5). No embeddings yet. Just prove every SEG output has a stable, resolvable, verifiable address. **This is the assembly that matters; everything else is optimization.** If pinning is wrong, nothing downstream can be fixed. — *landed: `src/surfer/retrieve/pin.js`.*
2. **BM25 over spans.** Lexical only. Ship it. It is immediately useful and it is the channel that never lies about exact strings.
3. **Embedding + brute-force cosine.** No ANN. Prove hybrid beats lexical on your actual queries. If it doesn't, stop here and you've lost a week.
4. **RRF fusion** (§4). Fifteen lines. — *landed: `src/surfer/retrieve/rrf.js`.*
5. **EOT retrieval events + typed discard** (§10). The provenance layer.
6. **int8 quantization + rescore** (§7.1). Only when storage bites.
7. **HNSW** (§7.3). Only above ~200k spans.
8. **Wikipedia subset** (§11). Only if 1–7 are boring and stable.

Steps 1–4 are a week of work and deliver most of the value. Steps 6–8 are optimizations for a scale you may not reach. **Do not start at 8.**

> **Refinement, not a stage.** Born-centered reranking (§14) is not a numbered assembly — it
> needs a fused candidate list to center, so it slots *after* step 4, a query-path refinement
> rather than a new channel. Ship its scalar form with an Armstrong fixture; hold the per-cell
> and interference variants behind a Probe A/B pass on the live corpus.

---

## 14. Born-centered reranking — suppressing non-meaningful similarity

**Status:** proposal, v0.1. A query-path refinement that sits between fusion (§4, §9 step 5) and resolve (§9 step 6). It reuses the Born measure already in the tree (`src/weave/chorus/born.js`); it adds no new model and no new ledger surface. Its entire job is to change *which* candidates reach the fold, never *what they say*.

> **The one-sentence version.** Square the *centered* candidate scores, not the raw ones — the shared baseline that makes a namesake look retrievable is exactly the mean, and centering squares it away.

### 14.1 The failure: a flat spread of plausible matches

Fusion (§4) answers "which spans rank high for this query." On a corpus with namesakes it answers badly, and it answers badly in a specific, measurable shape.

Take a query about **Louis Armstrong the trumpeter** over a corpus that also holds **Neil Armstrong**. Both clusters share a large component: the surname surface token (a lexical hit for *both*) and the generic biographical register (a dense hit for *both*). The fused scores come back as a **flat high spread** — Louis spans near 0.7, Neil spans near 0.6 — and the linear top-`k` `hybrid.js` currently takes hands the fold a mix of the two. The overlap driving Neil into the results is the *name*, not the *sense*. That is non-meaningful similarity: a real number the retriever cannot distinguish from a real signal.

The general form: a dense embedding has a large shared component (every span is somewhat similar to every query), and a lexical hit on a shared literal — a surname, a case-number prefix, an LLC stem — adds a second shared component. Neither is discriminative. **A linear ranking cannot separate the shared baseline from the discriminative lift**, because linear scaling preserves their ratio.

### 14.2 The move: center, then square

The Born measure (`weave/chorus/born.js`) is already *"square the signed amplitudes, normalize to sum one"* (`bornWeights`). Squaring suppresses weak projections **quadratically** — the signal-from-noise step, and the reason the module says "Born" and not "use the scores."

But **Born on raw scores does not fix Armstrong**, and the chorus module already says why. From `centeredAmplitudes`:

> *the RAW cosines … are all large-and-positive too: squaring them does not concentrate.*

Squaring a flat-high spread yields a flatter spread; both Armstrongs stay in. The fix, imported wholesale from the same module, is to **center first**:

1. Subtract the pool mean from every candidate's fused score → a **signed residual**: the lift each span carries *above (or below) the average candidate*.
2. `bornWeights` the residuals: square, sum, divide.

Now the shared baseline is the mean, sitting at zero; squaring annihilates it. Only distinctive lift survives to carry mass.

Applied to Armstrong: the "Armstrong + biography" mass that both clusters share **is** the baseline → it is the mean → it is gone. What remains is the trumpet/jazz axis (a positive residual for the query's sense) against the Moon/NASA axis (a negative residual). Squared and normalized, the mass concentrates on the queried sense; the namesake sinks toward zero weight. It sinks not because a name rule fired, but because it was never *distinctively* about the query — the geometry says so on its own.

Two grains, both legitimate:

| Grain | What baseline it removes | Cost | Status |
|---|---|---|---|
| **Scalar-pool** | "every candidate scored ~0.6" | a pure function over the fused list; model-free | **v1, shippable** |
| **Per-cell** | the biographical register itself (via `cubeAmplitudes` over the 27 centroids, centered against the query's own reading) | needs the meaning organ warm | proposal |

Scalar-pool centering ships first: it is a pure re-weighting placed just before `hybrid.js`'s final sort, and it needs nothing the retriever does not already hold.

### 14.3 The firewall still holds

This is an **ordering** operation and nothing more. It re-weights which spans reach the fold; the Born weight is discarded with every other score at **§9 step 7**. It never attaches to a claim, never enters the ledger, never becomes a warrant. Delete the reranker and every claim still stands (§1). The moment Born-reranking changed *what a span says* rather than *whether it is looked at*, it would be a §2 violation — the same line RRF lives on.

It **composes with, and does not replace,** the two namesake guards already in the tree:

- **`applyTopicPrior`** (`src/surfer/retrieve/hybrid.js`) damps a span by its *named-referent graph membership* — symbolic, and it needs entities already resolved. Born-centering is **geometric** and runs *before* coref, so it catches the wrong-sense span even where no full name is present to disambiguate. Order them: Born-center first (shape the field), then topic-prior (bias toward the resolved subject). Both are multipliers, both degrade-never-fail.
- **The contested-surname defeat** (`summary-cross.js` `corefCollapseReport`, `entity-merge.js`, PR #196) prevents two Armstrongs from *merging* once both are in the fold. Born-centering lowers the odds the wrong one reaches the fold at all. One geometric prior at retrieval, one symbolic guard at merge — belt and suspenders, aimed at the same failure from opposite ends.

### 14.4 Interference — the deeper reading (proposal, gated)

`born.js` keeps the sign all the way to the square precisely so **Probe B** (`weave/chorus/probe.js`) can see cross-span cancellation. In retrieval terms: sum the candidates' signed per-cell residuals *coherently* (sum then square) against *incoherently* (square then sum); where the two disagree, the pool holds **two senses that cancel**. A candidate whose signed residual opposes the pool's dominant, query-aligned direction on the discriminative cells is a namesake even when its scalar score is high — destructive interference is the namesake made arithmetic.

This "interference guard" earns its physics vocabulary only if Probe B actually passes on the live corpus. Per the chorus discipline: *do not weld the cheap win to the big claim.* v1 ships the scalar rerank (14.2) and leaves the interference guard behind the gate.

### 14.5 Degrade-never-fail

A no-op, byte-identical, whenever it cannot help: the embedder is cold (no dense channel — `semantic.js` gates on `isWarm`, so there is no meaning to center), the candidate pool is ≤ 1, or every residual is zero (`bornWeights` returns an honest all-zero, never a fabricated uniform). A cold model turns *this refinement* off; it never turns *retrieval* off. The linear ranking is always the floor.

### 14.6 Acceptance test

A **Louis / Neil Armstrong fixture**: a candidate pool drawn from both, a query leaning to one sense. Assert that after Born-centering the queried sense holds a strict majority of the top-`k`, and the namesake's best span falls below the activation floor `reserveBySource` (`hybrid.js`) uses. Run it as an **ablation** — linear ranking vs Born-centered, diff the candidate sets — which is exactly the §10.1 instrument pointed at this refinement.

**Honesty clause.** This sharpens a *distribution*; it cannot manufacture a signal that is not in the geometry. If two senses are genuinely inseparable in the embedding — a source that discusses both Armstrongs in one breath — centering yields a flat partition and the reranker correctly does nothing. The contested-surname guard downstream is then the load-bearing defense, not this. Say so; a reranker that claimed to fix the inseparable case would be laundering a name rule through arithmetic.

### 14.7 Where it slots

Not a numbered assembly (§13): it needs a fused candidate list to center, so it cannot precede fusion, and it is a refinement of the query path rather than a new channel. Ship the scalar form (14.2) with the Armstrong fixture (14.6) once RRF (§13 step 4) is stable; hold per-cell centering (14.2) and the interference guard (14.4) behind a Probe A/B pass on the live corpus.

---

## Appendix: the sentence again

> **The index is a fast search tool. The tape is the truth.**

If a future change makes a claim depend on a vector, the change is wrong.
