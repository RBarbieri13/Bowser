# nflverse 2025 warehouse source record

As of 2026-08-10, Bowser uses local snapshots of the nflverse 2025 weekly player-statistics, player-registry, and snap-count releases.

| Asset | Upstream release | Local SHA-256 |
| --- | --- | --- |
| Weekly player statistics | [`stats_player_week_2025.csv`](https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv) | `40b67b296fda02c7f628741d4aa471208352dd42fb670d4854e7ba95295af1a6` |
| Snap counts | [`snap_counts_2025.csv`](https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2025.csv) | `80b02a6e511aa20283551cae622b29ba4d0a6f006c489a2d91591fcad33792e7` |
| Player registry | [`players.csv`](https://github.com/nflverse/nflverse-data/releases/download/players/players.csv) | `ecff9f13a9691443a2e08c8d638542147a547ab05baabd2bb777fdbdeb3eee78` |

The machine-readable import manifest is [`../../../data/import-report.json`](../../../data/import-report.json). The importer preserves the complete upstream CSV files in `data/raw/`, promotes every field needed by the reference table into SQLite, normalizes postseason game types (`WC`, `DIV`, `CON`, `SB`) to `POST`, and verifies all 5,630 relevant player-stat rows have a snap-count match.

Attribution: data from [nflverse](https://github.com/nflverse/nflverse-data) under CC BY 4.0. Snap counts are distributed by nflverse from Pro Football Reference data.
