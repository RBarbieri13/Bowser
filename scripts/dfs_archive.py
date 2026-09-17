#!/usr/bin/env python3
"""Append verified DFS captures to a separate atomic, immutable-version SQLite archive."""
import argparse
import hashlib
import fcntl
import json
import math
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
from contextlib import closing, contextmanager

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARCHIVE = ROOT / 'data/dfs_archive.sqlite'
SCHEMA = '''
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS dfs_captures (
 capture_id TEXT PRIMARY KEY, slate_key TEXT NOT NULL, season INTEGER NOT NULL,
 week INTEGER NOT NULL, slate_id INTEGER NOT NULL, captured_at TEXT NOT NULL,
 game_count INTEGER NOT NULL, starts_at TEXT, ends_at TEXT,
 content_sha256 TEXT NOT NULL, metadata_json TEXT NOT NULL,
 UNIQUE(season, week, slate_id, content_sha256)
);
CREATE INDEX IF NOT EXISTS dfs_capture_lookup ON dfs_captures(season,week,slate_id,captured_at);
CREATE TABLE IF NOT EXISTS dfs_prices (
 capture_id TEXT NOT NULL REFERENCES dfs_captures(capture_id), draft_kings_id TEXT NOT NULL,
 player_id TEXT, salary INTEGER NOT NULL, projection REAL, record_json TEXT NOT NULL,
 PRIMARY KEY(capture_id,draft_kings_id)
);
CREATE INDEX IF NOT EXISTS dfs_player_lookup ON dfs_prices(player_id,capture_id);
CREATE TABLE IF NOT EXISTS dfs_slate_heads (slate_key TEXT PRIMARY KEY,capture_id TEXT NOT NULL REFERENCES dfs_captures(capture_id),observed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dfs_archive_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR REPLACE INTO dfs_archive_meta VALUES ('schema_version','2');
'''


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def validate_slate(key, slate):
    showdown = slate.get('contestTypeId') == 96 and slate['scoring'] == 'DraftKings Showdown Captain Mode'
    assert showdown or slate['scoring'] == 'DraftKings Classic', 'Only supported verified formats may be archived'
    if showdown:
        assert slate['gameCount'] == 1 and slate.get('rosterPositions') == ['FLEX','CPT']
        by_role = {role:{(r['name'],r['position'],r['team']):r for r in slate['records'] if r.get('rosterPosition') == role} for role in ('FLEX','CPT')}
        assert set(by_role['FLEX']) == set(by_role['CPT']) and len(by_role['FLEX']) >= 40
        assert len(slate['records']) == 2*len(by_role['FLEX'])
        for identity, flex in by_role['FLEX'].items():
            captain=by_role['CPT'][identity]
            assert captain['salary'] == flex['salary']*1.5 and captain['playerId'] == flex['playerId']
            assert (captain['projection'] is None) == (flex['projection'] is None)
            if flex['projection'] is not None:
                assert flex['projection'] == flex['projectionBase'] == captain['projectionBase']
                assert captain['projection'] == round(flex['projection']*1.5,4)
                assert flex['projectionMultiplier'] == 1 and captain['projectionMultiplier'] == 1.5
    assert 2010 <= slate['season'] <= 2100 and 1 <= slate['week'] <= 18
    assert slate['capturedAt'] and slate['salaryUrl'].startswith('https://www.draftkings.com/')
    records = slate['records']
    assert len(records) >= slate['gameCount'] * 40, 'Incomplete salary coverage'
    assert len(records) == len({str(r['draftKingsId']) for r in records}), 'Duplicate salary ID'
    ids = [(r['playerId'],r.get('rosterPosition') if showdown else None) for r in records if r.get('playerId')]
    assert len(ids) == len(set(ids)), 'Ambiguous player identities'
    if not showdown: assert all(not row.get('rosterPosition') for row in records), 'Classic captures cannot contain Showdown roles'
    for row in records:
        assert isinstance(row['salary'], int) and (200 if showdown else 2000) <= row['salary'] <= (30000 if showdown else 15000)
        value = row.get('projection')
        if value is not None:
            assert math.isfinite(value) and 0 <= value <= (105 if showdown else 70)
            assert row.get('projectionSource') and row.get('projectionUrl', '').startswith('https://')
            assert row.get('projectionSeason', slate['season']) == slate['season']
            assert row.get('projectionWeek', slate['week']) == slate['week']
    if 'validation' in slate:
        assert slate['validation']['status'] == 'verified'


def content_hash(slate):
    # Re-fetching identical provider content is idempotent. Changed projections,
    # prices or source bytes produce a new immutable version; retrieval time alone does not.
    value = {k: v for k, v in slate.items() if k not in ('capturedAt', 'sources', 'validation', 'identityAliasSource','captureId','contentSha256')}
    value['records'] = [{k:v for k,v in row.items() if k != 'projectionCapturedAt'} for row in slate['records']]
    value['sourceHashes'] = {k: v.get('sha256') for k, v in slate.get('sources', {}).items()}
    return hashlib.sha256(canonical(value).encode()).hexdigest()


@contextmanager
def archive_lock(target):
    target = Path(target)
    lock_path = Path(tempfile.gettempdir()) / ('bowser-archive-' + hashlib.sha256(str(target.resolve()).encode()).hexdigest()[:20] + '.lock')
    with lock_path.open('a') as lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError('Another DFS archive update is running') from error
        yield


