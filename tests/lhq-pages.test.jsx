// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PlayerDatabase } from '../src/lhq/PlayerDatabase.jsx';
import { Waivers } from '../src/lhq/Waivers.jsx';
import { MarketPulse } from '../src/lhq/MarketPulse.jsx';
import { OpportunityTracker, calendarComparison } from '../src/lhq/OpportunityTracker.jsx';
import { Grid, LhqProvider } from '../src/lhq/shared.jsx';
import { useMarketData } from '../src/lhq/useMarketData.js';
import { csvDownload } from '../src/lhq/model.js';
import { favoriteKey } from '../src/waiverTable.js';
import { LeagueHub, exactResearchMatch } from '../src/lhq/LeagueHub.jsx';
import { YahooConnection } from '../src/lhq/YahooConnection.jsx';
import { leagueSummaries, rosterExposure } from '../src/lhq/yahooModel.js';

vi.mock('../src/lhq/model.js', async importOriginal => ({ ...await importOriginal(), csvDownload: vi.fn() }));
vi.mock('../src/marketPulseStorage.js', async importOriginal => ({ ...await importOriginal(), readSnapshot: vi.fn(async () => null), saveSnapshot: vi.fn(async snapshot => snapshot) }));
const props = { season: 2026, scoring: 'half', setSeason: vi.fn(), setScoring: vi.fn(), onOpen: vi.fn() };
const reply = body => ({ ok: true, json: async () => body });
const show = child => render(<LhqProvider>{child}</LhqProvider>);
const fixturePlayer = { player_id: 'fixture-a', player_display_name: 'Fixture Alpha', position: 'RB', team: 'NYG', snaps: 0, fantasy_points: 0, player_trends: [] };
const dfs = { key: 'fixture-slate', season: 2025, week: 18, capturedAt: '2026-01-03T00:00:00Z', salaryUrl: 'https://example.test/salaries', options: [{ key: 'current', label: 'Current' }, { key: 'fixture-slate', label: 'Fixture slate' }] };
const playerPayload = (data = [fixturePlayer]) => ({ data, meta: { weeks: [1], dfs } });
const waiverPayload = { rows: [{ id: 'fixture-a', playerId: 'fixture-a', name: 'Fixture Alpha', position: 'RB', team: 'NYG', rankings: {}, faab: {}, stats: { fantasy_points: 0, trends: [] }, activity: {} }], meta: { sources: [] } };
function playerApi(payload) {
  vi.stubGlobal('fetch', vi.fn(async url => reply(String(url).includes('/player-stats?') ? payload : String(url).includes('/schedule?') ? { data: [] } : { seasons: [2025, 2026] })));
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  vi.stubGlobal('innerWidth', 1920);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('PointerEvent', MouseEvent);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('opportunity comparison keeps aligned gaps, includes actual zero, and needs two values on each side', () => {
  const history = [900, 4, null, 8, 0, null, 10].map((value, index) => ({ season: 2026, week: index + 1, rush_attempts: value }));
  expect(calendarComparison(history, 'rush_attempts', 3)).toEqual({ prior: { count: 2, average: 6 }, recent: { count: 2, average: 5 }, delta: -1 });
  history[4].rush_attempts = null;
  expect(calendarComparison(history, 'rush_attempts', 3)).toEqual({ prior: { count: 2, average: 6 }, recent: { count: 1, average: 10 }, delta: null });
  expect(calendarComparison([], 'rush_attempts', 3).recent.average).toBeNull();
});

test('five visible opportunity weeks request enough legal API history for each comparison window', async () => {
  localStorage.setItem('bowser:lhq:opportunity', JSON.stringify({ history: 5 }));
  vi.stubGlobal('fetch', vi.fn(async url => {
    const params = new URL(String(url), 'https://example.test').searchParams;
    if (!String(url).includes('/opportunity-tracker?')) return reply({ teams: ['NYG'] });
    const games = Number(params.get('games'));
    const history = Array.from({ length: games }, (_, index) => ({ season: 2026, week: index + 1, label: `Fixture ${index + 1}`, played: true, snaps: index, rush_attempts: index, fantasy_points: index }));
    return reply({ data: { groups: [{ position: 'RB', players: [{ playerId: 'fixture-a', name: 'Fixture Alpha', history }] }] }, meta: { trendSlots: history } });
  }));
  show(<OpportunityTracker {...props} />);
  await screen.findAllByRole('button', { name: 'Fixture Alpha', exact: true });
  let requests = fetch.mock.calls.filter(([url]) => String(url).includes('/opportunity-tracker?'));
  expect(new URL(requests.at(-1)[0], 'https://example.test').searchParams.get('games')).toBe('8');
  expect(screen.getByRole('table', { name: 'RB opportunity tracker' }).querySelectorAll('.lhq-bar-slot')).toHaveLength(15);
  fireEvent.change(screen.getByLabelText('Compare', { selector: 'select' }), { target: { value: '5' } });
  await waitFor(() => {
    requests = fetch.mock.calls.filter(([url]) => String(url).includes('/opportunity-tracker?'));
    expect(new URL(requests.at(-1)[0], 'https://example.test').searchParams.get('games')).toBe('10');
  });
  expect(requests.every(([url]) => ['5', '8', '10', '18'].includes(new URL(url, 'https://example.test').searchParams.get('games')))).toBe(true);
});

test('waiver page recovers invalid saved trend metrics without crashing', async () => {
  localStorage.setItem('bowser:lhq:waivers:metrics', JSON.stringify({ usage: 'removed-statistic', rushing: null, receiving: {} }));
  vi.stubGlobal('fetch', vi.fn(async () => reply(waiverPayload)));
  show(<Waivers {...props} />);
  expect(await screen.findByRole('button', { name: 'Fixture Alpha', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Snaps / week' })).toBeInTheDocument();
});

test('waiver history validates persisted numbers before querying the API', async () => {
  localStorage.setItem('bowser:lhq:waivers:history', '999');
  vi.stubGlobal('fetch', vi.fn(async () => reply(waiverPayload)));
  show(<Waivers {...props} />);
  await screen.findAllByRole('button', { name: 'Fixture Alpha', exact: true });
  const params = new URL(fetch.mock.calls[0][0], 'https://example.test').searchParams;
  expect(['5', '8', '10', '18']).toContain(params.get('trendWeeks'));
});

test('waiver favorite mutation sanitizes malformed stored entries before inspecting their IDs', async () => {
  localStorage.setItem(favoriteKey(2026, 2), '[null,{},42]');
  vi.stubGlobal('fetch', vi.fn(async () => reply(waiverPayload)));
  show(<Waivers {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Favorite Fixture Alpha' }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem(favoriteKey(2026, 2)))).toEqual([expect.objectContaining({ id: 'fixture-a', bid: null, notes: '' })]));
});

test('Player totals exclude unavailable scores while keeping negative and zero results', async () => {
  playerApi(playerPayload([{ ...fixturePlayer, fantasy_points: -2 }, { ...fixturePlayer, player_id: 'fixture-b', player_display_name: 'Fixture Missing', fantasy_points: null }]));
  show(<PlayerDatabase {...props} />);
  await screen.findAllByRole('button', { name: 'Fixture Alpha', exact: true });
  fireEvent.click(screen.getByRole('button', { name: /Show sidebar/ }));
  const totals = screen.getByRole('columnheader', { name: 'Avg Fpts' }).closest('table');
  const cells = within(totals).getByRole('row', { name: /^RB / }).querySelectorAll('td');
  expect(cells[1]).toHaveTextContent('2');
  expect(cells[2]).toHaveTextContent('-2.0'); expect(cells[3]).toHaveTextContent('-2.0');
});

test('Player export keeps filtered stable IDs and independent stats/DFS source context', async () => {
  playerApi(playerPayload([{ ...fixturePlayer, dfs_projection_source: 'Fixture provider', dfs_projection_url: 'https://example.test/projection' }, { ...fixturePlayer, player_id: 'fixture-b', player_display_name: 'Fixture Beta' }]));
  show(<PlayerDatabase {...props} />);
  await screen.findAllByRole('button', { name: 'Fixture Alpha', exact: true });
  fireEvent.change(screen.getByLabelText('Search Players'), { target: { value: 'Alpha' } });
  fireEvent.click(screen.getByRole('button', { name: '↓', exact: true }));
  await waitFor(() => expect(csvDownload).toHaveBeenCalledTimes(1));
  const [, columns, rows] = csvDownload.mock.calls[0];
  expect(rows).toEqual([expect.objectContaining({ player_id: 'fixture-a', _stats_season: 2026, _stats_weeks: '1', _scoring: 'half', _dfs_slate: 'fixture-slate', _dfs_season: 2025, _dfs_week: 18, _dfs_captured: dfs.capturedAt, _salary_url: dfs.salaryUrl, _projection_provider: 'Fixture provider', _projection_url: 'https://example.test/projection' })]);
  expect(columns.map(column => column.key)).toContain('_projection_url');
  fireEvent.click(screen.getByRole('button', { name: 'Download all slates' }));
  await waitFor(() => expect(csvDownload).toHaveBeenCalledTimes(2));
  expect(csvDownload.mock.calls[1][2]).toHaveLength(1);
  expect(fetch.mock.calls.some(([url]) => String(url).includes('dfsSlate=fixture-slate'))).toBe(true);
});

test('market snapshot age is visible even when an old successful provider response has no error', async () => {
  const capturedAt = Date.now() - 3600000;
  vi.stubGlobal('fetch', vi.fn(async url => {
    const provider = new URL(url, 'https://example.test').searchParams.get('provider');
    return reply({ provider, window: provider === 'sleeper' ? '24' : 'current', capturedAt, rows: [{ id: `${provider}:fixture-a`, name: 'Fixture Alpha', team: 'NYG', position: 'RB', adds: 0, drops: 0, net: 0, rosterPct: 0, startPct: 0 }], stale: true });
  }));
  show(<MarketPulse {...props} />);
  await screen.findByRole('button', { name: 'Watch Fixture Alpha' });
  expect(screen.getAllByText(/stale|refresh available/i).length).toBeGreaterThan(0);
});

test('market changing transaction window cannot retain or relabel previous-window data on failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => {
    const params = new URL(url, 'https://example.test').searchParams, provider = params.get('provider');
    if (provider === 'sleeper' && params.get('hours') === '6') throw Error('Fixture source unavailable');
    return reply({ provider, window: provider === 'sleeper' ? '24' : 'current', capturedAt: Date.now(), rows: [{ id: `${provider}:fixture-a`, name: 'Fixture Alpha' }] });
  }));
  const { result, rerender } = renderHook(({ hours }) => useMarketData(hours), { initialProps: { hours: 24 } });
  await waitFor(() => expect(result.current.busy).toBe(false));
  expect(result.current.snapshots.sleeper.window).toBe('24');
  rerender({ hours: 6 });
  await waitFor(() => expect(result.current.errors.sleeper).toBe('Fixture source unavailable'));
  expect(result.current.snapshots.sleeper).toBeUndefined();
  expect(result.current.snapshots.espn.window).toBe('current');
});

test('canceling a shared column resize removes its pointer handlers', () => {
  const resize = vi.fn();
  render(<Grid columns={[{ key: 'snaps', label: 'Snaps', width: 60, group: 'usage' }]} rows={[]} resizable onResize={resize} />);
  fireEvent.pointerDown(screen.getByRole('separator', { name: 'Resize Snaps' }), { clientX: 100 });
  fireEvent.pointerCancel(document); fireEvent.pointerMove(document, { clientX: 140 });
  expect(resize).not.toHaveBeenCalled();
  fireEvent.pointerUp(document);
});

function yahooFixture() {
  const teamKey = '999.l.1.t.1', account = { season: 2026, checkedAt: '2026-09-27T12:00:00Z', leagues: [{ key: '999.l.1', name: 'Fixture League', season: 2026, teams: 8, scoring: 'head' }], teams: [{ key: teamKey, leagueKey: '999.l.1', name: 'Fixture Team' }] };
  const dashboards = { [teamKey]: { teamKey, season: 2026, week: 3, checkedAt: account.checkedAt, roster: { week: 3, players: [{ key: '999.p.1', name: 'Fixture Starter', position: 'RB', team: 'NYG', slot: 'RB', points: 0 }] }, settings: { rosterPositions: [{ position: 'RB', count: 1 }] }, standings: [{ key: teamKey, rank: 1, wins: 2, losses: 0, ties: 0, pointsFor: 0, faabBalance: 0 }] } };
  const research = { [teamKey]: { teamKey, leagueKey: '999.l.1', checkedAt: account.checkedAt, availability: { status: 'FA', start: 0, nextStart: 25, complete: false, players: [{ key: '999.p.2', name: 'Fixture Available', team: 'NYG', position: 'RB' }] }, trades: { items: [], complete: true }, errors: {} } };
  return { account, ...account, dashboards, research, summaries: leagueSummaries({ account, dashboards, research }), exposure: rosterExposure(account, dashboards), status: { configured: true, connected: true }, errors: {}, log: [{ at: account.checkedAt, event: 'loaded', message: 'Dashboard reads finished.' }], week: '3', setWeek: vi.fn(), busy: false, researchBusy: {}, coverage: { loadedTeams: 1, complete: true }, connect: vi.fn(), disconnect: vi.fn(), refresh: vi.fn(), load: vi.fn(), loadResearch: vi.fn() };
}

test('Yahoo roster tabs retain actual zeroes and leave all account data out of browser storage', () => {
  const yahoo = yahooFixture();
  show(<YahooConnection {...props} yahoo={yahoo} />);
  expect(screen.getByRole('cell', { name: 'Fixture League', exact: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Rosters (1)' }));
  expect(screen.getByRole('button', { name: 'Fixture Starter' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Connection log' }));
  expect(screen.getByText('Dashboard reads finished.')).toBeInTheDocument();
  const saved = [...Object.values(localStorage), ...Object.values(sessionStorage)].join(' ');
  expect(saved).not.toMatch(/Fixture League|Fixture Starter|999\.l\.1/);
});

test('League Hub health preserves a known zero FAAB balance and unavailable projections', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply(waiverPayload)));
  show(<LeagueHub {...props} yahoo={yahooFixture()} />);
  const health = screen.getByRole('region', { name: 'Team health matrix scrollable table' });
  expect(within(health).getByRole('cell', { name: '$0' })).toBeInTheDocument();
  const matches = screen.getByRole('region', { name: 'Matchup board scrollable table' });
  expect(within(matches).getAllByRole('cell', { name: '—' }).length).toBeGreaterThanOrEqual(3);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

test('League Hub never starts a different availability status at the previous status page offset', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply(waiverPayload)));
  const yahoo = yahooFixture();
  show(<LeagueHub {...props} yahoo={yahoo} />);
  fireEvent.click(screen.getByRole('button', { name: /Show sidebar/ }));
  fireEvent.click(screen.getByRole('button', { name: /^League research/ }));
  fireEvent.change(screen.getByLabelText('Availability'), { target: { value: 'FA' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next 25' }));
  expect(yahoo.loadResearch).toHaveBeenLastCalledWith('999.l.1.t.1', expect.objectContaining({ availabilityStart: 25, availabilityStatus: 'FA' }));
  yahoo.loadResearch.mockClear();
  fireEvent.change(screen.getByLabelText('Availability'), { target: { value: 'W' } });
  const next = screen.queryByRole('button', { name: 'Next 25' });
  if (next) expect(next).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Read current research' }));
  const [, query] = yahoo.loadResearch.mock.calls.at(-1);
  expect(query.availabilityStatus).toBe('W'); expect(query.availabilityStart ?? 0).toBe(0);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

test('waiver radar matches only unambiguous name, team and position identities', () => {
  const player = { name: 'Fixture Alpha Jr.', team: 'NYG', position: 'RB' };
  expect(exactResearchMatch(player, [fixturePlayer])).toBe(fixturePlayer);
  expect(exactResearchMatch(player, [fixturePlayer, { ...fixturePlayer, player_id: 'duplicate' }])).toBeNull();
  expect(exactResearchMatch(player, [{ ...fixturePlayer, team: 'BUF' }])).toBeNull();
  expect(exactResearchMatch(player, [{ ...fixturePlayer, position: 'WR' }])).toBeNull();
});

test('Player display limit applies after sorting and Reset restores the complete filtered pool', async () => {
  playerApi(playerPayload([{ ...fixturePlayer, fantasy_points: 2, snaps: 20 }, { ...fixturePlayer, player_id: 'fixture-b', player_display_name: 'Fixture Beta', fantasy_points: 10, snaps: 5 }]));
  show(<PlayerDatabase {...props} />);
  await screen.findAllByRole('button', { name: 'Fixture Alpha', exact: true });
  const grid = screen.getByRole('table', { name: 'Player statistics' });
  fireEvent.change(screen.getByLabelText('Displayed row limit'), { target: { value: '1' } });
  expect(within(grid).queryByRole('button', { name: 'Fixture Alpha', exact: true })).not.toBeInTheDocument();
  expect(within(grid).getByRole('button', { name: 'Fixture Beta', exact: true })).toBeInTheDocument();
  expect(screen.getByText(/1 shown · 2 filtered of 2 players/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'snaps' } });
  expect(within(grid).getByRole('button', { name: 'Fixture Alpha', exact: true })).toBeInTheDocument();
  expect(within(grid).queryByRole('button', { name: 'Fixture Beta', exact: true })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Displayed row limit'), { target: { value: '0' } });
  fireEvent.click(within(grid).getByRole('button', { name: 'Reset', exact: true }));
  expect(within(grid).getByRole('button', { name: 'Fixture Alpha', exact: true })).toBeInTheDocument();
  expect(within(grid).getByRole('button', { name: 'Fixture Beta', exact: true })).toBeInTheDocument();
  expect(screen.getByLabelText('Sort')).toHaveValue('fantasy_points');
});

test('Player trend visibility persists and Manage Columns restores all fields without losing Top identity', async () => {
  playerApi(playerPayload([{ ...fixturePlayer, fantasy_points: 2 }]));
  const view = show(<PlayerDatabase {...props} />);
  await screen.findAllByRole('button', { name: 'Fixture Alpha', exact: true });
  fireEvent.click(screen.getByRole('button', { name: 'Options' }));
  fireEvent.click(screen.getByLabelText('Show trend columns'));
  expect(screen.queryByRole('separator', { name: 'Resize Snap trend' })).not.toBeInTheDocument();
  view.unmount(); show(<PlayerDatabase {...props} />);
  await screen.findAllByRole('button', { name: 'Fixture Alpha', exact: true });
  expect(screen.queryByRole('separator', { name: 'Resize Snap trend' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Column options' }));
  const dialog = screen.getByRole('dialog', { name: 'Manage columns' });
  fireEvent.click(within(dialog).getByLabelText('Snaps'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Show All' }));
  expect(within(dialog).getByLabelText('Snaps')).toBeChecked();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('separator', { name: 'Resize Snap trend' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Show sidebar/ }));
  const totals = screen.getByRole('columnheader', { name: 'Top' }).closest('table');
  fireEvent.click(within(totals).getByRole('button', { name: 'Fixture Alpha', exact: true }));
  expect(props.onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ player_id: 'fixture-a' }), expect.any(HTMLElement));
});

test('League Hub shows sourced native FAAB range, operator and basis without converting to the Yahoo budget', async () => {
  const yahoo = yahooFixture();
  const payload = { rows: [{ ...waiverPayload.rows[0], name: 'Fixture Available', faab: { 'a-invalid': { low: null, unit: 'percent' }, 'b-valid': { low: 12, high: 18, unit: 'percent', operator: 'at-least', budgetBasis: 'remaining' } } }], meta: { sources: [{ id: 'b-valid', label: 'Fixture Publisher', faabUrl: 'https://example.test/faab', publishedAt: '2026-09-27T12:00:00Z', scoring: 'PPR' }] } };
  vi.stubGlobal('fetch', vi.fn(async () => reply(payload)));
  show(<LeagueHub {...props} yahoo={yahoo} />);
  const radar = screen.getByRole('region', { name: 'Waiver radar scrollable table' });
  const bid = await within(radar).findByRole('link', { name: /≥12–18% remaining/ });
  expect(bid).toHaveAttribute('href', 'https://example.test/faab');
  fireEvent.mouseEnter(bid.closest('.lhq-tip-anchor'));
  expect(screen.getByRole('tooltip')).toHaveTextContent('Fixture Publisher; remaining budget; PPR');
  expect(screen.getByRole('tooltip')).toHaveTextContent('not league adjusted');
  expect(within(radar).queryByText('$0')).not.toBeInTheDocument();
});

test('shared headers explain snap percentage and exact-week NFL positional finish while keeping source context', () => {
  show(<Grid columns={[{ key: 'snap_pct', label: 'Snp%', width: 60, group: 'usage' }, { key: '2026-3:position_finish', widthKey: 'position_finish', label: 'FIN', width: 60, group: 'week', help: 'Scoring: half PPR.' }]} rows={[]} />);
  const snap = screen.getByRole('button', { name: 'Snp%' }).closest('.lhq-tip-anchor');
  fireEvent.mouseEnter(snap);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Snap percentage — the player’s share of team offensive snaps');
  expect(screen.getByRole('tooltip')).toHaveTextContent('not a sum of weekly percentages');
  fireEvent.mouseLeave(snap);
  fireEvent.mouseEnter(screen.getByRole('button', { name: 'FIN' }).closest('.lhq-tip-anchor'));
  expect(screen.getByRole('tooltip')).toHaveTextContent('NFL-wide competition rank');
  expect(screen.getByRole('tooltip')).toHaveTextContent('calculated before local filters');
  expect(screen.getByRole('tooltip')).toHaveTextContent('2026 Week 3');
  expect(screen.getByRole('tooltip')).toHaveTextContent('Scoring: half PPR.');
});

test('Player competition ranks follow active metric and direction with ties; Rank sort and NFL finish keep their separate contexts', async () => {
  const fixture = [
    { ...fixturePlayer, player_id: 'a', player_display_name: 'Fixture Alpha', snaps: 20, fantasy_points: 4, position_finish: 9, range_position_rank: 9 },
    { ...fixturePlayer, player_id: 'b', player_display_name: 'Fixture Beta', snaps: 20, fantasy_points: 10, position_finish: 4 },
    { ...fixturePlayer, player_id: 'c', player_display_name: 'Fixture Gamma', snaps: 5, fantasy_points: 0, position_finish: 20 },
    { ...fixturePlayer, player_id: 'd', player_display_name: 'Fixture Missing', snaps: null, fantasy_points: null, position_finish: null },
  ];
  playerApi(playerPayload(fixture));show(<PlayerDatabase {...props} />);
  await screen.findAllByRole('button', { name: 'Fixture Alpha', exact: true });
  const grid = screen.getByRole('table', { name: 'Player statistics' });
  const cells = name => within(grid).getByRole('button', { name, exact: true }).closest('tr').querySelectorAll('td');
  fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'snaps' } });
  expect(cells('Fixture Alpha')[1]).toHaveTextContent(/^1$/);
  expect(cells('Fixture Beta')[1]).toHaveTextContent(/^1$/);
  expect(cells('Fixture Gamma')[1]).toHaveTextContent(/^3$/);
  expect(cells('Fixture Missing')[1]).toHaveTextContent('—');
  fireEvent.click(within(grid).getByRole('button', { name: /^Snaps/ }));
  expect(cells('Fixture Gamma')[1]).toHaveTextContent(/^1$/);
  expect(cells('Fixture Alpha')[1]).toHaveTextContent(/^2$/);
  expect(cells('Fixture Beta')[1]).toHaveTextContent(/^2$/);
  fireEvent.click(within(grid).getByRole('button', { name: 'Rank', exact: true }));
  expect(cells('Fixture Gamma')[1]).toHaveTextContent(/^1$/);
  expect(cells('Fixture Alpha')[1]).toHaveTextContent(/^2$/);
  expect(cells('Fixture Alpha')[cells('Fixture Alpha').length - 1]).toHaveTextContent('RB9');
});

test('Player inline trends have independent history and metric controls, including passing', async () => {
  const history=Array.from({length:18},(_,i)=>({season:2025,week:i+1,snaps:i,passing_yards:i*10}));
  playerApi(playerPayload([{...fixturePlayer,player_trends:history}]));
  show(<PlayerDatabase {...props}/>);
  await screen.findByRole('button',{name:'Fixture Alpha',exact:true});
  const table=screen.getByRole('table',{name:'Player statistics'});
  expect(table.querySelectorAll('.lhq-bars')).toHaveLength(5);
  expect([...table.querySelectorAll('.lhq-bars')].map(n=>n.querySelectorAll('.lhq-bar-slot').length)).toEqual([5,5,5,5,5]);
  fireEvent.click(screen.getByRole('button',{name:'passing trend settings',exact:true}));
  fireEvent.change(screen.getByLabelText('passing trend history'),{target:{value:'10'}});
  await waitFor(()=>expect(new URL(fetch.mock.calls.filter(([u])=>String(u).includes('/player-stats?')).at(-1)[0],'https://example.test').searchParams.get('trendWeeks')).toBe('10'));
  await screen.findByRole('button',{name:'Fixture Alpha',exact:true});
  fireEvent.change(screen.getByLabelText('passing trend statistic'),{target:{value:'completions'}});
  expect(within(table).getByRole('button',{name:'Completions',exact:true})).toBeInTheDocument();
  expect([...table.querySelectorAll('.lhq-bars')].map(n=>n.querySelectorAll('.lhq-bar-slot').length)).toEqual([5,10,5,5,5]);
  fireEvent.keyDown(document,{key:'Escape'});
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('Player team shortcut preserves selected week range and the schedule follows that range', async () => {
  playerApi(playerPayload());show(<PlayerDatabase {...props}/>);
  await screen.findByRole('button',{name:'Fixture Alpha',exact:true});
  fireEvent.change(screen.getByLabelText('Through'),{target:{value:'3'}});
  await waitFor(()=>expect(fetch.mock.calls.some(([u])=>String(u)==='/api/v1/schedule?season=2026&week=1,2,3')).toBe(true));
  const link=await screen.findByRole('link',{name:'Open NYG team box scores for weeks 1,2,3'});
  expect(link.getAttribute('href')).toBe('#/team-box-scores?team=NYG&season=2026&weeks=1%2C2%2C3&scoring=half');
  expect(screen.queryByRole('button',{name:/Offense|Kicker/})).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Hide players with 0 snaps')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox',{name:'Season'})).toHaveValue('2026');
});
