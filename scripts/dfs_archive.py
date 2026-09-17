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
from contextlib import closing

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
CREATE TABLE IF NOT EXISTS dfs_archive_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR REPLACE INTO dfs_archive_meta VALUES ('schema_version','1');
'''


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def validate_slate(key, slate):
    assert slate['scoring'] == 'DraftKings Classic', 'Only verified Classic slates may be archived'
    assert 2010 <= slate['season'] <= 2100 and 1 <= slate['week'] <= 18
    assert slate['capturedAt'] and slate['salaryUrl'].startswith('https://www.draftkings.com/')
    records = slate['records']
    assert len(records) >= slate['gameCount'] * 40, 'Incomplete salary coverage'
    assert len(records) == len({str(r['draftKingsId']) for r in records}), 'Duplicate salary ID'
    ids = [r['playerId'] for r in records if r.get('playerId')]
    assert len(ids) == len(set(ids)), 'Ambiguous player identities'
    for row in records:
        assert isinstance(row['salary'], int) and 2000 <= row['salary'] <= 15000
        value = row.get('projection')
        if value is not None:
            assert math.isfinite(value) and 0 <= value <= 70
            assert row.get('projectionSource') and row.get('projectionUrl', '').startswith('https://')
            assert row.get('projectionSeason', slate['season']) == slate['season']
            assert row.get('projectionWeek', slate['week']) == slate['week']
    if 'validation' in slate:
        assert slate['validation']['status'] == 'verified'


def content_hash(slate):
    # Re-fetching identical provider content is idempotent. Changed projections,
    # prices or source bytes produce a new immutable version; retrieval time alone does not.
    value = {k: v for k, v in slate.items() if k not in ('capturedAt', 'sources', 'validation', 'identityAliasSource')}
    value['sourceHashes'] = {k: v.get('sha256') for k, v in slate.get('sources', {}).items()}
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def archive_snapshots(target, snapshots):
    target = Path(target)
    lock_path = Path(tempfile.gettempdir()) / ('bowser-archive-' + hashlib.sha256(str(target.resolve()).encode()).hexdigest()[:20] + '.lock')
    with lock_path.open('a') as lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError('Another DFS archive update is running') from error
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
    db = None
    try:
        if target.exists():
            shutil.copyfile(target, temporary)
        with sqlite3.connect(temporary) as db:
            db.executescript(SCHEMA)
            for key, slate in slates:
                fingerprint = content_hash(slate)
                capture_id = f"{slate['season']}-w{slate['week']}-dk{slate['id']}-{fingerprint[:20]}"
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
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert not db.execute('PRAGMA foreign_key_check').fetchall()
            captures = db.execute('SELECT COUNT(*) FROM dfs_captures').fetchone()[0]
            rows = db.execute('SELECT COUNT(*) FROM dfs_prices').fetchone()[0]
            weeks = [dict(zip(('season','week'), r)) for r in db.execute('SELECT DISTINCT season,week FROM dfs_captures ORDER BY season,week')]
        db.close()
        if inserted or not target.exists():
            with temporary.open('rb') as handle:
                os.fsync(handle.fileno())
            os.replace(temporary, target)
        return {'path': str(target), 'insertedCaptures': inserted, 'captures': captures, 'rows': rows, 'weeks': weeks, 'changed': bool(inserted)}
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
