import { TREND_METRIC_KEYS } from './trendMetrics.js';

export const POSITION_ORDER = ["QB", "RB", "WR", "TE"];

export const IDENTITY_COLUMNS = [
  { key: "position", label: "Pos", defaultWidth: 64, min: 40, max: 104 },
  { key: "marker", label: "Mark", defaultWidth: 44, min: 34, max: 70 },
  { key: "player", label: "Player", defaultWidth: 190, min: 112, max: 360 },
];

export const WEEK_COLUMN_REGISTRY = {
  snaps: { key: "snaps", label: "SNP", name: "Snaps", group: "Misc.", defaultWidth: 52, min: 42, max: 112, appliesTo: "all" },
  snap_pct: { key: "snap_pct", label: "SNP%", name: "Snap percentage", group: "Misc.", defaultWidth: 52, min: 44, max: 112, appliesTo: "all" },
  passing_line: { key: "passing_line", label: "CMP-ATT", name: "Completions-attempts", group: "Passing", defaultWidth: 76, min: 62, max: 160, appliesTo: "QB" },
  passing_yards: { key: "passing_yards", label: "YDS", name: "Passing yards", group: "Passing", defaultWidth: 52, min: 44, max: 120, appliesTo: "QB" },
  passing_tds: { key: "passing_tds", label: "TD", name: "Passing touchdowns", group: "Passing", defaultWidth: 52, min: 40, max: 104, appliesTo: "QB" },
  interceptions: { key: "interceptions", label: "INT", name: "Interceptions", group: "Passing", defaultWidth: 52, min: 40, max: 104, appliesTo: "QB" },
  targets: { key: "targets", label: "TGT", name: "Targets", group: "Receiving", defaultWidth: 76, min: 44, max: 132, appliesTo: "skill" },
  receptions: { key: "receptions", label: "REC", name: "Receptions", group: "Receiving", defaultWidth: 52, min: 42, max: 112, appliesTo: "skill" },
  receiving_yards: { key: "receiving_yards", label: "YDS", name: "Receiving yards", group: "Receiving", defaultWidth: 52, min: 44, max: 120, appliesTo: "skill" },
  receiving_tds: { key: "receiving_tds", label: "TD", name: "Receiving touchdowns", group: "Receiving", defaultWidth: 52, min: 40, max: 104, appliesTo: "skill" },
  carries: { key: "carries", label: "ATT", name: "Rushing attempts", group: "Rushing", defaultWidth: 52, min: 42, max: 112, appliesTo: "all" },
  rushing_yards: { key: "rushing_yards", label: "YDS", name: "Rushing yards", group: "Rushing", defaultWidth: 52, min: 44, max: 120, appliesTo: "all" },
  rushing_tds: { key: "rushing_tds", label: "TD", name: "Rushing touchdowns", group: "Rushing", defaultWidth: 52, min: 40, max: 104, appliesTo: "all" },
  fantasy_points: { key: "fantasy_points", label: "FPTS", name: "Fantasy points", group: "Fantasy", defaultWidth: 62, min: 50, max: 132, appliesTo: "all" },
  position_finish: { key: "position_finish", label: "POS FIN", name: "Weekly NFL position finish", group: "Fantasy", defaultWidth: 72, min: 58, max: 140, appliesTo: "all" },
  draft_kings_price: { key: "draft_kings_price", label: "DK $", name: "DraftKings salary", group: "DFS", defaultWidth: 76, min: 62, max: 150, appliesTo: "all" },
  draft_kings_projection: { key: "draft_kings_projection", label: "DK PROJ", name: "DraftKings projection", group: "DFS", defaultWidth: 78, min: 62, max: 150, appliesTo: "all" },
};

export const QB_COLUMN_KEYS = [
  "snaps", "snap_pct", "passing_line", "passing_yards", "passing_tds", "interceptions",
  "carries", "rushing_yards", "rushing_tds", "fantasy_points", "position_finish", "draft_kings_price", "draft_kings_projection",
];

export const SKILL_COLUMN_KEYS = [
  "snaps", "snap_pct", "targets", "receptions", "receiving_yards", "receiving_tds",
  "carries", "rushing_yards", "rushing_tds", "fantasy_points", "position_finish", "draft_kings_price", "draft_kings_projection",
];

export const DEFAULT_VISIBLE_STATS = [...new Set([...QB_COLUMN_KEYS, ...SKILL_COLUMN_KEYS])];
export const ALL_COLUMN_DEFINITIONS = [
  ...IDENTITY_COLUMNS,
  ...Object.values(WEEK_COLUMN_REGISTRY),
  { key: "trend", label: "Trend", name: "Trend chart", group: "Trends", defaultWidth: 250, min: 160, max: 600 },
];

