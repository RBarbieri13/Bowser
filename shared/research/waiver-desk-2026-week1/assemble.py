"""Build a dated, offline waiver research artifact from verified public facts.

Run from this directory. Raw publisher captures live in ignored artifacts/.
This report does not mutate Bowser's released importer or database.
"""
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter, defaultdict
import csv, hashlib, importlib.util, json

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
RAW = ROOT / 'artifacts/waiver-desk-sources'
spec = importlib.util.spec_from_file_location('waivers', ROOT / 'scripts/import_waivers.py')
w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)
market = json.loads((HERE / 'market-and-stats.json').read_text())
rows = [p for p in market['rows'] if p['position'] in {'QB','RB','WR','TE'}]
sources = market['meta']['sources']
fresh = json.loads((RAW / 'fresh-parsed-facts.json').read_text())
byname = {(w.name_key(p['name']), p['position']): p for p in rows}
byname[w.name_key('Christopher Brooks'),'RB'] = next(p for p in rows if p['name']=='Chris Brooks')
manifest = json.loads((RAW / 'capture-manifest.json').read_text())
for m in manifest:
    m['capturedAt'] = datetime.fromtimestamp((RAW/(m['id']+'.html')).stat().st_mtime, timezone.utc).isoformat()
    m['captureTimeMethod'] = 'archive file modification time from this fetch session'
for p in rows:
    p['rankings']={}; p['faab']={}
for kind in ['rankings','faab']:
    for sid, facts in fresh[kind].items():
        for f in facts:
            if f['position'] not in {'QB','RB','WR','TE'}: continue
            p = byname[w.name_key(f['name']),f['position']]
            p[kind][sid] = ({k:f[k] for k in ['rank','overallRank','method'] if k in f} | {'scope':'position'}) if kind=='rankings' else f['bid']
for s in sources:
    evidence=[m for m in manifest if m['id'].startswith(s['id'])]
    s['capturedAt']=max(m['capturedAt'] for m in evidence)
    s['evidence']=[{**m, **w.publication_dates((RAW/(m['id']+'.html')).read_text())} for m in evidence]
    if s['id']=='fantasypros': s['publishedAt']='2026-09-16'; s['coverageNote'] += ' Fresh public preview dateline: September 16 UTC; article remains September 15.'
    s['type']='expert'

# Only visible public previews are used. No content behind access gates is imported.
FTN='https://ftnfantasy.com/fantasy-football-waiver-wire-claims-to-make-heading-into-week-2'
FL='https://www.fantasylife.com/articles/fantasy/waiver-wire-pickups-faab-advice-week-2-add-jalen-coker'
MOVES='https://www.reddit.com/r/fantasyfootball/comments/1wh5wf4/10_players_to_add_for_week_2_faab_recs/'
CAPTURE=datetime.now(timezone.utc).isoformat()
sources += [
 {'id':'ftn','label':'FTN','type':'expert','faabUrl':FTN,'publishedAt':'2026-09-15','capturedAt':CAPTURE,'coverageNote':'Daniel Kelley public five-player article, citing the FTN waiver tool. Budget basis unspecified. Heading order is not imported as a ranking.'},
 {'id':'fantasylife','label':'Fantasy Life','type':'expert','faabUrl':FL,'publishedAt':'2026-09-15','capturedAt':next(m['capturedAt'] for m in manifest if m['id']=='fantasylife0'),'coverageNote':'Alex Cupps public Tyler Shough preview only. Main column is 10–12-team 1-QB; superflex and larger-league values remain separate. No gated player data imported.'},
 {'id':'moves','label':'MOVES community','type':'community','faabUrl':MOVES,'publishedAt':'2026-09-15','capturedAt':CAPTURE,'coverageNote':'u/movesfantasy public write-up. Author reports ranges based on FAABLab; not an independently accessed FAABLab feed or an expert consensus. Advanced usage is third-party reported.'},
]
for s in sources[-3:]:
    if s['id'] in ['ftn','moves']:
        s['recordedAt']=s.pop('capturedAt')
        s['captureNote']='Public web tool inspected during the September 16 UTC report session; exact fetch time not exposed. recordedAt is the local fact-recording time.'
