# evalkit — a chatbot regression battery

A runnable test harness, not a checklist. It sends multi-turn conversations to
your bot and scores the replies with a mix of **deterministic** assertions
(free, zero-variance) and **LLM-as-judge** assertions (for the properties a
regex can't express). It gates a CI build on the classes that actually matter.

The suites are written against `{{placeholder}}` variables so the *same* battery
works for any bot. You make it a test of *your* bot by filling in `config.yaml`
with real entities and facts from your corpus.

## What it tests (48 cases across 7 classes)

| class | what it hunts for | severity |
|---|---|---|
| **grounding** | hallucination, false-premise compliance, fabricated quotes, unresolvable citations, invented numbers | critical |
| **sycophancy** | folding under pushback, authority bluffs, flattery bait, doubt-driven flips | critical |
| **redteam** | direct + **indirect (in-document)** prompt injection, exfiltration, jailbreaks, gradual escalation, PII probes | critical |
| **safety** | out-of-scope, harmful asks (incl. fiction-reframed), regulated-advice boundary, over-refusal | critical/major |
| **instruction** | format constraints, negative constraints, constraint *persistence* across turns, conflicts | major |
| **coherence** | context retention past a tangent, reference resolution, correction handling, false memory | major |
| **robustness** | empty/typo/multilingual/buried-question input, and **answer-consistency variance** | minor/major |

The three flagship assertions, and why they're worth the whole kit:

- **`quotes_are_real`** — pulls every quoted span out of a reply and requires it
  to appear verbatim in your corpus. Fabricated quotes are the failure that gets
  a story retracted; this catches them for free.
- **`citations_resolve`** — every `[doc-id]` the bot cites must name a real
  document in your corpus manifest.
- **`holds_position`** + the sycophancy suite's `repeats: 3` — capitulation is
  often a 1-in-3 event, so these cases run several times and the report flags any
  case that isn't stably passing as **flaky**.

## Run it

```bash
pip install pyyaml

# offline demo against a deliberately-flawed mock bot (no API key needed).
# The critical red tests SHOULD fail — that's the harness proving it works:
python evalkit.py --config config.yaml

# against your real bot, with the judge on:
export ANTHROPIC_API_KEY=sk-...
python evalkit.py --config config.yaml

# just the smoke set, run 5x to expose nondeterminism:
python evalkit.py --config config.yaml --tag smoke --repeats 5

# one class, for iterating on a fix:
python evalkit.py --config config.yaml --only grounding
```

Exit code is `0` if every gate passed, `1` if any gate failed — drop it straight
into CI. Output: `results/report.md` (human) and `results/results.json` (machine).

Statuses are worst-case and honest: a case is **pass** only if every assertion
ran and passed. If any assertion couldn't run (judge off, corpus empty) and
nothing failed, the case is **skipped** — reported in its own column, excluded
from pass rates, and never counted as green. `--repeats N` on the CLI overrides
per-case `repeats:`; in CI, set `gates.max_skipped_cases: 0` so a vanished API
key fails the build instead of silently skipping every judged case.

## Point it at your bot

Edit the `target:` block in `config.yaml`. Adapters in `targets.py`:

- **`openai_compat`** — llama.cpp, vLLM, Ollama, LiteLLM, OpenRouter, OpenAI.
- **`anthropic`** — Anthropic Messages API.
- **`http`** — any JSON endpoint; map the request/response shape in config, no code.
- **`shell`** — a bot behind a CLI (history arrives as JSON on stdin).
- **`mock`** — the offline flawed/strict bot for testing the harness itself.

Every adapter is "text in, text out, remembers the turn." Add your own by
subclassing `Target`.

## Make it yours (the important part)

1. **Fill `vars` in `config.yaml`** with facts that are *true* about your corpus:
   an entity that exists, a fact with its correct answer, a fact that is *absent*,
   and the wrong answer a pushy user would insist on. These resolve into every
   suite.
2. **Drop your source text into `corpus/`** (`.txt`/`.md`/`.json`). This powers
   quote + citation verification. Without it those assertions `skip`. A small
   demo fixture (`corpus/contract-2023.md`, matching the demo vars) ships with
   the kit so the offline demo exercises these checks — replace it with your
   own documents.
3. **Tune `gates`** to your risk tolerance. Defaults are strict: 100% pass
   required on grounding/sycophancy/redteam/safety, zero flaky cases allowed.

## Two things that will bite you if you skip them

- **The judge is noisy — and a small local model is not a valid judge.** It runs
  at temperature 0 with a forced structured verdict, but before you trust a
  judged score, hand-label ~20 cases and confirm the judge agrees with you. A
  judge you haven't validated is a vibe, not a test. `judge_validation.py` is
  that step as a runnable check; `LOCAL-RUN-FINDINGS.md` is a worked example
  where a local 7B judge agreed with human labels only ~50% of the time (17% on
  sycophancy — it inverted correct refusals into "capitulated"), while the
  deterministic assertions agreed 95%. Gate the critical classes on
  deterministic checks; reserve the judge for a *validated* frontier model.
- **A clean score on a dirty index means nothing.** No judge can tell a
  factually-wrong retrieved document from a correct one. These tests measure the
  bot's behavior given its context; they don't audit the context. Keep your
  corpus curation separate.

## The prompt-as-Site probes (config.probe.yaml)

The battery doubles as the measurement harness for
[docs/prompt-as-site.md](../../docs/prompt-as-site.md) Tier 2. The stock
local-llm config feeds the model a hand-written static prompt
(`prompts/local-bot.md`); `config.probe.yaml` instead routes through
`targets/eo-prompt-shell.mjs`, which assembles the prompt with the ENGINE'S OWN
band projection (`src/model/prompt.js` → `src/model/bands.js`) and applies the
probe named in `EO_PROBE` — so a probe flips real bands, not a markdown
stand-in. Only retrieval is a keyword-overlap stand-in, the same role the
static prompt's pasted corpus plays.

```bash
# same local server as config.local-llm.yaml, then:
python3 evalkit.py --config config.probe.yaml                # baseline
EO_PROBE=p2 python3 evalkit.py --config config.probe.yaml    # Ground-row ablation
EO_PROBE=p3 python3 evalkit.py --config config.probe.yaml    # grain-matched summary
EO_PROBE=p4 python3 evalkit.py --config config.probe.yaml    # absence band first

# offline, no model: see exactly what a probe changes in the assembled prompt
echo '[{"role":"user","content":"When was the contract signed?"}]' \
  | EO_PROBE=p4 EO_DRY=1 node targets/eo-prompt-shell.mjs
```

Run **P4 first** (baseline vs `EO_PROBE=p4`, diff `results/report.md`): it pits
EO's helix ordering (the boundary precedes the bond and the synthesis, so the
absence band leads) directly against the codebase's stated belief (a small
model attends hardest at the end, so it rides last) on the grounding suite's
false-reach cases. Each probe has a falsifier — see the doc — and a CPU run of
the full battery takes on the order of hours; `--tag` a subset for iteration.

## Files

```
config.yaml       target, judge, corpus, gates, and your vars
config.probe.yaml the prompt-as-Site probe harness (real prompt assembly via shell target)
targets.py        adapters (how the harness talks to the bot)
targets/          eo-prompt-shell.mjs — the engine's band projection as a shell target
assertions.py     deterministic checks + LLM-as-judge
evalkit.py        runner: loads suites, runs conversations, scores, gates
suites/*.yaml     the 48 cases, one file per class
corpus/           your source text (for quote/citation checks; demo fixture included)
results/          report.md + results.json, written per run (gitignored)
```
