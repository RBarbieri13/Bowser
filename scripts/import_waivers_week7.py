#!/usr/bin/env python3
"""Verified October 20 public Week 7 waiver facts; historical snapshots stay immutable."""
import argparse
from collections import Counter
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import import_waivers as w
import import_waivers_week4 as prior
ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'data/waivers-2026-week7.json'
KEYS={'fantasypros':('fantasypros_rank','fantasypros_bid'),'rotoballer':('rotoballer_rank','rotoballer_bid'),'footballguys':('footballguys',),'nfl':('nfl',),'blitz':('blitz',),'cbs':('cbs',),'fantasylife':('fantasylife',)}
NOTES={
'fantasypros':'Five public PPR consensus ranks only; positional order within that preview. Article dollars use a $100 reference; annual versus remaining basis unspecified. True Value, Desperate Need and Budget-Minded tiers remain separate.',
'rotoballer':'85 explicit overall priorities, normalized by position. Base, aggressive, desperation and superflex bids remain separate. Shared SF receiver bid and three distinct Rams TE bids preserved. Budget basis unspecified.',
'footballguys':'Five public annual-budget FAAB ranges. No inferred ranks.',
'nfl':'15 explicit overall waiver priorities, normalized by position; original overall rank retained.',
'blitz':'52 explicit waiver priorities, normalized by position; original overall rank retained.',
'cbs':'Explicit Add in this order positional rankings. Remaining-budget bids retain at-least and up-to operators. Superflex-only quarterback bids are labeled.',
'fantasylife':'Public article explicitly says players are NOT ordered by waiver priority; no inferred ranks. Primary bids are 10–12 team full PPR (1QB for QB); other format/depth tiers remain separate. Budget basis unspecified.'}

def rb_bids(page):
    lines=list(page.lines)
    marker='Terrance Ferguson (TE, LAR) - 13% rostered* (Lowered guidance with word that he won\'t be immediately activated; still a strong stash.)'
    if marker not in lines:raise ValueError('Rams TE update changed')
    lines[lines.index(marker)]='Terrance Ferguson (TE, LAR) - 13% rostered'
    i=next(i for i,l in enumerate(lines) if l.startswith('Brandin Cooks (WR, SF)'))
    if not lines[i+1].startswith('Christian Kirk (WR, SF)'):raise ValueError('Shared SF identity changed')
    for j in range(i+2,i+5):
        label,value=lines[j].split(': ',1)
        if label not in {'FAAB Bid','Aggressive Bid','Desperation Bid'}:raise ValueError('Shared SF tiers changed')
        lines[j]=label+': '+value+' / '+value
    page.lines=lines
    out=w.parse_rotoballer_faab(page)
    for row in out:
        if row['name'] in {'Baker Mayfield','J.J. McCarthy'}:
            row['bid']['tier']='1QB base'
            row['bid'].setdefault('alternatives',[]).append(w.bid('20-30' if row['name']=='Baker Mayfield' else '15-25',tier='Superflex'))
    if len(out)!=21:raise ValueError(f'RotoBaller count changed: {len(out)}')
    return out

def life_bids(page):
    pos=None;player=None;depth=None;values=[];out=[]
    def finish():
        if player and values:
            wanted='10–12 team 1QB' if player['position']=='QB' else '10–12 team Full PPR'
            primary=next(b for b in values if b['tier']==wanted)
            primary['alternatives']=[b for b in values if b is not primary]
            out.append(dict(player,bid=primary))
    for line in page.lines:
        if line in {'Quarterbacks','Running Backs','Wide Receivers','Tight Ends'}:
            pos={'Quarterbacks':'QB','Running Backs':'RB','Wide Receivers':'WR','Tight Ends':'TE'}[line]
        m=re.fullmatch(r'(.+) \| ([A-Z]{2,3})',line)
        if m and pos:
            finish();player={'name':m[1],'team':w.team_key(m[2]),'position':pos};values=[];depth=None
            if player['name']=='Omar Cooper':player['name']='Omar Cooper Jr.'
        if line=='Base League (10-12 team):':depth='10–12 team'
        if line=='Large League (14-16 team):':depth='14–16 team'
        b=re.fullmatch(r'(Standard|Half|Full|1QB|Superflex|Guillotine): (\d+(?:\.\d+)?)%',line)
        if b and player and depth:
            tier='Guillotine' if b[1]=='Guillotine' else depth+' '+({'Full':'Full PPR','Half':'Half PPR'}.get(b[1],b[1]))
            values.append(w.bid(b[2],tier=tier))
    finish()
    if len(out)!=11:raise ValueError(f'FantasyLife count changed {len(out)}')
    return out

