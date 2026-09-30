// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('../src/lhq/model.js', async original => ({ ...(await original()), csvDownload: vi.fn() }));
import { csvDownload } from '../src/lhq/model.js';
import { LhqProvider } from '../src/lhq/shared.jsx';
import { TeamBoxScores, median, shortKickoff, teamBoxWidths, teamCsvColumns, teamWeekValue, proportionalWeekWidths, parseWeekSelection } from '../src/lhq/TeamBoxScores.jsx';
import { TEAM_BOX_PREFERENCE_KEY } from '../src/teamBoxColumns.js';

const fixturePlayers = [
  { id: 'qb', name: 'Quarterback Zero', position: 'QB', points: 0 },
  { id: 'a', name: 'Runner Alpha', position: 'RB', points: 1 },
  { id: 'b', name: 'Runner Beta', position: 'RB', points: 3 },
  { id: 'c', name: 'Runner Charlie', position: 'RB', points: 8 },
];
const game = (season, week) => ({ season, week, seasonType: 'REG', gameId: `${season}_${week}_NYG_DAL`, opponent: 'DAL', homeAway: 'home', gameday: `${season}-01-${String(week).padStart(2, '0')}`, gametime: '13:00', pointsFor: 24, pointsAgainst: 17, scoreLabel: 'W 24-17', result: 'W' });
function payload(url) {
  const query = new URL(url, 'http://fixture.test').searchParams;
  const season = Number(query.get('season'));
  const weeks = season === 2026 ? [1] : [1, 2, 3, 17, 18];
  const anchor = Number(query.get('trendAnchors'));
  const slots = Array.from({ length: 5 }, (_, i) => ({ season, week: Math.max(1, anchor - 4 + i), key: `${season}-${i}`, label: `${season} W${Math.max(1, anchor - 4 + i)}` }));
  const rows = fixturePlayers.flatMap(player => weeks.map(week => {
    const pregame = player.id === 'qb' && week === 2;
    const missing = player.id === 'a' && week === 2;
    return { season, week, player_id: player.id, player_display_name: player.name, team: 'NYG', position: player.position, position_group: player.position, game_id: game(season, week).gameId, played: !pregame, stats_available: !pregame,
      snaps: pregame ? null : player.id === 'a' ? 42 : 2, snap_pct: pregame ? null : 50,
      completions: pregame ? null : 10, passing_attempts: pregame ? null : 20, passing_yards: pregame ? null : 100, passing_tds: pregame ? null : 0, interceptions: pregame ? null : 0,
      carries: pregame ? null : player.points, rushing_yards: pregame ? null : 10, rushing_tds: pregame ? null : 0,
      targets: pregame ? null : player.points, receptions: pregame ? null : 1, receiving_yards: pregame ? null : 10, receiving_tds: pregame ? null : 0,
      fantasy_points: pregame || missing ? null : player.points, position_finish: pregame ? null : 1,
      draft_kings_price: 5000 + week * 100, draft_kings_projection: 12.5,
      dfs_meta: { season, week, slateKey: `${season}-w${week}`, label: `${season} Week ${week} verified fixture`, capturedAt: '2026-09-01T12:00:00Z', salarySource: 'DraftKings', salaryUrl: 'https://example.test/salary', projectionSource: 'Fixture provider', projectionUrl: 'https://example.test/projection' },
      trendsByAnchor: anchor ? { [anchor]: slots.map((slot, i) => ({ ...slot, rushAttempts: i === 2 ? null : player.points, snaps: i === 2 ? null : player.id === 'a' ? 42 : 2 })) } : {},
    };
  }));
  return { data: rows, meta: { season, schedule: weeks.map(week => game(season, week)), trendsByAnchor: anchor ? { [anchor]: { slots, domains: { snaps: { min: 0, max: 84 }, rush_attempts: { min: 0, max: 20 } } } } : {} } };
}
function renderPage(props = {}) {
  return render(<LhqProvider><TeamBoxScores season={2025} scoring="ppr" setSeason={() => {}} setScoring={() => {}} onOpen={() => {}} {...props} /></LhqProvider>);
}
const table = position => screen.getByRole('table', { name: 'Weekly team box scores' });
const bodyRow = name => screen.getByRole('button', { name, exact: true }).closest('tr');
function statCell(name, position, label, ordinal = 0) {
  const header = within(table(position)).getAllByRole('button', { name: new RegExp(`^${label}(?: [▲▼])?$`) })[ordinal].closest('th');
  return bodyRow(name).children[header.cellIndex];
}
function showSettings() {
  fireEvent.click(screen.getByRole('button', { name: /Show sidebar/ }));
  fireEvent.click(screen.getByRole('tab', { name: 'Filters & settings' }));
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('fetch', vi.fn(async input => ({ ok: true, json: async () => String(input).includes('/meta?') ? { availableWeeks: Number(new URL(input, 'http://fixture.test').searchParams.get('season')) === 2026 ? [1] : [1, 2, 3], teams: ['NYG', 'BUF'] } : payload(String(input)) })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

test('stat values distinguish genuine zero, missing actuals and separately sourced pregame DFS', () => {
  expect(teamWeekValue({ played: true, fantasy_points: 0 }, 'fantasy_points')).toBe(0);
  expect(teamWeekValue({ played: true, fantasy_points: null }, 'fantasy_points')).toBeNull();
  expect(teamWeekValue({ played: false, fantasy_points: 10 }, 'fantasy_points')).toBeNull();
  expect(teamWeekValue({ played: false, draft_kings_price: 5100 }, 'draft_kings_price')).toBe(5100);
  expect(teamWeekValue({ played: true, stats_available: false, snaps: 0 }, 'snaps')).toBeNull();
  expect(teamWeekValue({ played: true, completions: null, passing_attempts: 20 }, 'passing_line')).toBeNull();
});
test('width sanitization retains explicit custom widths but rejects malformed and unknown fields', () => {
  expect(teamBoxWidths({ columnWidths: { snaps: 75, fantasy_points: 62 }, lhqWidths: { player: 'bad', snaps: 80, targets: -10, carries: 9000, unknown: 90 } })).toEqual({ snaps: 80, targets: 28, carries: 420 });
  expect(shortKickoff(game(2025, 3))).toBe('Jan 3, 2025');
  expect(median([null, NaN, 1, 3, 8])).toBe(3); expect(median([1, 3])).toBe(2); expect(median([])).toBeNull();
});
test('DNP actuals stay unavailable while known DFS prices remain visible and zero scores remain zero', async () => {
  renderPage(); await screen.findByRole('button', { name: 'Quarterback Zero', exact: true });
  expect(statCell('Quarterback Zero', 'QB', 'FPTS', 0)).toHaveTextContent('0.0');
  expect(statCell('Quarterback Zero', 'QB', 'FPTS', 1)).toHaveTextContent('—');
  expect(statCell('Quarterback Zero', 'QB', 'DK\\$', 1)).toHaveTextContent('$5.2K');
  expect(statCell('Quarterback Zero', 'QB', 'PROJ', 1)).toHaveTextContent('12.5');
  expect(statCell('Runner Alpha', 'RB', 'FPTS', 1)).toHaveTextContent('—');
  const fptsHeader = within(table('RB')).getAllByRole('button', { name: /^FPTS/ })[1].closest('th');
  expect([...table('RB').querySelectorAll('.lhq-team-total')].find(row=>row.textContent.includes('RB TOTAL')).children[fptsHeader.cellIndex]).toHaveTextContent('—');
  expect([...table('RB').querySelectorAll('.lhq-team-total')].find(row=>row.textContent.includes('RB TOTAL')).children[fptsHeader.cellIndex]).toHaveStyle({ color: '#3ecf8e' });
});
test('one stat resize synchronizes every week and position while explicit preferences survive remounts', async () => {
  localStorage.setItem(TEAM_BOX_PREFERENCE_KEY, JSON.stringify({ selectedLeagues: ['LOEG'], lhqWidths: { player: 175 } }));
  const view = renderPage(); await screen.findByRole('button', { name: 'Quarterback Zero', exact: true });
  fireEvent.keyDown(within(table('QB')).getAllByRole('separator', { name: 'Resize SNP' })[0], { key: 'ArrowRight' });
  for (const position of ['QB', 'RB', 'WR', 'TE']) {
    const cols = table(position).querySelectorAll('col');
    expect(cols[1].style.width).toBe('175px');
    for (const index of [2, 15, 28]) expect(cols[index].style.width).toBe('40px');
  }
  const stored = JSON.parse(localStorage.getItem(TEAM_BOX_PREFERENCE_KEY));
  expect(stored.lhqWidths.snaps).toBe(40); expect(stored.selectedLeagues).toEqual(['LOEG']);
  view.unmount(); renderPage(); await screen.findByRole('button', { name: 'Quarterback Zero', exact: true });
  expect(table('RB').querySelectorAll('col')[2].style.width).toBe('40px');
});
test('median shading uses all selected-team position peers rather than the filtered subset', async () => {
  renderPage(); await screen.findByRole('button', { name: 'Runner Alpha', exact: true });
  expect(statCell('Runner Alpha', 'RB', 'FPTS')).toHaveStyle({ color: '#e8735a' });
  expect(statCell('Runner Charlie', 'RB', 'FPTS')).toHaveStyle({ color: '#3ecf8e' });
  expect(statCell('Runner Beta', 'RB', 'FPTS').style.background).toBe('');
  fireEvent.change(within(table('RB')).getByLabelText('Search Players'), { target: { value: 'Runner Alpha' } });
  expect(statCell('Runner Alpha', 'RB', 'FPTS')).toHaveStyle({ color: '#e8735a' });
});
test('latest result and top scorer are sourced and position titles include count, points and week count', async () => {
  renderPage(); await screen.findByRole('button', { name: 'Runner Charlie', exact: true });
  expect(screen.queryByText('Top scorer')).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name:/QB 1 players/})).toHaveTextContent('1 players · 0.0 pts · 3 weeks');
  fireEvent.click(screen.getByRole('button', { name: /Show sidebar/ }));
  const aside = document.querySelector('.lhq-sidebar');
  expect(within(aside).getByText('Result').nextElementSibling).toHaveTextContent('W 24-17');
  expect(within(aside).getByText('Top scorer').nextElementSibling).toHaveTextContent('Runner Charlie · 8.0 pts');
  fireEvent.click(within(aside).getByRole('tab', { name: 'Position Totals' }));
  expect(within(aside).getByRole('columnheader', { name: 'Top scorer' })).toBeInTheDocument();
  expect(aside).toHaveTextContent('Runner Charlie · 24.0');
  expect(within(table('QB')).getAllByRole('columnheader').some(header => header.textContent.includes('Jan 3, 2025'))).toBe(true);
});
test('markers remain player-ID preferences and filtered CSV retains season-week and DFS provenance', async () => {
  renderPage(); await screen.findByRole('button', { name: 'Runner Alpha', exact: true });
  fireEvent.change(screen.getByLabelText('Marker for Runner Alpha'), { target: { value: 'favorite' } });
  fireEvent.click(screen.getByRole('button', { name: /^Marked \(/ }));
  expect(screen.queryByRole('button', { name: 'Runner Beta', exact: true })).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(TEAM_BOX_PREFERENCE_KEY)).markers).toEqual({ a: 'favorite' });
  fireEvent.click(screen.getByRole('button', { name: 'Download team weeks CSV' }));
  const [filename, columns, rows] = csvDownload.mock.calls.at(-1);
  expect(filename).toContain('2025-1_2025-2_2025-3'); expect(rows).toHaveLength(3); expect(rows.every(row => row.player_id === 'a')).toBe(true);
  expect(columns.find(column => column.key === 'dfs_slateKey').value(rows[0])).toBe('2025-w1');
  expect(columns.find(column => column.key === 'dfs_projectionUrl').value(rows[0])).toBe('https://example.test/projection');
  expect(columns.find(column => column.key === 'fantasy_points').value(rows[1])).toBeNull();
  const pass = teamCsvColumns(['passing_line'], 'NYG', 'ppr').find(column => column.key === 'passing_line');
  expect(pass.value({ played: true, completions: 0, passing_attempts: 1 })).toBe('0-1');
});
test('anchored trends use historical calendar slots, aliases and shared domains', async () => {
  renderPage(); await screen.findByRole('button', { name: 'Runner Alpha', exact: true }); showSettings();
  fireEvent.change(screen.getByLabelText('Insert trend after'), { target: { value: '2025-2' } });
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes('trendAnchors=2'))).toBe(true));
  await waitFor(() => expect(bodyRow('Runner Alpha').querySelectorAll('.lhq-bar-slot')).toHaveLength(5));
  expect(bodyRow('Runner Alpha').querySelectorAll('.missing')).toHaveLength(1);
  const alpha = parseFloat(bodyRow('Runner Alpha').querySelector('.lhq-bar-plot i').style.height);
  const beta = parseFloat(bodyRow('Runner Beta').querySelector('.lhq-bar-plot i').style.height);
  expect(alpha).toBeCloseTo(beta * 21);
  fireEvent.change(screen.getByLabelText('Trend metric'), { target: { value: 'rush_attempts' } });
  fireEvent.click(within(table('RB')).getByRole('button', { name: /^Trend/ }));
  expect([...table('RB').querySelectorAll('tbody tr')].filter(row=>row.querySelector('.lhq-player'))[1]).toHaveTextContent('Runner Charlie');
});
test('hiding every visible week does not claim players played every week', async () => {
  renderPage(); await screen.findByRole('button', { name: 'Runner Alpha', exact: true });
  fireEvent.click(screen.getByRole('button',{name:'Toggle game selector'}));
  for (const week of [1, 2, 3]) fireEvent.click(screen.getByRole('button', { name: `Toggle week 2025-${week}` }));
  expect(screen.getByRole('button', { name: 'Played every week (0)' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Played every week (0)' }));
  expect(screen.queryByRole('button', { name: 'Runner Alpha', exact: true })).not.toBeInTheDocument();
});
test('cross-season anchor keeps empty calendar slots for a player without previous-season records', async () => {
  vi.stubGlobal('fetch', vi.fn(async input => {
    const url = String(input), season = Number(new URL(url, 'http://fixture.test').searchParams.get('season'));
    if (url.includes('/meta?')) return { ok: true, json: async () => ({ availableWeeks: [1], teams: ['NYG'] }) };
    const result = payload(url);
    if (season === 2025) result.data = result.data.filter(row => row.player_id !== 'qb');
    return { ok: true, json: async () => result };
  }));
  renderPage({ season: 2026 }); await screen.findByRole('button', { name: 'Quarterback Zero', exact: true }); showSettings();
  fireEvent.change(screen.getByLabelText('Insert trend after'), { target: { value: '2025-18' } });
  await waitFor(() => expect(bodyRow('Quarterback Zero').querySelectorAll('.lhq-bar-slot')).toHaveLength(5));
  expect(bodyRow('Quarterback Zero').querySelectorAll('.missing')).toHaveLength(5);
  const historyRequests = fetch.mock.calls.map(([url]) => new URL(url, 'http://fixture.test')).filter(url => url.searchParams.get('trendAnchors') === '18');
  expect(historyRequests.length).toBeGreaterThan(0);
  expect(historyRequests.every(url => url.searchParams.get('season') === '2025')).toBe(true);
});


test('one compact header shares correctly labeled passing and receiving statistics across positions', async()=>{
 renderPage();await screen.findByRole('button',{name:'Runner Alpha',exact:true});
 expect(screen.getAllByRole('table',{name:'Weekly team box scores'})).toHaveLength(1);
 expect(within(table()).getAllByRole('button',{name:/^C-A \/ REC/})).toHaveLength(3);
 expect(statCell('Quarterback Zero','QB','C-A \/ REC')).toHaveTextContent('10-20');
 expect(statCell('Runner Alpha','RB','C-A \/ REC')).toHaveTextContent('1');
 fireEvent.click(screen.getByRole('button',{name:/RB 3 players/}));
 expect(screen.queryByRole('button',{name:'Runner Alpha',exact:true})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Quarterback Zero',exact:true})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/RB 3 players/}));
 expect(screen.getByRole('button',{name:'Runner Alpha',exact:true})).toBeInTheDocument();
});
test('whole-week resize scales all columns across weeks without altering identity widths', async()=>{
 renderPage();await screen.findByRole('button',{name:'Runner Alpha',exact:true});
 const before=[...table().querySelectorAll('col')].map(c=>parseFloat(c.style.width));
 fireEvent.keyDown(screen.getByRole('separator',{name:'Resize week 2025-1'}),{key:'ArrowLeft'});
 const after=[...table().querySelectorAll('col')].map(c=>parseFloat(c.style.width));
 expect(after.slice(0,2)).toEqual(before.slice(0,2));
 for(let i=2;i<15;i++){expect(after[i]).toBeLessThan(before[i]);expect(after[i+13]).toBe(after[i]);expect(after[i+26]).toBe(after[i]);}
 expect(table().querySelectorAll('tbody tr:not(.lhq-team-section) td.lhq-week-boundary').length).toBeGreaterThan(0);
 const bounded=proportionalWeekWidths([{key:'a',width:40},{key:'b',width:80}],1);expect(bounded).toEqual({a:28,b:56});
});
test('team links retain exact selected weeks rather than injecting previous-season games', async()=>{
 renderPage({season:2026,initialTeam:'BUF',initialWeeks:'1,2,3'});await screen.findByRole('button',{name:'Runner Alpha',exact:true});
 expect(screen.getByRole('button',{name:'Team'})).toHaveTextContent('BUF');
 expect(screen.getByRole('separator',{name:'Resize week 2026-1'})).toBeInTheDocument();
 expect(screen.getByRole('separator',{name:'Resize week 2026-3'})).toBeInTheDocument();
 expect(screen.queryByRole('separator',{name:'Resize week 2025-18'})).not.toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Open BUF 2026 week 1 game breakdown'})).toHaveAttribute('href','#/game/2026_1_NYG_DAL?scoring=ppr');
 expect(parseWeekSelection('3,1,2,3,0,99,foo')).toEqual([1,2,3]);
});
