// One catalogue for every historical trend selector. Values are actual weekly stats.
const metric = (label, unit, aliases, max, decimals = 0, className = 'snaps') => ({label, heading: `${label} trend`, unit, aliases, max, decimals, className});
export const TREND_METRICS = {
  snaps: metric('Snaps','snaps',['snaps'],100),
  snap_pct: metric('Snap %','snap percentage',['snapPct','snap_pct'],100,0),
  pass_attempts: metric('Pass attempts','pass attempts',['passAttempts','passing_attempts','pass_attempts'],70),
  completions: metric('Completions','completions',['completions'],50),
  completion_pct: metric('Completion %','completion percentage',['completionPct','completion_pct'],100,0),
  passing_yards: metric('Passing yards','passing yards',['passingYards','passing_yards'],550),
  passing_tds: metric('Passing TDs','passing touchdowns',['passingTds','passing_tds'],7),
  interceptions: metric('Interceptions','interceptions',['interceptions'],6),
  rush_attempts: metric('Rush attempts','rush attempts',['rushAttempts','carries','rush_attempts'],40,0,'rushing'),
  rushing_yards: metric('Rushing yards','rushing yards',['rushingYards','rushing_yards'],300,0,'rushing'),
  rushing_tds: metric('Rushing TDs','rushing touchdowns',['rushingTds','rushing_tds'],5,0,'rushing'),
  targets: metric('Targets','targets',['targets'],25,0,'targets'),
  receptions: metric('Receptions','receptions',['receptions'],20,0,'targets'),
  catch_pct: metric('Catch %','catch percentage',['catchPct','catch_pct','reception_pct'],100,0,'targets'),
  receiving_yards: metric('Receiving yards','receiving yards',['receivingYards','receiving_yards'],350,0,'targets'),
  receiving_tds: metric('Receiving TDs','receiving touchdowns',['receivingTds','receiving_tds'],5,0,'targets'),
  touches: metric('Touches','touches',['touches'],50),
  fantasy_points: metric('Fantasy points','fantasy points',['fantasyPoints','fantasy_points'],60,1,'fantasy'),
  position_finish: metric('Position finish','position finish (lower is better)',['positionFinish','position_finish'],150,0,'fantasy'),
};
export const TREND_METRIC_KEYS = Object.keys(TREND_METRICS);
export function trendValue(game, metric) {
  if (!game) return null;
  const key = metric === 'carries' ? 'rush_attempts' : metric;
  for (const alias of TREND_METRICS[key]?.aliases || [key]) {
    const value = game[alias];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  if (key === 'completion_pct') { const attempts = trendValue(game,'pass_attempts'), completed=trendValue(game,'completions'); return attempts > 0 && completed !== null ? 100*completed/attempts : null; }
  if (key === 'catch_pct') { const targets=trendValue(game,'targets'), catches=trendValue(game,'receptions'); return targets > 0 && catches !== null ? 100*catches/targets : null; }
  if (key === 'touches') { const carries=trendValue(game,'rush_attempts'), catches=trendValue(game,'receptions'); return carries !== null && catches !== null ? carries+catches : null; }
  return null;
}
export function trendDomain(metric, domain) {
  const supplied = domain && Number.isFinite(domain.min) && Number.isFinite(domain.max);
  return { min: Math.min(0,supplied ? domain.min : metric === 'fantasy_points' ? -10 : 0), max: Math.max(1,supplied ? domain.max : TREND_METRICS[metric]?.max || 100) };
}