def cbs_facts(page):
    ranks,_=w.parse_cbs(page);lines=page.lines
    start=lines.index('WAIVER WIRE');end=lines.index('DST streamers',start);lines=lines[start:end];cards=[];out=[]
    for i,line in enumerate(lines):
        if i+2<len(lines) and lines[i+1] in {'QB','RB','WR','TE'} and re.fullmatch('[A-Z]{2,3}',lines[i+2]):cards.append((i,{'name':line,'position':lines[i+1],'team':w.team_key(lines[i+2])}))
    for j,(i,p) in enumerate(cards):
        text=' '.join(lines[i:cards[j+1][0] if j+1<len(cards) else len(lines)])
        m=re.search(r'for (at least |up to )?(\d+(?:-\d+)?) percent of your remaining FAAB',text)
        if m:
            tier='Superflex / two-QB' if p['name'] in {'J.J. McCarthy','Tanner McKee'} else 'source base'
            value=w.bid(m[2],basis='remaining',operator={'at least ':'at-least','up to ':'at-most'}.get(m[1]),tier=tier)
            value['sourceText']=m[0]
            out.append(dict(p,bid=value))
    text=' '.join(lines)
    secondary=[
      ('Terrance Ferguson','TE','LAR','5-10','remaining',r'Add Ferguson for 5-10 percent of your remaining FAAB'),
      ('Treylon Burks','WR','WAS','1','remaining',r'add Burks for 1 percent of your remaining FAAB'),
      ('Caleb Douglas','WR','MIA','1','remaining',r'flyer on Douglas \(20 percent rostered\) in deeper leagues for 1 percent of your remaining FAAB'),
      ('Brandin Cooks','WR','SF','1','remaining',r'Brandin Cooks \(16 percent rostered\) is also worth a look in deeper leagues for 1 percent of your remaining FAAB'),
      ('Audric Estime','RB','CLE','1','unspecified',r'Estime is worth adding for 1 percent in deeper leagues'),
    ]
    for name,pos,team,amount,basis,pattern in secondary:
        match=re.search(pattern,text)
        if not match:raise ValueError('Named secondary bid changed '+name)
        if any(r['name']==name for r in out):raise ValueError('Secondary bid duplicate '+name)
        value=w.bid(amount,basis=basis,tier='source base');value['sourceText']=match[0]
        out.append({'name':name,'position':pos,'team':w.team_key(team),'bid':value})
    return ranks,out

