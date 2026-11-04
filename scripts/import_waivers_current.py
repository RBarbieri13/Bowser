#!/usr/bin/env python3
"""Build a public weekly waiver snapshot from reviewed, dated publisher captures."""
import argparse
import csv
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import import_waivers as waiver

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
SOURCES = {
    'fantasypros': ('FantasyPros', 'fantasypros_rank', 'fantasypros_bid', 'Public PPR preview; bids use the publisher’s $100 reference.'),
    'rotoballer': ('RotoBaller', 'rotoballer_rank', 'rotoballer_bid', 'Overall priority normalized by position; bid tiers retain source units.'),
    'footballguys': ('Footballguys', None, 'footballguys', 'Percent of annual FAAB.'),
    'nfl': ('NFL', 'nfl', None, 'Published overall waiver priorities, normalized by position.'),
    'blitz': ('Blitz Sports Media', 'blitz', None, 'Published overall waiver priorities, normalized by position.'),
    'cbs': ('CBS Sports', 'cbs', 'cbs', 'Explicit positional add order; remaining FAAB and format-specific tiers. Ambiguous operator-plus-range phrases are omitted.'),
    'dknetwork': ('DK Network', 'dknetwork', 'dknetwork', '12-team PPR, 1QB, four-point passing TDs; percent of remaining FAAB.'),
}

PUBLISHER_HOSTS = {
    'fantasypros': {'www.fantasypros.com'},
    'rotoballer': {'www.rotoballer.com'},
    'footballguys': {'www.footballguys.com'},
    'nfl': {'www.nfl.com', 'amp.nfl.com'},
    'blitz': {'blitzsportsmedia.com'},
    'cbs': {'www.cbssports.com', 'hubapi.cbssports.com'},
    'dknetwork': {'dknetwork.draftkings.com'},
}
CAPTURE_HOSTS = {key: PUBLISHER_HOSTS[sid] for sid, (_, rank, faab, _) in SOURCES.items()
                 for key in (rank, faab) if key}


def verify_url(key, url):
    parsed = urlsplit(url)
    if (parsed.scheme != 'https' or parsed.hostname not in CAPTURE_HOSTS[key]
            or parsed.username or parsed.password or parsed.port not in (None, 443)):
        raise ValueError(f'URL does not belong to the public publisher: {key}')


