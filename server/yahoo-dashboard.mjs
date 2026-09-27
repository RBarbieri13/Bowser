// Yahoo JSON normalization. No account data is persisted or logged.
export function metadata(value) {
  if (Array.isArray(value)) return Object.assign({}, ...value.map(metadata));
  return value && typeof value === 'object' ? value : {};
}
export function entities(value, name, found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    if (key === name) found.push(metadata(child));
    else entities(child, name, found);
  }
  return found;
}
export const numeric = value => value === undefined || value === null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const text = value => typeof value === 'string' ? value : '';
export function leagueInfo(l) {
  return {key:text(l.league_key),name:text(l.name),season:numeric(l.season),teams:numeric(l.num_teams),week:numeric(l.current_week),startWeek:numeric(l.start_week),endWeek:numeric(l.end_week),scoring:text(l.scoring_type),finished:String(l.is_finished)==='1'};
}
export function teamInfo(t) {
  const standing=metadata(t.team_standings), outcomes=metadata(standing.outcome_totals);
  return {key:text(t.team_key),name:text(t.name),rank:numeric(standing.rank),wins:numeric(outcomes.wins),losses:numeric(outcomes.losses),ties:numeric(outcomes.ties),pointsFor:numeric(standing.points_for),pointsAgainst:numeric(standing.points_against),streak:text(standing.streak?.type)?`${standing.streak.type} ${standing.streak.value ?? ''}`:null,waiverPriority:numeric(t.waiver_priority),faabBalance:numeric(t.faab_balance),moves:numeric(t.number_of_moves),points:numeric(metadata(t.team_points).total),projected:numeric(metadata(t.team_projected_points).total)};
}
export function rosterInfo(data) {
  const roster=entities(data,'roster')[0] || {};
  return {week:numeric(roster.week),coverageType:text(roster.coverage_type),players:entities(data,'player').map(p=>({key:text(p.player_key),name:text(p.name?.full),position:text(p.display_position),team:text(p.editorial_team_abbr),slot:text(metadata(p.selected_position).position),status:text(p.status),statusDetail:text(p.status_full),byeWeek:numeric(p.bye_weeks?.week),points:numeric(metadata(p.player_points).total),pointsWeek:numeric(metadata(p.player_points).week)}))};
}
export function scoreboardInfo(data) {
  const scoreboard=entities(data,'scoreboard')[0] || {};
  return {week:numeric(scoreboard.week),matchups:entities(data,'matchup').map(m=>({week:numeric(m.week),status:text(m.status),start:text(m.week_start),end:text(m.week_end),playoffs:String(m.is_playoffs)==='1',tied:String(m.is_tied)==='1',winnerKey:text(m.winner_team_key),teams:entities(m.teams,'team').map(teamInfo)}))};
}
export function settingsInfo(data) {
  const settings=entities(data,'settings')[0] || {};
  return {rosterPositions:entities(settings.roster_positions,'roster_position').map(r=>({position:text(r.position),count:numeric(r.count)})),scoring:entities(settings.stat_modifiers,'stat').map(s=>({id:text(s.stat_id),value:numeric(s.value)})),waiverType:text(settings.waiver_type),playoffWeek:numeric(settings.playoff_start_week),playoffTeams:numeric(settings.num_playoff_teams)};
}
