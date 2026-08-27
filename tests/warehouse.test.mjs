import assert from "node:assert/strict";
import test, { after } from "node:test";

import { closeDatabase, getMeta, queryGameBreakdown, queryOpportunityTracker, queryPlayerProfile, queryPlayers, queryTeamBoxScores, QueryValidationError } from "../server/stats-store.mjs";
import { getIntelligenceRegistry, queryIntelligenceFeed, IntelligenceQueryError } from "../server/intelligence-store.mjs";
import { buildXaiRequestBody } from "../server/intelligence-provider-xai.mjs";

after(() => closeDatabase());

test("warehouse metadata exposes complete 2025 scope", () => {
  const meta = getMeta();
  assert.equal(meta.season, 2025);
  assert.equal(meta.warehouse.players, 609);
  assert.equal(meta.warehouse.player_stat_rows, 5630);
  assert.equal(meta.warehouse.stat_rows_with_snap_match, 5630);
  for (const position of ["QB", "RB", "WR", "TE"]) assert.ok(meta.positions.includes(position));
});

test("intelligence feed is filterable and publishes a transparent source registry", () => {
  const all = queryIntelligenceFeed(new URLSearchParams("hours=168"));
  assert.equal(all.events.length, 3);
  assert.equal(all.meta.snapshotMode, "curated_bootstrap");
  assert.equal(all.meta.provider.configured, false);
  assert.match(all.meta.methodology.confidence, /social volume never increases/);
  assert.ok(all.events.every((event) => event.sources.length && event.sourceQuality.confidence >= 90));

  const receivers = queryIntelligenceFeed(new URLSearchParams("hours=168&position=WR&impact=LOW"));
  assert.equal(receivers.events.length, 1);
  assert.equal(receivers.events[0].player.name, "Noah Brown");
  const registry = getIntelligenceRegistry();
  assert.equal(registry.summary.total, 15);
  assert.equal(registry.summary.primary, 2);
  assert.ok(registry.sources.some((source) => source.id === "twif-overall" && source.automation === "disabled_by_robots"));
  assert.throws(() => queryIntelligenceFeed(new URLSearchParams("position=K")), IntelligenceQueryError);
});

test("xAI Responses requests use the current text.format structured-output contract", () => {
  const request = buildXaiRequestBody({ lookbackHours: 24 }, new Date("2026-08-26T18:00:00.000Z"));
  assert.equal(Object.hasOwn(request, "response_format"), false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.name, "bowser_fantasy_intelligence");
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.schema.type, "object");
  assert.equal(request.max_turns, 2);
  assert.equal(request.tools[0].from_date, "2026-08-25");
  assert.equal(request.tools[0].to_date, "2026-08-26");
});

test("postseason round names are normalized and snap-backed", () => {
  const result = queryPlayers(new URLSearchParams("seasonType=POST&scoring=ppr&limit=500"));
  assert.ok(result.data.length > 100);
  assert.ok(result.data.some((row) => row.snaps > 0));
  assert.equal(getMeta().warehouse.postseason_weeks.length, 4);
});

test("opportunity tracker joins the current full roster to honest recent-game history", () => {
  const result = queryOpportunityTracker(new URLSearchParams("team=NYG&games=10"));
  assert.equal(result.data.team, "NYG");
  assert.deepEqual(result.data.groups.map((group) => group.position), ["QB", "RB", "WR", "TE"]);
  assert.ok(result.meta.playerCount >= 25);
  assert.ok(result.meta.playersWithHistory > 15);
  assert.ok(result.meta.rookies >= 1);
  assert.equal(result.meta.injuryNewsAvailable, false);
  assert.match(result.meta.ordering, /Official nflverse depth rank/);
  const players = result.data.groups.flatMap((group) => group.players);
  assert.ok(players.some((player) => player.rookie && player.history.length === 0));
  assert.ok(players.some((player) => player.history.length === 10));
  assert.ok(players.every((player) => player.history.length <= 10));
  assert.ok(players.filter((player) => player.hasNFLHistory).every((player) => player.history.every((game) => Number.isFinite(game.snaps) && Number.isFinite(game.fantasyPoints))));
  assert.throws(() => queryOpportunityTracker(new URLSearchParams("team=INVALID")), QueryValidationError);
});

test("default request returns ranked PPR leaders quickly", () => {
  const result = queryPlayers(new URLSearchParams("seasonType=REG&scoring=ppr&limit=10"));
  assert.equal(result.data.length, 10);
  assert.ok(result.meta.totalCount > 300);
  assert.equal(result.data[0].rank, 1);
  assert.ok(result.data[0].fantasy_points >= result.data[1].fantasy_points);
  assert.ok(result.meta.queryMs < 250);
});

