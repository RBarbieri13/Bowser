import copy
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import import_waivers as w
ROOT=Path(__file__).resolve().parents[1]
class WeekSeven(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.data=json.loads((ROOT/'data/waivers-2026-week7.json').read_text())
 def player(self,name):return next(p for p in self.data['players'] if w.name_key(p['name'])==w.name_key(name))
 def test_source_coverage_and_dates(self):
  v=w.validate(self.data,7);self.assertEqual((v['rankSources'],v['faabSources']),(5,5));self.assertEqual(v['rankCells'],190);self.assertEqual(v['faabCells'],108)
  for s in self.data['sources']:
   for e in s['evidence']:self.assertIn(e['datePublished'][:10],['2026-10-19','2026-10-20']);self.assertEqual(len(e['sha256']),64)
 def test_omar_distinct_units_and_basis(self):
  p=self.player('Omar Cooper Jr.');self.assertEqual(p['faab']['fantasypros']['low'],3);self.assertEqual(p['faab']['fantasypros']['referenceBudget'],100)
  self.assertEqual(p['faab']['cbs']['budgetBasis'],'remaining');self.assertEqual(p['faab']['cbs']['operator'],'at-least');self.assertEqual(p['faab']['cbs']['low'],15)
  self.assertEqual(p['faab']['fantasylife']['low'],22.5);self.assertEqual(p['faab']['fantasylife']['budgetBasis'],'unspecified')
 def test_rams_three_distinct_bids(self):
  for name,low,high in [('Tyler Higbee',3,4),('Colby Parkinson',2,3),('Terrance Ferguson',4,8)]:
   b=self.player(name)['faab']['rotoballer'];self.assertEqual((b['low'],b['high']),(low,high))
 def test_secondary_bids_and_qualified_range(self):
  self.assertEqual(self.player('Terrance Ferguson')['faab']['cbs']['high'],10)
  self.assertEqual(self.player('Audric Estime')['faab']['cbs']['budgetBasis'],'unspecified')
  self.assertIn('at least 5-10',self.player('Michael Mayer')['faab']['cbs']['sourceText'])
 def test_no_article_order_rank_and_separate_superflex(self):
  self.assertFalse(any('fantasylife' in p['rankings'] for p in self.data['players']))
  p=self.player('J.J. McCarthy');self.assertEqual(p['faab']['rotoballer']['low'],1)
  self.assertEqual(next(b for b in p['faab']['rotoballer']['alternatives'] if b['tier']=='Superflex')['low'],15)
  self.assertEqual(p['faab']['cbs']['tier'],'Superflex / two-QB')
 def test_rejects_wrong_week_and_missing_source(self):
  d=copy.deepcopy(self.data);d['waiverWeek']=6
  with self.assertRaises(ValueError):w.validate(d,7)
  d=copy.deepcopy(self.data)
  for p in d['players']:p['faab'].pop('fantasylife',None)
  with self.assertRaises(ValueError):w.validate(d,7)
if __name__=='__main__':unittest.main()
