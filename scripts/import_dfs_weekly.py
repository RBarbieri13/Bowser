#!/usr/bin/env python3
"""Refresh dated DraftKings Classic and full-game Showdown slates; never modify the pinned Week 1 archive.

Exit 0: verified updated/unchanged (inspect JSON `changed` before publishing).
Exit 3: incomplete/unsafe source data, last good snapshot preserved.
Exit 4: no upcoming NFL week or no supported slates available; last good preserved.
Exit 1: transport/unexpected failure; last good preserved. No partial publication.
"""
import argparse
import csv
import fcntl
import hashlib
import io
import json
import math
import os
import re
import sqlite3
import shutil
import sys
import tempfile
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from import_dfs_week1 import TableRows, name_key
from dfs_archive import archive_snapshots, archive_lock, verify_archive

ROOT = Path(__file__).resolve().parents[1]
LOBBY = 'https://www.draftkings.com/lobby/getcontests?sport=NFL'
SCHEDULE = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'
FIC = 'https://www.fantasyinfocentral.com/nfl/dfs/projections/draftkings'
FSC = 'https://fantasysportscentral.com/football/dfscheat.php'
ET = ZoneInfo('America/New_York')
TEAM_ALIASES = {'LA': 'LAR', 'JAC': 'JAX', 'WSH': 'WAS', 'OAK': 'LV', 'SD': 'LAC'}
POSITIONS = {'QB', 'RB', 'WR', 'TE', 'DEF'}
SHOWDOWN_RULES = 'https://help.draftkings.com/hc/en-us/articles/24808583978003-Game-Style-Showdowns-Overview-US'

def is_showdown(slate):
    return slate.get('contestTypeId') == 96 and slate.get('scoring') == 'DraftKings Showdown Captain Mode'



class PartialData(ValueError):
    pass


