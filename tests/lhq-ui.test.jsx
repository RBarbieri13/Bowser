// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { competitionRank, inRanges, sortRows } from '../src/lhq/model.js';
import { Bars, Grid, LhqProvider, Shell, CollapsibleStrip, useStored } from '../src/lhq/shared.jsx';
import { PlayerDatabase } from '../src/lhq/PlayerDatabase.jsx';

let observers;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); observers = [];
  vi.stubGlobal('ResizeObserver', class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() {} });
  vi.stubGlobal('PointerEvent', MouseEvent);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const columns = [
  { key: 'name', label: 'Name', group: 'identity', pin: 'left', width: 100 },
  { key: 'team', label: 'Team', group: 'identity', pin: 'left', width: 50 },
  { key: 'snaps', label: 'Snaps', group: 'usage', width: 60 },
  { key: 'points', label: 'Fpts', group: 'fantasy', pin: 'right', width: 70 },
];
const names = rows => rows.map(row => row.name);

test('sorts both directions with actual zero, negatives, alphabetical ties and missing values last', () => {
  const rows = [{ name: 'Null', points: null }, { name: 'Zulu', points: 0 }, { name: 'Negative', points: -2 }, { name: 'Alpha', points: 0 }, { name: 'Top', points: 10 }];
  expect(names(sortRows(rows, { key: 'points', desc: true }, columns))).toEqual(['Top', 'Alpha', 'Zulu', 'Negative', 'Null']);
  expect(names(sortRows(rows, { key: 'points', desc: false }, columns))).toEqual(['Negative', 'Alpha', 'Zulu', 'Top', 'Null']);
  expect(names(sortRows(rows, { key: 'name', desc: true }, columns))).toEqual(['Zulu', 'Top', 'Null', 'Negative', 'Alpha']);
  expect(rows[0].name).toBe('Null');
});
test('missing values use the same name tie-break as populated values', () => {
  const rows = [{ name: 'Zulu', points: null }, { name: 'Alpha', points: null }];
  expect(names(sortRows(rows, { key: 'points', desc: true }, columns))).toEqual(['Alpha', 'Zulu']);
});
test('range filters are inclusive, exclude unknowns, and reset without discarding true zero', () => {
  const range = { points: { min: '0', max: '10' } };
  expect(inRanges({ points: 0 }, range, {})).toBe(true);
  expect(inRanges({ points: 10 }, range, {})).toBe(true);
  for (const points of [-1, 11, null, undefined]) expect(inRanges({ points }, range, {})).toBe(false);
  expect(inRanges({ points: null }, { points: { min: '', max: '' } }, {})).toBe(true);
  expect(inRanges({ total: 7 }, range, { points: row => row.total })).toBe(true);
});
test('competition ranks preserve ties, skip rank numbers, omit unknowns and use stable IDs', () => {
  const rows = [{ player_id: 'a', name: 'Same', fantasy_points: 10 }, { player_id: 'b', name: 'Same', fantasy_points: 10 }, { player_id: 'c', fantasy_points: 0 }, { player_id: 'd', fantasy_points: -1 }, { player_id: 'e', fantasy_points: null }];
  expect([...competitionRank(rows)]).toEqual([['a', 1], ['b', 1], ['c', 3], ['d', 4]]);
});

