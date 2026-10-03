import { normalizePosition, normalizeTeam, publicIdentityKey } from './playerIdentity.js';

const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : '';
const NFL_TEAMS = new Set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' '));
const identityKey = value => value && typeof value === 'object' && !Array.isArray(value)
  && NFL_TEAMS.has(normalizeTeam(value.team || value.editorial_team_abbr))
  && ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(normalizePosition(value.position || value.display_position)) ? publicIdentityKey(value) : null;
const sameSeason = (value, season) => Number.isInteger(Number(value)) && Number(value) === Number(season);
const validTeamKey = value => /^\d+\.l\.\d+\.t\.\d+$/.test(text(value));
const validLeagueKey = value => /^\d+\.l\.\d+$/.test(text(value));
const leagueKeyOf = teamKey => teamKey.split('.t.')[0];
const validPlayerKey = (key, leagueKey) => /^\d+\.p\.\d+$/.test(text(key)) && key.split('.p.')[0] === leagueKey.split('.l.')[0];
const isoMilliseconds = value => {
  if (typeof value !== 'string') return NaN;
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!parts) return NaN;
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) return NaN;
  return Date.parse(value);
};
const clock = (value, now) => {
  const milliseconds = isoMilliseconds(value);
  return Number.isFinite(milliseconds) && milliseconds <= now ? value : null;
};
const uniqueByKey = rows => {
  const counts = new Map();
  for (const row of rows) counts.set(row?.key, (counts.get(row?.key) || 0) + 1);
  return rows.filter(row => row?.key && counts.get(row.key) === 1);
};
const hasError = (errors, key) => Boolean(errors && Object.hasOwn(errors, key));
const projectedPlayer = player => ({
  key: player.key || player.playerKey, name: text(player.name), team: text(player.team), position: text(player.position),
  ...(player.slot ? { slot: text(player.slot) } : {}),
  ...(player.status ? { status: text(player.status) } : {}),
  ...(player.statusDetail ? { statusDetail: text(player.statusDetail) } : {}),
});

function authorizedContext(yahoo, season, now) {
  const account = yahoo?.account;
  const expiry = isoMilliseconds(yahoo?.status?.expiresAt);
  const connected = yahoo?.status?.connected === true && Number.isFinite(expiry) && expiry > now && sameSeason(account?.season, season);
  if (!connected) return { connected: false, teams: [], leagues: [], totalTeams: 0, totalLeagues: 0, reason: yahoo?.status?.connected === false ? 'disconnected' : Number.isFinite(expiry) && expiry <= now ? 'expired' : 'authorization-unverified' };
  const discoveredLeagues = list(account.leagues);
  const leagues = uniqueByKey(discoveredLeagues).filter(league => validLeagueKey(league.key) && sameSeason(league.season, season));
  const leagueKeys = new Set(leagues.map(league => league.key));
  const discoveredTeams = list(account.teams);
  const teams = uniqueByKey(discoveredTeams).filter(team => validTeamKey(team.key) && team.leagueKey === leagueKeyOf(team.key) && leagueKeys.has(team.leagueKey));
  return { connected: true, teams, leagues, totalTeams: discoveredTeams.length, totalLeagues: discoveredLeagues.length, reason: null };
}

function dashboardFor(yahoo, team, season) {
  const dashboard = yahoo?.dashboards?.[team.key];
  if (hasError(yahoo?.errors, team.key) || hasError(dashboard?.errors, 'roster') || dashboard?.teamKey !== team.key || !sameSeason(dashboard.season, season)
    || !Number.isInteger(dashboard.week) || dashboard.week < 1 || dashboard.week > 18 || dashboard.roster?.week !== dashboard.week
    || !Array.isArray(dashboard.roster?.players) || yahoo?.week && yahoo.week !== 'current' && Number(yahoo.week) !== dashboard.week) return null;
  return dashboard;
}

function researchFor(yahoo, team, season) {
  const research = yahoo?.research?.[team.key];
  if (hasError(yahoo?.errors, `research:${team.key}`) || research?.teamKey !== team.key || research.leagueKey !== team.leagueKey || !sameSeason(research.season, season)) return null;
  return research;
}

function matchingPlayer(player, rows, leagueKey, ownership = false) {
  const identity = identityKey(player);
  if (!identity) return { player: null, ambiguous: false };
  const matches = list(rows).filter(candidate => identityKey(candidate) === identity);
  if (!matches.length) return { player: null, ambiguous: false };
  const found = matches[0], key = ownership ? found.playerKey : found.key;
  if (matches.length !== 1 || !validPlayerKey(key, leagueKey) || list(rows).filter(candidate => (ownership ? candidate?.playerKey : candidate?.key) === key).length !== 1) return { player: null, ambiguous: true };
  return { player: found, ambiguous: false };
}

