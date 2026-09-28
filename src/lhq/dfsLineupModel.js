export const LINEUP_SLOTS = {
  classic: ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "DST"],
  showdown: ["CPT", "FLEX", "FLEX", "FLEX", "FLEX", "FLEX"],
};

export const SALARY_CAP = 50000;

export function normalizeDfsPosition(value) {
  const raw = String(value || "").toUpperCase();
  if (raw === "DEF" || raw === "D/ST") return "DST";
  if (raw === "FB" || raw === "HB") return "RB";
  return raw;
}

export function eligibleForSlot(player, slot, contest = "classic") {
  if (!player) return false;
  if (contest === "showdown") return slot === "CPT" ? player.rosterPosition === "CPT" : player.rosterPosition === "FLEX";
  const position = normalizeDfsPosition(player.position);
  if (slot === "FLEX") return ["RB", "WR", "TE"].includes(position);
  if (slot === "DST") return position === "DST";
  return position === slot;
}

export function snapshotKey(meta = {}) {
  return [
    "bowser:dfs-lineups:v1",
    meta.season ?? "season",
    `w${meta.week ?? "week"}`,
    meta.canonicalSlate || meta.key || "slate",
    meta.captureId || meta.capturedAt || meta.captureIdentity || "capture",
  ].join(":");
}

export function lineupSnapshot(meta = {}) {
  return {
    season: meta.season ?? null,
    week: meta.week ?? null,
    slate: meta.canonicalSlate || meta.key || null,
    captureId: meta.captureId ?? null,
    captureIdentity: meta.captureIdentity ?? null,
    capturedAt: meta.capturedAt ?? null,
    contest: meta.contest || "classic",
  };
}

export function createLineup(meta = {}, name = "Lineup 1") {
  return {
    id: `lineup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    snapshot: lineupSnapshot(meta),
    slots: LINEUP_SLOTS[meta.contest || "classic"].map((slot, index) => ({ id: `${slot}-${index}`, slot, playerId: null })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function sameSnapshot(lineup, meta) {
  const current = lineupSnapshot(meta);
  return lineup?.snapshot?.season === current.season
    && lineup?.snapshot?.week === current.week
    && lineup?.snapshot?.slate === current.slate
    && lineup?.snapshot?.captureIdentity === current.captureIdentity;
}

export function sanitizeLineups(value, meta = {}) {
  if (!Array.isArray(value)) return [];
  const slots = LINEUP_SLOTS[meta.contest || "classic"];
  return value.filter(lineup => lineup && typeof lineup === "object" && sameSnapshot(lineup, meta)).map((lineup, index) => ({
    id: typeof lineup.id === "string" ? lineup.id : `saved-${index}`,
    name: typeof lineup.name === "string" && lineup.name.trim() ? lineup.name.trim().slice(0, 60) : `Lineup ${index + 1}`,
    snapshot: lineupSnapshot(meta),
    slots: slots.map((slot, slotIndex) => {
      const saved = Array.isArray(lineup.slots) ? lineup.slots[slotIndex] : null;
      return { id: `${slot}-${slotIndex}`, slot, playerId: typeof saved?.playerId === "string" ? saved.playerId : null };
    }),
    createdAt: typeof lineup.createdAt === "string" ? lineup.createdAt : new Date().toISOString(),
    updatedAt: typeof lineup.updatedAt === "string" ? lineup.updatedAt : new Date().toISOString(),
  }));
}

export function playerMap(players = []) {
  return new Map(players.map(player => [player.id, player]));
}

export function selectedPlayers(lineup, players = []) {
  const byId = playerMap(players);
  return (lineup?.slots || []).map(slot => ({ ...slot, player: slot.playerId ? byId.get(slot.playerId) || null : null }));
}

export function validateLineup(lineup, players = [], meta = {}) {
  const contest = meta.contest || "classic";
  const slots = selectedPlayers(lineup, players);
  const errors = [];
  const athleteSlots = new Map();
  for (const slot of slots) {
    if (!slot.player) continue;
    if (!eligibleForSlot(slot.player, slot.slot, contest)) errors.push(`${slot.player.name} is not eligible for ${slot.slot}.`);
    if (athleteSlots.has(slot.player.athleteKey)) errors.push(`${slot.player.name} is used in multiple slots.`);
    athleteSlots.set(slot.player.athleteKey, slot.slot);
  }
  const salary = slots.reduce((sum, slot) => sum + (Number.isFinite(slot.player?.salary) ? slot.player.salary : 0), 0);
  if (salary > SALARY_CAP) errors.push(`Lineup is $${(salary - SALARY_CAP).toLocaleString()} over the salary cap.`);
  const filled = slots.filter(slot => slot.player).length;
  return {
    complete: filled === slots.length,
    valid: errors.length === 0,
    errors,
    filled,
    salary,
    remainingSalary: SALARY_CAP - salary,
    projection: slots.reduce((sum, slot) => sum + (Number.isFinite(slot.player?.projection) ? slot.player.projection : 0), 0),
    projectionComplete: filled === slots.length && slots.every(slot => Number.isFinite(slot.player?.projection)),
  };
}

export function assignPlayer(lineup, players, playerId, preferredSlotId = null, meta = {}) {
  const byId = playerMap(players);
  const player = byId.get(playerId);
  if (!lineup || !player) return lineup;
  const contest = meta.contest || "classic";
  const taken = new Set(lineup.slots.filter(slot => slot.playerId !== playerId).map(slot => byId.get(slot.playerId)?.athleteKey).filter(Boolean));
  if (taken.has(player.athleteKey)) return lineup;
  const replace = slot => ({ ...slot, playerId: player.id });
  const clearCurrent = slot => slot.playerId === player.id ? { ...slot, playerId: null } : slot;
  const candidate = preferredSlotId
    ? lineup.slots.find(slot => slot.id === preferredSlotId && eligibleForSlot(player, slot.slot, contest))
    : lineup.slots.find(slot => !slot.playerId && eligibleForSlot(player, slot.slot, contest))
      || lineup.slots.find(slot => eligibleForSlot(player, slot.slot, contest));
  if (!candidate) return lineup;
  return {
    ...lineup,
    slots: lineup.slots.map(slot => slot.id === candidate.id ? replace(slot) : clearCurrent(slot)),
    updatedAt: new Date().toISOString(),
  };
}

export function removeSlot(lineup, slotId) {
  return { ...lineup, slots: lineup.slots.map(slot => slot.id === slotId ? { ...slot, playerId: null } : slot), updatedAt: new Date().toISOString() };
}
