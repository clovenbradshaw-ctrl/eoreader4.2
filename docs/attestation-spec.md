# eoreader4.2 — Attestation Spec
**Status:** proposal, v0.1
**Scope:** how a source is captured, witnessed by third parties, anchored in time, and watched for scrubbing.
**Companion to:** `retrieval-spec.md` (span addressing and pinning, §5 there, is assumed here).

---

> **Implementation status (this repo).** The attestation subsystem lives in `src/attest/`
> and follows this codebase's discipline: **pure, offline, deterministic cores — fully
> implemented and unit-tested — with every live network / infra dependency behind an
> injectable seam**, exactly as `src/organs/ingest/websource.js` keeps "search/fetch behind
> the proxy seam." What is landed vs. what is a seam:
>
> | Build-order step (§11) | Module | Core (pure, tested) | Seam (inject a client) |
> |---|---|---|---|
> | 1 · 2 · 11  Custody | `attest/custody.js` | record + `payload_sha256` pin (→ `retrieve/pin.js` `webSource`), path A/B/C, WACZ container ref, `authenticated`, provenance class | the actual fetch (path B server, path A extension) |
> | 3 · 4 · 10  Witness | `attest/witness.js` | witness record, SPN2 request/response shapes, job queue, near-miss, archive.today diversity | `spnClient` / `cdxClient` HTTP |
> | 6  Attestation ladder | `attest/ladder.js` | the four-state ladder + normalization + divergence triage | the `id_` fetch of the witness bytes |
> | 7  Anchor | `attest/anchor.js` | Merkle leaves → root, `log₂(n)` inclusion proofs + verify, anchor record | RFC 3161 TSA + OpenTimestamps + publish |
> | 8  Watch | `attest/watch.js` | CDX diff, scrub / withdrawal detection, cadence table | CDX HTTP poll |
> | 5 · 9  Frontier | `attest/frontier.js` | frontier record, preservation tiers, seeded gate, ablation, publication, envelope | — (feeds off `surfer/salience.js`) |
> | §9  EOT layer | `attest/eot.js` | render the five assemblies + the frontier record to EOT surface | — |
>
> The pin (`payload_sha256`, §3.2) **is** the `capture_sha256` the web-page row of
> `retrieval-spec.md` §5 already reserves. Custody does not mint a competing hash; it fills
> the IOU that spec wrote.

---

## 0. The one-sentence version

> **Custody is yours. Attestation is theirs. Never confuse the two.**

You hold the bytes. Archive.org holds an independent witness to those bytes. If you outsource custody to a witness, a lawyer's email can destroy your evidence. If you outsource attestation to yourself, nobody has to believe you.

Every section below is a consequence of keeping those two things apart.

---

## 1. Four functions, deliberately separate

| Function | Who does it | What it proves | If it fails |
|---|---|---|---|
| **Custody** | You | *These are the bytes I read.* | You have no evidence. Fatal. |
| **Witness** | Internet Archive, archive.today | *A neutral party saw the same thing at the same time.* | You have evidence but no corroboration. Survivable. |
| **Anchor** | RFC 3161 TSA + OpenTimestamps | *I held this hash before date T and haven't altered it since.* | Your custody is unfalsifiable but also unprovable. Weak. |
| **Watch** | CDX polling | *This source changed / this claim was scrubbed.* | You miss the story. |

The central error to avoid: **treating the Wayback Machine as custody.** It is not, it cannot be, and §7 explains why it will eventually betray you if you do.

---

## 2. Wayback does not preserve *your* version

This must be stated plainly because the intuition is nearly universal and it is wrong.

When Internet Archive captures a URL, **its crawler performs its own fetch** — different IP, different geolocation, different user-agent, different second, no session. It may receive **different bytes than you did**, and on the sites that matter most it probably will:

- geo-fenced content
- A/B tests and personalization
- paywall variants (you were logged in; the crawler was not)
- CDN edge variance
- deliberate cloaking

So the capture is not your copy. It is an **independent contemporaneous witness**, which is a *more* valuable thing than a backup, because it makes divergence *detectable*.

### 2.1 The three outcomes

