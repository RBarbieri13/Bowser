import json
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import import_waivers as waiver
import import_waivers_current as current

ROOT=Path(__file__).resolve().parents[1]

class CurrentWaivers(unittest.TestCase):
    def test_blitz_article_order_is_not_a_rank_widget_or_positional_order(self):
        headings = ['1. Kaelon Black, RB (SF)', '2. Caleb Douglas, WR (MIA)',
                    '3. Chig Okonkwo, TE (WAS)', '4. Seth McGowan, RB (IND)',
                    '5. Cam Ward, QB (TEN)', '6. Ryan Flournoy, WR (DAL)',
                    '7. Adonai Mitchell, WR (NYJ)', '8. Makai Lemon, WR (PHI)',
                    '9. Konata Mumpfield, WR (LAR)', '10. Chicago Bears DEF']
        widget = '<table><tr><th>RK</th><th>Player</th><th>Pos</th></tr><tr><td>1</td><td>Unrelated Player NYJ • WR</td><td>WR</td></tr></table>'
        page = waiver.Page(widget + ''.join('<h2>'+h+'</h2>' for h in headings))
        rows = current.blitz_ranks(page)
        self.assertEqual(len(rows), 10)
        self.assertEqual((rows[3]['overallRank'], rows[3]['rank']), (4, 2))
        self.assertEqual((rows[-1]['team'], rows[-1]['position']), ('CHI', 'DST'))
        for broken in [headings[:-1], [h.replace('2. Caleb', '3. Caleb') for h in headings],
                       [h.replace('(SF)', '(ZZZ)') for h in headings],
                       [h.replace(', RB (SF)', ', UNKNOWN (SF)') for h in headings]]:
            with self.subTest(broken=broken), self.assertRaises(ValueError):
                current.blitz_ranks(waiver.Page(''.join('<h2>'+h+'</h2>' for h in broken)))

    def test_blitz_existing_table_format_remains_supported(self):
        rows = current.blitz_ranks(waiver.Page('<table><tr><th>RK</th><th>Player</th><th>Pos</th></tr><tr><td>1</td><td>Cam Ward TEN • QB</td><td>QB</td></tr></table>'))
        self.assertEqual((rows[0]['name'], rows[0]['rank']), ('Cam Ward', 1))

    def test_unnumbered_blitz_recommendations_do_not_become_numeric_ranks(self):
        page = waiver.Page('<h1>Week 12 Waiver Wire</h1><h2>Deshaun Watson, QB (CLE)</h2><h2>Justice Hill, RB (BAL)</h2>')
        self.assertEqual(current.blitz_ranks(page), [])
        widget = '<table><tr><th>RK</th><th>Player</th><th>Pos</th></tr><tr><td>1</td><td>Unrelated Player NYJ • WR</td><td>WR</td></tr></table>'
        self.assertEqual(current.blitz_ranks(waiver.Page(widget + '<h2>Justice Hill, RB (BAL)</h2>')), [])
        with self.assertRaisesRegex(ValueError, 'numeric priorities unavailable'):
            current.blitz_ranks(waiver.Page('<h1>Week 12 Waiver Wire</h1>'))

    def test_sharp_uses_explicit_positional_numbers_and_excludes_watch_lists(self):
        sections = [('Quarterback', 'QB', ['Deshaun Watson, Browns', 'Joe Milton, Eagles', 'Sam Darnold, Seahawks']),
                    ('Running Back', 'RB', ['Chris Rodriguez, Jaguars', 'Samaje Perine, Bengals', 'Justice Hill, Ravens']),
                    ('Wide Receiver', 'WR', ['Antonio Williams, Commanders', 'Chimere Dike, Titans', 'Ted Hurst, Bucs']),
                    ('Tight End', 'TE', ['Evan Engram, Broncos', 'Tyler Higbee, Rams', 'Kenyon Sadiq, Jets'])]
        html = ''.join('<h2>Week 12 '+label+' Fantasy Football Waiver Wire Pickups</h2>' +
                       ''.join(f'<h3>{i}. {name} — Available in 80.7% of ESPN leagues</h3>' for i, name in enumerate(names, 1)) +
                       '<h3>Watch List</h3><h3>1. Unranked Player, Browns — Available in 90% of ESPN leagues</h3>'
                       for label, _, names in sections)
        rows = current.sharp_ranks(waiver.Page(html), 12)
        self.assertEqual(len(rows), 12)
        self.assertEqual([(r['position'], r['rank']) for r in rows], [(pos, i) for _, pos, _ in sections for i in range(1, 4)])
        self.assertTrue(all(r['method'] == waiver.METHOD_POSITION and 'overallRank' not in r for r in rows))
        self.assertEqual(rows[8]['team'], 'TB')
        for broken in [html.replace('2. Joe Milton', '4. Joe Milton'),
                       html.replace('Deshaun Watson, Browns', 'Deshaun Watson, Unknown'),
                       html.replace('Week 12 Tight End', 'Week 11 Tight End')]:
            with self.subTest(broken=broken), self.assertRaises(ValueError):
                current.sharp_ranks(waiver.Page(broken), 12)
        with self.assertRaises(ValueError):
            current.verify_url('sharp', 'https://example.com/fake-ranks')

    def test_playerprofiler_percentage_label_variants_preserve_native_dollar_tiers(self):
        for suffix in ['', ' rostered']:
            html = '<p>a $100 budget; six-point per passing touchdown</p><h2>Week 12 Standard Bench Waiver Wire Targets</h2><h3>Running Back</h3>'
            html += ''.join(f'<h3>Player {i}, Jaguars (28%{suffix}) | $12-22</h3>' for i in range(10))
            rows = current.playerprofiler_bids(waiver.Page(html), 12)
            self.assertEqual(len(rows), 10)
            self.assertTrue(all((r['bid']['low'], r['bid']['high'], r['bid']['unit'], r['bid']['referenceBudget'], r['bid']['budgetBasis']) ==
                                (12, 22, 'dollars', 100, 'unspecified') for r in rows))
            self.assertTrue(all('Standard Bench' in r['bid']['tier'] for r in rows))
            with self.assertRaisesRegex(ValueError, 'reference/scoring changed'):
                current.playerprofiler_bids(waiver.Page(html.replace('a $100 budget', 'an unknown budget')), 12)

    def test_cbs_later_superflex_clause_cannot_relabel_the_earlier_base_bid(self):
        ranks = [{'name': 'Joe Milton III', 'position': 'QB', 'team': 'PHI'},
                 {'name': 'Anthony Richardson', 'position': 'QB', 'team': 'IND'}]
        page = waiver.Page('<h1>WAIVER WIRE</h1><h2>Joe Milton III</h2><p>QB</p><p>PHI</p>'
                           '<p>In deeper leagues, Milton is worth adding for 1 percent of your remaining FAAB, and he should be rostered in all Superflex and two-quarterback leagues for at least 10 percent.</p>'
                           '<h2>Anthony Richardson</h2><p>QB</p><p>IND</p>'
                           '<p>Richardson should be added in all Superflex and two-quarterback leagues for at least 10 percent of your remaining FAAB.</p>')
        with patch.object(waiver, 'parse_cbs', return_value=(ranks, [])):
            _, bids = current.cbs_facts(page)
        by_name = {row['name']: row['bid'] for row in bids}
        self.assertEqual((by_name['Joe Milton III']['low'], by_name['Joe Milton III']['tier']), (1, 'source base'))
        self.assertEqual((by_name['Anthony Richardson']['low'], by_name['Anthony Richardson']['tier']), (10, 'Superflex / two-QB'))

    def test_rolling_rankings_cannot_cross_the_requested_week_kickoff(self):
        with tempfile.TemporaryDirectory() as temporary:
            data=Path(temporary)
            schedule=data/'raw/2026/schedules.csv'
            schedule.parent.mkdir(parents=True)
            schedule.write_text('season,week,game_type,gameday\n2026,10,REG,2026-11-12\n2026,10,REG,2026-11-16\n2026,11,REG,2026-11-19\n')
            captures=data/'captures';captures.mkdir()
            for dateline,valid in [('Nov 11, 2026',True),('Nov 12, 2026',True),('Nov 16, 2026',False)]:
                with self.subTest(dateline=dateline):
                    raw=('<h1>Overall Waiver Wire Rankings - '+dateline+'</h1>').encode()
                    (captures/'fantasypros_rank.html').write_bytes(raw)
                    evidence={'fantasypros_rank':{'url':'https://www.fantasypros.com/nfl/rankings/','sha256':hashlib.sha256(raw).hexdigest(),'capturedAt':'2026-11-16T21:00:00+00:00'}}
                    (captures/'evidence.json').write_text(json.dumps(evidence))
                    with patch.object(current,'DATA',data),patch.object(current,'capture_keys',return_value=['fantasypros_rank']):
                        if valid:
                            current.read_captures(captures,10)
                        else:
                            with self.assertRaisesRegex(ValueError,'Wrong publication window'):
                                current.read_captures(captures,10)

    def test_current_week_articles_remain_valid_after_thursday_kickoff(self):
        with tempfile.TemporaryDirectory() as temporary:
            data=Path(temporary)
            schedule=data/'raw/2026/schedules.csv'
            schedule.parent.mkdir(parents=True)
            schedule.write_text('season,week,game_type,gameday\n2026,10,REG,2026-11-12\n2026,10,REG,2026-11-16\n2026,11,REG,2026-11-19\n')
            captures=data/'captures';captures.mkdir()
            for published,captured,valid in [
                ('2026-11-10','2026-11-13T21:00:00+00:00',True),
                ('2026-11-13','2026-11-13T21:00:00+00:00',True),
                ('2026-11-16','2026-11-16T21:00:00+00:00',True),
                ('2026-11-06','2026-11-13T21:00:00+00:00',False),
                ('2026-11-17','2026-11-17T21:00:00+00:00',False),
                ('2026-11-14','2026-11-13T21:00:00+00:00',False),
                ('2026-11-13','2026-11-13T21:00:00',False),
            ]:
                with self.subTest(published=published,captured=captured):
                    raw=('<h1>Week 10 Waiver Rankings</h1><script type="application/ld+json">'+json.dumps({'datePublished':published})+'</script>').encode()
                    (captures/'rotoballer_rank.html').write_bytes(raw)
                    evidence={'rotoballer_rank':{'url':'https://www.rotoballer.com/week-10','sha256':hashlib.sha256(raw).hexdigest(),'capturedAt':captured}}
                    (captures/'evidence.json').write_text(json.dumps(evidence))
                    with patch.object(current,'DATA',data),patch.object(current,'capture_keys',return_value=['rotoballer_rank']):
                        if valid:
                            _,observed=current.read_captures(captures,10)
                            self.assertEqual(observed['rotoballer_rank']['datePublished'],published)
                        else:
                            with self.assertRaisesRegex(ValueError,'Wrong publication window'):
                                current.read_captures(captures,10)

    def test_alternative_publisher_never_relaxes_core_capture_requirements(self):
        keys=set(current.CAPTURE_HOSTS)-{'dknetwork'}
        self.assertIn('playerprofiler',current.capture_keys(dict.fromkeys(keys)))
        for missing in ['playerprofiler','cbs','rotoballer_bid']:
            with self.assertRaises(ValueError):current.capture_keys(dict.fromkeys(keys-{missing}))
        with self.assertRaises(ValueError):current.verify_url('playerprofiler','https://example.com/fiction')

    def test_week10_preserves_five_actual_publishers_and_native_budget_units(self):
        snapshot=json.loads((ROOT/'data/waivers-2026-week10.json').read_text())
        result=waiver.validate(snapshot,10)
        self.assertGreaterEqual(result['rankSources'],5);self.assertGreaterEqual(result['faabSources'],5)
        player=next(row for row in snapshot['players'] if row['name']=='Caleb Douglas')
        bid=player['faab']['playerprofiler']
        self.assertEqual((bid['low'],bid['high'],bid['unit'],bid['referenceBudget']),(6,8,'dollars',100))
        self.assertIn('Standard Bench',bid['tier']);self.assertEqual(bid['budgetBasis'],'unspecified')
        self.assertFalse(any('playerprofiler' in row['rankings'] for row in snapshot['players']))
        kiner=next(row for row in snapshot['players'] if row['name']=='Corey Kiner')
        self.assertIn('conditional',kiner['rankings']['nfl']['condition'])
        self.assertEqual(kiner['rankings']['nfl']['overallRank'],3)
        higbee=next(row for row in snapshot['players'] if row['name']=='Tyler Higbee')['faab']['cbs']
        self.assertEqual((higbee['low'],higbee['operator'],higbee['budgetBasis']),(5,'at-least','remaining'))
        beck=next(row for row in snapshot['players'] if row['name']=='Carson Beck')['faab']['cbs']
        self.assertEqual(beck['low'],10);self.assertEqual(beck['tier'],'Superflex / two-QB')

    def test_week11_source_tiers_and_shared_card_bids(self):
        snapshot=json.loads((ROOT/'data/waivers-2026-week11.json').read_text())
        players={row['name']:row for row in snapshot['players']}
        for name in ['Pat Bryant', 'Courtland Sutton']:
            bid=players[name]['faab']['cbs']
            self.assertEqual((bid['low'],bid['high'],bid['operator']),(5,None,'at-least'))
        tiers=players['Cam Ward']['faab']['rotoballer']['alternatives']
        self.assertIn(('Superflex Bid',30,40),[(b['tier'],b['low'],b['high']) for b in tiers])
        bears=next(row for row in players.values() if row['position']=='DST' and row['team']=='CHI')
        self.assertEqual(bears['faab']['fantasypros']['unit'],'dollars')
        self.assertEqual(bears['faab']['rotoballer']['low'],3)

if __name__=='__main__':unittest.main()
