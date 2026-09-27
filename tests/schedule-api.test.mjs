import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { querySchedule, closeDatabase, QueryValidationError } from '../server/stats-store.mjs';
import handler from '../api/v1/schedule.mjs';
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
test('Vite schedule route shares the exact warehouse query contract', async () => {
  let route;
  fantasyStatsApiPlugin().configureServer({ middlewares: { use(...args) { if (args[0] === '/api/v1') route = args[1]; } } });
  const res = response();
  await route({ method: 'GET', url: '/schedule?season=2026&week=3', headers: {} }, res, () => assert.fail('Schedule route must be handled'));
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, querySchedule(params('season=2026&week=3')));
});
