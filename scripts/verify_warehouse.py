#!/usr/bin/env python3
"""Deterministically validate the local 2025 nflverse warehouse."""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "fantasy_football.sqlite"
REPORT_PATH = ROOT / "data" / "import-report.json"


def main() -> int:
    if not DB_PATH.exists() or not REPORT_PATH.exists():
        print("WAREHOUSE FAIL: database or import report is missing", file=sys.stderr)
        return 1
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    connection = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    checks = {
        "integrity": connection.execute("PRAGMA integrity_check").fetchone()[0],
        "foreign_keys": connection.execute("PRAGMA foreign_key_check").fetchall(),
        "row_count": connection.execute("SELECT COUNT(*) FROM player_week_stats").fetchone()[0],
        "player_count": connection.execute("SELECT COUNT(DISTINCT player_id) FROM player_week_stats").fetchone()[0],
        "regular_weeks": connection.execute("SELECT COUNT(DISTINCT week) FROM player_week_stats WHERE season_type = 'REG'").fetchone()[0],
        "postseason_weeks": connection.execute("SELECT COUNT(DISTINCT week) FROM player_week_stats WHERE season_type = 'POST'").fetchone()[0],
        "passing_attempts": connection.execute("SELECT SUM(attempts) FROM player_week_stats").fetchone()[0],
        "rushing_attempts": connection.execute("SELECT SUM(carries) FROM player_week_stats").fetchone()[0],
        "targets": connection.execute("SELECT SUM(targets) FROM player_week_stats").fetchone()[0],
        "snap_rows": connection.execute("SELECT COUNT(*) FROM player_week_stats WHERE source_snap_counts = 1").fetchone()[0],
        "player_stat_rows": connection.execute("SELECT COUNT(*) FROM player_week_stats WHERE source_player_stats = 1").fetchone()[0],
        "matched_stat_rows": connection.execute("SELECT COUNT(*) FROM player_week_stats WHERE source_player_stats = 1 AND source_snap_counts = 1").fetchone()[0],
        "duplicate_grains": connection.execute("SELECT COUNT(*) FROM (SELECT 1 FROM player_week_stats GROUP BY season, season_type, week, player_id, team HAVING COUNT(*) > 1)").fetchone()[0],
        "orphan_players": connection.execute("SELECT COUNT(*) FROM player_week_stats s LEFT JOIN players p ON p.player_id = s.player_id WHERE p.player_id IS NULL").fetchone()[0],
        "invalid_arithmetic": connection.execute("SELECT COUNT(*) FROM player_week_stats WHERE completions > attempts OR receptions > targets OR attempts < 0 OR carries < 0 OR targets < 0 OR offense_snaps < 0 OR offense_pct < 0 OR offense_pct > 1").fetchone()[0],
        "ppr_identity_errors": connection.execute("SELECT COUNT(*) FROM player_week_stats WHERE source_player_stats = 1 AND ABS(fantasy_points_ppr - fantasy_points - receptions) > 0.001").fetchone()[0],
    }
    connection.close()
    expectations = {
        "integrity": checks["integrity"] == "ok",
        "foreign_keys": checks["foreign_keys"] == [],
        "row_count": checks["row_count"] == report["rows"],
        "player_count": checks["player_count"] == report["players"] == 609,
        "regular_weeks": checks["regular_weeks"] == 18,
        "postseason_weeks": checks["postseason_weeks"] == 4,
        "passing_attempts": checks["passing_attempts"] > 15000,
        "rushing_attempts": checks["rushing_attempts"] > 10000,
        "targets": checks["targets"] > 15000,
        "snap_rows": checks["snap_rows"] == report["snap_rows"],
        "player_stat_rows": checks["player_stat_rows"] == report["player_stat_rows"] == 5630,
        "matched_stat_rows": checks["matched_stat_rows"] == report["stat_rows_with_snap_match"] == 5630,
        "duplicate_grains": checks["duplicate_grains"] == 0,
        "orphan_players": checks["orphan_players"] == 0,
        "invalid_arithmetic": checks["invalid_arithmetic"] == 0,
        "ppr_identity_errors": checks["ppr_identity_errors"] == 0,
    }
    failures = [name for name, passed in expectations.items() if not passed]
    print(json.dumps({"checks": checks, "expectations": expectations}, indent=2, sort_keys=True))
    if failures:
        print("WAREHOUSE FAIL: " + ", ".join(failures), file=sys.stderr)
        return 1
    print("WAREHOUSE PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
