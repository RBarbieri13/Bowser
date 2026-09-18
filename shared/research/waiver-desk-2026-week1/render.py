"""Render the portable desk and Markdown source table from the saved report JSON."""
from pathlib import Path
import json
P=Path(__file__).resolve().parent
d=json.loads((P/'waiver-desk-data.json').read_text())
html=(P/'desk-template.html').read_text().replace('__DATA__',json.dumps(d,ensure_ascii=False).replace('<','\\u003c'))
(P/'week1-waiver-desk.html').write_text(html)
def bid(b):
    if not b:return '—'
    a=b['low'];z=b['high']
    v=f'≥{a}' if b.get('operator')=='at-least' else f'≤{z}' if b.get('operator')=='at-most' else str(a) if a==z else f'{a}–{z}'
    return ('$'+v if b['unit']=='dollars' else v+'%')+' '+{'annual':'A','remaining':'R','unspecified':'?'}[b['budgetBasis']]
ids=['fantasypros','rotoballer','footballguys','rotowire','cbs','draftsharks','ftn','fantasylife','moves']
lines=['# 2026 Week 1 → Week 2 waiver desk','','First waiver run after Week 1, for Week 2. Snapshot dated September 15–16, 2026. General 10–12-team PPR / 1-QB context; league availability and budgets are not assumed.','','86 players · 5 ranking publishers · 8 expert FAAB publishers · 1 separate community column.','','A = starting budget; R = remaining budget; ? = unspecified. FP dollar figures use a $100 reference. Do not average across different bases. Blank cells are unverified, not zero.','','[Open interactive desk](week1-waiver-desk.html) · [Full CSV](week1-waiver-table.csv) · [Structured data](waiver-desk-data.json)','','The desk has separate league workspaces, editable budgets, local target lists and notes, multi-sort, position and ownership filters, source links, all bid tiers, and Week 1 statistics.']
for pos in ['QB','RB','WR','TE']:
    lines+=['',f'## {pos} — all verified targets','','Desk order is original synthesis for highlighted players, not publisher consensus. Ranks are within each publisher’s candidate list.','','| Player | Desk # | FP/RB/CBS/DS/NFL pos. priorities | FP $100 | RB | FG | RW | CBS | DS | FTN | FL 1QB | Community | Snap % | ATT / rush / tgt | PPR |','|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    rows=sorted([p for p in d['rows'] if p['position']==pos],key=lambda p:(p['deskPriority'] or 999,-p['expertCount'],p['name']))
    for p in rows:
        st=p['stats'];rank='/'.join(str(p['rankings'].get(s,{}).get('rank','—')) for s in ['fantasypros','rotoballer','cbs','draftsharks','nfl'])
        vals=[p['name']+' ('+p['team']+')',str(p['deskPriority'] or '—'),rank]+[bid(p['faab'].get(s)) for s in ids]+[str(st['snap_pct']) if st['snap_pct'] is not None else '—',' / '.join(str(st[k]) if st[k] is not None else '—' for k in ['passing_attempts','carries','targets']),str(st['fantasy_points']) if st['fantasy_points'] is not None else '—']
        lines.append('| '+' | '.join(vals)+' |')
    lines+=['','### Decision notes','']
    for p in rows:
        if p['deskPriority'] is not None:
            a=p['analysis'];links=', '.join('['+next(s['label'] for s in d['meta']['sources'] if s['id']==sid)+']('+next(s.get('faabUrl') or s.get('rankUrl') for s in d['meta']['sources'] if s['id']==sid)+')' for sid in a['sources'])
            lines.append(f"- **{p['name']} — {a['role']}.** {a['case']} {a['risk']} Sources: {links}.")
lines+=['','## Source register','','| Publisher | Rank cells | Bid cells | Coverage |','|---|---:|---:|---|']
for s in d['meta']['sources']:
    url=s.get('faabUrl') or s.get('rankUrl');lines.append(f"| [{s['label']}]({url}) | {s['rankCount']} | {s['faabCount']} | {s.get('coverageNote','Public verified numerical bids.')} |")
lines+=['','## Interpretation and limitations','']+['- '+x for x in d['meta']['methodology']]
(P/'README.md').write_text('\n'.join(lines)+'\n')
print('Rendered',P/'week1-waiver-desk.html',len(html),'characters')
