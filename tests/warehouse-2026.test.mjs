import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { alignedHistory, TREND_METRICS } from '../server/trend-history.mjs';
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
  assert.deepEqual(ppr.player_trends.map((game) => [game.season, game.week]), [
    ...Array.from({ length: 9 }, (_, index) => [2025, index + 10]), [2026, 1],
  ]);
  assert.equal(ppr.player_trends.at(-1).snaps, 69);
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
  assert.ok(players.some((player) => !player.hasNFLHistory));
  assert.ok(players.some((player) => player.recordedGames === 1));
  assert.ok(players.every((player) => player.history.length === 10));
  assert.ok(players.every((player) => player.history.at(-1).season === 2026 && player.history.at(-1).week === 1));
  assert.equal(players.find((p) => p.playerId === '00-0040691').history.at(-1).snaps, 69);
  assert.deepEqual(tracker.meta.trendSeasons, [2025, 2026]);
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

test('all players and Opportunity use the same cross-season NFL week slots and unfiltered domains', () => {
  const expectedSlots = [...Array.from({ length: 9 }, (_, index) => `2025-${index + 10}`), '2026-1'];
  const result = queryPlayers(params('limit=all&weeks=1'));
  assert.deepEqual(result.meta.trendSlots.map((slot) => slot.key), expectedSlots);
  assert.ok(result.data.every((player) => player.player_trends.map((game) => game.key).join() === expectedSlots.join()));
  const wentz = result.data.find((p) => p.player_display_name === 'Carson Wentz');
  const jefferson = result.data.find((p) => p.player_display_name === 'Justin Jefferson');
  assert.equal(wentz.player_trends.slice(0, -1).filter((game) => game.available).length, 0);
  assert.ok(jefferson.player_trends.slice(0, -1).some((game) => game.available));
  assert.equal(jefferson.games_played, 1);
  assert.equal(jefferson.fantasy_points, jefferson.player_trends.at(-1).fantasyPoints);
  const filtered = queryPlayers(params('teams=MIN&search=Jefferson&limit=1&weeks=1'));
  const opportunity = queryOpportunityTracker(params('team=MIN&weeks=1'));
  const opportunityJefferson = opportunity.data.groups.flatMap((group) => group.players).find((p) => p.playerId === jefferson.player_id);
  assert.deepEqual(opportunityJefferson.history, jefferson.player_trends);
  assert.deepEqual(filtered.meta.trendDomains, result.meta.trendDomains);
  assert.deepEqual(opportunity.meta.trendDomains, result.meta.trendDomains);
  assert.deepEqual(opportunity.meta.trendSlots, result.meta.trendSlots);
  assert.ok(Object.values(result.meta.trendDomains).every((domain) => domain.min <= 0 && domain.max >= 0));
});

test('Skattebo 42 snaps and Tracy 2 snaps retain a common scale, real zero and negative production', () => {
  const tracker = queryOpportunityTracker(params('team=NYG'));
  const players = tracker.data.groups.flatMap((group) => group.players);
  const skattebo = players.find((p) => p.name === 'Cam Skattebo').history;
  const tracy = players.find((p) => p.name === 'Tyrone Tracy Jr.').history;
  assert.equal(skattebo.at(-1).snaps, 42);
  assert.equal(tracy.at(-1).snaps, 2);
  assert.equal(skattebo.at(-1).targets, 0);
  assert.equal(tracy.at(-1).fantasyPoints, -0.6);
  assert.ok(tracker.meta.trendDomains.fantasy_points.min <= -0.6);
  assert.ok(tracker.meta.trendDomains.snaps.max >= 42);
  assert.ok(skattebo.slice(0, -1).every((game) => game.snaps === null));
  assert.equal(tracy.find((game) => game.key === '2025-14').snaps, null);
  for (const game of skattebo) {
    for (const field of Object.values(TREND_METRICS)) assert.ok(Object.hasOwn(game, field), `Missing ${field}`);
  }
});