test("player rows expose chronological ten-game REG trends with touches and selected scoring", () => {
  const common = "seasonType=REG&search=Christian%20McCaffrey&limit=1";
  const ppr = queryPlayers(new URLSearchParams(`${common}&scoring=ppr`)).data[0];
  const standard = queryPlayers(new URLSearchParams(`${common}&scoring=standard`)).data[0];

  assert.equal(ppr.player_trends.length, 10);
  assert.deepEqual(ppr.player_trends.map((game) => game.week), [8, 9, 10, 11, 12, 13, 15, 16, 17, 18]);
  assert.ok(ppr.player_trends.every((game) => game.seasonType === "REG"));
  assert.deepEqual(
    ppr.player_trends.map((game) => game.gameday),
    [...ppr.player_trends.map((game) => game.gameday)].sort(),
  );

  const weekEight = ppr.player_trends[0];
  assert.equal(weekEight.rushAttempts, 8);
  assert.equal(weekEight.rushingYards, 25);
  assert.equal(weekEight.rushingTds, 0);
  assert.equal(weekEight.receptions, 3);
  assert.equal(weekEight.receivingYards, 43);
  assert.equal(weekEight.receivingTds, 0);
  assert.ok(Number.isFinite(weekEight.snapPct));
  assert.equal(weekEight.touches, weekEight.rushAttempts + weekEight.receptions);
  assert.equal(weekEight.touches, 11);
  assert.equal(weekEight.fantasyPoints, 9.8);
  assert.equal(standard.player_trends[0].fantasyPoints, 6.8);
});

test("player rows expose current nflverse depth rank and same-position teammates", () => {
  const player = queryPlayers(new URLSearchParams("seasonType=REG&search=Christian%20McCaffrey&includeDepthCharts=1&limit=1")).data[0];
  assert.equal(player.current_depth_team, "SF");
  assert.equal(player.current_depth_position, "RB");
  assert.equal(player.current_depth_rank, 1);
  assert.match(player.current_depth_updated_at, /^2026-/);
  assert.equal(player.current_depth_chart[0].name, "Christian McCaffrey");
  assert.equal(player.current_depth_chart[0].selected, true);
  assert.ok(player.current_depth_chart.every((depthPlayer) => depthPlayer.depthPosition === "RB"));
  assert.ok(player.current_depth_chart.some((depthPlayer) => depthPlayer.depthRank === 2 && depthPlayer.name === "Jordan James"));
});

