import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { querySchedule, closeDatabase, QueryValidationError } from '../server/stats-store.mjs';
import handler from '../api/v1/meta.mjs';
import { fantasyStatsApiPlugin } from '../server/vite-api-plugin.mjs';

after(closeDatabase);
const params = value => new URLSearchParams(value);
test('schedule returns one warehouse row per game with sourced scores and kickoff context', () => {
  const result = querySchedule(params('season=2025&week=8'));
  const game = result.data.find(game => game.gameId === '2025_08_NYG_PHI');
  assert.equal(game.homeTeam, 'PHI'); assert.equal(game.awayTeam, 'NYG');
  assert.equal(game.homeScore, 38); assert.equal(game.awayScore, 20); assert.equal(game.totalPoints, 58);
  assert.equal(game.timeZone, 'America/New_York'); assert.equal(game.gameday, '2025-10-26');
  assert.equal(new Set(result.data.map(game => game.gameId)).size, result.data.length);
  assert.equal(result.meta.linesAvailable, false); assert.equal(result.meta.source, 'nflverse schedules');
  assert(!JSON.stringify(result).includes('implied'));
});
test('current season includes future games without inventing scores or points', () => {
  const result = querySchedule(params('season=2026&week=18'));
  assert.equal(result.data.length, 16);
  assert(result.data.every(game => game.homeScore === null && game.awayScore === null && game.totalPoints === null));
  const firstWeek = querySchedule(params('season=2026&week=1'));
  assert(firstWeek.data.some(game => game.kickoffUtc));
  assert(firstWeek.data.every(game => game.season === 2026));
});
test('schedule supports exact independent weeks, postseason and validation', () => {
  const result = querySchedule(params('season=2025&week=22,1,22'));
  assert.deepEqual(result.meta.weeks, [1, 22]); assert(result.data.every(game => [1, 22].includes(game.week)));
  assert.equal(result.data.filter(game => game.week === 22).length, 1);
  assert.equal(querySchedule(params('season=2025')).data.length, 285);
  for (const query of ['season=2024', 'week=0', 'week=23', 'week=1,', 'week=1.5', 'week=1;DROP', 'week=']) assert.throws(() => querySchedule(params(query)), QueryValidationError);
});
function response() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = JSON.parse(body); } };
}
test('Vercel schedule route is read-only and rejects invalid queries', () => {
  const read = response(); handler({ method: 'GET', url: '/api/v1/schedule?season=2026&week=2' }, read);
  assert.equal(read.statusCode, 200); assert.equal(read.body.meta.weeks[0], 2);
  const invalid = response(); handler({ method: 'GET', url: '/api/v1/schedule?week=99' }, invalid);
  assert.equal(invalid.statusCode, 400); assert.equal(invalid.body.error.field, 'week');
  const write = response(); handler({ method: 'POST', url: '/api/v1/schedule' }, write);
  assert.equal(write.statusCode, 405); assert.equal(write.body.error.code, 'read_only');
});
test('Vercel rewrite preserves schedule query parameters through the shared metadata function', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rewrite = config.rewrites.find(rule => rule.source === '/api/v1/schedule');
  assert.equal(rewrite?.destination, '/api/v1/meta?resource=schedule');
  const destination = new URL(rewrite.destination, 'https://fixture.test');
  destination.searchParams.set('season', '2026'); destination.searchParams.set('week', '1,2');
  const rewritten = response(); handler({ method: 'GET', url: `${destination.pathname}${destination.search}` }, rewritten);
  assert.equal(rewritten.statusCode, 200);
  assert.deepEqual(rewritten.body, querySchedule(params('season=2026&week=1,2')));
  const providerQuery = response(); handler({ method: 'GET', url: '/api/v1/meta?season=2026&week=2', query: { resource: 'schedule' } }, providerQuery);
  assert.equal(providerQuery.statusCode, 200); assert.deepEqual(providerQuery.body.meta.weeks, [2]);
  const write = response(); handler({ method: 'POST', url: `${destination.pathname}${destination.search}` }, write);
  assert.equal(write.statusCode, 405); assert.equal(write.body.error.code, 'read_only');
  const invalid = response(); handler({ method: 'GET', url: '/api/v1/meta?resource=schedule&week=99' }, invalid);
  assert.equal(invalid.statusCode, 400); assert.equal(invalid.body.error.field, 'week');
  const meta = response(); handler({ method: 'GET', url: '/api/v1/meta?season=2025' }, meta);
  assert.equal(meta.statusCode, 200); assert.equal(meta.body.warehouse.players, 609);
});
test('Vercel API packaging stays within the existing twelve-function deployment limit', () => {
  const functions = readdirSync(new URL('../api/', import.meta.url), { recursive: true }).filter(file => /\.(?:mjs|cjs|js|ts)$/.test(file));
  assert(functions.length <= 12, `Packaged ${functions.length} API functions; hosting limit is 12`);
  assert(!functions.includes('v1/schedule.mjs'), 'Schedule must reuse the metadata function');
});
test('Vite schedule route shares the exact warehouse query contract', async () => {
  let route;
  fantasyStatsApiPlugin().configureServer({ middlewares: { use(...args) { if (args[0] === '/api/v1') route = args[1]; } } });
  const res = response();
  await route({ method: 'GET', url: '/schedule?season=2026&week=3', headers: {} }, res, () => assert.fail('Schedule route must be handled'));
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, querySchedule(params('season=2026&week=3')));
});

test('research roster is public, read-only and independent of selected statistics weeks and DFS pool', () => {
  const read = response(); handler({method:'GET',url:'/api/v1/meta?view=research-roster&season=2026&weeks=18&dfsSlate=none'},read);
  assert.equal(read.statusCode,200);
  assert.equal(read.body.meta.rosterSeason,2026);
  assert(read.body.data.length>600);
  assert.equal(new Set(read.body.data.map(r=>r.player_id)).size,read.body.data.length);
  assert(new Set(read.body.data.map(r=>r.team)).size>=32);
  assert(read.body.data.some(r=>r.player_display_name==='Puka Nacua'&&r.team==='LA'));
  assert(read.body.data.some(r=>r.last_name));
  const write=response();handler({method:'POST',url:'/api/v1/meta?view=research-roster'},write);assert.equal(write.statusCode,405);
});

test('requested positional usage anchor retains Week 3 and five shared slots across seasons', async () => {
 const {queryOpportunityTracker}=await import('../server/stats-store.mjs');
 const result=queryOpportunityTracker(params('season=2026&team=LA&weeks=3&games=5&historyAnchor=requested'));
 assert.deepEqual(result.meta.trendSlots.map(s=>[s.season,s.week]),[[2025,17],[2025,18],[2026,1],[2026,2],[2026,3]]);
 const adams=result.data.groups.find(g=>g.position==='WR').players.find(p=>p.name==='Davante Adams');
 assert.equal(adams.history.at(-1).receivingYards,137); // Verified LA–DEN warehouse game, 2026 W3.
 assert(result.data.groups.every(g=>g.players.every(p=>p.history.length===5)));
 assert.throws(()=>queryOpportunityTracker(params('season=2026&team=LA&historyAnchor=invalid')),QueryValidationError);
});