export const TEAM_TABLE_COLUMNS = ALL_COLUMN_DEFINITIONS.map(column => ({
  key: column.key, label: column.name || column.label, group: column.group || "Player details",
  width: column.defaultWidth, minWidth: column.min, maxWidth: column.max,
  required: ["position", "player", "marker", "trend"].includes(column.key),
  orderable: !["position", "player", "marker", "trend"].includes(column.key),
  type: column.key === "player" || column.key === "position" || column.key === "marker" || column.key === "trend" || column.key === "passing_line" ? "text" : "number",
}));

export const TEAM_TREND_WINDOWS = [5, 8, 10, 18];

export function sanitizeTrendBlocks(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value.slice(0, 12).flatMap((block, index) => {
    if (!block || !Number.isInteger(block.afterWeek) || block.afterWeek < 1 || block.afterWeek > 22) return [];
    const id = typeof block.id === "string" && /^[a-zA-Z0-9_-]{1,50}$/.test(block.id) ? block.id : `trend-${index}`;
    if (ids.has(id)) return [];
    ids.add(id);
    return [{ id, afterWeek: block.afterWeek, metric: TREND_METRIC_KEYS.includes(block.metric) ? block.metric : "snaps" }];
  });
}

// A filtered-out anchor resolves to the visible week immediately to its left.
// If no earlier week is visible, the first visible week becomes the new anchor.
export function resolveTrendBlocks(blocks, weeks) {
  const ordered = weeks.map(item => Number(typeof item === "object" ? item.week : item));
  return blocks.flatMap(block => {
    const anchor = ordered.filter(week => week <= block.afterWeek).at(-1) ?? ordered[0];
    return anchor === undefined ? [] : [{ ...block, anchor }];
  });
}

export const DEFAULT_COLUMN_WIDTHS = Object.fromEntries(
  ALL_COLUMN_DEFINITIONS.map((column) => [column.key, column.defaultWidth]),
);

export const LEAGUE_OPTIONS = ["LOEG", "Loongi League", "College Football Fantasy"];
export const MARKER_TYPES = ["favorite", "like", "dislike", "maybe", "watch", "research"];
export const TEAM_BOX_PREFERENCE_KEY = "bowser:team-box-preferences:v2";

export function clampColumnWidth(key, value) {
  const definition = ALL_COLUMN_DEFINITIONS.find((column) => column.key === key);
  if (!definition) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return definition.defaultWidth;
  return Math.round(Math.max(definition.min, Math.min(definition.max, numeric)));
}

export function columnsForPosition(position, visibleStats = DEFAULT_VISIBLE_STATS, order = []) {
  const keys = position === "QB" ? QB_COLUMN_KEYS : SKILL_COLUMN_KEYS;
  const selected = new Set(visibleStats);
  const ordered = [...new Set([...order, ...keys])];
  return ordered.filter((key) => keys.includes(key) && selected.has(key)).map((key) => WEEK_COLUMN_REGISTRY[key]);
}

export function columnGroups(columns) {
  const groups = [];
  for (const column of columns) {
    const last = groups.at(-1);
    if (last?.name === column.group) last.columns.push(column);
    else groups.push({ name: column.group, columns: [column] });
  }
  return groups;
}

export function sanitizeTeamBoxPreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  const columnWidths = { ...DEFAULT_COLUMN_WIDTHS };
  if (source.columnWidths && typeof source.columnWidths === "object") {
    for (const key of Object.keys(columnWidths)) {
      if (source.columnWidths[key] !== undefined) columnWidths[key] = clampColumnWidth(key, source.columnWidths[key]);
    }
  }
  const visibleStats = Array.isArray(source.visibleStats)
    ? [...new Set(source.visibleStats)].filter((key) => WEEK_COLUMN_REGISTRY[key])
    : DEFAULT_VISIBLE_STATS;
  const markers = {};
  if (source.markers && typeof source.markers === "object") {
    for (const [playerId, marker] of Object.entries(source.markers)) {
      if (MARKER_TYPES.includes(marker)) markers[String(playerId).slice(0, 80)] = marker;
    }
  }
  const selectedLeagues = Array.isArray(source.selectedLeagues)
    ? [...new Set(source.selectedLeagues)].filter((league) => LEAGUE_OPTIONS.includes(league))
    : LEAGUE_OPTIONS;
  const weekWidth = Math.max(220, Math.min(720, Number(source.weekWidth) || 554));
  return {
    version: 2,
    columnWidths,
    visibleStats: visibleStats.length ? visibleStats : DEFAULT_VISIBLE_STATS,
    markers,
    selectedLeagues: selectedLeagues.length ? selectedLeagues : LEAGUE_OPTIONS,
    weekWidth,
  };
}

export function readTeamBoxPreferences(storage = window.localStorage) {
  try {
    return sanitizeTeamBoxPreferences(JSON.parse(storage.getItem(TEAM_BOX_PREFERENCE_KEY) || "{}"));
  } catch {
    return sanitizeTeamBoxPreferences({});
  }
}
