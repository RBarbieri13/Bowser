import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime,timezone
from contextlib import closing

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import dfs_archive as archive
import import_dfs_weekly as weekly

SNAPSHOT=json.loads((ROOT/'data/dfs-weekly.json').read_text())
# Keep parser and failure fixtures pinned while the production default advances weekly.
SNAPSHOT.update(season=2026,week=2,defaultSlate='2026-w2-dk-153427')
SNAPSHOT['slates']={key:slate for key,slate in SNAPSHOT['slates'].items() if slate['season']==2026 and slate['week']==2}
SNAPSHOT['contentFingerprint']=weekly.content_fingerprint(SNAPSHOT)
SLATE=SNAPSHOT['slates']['2026-w2-dk-153427']

class ArchiveTests(unittest.TestCase):
    def test_idempotence_and_immutable_capture_versions(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'archive.sqlite'
            first=archive.archive_snapshots(path,[SNAPSHOT]); before=path.read_bytes()
            self.assertEqual(first['insertedCaptures'],6)
            repeat=archive.archive_snapshots(path,[SNAPSHOT])
            self.assertFalse(repeat['changed']);self.assertEqual(path.read_bytes(),before)
            changed=copy.deepcopy(SNAPSHOT)
            changed['slates'][changed['defaultSlate']]['records'][0]['salary']+=100
            changed['slates'][changed['defaultSlate']]['capturedAt']='2026-09-17T02:00:00Z'
            newer=archive.archive_snapshots(path,[changed])
            self.assertEqual(newer['insertedCaptures'],1)
            self.assertEqual(newer['captures'],7)
            with closing(sqlite3.connect(path)) as db:
                captures=db.execute('SELECT COUNT(*) FROM dfs_captures WHERE slate_id=153427').fetchone()[0]
                self.assertEqual(captures,2)
            self.assertEqual(archive.verify_archive(path)['status'],'verified')

    def test_retrieval_timestamps_do_not_create_new_versions(self):
        changed=copy.deepcopy(SNAPSHOT)
        for slate in changed['slates'].values():
            slate['capturedAt']='2026-09-17T03:00:00Z'
            for row in slate['records']:
                if row.get('projectionCapturedAt'): row['projectionCapturedAt']='2026-09-17T03:00:00Z'
        self.assertEqual(weekly.content_fingerprint(SNAPSHOT),weekly.content_fingerprint(changed))
        for key in SNAPSHOT['slates']:
            self.assertEqual(archive.content_hash(SNAPSHOT['slates'][key]),archive.content_hash(changed['slates'][key]))
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'archive.sqlite';archive.archive_snapshots(path,[SNAPSHOT]);before=path.read_bytes()
            result=archive.archive_snapshots(path,[changed])
            self.assertFalse(result['changed']);self.assertEqual(path.read_bytes(),before)

    def test_recovered_prior_source_content_becomes_active_without_mutating_captures(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'archive.sqlite';archive.archive_snapshots(path,[SNAPSHOT])
            key=SNAPSHOT['defaultSlate']
            with closing(sqlite3.connect(path)) as db: original_id=db.execute('SELECT capture_id FROM dfs_slate_heads WHERE slate_key=?',(key,)).fetchone()[0]
            outage=copy.deepcopy(SNAPSHOT);outage['slates'][key]['capturedAt']='2026-09-18T01:00:00Z'
            for row in outage['slates'][key]['records']:
                if row.get('projectionSource')=='Fantasy Sports Central':row['projection']=None
            archive.archive_snapshots(path,[outage])
            recovered=copy.deepcopy(SNAPSHOT);recovered['slates'][key]['capturedAt']='2026-09-18T02:00:00Z'
            result=archive.archive_snapshots(path,[recovered]);self.assertEqual(result['insertedCaptures'],0);self.assertTrue(result['changed'])
            with closing(sqlite3.connect(path)) as db:
                head=db.execute('SELECT capture_id FROM dfs_slate_heads WHERE slate_key=?',(key,)).fetchone()[0]
                self.assertEqual(head,original_id)
                self.assertEqual(db.execute("SELECT projection FROM dfs_prices WHERE capture_id=? AND json_extract(record_json,'$.name')='Carson Wentz'",(head,)).fetchone()[0],14.95)
            repeat=archive.archive_snapshots(path,[recovered]);self.assertFalse(repeat['changed'])

    def test_publication_failures_preserve_both_outputs(self):
        with tempfile.TemporaryDirectory() as temp:
            target=Path(temp)/'current.json';target.write_text(json.dumps(SNAPSHOT))
            database=Path(temp)/'archive.sqlite';archive.archive_snapshots(database,[SNAPSHOT])
            before_json,before_db=target.read_bytes(),database.read_bytes()
            changed=copy.deepcopy(SNAPSHOT);changed['slates'][changed['defaultSlate']]['records'][0]['salary']+=100
            with patch.object(weekly,'atomic_write',side_effect=OSError('JSON staging failure')):
                with self.assertRaises(OSError):weekly.publish_snapshot_and_archive(target,changed,database,True)
            self.assertEqual(target.read_bytes(),before_json);self.assertEqual(database.read_bytes(),before_db)
            original_replace=weekly.os.replace
            def fail_archive(source,destination):
                if Path(destination)==database:raise OSError('archive publication failure')
                return original_replace(source,destination)
            with patch.object(weekly.os,'replace',side_effect=fail_archive):
                with self.assertRaises(OSError):weekly.publish_snapshot_and_archive(target,changed,database,True)
            self.assertEqual(target.read_bytes(),before_json);self.assertEqual(database.read_bytes(),before_db)

    def test_partial_or_failed_archive_preserves_last_good_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'archive.sqlite';archive.archive_snapshots(path,[SNAPSHOT]);before=path.read_bytes()
            invalid=copy.deepcopy(SNAPSHOT);invalid['slates'][invalid['defaultSlate']]['records'][0]['salary']=0
            with self.assertRaises(AssertionError):archive.archive_snapshots(path,[invalid])
            self.assertEqual(path.read_bytes(),before)
            changed=copy.deepcopy(SNAPSHOT);changed['slates'][changed['defaultSlate']]['records'][0]['salary']+=100
            with patch.object(archive.os,'replace',side_effect=OSError('disk unavailable')):
                with self.assertRaises(OSError):archive.archive_snapshots(path,[changed])
            self.assertEqual(path.read_bytes(),before)
            self.assertFalse(list(Path(temp).glob('*.tmp')))

    def supplemental_html(self,games):
        parts=['<title>DraftKings DFS Cheatsheet - Week 2</title><th>DraftKings Salary</th><th>Proj Pts</th>']
        for game in games:
            dt=weekly.instant(game['startsAt']).astimezone(weekly.ET)
            parts.append(f"{game['away']}@{game['home']} {dt.strftime('%-m/%-d/%Y %-I:%M:%S %p')}")
            for team,opp in [(game['away'],game['home']),(game['home'],game['away'])]:
                for pos in ('QB','RB','WR','TE'):
                    row=['1',f'Player{team}, Test{pos}',team,pos,opp,'$5,000','10.5','400']
                    parts.append('<tr>'+''.join(f'<td>{v}</td>' for v in row)+'</tr>')
        return ''.join(parts)

    def test_supplemental_source_requires_correct_week_dates_and_entire_schedule(self):
        games=SLATE['games'];now=datetime(2026,9,17,1,tzinfo=timezone.utc)
        html=self.supplemental_html(games); source={'retrievedAt':weekly.iso(now)}
        result=weekly.parse_supplemental_projections(html,2026,2,games,source,now)
        self.assertEqual(len(result),128)
        self.assertTrue(all(r['projectionSourceDate'] is None and r['projectionCapturedAt'] for r in result.values()))
        for bad in [html.replace('Week 2','Week 3'),html.replace('/2026','/2025'),self.supplemental_html(games[:-1])]:
            with self.assertRaises(weekly.PartialData):weekly.parse_supplemental_projections(bad,2026,2,games,source,now)

    def test_shipped_archive_preserves_old_projection_values(self):
        result=archive.verify_archive();self.assertGreaterEqual(result['captures'],14)
        with closing(sqlite3.connect(archive.DEFAULT_ARCHIVE)) as db:
            versions=db.execute("SELECT projection FROM dfs_prices JOIN dfs_captures USING(capture_id) WHERE slate_id=153427 AND json_extract(record_json,'$.name')='Carson Wentz'").fetchall()
            self.assertIn((None,),versions);self.assertIn((14.95,),versions)

if __name__=='__main__':unittest.main()
