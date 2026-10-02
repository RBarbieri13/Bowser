import test from 'node:test';
import assert from 'node:assert/strict';
import { newsArticleLeagueContext, newsPlayerLeagueContext, newsRosterMatches } from '../src/lhq/fantasyNewsContext.js';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const CHECKED = '2026-10-01T11:00:00Z';
const teamA = '999.l.1.t.1', teamB = '999.l.2.t.1';
const publicPlayer = { playerId: 'public-player-1', name: 'Fixture Alpha', team: 'NYG', position: 'RB' };
const yahooPlayer = { key: '999.p.1', name: 'Fixture Alpha', team: 'NYG', position: 'RB', slot: 'RB', status: 'Q', privateBody: 'RESPONSE_BODY_SENTINEL' };
const options = { now: NOW };
const context = (player, yahoo) => newsPlayerLeagueContext(player, yahoo, 2026, options);
function account() {
  const teams = [{ key: teamA, leagueKey: '999.l.1', name: 'Private Team A' }, { key: teamB, leagueKey: '999.l.2', name: 'Private Team B' }];
  const leagues = [{ key: '999.l.1', name: 'Private League A', season: 2026 }, { key: '999.l.2', name: 'Private League B', season: 2026 }];
  return {
    status: { connected: true, expiresAt: new Date(NOW + 8 * 3600000).toISOString() },
    account: { season: 2026, teams, leagues, checkedAt: CHECKED }, teams, leagues, week: 'current', errors: {}, research: {},
    dashboards: { [teamA]: { teamKey: teamA, season: 2026, week: 4, checkedAt: CHECKED, roster: { week: 4, players: [structuredClone(yahooPlayer)] } } },
  };
}
function research(yahoo, { teamKey = teamB, status = 'FA', players = [structuredClone(yahooPlayer)], availability = {}, ownership = null, errors = {} } = {}) {
  yahoo.research[teamKey] = {
    season: 2026, teamKey, leagueKey: teamKey.split('.t.')[0], checkedAt: CHECKED, errors,
    availability: { status, players, start: 0, pageSize: 25, exhausted: false, nextStart: 25, complete: false, limitReached: false, ...availability }, ownership,
  };
  return yahoo;
}
const ownershipMatch = (owned, ownershipType) => ({ id: 'request-1', playerKey: '999.p.1', name: publicPlayer.name, team: publicPlayer.team, position: publicPlayer.position, owned, ownershipType, match: 'exact-name-team-position' });

test('owned rosters and available players in another league compose as an affirmative OR', () => {
  const result = context(publicPlayer, research(account()));
  assert.equal(result.relevant, true);
  assert.deepEqual(result.owned.map(match => match.leagueKey), ['999.l.1']);
  assert.deepEqual(result.available.map(match => match.leagueKey), ['999.l.2']);
  assert.equal(result.owned[0].week, 4);
  assert.equal(result.owned[0].checkedAt, CHECKED);
  assert.equal(result.owned[0].captureAgeVerified, true);
  assert.equal(result.coverage.partial, true);
  assert.equal(result.coverage.loadedRosterCount, 1);
  assert.equal(result.coverage.totalTeams, 2);
  assert(!JSON.stringify(result).includes('RESPONSE_BODY_SENTINEL'));
});

test('FA, W and A come from the availability envelope; player.status remains a health flag', () => {
  for (const status of ['FA', 'W', 'A']) {
    const result = context(publicPlayer, research(account(), { status }));
    assert.equal(result.available[0].status, status);
    assert.equal(result.available[0].player.status, 'Q');
    assert.equal(result.available[0].method, 'availability-page');
    assert.equal(result.available[0].coverage.partial, true);
    assert.equal(result.available[0].conditional, true);
  }
  const invalid = research(account(), { status: 'Q', players: [{ ...yahooPlayer, status: 'FA' }] });
  assert.equal(context(publicPlayer, invalid).available.length, 0);
});