test('grid pins with cumulative offsets and releases the right group in a narrow pane', () => {
  render(<Grid columns={columns} rows={[{ player_id: 'one', name: 'Alpha', team: 'BUF', snaps: 42, points: 20 }]} />);
  const row = screen.getByRole('row', { name: 'Alpha BUF 42 20' });
  const cells = within(row).getAllByRole('cell');
  expect(cells[0]).toHaveStyle({ position: 'sticky', left: '0px' });
  expect(cells[1]).toHaveStyle({ position: 'sticky', left: '100px' });
  expect(cells[3]).toHaveStyle({ position: 'sticky', right: '0px' });
  act(() => observers[0].callback([{ contentRect: { width: 479 } }]));
  expect(cells[3].style.position).not.toBe('sticky');
  expect(cells[0]).toHaveStyle({ position: 'sticky' });
  act(() => observers[0].callback([{ contentRect: { width: 480 } }]));
  expect(cells[3]).toHaveStyle({ position: 'sticky', right: '0px' });
});
test('resizing a shared field updates every occurrence and preserves table width and sticky offsets', () => {
  function Harness() {
    const [widths, setWidths] = useState({});
    const repeated = [...columns, { key: 'week2snaps', widthKey: 'snaps', label: 'W2 Snaps', group: 'week2', width: 60 }];
    return <Grid columns={repeated} rows={[]} resizable widths={widths} onResize={(key, value) => setWidths(old => ({ ...old, [key]: value }))} />;
  }
  const { container } = render(<Harness />);
  fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize Snaps' }), { key: 'ArrowRight' });
  const cols = [...container.querySelectorAll('col')];
  expect(cols[2].style.width).toBe('64px'); expect(cols[4].style.width).toBe('64px');
  expect(container.querySelector('table').style.width).toBe('348px');
  fireEvent.pointerDown(screen.getByRole('separator', { name: 'Resize Name' }), { clientX: 100 });
  fireEvent.pointerMove(document, { clientX: 125 }); fireEvent.pointerUp(document);
  expect(cols[0].style.width).toBe('125px');
  expect(screen.getByRole('button', { name: 'Team' }).closest('th').style.left).toBe('125px');
});
test('keyboard resize cannot exceed the same upper bound as pointer resize', () => {
  const resize = vi.fn();
  render(<Grid columns={[columns[0]]} rows={[]} resizable widths={{ name: 420 }} onResize={resize} />);
  fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize Name' }), { key: 'ArrowRight' });
  expect(resize).toHaveBeenLastCalledWith('name', 420);
});
test('row identity remains stable when sorting players with the same display name', () => {
  const first = { player_id: 'first', name: 'Same', team: 'BUF' }, second = { player_id: 'second', name: 'Same', team: 'NYJ' };
  const { rerender } = render(<Grid columns={columns} rows={[first, second]} />);
  const buffalo = screen.getByRole('row', { name: /Same BUF/ });
  rerender(<Grid columns={columns} rows={[second, first]} />);
  expect(screen.getByRole('row', { name: /Same BUF/ })).toBe(buffalo);
});
test('bars share a supplied NFL scale, preserve gaps, and put negative points below zero', () => {
  const domain = { min: -10, max: 50 };
  const { container } = render(<LhqProvider><Bars metric="fantasy_points" domain={domain} history={[{ season: 2026, week: 1, fantasy_points: 20 }, { season: 2026, week: 2, fantasy_points: null }, { season: 2026, week: 3, fantasy_points: -5 }]} /><Bars metric="fantasy_points" domain={domain} history={[{ season: 2026, week: 1, fantasy_points: 10 }]} /></LhqProvider>);
  const bars = [...container.querySelectorAll('.lhq-bar-plot i')];
  expect(parseFloat(bars[0].style.height)).toBeCloseTo(2 * parseFloat(bars[3].style.height));
  expect(bars[1]).toHaveClass('missing');
  expect(parseFloat(bars[2].style.top)).toBeCloseTo(100 * 50 / 60);
  expect(container.querySelectorAll('.lhq-bar-slot')).toHaveLength(4);
});
function Stored({ storageKey, fallback = [] }) {
  const [value] = useStored(storageKey, fallback);
  return <output data-testid="stored">{JSON.stringify(value)}</output>;
}
test('malformed saved preference shapes fall back safely', () => {
  localStorage.setItem('hidden', '{}');
  render(<Stored storageKey="hidden" />);
  expect(screen.getByTestId('stored')).toHaveTextContent('[]');
});
test('switching storage keys never copies the previous context into the new one', () => {
  localStorage.setItem('first', '["snaps"]'); localStorage.setItem('second', '["points"]');
  const { rerender } = render(<Stored storageKey="first" />);
  rerender(<Stored storageKey="second" />);
  expect(screen.getByTestId('stored')).toHaveTextContent('["points"]');
  expect(JSON.parse(localStorage.getItem('first'))).toEqual(['snaps']);
  expect(JSON.parse(localStorage.getItem('second'))).toEqual(['points']);
});
function mockPlayerReads() {
  vi.stubGlobal('fetch', vi.fn(async input => {
    const url = new URL(input, 'http://localhost');
    let data;
    if (url.pathname.endsWith('/meta')) data = { seasons: [2025, 2026], warehouse: {} };
    else if (url.pathname.endsWith('/schedule')) {
      const week = Number(url.searchParams.get('week'));
      data = { data: [{ gameId: `2025_${week}_BUF_NYJ`, week, homeTeam: 'NYJ', awayTeam: 'BUF', gameday: '2025-09-07', gametime: '13:00', totalPoints: null }] };
    } else {
      const week = Number(url.searchParams.get('weeks'));
      data = { data: [{ player_id: 'a', player_display_name: 'Fixture Player', team: 'BUF,NYJ', position: 'WR', fantasy_points: 10, snaps: 42, player_trends: [] }], meta: { weeks: [week], trendDomains: {}, dfs: { options: [{ key: 'current', label: 'Fixture slate' }] } } };
    }
    return { ok: true, json: async () => data };
  }));
}
test('game filters include multi-team aggregate rows and clear stale selections when weeks change', async () => {
  mockPlayerReads();
  render(<LhqProvider><PlayerDatabase season={2025} scoring="ppr" setSeason={() => {}} setScoring={() => {}} onOpen={() => {}} /></LhqProvider>);
  await screen.findByRole('button', { name: 'Fixture Player' });
  fireEvent.click(await screen.findByRole('button', { name: /BUF @ NYJ/ }));
  expect(screen.getByRole('button', { name: 'Fixture Player' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('DFS week'), { target: { value: '2' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Fixture Player' })).toBeInTheDocument());
  expect(screen.queryByText(/No records for this selection/)).not.toBeInTheDocument();
});
test('malformed saved widths cannot corrupt table dimensions or sticky offsets', () => {
  const { container } = render(<Grid columns={columns} rows={[{ name: 'Alpha', team: 'BUF', snaps: 42, points: 0 }]} widths={{ name: 'invalid', team: -400, snaps: 999999, points: null }} />);
  const widths = [...container.querySelectorAll('col')].map(col => parseFloat(col.style.width));
  expect(widths.every(width => Number.isFinite(width) && width >= 28 && width <= 420)).toBe(true);
  expect(parseFloat(container.querySelector('table').style.width)).toBe(widths.reduce((sum, width) => sum + width, 0));
  expect(screen.getByRole('button', { name: 'Team' }).closest('th').style.left).toBe(`${widths[0]}px`);
});


test('sidebars reopen only by user action and header bands collapse independently',()=>{
 const page=p=><LhqProvider><Shell page={p} sources={<span>Source content</span>} panels={[{id:'filters',title:'Filters',content:'Sidebar content'}]}><CollapsibleStrip><span>Game content</span></CollapsibleStrip></Shell></LhqProvider>;
 sessionStorage.setItem('bowser:lhq:sidebar-hidden:players','false');
 const view=render(page('players'));
 expect(screen.queryByText('Sidebar content')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/Show sidebar/}));
 expect(screen.getByText('Sidebar content')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Toggle sources and options'}));
 expect(screen.queryByText('Source content')).not.toBeInTheDocument();
 expect(screen.getByText('Game content')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Toggle game selector'}));
 expect(screen.queryByText('Game content')).not.toBeInTheDocument();
 view.rerender(page('waivers'));
 expect(screen.queryByText('Sidebar content')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/Show sidebar/}));view.unmount();render(page('waivers'));
 expect(screen.queryByText('Sidebar content')).not.toBeInTheDocument();
});
