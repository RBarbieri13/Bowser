// Combine observations, not provider populations or reporting windows.
const teamKey = team => ({ LA: 'LAR', JAC: 'JAX', WSH: 'WAS' }[team] || team);
const nameKey = name => String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function identity(row) {
  const team = teamKey(row.team);
  if (row.position === 'DEF' && team && team !== 'FA') return `DEF:${team}`;
  return row.name && row.position && row.position !== '—' && team && team !== 'FA'
    ? `${nameKey(row.name)}:${row.position}:${team}` : null;
}
function index(rows, key) {
  const map = new Map();
  rows.forEach(row => { const value = key(row); if (value) map.set(value, [...(map.get(value) || []), row]); });
  return map;
}
export function combineMarketRows(sleeper = [], espn = []) {
  const espnIds = index(espn, row => row.id);
  const espnNames = index(espn, identity);
  const sleeperNames = index(sleeper, identity);
  const sleeperIds = index(sleeper, row => row.espnId ? `espn:${row.espnId}` : null);
  const used = new Set();
  function combined(s, e, match) {
    return {
      ...(s || e), team: teamKey((s || e).team),
      sleeperId: s?.id || null, espnId: e?.id || null, match,
      aliases: [s?.id, e?.id].filter(Boolean),
      adds: s?.adds ?? null, drops: s?.drops ?? null, net: s?.net ?? null, addShare: s?.addShare ?? null,
      rosterPct: e?.rosterPct ?? null, startPct: e?.startPct ?? null, rosterDelta: e?.rosterDelta ?? null,
      espnTeam: e?.team || null,
    };
  }
  const result = sleeper.map(s => {
    const explicit = s.espnId ? `espn:${s.espnId}` : null;
    let candidates = explicit && sleeperIds.get(explicit)?.length === 1 ? espnIds.get(explicit) : null;
    let match = 'Provider ID';
    // Never use fuzzy names or guesses across teams. Ambiguous records stay separate.
    if (!explicit) {
      const key = identity(s);
      candidates = key && sleeperNames.get(key)?.length === 1 ? espnNames.get(key) : null;
      match = s.position === 'DEF' ? 'Team defense' : 'Name, position & team';
    }
    const e = candidates?.length === 1 && !used.has(candidates[0].id) ? candidates[0] : null;
    if (e) used.add(e.id);
    return combined(s, e, e ? match : 'Sleeper only');
  });
  espn.filter(e => !used.has(e.id)).forEach(e => result.push(combined(null, e, 'ESPN only')));
  return result;
}
export const isWatched = (row, watch) => row.aliases.some(id => watch.includes(id));
export function sortMarketRows(rows, sort, watch = []) {
  return [...rows].sort((a, b) => {
    const x = sort.key === 'watch' ? Number(isWatched(a, watch)) : a[sort.key];
    const y = sort.key === 'watch' ? Number(isWatched(b, watch)) : b[sort.key];
    if (x == null && y == null) return a.name.localeCompare(b.name);
    if (x == null) return 1;
    if (y == null) return -1;
    const comparison = typeof x === 'string' ? x.localeCompare(y) : x - y;
    return (sort.desc ? -comparison : comparison) || a.name.localeCompare(b.name);
  });
}
