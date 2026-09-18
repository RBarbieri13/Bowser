#!/usr/bin/env python3
"""Import public 2026 Week 2 waiver facts; fail closed before replacing the snapshot.

No credentials or paid endpoints. Publisher HTML is held in memory, not republished.
--html-dir is an optional local capture cache for reproducible parser verification;
--verify checks a committed snapshot without contacting publishers.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
import math
import os
from pathlib import Path
import re
import tempfile
import unicodedata
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / 'data/waivers-2026-week2.json'
POSITIONS = {'QB', 'RB', 'WR', 'TE', 'K', 'DST'}
URLS = {
 'fantasypros0':'https://www.fantasypros.com/nfl/rankings/?scoring=PPR&type=waiver',
 'fantasypros1':'https://www.fantasypros.com/2026/09/fantasy-football-waiver-wire-advice-players-to-add-stash-drop-week-2-2026/',
 'rotoballer0':'https://www.rotoballer.com/waiver-wire-rankings-fantasy-football-week-2-2026/1930758',
 'rotoballer1':'https://www.rotoballer.com/faab-waiver-wire-advice-week-2-fantasy-pickups-2026/1931602',
 'footballguys0':'https://www.footballguys.com/article/2026-email-feature-top-waiver-wire-pickups-week02',
 'rotowire0':'https://www.rotowire.com/football/article/fantasy-football-waiver-wire-pickups-for-week-2-134360',
 'cbs0':'https://hubapi.cbssports.com/fantasy/football/news/week-2-fantasy-football-waiver-wire-bryce-young-has-huge-opener/',
 'draftsharks0':'https://www.draftsharks.com/article/week-2-waiver-wire-pickups',
 'nfl0':'https://www.nfl.com/news/2026-nfl-fantasy-football-waiver-wire-week-2-wr-jalen-coker-rb-kaelon-black-among-top-targets',
}
LABELS = {'fantasypros':'FantasyPros','rotoballer':'RotoBaller','footballguys':'Footballguys','rotowire':'RotoWire','cbs':'CBS Sports','draftsharks':'DraftSharks','nfl':'NFL'}
TEAM_NAMES = dict(zip(
 'Cardinals Falcons Ravens Bills Panthers Bears Bengals Browns Cowboys Broncos Lions Packers Texans Colts Jaguars Chiefs Raiders Chargers Rams Dolphins Vikings Patriots Saints Giants Jets Eagles Steelers 49ers Seahawks Buccaneers Titans Commanders'.split(),
 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LA MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WAS'.split()))
TEAM_ALIASES={'LAR':'LA','JAC':'JAX','WSH':'WAS'}
POSITION_NAMES={'Quarterback':'QB','Running Back':'RB','Wide Receiver':'WR','Tight End':'TE'}
METHOD_OVERALL='within-position ordinal of published overall waiver priority'
METHOD_POSITION='publisher explicitly ordered positional waiver priorities'


def name_key(value):
    value=unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().lower()
    value=re.sub(r'\b(jr|sr|ii|iii|iv)\b','',value.replace("'",'').replace('.',''))
    return re.sub('[^a-z0-9]','',value)


def team_key(value):
    if not value:return None
    value=value.strip()
    if value in TEAM_ALIASES:return TEAM_ALIASES[value]
    if value in TEAM_NAMES.values():return value
    for name,team in TEAM_NAMES.items():
        if value==name or value.endswith(' '+name):return team
    return None


class Node:
    def __init__(self, tag, attrs=None):self.tag=tag;self.attrs=dict(attrs or []);self.children=[]
    def text(self):return ' '.join(''.join(c if isinstance(c,str) else c.text()+' ' for c in self.children).split())
    def all(self, tag):
        out=[]
        for c in self.children:
            if isinstance(c,Node):
                if c.tag==tag:out.append(c)
                out.extend(c.all(tag))
        return out


class Page(HTMLParser):
    """Small stdlib tree plus readable lines; scripts/styles never enter fact parsers."""
    VOID={'br','img','meta','link','input','hr','source','wbr','area','base','embed','param','track','col'}
    def __init__(self, html):
        super().__init__(convert_charrefs=True);self.root=Node('root');self.stack=[self.root];self.skip=0;self.parts=[]
        self.feed(html)
        self.lines=[' '.join(s.split()) for s in ''.join(self.parts).splitlines() if s.strip()]
    def handle_starttag(self,t,a):
        if t in {'script','style'}:self.skip+=1;return
        if self.skip:return
        n=Node(t,a);self.stack[-1].children.append(n)
        if t not in self.VOID:self.stack.append(n)
        if t in {'h1','h2','h3','h4','p','li','tr','br','div'}:self.parts.append('\n')
    def handle_endtag(self,t):
        if t in {'script','style'}:self.skip=max(0,self.skip-1);return
        if self.skip:return
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==t:self.stack=self.stack[:i];break
        if t in {'h1','h2','h3','h4','p','li','tr','div'}:self.parts.append('\n')
        if t in {'td','th'}:self.parts.append(' | ')
    def handle_data(self,s):
        if not self.skip:self.stack[-1].children.append(s);self.parts.append(s)
    def tables(self):
        return [[[c.text() for c in row.children if isinstance(c,Node) and c.tag in {'td','th'}] for row in table.all('tr')] for table in self.root.all('table')]


def assert_scope(key,html):
    page=Page(html)
    titles=' '.join(n.text() for n in page.root.all('title')+page.root.all('h1'))
    if not re.search(r'Week\s*2\b',titles,re.I):raise ValueError(f'{key}: expected Week 2 title')
    # Dated publication metadata, URL, and visible year are checked together. Rolling URLs
    # must actually carry a current publication date, not just a footer copyright year.
    dates=publication_dates(html)
    dated=any(d.startswith('2026-09-') for d in dates.values())
    if not dated and not ('2026' in titles or '/2026' in URLS[key]):
        raise ValueError(f'{key}: no verifiable 2026 publication')
    if key=='fantasypros0' and not re.search(r'Overall Waiver Wire Rankings - Sep 15, 2026',' '.join(page.lines)):
        raise ValueError('FantasyPros rolling preview is no longer the pinned September 15, 2026 snapshot')
    for date in dates.values():
        if date[:4]!='2026':raise ValueError(f'{key}: wrong publication year')
    return page


def publication_dates(html):
    out={}
    for field in ('datePublished','dateModified'):
        m=re.search(r'"'+field+r'"\s*:\s*"([^"]+)"',html)
        if m:out[field]=m.group(1)
    if not out.get('datePublished'):
        published=re.search(r'Published\s+(\d{2})/(\d{2})/(\d{4})',html)
        if published:out['datePublished']=f'{published[3]}-{published[1]}-{published[2]}'
    return out


def bid(value, *, unit='percent', basis='unspecified', tier=None, operator=None):
    value=value.strip().replace('–','-').replace('—','-').replace('$','').replace('%','')
    if not re.fullmatch(r'\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?',value):raise ValueError('Invalid bid '+value)
    vals=[float(x.strip()) for x in value.split('-')]
    vals=[int(x) if x.is_integer() else x for x in vals]
    result={'low':vals[0],'high':vals[-1],'unit':unit,'budgetBasis':basis}
    if operator=='at-least':result['high']=None
    if operator=='at-most':result['low']=0
    if operator:result['operator']=operator
    if tier:result['tier']=tier
    if unit=='dollars':result['referenceBudget']=100
    return result


def overall_to_position(rows):
    counts=Counter();out=[]
    for row in sorted(rows,key=lambda r:r['overallRank']):
        counts[row['position']]+=1
        out.append(dict(row,rank=counts[row['position']],method=METHOD_OVERALL))
    return out


def parse_fantasypros_rank(page):
    for table in page.tables():
        if table and table[0][:2]==['Rank','Player (Team)']:
            out=[]
            for cells in table[1:]:
                if len(cells)<2 or not cells[0].isdigit():continue
                m=re.fullmatch(r'(.+?)\s*\((QB|RB|WR|TE|K)\s*-\s*([A-Z]+)\)',cells[1])
                if not m:raise ValueError('Unrecognized FantasyPros public rank row '+repr(cells))
                out.append({'name':m[1].strip(),'position':m[2],'team':team_key(m[3]),'overallRank':int(cells[0])})
            if len(out)!=5:raise ValueError('FantasyPros public preview shape changed; review access and parser')
            return overall_to_position(out)
    raise ValueError('FantasyPros public rank table missing')


def parse_rotoballer_rank(page):
    for table in page.tables():
        if table and table[0][:3]==['Rank','Player Name','Position']:
            rows=[]
            for cells in table[1:]:
                if len(cells)<3 or not cells[0].isdigit():continue
                pos=cells[2].replace('D/ST','DST')
                if pos not in POSITIONS:raise ValueError('Unexpected RotoBaller position '+pos)
                rows.append({'name':cells[1],'position':pos,'team':None,'overallRank':int(cells[0])})
            if len(rows)<50:raise ValueError('RotoBaller ranking table unexpectedly truncated')
            return overall_to_position(rows)
    raise ValueError('RotoBaller rank table missing')


def parse_nfl_rank(page):
    for table in page.tables():
        if table and 'Waiver Wire Priority Rankings' in ' '.join(table[0]):
            out=[]
            for cells in table[1:]:
                m=re.fullmatch(r'(\d+)\) (QB|RB|WR|TE) (.+), ([\w ]+)',cells[0])
                if m:out.append({'name':m[3],'position':m[2],'team':team_key(m[4]),'overallRank':int(m[1])});continue
                d=re.fullmatch(r'(\d+)\) (.+) D/ST',cells[0])
                if d:out.append({'name':d[2]+' D/ST','position':'DST','team':team_key(d[2]),'overallRank':int(d[1])});continue
                raise ValueError('Unrecognized NFL rank row '+repr(cells))
            if len(out)<10:raise ValueError('NFL priority table truncated')
            return overall_to_position(out)
    raise ValueError('NFL explicit priority table missing')


def parse_draftsharks(page):
    lines=page.lines;joined=' '.join(lines)
    if 'ranked in order of priority by position' not in joined:raise ValueError('DraftSharks no longer explicitly prioritizes article positions')
    start=next(i for i,s in enumerate(lines) if 'ranked in order of priority by position' in s)
    counts=Counter();pos=None;tier='primary';rows=[];faabs=[]
    for i in range(start+1,len(lines)):
        line=lines[i]
        if line=='Next Up':break
        if line=='Deep Options':tier='deep options'
        if line in POSITION_NAMES:pos=POSITION_NAMES[line]
        if line.startswith('Blind Bid Recommendation:'):
            if not pos:raise ValueError('DraftSharks missing position')
            m=re.fullmatch(r'(.+), ([\w ]+)',lines[i-1])
            if not m:raise ValueError('DraftSharks missing player heading')
            counts[pos]+=1
            player={'name':m[1],'position':pos,'team':team_key(m[2])}
            rows.append(dict(player,rank=counts[pos],method=METHOD_POSITION+'; primary section then deep options'))
            faabs.append(dict(player,bid=bid(line.split(':',1)[1],tier=tier)))
    if len(rows)<10:raise ValueError('DraftSharks bid headings truncated')
    return rows,faabs


def parse_cbs(page):
    lines=page.lines
    start=lines.index('WAIVER WIRE');end=next((i for i in range(start,len(lines)) if lines[i]=='DST streamers'),len(lines))
    lines=lines[start:end];cards=[];authorized=False
    for i,line in enumerate(lines):
        if 'Add in this order:' in line:authorized=True
        if i+2<len(lines) and lines[i+1] in {'QB','RB','WR','TE'} and re.fullmatch('[A-Z]{2,3}',lines[i+2]):
            if not authorized:raise ValueError('CBS card not preceded by explicit priority instruction')
            cards.append((i,{'name':line,'position':lines[i+1],'team':team_key(lines[i+2])}))
    counts=Counter();ranks=[];faabs=[]
    for j,(i,player) in enumerate(cards):
        counts[player['position']]+=1;ranks.append(dict(player,rank=counts[player['position']],method=METHOD_POSITION))
        text=' '.join(lines[i:(cards[j+1][0] if j+1<len(cards) else len(lines))])
        # These QB articles explicitly contain format-specific recommendations. Keep them
        # out of this redraft one-QB column instead of silently borrowing superflex prices.
        if player['name'] in {'Carson Wentz','Michael Penix Jr.','Drew Lock'}:continue
        m=re.search(r'for (at least |up to )?(\d+(?:-\d+)?) percent of your remaining FAAB',text)
        if m:
            operator={'at least ':'at-least','up to ':'at-most'}.get(m[1])
            faabs.append(dict(player,bid=bid(m[2],basis='remaining',operator=operator)))
    if len(ranks)<25:raise ValueError('CBS priority cards unexpectedly truncated')
    return ranks,faabs


def parse_fantasypros_faab(page):
    if 'based on a $100 budget' not in ' '.join(page.lines):raise ValueError('FantasyPros dollar reference budget changed')
    out=[];player=None;values=[]
    def finish():
        if player and values:
            primary=values[0]
            if len(values)>1:primary['alternatives']=values[1:]
            out.append(dict(player,bid=primary))
    for line in page.lines:
        m=re.fullmatch(r'(.+?) \((QB|RB|WR|TE|K) [–-] ([A-Z]+)\): .*Rostered',line)
        if m:
            finish();player={'name':m[1],'position':m[2],'team':team_key(m[3])};values=[];continue
        if line in {'Defenses','Fool’s Gold','Drop Recommendations'}:finish();player=None;values=[]
        if player:
            b=re.fullmatch(r'(True Value|Desperate Need|Budget-Minded): \$(\d+(?:-\d+)?)',line)
            if b:values.append(bid(b[2],unit='dollars',tier=b[1]))
    finish()
    if len(out)<20:raise ValueError('FantasyPros FAAB headings unexpectedly truncated')
    return out


def parse_rotoballer_faab(page):
    rows=[];pending=[];last=[]
    for line in page.lines:
        m=re.fullmatch(r'(.+?) \((QB|RB|WR|TE), ([A-Z]+)\) - \d+% rostered',line)
        if m:
            pending.append({'name':m[1],'position':m[2],'team':team_key(m[3])});continue
        b=re.fullmatch(r'(FAAB Bid|Aggressive Bid|Desperation Bid):\s*(.+)',line)
        if b:
            values=b[2].split(' / ')
            if b[1]=='FAAB Bid':
                if not pending:continue  # Defense/team paragraphs are excluded here.
                if len(pending)!=len(values):raise ValueError('RotoBaller grouped bids no longer align with player headings')
                last=[]
                for player,value in zip(pending,values):
                    row=dict(player,bid=bid(value,tier='base'));rows.append(row);last.append(row)
                pending=[]
            elif last:
                if len(last)!=len(values):raise ValueError('RotoBaller alternate tiers no longer align')
                for row,value in zip(last,values):row['bid'].setdefault('alternatives',[]).append(bid(value,tier=b[1]))
        elif pending: # Player headings must be contiguous and immediately followed by prices.
            pending=[]
        elif line.startswith('FAAB Waiver Wire Pickups - Defense'):last=[]
    if len(rows)<15:raise ValueError('RotoBaller FAAB coverage unexpectedly truncated')
    return rows


def parse_footballguys(page):
    out=[]
    for i,line in enumerate(page.lines):
        m=re.fullmatch(r'Bid Recommendation: (\d+-\d+)% of Annual FAAB Budget',line)
        if m:
            p=re.fullmatch(r'(.+?) \((QB|RB|WR|TE)-([A-Z]+)\)',page.lines[i-1])
            if not p:raise ValueError('Footballguys bid missing player heading')
            out.append({'name':p[1],'position':p[2],'team':team_key(p[3]),'bid':bid(m[1],basis='annual')})
    if len(out)<5:raise ValueError('Footballguys public feature truncated')
    return out


def parse_rotowire(page):
    out=[];pos=None
    plural={'QUARTERBACK':'QB','RUNNING BACK':'RB','WIDE RECEIVER':'WR','TIGHT END':'TE'};tier=None
    for line in page.lines:
        if line in plural:pos=plural[line]
        if line in {'ALL LEAGUES','DEEP LEAGUES'}:tier=line.lower()
        if 'FAAB:' not in line:continue
        m=re.match(r'([^,]+), ([\w ]+) - .+ FAAB: (\d+) percent of budget',line)
        if not m:raise ValueError('RotoWire FAAB paragraph changed')
        if not pos:raise ValueError('RotoWire missing position')
        # Deep quarterback section is explicitly superflex; do not blend formats.
        if m[1]=='Drew Lock':continue
        out.append({'name':m[1],'position':pos,'team':team_key(m[2]),'bid':bid(m[3],tier=tier)})
    if len(out)<10:raise ValueError('RotoWire public FAAB coverage unexpectedly truncated')
    return out


def identity_index(path):
    result=defaultdict(list)
    if path.exists():
        with path.open(newline='') as f:
            for row in csv.DictReader(f):
                if row.get('position') in POSITIONS:
                    names={row['display_name']}
                    names.update(row[field]+' '+row['last_name'] for field in ('first_name','common_first_name','football_name') if row.get(field))
                    for key in {name_key(name) for name in names}:result[(key,row['position'])].append(row)
    return result


def assemble(htmls, captured_at, players_path):
    pages={k:assert_scope(k,v) for k,v in htmls.items()}
    ranks={'fantasypros':parse_fantasypros_rank(pages['fantasypros0']),'rotoballer':parse_rotoballer_rank(pages['rotoballer0']),'nfl':parse_nfl_rank(pages['nfl0'])}
    faabs={'fantasypros':parse_fantasypros_faab(pages['fantasypros1']),'rotoballer':parse_rotoballer_faab(pages['rotoballer1']),'footballguys':parse_footballguys(pages['footballguys0']),'rotowire':parse_rotowire(pages['rotowire0'])}
    ranks['cbs'],faabs['cbs']=parse_cbs(pages['cbs0'])
    ranks['draftsharks'],faabs['draftsharks']=parse_draftsharks(pages['draftsharks0'])
    index=identity_index(players_path);players={};sources=[]
    for sid in LABELS:
        source={'id':sid,'label':LABELS[sid],'scoring':'unspecified','rankCount':len(ranks.get(sid,[])),'faabCount':len(faabs.get(sid,[])),'capturedAt':captured_at}
        key=sid+'0';dates=publication_dates(htmls[key])
        if dates.get('datePublished'):source['publishedAt']=dates['datePublished']
        elif sid=='fantasypros':source['publishedAt']='2026-09-15'  # Validated visible ranking dateline.
        if dates.get('dateModified'):source['updatedAt']=dates['dateModified']
        source['evidence']=[{'url':URLS[k],'sha256':hashlib.sha256(htmls[k].encode()).hexdigest(),**publication_dates(htmls[k])} for k in URLS if k.startswith(sid)]
        if sid in ranks:
            source['rankUrl']=URLS[key]
            source['rankMethod']=METHOD_OVERALL if sid in {'fantasypros','rotoballer','nfl'} else METHOD_POSITION
        if sid in faabs:source['faabUrl']=URLS[sid+('1' if sid in {'fantasypros','rotoballer'} else '0')]
        if sid=='fantasypros':
            source.update(scoring='rank: PPR; FAAB: unspecified',rankScoring='PPR',faabScoring='unspecified',coverageNote='Public top-five preview only; positional ordinal within that preview. Article bids use a $100 reference; annual versus remaining unspecified.')
        elif sid=='rotoballer':source['coverageNote']='Mixed format eligibility in publisher table; QBs and DST grouped after skill positions. FAAB base tier, with aggressive/desperation alternatives retained.'
        elif sid=='draftsharks':source['coverageNote']='Publisher explicitly prioritizes within position; primary section precedes deep options. Bids retain section tier.'
        elif sid=='cbs':source['coverageNote']='Waiver priority cards, not weekly lineup ranks. Remaining-budget bids; format-specific backup-QB bids excluded.'
        elif sid=='rotowire':source['coverageNote']='Public FAAB suggestions; superflex-only Drew Lock bid excluded. Shallow/deep context retained per player where stated.'
        sources.append(source)
        for kind,rows in [('rankings',ranks.get(sid,[])),('faab',faabs.get(sid,[]))]:
            for row in rows:
                nk=name_key(row['name']);pos=row['position'];key=(nk,pos)
                matches=index.get(key,[])
                if row['team'] and len(matches)>1:matches=[p for p in matches if team_key(p.get('latest_team'))==row['team']]
                matched=matches[0] if len(matches)==1 else None
                pid=matched.get('gsis_id') if matched else None
                defense_team=team_key(row['name'].replace(' D/ST','').replace(' Defense','')) if pos=='DST' else None
                stable=('team:dst:'+defense_team if defense_team else None) or pid or 'name:'+pos.lower()+':'+nk
                if stable not in players:
                    players[stable]={'id':stable,'playerId':pid,'name':matched['display_name'] if matched else row['name'],'position':pos,'team':row['team'] or (team_key(matched.get('latest_team')) if matched else team_key(row['name'].replace(' D/ST',''))),'rankings':{},'faab':{},'identityMethod':'unique normalized nflverse name variant + position' if matched else 'unmatched source name + position','teamProvenance':'publisher' if row['team'] or defense_team else 'nflverse player dictionary' if matched else 'unknown'}
                player=players[stable]
                if row['team']:
                    if player['teamProvenance']=='publisher' and player['team'] and player['team']!=row['team']:raise ValueError('Conflicting source teams for '+row['name'])
                    player['team']=row['team'];player['teamProvenance']='publisher'
                if sid in player[kind]:raise ValueError('Duplicate source/player '+sid+' '+row['name'])
                if kind=='rankings':
                    player[kind][sid]={'rank':row['rank'],'scope':'position','method':row['method']}
                    if 'overallRank' in row:player[kind][sid]['overallRank']=row['overallRank']
                else:player[kind][sid]=row['bid']
    payload={'season':2026,'waiverWeek':2,'capturedAt':captured_at,'sources':sources,'players':sorted(players.values(),key=lambda p:(p['position'],p['name'])),'methodology':'Publisher numeric waiver priorities and FAAB suggestions only. Missing cells are unknown. Overall priorities are normalized to within-position ordinals with original overallRank retained. Source populations, scoring and annual/remaining budget bases differ; do not treat them as interchangeable league advice.'}
    validate(payload)
    return payload


def validate(payload):
    if payload.get('season')!=2026 or payload.get('waiverWeek')!=2:raise ValueError('Expected 2026 Week 2 snapshot')
    captured=datetime.fromisoformat(payload['capturedAt'].replace('Z','+00:00'))
    if captured.tzinfo is None:raise ValueError('Capture timestamp needs timezone')
    if captured.year!=2026:raise ValueError('Capture timestamp is not in season 2026')
    sources=payload.get('sources',[]);ids=[s['id'] for s in sources]
    if len(ids)!=len(set(ids)):raise ValueError('Duplicate source IDs')
    if 'faabtastic' in ids:raise ValueError('Faabtastic ingestion not authorized')
    rank_counts=Counter();faab_counts=Counter();seen=set();pos_ranks=defaultdict(set)
    def number(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
    def check_bid(b):
        if not number(b.get('low')) or b['low']<0:raise ValueError('Malformed FAAB low')
        high=b.get('high');operator=b.get('operator')
        if high is None:
            if operator!='at-least':raise ValueError('Open FAAB range must be at-least')
        elif not number(high) or high<b['low']:raise ValueError('Malformed FAAB high')
        if b.get('unit') not in {'percent','dollars'}:raise ValueError('Unknown FAAB unit')
        if b.get('budgetBasis') not in {'annual','remaining','unspecified'}:raise ValueError('Unknown budget basis')
        if b['low']>100 or (high is not None and high>100):raise ValueError('FAAB exceeds budget/reference')
        if b['unit']=='dollars' and b.get('referenceBudget')!=100:raise ValueError('Dollar bid missing $100 reference')
        if operator not in {None,'at-least','at-most'}:raise ValueError('Unknown FAAB operator')
        for alternative in b.get('alternatives',[]):check_bid(alternative)
    for p in payload.get('players',[]):
        if p['id'] in seen:raise ValueError('Duplicate player ID')
        seen.add(p['id'])
        if p.get('position') not in POSITIONS or not p.get('name'):raise ValueError('Malformed identity')
        if p.get('playerId') is not None and not re.fullmatch(r'00-\d{7}',p['playerId']):raise ValueError('Malformed GSIS ID')
        for sid,r in p.get('rankings',{}).items():
            if sid not in ids:raise ValueError('Unknown ranking source')
            if type(r.get('rank')) is not int or r['rank']<1 or r.get('scope')!='position' or not r.get('method'):raise ValueError('Malformed positional rank')
            if 'overallRank' in r and (type(r['overallRank']) is not int or r['overallRank']<1):raise ValueError('Malformed overall rank')
            if r['rank'] in pos_ranks[sid,p['position']]:raise ValueError('Duplicate positional ordinal')
            pos_ranks[sid,p['position']].add(r['rank']);rank_counts[sid]+=1
        for sid,b in p.get('faab',{}).items():
            if sid not in ids:raise ValueError('Unknown FAAB source')
            check_bid(b);faab_counts[sid]+=1
    if len(rank_counts)<5 or len(faab_counts)<5:raise ValueError('Coverage requires at least five actual rank sources and five actual FAAB sources')
    for source in sources:
        sid=source['id']
        for evidence in source.get('evidence',[]):
            for field in ('datePublished','dateModified'):
                if evidence.get(field):
                    observed=datetime.fromisoformat(evidence[field].replace('Z','+00:00'))
                    if len(evidence[field])==10:
                        if observed.year!=2026 or observed.date()>captured.date():raise ValueError('Invalid or future publication date')
                    elif observed.tzinfo is None or observed.year!=2026 or observed>captured:raise ValueError('Invalid or future publication date')
        if source.get('rankCount')!=rank_counts[sid] or source.get('faabCount')!=faab_counts[sid]:raise ValueError('Declared source coverage does not match actual cells')
        for field in ('rankUrl','faabUrl'):
            if source.get(field) and not source[field].startswith('https://'):raise ValueError('Source URL must be HTTPS')
        if rank_counts[sid] and not source.get('rankUrl'):raise ValueError('Missing rank provenance')
        if faab_counts[sid] and not source.get('faabUrl'):raise ValueError('Missing FAAB provenance')
    return {'status':'PASS','season':2026,'waiverWeek':2,'players':len(seen),'rankSources':len(rank_counts),'faabSources':len(faab_counts),'rankCells':sum(rank_counts.values()),'faabCells':sum(faab_counts.values()),'mappedPlayers':sum(p.get('playerId') is not None for p in payload['players']),'coverage':{s['id']:{'rank':rank_counts[s['id']],'faab':faab_counts[s['id']]} for s in sources}}


def atomic_write(path,payload):
    validate(payload)
    path.parent.mkdir(parents=True,exist_ok=True)
    text=json.dumps(payload,indent=2,ensure_ascii=False)+'\n'
    name=None
    try:
        with tempfile.NamedTemporaryFile('w',encoding='utf-8',dir=path.parent,prefix=path.name+'.',suffix='.tmp',delete=False) as f:
            name=f.name;f.write(text);f.flush();os.fsync(f.fileno())
        os.replace(name,path)
    finally:
        if name and os.path.exists(name):os.unlink(name)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=DEFAULT_OUTPUT)
    parser.add_argument('--players',type=Path,default=ROOT/'data/raw/players.csv')
    parser.add_argument('--html-dir',type=Path,help='Read already captured public HTML named <source><0|1>.html')
    parser.add_argument('--captured-at',help='Actual UTC capture timestamp required with --html-dir; never relabel old HTML as newly fetched')
    parser.add_argument('--verify',action='store_true',help='Validate existing snapshot, no network or writes')
    args=parser.parse_args()
    if args.verify:payload=json.loads(args.output.read_text())
    else:
        if args.html_dir and not args.captured_at:parser.error('--html-dir requires the original --captured-at timestamp')
        if args.captured_at and not args.html_dir:parser.error('--captured-at is only valid for an existing HTML capture')
        captured=args.captured_at or datetime.now(timezone.utc).isoformat()
        htmls={}
        for key,url in URLS.items():
            if args.html_dir:htmls[key]=(args.html_dir/(key+'.html')).read_text()
            else:
                request=Request(url,headers={'User-Agent':'Bowser-public-waiver-facts/1.0'})
                with urlopen(request,timeout=30) as response:htmls[key]=response.read().decode('utf-8')
        payload=assemble(htmls,captured,args.players)
        atomic_write(args.output,payload)
    print(json.dumps(validate(payload),indent=2))
    return 0


if __name__=='__main__':raise SystemExit(main())