def player(name):
    found=[p for p in rows if w.name_key(p['name'])==w.name_key(name)]
    assert len(found)==1, name
    return found[0]
def add_bid(name,sid,lo,hi=None,**extra):
    player(name)['faab'][sid]={'low':lo,'high':lo if hi is None else hi,'unit':'percent','budgetBasis':'unspecified',**extra}
for name,lo,hi,yahoo,espn in [
 ('Jalen Coker',10,20,61,51),('Kaelon Black',5,10,26,15),('Woody Marks',5,10,49,59),('Tyler Shough',5,10,40,47),('Caleb Douglas',5,10,12,16)]:
    add_bid(name,'ftn',lo,hi)
    player(name)['articleOwnership']={'yahoo':yahoo,'espn':espn,'source':'ftn','publishedAt':'2026-09-15'}
add_bid('Tyler Shough','fantasylife',17.5,tier='10–12 teams / 1-QB')
player('Tyler Shough')['formatBids']=[{'format':f,'low':v,'high':v,'unit':'percent','budgetBasis':'unspecified','source':'fantasylife'} for f,v in [('10–12 teams / superflex',60),('14–16 teams / 1-QB',20),('14–16 teams / superflex',75),('Guillotine / 1-QB',12.5),('Guillotine / superflex',17.5)]]
community=[('Devaughn Vele',10,15,8),('Caleb Douglas',7,10,12),('Antonio Williams',5,6,2),('Kalif Raymond',5,6,1),('Denzel Boston',4,6,28),('Pat Bryant',3,5,8),('Kenyon Sadiq',4,6,14),('Mike Gesicki',3,5,2),('Kaelon Black',9,11,27),('Emmett Johnson',4,6,20)]
for name,lo,hi,yahoo in community:
    add_bid(name,'moves',lo,hi)
    player(name)['communityOwnership']={'yahoo':yahoo,'source':'moves','publishedAt':'2026-09-15'}
advanced={
 'Devaughn Vele':{'routeShare':87.3,'reportedTargetShare':16.1},
 'Caleb Douglas':{'reportedTargetShare':22.2,'yprr':2.94},
 'Antonio Williams':{'routes':11,'routeShare':28.9,'yprr':5.82},
 'Kalif Raymond':{'yprr':3.82},'Denzel Boston':{'routeShare':90},
 'Pat Bryant':{'routeShare':63.6,'reportedTargetShare':22.2},
 'Kenyon Sadiq':{'routeShare':46.2},'Mike Gesicki':{'routeShare':45.9},
}
for name,values in advanced.items():player(name)['advanced']={**values,'source':'moves'}

# FantasyPros' numeric expert distribution is visible only for its top-five preview.
fp=w.Page((RAW/'fantasypros0.html').read_text())
assert 'Overall Waiver Wire Rankings - Sep 16, 2026' in ' '.join(fp.lines)
assert 'Week 2' in ' '.join(n.text() for n in fp.root.all('title'))
for table in fp.tables():
    if table and table[0][:2]==['Rank','Player (Team)']:
        for cells in table[1:]:
            if len(cells)<6 or not cells[0].isdigit():continue
            name=cells[1].split(' (')[0]
            if '(K ' in cells[1]:continue
            player(name)['fpConsensus']={'overall':int(cells[0]),'best':int(cells[2]),'worst':int(cells[3]),'mean':float(cells[4]),'stdDev':float(cells[5]),'expertDirectoryCount':11,'note':'Public preview overall expert ranks, not within-position ranks. Directory has 11 experts; per-player participation not disclosed.'}