test("player trend payload is skippable while compact keyed depth metadata remains", () => {
  const result = queryPlayers(new URLSearchParams("seasonType=REG&search=Christian%20McCaffrey&includeTrends=0&limit=1"));
  const player = result.data[0];

  assert.equal(Object.hasOwn(player, "player_trends"), false);
  assert.equal(Object.hasOwn(player, "current_depth_chart"), false);
  assert.equal(player.current_depth_rank, 1);
  assert.equal(player.current_depth_key, "SF:RB");
  assert.equal(result.meta.includeTrends, false);
  assert.equal(result.meta.includeDepthCharts, false);
  assert.equal(result.meta.depthCharts["SF:RB"].team, "SF");
  assert.equal(result.meta.depthCharts["SF:RB"].depthPosition, "RB");
  assert.equal(result.meta.depthCharts["SF:RB"].players[0].name, "Christian McCaffrey");
  assert.ok(result.meta.depthCharts["SF:RB"].players.some((depthPlayer) => depthPlayer.depthRank === 2 && depthPlayer.name === "Jordan James"));
  assert.throws(() => queryPlayers(new URLSearchParams("includeTrends=true")), QueryValidationError);
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
  assert.equal(profile.data.gameLogs[0].result, "W");
  assert.equal(profile.data.seasonStats[0].fantasy_points, 458.4);
  assert.equal(profile.data.seasonStats[0].fantasy_points_per_game, 24.1);
  assert.equal(profile.data.seasonStats[0].snap_pct, 81.7);
  assert.equal(profile.data.seasonStats[0].sacks_suffered, 0);
  assert.ok(profile.data.depthChart.groups.some((group) => group.position === "RB" && group.players.some((player) => player.selected && player.fantasyPointsPerGame === 24.1)));
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
  assert.ok(result.data.drives.length >= 15);
  assert.deepEqual(Object.keys(result.data.drives[0]).sort(), [
    "driveNumber", "marginAfter", "ownStart", "passPlays", "passYards", "plays", "rawResult",
    "result", "runPlays", "runYards", "scoreAfter", "startMin", "team", "topMin", "yards",
  ]);
  assert.ok(result.data.drives.every((drive) => drive.plays >= 0 && drive.ownStart >= 0 && drive.ownStart <= 100));
  assert.ok(result.data.drives.some((drive) => drive.passYards !== 0 || drive.runYards !== 0));
  assert.ok(result.data.boxScore.some((row) => row.team === "NYG" && row.position_group === "QB"));
  assert.ok(result.data.boxScore.some((row) => row.team === "PHI" && row.position_group === "RB"));
  assert.equal(result.data.segments.length, 6);
  assert.equal(result.data.teamSegments.length, 12);
  assert.equal(result.data.playerSegments.filter((row) => row.team === "NYG").length, 9);
  assert.ok(result.data.playerSegments.every((row) => row.segments.length === 6));
  const giantsQuarterback = result.data.playerSegments.find((row) => row.team === "NYG" && row.position === "QB");
  assert.ok(giantsQuarterback.total.passAttempts > 0);
  assert.ok(giantsQuarterback.total.snaps > 0);
  assert.equal(result.data.availability.playerParticipation, true);
  assert.equal(result.data.availability.scoringTimeline, true);
  assert.equal(result.data.availability.driveWaterfall, true);
  assert.equal(result.data.availability.unavailable.length, 0);
  assert.match(result.meta.methodology.offensiveSnaps, /scrimmage plays/);
  assert.match(result.meta.methodology.metricScaling, /same KPI/);
  assert.ok(result.meta.queryMs < 250);
  assert.throws(() => queryGameBreakdown(new URLSearchParams("gameId=missing")), QueryValidationError);
  const participationExample = queryGameBreakdown(new URLSearchParams("gameId=2025_01_NYG_WAS&scoring=ppr"));
  assert.equal(participationExample.data.playerSegments.filter((row) => row.team === "WAS").length, 9);
  assert.equal(participationExample.data.playerSegments.filter((row) => row.team === "NYG").length, 9);
  for (const [gameId, team] of [["2025_10_BUF_MIA", "MIA"], ["2025_11_NYJ_NE", "NE"]]) {
    const edgeCase = queryGameBreakdown(new URLSearchParams({ gameId, scoring: "ppr" }));
    assert.equal(edgeCase.data.playerSegments.filter((row) => row.team === team).length, 9);
  }
  assert.deepEqual(Object.keys(participationExample.data.playerSegments[0].segments[0]).sort(), [
    "fantasyPoints", "passAttempts", "receptions", "rushAttempts", "segment", "snaps", "targets", "touchdowns", "yards",
  ]);
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

test("FantasyPros PPR ADP and positional rank are joined and sortable", () => {
  const meta = getMeta();
  assert.equal(meta.draftRankings.season, 2026);
  assert.equal(meta.draftRankings.scoring, "PPR");
  assert.ok(meta.draftRankings.matched_rows >= 400);
  assert.match(meta.draftRankings.source_url, /fantasypros\.com\/nfl\/adp\/ppr-overall\.php/);

  const player = queryPlayers(new URLSearchParams("search=Christian%20McCaffrey&limit=1")).data[0];
  assert.equal(player.adp, 5.4);
  assert.equal(player.draft_position_rank, 3);
  assert.equal(player.draft_position_rank_label, "RB3");

  const sorted = queryPlayers(new URLSearchParams("sort=adp&direction=asc&limit=5")).data;
  assert.ok(sorted.every((row) => row.adp !== null));
  assert.deepEqual(sorted.map((row) => row.adp), [...sorted.map((row) => row.adp)].sort((a, b) => a - b));
});

test("player rows expose the next 2026 matchup and Yahoo-ready nullable fields", () => {
  const result = queryPlayers(new URLSearchParams("seasonType=ALL&weeks=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18&search=Jahmyr%20Gibbs&limit=all"));
  assert.equal(result.data.length, 1);
  assert.match(result.data[0].upcoming_matchup, /^Sun \d{1,2}:\d{2} (am|pm) (vs|@) [A-Z]+$/);
  assert.match(result.data[0].upcoming_game_url, /^https:\/\/www\.espn\.com\/nfl\/game\/_\/gameId\//);
  assert.equal(result.data[0].yahoo_roster_pct, null);
  assert.equal(result.data[0].yahoo_start_pct, null);
  assert.equal(result.data[0].yahoo_adds, null);
  assert.equal(result.data[0].yahoo_drops, null);
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