function capture(research, section, player, now, dashboard = false) {
  // mergeResearch preserves older sections and merges pages under a newer envelope
  // checkedAt. That envelope cannot establish a retained player's capture age.
  const checkedAt = dashboard ? clock(research.checkedAt, now) : player && Object.hasOwn(player, 'checkedAt') ? clock(player.checkedAt, now)
    : !section?.accumulated ? clock(section?.checkedAt, now) : null;
  const stale = [research, section, player].some(value => value?.stale === true || value?.freshness?.state === 'stale');
  return {
    checkedAt, envelopeCheckedAt: clock(research.checkedAt, now), captureAgeVerified: Boolean(checkedAt),
    ageLabel: checkedAt ? 'Loaded observation; confirm in Yahoo' : 'Capture age unverified',
    conditional: true, stale, freshness: stale ? 'stale-loaded' : 'loaded',
  };
}

function pageCoverage(page) {
  const complete = page.complete === true && page.start === 0 && page.exhausted === true && page.accumulated !== true;
  return {
    complete, partial: !complete, status: page.status,
    start: Number.isInteger(page.start) ? page.start : null,
    pageSize: Number.isInteger(page.pageSize) ? page.pageSize : null,
    nextStart: Number.isInteger(page.nextStart) ? page.nextStart : null,
    limitReached: page.limitReached === true, accumulated: page.accumulated === true,
    basis: 'Loaded bounded availability pool; absence establishes neither ownership nor unavailability.',
  };
}

/**
 * Pure private-memory projection of affirmative Yahoo observations for one complete
 * PUBLIC identity. Yahoo keys and public player IDs use different namespaces;
 * names alone, pool absence, and a Yahoo player's health status prove nothing.
 */
