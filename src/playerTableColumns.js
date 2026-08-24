export const PLAYER_TABLE_PREFERENCE_KEY = "bowser:player-table-preferences:v1";
export const PLAYER_TABLE_SAVED_VIEWS_KEY = "bowser:player-table-saved-views:v1";

export const PLAYER_TABLE_GROUPS = [
  {
    name: "Player Details", shortName: "Details", key: "player", tone: "blue",
    columns: [
      { key: "select", label: "", studioLabel: "Player selection", defaultWidth: 44, minWidth: 38, maxWidth: 76, align: "center", sortable: false },
      { key: "rank", label: "Rank", defaultWidth: 48, minWidth: 42, maxWidth: 96, align: "center" },
      { key: "name", field: "player_display_name", label: "Name", defaultWidth: 208, minWidth: 140, maxWidth: 360, align: "left" },
      { key: "team", label: "Team", defaultWidth: 58, minWidth: 50, maxWidth: 110, align: "center" },
      { key: "position", label: "POS", studioLabel: "Position", defaultWidth: 52, minWidth: 44, maxWidth: 100, align: "center" },
      { key: "upcoming_matchup", label: "Next", studioLabel: "Upcoming game", defaultWidth: 132, minWidth: 104, maxWidth: 240, align: "left", sortable: false },
    ],
  },
  {
    name: "Usage", key: "usage", tone: "blue",
    columns: [
      { key: "games_played", label: "GP", studioLabel: "Games played", defaultWidth: 48, minWidth: 42, maxWidth: 100, align: "center" },
      { key: "snaps", label: "Snaps", defaultWidth: 64, minWidth: 50, maxWidth: 130 },
      { key: "trend_snaps", label: "Snap trend", metric: "snaps", defaultWidth: 148, minWidth: 116, maxWidth: 240, sortable: false },
      { key: "snap_pct", label: "Snap %", defaultWidth: 64, minWidth: 52, maxWidth: 130, format: "wholePercent" },
    ],
  },
  {
    name: "Passing", key: "passing", tone: "blue",
    columns: [
      { key: "passing_attempts", label: "ATT", studioLabel: "Pass attempts", defaultWidth: 58, minWidth: 46, maxWidth: 130 },
      { key: "completions", label: "CMP", studioLabel: "Completions", defaultWidth: 60, minWidth: 46, maxWidth: 130 },
      { key: "passing_yards", label: "YDS", studioLabel: "Passing yards", defaultWidth: 68, minWidth: 50, maxWidth: 145 },
      { key: "passing_tds", label: "TD", studioLabel: "Passing touchdowns", defaultWidth: 48, minWidth: 42, maxWidth: 105 },
      { key: "trend_pass_attempts", label: "Pass trend", metric: "pass_attempts", defaultWidth: 148, minWidth: 116, maxWidth: 240, sortable: false },
    ],
  },
  {
    name: "Rushing", key: "rushing", tone: "orange",
    columns: [
      { key: "carries", label: "ATT", studioLabel: "Rush attempts", defaultWidth: 58, minWidth: 46, maxWidth: 130 },
      { key: "rushing_yards", label: "YDS", studioLabel: "Rushing yards", defaultWidth: 66, minWidth: 50, maxWidth: 145 },
      { key: "rushing_tds", label: "TD", studioLabel: "Rushing touchdowns", defaultWidth: 48, minWidth: 42, maxWidth: 105 },
      { key: "trend_rush_attempts", label: "Rush trend", metric: "rush_attempts", defaultWidth: 148, minWidth: 116, maxWidth: 240, sortable: false },
    ],
  },
  {
    name: "Receiving", key: "receiving", tone: "purple",
    columns: [
      { key: "targets", label: "TGT", studioLabel: "Targets", defaultWidth: 56, minWidth: 46, maxWidth: 125 },
      { key: "receptions", label: "REC", studioLabel: "Receptions", defaultWidth: 58, minWidth: 46, maxWidth: 130 },
      { key: "receiving_yards", label: "YDS", studioLabel: "Receiving yards", defaultWidth: 66, minWidth: 50, maxWidth: 145 },
      { key: "receiving_tds", label: "TD", studioLabel: "Receiving touchdowns", defaultWidth: 48, minWidth: 42, maxWidth: 105 },
      { key: "trend_targets", label: "Target trend", metric: "targets", defaultWidth: 148, minWidth: 116, maxWidth: 240, sortable: false },
    ],
  },
  {
    name: "Fantasy", key: "fantasy", tone: "green",
    columns: [
      { key: "fantasy_points", label: "FPTS", studioLabel: "Fantasy points", defaultWidth: 78, minWidth: 62, maxWidth: 155, format: "decimal" },
      { key: "trend_fantasy_points", label: "FPTS trend", metric: "fantasy_points", defaultWidth: 148, minWidth: 116, maxWidth: 240, sortable: false },
    ],
  },
  {
    name: "Draft Metrics", shortName: "Draft", key: "draft", tone: "gold", optional: true,
    columns: [
      { key: "adp", label: "ADP", defaultWidth: 64, minWidth: 50, maxWidth: 130, format: "decimal" },
      { key: "draft_position_rank", field: "draft_position_rank_label", label: "POS RK", defaultWidth: 68, minWidth: 54, maxWidth: 140 },
    ],
  },
  {
    name: "Yahoo Fantasy", shortName: "Yahoo", key: "yahoo", tone: "purple", optional: true,
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
    name: "DFS", key: "dfs", tone: "gold", optional: true,
    columns: [
      { key: "draft_kings_price", label: "$", studioLabel: "Salary", defaultWidth: 68, minWidth: 48, maxWidth: 150, align: "center", sortable: false },
      { key: "draft_kings_projection", label: "FPTS", studioLabel: "Projection", defaultWidth: 68, minWidth: 52, maxWidth: 150, align: "center", sortable: false },
    ],
  },
  {
    name: "Advanced Stats", shortName: "Advanced", key: "advanced", tone: "neutral", optional: true,
    columns: [
      { key: "completion_pct", label: "CMP %", defaultWidth: 75, minWidth: 56, maxWidth: 150, format: "wholePercent" },
      { key: "passing_yards_per_game", label: "Pass YDS/G", defaultWidth: 82, minWidth: 64, maxWidth: 160, format: "decimal" },
      { key: "passing_yards_per_attempt", label: "Pass Y/A", defaultWidth: 70, minWidth: 54, maxWidth: 140, format: "decimal" },
      { key: "interceptions", label: "INT", defaultWidth: 54, minWidth: 44, maxWidth: 120 },
      { key: "rushing_yards_per_game", label: "Rush YDS/G", defaultWidth: 84, minWidth: 66, maxWidth: 165, format: "decimal" },
      { key: "rushing_yards_per_attempt", label: "Rush Y/A", defaultWidth: 72, minWidth: 56, maxWidth: 145, format: "decimal" },
      { key: "reception_pct", label: "REC %", defaultWidth: 72, minWidth: 56, maxWidth: 145, format: "wholePercent" },
      { key: "receiving_yards_per_game", label: "Rec YDS/G", defaultWidth: 82, minWidth: 64, maxWidth: 160, format: "decimal" },
      { key: "receiving_yards_per_reception", label: "Y/R", defaultWidth: 54, minWidth: 46, maxWidth: 130, format: "decimal" },
    ],
  },
];

