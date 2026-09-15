// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Waivers } from '../src/Waivers.jsx';
import { WAIVER_PREFS_KEY, faabValue, favoriteKey, filterWaiverRows, formatFAAB, sortWaiverRows, validateFavorites, validatePreferences, waiverColumns } from '../src/waiverTable.js';

const sources = Array.from({ length: 5 }, (_, index) => ({ id: `source-${index}`, label: `Publisher ${index + 1}`, rankCount: 3, faabCount: 2, rankUrl: `https://example.com/${index}/rank`, faabUrl: `https://example.com/${index}/faab`, publishedAt: '2026-09-14T12:00:00Z', rankMethod: 'Within-position article order', scoring: 'PPR' }));
const rankings = rank => Object.fromEntries(sources.map(source => [source.id, { rank, scope: 'position', method: 'Within-position article order' }]));
const bids = (low, budgetBasis = 'annual') => Object.fromEntries(sources.map(source => [source.id, { low, high: low + 5, unit: 'percent', budgetBasis }]));
const rows = [
  { id: 'player-1', playerId: 'one', name: 'Fixture Runner', position: 'RB', team: 'BUF', rankings: rankings(1), faab: bids(15), stats: { games_played: 1, snaps: 44, snap_pct: 72.3, carries: 12, rushing_yards: 70, rushing_tds: 1, targets: 3, receptions: 2, receiving_yards: 14, receiving_tds: 0, fantasy_points: 16.4, trends: [{ week: 1, snaps: 44, carries: 12, targets: 3 }] }, activity: { adds: 300, drops: 0, rosterPct: 30, startPct: 5, addsSource: 'Sleeper', ownershipSource: 'ESPN', addsCapturedAt: '2026-09-15T14:00:00Z', ownershipCapturedAt: '2026-09-15T13:00:00Z', windowHours: 24 } },
  { id: 'player-2', playerId: 'two', name: 'Fixture Receiver', position: 'WR', team: 'NYG', rankings: rankings(2), faab: bids(3, 'unspecified'), stats: { fantasy_points: 4 }, activity: {} },
  { id: 'player-3', playerId: 'three', name: 'Unknown Quarterback', position: 'QB', team: 'KC', rankings: {}, faab: {}, stats: {}, activity: {} },
];
const data = { meta: { season: 2026, waiverWeek: 2, statsSeason: 2026, capturedAt: '2026-09-15T14:00:00Z', sources, statsWeeks: [1, 2, 3], availableWeeks: [2, 3] }, rows };
const reply = body => ({ ok: true, json: async () => body });
beforeEach(() => { localStorage.clear(); global.fetch = vi.fn(async () => reply(data)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const ready = () => screen.findByRole('button', { name: 'Fixture Runner', exact: true });
const playerRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(2);

test('renders five independent rank and five FAAB sources, real usage, and exactly one point per recorded game', async () => {
  const open = vi.fn(); render(<Waivers onOpenPlayer={open} />); await ready();
  expect(screen.getByText('5 rank sources · 5 FAAB sources')).toBeInTheDocument();
  for (const source of sources) {
    expect(screen.getByRole('button', { name: `Sort Positional waiver ranks ${source.label}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Sort Source FAAB bids ${source.label}` })).toBeInTheDocument();
  }
  const runner = (await ready()).closest('tr');
  expect(within(runner).getByText('72%')).toBeInTheDocument();
  expect(within(runner).getByText('16.4')).toBeInTheDocument();
  for (const metric of ['snaps', 'rush attempts', 'targets']) {
    const chart = within(runner).getByRole('img', { name: new RegExp(`Fixture Runner ${metric}: Week 1`) });
    expect(chart.querySelectorAll('[data-week]')).toHaveLength(1);
  }
  expect(within(runner).getByText('300').title).toContain('Sleeper');
  expect(within(runner).getByText('30%').title).toContain('ESPN');
  expect(within(runner).getAllByText('15–20%')[0].title).toContain('annual budget');
  expect(screen.queryByText('DFS')).not.toBeInTheDocument();
  fireEvent.click(await ready()); expect(open).toHaveBeenCalledWith({ player_id: 'one', player_display_name: 'Fixture Runner' }, expect.any(HTMLElement), 'ppr');
});

test('sort keeps unknowns last both ways and adds secondary sorts without altering source data', async () => {
  render(<Waivers />); await ready();
  const sort = screen.getByRole('button', { name: 'Sort Fantasy FPTS' });
  expect(playerRows()[0]).toHaveTextContent('Fixture Runner');
  fireEvent.click(sort);
  expect(playerRows()[0]).toHaveTextContent('Fixture Receiver');
  expect(playerRows().at(-1)).toHaveTextContent('Unknown Quarterback');
  fireEvent.click(sort);
  expect(playerRows()[0]).toHaveTextContent('Fixture Runner');
  expect(playerRows().at(-1)).toHaveTextContent('Unknown Quarterback');
  fireEvent.click(screen.getByRole('button', { name: 'Sort Player', exact: true }), { shiftKey: true });
  expect(JSON.parse(localStorage.getItem(WAIVER_PREFS_KEY)).sorts).toEqual([{ key: 'fantasy_points', desc: true }, { key: 'name', desc: false }]);
});

test('search, position, team, and source ranges combine and exclude unknown source values', async () => {
  render(<Waivers />); await ready();
  fireEvent.change(screen.getByLabelText('Search waiver players'), { target: { value: 'fixture buf' } });
  expect(playerRows()).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Search waiver players'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Waiver position'), { target: { value: 'FLEX' } });
  expect(playerRows()).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Waiver team'), { target: { value: 'BUF' } });
  expect(playerRows()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Source filters' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  fireEvent.change(screen.getByLabelText('rank filter source'), { target: { value: 'source-0' } });
  fireEvent.change(screen.getByLabelText('rank max'), { target: { value: '1' } });
  expect(playerRows()).toHaveLength(1);
  expect(playerRows()[0]).toHaveTextContent('Fixture Runner');
  fireEvent.change(screen.getByLabelText('rank max'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('faab filter source'), { target: { value: 'source-1' } });
  fireEvent.change(screen.getByLabelText('faab max'), { target: { value: '5' } });
  expect(playerRows()).toHaveLength(1);
  expect(playerRows()[0]).toHaveTextContent('Fixture Receiver');
});

test('Favorites persist zero bids and notes, reject invalid bids, and isolate season and waiver week', async () => {
  const view = render(<Waivers />); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Favorite Fixture Runner' }));
  fireEvent.click(screen.getByRole('button', { name: 'Favorites 1' }));
  fireEvent.change(screen.getByLabelText('Personal bid for Fixture Runner'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('Notes for Fixture Runner'), { target: { value: 'My watchlist note' } });
  expect(JSON.parse(localStorage.getItem(favoriteKey(2026, 2)))[0]).toMatchObject({ bid: 0, notes: 'My watchlist note' });
  fireEvent.change(screen.getByLabelText('Personal bid for Fixture Runner'), { target: { value: '-10' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Invalid bids are not saved');
  expect(JSON.parse(localStorage.getItem(favoriteKey(2026, 2)))[0].bid).toBe(0);
  fireEvent.change(screen.getByLabelText('Waiver week'), { target: { value: '3' } });
  await waitFor(() => expect(screen.queryByLabelText('Notes for Fixture Runner')).not.toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Waiver week'), { target: { value: '2' } });
  expect(await screen.findByLabelText('Notes for Fixture Runner')).toHaveValue('My watchlist note');
  view.unmount(); render(<Waivers />); await screen.findByLabelText('Personal bid for Fixture Runner');
  expect(screen.getByLabelText('Personal bid for Fixture Runner')).toHaveValue('0');
});

test('saved table controls stay isolated, preserve collapsed groups, and support keyboard resize', async () => {
  localStorage.setItem('bowser:player-table:v1', 'untouched');
  const view = render(<Waivers />); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Passing', exact: true }));
  expect(screen.queryByRole('button', { name: 'Sort Passing ATT' })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize Player column' }), { key: 'ArrowRight' });
  fireEvent.click(screen.getByRole('button', { name: 'Table', exact: true }));
  fireEvent.change(screen.getByLabelText('Waiver row density'), { target: { value: 'comfortable' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'GP', exact: true }));
  const saved = JSON.parse(localStorage.getItem(WAIVER_PREFS_KEY));
  expect(saved).toMatchObject({ density: 'comfortable', widths: { name: 200 }, collapsed: ['passing'], hidden: ['games_played'] });
  expect(localStorage.getItem('bowser:player-table:v1')).toBe('untouched');
  view.unmount(); render(<Waivers />); await ready();
  expect(screen.queryByRole('button', { name: 'Sort Usage GP' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Expand Passing', exact: true })).toBeInTheDocument();
});

test('waiver week and stats week selectors are independent; stale requests cannot replace current results', async () => {
  let resolveInitial;
  fetch.mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve; }));
  render(<Waivers />);
  fireEvent.change(screen.getByLabelText('Statistics end week'), { target: { value: '2' } });
  await ready();
  expect(fetch.mock.calls.at(-1)[0]).toContain('week=2&weeks=1,2&scoring=ppr');
  fireEvent.change(screen.getByLabelText('Waiver week'), { target: { value: '3' } });
  await waitFor(() => expect(fetch.mock.calls.at(-1)[0]).toContain('week=3&weeks=1,2'));
  resolveInitial(reply({ ...data, rows: [{ ...rows[0], name: 'Stale player' }] }));
  await waitFor(() => expect(screen.queryByText('Stale player')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Statistics end week')).toHaveValue('2');
});

test('source values convert only with explicit matching budget basis and preserve native unknowns', async () => {
  expect(faabValue({ low: 10, high: 20, unit: 'percent', budgetBasis: 'remaining' }, 'dollars', { annual: 200 })).toMatchObject({ low: 10, unit: 'percent', converted: false });
  expect(faabValue({ low: 10, high: null, unit: 'percent', budgetBasis: 'annual' }, 'dollars', { annual: 200 })).toMatchObject({ low: 20, high: null, unit: 'dollars', converted: true });
  expect(faabValue({ low: 20, high: null, unit: 'dollars', budgetBasis: 'annual', referenceBudget: 200 }, 'percent')).toMatchObject({ low: 10, unit: 'percent' });
  expect(formatFAAB({ low: 5, high: null, unit: 'percent', operator: 'at-most' })).toBe('≤5%');
  render(<Waivers />); await ready();
  fireEvent.change(screen.getByLabelText('FAAB display'), { target: { value: 'dollars' } });
  fireEvent.change(screen.getByLabelText('Annual FAAB budget'), { target: { value: '200' } });
  expect(within((await ready()).closest('tr')).getAllByText('$30–$40')[0]).toBeInTheDocument();
  expect(within(screen.getByRole('button', { name: 'Fixture Receiver', exact: true }).closest('tr')).getAllByText('3–8%')[0]).toBeInTheDocument();
});

test('storage validation and null comparisons preserve unknowns and safe bounds', () => {
  expect(validatePreferences({ density: 'wild', widths: { name: Infinity, team: 500, position: 70 }, sorts: [{ key: '__proto__', desc: true }] })).toMatchObject({ density: 'compact', widths: { position: 70 }, sorts: [] });
  expect(validateFavorites([{ id: 'a', name: '<script>', bid: -2, notes: 'x'.repeat(1100) }, { id: 'a', bid: 99 }])).toHaveLength(1);
  expect(validateFavorites([{ id: 'a', bid: -2, notes: 'x'.repeat(1100) }])[0]).toMatchObject({ bid: null, notes: 'x'.repeat(1000) });
  const columns = waiverColumns(sources);
  expect(sortWaiverRows(rows, [{ key: 'fantasy_points', desc: false }], columns).map(row => row.playerId)).toEqual(['two', 'one', 'three']);
  expect(sortWaiverRows(rows, [{ key: 'fantasy_points', desc: true }], columns).map(row => row.playerId)).toEqual(['one', 'two', 'three']);
  expect(filterWaiverRows(rows, { ranges: [{ kind: 'faab', source: 'source-0', min: '0', max: '99', unit: 'dollars' }] })).toEqual([]);
});


test('an unavailable historical snapshot displays the API explanation without stale rows', async () => {
  const view = render(<Waivers />); await ready();
  fetch.mockResolvedValue({ ok: false, json: async () => ({ error: { message: 'No published waiver snapshot is available for 2025 Week 2.' } }) });
  view.rerender(<Waivers season={2025} />);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No published waiver snapshot is available for 2025 Week 2.'));
  expect(screen.queryByRole('button', { name: 'Fixture Runner', exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).not.toHaveTextContent('[object Object]');
});
