// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useYahooDashboard } from '../src/lhq/useYahooDashboard.js';
import { isReserveSlot, leagueHealth, leagueSummaries, rosterExposure, teamMatchup, teamStanding } from '../src/lhq/yahooModel.js';

const teamA = '999.l.1.t.1', teamB = '999.l.2.t.1';
const connected = { configured: true, connected: true, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), connectionUrl: 'https://bowser-fantasy-football.vercel.app/#/yahoo' };
const account = {
  season: 2026, checkedAt: '2026-09-27T12:00:00Z',
  leagues: [{ key: '999.l.1', name: 'Private League One', season: 2026 }, { key: '999.l.2', name: 'Private League Two', season: 2026 }],
  teams: [{ key: teamA, leagueKey: '999.l.1', name: 'Private Team One' }, { key: teamB, leagueKey: '999.l.2', name: 'Private Team Two' }],
};
function dashboard(teamKey = teamA, week = 3, season = 2026) {
  return {
    teamKey, week, season, checkedAt: account.checkedAt, errors: {},
    settings: { rosterPositions: [{ position: 'QB', count: 1 }, { position: 'RB', count: 2 }, { position: 'W/R/T', count: 1 }, { position: 'BN', count: 5 }, { position: 'IR', count: 2 }] },
    roster: { week, players: [
      { key: '999.p.1', name: 'Private Starter', slot: 'QB', position: 'QB', team: 'BUF', status: 'Q', points: 0, byeWeek: 7 },
      { key: '999.p.2', name: 'Private Runner', slot: 'RB', position: 'RB', team: 'NYJ', points: 12, byeWeek: week },
      { key: '999.p.3', name: 'Private Reserve', slot: 'IR', position: 'RB', team: 'SEA', status: 'IR', points: null },
      { key: '999.p.4', name: 'Private Flex', slot: 'W/R/T', position: 'WR', team: 'LAR', points: 9 },
    ] },
    standings: [{ key: teamKey, name: 'Private Team', rank: 2, wins: 1, losses: 1, ties: 0, faabBalance: 0, pointsFor: 101.4 }],
    scoreboard: { week, matchups: [{ week, status: 'midevent', teams: [{ key: teamKey, name: 'Private Team', points: 0, projected: null }, { key: `${teamKey.split('.t.')[0]}.t.2`, name: 'Private Opponent', points: 20, projected: 105.4 }] }] },
  };
}
function response(data, ok = true) { return { ok, json: async () => data }; }
function mockReads(handler = () => undefined) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    calls.push({ url, options });
    const custom = await handler(url, options);
    if (custom !== undefined) return custom;
    if (url.endsWith('/status')) return response(connected);
    if (url.includes('/leagues?')) return response(account);
    if (url.includes('/dashboard?')) {
      const query = new URL(url, 'https://fixture.test').searchParams;
      return response(dashboard(query.get('team'), query.get('week') === 'current' ? 3 : Number(query.get('week')), Number(query.get('season'))));
    }
    if (url.endsWith('/refresh')) return response({ refreshed: true });
    if (url.endsWith('/disconnect')) return response({ connected: false });
    throw Error('Unexpected fixture route');
  }));
  return calls;
}
const settle = result => waitFor(() => expect(result.current.busy).toBe(false));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); window.location.hash = '#/yahoo'; });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.location.hash = ''; });