```
      your bytes                    IA's bytes
          │                              │
          └──────── compare spans ───────┘
                         │
      ┌──────────────────┼──────────────────┐
      ▼                  ▼                  ▼
  ATTESTED           DIVERGENT          UNARCHIVED
  span survives      span absent        no capture exists
  in IA's copy       from IA's copy
      │                  │                  │
  third-party        you were served    blocked, failed,
  corroboration      something they      or refused —
  of your quote      weren't. OR the     also information
                     page changed.
                     ── THIS MAY BE
                        THE STORY ──
```

`DIVERGENT` is not an error condition. It is a finding, and on this beat it is sometimes the most important one the system will ever produce. It must be typed, logged, and surfaced — never retried away, never silently resolved in favor of either party.

---

## 3. Custody

### 3.1 The browser problem, stated honestly

**You cannot capture arbitrary third-party pages from a browser tab.** Cross-origin `fetch()` without CORS headers gives you an opaque response — no body, no headers, nothing. This is not a bug to route around; it is the same-origin policy, and it means the "browser-native" constraint does not survive contact with web archiving.

Three custody paths, chosen by source class. Do not pretend one path covers everything.

| Path | Mechanism | Source classes | Cost |
|---|---|---|---|
| **A. Extension** | Browser extension with `webRequest` — captures what you actually browsed, session and all | Paywalled articles, authenticated portals, anything you navigate by hand | Requires install; best fidelity |
| **B. Companion fetcher** | Server-side fetch on your own infra (`hyphae.social` / n8n) → WARC | Bulk crawl, public pages, scheduled re-fetch | Not browser-native; traffic originates from your host |
| **C. In-tab fetch** | Direct `fetch()` where CORS permits | APIs, FeatureServers, CaseLink, your own scrapers' targets | Free, already works, narrow |

**Do not build path A.** Webrecorder's `ArchiveWeb.page` extension already does it, emits **WACZ**, and `ReplayWeb.page` replays WACZ *in the browser* — which means the replay side stays browser-native even though the capture side cannot. Adopt WACZ as the custody container and inherit a mature ecosystem instead of rebuilding one.

### 3.2 The custody record

```yaml
capture:
  span_source:   "https://…"          # the URL fetched
  fetched_at:    "2026-07-14T19:22:03Z"
  path:          "A" | "B" | "C"
  request_headers:  {...}             # what you sent (incl. auth presence, not secrets)
  response_status:  200
  response_headers: {...}
  payload_sha256:   "…"               # ← THE PIN
  container:     "wacz:<file_sha256>#<record_id>"
  renderer:      "chrome/126"          # what rendered it, if JS-rendered
```

**The pin is `payload_sha256` — the SHA-256 of the response body as received.** Not the hash of the WARC/WACZ file, which contains timestamps and container metadata and would change on repack. The pin must be stable under re-containerization.

### 3.3 Rules

1. **No claim without custody.** A span whose bytes you do not hold cannot enter the tape. Not "cannot be trusted" — cannot *enter*.
2. **Custody precedes witness.** You capture first, then ask IA. Never the reverse, and never rely on IA to capture something you didn't.
3. **Auth-gated captures are marked.** If you were logged in, the capture is `authenticated: true` and it is *expected* to diverge from IA's. See §6.3 — this is a typed non-finding, not a mystery.

---

## 4. Witness

### 4.1 Requesting a capture

Save Page Now (SPN2), asynchronous, non-blocking:

```
POST https://web.archive.org/save
Authorization: LOW <accesskey>:<secret>
Content-Type: application/x-www-form-urlencoded

url=<url>&capture_all=1&skip_first_archive=0
→ { "job_id": "spn2-…" }
```

The job is queued and may take seconds to minutes. **Do not block the crawl on it.** Record the `job_id` and move on — this is exactly the "ping it back later" architecture, and it is correct.

Poll later:

```
GET https://web.archive.org/save/status/<job_id>
→ { "status": "success", "timestamp": "20260714192311", "original_url": "…" }
```

> **Verify before building:** SPN's auth scheme and rate limits have changed repeatedly. Confirm current limits against archive.org's docs; do not hardcode from this document.

### 4.2 Retrieving the capture — the `id_` flag matters

The default replay URL returns IA's **rewritten** HTML — links proxied, toolbar injected, resources rewritten. Comparing against that is worthless.

```
https://web.archive.org/web/<timestamp>id_/<url>       ← RAW original bytes
https://web.archive.org/web/<timestamp>/<url>          ← rewritten. DO NOT USE.
```

