export const nflTeam = team => ({LAR:'LA',WSH:'WAS',JAC:'JAX'}[team] || team);
export function statWeeks(base, count) {
  return Array.from({length:Math.min(base,count)}, (_,i) => base-Math.min(base,count)+1+i);
}

// Salaries define eligibility, not a player's team or whether they recorded stats.
// Unmatched DraftKings identities remain visible, but never inherit another player’s data.
export function slatePlayerPool(stats, pool, slate, slots = []) {
  const byId = new Map(stats.map(row => [row.player_id,row]));
  const role = slate.endsWith(':cpt') ? 'CPT' : 'FLEX';
  const records = pool.filter(row => !['CPT','FLEX'].includes(row.rosterPosition) || row.rosterPosition === role);
  return records.map(source => {
    const actual = source.playerId ? byId.get(source.playerId) : null;
    return {
      ...actual,
      player_id: source.playerId || source.id,
      player_display_name: actual?.player_display_name || source.name,
      position: source.position,
      team: actual?.team || nflTeam(source.team),
      identityUnavailable: !source.playerId,
      player_trends: actual?.player_trends || slots.map(slot => ({...slot})),
      draft_kings_price: source.salary,
      draft_kings_projection: source.projection,
      dfs_team: nflTeam(source.team),
      dfs_game_id: source.gameId,
      dfs_game: source.game,
      dfs_projection_source: source.projectionSource,
      dfs_projection_url: source.projectionUrl,
    };
  });
}

export function baseMatchup(row, games, baseWeek) {
  const baseTeam = row.player_trends?.find(slot => slot.week === baseWeek)?.team;
  const team = nflTeam(baseTeam || String(row.team || '').split(',').at(-1));
  const game = games.find(g => [nflTeam(g.homeTeam),nflTeam(g.awayTeam)].includes(team));
  return {...row, upcoming_opponent:game ? (nflTeam(game.homeTeam)===team?game.awayTeam:game.homeTeam) : null, upcoming_kickoff_utc:game?.kickoffUtc || null};
}

export function inMatchups(row, gameIds, schedule, slateActive) {
  if (!gameIds.length) return true;
  if (slateActive) return gameIds.includes(row.dfs_game_id);
  const teams = String(row.team || '').split(',').map(nflTeam);
  return schedule.some(game => gameIds.includes(game.gameId) && teams.some(team => [nflTeam(game.homeTeam),nflTeam(game.awayTeam)].includes(team)));
}
