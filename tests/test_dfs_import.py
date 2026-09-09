import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('dfs_import',Path(__file__).resolve().parents[1]/'scripts/import_dfs_week1.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class DfsImportTests(unittest.TestCase):
    def test_home_team_is_resolved_from_opponent_not_first_team_icon(self):
        parser=module.TableRows()
        parser.feed('<table><tr><td>Home Player, <span>WR</span><span>Q</span></td><td><span class="team NE"></span>@<span class="team after SEA"></span><span class="ophide NE">NE</span><span class="opteam ophide">SEA</span></td>'+''.join('<td>'+v+'</td>' for v in ['1','2','13.9','7,100','','NE','9','6','Wed 8:20 pm','0.4','64.8','more'])+'</tr></table>')
        row,team=parser.rows[0]
        self.assertEqual(team,'SEA')
        self.assertEqual(row[0],'Home Player, WRQ')
        self.assertEqual(float(row[4]),13.9)
    def test_identity_normalization_preserves_name_but_handles_punctuation_and_suffix(self):
        self.assertEqual(module.name_key("Ja'Marr Chase"),module.name_key('Ja’Marr Chase'))
        self.assertEqual(module.name_key('Michael Pittman Jr.'),module.name_key('Michael Pittman'))
        self.assertNotEqual(module.name_key('Josh Allen'),module.name_key('Josh Johnson'))
    def test_wrong_week_rejects_source_before_import(self):
        with self.assertRaisesRegex(ValueError,'2026 Week 1'):
            module.projections('Week 2 (2026)','151307 9/13/2026')

if __name__=='__main__':unittest.main()