test('bounded pool absence proves neither my ownership nor availability, even on a complete page', () => {
  const yahoo = research(account(), { players: [], availability: { exhausted: true, complete: true, nextStart: null } });
  yahoo.dashboards = {};
  const result = context(publicPlayer, yahoo);
  assert.equal(result.relevant, false);
  assert.deepEqual(result.owned, []);
  assert.deepEqual(result.available, []);
  assert.deepEqual(result.coverage.unknownLeagueKeys, ['999.l.1', '999.l.2']);
  assert.equal(result.coverage.completeAvailabilityLeagues, 1);
  assert.equal(result.coverage.partial, true);
});

test('explicit ownership responses require both the boolean and source-native ownership type', () => {
  for (const [type, status] of [['freeagents', 'FA'], ['waivers', 'W']]) {
    const yahoo = research(account(), { players: [], ownership: { matches: [ownershipMatch(false, type)], complete: true, requested: 1, matched: 1 } });
    const result = context(publicPlayer, yahoo);
    assert.equal(result.available[0].status, status);
    assert.equal(result.available[0].method, 'ownership-response');
    assert.equal(result.available[0].coverage.complete, false);
  }
  for (const [owned, type] of [[true, 'team'], [null, 'freeagents'], [false, 'team'], [true, 'freeagents']]) {
    const yahoo = research(account(), { players: [], ownership: { matches: [ownershipMatch(owned, type)] } });
    yahoo.dashboards = {};
    const result = context(publicPlayer, yahoo);
    assert.equal(result.owned.length, 0, 'league team ownership never proves this is my roster');
    assert.equal(result.available.length, 0);
  }
});

test('session logout, missing authorization, absolute eight-hour expiry and wrong seasons suppress private facts', () => {
  for (const mutate of [
    yahoo => { yahoo.status.connected = false; },
    yahoo => { delete yahoo.status; },
    yahoo => { yahoo.status.expiresAt = 'invalid'; },
    yahoo => { yahoo.status.expiresAt = new Date(NOW).toISOString(); },
    yahoo => { yahoo.account.season = 2025; },
  ]) {
    const yahoo = research(account()); mutate(yahoo);
    const result = context(publicPlayer, yahoo);
    assert.equal(result.connected, false);
    assert.equal(result.relevant, false);
    assert.equal(result.owned.length + result.available.length, 0);
  }
  const yahoo = research(account());
  const expired = newsPlayerLeagueContext(publicPlayer, yahoo, 2026, { now: NOW + 8 * 3600000 });
  assert.equal(expired.reason, 'expired');
  assert.equal(expired.relevant, false);
});

test('only authoritative account-discovered teams and leagues participate after account replacement', () => {
  const yahoo = research(account());
  yahoo.account = { season: 2026, teams: [{ key: '999.l.3.t.1', leagueKey: '999.l.3', name: 'New account team' }], leagues: [{ key: '999.l.3', name: 'New account league', season: 2026 }] };
  const result = context(publicPlayer, yahoo);
  assert.equal(result.relevant, false);
  assert(!JSON.stringify(result).includes('Private Team'));
  assert(!JSON.stringify(result).includes('Private League'));
});

test('wrong dashboard team, season, selected week, roster week and roster errors are unknown', () => {
  for (const mutate of [
    yahoo => { yahoo.dashboards[teamA].teamKey = teamB; },
    yahoo => { yahoo.dashboards[teamA].season = 2025; },
    yahoo => { yahoo.dashboards[teamA].roster.week = 3; },
    yahoo => { yahoo.week = '3'; },
    yahoo => { yahoo.dashboards[teamA].errors = { roster: 'Unavailable' }; },
    yahoo => { yahoo.errors[teamA] = 'Read failed'; },
  ]) {
    const yahoo = account(); mutate(yahoo);
    assert.equal(context(publicPlayer, yahoo).owned.length, 0);
  }
});

test('wrong research team, league, season, section errors and undiscovered league keys suppress availability', () => {
  for (const mutate of [
    yahoo => { yahoo.research[teamB].teamKey = teamA; },
    yahoo => { yahoo.research[teamB].leagueKey = '999.l.3'; },
    yahoo => { yahoo.research[teamB].season = 2025; },
    yahoo => { yahoo.research[teamB].errors.availability = 'Unavailable'; },
    yahoo => { yahoo.errors[`research:${teamB}`] = 'Read failed'; },
    yahoo => { yahoo.account.leagues[1].season = 2025; },
    yahoo => { yahoo.account.teams[1].leagueKey = '999.l.3'; },
  ]) {
    const yahoo = research(account()); mutate(yahoo);
    assert.equal(context(publicPlayer, yahoo).available.length, 0);
  }
});

