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