export function newsPlayerLeagueContext(player, yahoo, season, { now = Date.now() } = {}) {
  const currentTime = now instanceof Date ? now.getTime() : Number(now);
  const context = authorizedContext(yahoo, season, currentTime);
  const owned = [], available = [], conflicts = [], leagueOwned = [], observedKeys = new Set();
  let loadedRosterCount = 0;
  const loadedAvailability = new Set(), completeAvailability = new Set();
  for (const team of context.teams) {
    const league = context.leagues.find(value => value.key === team.leagueKey);
    const labels = { teamKey: team.key, teamName: text(team.name), leagueKey: team.leagueKey, leagueName: text(league?.name) || 'League' };
    const dashboard = dashboardFor(yahoo, team, season);
    if (dashboard) {
      loadedRosterCount++;
      const match = matchingPlayer(player, dashboard.roster.players, team.leagueKey);
      if (match.ambiguous) conflicts.push({ ...labels, reason: 'ambiguous-roster-identity' });
      if (match.player) {
        observedKeys.add(match.player.key);
        owned.push({ ...labels, player: projectedPlayer(match.player), week: dashboard.week, ...capture(dashboard, null, match.player, currentTime, true) });
      }
    }
    const research = researchFor(yahoo, team, season);
    if (!research) continue;
    const page = research.availability;
    if (!hasError(research.errors, 'availability') && ['FA', 'W', 'A'].includes(page?.status) && Array.isArray(page.players)) {
      loadedAvailability.add(team.leagueKey);
      const coverage = pageCoverage(page);
      if (coverage.complete) completeAvailability.add(team.leagueKey);
      const match = matchingPlayer(player, page.players, team.leagueKey);
      if (match.ambiguous) conflicts.push({ ...labels, reason: 'ambiguous-availability-identity' });
      if (match.player) {
        observedKeys.add(match.player.key);
        const observation = capture(research, page, match.player, currentTime);
        available.push({ ...labels, player: projectedPlayer(match.player), status: page.status, method: 'availability-page', ...observation, coverage: { ...coverage, sectionAgeVerified: observation.captureAgeVerified } });
      }
    }
    const ownership = research.ownership;
    if (!hasError(research.errors, 'ownership') && Array.isArray(ownership?.matches)) {
      loadedAvailability.add(team.leagueKey);
      const match = matchingPlayer(player, ownership.matches, team.leagueKey, true);
      if (match.ambiguous) conflicts.push({ ...labels, reason: 'ambiguous-ownership-identity' });
      if (match.player && ['exact-name-team-position', 'yahoo-player-key'].includes(match.player.match)) {
        observedKeys.add(match.player.playerKey);
        if (match.player.owned === true && match.player.ownershipType === 'team') leagueOwned.push(labels);
        if (match.player.owned === false && ['freeagents', 'waivers'].includes(match.player.ownershipType)) {
          const observation = capture(research, ownership, match.player, currentTime);
          available.push({ ...labels, player: projectedPlayer(match.player), status: match.player.ownershipType === 'freeagents' ? 'FA' : 'W', method: 'ownership-response', ...observation,
            coverage: { complete: false, partial: true, requested: ownership.requested ?? null, matched: ownership.matched ?? null, sectionAgeVerified: observation.captureAgeVerified, basis: 'Bounded ownership lookup for requested identities; not a complete league pool.' } });
        }
      }
    }
  }
  // Two Yahoo keys for one normalized identity remain ambiguous, even when they
  // appeared in separate bounded pools. Never choose a convenient match.
  if (observedKeys.size > 1) for (const league of context.leagues) conflicts.push({ leagueKey: league.key, leagueName: text(league.name), reason: 'conflicting-player-identities' });
  for (const league of context.leagues) {
    const leagueAvailable = available.filter(value => value.leagueKey === league.key);
    if (leagueAvailable.length && [...owned, ...leagueOwned].some(value => value.leagueKey === league.key)) conflicts.push({ leagueKey: league.key, leagueName: text(league.name), reason: 'contradictory-ownership' });
    if (new Set(leagueAvailable.map(value => value.status).filter(status => status !== 'A')).size > 1) conflicts.push({ leagueKey: league.key, leagueName: text(league.name), reason: 'contradictory-availability' });
  }
  const rejected = new Set(conflicts.map(value => value.leagueKey));
  const safeOwned = owned.filter(value => !rejected.has(value.leagueKey));
  // One availability badge per league. Prefer a specific source-native mechanism;
  // retain every observation's provenance when several owned teams read that pool.
  const safeAvailable = context.leagues.flatMap(league => {
    const observations = available.filter(value => value.leagueKey === league.key && !rejected.has(value.leagueKey));
    if (!observations.length) return [];
    const preferred = observations.find(value => value.status !== 'A') || observations[0];
    const verified = observations.every(value => value.captureAgeVerified);
    const stale = observations.some(value => value.stale);
    return [{ ...preferred, observations, checkedAt: verified ? preferred.checkedAt : null, captureAgeVerified: verified, stale,
      freshness: stale ? 'stale-loaded' : 'loaded', ageLabel: verified ? preferred.ageLabel : 'Capture age unverified',
      coverage: { ...preferred.coverage, sectionAgeVerified: verified, complete: observations.every(value => value.coverage.complete), partial: observations.some(value => value.coverage.partial) } }];
  });
  const matchedLeagues = new Set([...safeOwned, ...safeAvailable].map(value => value.leagueKey));
  const unknownLeagueKeys = context.leagues.filter(league => !matchedLeagues.has(league.key)).map(league => league.key);
  const coverage = {
    totalTeams: context.totalTeams, loadedRosterCount, totalLeagues: context.totalLeagues,
    loadedAvailabilityLeagues: loadedAvailability.size, completeAvailabilityLeagues: completeAvailability.size,
    unknownLeagueKeys, partial: !context.connected || !context.totalTeams || !context.totalLeagues || loadedRosterCount < context.totalTeams || completeAvailability.size < context.totalLeagues || conflicts.length > 0,
  };
  return { connected: context.connected, reason: context.reason, identityResolved: Boolean(identityKey(player)), owned: safeOwned, available: safeAvailable, conflicts,
    relevant: safeOwned.length > 0 || safeAvailable.length > 0, coverage };
}

/** Article filtering is an OR over affirmative ownership and loaded availability. */
export function newsArticleLeagueContext(article, yahoo, season, options) {
  const players = list(article?.players);
  const contexts = players.map(player => newsPlayerLeagueContext(player, yahoo, season, options));
  const baseline = contexts[0] || newsPlayerLeagueContext(null, yahoo, season, options);
  const unique = rows => [...new Map(rows.map(row => [`${row.leagueKey}|${row.teamKey}|${row.player.key}`, row])).values()];
  const owned = unique(contexts.flatMap(context => context.owned));
  const available = unique(contexts.flatMap(context => context.available));
  return { connected: baseline.connected, reason: baseline.reason, identityResolved: contexts.some(context => context.identityResolved), owned, available,
    conflicts: contexts.flatMap(context => context.conflicts), relevant: owned.length > 0 || available.length > 0,
    coverage: { ...baseline.coverage, partial: contexts.some(context => context.coverage.partial) || baseline.coverage.partial } };
}

/** Compatibility projection for the owned-roster UI. */
export function newsRosterMatches(article, yahoo, season, options) {
  return newsArticleLeagueContext(article, yahoo, season, options).owned;
}

/** Validated, memory-only inputs for the News league desk; never a new data source. */
export function newsLeagueDeskContext(yahoo, season, {now=Date.now()}={}) {
  const scope=authorizedContext(yahoo,season,Number(now));
  return {...scope, teams:scope.teams.map(team=>({...team,dashboard:dashboardFor(yahoo,team,season),research:researchFor(yahoo,team,season)}))};
}
