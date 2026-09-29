#!/usr/bin/env python3
"""Read-only release checks for independent statistics and DraftKings windows."""
import argparse,json,urllib.request,datetime
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--output',required=True);args=p.parse_args()
checks=[]
def get(path):
    with urllib.request.urlopen(args.url.rstrip('/')+path,timeout=60) as r:return json.load(r)
def check(condition,reason):
    if not condition:raise AssertionError(reason)
    checks.append(reason)
meta=get('/api/v1/meta?season=2026')
mon='2026-w2-dk-153449'
check(any(x['key']==mon and x['week']==2 for x in meta['dfsOptions']),'Metadata includes the exact sourced Week 2 Monday Showdown option')
pool=get('/api/v1/meta?view=dfs-lineup&dfsSlate='+mon)
check(pool['meta']['week']==2,'Monday salaries remain Week 2')
check(set(x['team'] for x in pool['data'])=={'LAR','NYG'},'Monday salary pool contains only Giants and Rams')
check(set(x['gameId'] for x in pool['data'])=={'2026_02_NYG_LA'},'Every salary identity belongs to the Monday game')
flex=[x for x in pool['data'] if x['rosterPosition']=='FLEX']
check(len(flex)==53,'Monday full salary pool retains all 53 eligible FLEX identities')
stats=get('/api/v1/player-stats?season=2026&weeks=1,2,3&seasonType=ALL&trendRange=selected&limit=all&dfsSlate='+mon)
check([x['week'] for x in stats['meta']['trendSlots']]==[1,2,3],'Statistical trends retain Weeks 1-3 independently of Week 2 salaries')
check(all(len(x['player_trends'])==3 for x in stats['data']),'Every player uses three aligned slots')
adams=next(x for x in stats['data'] if x['player_display_name']=='Davante Adams')
check(adams['games_played']==3 and adams['fantasy_points']==65.8 and adams['range_position_rank']==6,'Davante Adams retains exact three-week GP, PPR and NFL rank')
future=get('/api/v1/player-stats?season=2026&weeks=5,6,7&trendRange=selected&limit=all')
check([x['week'] for x in future['meta']['trendSlots']]==[5,6,7],'Unavailable weeks do not shift the Base week anchor backward')
check(not future['data'] and future['meta']['statsCoverage']['missingWeeks']==[5,6,7],'Unavailable future statistics stay explicitly unavailable')
schedule=get('/api/v1/schedule?season=2026&week=4')
check(bool(schedule['data']) and all(x['week']==4 for x in schedule['data']),'Independent Week 4 matchup schedule is available')
check(not any(x['week']==4 and x['season']==2026 for x in meta['dfsOptions']),'No unverified Week 4 slate is invented or substituted')
result={'status':'PASS','url':args.url,'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':checks,'count':len(checks)}
Path(args.output).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':'PASS','checks':len(checks),'url':args.url}))
