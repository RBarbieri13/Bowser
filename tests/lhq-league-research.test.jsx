// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { LhqProvider } from '../src/lhq/shared.jsx';
import { LeagueResearchPanel, MarkPickupButton, ownershipRequests, transactionSummary, transactionCoverage, useLeaguePickups } from '../src/lhq/LeagueResearch.jsx';
import { MarketPulse } from '../src/lhq/MarketPulse.jsx';
import { Waivers } from '../src/lhq/Waivers.jsx';
import dfsWeekly from '../data/dfs-weekly.json';

const teamKey = '999.l.1.t.1';
const yahoo = {
  leagues: [{ key: '999.l.1', name: 'Fixture League' }],
  teams: [{ key: teamKey, leagueKey: '999.l.1', name: 'Fixture Team' }],
  dashboards: {
    [teamKey]: {
      teamKey,
      roster: { week: 4, players: [{ key: '999.p.7', name: 'Private Starter', position: 'RB', team: 'NYG', slot: 'RB', points: 0 }] },
    },
  },
  researchBusy: {},
  errors: {},
  loadResearch: vi.fn(),
  research: {
    [teamKey]: {
      teamKey,
      checkedAt: '2026-09-28T12:00:00Z',
      availability: { players: [{ key: '999.p.1', name: 'Josh Allen', position: 'QB', team: 'BUF' }, { key: '999.p.2', name: 'Unknown Runner', position: 'RB', team: 'NYG' }] },
      transactions: { items: [{ key: 't1', type: 'add', status: 'successful', players: [{ name: 'Fixture Alpha', position: 'RB', team: 'NYG', action: 'add' }] }, { key: 't2', type: 'drop', status: 'successful', players: [] }], limit: 50, coverage: 'Most recent fixture transactions' },
      ownership: { requested: 2, matched: 1, matches: [{ id: 'fixturealpha|RB|NYG', owned: true, ownershipType: 'team' }, { id: 'fixturereceiver|RB|NYG', owned: null, ownershipType: null }] },
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
function PickupHarness({ row }) {
  const pickups = useLeaguePickups(2026, '999.l.1');
  return <MarkPickupButton row={row} pickups={pickups} name={row.name} />;
}

test('ownership requests keep only bounded complete public identities', () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({ id: `id-${index}`, name: `Player ${index}`, team: 'NYG', position: 'RB' }));
  rows.push({ id: 'bad', name: '', team: 'NYG', position: 'RB' });
  expect(ownershipRequests(rows)).toHaveLength(24);
  expect(ownershipRequests(rows)[0]).toEqual({ id: 'player0|RB|NYG', name: 'Player 0', team: 'NYG', position: 'RB' });
  expect(ownershipRequests(rows, 24, ['player0|RB|NYG'])[0].id).toBe('player1|RB|NYG');
});

test('transaction summary derives add drop and net from actual returned Yahoo transaction players', () => {
  const summary = transactionSummary(yahoo.research[teamKey], { name: 'Fixture Alpha', team: 'NYG', position: 'RB' });
  expect(summary).toMatchObject({ adds: 1, drops: 0, total: 1, net: 1, coverage: 'Most recent fixture transactions' });
  expect(transactionSummary({ transactions: null }, { name: 'Fixture Alpha', team: 'NYG', position: 'RB' })).toBeNull();
});

test('canonical pickup markers share across rows with different source ids', () => {
  show(<><PickupHarness row={{ id: 'sleeper:fixture', name: 'Fixture Alpha', team: 'NYG', position: 'RB' }} /><PickupHarness row={{ playerId: 'waiver-player-key', name: 'Fixture Alpha', team: 'NYG', position: 'RB' }} /></>);
  const buttons = screen.getAllByRole('button', { name: 'Mark pickup Fixture Alpha' });
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[0]);
  expect(screen.getAllByRole('button', { name: 'Unmark pickup Fixture Alpha' })).toHaveLength(2);
  expect(Object.values(localStorage).join(' ')).toContain('fixturealpha|RB|NYG');
  expect(Object.values(localStorage).join(' ')).not.toContain('sleeper:fixture');
  expect(Object.values(localStorage).join(' ')).not.toContain('waiver-player-key');
});

