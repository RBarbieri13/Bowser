# Bowser Waivers integration contract

Prepared September 15, 2026. Research phase; no Waivers route or production change has been made. Repository baseline: origin/main 81c4e46. This plan preserves the user's requested dense statistics workbench and records concrete implementation requirements.

## Page and controls

Add `#/waivers` and a Waivers navigation item alongside Player Database and Market Pulse. Use a single horizontally scrollable, compact table with sticky player identity and two-level column headings. Individual experts occupy columns; do not replace the table with cards. Reuse the existing table's column sizing, collapsed sections, saved views, row density, multi-sort, search, position/team filters, research markers, and stats/trend formatting. Waivers preferences need their own versioned storage key so they do not alter the Player Database.

Keep two independent date controls: **Waiver week** selects recommendations for the upcoming NFL week; **Stats weeks** selects completed game weeks. Initial current scope is 2026 waiver Week 2 with statistics from Week 1. Changing historical-stat scoring must not silently relabel a publisher's ranking or FAAB format. Only offer recommendation weeks actually captured; distinguish unpublished, unavailable and a published list that did not rank the player.

| Column group | Fields |
|---|---|
| Player | Watchlist, player, current team, position, next opponent; league availability only when a real roster is connected |
| Priority | Source consensus rank, position rank when published, expert count, best/worst rank, source disagreement; separate columns for each verified expert |
| FAAB | Each source's recommended low/high or point bid, denominator badge, optional compatible-source median/range, converted dollars for user's budget |
| Activity | Sleeper adds/drops and window; ESPN roster/start %, measured change and observation interval; Yahoo metrics when supported access is connected |
| Usage | Games, snaps, snap %, targets, carries, pass attempts, optional target/rush shares with explicit denominator |
| Production | Passing completions/yards/TD/INT; rushing attempts/yards/TD; receptions/yards/TD; fumbles lost; PPR/half/standard points for exact selected weeks |
| Trends | Per-week snaps, targets/carries, yards, fantasy points; aggregate recent window and difference from preceding non-overlapping window |

No draft or DFS columns in the main waiver table. Put the additionally requested Yahoo/Sleeper/other ADP in an optional **Draft context** drawer with source, scoring, format, season, as-of date, average pick and draft percentage when available. ADP is preseason context, not a current waiver recommendation. Auction draft dollars are not FAAB dollars. The drawer resolves the user's request for draft context while keeping draft statistics out of the waiver table.

## Source and calculation rules

- Preserve publisher rankings. Do not present article order, a player heading or a list sorted by position as a published overall rank.
- Preserve the source's scoring, league size, redraft/dynasty, 1QB/superflex, and original-versus-remaining FAAB basis. Guillotine advice is a separate format and must never enter redraft consensus.
- Convert a source bid of d dollars on a stated B-dollar reference budget to 100*d/B percent. If starting-budget basis is confirmed, display user dollars as percent*userStartingBudget/100. If remaining-budget basis is confirmed, use userRemainingBudget. Never infer which budget the author meant. Unknown basis remains a source-native number excluded from cross-source averages.
- Suggested display uses a median of comparable independent source point bids (at least three); retain original ranges instead of silently treating midpoints as advice. Any derived midpoint must be labeled. Show count and min/max. This is a Bowser calculation, not a publisher's consensus or a guaranteed winning bid. Actual dollars follow league bid increments; never round the source value itself.
- Avoid double counting: a syndicated article has one authoring source; FantasyPros ECR or Faabtastic aggregate must not count again alongside its constituent experts in a Bowser expert average. If constituent identity is unknown, keep aggregate columns separate.
- Absence from a top-N activity/ranking list is unknown, not zero. Explicit zero bids are valid. Byes, inactive players, missing stats and zero production are different states. A rookie or player without a historical-stat match must remain in the target list.
- Global roster percentages do not establish availability in Robert's league. Keep league filters inactive until real league ownership is connected. Do not blend raw activity counts across providers or invent a single heat score. Useful transparent filters: at least N expert mentions, rostered below X% on a named platform, top-N adds, FAAB interval, position, team, minimum snaps/targets and watchlist.
- Preserve source capture times and edition IDs. No live changes should overwrite an old waiver-week snapshot. With only Week 1 completed, multi-week current-season trends are unavailable; never borrow 2025 games without an explicitly separate historical view.

