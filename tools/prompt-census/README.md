# tools/prompt-census — the terrain census of the prompt (probe P1)

Probe **P1** of [docs/prompt-as-site.md](../../docs/prompt-as-site.md): tag every band
the talker can be handed with its Site terrain, weigh the fixed instructional prose,
and compare the Ground/Figure/Pattern shares against the corpus population gradient
(the 41-language clause study, docs/eo-wiki.md "EO Lexical Analysis v2").

```
node tools/prompt-census/census.mjs           # markdown report
node tools/prompt-census/census.mjs --json    # machine-readable
```

Read-only, no dependencies, runs in under a second.

## No drift by construction

The census imports the band catalogs (`GROUNDED_BANDS`, `CURSOR_BANDS`, `CHAT_BANDS`)
from `src/model/bands.js` — the same objects the prompt builders project — and each
band's `prose` field lists the exact literals its render embeds. What is measured is
what ships. The three caller-side register cues (`LIBRARIAN_CUE`, `CAPABILITY_CUE`,
`GROUNDING_CUE`) are censused alongside: they are prompt prose the file can emit,
arriving through the `shape` slot instead of a catalog band.

## The falsifier

P1 is a probe, not a victory lap: **if the Ground row is NOT over-represented against
the gradient, §2 of docs/prompt-as-site.md dies.** The tool computes the verdict
either way and says so.

## The measurement (at the refactor commit)

Corpus (7,808 consensus clauses): Figure 78.5% > Pattern 15.3% > **Ground 6.2%**.
The prompt's fixed instructional prose: **Ground 66.4%** > Pattern 28.0% > Figure 5.7%
— the Ground row over-represented **×10.7** by prose mass (×7.7 by band count).
The population gradient is not merely exceeded; it is inverted.

This is the file-level measure (what the file can emit). The complementary
assembly-level measure (what one live turn actually hands the model) is
`terrainShares` / the `ground-inflation` verdict in `src/model/prompt-checkpoint.js`,
which the turn pipeline now computes per grounded turn as `ctx.promptVerdict`.

## What this does NOT measure

Whether the Ground-row mass **does work**. That is probe **P2** (ablate the
Atmosphere/Field bands via the projection's `probe.drop` and run the battery) — see
`tools/evalkit` for the probe harness. P1 only establishes that the sparse row is
where this prompt has been growing.
