import test from 'node:test';
import assert from 'node:assert/strict';
import { createYahooHandler, seal } from '../server/yahoo-auth.mjs';

const origin = 'https://bowser-fantasy-football.vercel.app';
const env = { YAHOO_CLIENT_ID: 'test-client', YAHOO_CLIENT_SECRET: 'test-secret-only', YAHOO_REDIRECT_URI: `${origin}/api/v1/auth/yahoo/callback` };
const now = Date.now();
const teamKey = '999.l.42.t.1';
const leagueKey = '999.l.42';
const session = { access: 'PRIVATE_ACCESS', refresh: 'PRIVATE_REFRESH', tokenExpiresAt: now + 3600000, expiresAt: now + 8 * 3600000 };
const cookie = `__Host-bowser-yahoo=${seal(session, env.YAHOO_CLIENT_SECRET, 'session')}`;

function response(body, status = 200) { return { ok: status === 200, status, json: async () => body }; }
async function call(action, options = {}) {
  const headers = new Map();
  const res = { statusCode: 200, setHeader(k, v) { headers.set(k.toLowerCase(), v); }, getHeader(k) { return headers.get(k.toLowerCase()); }, end(body = '') { this.body = body; } };
  let count = 0;
  const handler = createYahooHandler({ env, now: () => now, fetcher: async (...args) => { count++; return options.fetcher(...args); } });
  await handler({ method: options.method || 'GET', url: `/api/v1/auth/yahoo/${action}`, headers: { host: new URL(origin).host, ...options.headers } }, res);
  return { status: res.statusCode, headers, body: res.body, data: res.body ? JSON.parse(res.body) : null, count };
}
const teams = { fantasy_content: { users: { 0: { user: [{ guid: 'private-guid' }, { games: { 0: { game: [{ game_key: '999' }, { teams: { 0: { team: [[{ team_key: teamKey }, { name: 'My private team' }]] }, count: 1 } }] } } }] } } } };
const league = { fantasy_content: { league: [{ league_key: leagueKey, season: '2026', name: 'Private league' }] } };
const player = (key, name, position, team, ownershipType) => [[{ player_key: key }, { name: { full: name } }, { display_position: position }, { editorial_team_abbr: team }, { private_note: 'PRIVATE_PAYLOAD' }], { ownership: { ownership_type: ownershipType } }];
const playersPayload = players => ({ fantasy_content: { league: [{ league_key: leagueKey }, { players: Object.assign({ count: players.length }, Object.fromEntries(players.map((p, i) => [i, { player: p }]))) }] } });

test('ownership research is private, GET-only, no-store and session gated', async () => {
  const players = encodeURIComponent(JSON.stringify([{ id: 'public-1', name: 'Fixture Alpha', team: 'NYG', position: 'RB' }]));
  const unauth = await call(`league-research?season=2026&team=${teamKey}&include=ownership&players=${players}`, { fetcher: async () => assert.fail('No provider reads without a session') });
  assert.equal(unauth.status, 401);
  assert.match(unauth.headers.get('cache-control'), /no-store/);
  assert.equal(unauth.headers.get('vercel-cdn-cache-control'), 'no-store');
  const wrongMethod = await call(`league-research?season=2026&team=${teamKey}&include=ownership&players=${players}`, { method: 'POST', headers: { cookie }, fetcher: async () => assert.fail('GET only') });
  assert.equal(wrongMethod.status, 405);
});

