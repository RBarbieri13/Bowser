// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { LhqProvider } from '../src/lhq/shared.jsx';
import { LeagueResearchPanel, ownershipRequests } from '../src/lhq/LeagueResearch.jsx';
import { MarketPulse } from '../src/lhq/MarketPulse.jsx';

const teamKey = '999.l.1.t.1';
const yahoo = {
  teams: [{ key: teamKey, leagueKey: '999.l.1', name: 'Fixture Team' }],
  researchBusy: {},
  errors: {},
  loadResearch: vi.fn(),
  research: {
    [teamKey]: {
      teamKey,
      checkedAt: '2026-09-28T12:00:00Z',
      availability: { players: [{ key: '999.p.1', name: 'Josh Allen', position: 'QB', team: 'BUF' }, { key: '999.p.2', name: 'Unknown Runner', position: 'RB', team: 'NYG' }] },
      transactions: { items: [{ key: 't1' }, { key: 't2' }], limit: 50 },
      ownership: { requested: 2, matched: 1, matches: [{ id: 'sleeper:1', owned: true, ownershipType: 'team' }, { id: 'sleeper:2', owned: null, ownershipType: null }] },
    },
  },
};
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  vi.stubGlobal('innerWidth', 1920);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const show = child => render(<LhqProvider>{child}</LhqProvider>);

test('ownership requests keep only bounded complete public identities', () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({ id: `id-${index}`, name: `Player ${index}`, team: 'NYG', position: 'RB' }));
  rows.push({ id: 'bad', name: '', team: 'NYG', position: 'RB' });
  expect(ownershipRequests(rows)).toHaveLength(24);
  expect(ownershipRequests(rows)[0]).toEqual({ id: 'id-0', name: 'Player 0', team: 'NYG', position: 'RB' });
});

test('league research panel loads availability, transactions and ownership for visible rows and stores only pickup ids', () => {
  show(<LeagueResearchPanel yahoo={yahoo} season={2026} rows={[{ id: 'sleeper:1', name: 'Josh Allen', team: 'BUF', position: 'QB' }]} selectedTeamKey={teamKey} onTeamChange={vi.fn()} title="Fixture research" />);
  fireEvent.click(screen.getByRole('button', { name: 'Read league' }));
  expect(yahoo.loadResearch).toHaveBeenCalledWith(teamKey, expect.objectContaining({ include: 'availability,transactions,ownership', players: [{ id: 'sleeper:1', name: 'Josh Allen', team: 'BUF', position: 'QB' }] }));
  expect(screen.getByText(/transactions 2 actual returned of limit 50/i)).toBeInTheDocument();
  expect(screen.getByText('23.9')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mark pickup Josh Allen' }));
  const saved = Object.values(localStorage).join(' ');
  expect(saved).toContain('999.p.1');
  expect(saved).not.toContain('Josh Allen');
  expect(saved).not.toContain('Fixture Team');
});

test('market pulse renders explicit Yahoo ownership marks and unknown dashes without fake leagues', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => {
    const provider = new URL(url, 'https://example.test').searchParams.get('provider');
    return { ok: true, json: async () => ({ provider, window: provider === 'sleeper' ? '24' : 'current', capturedAt: Date.now(), rows: provider === 'sleeper' ? [{ id: 'sleeper:1', name: 'Fixture Alpha', team: 'NYG', position: 'RB', adds: 4, drops: 1, net: 3 }] : [{ id: 'espn:1', name: 'Fixture Alpha', team: 'NYG', position: 'RB', rosterPct: 2, startPct: 1 }] }) };
  }));
  show(<MarketPulse season={2026} setSeason={vi.fn()} onOpen={vi.fn()} yahoo={yahoo} />);
  const grid = await screen.findByRole('table', { name: 'Player statistics' });
  expect(within(grid).getByRole('columnheader', { name: /Y1/ })).toBeInTheDocument();
  expect(within(grid).queryByRole('columnheader', { name: /Y2/ })).not.toBeInTheDocument();
  expect(within(grid).getByText('✓')).toBeInTheDocument();
});
