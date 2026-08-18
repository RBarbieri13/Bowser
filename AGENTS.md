# Bowser development instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable application rules

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
- The Opportunity Tracker combines the current 2026 nflverse roster and official depth-chart rank with each player's last 10 recorded 2025 NFL games. Keep those seasons visibly distinct, include rostered rookies and players without game history, and never present a production-derived ordering as an authoritative depth rank.
- Until nflverse publishes a current 2026 practice-report injury feed, show sourced roster status and an explicit injury/news-unavailable notice. Do not fabricate injury blurbs or player news.
- Opportunity Tracker mini-bars compare values only within the same metric for the same player. Every player row must retain snaps, one position-relevant opportunity metric, and PPR fantasy points as separate scales.
- Completed Bowser application changes should be published through the repository's branch/PR workflow, merged to `main`, and verified on the permanent Vercel production URL unless Robert explicitly requests a local-only or preview-only handoff.