test('history windows follow selected-week anchors while scalar totals retain the selected range', () => {
  const common = 'season=2025&search=Christian%20McCaffrey&limit=1';
  const all = queryPlayers(new URLSearchParams(`${common}&weeks=1,2&trendWeeks=5`));
  assert.deepEqual(all.meta.trendSlots.map((slot) => slot.week), [1, 2]);
  assert.equal(all.data[0].games_played, 2);
  assert.equal(all.data[0].position_finish_week, 2);
  assert.equal(all.data[0].position_finish_season, 2025);
  const sparse = queryPlayers(new URLSearchParams(`${common}&weeks=1,19&trendWeeks=5`));
  assert.equal(sparse.meta.trendAnchor.week, 18);
  assert.equal(sparse.data[0].position_finish_week, 1);
  assert.equal(sparse.data[0].games_played, 1);
  for (const count of [5, 8, 10]) {
    const players = queryPlayers(params(`trendWeeks=${count}`));
    const tracker = queryOpportunityTracker(params(`team=NYG&games=${count}&weeks=2`));
    assert.equal(players.meta.trendSlots.length, count);
    assert.equal(tracker.meta.trendSlots.length, count);
    assert.equal(tracker.meta.trendAnchor.key, '2026-1');
    assert.equal(tracker.meta.positionFinish.week, null);
    assert.ok(tracker.data.groups.flatMap((group) => group.players).every((p) => p.position_finish === null));
  }
  for (const bad of ['0', '6', '7.5', '12', 'abc']) {
    assert.throws(() => queryPlayers(params(`trendWeeks=${bad}`)), QueryValidationError);
    assert.throws(() => queryOpportunityTracker(params(`games=${bad}`)), QueryValidationError);
  }
  assert.throws(() => queryOpportunityTracker(params('weeks=0')), QueryValidationError);
  assert.throws(() => queryOpportunityTracker(params('scoring=unknown')), QueryValidationError);
});

test('Opportunity scoring and schedule match Player Database and Team Box Score controls', () => {
  for (const scoring of ['ppr', 'half', 'standard']) {
    const tracker = queryOpportunityTracker(params(`team=MIN&weeks=1,2&games=8&scoring=${scoring}`));
    const box = queryTeamBoxScores(params(`team=MIN&weeks=1,2&scoring=${scoring}`));
    const database = queryPlayers(params(`teams=MIN&weeks=1,2&trendWeeks=8&scoring=${scoring}&limit=all`));
    assert.deepEqual(tracker.meta.schedule, box.meta.schedule);
    assert.equal(tracker.meta.scoring, scoring);
    assert.deepEqual(tracker.meta.weeks, [1, 2]);
    const roster = tracker.data.groups.flatMap((group) => group.players);
    for (const row of database.data) {
      const player = roster.find((candidate) => candidate.playerId === row.player_id);
      if (player) assert.deepEqual(player.history, row.player_trends);
    }
  }
});

test('weekly position finish uses NFL peers, selected scoring and competition ties regardless of filtering', () => {
  for (const scoring of ['ppr', 'half', 'standard']) {
    const bonus = scoring === 'ppr' ? 1 : scoring === 'half' ? 0.5 : 0;
    const db = openDatabase(undefined, 2026);
    const expected = db.prepare(`
      WITH totals AS (
        SELECT player_id, CASE WHEN MAX(position) IN ('RB','FB','HB') THEN 'RB' ELSE MAX(position) END AS pos,
          ROUND(SUM(fantasy_points + receptions * ?), 2) AS points
        FROM player_week_stats WHERE season=2026 AND season_type='REG' AND week=1 AND played=1 GROUP BY player_id
      ) SELECT player_id, RANK() OVER (PARTITION BY pos ORDER BY points DESC) AS finish FROM totals
    `).all(bonus);
    const ranks = new Map(expected.map((row) => [row.player_id, row.finish]));
    const result = queryPlayers(params(`limit=all&weeks=1&scoring=${scoring}`));
    for (const row of result.data) {
      assert.equal(row.position_finish, ranks.get(row.player_id));
      assert.equal(row.player_trends.at(-1).positionFinish, ranks.get(row.player_id));
    }
    const filtered = queryPlayers(params(`teams=NYG&search=Tracy&limit=1&weeks=1&scoring=${scoring}`)).data[0];
    assert.equal(filtered.position_finish, ranks.get(filtered.player_id));
    assert.equal(filtered.position_finish_week, 1);
    assert.equal(filtered.position_finish_season, 2026);
    const profile = queryPlayerProfile(params(`playerId=${filtered.player_id}&scoring=${scoring}`));
    assert.equal(profile.data.gameLogs[0].position_finish, filtered.position_finish);
  }
});

function syntheticHistoryDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE games (game_id TEXT, season INTEGER, season_type TEXT, week INTEGER, gameday TEXT, home_score INTEGER, away_score INTEGER);
    CREATE TABLE player_week_stats (player_id TEXT, season INTEGER, week INTEGER, position TEXT, team TEXT, opponent_team TEXT,
      game_id TEXT, season_type TEXT, played INTEGER, offense_snaps REAL, offense_pct REAL, attempts REAL, completions REAL,
      passing_yards REAL, passing_tds REAL, interceptions REAL, carries REAL, rushing_yards REAL, rushing_tds REAL,
      targets REAL, receptions REAL, receiving_yards REAL, receiving_tds REAL, fantasy_points REAL);
    INSERT INTO games VALUES ('fixture-week1', 2026, 'REG', 1, '2026-09-13', 7, 0);
    INSERT INTO games VALUES ('future-week2', 2026, 'REG', 2, '2026-09-20', NULL, NULL);`);
  const add = (id, position, points, receptions = 0, snaps = 1) => {
    const row = [id, 2026, 1, position, 'A', 'B', 'fixture-week1', 'REG', 1, snaps, snaps === null ? null : 0.1,
      0, 0, 0, 0, 0, 0, 0, 0, receptions, receptions, 0, 0, points];
    db.prepare(`INSERT INTO player_week_stats VALUES (${row.map(() => '?').join(',')})`).run(...row);
  };
  add('qb-first', 'QB', 10);
  add('qb-tied', 'QB', 10);
  add('qb-third', 'QB', 8);
  add('rb-first', 'RB', 10);
  add('fb-tied', 'FB', 10);
  add('hb-third', 'HB', 4);
  add('zero', 'QB', 0);
  add('negative', 'QB', -2);
  add('missing-snaps', 'WR', 3, 2, null);
  return db;
}

test('rank ties do not use player IDs, RB includes FB/HB, null stays missing and zero/negative domains are preserved', () => {
  const db = syntheticHistoryDatabase();
  try {
    const history = alignedHistory([{ season: 2026, db }], { season: 2026, receptionBonus: 0 });
    assert.deepEqual(history.slots.map((slot) => slot.week), [1]);
    for (const [player, finish] of [['qb-first', 1], ['qb-tied', 1], ['qb-third', 3], ['rb-first', 1], ['fb-tied', 1], ['hb-third', 3]]) {
      assert.equal(history.rankForPlayer(player).position_finish, finish);
    }
    assert.equal(history.forPlayer('zero')[0].fantasyPoints, 0);
    assert.equal(history.forPlayer('negative')[0].fantasyPoints, -2);
    assert.equal(history.forPlayer('missing-snaps')[0].snaps, null);
    assert.equal(history.forPlayer('missing-snaps')[0].available, true);
    assert.equal(history.forPlayer('not-rostered')[0].available, false);
    assert.equal(history.forPlayer('not-rostered')[0].fantasyPoints, null);
    assert.deepEqual(history.domains.fantasy_points, { min: -2, max: 10 });
    assert.deepEqual(history.domains.passing_yards, { min: 0, max: 0 });
    const ppr = alignedHistory([{ season: 2026, db }], { season: 2026, receptionBonus: 1 });
    assert.equal(ppr.forPlayer('missing-snaps')[0].fantasyPoints, 5);
  } finally { db.close(); }
});


test('position finish sorts before pagination and leaves unranked players last', () => {
  const result = queryPlayers(params('positions=RB&sort=position_finish&direction=asc&limit=10'));
  const expected = queryPlayers(params('positions=RB&limit=all')).data
    .sort((a, b) => (a.position_finish ?? Infinity) - (b.position_finish ?? Infinity) || a.player_id.localeCompare(b.player_id));
  assert.deepEqual(result.data.map((row) => row.player_id), expected.slice(0, 10).map((row) => row.player_id));
  const historic = queryPlayers(new URLSearchParams('season=2025&sort=position_finish&direction=desc&limit=all'));
  const firstMissing = historic.data.findIndex((row) => row.position_finish === null);
  assert.ok(firstMissing > 0);
  assert.ok(historic.data.slice(firstMissing).every((row) => row.position_finish === null));
});
