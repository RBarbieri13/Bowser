"""Publish only reviewed public research files and a validated additive bid supplement."""
from pathlib import Path
import hashlib, html, json, shutil

ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'shared/research/waiver-desk-2026-week1'
OUT=ROOT/'public/research/waiver-desk-2026-week1'
OUT.mkdir(parents=True,exist_ok=True)
report=json.loads((REPORT/'waiver-desk-data.json').read_text())
ids={'ftn','fantasylife','moves'}
sources=[s for s in report['meta']['sources'] if s['id'] in ids]
players=[]
for p in report['rows']:
    bids={k:v for k,v in p['faab'].items() if k in ids}
    if not bids:continue
    if p.get('formatBids'):
        bids['fantasylife']['alternatives']=[{k:v for k,v in b.items() if k in ['low','high','unit','budgetBasis']}|{'tier':b['format']} for b in p['formatBids']]
    players.append({k:p[k] for k in ['id','name','position']}|{'faab':bids})
for source in sources:
    facts=[p for p in players if source['id'] in p['faab']]
    digest=hashlib.sha256(json.dumps(facts,sort_keys=True).encode()).hexdigest()
    source['evidence']=[{'url':source['faabUrl'],'sha256':digest,'kind':'structured public facts recorded in research desk','datePublished':source['publishedAt']}]
supplement={'season':2026,'waiverWeek':2,'recordedAt':report['meta']['createdAt'],'sources':sources,'players':players}
(ROOT/'data/waivers-supplement-2026-week2.json').write_text(json.dumps(supplement,indent=2,ensure_ascii=False)+'\n')
for name in ['week1-waiver-desk.html','week1-waiver-table.csv','waiver-desk-data.json','README.md','data-verification.json','browser-verification.json','top10-consensus-estimates.json']:
    shutil.copy2(REPORT/name,OUT/name)
est=json.loads((REPORT/'top10-consensus-estimates.json').read_text())
sections=[]
for pos,rows in est['positions'].items():
    items=[]
    for row in rows:
        value=f"{row['estimatedPercent']}%" if row['estimatedPercent'] is not None else 'No verified numeric estimate'
        if row['status']=='ceiling only':
            b=next(iter(row['sourceBids'].values()));value=f"Up to {b['high']}% of remaining FAAB"
        lines=[]
        for sid,b in row['sourceBids'].items():
            label=next(s['label'] for s in report['meta']['sources'] if s['id']==sid)
            v=f"≥{b['low']}" if b.get('operator')=='at-least' else f"≤{b['high']}" if b.get('operator')=='at-most' else str(b['low']) if b['low']==b['high'] else f"{b['low']}–{b['high']}"
            lines.append(f"{label}: {'$' if b['unit']=='dollars' else ''}{v}{'%' if b['unit']=='percent' else ' / $100'} ({b['budgetBasis']})")
        items.append(f"<li><b>{html.escape(row['name'])} · {row['team']}</b><strong>{value}</strong><small>{row['finitePublisherCount']} comparable publishers · {html.escape(row['status'])}</small><details><summary>Underlying bids</summary>{'<br>'.join(html.escape(x) for x in lines) or 'No verified FAAB figure.'}</details></li>")
    sections.append(f"<section><h2>{pos}</h2><ol>{''.join(items)}</ol></section>")
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Bowser · Top 10 FAAB estimates by position</title><style>body{background:#0b141c;color:#e3edf4;font:14px/1.5 system-ui;margin:0;padding:28px}main{max-width:1500px;margin:auto}a{color:#72dfca}h1{font-size:28px;margin-bottom:4px}p{color:#adbfca;max-width:1150px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px}h2{color:#72dfca;border-bottom:1px solid #344652}ol{padding-left:22px}li{padding:10px 5px;border-bottom:1px solid #263640}li strong,li small{display:block}li strong{color:#e8c987;font:700 18px ui-monospace}small,details{font-size:11px;color:#b5c6d2}summary{cursor:pointer}footer{margin-top:25px;font-size:12px} @media(max-width:1000px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.grid{grid-template-columns:1fr}}</style><main><a href="week1-waiver-desk.html">← Full waiver research desk</a><h1>Top 10 FAAB estimates by position</h1><p>After 2026 Week 1 → Week 2. General 10–12-team PPR, 1-QB. Priority order is the desk author's synthesis. Figures are calculated reference estimates; one source is not consensus. The source snapshot is dated September 15–16.</p><p>Dollar illustration: 1% = $1 per $100 or $2 per $200. Starting and remaining budgets are assumed equal and untouched. Unspecified source bases are treated as full-budget references for this calculation. Emmett Johnson and Deebo Samuel have sharply split source recommendations; inspect their underlying bids.</p><div class="grid">'''+''.join(sections)+'''</div><footer><h2>Calculation and limits</h2><ul>'''+''.join('<li>'+html.escape(m)+'</li>' for m in est['method'])+'''</ul></footer></main></html>'''
(OUT/'top10-faab.html').write_text(page)
desk=(OUT/'week1-waiver-desk.html').read_text().replace('Data files: <a','<a href="top10-faab.html">Top 10 FAAB estimates by position</a> · Data files: <a')
(OUT/'week1-waiver-desk.html').write_text(desk)
print(json.dumps({'players':len(players),'additionalBidSources':len(sources),'publishedFiles':sorted(p.name for p in OUT.iterdir())}))
