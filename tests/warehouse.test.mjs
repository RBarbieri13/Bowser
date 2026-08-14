import assert from "node:assert/strict";
import test, { after } from "node:test";

import { closeDatabase, getMeta, queryGameBreakdown, queryPlayerProfile, queryPlayers, queryTeamBoxScores, QueryValidationError } from "../server/stats-store.mjs";

after(() => closeDatabase());

test("warehouse metadata exposes complete 2025 scope", () => {
  const meta = getMeta();
  assert.equal(meta.season, 2025);
  assert.equal(meta.warehouse.players, 609);
  assert.equal(meta.warehouse.player_stat_rows, 5630);
  assert.equal(meta.warehouse.stat_rows_with_snap_match, 5630);
  for (const position of ["QB", "RB", "WR", "TE"]) assert.ok(meta.positions.includes(position));
});

test("postseason round names are normalized and snap-backed", () => {
  const result = queryPlayers(new URLSearchParams("seasonType=POST&scoring=ppr&limit=500"));
  assert.ok(result.data.length > 100);
  assert.ok(result.data.some((row) => row.snaps > 0));
  assert.equal(getMeta().warehouse.postseason_weeks.length, 4);
});

test("default request returns ranked PPR leaders quickly", () => {
  const result = queryPlayers(new URLSearchParams("seasonType=REG&scoring=ppr&limit=10"));
  assert.equal(result.data.length, 10);
  assert.ok(result.meta.totalCount > 300);
  assert.equal(result.data[0].rank, 1);
  assert.ok(result.data[0].fantasy_points >= result.data[1].fantasy_points);
  assert.ok(result.meta.queryMs < 250);
});

test("week ranges return selected-period fantasy totals rather than per-game averages", () => {
  const regular = queryPlayers(new URLSearchParams("seasonType=ALL&weeks=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18&search=Christian%20McCaffrey&sort=fantasy_points&limit=1"));
  assert.equal(regular.data[0].fantasy_points, 416.6);
  assert.equal(regular.data[0].fantasy_points_per_game, 24.5);

  const weekOne = queryPlayers(new URLSearchParams("seasonType=ALL&weeks=1&search=Christian%20McCaffrey&sort=fantasy_points&limit=1"));
  assert.equal(weekOne.data[0].fantasy_points, 23.2);

  const full = queryPlayers(new URLSearchParams("seasonType=ALL&weeks=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22&search=Christian%20McCaffrey&sort=fantasy_points&limit=1"));
  assert.equal(full.data[0].fantasy_points, 458.4);
});

test("player profiles expose game logs, season totals, and team-relative depth data", () => {
  const profile = queryPlayerProfile(new URLSearchParams("playerId=00-0033280&scoring=ppr"));
  assert.equal(profile.data.player.name, "Christian McCaffrey");
  assert.equal(profile.data.gameLogs.length, 19);
  assert.equal(profile.data.gameLogs[0].fantasy_points, 23.2);
  assert.equal(profile.data.seasonStats[0].fantasy_points, 458.4);
  assert.equal(profile.data.seasonStats[0].sacks_suffered, 0);
  assert.ok(profile.data.depthChart.groups.some((group) => group.position === "RB" && group.players.some((player) => player.selected)));
  assert.ok(profile.meta.queryMs < 250);
});

test("team box scores return position-grouped weekly rows and matchup metadata", () => {
  const result = queryTeamBoxScores(new URLSearchParams("team=NYG&weeks=4,5,6,7&scoring=ppr&seasonType=ALL"));
  assert.equal(result.meta.team, "NYG");
  assert.equal(result.meta.weeks.length, 4);
  assert.equal(result.meta.weeks[0].opponent, "LAC");
  assert.equal(result.meta.weeks[0].gameId, "2025_04_LAC_NYG");
  assert.equal(result.meta.weeks[0].gameday, "2025-09-28");
  assert.equal(result.meta.weeks[0].scoreLabel, "W 21-18");
  assert.equal(result.meta.schedule.length, 17);
  assert.ok(result.meta.playerCount >= 10);
  assert.ok(result.data.some((row) => row.position_group === "QB" && row.week === 4));
  assert.ok(result.data.some((row) => row.position_group === "WR" && row.fantasy_points > 0));
  assert.ok(result.meta.queryMs < 250);
  assert.throws(() => queryTeamBoxScores(new URLSearchParams("team=NOT-A-TEAM")), QueryValidationError);
});

