export const WAIVER_PREFS_KEY = 'bowser:waivers:table:v1';
export const favoriteKey = (season, week) => `bowser:waivers:favorites:v1:${season}:${week}`;
export const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const safeKey = key => typeof key === 'string' && /^[a-zA-Z0-9:_-]{1,100}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key);
export const TREND_OPTIONS = {
  rushing: [{ key: 'carries', label: 'ATT', description: 'rush attempts' }, { key: 'rushing_yards', label: 'YDS', description: 'rushing yards' }, { key: 'rushing_tds', label: 'TD', description: 'rushing touchdowns' }],
  receiving: [{ key: 'targets', label: 'TGT', description: 'targets' }, { key: 'receptions', label: 'REC', description: 'receptions' }, { key: 'receiving_yards', label: 'YDS', description: 'receiving yards' }, { key: 'receiving_tds', label: 'TD', description: 'receiving touchdowns' }],
};
export const DEFAULT_PREFS = { hidden: [], collapsed: [], widths: {}, sorts: [{ key: 'fantasy_points', desc: true }], density: 'compact', autoFit: false, drawer: false, trendMetrics: { rushing: 'carries', receiving: 'targets' } };
export function readJSON(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
export function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
export function validatePreferences(value) {
  const p = value && typeof value === 'object' ? value : {};
  return {
    hidden: Array.isArray(p.hidden) ? p.hidden.filter(safeKey).slice(0, 150) : [],
    collapsed: Array.isArray(p.collapsed) ? p.collapsed.filter(safeKey).slice(0, 15) : [],
    widths: Object.fromEntries(Object.entries(p.widths && typeof p.widths === 'object' ? p.widths : {}).filter(([key, width]) => safeKey(key) && finite(width) !== null && width >= 44 && width <= 420)),
    sorts: Array.isArray(p.sorts) ? p.sorts.filter(s => s && safeKey(s.key) && typeof s.desc === 'boolean').slice(0, 5) : DEFAULT_PREFS.sorts,
    density: ['compact', 'comfortable'].includes(p.density) ? p.density : 'compact',
    autoFit: p.autoFit === true, drawer: p.drawer === true,
    trendMetrics: Object.fromEntries(Object.entries(TREND_OPTIONS).map(([group, options]) => [group, options.some(option => option.key === p.trendMetrics?.[group]) ? p.trendMetrics[group] : DEFAULT_PREFS.trendMetrics[group]])),
  };
}
export function validateFavorites(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(item => item && typeof item.id === 'string' && item.id.length <= 180 && !seen.has(item.id) && seen.add(item.id)).slice(0, 300).map(item => ({
    id: item.id, profileId: typeof item.profileId === 'string' && item.profileId.length <= 180 ? item.profileId : null, name: String(item.name || 'Player').slice(0, 100), position: String(item.position || '').slice(0, 8), team: String(item.team || '').slice(0, 8),
    bid: finite(item.bid) !== null && item.bid >= 0 && item.bid <= 100000 ? item.bid : null,
    notes: typeof item.notes === 'string' ? item.notes.slice(0, 1000) : '',
  }));
}
export const playerKey = row => String(row.playerId || row.id);
const stat = (key, label, group, extra = {}) => ({ key, label, group, width: 64, kind: 'stat', ...extra });
export function waiverColumns(sources = [], trendMetrics = DEFAULT_PREFS.trendMetrics) {
  const rushingTrend = TREND_OPTIONS.rushing.find(option => option.key === trendMetrics.rushing) || TREND_OPTIONS.rushing[0];
  const receivingTrend = TREND_OPTIONS.receiving.find(option => option.key === trendMetrics.receiving) || TREND_OPTIONS.receiving[0];
  return [
    { key: 'favorite', label: '★', group: 'identity', width: 44, kind: 'favorite', required: true },
    { key: 'name', label: 'Player', group: 'identity', width: 190, kind: 'identity', required: true },
    { key: 'position', label: 'Pos', group: 'identity', width: 48, kind: 'identity', required: true },
    { key: 'team', label: 'Team', group: 'identity', width: 54, kind: 'identity', required: true },
    ...sources.filter(s => s.rankCount > 0).map(source => ({ key: `rank:${source.id}`, label: source.label, group: 'rank', width: Math.max(86, Math.min(130, source.label.length * 6 + 20)), kind: 'rank', source })),
    ...sources.filter(s => s.faabCount > 0).map(source => ({ key: `faab:${source.id}`, label: source.label, group: 'faab', width: Math.max(100, Math.min(140, source.label.length * 6 + 20)), kind: 'faab', source })),
    ...[['adds', 'Adds'], ['drops', 'Drops'], ['rosterPct', 'Roster %'], ['startPct', 'Start %']].map(([key, label]) => ({ key, label, group: 'market', width: 80, kind: 'activity', percent: key.endsWith('Pct') })),
    stat('games_played', 'GP', 'usage'), stat('snaps', 'Snaps', 'usage'), stat('snap_pct', 'Snap %', 'usage', { percent: true, width: 76 }),
    { key: 'snap_trend', label: 'Snaps / game', group: 'usage', width: 126, kind: 'trend', metric: 'snaps' },
    stat('passing_attempts', 'ATT', 'passing'), stat('completions', 'CMP', 'passing'), stat('passing_yards', 'YDS', 'passing'), stat('passing_tds', 'TD', 'passing'),
    stat('carries', 'ATT', 'rushing'), stat('rushing_yards', 'YDS', 'rushing'), stat('rushing_tds', 'TD', 'rushing'),
    { key: 'rush_trend', label: `${rushingTrend.label} / game`, group: 'rushing', width: 126, kind: 'trend', metric: rushingTrend.key },
    stat('targets', 'TGT', 'receiving'), stat('receptions', 'REC', 'receiving'), stat('receiving_yards', 'YDS', 'receiving'), stat('receiving_tds', 'TD', 'receiving'),
    { key: 'receiving_trend', label: `${receivingTrend.label} / game`, group: 'receiving', width: 126, kind: 'trend', metric: receivingTrend.key },
    stat('fantasy_points', 'FPTS', 'fantasy', { width: 80, decimal: true }),
  ];
}
export const GROUPS = [ ['identity', 'Player'], ['rank', 'Positional waiver ranks'], ['faab', 'Source FAAB bids'], ['market', 'Market activity'], ['usage', 'Usage'], ['passing', 'Passing'], ['rushing', 'Rushing'], ['receiving', 'Receiving'], ['fantasy', 'Fantasy'] ];

// A conversion needs a stated basis and a matching budget. Unspecified bids stay native.
export function faabValue(bid, display = 'native', budgets = {}) {
  if (!bid || finite(bid.low) === null || !['percent', 'dollars'].includes(bid.unit)) return null;
  const value = { ...bid, low: bid.low, high: finite(bid.high), converted: false };
  if (display === 'native' || display === bid.unit) return value;
  if (!['annual', 'remaining'].includes(bid.budgetBasis)) return value;
  const reference = finite(bid.referenceBudget);
  if (display === 'percent' && bid.unit === 'dollars' && reference > 0) {
    return { ...value, low: value.low / reference * 100, high: value.high === null ? null : value.high / reference * 100, unit: 'percent', converted: true };
  }
  const budget = finite(budgets[bid.budgetBasis]);
  if (display === 'dollars' && budget > 0) {
    const base = bid.unit === 'percent' ? 100 : reference;
    if (base > 0) return { ...value, low: value.low / base * budget, high: value.high === null ? null : value.high / base * budget, unit: 'dollars', converted: true };
  }
  return value;
}
const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
export function formatFAAB(bid) {
  if (!bid) return '';
  const prefix = bid.unit === 'dollars' ? '$' : '';
  const suffix = bid.unit === 'percent' ? '%' : '';
  if (bid.operator === 'at-most') return `≤${prefix}${number(bid.high ?? bid.low)}${suffix}`;
  return `${bid.operator === 'at-least' ? '≥' : bid.operator === 'at-most' ? '≤' : ''}${prefix}${number(bid.low)}${bid.high === null || bid.high === bid.low ? '' : `–${prefix}${number(bid.high)}`}${suffix}`;
}
export function columnValue(row, column, favorites = []) {
  if (column.kind === 'favorite') return favorites.includes(playerKey(row)) ? 1 : 0;
  if (column.kind === 'identity') return row[column.key] || null;
  if (column.kind === 'rank') return finite(row.rankings?.[column.source.id]?.rank);
  if (column.kind === 'faab') return finite(row.faab?.[column.source.id]?.low);
  if (column.kind === 'activity') return finite(row.activity?.[column.key]);
  if (column.kind === 'trend') return finite(row.stats?.[column.metric]);
  return finite(row.stats?.[column.key]);
}
export function sortWaiverRows(rows, sorts, columns, favorites = []) {
  const lookup = new Map(columns.map(c => [c.key, c]));
  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const column = lookup.get(sort.key); if (!column) continue;
      const av = columnValue(a, column, favorites), bv = columnValue(b, column, favorites);
      if (av === null && bv === null) continue;
      if (av === null) return 1;
      if (bv === null) return -1;
      const order = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      if (order) return sort.desc ? -order : order;
    }
    return String(a.name).localeCompare(String(b.name));
  });
}
export function filterWaiverRows(rows, { search = '', position = 'All', team = 'All', favoriteOnly = false, favorites = [], ranges = [] } = {}) {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(row => terms.every(term => `${row.name} ${row.team} ${row.position}`.toLowerCase().includes(term)) &&
    (position === 'All' || row.position === position || position === 'FLEX' && ['RB', 'WR', 'TE'].includes(row.position)) && (team === 'All' || row.team === team) &&
    (!favoriteOnly || favorites.includes(playerKey(row))) && ranges.every(range => {
      if (!range.source || range.min === '' && range.max === '') return true;
      const value = range.kind === 'rank' ? finite(row.rankings?.[range.source]?.rank) : finite(row.faab?.[range.source]?.low);
      if (value === null) return false;
      if (range.kind === 'faab' && range.unit && row.faab?.[range.source]?.unit !== range.unit) return false;
      return (range.min === '' || value >= Number(range.min)) && (range.max === '' || value <= Number(range.max));
    }));
}
