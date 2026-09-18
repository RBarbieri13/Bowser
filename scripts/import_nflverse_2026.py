#!/usr/bin/env python3
"""Import the in-progress 2026 nflverse season into its own warehouse.

The immutable 2025 warehouse and raw inputs are never touched. Shared parsing
preserves player/team/season-type/week grain and checks source aggregate totals.
Play-level personnel participation is not published for 2026 as of this snapshot.
"""
import import_nflverse_2025 as importer


def configure():
    importer.DRAFT_SNAPSHOT_DB = importer.DATA_DIR / "fantasy_football.sqlite"
    importer.SEASON = 2026
    importer.PARTICIPATION_AVAILABLE = False
    importer.RAW_DIR = importer.DATA_DIR / "raw" / "2026"
    importer.DB_PATH = importer.DATA_DIR / "fantasy_football_2026.sqlite"
    importer.REPORT_PATH = importer.DATA_DIR / "import-report-2026.json"
    importer.SOURCES = {name: url.replace("2025", "2026") for name, url in importer.SOURCES.items() if name != "participation"}
    importer.SCHEMA = importer.SCHEMA.replace("snaps INTEGER NOT NULL,", "snaps INTEGER,")


if __name__ == "__main__":
    configure()
    raise SystemExit(importer.main())
