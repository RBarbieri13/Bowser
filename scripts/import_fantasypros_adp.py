#!/usr/bin/env python3
"""Import a captured FantasyPros PPR ADP table into the serving warehouse."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "fantasypros-ppr-adp-2026.json"
DEFAULT_DATABASE = ROOT / "data" / "fantasy_football.sqlite"
SUPPORTED_POSITIONS = {"QB", "RB", "WR", "TE"}
TEAM_ALIASES = {
    "JAC": "JAX",
    "LAR": "LA",
}

NAME_ALIASES = {
    "hollywoodbrown": "marquisebrown",
    "joshuapalmer": "joshpalmer",
    "mitchtinsley": "mitchelltinsley",
    "scottymiller": "scottmiller",
}


def normalized_name(value: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    ascii_name = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", ascii_name.replace("'", "").replace(".", ""))
    return re.sub(r"[^a-z0-9]", "", ascii_name)


def create_table(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS draft_rankings (
            player_id TEXT PRIMARY KEY REFERENCES players(player_id),
            source_player_id INTEGER NOT NULL,
            season INTEGER NOT NULL,
            scoring TEXT NOT NULL CHECK (scoring IN ('PPR')),
            adp REAL NOT NULL CHECK (adp > 0),
            position TEXT NOT NULL,
            position_rank INTEGER NOT NULL CHECK (position_rank > 0),
            source_team TEXT,
            source_url TEXT NOT NULL,
            captured_at TEXT NOT NULL,
            imported_at TEXT NOT NULL,
            match_method TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_draft_rankings_scope
        ON draft_rankings (season, scoring, adp, position, position_rank);
        """
    )


def import_rankings(input_path: Path, database_path: Path) -> dict:
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    if payload.get("season") != 2026 or payload.get("scoring") != "PPR":
        raise ValueError("ranking snapshot must identify the 2026 PPR format")
    source_url = str(payload.get("sourceUrl") or "")
    captured_at = str(payload.get("capturedAt") or "")
    if "fantasypros.com/nfl/adp/ppr-overall.php" not in source_url:
        raise ValueError("ranking snapshot must come from the FantasyPros PPR ADP page")

    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA foreign_keys = ON")
    create_table(connection)
    players = connection.execute("SELECT player_id, display_name FROM players").fetchall()
    by_name: dict[str, list[str]] = {}
    for player_id, display_name in players:
        by_name.setdefault(normalized_name(display_name), []).append(player_id)

    imported_at = datetime.now(timezone.utc).isoformat()
    inserts = []
    unmatched = []
    duplicate_matches = []
    seen_players = set()
    relevant_rows = [row for row in payload.get("rows", []) if row.get("position") in SUPPORTED_POSITIONS]
    for row in relevant_rows:
        source_name = normalized_name(str(row.get("player_name") or ""))
        lookup_name = NAME_ALIASES.get(source_name, source_name)
        matches = by_name.get(lookup_name, [])
        if len(matches) != 1:
            (duplicate_matches if matches else unmatched).append(row.get("player_name"))
            continue
        player_id = matches[0]
        if player_id in seen_players:
            duplicate_matches.append(row.get("player_name"))
            continue
        seen_players.add(player_id)
        match_method = "alias" if lookup_name != source_name else "normalized_name"
        inserts.append((
            player_id,
            int(row["source_player_id"]),
            2026,
            "PPR",
            float(row["adp"]),
            str(row["position"]),
            int(row["position_rank"]),
            TEAM_ALIASES.get(str(row.get("team") or ""), str(row.get("team") or "")),
            source_url,
            captured_at,
            imported_at,
            match_method,
        ))

    connection.execute("DELETE FROM draft_rankings WHERE season = 2026 AND scoring = 'PPR'")
    connection.executemany(
        """
        INSERT INTO draft_rankings (
            player_id, source_player_id, season, scoring, adp, position, position_rank, source_team,
            source_url, captured_at, imported_at, match_method
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        inserts,
    )
    summary = {
        "season": 2026,
        "scoring": "PPR",
        "source_url": source_url,
        "captured_at": captured_at,
        "imported_at": imported_at,
        "source_rows": len(payload.get("rows", [])),
        "offensive_skill_rows": len(relevant_rows),
        "matched_rows": len(inserts),
        "unmatched_rows": len(unmatched),
        "ambiguous_or_duplicate_rows": len(duplicate_matches),
        "unmatched_sample": unmatched[:20],
    }
    connection.execute(
        "INSERT OR REPLACE INTO warehouse_meta (key, value) VALUES ('fantasypros_adp_summary', ?)",
        (json.dumps(summary, sort_keys=True),),
    )
    connection.commit()
    connection.execute("ANALYZE draft_rankings")
    connection.execute("PRAGMA optimize")
    connection.commit()
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    connection.close()
    if integrity != "ok":
        raise RuntimeError(f"SQLite integrity check failed: {integrity}")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE)
    args = parser.parse_args()
    summary = import_rankings(args.input, args.database)
    print(json.dumps(summary, indent=2, sort_keys=True))
    print("FANTASYPROS ADP IMPORT PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
