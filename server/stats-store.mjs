import { DatabaseSync } from "node:sqlite";
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT_DB_PATH = fileURLToPath(new URL("../data/fantasy_football.sqlite", import.meta.url));
const VERCEL_DB_PATH = path.join("/tmp", "fantasy_football_2025.sqlite");

const SORT_COLUMNS = new Map([
  ["rank", "fantasy_points"], ["name", "player_display_name"],
  ["team", "team"], ["position", "position"], ["games_played", "games_played"],
  ["snaps", "snaps"], ["snap_pct", "snap_pct"],
  ["passing_attempts", "passing_attempts"], ["completions", "completions"],
  ["completion_pct", "completion_pct"], ["passing_yards", "passing_yards"],
  ["passing_yards_per_game", "passing_yards_per_game"],
  ["passing_yards_per_attempt", "passing_yards_per_attempt"],
  ["passing_tds", "passing_tds"], ["interceptions", "interceptions"],
  ["carries", "carries"], ["rushing_yards", "rushing_yards"],
  ["rushing_yards_per_game", "rushing_yards_per_game"],
  ["rushing_yards_per_attempt", "rushing_yards_per_attempt"], ["rushing_tds", "rushing_tds"],
  ["targets", "targets"], ["receptions", "receptions"], ["reception_pct", "reception_pct"],
  ["receiving_yards", "receiving_yards"],
  ["receiving_yards_per_game", "receiving_yards_per_game"],
  ["receiving_yards_per_reception", "receiving_yards_per_reception"],
  ["receiving_tds", "receiving_tds"], ["fantasy_points", "fantasy_points"],
  ["fantasy_points_per_game", "fantasy_points_per_game"],
]);

let database;
let activePath;

export class QueryValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = "QueryValidationError";
    this.field = field;
    this.status = 400;
  }
}

export function openDatabase(dbPath = process.env.FANTASY_DB_PATH || DEFAULT_DB_PATH) {
  let resolved = path.resolve(dbPath);
  if (!process.env.FANTASY_DB_PATH && process.env.VERCEL) {
    resolved = VERCEL_DB_PATH;
    if (!database || activePath !== resolved) copyFileSync(DEFAULT_DB_PATH, resolved);
  }
  if (!database || activePath !== resolved) {
    database?.close();
    database = new DatabaseSync(resolved, { readOnly: true });
    database.exec("PRAGMA query_only = ON; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY;");
    activePath = resolved;
  }
  return database;
}