export const DEFAULT_PLAYER_GROUP_ORDER = ["player", "usage", "passing", "rushing", "receiving", "draft", "yahoo", "dfs", "advanced", "fantasy"];

export const PLAYER_TABLE_SEGMENTS = PLAYER_TABLE_GROUPS.map((group) => ({
  key: group.key, groupKey: group.key, name: group.name, shortName: group.shortName, columns: group.columns, controlsGroup: true,
}));

export const PLAYER_TABLE_COLUMNS = PLAYER_TABLE_GROUPS.flatMap((group) => group.columns.map((column) => ({ ...column, group: group.key })));
export const DEFAULT_PLAYER_TABLE_WIDTHS = Object.fromEntries(PLAYER_TABLE_COLUMNS.map((column) => [column.key, column.defaultWidth]));
const COLUMN_BY_KEY = new Map(PLAYER_TABLE_COLUMNS.map((column) => [column.key, column]));
const GROUP_KEYS = new Set(PLAYER_TABLE_GROUPS.map((group) => group.key));
const COLUMN_KEYS = new Set(PLAYER_TABLE_COLUMNS.map((column) => column.key));
export const DEFAULT_HIDDEN_PLAYER_COLUMNS = PLAYER_TABLE_GROUPS.filter((group) => group.optional).flatMap((group) => group.columns.map((column) => column.key));

export function clampPlayerTableWidth(key, width) {
  const column = COLUMN_BY_KEY.get(key);
  if (!column) return null;
  return Math.round(Math.max(column.minWidth, Math.min(column.maxWidth, Number(width) || column.defaultWidth)));
}

export function sanitizePlayerTablePreferences(value) {
  const raw = value && typeof value === "object" ? value : {};
  const rawWidths = raw.columnWidths && typeof raw.columnWidths === "object" ? raw.columnWidths : {};
  const columnWidths = { ...DEFAULT_PLAYER_TABLE_WIDTHS };
  for (const key of Object.keys(columnWidths)) columnWidths[key] = clampPlayerTableWidth(key, rawWidths[key] ?? columnWidths[key]);
  const migratingToColumnStudio = Number(raw.version || 0) < 3;
  const hiddenColumns = new Set(migratingToColumnStudio
    ? DEFAULT_HIDDEN_PLAYER_COLUMNS
    : Array.isArray(raw.hiddenColumns) ? raw.hiddenColumns.filter((key) => COLUMN_KEYS.has(key) && key !== "name") : DEFAULT_HIDDEN_PLAYER_COLUMNS);
  const suppliedOrder = Array.isArray(raw.groupOrder) ? raw.groupOrder.filter((key) => GROUP_KEYS.has(key)) : [];
  return {
    version: 3,
    showDraftMetrics: migratingToColumnStudio ? false : raw.showDraftMetrics !== false,
    showYahooMetrics: migratingToColumnStudio ? false : raw.showYahooMetrics === true,
    showPlayerTrends: raw.showPlayerTrends !== false,
    autoFit: raw.autoFit === true,
    smartCompact: raw.smartCompact !== false,
    trendGameCount: [5, 8, 10].includes(Number(raw.trendGameCount)) ? Number(raw.trendGameCount) : 10,
    hiddenColumns: [...hiddenColumns],
    collapsedGroups: migratingToColumnStudio ? [] : Array.isArray(raw.collapsedGroups) ? [...new Set(raw.collapsedGroups.filter((key) => GROUP_KEYS.has(key) && key !== "player"))] : [],
    groupOrder: [...new Set([...suppliedOrder, ...DEFAULT_PLAYER_GROUP_ORDER])],
    activeViewId: typeof raw.activeViewId === "string" ? raw.activeViewId : "default",
    columnWidths,
  };
}

export function readPlayerTablePreferences() {
  try { return sanitizePlayerTablePreferences(JSON.parse(window.localStorage.getItem(PLAYER_TABLE_PREFERENCE_KEY) || "{}")); }
  catch { return sanitizePlayerTablePreferences({}); }
}
