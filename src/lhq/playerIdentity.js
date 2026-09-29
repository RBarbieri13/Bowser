const TEAM_MAP = { JAC: 'JAX', LA: 'LAR', WSH: 'WAS' };

export const normalizeTeam = value => TEAM_MAP[String(value || '').trim().toUpperCase()] || String(value || '').trim().toUpperCase();
export const normalizePosition = value => ['D/ST', 'DST'].includes(String(value || '').trim().toUpperCase()) ? 'DEF' : String(value || '').trim().toUpperCase();
export const cleanPlayerName = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
  .replace(/[^a-z0-9]/g, '');

export function playerName(row = {}) {
  return row.name || row.player_display_name || row.fullName || '';
}

export function publicIdentityKey(row = {}) {
  const name = cleanPlayerName(playerName(row));
  const position = normalizePosition(row.position || row.display_position);
  const team = normalizeTeam(row.team || row.editorial_team_abbr);
  if (!name || !position || !team || position === '—' || team === 'FA') return null;
  return `${name}|${position}|${team}`.slice(0, 120);
}

export function identityLabelFromKey(key) {
  const [name, position, team] = String(key || '').split('|');
  if (!name || !position || !team) return 'Unknown saved player';
  return `Unknown saved player · ${position} · ${team}`;
}

export function leagueKeyFromTeam(teamKey = '') {
  return String(teamKey || '').split('.t.')[0] || '';
}

export function exactPublicIdentityMatch(row, candidates = []) {
  const key = publicIdentityKey(row);
  if (!key) return null;
  const matches = candidates.filter(candidate => publicIdentityKey(candidate) === key);
  return matches.length === 1 ? matches[0] : null;
}
