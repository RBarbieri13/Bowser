# 2026 NFL weekly warehouse

Captured September 15, 2026 from official nflverse releases. This snapshot contains Week 1: all 16 completed games and 32 teams, 363 fantasy-relevant source stat rows, and 410 snap-backed player/team/week rows. Players with recorded snaps and no offensive stat line remain available. Current roster identities also retain rookies and players with no recorded game. Their profiles have empty game logs.

`fantasy_football_2026.sqlite` is independent of the immutable `fantasy_football.sqlite` 2025 warehouse. Every stats API accepts `season=2026`; omitted season remains 2025 for API compatibility. Meta exposes `seasons`, `currentSeason`, `availableWeeks`, and `weekOptions`.

The source grain remains player, team, season type, and NFL week. `import-report-2026.json` records capture time, URLs, SHA-256 hashes, joins, coverage, and aggregate reconciliation. Committed player statistics, snap counts, and schedule CSVs permit offline row-by-row verification. Large registry, roster, depth chart, and play-by-play source caches are ignored by Git and downloaded by the importer.

The 272-game regular-season schedule includes future games with null scores and results. Actual play-by-play supplies score changes, drives, play mix, and segmented opportunity and production for completed games. **2026 play-level personnel participation is not published.** Segment snap counts are null, not zero; weekly snap counts remain available from the independent snap source. Game Breakdown metadata reports these separately.

The 407 matched 2026 preseason ADP rows retain their August 17 capture timestamp and original FantasyPros metadata. They are copied read-only from the existing warehouse. Current roster team controls upcoming matchups rather than stale draft team assignments.

Run `python3 scripts/import_nflverse_2026.py` to rebuild from caches, or add `--refresh` to fetch source updates. Run both `python3 scripts/verify_warehouse.py` and `python3 scripts/verify_warehouse_2026.py`. The current-season verifier compares every imported source statistic and weekly snap value, checks Week 1 completeness, and verifies the 2025 database hash has not changed. `node --test tests/warehouse-2026.test.mjs` exercises all season-aware query routes and unavailable-data semantics.
