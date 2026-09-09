# 2026 Week 1 DraftKings salaries and projections

Captured September 9, 2026. Scoring context: DraftKings NFL Classic, full PPR with DraftKings rules. These are pregame projections and DFS salaries, not season-long auction prices or historical fantasy totals.

| Slate | Draft group | Games | Salaries | Projections | Salary matches to historical database | Projection matches |
|---|---:|---:|---:|---:|---:|---:|
| Wed–Mon, full Week 1 | 153054 | 16 | 823 | 404 | 486 | 351 |
| Sunday Main | 151307 | 12 | 744 | 379 | 382 | 324 |

Salaries are from the official DraftKings [full-week CSV](https://www.draftkings.com/lineup/getavailableplayerscsv?draftGroupId=153054) and [Sunday Main CSV](https://www.draftkings.com/lineup/getavailableplayerscsv?draftGroupId=151307), validated against the [draft-group catalogue](https://api.draftkings.com/draftgroups/v1/). Both are contest type 21, Classic; no Showdown or Captain prices are mixed in.

[Fantasy Info Central](https://www.fantasyinfocentral.com/nfl/dfs/projections/draftkings) supplies primary DraftKings-scored Week 1 projections. [Shark Snip](https://sharksnip.com/picks/dfs/nfl) supplements missing projections in its identified Week 1 Sunday main slate. No averaging is applied across models; each record retains the selected provider and its URL. DraftKings AvgPointsPerGame is historical and is deliberately not imported as a projection. Published projections are estimates and may change before kickoff.

The FantasyPros public DFS cheat sheet exposed only a sample behind its premium feature prompt, so this implementation does not depend on it. Public pages and official salary downloads required no credentials.

Matching uses a unique normalized name and position on both sides, resolving to nflverse GSIS IDs using the packaged player catalogue and 2026 roster. Team changes do not rewrite 2025 team labels; DFS cell tooltips identify the current source team and game. Ambiguous/unmatched IDs remain unmatched. Raw import evidence is stored under ignored `artifacts/dfs/`; SHA-256 hashes and source URLs remain in the committed snapshot.

The Player Database continues to show players with recorded 2025 statistics. Rookie or other slate players lacking historical rows remain in the imported snapshot but are not added as fabricated historical records. Coverage is disclosed in Sources & coverage. Missing projection or slate salary is displayed as an em dash. Selecting Sunday Main excludes Puka Nacua and other players outside that slate; the full-week selection restores their official prices.

Use **Show DFS fields** to reveal the existing `$` and `FPTS` columns. Both sort across the complete filtered database with missing values last. The **DFS slate** choice persists in this browser. Historical week/scoring controls leave the DFS snapshot unchanged.

`npm run data:dfs` performs an explicit refresh, validates current pinned Week 1 slate identity/coverage and source formats, then atomically replaces the snapshot. It intentionally fails when providers roll to another week. There is no scheduled refresh; the UI reports the capture timestamp. `npm run check` covers imported data, joins, sorting, slate exclusion, historical scoring independence, parser identity/team handling, UI behavior, and existing Bowser regressions.
