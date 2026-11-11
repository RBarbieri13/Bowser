import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import import_waivers as waiver
import import_waivers_current as current

ROOT=Path(__file__).resolve().parents[1]

class CurrentWaivers(unittest.TestCase):
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