# Original synthesis, dated to the source captures. These are not publisher ranks.
shortlists={
 'QB':['Tyler Shough','Bryce Young','C.J. Stroud','Malik Willis','Jacoby Brissett','Geno Smith'],
 'RB':['Kaelon Black','Tyler Allgeier','Woody Marks','Emmett Johnson','Kendre Miller','Tyjae Spears','Devin Singletary','Chris Brooks'],
 'WR':['Jalen Coker','Deebo Samuel Sr.','Devaughn Vele','Caleb Douglas','Dontayvion Wicks','Denzel Boston','Pat Bryant','Antonio Williams','Kalif Raymond','Tre Harris','Adonai Mitchell','Rashod Bateman'],
 'TE':['Dalton Schultz','Michael Mayer','Pat Freiermuth','Brenton Strange','Kenyon Sadiq','Mike Gesicki','Terrance Ferguson'],
}
# role, reason, risk, cited publisher(s). Short paraphrases retain uncertainty.
notes={
 'Tyler Shough':('Stream / upside','Passing ceiling merits a starting-QB audition.','Overtime inflated volume; superflex prices belong in a separate market.',['fantasypros','fantasylife']),
 'Bryce Young':('Stream','Strong opener; economical bids across several publishers.','One explosive matchup does not establish a weekly ceiling.',['fantasypros','draftsharks']),
 'C.J. Stroud':('Stream','Low published bids make him a viable short-term option.','Check availability before spending on a second quarterback.',['fantasypros','cbs']),
 'Malik Willis':('Stream / rushing','Rushing adds a second path to fantasy production.','Young receiving group and passing volatility.',['fantasypros']),
 'Jacoby Brissett':('Stream','CBS ranks him first among its available quarterback candidates.','Source eligibility differs; this is not an overall QB1 projection.',['cbs']),
 'Geno Smith':('Stream','Efficient opener offers a low-cost alternative.','Limited touchdown production in Week 1.',['fantasypros','rotowire']),
 'Carson Wentz':('Conditional QB','Potential temporary starter; useful chiefly when the job is confirmed.','Verify starter status before bidding; superflex scarcity differs.',['cbs','draftsharks']),
 'Drew Lock':('Conditional QB','Short-term quarterback depth if he starts again.','Verify starter status; no 1-QB bid inferred from superflex advice.',['cbs','rotowire']),
 'Michael Penix Jr.':('Monitor','Source-listed future quarterback option.','No matched Week 1 statistical row; do not assume immediate availability.',['fantasypros','cbs']),
 'Kaelon Black':('Priority handcuff','Meaningful Week 1 workload plus valuable injury-contingent upside.','McCaffrey remains central; a permanent equal split is unproven.',['ftn','draftsharks']),
 'Tyler Allgeier':('Workload add','Seventeen carries offer tangible immediate workload.','Receiving ceiling and touchdown dependence limit upside.',['nfl','cbs']),
 'Woody Marks':('PPR depth','FTN values his passing-down role.','Montgomery owns the stronger goal-line case.',['ftn']),
 'Emmett Johnson':('Upside stash','Receiving flashes support a valuable Walker handcuff.','Limited standalone work; DraftSharks is much more aggressive than RotoBaller.',['draftsharks','moves']),
 'Kendre Miller':('Conditional depth','Shared early-down carries create a modest short-term opening.','Kamara availability could reduce the role; no Week 1 targets.',['draftsharks','nfl']),
 'Tyjae Spears':('PPR stash','Passing-down usage offers a path beyond his carry count.','Weak offense and split workload cap the immediate floor.',['fantasypros']),
 'Devin Singletary':('Cheap depth','Four targets supplement a small rushing workload.','Touchdown-driven opener; modest published bids.',['rotoballer','cbs']),
 'Chris Brooks':('Conditional depth','More than half the offensive snaps in the opener.','Monitor the backfield; volume did not create an efficient box score.',['rotowire','cbs']),
 'Jalen Coker':('Priority if free','Strong targets and production; FTN recommends a meaningful bid.','Already widely rostered; opener benefited from the matchup.',['ftn','nfl']),
 'Deebo Samuel Sr.':('Priority if free','Public FantasyPros preview places him first overall.','Footballguys is substantially more aggressive than FantasyPros.',['fantasypros','footballguys']),
 'Devaughn Vele':('Immediate WR depth','Near-full snap participation supports the breakout attention.','New Orleans passing volume was unusually high; role depends on competition.',['fantasypros','moves']),
 'Caleb Douglas':('Role / upside','Near-full playing time makes the rookie more than a box-score chase.','Passing environment may cap weekly consistency.',['ftn','moves']),
 'Dontayvion Wicks':('Upside stash','Substantial playing time supports a speculative add.','Four targets and a long touchdown are a volatile foundation.',['fantasypros']),
 'Denzel Boston':('Upside stash','High route participation offers a runway for a rookie.','Passing offense and only four targets restrain the immediate floor.',['moves']),
 'Pat Bryant':('PPR stash','Six targets provide a useful early involvement signal.','Partial route participation; needs sustained volume.',['moves','draftsharks']),
 'Antonio Williams':('Upside stash','Productive on limited routes.','Low route share makes the efficiency difficult to repeat.',['moves']),
 'Kalif Raymond':('Cheap PPR depth','Nine targets warrant attention for a short-term floor.','Large expert bid disagreement; stronger teammates can reclaim volume.',['moves','footballguys']),
 'Tre Harris':('Role stash','Playing time and six targets matter more than five PPR points.','Needs improved conversion before an easy lineup decision.',['cbs','draftsharks']),
 'Adonai Mitchell':('Upside stash','Useful yardage on a small target sample.','Three targets do not establish a dependable floor.',['fantasypros']),
 'Rashod Bateman':('Conditional WR','Could benefit from receiver absences.','Verify active teammates; one target in the opener.',['fantasypros','cbs']),
 'Dalton Schultz':('TE stream','Eight targets offer a plausible floor at a thin position.','Modest yardage; CBS and FantasyPros price him differently.',['fantasypros','cbs']),
 'Michael Mayer':('Conditional TE','Strong snaps and targets while Bowers was absent.','Bowers status is decisive; check it before a starter-level bid.',['nfl','draftsharks']),
 'Pat Freiermuth':('TE depth / stream','Improved playing time supports renewed interest.','Modest target share; Footballguys is much more bullish than RotoWire.',['draftsharks','footballguys']),
 'Brenton Strange':('TE stream','Low-dollar alternative with a usable Week 1 line.','Three targets leave touchdown and efficiency risk.',['fantasypros','cbs']),
 'Kenyon Sadiq':('Upside stash','Athletic rookie offers room for role growth.','Limited routes; rushing touchdown boosted the opener.',['moves']),
 'Mike Gesicki':('Volatile TE stream','Seven targets delivered a productive opener.','Limited routes and elite teammates create regression risk.',['moves']),
 'Terrance Ferguson':('Upside stash','Source-listed developmental tight-end option.','One target and no receptions; immediate floor is low.',['fantasypros','cbs']),
}
schedules=json.loads((RAW/'schedules.json').read_text())
allstats=json.loads((RAW/'player-stats.json').read_text())['data']
statsbyid={p['player_id']:p for p in allstats}
teamtotals=defaultdict(lambda:Counter())
for p in allstats:
    for k in ['targets','carries']:
        if p.get(k) is not None:teamtotals[p['team']][k]+=p[k]
