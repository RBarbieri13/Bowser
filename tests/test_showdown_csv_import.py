#!/usr/bin/env python3
"""Regression gates for externally supplied complete Showdown projection pools."""
import copy
import csv
import io
import json
from pathlib import Path
import sys
import unittest
from datetime import timedelta

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from import_showdown_csv import prepare
from import_dfs_weekly import ROOT, instant

KEY = '2026-w7-dk-155204'
FILENAME = 'projections_draftkings_nfl_155204.csv'


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = json.loads((ROOT/'data/dfs-weekly.json').read_text())
        slate = self.snapshot['slates'][KEY]
        self.now = instant(slate['capturedAt']) + timedelta(seconds=1)
        self.rows = [{'name':r['name'],'team':r['team'],'opp':'CHI' if r['team']=='NE' else 'NE',
            'pos':'DST' if r['position']=='DEF' else r['position'],'fpts':'10.21','salary':r['salary']}
            for r in slate['records'] if r['rosterPosition']=='FLEX']
        self.rows[0]['fpts'] = ''
        self.rows[1]['fpts'] = '0'

    def run_import(self, rows=None, **kwargs):
        out = io.StringIO()
        writer = csv.DictWriter(out,fieldnames=['name','team','opp','pos','fpts','salary'])
        writer.writeheader();writer.writerows(self.rows if rows is None else rows)
        return prepare(self.snapshot,out.getvalue().encode(),kwargs.get('filename',FILENAME),
            KEY,kwargs.get('now',self.now),set())

    def test_scope_null_zero_roles_and_provenance(self):
        before = copy.deepcopy(self.snapshot)
        result,report = self.run_import()
        self.assertEqual(before,self.snapshot)
        self.assertTrue(report['changed'])
        self.assertEqual(result['defaultSlate'],before['defaultSlate'])
        for key in before['slates']:
            if key != KEY:self.assertEqual(result['slates'][key],before['slates'][key])
        rows = result['slates'][KEY]['records']
        for prior,row in zip(before['slates'][KEY]['records'],rows):
            self.assertEqual({k:v for k,v in prior.items() if not k.startswith('projection')},
                {k:v for k,v in row.items() if not k.startswith('projection')})
            raw = next(r['fpts'] for r in self.rows if r['name']==row['name'] and r['team']==row['team'])
            expected = None if raw=='' else round(float(raw)*(1.5 if row['rosterPosition']=='CPT' else 1),4)
            self.assertEqual(row['projection'],expected)
            self.assertIsNone(row['projectionSourceDate'])
            self.assertEqual(row['projectionCapturedAt'],self.now.isoformat().replace('+00:00','Z'))
            self.assertNotIn('projectionSalaryValidationSlateId',row)
        self.assertEqual(sum(r['projection'] is None for r in rows),2)
        self.assertEqual(sum(r['projection']==0 for r in rows),2)
        self.assertEqual(result['slates'][KEY]['coverage']['projectedPlayers'],len(rows)-2)

    def test_invalid_inputs_rejected(self):
        for field,value in [('salary','999'),('team','DAL'),('opp','DAL'),('fpts','nan'),('fpts','inf'),('fpts','-1'),('fpts','bad')]:
            with self.subTest(field=field,value=value):
                rows=copy.deepcopy(self.rows);rows[0][field]=value
                with self.assertRaises((ValueError,KeyError)):self.run_import(rows)
        for rows in [self.rows[:-1],self.rows+[self.rows[0]]]:
            with self.assertRaises(ValueError):self.run_import(rows)
        with self.assertRaises(ValueError):self.run_import(filename='projections_draftkings_nfl_999.csv')
        with self.assertRaises(ValueError):self.run_import(now=instant(self.snapshot['slates'][KEY]['startsAt']))

    def test_identical_file_is_noop(self):
        result,_=self.run_import()
        self.snapshot=result
        again,report=self.run_import()
        self.assertFalse(report['changed'])
        self.assertIs(again,result)


if __name__=='__main__':unittest.main()
