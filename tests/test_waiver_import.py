"""Semantic and fail-closed regression tests for the real publisher waiver import."""
import copy
import csv
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('waiver_import',ROOT/'scripts/import_waivers.py')
w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)

class WaiverImportTests(unittest.TestCase):
    def setUp(self):
        self.payload=json.loads((ROOT/'data/waivers-2026-week2.json').read_text())

    def player(self,name):
        return next(p for p in self.payload['players'] if p['name']==name)

    def test_shipped_snapshot_has_five_real_rank_and_six_faab_sources(self):
        result=w.validate(self.payload)
        self.assertEqual(result['rankSources'],5)
        self.assertEqual(result['faabSources'],6)
        self.assertGreaterEqual(result['rankCells'],160)
        self.assertGreaterEqual(result['faabCells'],130)
        self.assertNotIn('faabtastic',[s['id'] for s in self.payload['sources']])
        for source in self.payload['sources']:
            self.assertTrue(source['evidence'])
            self.assertTrue(all(len(e['sha256'])==64 for e in source['evidence']))

    def test_audited_black_values_keep_scope_tiers_and_budget_denominators(self):
        black=self.player('Kaelon Black')
        self.assertEqual(black['rankings']['rotoballer']['rank'],2)
        self.assertEqual(black['rankings']['rotoballer']['overallRank'],7)
        self.assertEqual(black['rankings']['nfl']['rank'],1)
        self.assertEqual(black['rankings']['nfl']['overallRank'],2)
        self.assertEqual(black['rankings']['draftsharks']['rank'],2)
        fp=black['faab']['fantasypros']
        self.assertEqual((fp['low'],fp['unit'],fp['referenceBudget']),(9,'dollars',100))
        self.assertEqual([a['low'] for a in fp['alternatives']],[17,5])
        rb=black['faab']['rotoballer']
        self.assertEqual((rb['low'],rb['high']),(6,10))
        self.assertEqual([(a['low'],a['high']) for a in rb['alternatives']],[(10,14),(14,20)])
        self.assertEqual(black['faab']['footballguys']['budgetBasis'],'annual')
        cbs=black['faab']['cbs']
        self.assertEqual((cbs['low'],cbs['high'],cbs['operator'],cbs['budgetBasis']),(10,None,'at-least','remaining'))

    def test_missing_is_not_zero_and_real_zero_is_preserved(self):
        self.assertNotIn('rotowire',self.player('Jalen Coker')['faab'])
        self.assertEqual(self.player('Geno Smith')['faab']['rotowire']['low'],0)
        self.assertNotIn('cbs',self.player('Drew Lock')['faab'])

    def test_up_to_bid_retains_upper_bound_operator(self):
        b=self.player('Tyler Allgeier')['faab']['cbs']
        self.assertEqual((b['low'],b['high'],b['operator']),(0,5,'at-most'))

    def test_overall_rank_is_normalized_only_within_position(self):
        rows=w.overall_to_position([
            {'name':'One','position':'WR','overallRank':1},
            {'name':'Two','position':'RB','overallRank':2},
            {'name':'Three','position':'WR','overallRank':7}])
        self.assertEqual([r['rank'] for r in rows],[1,1,2])
        self.assertEqual(rows[-1]['overallRank'],7)

    def test_unprioritized_headings_cannot_become_ranks(self):
        page=w.Page('<h1>Week 2</h1><p>Running Back</p><h3>Kaelon Black, 49ers</h3><p>Blind Bid Recommendation: 20-30%</p>')
        with self.assertRaisesRegex(ValueError,'explicitly prioritizes'):w.parse_draftsharks(page)
        cbs=w.Page('<div>WAIVER WIRE</div><div>Kaelon Black</div><div>RB</div><div>SF</div>')
        with self.assertRaisesRegex(ValueError,'explicit priority'):w.parse_cbs(cbs)

    def test_wrong_year_week_and_rolling_date_fail(self):
        for field,value in [('season',2025),('waiverWeek',1)]:
            bad=copy.deepcopy(self.payload);bad[field]=value
            with self.assertRaisesRegex(ValueError,'2026 Week 2'):w.validate(bad)
        with self.assertRaisesRegex(ValueError,'Week 2'):w.assert_scope('nfl0','<h1>2026 Week 1</h1>')
        with self.assertRaisesRegex(ValueError,'publication'):w.assert_scope('draftsharks0','<h1>Week 2 Waivers</h1><script>{"datePublished":"2025-09-15T12:00:00Z"}</script>')
        with self.assertRaisesRegex(ValueError,'rolling preview'):w.assert_scope('fantasypros0','<h1>2026 Week 2</h1><p>Overall Waiver Wire Rankings - Sep 16, 2026</p>')

    def test_coverage_counts_actual_populated_sources(self):
        bad=copy.deepcopy(self.payload)
        for p in bad['players']:p['rankings'].pop('fantasypros',None)
        with self.assertRaisesRegex(ValueError,'five actual'):w.validate(bad)
        bad=copy.deepcopy(self.payload)
        for p in bad['players']:
            p['faab'].pop('footballguys',None);p['faab'].pop('rotowire',None)
        with self.assertRaisesRegex(ValueError,'five actual'):w.validate(bad)

    def test_invalid_values_and_counts_fail(self):
        for mutation in ['negative','nan','open','missing-reference','wrong-count','future']:
            bad=copy.deepcopy(self.payload)
            b=next(p for p in bad['players'] if p['name']=='Kaelon Black')['faab']['fantasypros']
            if mutation=='negative':b['low']=-1
            if mutation=='nan':b['high']=float('nan')
            if mutation=='open':b['high']=None
            if mutation=='missing-reference':b.pop('referenceBudget')
            if mutation=='wrong-count':bad['sources'][0]['rankCount']=999
            if mutation=='future':bad['sources'][0]['evidence'][0]['datePublished']='2026-12-31T00:00:00Z'
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):w.validate(bad)

    def test_invalid_refresh_does_not_replace_good_snapshot(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'snapshot.json';path.write_bytes(b'previous good bytes')
            bad=copy.deepcopy(self.payload);bad['waiverWeek']=3
            with self.assertRaises(ValueError):w.atomic_write(path,bad)
            self.assertEqual(path.read_bytes(),b'previous good bytes')
            self.assertEqual(len(list(Path(d).iterdir())),1)
            w.atomic_write(path,self.payload)
            self.assertEqual(json.loads(path.read_text()),self.payload)

    def test_official_name_variants_join_conservatively(self):
        index=w.identity_index(ROOT/'data/raw/players.csv')
        chris=index[('chrisbrooks','RB')]
        christopher=index[('christopherbrooks','RB')]
        self.assertEqual([r['gsis_id'] for r in chris],[r['gsis_id'] for r in christopher])
        self.assertEqual(len(chris),1)
        self.assertNotEqual(w.name_key('Caleb Douglas'),w.name_key('DeMario Douglas'))
        self.assertEqual(w.name_key("Tre’ Harris"),w.name_key('Tre Harris'))

    def test_html_script_payloads_never_become_rank_tables(self):
        page=w.Page('<script><table><tr><td>Fake</td></tr></table></script><table><tr><td>Real</td></tr></table>')
        self.assertEqual(page.tables(),[[['Real']]])

if __name__=='__main__':unittest.main()