test('league research panel loads roster, availability, transactions and canonical ownership requests', () => {
  show(<LeagueResearchPanel yahoo={yahoo} season={2026} rows={[{ id: 'sleeper:1', name: 'Josh Allen', team: 'BUF', position: 'QB' }]} selectedTeamKey={teamKey} onTeamChange={vi.fn()} title="Fixture research" />);
  expect(screen.getByLabelText('Yahoo league')).toHaveTextContent('Fixture League · Fixture Team');
  expect(screen.getByText(/Ownership checks are bounded to 1 visible rows/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Roster' }));
  expect(screen.getByText(/Roster week 4/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Private Starter' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Free agents' }));
  fireEvent.click(screen.getByRole('button', { name: 'Read league' }));
  expect(yahoo.loadResearch).toHaveBeenCalledWith(teamKey, expect.objectContaining({ include: 'availability,transactions,ownership', players: [{ id: 'joshallen|QB|BUF', name: 'Josh Allen', team: 'BUF', position: 'QB' }] }));
  expect(screen.getByText(/transactions 2 actual returned of limit 50/i)).toBeInTheDocument();
  const slate = dfsWeekly.slates[dfsWeekly.defaultSlate];
  const sourcePlayer = slate.records.find(player => player.name === 'Josh Allen' && player.team === 'BUF' && player.position === 'QB');
  expect(Number.isFinite(sourcePlayer.projection)).toBe(true);
  expect(screen.getByText(sourcePlayer.projection.toFixed(1))).toBeInTheDocument();
  expect(screen.getByText(/Source publication is separate from capture/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mark pickup Josh Allen' }));
  const saved = Object.values(localStorage).join(' ');
  expect(saved).toContain('joshallen|QB|BUF');
  expect(saved).not.toContain('Josh Allen');
  expect(saved).not.toContain('Fixture Team');
});

test('pickup markers synchronize on the same page and unresolved canonical ids remain visible', async () => {
  show(<><LeagueResearchPanel yahoo={yahoo} season={2026} rows={[]} selectedTeamKey={teamKey} onTeamChange={vi.fn()} title="A" /><LeagueResearchPanel yahoo={yahoo} season={2026} rows={[]} selectedTeamKey={teamKey} onTeamChange={vi.fn()} title="B" /></>);
  const marks = screen.getAllByRole('button', { name: 'Mark pickup Josh Allen' });
  fireEvent.click(marks[0]);
  expect(screen.getAllByRole('button', { name: 'Unmark pickup Josh Allen' })).toHaveLength(2);
  fireEvent.click(screen.getAllByRole('button', { name: 'Pickup list' })[1]);
  expect(screen.getAllByText('Josh Allen').length).toBeGreaterThan(0);
  localStorage.setItem('bowser:lhq:pickup-drafts:v2:2026:999.l.1', JSON.stringify([{ id: 'unresolved|RB|NYG', preference: 1 }]));
  window.dispatchEvent(new CustomEvent('bowser:lhq:pickup-drafts:changed', { detail: { key: 'bowser:lhq:pickup-drafts:v2:2026:999.l.1' } }));
  await waitFor(() => expect(screen.getByText(/Unknown saved player/)).toBeInTheDocument());
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
  expect(within(grid).getByRole('columnheader',{name:/Total/})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Refresh Yahoo activity'}));
  expect(yahoo.loadResearch).toHaveBeenCalledWith(teamKey,{include:'transactions'});
});


test('Yahoo transaction counts separate player actions, deduplicate events and exclude unsuccessful/pending actions', () => {
 const row={name:'Fixture Alpha',team:'NYG',position:'RB'}, other={name:'Fixture Beta',team:'BUF',position:'WR'};
 const event={key:'t1',type:'add/drop',status:'successful',timestamp:1790000000,players:[{...row,key:'999.p.1',action:'add'},{...row,key:'999.p.1',action:'add'},{...other,key:'999.p.2',action:'drop'}]};
 const research={checkedAt:'2026-09-29T00:00:00Z',transactions:{items:[event,event,{...event,key:'t2',status:'pending'},{...event,key:'t3',status:'unsuccessful'}],limit:50,complete:false}};
 expect(transactionSummary(research,row)).toMatchObject({adds:1,drops:0,total:1,net:1,complete:false});
 expect(transactionSummary(research,other)).toMatchObject({adds:0,drops:1,total:1,net:-1});
 expect(transactionCoverage(research)).toMatch(/bounded to latest 50/);
 expect(transactionCoverage(research)).toMatch(/Not Yahoo-wide/);
 expect(transactionCoverage(research)).toMatch(/read time unavailable/);
 expect(transactionCoverage({...research,checkedAt:'2099-01-01T00:00:00Z'})).not.toContain('2099');
});

test('Yahoo activity preserves unknown, ambiguous identity and confirmed complete zero distinctions', () => {
 const row={name:'Fixture Alpha',team:'NYG',position:'RB'};
 expect(transactionSummary({transactions:{items:[],complete:false}},row)).toBeNull();
 expect(transactionSummary({transactions:{items:[],complete:true}},row)).toBeNull();
 const research={transactions:{items:[],complete:true},ownership:{matches:[{id:'fixturealpha|RB|NYG',playerKey:'999.p.1',match:'exact-name-team-position'}]}};
 expect(transactionSummary(research,row)).toMatchObject({adds:0,drops:0,total:0,net:0});
 const event=key=>({key:`tr-${key}`,status:'successful',type:'add',players:[{...row,key,action:'add'}]});
 expect(transactionSummary({transactions:{items:[event('999.p.1'),event('999.p.2')]}},row)).toBeNull();
 expect(transactionSummary({transactions:{items:[{key:'x',status:'successful',type:'add/drop',players:[row]}]}},row)).toBeNull();
});


test('Waivers adds sortable Yahoo league activity columns with a refresh and explicit sample scope', async () => {
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({rows:[{id:'fixture-a',playerId:'fixture-a',name:'Fixture Alpha',position:'RB',team:'NYG',rankings:{},faab:{},stats:{fantasy_points:0,trends:[]},activity:{}}],meta:{season:2026,waiverWeek:4,statsWeeks:[3],selectedStatsWeeks:[3],availableWeeks:[4],sources:[]}})})));
 show(<Waivers season={2026} scoring="ppr" setSeason={vi.fn()} setScoring={vi.fn()} onOpen={vi.fn()} yahoo={yahoo}/>);
 const grid=await screen.findByRole('table',{name:'Player statistics'});
 await waitFor(()=>expect(within(grid).getByText('Fixture Alpha')).toBeInTheDocument());
 expect(screen.getByLabelText('Yahoo activity league')).toHaveTextContent('Fixture League');
 expect(within(grid).getByRole('columnheader',{name:/Total/})).toBeInTheDocument();
 expect(screen.getByText(/bounded to latest 50; totals may be incomplete/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Refresh Yahoo activity'}));
 expect(yahoo.loadResearch).toHaveBeenCalledWith(teamKey,{include:'transactions'});
 expect(Object.values(localStorage).join(' ')).not.toContain('Most recent fixture transactions');
 expect(Object.values(localStorage).join(' ')).not.toContain('Fixture League');
});