function boundedNumber(value, fallback, minimum, maximum, field) {
  if (value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new QueryValidationError(field, `${field} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function list(value, map = (item) => item) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean).map(map);
}

function sortTerms(sortValue, directionValue) {
  const keys = list(sortValue || "fantasy_points");
  const directions = list(directionValue || "desc");
  if (!keys.length || keys.length > 3) throw new QueryValidationError("sort", "Provide between one and three sort fields");
  return keys.map((key, index) => {
    if (!SORT_COLUMNS.has(key)) throw new QueryValidationError("sort", `Unknown sort field: ${key}`);
    const direction = directions[index] || directions.at(-1) || "desc";
    if (!["asc", "desc"].includes(direction)) throw new QueryValidationError("direction", "Direction must be asc or desc");
    return { key, column: SORT_COLUMNS.get(key), direction, sqlDirection: direction === "asc" ? "ASC" : "DESC" };
  });
}

function placeholders(values) {
  return values.map(() => "?").join(", ");
}

function parseRanks(value) {
  const expression = String(value || "").trim();
  if (!expression) return [];
  const ranks = new Set();
  for (const token of expression.replaceAll("–", "-").split(",")) {
    const part = token.trim();
    if (/^\d+$/.test(part)) {
      ranks.add(Number(part));
      continue;
    }
    const match = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!match) throw new QueryValidationError("ranks", "Use ranks such as 1-5, 16, 30");
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start > end || end - start > 500) throw new QueryValidationError("ranks", "Rank ranges must be ascending and no wider than 500");
    for (let rank = start; rank <= end; rank += 1) ranks.add(rank);
  }
  const values = [...ranks].filter((rank) => rank >= 1 && rank <= 500).sort((a, b) => a - b);
  if (!values.length) throw new QueryValidationError("ranks", "No valid ranks were provided");
  return values;
}

export function getMeta(dbPath) {
  const db = openDatabase(dbPath);
  const summaryRow = db.prepare("SELECT value FROM warehouse_meta WHERE key = 'summary'").get();
  const summary = summaryRow ? JSON.parse(summaryRow.value) : {};
  return {
    season: 2025,
    seasonTypes: [
      { value: "REG", label: "Regular Season" },
      { value: "POST", label: "Postseason" },
      { value: "ALL", label: "Full Season" },
    ],
    scoringSystems: [
      { value: "ppr", label: "PPR", receptionBonus: 1 },
      { value: "half", label: "Half PPR", receptionBonus: 0.5 },
      { value: "standard", label: "Standard", receptionBonus: 0 },
    ],
    positions: db.prepare("SELECT DISTINCT position FROM player_week_stats WHERE position <> '' ORDER BY position").all().map((row) => row.position),
    teams: db.prepare("SELECT DISTINCT team FROM player_week_stats WHERE team <> '' AND team <> 'UNK' ORDER BY team").all().map((row) => row.team),
    weeks: db.prepare("SELECT season_type, GROUP_CONCAT(week) AS weeks FROM (SELECT DISTINCT season_type, week FROM player_week_stats ORDER BY season_type, week) GROUP BY season_type ORDER BY season_type").all(),
    weekOptions: db.prepare("SELECT DISTINCT season_type, week FROM player_week_stats WHERE season = 2025 ORDER BY week").all(),
    warehouse: summary,
    attribution: { name: "nflverse", url: "https://github.com/nflverse/nflverse-data", license: "CC BY 4.0" },
  };
}

export function queryPlayers(searchParams = new URLSearchParams(), dbPath) {
  const db = openDatabase(dbPath);
  const started = performance.now();
  const seasonType = searchParams.get("seasonType") || "REG";
  if (!["REG", "POST", "ALL"].includes(seasonType)) throw new QueryValidationError("seasonType", "Unknown season type");
  const scoring = searchParams.get("scoring") || "ppr";
  if (!["standard", "half", "ppr"].includes(scoring)) throw new QueryValidationError("scoring", "Unknown scoring system");
  const receptionBonus = scoring === "ppr" ? 1 : scoring === "half" ? 0.5 : 0;
  const sorts = sortTerms(searchParams.get("sort"), searchParams.get("direction"));
  const sortSql = sorts.map(({ column, sqlDirection }) => `${column} ${sqlDirection}`).join(", ");
  const limit = searchParams.get("limit") === "all" ? 1000 : boundedNumber(searchParams.get("limit"), 10, 1, 1000, "limit");
  const positions = list(searchParams.get("positions"));
  const teams = list(searchParams.get("teams"));
  const weeks = list(searchParams.get("weeks"), Number).filter((week) => Number.isInteger(week) && week >= 1 && week <= 25);
  const search = String(searchParams.get("search") || "").trim().slice(0, 80);
  const minGames = boundedNumber(searchParams.get("minGames"), 0, 0, 25, "minGames");
  const minSnaps = boundedNumber(searchParams.get("minSnaps"), 0, 0, 3000, "minSnaps");
  const ranks = parseRanks(searchParams.get("ranks"));

  const where = ["season = 2025"];
  const params = [];
  if (seasonType !== "ALL") {
    where.push("season_type = ?");
    params.push(seasonType);
  }
  if (positions.length) {
    where.push(`position IN (${placeholders(positions)})`);
    params.push(...positions);
  }
  if (teams.length) {
    where.push(`team IN (${placeholders(teams)})`);
    params.push(...teams);
  }
  if (weeks.length) {
    where.push(`week IN (${placeholders(weeks)})`);
    params.push(...weeks);
  }
  if (search) {
    where.push("(player_display_name LIKE ? COLLATE NOCASE OR team LIKE ? COLLATE NOCASE)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const rankFilter = ranks.length ? `WHERE rank IN (${placeholders(ranks)})` : "";
  const sql = `
    WITH aggregated AS (
      SELECT
        player_id,
        MAX(player_display_name) AS player_display_name,
        GROUP_CONCAT(DISTINCT NULLIF(team, 'UNK')) AS team,
        MAX(position) AS position,
        COUNT(DISTINCT season_type || '-' || week) AS games_played,
        COALESCE(SUM(offense_snaps), 0) AS snaps,
        CASE
          WHEN SUM(CASE WHEN offense_pct > 0 THEN offense_snaps / offense_pct END) > 0
          THEN ROUND(100.0 * SUM(offense_snaps) / SUM(CASE WHEN offense_pct > 0 THEN offense_snaps / offense_pct END), 1)
        END AS snap_pct,
        SUM(attempts) AS passing_attempts,
        SUM(completions) AS completions,
        CASE WHEN SUM(attempts) > 0 THEN ROUND(100.0 * SUM(completions) / SUM(attempts), 1) END AS completion_pct,
        SUM(passing_yards) AS passing_yards,
        CASE WHEN COUNT(DISTINCT season_type || '-' || week) > 0 THEN ROUND(1.0 * SUM(passing_yards) / COUNT(DISTINCT season_type || '-' || week), 1) END AS passing_yards_per_game,
        CASE WHEN SUM(attempts) > 0 THEN ROUND(1.0 * SUM(passing_yards) / SUM(attempts), 1) END AS passing_yards_per_attempt,
        SUM(passing_tds) AS passing_tds,
        SUM(interceptions) AS interceptions,
        SUM(carries) AS carries,
        SUM(rushing_yards) AS rushing_yards,
        CASE WHEN COUNT(DISTINCT season_type || '-' || week) > 0 THEN ROUND(1.0 * SUM(rushing_yards) / COUNT(DISTINCT season_type || '-' || week), 1) END AS rushing_yards_per_game,
        CASE WHEN SUM(carries) > 0 THEN ROUND(1.0 * SUM(rushing_yards) / SUM(carries), 1) END AS rushing_yards_per_attempt,
        SUM(rushing_tds) AS rushing_tds,
        SUM(targets) AS targets,
        SUM(receptions) AS receptions,
        CASE WHEN SUM(targets) > 0 THEN ROUND(100.0 * SUM(receptions) / SUM(targets), 1) END AS reception_pct,
        SUM(receiving_yards) AS receiving_yards,
        CASE WHEN COUNT(DISTINCT season_type || '-' || week) > 0 THEN ROUND(1.0 * SUM(receiving_yards) / COUNT(DISTINCT season_type || '-' || week), 1) END AS receiving_yards_per_game,
        CASE WHEN SUM(receptions) > 0 THEN ROUND(1.0 * SUM(receiving_yards) / SUM(receptions), 1) END AS receiving_yards_per_reception,
        SUM(receiving_tds) AS receiving_tds,
        ROUND(SUM(fantasy_points + receptions * ?), 1) AS fantasy_points,
        CASE WHEN COUNT(DISTINCT season_type || '-' || week) > 0
          THEN ROUND(SUM(fantasy_points + receptions * ?) / COUNT(DISTINCT season_type || '-' || week), 1)
        END AS fantasy_points_per_game
      FROM player_week_stats
      WHERE ${where.join(" AND ")}
      GROUP BY player_id
    ), filtered AS (
      SELECT * FROM aggregated WHERE games_played >= ? AND snaps >= ?
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY ${sortSql}, player_id ASC) AS rank,
        COUNT(*) OVER () AS total_count
      FROM filtered
    )
    SELECT * FROM ranked ${rankFilter}
    ORDER BY rank ASC
    LIMIT ?
  `;
  const rows = db.prepare(sql).all(receptionBonus, receptionBonus, ...params, minGames, minSnaps, ...ranks, limit);
  return {
    data: rows,
    meta: {
      totalCount: rows[0]?.total_count ?? 0,
      returnedCount: rows.length,
      queryMs: Number((performance.now() - started).toFixed(2)),
      season: 2025, seasonType, scoring, positions, teams, weeks, search,
      minGames, minSnaps, sorts: sorts.map(({ key, direction }) => ({ key, direction })), limit, ranks,
    },
  };
}

function scoringBonus(scoring) {
  if (!["standard", "half", "ppr"].includes(scoring)) {
    throw new QueryValidationError("scoring", "Unknown scoring system");
  }
  return scoring === "ppr" ? 1 : scoring === "half" ? 0.5 : 0;
}

function scheduleGame(row) {
  return {
    gameId: row.game_id,
    week: row.week,
    seasonType: row.season_type,
    gameType: row.game_type,
    opponent: row.opponent,
    homeAway: row.home_away,
    gameday: row.gameday,
    weekday: row.weekday,
    gametime: row.gametime,
    timeZone: "America/New_York",
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeScore: row.home_score,
    awayScore: row.away_score,
    pointsFor: row.points_for,
    pointsAgainst: row.points_against,
    result: row.result,
    scoreLabel: row.result && row.points_for !== null && row.points_against !== null
      ? `${row.result} ${row.points_for}-${row.points_against}`
      : null,
    overtime: Boolean(row.overtime),
    stadium: row.stadium,
    roof: row.roof,
    surface: row.surface,
    playByPlayAvailable: Boolean(row.play_by_play_available),
  };
}

function queryScheduleForTeam(db, team, seasonType = "ALL") {
  const params = [team];
  const seasonTypeFilter = seasonType === "ALL" ? "" : "AND g.season_type = ?";
  if (seasonType !== "ALL") params.push(seasonType);
  return db.prepare(`
    SELECT g.*, summary.opponent, summary.home_away, summary.points_for,
      summary.points_against, summary.result
    FROM game_team_summary summary
    INNER JOIN games g USING (game_id)
    WHERE g.season = 2025 AND summary.team = ? ${seasonTypeFilter}
    ORDER BY g.week, g.gameday, g.gametime, g.game_id
  `).all(...params).map(scheduleGame);
}

export function queryTeamBoxScores(searchParams = new URLSearchParams(), dbPath) {
  const db = openDatabase(dbPath);
  const started = performance.now();
  const team = String(searchParams.get("team") || "NYG").trim().toUpperCase();
  const knownTeam = db.prepare("SELECT 1 FROM player_week_stats WHERE season = 2025 AND team = ? LIMIT 1").get(team);
  if (!knownTeam) throw new QueryValidationError("team", "Choose a valid 2025 NFL team");

  const scoring = searchParams.get("scoring") || "ppr";
  const receptionBonus = scoringBonus(scoring);
  const seasonType = searchParams.get("seasonType") || "REG";
  if (!["REG", "POST", "ALL"].includes(seasonType)) throw new QueryValidationError("seasonType", "Unknown season type");

  const requestedWeeks = list(searchParams.get("weeks"), Number);
  const weeks = [...new Set(requestedWeeks.length ? requestedWeeks : Array.from({ length: 18 }, (_, index) => index + 1))]
    .filter((week) => Number.isInteger(week) && week >= 1 && week <= 22)
    .sort((a, b) => a - b);
  if (!weeks.length) throw new QueryValidationError("weeks", "Choose at least one week between 1 and 22");

  const where = [
    "season = 2025",
    "team = ?",
    "source_player_stats = 1",
    "position IN ('QB', 'RB', 'FB', 'HB', 'WR', 'TE')",
    `week IN (${placeholders(weeks)})`,
  ];
  const params = [team, ...weeks];
  if (seasonType !== "ALL") {
    where.push("season_type = ?");
    params.push(seasonType);
  }

  const rows = db.prepare(`
    SELECT
      game_id,
      player_id,
      player_display_name,
      CASE WHEN position IN ('RB', 'FB', 'HB') THEN 'RB' ELSE position END AS position_group,
      position,
      week,
      season_type,
      opponent_team,
      COALESCE(offense_snaps, 0) AS snaps,
      CASE WHEN offense_pct IS NOT NULL THEN ROUND(offense_pct * 100.0, 1) END AS snap_pct,
      completions,
      attempts AS passing_attempts,
      passing_yards,
      passing_tds,
      interceptions,
      carries,
      rushing_yards,
      rushing_tds,
      targets,
      receptions,
      receiving_yards,
      receiving_tds,
      ROUND(fantasy_points + receptions * ?, 1) AS fantasy_points
    FROM player_week_stats
    WHERE ${where.join(" AND ")}
    ORDER BY
      CASE WHEN position = 'QB' THEN 1 WHEN position IN ('RB', 'FB', 'HB') THEN 2 WHEN position = 'WR' THEN 3 WHEN position = 'TE' THEN 4 ELSE 5 END,
      player_display_name COLLATE NOCASE,
      week
  `).all(receptionBonus, ...params);

  const schedule = queryScheduleForTeam(db, team, seasonType);
  const matchupByWeek = new Map(schedule.map((game) => [game.week, game]));

  return {
    data: rows,
    meta: {
      season: 2025,
      team,
      scoring,
      seasonType,
      weeks: weeks.map((week) => matchupByWeek.get(week) ?? {
        week,
        opponent: null,
        seasonType: week <= 18 ? "REG" : "POST",
        gameId: null,
        result: null,
        scoreLabel: null,
        gameday: null,
        gametime: null,
        playByPlayAvailable: false,
      }),
      schedule,
      playerCount: new Set(rows.map((row) => row.player_id)).size,
      queryMs: Number((performance.now() - started).toFixed(2)),
    },
  };
}

export function queryGameBreakdown(searchParams = new URLSearchParams(), dbPath) {
  const db = openDatabase(dbPath);
  const started = performance.now();
  const gameId = String(searchParams.get("gameId") || "").trim().slice(0, 40);
  if (!gameId) throw new QueryValidationError("gameId", "A gameId is required");
  const scoring = searchParams.get("scoring") || "ppr";
  const receptionBonus = scoringBonus(scoring);

  const game = db.prepare(`
    SELECT * FROM games WHERE season = 2025 AND game_id = ?
  `).get(gameId);
  if (!game) throw new QueryValidationError("gameId", "Choose a valid 2025 NFL game");

  const teamSummaries = db.prepare(`
    SELECT * FROM game_team_summary
    WHERE game_id = ?
    ORDER BY CASE home_away WHEN 'away' THEN 1 ELSE 2 END
  `).all(gameId);
  const quarterScores = db.prepare(`
    SELECT quarter, home_points, away_points, home_score_end, away_score_end
    FROM game_quarter_scores WHERE game_id = ? ORDER BY quarter
  `).all(gameId);
  const timelineRows = db.prepare(`
    SELECT sequence, quarter, clock, elapsed_seconds, home_score, away_score, leader, description
    FROM game_flow_events WHERE game_id = ? ORDER BY elapsed_seconds, sequence
  `).all(gameId);
  const timeline = [
    { sequence: 0, quarter: 1, clock: "15:00", elapsed_seconds: 0, home_score: 0, away_score: 0, leader: "tied", leaderTeam: null, description: "Game start" },
    ...timelineRows.map((event) => ({
      ...event,
      leaderTeam: event.leader === "home" ? game.home_team : event.leader === "away" ? game.away_team : null,
    })),
  ];
  const drives = db.prepare(`
    SELECT drive_number, team, start_min, top_min, plays, yards, pass_plays, run_plays,
      pass_yards, run_yards, own_start, result, score_after, margin_after, raw_result
    FROM game_drives WHERE game_id = ? ORDER BY drive_number
  `).all(gameId).map((drive) => ({
    driveNumber: drive.drive_number,
    team: drive.team,
    startMin: drive.start_min,
    topMin: drive.top_min,
    plays: drive.plays,
    yards: drive.yards,
    passPlays: drive.pass_plays,
    runPlays: drive.run_plays,
    passYards: drive.pass_yards,
    runYards: drive.run_yards,
    ownStart: drive.own_start,
    result: drive.result,
    scoreAfter: drive.score_after,
    marginAfter: drive.margin_after,
    rawResult: drive.raw_result,
  }));

  const boxScore = db.prepare(`
    SELECT
      game_id, team, opponent_team, player_id, player_display_name, position, headshot_url,
      CASE WHEN position IN ('RB', 'FB', 'HB') THEN 'RB' ELSE position END AS position_group,
      COALESCE(offense_snaps, 0) AS snaps,
      CASE WHEN offense_pct IS NOT NULL THEN ROUND(offense_pct * 100.0, 1) END AS snap_pct,
      completions, attempts AS passing_attempts, passing_yards, passing_tds, interceptions,
      carries, rushing_yards, rushing_tds, targets, receptions, receiving_yards, receiving_tds,
      ROUND(fantasy_points + receptions * ?, 1) AS fantasy_points
    FROM player_week_stats
    WHERE season = 2025 AND game_id = ? AND source_player_stats = 1
      AND position IN ('QB', 'RB', 'FB', 'HB', 'WR', 'TE')
    ORDER BY team,
      CASE WHEN position = 'QB' THEN 1 WHEN position IN ('RB', 'FB', 'HB') THEN 2 WHEN position = 'WR' THEN 3 WHEN position = 'TE' THEN 4 ELSE 5 END,
      fantasy_points DESC, player_display_name COLLATE NOCASE
  `).all(receptionBonus, gameId);

  const rawPlayerSegments = db.prepare(`
    SELECT
      segments.team, segments.player_id, players.display_name AS player_display_name,
      players.position, players.headshot_url, segments.segment, segments.snaps,
      segments.rush_attempts, segments.pass_attempts, segments.targets,
      segments.yards, segments.touchdowns, segments.receptions,
      ROUND(segments.fantasy_points + segments.receptions * ?, 1) AS fantasy_points
    FROM player_game_segments AS segments
    JOIN players ON players.player_id = segments.player_id
    WHERE segments.game_id = ?
      AND players.position IN ('QB', 'RB', 'FB', 'HB', 'WR', 'TE')
    ORDER BY segments.team, players.position, segments.player_id, segments.segment
  `).all(receptionBonus, gameId);
  const participationRoster = db.prepare(`
    SELECT player_id, team, player_display_name, position, headshot_url,
      CASE WHEN position IN ('RB', 'FB', 'HB') THEN 'RB' ELSE position END AS position_group,
      COALESCE(offense_snaps, 0) AS weekly_snaps
    FROM player_week_stats
    WHERE season = 2025 AND game_id = ?
      AND (source_player_stats = 1 OR source_snap_counts = 1)
      AND position IN ('QB', 'RB', 'FB', 'HB', 'WR', 'TE')
    ORDER BY team, weekly_snaps DESC, player_display_name COLLATE NOCASE
  `).all(gameId);
  const teamSegments = db.prepare(`
    SELECT team, segment, rush_plays, pass_plays, offensive_plays, yards, epa, successful_plays
    FROM game_team_segments WHERE game_id = ? ORDER BY team, segment
  `).all(gameId).map((row) => ({
    team: row.team,
    segment: row.segment,
    rushPlays: row.rush_plays,
    passPlays: row.pass_plays,
    offensivePlays: row.offensive_plays,
    yards: row.yards,
    epa: row.epa,
    successfulPlays: row.successful_plays,
    passPct: row.offensive_plays ? Number((100 * row.pass_plays / row.offensive_plays).toFixed(1)) : 0,
    rushPct: row.offensive_plays ? Number((100 * row.rush_plays / row.offensive_plays).toFixed(1)) : 0,
    successRate: row.offensive_plays ? Number((100 * row.successful_plays / row.offensive_plays).toFixed(1)) : 0,
  }));

  const groupedPlayers = new Map();
  for (const row of rawPlayerSegments) {
    const key = `${row.team}:${row.player_id}`;
    if (!groupedPlayers.has(key)) groupedPlayers.set(key, {
      team: row.team,
      playerId: row.player_id,
      playerDisplayName: row.player_display_name,
      position: ["FB", "HB"].includes(row.position) ? "RB" : row.position,
      headshotUrl: row.headshot_url || null,
      segments: [],
    });
    groupedPlayers.get(key).segments.push({
      segment: row.segment,
      snaps: row.snaps,
      rushAttempts: row.rush_attempts,
      passAttempts: row.pass_attempts,
      targets: row.targets,
      yards: row.yards,
      touchdowns: row.touchdowns,
      receptions: row.receptions,
      fantasyPoints: row.fantasy_points,
    });
  }
  const sumMetrics = (segments) => segments.reduce((total, segment) => ({
    snaps: total.snaps + segment.snaps,
    rushAttempts: total.rushAttempts + segment.rushAttempts,
    passAttempts: total.passAttempts + segment.passAttempts,
    targets: total.targets + segment.targets,
    yards: Number((total.yards + segment.yards).toFixed(1)),
    touchdowns: total.touchdowns + segment.touchdowns,
    receptions: total.receptions + segment.receptions,
    fantasyPoints: Number((total.fantasyPoints + segment.fantasyPoints).toFixed(1)),
  }), { snaps: 0, rushAttempts: 0, passAttempts: 0, targets: 0, yards: 0, touchdowns: 0, receptions: 0, fantasyPoints: 0 });
  const allSegmentPlayers = [...groupedPlayers.values()].map((player) => ({ ...player, total: sumMetrics(player.segments) }));
  for (const row of participationRoster) {
    if (allSegmentPlayers.some((player) => player.team === row.team && player.playerId === row.player_id)) continue;
    const emptySegments = Array.from({ length: 6 }, (_, segment) => ({
      segment, snaps: 0, rushAttempts: 0, passAttempts: 0, targets: 0,
      yards: 0, touchdowns: 0, receptions: 0, fantasyPoints: 0,
    }));
    allSegmentPlayers.push({
      team: row.team,
      playerId: row.player_id,
      playerDisplayName: row.player_display_name,
      position: row.position_group,
      headshotUrl: row.headshot_url || null,
      segments: emptySegments,
      total: sumMetrics(emptySegments),
    });
  }
  const playerSegments = [];
  for (const team of [game.away_team, game.home_team]) {
    const teamPlayers = allSegmentPlayers.filter((player) => player.team === team);
    const selected = [];
    const take = (position, count) => teamPlayers
      .filter((player) => player.position === position)
      .sort((a, b) => b.total.snaps - a.total.snaps || b.total.fantasyPoints - a.total.fantasyPoints || a.playerDisplayName.localeCompare(b.playerDisplayName))
      .slice(0, count);
    selected.push(...take("QB", 1), ...take("WR", 3), ...take("RB", 2), ...take("TE", 2));
    const selectedIds = new Set(selected.map((player) => player.playerId));
    const flexPlayers = teamPlayers
      .filter((player) => !selectedIds.has(player.playerId))
      .sort((a, b) => b.total.snaps - a.total.snaps || b.total.fantasyPoints - a.total.fantasyPoints || a.playerDisplayName.localeCompare(b.playerDisplayName));
    selected.push(...flexPlayers.slice(0, Math.max(0, 9 - selected.length)));
    selected.slice(0, 9).forEach((player, depthIndex) => playerSegments.push({ ...player, depthIndex: depthIndex + 1 }));
  }

  const hasFlow = Boolean(game.play_by_play_available && timelineRows.length);
  const unavailable = [];
  if (!hasFlow) unavailable.push({
    metric: "gameFlow",
    reason: "nflverse play-by-play is unavailable for this game; schedule and player box-score fields remain available.",
  });

  return {
    data: {
      game: {
        gameId: game.game_id,
        season: game.season,
        seasonType: game.season_type,
        gameType: game.game_type,
        week: game.week,
        gameday: game.gameday,
        weekday: game.weekday,
        gametime: game.gametime,
        timeZone: "America/New_York",
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        homeScore: game.home_score,
        awayScore: game.away_score,
        overtime: Boolean(game.overtime),
        stadium: game.stadium,
        roof: game.roof,
        surface: game.surface,
      },
      teams: teamSummaries.map((team) => ({
        team: team.team,
        opponent: team.opponent,
        homeAway: team.home_away,
        pointsFor: team.points_for,
        pointsAgainst: team.points_against,
        result: team.result,
        rushPlays: team.rush_plays,
        passPlays: team.pass_plays,
        offensiveSnaps: team.offensive_plays,
        rushPct: team.rush_pct,
        passPct: team.pass_pct,
        secondsLeading: team.seconds_leading,
        secondsTrailing: team.seconds_trailing,
        secondsTied: team.seconds_tied,
        pctTimeLeading: team.pct_time_leading,
        pctTimeTrailing: team.pct_time_trailing,
        pctTimeTied: team.pct_time_tied,
      })),
      totalOffensiveSnaps: teamSummaries.reduce((sum, team) => sum + (team.offensive_plays || 0), 0),
      quarterScores,
      timeline: hasFlow ? timeline : [],
      drives: hasFlow ? drives : [],
      boxScore,
      segments: [
        { segment: 0, label: "0:00–10:00", phase: "Q1" },
        { segment: 1, label: "10:00–20:00", phase: "Q1–Q2" },
        { segment: 2, label: "20:00–30:00", phase: "Q2–Half" },
        { segment: 3, label: "30:00–40:00", phase: "Q3" },
        { segment: 4, label: "40:00–50:00", phase: "Q3–Q4" },
        { segment: 5, label: "50:00–Final", phase: game.overtime ? "Q4–OT" : "Q4" },
      ],
      teamSegments,
      playerSegments,
      availability: {
        schedule: true,
        playerBoxScore: boxScore.length > 0,
        quarterScores: quarterScores.length > 0,
        scoringTimeline: hasFlow,
        driveWaterfall: hasFlow && drives.length > 0,
        timeInScoreState: hasFlow,
        playMix: teamSummaries.every((team) => team.rush_plays !== null && team.pass_plays !== null),
        playerParticipation: playerSegments.length > 0,
        unavailable,
      },
    },
    meta: {
      season: 2025,
      scoring,
      source: "nflverse schedules, weekly player stats, snap counts, play-by-play, and play participation",
      methodology: {
        timeInScoreState: "Integrated from each score change to the next score change or end of the game clock.",
        playMix: "Rush plays use nflverse rush_attempt; pass plays use pass_attempt plus sacks not already counted as attempts.",
        driveWaterfall: "Each drive is aggregated from nflverse play-by-play. Passing and rushing yardage are summed directly from yards_gained by play type; field position, time of possession, result, and score come from nflverse drive fields.",
        offensiveSnaps: "Team offensive scrimmage plays (rush plus pass), not the sum of individual-player personnel snaps.",
        playerParticipation: "Player snaps use nflverse play-participation personnel. Opportunity and production are grouped into six elapsed-game segments; fantasy points use the selected reception bonus.",
        metricScaling: "Each participation bar is normalized only against the same KPI in the active team and comparison scope; values are never normalized across unlike metrics.",
        gameTimeZone: "nflverse schedule kickoff times are represented in America/New_York.",
      },
      queryMs: Number((performance.now() - started).toFixed(2)),
    },
  };
}

export function queryPlayerProfile(searchParams = new URLSearchParams(), dbPath) {
  const db = openDatabase(dbPath);
  const started = performance.now();
  const playerId = String(searchParams.get("playerId") || "").trim().slice(0, 40);
  if (!playerId) throw new QueryValidationError("playerId", "A playerId is required");
  const scoring = searchParams.get("scoring") || "ppr";
  const receptionBonus = scoringBonus(scoring);

  const playerRow = db.prepare(`
    SELECT
      p.player_id,
      p.display_name AS player_display_name,
      p.position,
      COALESCE(
        NULLIF(p.latest_team, ''),
        (
          SELECT stats.team
          FROM player_week_stats stats
          WHERE stats.player_id = p.player_id AND stats.season = 2025 AND stats.team <> 'UNK'
          ORDER BY stats.week DESC
          LIMIT 1
        ),
        'UNK'
      ) AS team,
      p.headshot_url
    FROM players p
    WHERE p.player_id = ?
  `).get(playerId);
  if (!playerRow) throw new QueryValidationError("playerId", "Unknown player");

  const gameLogs = db.prepare(`
    WITH weekly AS (
      SELECT
        player_id,
        game_id,
        season_type,
        week,
        team,
        opponent_team,
        position,
        player_display_name,
        offense_snaps,
        CASE WHEN offense_pct IS NOT NULL THEN ROUND(offense_pct * 100.0, 1) END AS snap_pct,
        completions,
        attempts AS passing_attempts,
        passing_yards,
        passing_tds,
        interceptions,
        sacks_suffered,
        carries,
        rushing_yards,
        rushing_tds,
        targets,
        receptions,
        receiving_yards,
        receiving_tds,
        CASE WHEN attempts > 0 THEN ROUND(1.0 * passing_yards / attempts, 1) END AS passing_yards_per_attempt,
        CASE WHEN carries > 0 THEN ROUND(1.0 * rushing_yards / carries, 1) END AS rushing_yards_per_attempt,
        CASE WHEN receptions > 0 THEN ROUND(1.0 * receiving_yards / receptions, 1) END AS receiving_yards_per_reception,
        ROUND(fantasy_points + receptions * ?, 1) AS fantasy_points,
        DENSE_RANK() OVER (
          PARTITION BY season_type, week, position
          ORDER BY (fantasy_points + receptions * ?) DESC, player_id ASC
        ) AS position_finish
      FROM player_week_stats
      WHERE season = 2025 AND source_player_stats = 1
    )
    SELECT * FROM weekly WHERE player_id = ? ORDER BY week ASC
  `).all(receptionBonus, receptionBonus, playerId);

  const seasonStats = db.prepare(`
    WITH totals AS (
      SELECT
        player_id,
        MAX(player_display_name) AS player_display_name,
        GROUP_CONCAT(DISTINCT NULLIF(team, 'UNK')) AS team,
        MAX(position) AS position,
        COUNT(DISTINCT season_type || '-' || week) AS games_played,
        SUM(attempts) AS passing_attempts,
        SUM(completions) AS completions,
        SUM(passing_yards) AS passing_yards,
        SUM(passing_tds) AS passing_tds,
        SUM(interceptions) AS interceptions,
        SUM(sacks_suffered) AS sacks_suffered,
        CASE WHEN SUM(attempts) > 0 THEN ROUND(1.0 * SUM(passing_yards) / SUM(attempts), 1) END AS passing_yards_per_attempt,
        SUM(carries) AS carries,
        SUM(rushing_yards) AS rushing_yards,
        SUM(rushing_tds) AS rushing_tds,
        CASE WHEN SUM(carries) > 0 THEN ROUND(1.0 * SUM(rushing_yards) / SUM(carries), 1) END AS rushing_yards_per_attempt,
        SUM(targets) AS targets,
        SUM(receptions) AS receptions,
        SUM(receiving_yards) AS receiving_yards,
        SUM(receiving_tds) AS receiving_tds,
        CASE WHEN SUM(receptions) > 0 THEN ROUND(1.0 * SUM(receiving_yards) / SUM(receptions), 1) END AS receiving_yards_per_reception,
        ROUND(SUM(fantasy_points + receptions * ?), 1) AS fantasy_points
      FROM player_week_stats
      WHERE season = 2025
      GROUP BY player_id
    ), ranked AS (
      SELECT *, DENSE_RANK() OVER (PARTITION BY position ORDER BY fantasy_points DESC, player_id ASC) AS position_finish
      FROM totals
    )
    SELECT 2025 AS season, * FROM ranked WHERE player_id = ?
  `).get(receptionBonus, playerId);

  const depthRows = db.prepare(`
    WITH totals AS (
      SELECT
        player_id,
        MAX(player_display_name) AS player_display_name,
        MAX(position) AS position,
        ROUND(SUM(fantasy_points + receptions * ?), 1) AS fantasy_points,
        COALESCE(SUM(offense_snaps), 0) AS snaps
      FROM player_week_stats
      WHERE season = 2025
      GROUP BY player_id
    ), ranked AS (
      SELECT *, DENSE_RANK() OVER (PARTITION BY position ORDER BY fantasy_points DESC, player_id ASC) AS position_rank
      FROM totals
    ), team_players AS (
      SELECT DISTINCT player_id FROM player_week_stats WHERE season = 2025 AND team = ?
    )
    SELECT ranked.*
    FROM ranked
    INNER JOIN team_players USING (player_id)
    WHERE position IN ('QB', 'RB', 'FB', 'WR', 'TE')
    ORDER BY
      CASE position WHEN 'QB' THEN 1 WHEN 'RB' THEN 2 WHEN 'FB' THEN 2 WHEN 'WR' THEN 3 WHEN 'TE' THEN 4 ELSE 5 END,
      fantasy_points DESC,
      snaps DESC,
      player_display_name ASC
  `).all(receptionBonus, playerRow.team);

  const groupedDepth = [];
  for (const row of depthRows) {
    const groupPosition = row.position === "FB" ? "RB" : row.position;
    let group = groupedDepth.find((item) => item.position === groupPosition);
    if (!group) {
      group = { position: groupPosition, players: [] };
      groupedDepth.push(group);
    }
    group.players.push({
      playerId: row.player_id,
      name: row.player_display_name,
      position: row.position,
      positionRank: row.position_rank,
      fantasyPoints: row.fantasy_points,
      selected: row.player_id === playerId,
    });
  }

  return {
    data: {
      player: {
        playerId: playerRow.player_id,
        name: playerRow.player_display_name,
        position: playerRow.position,
        team: playerRow.team,
        headshotUrl: playerRow.headshot_url,
        leagueStatus: "Roster data not connected",
      },
      gameLogs,
      seasonStats: seasonStats ? [seasonStats] : [],
      depthChart: { team: playerRow.team, groups: groupedDepth },
    },
    meta: {
      season: 2025,
      scoring,
      queryMs: Number((performance.now() - started).toFixed(2)),
    },
  };
}

export function closeDatabase() {
  database?.close();
  database = undefined;
  activePath = undefined;
}
