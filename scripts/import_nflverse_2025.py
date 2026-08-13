#!/usr/bin/env python3
"""Build a local 2025 NFL offensive fantasy warehouse from official nflverse releases."""

from __future__ import annotations

import argparse
import csv
import gzip
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
    "schedules": "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv",
    "play_by_play": "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2025.csv.gz",
}

SOURCE_FILENAMES = {
    "player_stats": "player_stats.csv",
    "snap_counts": "snap_counts.csv",
    "players": "players.csv",
    "schedules": "schedules.csv",
    "play_by_play": "play_by_play.csv.gz",
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
    path = RAW_DIR / SOURCE_FILENAMES[name]
    if path.exists() and not refresh:
        return path
    temporary = path.with_suffix(".csv.part")
    request = urllib.request.Request(url, headers={"User-Agent": "local-fantasy-football-warehouse/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as handle:
        while chunk := response.read(1024 * 1024):
            handle.write(chunk)
    temporary.replace(path)
    return path


def elapsed_seconds(quarter: int, clock: str, game_type: str) -> int:
    """Return elapsed game-clock seconds, including overtime periods."""
    try:
        minutes, seconds = (int(part) for part in clock.split(":"))
        remaining = minutes * 60 + seconds
    except (AttributeError, TypeError, ValueError):
        remaining = 0
    if quarter <= 0:
        return 0
    if quarter <= 4:
        return (quarter - 1) * 900 + max(0, 900 - remaining)
    overtime_period = 900 if game_type != "REG" else 600
    return 3600 + (quarter - 5) * overtime_period + max(0, overtime_period - remaining)


def score_state(home_score: int, away_score: int) -> str:
    if home_score == away_score:
        return "tied"
    return "home" if home_score > away_score else "away"


def duration_breakdown(events: list[dict], duration: int) -> dict[str, int]:
    totals = {"home": 0, "away": 0, "tied": 0}
    previous_time = 0
    home_score = 0
    away_score = 0
    for event in sorted(events, key=lambda item: (item["elapsed_seconds"], item["sequence"])):
        event_time = min(duration, max(previous_time, event["elapsed_seconds"]))
        totals[score_state(home_score, away_score)] += event_time - previous_time
        previous_time = event_time
        home_score = event["home_score"]
        away_score = event["away_score"]
    totals[score_state(home_score, away_score)] += max(0, duration - previous_time)
    return totals


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

    games: dict[str, dict[str, str]] = {}
    with paths["schedules"].open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row.get("season") != "2025" or row.get("game_type") not in {"REG", *POSTSEASON_GAME_TYPES}:
                continue
            game_id = row.get("game_id", "")
            if game_id:
                games[game_id] = row

    flow_by_game: dict[str, dict] = {
        game_id: {
            "events": [],
            "quarter_cumulative": {},
            "team_plays": defaultdict(lambda: {"rush": 0, "pass": 0}),
            "last_score": (0, 0),
            "max_elapsed": 0,
        }
        for game_id in games
    }
    with gzip.open(paths["play_by_play"], "rt", newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            game_id = row.get("game_id", "")
            if game_id not in flow_by_game:
                continue
            flow = flow_by_game[game_id]
            game = games[game_id]
            quarter = integer(row.get("qtr"))
            clock = row.get("time", "")
            elapsed = elapsed_seconds(quarter, clock, game.get("game_type", "REG"))
            flow["max_elapsed"] = max(flow["max_elapsed"], elapsed)
            home_score = integer(row.get("total_home_score"))
            away_score = integer(row.get("total_away_score"))
            if quarter > 0:
                flow["quarter_cumulative"][quarter] = (home_score, away_score)

            if (home_score, away_score) != flow["last_score"]:
                flow["events"].append({
                    "sequence": integer(row.get("play_id")),
                    "quarter": quarter,
                    "clock": clock,
                    "elapsed_seconds": elapsed,
                    "home_score": home_score,
                    "away_score": away_score,
                    "description": row.get("desc", ""),
                })
                flow["last_score"] = (home_score, away_score)

            possession = row.get("posteam", "")
            if possession not in {game.get("home_team"), game.get("away_team")}:
                continue
            if integer(row.get("rush_attempt")) == 1:
                flow["team_plays"][possession]["rush"] += 1
            if integer(row.get("pass_attempt")) == 1 or integer(row.get("sack")) == 1:
                flow["team_plays"][possession]["pass"] += 1

    return (
        paths, players_by_gsis, stats, snaps, relevant_ids, raw_totals,
        sorted(unmatched_snap_ids), dict(join_method_counts), games, flow_by_game,
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

CREATE TABLE games (
    game_id TEXT PRIMARY KEY,
    season INTEGER NOT NULL,
    season_type TEXT NOT NULL CHECK (season_type IN ('REG', 'POST')),
    game_type TEXT NOT NULL,
    week INTEGER NOT NULL,
    gameday TEXT,
    weekday TEXT,
    gametime TEXT,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    overtime INTEGER NOT NULL DEFAULT 0,
    stadium TEXT,
    roof TEXT,
    surface TEXT,
    play_by_play_available INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE game_quarter_scores (
    game_id TEXT NOT NULL REFERENCES games(game_id),
    quarter INTEGER NOT NULL,
    home_points INTEGER NOT NULL,
    away_points INTEGER NOT NULL,
    home_score_end INTEGER NOT NULL,
    away_score_end INTEGER NOT NULL,
    PRIMARY KEY (game_id, quarter)
);

CREATE TABLE game_team_summary (
    game_id TEXT NOT NULL REFERENCES games(game_id),
    team TEXT NOT NULL,
    opponent TEXT NOT NULL,
    home_away TEXT NOT NULL CHECK (home_away IN ('home', 'away')),
    points_for INTEGER,
    points_against INTEGER,
    result TEXT CHECK (result IN ('W', 'L', 'T') OR result IS NULL),
    rush_plays INTEGER,
    pass_plays INTEGER,
    offensive_plays INTEGER,
    rush_pct REAL,
    pass_pct REAL,
    seconds_leading INTEGER,
    seconds_trailing INTEGER,
    seconds_tied INTEGER,
    pct_time_leading REAL,
    pct_time_trailing REAL,
    pct_time_tied REAL,
    PRIMARY KEY (game_id, team)
);

CREATE TABLE game_flow_events (
    game_id TEXT NOT NULL REFERENCES games(game_id),
    sequence INTEGER NOT NULL,
    quarter INTEGER NOT NULL,
    clock TEXT,
    elapsed_seconds INTEGER NOT NULL,
    home_score INTEGER NOT NULL,
    away_score INTEGER NOT NULL,
    leader TEXT NOT NULL CHECK (leader IN ('home', 'away', 'tied')),
    description TEXT,
    PRIMARY KEY (game_id, sequence)
);

CREATE TABLE warehouse_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX idx_stats_scope ON player_week_stats (season, season_type, week, position);
CREATE INDEX idx_stats_player ON player_week_stats (season, season_type, player_id, week, team);
CREATE INDEX idx_stats_team ON player_week_stats (season, season_type, team, week);
CREATE INDEX idx_players_name ON players (display_name COLLATE NOCASE);
CREATE INDEX idx_games_team_week ON games (season, week, home_team, away_team);
CREATE INDEX idx_game_team_summary_team ON game_team_summary (team, game_id);
CREATE INDEX idx_game_flow_game_time ON game_flow_events (game_id, elapsed_seconds);
"""


def build_database(refresh: bool) -> dict:
    (
        paths, player_source, stats, snaps, relevant_ids, raw_totals,
        unmatched_snap_ids, join_method_counts, games, flow_by_game,
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

    game_rows = []
    quarter_rows = []
    team_summary_rows = []
    flow_rows = []
    for game_id, game in sorted(games.items(), key=lambda item: (integer(item[1].get("week")), item[0])):
        flow = flow_by_game[game_id]
        home_team = game.get("home_team", "")
        away_team = game.get("away_team", "")
        home_score = integer(game.get("home_score")) if game.get("home_score") not in (None, "") else None
        away_score = integer(game.get("away_score")) if game.get("away_score") not in (None, "") else None
        has_pbp = bool(flow["quarter_cumulative"])
        season_type = "REG" if game.get("game_type") == "REG" else "POST"
        game_rows.append((
            game_id, 2025, season_type, game.get("game_type", ""), integer(game.get("week")),
            game.get("gameday", ""), game.get("weekday", ""), game.get("gametime", ""),
            home_team, away_team, home_score, away_score, integer(game.get("overtime")),
            game.get("stadium", ""), game.get("roof", ""), game.get("surface", ""),
            1 if has_pbp else 0,
        ))

        previous_home = 0
        previous_away = 0
        for quarter, cumulative in sorted(flow["quarter_cumulative"].items()):
            cumulative_home, cumulative_away = cumulative
            quarter_rows.append((
                game_id, quarter,
                max(0, cumulative_home - previous_home), max(0, cumulative_away - previous_away),
                cumulative_home, cumulative_away,
            ))
            previous_home, previous_away = cumulative_home, cumulative_away

        for event in flow["events"]:
            flow_rows.append((
                game_id, event["sequence"], event["quarter"], event["clock"], event["elapsed_seconds"],
                event["home_score"], event["away_score"],
                score_state(event["home_score"], event["away_score"]), event["description"],
            ))

        duration = max(3600, flow["max_elapsed"]) if has_pbp else 0
        time_totals = duration_breakdown(flow["events"], duration) if has_pbp else {"home": 0, "away": 0, "tied": 0}
        for team, opponent, home_away in (
            (home_team, away_team, "home"),
            (away_team, home_team, "away"),
        ):
            points_for = home_score if home_away == "home" else away_score
            points_against = away_score if home_away == "home" else home_score
            result = None
            if points_for is not None and points_against is not None:
                result = "W" if points_for > points_against else "L" if points_for < points_against else "T"
            rush_plays = flow["team_plays"][team]["rush"] if has_pbp else None
            pass_plays = flow["team_plays"][team]["pass"] if has_pbp else None
            offensive_plays = rush_plays + pass_plays if has_pbp else None
            leading_key = home_away
            trailing_key = "away" if home_away == "home" else "home"
            seconds_leading = time_totals[leading_key] if has_pbp else None
            seconds_trailing = time_totals[trailing_key] if has_pbp else None
            seconds_tied = time_totals["tied"] if has_pbp else None
            team_summary_rows.append((
                game_id, team, opponent, home_away, points_for, points_against, result,
                rush_plays, pass_plays, offensive_plays,
                round(100.0 * rush_plays / offensive_plays, 1) if offensive_plays else None,
                round(100.0 * pass_plays / offensive_plays, 1) if offensive_plays else None,
                seconds_leading, seconds_trailing, seconds_tied,
                round(100.0 * seconds_leading / duration, 1) if duration else None,
                round(100.0 * seconds_trailing / duration, 1) if duration else None,
                round(100.0 * seconds_tied / duration, 1) if duration else None,
            ))

    connection.executemany("INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", game_rows)
    connection.executemany("INSERT INTO game_quarter_scores VALUES (?, ?, ?, ?, ?, ?)", quarter_rows)
    connection.executemany("INSERT INTO game_team_summary VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", team_summary_rows)
    connection.executemany("INSERT INTO game_flow_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", flow_rows)

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
        "games": connection.execute("SELECT COUNT(*) FROM games").fetchone()[0],
        "games_with_play_by_play": connection.execute("SELECT COUNT(*) FROM games WHERE play_by_play_available = 1").fetchone()[0],
        "game_flow_events": connection.execute("SELECT COUNT(*) FROM game_flow_events").fetchone()[0],
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
