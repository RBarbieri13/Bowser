# Weekly DFS archive and data coverage — September 16, 2026

Bowser now stores verified DFS captures in `data/dfs_archive.sqlite`, independently of the immutable nflverse statistics warehouses. It retains the original 2026 Week 1 captures and multiple Week 2 versions. It does not manufacture missing 2025 projections or reuse 2026 salaries for a historical week.

## Verified sources and coverage

- Official DraftKings [NFL lobby](https://www.draftkings.com/lobby/getcontests?sport=NFL) identifies upcoming Classic contest groups. The [all-week Week 2 salary CSV](https://www.draftkings.com/lineup/getavailableplayerscsv?draftGroupId=153427) contains 812 salaries, of which 752 match unique current nflverse identities. Other slates remain separately selectable; Showdown/Captain values are excluded.
- [Fantasy Info Central](https://www.fantasyinfocentral.com/nfl/dfs/projections/draftkings) supplies 192 Week 2 offensive projections. Its exact season/week, dated matchups, publication freshness and every scheduled team's QB/RB/WR/TE coverage are validated. These values remain the primary source.
- [Fantasy Sports Central](https://fantasysportscentral.com/football/dfscheat.php) exposes 395 offensive projection rows plus defenses. Its complete dated schedule must match the target NFL week. A value fills a missing FIC projection only when name, position, team, game and official salary match. This added 206 projections: 398 total, including 394 players with stable warehouse identities. Example: Carson Wentz gains a sourced 14.95 projection, while Jahmyr Gibbs retains FIC's 23.1.
- FSC does not expose a reliable publication timestamp. `projectionSourceDate` remains null, and `projectionCapturedAt` records retrieval. The two timestamps are never conflated.
- [League Station](https://www.leaguestation.com/guides/nfl-data) advertises paid historical salary downloads covering 2014–2025. No purchase was made, and no verified complete free historical pregame projection archive was established. Accordingly, missing historical captures remain explicitly unavailable. Original 2025 actual statistics remain intact.

## Storage and lookup

`dfs_captures` records season, week, slate ID, capture time, source metadata and content hash. `dfs_prices` stores each DraftKings player ID, stable nflverse identity where known, salary, projection and full provenance for that capture. Identical source content is idempotent; changed content appends a new version. Capture IDs can be selected explicitly to reproduce earlier projections.

Updates validate the entire snapshot before writing. An exclusive archive lock, temporary database, SQLite transaction, integrity/foreign-key checks and atomic replacement protect the last good archive. Existing capture rows are not replaced. The shipped JSON snapshots remain a read fallback if the archive is unavailable.

`GET /api/v1/dfs-archive?season=2026&week=2` returns the largest Classic slate for exactly that week and lists available captures. Optional `slateId`, `captureId` and `playerId` narrow the request. A missing week or requested capture yields empty data and an explicit reason, never the current slate.

Team Box rows receive exact-week DFS and NFL-wide positional finishes. Upcoming salary rows have `played:false`, `stats_available:false`, and null actual statistics and positional finish. Opportunity defaults to explicitly labeled current DFS and accepts `dfsSlate=selected-week`; Player Database accepts that selection too. Positional finishes always rank peers across the NFL before team filters, with tied point totals sharing rank.

Profile and Team Box chart APIs support 5, 8, 10 and 18 aligned regular-season weeks. Team Box `trendAnchors=3,4` returns separate histories and shared domains for each anchor. Upcoming anchors end at the latest completed regular-season week. Null bye/DNP/unavailable slots stay in the common calendar.

`GET /api/v1/player-identity` conservatively resolves a unique normalized name with optional team and position. Ambiguous and unknown names return no match. Known rostered players without selected-season stats retain a meaningful profile and an explicit empty-state reason.

## Weekly operation

Run `npm run data:dfs` to fetch and validate current unlocked Classic slates, update the dated JSON snapshot and append archive captures. Run `python3 scripts/import_dfs_weekly.py --verify` for offline validation of both outputs. `python3 scripts/dfs_archive.py` is an idempotent migration/backfill from the retained JSON snapshots.

The importer exits nonzero for incomplete primary coverage, wrong weeks, stale primary projections, malformed prices, ambiguous salary populations or transport failures. No release should proceed on nonzero status. A failed optional supplemental provider is reported explicitly while the complete primary-source checks still apply. Historical captures and prior values remain available. Scheduler activation and production deployment are handled by the integrating release task.