The `id_` suffix means *identity*: unmodified payload as captured. **Every comparison in this spec uses `id_`.** Getting this wrong produces a permanent, silent, 100% divergence rate and it is the single easiest way to make this whole system useless.

### 4.3 CDX — the capture history

```
GET https://web.archive.org/cdx/search/cdx
    ?url=<url>&output=json
    &fl=timestamp,digest,statuscode,mimetype,length
```

Returns **every** capture with a `digest` — a base32-encoded SHA-1 of the response payload, computed by IA. This is the workhorse of §7 (watch) and it is free.

### 4.4 The second witness

**Add archive.today (`archive.ph`).** It ignores `robots.txt` and is materially harder to get content removed from. It is also less reliable, rate-limits differently, and has no clean API.

The point is not redundancy for its own sake. The point is that IA and archive.today **fail for different reasons**, and two witnesses with uncorrelated failure modes is worth far more than two witnesses with the same one. When a subject succeeds in removing themselves from IA (§7.2), archive.today is what's left.

---

## 5. Attestation — verify the span, not the page

### 5.1 Why page-level comparison is a dead end

Byte-comparing your capture to IA's will report divergence on virtually every page, for reasons that have nothing to do with truth:

rotating ads · session IDs · CSRF tokens in markup · "last updated" timestamps · view counters · CDN cache headers · randomized element IDs

Page-level comparison produces a divergence signal with a ~100% false-positive rate, which is the same as no signal.

### 5.2 The correct unit

**Ask only: does the span I collapsed survive in the witness's copy?**

You do not care that the ad rotated. You care whether the sentence you are about to quote is in Internet Archive's timestamped copy of the page. That is the only question a court, an editor, or a hostile press officer will ever ask.

This also means attestation operates at the same granularity as everything else in the system: the span.

### 5.3 The ladder

```
1. exact substring match in witness text        → attested
2. normalized match                              → attested_normalized
   (whitespace collapsed, smart quotes folded,
    HTML entities decoded, soft hyphens stripped)
3. fuzzy match ≥ 0.95 similarity                 → attested_fuzzy   ⚑ human review
4. no match                                      → divergent        ⚑ ESCALATE
```

Tiers 1 and 2 are automatic. **Tier 3 is flagged, never auto-accepted** — a near-match may be a rendering artifact or may be an edit, and only a person can tell. Tier 4 stops the line.

### 5.4 Divergence triage

`divergent` is a finding that requires a cause. Type it:

| Cause | Signature |
|---|---|
| `paywall` | Witness copy is a paywall interstitial; your capture was `authenticated: true` |
| `geo` | Witness copy is coherent but different; content varies by region |
| `edited` | Witness captured *after* your fetch and the text changed — check CDX for an earlier capture |
| `cloaked` | Witness captured at ~the same time, content differs materially, no benign explanation |
| `render` | JS-heavy page; SPN's renderer produced different DOM |

**`cloaked` is the loud one.** Different content served to a crawler than to a browser is a deliberate act. It has an explanation and the explanation is a story.

---

## 6. Anchor

### 6.1 The problem

`payload_sha256 = 9f2a…` proves nothing on its own. You could have fabricated the bytes this morning and computed the hash after. Custody without a timestamp is just an assertion.

### 6.2 Merkle the ledger, anchor the root

Do **not** timestamp spans individually — it doesn't scale and it costs a network round-trip per span.

```
   ledger events (canonicalized, hashed)
   ┌────┬────┬────┬────┬────┬────┬────┬────┐
   │ e₁ │ e₂ │ e₃ │ e₄ │ e₅ │ e₆ │ e₇ │ e₈ │   ← leaves
   └─┬──┴─┬──┴─┬──┴─┬──┴─┬──┴─┬──┴─┬──┴─┬──┘
     └─┬──┘    └─┬──┘    └─┬──┘    └─┬──┘
       └────┬────┘         └────┬────┘
            └────────┬──────────┘
                     ▼
                 ROOT (32 bytes)
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   RFC 3161      OpenTimestamps  published
   TSA token     (.ots, Bitcoin) (git / Matrix)
```

One anchoring pass per batch (per session, or nightly). Inclusion of any single event is provable with a `log₂(n)` sibling path stored alongside it — a few hundred bytes.

This is Certificate Transparency's design, applied to a newsroom.

### 6.3 Why both timestamp services

