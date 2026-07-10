# BUGS_MANIFEST.md — ground truth

Two files, structurally parallel:

- `pipeline_clean.py` (302 lines) — known good, no planted defects.
- `pipeline_buggy.py` (298 lines) — six planted defects, listed below.

Both parse and import cleanly. Every planted defect is a **runtime or
correctness** bug, not a syntax error — the system under test has to
reason about behavior, not just fail to parse. The only non-bug
difference between the files is the module docstring wording.

Scoring note: `diff pipeline_clean.py pipeline_buggy.py` gives the full
change set. A perfect detector flags exactly the six sites below and
nothing else (no false positives on the docstring change).

## Planted defects

| # | Category | Function | Buggy line(s) | What's wrong | Symptom |
|---|----------|----------|---------------|--------------|---------|
| 1 | Bare except + None return | `_get_with_retries` | 129, 132 | `except:` swallows every exception (incl. `KeyboardInterrupt`/`SystemExit`); function returns `None` instead of raising `last_exc` on exhaustion | Callers do `resp.json()` on `None` → `AttributeError` far from the real cause; loop no longer distinguishes retryable network errors from bugs |
| 2 | Mutable default argument | `accumulate_batch` | 167 | `batch: list = []` — default list created once at def-time and shared across calls; the `is None` guard was removed | Dockets leak between independent runs; batch grows across calls that passed no explicit list |
| 3 | Off-by-one | `process_rows` | 246 | `range(len(dockets) - 1)` drops the final row | Last docket in every batch is silently never enriched or written |
| 4 | Resource leak | `write_checkpoint` | 221, 225 | `open()` without a context manager; if `json.dumps`/`write` raises mid-loop, `fh.close()` at 225 never runs | Leaked file handle; partially written checkpoint left open/unflushed on error |
| 5 | Unawaited async | `publish_all` | 239 | `asyncio.ensure_future(...)` fire-and-forget inside a loop, never awaited | `publish_all` returns before archives finish; `asyncio.run` may tear down the loop with tasks pending → "Task was destroyed" / lost writes; exceptions in `_archive_one` vanish |
| 6 | NaN / identity comparison | `iter_valid` | 211 | `docket.confidence == float("nan")` is **always False** (NaN != NaN) | The NaN-drop guard never fires; NaN-confidence dockets pass through instead of being dropped |

## Corresponding clean implementations (for reference)

- 1 → `except requests.RequestException as exc:` ... `raise last_exc`
- 2 → `batch: Optional[list] = None` + `if batch is None: batch = []`
- 3 → `for i in range(len(dockets)):` (or iterate directly)
- 4 → `with open(path, "w", encoding="utf-8") as fh:`
- 5 → `await asyncio.gather(*[_archive_one(...) for d in dockets])`
- 6 → `if math.isnan(docket.confidence):`

## Difficulty notes

- **1, 3, 4** are the "runs fine until it doesn't" tier — no error on the
  happy path, so a detector that only executes the success case misses them.
- **2, 5, 6** are the silent-wrong tier — they never raise at all; only
  the *state* or *output* is wrong. These are the discriminating cases for
  a system that claims semantic understanding rather than pattern matching.