for p in rows:
    name=p['name']; st=p['stats']; a=statsbyid.get(p['playerId'],{})
    p['deskPriority']=shortlists[p['position']].index(name)+1 if name in shortlists[p['position']] else None
    role,why,risk,refs=notes.get(name,('Source-listed depth','Compare the published priorities with the recorded Week 1 role.','No independent priority assigned; confirm fit and availability.',list(p['rankings'])[:2] or list(p['faab'])[:2]))
    p['analysis']={'role':role,'case':why,'risk':risk,'sources':refs,'type':'original synthesis / 10–12-team PPR, 1-QB; not a league-specific recommendation'}
    p['expertCount']=len((set(p['rankings'])|set(p['faab']))-{'moves'})
    p['rankCount']=len(p['rankings']);p['expertBidCount']=len(set(p['faab'])-{'moves'})
    p['nextGames']=[g for g in schedules.get(p['team'],[]) if g['week'] in [2,3,4]]
    p['gameUrl']=a.get('upcoming_game_url')
    p['depthRank']=a.get('current_depth_rank');p['depthUpdatedAt']=a.get('current_depth_updated_at')
    p['derived']={}
    if p['statsMatched']:
        for key,num,den in [('targetShare',st['targets'],teamtotals[p['team']]['targets']),('carryShare',st['carries'],teamtotals[p['team']]['carries']),('yardsPerCarry',st['rushing_yards'],st['carries']),('yardsPerTarget',st['receiving_yards'],st['targets']),('catchPct',st['receptions']*100,st['targets'])]:
            p['derived'][key]=round(num/den*(100 if key in ['targetShare','carryShare'] else 1),2) if den else None
        p['derived']['touches']=st['carries']+st['receptions']
        p['derived']['opportunities']=st['carries']+st['targets']
        p['derived']['halfPpr']=round(st['fantasy_points']-.5*st['receptions'],2)
        p['derived']['standard']=round(st['fantasy_points']-st['receptions'],2)
    p['flags']=[]
    if name in ['Emmett Johnson','Kalif Raymond','Deebo Samuel Sr.','Pat Freiermuth','Kaelon Black','Devaughn Vele']:p['flags'].append('Bid disagreement')
    if name in ['Michael Mayer','Carson Wentz','Drew Lock','Rashod Bateman','Kendre Miller','Michael Penix Jr.']:p['flags'].append('Status sensitive')
    if name=='Tyler Shough':p['flags'].append('1-QB ≠ superflex')
    if name=='Caleb Douglas':p['flags'].append('Target-share definitions differ')
    if not p['statsMatched']:p['flags'].append('No matched Week 1 stats')