| Service | Strength | Weakness |
|---|---|---|
| **RFC 3161 TSA** | Instant, signed, legally recognized in most jurisdictions | A trusted third party — subpoenable, coercible, revocable |
| **OpenTimestamps** | No trusted party; Bitcoin-anchored; nothing to subpoena | Confirmation takes hours; explaining it to a judge is work |

Use both. They fail differently, and given who this tool is pointed at, "nothing to subpoena" is not a theoretical virtue.

### 6.4 Publish the roots

Append every root to a public, append-only location — a git repo, a Matrix room, the {Rich Text} feed. Cheap, and it means **you cannot fork your own tape**. A published root history is a commitment that a later, quietly-different version of the ledger cannot satisfy.

### 6.5 What this buys

NPJ's claim upgrades from:

> *"We cite our sources."*

to:

> *"Our ledger is tamper-evident, externally anchored, and independently verifiable — including against us."*

That is a categorically different assertion, and it is roughly two days of work on top of a ledger that already exists.

---

## 7. Watch — the archive as an instrument

This is the part that turns attestation from insurance into reporting.

### 7.1 Scrub detection

CDX returns every capture with a digest. **Poll it on a schedule for every pinned source.**

```
for each watched url:
    cdx → captures[]
    if latest.digest != last_seen.digest:
        fetch latest via id_
        for each span pinned to this url:
            re-run the attestation ladder (§5.3)
            span present → stable
            span absent  → SCRUBBED  ⚑⚑⚑
```

A span that was present in an earlier capture and is absent from a later one means **someone edited or deleted it, and you are holding both versions with third-party timestamps on each.**

Quietly-amended procurement pages. Board minutes that lose a paragraph. An RFP whose scope section grows a clause after the award. A vendor page that stops mentioning a partnership. These are not edge cases on this beat — **this is the pattern**, and right now catching it depends on a human happening to remember what a page used to say.

### 7.2 Withdrawal detection — the one that matters most

**Internet Archive honors retroactive exclusion requests.** A site owner can ask IA to remove captures *after the fact*, and IA complies. This happens routinely, and it happens most often to exactly the kind of organization worth investigating.

This is why IA cannot be custody. But watch what happens when it is only a *witness*:

```
capture existed at T₁ (verified, logged, attested)
capture absent at T₂
  → !SIG source.witness.ia = "withdrawn"
```

You still have the bytes. You still have the anchor proving you had them. And now you additionally have a logged, timestamped fact: **at some point after you verified it, this organization went to the trouble of having the public record of this page erased.**

A subject scrubbing the archive does not destroy your evidence. **It leaves a hole in your tape with their name on it, and the hole is itself a finding.** This inverts the threat entirely — but only if custody was yours to begin with.

### 7.3 Watch cadence

| Source class | Poll |
|---|---|
| Cited in published work | Weekly, forever |
| Active investigation | Daily |
| Collapsed but unpublished | Monthly |
| **Near-miss** (§8.2 — witnessed, no custody) | Quarterly — cheap, and a scrub here is a signal that it *should* have collapsed |
| **Encountered / NUL'd** (§8.2) | Never — no capture to watch. Re-collapse first. |
| **Never reached** | Not applicable — outside the envelope (§8.7) |

---

## 8. Selective preservation

**We do not preserve everything. We preserve the salient, and we log the decision.**

This is the section an adversary will attack, so it is the section that has to be strongest.

### 8.1 The constraint is real, not chosen

Save Page Now is rate-limited. Disk is finite. A broad crawl touches millions of spans and a working investigation collapses hundreds. Preserving everything is not a discipline you have declined to adopt — it is not available, to you or to anyone.

Every journalist who has ever worked has been selective. The notebook is selective. The clip file is selective. The FOIA request is selective. **The claim to have preserved everything has always been the actual dishonesty**, because it conceals the second selection — the one where you decide what to *quote* — behind the first.

So the question is not *whether* to select. It is whether the selection leaves a trace.

### 8.2 Three preservation tiers

