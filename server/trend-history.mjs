// Read-only calendar-aligned views over the immutable season warehouses.
export const TREND_METRICS = {
  snaps: 'snaps', snap_pct: 'snapPct', pass_attempts: 'passAttempts',
  completions: 'completions', completion_pct: 'completionPct',
  passing_yards: 'passingYards', passing_tds: 'passingTds', interceptions: 'interceptions',
  rush_attempts: 'rushAttempts', rushing_yards: 'rushingYards', rushing_tds: 'rushingTds',
  targets: 'targets', receptions: 'receptions', catch_pct: 'catchPct',
  receiving_yards: 'receivingYards', receiving_tds: 'receivingTds', touches: 'touches',
  fantasy_points: 'fantasyPoints', position_finish: 'positionFinish',
};

const TREND_ENTRIES = Object.entries(TREND_METRICS);
const TREND_FIELDS = Object.values(TREND_METRICS);

export function completedRegularWeeks(db, season) {
  return db.prepare(`
    SELECT week FROM games WHERE season = ? AND season_type = 'REG'
    GROUP BY week
    HAVING MIN(home_score IS NOT NULL AND away_score IS NOT NULL) = 1
    ORDER BY week
  `).all(season).map((row) => row.week);
}

export function calendarSlots(sources, season, weeks, count) {
  const ceiling = weeks.length ? Math.max(...weeks) : 18;
  const anchorWeek = completedRegularWeeks(sources.find((source) => source.season === season).db, season)
    .filter((week) => week <= ceiling).at(-1);
  if (!anchorWeek) return [];
  const slots = [];
  for (const source of sources.toSorted((a, b) => a.season - b.season)) {
    if (source.season > season) continue;
    const finalWeek = source.season === season ? anchorWeek : 18;
    for (let week = 1; week <= finalWeek; week += 1) {
      slots.push({ key: `${source.season}-${week}`, season: source.season, week, seasonType: 'REG', label: `${source.season} W${week}` });
    }
  }
  return slots.slice(-count);
}

export function readRankedWeeks(db, season, weeks, receptionBonus) {
  if (!weeks.length) return [];
  return db.prepare(`
    WITH weekly AS (
      SELECT stats.player_id, stats.season, stats.week,
        CASE WHEN MAX(stats.position) IN ('RB', 'FB', 'HB') THEN 'RB' ELSE MAX(stats.position) END AS position_group,
        GROUP_CONCAT(DISTINCT stats.team) AS team,
        GROUP_CONCAT(DISTINCT stats.opponent_team) AS opponent,
        MAX(stats.game_id) AS gameId, MAX(games.gameday) AS gameday,
        SUM(stats.offense_snaps) AS snaps,
        CASE WHEN SUM(CASE WHEN stats.offense_pct > 0 THEN stats.offense_snaps / stats.offense_pct END) > 0
          THEN ROUND(100.0 * SUM(stats.offense_snaps) / SUM(CASE WHEN stats.offense_pct > 0 THEN stats.offense_snaps / stats.offense_pct END), 1)
          ELSE ROUND(AVG(stats.offense_pct) * 100, 1) END AS snapPct,
        SUM(stats.attempts) AS passAttempts, SUM(stats.completions) AS completions,
        CASE WHEN SUM(stats.attempts) > 0 THEN ROUND(100.0 * SUM(stats.completions) / SUM(stats.attempts), 1) END AS completionPct,
        SUM(stats.passing_yards) AS passingYards, SUM(stats.passing_tds) AS passingTds,
        SUM(stats.interceptions) AS interceptions,
        SUM(stats.carries) AS rushAttempts, SUM(stats.rushing_yards) AS rushingYards, SUM(stats.rushing_tds) AS rushingTds,
        SUM(stats.targets) AS targets, SUM(stats.receptions) AS receptions,
        CASE WHEN SUM(stats.targets) > 0 THEN ROUND(100.0 * SUM(stats.receptions) / SUM(stats.targets), 1) END AS catchPct,
        SUM(stats.receiving_yards) AS receivingYards, SUM(stats.receiving_tds) AS receivingTds,
        SUM(stats.carries + stats.receptions) AS touches,
        ROUND(SUM(stats.fantasy_points + stats.receptions * ?), 2) AS rank_points
      FROM player_week_stats stats
      INNER JOIN games ON games.game_id = stats.game_id
      WHERE stats.season = ? AND stats.season_type = 'REG' AND stats.played = 1
        AND games.home_score IS NOT NULL AND games.away_score IS NOT NULL
        AND stats.week IN (${weeks.map(() => '?').join(',')})
      GROUP BY stats.player_id, stats.season, stats.week
    )
    SELECT *, ROUND(rank_points, 1) AS fantasyPoints,
      CASE WHEN rank_points IS NOT NULL THEN RANK() OVER (
        PARTITION BY season, week, position_group ORDER BY rank_points DESC
      ) END AS positionFinish
    FROM weekly
  `).all(receptionBonus, season, ...weeks);
}