test('ownership research returns only explicit Yahoo ownership responses for exact identities', async () => {
  const players = encodeURIComponent(JSON.stringify([{ id: 'public-1', name: 'Fixture Alpha', team: 'NYG', position: 'RB' }]));
  const calls = [];
  const result = await call(`league-research?season=2026&team=${teamKey}&include=ownership,transactions&players=${players}&playerKeys=999.p.2`, {
    headers: { cookie },
    fetcher: async url => {
      calls.push(url);
      if (url.includes('/teams?')) return response(teams);
      if (url.endsWith(`league/${leagueKey}?format=json`)) return response(league);
      if (url.includes('/players;search=Fixture%20Alpha;count=10')) return response(playersPayload([player('999.p.1', 'Fixture Alpha', 'RB', 'NYG', null)]));
      if (url.includes('/players;player_keys=999.p.2/ownership')) return response(playersPayload([player('999.p.2', 'Fixture Beta', 'WR', 'BUF', 'freeagents')]));
      if (url.includes('/players;player_keys=999.p.1/ownership')) return response(playersPayload([player('999.p.1', 'Fixture Alpha', 'RB', 'NYG', 'team')]));
      if (url.includes('/transactions;types=add,drop,trade;count=50')) return response({ fantasy_content: { league: [{ league_key: leagueKey }, { transactions: { count: 0 } }] } });
      assert.fail(`Unexpected provider URL ${url}`);
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.ownership.requested, 2);
  assert.equal(result.data.ownership.matched, 2);
  assert.deepEqual(result.data.ownership.matches.map(item => [item.id, item.owned, item.ownershipType, item.match]), [
    ['999.p.2', false, 'freeagents', 'yahoo-player-key'],
    ['public-1', true, 'team', 'exact-name-team-position'],
  ]);
  assert.equal(result.data.transactions.items.length, 0);
  assert(!/PRIVATE|private-guid|My private team/.test(result.body));
  assert(calls.some(url => url.includes('/ownership')));
});

test('ambiguous identity search stays unknown instead of inferring ownership', async () => {
  const players = encodeURIComponent(JSON.stringify([{ id: 'public-ambiguous', name: 'Fixture Alpha', team: 'NYG', position: 'RB' }]));
  const result = await call(`league-research?season=2026&team=${teamKey}&include=ownership&players=${players}`, {
    headers: { cookie },
    fetcher: async url => {
      if (url.includes('/teams?')) return response(teams);
      if (url.endsWith(`league/${leagueKey}?format=json`)) return response(league);
      if (url.includes('/players;search=')) return response(playersPayload([player('999.p.1', 'Fixture Alpha', 'RB', 'NYG', null), player('999.p.9', 'Fixture Alpha Jr.', 'RB', 'NYG', null)]));
      assert.fail(`Unexpected provider URL ${url}`);
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.ownership.complete, false);
  assert.equal(result.data.ownership.matches[0].owned, null);
  assert.equal(result.data.ownership.matches[0].match, 'ambiguous');
});


test('transactions preserve source status, per-player actions, timestamps and private no-store headers', async () => {
 const item={transaction_key:`${leagueKey}.tr.1`,type:'add/drop',status:'successful',timestamp:'1790000000',players:{count:2,
  0:{player:[[{player_key:'999.p.1'},{name:{full:'Fixture Alpha'}},{display_position:'RB'},{editorial_team_abbr:'NYG'}],{transaction_data:{type:'add',destination_team_key:teamKey}}]},
  1:{player:[[{player_key:'999.p.2'},{name:{full:'Fixture Beta'}},{display_position:'WR'},{editorial_team_abbr:'BUF'}],{transaction_data:{type:'drop',source_team_key:teamKey}}]},
 }};
 const result=await call(`league-research?season=2026&team=${teamKey}&include=transactions`,{headers:{cookie},fetcher:async url=>{
  if(url.includes('/teams?'))return response(teams);
  if(url.endsWith(`league/${leagueKey}?format=json`))return response(league);
  if(url.includes('/transactions;types=add,drop,trade;count=50'))return response({fantasy_content:{league:[{league_key:leagueKey},{transactions:{count:1,0:{transaction:item}}}]}});
  assert.fail('Unexpected provider request');
 }});
 assert.equal(result.status,200);
 assert.match(result.headers.get('cache-control'),/private, no-store/);
 assert.equal(result.headers.get('cdn-cache-control'),'no-store');
 assert.equal(result.headers.get('vercel-cdn-cache-control'),'no-store');
 assert.equal(result.data.transactions.complete,true);
 assert.equal(result.data.transactions.checkedAt,new Date(now).toISOString());
 assert.equal(result.data.transactions.items[0].timestamp,1790000000);
 assert.equal(result.data.transactions.items[0].status,'successful');
 assert.deepEqual(result.data.transactions.items[0].players.map(p=>p.action),['add','drop']);
 assert(!result.body.includes('PRIVATE_ACCESS'));
});

test('transactions authorize the chosen team before any league transaction request', async () => {
 const result=await call('league-research?season=2026&team=999.l.99.t.1&include=transactions',{headers:{cookie},fetcher:async url=>{
  if(url.includes('/teams?'))return response(teams);
  assert.fail('No transaction or league lookup for an unowned team');
 }});
 assert.equal(result.status,403);
 assert.equal(result.data.error.code,'team_not_owned');
});

test('ownership pool paginates explicit current ownership and mine without exposing manager identifiers', async () => {
  const withOwner = (key, type, owner) => {
    const value = player(key, `Fixture ${key}`, 'RB', 'NYG', type);
    value[1].ownership.owner_team_key = owner;
    return value;
  };
  const result = await call(`league-research?season=2026&team=${teamKey}&include=ownershipPool&availabilityStart=25`, {
    headers: { cookie }, fetcher: async url => {
      if (url.includes('/teams?')) return response(teams);
      if (url.endsWith(`league/${leagueKey}?format=json`)) return response(league);
      assert(url.includes('/players;start=25;count=25/ownership'));
      return response(playersPayload([
        withOwner('999.p.1', 'team', teamKey), withOwner('999.p.2', 'team', `${leagueKey}.t.9`),
        withOwner('999.p.3', 'freeagents', null), withOwner('999.p.4', 'waivers', null),
        withOwner('999.p.5', 'team', null), withOwner('999.p.6', 'team', '999.l.999.t.1'),
      ]));
    },
  });
  assert.equal(result.status, 200);
  assert.match(result.headers.get('cache-control'), /private, no-store/);
  assert.equal(result.headers.get('vercel-cdn-cache-control'), 'no-store');
  assert.deepEqual(result.data.ownershipPool.players.map(p => [p.owned, p.isMine]), [[true,true],[true,false],[false,false],[false,false],[true,null],[true,null]]);
  assert.equal(result.data.ownershipPool.start,25);
  assert.equal(result.data.ownershipPool.nextStart,null);
  assert.equal(result.data.ownershipPool.exhausted,true);
  assert(!result.body.includes(`${leagueKey}.t.9`));
  assert(!result.body.includes('PRIVATE'));
});

test('ownership pool rejects duplicate identities and still requires authorized membership', async () => {
  const result = await call(`league-research?season=2026&team=${teamKey}&include=ownershipPool`, {
    headers:{cookie},fetcher:async url=>{
      if(url.includes('/teams?'))return response(teams);
      if(url.endsWith(`league/${leagueKey}?format=json`))return response(league);
      return response(playersPayload([player('999.p.1','Fixture','RB','NYG','freeagents'),player('999.p.1','Fixture','RB','NYG','freeagents')]));
    },
  });
  assert.equal(result.data.ownershipPool,null);
  assert(result.data.errors.ownershipPool);
  const denied=await call('league-research?season=2026&team=999.l.99.t.1&include=ownershipPool',{headers:{cookie},fetcher:async url=>{
    assert(url.includes('/teams?'));return response(teams);
  }});
  assert.equal(denied.status,403);
});

test('mine covers every team actually owned by the authenticated account within the league', async()=>{
 const twoTeams=structuredClone(teams);
 const ownedCollection=twoTeams.fantasy_content.users[0].user[1].games[0].game[1].teams;
 ownedCollection[1]={team:[[{team_key:`${leagueKey}.t.2`},{name:'Another private team'}]]};ownedCollection.count=2;
 const item=player('999.p.1','Fixture Alpha','RB','NYG','team');item[1].ownership.owner_team_key=`${leagueKey}.t.2`;
 const result=await call(`league-research?season=2026&team=${teamKey}&include=ownershipPool`,{headers:{cookie},fetcher:async url=>{
   if(url.includes('/teams?'))return response(twoTeams);
   if(url.endsWith(`league/${leagueKey}?format=json`))return response(league);
   return response(playersPayload([item]));
 }});
 assert.equal(result.status,200);assert.equal(result.data.ownershipPool.players[0].isMine,true);
 assert(!result.body.includes(`${leagueKey}.t.2`));
});
