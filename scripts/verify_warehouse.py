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
        "games": connection.execute("SELECT COUNT(*) FROM games").fetchone()[0],
        "games_with_play_by_play": connection.execute("SELECT COUNT(*) FROM games WHERE play_by_play_available = 1").fetchone()[0],
        "game_team_rows": connection.execute("SELECT COUNT(*) FROM game_team_summary").fetchone()[0],
        "quarter_score_rows": connection.execute("SELECT COUNT(*) FROM game_quarter_scores").fetchone()[0],
        "game_flow_events": connection.execute("SELECT COUNT(*) FROM game_flow_events").fetchone()[0],
        "game_drives": connection.execute("SELECT COUNT(*) FROM game_drives").fetchone()[0],
        "games_with_drives": connection.execute("SELECT COUNT(DISTINCT game_id) FROM game_drives").fetchone()[0],
        "invalid_drives": connection.execute("SELECT COUNT(*) FROM game_drives WHERE plays < 0 OR pass_plays < 0 OR run_plays < 0 OR top_min < 0 OR own_start NOT BETWEEN 0 AND 100 OR score_after = ''").fetchone()[0],
        "game_team_segments": connection.execute("SELECT COUNT(*) FROM game_team_segments").fetchone()[0],
        "player_game_segments": connection.execute("SELECT COUNT(*) FROM player_game_segments").fetchone()[0],
        "invalid_player_segments": connection.execute("SELECT COUNT(*) FROM player_game_segments WHERE segment NOT BETWEEN 0 AND 5 OR snaps < 0 OR rush_attempts < 0 OR pass_attempts < 0 OR targets < 0 OR touchdowns < 0 OR receptions < 0").fetchone()[0],
        "segment_pass_attempts": connection.execute("SELECT SUM(pass_attempts) FROM player_game_segments").fetchone()[0],
        "segment_targets": connection.execute("SELECT SUM(targets) FROM player_game_segments").fetchone()[0],
        "invalid_game_totals": connection.execute("SELECT COUNT(*) FROM games WHERE home_score < 0 OR away_score < 0").fetchone()[0],
        "invalid_play_mix": connection.execute("SELECT COUNT(*) FROM game_team_summary WHERE offensive_plays <> rush_plays + pass_plays OR ABS(COALESCE(rush_pct, 0) + COALESCE(pass_pct, 0) - 100) > 0.2").fetchone()[0],
        "invalid_time_share": connection.execute("SELECT COUNT(*) FROM game_team_summary WHERE ABS(COALESCE(pct_time_leading, 0) + COALESCE(pct_time_trailing, 0) + COALESCE(pct_time_tied, 0) - 100) > 0.2").fetchone()[0],
        "draft_rankings": connection.execute("SELECT COUNT(*) FROM draft_rankings WHERE season = 2026 AND scoring = 'PPR'").fetchone()[0],
        "invalid_draft_rankings": connection.execute("SELECT COUNT(*) FROM draft_rankings WHERE adp <= 0 OR position_rank <= 0 OR position NOT IN ('QB', 'RB', 'WR', 'TE')").fetchone()[0],
        "orphan_draft_rankings": connection.execute("SELECT COUNT(*) FROM draft_rankings d LEFT JOIN players p ON p.player_id = d.player_id WHERE p.player_id IS NULL").fetchone()[0],
        "draft_ranking_metadata": connection.execute("SELECT COUNT(*) FROM warehouse_meta WHERE key = 'fantasypros_adp_summary'").fetchone()[0],
        "upcoming_schedule_rows": connection.execute("SELECT COUNT(*) FROM team_schedule WHERE season = 2026 AND season_type = 'REG'").fetchone()[0],
        "invalid_upcoming_schedule": connection.execute("SELECT COUNT(*) FROM team_schedule WHERE opponent = '' OR team = '' OR home_away NOT IN ('home', 'away') OR kickoff_utc IS NULL").fetchone()[0],
        "yahoo_metrics_table": connection.execute("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'yahoo_player_metrics'").fetchone()[0],
        "yahoo_ownership_table": connection.execute("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'yahoo_league_ownership'").fetchone()[0],
        "current_roster_rows": connection.execute("SELECT COUNT(*) FROM team_roster WHERE season = 2026").fetchone()[0],
        "current_roster_teams": connection.execute("SELECT COUNT(DISTINCT team) FROM team_roster WHERE season = 2026").fetchone()[0],
        "current_rookies": connection.execute("SELECT COUNT(*) FROM team_roster WHERE season = 2026 AND rookie_year = 2026").fetchone()[0],
        "invalid_roster_rows": connection.execute("SELECT COUNT(*) FROM team_roster WHERE full_name = '' OR team = '' OR position NOT IN ('QB', 'RB', 'WR', 'TE') OR depth_rank < 1").fetchone()[0],
        "duplicate_roster_rows": connection.execute("SELECT COUNT(*) FROM (SELECT 1 FROM team_roster GROUP BY season, team, player_id HAVING COUNT(*) > 1)").fetchone()[0],
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
        "games": checks["games"] == report["games"] == 285,
        "games_with_play_by_play": checks["games_with_play_by_play"] == report["games_with_play_by_play"] == 285,
        "game_team_rows": checks["game_team_rows"] == checks["games"] * 2,
        "quarter_score_rows": checks["quarter_score_rows"] >= checks["games"] * 4,
        "game_flow_events": checks["game_flow_events"] == report["game_flow_events"] and checks["game_flow_events"] > 3000,
        "game_drives": checks["game_drives"] == report["game_drives"] and checks["game_drives"] > 5000,
        "games_with_drives": checks["games_with_drives"] == checks["games"],
        "invalid_drives": checks["invalid_drives"] == 0,
        "game_team_segments": checks["game_team_segments"] == report["game_team_segments"] == checks["games"] * 2 * 6,
        "player_game_segments": checks["player_game_segments"] == report["player_game_segments"] and checks["player_game_segments"] > 30000,
        "invalid_player_segments": checks["invalid_player_segments"] == 0,
        "segment_pass_attempts": checks["segment_pass_attempts"] > 15000,
        "segment_targets": checks["segment_targets"] > 15000,
        "invalid_game_totals": checks["invalid_game_totals"] == 0,
        "invalid_play_mix": checks["invalid_play_mix"] == 0,
        "invalid_time_share": checks["invalid_time_share"] == 0,
        "draft_rankings": checks["draft_rankings"] >= 400,
        "invalid_draft_rankings": checks["invalid_draft_rankings"] == 0,
        "orphan_draft_rankings": checks["orphan_draft_rankings"] == 0,
        "draft_ranking_metadata": checks["draft_ranking_metadata"] == 1,
        "upcoming_schedule_rows": checks["upcoming_schedule_rows"] == 544,
        "invalid_upcoming_schedule": checks["invalid_upcoming_schedule"] == 0,
        "yahoo_metrics_table": checks["yahoo_metrics_table"] == 1,
        "yahoo_ownership_table": checks["yahoo_ownership_table"] == 1,
        "current_roster_rows": checks["current_roster_rows"] == report["current_roster_rows"] and checks["current_roster_rows"] >= 500,
        "current_roster_teams": checks["current_roster_teams"] == report["current_roster_teams"] == 32,
        "current_rookies": checks["current_rookies"] == report["current_rookies"] and checks["current_rookies"] > 100,
        "invalid_roster_rows": checks["invalid_roster_rows"] == 0,
        "duplicate_roster_rows": checks["duplicate_roster_rows"] == 0,
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
