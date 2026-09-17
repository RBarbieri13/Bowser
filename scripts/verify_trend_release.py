#!/usr/bin/env python3
"""Read-only release probe. Use --vercel for protected candidate deployments."""
import argparse
import json
import subprocess
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--vercel', action='store_true')
parser.add_argument('--output')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
checks = []

def get(path):
    if args.vercel:
        raw = subprocess.run(['vercel', 'curl', path, '--deployment', args.url, '--', '--silent', '--fail'],
                             cwd=root, check=True, capture_output=True, text=True, timeout=90).stdout
    else:
        request = urllib.request.Request(args.url.rstrip('/') + path, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read().decode()
    return json.loads(raw)

def check(condition, name):
    if not condition:
        raise AssertionError(name)
    checks.append(name)

try:
    players = get('/api/v1/player-stats?season=2026&weeks=1&limit=all&includeTrends=1&trendWeeks=10')
    slots = [(2025, week) for week in range(10, 19)] + [(2026, 1)]
    check(len(players['data']) == 410, 'Preserved 410 Week 1 recorded players')
    check(all([(g['season'], g['week']) for g in p['player_trends']] == slots for p in players['data']), 'All player calendars align across 2025 and 2026')
    by_id = {p['player_id']: p for p in players['data']}
    cam = next(p for p in players['data'] if p['player_display_name'] == 'Cam Skattebo')
    tracy = next(p for p in players['data'] if p['player_display_name'] == 'Tyrone Tracy Jr.')
    check(cam['snaps'] == 42 and tracy['snaps'] == 2, '42 versus 2 snap totals retained')
    check(cam['position_finish'] == 18 and tracy['position_finish'] == 103, 'NFL PPR weekly positional finishes retained')
    check(len(players['meta']['trendDomains']) == 19 and players['meta']['trendDomains']['fantasy_points']['min'] < 0, 'Shared metric domains preserve negative points')
    weekly = json.loads((root / 'data/dfs-weekly.json').read_text())
    expected = weekly['slates'][weekly['defaultSlate']]
    check(players['meta']['dfs']['id'] == expected['id'] and players['meta']['dfs']['week'] == expected['week'], 'Hosted DFS current slate matches verified local candidate')
    joined = 0
    for salary in expected['records']:
        player = by_id.get(salary.get('playerId'))
        if player:
            check(player['draft_kings_price'] == salary['salary'] and player['draft_kings_projection'] == salary['projection'], f'DFS identity join {salary["playerId"]}')
            joined += 1
    check(joined > 250, 'Broad current-slate salary coverage joins recorded players')
    history = get('/api/v1/player-stats?season=2025&weeks=18&limit=all&includeTrends=1')
    check(len(history['data']) > 200 and all(p['player_trends'][-1]['season'] == 2025 for p in history['data']), '2025 history still available')
    opportunity = get('/api/v1/opportunity-tracker?season=2026&team=NYG&weeks=1&games=10&scoring=ppr')
    roster = [p for group in opportunity['data']['groups'] for p in group['players']]
    check(all([(g['season'], g['week']) for g in p['history']] == slots for p in roster), 'Opportunity roster retains identical calendar slots including DNP')
    check(len(opportunity['meta']['schedule']) == 17 and len({g['week'] for g in opportunity['meta']['schedule']}) == 17, 'Opportunity matchup schedule available')
    waivers = get('/api/v1/waivers?season=2026&week=2&weeks=1&scoring=ppr')
    check(len(waivers['rows']) >= 100, 'Full waiver target snapshot retained')
    check(sum(s.get('rankCount', 0) > 0 for s in waivers['meta']['sources']) >= 5, 'Five ranking sources retained')
    check(sum(s.get('faabCount', 0) > 0 and s.get('type') != 'community' for s in waivers['meta']['sources']) >= 8, 'Eight expert FAAB sources retained')
    penix = next(p for p in waivers['rows'] if p.get('playerId') == '00-0039917')
    check(penix['stats']['fantasy_points'] is None and penix['stats']['trends'][0]['passAttempts'] == 28, 'Waiver history survives absence of selected-week totals')
    archive = get('/api/v1/dfs-archive?season=2026&week=2')
    check(len(archive['meta']['captures']) >= 12, 'Dated slate capture versions available')
    wentz = next(p for p in archive['data'] if p['name'] == 'Carson Wentz')
    check(wentz['projection'] == 14.95 and wentz['projectionSource'] == 'Fantasy Sports Central', 'Expanded source projection preserved with provenance')
    old_capture = next(s for s in archive['meta']['captures'] if s['slateId'] == 153427 and s['projectedPlayers'] == 192)
    old = get('/api/v1/dfs-archive?season=2026&week=2&captureId=' + old_capture['captureId'])
    check(next(p for p in old['data'] if p['name'] == 'Carson Wentz')['projection'] is None, 'Historical pre-enrichment values reproducible')
    identity = get('/api/v1/player-identity?season=2026&name=Cam%20Skattebo&team=NYG&position=RB')
    check(identity['match']['player_id'] == cam['player_id'], 'Global player identity route resolves to warehouse profile')
    profile = get('/api/v1/player-profile?season=2026&playerId=' + cam['player_id'] + '&trendWeeks=5')
    check(len(profile['data']['history']) == 5 and profile['data']['history'][-1]['snaps'] == 42, 'Profile shares aligned history with exact snap values')
    boxes = get('/api/v1/team-box-scores?season=2026&team=DET&weeks=1,2&trendAnchors=1,2&trendWeeks=5')
    gibbs = [p for p in boxes['data'] if p['player_display_name'] == 'Jahmyr Gibbs']
    check({p['week']:p['draft_kings_price'] for p in gibbs} == {1:8000,2:8500}, 'Team Box prices belong to their exact historical week')
    check(next(p for p in gibbs if p['week']==2)['fantasy_points'] is None, 'Upcoming DFS rows never manufacture actual points')
    for anchor in ['1','2']:
        check(len(boxes['meta']['trendsByAnchor'][anchor]['slots'])==5, 'Anchored Team Box calendar available for week ' + anchor)
    result = {'status': 'PASS', 'url': args.url, 'checks': checks, 'dfs': {'id': expected['id'], 'season': expected['season'], 'week': expected['week'], 'joinedPlayers': joined}}
except Exception as error:
    result = {'status': 'FAIL', 'url': args.url, 'checks': checks, 'error': str(error)}
if args.output:
    Path(args.output).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({**result, 'checks': len(checks)}, indent=2))
raise SystemExit(0 if result['status'] == 'PASS' else 1)
