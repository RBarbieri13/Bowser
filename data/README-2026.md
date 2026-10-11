# 2026 NFL weekly warehouse

Refreshed October 10, 2026 (America/Chicago) from official nflverse releases.
Weeks 1–4 are complete: 64 games, all 32 teams each week, including weekly
statistics, snap counts and play-by-play. The completed Week 5 Thursday game is
also imported; Week 5 is partial (1 of 15 scheduled games). Missing future game
statistics remain unavailable.

Week 4 has 415 snap-backed player/team records and 365 offensive statistical
source rows. Across the entire capture: 1,722 snap-backed rows, 1,484 statistical
source rows, 65 completed games. Every source statistic and snap reconciles.
The importer also includes upstream corrections to earlier weeks; raw source
CSVs and capture hashes preserve provenance without hand-editing source values.

Player Database starts at the latest fully sourced week (Week 4), retaining the
three-week display default. Choose Weeks back = 4 for cumulative Weeks 1–4.
Week 5 remains selectable and is labeled partial.

`fantasy_football_2026.sqlite` is independent of the immutable `fantasy_football.sqlite` 2025 warehouse. Every stats API accepts `season=2026`; omitted season remains 2025 for API compatibility. Meta exposes `seasons`, `currentSeason`, `availableWeeks`, and `weekOptions`.

The source grain remains player, team, season type, and NFL week. `import-report-2026.json` records capture time, URLs, SHA-256 hashes, joins, coverage, and aggregate reconciliation. Committed player statistics, snap counts, and schedule CSVs permit offline row-by-row verification. Large registry, roster, depth chart, and play-by-play source caches are ignored by Git and downloaded by the importer.

The 272-game regular-season schedule includes future games with null scores and results. Actual play-by-play supplies score changes, drives, play mix, and segmented opportunity and production for completed games. **2026 play-level personnel participation is not published.** Segment snap counts are null, not zero; weekly snap counts remain available from the independent snap source. Game Breakdown metadata reports these separately.

The 407 matched 2026 preseason ADP rows retain their August 17 capture timestamp and original FantasyPros metadata. They are copied read-only from the existing warehouse. Current roster team controls upcoming matchups rather than stale draft team assignments.

Run `python3 scripts/import_nflverse_2026.py` to rebuild from caches, or add `--refresh` to fetch source updates. Run both `python3 scripts/verify_warehouse.py` and `python3 scripts/verify_warehouse_2026.py`. The current-season verifier compares every imported source statistic and weekly snap value, checks complete Weeks 1–4, and verifies the 2025 database hash has not changed. `node --test tests/warehouse-2026.test.mjs` exercises all season-aware query routes and unavailable-data semantics.
