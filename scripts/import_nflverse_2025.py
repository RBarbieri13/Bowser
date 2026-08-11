#!/usr/bin/env python3
"""Build a local 2025 NFL offensive fantasy warehouse from official nflverse releases."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sqlite3
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
DB_PATH = DATA_DIR / "fantasy_football.sqlite"
REPORT_PATH = DATA_DIR / "import-report.json"

SOURCES = {
    "player_stats": "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv",
    "snap_counts": "https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2025.csv",
    "players": "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv",
}

OFFENSIVE_SIGNALS = (
    "attempts", "completions", "passing_yards", "passing_tds", "passing_interceptions",
    "carries", "rushing_yards", "rushing_tds", "targets", "receptions",
    "receiving_yards", "receiving_tds", "passing_2pt_conversions",
    "rushing_2pt_conversions", "receiving_2pt_conversions",
)

POSTSEASON_GAME_TYPES = {"WC", "DIV", "CON", "SB", "POST"}
REVIEWED_PFR_ALIASES = {
    # nflverse players uses Nate Carter while the PFR snap feed uses Nathan Carter.
    "CartNa00": "00-0040547",
}

STAT_FIELDS = (
    "completions", "attempts", "passing_yards", "passing_tds", "interceptions", "sacks_suffered",
    "passing_first_downs", "passing_2pt_conversions", "carries", "rushing_yards",
    "rushing_tds", "rushing_first_downs", "rushing_2pt_conversions", "receptions",
    "targets", "receiving_yards", "receiving_tds", "receiving_first_downs",
    "receiving_2pt_conversions", "receiving_air_yards", "receiving_yards_after_catch",
    "special_teams_tds", "fantasy_points", "fantasy_points_ppr",
)

REAL_FIELDS = {
    "passing_yards", "rushing_yards", "receiving_yards", "receiving_air_yards",
    "receiving_yards_after_catch", "fantasy_points", "fantasy_points_ppr",
}

SOURCE_FIELD = {"interceptions": "passing_interceptions"}


def number(value: str | None) -> float:
    if value in (None, "", "NA", "NaN"):
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def integer(value: str | None) -> int:
    return int(round(number(value)))


def download(name: str, url: str, refresh: bool) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"{name}.csv"
    if path.exists() and not refresh:
        return path
    temporary = path.with_suffix(".csv.part")
    request = urllib.request.Request(url, headers={"User-Agent": "local-fantasy-football-warehouse/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as handle:
        while chunk := response.read(1024 * 1024):
            handle.write(chunk)
    temporary.replace(path)
    return path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relevant_offensive_row(row: dict[str, str]) -> bool:
    return any(number(row.get(field)) != 0 for field in OFFENSIVE_SIGNALS)


def source_value(row: dict[str, str], field: str) -> str | None:
    return row.get(SOURCE_FIELD.get(field, field))


def load_sources(refresh: bool):
    paths = {name: download(name, url, refresh) for name, url in SOURCES.items()}
    players_by_gsis: dict[str, dict[str, str]] = {}
    gsis_by_pfr: dict[str, str] = {}
    with paths["players"].open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            player_id = row.get("gsis_id", "")
            if not player_id:
                continue
            players_by_gsis[player_id] = row
            if row.get("pfr_id"):
                gsis_by_pfr[row["pfr_id"]] = player_id

    stats: dict[tuple[str, str, int, str], dict[str, str]] = {}
    player_id_by_game_team_name: dict[tuple[str, str, str], str | None] = {}
    relevant_ids: set[str] = set()
    raw_totals = defaultdict(float)
    with paths["player_stats"].open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row.get("season") != "2025" or row.get("season_type") not in {"REG", "POST"}:
                continue
            if not relevant_offensive_row(row):
                continue
            player_id = row.get("player_id", "")
            if not player_id:
                continue
            relevant_ids.add(player_id)
            team = row.get("team", "") or "UNK"
            stats[(row["season_type"], player_id, integer(row["week"]), team)] = row
            name_key = (row.get("game_id", ""), team, row.get("player_display_name", ""))
            if all(name_key):
                existing = player_id_by_game_team_name.get(name_key)
                player_id_by_game_team_name[name_key] = player_id if existing in (None, player_id) else None
            for field in STAT_FIELDS:
                raw_totals[field] += number(source_value(row, field))

    snaps: dict[tuple[str, str, int, str], dict[str, str]] = {}
    unmatched_snap_ids: set[str] = set()
    join_method_counts = defaultdict(int)
    with paths["snap_counts"].open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            game_type = row.get("game_type", "")
            if row.get("season") != "2025" or game_type not in {"REG", *POSTSEASON_GAME_TYPES}:
                continue
            season_type = "REG" if game_type == "REG" else "POST"
            pfr_id = row.get("pfr_player_id", "")
            player_id = gsis_by_pfr.get(pfr_id)
            join_method = "player_registry"
            if not player_id:
                name_key = (row.get("game_id", ""), row.get("team", "") or "UNK", row.get("player", ""))
                player_id = player_id_by_game_team_name.get(name_key)
                join_method = "exact_name_reviewed"
            if not player_id:
                player_id = REVIEWED_PFR_ALIASES.get(pfr_id)
                join_method = "reviewed_alias"
            if not player_id:
                if pfr_id:
                    unmatched_snap_ids.add(pfr_id)
                continue
            if player_id not in relevant_ids:
                continue
            team = row.get("team", "") or "UNK"
            row["_join_method"] = join_method
            snaps[(season_type, player_id, integer(row["week"]), team)] = row
            join_method_counts[join_method] += 1

    return (
        paths, players_by_gsis, stats, snaps, relevant_ids, raw_totals,
        sorted(unmatched_snap_ids), dict(join_method_counts),
    )


SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE players (
    player_id TEXT PRIMARY KEY,
    pfr_player_id TEXT,
    display_name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    position TEXT,
    position_group TEXT,
    latest_team TEXT,
    headshot_url TEXT
);

CREATE TABLE player_week_stats (
    season INTEGER NOT NULL,
    season_type TEXT NOT NULL CHECK (season_type IN ('REG', 'POST')),
    week INTEGER NOT NULL,
    player_id TEXT NOT NULL REFERENCES players(player_id),
    team TEXT NOT NULL,
    pfr_player_id TEXT,
    player_display_name TEXT NOT NULL,
    player_name TEXT,
    position TEXT,
    position_group TEXT,
    headshot_url TEXT,
    opponent_team TEXT,
    played INTEGER NOT NULL DEFAULT 0,
    completions INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    passing_yards REAL NOT NULL DEFAULT 0,
    passing_tds INTEGER NOT NULL DEFAULT 0,
    interceptions INTEGER NOT NULL DEFAULT 0,
    sacks_suffered INTEGER NOT NULL DEFAULT 0,
    passing_first_downs INTEGER NOT NULL DEFAULT 0,
    passing_2pt_conversions INTEGER NOT NULL DEFAULT 0,
    carries INTEGER NOT NULL DEFAULT 0,
    rushing_yards REAL NOT NULL DEFAULT 0,
    rushing_tds INTEGER NOT NULL DEFAULT 0,
    rushing_first_downs INTEGER NOT NULL DEFAULT 0,
    rushing_2pt_conversions INTEGER NOT NULL DEFAULT 0,
    receptions INTEGER NOT NULL DEFAULT 0,
    targets INTEGER NOT NULL DEFAULT 0,
    receiving_yards REAL NOT NULL DEFAULT 0,
    receiving_tds INTEGER NOT NULL DEFAULT 0,
    receiving_first_downs INTEGER NOT NULL DEFAULT 0,
    receiving_2pt_conversions INTEGER NOT NULL DEFAULT 0,
    receiving_air_yards REAL NOT NULL DEFAULT 0,
    receiving_yards_after_catch REAL NOT NULL DEFAULT 0,
    special_teams_tds INTEGER NOT NULL DEFAULT 0,
    fantasy_points REAL NOT NULL DEFAULT 0,
    fantasy_points_ppr REAL NOT NULL DEFAULT 0,
    offense_snaps INTEGER,
    offense_pct REAL,
    defense_snaps INTEGER,
    defense_pct REAL,
    special_teams_snaps INTEGER,
    special_teams_pct REAL,
    game_id TEXT,
    source_player_stats INTEGER NOT NULL DEFAULT 0,
    source_snap_counts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (season, season_type, week, player_id, team)
);

CREATE TABLE warehouse_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX idx_stats_scope ON player_week_stats (season, season_type, week, position);
CREATE INDEX idx_stats_player ON player_week_stats (season, season_type, player_id, week, team);
CREATE INDEX idx_stats_team ON player_week_stats (season, season_type, team, week);
CREATE INDEX idx_players_name ON players (display_name COLLATE NOCASE);
"""