export function alignedHistory(sources, { season, weeks = [], count = 10, receptionBonus = 1, seasonType = 'REG' }) {
  const slots = calendarSlots(sources, season, weeks, count);
  const rows = sources.flatMap((source) => readRankedWeeks(source.db, source.season,
    slots.filter((slot) => slot.season === source.season).map((slot) => slot.week), receptionBonus));
  const byPlayer = new Map();
  const domains = Object.fromEntries(Object.keys(TREND_METRICS).map((metric) => [metric, { min: 0, max: 0 }]));
  for (const row of rows) {
    const key = `${row.season}-${row.week}`;
    if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, new Map());
    byPlayer.get(row.player_id).set(key, row);
    for (const [metric, field] of TREND_ENTRIES) {
      if (Number.isFinite(row[field])) {
        domains[metric].min = Math.min(domains[metric].min, row[field]);
        domains[metric].max = Math.max(domains[metric].max, row[field]);
      }
    }
  }
  const current = sources.find((source) => source.season === season);
  const rankWeek = seasonType === 'POST' ? null : completedRegularWeeks(current.db, season)
    .filter((week) => !weeks.length || weeks.includes(week)).at(-1) ?? null;
  const rankRows = rankWeek === null ? [] : rows.filter((row) => row.season === season && row.week === rankWeek);
  const rankByPlayer = new Map((rankRows.length || rankWeek === null ? rankRows : readRankedWeeks(current.db, season, [rankWeek], receptionBonus))
    .map((row) => [row.player_id, row.positionFinish]));
  const emptyMetrics = Object.fromEntries(TREND_FIELDS.map((metric) => [metric, null]));
  return {
    slots, domains, rankEntries: [...rankByPlayer],
    rankContext: {
      season, week: rankWeek, seasonType: 'REG', scope: 'All NFL players at the same position; FB/HB grouped with RB',
      method: 'Competition RANK on selected-scoring points at two decimals; tied totals share rank',
      source: 'nflverse player_week_stats',
    },
    rankForPlayer(playerId) {
      return { position_finish: rankByPlayer.get(playerId) ?? null, position_finish_week: rankWeek, position_finish_season: season };
    },
    forPlayer(playerId) {
      return slots.map((slot) => {
        const row = byPlayer.get(playerId)?.get(slot.key);
        const values = row ? {} : emptyMetrics;
        if (row) for (const metric of TREND_FIELDS) values[metric] = row[metric];
        return {
          ...slot, gameId: row?.gameId ?? null, gameday: row?.gameday ?? null,
          team: row?.team ?? null, opponent: row?.opponent ?? null,
          played: Boolean(row), available: Boolean(row), missingReason: row ? null : 'No recorded game: bye, DNP or unavailable',
          ...values, carries: values.rushAttempts, receptionPct: values.catchPct,
          fumbles: null, positionFinishWeek: slot.week, positionFinishSeason: slot.season,
        };
      });
    },
  };
}
