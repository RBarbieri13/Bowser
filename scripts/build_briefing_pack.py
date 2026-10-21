#!/usr/bin/env python3
"""Convert verified private report inputs to a browser-only Bowser pack. Never publishes."""
import argparse
import html
import json
import os
import re
import sqlite3
from pathlib import Path


def plain(value):
    value = re.sub(r'<br\s*/?>', '\n', str(value), flags=re.I)
    return html.unescape(re.sub(r'<[^>]+>', '', value))


def paragraph(text):
    return {'kind': 'paragraph', 'text': plain(text)}


def table(headers, rows):
    return {'kind': 'table', 'headers': headers, 'rows': [[plain(x) if x is not None else '—' for x in row] for row in rows]}


def waiver(data):
    sections = []
    for i, page in enumerate(data['pages']):
        blocks = [{k: v for k, v in b.items() if k in ('kind', 'text', 'headers', 'rows')} for b in page]
        for b in blocks:
            if 'text' in b:
                b['text'] = plain(b['text'])
            if b['kind'] == 'table':
                b['rows'] = [[plain(c) for c in r] for r in b['rows']]
        title = next((b['text'] for b in blocks if b['kind'] == 'title'), f'Section {i+1}')
        sections.append({'id': f'waiver-{i}', 'title': title, 'league': data['plans'][(i-1)//2]['key'] if 1 <= i <= 6 else '', 'blocks': [b for b in blocks if b['kind'] != 'title']})
    sources = list(data['sources'])
    known = {x['url'] for x in sources}
    for page in data['pages']:
        for block in page:
            raw = str(block.get('text', '')).replace('\\"', '"')
            for url, label in re.findall(r'<link href="([^"]+)"[^>]*>(.*?)</link>', raw):
                url = html.unescape(url)
                if url not in known:
                    sources.append({'name': plain(label), 'url': url, 'date': data['date']})
                    known.add(url)
    return {'id': f"waiver-{data['date']}", 'type': 'waiver', 'date': data['date'], 'season': data['season'], 'week': data['week'], 'title': data['title'], 'context': data['source_context'], 'sections': sections, 'sources': sources}


def daily(data):
    blocks = [paragraph(data.get('availability_note', '')), paragraph(data.get('deadline_note', ''))]
    sections = [{'id': 'daily-overview', 'title': 'Daily action desk', 'league': '', 'blocks': blocks}]
    sources = [{'name': s[0], 'url': s[1], 'date': data['date']} for s in data.get('sources', [])]
    for league in data['leagues']:
        blocks = [paragraph(f"{league['team']} · {league['record']} · ${league['faab']} remaining"), {'kind': 'heading', 'text': league['action_title']}]
        blocks += [paragraph(a) for a in league['actions']]
        # Typed matrix preserves all 28 slots / 84 alternative cells and numeric signals.
        blocks += [{'kind': 'comparison', 'rows': league['rows']}, paragraph(league.get('table_note', ''))]
        sections.append({'id': f"daily-{league['key']}", 'title': league['full_name'], 'league': league['key'], 'blocks': blocks})
    sections.append({'id': 'daily-news', 'title': 'Incremental news & situations to monitor', 'league': '', 'blocks': [paragraph(data.get('news_window', ''))] + [{'kind': 'news', 'text': n[0], 'url': n[1], 'date': n[2]} for n in data.get('news', [])] + [{'kind': 'heading', 'text': 'Situations to monitor'}] + [paragraph(x) for x in data.get('monitor', [])]})
    blocks = []
    for label, rows in data.get('markets', []):
        blocks += [{'kind': 'heading', 'text': label}, table(['Player', 'Position', 'Source count'], rows)]
    blocks += [paragraph('Sleeper top-list activity; source counts are not unique managers or league availability.')]
    sections.append({'id': 'daily-market', 'title': 'Market adds & drops', 'league': '', 'blocks': blocks})
    sections.append({'id': 'daily-method', 'title': 'Methods & source limits', 'league': '', 'blocks': [paragraph(data.get('methods', ''))]})
    return {'id': f"daily-{data['date']}", 'type': 'daily', 'date': data['date'], 'season': data['season'], 'week': data['week'], 'title': 'Bowser Daily Fantasy Briefing', 'context': f"{data.get('captured', '')} · Alternatives: {data.get('options_captured', '')}. Dated snapshot, not live availability.", 'sections': sections, 'sources': sources}


def build(waiver_data=None, daily_data=None, warehouse=None):
    reports = ([waiver(waiver_data)] if waiver_data else []) + ([daily(daily_data)] if daily_data else [])
    if not reports:
        raise ValueError('Supply at least one verified report input')
    content = json.dumps(reports, ensure_ascii=False)
    players = []
    candidates = {}
    if warehouse:
        db = sqlite3.connect(f'file:{Path(warehouse).resolve()}?mode=ro', uri=True)
        roster = list(db.execute('SELECT player_id,display_name,position,latest_team,last_name FROM players'))
        db.close()
        for pid, name, pos, team, last in roster:
            if not name:
                continue
            aliases = {name, re.sub(r" (Jr\.?|Sr\.?|II|III|IV)$", '', name)}
            aliases |= {a.replace("'", '’') for a in aliases}
            for alias in aliases:
                candidates.setdefault(alias, {})[pid] = (pid, name, pos, team, last)
        selected = {}
        for alias, matches in candidates.items():
            if len(matches) == 1 and alias in content:
                pid, name, pos, team, last = next(iter(matches.values()))
                row = selected.setdefault(pid, {'player_id': pid, 'name': name, 'position': pos, 'team': team, 'aliases': []})
                row['aliases'].append(alias)
        surnames = {}
        for pid, name, pos, team, last in roster:
            if last:
                surnames.setdefault(last, set()).add(pid)
        for pid, row in selected.items():
            for last, ids in surnames.items():
                if ids == {pid} and len(last) >= 4:
                    row['aliases'].append(last)
        players = list(selected.values())
    return {'schema': 'bowser-private-briefings-v1', 'reports': reports, 'players': players}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--waiver', type=Path)
    ap.add_argument('--daily', type=Path)
    ap.add_argument('--warehouse', type=Path)
    ap.add_argument('--output', type=Path, required=True)
    args = ap.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.output.resolve().is_relative_to(root):
        raise SystemExit('Private output must be outside the application repository')
    data = build(json.loads(args.waiver.read_text()) if args.waiver else None, json.loads(args.daily.read_text()) if args.daily else None, args.warehouse)
    args.output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(json.dumps({'reports': len(data['reports']), 'sections': sum(len(r['sections']) for r in data['reports']), 'playerLinks': len(data['players']), 'private': True}))


if __name__ == '__main__':
    main()