def build_database(refresh: bool) -> dict:
    (
        paths, player_source, stats, snaps, relevant_ids, raw_totals,
        unmatched_snap_ids, join_method_counts,
    ) = load_sources(refresh)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temporary = DB_PATH.with_suffix(".sqlite.tmp")
    if temporary.exists():
        temporary.unlink()
    connection = sqlite3.connect(temporary)
    connection.executescript(SCHEMA)

    player_rows = []
    for player_id in sorted(relevant_ids):
        source = player_source.get(player_id, {})
        fallback = next((row for key, row in stats.items() if key[1] == player_id), {})
        player_rows.append((
            player_id, source.get("pfr_id", ""),
            source.get("display_name") or fallback.get("player_display_name") or player_id,
            source.get("first_name", ""), source.get("last_name", ""),
            fallback.get("position") or source.get("position", ""),
            fallback.get("position_group") or source.get("position_group", ""),
            fallback.get("team") or source.get("latest_team", ""),
            fallback.get("headshot_url") or source.get("headshot", ""),
        ))
    connection.executemany("INSERT INTO players VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", player_rows)

    rows = []
    for season_type, player_id, week, team in sorted(set(stats) | set(snaps), key=lambda key: (key[0], key[2], key[1], key[3])):
        stat = stats.get((season_type, player_id, week, team), {})
        snap = snaps.get((season_type, player_id, week, team), {})
        source = player_source.get(player_id, {})
        display_name = stat.get("player_display_name") or source.get("display_name") or snap.get("player") or player_id
        position = stat.get("position") or snap.get("position") or source.get("position", "")
        values = [
            2025, season_type, week, player_id, team,
            snap.get("pfr_player_id") or source.get("pfr_id", ""), display_name,
            stat.get("player_name", ""), position,
            stat.get("position_group") or source.get("position_group", ""),
            stat.get("headshot_url") or source.get("headshot", ""),
            snap.get("opponent") or stat.get("opponent_team", ""), 1,
        ]
        values.extend(number(source_value(stat, field)) if field in REAL_FIELDS else integer(source_value(stat, field)) for field in STAT_FIELDS)
        values.extend([
            integer(snap.get("offense_snaps")) if snap else None,
            number(snap.get("offense_pct")) if snap else None,
            integer(snap.get("defense_snaps")) if snap else None,
            number(snap.get("defense_pct")) if snap else None,
            integer(snap.get("st_snaps")) if snap else None,
            number(snap.get("st_pct")) if snap else None,
            snap.get("game_id", ""), 1 if stat else 0, 1 if snap else 0,
        ])
        rows.append(tuple(values))

    placeholders = ",".join("?" for _ in range(len(rows[0])))
    connection.executemany(f"INSERT INTO player_week_stats VALUES ({placeholders})", rows)

    imported_at = datetime.now(timezone.utc).isoformat()
    source_metadata = {
        name: {
            "url": SOURCES[name], "path": str(path.relative_to(ROOT)),
            "sha256": sha256(path), "bytes": path.stat().st_size,
        }
        for name, path in paths.items()
    }
    db_totals = {
        field: connection.execute(f"SELECT COALESCE(SUM({field}), 0) FROM player_week_stats WHERE source_player_stats = 1").fetchone()[0]
        for field in STAT_FIELDS
    }
    mismatches = {
        field: {"source": raw_totals[field], "database": db_totals[field]}
        for field in STAT_FIELDS if abs(raw_totals[field] - db_totals[field]) > 0.0001
    }
    summary = {
        "season": 2025, "imported_at": imported_at,
        "database": str(DB_PATH.relative_to(ROOT)), "sources": source_metadata,
        "rows": connection.execute("SELECT COUNT(*) FROM player_week_stats").fetchone()[0],
        "players": connection.execute("SELECT COUNT(*) FROM players").fetchone()[0],
        "regular_season_rows": connection.execute("SELECT COUNT(*) FROM player_week_stats WHERE season_type = 'REG'").fetchone()[0],
        "postseason_rows": connection.execute("SELECT COUNT(*) FROM player_week_stats WHERE season_type = 'POST'").fetchone()[0],
        "regular_season_weeks": [row[0] for row in connection.execute("SELECT DISTINCT week FROM player_week_stats WHERE season_type = 'REG' ORDER BY week")],
        "postseason_weeks": [row[0] for row in connection.execute("SELECT DISTINCT week FROM player_week_stats WHERE season_type = 'POST' ORDER BY week")],
        "positions": [row[0] for row in connection.execute("SELECT DISTINCT position FROM player_week_stats WHERE position <> '' ORDER BY position")],
        "player_stat_rows": connection.execute("SELECT COUNT(*) FROM player_week_stats WHERE source_player_stats = 1").fetchone()[0],
        "snap_rows": connection.execute("SELECT COUNT(*) FROM player_week_stats WHERE source_snap_counts = 1").fetchone()[0],
        "stat_rows_with_snap_match": connection.execute("SELECT COUNT(*) FROM player_week_stats WHERE source_player_stats = 1 AND source_snap_counts = 1").fetchone()[0],
        "snap_join_methods": join_method_counts,
        "unmatched_snap_player_ids_count": len(unmatched_snap_ids),
        "unmatched_snap_player_ids_sample": unmatched_snap_ids[:25],
        "aggregate_mismatches": mismatches,
    }
    if mismatches:
        raise RuntimeError(f"source/database aggregate mismatch: {mismatches}")
    expected_snapshot = {
        "players": 609,
        "player_stat_rows": 5630,
        "stat_rows_with_snap_match": 5630,
    }
    failed_snapshot_checks = {
        key: {"expected": expected, "actual": summary[key]}
        for key, expected in expected_snapshot.items() if summary[key] != expected
    }
    if failed_snapshot_checks or len(summary["regular_season_weeks"]) != 18 or len(summary["postseason_weeks"]) != 4:
        raise RuntimeError(f"pinned-snapshot completeness failed: {failed_snapshot_checks or summary}")

    metadata = {
        "season": "2025", "imported_at": imported_at, "source": "nflverse",
        "source_urls": json.dumps(SOURCES, sort_keys=True),
        "summary": json.dumps(summary, sort_keys=True),
    }
    connection.executemany("INSERT INTO warehouse_meta (key, value) VALUES (?, ?)", metadata.items())
    connection.commit()
    connection.execute("ANALYZE")
    connection.execute("PRAGMA optimize")
    connection.commit()
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    connection.close()
    if integrity != "ok":
        raise RuntimeError(f"SQLite integrity check failed: {integrity}")
    temporary.replace(DB_PATH)
    REPORT_PATH.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="redownload source CSVs")
    args = parser.parse_args()
    try:
        summary = build_database(args.refresh)
    except Exception as error:
        print(f"IMPORT FAIL: {error}", file=sys.stderr)
        return 1
    print(json.dumps(summary, indent=2, sort_keys=True))
    print("IMPORT PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
