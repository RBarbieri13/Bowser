export const POSITION_ORDER = ["QB", "RB", "WR", "TE"];

export const IDENTITY_COLUMNS = [
  { key: "position", label: "Pos", defaultWidth: 64, min: 48, max: 104 },
  { key: "marker", label: "Mark", defaultWidth: 44, min: 38, max: 70 },
  { key: "player", label: "Player", defaultWidth: 190, min: 132, max: 360 },
  { key: "dk_salary", label: "DK Salary", defaultWidth: 82, min: 66, max: 150 },
  { key: "dk_projection", label: "DK Proj.", defaultWidth: 76, min: 66, max: 150 },
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
};

export const QB_COLUMN_KEYS = [
  "snaps", "snap_pct", "passing_line", "passing_yards", "passing_tds", "interceptions",
  "carries", "rushing_yards", "rushing_tds", "fantasy_points",
];

export const SKILL_COLUMN_KEYS = [
  "snaps", "snap_pct", "targets", "receptions", "receiving_yards", "receiving_tds",
  "carries", "rushing_yards", "rushing_tds", "fantasy_points",
];

export const DEFAULT_VISIBLE_STATS = [...new Set([...QB_COLUMN_KEYS, ...SKILL_COLUMN_KEYS])];
export const ALL_COLUMN_DEFINITIONS = [
  ...IDENTITY_COLUMNS,
  ...Object.values(WEEK_COLUMN_REGISTRY),
];

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

export function columnsForPosition(position, visibleStats = DEFAULT_VISIBLE_STATS) {
  const keys = position === "QB" ? QB_COLUMN_KEYS : SKILL_COLUMN_KEYS;
  const selected = new Set(visibleStats);
  return keys.filter((key) => selected.has(key)).map((key) => WEEK_COLUMN_REGISTRY[key]);
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
  const weekWidth = Math.max(320, Math.min(720, Number(source.weekWidth) || 554));
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

