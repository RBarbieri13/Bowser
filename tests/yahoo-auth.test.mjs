import test from 'node:test';
import assert from 'node:assert/strict';
import { createYahooHandler, seal, unseal, entities } from '../server/yahoo-auth.mjs';
const origin = 'https://bowser-fantasy-football.vercel.app';
const env = { YAHOO_CLIENT_ID: 'test-client', YAHOO_CLIENT_SECRET: 'test-secret-only', YAHOO_REDIRECT_URI: `${origin}/api/v1/auth/yahoo/callback` };
const now = Date.now();
const session = { access: 'PRIVATE_ACCESS', refresh: 'PRIVATE_REFRESH', tokenExpiresAt: now + 3600000, expiresAt: now + 8 * 3600000 };
const sessionCookie = s => `__Host-bowser-yahoo=${seal(s || session, env.YAHOO_CLIENT_SECRET, 'session')}`;
async function call(action, options = {}) {
  const headers = new Map();
  const res = { statusCode: 200, setHeader(k,v) { headers.set(k.toLowerCase(), v); }, getHeader(k) { return headers.get(k.toLowerCase()); }, end(body='') { this.body = body; } };
  let count=0;
  const handler = createYahooHandler({ env: options.env || env, now: () => now, fetcher: async (...args) => { count++; return options.fetcher ? options.fetcher(...args) : assert.fail('Unexpected provider call'); } });
  await handler({ method: options.method || 'GET', url: `/api/v1/auth/yahoo/${action}`, headers: { host: new URL(origin).host, ...options.headers } }, res);
  return { status: res.statusCode, headers, body: res.body, data: res.body ? JSON.parse(res.body) : null, count };
}
function response(body, status=200) { return { ok: status===200, status, json: async () => body }; }
const teams = { fantasy_content: { users: { 0: { user: [{ guid: 'private-guid' }, { games: { 0: { game: [{ game_key: '999' }, { teams: { 0: { team: [[{ team_key: '999.l.42.t.1' }, { name: 'My team' }]] }, count: 1 } }] } } }] } } } };
const leagues = { fantasy_content: { leagues: { 0: { league: [{ league_key: '999.l.42', name: 'My league', season: '2026', current_week: '3', num_teams: '12' }] }, count: 1 } } };
test('encrypted sessions reject tampering, wrong purpose/key and expiry', () => {
  const value = seal(session, env.YAHOO_CLIENT_SECRET, 'session');
  assert(!value.includes('PRIVATE'));
  assert.deepEqual(unseal(value, env.YAHOO_CLIENT_SECRET, 'session', now), session);
  assert.equal(unseal(value, 'wrong', 'session', now), null);
  assert.equal(unseal(value, env.YAHOO_CLIENT_SECRET, 'flow', now), null);
  assert.equal(unseal(value, env.YAHOO_CLIENT_SECRET, 'session', session.expiresAt), null);
  assert.equal(unseal(value.slice(0,20)+'X'+value.slice(21), env.YAHOO_CLIENT_SECRET, 'session', now), null);
});
test('status exposes configuration and connection only, never secrets or tokens', async () => {
  const result = await call('status', { headers: { cookie: sessionCookie() } });
  assert.equal(result.data.connected, true);
  assert.equal(result.data.configured, true);
  assert(!/PRIVATE|test-secret|test-client/.test(result.body));
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.equal(result.headers.get('vercel-cdn-cache-control'), 'no-store');
  assert.equal((await call('status', { env: {} })).data.configured, false);
});
test('OAuth state cookie is secure; alternate host redirects to canonical before setting it', async () => {
  const result = await call('start');
  const auth = new URL(result.headers.get('location'));
  assert.equal(auth.origin, 'https://api.login.yahoo.com');
  assert.equal(auth.searchParams.get('redirect_uri'), env.YAHOO_REDIRECT_URI);
  assert.match(result.headers.get('set-cookie')[0], /HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
  assert(!result.headers.get('location').includes(env.YAHOO_CLIENT_SECRET));
  const other = await call('start', { headers: { host: 'preview.vercel.app' } });
  assert.equal(other.headers.get('location'), `${origin}/api/v1/auth/yahoo/start`);
  assert(!other.headers.has('set-cookie'));
});
test('callback checks state before token exchange and removes code from redirect', async () => {
  const invalid = await call('callback?code=TOP_SECRET&state=wrong');
  assert.equal(invalid.count, 0);
  assert.match(invalid.headers.get('location'), /result=invalid_state/);
  assert(!invalid.headers.get('location').includes('TOP_SECRET'));
  const state = 'test-state';
  const cookie = `__Host-bowser-yahoo-flow=${seal({state,expiresAt:now+60000},env.YAHOO_CLIENT_SECRET,'flow')}`;
  const valid = await call(`callback?code=TOP_SECRET&state=${state}`, { headers: { cookie }, fetcher: async (url, init) => {
    assert.equal(url, 'https://api.login.yahoo.com/oauth2/get_token');
    assert.equal(new URLSearchParams(init.body).get('code'), 'TOP_SECRET');
    return response({ access_token: session.access, refresh_token: session.refresh, expires_in: 3600 });
  }});
  assert.match(valid.headers.get('location'), /result=connected$/);
  assert(!JSON.stringify([...valid.headers]).includes('PRIVATE'));
  const denied = await call(`callback?error=access_denied&state=${state}`, {headers:{cookie}});
  assert.match(denied.headers.get('location'), /result=declined/);
});
test('private routes require session; refresh and disconnect require same-origin POST', async () => {
  assert.equal((await call('leagues')).status, 401);
  assert.equal((await call('disconnect')).status, 405);
  assert.equal((await call('refresh', {method:'POST',headers:{cookie:sessionCookie(), origin:'https://evil.example'}})).status,403);
  const logout = await call('disconnect', { method: 'POST', headers: { origin } });
  assert.equal(logout.data.connected, false);
  assert.match(logout.headers.get('set-cookie')[0], /Max-Age=0/);
});
test('Yahoo nested collections normalize into private leagues and teams', async () => {
  assert.equal(entities(teams.fantasy_content, 'team')[0].name, 'My team');
  const result = await call('leagues?season=2026', {headers:{cookie:sessionCookie()},fetcher:async(url,init)=>{
    assert.equal(init.headers.Authorization, 'Bearer PRIVATE_ACCESS');
    assert(url.includes('seasons=2026'));
    return response(url.includes('/leagues?') ? leagues : teams);
  }});
  assert.deepEqual(result.data.teams, [{key:'999.l.42.t.1',leagueKey:'999.l.42',name:'My team'}]);
  assert.equal(result.data.leagues[0].teams,12);
  assert(!result.body.includes('private-guid'));
});
test('roster restricts access to user-owned teams and preserves player slots', async () => {
  const fetcher=async url=>response(url.includes('/teams?') ? teams : {fantasy_content:{team:[[{team_key:'999.l.42.t.1'}],{roster:{week:'3',coverage_type:'week',players:{0:{player:[[{player_key:'999.p.1'},{name:{full:'Test Player'}},{display_position:'RB'},{editorial_team_abbr:'BUF'}],{selected_position:[{coverage_type:'week'},{position:'BN'}]}]},count:1}}}]}});
  const result=await call('roster?season=2026&team=999.l.42.t.1',{headers:{cookie:sessionCookie()},fetcher});
  assert.equal(result.data.players[0].slot,'BN');
  assert.equal(result.data.week,3);
  const other=await call('roster?season=2026&team=999.l.42.t.2',{headers:{cookie:sessionCookie()},fetcher});
  assert.equal(other.status,403); assert.equal(other.count,1);
  assert.equal((await call('roster?team=../../secrets',{headers:{cookie:sessionCookie()}})).status,400);
});
test('refresh rotates tokens, preserves session expiry, and retries expired API access once', async () => {
  let apiCalls=0;
  const result=await call('leagues?season=2026',{headers:{cookie:sessionCookie()},fetcher:async(url,init)=>{
    if(url.includes('get_token')) return response({access_token:'NEW_ACCESS',refresh_token:'NEW_REFRESH',expires_in:3600});
    if(apiCalls++===0) return response({},401);
    assert.equal(init.headers.Authorization,'Bearer NEW_ACCESS');
    return response(url.includes('/leagues?')?leagues:teams);
  }});
  assert.equal(result.status,200); assert.equal(result.count,4);
  const value=result.headers.get('set-cookie')[0].split(';')[0].split('=')[1];
  const saved=unseal(value,env.YAHOO_CLIENT_SECRET,'session',now);
  assert.equal(saved.refresh,'NEW_REFRESH'); assert.equal(saved.expiresAt,session.expiresAt);
  const expired=await call('refresh',{method:'POST',headers:{cookie:sessionCookie(),origin},fetcher:async()=>response({error:'PRIVATE'},400)});
  assert.equal(expired.status,401); assert(!expired.body.includes('PRIVATE')); assert.match(expired.headers.get('set-cookie')[0],/Max-Age=0/);
});
test('provider failures are actionable and do not leak response or exception details', async()=>{
  const denied=await call('leagues',{headers:{cookie:sessionCookie()},fetcher:async()=>response({secret:'PRIVATE'},403)});
  assert.equal(denied.status,403); assert.equal(denied.data.error.code,'fantasy_access_denied');
  const error=await call('leagues',{headers:{cookie:sessionCookie()},fetcher:async()=>{throw Error('PRIVATE_ACCESS');}});
  assert.equal(error.status,502); assert(!error.body.includes('PRIVATE'));
});

const teamKey='999.l.42.t.1';
const leaguePayload={fantasy_content:{league:[{league_key:'999.l.42',name:'Fixture League',season:'2026',current_week:'3',start_week:'1',end_week:'17',scoring_type:'head'}]}};
function dashboardFetcher(overrides={}) {
  return async url=>{
    const section=url.includes('/teams?')?'owned':url.includes('/standings?')?'standings':url.includes('/scoreboard;')?'scoreboard':url.includes('/settings?')?'settings':url.includes('/roster;')?'roster':'league';
    if(overrides[section])return overrides[section](url);
    const wk=new URL(url).pathname.match(/week=(\d+)/)?.[1]||'3';
    const team=(key,name,total)=>[[{team_key:key},{name}],{team_points:{coverage_type:'week',week:wk,total}},{team_projected_points:{coverage_type:'week',week:wk,total:'105.25'}}];
    const rosterPlayer = [[{player_key:'999.p.1'},{name:{full:'Fixture RB'}},{display_position:'RB'},{editorial_team_abbr:'BUF'},{status:'Q'},{bye_weeks:{week:'7'}}],{selected_position:[{position:'RB'}]},{player_points:{coverage_type:'week',week:wk,total:'0'}}];
    const standingTeam = [[{team_key:teamKey},{name:'My team'},{faab_balance:'0'}],{team_standings:{rank:'2',outcome_totals:{wins:'1',losses:'1',ties:'0'},points_for:'202.5',points_against:'200'}}];
    const matchup = {week:wk,status:'midevent',teams:{0:{team:team(teamKey,'My team','12.3')},1:{team:team('999.l.42.t.2','Opponent','0')}}};
    const payloads = {
      owned: teams,
      league: leaguePayload,
      roster: {fantasy_content:{team:[[{team_key:teamKey}],{roster:{week:wk,coverage_type:'week',players:{0:{player:rosterPlayer},count:1}}}]}},
      standings: {fantasy_content:{league:[{},{standings:{teams:{0:{team:standingTeam},count:1}}}]}},
      settings: {fantasy_content:{league:[{},{settings:{roster_positions:[{roster_position:{position:'RB',count:'2'}}],waiver_type:'FAAB'}}]}},
      scoreboard: {fantasy_content:{league:[{},{scoreboard:{week:wk,0:{matchups:{0:{matchup},count:1}}}}]}},
    };
    return response(payloads[section]);
  };
}
test('dashboard normalizes selected-week lineup, standings and matchup without leaking provider identities',async()=>{
 const r=await call(`dashboard?season=2026&team=${teamKey}&week=2`,{headers:{cookie:sessionCookie()},fetcher:dashboardFetcher()});
 assert.equal(r.status,200);assert.equal(r.data.week,2);assert.equal(r.data.roster.week,2);assert.equal(r.data.roster.players[0].points,0);assert.equal(r.data.roster.players[0].slot,'RB');assert.equal(r.data.standings[0].faabBalance,0);assert.equal(r.data.scoreboard.matchups[0].teams[1].points,0);assert.equal(r.data.settings.rosterPositions[0].count,2);assert.deepEqual(r.data.errors,{});assert(!/PRIVATE|private-guid|access_token|manager_id/.test(r.body));assert.equal(r.headers.get('vercel-cdn-cache-control'),'no-store');
});
test('dashboard requires ownership, valid season and a week within the league season',async()=>{
 assert.equal((await call('dashboard')).status,401);
 for(const week of ['0','19','2;bad','18'])assert.equal((await call(`dashboard?season=2026&team=${teamKey}&week=${week}`,{headers:{cookie:sessionCookie()},fetcher:dashboardFetcher()})).status,400);
 assert.equal((await call('dashboard?season=2026&team=999.l.42.t.99',{headers:{cookie:sessionCookie()},fetcher:dashboardFetcher()})).status,403);
 assert.equal((await call(`dashboard?season=2025&team=${teamKey}`,{headers:{cookie:sessionCookie()},fetcher:dashboardFetcher()})).data.error.code,'league_mismatch');
});
test('dashboard keeps missing sections unavailable without discarding successful data',async()=>{
 const r=await call(`dashboard?season=2026&team=${teamKey}`,{headers:{cookie:sessionCookie()},fetcher:dashboardFetcher({standings:async()=>response({},500)})});
 assert.equal(r.status,200);assert.equal(r.data.standings,null);assert(r.data.errors.standings);assert.equal(r.data.roster.players.length,1);
 const denied=await call(`dashboard?season=2026&team=${teamKey}`,{headers:{cookie:sessionCookie()},fetcher:dashboardFetcher({scoreboard:async()=>response({},403)})});assert.equal(denied.status,403);assert(!denied.body.includes('Fixture RB'));
});
test('dashboard rejects a provider week mismatch and never calls it the requested week',async()=>{
 const r=await call(`dashboard?season=2026&team=${teamKey}&week=2`,{headers:{cookie:sessionCookie()},fetcher:dashboardFetcher({roster:async()=>response({fantasy_content:{team:[{},{roster:{week:'3',players:{}}}]}})})});
 assert.equal(r.data.roster,null);assert.match(r.data.errors.roster,/different week/);
});
test('dashboard retains roster slots when the weekly player statistics resource fails',async()=>{
 const base=dashboardFetcher();
 const r=await call(`dashboard?season=2026&team=${teamKey}&week=2`,{headers:{cookie:sessionCookie()},fetcher:dashboardFetcher({roster:async url=>{
   if(url.includes('/players/stats'))return response({},500);
   const result=await base(url);const data=await result.json();
   delete data.fantasy_content.team[1].roster.players[0].player[2].player_points;
   return response(data);
 }})});
 assert.equal(r.status,200);assert.equal(r.data.roster.week,2);assert.equal(r.data.roster.players[0].slot,'RB');assert.equal(r.data.roster.players[0].points,null);assert.match(r.data.warnings.roster,/unavailable/);assert.deepEqual(r.data.errors,{});
});

function researchFetcher({ playerCount = 1, transactionCount = 1, overrides = {}, calls = [] } = {}) {
  return async (url, init) => {
    calls.push(url);
    if (url.includes('/get_token')) return response({ access_token: 'NEW_ACCESS', expires_in: 3600 });
    assert.equal(init.method, undefined, 'Fantasy reads must use GET');
    if (url.includes('/teams?')) return response(teams);
    if (url.includes('/players;')) {
      if (overrides.availability) return overrides.availability(url);
      const players = { count: playerCount };
      for (let i = 0; i < playerCount; i++) players[i] = { player: [[{ player_key: `999.p.${i + 1}` }, { name: { full: `Available ${i + 1}` } }, { display_position: 'RB' }, { editorial_team_abbr: 'BUF' }, { private_field: 'PRIVATE_PAYLOAD' }]] };
      return response({ fantasy_content: { league: [{ league_key: '999.l.42' }, { players }] } });
    }
    if (url.includes('/transactions;')) {
      const section = url.includes('pending_trade') ? 'trades' : 'transactions';
      if (overrides[section]) return overrides[section](url);
      const transactions = { count: transactionCount };
      for (let i = 0; i < transactionCount; i++) transactions[i] = { transaction: [{ transaction_key: `999.l.42.${section === 'trades' ? 'pt' : 'tr'}.${i + 1}`, type: section === 'trades' ? 'pending_trade' : 'trade', status: 'proposed', timestamp: '0', trader_team_key: teamKey, tradee_team_key: '999.l.42.t.2', trade_note: 'PRIVATE_NOTE' }, { players: { count: 1, 0: { player: [[{ player_key: '999.p.1' }, { name: { full: 'Fixture RB' } }], { transaction_data: [{ type: 'pending_trade', source_team_key: teamKey, destination_team_key: '999.l.42.t.2' }] }] } } }] };
      return response({ fantasy_content: { league: [{ league_key: '999.l.42' }, { transactions }] } });
    }
    return overrides.league ? overrides.league(url) : response(leaguePayload);
  };
}
const researchAction = `league-research?season=2026&team=${teamKey}`;
test('league research authorizes owned teams and season before any private league reads', async () => {
  assert.equal((await call(researchAction)).status, 401);
  assert.equal((await call(researchAction, { method: 'POST', headers: { cookie: sessionCookie() } })).status, 405);
  const forbidden = await call('league-research?season=2026&team=999.l.42.t.99', { headers: { cookie: sessionCookie() }, fetcher: researchFetcher() });
  assert.equal(forbidden.status, 403); assert.equal(forbidden.count, 1);
  const mismatch = await call(`league-research?season=2025&team=${teamKey}`, { headers: { cookie: sessionCookie() }, fetcher: researchFetcher() });
  assert.equal(mismatch.data.error.code, 'league_mismatch'); assert.equal(mismatch.count, 2);
});
test('research uses documented filters and exposes only normalized private no-store results', async () => {
  const calls = [];
  const r = await call(`${researchAction}&include=availability,trades,transactions`, { headers: { cookie: sessionCookie() }, fetcher: researchFetcher({ calls }) });
  assert.equal(r.status, 200); assert.equal(r.count, 5);
  assert(calls.some(url => url.includes('/players;status=FA;start=0;count=25?')));
  assert(calls.some(url => url.includes(`/transactions;type=pending_trade;team_key=${teamKey};count=50?`)));
  assert(calls.some(url => url.includes('/transactions;types=add,drop,trade;count=50?')));
  assert.equal(r.data.availability.players[0].key, '999.p.1'); assert.equal(r.data.availability.complete, true);
  assert.equal(r.data.trades.items[0].players[0].sourceTeamKey, teamKey); assert.equal(r.data.trades.items[0].timestamp, 0);
  assert.equal(r.data.transactions.items[0].type, 'trade'); assert.deepEqual(r.data.errors, {});
  assert(!/PRIVATE|trade_note|private-guid|access_token/.test(r.body));
  for (const key of ['cache-control', 'cdn-cache-control', 'vercel-cdn-cache-control']) assert.match(r.headers.get(key), /no-store/);
  assert.equal(r.headers.get('vary'), 'Cookie');
});
test('availability pagination never claims a full pool when only a page is known', async () => {
  const first = await call(`${researchAction}&include=availability`, { headers: { cookie: sessionCookie() }, fetcher: researchFetcher({ playerCount: 25 }) });
  assert.equal(first.data.availability.complete, false); assert.equal(first.data.availability.nextStart, 25); assert.equal(first.data.availability.exhausted, false);
  const last = await call(`${researchAction}&include=availability&availabilityStart=25&availabilityStatus=W`, { headers: { cookie: sessionCookie() }, fetcher: researchFetcher({ playerCount: 0 }) });
  assert.equal(last.data.availability.complete, false); assert.equal(last.data.availability.exhausted, true); assert.equal(last.data.availability.nextStart, null); assert.equal(last.data.availability.status, 'W');
  const cap = await call(`${researchAction}&include=availability&availabilityStart=5000`, { headers: { cookie: sessionCookie() }, fetcher: researchFetcher({ playerCount: 25 }) });
  assert.equal(cap.data.availability.limitReached, true); assert.equal(cap.data.availability.nextStart, null);
  const bounded = await call(`${researchAction}&include=trades`, { headers: { cookie: sessionCookie() }, fetcher: researchFetcher({ transactionCount: 50 }) });
  assert.equal(bounded.data.trades.complete, false); assert.equal(bounded.data.trades.limitReached, true);
});
test('research validates pagination and includes without interpolating arbitrary input into Yahoo routes', async () => {
  for (const query of ['include=secrets', 'include=', 'availabilityStart=-1', 'availabilityStart=5001', 'availabilityStart=2.5', 'availabilityStart=2;count=5000', 'availabilityStatus=T']) {
    const r = await call(`${researchAction}&${query}`, { headers: { cookie: sessionCookie() }, fetcher: researchFetcher() });
    assert.equal(r.status, 400, query); assert.equal(r.count, 1, 'Only ownership discovery occurs');
  }
});
test('research distinguishes failure from an empty collection and fails closed on access errors', async () => {
  const partial = await call(researchAction, { headers: { cookie: sessionCookie() }, fetcher: researchFetcher({ overrides: { availability: async () => response({ fantasy_content: { league: [] } }) } }) });
  assert.equal(partial.status, 200); assert.equal(partial.data.availability, null); assert(partial.data.errors.availability); assert.equal(partial.data.trades.items.length, 1);
  const badCount = await call(`${researchAction}&include=trades`, { headers: { cookie: sessionCookie() }, fetcher: researchFetcher({ overrides: { trades: async () => response({ fantasy_content: { league: [{ transactions: { count: 1 } }] } }) } }) });
  assert.equal(badCount.data.trades, null);
  for (const status of [401, 403, 429]) {
    const denied = await call(researchAction, { headers: { cookie: sessionCookie() }, fetcher: researchFetcher({ overrides: { trades: async () => response({ secret: 'PRIVATE_PAYLOAD' }, status) } }) });
    assert.equal(denied.status, status);
    assert(!denied.body.includes('Available 1')); assert(!denied.body.includes('PRIVATE'));
  }
});
test('research rejects a different league collection rather than mislabeling its players', async () => {
  const result = await call(`${researchAction}&include=availability`, {
    headers: { cookie: sessionCookie() },
    fetcher: researchFetcher({ overrides: { availability: async () => response({ fantasy_content: { league: [{ league_key: '999.l.99' }, { players: { count: 0 } }] } }) } }),
  });
  assert.equal(result.data.availability, null); assert(result.data.errors.availability);
});
