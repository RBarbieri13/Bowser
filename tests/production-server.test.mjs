import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import app from "../server.mjs";
import { closeDatabase } from "../server/stats-store.mjs";

let server;
let origin;

before(async () => {
  process.env.VERCEL = "1";
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      origin = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  closeDatabase();
  delete process.env.VERCEL;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("production server serves the standalone application", async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Bowser Fantasy Football/);
});

test("production API serves the packaged SQLite warehouse", async () => {
  const metaResponse = await fetch(`${origin}/api/v1/meta`);
  assert.equal(metaResponse.status, 200);
  const meta = await metaResponse.json();
  assert.equal(meta.warehouse.players, 609);

  const statsResponse = await fetch(`${origin}/api/v1/player-stats?seasonType=ALL&limit=all`);
  assert.equal(statsResponse.status, 200);
  const stats = await statsResponse.json();
  assert.equal(stats.data.length, 609);
  assert.ok(stats.meta.queryMs < 250);

  const profileResponse = await fetch(`${origin}/api/v1/player-profile?playerId=00-0033280&scoring=ppr`);
  assert.equal(profileResponse.status, 200);
  const profile = await profileResponse.json();
  assert.equal(profile.data.player.name, "Christian McCaffrey");
  assert.equal(profile.data.seasonStats[0].fantasy_points, 458.4);

  const boxScoreResponse = await fetch(`${origin}/api/v1/team-box-scores?team=NYG&weeks=4,5,6,7&scoring=ppr&seasonType=ALL`);
  assert.equal(boxScoreResponse.status, 200);
  const boxScores = await boxScoreResponse.json();
  assert.equal(boxScores.meta.weeks.length, 4);
  assert.equal(boxScores.meta.schedule.length, 17);
  assert.ok(boxScores.data.some((row) => row.position_group === "QB"));

  const opportunityResponse = await fetch(`${origin}/api/v1/opportunity-tracker?team=NYG&games=10`);
  assert.equal(opportunityResponse.status, 200);
  const opportunity = await opportunityResponse.json();
  assert.equal(opportunity.data.team, "NYG");
  assert.ok(opportunity.meta.playerCount >= 25);
  assert.equal(opportunity.data.groups.length, 4);

  const gameResponse = await fetch(`${origin}/api/v1/game-breakdown?gameId=2025_08_NYG_PHI&scoring=ppr`);
  assert.equal(gameResponse.status, 200);
  const game = await gameResponse.json();
  assert.equal(game.data.game.homeScore, 38);
  assert.equal(game.data.game.awayScore, 20);
  assert.deepEqual(game.data.teams.map((team) => team.team), ["NYG", "PHI"]);
  assert.equal(game.data.availability.scoringTimeline, true);
});

test("unknown API routes do not fall back to the app shell", async () => {
  const response = await fetch(`${origin}/api/v1/missing`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "not_found");
});