for s in sources:
    s['rankCount']=sum(s['id'] in p['rankings'] for p in rows)
    s['faabCount']=sum(s['id'] in p['faab'] for p in rows)
    s['scoring']=s.get('scoring','unspecified')

data={'meta':{'title':'2026 Week 1 → Week 2 Waiver Desk','createdAt':datetime.now(timezone.utc).isoformat(),'season':2026,'statsWeek':1,'waiverWeek':2,'interpretation':'First waiver run after 2026 Week 1, acquiring players for Week 2.','analysisContext':'General 10–12-team PPR, 1-QB redraft; no private league roster or budget is assumed.','activity':market['meta']['activity'],'positions':dict(Counter(p['position'] for p in rows)),'statsMatched':sum(p['statsMatched'] for p in rows),'sources':sources,'statsSource':'Bowser 2026 nflverse weekly player statistics and schedule snapshot','statsUrl':'https://github.com/nflverse/nflverse-data/releases/tag/player_stats','scheduleUrl':'https://github.com/nflverse/nflverse-data/releases/tag/schedules','methodology':[
 'Missing means unverified or unavailable, not zero. Zero is displayed only when present in the underlying feed.',
 'Source columns preserve explicit priority order. For overall lists, positional ranks are ordinals within that publisher list, not league-wide position rankings. FantasyPros has only a public top-five preview.',
 'Desk priority is original, format-specific synthesis among highlighted targets. It is not expert consensus. Default order uses distinct expert coverage, not an invented average.',
 'A = annual/starting FAAB; R = remaining FAAB; ? = publisher did not specify. FP dollars are quoted against a $100 reference. Unspecified bases are never silently converted to annual or remaining.',
 'Dollar illustrations use editable budgets and remain unrounded arithmetic. League bid increments and actual competition determine executable bids. No winning-bid probability is claimed.',
 'Sleeper trending counts are a captured 24-hour provider feed, not unique managers, transactions in your league, or a bid forecast. Missing add/drop sides do not become zero or produce a net.',
 'ESPN current ownership and article-reported Yahoo ownership are different platforms and capture times. Neither establishes availability in your league.',
 'Target share is player targets / all recorded team player targets. Carry share is player carries / all recorded team player carries, including QB carries. These can differ from publisher definitions.',
 'Week 1 alone cannot establish a multi-week trend. Trend cells show the one observed value; no change percentage is invented.',
 'Fantasy Life superflex values are separate from the main 1-QB field. Premium previews are imported only where publicly visible.',
 'MOVES is a separately labeled community source. Reported route/YPRR figures are not an independently licensed underlying data feed.',
 'Yahoo Justin Boone article was rate-limited and community consensus spreadsheet cells could not be verified. Neither contributes numerical data.',
 'This is a dated research snapshot, not a live updating service. Confirm injury and starter status before waivers process.'
 ]},'rows':rows}
