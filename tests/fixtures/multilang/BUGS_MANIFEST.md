# BUGS_MANIFEST.md — ground truth (multi-language set)

Three matched pairs, each in a different language and domain, each with a
clean reference and a structurally parallel buggy twin. Every planted
defect is **idiomatic to its language** — the failure modes differ across
the three files rather than being one bug list re-skinned.

| Pair | Clean | Buggy | Domain |
|------|-------|-------|--------|
| JavaScript / Node | `claims_clean.js` | `claims_buggy.js` | Provenance claims publishing pipeline |
| Go | `poller_clean.go` | `poller_buggy.go` | Concurrent docket poller / worker pool |
| Rust | `indexer_clean.rs` | `indexer_buggy.rs` | Document tokenizer / term indexer |

All six files were verified: clean files run correctly; buggy files still
**compile/parse** (defects are behavioral, not type errors), so nothing is
catchable by a syntax pass alone. The only non-bug difference within a
pair is the module docstring wording — a detector that flags that is a
false positive.

Verification commands used:
- JS: `node --check` (both parse); `node claims_clean.js` runs clean.
- Go: `go build ./...` (both build); `go vet ./...` — see baseline note below.
- Rust: `rustc --edition 2021` (both compile); `indexer_clean` runs clean.

**Linter baseline:** `go vet` catches exactly ONE of the six Go defects
(G2, the unchecked-error deref) and none of the other five. `node --check`
and `rustc` (without clippy) catch zero. This is a useful floor to score
the system under test against.

---

## JavaScript — `claims_buggy.js` (6 defects)

| # | Category | Function | Line | What's wrong | Symptom |
|---|----------|----------|------|--------------|---------|
| JS1 | Off-by-one loop bound | `loadClaims` | 65 | `i <= lines.length` reads `lines[length]` = `undefined` | `parseClaimLine` calls `undefined.trim()` → `TypeError`, load aborts |
| JS2 | Unguarded `JSON.parse` | `parseClaimLine` | 49 | `JSON.parse` with no `try/catch` | One malformed line throws uncaught and kills the whole batch |
| JS3 | Default `sort()` (no comparator) | `rankClaims` | 128 | `copy.sort()` compares **string** forms; objects all stringify to `"[object Object]"`, so the sort is a no-op, then `reverse()` | Output is not ranked by score — silently mis-ordered |
| JS4 | `var` closure capture | `buildIndex` | 139 | `for (var i …)`; every `accessor` closes over the same `i` (final value = length) | Each thunk reads `claims[length]` → `undefined`; all accessors return the same broken value |
| JS5 | Assignment in condition | `truncateBatch` | 154 | `if (claims.length = 0)` assigns instead of `===`; truncates the array and is falsy | Guard never returns early **and** destroys the batch → always empty downstream |
| JS6 | Unawaited `forEach(async)` | `publishAll` | 190 | `claims.forEach(async …)` fires promises nobody awaits | Returns `urls` (empty) before any archive resolves; rejections vanish |

Clean fixes: `i < lines.length`; wrap parse in `try/catch`;
`sort((a,b)=>b.score-a.score)`; `let i` + capture the claim;
`=== 0`; `await Promise.all(claims.map(archiveOne))`.

---

## Go — `poller_buggy.go` (6 defects)

| # | Category | Function | Line | What's wrong | Symptom |
|---|----------|----------|------|--------------|---------|
| G1 | Data race on shared slice | `fetchAll` | ~95 | goroutines `append` to `results` with no mutex | Corrupted/short slice under `-race`; nondeterministic loss |
| G2 | Unchecked error + nil deref | `fetchPage` | 46 | `resp, _ := client.Get(url)` then `resp.Body` | Nil-pointer panic whenever the request errors. **(go vet flags this one.)** |
| G3 | `defer` inside a loop | `writeShards` | 162 | `defer f.Close()` per iteration; closes deferred to function return | All shard handles held open at once; on many shards → fd exhaustion |
| G4 | Write to nil map | `tallyDistricts` | 119 | `var counts map[string]int` never `make`d, then `counts[k]++` | `panic: assignment to entry in nil map` |
| G5 | Range-copy mutation | `assignDistricts` | 112 | `for _, d := range dockets { d.District = … }` mutates the copy | District assignment silently lost; every docket stays empty |
| G6 | WaitGroup misuse | `fetchAll` | 83 | `wg.Add(1)` **inside** the goroutine instead of before `go` | `wg.Wait()` can return before workers register → main proceeds with partial/zero results |

Clean fixes: guard the slice with `sync.Mutex`; check the error before
using `resp`; move file open/close into a per-shard helper (no loop
`defer`); `counts := make(map[string]int)`; iterate by index
`for i := range dockets { dockets[i].District = … }`; `wg.Add(1)` before
the `go` statement.

---

## Rust — `indexer_buggy.rs` (6 defects)

| # | Category | Function | Line | What's wrong | Symptom |
|---|----------|----------|------|--------------|---------|
| R1 | Float `==` equality | `is_unit_weight` | 89 | `term.weight == 1.0` exact compare | Precision drift silently misclassifies unit-weight terms |
| R2 | Shadowing an accumulator | `total_weight` | 82 | `let total = total + …` creates a new binding each iteration | Outer `total` never updates → always returns `0.0` |
| R3 | Inverted `retain` predicate | `filter_terms` | 69 | `retain(|t| t.weight < floor)` keeps the wrong side | Drops the terms it should keep; keeps the ones it should drop |
| R4 | `unwrap()` on untrusted parse | `parse_line` | 46 | `weight_str.parse::<f64>().unwrap()` | Panics on any non-numeric weight (e.g. `not_a_number`) |
| R5 | `usize` underflow | `last_token` | 74 | `tokens.len() - 1` with no empty guard | Empty input → `attempt to subtract with overflow` panic / OOB index |
| R6 | UTF-8 byte-slice | `token_prefix` | 35 | `token[..n]` byte-indexes a `str` | Panics on multi-byte boundaries or when `n` > byte length |

Clean fixes: epsilon compare `(w-1.0).abs() < 1e-9`; `let mut total` +
`total += …`; `retain(|t| t.weight >= floor)`; `match … { Err(_) => 1.0 }`;
guard `if tokens.is_empty()`; `token.chars().take(n).collect()`.

---

## Failure-tier summary (for scoring)

**Crashes on the wrong input (easier to catch by execution):**
JS1, JS2, G2, G4, R4, R5, R6.

**Silently wrong — never raises, only state/output is off (the
discriminating tier):**
JS3, JS4, JS5, G1, G3, G5, G6, R1, R2, R3.

A detector that only runs the happy path will miss the entire silent
tier. A perfect detector flags all 18 sites and nothing else.
