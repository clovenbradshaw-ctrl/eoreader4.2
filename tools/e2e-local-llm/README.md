# e2e-local-llm — the whole body, on a real local model

A headless end-to-end harness that exercises the system the way a user does,
with a **real LLM decoding on the CPU** — no mocks, no echo skeleton:

1. serves the repo and boots `index.html` in headless Chromium (Playwright);
2. loads the **wllama** backend (SmolLM2-135M-Instruct q8_0, llama.cpp WASM)
   through the app's own model ladder (`ensureModel`), multi-threaded — the
   server sends COOP/COEP so the page is `crossOriginIsolated`;
3. ingests a corpus through `EO.app.ingestText` (the real parse → event log →
   reading path);
4. asks questions through the real `EO.app.ask()` → `runTurn` fold, including
   one **deliberately off-corpus** question to probe the grounding gate;
5. writes `results.json` with each answer's `route` / `grounded` / `cites`
   plus the session's self-model and ledger readouts.

The run is **hermetic**: every external URL the page would touch is either
served from local disk (the wllama runtime, the GGUF weights) or refused
(fonts, MiniLM CDN, matrix). Nothing leaves the machine.

## One-time asset fetch (~145MB)

```sh
cd tools/e2e-local-llm
mkdir -p assets && cd assets

# the wllama runtime, pinned to the version src/model/wllama.js pins
npm pack @wllama/wllama@2.3.7 && tar xzf wllama-wllama-2.3.7.tgz

# the weights. HuggingFace direct is the app's default URL; if your egress
# rejects it (some proxies 401 anonymous HF), the Ollama registry serves the
# SAME q8_0 GGUF as an anonymous blob:
curl -L -o smollm2-135m-instruct-q8_0.gguf \
  "https://registry.ollama.ai/v2/library/smollm2/blobs/sha256:40f7094960b6ede829145d102ca79451b364b27d9d8694d4406e002024cff357"

cd .. && npm init -y && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright
```

## Run

```sh
node server.js ../.. assets/smollm2-135m-instruct-q8_0.gguf &   # :8777, COOP/COEP
node run.js                          # default 3 questions over data/metamorphosis.txt
node run.js "your own question"      # or ask anything
```

`EO_E2E_CHROMIUM` overrides the browser binary (default
`/opt/pw-browsers/chromium`); `EO_E2E_ASSETS` the asset dir.

## What a run looks like (2026-07-10, 4-core container)

All 364 unit/integration tests green first (`npm test`: 363 pass, 1 skip —
the `EO_LIVE_PROXY`-gated live-web test). Then the E2E:

- boot → `window.EO` bridge up, `crossOriginIsolated=true`;
- corpus `data/metamorphosis.txt` ingested as S1 (592 words);
- model cold → ready in **3.4s** (weights stream from disk into WASM,
  including the warm-up token);
- **Q1** "Who is Gregor Samsa and what happened to him?" → 45.9s,
  `route=grounded`, 1 citation, text drawn from the record ("Gregor Samsa was
  a traveling salesman, and his case of samples still stood beside his bed. [s2]");
- **Q2** "What was Gregor looking at on the wall of his room?" → instant
  extractive fallback, `route=grounded`, 3 citations — the gate declined to
  phrase and returned the relevant spans verbatim (the picture above the
  table is among them);
- **Q3** (off-corpus trap) "What does the document say about the weather
  outside?" → the 135M model tried to invent weather; the pipeline caught it:
  `grounded=false`, `cites=0`, and the stall watchdog stopped the decode
  (`route=stopped`) after repetitive ungrounded drafts. The honesty seams
  held — nothing hallucinated was ever marked grounded or cited.

Two practical notes baked into the harness, learned the hard way:

- **don't `route.fulfill` a 145MB body** — one CDP payload that size kills
  the headless renderer; redirect onto a local streaming endpoint instead;
- SmolLM2-135M is the smoke-test model: big enough to phrase a grounded
  answer, small enough to decode on CI-class CPUs, and weak enough to *try*
  to hallucinate — which is exactly what makes the off-corpus probe a real
  test of the gate rather than of the model's manners.