assert len(rows)==86 and len({p['id'] for p in rows})==86
assert sum(s['rankCount']>0 for s in sources)==5
assert sum(s['faabCount']>0 and s['type']=='expert' for s in sources)==8
assert player('Tyler Shough')['faab']['fantasylife']['low']==17.5
assert player('Kaelon Black')['faab']['cbs']['operator']=='at-least'
assert player('Kalif Raymond')['faab']['footballguys']['low']==20
for p in rows:
    if p['activity']['adds'] is None or p['activity']['drops'] is None: assert p['activity']['net'] is None
    for b in p['faab'].values(): assert b['low']>=0 and (b['high'] is None or b['high']>=b['low'])
(HERE/'waiver-desk-data.json').write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
(HERE/'source-capture-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
def fmt(b):
    if not b:return ''
    val=f">={b['low']}" if b.get('operator')=='at-least' else f"<={b['high']}" if b.get('operator')=='at-most' else str(b['low']) if b['low']==b['high'] else f"{b['low']}-{b['high']}"
    return ('$'+val+' / $100' if b['unit']=='dollars' else val+'%')+' '+{'annual':'starting','remaining':'remaining','unspecified':'basis unspecified'}[b['budgetBasis']]
flat=[]
for p in rows:
    f={'Name':p['name'],'Position':p['position'],'Team':p['team'],'Desk positional priority (synthesis)':p['deskPriority'],'Role':p['analysis']['role'],'Expert publishers':p['expertCount'],'ESPN roster %':p['activity']['rosterPct'],'Sleeper adds 24h':p['activity']['adds'],'Sleeper drops 24h':p['activity']['drops'],'Sleeper net 24h':p['activity']['net']}
    for s in sources:
        if s['rankCount']:f[s['label']+' position priority']=p['rankings'].get(s['id'],{}).get('rank');f[s['label']+' original overall priority']=p['rankings'].get(s['id'],{}).get('overallRank')
        if s['faabCount']:
            b=p['faab'].get(s['id']);f[s['label']+' FAAB']=fmt(b);f[s['label']+' FAAB low']=b.get('low') if b else None;f[s['label']+' FAAB high']=b.get('high') if b else None;f[s['label']+' FAAB basis']=b.get('budgetBasis') if b else None;f[s['label']+' source']=s.get('faabUrl') if b else None
    for k,v in p['stats'].items():
        if k!='trends':f['W1 '+k]=v
    for k,v in p['derived'].items():f['Derived '+k]=v
    f['Case']=p['analysis']['case'];f['Risk']=p['analysis']['risk'];f['Flags']='; '.join(p['flags']);f['Format-specific FAAB']=json.dumps(p.get('formatBids',[]),ensure_ascii=False)
    flat.append(f)
fields=list(dict.fromkeys(k for f in flat for k in f))
with (HERE/'week1-waiver-table.csv').open('w',newline='') as out:
    writer=csv.DictWriter(out,fieldnames=fields);writer.writeheader();writer.writerows(flat)
report={'status':'PASS','players':len(rows),'positions':data['meta']['positions'],'statsMatched':data['meta']['statsMatched'],'rankSources':5,'expertFaabSources':8,'communityFaabSources':1,'rankingCells':sum(s['rankCount'] for s in sources),'expertFaabCells':sum(s['faabCount'] for s in sources if s['type']=='expert'),'communityFaabCells':10,'checks':['86 unique offensive players','5 actual rank publishers','8 actual expert FAAB publishers','community separate','open-ended bid operators preserved','1-QB and superflex separate','unknown add/drop sides remain null','source budgets preserved']}
(HERE/'data-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
