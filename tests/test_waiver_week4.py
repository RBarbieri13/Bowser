import copy,json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import import_waivers as w
import import_waivers_week4 as latest
class Week4Waivers(unittest.TestCase):
 def setUp(self):
  self.data=json.loads((ROOT/'data/waivers-2026-week4.json').read_text());self.rows={p['name']:p for p in self.data['players']}
 def test_exact_reviewed_coverage_and_identity(self):
  result=w.validate(self.data,4)
  self.assertEqual((result['players'],result['rankSources'],result['faabSources'],result['rankCells'],result['faabCells']),(106,5,6,181,112))
  self.assertTrue(all(p['playerId'] or p['position']=='DST' for p in self.data['players']))
  self.assertEqual({p['id'] for p in self.data['players'] if p['position']=='DST'}, {'team:dst:'+p['team'] for p in self.data['players'] if p['position']=='DST'})
 def test_reviewed_numeric_readbacks_and_contexts(self):
  allen=self.rows['Braelon Allen'];self.assertEqual(allen['rankings']['cbs']['rank'],1)
  self.assertEqual(allen['faab']['rotoballer']['low'],20);self.assertEqual(allen['faab']['rotoballer']['high'],30)
  self.assertEqual(allen['faab']['fantasypros']['low'],14);self.assertEqual(allen['faab']['fantasypros']['referenceBudget'],100)
  self.assertEqual(self.rows['Kenyon Sadiq']['faab']['footballguys']['high'],30)
  self.assertEqual(self.rows['Kenyon Sadiq']['faab']['footballguys']['budgetBasis'],'annual')
  self.assertEqual(self.rows['Kalif Raymond']['rankings']['nfl']['overallRank'],3)
  self.assertEqual(self.rows['Kalif Raymond']['faab']['rotowire']['low'],7)
  self.assertEqual(self.rows['Ollie Gordon II']['faab']['cbs']['operator'],'at-most')
  self.assertEqual(self.rows['Ollie Gordon II']['faab']['cbs']['high'],15)
  self.assertEqual(self.rows['Jaylen Wright']['faab']['cbs']['low'],10)
  self.assertEqual(self.rows['Jaylen Wright']['faab']['cbs']['budgetBasis'],'unspecified')
  self.assertEqual(self.rows['Alvin Kamara']['faab']['draftsharks']['low'],8)
  self.assertEqual(self.rows['Kendre Miller']['faab']['draftsharks']['low'],8)
  self.assertEqual(self.rows['Chris Bell']['faab']['rotoballer']['low'],4)
  self.assertEqual(self.rows['Malik Washington']['faab']['rotoballer']['low'],4)
  self.assertEqual(self.rows['Christian Kirk']['faab']['rotowire']['low'],0)
  self.assertEqual(self.rows['Brandin Cooks']['faab']['rotowire']['low'],0)
 def test_no_article_order_ranks_or_superflex_contamination(self):
  self.assertTrue(all('draftsharks' not in p['rankings'] for p in self.data['players']))
  for name in ['Jalon Daniels','Case Keenum']:
   self.assertNotIn('cbs',self.rows[name]['faab'])
  self.assertEqual(self.rows['Geno Smith']['faab']['rotoballer']['low'],1)
  self.assertEqual(self.rows['Geno Smith']['faab']['rotoballer']['alternatives'][-1]['tier'],'Superflex')
 def test_wrong_scope_and_stale_dates_rejected(self):
  bad=copy.deepcopy(self.data);bad['waiverWeek']=2
  with self.assertRaises(ValueError):w.validate(bad,4)
  with self.assertRaises(ValueError):latest.scope('cbs0','<h1>2025 Week 4 Waiver Wire</h1><script>{"datePublished":"2025-09-23"}</script>',latest.datetime.now(latest.timezone.utc))
  with self.assertRaises(ValueError):latest.scope('cbs0','<h1>2026 Week 3 Waiver Wire</h1>',latest.datetime.now(latest.timezone.utc))
if __name__=='__main__':unittest.main()
