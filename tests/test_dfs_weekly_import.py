import copy
import csv
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import import_dfs_weekly as module

SNAPSHOT = json.loads((ROOT / 'data/dfs-weekly.json').read_text())
# Parser regressions pin a retained archive; the current default advances weekly.
SLATE = SNAPSHOT['slates']['2026-w2-dk-153427']
NOW = datetime(2026, 9, 16, 20, tzinfo=timezone.utc)


def salary_csv(records):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=['Position', 'Name', 'ID', 'Salary', 'Game Info', 'TeamAbbrev', 'Roster Position', 'AvgPointsPerGame'])
    writer.writeheader()
    for row in records:
        pos = 'DST' if row['position'] == 'DEF' else row['position']
        writer.writerow({'Position': pos, 'Name': row['name'], 'ID': row['draftKingsId'], 'Salary': row['salary'],
                         'Game Info': row['game'], 'TeamAbbrev': row['team'], 'Roster Position': pos if pos in ('QB', 'DST') else pos + '/FLEX',
                         'AvgPointsPerGame': '9999'})
    return stream.getvalue()


def source_projections():
    return {(module.name_key(r['name']), r['position'], r['team']):
            {k: v for k, v in r.items() if k.startswith('projection') and k != 'projectionUnavailableReason'}
            for r in SLATE['records'] if r['projection'] is not None}


def projection_html(games, wrong_week=False, missing_position=None):
    result = ['<title>NFL DraftKings DFS Projections for Week %s (2026)</title>' % (3 if wrong_week else 2),
              '<table data-tooltip="Projected draftkings Points">']
    for game in games:
        for team, opp in [(game['away'], game['home']), (game['home'], game['away'])]:
            for pos in ('QB', 'RB', 'WR', 'TE'):
                if (team, pos) == missing_position:
                    continue
                date = module.instant(game['startsAt']).astimezone(module.ET).strftime('%a %-I:%M %p')
                cells = [f'Player {team} {pos}, {pos}', f'<span class="team {game["away"]}"></span><span class="team after {game["home"]}"></span>',
                         '1', '2', '15.2', '5,000', '', opp, '1', '2', date, '1', '2', 'more']
                result.append('<tr>' + ''.join('<td>' + cell + '</td>' for cell in cells) + '</tr>')
    return ''.join(result) + '</table>'