## Data contract

Use separate append-only snapshot records rather than extending a player row with permanently mutable 'current' rank/bid columns:

```text
source_snapshot(id, provider, url, season, waiver_week, published_at,
 captured_at, edition, content_hash, status, access_basis)
waiver_observation(snapshot_id, provider_player_id, canonical_player_id?,
 source_player_name, source_team, expert_id?, ranking_kind,
 overall_rank?, position_rank?, rank_best?, rank_worst?, rank_mean?, expert_count?,
 bid_low?, bid_high?, bid_unit, budget_basis, reference_budget?,
 scoring?, league_size?, format?, authoring_source_id, match_status)
activity_observation(provider, provider_player_id, captured_at, window_hours?,
 adds?, drops?, roster_pct?, start_pct?, previous_at?)
weekly_player_stat(season, season_type, week, player_id, team, ...source_stats)
adp_observation(provider, provider_player_id, season, captured_at,
 scoring?, league_size?, format?, average_pick?, draft_pct?, auction_cost?)
```

Use provider IDs mapped to GSIS where available, then reviewed unique identity matches. A changed or erroneous source team must not silently connect two people; retain the provider's identity and display unmatched candidates with unknown stats. Defense rows need team keys; K/DST may have waiver ranks without the offensive Player Database's stat schema. Do not coerce their statistics into QB/RB/WR/TE fields.

## Existing code and necessary changes

- `src/AppHeader.jsx` owns navigation; `src/App.jsx` owns hash routes and the current Player Database table. Add a focused `Waivers.jsx` route; extract reusable table controls/renderers only as necessary. `src/playerTableColumns.js` already has usage, passing, rushing, receiving, fantasy and advanced groups. Waivers must use an explicit group allowlist that excludes draft, Yahoo private roster fields until connected, and DFS.
- `server/stats-store.mjs::queryPlayers` currently hardcodes 2025. The read-only warehouse contains 7,525 player-week rows / 609 distinct players, solely 2025, weeks 1–22; `team_roster` contains 1,005 rows for 2026. These counts were queried on September 15. Updating only the page's season label would be incorrect.
- Import the verified 2026 weekly stats and snaps into a separate season-aware layer. Preserve immutable 2025 warehouse inputs and existing behavior. Join on player/team/week and validate snap identity mappings; stats cover defensive players too, while this table needs explicit position scoping. Retain unloaded or unmatched candidates.
- `server/market-pulse.mjs` already implements Sleeper add/drop and ESPN roster/start normalization, 15-minute cache, source-specific time windows, and conservative missing values. Reuse provider services rather than issuing duplicate requests per page.
- `scripts/import_fantasypros_adp.py` currently imports a captured 2026 PPR ADP file. It does not provide current Yahoo/Sleeper platform ADP or a general waiver source. Existing `shared/yahoo-fantasy-integration.md` has a Yahoo ownership plan; use current official docs for new implementation.
- Persist approved, attributed public recommendation snapshots in a dedicated JSON/data store; keep authenticated provider credentials server-side. Browser IndexedDB can retain personal activity history, but disposable Vercel memory cannot serve as the durable weekly recommendation archive.

## Delivery gates

1. A source adapter can retrieve actual current data and has an appropriate access path for the intended deployment; development sample data never ships as current advice.
2. Validate season/week, numeric ranges, budget basis, unique source/author IDs, duplicate players, missing values and source dates. Fail a bad import atomically, retaining the last valid dated snapshot.
3. Test differing $100/$200 budgets, remaining-budget bids, explicit zero, unknown denominator, non-overlapping stat windows, unranked/unmatched rookies, bye/missing stats, position scope, source duplicates and edition changes.
4. Test sorting/filtering, independent week controls, preference isolation, source links and table responsiveness. Run existing `npm run check` without weakening warehouse or performance checks.
5. Independent release verification; branch/PR merge; fresh readback on the permanent Vercel URL. Research completion does not count as a deployed Waivers page.

The next implementation can start with verified public statistical/activity feeds and reviewed numeric editorial observations. Full expert matrices require the applicable provider export/API or permission; personal subscriptions alone do not establish republication rights. No purchases, accounts, messages, automated schedules or deployments were performed during this research phase.