test('health counts exact required starter slots, excludes reserve slots, and preserves unknowns', () => {
  const health = leagueHealth(dashboard());
  expect(health.openSlots).toBe(1);
  expect(health.emptySlots).toEqual([{ slot: 'RB', required: 2, filled: 1, missing: 1 }]);
  expect(health.starterCount).toBe(3); expect(health.reserveCount).toBe(1);
  expect(health.flaggedStarters).toBe(2); expect(health.concerns.some(player => player.name === 'Private Reserve')).toBe(false);
  expect(health.lineupComplete).toBe(false); expect(isReserveSlot('W/R/T')).toBe(false);
  expect(leagueHealth({ ...dashboard(), settings: null }).openSlots).toBeNull();
  expect(leagueHealth({ ...dashboard(), roster: null }).flaggedStarters).toBeNull();
  expect(leagueHealth(null).needsAttention).toBeNull();
  expect(leagueHealth({ ...dashboard(), settings: { rosterPositions: [] } }).lineupComplete).toBeNull();
});
test('duplicate roster identities do not fill extra starter slots and wrong-week rosters stay unavailable', () => {
  const data = dashboard(); data.roster.players.push({ ...data.roster.players[1] });
  expect(leagueHealth(data).openSlots).toBe(1);
  data.roster.week = 2;
  expect(leagueHealth(data).starterCount).toBeNull();
});
test('standing and matchup derivations retain Yahoo zeroes without inventing projections or odds', () => {
  const data = dashboard();
  expect(teamStanding(data).faabBalance).toBe(0);
  expect(teamMatchup(data).team.points).toBe(0); expect(teamMatchup(data).team.projected).toBeNull();
  expect(teamMatchup({ ...data, scoreboard: { ...data.scoreboard, week: 2 } })).toBeNull();
  const summaries = leagueSummaries({ account, dashboards: { [teamA]: data } });
  expect(summaries[0].faabBalance).toBe(0); expect(summaries[0].pendingTrades).toBeNull();
  expect(summaries[0].standingsBasis).toBe('Current season standings');
  expect(summaries[1].faabBalance).toBeNull(); expect(summaries[1].health.lineupComplete).toBeNull();
  expect(summaries[0]).not.toHaveProperty('winProbability');
});
test('exposure joins player keys across owned teams only and states missing coverage', () => {
  const a = dashboard(), b = dashboard(teamB); b.roster.players = [{ ...a.roster.players[0] }, { ...a.roster.players[0] }, { ...a.roster.players[1], key: '999.p.99', name: a.roster.players[0].name }];
  const full = rosterExposure(account, { [teamA]: a, [teamB]: b, ['999.l.9.t.1']: dashboard('999.l.9.t.1') });
  expect(full.complete).toBe(true); expect(full.loadedTeams).toBe(2);
  expect(full.players.find(player => player.key === '999.p.1').teamCount).toBe(2);
  expect(full.players.find(player => player.key === '999.p.1').leagueCount).toBe(2);
  expect(full.players.find(player => player.key === '999.p.99').teamCount).toBe(1);
  expect(rosterExposure(account, { [teamA]: a }).complete).toBe(false);
  expect(rosterExposure(null).complete).toBe(false);
});
test('disconnected status never requests private league resources', async () => {
  const calls = mockReads(url => url.endsWith('/status') ? response({ ...connected, connected: false }) : undefined);
  const { result } = renderHook(() => useYahooDashboard()); await settle(result);
  expect(calls).toHaveLength(1); expect(result.current.teams).toEqual([]);
  expect(result.current.coverage.complete).toBe(false);
});
test('discovery and owned dashboards load sequentially with no-store and memory-only sanitized logs', async () => {
  const hold = deferred();
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  const calls = mockReads(url => url.includes('/dashboard?') && url.includes(teamA) ? hold.promise : undefined);
  const { result } = renderHook(() => useYahooDashboard());
  await waitFor(() => expect(calls.filter(call => call.url.includes('/dashboard?'))).toHaveLength(1));
  expect(result.current.busy).toBe(true);
  await act(async () => { hold.resolve(response(dashboard())); });
  await settle(result);
  expect(Object.keys(result.current.dashboards)).toEqual([teamA, teamB]);
  expect(result.current.coverage.complete).toBe(true); expect(result.current.exposure.complete).toBe(true);
  expect(calls.every(call => call.options.cache === 'no-store' && call.options.credentials === 'same-origin')).toBe(true);
  expect(writes).not.toHaveBeenCalled();
  expect(JSON.stringify(result.current.log)).not.toMatch(/Private|999\.l|999\.p/);
});
test('chosen week reloads every owned team and clears the old lineups immediately', async () => {
  const calls = mockReads(); const { result } = renderHook(() => useYahooDashboard()); await settle(result);
  act(() => result.current.setWeek(2));
  expect(result.current.dashboards).toEqual({});
  await waitFor(() => expect(result.current.dashboards[teamA]?.week).toBe(2)); await settle(result);
  expect(calls.filter(call => call.url.includes('/dashboard?') && call.url.includes('week=2'))).toHaveLength(2);
  const count = calls.length; act(() => result.current.setWeek('2;unsafe'));
  expect(result.current.week).toBe('2'); expect(result.current.errors.week).toMatch(/NFL week/); expect(calls).toHaveLength(count);
});
test('season changes cannot expose old private account data under the new season', async () => {
  const hold = deferred();
  mockReads(url => url.includes('/leagues?season=2025') ? hold.promise : undefined);
  const { result, rerender } = renderHook(({ season }) => useYahooDashboard({ season }), { initialProps: { season: 2026 } });
  await settle(result); rerender({ season: 2025 });
  expect(result.current.account).toBeNull(); expect(result.current.dashboards).toEqual({});
  await act(async () => hold.resolve(response({ season: 2025, teams: [], leagues: [] })));
  await settle(result); expect(result.current.account.season).toBe(2025);
});
test('disconnect clears all private data and rejects late in-flight dashboard results', async () => {
  const hold = deferred(); const calls = mockReads(url => url.includes('/dashboard?') && url.includes(teamA) ? hold.promise : undefined);
  const { result } = renderHook(() => useYahooDashboard());
  await waitFor(() => expect(calls.some(call => call.url.includes('/dashboard?'))).toBe(true));
  let disconnect;
  act(() => { disconnect = result.current.disconnect(); });
  expect(result.current.account).toBeNull();
  await act(async () => { hold.resolve(response(dashboard())); await disconnect; });
  expect(result.current.status.connected).toBe(false); expect(result.current.dashboards).toEqual({});
  expect(calls.filter(call => call.url.includes('/dashboard?'))).toHaveLength(1);
  expect(calls.find(call => call.url.endsWith('/disconnect')).options.method).toBe('POST');
});
test('absolute session expiry clears private memory and rejects queued dashboard reads', async () => {
  vi.useFakeTimers();
  const hold = deferred();
  const expiry = new Date(Date.now() + 10000).toISOString();
  const calls = mockReads(url => url.endsWith('/status') ? response({ ...connected, expiresAt: expiry }) : url.includes('/dashboard?') && url.includes(teamA) ? hold.promise : undefined);
  const { result } = renderHook(() => useYahooDashboard());
  await vi.waitFor(() => expect(calls.some(call => call.url.includes('/dashboard?'))).toBe(true));
  expect(result.current.account).not.toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(result.current.status.connected).toBe(false);
  expect(result.current.account).toBeNull();
  expect(result.current.dashboards).toEqual({});
  expect(result.current.errors.connection).toMatch(/expired/i);
  await act(async () => { hold.resolve(response(dashboard())); });
  expect(result.current.dashboards).toEqual({});
  expect(calls.filter(call => call.url.includes('/dashboard?'))).toHaveLength(1);
});
test('refresh performs POST then verifies status, discovery and fresh dashboards', async () => {
  const calls = mockReads(); const { result } = renderHook(() => useYahooDashboard()); await settle(result);
  const before = calls.length;
  await act(async () => { await result.current.refresh(); });
  const actions = calls.slice(before).map(call => call.url.split('/yahoo/')[1].split('?')[0]);
  expect(actions).toEqual(['refresh', 'status', 'leagues', 'dashboard', 'dashboard']);
  expect(calls[before].options.method).toBe('POST');
  expect(result.current.log.some(entry => entry.event === 'refreshed')).toBe(true);
});
test('authorization or permission errors clear account data and stop remaining team requests', async () => {
  const calls = mockReads(url => url.includes('/dashboard?') && url.includes(teamA) ? response({ error: { code: 'authorization_expired', message: 'PRIVATE_TOKEN' } }, false) : undefined);
  const { result } = renderHook(() => useYahooDashboard()); await settle(result);
  expect(result.current.status.connected).toBe(false); expect(result.current.account).toBeNull();
  expect(calls.filter(call => call.url.includes('/dashboard?'))).toHaveLength(1);
  expect(JSON.stringify(result.current.errors)).not.toContain('PRIVATE_TOKEN');
  expect(JSON.stringify(result.current.log)).not.toContain('PRIVATE_TOKEN');
});
test('generic team failures preserve successful teams but rate limits stop further reads', async () => {
  const calls = mockReads(url => url.includes('/dashboard?') && url.includes(teamA) ? response({ error: { code: 'yahoo_unavailable' } }, false) : undefined);
  const { result } = renderHook(() => useYahooDashboard()); await settle(result);
  expect(result.current.dashboards[teamB]).toBeDefined(); expect(result.current.errors[teamA]).toBeTruthy();
  expect(result.current.coverage.complete).toBe(false); expect(calls.filter(call => call.url.includes('/dashboard?'))).toHaveLength(2);
});
test('research is on demand, owned-team gated and retains pagination and completeness exactly', async () => {
  const page = { season: 2026, teamKey: teamA, leagueKey: '999.l.1', availability: { status: 'FA', players: [{ key: '999.p.100', name: 'Available fixture' }], start: 25, pageSize: 25, complete: false, exhausted: true, nextStart: null, limitReached: false, coverage: 'One page only' }, trades: { items: [], complete: true, limit: 50, limitReached: false, coverage: 'Pending trades only' }, transactions: null, errors: {}, checkedAt: account.checkedAt };
  const calls = mockReads(url => url.includes('/league-research?') ? response(page) : undefined);
  const { result } = renderHook(() => useYahooDashboard()); await settle(result);
  expect(calls.some(call => call.url.includes('/league-research?'))).toBe(false);
  await act(async () => { await result.current.loadResearch('999.l.9.t.1'); });
  expect(calls.some(call => call.url.includes('/league-research?'))).toBe(false);
  await act(async () => { await result.current.loadResearch(teamA, { availabilityStart: 25 }); });
  expect(result.current.research[teamA].availability).toEqual(page.availability);
  expect(result.current.summaries[0].availability.complete).toBe(false);
  expect(result.current.summaries[0].pendingTrades.count).toBe(0);
  expect(calls.find(call => call.url.includes('/league-research?')).url).toContain('availabilityStart=25');
});
test('partial research refreshes preserve existing ownership and transaction sections', async () => {
  let second = false;
  const first = { season: 2026, teamKey: teamA, leagueKey: '999.l.1', availability: null, trades: null, transactions: { items: [{ key: '999.l.1.tr.1', type: 'add', players: [] }], complete: true, limit: 50, coverage: 'Fixture transactions' }, ownership: { requested: 1, matched: 1, complete: true, matches: [{ id: 'fixture|RB|NYG', owned: false, ownershipType: 'freeagents' }] }, errors: {}, checkedAt: account.checkedAt };
  const page = { season: 2026, teamKey: teamA, leagueKey: '999.l.1', availability: { status: 'FA', players: [{ key: '999.p.100', name: 'Available fixture' }], start: 0, pageSize: 25, complete: false, exhausted: false, nextStart: 25, limitReached: false, coverage: 'One page only' }, trades: null, transactions: null, ownership: null, errors: {}, checkedAt: account.checkedAt };
  mockReads(url => url.includes('/league-research?') ? response(second ? page : first) : undefined);
  const { result } = renderHook(() => useYahooDashboard()); await settle(result);
  await act(async () => { await result.current.loadResearch(teamA, { include: 'transactions,ownership', players: [{ id: 'fixture|RB|NYG', name: 'Fixture', team: 'NYG', position: 'RB' }] }); });
  second = true;
  await act(async () => { await result.current.loadResearch(teamA, { include: 'availability', availabilityStart: 0 }); });
  expect(result.current.research[teamA].availability.players).toHaveLength(1);
  expect(result.current.research[teamA].transactions.items).toHaveLength(1);
  expect(result.current.research[teamA].ownership.matches[0].id).toBe('fixture|RB|NYG');
});
test('research failures never leave a stale successful availability claim', async () => {
  let fail = false;
  mockReads(url => url.includes('/league-research?') ? fail ? response({ error: { code: 'rate_limited', message: 'PRIVATE' } }, false) : response({ season: 2026, teamKey: teamA, leagueKey: '999.l.1', availability: { players: [], complete: true }, trades: null, errors: {} }) : undefined);
  const { result } = renderHook(() => useYahooDashboard()); await settle(result);
  await act(async () => { await result.current.loadResearch(teamA); }); expect(result.current.research[teamA]).toBeDefined();
  fail = true;
  await act(async () => { await result.current.loadResearch(teamA); });
  expect(result.current.research[teamA]).toBeUndefined(); expect(result.current.errors[`research:${teamA}`]).toMatch(/limit/);
});
test('connection redirects only to canonical start and logs static text', async () => {
  const navigate = vi.fn(); mockReads(url => url.endsWith('/status') ? response({ ...connected, connected: false }) : undefined);
  const { result } = renderHook(() => useYahooDashboard({ navigate })); await settle(result);
  act(() => result.current.connect());
  expect(navigate).toHaveBeenCalledWith('https://bowser-fantasy-football.vercel.app/api/v1/auth/yahoo/start');
  expect(result.current.log.at(-1).event).toBe('redirect');
});
test('rate limits stop the remaining dashboard batch without inventing complete coverage', async () => {
  const calls = mockReads(url => url.includes('/dashboard?') && url.includes(teamA) ? response({ error: { code: 'rate_limited' } }, false) : undefined);
  const { result } = renderHook(() => useYahooDashboard()); await settle(result);
  expect(calls.filter(call => call.url.includes('/dashboard?'))).toHaveLength(1);
  expect(result.current.coverage.complete).toBe(false); expect(result.current.account).not.toBeNull();
  expect(result.current.errors[teamA]).toMatch(/limit/);
});
test('research authorization failure cancels queued dashboard work and clears successful private reads', async () => {
  const hold = deferred();
  const calls = mockReads(url => {
    if (url.includes('/dashboard?') && url.includes(teamA)) return hold.promise;
    if (url.includes('/league-research?')) return response({ error: { code: 'fantasy_access_denied' } }, false);
  });
  const { result } = renderHook(() => useYahooDashboard());
  await waitFor(() => expect(calls.some(call => call.url.includes('/dashboard?'))).toBe(true));
  let research;
  act(() => { research = result.current.loadResearch(teamA); });
  await act(async () => { hold.resolve(response(dashboard())); await research; });
  await settle(result);
  expect(result.current.account).toBeNull(); expect(result.current.dashboards).toEqual({}); expect(result.current.research).toEqual({});
  expect(calls.filter(call => call.url.includes('/dashboard?'))).toHaveLength(1);
});
test('mismatched dashboard identity is rejected without mixing leagues', async () => {
  mockReads(url => url.includes('/dashboard?') && url.includes(teamA) ? response(dashboard(teamB)) : undefined);
  const { result } = renderHook(() => useYahooDashboard()); await settle(result);
  expect(result.current.dashboards[teamA]).toBeUndefined(); expect(result.current.errors[teamA]).toMatch(/unexpected/);
  expect(result.current.dashboards[teamB].teamKey).toBe(teamB);
});