| Tier | What it is | What we keep | Cost |
|---|---|---|---|
| **Collapsed** | Entered the tape. INS'd. | Full custody (§3) + witness (§4) + attestation (§5) + anchor (§6) + watch (§7) | High. Hundreds–low thousands per investigation. |
| **Near-miss** | High amplitude, did not collapse. The tail the sampler didn't draw. | **Witness without custody** — fire SPN, keep the pinned address and the score. No bytes. | Low. One API call. |
| **Encountered** | NUL'd. Seen, addressed, passed over. | **Address + salience amplitude + phase + the seed that decided.** No bytes, no witness. | Near zero. One ledger line. |
| **Never reached** | Outside the crawl. | The **envelope** — seeds, domains, depth, date range. Declared, not enumerated. | Zero. |

The middle tier is the one people skip, and it is cheap insurance. A near-miss you want in November may have 404'd by then; link rot does not wait for your investigation to turn. **Firing SPN on the near-misses costs one request and buys back most of the tail risk** without paying custody's price on material you may never look at.

### 8.3 The frontier record is an archival artifact

A NUL'd span is **not** absent from the tape. It is *present as an address and a decision*:

```eot
# encountered, measured, not collapsed. no bytes kept.
!NUL frontier.h-8814
frontier.h-8814.uri = "https://…/board-packet-2025-09.pdf#p14"
frontier.h-8814.amplitude = 0.31
frontier.h-8814.phase = "neutral"
frontier.h-8814.seed = "crawl-0417:0x8f2c"
frontier.h-8814.reason = "below-draw"
frontier.h-8814.witness = "spn2-…"        # near-miss tier: SPN fired anyway
!EVA frontier.h-8814
```

This is the third discard type. There are not two fates for a span — kept and rejected — there are **four**: collapsed, rejected-for-cause, encountered-and-passed, and never-reached. Only the first two are normally recorded anywhere. The third is where the honesty lives, and the fourth is where the residual risk lives.

**A NUL'd address is re-collapsible.** The frontier is a queue, not a bin. When the investigation turns and h-8814 becomes salient in July, it collapses in July — and the tape shows both the original pass and the revision, with dates.

### 8.4 Why recorded selection beats exhaustive preservation

Consider two systems:

> **System A** archives every page it touches, then quotes selectively. The archive is complete. **The quoting decision is invisible and unauditable.**
>
> **System B** archives selectively, but logs every selection decision — the address, the amplitude, the phase, the seed, the reason. The archive is partial. **The selection decision is the audit trail.**

System B is *more* accountable while preserving *less*, and this is not a paradox. Completeness of the archive does nothing to constrain the second, invisible selection that every System A performs at write-time. System B has only one selection, and it is on the record.

**Cherry-picking is only an attack when the picking is invisible.**

### 8.5 The selection is externally auditable

Because the frontier carries amplitudes, phases, and the seed, **a critic can re-run the gate.**

Publish the frontier record (addresses and scores — not bytes, no custody obligation) and anyone can:

- re-run the salience function with different parameters and see what *would* have collapsed
- diff their collapse set against yours
- raise the temperature and ask what the exploration budget missed
- point at a specific NUL'd address and say *you should have kept this* — **with a number to argue about**

This is the ablation from `retrieval-spec.md` §10.1, promoted to a public instrument. It is the only real answer to *"you preserved only what fit your story,"* and it converts that accusation from an insinuation into a **testable claim**.

### 8.6 The sampler is a bias defense

A hard threshold is tunable to taste. Set it at 0.5 and inconvenient material falls below it; nobody — including you — can prove the cutoff wasn't chosen, consciously or not, to produce the corpus you wanted.

**A seeded probabilistic gate cannot be tuned this way, and the seed is in the ledger.** Misses become random rather than systematic. You cannot bias toward missing what you'd rather not find, because you are not choosing the misses; the sampler is, from a logged seed, reproducibly.

This is not a nice property. On a beat where the subjects will eventually accuse you of motivated selection, it is close to the whole ballgame.

### 8.7 What remains unmeasurable — stated plainly

**A page never reached leaves no trace but the envelope.** The frontier record covers what you *encountered*. It says nothing about what you never crawled to, and no ledger entry will fix that.

The envelope bounds it — *these seeds, these domains, this depth, this date range* — so a null result reads as **outside my boundary**, never as **does not exist**. That is a coverage manifest, and it must ship with any published finding.

But bounding is not enumerating. The unreached is an unknown unknown. It is the irreducible residual of using a crawler at all, and the honest posture is to declare it, not to pretend the frontier record closes it.

Two partial defenses, both from the essay, both non-optional:

1. **Fund the anomaly.** Reserve exploration budget for low-amplitude / high-surprisal spans — the things the salience field actively argues against keeping. A line item, not a rounding error.
2. **Seed from the unlinked.** Dockets, FOIA logs, bulk filings, FeatureServers. The link graph is a map of what is already known; a crawl that only follows links preserves only what somebody wanted found.

### 8.8 The budgets are the same budget

> **The attention budget and the attestation budget are the same budget.**

The gate that decides what the system *thinks about* is the same gate that decides what it *preserves* and what it *asks a stranger to co-sign*. This is not a coincidence of implementation. A system where the expensive external commitment is bounded by the same mechanism that bounds cognition is a system whose parts agree with each other — and one where "why did you keep this and not that" has exactly one answer, in one place, with a number attached.

---

## 9. The EOT layer

Attestation events belong in the tape, because *how well a source is witnessed* is part of how you know what you know.

```eot
# ── assembly 1: custody ─────────────────────────────────────────
cap_ndp_0311 : capture
cap_ndp_0311.source = "https://…/minutes-2025-03-11"
cap_ndp_0311.fetched_at = "2026-04-02T14:11:07Z"
cap_ndp_0311.payload_sha256 = "9f2a…c41b"
cap_ndp_0311.container = "wacz:7e1d…#rec-0041"
cap_ndp_0311.authenticated = false
cap_ndp_0311.contract.ops = NUL, SIG, INS, DEF, EVA
cap_ndp_0311.contract.terrains = Entity, Lens
cap_ndp_0311.contract.stances = Making, Binding, Dissecting
!EVA cap_ndp_0311                      # INS(Entity, Making) — the bytes exist

# ── assembly 2: the witnesses ───────────────────────────────────
# A witness is a Lens: one third party's reading of one situation.
w_ia_0311 : witness
w_ia_0311.service = "web.archive.org"
w_ia_0311.requested_at = "2026-04-02T14:11:09Z"
w_ia_0311.job = "spn2-…"
w_ia_0311.captured_at = "2026-04-02T14:13:52Z"
w_ia_0311.cdx_digest = "PJK3…"          # base32 SHA-1, theirs
w_ia_0311.replay = "…/20260402141352id_/…"
!EVA w_ia_0311

w_at_0311 : witness
w_at_0311.service = "archive.today"
w_at_0311.captured_at = "2026-04-02T14:19:30Z"
!EVA w_at_0311

cap_ndp_0311 -> w_ia_0311
cap_ndp_0311 -> w_at_0311
!EVA cap_ndp_0311, w_ia_0311, w_at_0311   # CON(Link, Binding)

# ── assembly 3: attestation ─────────────────────────────────────
# EVA(Lens, Dissecting) — judgment rendered by testing the span
# against the witness. Per span, never per page.
!EVA cap_ndp_0311#sec-4.para-2 @ w_ia_0311 = "attested"
!EVA cap_ndp_0311#sec-4.para-2 @ w_at_0311 = "attested"
!EVA cap_ndp_0311#sec-7.para-1 @ w_ia_0311 = "attested_fuzzy"
!SIG cap_ndp_0311#sec-7.para-1.review = "human"     # tier 3 never auto-passes
!EVA cap_ndp_0311

# ── assembly 4: the anchor ──────────────────────────────────────
# SYN(Network, Composing) — a root synthesized from many leaves.
!SYN root_20260402 = ledger.events["2026-04-02"]
root_20260402.sha256 = "b41c…"
root_20260402.rfc3161 = "tsa:freetsa#…"
root_20260402.ots = "ots:…"
root_20260402.published = "matrix:!ledger:hyphae.social$…"
!EVA root_20260402

# ── assembly 5: the watch, months later ─────────────────────────
# The digest changed. The span is gone. This is not an error.
# This is the reason the system exists.
!SIG w_ia_0311.digest_changed = "2026-11-08T03:14:00Z"
!EVA cap_ndp_0311#sec-4.para-2 @ w_ia_0311.latest = "SCRUBBED"
!SIG cap_ndp_0311#sec-4.para-2.status = "removed-from-live-source"
# custody is unaffected. the claim still stands. the REMOVAL is now
# itself a dated, anchored, witnessed fact about the subject.
!EVA cap_ndp_0311
```