def archive_snapshots(target, snapshots):
    with archive_lock(target):
        return _archive_snapshots(target,snapshots)


def _archive_snapshots(target, snapshots):
    """Validate everything before copying and replacing the archive. Never edit source warehouses."""
    target = Path(target)
    slates = [(key, slate) for snapshot in snapshots for key, slate in snapshot['slates'].items()]
    for key, slate in slates:
        validate_slate(key, slate)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f'.{target.name}.', suffix='.tmp', dir=target.parent)
    os.close(fd)
    temporary = Path(temporary)
    inserted = 0
    heads_changed = 0
    db = None
    try:
        if target.exists():
            shutil.copyfile(target, temporary)
        with sqlite3.connect(temporary) as db:
            had_heads = bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='dfs_slate_heads'").fetchone())
            db.executescript(SCHEMA)
            if not had_heads:
                db.execute("INSERT INTO dfs_slate_heads SELECT slate_key,capture_id,captured_at FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY slate_key ORDER BY captured_at DESC,capture_id DESC) AS priority FROM dfs_captures) WHERE priority=1")
                heads_changed += 1
            for key, slate in slates:
                fingerprint = content_hash(slate)
                capture_id = f"{slate['season']}-w{slate['week']}-dk{slate['id']}-{fingerprint[:20]}"
                # Older captures used a hash that included per-row retrieval times.
                # Compare canonical source content without rewriting those immutable IDs.
                equivalent = False
                for prior_id, prior_json in db.execute('SELECT capture_id,metadata_json FROM dfs_captures WHERE season=? AND week=? AND slate_id=?', (slate['season'],slate['week'],slate['id'])).fetchall():
                    prior = json.loads(prior_json)
                    prior['records'] = [json.loads(row[0]) for row in db.execute('SELECT record_json FROM dfs_prices WHERE capture_id=? ORDER BY rowid',(prior_id,))]
                    if content_hash(prior) == fingerprint:
                        equivalent = True
                        capture_id = prior_id
                        break
                if not equivalent:
                    metadata = {k: v for k, v in slate.items() if k != 'records'}
                    metadata.update({'captureId': capture_id, 'contentSha256': fingerprint})
                    cursor = db.execute('INSERT OR IGNORE INTO dfs_captures VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                        (capture_id, key, slate['season'], slate['week'], slate['id'], slate['capturedAt'],
                         slate['gameCount'], slate.get('startsAt'), slate.get('endsAt'), fingerprint, canonical(metadata)))
                    if cursor.rowcount:
                        inserted += 1
                        db.executemany('INSERT INTO dfs_prices VALUES (?,?,?,?,?,?)', [
                            (capture_id, str(r['draftKingsId']), r.get('playerId'), r['salary'], r.get('projection'), canonical(r))
                            for r in slate['records']])
                head = db.execute('SELECT capture_id,observed_at FROM dfs_slate_heads WHERE slate_key=?',(key,)).fetchone()
                if not head or (head[0] != capture_id and slate['capturedAt'] >= head[1]):
                    db.execute('INSERT OR REPLACE INTO dfs_slate_heads VALUES (?,?,?)',(key,capture_id,slate['capturedAt']))
                    heads_changed += 1
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert not db.execute('PRAGMA foreign_key_check').fetchall()
            captures = db.execute('SELECT COUNT(*) FROM dfs_captures').fetchone()[0]
            rows = db.execute('SELECT COUNT(*) FROM dfs_prices').fetchone()[0]
            weeks = [dict(zip(('season','week'), r)) for r in db.execute('SELECT DISTINCT season,week FROM dfs_captures ORDER BY season,week')]
        db.close()
        if inserted or heads_changed or not target.exists():
            with temporary.open('rb') as handle:
                os.fsync(handle.fileno())
            os.replace(temporary, target)
        return {'path': str(target), 'insertedCaptures': inserted, 'captures': captures, 'rows': rows, 'weeks': weeks, 'changed': bool(inserted or heads_changed), 'headsChanged': heads_changed}
    finally:
        if db is not None:
            db.close()
        temporary.unlink(missing_ok=True)


def verify_archive(target=DEFAULT_ARCHIVE):
    with closing(sqlite3.connect(f'file:{Path(target).resolve()}?mode=ro', uri=True)) as db:
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        for capture_id, key, metadata in db.execute('SELECT capture_id,slate_key,metadata_json FROM dfs_captures'):
            slate = json.loads(metadata)
            slate['records'] = [json.loads(row[0]) for row in db.execute('SELECT record_json FROM dfs_prices WHERE capture_id=?', (capture_id,))]
            validate_slate(key, slate)
        return {'status': 'verified', 'captures': db.execute('SELECT COUNT(*) FROM dfs_captures').fetchone()[0],
                'rows': db.execute('SELECT COUNT(*) FROM dfs_prices').fetchone()[0]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, default=DEFAULT_ARCHIVE)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.verify:
        result = verify_archive(args.archive)
    else:
        result = archive_snapshots(args.archive, [json.loads((ROOT / 'data' / name).read_text())
            for name in ('dfs-week1-2026.json', 'dfs-weekly.json')])
    print(json.dumps(result, indent=2))
