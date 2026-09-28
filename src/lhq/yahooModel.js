// Derivations of normalized Yahoo responses only. Never persist these account views.
const RESERVE_SLOTS = new Set(['BN', 'IR', 'IR+', 'IL', 'IL+', 'NA']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const list = value => Array.isArray(value) ? value : [];
export const isReserveSlot = slot => RESERVE_SLOTS.has(slot);
export const isStartingPlayer = player => Boolean(player?.key && player?.slot && !isReserveSlot(player.slot));

export function teamStanding(dashboard) {
  return list(dashboard?.standings).find(team => team.key === dashboard?.teamKey) || null;
}

export function teamMatchup(dashboard) {
  if (!dashboard?.scoreboard || dashboard.scoreboard.week !== dashboard.week) return null;
  const matchup = list(dashboard.scoreboard.matchups).find(match => match.week === dashboard.week && list(match.teams).some(team => team.key === dashboard.teamKey));
  if (!matchup) return null;
  const team = matchup.teams.find(team => team.key === dashboard.teamKey);
  const opponents = matchup.teams.filter(team => team.key !== dashboard.teamKey);
  return { week: matchup.week, status: matchup.status || null, team, opponent: opponents[0] || null, opponents, matchup };
}

export function leagueHealth(dashboard) {
  const hasRoster = finite(dashboard?.week) && Array.isArray(dashboard?.roster?.players) && dashboard.roster.week === dashboard.week;
  const positions = dashboard?.settings?.rosterPositions;
  const hasSettings = Array.isArray(positions) && positions.length > 0 && positions.every(slot => typeof slot.position === 'string' && Number.isInteger(slot.count) && slot.count >= 0);
  const players = hasRoster ? [...new Map(dashboard.roster.players.filter(player => player?.key).map(player => [player.key, player])).values()] : [];
  const starters = players.filter(isStartingPlayer);
  const requirements = new Map();
  if (hasSettings) for (const slot of positions) {
    if (slot.position && !isReserveSlot(slot.position)) requirements.set(slot.position, (requirements.get(slot.position) || 0) + slot.count);
  }
  const slots = hasRoster && hasSettings ? [...requirements].map(([slot, required]) => {
    const filled = starters.filter(player => player.slot === slot).length;
    return { slot, required, filled, missing: Math.max(0, required - filled) };
  }) : null;
  const concerns = hasRoster ? starters.filter(player => Boolean(player.status) || (finite(dashboard.week) && player.byeWeek === dashboard.week)).map(player => ({
    key: player.key, name: player.name, slot: player.slot,
    status: player.status || null, statusDetail: player.statusDetail || null,
    bye: finite(dashboard.week) && player.byeWeek === dashboard.week,
  })) : null;
  const openSlots = slots ? slots.reduce((sum, slot) => sum + slot.missing, 0) : null;
  return {
    week: dashboard?.week ?? null, checkedAt: dashboard?.checkedAt || null,
    availability: hasRoster && hasSettings ? 'complete' : hasRoster || hasSettings ? 'partial' : 'unavailable',
    slots, emptySlots: slots?.filter(slot => slot.missing > 0) ?? null, openSlots,
    starterCount: hasRoster ? starters.length : null,
    reserveCount: hasRoster ? players.filter(player => isReserveSlot(player.slot)).length : null,
    unassignedCount: hasRoster ? players.filter(player => !player.slot).length : null,
    concerns, flaggedStarters: concerns?.length ?? null,
    lineupComplete: openSlots === null ? null : openSlots === 0,
    needsAttention: (openSlots ?? 0) > 0 || (concerns?.length ?? 0) > 0 ? true : openSlots === null || concerns === null ? null : false,
  };
}

export function leagueSummaries({ account, dashboards = {}, research = {} } = {}) {
  return list(account?.teams).map(team => {
    const candidate = dashboards[team.key];
    const dashboard = candidate?.teamKey === team.key && (!account?.season || candidate.season === account.season) ? candidate : null;
    const league = list(account?.leagues).find(league => league.key === team.leagueKey);
    const standing = teamStanding(dashboard);
    const details = research[team.key]?.teamKey === team.key ? research[team.key] : null;
    const trades = details?.trades;
    return {
      teamKey: team.key, leagueKey: team.leagueKey, teamName: team.name, leagueName: league?.name || null,
      season: dashboard?.season ?? league?.season ?? account?.season ?? null,
      week: dashboard?.week ?? null, checkedAt: dashboard?.checkedAt || null,
      health: leagueHealth(dashboard), standing, standingsBasis: 'Current season standings', matchup: teamMatchup(dashboard),
      faabBalance: finite(standing?.faabBalance) ? standing.faabBalance : null,
      pendingTrades: trades && Array.isArray(trades.items) ? { count: trades.items.length, complete: trades.complete === true, limitReached: trades.limitReached === true, coverage: trades.coverage, items: trades.items } : null,
      availability: details?.availability || null,
    };
  });
}

export function rosterExposure(account, dashboards = {}) {
  const teams = list(account?.teams);
  const grouped = new Map();
  let loadedTeams = 0;
  for (const owned of teams) {
    const dashboard = dashboards[owned.key];
    if (dashboard?.teamKey !== owned.key || (account?.season && dashboard.season !== account.season) || !Array.isArray(dashboard?.roster?.players) || dashboard.roster.week !== dashboard.week) continue;
    loadedTeams++;
    const seen = new Set();
    for (const player of dashboard.roster.players) {
      // Yahoo player keys are game/season-specific; never join by display name.
      if (!player?.key || seen.has(player.key)) continue;
      seen.add(player.key);
      if (!grouped.has(player.key)) grouped.set(player.key, { key: player.key, name: player.name, position: player.position, team: player.team, ownedTeams: [] });
      grouped.get(player.key).ownedTeams.push({ teamKey: owned.key, teamName: owned.name, leagueKey: owned.leagueKey, week: dashboard.week, slot: player.slot });
    }
  }
  const players = [...grouped.values()].map(player => {
    const leagueKeys = [...new Set(player.ownedTeams.map(team => team.leagueKey))];
    return { ...player, count: player.ownedTeams.length, teamCount: player.ownedTeams.length, leagueCount: leagueKeys.length, teamKeys: player.ownedTeams.map(team => team.teamKey), leagueKeys };
  }).sort((a, b) => b.teamCount - a.teamCount || String(a.name || '').localeCompare(String(b.name || '')));
  return { players, loadedTeams, totalTeams: teams.length, complete: Boolean(account) && loadedTeams === teams.length };
}
