# Bowser development instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable application rules

- Market Pulse is a compact combined Sleeper/ESPN table, not separate provider tabs or summary KPI cards. Every leaf column is sortable. Keep source timestamps and measurement definitions distinct, missing values explicit, and only join unambiguous player identities; never combine provider populations into an invented popularity score.

- The product name is Bowser. Use that name consistently in project metadata and product-level documentation.
- nflverse source data is immutable input. Never hand-edit warehouse values or replace imported rows with mock statistics.
- The app is read-only in this phase. Controls may query, filter, sort and select, but must not mutate player data.
- Treat fantasy points in the main table as cumulative totals for the exact selected week range, never as per-game averages.
- Keep Week 1 through the Super Bowl individually selectable. Regular season, postseason and full season are range presets, not the only choices.
- Player cards must remain warehouse-backed. Label team ordering as production order unless an authoritative depth-chart feed is connected, and never infer league membership without roster data.
- The grain of `player_week_stats` is player, team, season type and NFL week. Preserve it for future 2026 incremental loads.
- Run `npm run check` after warehouse, API or table changes. Do not weaken completeness checks to make a build pass.
- Before pushing a repository update, run `npm run check` and confirm `git status --short` contains only intended files.
- Keep external credentials out of source and local data artifacts.
- On Team Box Scores, the expanded schedule selector is optional workspace chrome and must be collapsed on initial load. Its collapsed summary must still state the active continuous week range and any independently selected matchup weeks.
- Treat continuous week-range selection and isolated matchup selection as separate, composable interactions: resizing or moving the primary range must not silently discard independent weeks, and selecting an independent week must not move the primary range.
- Distinguish opening a game breakdown from selecting that game for the comparison table with separate accessible controls and labels; never overload one click with both actions.
- Week-column width is a synchronized table-level setting. Every visible week must use the same width, and typography must scale or truncate safely without allowing values to overlap adjacent cells.
- Conditional formatting on Team Box Scores is contextual, not absolute: compare fantasy points, snaps, targets, and rushing attempts against the selected team's players in the same game/week, use a restrained green scale for relatively high values, and reserve red for zero or negative values.
- DraftKings price filtering must be disabled and explicitly labeled unavailable until a real salary feed is connected; never fabricate or infer DFS prices.
- Team Box Score column widths are semantic and synchronized: resizing a stat in the first applicable week changes that same stat in every week and position section, while identity columns resize independently with derived sticky offsets.
- Persist table widths, visible stat categories, player research markers, league-filter selections, and the bulk week-width setting in validated, versioned local storage so they survive browser restarts. Keep code-owned default stat sets immutable and always provide a reset-to-defaults action.
- Player research markers are local preferences keyed by stable player ID; they must never modify nflverse warehouse data. League filtering must remain explicitly labeled inactive until real roster ownership data is connected.
- The Game Breakdown participation console has two fixed KPI modes. Opportunity always contains four equal lanes in this order: snaps, rush attempts, pass attempts, and targets. Production always contains yards, touchdowns, receptions, and fantasy points. Bar lengths must be normalized only against the same metric across the active comparison scope; never compare one KPI's magnitude to another KPI's magnitude.
- The navigation sidebar is a persistent user-controlled width. Its minimum state must remain an icon-only rail with accessible names or tooltips for every live page; page content must reclaim the released horizontal space immediately.
- Whole-week resizing on Team Box Scores is proportional and global: dragging any exposed week-group handle changes the shared width for every visible week and every position section. Keep the compact floor usable with non-overlapping values.
- Team Box Score filters and matchup headers must pair team abbreviations with recognizable team logos. Completed matchup cards and week headers must also expose the game's combined point total.
- Keep the DraftKings placeholders compact and explicit: salary is labeled `$`, projection is labeled `FPTS`, and both remain visibly unavailable until a real source is connected.
- Player Database column groups must remain independently collapsible with a compact labeled expand rail. Section resizing proportionally changes every member column, while Auto Fit is a persistent mode that sizes currently displayed values without clipping them.
- In the Player Database, render snap, completion, and reception percentages as whole percentages. Keep upcoming matchups on two compact lines without increasing the 40px data-row height.
- The Opportunity Tracker combines the current 2026 nflverse roster and official depth-chart rank with each player's last 10 recorded games in the selected statistics season. Keep roster and statistics dates visibly distinct, include rostered rookies and players without game history, and never present a production-derived ordering as an authoritative depth rank.
- Until nflverse publishes a current 2026 practice-report injury feed, show sourced roster status and an explicit injury/news-unavailable notice. Do not fabricate injury blurbs or player news.
- Opportunity Tracker mini-bars compare values only within the same metric for the same player. Every player row must retain snaps, one position-relevant opportunity metric, and PPR fantasy points as separate scales.
- Completed Bowser application changes should be published through the repository's branch/PR workflow, merged to `main`, and verified on the permanent Vercel production URL unless Robert explicitly requests a local-only or preview-only handoff.

