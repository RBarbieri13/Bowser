#!/usr/bin/env python3
"""Independent live Week 3 / Week 4-waiver readback against source-backed warehouse."""
import argparse,datetime,json,sqlite3,urllib.request
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--output',required=True);args=p.parse_args()
root=Path(__file__).resolve().parents[1];checks=[]
def get(path):
 with urllib.request.urlopen(urllib.request.Request(args.url.rstrip('/')+path,headers={'Cache-Control':'no-cache'}),timeout=60) as r:return json.load(r)
def check(ok,name):
 if not ok:raise AssertionError(name)
 checks.append(name)
c=sqlite3.connect(f'file:{root}/data/fantasy_football_2026.sqlite?mode=ro',uri=True);c.row_factory=sqlite3.Row
meta=get('/api/v1/meta?season=2026')
check(meta['warehouse']['completed_games']==48,'All 48 games through Week 3 completed')
check(meta['warehouse']['games_with_play_by_play']==48,'All 48 games have play-by-play')
check(meta['warehouse']['player_stat_rows']==1097 and meta['warehouse']['snap_rows']==1273,'Exact refreshed stat and snap counts')
fields={'snaps':'offense_snaps','passing_attempts':'attempts','completions':'completions','passing_yards':'passing_yards','passing_tds':'passing_tds','carries':'carries','rushing_yards':'rushing_yards','rushing_tds':'rushing_tds','targets':'targets','receptions':'receptions','receiving_yards':'receiving_yards','receiving_tds':'receiving_tds'}
# Warehouse uses source column names; API uses canonical presentation names.
columns={r[1] for r in c.execute('pragma table_info(player_week_stats)')}
if 'attempts' not in columns:fields['passing_attempts']='passing_attempts'
for week in [1,2,3]:
 payload=get(f'/api/v1/player-stats?season=2026&weeks={week}&limit=all&trendRange=selected')
 rows={r['player_id']:r for r in payload['data']}
 source=list(c.execute('select * from player_week_stats where week=?',(week,)))
 check(len(rows)==len(source),f'Week {week} every warehouse player represented')
 check(len({r['team'] for r in source})==32,f'Week {week} all 32 teams')
 for s in source:
  actual=rows[s['player_id']]
  check(all(actual[a]==s[b] for a,b in fields.items()),f'Week {week} exact counting stats/snaps {s["player_id"]}')
  check(abs(actual['fantasy_points']-round(s['fantasy_points_ppr'],1))<0.001,f'Week {week} PPR {s["player_id"]}')
check(next(r for r in payload['data'] if r['player_display_name']=='Kalif Raymond')['fantasy_points']==21,'Monday finale Raymond 21 PPR')
box=get('/api/v1/team-box-scores?season=2026&team=CHI&weeks=3')
check(any(r['player_display_name']=='Kalif Raymond' and r['receiving_yards']==90 for r in box['data']),'Monday receiving yards visible in Team Box Scores')
opp=get('/api/v1/opportunity-tracker?season=2026&team=CHI&weeks=3&games=5&scoring=ppr')
ray=next(r for g in opp['data']['groups'] for r in g['players'] if r['name']=='Kalif Raymond')
check(ray['history'][-1]['week']==3 and ray['history'][-1]['snaps']==54,'Opportunity includes Monday finale 54 snaps')
waivers=get('/api/v1/waivers?season=2026&statsWindow=latest&scoring=ppr')
check(waivers['meta']['selectedStatsWeeks']==[3],'Latest waiver view defaults to completed Week 3 statistics')
check(waivers['meta']['waiverWeek']==4 and waivers['meta']['availableWeeks']==[2,4],'Latest Week 4 waivers selected with Week 2 archive retained')
snapshot=json.loads((root/'data/waivers-2026-week4.json').read_text());wr={r['id']:r for r in waivers['rows']}
check(len(wr)==106,'All 106 waiver targets available')
for row in snapshot['players']:
 r=wr[row['id']]
 check(r['rankings']==row['rankings'] and r['faab']==row['faab'],f'Exact sourced waiver ranks and bids {row["id"]}')
 if row['playerId'] in rows:
  check(r['stats']['fantasy_points']==rows[row['playerId']]['fantasy_points'],f'Week 3 waiver statistics match database {row["id"]}')
check(next(r for r in waivers['rows'] if r['name']=='Kalif Raymond')['stats']['targets']==7,'Waivers includes Monday target count')
check(sum(s['rankCount']>0 for s in waivers['meta']['sources'])==5,'Five actual waiver ranking sources')
check(sum(s['faabCount']>0 for s in waivers['meta']['sources'])==6,'Six actual FAAB sources')
old=get('/api/v1/waivers?season=2026&week=2&weeks=1')
check(old['meta']['waiverWeek']==2 and len(old['rows'])>=100,'Historical waiver snapshot retained')
result={'status':'PASS','url':args.url,'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'count':len(checks),'checks':checks}
Path(args.output).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
