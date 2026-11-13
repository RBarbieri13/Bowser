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

if __name__=='__main__':unittest.main()
