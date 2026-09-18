import { openDatabase } from "./stats-store.mjs";

const SUFFIXES = /\b(jr|sr|ii|iii|iv)\b/g;
let cachedIdentities;

export function normalizePlayerName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'’`-]/g, " ")
    .replace(SUFFIXES, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function identityIndex() {
  if (cachedIdentities) return cachedIdentities;
  const database = openDatabase();
  const rows = database.prepare(`
    SELECT player_id, display_name, position, latest_team
    FROM players
    WHERE position IN ('QB', 'RB', 'WR', 'TE')
  `).all();
  cachedIdentities = new Map();
  for (const row of rows) {
    const key = normalizePlayerName(row.display_name);
    if (!key || cachedIdentities.has(key)) continue;
    cachedIdentities.set(key, {
      playerId: row.player_id,
      name: row.display_name,
      position: row.position,
      team: row.latest_team || "UNK",
    });
  }
  return cachedIdentities;
}

export function resolvePlayerIdentity(name) {
  return identityIndex().get(normalizePlayerName(name)) || null;
}

export function resetPlayerIdentityCache() {
  cachedIdentities = undefined;
}
