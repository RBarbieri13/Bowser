#!/usr/bin/env python3
"""Pinned 2026 Week 4 public waiver capture. No old snapshot is overwritten.

HTML remains in an ignored local capture directory. Published output contains
numeric facts, source URLs, publication dates and content hashes only.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen
import import_waivers as w

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data/waivers-2026-week4.json'
URLS = {
 'fantasypros0':'https://www.fantasypros.com/nfl/rankings/?scoring=PPR&type=waiver',
 'fantasypros1':'https://www.fantasypros.com/2026/09/fantasy-football-waiver-wire-advice-players-to-add-stash-drop-week-4/',
 'rotoballer0':'https://www.rotoballer.com/waiver-wire-rankings-fantasy-football-week-4-2026/1952574',
 'rotoballer1':'https://www.rotoballer.com/faab-waiver-wire-advice-week-4-fantasy-pickups-2026/1953122',
 'footballguys0':'https://www.footballguys.com/article/2026-email-feature-top-waiver-wire-pickups-week04',
 'rotowire0':'https://www.rotowire.com/football/article/fantasy-football-waiver-wire-top-pickups-for-week-4-137384',
 'cbs0':'https://secure-www.cbssports.com/fantasy/football/news/week-4-2026-waiver-wire/',
 'draftsharks0':'https://www.draftsharks.com/article/week-4-waiver-wire-pickups',
 'nfl0':'https://www.nfl.com/news/2026-nfl-fantasy-football-waiver-wire-week-4-te-juwan-johnson-rb-braelon-allen-headline-targets',
 'blitz0':'https://blitzsportsmedia.com/fantasy-football-week-4-waiver-wire-rankings/',
}
LABELS = {**w.LABELS, 'blitz':'Blitz Sports Media'}

def scope(key, html, captured):
    page=w.Page(html)
    titles=' '.join(n.text() for n in page.root.all('title')+page.root.all('h1'))
    if not re.search(r'Week\s*4\b', titles, re.I):raise ValueError(key+': expected Week 4 title')
    dates=w.publication_dates(html)
    if key=='fantasypros0':
        if 'Overall Waiver Wire Rankings - Sep 30, 2026' not in page.lines:raise ValueError('FantasyPros rolling dateline changed; review new capture')
        dates={'datePublished':'2026-09-30'}
    if not dates:raise ValueError(key+': publication date unavailable')
    for value in dates.values():
        if value[:10] not in {'2026-09-27','2026-09-28','2026-09-29','2026-09-30'}:raise ValueError(key+': wrong publication window')
        if len(value)>10 and datetime.fromisoformat(value.replace('Z','+00:00'))>captured:raise ValueError(key+': future publication')
    return page,dates

def fp_rank(page):
    table=next(t for t in page.tables() if t[0][:2]==['Rank','Player (Team)'])
    rows=[]
    for cells in table[1:]:
        m=re.fullmatch(r'(.+?) \((QB|RB|WR|TE|K|DST) - ([A-Z]+)\)',cells[1])
        if not m:raise ValueError('FantasyPros identity changed')
        rows.append({'name':m[1], 'position':m[2], 'team':w.team_key(m[3]), 'overallRank':int(cells[0])})
    if len(rows)!=5:raise ValueError('FantasyPros public five-row preview changed')
    return w.overall_to_position(rows)

def nfl_rank(page, index):
    table=next(t for t in page.tables() if t[0][0]=='Waiver Wire Priority Rankings');rows=[]
    for cells in table[1:]:
        m=re.fullmatch(r'(\d+)\) (?:(QB|RB|WR|TE) )?(.+), ([\w ]+)',cells[0])
        if m:
            pos=m[2]
            if not pos:
                matches={p['position'] for (key,_),values in index.items() if key==w.name_key(m[3]) for p in values}
                if len(matches)!=1:raise ValueError('Ambiguous omitted NFL position')
                pos=matches.pop()
            rows.append({'name':m[3],'position':pos,'team':w.team_key(m[4]),'overallRank':int(m[1])})
        else:
            d=re.fullmatch(r'(\d+)\) (.+) D/ST',cells[0])
            if not d:raise ValueError('NFL priority identity changed')
            rows.append({'name':d[2]+' D/ST','position':'DST','team':w.team_key(d[2]),'overallRank':int(d[1])})
    if len(rows)!=15:raise ValueError('NFL priority count changed')
    return w.overall_to_position(rows)

def blitz_rank(page):
    table=next(t for t in page.tables() if t[0][:3]==['RK','Player','Pos']);rows=[]
    for c in table[1:]:
        m=re.fullmatch(r'(.+) ([A-Z]+) • (QB|RB|WR|TE|K|DST)',c[1])
        if not m or m[3]!=c[2]:raise ValueError('Blitz identity changed')
        rows.append({'name':m[1],'position':m[3],'team':w.team_key(m[2]),'overallRank':int(c[0])})
    if len(rows)!=47:raise ValueError('Blitz priority count changed')
    return w.overall_to_position(rows)

def ds_bids(page):
    rows=[];tier=None
    for i,line in enumerate(page.lines):
        if line in {'Priority Targets of the Week','Deep-League Options','Upside Stashes'}:tier=line
        if not line.startswith('Blind Bid Recommendation:'):continue
        m=re.fullmatch(r'(.+), (QB|RB|WR|TE)s?, ([\w ]+)',page.lines[i-1])
        if not m:raise ValueError('DraftSharks player heading changed')
        for name in m[1].split(' and '):rows.append({'name':name,'position':m[2],'team':w.team_key(m[3]),'bid':w.bid(line.split(':',1)[1],tier=tier)})
    if len(rows)!=15:raise ValueError('DraftSharks bid count changed')
    return rows

def rb_bids(page):
    # The publisher assigns the same range to both Miami WRs, with an explicit
    # PPR preference, unlike its other two-player blocks with separate ranges.
    lines=list(page.lines)
    special='FAAB Bid: 4-6% (I would lean Washington in full PPR; otherwise Bell would be higher on my priority ladder)'
    at=lines.index(special)
    if lines[at-2:at]!=['Chris Bell (WR, MIA) - 4% rostered','Malik Washington (WR, MIA) - 20% rostered']:raise ValueError('Shared Miami bid identity changed')
    lines[at:at+3]=['FAAB Bid: 4-6% / 4-6%','Aggressive Bid: 6-8% / 6-8%','Desperation Bid: 8-10% / 8-10%']
    page.lines=lines
    result=w.parse_rotoballer_faab(page)
    # Preserve the separately labeled superflex alternatives without blending them.
    for row in result:
        if row['name'] in {'Geno Smith','Marcus Mariota'}:
            row['bid'].setdefault('alternatives',[]).append(w.bid('40-50' if row['name']=='Geno Smith' else '20-30',tier='Superflex'))
    return result

def cbs_facts(page):
    ranks,bids=w.parse_cbs(page)
    bids=[r for r in bids if r['name'] not in {'Jalon Daniels','Case Keenum','Jaylen Wright','Ollie Gordon II'}]
    text=' '.join(page.lines)
    if 'up to 15 percent of your remaining FAAB in Gordon' not in text or 'stash Wright for 10-15 percent of your FAAB' not in text:raise ValueError('CBS distinct Miami bids changed')
    bids.extend([
      {'name':'Ollie Gordon II','position':'RB','team':'MIA','bid':w.bid('15',basis='remaining',operator='at-most')},
      {'name':'Jaylen Wright','position':'RB','team':'MIA','bid':w.bid('10-15',basis='unspecified')},
    ])
    return ranks,bids

def assemble(htmls,captured_at):
    captured=datetime.fromisoformat(captured_at.replace('Z','+00:00'))
    index=w.identity_index(ROOT/'data/raw/2026/players.csv')
    reviewed={key:scope(key,html,captured) for key,html in htmls.items()};p={k:v[0] for k,v in reviewed.items()}
    ranks={'fantasypros':fp_rank(p['fantasypros0']),'rotoballer':w.parse_rotoballer_rank(p['rotoballer0']),'nfl':nfl_rank(p['nfl0'],index),'blitz':blitz_rank(p['blitz0'])}
    bids={'fantasypros':w.parse_fantasypros_faab(p['fantasypros1']),'rotoballer':rb_bids(p['rotoballer1']),'footballguys':w.parse_footballguys(p['footballguys0']),'draftsharks':ds_bids(p['draftsharks0'])}
    ranks['cbs'],bids['cbs']=cbs_facts(p['cbs0'])
    bids['rotowire']=[]
    for row in w.parse_rotowire(p['rotowire0']):
        if row['name']=='Jalon Daniels':continue # Deep QB / superflex context.
        for name in row['name'].split(' and '):bids['rotowire'].append({**row,'name':name})
    players={};sources=[]
    for sid,label in LABELS.items():
        source={'id':sid,'label':label,'type':'expert','scoring':'unspecified','rankCount':len(ranks.get(sid,[])),'faabCount':len(bids.get(sid,[])),'capturedAt':captured_at,'publishedAt':reviewed[sid+'0'][1]['datePublished']}
        source['evidence']=[{'url':URLS[k],'sha256':hashlib.sha256(htmls[k].encode()).hexdigest(),**reviewed[k][1]} for k in URLS if k.startswith(sid)]
        if sid in ranks:source.update(rankUrl=URLS[sid+'0'],rankMethod=w.METHOD_POSITION if sid=='cbs' else w.METHOD_OVERALL)
        if sid in bids:source['faabUrl']=URLS[sid+('1' if sid in {'fantasypros','rotoballer'} else '0')]
        notes={
          'fantasypros':'Public top-five PPR consensus preview only; positional ordinals within that preview. Article bids use a $100 budget; annual versus remaining unspecified.',
          'rotoballer':'Original 85-player overall priority retained. Primary FAAB tiers plus aggressive, desperation and separately labeled superflex alternatives. Miami WR shared range preserved.',
          'footballguys':'Annual-budget FAAB ranges from public feature; no invented ranks.',
          'rotowire':'Public FAAB suggestions; deep QB bid excluded. League-depth labels retained; grouped Kirk/Cooks bid applies to each.',
          'cbs':'Explicit Add in this order positional cards. Superflex-only backup-QB bids excluded. Wright and Gordon have different bids; Wright budget basis unspecified.',
          'draftsharks':'FAAB only: current article has priority/deep/stash tiers but does not declare a numeric ranking order. No ordinal rank inferred.',
          'nfl':'Explicit overall priority table normalized within position. Omitted Raymond position resolved against unique nflverse identity.',
          'blitz':'Explicit 47-player waiver priority table, not weekly start/sit ranks. Original overall ranks retained.',
        }
        source['coverageNote']=notes[sid]
        if sid=='fantasypros':source.update(rankScoring='PPR',scoring='rank: PPR; FAAB: unspecified')
        for kind,rows in [('rankings',ranks.get(sid,[])),('faab',bids.get(sid,[]))]:
            for row in rows:
                name=row['name'];pos=row['position'];team=row.get('team')
                matches=index.get((w.name_key(name),pos),[])
                if len(matches)>1 and team:matches=[m for m in matches if w.team_key(m.get('latest_team'))==team]
                matched=matches[0] if len(matches)==1 else None;pid=matched.get('gsis_id') if matched else None
                if pos=='DST':team=team or w.team_key(name.replace(' D/ST','').replace(' DST',''))
                key=('team:dst:'+team if pos=='DST' and team else pid) or 'name:'+pos.lower()+':'+w.name_key(name)
                if key not in players:players[key]={'id':key,'playerId':pid,'name':matched['display_name'] if matched else name,'position':pos,'team':team or (w.team_key(matched.get('latest_team')) if matched else None),'rankings':{},'faab':{},'identityMethod':'unique normalized nflverse name variant + position' if matched else 'unmatched source name + position','teamProvenance':'publisher' if team else 'nflverse player dictionary' if matched else 'unknown'}
                player=players[key]
                if team:
                    if player['teamProvenance']=='publisher' and player['team']!=team:raise ValueError('Conflicting publisher teams '+name)
                    player.update(team=team,teamProvenance='publisher')
                if sid in player[kind]:raise ValueError('Duplicate source identity '+name)
                player[kind][sid]=({'rank':row['rank'],'scope':'position','method':row['method'],**({'overallRank':row['overallRank']} if 'overallRank' in row else {})} if kind=='rankings' else row['bid'])
        sources.append(source)
    result={'season':2026,'waiverWeek':4,'capturedAt':captured_at,'sources':sources,'players':sorted(players.values(),key=lambda x:(x['position'],x['name'])),'methodology':'After complete Week 3, for Week 4 waiver claims. Source-native priorities and bids only; overall ranks normalized within position with original ranks retained. Publication dates, scoring, budget basis and eligibility differ. Missing means unavailable, never zero. No article-order ranks inferred.'}
    w.validate(result,4);return result

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--verify',action='store_true');parser.add_argument('--html-dir',type=Path);parser.add_argument('--captured-at');args=parser.parse_args()
    if args.verify:result=json.loads(OUTPUT.read_text())
    else:
        if bool(args.html_dir)!=bool(args.captured_at):parser.error('Existing HTML requires its actual capture timestamp')
        captured=args.captured_at or datetime.now(timezone.utc).isoformat()
        cache=args.html_dir or ROOT/'artifacts/waivers-week4'/captured.replace(':','-');cache.mkdir(parents=True,exist_ok=True)
        htmls={}
        for key,url in URLS.items():
            if args.html_dir:htmls[key]=(cache/(key+'.html')).read_text()
            else:
                htmls[key]=urlopen(Request(url,headers={'User-Agent':'Bowser-public-waiver-facts/1.0'}),timeout=30).read().decode();(cache/(key+'.html')).write_text(htmls[key])
        result=assemble(htmls,captured);w.atomic_write(OUTPUT,result,4)
    print(json.dumps(w.validate(result,4),indent=2))
if __name__=='__main__':main()
