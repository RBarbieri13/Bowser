import copy
import gzip
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from release_warehouse_expectations import expected_week_rows, compare_week_rows


class ReleaseExpectationsTests(unittest.TestCase):
    def test_dated_fixture_and_corruption_detection(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fixture.sqlite'
            path.write_bytes(gzip.decompress((ROOT / 'tests/fixtures/warehouse-2026-through-week4.sqlite.gz').read_bytes()))
            expected = expected_week_rows(path, 1)
            self.assertEqual(len(expected), 426)
            actual = list(expected.values())
            compare_week_rows(actual, expected)
            for bad in (actual[:-1], actual + actual[:1], [{**actual[0], 'player_id':'wrong'}] + actual[1:]):
                with self.assertRaises(AssertionError):
                    compare_week_rows(bad, expected)
            for field in ('snaps', 'fantasy_points', 'position_finish', 'passing_yards'):
                bad = copy.deepcopy(actual)
                bad[0][field] = 99999
                with self.assertRaises(AssertionError):
                    compare_week_rows(bad, expected)


if __name__ == '__main__':
    unittest.main()