test('name-only public affected players and incomplete public identities never join through private names', () => {
  for (const player of [{ name: publicPlayer.name }, { name: publicPlayer.name, team: 'NYG' }, { ...publicPlayer, team: 'UNK' }, { ...publicPlayer, position: 'FLEX' }, null]) {
    const result = context(player, research(account()));
    assert.equal(result.identityResolved, false);
    assert.equal(result.relevant, false);
  }
  assert.equal(context({ ...publicPlayer, playerId: 'different-public-id' }, account()).owned.length, 1, 'public IDs are not Yahoo player keys');
  assert.equal(context({ ...publicPlayer, team: 'BUF' }, account()).relevant, false);
});

test('duplicate normalized identities and duplicate keys stay ambiguous', () => {
  for (const duplicate of [{ ...yahooPlayer, name: 'Fixture Alpha Jr.', key: '999.p.9' }, { ...yahooPlayer }]) {
    const yahoo = account(); yahoo.dashboards[teamA].roster.players.push(duplicate);
    const result = context(publicPlayer, yahoo);
    assert.equal(result.owned.length, 0);
    assert.equal(result.conflicts[0].reason, 'ambiguous-roster-identity');
  }
  const yahoo = research(account(), { players: [yahooPlayer, { ...yahooPlayer, name: 'Fixture Alpha Sr.', key: '999.p.9' }] });
  assert.equal(context(publicPlayer, yahoo).available.length, 0);
});

test('wrong Yahoo game keys and multiple cross-league player keys cannot masquerade as one identity', () => {
  const wrongKey = research(account(), { players: [{ ...yahooPlayer, key: '888.p.1' }] });
  assert.equal(context(publicPlayer, wrongKey).available.length, 0);
  const conflicting = research(account(), { players: [{ ...yahooPlayer, key: '999.p.9' }] });
  const result = context(publicPlayer, conflicting);
  assert.equal(result.relevant, false);
  assert(result.conflicts.some(value => value.reason === 'conflicting-player-identities'));
});

test('same-league affirmative roster/availability and ownership contradictions are rejected', () => {
  const ownAndAvailable = research(account(), { teamKey: teamA });
  const first = context(publicPlayer, ownAndAvailable);
  assert.equal(first.relevant, false);
  assert(first.conflicts.some(value => value.reason === 'contradictory-ownership'));
  const explicitConflict = research(account(), { ownership: { matches: [ownershipMatch(true, 'team')] } });
  assert.equal(context(publicPlayer, explicitConflict).available.length, 0);
  const mechanismConflict = research(account(), { status: 'W', ownership: { matches: [ownershipMatch(false, 'freeagents')] } });
  assert.equal(context(publicPlayer, mechanismConflict).available.length, 0);
});

test('legacy research envelope clocks never turn retained availability into a verified fresh fact', () => {
  const yahoo = research(account());
  yahoo.research[teamB].checkedAt = '2026-10-01T11:59:00Z';
  const match = context(publicPlayer, yahoo).available[0];
  assert.equal(match.checkedAt, null);
  assert.equal(match.envelopeCheckedAt, '2026-10-01T11:59:00Z');
  assert.equal(match.captureAgeVerified, false);
  assert.equal(match.ageLabel, 'Capture age unverified');
  assert.equal(match.conditional, true);
});

test('per-item source clocks survive page accumulation and old explicit null clocks remain unknown', () => {
  const yahoo = research(account(), { players: [{ ...yahooPlayer, checkedAt: '2026-09-30T18:00:00Z' }], availability: { accumulated: true, checkedAt: '2026-10-01T11:59:00Z', complete: true, exhausted: true, nextStart: null } });
  let match = context(publicPlayer, yahoo).available[0];
  assert.equal(match.checkedAt, '2026-09-30T18:00:00Z');
  assert.equal(match.captureAgeVerified, true);
  assert.equal(match.coverage.partial, true);
  assert.equal(match.conditional, true, 'no invented TTL or live assertion');
  yahoo.research[teamB].availability.players[0].checkedAt = null;
  match = context(publicPlayer, yahoo).available[0];
  assert.equal(match.checkedAt, null);
  assert.equal(match.captureAgeVerified, false);
});

