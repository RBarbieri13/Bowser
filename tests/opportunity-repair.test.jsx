// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { OpportunityTracker, OPPORTUNITY_PREFS_KEY } from '../src/OpportunityTracker.jsx';
import { TREND_METRICS } from '../src/trendMetrics.js';

const allSlots = [...Array.from({ length: 9 }, (_, index) => ({ season: 2025, week: index + 10, seasonType: 'REG' })), { season: 2026, week: 1, seasonType: 'REG' }];
const player = (id, name, values, extra = {}) => ({
  playerId: id, name, team: 'NYG', position: 'RB', depthPosition: 'RB', depthRank: 1,
  rosterStatus: 'ACT', rosterStatusLabel: 'Active roster', yearsExperience: 3, hasNFLHistory: true,
  history: values, ...extra,
});
const recorded = (slot, stats) => ({ ...slot, gameId: `${slot.season}_${slot.week}_NYG_DAL`, team: 'NYG', opponent: 'DAL', ...stats });
const players = [
  player('runner', 'Known Runner', [
    recorded(allSlots[5], { snaps: 20, carries: 10, receptions: 2, rushingYards: 45, fantasyPoints: 8 }),
    recorded(allSlots[6], { snaps: 30, carries: 20, receptions: 3, rushingYards: 70, fantasyPoints: 10 }),
    recorded(allSlots[7], { snaps: 40, carries: 10, receptions: 1, rushingYards: 30, fantasyPoints: 12 }),
    recorded(allSlots[9], { snaps: 20, carries: 20, receptions: 4, rushingYards: 60, fantasyPoints: -2 }),
  ]),
  player('other', 'Other Runner', [recorded(allSlots[9], { snaps: 40, carries: 20, receptions: 2, rushingYards: 60, fantasyPoints: 8 })]),
  player('rookie', 'Rookie Runner', [], { hasNFLHistory: false, rookie: true, rookieYear: 2026, yearsExperience: 0, depthRank: 4 }),
  player('receiver', 'Known Receiver', [recorded(allSlots[9], { targets: 8, receptions: 5, receivingYards: 80, fantasyPoints: 13 })], { position: 'WR', depthPosition: 'WR' }),
];
const fixture = (input = '/api/v1/opportunity-tracker?season=2026&games=10') => {
  const params = new URL(input, 'http://local').searchParams;
  const count = Number(params.get('games') || 10);
  return {
    data: { team: params.get('team') || 'NYG', groups: ['RB', 'WR'].map(position => ({ position, players: players.filter(item => item.position === position) })) },
    meta: {
      rosterSeason: 2026, historySeason: Number(params.get('season') || 2026), gameWindow: count,
      trendSlots: allSlots.slice(-count),
      trendDomains: { snaps: { min: 0, max: 80 }, rush_attempts: { min: 0, max: 40 }, rushing_yards: { min: 0, max: 120 }, fantasy_points: { min: -10, max: 40 } },
      schedule: [1, 2, 3, 8].map(week => ({ week, seasonType: 'REG', opponent: 'DAL', gameId: `game-${week}` })),
      playerCount: 4, playersWithHistory: 3, rookies: 1, depthUpdatedAt: '2026-09-15T10:00:00Z',
      injuryNewsAvailable: false, injuryNewsMessage: 'The practice-report injury feed is not published yet.',
      ordering: 'Official nflverse depth rank, then recent recorded snap volume',
      source: { name: 'nflverse', url: 'https://github.com/nflverse/nflverse-data', license: 'CC BY 4.0' }, queryMs: 2,
    },
  };
};
const response = body => ({ ok: true, json: async () => body });
const meta = { teams: ['NYG', 'BUF'], seasons: [2026, 2025] };
const ready = () => screen.findByRole('button', { name: 'Known Runner', exact: true });
const row = name => screen.getByRole('article', { name: `${name} opportunity` });
const chart = (name, metric) => within(row(name)).getByRole('img', { name: new RegExp(`^${metric} trend for ${name}:`) });
const latestQuery = () => new URL(fetch.mock.calls.at(-1)[0], 'http://local').searchParams;
beforeEach(() => {
  localStorage.clear();
  global.fetch = vi.fn(async input => response(fixture(input)));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('uses one metric domain and calendar axis for all players, leaving rookie and missing slots empty', async () => {
  render(<OpportunityTracker meta={meta} />); await ready();
  const known = chart('Known Runner', 'Snaps');
  const other = chart('Other Runner', 'Snaps');
  const rookie = chart('Rookie Runner', 'Snaps');
  for (const element of [known, other, rookie]) {
    expect(element).toHaveAttribute('data-scale-min', '0');
    expect(element).toHaveAttribute('data-scale-max', '80');
    expect(element.querySelectorAll('[data-week]')).toHaveLength(10);
    expect(element.querySelector('[data-week]')).toHaveAttribute('data-season', '2025');
    expect(element.querySelector('[data-week]')).toHaveAttribute('data-week', '10');
    expect(element.querySelector('[data-week="1"]')).toHaveAttribute('data-season', '2026');
  }
  expect(known.querySelector('[data-season="2026"] .trend-plot > i')).toHaveStyle({ height: '25%' });
  expect(other.querySelector('[data-season="2026"] .trend-plot > i')).toHaveStyle({ height: '50%' });
  expect(known.querySelector('[data-week="18"]')).toHaveAttribute('data-value', '');
  expect(rookie.querySelectorAll('.missing')).toHaveLength(10);
  expect(rookie.querySelector('.trend-plot > i')).not.toBeInTheDocument();
  expect(chart('Known Runner', 'Fantasy points').querySelector('[data-season="2026"]')).toHaveClass('negative');
  expect(chart('Known Runner', 'Fantasy points').querySelector('[data-season="2026"] .trend-plot > i')).toHaveStyle({ top: '80%', height: '4%' });
  expect(screen.getByText('No recorded games in this window')).toBeInTheDocument();
  expect(screen.getByText(/practice-report injury feed is not published yet/)).toBeInTheDocument();
});

test('all three charts use the same complete menu and save choices by position and calendar window', async () => {
  const view = render(<OpportunityTracker meta={meta} />); await ready();
  for (const pos of ['RB', 'WR']) {
    for (const index of [1, 2, 3]) {
      expect(within(screen.getByLabelText(`${pos} chart ${index} metric`)).getAllByRole('option').map(option => option.value)).toEqual(Object.keys(TREND_METRICS));
    }
  }
  fireEvent.change(screen.getByLabelText('RB chart 2 metric'), { target: { value: 'rushing_yards' } });
  expect(chart('Known Runner', 'Rushing yards')).toHaveAttribute('data-scale-max', '120');
  expect(chart('Known Runner', 'Rushing yards').querySelector('[data-season="2026"]')).toHaveAttribute('data-value', '60');
  expect(within(row('Known Runner')).getByText('Rushing yards -12.5 avg')).toBeInTheDocument();
  const averages = within(row('Known Runner')).getByLabelText('Last three calendar weeks averages for Known Runner');
  const average = within(averages).getByText('Rushing yards').closest('div');
  expect(average).toHaveTextContent('45.0');
  expect(average).toHaveTextContent('2/3 values');
  expect(average.title).toContain('2025 W17–2026 W1');
  fireEvent.change(screen.getByLabelText('Opportunity history window'), { target: { value: '5' } });
  await ready();
  expect(latestQuery().get('games')).toBe('5');
  expect(chart('Known Runner', 'Rushing yards').querySelectorAll('[data-week]')).toHaveLength(5);
  const stored = JSON.parse(localStorage.getItem(OPPORTUNITY_PREFS_KEY));
  expect(stored.metrics.RB).toEqual(['snaps', 'rushing_yards', 'fantasy_points']);
  expect(stored.metrics.WR).toEqual(['snaps', 'targets', 'fantasy_points']);
  expect(stored.games).toBe(5);
  view.unmount(); render(<OpportunityTracker meta={meta} />); await ready();
  expect(screen.getByLabelText('RB chart 2 metric')).toHaveValue('rushing_yards');
  expect(screen.getByLabelText('Opportunity history window')).toHaveValue('5');
});

test('keeps continuous ranges separate from matchup extras and opening games, including after reload', async () => {
  const openGame = vi.fn();
  const view = render(<OpportunityTracker meta={meta} onOpenGame={openGame} />); await ready();
  const schedule = screen.getByRole('button', { name: /NYG schedule/ });
  expect(schedule).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(schedule);
  fireEvent.click(screen.getByRole('button', { name: 'Add individual weeks' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select week 8 against DAL' }));
  await waitFor(() => expect(latestQuery().get('weeks')).toBe('1,8'));
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Open Week 8 against DAL game breakdown' }));
  expect(openGame).toHaveBeenCalledWith(expect.objectContaining({ week: 8, gameId: 'game-8' }), 'ppr');
  expect(latestQuery().get('weeks')).toBe('1,8');
  fireEvent.click(screen.getByRole('button', { name: 'Week 1', exact: true }));
  fireEvent.change(screen.getByRole('combobox', { name: 'To', exact: true }), { target: { value: '3' } });
  await waitFor(() => expect(latestQuery().get('weeks')).toBe('1,2,3,8'));
  await ready();
  expect(screen.getByRole('button', { name: /NYG schedule/ })).toHaveTextContent('W1–3 + W8');
  view.unmount(); render(<OpportunityTracker meta={meta} />); await ready();
  expect(latestQuery().get('weeks')).toBe('1,2,3,8');
  expect(screen.getByRole('button', { name: /NYG schedule/ })).toHaveAttribute('aria-expanded', 'false');
});

test('year, scoring and team reach the API; roster and position filters do not change domain scope', async () => {
  const openPlayer = vi.fn();
  function Harness() { const [season, setSeason] = useState(2026); return <OpportunityTracker meta={meta} season={season} onSeasonChange={setSeason} onOpenPlayer={openPlayer} />; }
  render(<Harness />); await ready();
  fireEvent.change(screen.getByLabelText('Opportunity scoring'), { target: { value: 'half' } }); await ready();
  expect(latestQuery().get('scoring')).toBe('half');
  fireEvent.click(await ready());
  expect(openPlayer).toHaveBeenCalledWith({ player_id: 'runner', player_display_name: 'Known Runner' }, expect.any(HTMLElement), 'half');
  expect(within(row('Known Runner')).getAllByText('Half PPR points')).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('Opportunity statistics year'), { target: { value: '2025' } }); await ready();
  expect(latestQuery().get('season')).toBe('2025');
  expect(latestQuery().get('weeks')).toBe(Array.from({ length: 18 }, (_, index) => index + 1).join(','));
  fireEvent.change(screen.getByLabelText('Opportunity team'), { target: { value: 'BUF' } }); await ready();
  expect(latestQuery().get('team')).toBe('BUF');
  const countBefore = fetch.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'RB', exact: true }));
  expect(screen.queryByRole('heading', { name: 'Wide receivers' })).not.toBeInTheDocument();
  expect(chart('Known Runner', 'Snaps')).toHaveAttribute('data-scale-max', '80');
  fireEvent.change(screen.getByLabelText('Opportunity roster view'), { target: { value: 'ROOKIES' } });
  expect(screen.queryByRole('button', { name: 'Known Runner', exact: true })).not.toBeInTheDocument();
  expect(row('Rookie Runner')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(countBefore);
});

test('rejects corrupt preferences and resets valid custom selections to immutable defaults', async () => {
  localStorage.setItem(OPPORTUNITY_PREFS_KEY, JSON.stringify({ version: 1, games: 999, scoring: 'mock', metrics: { RB: ['not_real', 'targets', '__proto__'] }, weekSelections: { 2026: { start: -1, end: 99, extras: [999] } } }));
  render(<OpportunityTracker meta={meta} />); await ready();
  expect(screen.getByLabelText('RB chart 1 metric')).toHaveValue('snaps');
  expect(screen.getByLabelText('RB chart 2 metric')).toHaveValue('targets');
  expect(screen.getByLabelText('RB chart 3 metric')).toHaveValue('fantasy_points');
  expect(latestQuery().get('weeks')).toBe('1');
  expect(latestQuery().get('games')).toBe('10');
  expect(latestQuery().get('scoring')).toBe('ppr');
  fireEvent.click(screen.getByRole('button', { name: 'Reset chart preferences' }));
  expect(screen.getByLabelText('RB chart 2 metric')).toHaveValue('rush_attempts');
  expect(JSON.parse(localStorage.getItem(OPPORTUNITY_PREFS_KEY)).metrics.RB).toEqual(['snaps', 'rush_attempts', 'fantasy_points']);
});

test('old requests cannot replace a newer scoring result', async () => {
  let resolveInitial;
  fetch.mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve; }));
  render(<OpportunityTracker meta={meta} />);
  fireEvent.change(screen.getByLabelText('Opportunity scoring'), { target: { value: 'standard' } });
  await ready();
  const stale = fixture();
  stale.data.groups[0].players = [player('stale', 'Stale Player', [])];
  resolveInitial(response(stale));
  await waitFor(() => expect(screen.queryByText('Stale Player')).not.toBeInTheDocument());
  expect(await ready()).toBeInTheDocument();
  expect(screen.getByLabelText('Opportunity scoring')).toHaveValue('standard');
});
