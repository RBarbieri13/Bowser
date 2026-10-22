#!/usr/bin/env python3
"""Import an explicitly selected, complete pregame Showdown projection CSV.

Official salary/identity records remain unchanged. Source CSVs stay outside Git;
only the requested projections and file provenance enter the public DFS snapshot.
"""
import argparse
import copy
import csv
import hashlib
import io
import json
import math
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from import_dfs_weekly import (ROOT, SHOWDOWN_RULES, content_fingerprint, coverage,
    instant, is_showdown, iso, name_key, position_key, publish_snapshot_and_archive,
    require, team_key, validate_snapshot)

PROVIDER = 'RotoGrinders CSV (user supplied)'
SOURCE_URL = 'https://rotogrinders.com/lineuphq/nfl'


def identity(name, position, team):
    return name_key(name), position_key(position), team_key(team)


def prepare(snapshot, csv_bytes, filename, slate_key, now, database_ids):
    validate_snapshot(snapshot)
    require(slate_key in snapshot['slates'], 'Unknown target slate')
    old = snapshot['slates'][slate_key]
    require(is_showdown(old) and old['gameCount'] == 1, 'Target must be full-game Showdown')
    require(now.tzinfo is not None and now < instant(old['startsAt']), 'Refuse post-lock projection import')
    require(now >= instant(old['capturedAt']), 'Import clock predates current capture')
    require(f"_{old['id']}.csv" in filename, 'CSV filename must identify the selected DraftKings slate')
    reader = csv.DictReader(io.StringIO(csv_bytes.decode('utf-8-sig')))
    require({'name','team','opp','pos','fpts','salary'} <= set(reader.fieldnames or []), 'Missing projection CSV columns')
    flex = {identity(r['name'],r['position'],r['team']): r for r in old['records'] if r['rosterPosition'] == 'FLEX'}
    game = old['games'][0]
    opponents = {team_key(game['away']):team_key(game['home']), team_key(game['home']):team_key(game['away'])}
    parsed = {}
    for row in reader:
        key = identity(row['name'],row['pos'],row['team'])
        require(key not in parsed, f'Duplicate CSV identity: {row["name"]}')
        require(key in flex, f'CSV player absent from target salary pool: {row["name"]}')
        require(team_key(row['opp']) == opponents[key[2]], 'CSV opponent does not match selected game')
        require(int(row['salary']) == flex[key]['salary'], f'CSV FLEX salary mismatch: {row["name"]}')
        value = float(row['fpts']) if row['fpts'].strip() else None
        require(value is None or (math.isfinite(value) and 0 <= value <= 70), 'Invalid CSV projection')
        parsed[key] = value
    require(set(parsed) == set(flex), 'CSV must cover the complete selected FLEX pool; no fallback to old values')
    sha = hashlib.sha256(csv_bytes).hexdigest()
    previous_import = old.get('projectionImport', {})
    if previous_import.get('sha256') == sha:
        return snapshot, {'changed':False,'slate':slate_key,'reason':'Identical supplied CSV already imported'}
    result = copy.deepcopy(snapshot)
    slate = result['slates'][slate_key]
    stamp = iso(now)
    for row in slate['records']:
        for field in list(row):
            if field.startswith('projection'):
                del row[field]
        value = parsed[identity(row['name'],row['position'],row['team'])]
        multiplier = 1.5 if row['rosterPosition'] == 'CPT' else 1
        row.update(projection=None if value is None else round(value * multiplier,4),
            projectionBase=value, projectionMultiplier=multiplier, projectionSource=PROVIDER,
            projectionUrl=SOURCE_URL, projectionSourceDate=None, projectionCapturedAt=stamp,
            projectionSourceDateBasis='Publication/export time absent from supplied CSV; import time shown separately',
            projectionSeason=slate['season'], projectionWeek=slate['week'], projectionGameId=game['gameId'],
            projectionSourceSalary=flex[identity(row['name'],row['position'],row['team'])]['salary'],
            projectionBasis='User-supplied full-game CSV fpts' + (' × 1.5 Captain multiplier' if multiplier == 1.5 else '; unscaled FLEX'),
            projectionRulesUrl=SHOWDOWN_RULES, projectionSourceSha256=sha,
            projectionUnavailableReason='Blank fpts in supplied CSV; no prior-provider fallback' if value is None else None)
    for key in ('primaryProjectionStatus','supplementalProjectionStatus','projectionStatus'):
        slate.pop(key,None)
    slate.update(capturedAt=stamp, projectionProvider=PROVIDER, projectionSourceDate=None,
        projectionBasis='Supplied CSV fpts for FLEX; explicit 1.5× for CPT; original official salaries retained.',
        projectionImport={'filename':Path(filename).name,'sha256':sha,'importedAt':stamp,
            'sourcePublishedAt':None,'format':'RotoGrinders projection export',
            'scope':'Complete selected slate only; blanks replace previous projections with null'},
        projectionStatus={'status':'partial' if any(v is None for v in parsed.values()) else 'available',
            'refreshMode':'user-supplied-csv','projectedPlayers':sum(v is not None for v in parsed.values())*2,
            'missingPlayers':sum(v is None for v in parsed.values())*2,'publicationTime':None},
        validation={'status':'verified'})
    # Keep official schedule/salary lineage; remove displaced projection sources.
    slate['sources'] = {k:v for k,v in slate['sources'].items() if 'projection' not in k}
    slate['sources']['user-projections.csv'] = {'url':SOURCE_URL,'retrievedAt':stamp,'sha256':sha,
        'bytes':len(csv_bytes),'filename':Path(filename).name,
        'acquisition':'User attachment; URL identifies provider, not an automated download','publishedAt':None}
    slate['coverage'] = coverage(slate['records'], {k:v for k,v in parsed.items() if v is not None}, database_ids)
    slate['coverage']['sourceCsvRows'] = len(parsed)
    slate['coverage']['projectionCoverageDefinition'] = 'Complete CSV identity/team/opponent/FLEX-salary match; nonblank fpts only; explicit CPT ×1.5. Blank rows stay unavailable.'
    result.update(capturedAt=stamp,validation={'status':'verified','verifiedAt':stamp})
    result['contentFingerprint'] = content_fingerprint(result)
    validate_snapshot(result)
    return result, {'changed':True,'slate':slate_key,'sourceSha256':sha,'sourcePlayers':len(parsed),
        'projectedPlayers':sum(v is not None for v in parsed.values()),'unavailablePlayers':sum(v is None for v in parsed.values()),
        'salaryEntries':len(slate['records']),'importedAt':stamp}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv',type=Path)
    parser.add_argument('--slate',required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'data/dfs-weekly.json')
    parser.add_argument('--archive',type=Path,default=ROOT/'data/dfs_archive.sqlite')
    parser.add_argument('--dry-run',action='store_true')
    args = parser.parse_args()
    try:
        snapshot = json.loads(args.output.read_text())
        with closing(sqlite3.connect(f"file:{ROOT / 'data' / ('fantasy_football_' + str(snapshot['season']) + '.sqlite')}?mode=ro",uri=True)) as db:
            ids = {r[0] for r in db.execute('SELECT player_id FROM players')}
        updated, report = prepare(snapshot,args.csv.read_bytes(),args.csv.name,args.slate,datetime.now(timezone.utc),ids)
        if report['changed'] and not args.dry_run:
            report['archive'] = publish_snapshot_and_archive(args.output,updated,args.archive,True)
        print(json.dumps({'status':'verified','publishable':True,**report},indent=2))
        return 0
    except (ValueError,KeyError,AssertionError,OSError) as exc:
        print(json.dumps({'status':'failed','changed':False,'publishable':False,'lastGoodPreserved':True,'reason':str(exc)},indent=2))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