class WeeklyDfsTests(unittest.TestCase):
    def test_shipped_snapshot_is_verified_and_includes_current_rookies(self):
        module.validate_snapshot(SNAPSHOT)
        self.assertEqual((SLATE['season'], SLATE['week']), (2026, 2))
        current = SNAPSHOT['slates'][SNAPSHOT['defaultSlate']]
        self.assertEqual((current['season'], current['week']), (SNAPSHOT['season'], SNAPSHOT['week']))
        names = {r['name']: r for r in SLATE['records']}
        self.assertEqual(names['Jahmyr Gibbs']['salary'], 8500)
        self.assertEqual(names['Jahmyr Gibbs']['projection'], 23.1)
        self.assertTrue(names['Carnell Tate']['playerId'])
        self.assertTrue(names['Makai Lemon']['playerId'])

    def test_calendar_selects_real_week_including_january_and_no_offseason_guess(self):
        games = SLATE['games']
        self.assertEqual(module.target_week(games, NOW)[0], (2026, 2))
        january = [{'gameId': '2026_18_A_B', 'season': 2026, 'week': 18, 'away': 'A', 'home': 'B', 'startsAt': '2027-01-10T18:00:00Z'}]
        self.assertEqual(module.target_week(january, datetime(2027, 1, 8, tzinfo=timezone.utc))[0], (2026, 18))
        with self.assertRaises(module.NoData):
            module.target_week(games, datetime(2027, 6, 1, tzinfo=timezone.utc))

    def test_discovery_rejects_showdown_and_mixed_week_metadata(self):
        games = SLATE['games'][:1]
        game = games[0]
        group = {'DraftGroupId': 123, 'Sport': 'NFL', 'ContestTypeId': 21, 'GameTypeId': 1,
                 'StartDate': game['startsAt'], 'GameCount': 1, 'GameSetKey': 'games', 'ContestStartTimeSuffix': '(Test)'}
        lobby = {'SelectedSport': 'NFL', 'DraftGroups': [group], 'GameSets': [{'GameSetKey': 'games', 'Competitions': [
            {'Description': game['away'] + ' @ ' + game['home'], 'StartDate': game['startsAt'], 'GameId': 1}]}]}
        result = module.discover_slates(lobby, games, NOW)
        self.assertEqual(result[0]['key'], '2026-w2-dk-123')
        group['ContestTypeId'] = 96
        with self.assertRaises(module.NoData):
            module.discover_slates(lobby, games, NOW)
        group['ContestTypeId'] = 21
        lobby['GameSets'][0]['Competitions'][0]['Description'] = 'DET @ TEN'
        with self.assertRaisesRegex(module.PartialData, 'different week/date/matchup'):
            module.discover_slates(lobby, games, NOW)

    def test_projection_rejects_wrong_week_stale_dates_and_missing_team_position(self):
        games = SLATE['games'][:1]
        source = {'lastModified': 'Wed, 16 Sep 2026 07:41:01 GMT'}
        parsed = module.parse_projections(projection_html(games), 2026, 2, games, source, NOW)
        self.assertEqual(len(parsed), 8)
        for html, metadata, reason in [
            (projection_html(games, wrong_week=True), source, 'season/week'),
            (projection_html(games), {'lastModified': 'Wed, 09 Sep 2026 07:41:01 GMT'}, '72 hours'),
            (projection_html(games, missing_position=(games[0]['away'], 'QB')), source, 'team/position'),
            (projection_html(games).replace('Thu 8:15 PM', 'Thu 8:20 PM'), source, 'kickoff'),
        ]:
            with self.subTest(reason=reason), self.assertRaisesRegex(module.PartialData, reason):
                module.parse_projections(html, 2026, 2, games, metadata, NOW)

    def test_salary_dates_guard_and_missing_projection_is_never_average(self):
        result = module.build_records(salary_csv(SLATE['records']), SLATE, source_projections(), {})
        self.assertTrue(any(r['projection'] is None for r in result))
        self.assertTrue(all(r['projection'] is None or r['projection'] < 70 for r in result))
        self.assertTrue(all(r['playerId'] is None for r in result))
        with self.assertRaisesRegex(module.PartialData, 'date mismatch'):
            module.build_records(salary_csv(SLATE['records']).replace('09/20/2026', '09/13/2026'), SLATE, source_projections(), {})
        with self.assertRaisesRegex(module.PartialData, 'identity coverage'):
            projections = source_projections()
            projections[('notaplayer', 'WR', 'DET')] = next(iter(projections.values()))
            module.build_records(salary_csv(SLATE['records']), SLATE, projections, {})

    def test_duplicate_identity_does_not_match_and_wrong_team_does_not_match(self):
        chosen = next(r for r in SLATE['records'] if r['name'] == 'Jahmyr Gibbs')
        key = (module.name_key(chosen['name']), chosen['position'], chosen['team'])
        for identities in [{key: {'id-a', 'id-b'}}, {(key[0], key[1], 'BUF'): {'id-a'}}]:
            rows = module.build_records(salary_csv(SLATE['records']), SLATE, source_projections(), identities)
            self.assertIsNone(next(r for r in rows if r['name'] == 'Jahmyr Gibbs')['playerId'])

    def test_validation_detects_mixed_week_and_missing_team_and_tampering(self):
        for change in [lambda s: s['slates'][s['defaultSlate']]['records'][0].update(salary=1),
                       lambda s: next(r for r in s['slates'][s['defaultSlate']]['records'] if r['projection'] is not None).update(projectionWeek=s['slates'][s['defaultSlate']]['week'] + 1),
                       lambda s: s['slates'][s['defaultSlate']]['records'].pop()]:
            broken = copy.deepcopy(SNAPSHOT)
            change(broken)
            with self.assertRaises(module.PartialData):
                module.validate_snapshot(broken)

    def test_idempotence_ignores_capture_and_http_hash_changes(self):
        reread = copy.deepcopy(SNAPSHOT)
        reread['capturedAt'] = 'later'
        reread['slates'][reread['defaultSlate']]['sources']['projections.html']['sha256'] = 'new-response-same-values'
        self.assertEqual(module.content_fingerprint(SNAPSHOT), module.content_fingerprint(reread))
        reread['slates'][reread['defaultSlate']]['records'][0]['salary'] += 100
        self.assertNotEqual(module.content_fingerprint(SNAPSHOT), module.content_fingerprint(reread))

    def test_atomic_failure_preserves_last_good_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'dfs.json'
            target.write_text(json.dumps(SNAPSHOT))
            before = target.read_bytes()
            with patch.object(module.os, 'replace', side_effect=OSError('disk error')):
                with self.assertRaises(OSError):
                    module.atomic_write(target, {'bad': 'must not replace good'})
            self.assertEqual(target.read_bytes(), before)
            self.assertEqual(list(Path(temp).glob('*.tmp')), [])
            with patch.object(module.Fetcher, 'get', side_effect=module.PartialData('new weekly projections pending')):
                with self.assertRaises(module.PartialData):
                    module.refresh(target, Path(temp) / 'raw', NOW)
            self.assertEqual(target.read_bytes(), before)

    def test_partial_second_slate_does_not_publish_first_slate(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'dfs.json'
            target.write_text(json.dumps(SNAPSHOT))
            before = target.read_bytes()
            discovered = [{**copy.deepcopy(slate), 'key': key} for key, slate in [(k,v) for k,v in SNAPSHOT['slates'].items() if v['season']==2026 and v['week']==2][:2]]
            class FakeFetcher:
                def __init__(self, *_):
                    self.sources = {'projections.html': {'lastModified': 'Wed, 16 Sep 2026 07:41:01 GMT'}}
                def get(self, _url, filename):
                    self.sources[filename] = {'url': 'https://source.test', 'sha256': 'hash', 'retrievedAt': module.iso(NOW)}
                    return '{}'
            with patch.object(module, 'Fetcher', FakeFetcher), \
                 patch.object(module, 'parse_schedule', return_value=SLATE['games']), \
                 patch.object(module, 'discover_slates', return_value=discovered), \
                 patch.object(module, 'parse_projections', return_value=source_projections()), \
                 patch.object(module, 'roster_identities', return_value=({}, 2)), \
                 patch.object(module, 'build_records', side_effect=[SLATE['records'], module.PartialData('second slate pending')]):
                with self.assertRaisesRegex(module.PartialData, 'second slate'):
                    module.refresh(target, Path(temp) / 'raw', NOW)
            self.assertEqual(target.read_bytes(), before)

    def test_cli_failure_codes_are_not_publishable(self):
        for error, code in [(module.PartialData('pending'), 3), (module.NoData('offseason'), 4), (OSError('network'), 1)]:
            stream = io.StringIO()
            with patch.object(module, 'refresh', side_effect=error), patch('sys.stdout', stream):
                self.assertEqual(module.main([]), code)
            report = json.loads(stream.getvalue())
            self.assertFalse(report['publishable'])
            self.assertTrue(report['lastGoodPreserved'])


if __name__ == '__main__':
    unittest.main()
