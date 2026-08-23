export const PLAYER_TABLE_PREFERENCE_KEY = "bowser:player-table-preferences:v1";

export const PLAYER_TABLE_GROUPS = [
  {
    name: "Player Details",
    key: "player",
    columns: [
      { key: "select", label: "", defaultWidth: 44, minWidth: 38, maxWidth: 76, align: "center", sortable: false },
      { key: "rank", label: "Rank", defaultWidth: 48, minWidth: 42, maxWidth: 96, align: "center" },
      { key: "name", field: "player_display_name", label: "Name", defaultWidth: 218, minWidth: 130, maxWidth: 360, align: "left" },
    ],
  },
  {
    name: "Draft Metrics",
    key: "draft",
    columns: [
      { key: "adp", label: "ADP", defaultWidth: 64, minWidth: 50, maxWidth: 130, format: "decimal" },
      { key: "draft_position_rank", field: "draft_position_rank_label", label: "POS RK", defaultWidth: 68, minWidth: 54, maxWidth: 140 },
    ],
  },
  {
    name: "Yahoo Fantasy",
    key: "yahoo",
    columns: [
      { key: "yahoo_league_status", label: "Roster", defaultWidth: 132, minWidth: 88, maxWidth: 260, align: "left", sortable: false },
      { key: "yahoo_roster_pct", label: "% Ros", defaultWidth: 62, minWidth: 50, maxWidth: 120, format: "percent", sortable: false },
      { key: "yahoo_start_pct", label: "% Start", defaultWidth: 68, minWidth: 52, maxWidth: 130, format: "percent", sortable: false },
      { key: "yahoo_adds", label: "Adds", defaultWidth: 58, minWidth: 46, maxWidth: 120, sortable: false },
      { key: "yahoo_drops", label: "Drops", defaultWidth: 58, minWidth: 46, maxWidth: 120, sortable: false },
      { key: "yahoo_add_drop_ratio", label: "Trend", defaultWidth: 104, minWidth: 78, maxWidth: 190, sortable: false },
    ],
  },
  {
    name: "Upcoming",
    key: "upcoming",
    columns: [
      { key: "upcoming_matchup", label: "Next", defaultWidth: 158, minWidth: 110, maxWidth: 280, align: "left", sortable: false },
    ],
  },
  {
    name: "Depth Chart",
    key: "depth",
    columns: [
      { key: "depth_rank", label: "Depth", defaultWidth: 68, minWidth: 54, maxWidth: 120, align: "center", sortable: false },
    ],
  },
  {
    name: "Season Usage",
    key: "usage",
    columns: [
      { key: "team", label: "Team", defaultWidth: 76, minWidth: 54, maxWidth: 140, align: "center" },
      { key: "position", label: "POS", defaultWidth: 52, minWidth: 44, maxWidth: 100, align: "center" },
      { key: "games_played", label: "GP", defaultWidth: 48, minWidth: 42, maxWidth: 100, align: "center" },
      { key: "snaps", label: "Snaps", defaultWidth: 68, minWidth: 50, maxWidth: 140 },
      { key: "snap_pct", label: "Snap %", defaultWidth: 68, minWidth: 54, maxWidth: 140, format: "wholePercent" },
    ],
  },
  {
    name: "Passing",
    key: "passing",
    columns: [
      { key: "passing_attempts", label: "ATT", defaultWidth: 61, minWidth: 46, maxWidth: 140 },
      { key: "completions", label: "CMP", defaultWidth: 63, minWidth: 46, maxWidth: 140 },
      { key: "completion_pct", label: "CMP %", defaultWidth: 75, minWidth: 56, maxWidth: 150, format: "wholePercent" },
      { key: "passing_yards", label: "YDS", defaultWidth: 73, minWidth: 50, maxWidth: 150 },
      { key: "passing_yards_per_game", label: "YDS/G", defaultWidth: 75, minWidth: 58, maxWidth: 150, format: "decimal" },
      { key: "passing_yards_per_attempt", label: "Y/A", defaultWidth: 58, minWidth: 46, maxWidth: 130, format: "decimal" },
      { key: "passing_tds", label: "TD", defaultWidth: 51, minWidth: 42, maxWidth: 110 },
      { key: "interceptions", label: "INT", defaultWidth: 57, minWidth: 44, maxWidth: 120 },
    ],
  },
  {
    name: "Rushing",
    key: "rushing",
    columns: [
      { key: "carries", label: "ATT", defaultWidth: 61, minWidth: 46, maxWidth: 140 },
      { key: "rushing_yards", label: "YDS", defaultWidth: 69, minWidth: 50, maxWidth: 150 },
      { key: "rushing_yards_per_game", label: "YDS/G", defaultWidth: 76, minWidth: 58, maxWidth: 150, format: "decimal" },
      { key: "rushing_yards_per_attempt", label: "Y/A", defaultWidth: 54, minWidth: 46, maxWidth: 130, format: "decimal" },
      { key: "rushing_tds", label: "TD", defaultWidth: 52, minWidth: 42, maxWidth: 110 },
    ],
  },
  {
    name: "Receiving",
    key: "receiving",
    columns: [
      { key: "targets", label: "TGT", defaultWidth: 61, minWidth: 46, maxWidth: 140 },
      { key: "receptions", label: "REC", defaultWidth: 61, minWidth: 46, maxWidth: 140 },
      { key: "reception_pct", label: "REC %", defaultWidth: 76, minWidth: 56, maxWidth: 150, format: "wholePercent" },
      { key: "receiving_yards", label: "YDS", defaultWidth: 68, minWidth: 50, maxWidth: 150 },
      { key: "receiving_yards_per_game", label: "YDS/G", defaultWidth: 76, minWidth: 58, maxWidth: 150, format: "decimal" },
      { key: "receiving_yards_per_reception", label: "Y/R", defaultWidth: 54, minWidth: 46, maxWidth: 130, format: "decimal" },
      { key: "receiving_tds", label: "TD", defaultWidth: 48, minWidth: 42, maxWidth: 110 },
    ],
  },
  {
    name: "DFS",
    key: "dfs",
    columns: [
      { key: "draft_kings_price", label: "$", defaultWidth: 68, minWidth: 48, maxWidth: 150, align: "center", sortable: false },
      { key: "draft_kings_projection", label: "FPTS", defaultWidth: 68, minWidth: 52, maxWidth: 150, align: "center", sortable: false },
      { key: "fantasy_points", label: "Fantasy Points", defaultWidth: 85, minWidth: 66, maxWidth: 170, format: "decimal" },
    ],
  },
  {
    name: "Player Trends",
    key: "trends",
    columns: [
      { key: "trend_snaps", label: "Last 10", metric: "snaps", defaultWidth: 214, minWidth: 184, maxWidth: 320, sortable: false },
      { key: "trend_touches", label: "Last 10", metric: "touches", defaultWidth: 214, minWidth: 184, maxWidth: 320, sortable: false },
      { key: "trend_targets", label: "Last 10", metric: "targets", defaultWidth: 214, minWidth: 184, maxWidth: 320, sortable: false },
      { key: "trend_fantasy_points", label: "Last 10", metric: "fantasy_points", defaultWidth: 214, minWidth: 184, maxWidth: 320, sortable: false },
    ],
  },
];