def assemble(folder):
    evidence=json.loads((folder/'evidence.json').read_text());p={};htmls={}
    for key in {k for ks in KEYS.values() for k in ks}:
        html=(folder/(key+'.html')).read_bytes().decode();e=evidence[key]
        if hashlib.sha256(html.encode()).hexdigest()!=e['sha256']:raise ValueError('Capture hash mismatch '+key)
        page=w.Page(html);titles=' '.join(n.text() for n in page.root.all('h1'))
        if key=='fantasypros_rank':
            if 'Overall Waiver Wire Rankings - Oct 20, 2026' not in page.lines:raise ValueError('Rolling consensus dateline changed')
            e['dates']={'datePublished':'2026-10-20'}
        elif not re.search(r'Week\s*7\b',titles,re.I):raise ValueError('Wrong source week '+key)
        for date in e['dates'].values():
            if date[:10] not in {'2026-10-19','2026-10-20'}:raise ValueError('Wrong source publication window '+key)
        if not e['dates']:raise ValueError('Missing publication date '+key)
        p[key]=page;htmls[key]=html
    ranks={'fantasypros':prior.fp_rank(p['fantasypros_rank']),'rotoballer':w.parse_rotoballer_rank(p['rotoballer_rank']),'nfl':w.parse_nfl_rank(p['nfl'])}
    table=next(t for t in p['blitz'].tables() if t[0][:3]==['RK','Player','Pos']);rows=[]
    for c in table[1:]:
        m=re.fullmatch(r'(.+) ([A-Z]+) • (QB|RB|WR|TE|K|DST)',c[1])
        if not m or m[3]!=c[2]:raise ValueError('Blitz identity changed')
        rows.append({'name':m[1],'team':w.team_key(m[2]),'position':m[3],'overallRank':int(c[0])})
    if len(rows)!=52:raise ValueError('Blitz count changed')
    ranks['blitz']=w.overall_to_position(rows)
    bids={'fantasypros':w.parse_fantasypros_faab(p['fantasypros_bid']),'rotoballer':rb_bids(p['rotoballer_bid']),'footballguys':w.parse_footballguys(p['footballguys']),'fantasylife':life_bids(p['fantasylife'])}
    ranks['cbs'],bids['cbs']=cbs_facts(p['cbs'])
    index=w.identity_index(ROOT/'data/raw/2026/players.csv');players={};sources=[]
    for sid,keys in KEYS.items():
        source={'id':sid,'label':{'blitz':'Blitz Sports Media','fantasylife':'Fantasy Life'}.get(sid,w.LABELS.get(sid,sid)),'type':'expert','scoring':'PPR ranks; FAAB unspecified' if sid=='fantasypros' else 'unspecified','rankCount':len(ranks.get(sid,[])),'faabCount':len(bids.get(sid,[])),'capturedAt':max(evidence[k]['capturedAt'] for k in keys),'publishedAt':evidence[keys[0]]['dates']['datePublished'],'coverageNote':NOTES[sid]}
        source['evidence']=[{'url':evidence[k]['url'],'sha256':evidence[k]['sha256'],**evidence[k]['dates']} for k in keys]
        if sid in ranks:source.update(rankUrl=evidence[keys[0]]['url'],rankMethod=w.METHOD_POSITION if sid=='cbs' else w.METHOD_OVERALL)
        if sid in bids:source['faabUrl']=evidence[keys[-1]]['url']
        if sid=='fantasypros':source['rankScoring']='PPR'
        for kind,rs in [('rankings',ranks.get(sid,[])),('faab',bids.get(sid,[]))]:
            for row in rs:
                name=row['name'];pos=row['position'];team=row.get('team');matches=index.get((w.name_key(name),pos),[])
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
    result={'season':2026,'waiverWeek':7,'capturedAt':max(s['capturedAt'] for s in sources),'sources':sources,'players':sorted(players.values(),key=lambda x:(x['position'],x['name'])),'methodology':'Week 7 claims after Week 6. Source-native priorities and bids only. Overall priorities normalized within position with original values retained. Missing means unavailable, not zero. No article-order rankings or mixed-basis bid averages. League-specific recommendations are private and separate.'}
    w.validate(result,7);return result

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--verify',action='store_true');parser.add_argument('--html-dir',type=Path);args=parser.parse_args()
    if args.verify:result=json.loads(OUTPUT.read_text())
    else:
        if not args.html_dir:parser.error('Provide reviewed HTML capture directory including evidence.json')
        result=assemble(args.html_dir);w.atomic_write(OUTPUT,result,7)
    print(json.dumps(w.validate(result,7),indent=2))
if __name__=='__main__':main()
