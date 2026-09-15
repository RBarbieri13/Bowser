import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { closeDatabase, getMeta, openDatabase, queryPlayers, queryPlayerProfile, queryTeamBoxScores, queryGameBreakdown, queryOpportunityTracker, QueryValidationError } from '../server/stats-store.mjs';

const params = (query = '') => new URLSearchParams(`season=2026&${query}`);
after(() => closeDatabase());

test('current snapshot is isolated and the historic warehouse is byte-identical', () => {
  assert.equal(createHash('sha256').update(readFileSync(new URL('../data/fantasy_football.sqlite', import.meta.url))).digest('hex'), 'd3cc2ed8e38eaca00005b4facb2e475c833418302b4b2c367c42574412dd1869');
  const meta = getMeta(undefined, params());
  assert.equal(meta.season, 2026);
  assert.deepEqual(meta.seasons, [2025, 2026]);
  assert.deepEqual(meta.availableWeeks, [1]);
  assert.equal(meta.warehouse.completed_games, 16);
  assert.equal(meta.warehouse.games_with_play_by_play, 16);
  assert.equal(meta.warehouse.player_stat_rows, 363);
  assert.equal(meta.warehouse.stat_rows_with_snap_match, 363);
  assert.equal(meta.warehouse.snap_rows, 410);
  assert.equal(getMeta().season, 2025);
  assert.equal(getMeta().warehouse.player_stat_rows, 5630);
});

test('2026 player totals and profile use Week 1 facts and selected scoring', () => {
  const ppr = queryPlayers(params('search=Jaxson%20Dart&limit=all')).data[0];
  assert.equal(ppr.games_played, 1);
  assert.equal(ppr.passing_attempts, 29);
  assert.equal(ppr.passing_yards, 230);
  assert.equal(ppr.passing_tds, 3);
  assert.equal(ppr.carries, 11);
  assert.equal(ppr.rushing_yards, 54);
  assert.equal(ppr.snaps, 69);
  assert.equal(ppr.fantasy_points, 26.6);
  assert.deepEqual(ppr.player_trends.map((game) => [game.season, game.week]), [[2026, 1]]);
  const receiver = queryPlayers(params('search=Antonio%20Williams&limit=all')).data[0];
  const standard = queryPlayers(params('search=Antonio%20Williams&limit=all&scoring=standard')).data[0];
  assert.equal(Number((receiver.fantasy_points - standard.fantasy_points).toFixed(1)), receiver.receptions);
  const profile = queryPlayerProfile(params(`playerId=${receiver.player_id}`));
  assert.equal(profile.meta.season, 2026);
  assert.equal(profile.data.gameLogs.length, 1);
  assert.equal(profile.data.gameLogs[0].fantasy_points, receiver.fantasy_points);
  assert.deepEqual(profile.data.seasonStats.map((row) => row.season), [2026]);
  const noHistory = queryPlayerProfile(params('playerId=00-0041561'));
  assert.equal(noHistory.data.player.name, 'Carson Beck');
  assert.deepEqual(noHistory.data.gameLogs, []);
});

test('team box scores and game breakdown use real outcomes and never invent participation', () => {
  const scores = queryTeamBoxScores(params('team=NYG&weeks=1,2'));
  assert.equal(scores.meta.season, 2026);
  assert.equal(scores.meta.weeks[0].scoreLabel, 'W 28-20');
  assert.equal(scores.meta.weeks[1].homeScore, null);
  assert.equal(scores.meta.weeks[1].result, null);
  assert.ok(scores.data.every((row) => row.week === 1));
  const game = queryGameBreakdown(params('gameId=2026_01_DAL_NYG'));
  assert.equal(game.data.game.homeScore, 28);
  assert.equal(game.data.game.awayScore, 20);
  assert.equal(game.data.availability.driveWaterfall, true);
  assert.equal(game.data.availability.playerOpportunities, true);
  assert.equal(game.data.availability.playerParticipation, false);
  assert.ok(game.data.drives.length > 10);
  assert.ok(game.data.playerSegments.length > 10);
  assert.ok(game.data.playerSegments.every((p) => p.total.snaps === null && p.segments.every((segment) => segment.snaps === null)));
  assert.ok(game.data.availability.unavailable.some((item) => item.metric === 'playerParticipation'));
  const future = queryGameBreakdown(params(`gameId=${scores.meta.weeks[1].gameId}`));
  assert.equal(future.data.game.homeScore, null);
  assert.deepEqual(future.data.teamSegments, []);
});

test('opportunity history and profile preserve current rookies and no-game players', () => {
  const tracker = queryOpportunityTracker(params('team=NYG'));
  assert.equal(tracker.meta.historySeason, 2026);
  const players = tracker.data.groups.flatMap((group) => group.players);
  assert.ok(players.some((player) => player.history.length === 0));
  assert.ok(players.some((player) => player.history.length === 1));
  assert.ok(players.every((player) => player.history.every((game) => game.season === 2026 && game.week === 1)));
  assert.equal(players.find((p) => p.playerId === '00-0040691').averages.snaps, 69);
  assert.equal(queryOpportunityTracker(new URLSearchParams('team=NYG')).meta.historySeason, 2025);
});

test('2026 ADP stays dated and upcoming matchups use the current roster team', () => {
  const meta = getMeta(undefined, params());
  assert.equal(meta.draftRankings.matched_rows, 407);
  assert.equal(meta.draftRankings.captured_at, '2026-08-17T00:49:08.835Z');
  const player = queryPlayers(params('search=Keenan%20Allen&limit=all')).data[0];
  assert.ok(player.adp > 0);
  const db = openDatabase(undefined, 2026);
  assert.equal(db.prepare("SELECT latest_team FROM players WHERE player_id=?").get(player.player_id).latest_team, 'IND');
  assert.equal(db.prepare("SELECT source_team FROM draft_rankings WHERE player_id=?").get(player.player_id).source_team, 'LAC');
  const next = db.prepare("SELECT opponent,kickoff_utc FROM team_schedule WHERE team='IND' AND gameday>=DATE('now') ORDER BY gameday LIMIT 1").get();
  assert.equal(player.upcoming_opponent, next.opponent);
  assert.equal(player.upcoming_kickoff_utc, next.kickoff_utc);
});

test('every stats route rejects unsupported seasons and cross-season game IDs', () => {
  for (const query of [queryPlayers, queryPlayerProfile, queryTeamBoxScores, queryGameBreakdown, queryOpportunityTracker]) {
    assert.throws(() => query(new URLSearchParams('season=2027')), (error) => error instanceof QueryValidationError && error.field === 'season');
  }
  assert.throws(() => getMeta(undefined, new URLSearchParams('season=nope')), QueryValidationError);
  assert.throws(() => queryGameBreakdown(params('gameId=2025_01_DAL_PHI')), QueryValidationError);
  const db = openDatabase(undefined, 2026);
  assert.deepEqual(db.prepare('SELECT DISTINCT season FROM player_week_stats').all().map((row) => row.season), [2026]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM player_game_segments WHERE snaps IS NOT NULL').get().n, 0);
});