test('explicit section clocks are usable without accumulation; future clocks remain unverified and stale flags remain conditional', () => {
  const yahoo = research(account(), { availability: { checkedAt: CHECKED, stale: true } });
  let match = context(publicPlayer, yahoo).available[0];
  assert.equal(match.checkedAt, CHECKED);
  assert.equal(match.stale, true);
  assert.equal(match.freshness, 'stale-loaded');
  assert.equal(match.conditional, true);
  yahoo.research[teamB].availability.checkedAt = new Date(NOW + 1).toISOString();
  match = context(publicPlayer, yahoo).available[0];
  assert.equal(match.checkedAt, null);
  assert.equal(match.captureAgeVerified, false);
});

test('article projection deduplicates repeated mentions, preserves private/public separation and has no mutation', () => {
  const yahoo = research(account());
  const article = { id: 'public-report', headline: 'Source report', players: [publicPlayer, publicPlayer], affectedPlayers: [{ name: publicPlayer.name }] };
  const before = JSON.stringify({ yahoo, article });
  const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } };
  freeze(yahoo); freeze(article);
  const result = newsArticleLeagueContext(article, yahoo, 2026, options);
  assert.equal(result.owned.length, 1);
  assert.equal(result.available.length, 1);
  assert.deepEqual(newsRosterMatches(article, yahoo, 2026, options), result.owned);
  assert.equal(JSON.stringify({ yahoo, article }), before);
  assert(!JSON.stringify(article).includes('Private'));
  assert.equal(newsArticleLeagueContext({ players: [] }, yahoo, 2026, options).relevant, false);
});

test('malformed null rows cannot crash a valid affirmative roster, pool or ownership match', () => {
  const yahoo = research(account(), { players: [null, yahooPlayer, undefined], ownership: { matches: [null, ownershipMatch(false, 'freeagents'), undefined] } });
  yahoo.dashboards[teamA].roster.players.push(null, undefined);
  const result = context(publicPlayer, yahoo);
  assert.equal(result.owned.length, 1);
  assert.equal(result.available.length, 1);
  assert.equal(result.available[0].observations.length, 2);
  assert.equal(result.coverage.partial, true);
});

test('capture clocks require valid non-future ISO timestamps and preserve explicit timezone offsets', () => {
  for (const checkedAt of [NOW - 60000, 'Wed, 30 Sep 2026 18:00:00 GMT', '2026-09-30', '2026-02-30T18:00:00Z', '2026-09-30T24:00:00Z', { toString: () => CHECKED }, '2026-10-01T13:00:00Z']) {
    const yahoo = research(account(), { players: [{ ...yahooPlayer, checkedAt }] });
    const match = context(publicPlayer, yahoo).available[0];
    assert.equal(match.checkedAt, null);
    assert.equal(match.captureAgeVerified, false);
    assert.equal(match.conditional, true);
  }
  const offset = '2026-10-01T07:00:00-04:00';
  const match = context(publicPlayer, research(account(), { players: [{ ...yahooPlayer, checkedAt: offset }] })).available[0];
  assert.equal(match.checkedAt, offset);
  assert.equal(match.captureAgeVerified, true);
});

test('non-ISO and impossible absolute expiry clocks do not establish authorization', () => {
  for (const expiresAt of [NOW + 8 * 3600000, '2027-01-01', '2027-02-30T12:00:00Z', 'Thu, 01 Oct 2026 20:00:00 GMT']) {
    const yahoo = research(account()); yahoo.status.expiresAt = expiresAt;
    assert.equal(context(publicPlayer, yahoo).connected, false);
    assert.equal(context(publicPlayer, yahoo).relevant, false);
  }
  const yahoo = research(account()); yahoo.status.expiresAt = '2026-10-01T16:00:00-04:00';
  assert.equal(context(publicPlayer, yahoo).connected, true);
});
