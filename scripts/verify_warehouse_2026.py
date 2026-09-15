#!/usr/bin/env python3
"""Verify the 2026 snapshot against committed official source rows.

This is additional to the unchanged, full-season 2025 completeness verifier.
"""
import csv
import hashlib
import json
import sqlite3
from pathlib import Path
import import_nflverse_2025 as schema

ROOT = Path(__file__).resolve().parents[1]
schema.SEASON = 2026


def main():
    report = json.loads((ROOT / 'data/import-report-2026.json').read_text())
    connection = sqlite3.connect(f"file:{ROOT / 'data/fantasy_football_2026.sqlite'}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    checks = {}
    checks['integrity'] = connection.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    checks['foreign_keys'] = not connection.execute('PRAGMA foreign_key_check').fetchall()
    checks['historic_snapshot_unchanged'] = hashlib.sha256((ROOT / 'data/fantasy_football.sqlite').read_bytes()).hexdigest() == 'd3cc2ed8e38eaca00005b4facb2e475c833418302b4b2c367c42574412dd1869'
    for name in ('player_stats', 'snap_counts', 'schedules'):
        source = report['sources'][name]
        checks[f'{name}_source_hash'] = hashlib.sha256((ROOT / source['path']).read_bytes()).hexdigest() == source['sha256']
    stats = list(csv.DictReader((ROOT / report['sources']['player_stats']['path']).open()))
    source_rows = [row for row in stats if row['season'] == '2026' and row['season_type'] in ('REG', 'POST') and schema.relevant_offensive_row(row)]
    mismatches = []
    for source in source_rows:
        row = connection.execute('SELECT * FROM player_week_stats WHERE season=? AND season_type=? AND week=? AND player_id=? AND team=?', (2026, source['season_type'], int(source['week']), source['player_id'], source['team'])).fetchone()
        if row is None:
            mismatches.append([source['player_id'], 'missing_row'])
            continue
        for field in schema.STAT_FIELDS:
            expected = schema.number(schema.source_value(source, field))
            if abs(row[field] - expected) > .0001:
                mismatches.append([source['player_id'], field, expected, row[field]])
    checks['every_source_stat_matches'] = not mismatches
    checks['source_rows_complete'] = len(source_rows) == connection.execute('SELECT COUNT(*) FROM player_week_stats WHERE source_player_stats=1').fetchone()[0] == report['player_stat_rows']
    snap_source = {(row['game_id'], row['pfr_player_id'], row['team']): row for row in csv.DictReader((ROOT / report['sources']['snap_counts']['path']).open())}
    snap_mismatches = []
    for row in connection.execute('SELECT * FROM player_week_stats WHERE source_snap_counts=1'):
        source = snap_source.get((row['game_id'], row['pfr_player_id'], row['team']))
        if source is None or row['offense_snaps'] != int(source['offense_snaps']) or abs(row['offense_pct'] - float(source['offense_pct'])) > .0001:
            snap_mismatches.append(row['player_id'])
    checks['every_source_snap_matches'] = not snap_mismatches
    checks['stats_and_snaps_joined'] = connection.execute('SELECT COUNT(*) FROM player_week_stats WHERE source_player_stats=1 AND source_snap_counts=0').fetchone()[0] == 0
    checks['week1_complete'] = connection.execute('SELECT COUNT(*) FROM games WHERE week=1 AND home_score IS NOT NULL AND away_score IS NOT NULL AND play_by_play_available=1').fetchone()[0] == 16
    checks['week1_all_teams'] = connection.execute('SELECT COUNT(DISTINCT team) FROM player_week_stats WHERE week=1').fetchone()[0] == 32
    checks['no_wrong_season'] = connection.execute('SELECT COUNT(*) FROM player_week_stats WHERE season<>2026').fetchone()[0] == 0
    checks['unknown_participation_is_null'] = report['participation_available'] is False and connection.execute('SELECT COUNT(*) FROM player_game_segments WHERE snaps IS NOT NULL').fetchone()[0] == 0
    checks['future_games_no_fake_segments'] = connection.execute('SELECT COUNT(*) FROM game_team_segments JOIN games USING(game_id) WHERE play_by_play_available=0').fetchone()[0] == 0
    checks['current_roster_all_teams'] = connection.execute('SELECT COUNT(DISTINCT team) FROM team_roster WHERE season=2026').fetchone()[0] == 32
    checks['adp_snapshot_preserved'] = connection.execute('SELECT COUNT(*) FROM draft_rankings WHERE season=2026').fetchone()[0] == 407
    checks['summary_matches'] = all(connection.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] == report[key] for table, key in [('players','players'), ('player_week_stats','rows'), ('games','games'), ('game_drives','game_drives'), ('player_game_segments','player_game_segments')])
    connection.close()
    print(json.dumps({'checks': checks, 'source_stat_mismatches': mismatches[:10], 'source_snap_mismatches': snap_mismatches[:10]}, indent=2))
    failures = [name for name, passed in checks.items() if not passed]
    print('2026 WAREHOUSE FAIL: ' + ', '.join(failures) if failures else '2026 WAREHOUSE PASS')
    return int(bool(failures))


if __name__ == '__main__':
    raise SystemExit(main())