const group = (key) => PLAYER_TABLE_GROUPS.find((item) => item.key === key);
const columns = (key, columnKeys) => columnKeys.map((columnKey) => group(key).columns.find((column) => column.key === columnKey));

// Display segments let one logical group appear beside the statistic it explains.
// All four trend segments still share the `trends` group for one toggle, one
// collapse state, proportional resizing, auto-fit, and persisted widths.
export const PLAYER_TABLE_SEGMENTS = [
  { key: "player", groupKey: "player", name: "Player Details", columns: group("player").columns, controlsGroup: true },
  { key: "draft", groupKey: "draft", name: "Draft Metrics", columns: group("draft").columns, controlsGroup: true },
  { key: "yahoo", groupKey: "yahoo", name: "Yahoo Fantasy", columns: group("yahoo").columns, controlsGroup: true },
  { key: "upcoming", groupKey: "upcoming", name: "Upcoming", columns: group("upcoming").columns, controlsGroup: true },
  { key: "depth", groupKey: "depth", name: "Depth Chart", columns: group("depth").columns, controlsGroup: true },
  { key: "usage-main", groupKey: "usage", name: "Season Usage", columns: columns("usage", ["team", "position", "games_played", "snaps"]), controlsGroup: true },
  { key: "trends-snaps", groupKey: "trends", name: "Player Trends", shortName: "Snap Trend", columns: columns("trends", ["trend_snaps"]), controlsGroup: true },
  { key: "usage-snap-pct", groupKey: "usage", name: "Season Usage", shortName: "Usage", columns: columns("usage", ["snap_pct"]) },
  { key: "passing", groupKey: "passing", name: "Passing", columns: group("passing").columns, controlsGroup: true },
  { key: "rushing-carries", groupKey: "rushing", name: "Rushing", columns: columns("rushing", ["carries"]), controlsGroup: true },
  { key: "trends-touches", groupKey: "trends", name: "Player Trends", shortName: "Touch Trend", columns: columns("trends", ["trend_touches"]) },
  { key: "rushing-rest", groupKey: "rushing", name: "Rushing", shortName: "Rushing", columns: columns("rushing", ["rushing_yards", "rushing_yards_per_game", "rushing_yards_per_attempt", "rushing_tds"]) },
  { key: "receiving-targets", groupKey: "receiving", name: "Receiving", columns: columns("receiving", ["targets"]), controlsGroup: true },
  { key: "trends-targets", groupKey: "trends", name: "Player Trends", shortName: "Target Trend", columns: columns("trends", ["trend_targets"]) },
  { key: "receiving-rest", groupKey: "receiving", name: "Receiving", shortName: "Receiving", columns: columns("receiving", ["receptions", "reception_pct", "receiving_yards", "receiving_yards_per_game", "receiving_yards_per_reception", "receiving_tds"]) },
  { key: "dfs", groupKey: "dfs", name: "DFS", columns: group("dfs").columns, controlsGroup: true },
  { key: "trends-fantasy", groupKey: "trends", name: "Player Trends", shortName: "FPTS Trend", columns: columns("trends", ["trend_fantasy_points"]) },
];

