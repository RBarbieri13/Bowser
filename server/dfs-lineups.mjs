import { getDfsLineupSlate } from "./dfs-store.mjs";
import { QueryValidationError } from "./stats-store.mjs";

export class DfsLineupQueryError extends QueryValidationError {
  constructor(field, message) {
    super(field, message);
    this.name = "DfsLineupQueryError";
  }
}

const POSITION_MAP = new Map([
  ["DEF", "DST"],
  ["D/ST", "DST"],
  ["DST", "DST"],
  ["FB", "RB"],
  ["HB", "RB"],
]);

const CLASSIC_SLOTS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "DST"];
const SHOWDOWN_SLOTS = ["CPT", "FLEX", "FLEX", "FLEX", "FLEX", "FLEX"];

function normalizePosition(value) {
  const raw = String(value || "").toUpperCase();
  return POSITION_MAP.get(raw) || raw;
}

function athleteKey(row) {
  if (row.playerId) return `player:${row.playerId}`;
  return `dk-athlete:${String(row.name || "").toLowerCase()}|${String(row.team || "").toUpperCase()}|${normalizePosition(row.position)}`;
}

function lineupPlayer(row, slate) {
  const position = normalizePosition(row.position);
  const role = row.rosterPosition || (position === "DST" ? "DST" : position);
  const projection = Number.isFinite(row.projection) ? row.projection : null;
  const projectionMultiplier = Number.isFinite(row.projectionMultiplier)
    ? row.projectionMultiplier
    : role === "CPT"
      ? 1.5
      : 1;
  return {
    id: `${slate.meta.key}:${role}:${row.draftKingsId}`,
    athleteKey: athleteKey(row),
    playerId: row.playerId ?? null,
    draftKingsId: row.draftKingsId ?? null,
    name: row.name ?? "Unknown player",
    position,
    team: row.team ?? null,
    rosterPosition: role,
    eligibleSlots: slate.meta.contestTypeId === 96
      ? [role === "CPT" ? "CPT" : "FLEX"]
      : position === "DST"
        ? ["DST"]
        : position === "RB" || position === "WR" || position === "TE"
          ? [position, "FLEX"]
          : [position],
    salary: Number.isFinite(row.salary) ? row.salary : null,
    projection,
    projectionBase: Number.isFinite(row.projectionBase) ? row.projectionBase : projection,
    projectionMultiplier,
    projectionBasis: String(row.projectionBasis || "")
      .replaceAll("\u00d7", "x")
      || (slate.meta.contestTypeId === 96
        ? `Full-game DraftKings source projection${role === "CPT" ? " x 1.5 Captain multiplier" : "; unscaled FLEX scoring"}. Official ${role} salary.`
        : "DraftKings Classic source projection."),
    projectionSource: row.projectionSource ?? null,
    projectionUrl: row.projectionUrl ?? null,
    projectionSourceDate: row.projectionSourceDate ?? null,
    projectionCapturedAt: row.projectionCapturedAt ?? slate.meta.capturedAt ?? null,
    projectionUnavailableReason: row.projectionUnavailableReason ?? null,
    game: row.game ?? null,
    gameId: row.gameId ?? null,
    status: row.status ?? null,
    matchMethod: row.matchMethod ?? null,
  };
}

export function queryDfsLineup(searchParams = new URLSearchParams()) {
  const requestedSlate = searchParams.get("dfsSlate") || searchParams.get("slate") || "current";
  const slate = getDfsLineupSlate(requestedSlate, searchParams.get("captureId"));
  if (!slate) throw new DfsLineupQueryError("dfsSlate", "Unknown DraftKings slate");
  const contest = slate.meta.contestTypeId === 96 ? "showdown" : "classic";
  const players = slate.records.map(row => lineupPlayer(row, slate));
  const positions = [...new Set(players.map(row => row.position))].sort((a, b) => {
    const order = ["QB", "RB", "WR", "TE", "DST", "K"];
    return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)) || a.localeCompare(b);
  });
  const captureId = slate.meta.captureId ?? `${slate.meta.key}:${slate.meta.capturedAt || "unknown"}`;
  return {
    data: players,
    meta: {
      ...slate.meta,
      requestedSlate,
      canonicalSlate: slate.meta.key,
      captureIdentity: `${slate.meta.season}:W${slate.meta.week}:${slate.meta.key}:${captureId}`,
      captureId,
      contest,
      salaryCap: 50000,
      lineupSlots: contest === "showdown" ? SHOWDOWN_SLOTS : CLASSIC_SLOTS,
      positions,
      records: {
        salaryPlayers: slate.records.length,
        matchedPlayers: slate.records.filter(row => row.playerId).length,
        unmatchedPlayers: slate.records.filter(row => !row.playerId).length,
        dstPlayers: players.filter(row => row.position === "DST").length,
        projectedPlayers: players.filter(row => Number.isFinite(row.projection)).length,
      },
      rules: contest === "showdown"
        ? "DraftKings Showdown Captain Mode: one CPT and five FLEX slots, $50,000 cap, no duplicate athlete. CPT uses official CPT salary and 1.5 projection multiplier."
        : "DraftKings Classic: QB RB RB WR WR WR TE FLEX DST, $50,000 cap. FLEX accepts RB, WR or TE. No duplicate player.",
    },
  };
}