test("game breakdown exposes both teams, quarter scoring, game flow, and documented play mix", () => {
  const result = queryGameBreakdown(new URLSearchParams("gameId=2025_08_NYG_PHI&scoring=ppr"));
  assert.equal(result.data.game.week, 8);
  assert.equal(result.data.game.gameday, "2025-10-26");
  assert.equal(result.data.game.gametime, "13:00");
  assert.equal(result.data.game.homeScore, 38);
  assert.equal(result.data.game.awayScore, 20);
  assert.deepEqual(result.data.quarterScores.map((quarter) => [quarter.home_points, quarter.away_points]), [
    [7, 7], [14, 3], [3, 3], [14, 7],
  ]);
  assert.deepEqual(result.data.teams.map((team) => team.team), ["NYG", "PHI"]);
  assert.equal(result.data.teams.find((team) => team.team === "NYG").result, "L");
  assert.equal(result.data.totalOffensiveSnaps, 107);
  assert.ok(result.data.timeline.length > 10);
  assert.equal(result.data.timeline.at(-1).home_score, 38);
  assert.equal(result.data.timeline.at(-1).away_score, 20);
  assert.ok(result.data.boxScore.some((row) => row.team === "NYG" && row.position_group === "QB"));
  assert.ok(result.data.boxScore.some((row) => row.team === "PHI" && row.position_group === "RB"));
  assert.equal(result.data.availability.scoringTimeline, true);
  assert.equal(result.data.availability.unavailable.length, 0);
  assert.match(result.meta.methodology.offensiveSnaps, /scrimmage plays/);
  assert.ok(result.meta.queryMs < 250);
  assert.throws(() => queryGameBreakdown(new URLSearchParams("gameId=missing")), QueryValidationError);
});

test("filters, weeks, search and sorting are server-side", () => {
  const result = queryPlayers(new URLSearchParams({
    seasonType: "REG", scoring: "half", positions: "QB", weeks: "1,2,3,4",
    search: "Allen", sort: "passing_yards", direction: "desc", limit: "25",
  }));
  assert.ok(result.data.length >= 1);
  assert.ok(result.data.every((row) => row.position === "QB"));
  assert.ok(result.data.every((row) => row.player_display_name.toLowerCase().includes("allen") || row.team.toLowerCase().includes("allen")));
});

test("PPR adds exactly one point per reception over standard", () => {
  const common = "seasonType=REG&search=Ja%27Marr%20Chase&limit=1";
  const standard = queryPlayers(new URLSearchParams(`${common}&scoring=standard`));
  const ppr = queryPlayers(new URLSearchParams(`${common}&scoring=ppr`));
  assert.equal(standard.data.length, 1);
  assert.equal(ppr.data.length, 1);
  assert.equal(Number((ppr.data[0].fantasy_points - standard.data[0].fantasy_points).toFixed(1)), ppr.data[0].receptions);
});

test("custom ranks and invalid query values are deterministic", () => {
  const ranked = queryPlayers(new URLSearchParams("ranks=1-3,8&limit=10"));
  assert.deepEqual(ranked.data.map((row) => row.rank), [1, 2, 3, 8]);
  assert.throws(() => queryPlayers(new URLSearchParams("sort=drop_table")), QueryValidationError);
  assert.throws(() => queryPlayers(new URLSearchParams("ranks=9-2")), QueryValidationError);
});

test("all players and multi-column sorts are queryable", () => {
  const all = queryPlayers(new URLSearchParams("seasonType=ALL&limit=all"));
  assert.equal(all.data.length, 609);
  const sorted = queryPlayers(new URLSearchParams("seasonType=REG&sort=position,name&direction=asc,asc&limit=all"));
  assert.equal(sorted.data.length, 608);
  assert.deepEqual(sorted.meta.sorts, [
    { key: "position", direction: "asc" },
    { key: "name", direction: "asc" },
  ]);
});
