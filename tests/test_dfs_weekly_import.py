import copy
import csv
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import import_dfs_weekly as module

SNAPSHOT = json.loads((ROOT / 'data/dfs-weekly.json').read_text())
# Parser regressions pin a retained archive; the current default advances weekly.
SLATE = SNAPSHOT['slates']['2026-w2-dk-153427']
NOW = datetime(2026, 9, 16, 20, tzinfo=timezone.utc)
PARTIAL_BASELINE = {**SNAPSHOT, 'season':2026, 'week':2, 'defaultSlate':'2026-w2-dk-153427',
                    'slates':{key:slate for key,slate in SNAPSHOT['slates'].items() if slate['season']==2026 and slate['week']==2}}
PARTIAL_BASELINE['contentFingerprint'] = module.content_fingerprint(PARTIAL_BASELINE)


def salary_csv(records):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=['Position', 'Name', 'ID', 'Salary', 'Game Info', 'TeamAbbrev', 'Roster Position', 'AvgPointsPerGame'])
    writer.writeheader()
    for row in records:
        pos = 'DST' if row['position'] == 'DEF' else row['position']
        writer.writerow({'Position': pos, 'Name': row['name'], 'ID': row['draftKingsId'], 'Salary': row['salary'],
                         'Game Info': row['game'], 'TeamAbbrev': row['team'], 'Roster Position': row.get('rosterPosition') or (pos if pos in ('QB', 'DST') else pos + '/FLEX'),
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
    def test_current_default_excludes_retained_locked_classic_and_preserves_history(self):
        locked = {**SLATE, 'id':1, 'gameCount':16}
        upcoming = {**SLATE, 'id':2, 'gameCount':14}
        main = {**SLATE, 'id':3, 'gameCount':12}
        showdown = SNAPSHOT['slates']['2026-w2-dk-153434']
        combined = {'locked':locked, 'upcoming':upcoming, 'main':main, 'showdown':showdown}
        before = copy.deepcopy(combined)
        self.assertEqual(module.refreshed_classic_default(combined, ['upcoming','main','showdown'], 2026, 2), 'upcoming')
        self.assertEqual(combined, before)
        with self.assertRaisesRegex(module.PartialData, 'unlocked Classic default'):
            module.refreshed_classic_default(combined, ['showdown'], 2026, 2)

    def run_partial_fixture(self, directory, *, allow=False, supplemental=False):
        now = datetime(2026, 10, 1, 22, tzinfo=timezone.utc)
        target = Path(directory) / 'dfs.json'
        if not target.exists(): target.write_text(json.dumps(PARTIAL_BASELINE))
        discovered, pools = [], {}
        for old_key in ('2026-w2-dk-153427', '2026-w2-dk-153434'):
            slate = copy.deepcopy(SNAPSHOT['slates'][old_key])
            slate['week'] = 4
            slate['id'] += 1000
            slate['key'] = f"2026-w4-dk-{slate['id']}"
            for game in slate['games']:
                game['week'] = 4
                game['gameId'] = game['gameId'].replace('_02_', '_04_')
                game['startsAt'] = module.iso(module.instant(game['startsAt']) + timedelta(days=14))
            slate['startsAt'] = min(g['startsAt'] for g in slate['games'])
            slate['endsAt'] = max(g['startsAt'] for g in slate['games'])
            by_team = {t:g for g in slate['games'] for t in (g['away'],g['home'])}
            for row in slate['records']:
                game = by_team[row['team']]
                date = module.instant(game['startsAt']).astimezone(module.ET)
                row['gameId'] = game['gameId']
                row['game'] = f"{game['away']}@{game['home']} {date:%m/%d/%Y %I:%M%p} ET"
            pools[slate['id']] = slate['records']
            discovered.append(slate)
        games = discovered[0]['games']
        fsc = {}
        if supplemental:
            sample = next(r for r in discovered[0]['records'] if r['team'] in ('DET','BUF') and
                          r['projectionSource'] == 'Fantasy Sports Central')
            value = {k:v for k,v in sample.items() if k.startswith('projection') and k != 'projectionUnavailableReason'}
            value.update(projectionWeek=4, projectionGameId=sample['gameId'], projectionSourceDate=None,
                         projectionCapturedAt=module.iso(now),
                         projectionSourceDateBasis='Publication time unavailable; capture time retained separately')
            fsc[(module.name_key(sample['name']),sample['position'],sample['team'])] = value
            mismatch = next(r for r in discovered[0]['records'] if r['projectionSource'] == 'Fantasy Sports Central' and r['name'] != sample['name'])
            fsc[(module.name_key(mismatch['name']),mismatch['position'],mismatch['team'])] = {
                **value, 'projectionGameId':mismatch['gameId'], 'projectionSourceSalary':1}
        class FakeFetcher:
            def __init__(self, *_): self.sources = {}
            def get(self, url, filename):
                self.sources[filename] = {'url':url, 'sha256':'fixture-hash', 'retrievedAt':module.iso(now),
                                          'lastModified':'Sun, 20 Sep 2026 07:41:01 GMT' if filename == 'projections.html' else None}
                if filename.startswith('dk-'): return salary_csv(pools[int(filename[3:-4])])
                if filename == 'projections.html':
                    return projection_html(games).replace('Week 2 (2026)', 'Week 4 (2026)')
                return '{}'
        identities = {(module.name_key(r['name']),r['position'],r['team']):{r['playerId']}
                      for r in pools[discovered[0]['id']] if r['playerId']}
        with patch.object(module,'Fetcher',FakeFetcher), \
             patch.object(module,'parse_schedule',return_value=games), \
             patch.object(module,'discover_slates',return_value=discovered), \
             patch.object(module,'roster_identities',return_value=(identities,4)), \
             patch.object(module,'parse_supplemental_projections',return_value=fsc,
                          side_effect=None if supplemental else module.PartialData('Supplemental source unavailable')):
            result = module.refresh(target,Path(directory)/'raw',now,allow_partial_projections=allow)
        return result, json.loads(target.read_text())

    def test_explicit_partial_mode_publishes_current_salaries_and_nulls_without_weakening_default(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp)/'dfs.json'
            target.write_text(json.dumps(PARTIAL_BASELINE))
            before = target.read_bytes()
            with self.assertRaisesRegex(module.PartialData,'outside current pregame week'):
                self.run_partial_fixture(temp)
            self.assertEqual(target.read_bytes(),before)
            result,snapshot = self.run_partial_fixture(temp,allow=True)
            self.assertEqual(result['projectionRefresh'],'partial')
            self.assertEqual((snapshot['season'],snapshot['week']),(2026,4))
            self.assertEqual(snapshot['slates']['2026-w2-dk-153427'],SLATE)
            for key in result['updatedSlates']:
                slate=snapshot['slates'][key]
                self.assertTrue(all(r['projection'] is None and r['projectionUnavailableReason'] for r in slate['records']))
                self.assertIsNone(slate['projectionProvider'])
                self.assertEqual(slate['projectionStatus']['missingPlayers'],len(slate['records']))
                self.assertEqual(slate['primaryProjectionStatus']['lastModified'],'Sun, 20 Sep 2026 07:41:01 GMT')
            module.validate_snapshot(snapshot)
            self.assertEqual(module.verify_archive(Path(temp)/'dfs_archive.sqlite')['status'],'verified')

    def test_explicit_partial_mode_still_preserves_last_good_on_official_salary_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            target=Path(temp)/'dfs.json'
            target.write_text(json.dumps(PARTIAL_BASELINE))
            before=target.read_bytes()
            with patch.object(module,'build_records',side_effect=module.PartialData('Official salary date mismatch')):
                with self.assertRaisesRegex(module.PartialData,'Official salary date mismatch'):
                    self.run_partial_fixture(temp,allow=True)
            self.assertEqual(target.read_bytes(),before)
            self.assertFalse((Path(temp)/'dfs_archive.sqlite').exists())

    def test_partial_supplements_require_exact_official_salary_and_captain_source_lineage(self):
        with tempfile.TemporaryDirectory() as temp:
            result,snapshot = self.run_partial_fixture(temp,allow=True,supplemental=True)
            classic=snapshot['slates'][snapshot['defaultSlate']]
            projected=[r for r in classic['records'] if r['projection'] is not None]
            self.assertEqual(len(projected),1)
            self.assertEqual(projected[0]['projectionSource'],'Fantasy Sports Central')
            self.assertIsNone(projected[0]['projectionSourceDate'])
            self.assertEqual(projected[0]['projectionCapturedAt'],'2026-10-01T22:00:00Z')
            showdown=snapshot['slates']['2026-w4-dk-154434']
            roles={r['rosterPosition']:r for r in showdown['records'] if r['projection'] is not None}
            self.assertEqual(set(roles),{'FLEX','CPT'})
            self.assertEqual(roles['CPT']['projection'],round(roles['FLEX']['projection']*1.5,4))
            module.validate_snapshot(snapshot)
            for mutate in (
                lambda s:s['slates'][s['defaultSlate']]['primaryProjectionStatus'].update(status='verified'),
                lambda s:next(r for r in s['slates'][s['defaultSlate']]['records'] if r['projection'] is not None).update(projectionSource='Fantasy Info Central'),
                lambda s:s['slates'][s['defaultSlate']]['projectionStatus'].update(missingPlayers=0),
                lambda s:next(r for r in s['slates']['2026-w4-dk-154434']['records'] if r['projection'] is not None).update(projectionSalaryValidationSha256='wrong'),
                lambda s:s['slates'][s['defaultSlate']]['records'][0].update(salary=1),
            ):
                damaged=copy.deepcopy(snapshot);mutate(damaged)
                damaged['contentFingerprint']=module.content_fingerprint(damaged)
                with self.assertRaises(module.PartialData):module.validate_snapshot(damaged)

    def test_fetcher_records_actual_response_time_separately_from_import_start(self):
        with tempfile.TemporaryDirectory() as temp:
            response=MagicMock()
            response.__enter__.return_value=response
            response.status=200;response.url='https://source.test';response.headers={};response.read.return_value=b'public source'
            before=datetime.now(timezone.utc)
            with patch.object(module.urllib.request,'urlopen',return_value=response):
                fetch=module.Fetcher(Path(temp),NOW)
                fetch.get('https://source.test','source.txt')
            retrieved=module.instant(fetch.sources['source.txt']['retrievedAt'])
            self.assertLessEqual(before,retrieved)
            self.assertLessEqual(retrieved,datetime.now(timezone.utc))
            self.assertNotEqual(retrieved,NOW)

    def test_shipped_snapshot_is_verified_and_includes_current_rookies(self):
        module.validate_snapshot(SNAPSHOT)
        self.assertEqual((SLATE['season'], SLATE['week']), (2026, 2))
        current = SNAPSHOT['slates'][SNAPSHOT['defaultSlate']]
        self.assertEqual((current['season'], current['week']), (SNAPSHOT['season'], SNAPSHOT['week']))
        names = {r['name']: r for r in SLATE['records']}
        self.assertEqual(names['Jahmyr Gibbs']['salary'], 8500)
        self.assertGreater(names['Jahmyr Gibbs']['projection'], 0)
        self.assertEqual(names['Jahmyr Gibbs']['projectionSource'], 'Fantasy Info Central')
        self.assertTrue(names['Carnell Tate']['playerId'])
        self.assertTrue(names['Makai Lemon']['playerId'])

    def test_showdown_official_roles_and_projection_math_are_preserved(self):
        slate = SNAPSHOT['slates']['2026-w2-dk-153434']
        projections = source_projections()
        primary = {key:value for key,value in projections.items() if value['projectionSource'] == 'Fantasy Info Central'}
        identities = {(module.name_key(r['name']),r['position'],r['team']):{r['playerId']} for r in slate['records'] if r['playerId']}
        rows = module.build_records(salary_csv(slate['records']),slate,primary,identities,{},projections)
        self.assertEqual(len(rows),94)
        gibbs = {r['rosterPosition']:r for r in rows if r['name'] == 'Jahmyr Gibbs'}
        self.assertEqual(gibbs['FLEX']['salary'],12000)
        self.assertEqual(gibbs['CPT']['salary'],18000)
        self.assertEqual(gibbs['CPT']['projection'],round(gibbs['FLEX']['projection']*1.5,4))
        self.assertEqual(gibbs['CPT']['projectionBase'],gibbs['FLEX']['projection'])
        self.assertEqual(gibbs['FLEX']['playerId'],gibbs['CPT']['playerId'])
        self.assertTrue(all(r['projection'] is None for r in rows if r['position'] in ('K','DEF')))
        self.assertTrue(all(r['projection'] is None or r['projection'] != 9999 for r in rows))
        for mutate in [lambda records:records.pop(),
                       lambda records:next(r for r in records if r['rosterPosition']=='CPT').update(salary=12345),
                       lambda records:next(r for r in records if r['rosterPosition']=='CPT' and r['projection'] is not None).update(projection=1),
                       lambda records:records[0].update(rosterPosition='QB')]:
            damaged = copy.deepcopy(rows);mutate(damaged)
            with self.assertRaises(module.PartialData):module.validate_showdown_roles(damaged,{'DET','BUF'})

    def test_calendar_selects_real_week_including_january_and_no_offseason_guess(self):
        games = SLATE['games']
        self.assertEqual(module.target_week(games, NOW)[0], (2026, 2))
        january = [{'gameId': '2026_18_A_B', 'season': 2026, 'week': 18, 'away': 'A', 'home': 'B', 'startsAt': '2027-01-10T18:00:00Z'}]
        self.assertEqual(module.target_week(january, datetime(2027, 1, 8, tzinfo=timezone.utc))[0], (2026, 18))
        with self.assertRaises(module.NoData):
            module.target_week(games, datetime(2027, 6, 1, tzinfo=timezone.utc))

    def test_discovery_requires_correct_showdown_format_and_rejects_mixed_week_metadata(self):
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
        group['GameTypeId'] = 96
        showdown = module.discover_slates(lobby,games,NOW)[0]
        self.assertEqual(showdown['rosterPositions'],['FLEX','CPT'])
        self.assertIn('Thursday Only',showdown['label'])
        group['ContestTypeId'] = 21
        group['GameTypeId'] = 1
        lobby['GameSets'][0]['Competitions'][0]['Description'] = 'DET @ TEN'
        with self.assertRaisesRegex(module.PartialData, 'different week/date/matchup'):
            module.discover_slates(lobby, games, NOW)

    def test_verified_cross_week_classic_is_excluded_but_unknown_games_still_fail(self):
        game = SLATE['games'][0]
        next_game = {**game, 'gameId':'2026_03_DET_BUF', 'week':3,
                     'startsAt':module.iso(module.instant(game['startsAt'])+timedelta(days=7))}
        competition = lambda g,id: {'Description':g['away']+' @ '+g['home'],'StartDate':g['startsAt'],'GameId':id}
        base = {'Sport':'NFL','ContestTypeId':21,'GameTypeId':1,'StartDate':game['startsAt'],'ContestStartTimeSuffix':'(Test)'}
        lobby = {'SelectedSport':'NFL', 'DraftGroups':[
            {**base,'DraftGroupId':1,'GameCount':1,'GameSetKey':'single'},
            {**base,'DraftGroupId':2,'GameCount':2,'GameSetKey':'mixed'}],
            'GameSets':[{'GameSetKey':'single','Competitions':[competition(game,1)]},
                        {'GameSetKey':'mixed','Competitions':[competition(game,1),competition(next_game,2)]}]}
        result = module.discover_slates(lobby,[game],NOW,schedule=[game,next_game])
        self.assertEqual([s['id'] for s in result],[1])
        with self.assertRaisesRegex(module.PartialData,'different week/date/matchup'):
            module.discover_slates(lobby,[game],NOW)
        lobby['GameSets'][1]['Competitions'][1]['Description']='DET @ TEN'
        with self.assertRaisesRegex(module.PartialData,'different week/date/matchup'):
            module.discover_slates(lobby,[game],NOW,schedule=[game,next_game])

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
                       lambda s: s['slates'][s['defaultSlate']]['records'].pop(),
                       lambda s: s.update(defaultSlate='2026-w2-dk-153434')]:
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
