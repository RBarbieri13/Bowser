# Bowser Waivers: source research and build recommendation

**As of September 15, 2026 · NFL waiver Week 2 · research phase**

Three independent researchers investigated weekly priority/FAAB publishers, expert consensus, and platform/statistical feeds. The catalog covers 22 resources or products, including multiple services from the same publisher. Recommendations below are our assessment of fit for Bowser, not a measured accuracy ranking.

**Recommended combination:** FantasyPros for expert waiver consensus; RotoBaller for a broad priority table and FAAB ranges; Footballguys for clearly defined annual-budget bids; selected independent editorial columns for comparison; Sleeper for pickup activity; nflverse for current weekly performance. Add Yahoo platform ADP as separately labeled draft context. Faabtastic is the closest existing consumer product to the requested matrix, but it is a reference rather than an authorized ingestion source.

This document records the initial research phase. The subsequent implementation is documented in [the implementation record](implementation.md) and [the imported-source report](import-report.md); those records supersede the earlier feasibility-only status and sample capture. The [implementation contract](integration-plan.md) specifies the requested page, controls, data grain, calculations and release checks; the [structured catalog](source-catalog.json) contains exact URLs, sample values, source scope and limitations for all 22 entries.

## Strongest waiver and FAAB sources

| Source | Best contribution | What was verified / limitation |
|---|---|---|
| [FantasyPros](https://www.fantasypros.com/nfl/rankings/?scoring=PPR&type=waiver) | True expert consensus rankings, dispersion and named experts | Current PPR Week 2 preview lists nine experts. [Official API](https://www.fantasypros.com/api-data/) supports consensus/per-expert data generally; **waiver-specific API access still needs confirmation**. Free keys are sample/nonproduction. |
| [RotoBaller](https://www.rotoballer.com/waiver-wire-rankings-fantasy-football-week-2-2026/1930758) | Broad ranked table plus [tiered FAAB advice](https://www.rotoballer.com/faab-waiver-wire-advice-week-2-fantasy-pickups-2026/1931602) | 85-row Week 2 ranking table and a separate current FAAB article. Strong public HTML shape; one analyst, with different player eligibility thresholds across the two pages. |
| [Footballguys](https://www.footballguys.com/article/2026-email-feature-top-waiver-wire-pickups-week02) | Clearly denominated FAAB ranges | Public Week 2 feature explicitly uses **annual budget**; full configurable report is PRO. |
| [RotoWire](https://www.rotowire.com/football/article/fantasy-football-waiver-wire-pickups-for-week-2-134360) | Independent FAAB point estimates and positional context | Current Tuesday update readable. No numeric overall waiver ranks confirmed; budget basis not fully specified. |
| [FantasyLife](https://www.fantasylife.com/articles/fantasy/waiver-wire-pickups-faab-advice-week-2-add-jalen-coker) | League-size, scoring and superflex bid differences | Current article verified. Separate tool preview showed stale Week 1 opponents and gated values; don't treat that preview as a current dataset. |
| [CBS](https://hubapi.cbssports.com/fantasy/football/news/week-2-fantasy-football-waiver-wire-bryce-young-has-huge-opener/) | Explicit positional priority plus contextual bids | Publisher mirror opened; canonical URL failed. Recommendations use **remaining FAAB**, including lower bounds rather than exact bids. |
| [FTN](https://ftnfantasy.com/fantasy-football-waiver-wire-claims-to-make-heading-into-week-2) | Public top-five priority and FAAB ranges | Current article derives from Jeff Ratcliffe's tool. Full tool rows not verified; this is one analyst, not a consensus. |
| [DraftSharks](https://www.draftsharks.com/article/week-2-waiver-wire-pickups) | Additional positional priorities and bid ranges | Current rolling article, but displayed publication time needs timezone validation before ingestion. |
| [Yahoo / Justin Boone](https://sports.yahoo.com/fantasy/article/fantasy-football-waiver-wire-pickups-week-2-kaelon-black-denzel-boston-among-top-targets-to-add-170648838.html) | Overall priority and simple dollar bids | Week 2 indexed content found; direct article fetch returned 429. **Partial verification; do not import from search snippets.** |
| [4for4](https://www.4for4.com/2026/w2/fantasy-football-waiver-wire-week-2) | Premium prioritized report | Current article confirmed; numeric rows gated. Linked Week 1 projection cheat sheet is not current FAAB evidence. |

The catalog also includes NFL and ESPN editorial alternatives, FAABLab community data, FantasyMojo actual bid-history methodology, and a lower-confidence model-driven site. These are different kinds of evidence; they should not become indistinguishable “expert votes.”

## The closest existing consensus table

[Faabtastic](https://www.faabtastic.com/) showed a Week 2 Final Edition with **10 expert articles and 83 players**. It offers per-expert columns, counts, average and trimmed mean. Its [methodology](https://www.faabtastic.com/how-to-use) defines a $100 **starting** budget. The current full matrix costs $9.99 for the season; free summaries remain visible.

Its [terms](https://www.faabtastic.com/terms) expressly prohibit scraping, bulk downloading and republishing. A season pass does not grant Bowser a data license. Keep it as a linked research reference unless separate permission is obtained. Also retain edition metadata: the homepage and dedicated week page briefly disagreed between Early and Final editions during this research.

[FAABLab](https://www.faablab.app/about) provides crowdsourced proposed bids rather than expert rankings. Its current Week 2 interface was inspected, but no bids were submitted and no current consensus result was verified. Unsubmitted slider defaults are not consensus. Its advertised probability measures the share of individual historical bids below an amount; that is not a validated probability of winning against every opponent in a particular league.

## Why one FAAB average would be misleading

These are observed source examples for Kaelon Black in Week 2, **not a personalized bid recommendation**:

| Publisher | Published bid | Basis / conditions |
|---|---:|---|
| FantasyPros | $9; budget $5; desperate $17 | Stated $100 reference, starting/remaining not explicit |
| Footballguys | 10–20% | Annual FAAB |
| RotoBaller | 6–10% | Base tier; separate aggressive/desperation ranges; denominator unspecified |
| RotoWire | 8% | FAAB budget; starting/remaining unspecified |
| CBS | At least10% | Remaining FAAB; lower bound |

Bowser should preserve these differences in the expert columns. A 10% annual-budget recommendation means $20 on a $200 season budget; 10% remaining means $6 if only $60 remains. Neither should silently become the other's value. Keep unknown-basis recommendations visible in their original units but out of normalized consensus.

## ADP, current pickup activity and weekly statistics

| Feed | Verified feasibility | Intended role |
|---|---|---|
| [Sleeper trends](https://docs.sleeper.com/#trending-players) | Documented player-ID/count endpoint; existing Bowser adapter already handles it | Current adds/drops with explicit 6/24/72-hour window. Counts are not ownership percentages. |
| [Yahoo platform data](https://football.fantasysports.yahoo.com/f1/draftanalysis) | Public app JSON returned current 2026 ADP/draft percentage/ownership; official API requires OAuth | Optional Yahoo draft context and platform roster%. Public app routes are experimental; basic ADP scoring/window unspecified. |
| [Sleeper ADP-bearing projection endpoint](https://api.sleeper.com/projections/nfl/2026?season_type=regular) | Current records contain ADP variants but are undocumented and labeled company=rotowire | Optional, explicitly qualified draft context; filter 999 sentinels and inactive/nonrelevant players. Do not claim native draft provenance. |
| [ESPN platform data](https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leaguedefaults/3?view=kona_player_info) | Sample ownership/start% and ADP returned; experimental application API | Reuse Market Pulse ownership; separate draft context. Change interval and draft format need verification. |
| [nflverse weekly stats](https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv) | 2026 Week 1: 1,118 rows, 16 games; player/game IDs | Current passing, rushing, receiving, fantasy points and usage measures. |
| [nflverse snaps](https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2026.csv) | 2026 Week 1: 1,492 rows, 16 games; PFR IDs mapped to GSIS | Snaps and snapshare; source fraction 1 means 100%. |
| [Fantasy Nerds](https://api.fantasynerds.com/docs/nfl) | Documented 48-hour multi-platform add/drop aggregation and ADP; paid live payload not verified | Optional future licensed alternative. Public TEST data is historical, not current 2026 evidence. |

Bowser's checked baseline has only 2025 player statistics. A new 2026 layer is therefore necessary; relabeling the existing table would produce incorrect “last week” values. Current-season history presently contains one completed week, so longer current-season trends must remain unavailable until more games exist.

## Verification limits

This is source discovery and an implementation contract, not an ingestion or accuracy benchmark. Researchers opened current publisher pages and probed public feeds; independent reviewers spot-checked important sources and screened all catalog claims for unsupported conclusions. They did not independently re-fetch every sample value. Authenticated paid datasets, full premium matrices, redistribution rights and production adapters remain unverified where the catalog says so.

## Recommended page structure

Use one dense table: **Player → priority/individual experts → FAAB → pickup/roster activity → usage → production → weekly trends**. Keep waiver week and stats-week range independent. Include position/team/search, source/scoring filters, comparable-budget filters, multi-sort, column controls, saved views and watchlist.

Keep draft and DFS statistics out of the waiver table. Place the additionally requested ADP/draft data in a collapsible **Draft context** drawer. Keep global popularity separate from actual league availability until a real roster is connected. The [integration contract](integration-plan.md) contains the implementation and verification details.

Research verification: **PASS** — three research lanes returned; three independent review lenses screened23 claims;22 catalog entries passed metadata/link checks. Fresh readback reconfirmed the2026 Week1 statistics and snap releases. See [verification record](verification.json) for scope and limits.
