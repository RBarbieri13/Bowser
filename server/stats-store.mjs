import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT_DB_PATH = fileURLToPath(new URL("../data/fantasy_football.sqlite", import.meta.url));
const VERCEL_DB_PATH = path.join("/tmp", "fantasy_football_2025.sqlite");

const SORT_COLUMNS = new Map([
  ["rank", "fantasy_points_per_game"], ["name", "player_display_name"],
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
    if (!existsSync(VERCEL_DB_PATH)) copyFileSync(DEFAULT_DB_PATH, VERCEL_DB_PATH);
    resolved = VERCEL_DB_PATH;
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
  const keys = list(sortValue || "fantasy_points_per_game");
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

export function closeDatabase() {
  database?.close();
  database = undefined;
  activePath = undefined;
}