def capture_sources(directory, urls):
    if set(urls) != set(CAPTURE_HOSTS):
        raise ValueError('URL manifest must include every required capture key')
    for key, url in urls.items():
        verify_url(key, url)
    directory.mkdir(parents=True, exist_ok=False)
    evidence = {}
    for key, url in urls.items():
        class PublisherRedirect(HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                verify_url(key, newurl)
                return super().redirect_request(req, fp, code, msg, headers, newurl)

        request = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with build_opener(PublisherRedirect()).open(request, timeout=25) as response:
            final_url = response.geturl()
            verify_url(key, final_url)
            raw = response.read(4_000_001)
        if not raw or len(raw) > 4_000_000:
            raise ValueError(f'Unexpected capture size: {key}')
        (directory / (key + '.html')).write_bytes(raw)
        evidence[key] = {
            'url': final_url, 'sha256': hashlib.sha256(raw).hexdigest(),
            'capturedAt': datetime.now(timezone.utc).isoformat(),
        }
    (directory / 'evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')


def read_captures(directory, week):
    with (DATA / 'raw/2026/schedules.csv').open() as schedule:
        kickoff = min(date.fromisoformat(row['gameday']) for row in csv.DictReader(schedule)
                      if row['season'] == '2026' and row['week'] == str(week) and row['game_type'] == 'REG')
    evidence = json.loads((directory / 'evidence.json').read_text())
    pages = {}
    used = {}
    for key in CAPTURE_HOSTS:
        capture = evidence[key]
        raw = (directory / (key + '.html')).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        verify_url(key, capture['url'])
        if digest != capture['sha256']:
            raise ValueError(f'Unverified public capture: {key}')
        html = raw.decode()
        page = waiver.Page(html)
        dates = waiver.publication_dates(html)
        if key == 'fantasypros_rank':
            line = next(line for line in page.lines if line.startswith('Overall Waiver Wire Rankings - '))
            dateline = datetime.strptime(line.rsplit(' - ', 1)[1], '%b %d, %Y').date()
            dates['datePublished'] = dateline.isoformat()
        else:
            titles = ' '.join(node.text() for node in page.root.all('h1'))
            if not re.search(rf'Week\s*{week}\b', titles, re.I):
                raise ValueError(f'Wrong waiver week: {key}')
        published = date.fromisoformat(dates['datePublished'][:10])
        captured_at = datetime.fromisoformat(capture['capturedAt'].replace('Z', '+00:00'))
        if captured_at.tzinfo is None or not kickoff - timedelta(days=5) <= published <= kickoff or published > captured_at.date():
            raise ValueError(f'Wrong publication window: {key}')
        used[key] = {'url': capture['url'], 'sha256': digest, **dates, 'capturedAt': capture['capturedAt']}
        pages[key] = page
    return pages, used


def blitz_ranks(page):
    table = next(t for t in page.tables() if t[0][:3] == ['RK', 'Player', 'Pos'])
    rows = []
    for rank, player, pos, *_ in table[1:]:
        match = re.fullmatch(r'(.+) ([A-Z]+) • (QB|RB|WR|TE|K|DST|DEF)', player)
        if not match or pos != match[3] or not waiver.team_key(match[2]):
            raise ValueError('Invalid Blitz player identity')
        rows.append({'name': match[1], 'team': waiver.team_key(match[2]), 'position': 'DST' if pos == 'DEF' else pos, 'overallRank': int(rank)})
    return waiver.overall_to_position(rows)


def dk_facts(page, week):
    start = page.lines.index(f'Week {week} FAAB Rankings')
    rows = []
    bids = []
    for heading, bid_line in zip(page.lines[start + 1:], page.lines[start + 2:]):
        priced = re.match(r'Bid: (\d+(?:\.\d+)?)% of remaining FAAB\b', bid_line)
        if not priced:
            continue
        match = re.fullmatch(r'(\d+)\. (.+), (QB|RB|WR|TE|K), (.+)', heading)
        defense = re.fullmatch(r'(\d+)\. (.+) D/ST', heading)
        if match:
            rank, name, pos, team = match.groups()
        elif defense:
            rank, team = defense.groups()
            name, pos = team + ' D/ST', 'DST'
        else:
            raise ValueError('Unrecognized DK Network ranked bid')
        team = waiver.team_key(team)
        if not team or int(rank) != len(rows) + 1:
            raise ValueError('DK Network priority sequence changed')
        player = {'name': name, 'position': pos, 'team': team}
        rows.append(dict(player, overallRank=int(rank)))
        bids.append(dict(player, bid=waiver.bid(priced[1], basis='remaining', tier='12-team PPR 1QB')))
    if len(rows) < 10:
        raise ValueError('DK Network waiver list truncated')
    return waiver.overall_to_position(rows), bids


def cbs_facts(page):
    ranks, _ = waiver.parse_cbs(page)
    lines = page.lines[page.lines.index('WAIVER WIRE'):]
    end = lines.index('DST streamers') if 'DST streamers' in lines else len(lines)
    lines = lines[:end]
    cards = [i for i in range(len(lines) - 2)
             if lines[i + 1] in {'QB', 'RB', 'WR', 'TE'} and re.fullmatch('[A-Z]{2,3}', lines[i + 2])]
    if len(cards) != len(ranks):
        raise ValueError('CBS priorities and bid headings disagree')
    bids = []
    for i, j, player in zip(cards, cards[1:] + [len(lines)], ranks):
        for sentence in re.split(r'(?<=[.!?])\s+', ' '.join(lines[i:j])):
            match = re.search(r'for (at least |up to )?(\d+(?:-\d+)?) percent of your remaining FAAB', sentence)
            if not match:
                continue
            operator = {'at least ': 'at-least', 'up to ': 'at-most'}.get(match[1])
            if operator and '-' in match[2]:
                break
            tier = 'Superflex / two-QB' if re.search(r'superflex|two-quarterback|two-QB', sentence, re.I) else 'source base'
            bids.append(dict(player, bid=waiver.bid(match[2], basis='remaining', operator=operator, tier=tier)))
            break
    return ranks, bids


def assemble(directory, week):
    pages, evidence = read_captures(directory, week)
    ranks = {
        'fantasypros': waiver.parse_fantasypros_rank(pages['fantasypros_rank']),
        'rotoballer': waiver.parse_rotoballer_rank(pages['rotoballer_rank']),
        'nfl': waiver.parse_nfl_rank(pages['nfl']),
        'blitz': blitz_ranks(pages['blitz']),
    }
    bids = {
        'fantasypros': waiver.parse_fantasypros_faab(pages['fantasypros_bid']),
        'rotoballer': waiver.parse_rotoballer_faab(pages['rotoballer_bid']),
        'footballguys': waiver.parse_footballguys(pages['footballguys']),
    }
    ranks['cbs'], bids['cbs'] = cbs_facts(pages['cbs'])
    ranks['dknetwork'], bids['dknetwork'] = dk_facts(pages['dknetwork'], week)
    index = waiver.identity_index(DATA / 'raw/2026/players.csv')
    players, sources = {}, []
    for sid, (label, rank_key, bid_key, note) in SOURCES.items():
        keys = list(dict.fromkeys(key for key in (rank_key, bid_key) if key))
        source = {
            'id': sid, 'label': label, 'type': 'expert',
            'rankCount': len(ranks.get(sid, [])), 'faabCount': len(bids.get(sid, [])),
            'publishedAt': evidence[keys[0]]['datePublished'], 'coverageNote': note,
            'capturedAt': max(evidence[key]['capturedAt'] for key in keys),
            'evidence': [evidence[key] for key in keys],
        }
        if rank_key:
            source.update(rankUrl=evidence[rank_key]['url'], rankMethod=waiver.METHOD_POSITION if sid == 'cbs' else waiver.METHOD_OVERALL)
        if bid_key:
            source['faabUrl'] = evidence[bid_key]['url']
        if sid in {'fantasypros', 'dknetwork'}:
            source['rankScoring'] = 'PPR'
        sources.append(source)
        for kind, observations in [('rankings', ranks.get(sid, [])), ('faab', bids.get(sid, []))]:
            for row in observations:
                name, pos, team = row['name'], row['position'], row['team']
                if waiver.name_key(name) == 'kennethgainwell' and team == 'TB' and pos == 'RB':
                    name = 'Kenny Gainwell'
                matches = index.get((waiver.name_key(name), pos), [])
                if len(matches) > 1 and team:
                    matches = [item for item in matches if waiver.team_key(item.get('latest_team')) == team]
                matched = matches[0] if len(matches) == 1 else None
                pid = matched.get('gsis_id') if matched else None
                if pos == 'DST':
                    team = team or waiver.team_key(name.replace(' D/ST', '').replace(' DST', '').replace(' Defense', ''))
                key = ('team:dst:' + team if pos == 'DST' and team else pid) or f'name:{pos.lower()}:{waiver.name_key(name)}'
                player = players.setdefault(key, {
                    'id': key, 'playerId': pid, 'name': matched['display_name'] if matched else name,
                    'position': pos, 'team': team or (waiver.team_key(matched.get('latest_team')) if matched else None),
                    'rankings': {}, 'faab': {}, 'identityMethod': 'unique nflverse name and position' if matched else 'publisher name and position',
                    'teamProvenance': 'publisher' if team else 'nflverse player dictionary' if matched else 'unknown',
                })
                if team:
                    if player['teamProvenance'] == 'publisher' and player['team'] != team:
                        raise ValueError(f'Conflicting publisher teams for {name}')
                    player.update(team=team, teamProvenance='publisher')
                if sid in player[kind]:
                    raise ValueError(f'Duplicate source/player {sid}: {name}')
                if kind == 'rankings':
                    player[kind][sid] = {'scope': 'position', **{k: row[k] for k in ('rank', 'method', 'overallRank') if k in row}}
                else:
                    player[kind][sid] = row['bid']
    return {
        'season': 2026, 'waiverWeek': week, 'capturedAt': max(s['capturedAt'] for s in sources),
        'sources': sources, 'players': sorted(players.values(), key=lambda item: (item['position'], item['name'])),
        'methodology': 'Verified source-native waiver priorities and FAAB. Missing cells are unavailable. Budget bases and format tiers remain separate.',
    }


def material(snapshot):
    return snapshot['players'], [{k: v for k, v in source.items() if k not in {'capturedAt', 'evidence'}} for source in snapshot['sources']]


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--week', type=int)
    cli.add_argument('--html-dir', type=Path)
    cli.add_argument('--urls', type=Path, help='Capture a reviewed JSON URL manifest into a new --html-dir')
    cli.add_argument('--verify-all', action='store_true')
    args = cli.parse_args()
    if args.verify_all:
        for path in sorted(DATA.glob('waivers-2026-week*.json')):
            week = int(path.stem.split('week')[-1])
            print(json.dumps(waiver.validate(json.loads(path.read_text()), week)))
        return
    if not args.week or not args.html_dir:
        cli.error('Provide --week and --html-dir, or --verify-all.')
    if any(int(path.stem.split('week')[-1]) > args.week for path in DATA.glob('waivers-2026-week*.json')):
        cli.error('Historical waiver weeks are immutable once a newer week is published.')
    if args.urls:
        capture_sources(args.html_dir, json.loads(args.urls.read_text()))
    path = DATA / f'waivers-2026-week{args.week}.json'
    snapshot = assemble(args.html_dir, args.week)
    result = waiver.validate(snapshot, args.week)
    changed = not path.exists() or material(json.loads(path.read_text())) != material(snapshot)
    if changed:
        waiver.atomic_write(path, snapshot, args.week)
    print(json.dumps({**result, 'changed': changed}, indent=2))


if __name__ == '__main__':
    main()
