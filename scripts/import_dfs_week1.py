#!/usr/bin/env python3
"""Import pinned 2026 Week 1 Classic slates without changing the stats warehouse."""
import csv, hashlib, json, re, sqlite3, unicodedata, urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'artifacts/dfs'
SLATES={'week1':(153054,'2026 W1 · Wed–Mon Classic',16),'main':(151307,'2026 W1 · Sunday Main',12)}
FIC='https://www.fantasyinfocentral.com/nfl/dfs/projections/draftkings'
SHARK='https://sharksnip.com/picks/dfs/nfl'

def name_key(name):
    name=unicodedata.normalize('NFKD',name).encode('ascii','ignore').decode().lower()
    name=re.sub(r'\b(jr|sr|ii|iii|iv)\b\.?','',name)
    return re.sub('[^a-z0-9]','',name)

def get(url,filename):
    request=urllib.request.Request(url,headers={'User-Agent':'Bowser fantasy research/1.0'})
    with urllib.request.urlopen(request,timeout=30) as response:
        body=response.read(12_000_001)
    if len(body)>12_000_000:raise ValueError('Unexpectedly large source response')
    RAW.mkdir(parents=True,exist_ok=True);(RAW/filename).write_bytes(body)
    return body.decode('utf-8-sig')

class TableRows(HTMLParser):
    def __init__(self):super().__init__();self.rows=[];self.row=None;self.cell=None;self.team=None;self.teams=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='tr':self.row=[];self.team=None;self.teams=[]
        if tag=='td' and self.row is not None:self.cell=''
        if tag=='span' and self.row is not None:
            match=re.fullmatch(r'team (?:after )?([A-Z]{2,3})',attrs.get('class',''))
            if match:self.teams.append(match[1])
    def handle_data(self,data):
        if self.cell is not None:self.cell+=data
    def handle_endtag(self,tag):
        if tag=='td' and self.cell is not None:self.row.append(' '.join(self.cell.split()));self.cell=None
        if tag=='tr' and self.row:
            team=next((t for t in self.teams if len(self.row)>7 and t!=self.row[7]),None)
            self.rows.append((self.row,team));self.row=None

def projections(fic,shark):
    if 'Week 1 (2026)' not in fic:raise ValueError('FIC no longer reports 2026 Week 1')
    if '151307' not in shark or '9/13/2026' not in shark:raise ValueError('Shark Snip slate changed')
    result={}
    parser=TableRows();parser.feed(shark)
    for row,_ in parser.rows:
        if len(row)!=8 or row[5]=='—':continue
        result[(name_key(row[0]),row[1].replace('DST','DEF'),row[2])]=(float(row[5]),'Shark Snip',SHARK)
    parser=TableRows();parser.feed(fic)
    for row,team in parser.rows:
        if len(row)!=14 or not team:continue
        match=re.match(r'(.+), (QB|RB|WR|TE)(?:[A-Z ]*)$',row[0])
        if not match:raise ValueError('Unknown FIC player format')
        result[(name_key(match[1]),match[2],team)]=(float(row[4]),'Fantasy Info Central',FIC)
    if len(result)<250:raise ValueError('Projection coverage unexpectedly low')
    if any(not 0<=v[0]<=70 for v in result.values()):raise ValueError('Projection outside plausible range')
    return result

def identities(db):
    matches=defaultdict(set)
    for row in db.execute('SELECT player_id,full_name,position FROM team_roster WHERE season=2026 UNION SELECT player_id,display_name,position FROM players'):
        matches[(name_key(row[1]),row[2])].add(row[0])
    for row in csv.DictReader((ROOT/'data/raw/players.csv').open()):
        for name in [row['display_name'],' '.join([row['common_first_name'],row['last_name']])]:
            if row['gsis_id']:matches[(name_key(name),row['position'])].add(row['gsis_id'])
    return matches

def main():
    captured=datetime.now(timezone.utc).isoformat()
    groups=json.loads(get('https://api.draftkings.com/draftgroups/v1/','groups.json'))['draftGroups']
    proj=projections(get(FIC,'fic.html'),get(SHARK,'shark.html'))
    db=sqlite3.connect(f'file:{ROOT}/data/fantasy_football.sqlite?mode=ro',uri=True)
    matches=identities(db); existing={r[0] for r in db.execute('SELECT player_id FROM players')}
    slates={}
    for key,(group_id,label,game_count) in SLATES.items():
        group=next(g for g in groups if g['draftGroupId']==group_id)
        assert group['contestType']['contestTypeId']==21 and len(group['games'])==game_count
        assert all('2026-09-10'<=g['startDate']<'2026-09-16' for g in group['games'])
        url=f'https://www.draftkings.com/lineup/getavailableplayerscsv?draftGroupId={group_id}'
        salaries=list(csv.DictReader(get(url,f'dk-{group_id}.csv').splitlines()))
        assert len(salaries)>=game_count*40 and len({r['TeamAbbrev'] for r in salaries})==game_count*2
        names=defaultdict(set)
        for row in salaries:names[(name_key(row['Name']),row['Position'].replace('DST','DEF'))].add(row['ID'])
        records=[]
        for row in salaries:
            pos=row['Position'].replace('DST','DEF');key_name=(name_key(row['Name']),pos)
            candidates=matches.get(key_name,set());gsis=next(iter(candidates)) if len(candidates)==1 and len(names[key_name])==1 else None
            value=proj.get((*key_name,row['TeamAbbrev']))
            salary=int(row['Salary']);assert 2000<=salary<=15000
            records.append({'playerId':gsis,'name':row['Name'],'position':pos,'team':row['TeamAbbrev'],
                'draftKingsId':row['ID'],'salary':salary,'projection':value[0] if value else None,
                'projectionSource':value[1] if value else None,'projectionUrl':value[2] if value else None,
                'game':row['Game Info'],'status':row.get('Status') or None,
                'matchMethod':'unique nflverse name and position' if gsis else 'unmatched'})
        assert len({r['draftKingsId'] for r in records})==len(records)
        ids=[r['playerId'] for r in records if r['playerId']];assert len(set(ids))==len(ids)
        slates[key]={'id':group_id,'label':label,'season':2026,'week':1,'scoring':'DraftKings Classic',
            'salarySource':'DraftKings','salaryUrl':url,'capturedAt':captured,
            'startsAt':group['minStartTime'],'endsAt':group['maxStartTime'],'gameCount':game_count,
            'records':records,'coverage':{'salaryPlayers':len(records),'projectedPlayers':sum(r['projection'] is not None for r in records),
                'databasePlayersWithSalary':sum(r['playerId'] in existing for r in records),
                'databasePlayersWithProjection':sum(r['playerId'] in existing and r['projection'] is not None for r in records)}}
    snapshot={'schemaVersion':1,'capturedAt':captured,'defaultSlate':'week1','slates':slates,
        'notes':'Pregame projections, not historical averages. FIC primary; Shark Snip supplements missing main-slate projections. No projection is inferred from DraftKings AvgPointsPerGame. Prices are Classic, not Showdown Captain.',
        'sourceHashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in RAW.iterdir() if p.name in ['groups.json','fic.html','shark.html','dk-153054.csv','dk-151307.csv']}}
    target=ROOT/'data/dfs-week1-2026.json';temp=target.with_suffix('.tmp');temp.write_text(json.dumps(snapshot,indent=2)+'\n');temp.replace(target)
    print(json.dumps({key:slate['coverage'] for key,slate in slates.items()},indent=2))

if __name__=='__main__':main()