class NoData(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise PartialData(reason)


def team_key(team):
    return TEAM_ALIASES.get(team, team)


def position_key(position):
    return {'DST': 'DEF', 'FB': 'RB', 'HB': 'RB'}.get(position, position)


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def instant(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def digest(value):
    return hashlib.sha256(value).hexdigest()


class Fetcher:
    def __init__(self, raw_dir, now):
        self.raw_dir, self.now, self.sources = raw_dir, now, {}

    def get(self, url, name):
        request = urllib.request.Request(url, headers={'User-Agent': 'Bowser fantasy research/2.0', 'Accept': '*/*'})
        with urllib.request.urlopen(request, timeout=45) as response:
            body = response.read(15_000_001)
            require(len(body) <= 15_000_000, f'{name}: response exceeds size limit')
            require(response.status == 200, f'{name}: unexpected HTTP status')
            headers = {k.lower(): v for k, v in response.headers.items()}
            final_url = response.url
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        (self.raw_dir / name).write_bytes(body)
        self.sources[name] = {'url': url, 'resolvedUrl': final_url, 'retrievedAt': iso(self.now),
                              'lastModified': headers.get('last-modified'), 'httpDate': headers.get('date'),
                              'sha256': digest(body), 'bytes': len(body)}
        return body.decode('utf-8-sig')


def parse_schedule(text):
    result = []
    for row in csv.DictReader(io.StringIO(text)):
        if row['game_type'] != 'REG' or not row['gametime']:
            continue
        start = datetime.fromisoformat(f"{row['gameday']}T{row['gametime']}").replace(tzinfo=ET)
        result.append({'gameId': row['game_id'], 'season': int(row['season']), 'week': int(row['week']),
                       'away': team_key(row['away_team']), 'home': team_key(row['home_team']), 'startsAt': iso(start)})
    require(bool(result), 'Schedule has no dated regular-season games')
    return result


def target_week(schedule, now):
    weeks = defaultdict(list)
    for game in schedule:
        weeks[(game['season'], game['week'])].append(game)
    candidates = [(key, games) for key, games in weeks.items()
                  if max(instant(g['startsAt']) for g in games) + timedelta(hours=4) >= now
                  and min(instant(g['startsAt']) for g in games) <= now + timedelta(days=8)]
    if not candidates:
        raise NoData('No current or upcoming regular-season week within eight days')
    key, games = min(candidates, key=lambda item: min(g['startsAt'] for g in item[1]))
    return key, sorted(games, key=lambda g: (g['startsAt'], g['gameId']))


def discover_slates(lobby, games, now):
    require(lobby.get('SelectedSport') == 'NFL', 'DraftKings lobby is not NFL')
    game_sets = {g['GameSetKey']: g for g in lobby.get('GameSets', [])}
    expected = {(g['away'], g['home'], instant(g['startsAt'])): g for g in games}
    slates = []
    for group in lobby.get('DraftGroups', []):
        format_ids = (group.get('ContestTypeId'), group.get('GameTypeId'))
        if group.get('Sport') != 'NFL' or format_ids not in ((21, 1), (96, 96)):
            continue
        showdown = format_ids == (96, 96)
        competitions = game_sets.get(group['GameSetKey'], {}).get('Competitions', [])
        if not competitions:
            raise PartialData(f"Classic group {group['DraftGroupId']} has no game metadata")
        # Other weeks in the lobby are deliberately excluded, never relabeled.
        if not any(instant(g['StartDate']) == instant(e['startsAt']) for g in competitions for e in games):
            continue
        selected = []
        for game in competitions:
            matchup = re.fullmatch(r'([A-Z]{2,3}) @ ([A-Z]{2,3})', game['Description'])
            require(matchup is not None, 'Unknown DraftKings game description')
            key = (team_key(matchup[1]), team_key(matchup[2]), instant(game['StartDate']))
            require(key in expected, f"Classic group {group['DraftGroupId']} contains a different week/date/matchup")
            selected.append({**expected[key], 'draftKingsGameId': game['GameId']})
        require(len(selected) == group['GameCount'] == len({g['gameId'] for g in selected}), 'DraftKings game count mismatch')
        require(instant(group['StartDate']) == min(instant(g['startsAt']) for g in selected), 'DraftKings start metadata mismatch')
        # Never refresh a locked contest with post-start projections.
        if instant(group['StartDate']) <= now:
            continue
        suffix = (group.get('ContestStartTimeSuffix') or '').strip(' ()')
        is_main = all(instant(g['startsAt']).astimezone(ET).weekday() == 6 and
                      12 <= instant(g['startsAt']).astimezone(ET).hour < 18 for g in selected)
        kind = 'All-week Classic' if len(selected) == len(games) else ('Sunday Main' if not suffix and is_main else suffix or 'Classic')
        if showdown:
            require(len(selected) == 1, 'Full-game Showdown must contain exactly one game')
            game = selected[0]
            day = instant(game['startsAt']).astimezone(ET).strftime('%A')
            kind = f"{day} Only · {game['away']} @ {game['home']} · Showdown"
        dates = sorted({instant(g['startsAt']).astimezone(ET).date().isoformat() for g in selected})
        season, week = selected[0]['season'], selected[0]['week']
        key = f"{season}-w{week}-dk-{group['DraftGroupId']}"
        slates.append({'key': key, 'id': group['DraftGroupId'], 'season': season, 'week': week,
                       'label': f"{season} W{week} · {kind} · {dates[0][5:]}" + (f"–{dates[-1][5:]}" if len(dates) > 1 else ''),
                       'kind': kind, 'scoring': 'DraftKings Showdown Captain Mode' if showdown else 'DraftKings Classic',
                       'contestTypeId': group['ContestTypeId'],
                       **({'gameTypeId':96,'rosterPositions':['FLEX','CPT'],'defaultRosterPosition':'FLEX','scoringRulesUrl':SHOWDOWN_RULES,
                           'projectionBasis':'Full-game DraftKings source projection. FLEX uses 1×; CPT uses the official 1.5× multiplier. Salaries are official role-specific values.'} if showdown else {}),
                       'startsAt': min(g['startsAt'] for g in selected), 'endsAt': max(g['startsAt'] for g in selected),
                       'gameCount': len(selected), 'games': sorted(selected, key=lambda g: (g['startsAt'], g['gameId']))})
    if not slates:
        raise NoData('No unlocked DraftKings Classic or full-game Showdown slates for the scheduled week')
    require(len(slates) == len({s['key'] for s in slates}), 'Duplicate DraftKings draft group')
    return sorted(slates, key=lambda s: (-s['gameCount'], s['id']))


def parse_projections(html, season, week, games, source, now):
    titles = re.findall(r'NFL DraftKings DFS Projections for Week (\d+) \((\d+)\)', html)
    require(titles and set(titles) == {(str(week), str(season))}, 'Projection season/week does not match schedule')
    require('Projected draftkings Points' in html, 'Projection column definition changed')
    modified = source.get('lastModified')
    require(bool(modified), 'Projection source has no Last-Modified date')
    published = parsedate_to_datetime(modified).astimezone(timezone.utc)
    first = min(instant(g['startsAt']) for g in games)
    require(first - timedelta(days=9) <= published <= now + timedelta(minutes=10), 'Projection source date outside current pregame week')
    require(now - published <= timedelta(hours=72), 'Projection source is over 72 hours old')
    by_team = {t: g for g in games for t in (g['away'], g['home'])}
    parser = TableRows()
    parser.feed(html)
    result = {}
    for row, team in parser.rows:
        require(len(row) == 14 and team is not None, 'Projection table row format changed')
        match = re.fullmatch(r'(.+), (QB|RB|WR|TE)(?:[A-Z ]*)', row[0])
        require(match is not None, 'Unknown projection player format')
        name, position = match.groups()
        team, opponent = team_key(team), team_key(row[7])
        require(team in by_team, f'Projection team {team} is outside the target week')
        game = by_team[team]
        require(opponent in (game['away'], game['home']) and opponent != team, f'Projection matchup mismatch: {name}')
        local = instant(game['startsAt']).astimezone(ET)
        expected_time = local.strftime('%a %-I:%M %p').lower()
        require(row[10].lower() == expected_time, f'Projection kickoff mismatch: {name}: {row[10]} != {expected_time}')
        value = float(row[4])
        require(math.isfinite(value) and 0 <= value <= 70, f'Invalid projection: {name}')
        key = (name_key(name), position, team)
        require(key not in result, f'Ambiguous projection identity: {name}')
        result[key] = {'projection': value, 'projectionSource': 'Fantasy Info Central', 'projectionUrl': FIC,
                       'projectionSourceDate': iso(published), 'projectionSeason': season, 'projectionWeek': week,
                       'projectionGameId': game['gameId'], 'projectionSourceSalary': int(row[5].replace(',', ''))}
    # Check the provider's football coverage, not a fixed player count from a different week/provider.
    coverage = {(key[2], key[1]) for key in result}
    missing = sorted((t, p) for t in by_team for p in ('QB', 'RB', 'WR', 'TE') if (t, p) not in coverage)
    require(not missing, f'Projection source misses scheduled team/position coverage: {missing}')
    return result


def roster_identities(text, season, week, alias_text):
    rows = list(csv.DictReader(io.StringIO(text)))
    require(rows and all(int(r['season']) == season for r in rows), 'Roster season mismatch')
    roster_week = max(int(r['week']) for r in rows if r['week'])
    require(week - 1 <= roster_week <= week, 'Roster is not current for the target week')
    rows = [r for r in rows if int(r.get('week') or roster_week) == roster_week]
    require(len({team_key(r['team']) for r in rows}) == 32 and len(rows) > 500, 'Current roster coverage is incomplete')
    by_id = defaultdict(list)
    matches = defaultdict(set)
    for row in rows:
        if row['gsis_id'] and row['status'] != 'CUT':
            by_id[row['gsis_id']].append(row)
            for name in (row['full_name'], f"{row.get('football_name') or row['first_name']} {row['last_name']}"):
                matches[(name_key(name), position_key(row['position']), team_key(row['team']))].add(row['gsis_id'])
    for row in csv.DictReader(io.StringIO(alias_text)):
        for current in by_id.get(row['gsis_id'], []):
            for name in (row['display_name'], f"{row['common_first_name']} {row['last_name']}"):
                matches[(name_key(name), position_key(current['position']), team_key(current['team']))].add(row['gsis_id'])
    return matches, roster_week


def parse_supplemental_projections(html, season, week, games, source, now):
    """Validate the publisher's week and every dated matchup before using any number."""
    require(re.search(rf'<title>DraftKings DFS Cheatsheet - Week {week}</title>', html) is not None,
            'Supplemental projection week or scoring does not match')
    game_labels = re.findall(r'([A-Z]{2,3})@([A-Z]{2,3}) (\d{1,2}/\d{1,2}/\d{4} \d{1,2}:\d{2}:\d{2} [AP]M)', html)
    actual = {(team_key(a), team_key(b), iso(datetime.strptime(date, '%m/%d/%Y %I:%M:%S %p').replace(tzinfo=ET)))
              for a,b,date in game_labels}
    expected = {(g['away'],g['home'],g['startsAt']) for g in games}
    require(actual == expected, 'Supplemental projection dates, season or matchups do not match NFL schedule')
    require(min(instant(g['startsAt']) for g in games) - timedelta(days=9) <= now,
            'Supplemental capture outside scheduled pregame week')
    require('DraftKings Salary</th><th>Proj Pts' in html, 'Supplemental projection columns changed')
    parser = TableRows(); parser.feed(html)
    by_team = {t:g for g in games for t in (g['away'],g['home'])}
    result = {}
    for row, _ in parser.rows:
        if len(row) != 8 or not row[0].isdigit():
            continue
        if row[3] == 'D':
            continue
        require(row[3] in ('QB','RB','WR','TE'), 'Unknown supplemental position')
        parts = row[1].split(', ')
        require(len(parts) == 2, 'Supplemental name format changed')
        name = parts[1] + ' ' + parts[0]
        team, opponent = team_key(row[2]),team_key(row[4].lstrip('@'))
        require(team in by_team and opponent in (by_team[team]['away'],by_team[team]['home']) and opponent != team,
                'Supplemental player matchup mismatch')
        value = float(row[6]); salary = int(row[5].replace('$','').replace(',',''))
        require(math.isfinite(value) and 0 <= value <= 70 and 2000 <= salary <= 15000, 'Invalid supplemental projection or salary')
        key = (name_key(name),row[3],team)
        require(key not in result, 'Ambiguous supplemental identity')
        result[key] = {'projection':value,'projectionSource':'Fantasy Sports Central','projectionUrl':FSC,
            'projectionSourceDate':None,'projectionCapturedAt':source['retrievedAt'],
            'projectionSourceDateBasis':'Publication time unavailable; capture time retained separately',
            'projectionSeason':season,'projectionWeek':week,'projectionGameId':by_team[team]['gameId'],
            'projectionSourceSalary':salary}
    require(all((t,p) in {(k[2],k[1]) for k in result} for t in by_team for p in ('QB','RB','WR','TE')),
            'Supplemental source misses team/position coverage')
    return result


def build_records(text, slate, projections, identities, supplemental=None, verified_classic_projections=None):
    reader = csv.DictReader(io.StringIO(text))
    require({'Position', 'Name', 'ID', 'Salary', 'Game Info', 'TeamAbbrev', 'Roster Position'} <= set(reader.fieldnames or []), 'Salary CSV columns changed')
    rows = list(reader)
    showdown = is_showdown(slate)
    # Existing 40 players/game floor retained, plus team/position/game checks below.
    require(len(rows) >= slate['gameCount'] * 40, 'Official salary coverage below 40 players per game')
    by_team = {t: g for g in slate['games'] for t in (g['away'], g['home'])}
    counts = Counter((name_key(r['Name']), position_key(r['Position']), team_key(r['TeamAbbrev']), r['Roster Position'] if showdown else None) for r in rows)
    records = []
    for row in rows:
        team, position = team_key(row['TeamAbbrev']), position_key(row['Position'])
        role = row['Roster Position'] if showdown else None
        require(team in by_team and position in (POSITIONS | {'K'} if showdown else POSITIONS), 'Salary team/position outside slate')
        require(row['Roster Position'] in (('FLEX', 'CPT') if showdown else ('QB', 'RB/FLEX', 'WR/FLEX', 'TE/FLEX', 'DST')), 'Invalid roster role for slate format')
        game = by_team[team]
        local = instant(game['startsAt']).astimezone(ET)
        match = re.fullmatch(r'([A-Z]{2,3})@([A-Z]{2,3}) (\d{2}/\d{2}/\d{4}) (\d{2}:\d{2}[AP]M) ET', row['Game Info'])
        require(match is not None, 'Unknown salary game date format')
        require((team_key(match[1]), team_key(match[2]), match[3], match[4]) ==
                (game['away'], game['home'], local.strftime('%m/%d/%Y'), local.strftime('%I:%M%p')),
                f"Salary game/week/date mismatch: {row['Name']}")
        salary = int(row['Salary'])
        require((200 if showdown else 2000) <= salary <= (30000 if showdown else 15000), 'Salary outside supported format range')
        require(row['ID'].isdigit(), 'Invalid DraftKings player ID')
        identity = (name_key(row['Name']), position, team)
        candidates = identities.get(identity, set())
        player_id = next(iter(candidates)) if len(candidates) == 1 and counts[(*identity, role)] == 1 else None
        projection = projections.get(identity)
        if not projection and showdown:
            projection = (verified_classic_projections or {}).get(identity)
        if not projection and not showdown:
            candidate = (supplemental or {}).get(identity)
            if candidate and candidate['projectionSourceSalary'] == salary:
                projection = candidate
        if projection and showdown:
            projection = {**projection, 'projectionBase':projection['projection'],
                'projectionMultiplier':1.5 if role == 'CPT' else 1,
                'projection':round(projection['projection'] * (1.5 if role == 'CPT' else 1), 4),
                'projectionBasis':'Sourced full-game DraftKings projection' + (' × 1.5 Captain scoring multiplier' if role == 'CPT' else '; unscaled FLEX scoring'),
                'projectionRulesUrl':SHOWDOWN_RULES}
        records.append({'playerId': player_id, 'name': row['Name'], 'position': position, 'team': team,
                        'draftKingsId': row['ID'], **({'rosterPosition':role} if showdown else {}), 'salary': salary, 'game': row['Game Info'], 'gameId': game['gameId'],
                        'status': row.get('Status') or None,
                        'matchMethod': 'unique current nflverse roster name, position and team' if player_id else 'unmatched',
                        **(projection if projection else {'projection': None, 'projectionSource': None, 'projectionUrl': None,
                           'projectionSourceDate': None, 'projectionSeason': None, 'projectionWeek': None, 'projectionGameId': None,
                           'projectionSourceSalary': None}),
                        'projectionUnavailableReason': None if projection else 'No matching source projection for this player/team/week'})
    require(len({r['draftKingsId'] for r in records}) == len(records), 'Duplicate DraftKings player ID')
    matched = [(r['playerId'],r.get('rosterPosition')) for r in records if r['playerId']]
    require(len(set(matched)) == len(matched), 'Ambiguous stable player identity')
    covered = {(r['team'], r['position']) for r in records}
    require(all((t, p) in covered for t in by_team for p in (POSITIONS | {'K'} if showdown else POSITIONS)), 'Salary feed misses team/position coverage')
    # Every source projection for a slate team must join the official salary list.
    eligible = {k for k in projections if k[2] in by_team}
    joined = {(name_key(r['name']), r['position'], r['team']) for r in records if r['projection'] is not None and
              (name_key(r['name']), r['position'], r['team']) in projections}
    require(eligible == joined, f'Projection-to-salary identity coverage mismatch: {sorted(eligible - joined)}')
    if showdown:
        validate_showdown_roles(records, by_team)
    return sorted(records, key=lambda r: (int(r['draftKingsId']), r['name']))


def validate_showdown_roles(records, teams):
    roles = {role:{(name_key(r['name']),r['position'],r['team']):r for r in records if r.get('rosterPosition') == role} for role in ('FLEX','CPT')}
    require(set(roles['FLEX']) == set(roles['CPT']) and len(roles['FLEX']) >= 40, 'Showdown requires matching complete FLEX/CPT populations of at least 40 players')
    require(len(records) == 2 * len(roles['FLEX']), 'Showdown has duplicate identity or invalid roster role')
    for identity, flex in roles['FLEX'].items():
        captain = roles['CPT'][identity]
        require(captain['salary'] == flex['salary'] * 1.5, 'Official Captain salary must equal 1.5× matching FLEX salary')
        require(captain['playerId'] == flex['playerId'], 'Showdown roles must resolve to the same stable identity')
        for role, row in [('FLEX', flex),('CPT', captain)]:
            if row['projection'] is not None:
                multiplier = 1.5 if role == 'CPT' else 1
                require(row.get('projectionMultiplier') == multiplier and row.get('projectionBase') is not None and
                    row['projection'] == round(row['projectionBase'] * multiplier, 4) and row.get('projectionRulesUrl') == SHOWDOWN_RULES,
                    'Showdown projection must preserve source base and correct role multiplier')
        require((flex['projection'] is None) == (captain['projection'] is None), 'Showdown projection availability differs by role')
        if flex['projection'] is not None:
            require(captain['projectionBase'] == flex['projectionBase'], 'Showdown roles must preserve the same source projection')
    for role in roles:
        require(all(any(r['team']==team and r['position']==position for r in roles[role].values()) for team in teams for position in POSITIONS | {'K'}),
                'Showdown role misses team/position salary coverage')


def coverage(records, projections, database_ids):
    return {'salaryPlayers': len(records),
            **({'salaryEntries':len(records),'distinctSalaryPlayers':len(records)//2,'rosterPositions':['FLEX','CPT']} if records and records[0].get('rosterPosition') else {}),
            'projectedPlayers': sum(r['projection'] is not None for r in records),
            'databasePlayersWithSalary': sum(r['playerId'] in database_ids for r in records),
            'databasePlayersWithProjection': sum(r['playerId'] in database_ids and r['projection'] is not None for r in records),
            'rosterPlayersWithSalary': sum(bool(r['playerId']) for r in records),
            'unmatchedSalaryPlayers': sum(not r['playerId'] for r in records),
            'sourceProjectionRows': len(projections),
            'projectionCoverageDefinition': ('Both FLEX/CPT salary populations must match, at least 40 players per game, all team/positions including K/DEF. FIC full-game points join by name/position/team/game; FSC values first match an official same-week Classic salary. CPT projection = retained source base × 1.5; missing projections remain null.' if records and records[0].get('rosterPosition') else 'All primary FIC rows for slate teams must join; every scheduled team has QB/RB/WR/TE coverage. Supplemental FSC values require exact name, position, team, game and official salary matches. Other players remain null.')}


def content_fingerprint(snapshot):
    # Repeated reads of the same values do not churn captures or trigger deployments.
    slates = {}
    for key, slate in snapshot['slates'].items():
        slates[key] = {k: slate[k] for k in ('id', 'season', 'week', 'label', 'games', 'records', 'coverage')}
        slates[key]['records'] = [{k: v for k, v in r.items() if k not in ('projectionSourceDate','projectionCapturedAt')} for r in slate['records']]
    return digest(json.dumps({'defaultSlate': snapshot['defaultSlate'], 'slates': slates}, sort_keys=True).encode())


def validate_snapshot(snapshot):
    require(snapshot.get('schemaVersion') == 2 and snapshot.get('validation', {}).get('status') == 'verified', 'Unverified weekly snapshot')
    require(snapshot.get('defaultSlate') in snapshot.get('slates', {}), 'Missing default slate')
    require(snapshot['slates'][snapshot['defaultSlate']]['scoring'] == 'DraftKings Classic', 'Weekly default must remain Classic')
    for key, slate in snapshot['slates'].items():
        require(key == f"{slate['season']}-w{slate['week']}-dk-{slate['id']}", 'Dated slate key mismatch')
        showdown = is_showdown(slate)
        require(showdown or (slate['scoring'] == 'DraftKings Classic' and slate['contestTypeId'] == 21), 'Unsupported snapshot format')
        if showdown:
            require(slate['gameCount'] == 1 and slate.get('rosterPositions') == ['FLEX','CPT'], 'Invalid Showdown game or role metadata')
        games, records = slate['games'], slate['records']
        require(len(games) == slate['gameCount'], 'Snapshot game count mismatch')
        require(all(g['season'] == slate['season'] and g['week'] == slate['week'] for g in games), 'Mixed-week snapshot games')
        require(all(r['gameId'] in {g['gameId'] for g in games} for r in records), 'Snapshot salary game mismatch')
        require(len(records) >= len(games) * 40, 'Snapshot salary coverage is incomplete')
        require(len({r['draftKingsId'] for r in records}) == len(records), 'Snapshot duplicate DraftKings ID')
        ids = [(r['playerId'], r.get('rosterPosition') if showdown else None) for r in records if r['playerId']]
        require(len(ids) == len(set(ids)), 'Snapshot duplicate stable identity')
        require(all(isinstance(r['salary'], int) and (200 if showdown else 2000) <= r['salary'] <= (30000 if showdown else 15000) for r in records), 'Invalid snapshot salary')
        teams = {t for g in games for t in (g['away'], g['home'])}
        require({r['team'] for r in records} == teams, 'Snapshot team coverage mismatch')
        if showdown: validate_showdown_roles(records,teams)
        else: require(all(not r.get('rosterPosition') for r in records), 'Classic capture cannot contain Showdown roles')
        projected = [r for r in records if r['projection'] is not None]
        require(all(isinstance(r['projection'], (float, int)) and math.isfinite(r['projection']) and 0 <= r['projection'] <= (105 if showdown else 70) and
                    r['projectionSeason'] == slate['season'] and r['projectionWeek'] == slate['week'] and
                    r['projectionGameId'] == r['gameId'] and r['projectionSource'] and (r['projectionSourceDate'] or r.get('projectionCapturedAt')) and
                    r['projectionUrl'].startswith('https://') for r in projected), 'Invalid/mismatched snapshot projection')
        require(all(any(r['team'] == t and r['position'] == p for r in projected) for t in teams for p in ('QB', 'RB', 'WR', 'TE')),
                'Snapshot projection team/position coverage is incomplete')
        require(slate['coverage']['salaryPlayers'] == len(records) and slate['coverage']['projectedPlayers'] == len(projected), 'Snapshot coverage counters mismatch')
        require(slate['sources'] and all(s.get('sha256') and s.get('url') and s.get('retrievedAt') for s in slate['sources'].values()), 'Missing snapshot provenance')
    require(snapshot.get('contentFingerprint') == content_fingerprint(snapshot), 'Snapshot content fingerprint mismatch')


def atomic_write(target, snapshot):
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=target.parent, prefix=f'.{target.name}.', suffix='.tmp', delete=False) as handle:
        temp = Path(handle.name)
        try:
            json.dump(snapshot, handle, indent=2)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
            handle.close()
            os.replace(temp, target)
        finally:
            temp.unlink(missing_ok=True)


def publish_snapshot_and_archive(target, snapshot, archive_target, write_snapshot):
    """Stage both outputs before publishing; roll back JSON if archive publication fails.

    Imports run in an isolated release checkout, never inside the deployed reader.
    The archive lock also serializes standalone backfills against this publication.
    """
    target, archive_target = Path(target), Path(archive_target)
    target.parent.mkdir(parents=True, exist_ok=True)
    archive_target.parent.mkdir(parents=True, exist_ok=True)
    with archive_lock(archive_target), tempfile.TemporaryDirectory(prefix='.dfs-publish-', dir=archive_target.parent) as stage_dir:
        staged_archive = Path(stage_dir) / archive_target.name
        if archive_target.exists(): shutil.copyfile(archive_target, staged_archive)
        result = archive_snapshots(staged_archive, [json.loads((ROOT / 'data/dfs-week1-2026.json').read_text()), snapshot])
        with tempfile.TemporaryDirectory(prefix='.dfs-json-', dir=target.parent) as json_dir:
            staged_json = Path(json_dir) / target.name
            backup_json = Path(json_dir) / 'previous.json'
            had_json = target.exists()
            if had_json: shutil.copyfile(target, backup_json)
            if write_snapshot: atomic_write(staged_json, snapshot)
            json_published = False
            try:
                if write_snapshot:
                    os.replace(staged_json, target)
                    json_published = True
                if result['changed'] or not archive_target.exists():
                    os.replace(staged_archive, archive_target)
            except BaseException:
                if json_published:
                    if had_json: os.replace(backup_json, target)
                    else: target.unlink(missing_ok=True)
                raise
        result['path'] = str(archive_target)
        return result


def refresh(target, raw_dir, now, dry_run=False, archive_path=None):
    lock_path = Path(tempfile.gettempdir()) / f'bowser-dfs-{digest(str(target.resolve()).encode())[:20]}.lock'
    with lock_path.open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise PartialData('A refresh for this snapshot is already running') from exc
        return _refresh(target, raw_dir, now, dry_run, archive_path)


def _refresh(target, raw_dir, now, dry_run=False, archive_path=None):
    previous = json.loads(target.read_text()) if target.exists() else None
    if previous:
        validate_snapshot(previous)
    fetch = Fetcher(raw_dir, now)
    schedule = parse_schedule(fetch.get(SCHEDULE, 'schedule.csv'))
    (season, week), games = target_week(schedule, now)
    slates = discover_slates(json.loads(fetch.get(LOBBY, 'lobby.json')), games, now)
    html = fetch.get(FIC, 'projections.html')
    projections = parse_projections(html, season, week, games, fetch.sources['projections.html'], now)
    supplemental = {}
    try:
        secondary_html = fetch.get(FSC,'supplemental-projections.html')
        supplemental = parse_supplemental_projections(secondary_html,season,week,games,fetch.sources['supplemental-projections.html'],now)
        supplemental_status = {'status':'verified','source':'Fantasy Sports Central','rows':len(supplemental)}
    except Exception as error:
        # The complete primary source gates still apply. Explicitly report an unavailable optional provider.
        supplemental_status = {'status':'unavailable','source':'Fantasy Sports Central','reason':str(error)}
    roster_url = f'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{season}.csv'
    roster = fetch.get(roster_url, 'roster.csv')
    alias_path = ROOT / 'data/raw/players.csv'
    alias_text = alias_path.read_text()
    matches, roster_week = roster_identities(roster, season, week, alias_text)
    fetch.sources['identity-aliases'] = {'url': 'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv',
                                        'localPath': 'data/raw/players.csv', 'retrievedAt': None,
                                        'note': 'Bundled name aliases only; must resolve to a current fetched roster ID/team/position.',
                                        'sha256': digest(alias_text.encode()), 'capturedAt': iso(now)}
    # Alias capture is local evidence; explicit unknown original retrieval date.
    shared_sources = {k: v for k, v in fetch.sources.items() if k != 'identity-aliases'}
    database_path = ROOT / f'data/fantasy_football_{season}.sqlite'
    database_ids = set()
    if database_path.exists():
        with sqlite3.connect(f'file:{database_path}?mode=ro', uri=True) as database:
            database_ids = {r[0] for r in database.execute('SELECT player_id FROM players')}
    combined = dict(previous['slates']) if previous else {}
    updated_keys = []
    verified_classic_projections = {}
    for slate in slates:
        filename = f"dk-{slate['id']}.csv"
        url = f"https://www.draftkings.com/lineup/getavailableplayerscsv?draftGroupId={slate['id']}"
        records = build_records(fetch.get(url, filename), slate, projections, matches, supplemental, verified_classic_projections)
        if not is_showdown(slate):
            for record in records:
                if record['projection'] is not None:
                    identity = (name_key(record['name']),record['position'],record['team'])
                    verified_classic_projections.setdefault(identity,{
                        **{k:v for k,v in record.items() if k.startswith('projection') and k != 'projectionUnavailableReason'},
                        'projectionSalaryValidationSlateId':slate['id'],
                        'projectionSalaryValidationUrl':url,
                        'projectionSalaryValidationSha256':fetch.sources[filename]['sha256']})
        old = combined.get(slate['key'])
        if old:
            require({r['draftKingsId'] for r in old['records']} <= {r['draftKingsId'] for r in records},
                    f"Salary population shrank for existing group {slate['id']}; preserve last good pending review")
        key = slate.pop('key')
        combined[key] = {**slate, 'salarySource': 'DraftKings', 'salaryUrl': url, 'capturedAt': iso(now),
                         'projectionProvider': 'Fantasy Info Central; Fantasy Sports Central fills missing values' if supplemental else 'Fantasy Info Central',
                         'supplementalProjectionStatus': supplemental_status,
                         'projectionSourceDate': projections[next(iter(projections))]['projectionSourceDate'],
                         'rosterSeason': season, 'rosterWeek': roster_week, 'records': records,
                         'coverage': coverage(records, projections, database_ids), 'sources': {**shared_sources, filename: fetch.sources[filename]},
                         'identityAliasSource': fetch.sources['identity-aliases'], 'validation': {'status': 'verified'}}
        updated_keys.append(key)
    current = [(key, s) for key, s in combined.items() if s['season'] == season and s['week'] == week and not is_showdown(s)]
    require(bool(current), 'No verified Classic default for scheduled week; Showdown cannot replace weekly Classic context')
    default = min(current, key=lambda item: (-item[1]['gameCount'], item[1]['id']))[0]
    snapshot = {'schemaVersion': 2, 'capturedAt': iso(now), 'defaultSlate': default, 'season': season, 'week': week,
                'slates': combined, 'validation': {'status': 'verified', 'verifiedAt': iso(now)},
                'notes': 'Official DraftKings Classic and full-game Showdown salaries, with FLEX/CPT roles kept separate. FIC pregame DraftKings points for matching week/game; verified FSC supplements. Showdown projects the same full game and explicitly applies 1.5× only to CPT. Missing projections are null; AvgPointsPerGame is never a projection. Historical Week 1 file is untouched.'}
    snapshot['contentFingerprint'] = content_fingerprint(snapshot)
    validate_snapshot(snapshot)
    changed = previous is None or previous['contentFingerprint'] != snapshot['contentFingerprint']
    archive = None
    if not dry_run:
        archive = publish_snapshot_and_archive(target, snapshot if changed else previous,
            archive_path or target.with_name('dfs_archive.sqlite'), changed)
    publish_changed = changed or bool(archive and archive['changed'])
    return {'status': 'updated' if publish_changed else 'unchanged', 'changed': publish_changed, 'publishable': True,
            'written': changed and not dry_run, 'dryRun': dry_run, 'season': season, 'week': week, 'defaultSlate': default,
            'updatedSlates': updated_keys, 'snapshot': str(target), 'rawEvidence': str(raw_dir),
            'archive': archive,
            'coverage': {key: combined[key]['coverage'] for key in updated_keys}}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/dfs-weekly.json')
    parser.add_argument('--raw-dir', type=Path)
    parser.add_argument('--archive', type=Path, help='Versioned SQLite archive; defaults beside the output snapshot')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--verify', action='store_true', help='Validate saved snapshot offline; do not refresh or publish')
    args = parser.parse_args(argv)
    now = datetime.now(timezone.utc)
    raw_dir = args.raw_dir or ROOT / 'artifacts/dfs-weekly' / now.strftime('%Y%m%dT%H%M%S.%fZ')
    try:
        if args.verify:
            validate_snapshot(json.loads(args.output.read_text()))
            result = {'status': 'verified', 'changed': False, 'publishable': True, 'snapshot': str(args.output),
                      'archive': verify_archive(args.archive or args.output.with_name('dfs_archive.sqlite'))}
        else:
            result = refresh(args.output, raw_dir, now, args.dry_run, args.archive)
        code = 0
    except NoData as exc:
        result, code = {'status': 'no-data', 'reason': str(exc)}, 4
    except (PartialData, ValueError, KeyError) as exc:
        result, code = {'status': 'partial', 'reason': str(exc)}, 3
    except Exception as exc:
        result, code = {'status': 'failed', 'reason': f'{type(exc).__name__}: {exc}'}, 1
    if code:
        result.update({'changed': False, 'publishable': False, 'lastGoodPreserved': True, 'snapshot': str(args.output)})
    print(json.dumps(result, indent=2))
    return code


if __name__ == '__main__':
    sys.exit(main())