**Read assembly 5 carefully.** The scrub does not weaken the claim. The claim was never resting on the live page — it rests on the custody hash, anchored in §6, attested in §5 *before* the removal. The removal is a **new fact about the subject**, added to the tape, with a date.

That is the whole architecture in one assembly: **you cannot un-say something to a system that kept the bytes and had a stranger co-sign them.**

---

## 10. Failure modes

| Failure | Prevention |
|---|---|
| Treating IA as custody; subject gets captures removed; evidence gone | §3 — custody is always local. IA is only ever a witness. |
| Comparing against IA's rewritten HTML; 100% false divergence | §4.2 — always use the `id_` replay flag. |
| Page-level byte comparison; divergence signal is pure noise | §5.1 — compare spans, never pages. |
| Paywalled article "diverges" from IA's paywall interstitial | §5.4 — typed as `paywall`, expected, not escalated. Requires `authenticated` flag from §3.2. |
| SPN rate limits kill the crawl | §8 — archive only collapsed spans, not the frontier. |
| Custody hash is unprovable; "you could have made this up" | §6 — Merkle root anchored to TSA + OpenTimestamps, roots published. |
| You quietly rewrite your own ledger | §6.4 — published root history. You cannot fork what you committed to. |
| Site blocks archiving entirely | Typed `unarchived`. Custody still holds; corroboration is absent and **the absence is disclosed in the publication**, not hidden. |
| JS-rendered page captures differently | Typed `render` divergence; escalate to human. Record the renderer in §3.2 so this is diagnosable. |
| A scrub happens and nobody notices | §7 — CDX polling on a schedule. This is a background job, not a hope. |
| **"You only preserved what fit your story"** | §8.4 — the selection decision is logged with an amplitude and a seed. §8.5 — publish the frontier so the accusation becomes a testable claim instead of an insinuation. |
| **The salience threshold was tuned to exclude inconvenient material** | §8.6 — a seeded probabilistic gate cannot be tuned this way. The seed is in the ledger. Misses are random, not systematic. |
| **A NUL'd source you now need has 404'd** | §8.2 near-miss tier — fire SPN on high-amplitude non-collapses. One API call. Buys back most of the tail risk. |
| **A null result is read as "this doesn't exist"** | §8.7 — the crawl envelope ships with every published finding. A null means *outside my boundary*, never *does not exist*. |
| **The crawl never reached the thing that mattered** | §8.7 — irreducible. Bounded by the envelope, mitigated by the anomaly budget and by seeding from unlinked sources. **Declared, not concealed.** |

---

## 11. Build order

1. **Custody, path C only.** In-tab fetch + hash + pin, for CORS-permissive sources you already scrape (CaseLink, DFR FeatureServer). No archiving yet. Proves the pin is stable and resolvable.
2. **Custody, path B.** Companion fetcher on your own infra → WACZ. Now you can capture arbitrary public pages.
3. **SPN fire-and-forget + job queue.** Request captures for collapsed spans. Don't verify yet. Cheap, and it starts the witness clock immediately.
4. **Near-miss witnessing** (§8.2). One extra SPN call for high-amplitude non-collapses. Almost free, and it is what saves you when the investigation turns and the page is gone.
5. **Frontier record** (§8.3). Address + amplitude + phase + seed for every NUL'd span. One ledger line each. **This is what makes the selection defensible** — build it before you need to defend it, because it cannot be reconstructed after the fact.
6. **Attestation ladder** (§5.3). The `id_` fetch, the span check, the four states. This is where the value shows up.
7. **Merkle + anchor** (§6). Two days. Disproportionate payoff.
8. **CDX watch** (§7). The scrub detector. **This is the feature that will produce a story.**
9. **Frontier publication + ablation** (§8.5). The public answer to motivated-selection.
10. **archive.today second witness** (§4.4).
11. **Path A extension** (§3.1) — adopt ArchiveWeb.page rather than building.

Steps 3 and 5 are urgent in a way the others are not, for the same reason: **you can capture the present at any time, but you can never go back and witness the past — or reconstruct a decision you didn't log when you made it.** Every source you touch before the witness loop exists will only ever have your word behind it. Every span you pass over before the frontier record exists is a pass you can never prove you made honestly.

---

## Appendix: the sentence again

> **Custody is yours. Attestation is theirs. Never confuse the two.**

The archive can be persuaded to forget. Your bytes cannot. Build so that their forgetting is *evidence*.
