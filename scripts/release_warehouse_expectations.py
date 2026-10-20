"""Independent SQL expectations for evolving public release populations.

The warehouse verifier checks raw-source provenance first. This module then
checks the hosted serialization and NFL-wide ranking without importing API code.
Frozen regression fixtures remain responsible for dated historical assertions.
"""
import sqlite3


def expected_week_rows(path, week):
    with sqlite3.connect(f'file:{path}?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        rows = [dict(row) for row in db.execute('''SELECT player_id,
            MAX(position) AS position, GROUP_CONCAT(DISTINCT NULLIF(team,'UNK')) AS team,
            COALESCE(SUM(offense_snaps),0) AS snaps, SUM(attempts) AS passing_attempts,
            SUM(completions) AS completions, SUM(passing_yards) AS passing_yards,
            SUM(passing_tds) AS passing_tds, SUM(interceptions) AS interceptions,
            SUM(carries) AS carries, SUM(rushing_yards) AS rushing_yards,
            SUM(rushing_tds) AS rushing_tds, SUM(targets) AS targets,
            SUM(receptions) AS receptions, SUM(receiving_yards) AS receiving_yards,
            SUM(receiving_tds) AS receiving_tds,
            ROUND(SUM(fantasy_points + receptions),1) AS fantasy_points
            FROM player_week_stats WHERE season=2026 AND season_type='REG' AND week=?
            GROUP BY player_id''', (week,))]
        ranked = [dict(row) for row in db.execute('''SELECT player_id,
            CASE WHEN MAX(position) IN ('RB','FB','HB') THEN 'RB' ELSE MAX(position) END AS position,
            ROUND(SUM(fantasy_points + receptions),2) AS points
            FROM player_week_stats WHERE season=2026 AND season_type='REG' AND week=? AND played=1
            GROUP BY player_id''', (week,))]
    # Competition ranks computed in Python, independently of the API SQL window.
    ranks = {row['player_id']: 1 + sum(other['position'] == row['position'] and other['points'] > row['points']
                                     for other in ranked) for row in ranked}
    return {row['player_id']: {**row, 'position_finish': ranks.get(row['player_id'])} for row in rows}


def compare_week_rows(actual, expected):
    ids = [row['player_id'] for row in actual]
    assert len(ids) == len(set(ids)), 'Hosted player IDs must be unique'
    assert set(ids) == set(expected), f'Hosted player population differs from verified warehouse: missing={sorted(set(expected)-set(ids))}, extra={sorted(set(ids)-set(expected))}'
    for row in actual:
        for key, value in expected[row['player_id']].items():
            assert row.get(key) == value, f"Hosted {row['player_id']} {key}: {row.get(key)!r} != verified {value!r}"