## Market Pulse hosted release

- Robert authorized deploying Market Pulse to the existing Bowser Vercel app on 2026-09-08. Keep unrelated main-checkout work intact.
- Hosted snapshot history belongs in browser IndexedDB (96 observations per provider/window). Vercel memory is a disposable cache, never durable storage. Keep response size independent of history length and retain browser snapshots on empty/older server responses or provider failures.
- Release is complete only after `npm run check` exits 0, a second verifier pass returns PASS, the branch is merged through a PR, and the permanent production URL passes live refresh and reload checks. Stop after three correction passes for a repeated failure; never relax tests to obtain a pass.

## Week 1 DFS layer

- Player Database DFS fields use the separately sourced 2026 Week 1 Classic snapshot in `data/dfs-week1-2026.json`. Keep historical 2025 statistics and selectable scoring independent of DraftKings projections.
- All-week and Sunday Main slates must remain distinct. Never substitute Showdown/Captain salaries or DraftKings historical AvgPointsPerGame for projections. Match stable player identities conservatively; unknown is null, not zero. Show the projection provider, capture timestamp, and current DFS team.
- Refresh through `npm run data:dfs`, which validates pinned draft groups and date coverage before atomically replacing the snapshot. `npm run check` must pass before publication. The original warehouse is immutable.

## Waivers and 2026 season release

- Waivers is a dense technical table: player details; five or more real source positional ranking columns; five or more real source FAAB columns; usage, passing, rushing/trend, receiving/trend and cumulative fantasy points. No runtime mock data or invented rankings/bids. Preserve source-native rank order, budget basis, range/operator, scoring, dates and missing values. Favorites, personal bid drafts and notes are local user preferences, never provider data mutations.
- The app defaults to current 2026 statistics with 2025 history selectable. Keep the original 2025 warehouse unchanged; all statistics/profile/box-score/game/opportunity requests carry the selected season. The 2026 Week 1 import must preserve completed-game coverage and expose unavailable participation explicitly.
- Completion requires npm run check, five-source rank/FAAB coverage tests, source-number readbacks, a second verifier pass, branch/PR merge and permanent Vercel verification. Stop after three repeated correction failures; never lower source counts or statistical checks to obtain a pass. This bounded implementation has a 180-minute review point.

## Comparable weekly trends and DFS refresh (September 16, 2026)

- Historical bars are aligned regular-season NFL calendar weeks across seasons, never independently compressed to each player's last appearances. The same x-position means the same season/week for every player. Preserve bye, DNP, rookie and missing-data gaps as null. Scalar table totals still follow the exact selected weeks.
- All trend menus share the same weekly-statistic catalogue. All players use the same zero-inclusive metric domain across the NFL history window; never normalize per player or clip outliers. Negative fantasy points extend below zero. Show season/week labels and exact values.
- Opportunity Tracker reuses the Team Box Scores schedule/range controls, with explicit year, scoring and history window. Independent matchup weeks remain distinct from the continuous range.
- Weekly positional finish ranks all NFL peers in the same position and scoring context before user filters, uses competition ranks for ties, and labels the exact week. Multiple selected weeks do not create a fake weekly aggregate rank.
- Weekly DFS refresh must validate source week, Classic slate games, price/projection provenance and identity matching before atomic publication. Preserve historical snapshots and last-good current data on failure. No historical averages substituted for projections. Automated releases stop on failed checks.

## Table controls rollback (September 17, 2026)

- Robert requested reverting the September 16 shared table-settings and expanded filter rollout. Restore the page-specific controls and layouts from before that rollout; retain the Player Database's existing column studio and the native Waivers/Team Box controls. Do not reintroduce the removed universal settings dialogs or numeric/source/identity filter panels without a new request.
- This rollback preserves sourced DFS data and archives, weekly position finishes, shared player profiles, aligned trend scales/calendars, metric/history selectors, and anchored Team Box trend columns.