export const PLAYER_TABLE_COLUMNS = PLAYER_TABLE_GROUPS.flatMap((group) =>
  group.columns.map((column) => ({ ...column, group: group.key })),
);

export const DEFAULT_PLAYER_TABLE_WIDTHS = Object.fromEntries(
  PLAYER_TABLE_COLUMNS.map((column) => [column.key, column.defaultWidth]),
);

const COLUMN_BY_KEY = new Map(PLAYER_TABLE_COLUMNS.map((column) => [column.key, column]));
const GROUP_KEYS = new Set(PLAYER_TABLE_GROUPS.map((group) => group.key));

export function clampPlayerTableWidth(key, width) {
  const column = COLUMN_BY_KEY.get(key);
  if (!column) return null;
  return Math.round(Math.max(column.minWidth, Math.min(column.maxWidth, Number(width) || column.defaultWidth)));
}

export function sanitizePlayerTablePreferences(value) {
  const raw = value && typeof value === "object" ? value : {};
  const rawWidths = raw.columnWidths && typeof raw.columnWidths === "object" ? raw.columnWidths : {};
  const columnWidths = { ...DEFAULT_PLAYER_TABLE_WIDTHS };
  for (const key of Object.keys(columnWidths)) {
    columnWidths[key] = clampPlayerTableWidth(key, rawWidths[key] ?? columnWidths[key]);
  }
  return {
    version: 1,
    showDraftMetrics: raw.showDraftMetrics !== false,
    showYahooMetrics: raw.showYahooMetrics === true,
    showPlayerTrends: raw.showPlayerTrends !== false,
    autoFit: raw.autoFit === true,
    collapsedGroups: Array.isArray(raw.collapsedGroups)
      ? [...new Set(raw.collapsedGroups.filter((key) => GROUP_KEYS.has(key)))]
      : [],
    columnWidths,
  };
}

export function readPlayerTablePreferences() {
  try {
    return sanitizePlayerTablePreferences(JSON.parse(window.localStorage.getItem(PLAYER_TABLE_PREFERENCE_KEY) || "{}"));
  } catch {
    return sanitizePlayerTablePreferences({});
  }
}
