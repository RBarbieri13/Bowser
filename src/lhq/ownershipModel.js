import { publicIdentityKey, leagueKeyFromTeam } from './playerIdentity.js';

export const OWNERSHIP_STATES = ['mine', 'other', 'free'];
export const OWNERSHIP_SYMBOLS = { mine: '★', other: '●', free: '○', unknown: '?', mixed: '≋' };
export const OWNERSHIP_LABELS = { mine: 'Mine', other: 'Owned by others', free: 'Unowned', unknown: 'Unknown', mixed: 'Mixed ownership' };
export const LEFA = ['L', 'E', 'F', 'A'];
export const LEAGUE_LABELS = { L: 'Loongi League', E: 'LOEG', F: 'Fart League', A: 'All leagues' };
export const OWNERSHIP_MAX_AGE = 15 * 60 * 1000;
// Server/client clocks can differ slightly; keep the source observation time intact.
export const OWNERSHIP_CLOCK_SKEW = 5000;
export const validOwnershipClock = (time, now = Date.now()) => Number.isFinite(time) && time <= now + OWNERSHIP_CLOCK_SKEW;
export const defaultOwnershipFilters = () => ({ L: [...OWNERSHIP_STATES], E: [...OWNERSHIP_STATES], F: [...OWNERSHIP_STATES], A: [...OWNERSHIP_STATES], mode: 'every' });
export const ownershipFiltersActive = f => LEFA.some(k => f[k].length !== 3);
const normalName = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function ownershipLeagues(account) {
  const teams = account?.teams || [];
  return (account?.leagues || []).filter((league, i, all) => all.findIndex(l => l.key === league.key) === i).map(league => ({
    ...league, teamKeys: teams.filter(t => leagueKeyFromTeam(t.key) === league.key).map(t => t.key),
  })).filter(league => league.teamKeys.length);
}
export function defaultLeagueMapping(leagues) {
  return Object.fromEntries(['L', 'E', 'F'].map(letter => {
    const names = { L: ['loongi', 'loongileague', 'theloongileague'], E: ['loeg', 'leagueofextraordinarygentlemen'], F: ['fart', 'fartleague'] }[letter];
    const matches = leagues.filter(l => names.includes(normalName(l.name)));
    return [letter, matches.length === 1 ? matches[0].key : ''];
  }));
}
export function ownershipIndex(players) {
  const result = new Map();
  for (const player of players || []) {
    const key = publicIdentityKey(player);
    if (key) result.set(key, result.has(key) ? null : player);
  }
  return result;
}
export function playerOwnership(row, index, now = Date.now()) {
  const match = index?.get(publicIdentityKey(row));
  const time = Date.parse(match?.checkedAt || '');
  if (!match || !validOwnershipClock(time, now) || now - time > OWNERSHIP_MAX_AGE) return 'unknown';
  if (match.owned === false && ['freeagents', 'waivers'].includes(match.ownershipType)) return 'free';
  if (match.owned === true && match.ownershipType === 'team') return match.isMine === true ? 'mine' : match.isMine === false ? 'other' : 'unknown';
  return 'unknown';
}
export function ownershipSummary(states) {
  if (!states.length || states.includes('unknown')) return 'unknown';
  return states.every(s => s === states[0]) ? states[0] : 'mixed';
}
export function matchesOwnership(states, allStates, filters) {
  const match = (state, values) => values.length === 3 || values.includes(state);
  if (!['L', 'E', 'F'].every(key => match(states[key], filters[key]))) return false;
  if (filters.A.length === 3) return true;
  if (!allStates.length) return false;
  return filters.mode === 'any' ? allStates.some(s => match(s, filters.A)) : allStates.every(s => match(s, filters.A));
}
// Descending = mine, others, unowned; ascending reverses. Unknown remains null-last.
export function ownershipSortValue(states) {
  if (!states.length || states.includes('unknown')) return null;
  return states.filter(s => s === 'mine').length * (states.length + 1) + states.filter(s => s === 'other').length;
}
