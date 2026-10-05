import {trendValue} from './trendMetrics.js';

export const TREND_PALETTES = {
  usage: ['#6D4FC2', '#8B5CF6', '#A78BFA'],
  rushing: ['#A16207', '#CA9A04', '#FACC15'],
  passing: ['#1D4ED8', '#3B82F6', '#60A5FA'],
  receiving: ['#1F8A5B', '#2FB67B', '#3ECF8E'],
  fantasy: ['#BE185D', '#EC4899', '#F9A8D4'],
};
export const TREND_THRESHOLDS = {strong: 0.35, moderate: 0.12};
export const TREND_GRADES = {
  strongUp: {name:'Strong up', glyph:'⬆', size:15, color:'#16E27A'},
  up: {name:'Up', glyph:'↗', size:14, color:'#8EE6B8'},
  flat: {name:'Flat', glyph:'→', size:14, color:'#6B6B6B'},
  down: {name:'Down', glyph:'↘', size:14, color:'#F39C94'},
  strongDown: {name:'Strong down', glyph:'⬇', size:15, color:'#FF2E2E'},
  unavailable: {name:'Unavailable', glyph:'—', size:14, color:'#6B6B6B'},
};
export const trendWidth = count => Math.max(1, count) * 28 + 24;
export const trendWhole = value => String(Math.floor(value + 0.5));
export const metricGroup = metric => /fantasy|position_finish/.test(metric) ? 'fantasy'
  : /^(pass|complet|interception)/.test(metric) ? 'passing'
  : /^(rush|carries)/.test(metric) ? 'rushing'
  : /^(receiv|reception|target|catch)/.test(metric) ? 'receiving' : 'usage';
export const trendValues = (history, metric) => (history || []).map(h => trendValue(h, metric));
// Magnitude keeps sourced negative observations within the same 12px plot.
export const visibleTrendMax = (rows, history, metric) => rows.reduce((max, row) => row.total || row.section ? max
  : (history(row) || []).reduce((m, h) => Math.max(m, Math.abs(trendValue(h, metric) ?? 0)), max), 0);
export function trendChange(values) {
  if (!values.length || values[0] == null || values.at(-1) == null) return null;
  // Match the prototype's zero-total rule only when every slot is observed.
  if (values.every(v => v != null) && values.reduce((a,b) => a+b,0) === 0) return 0;
  return values.at(-1) - values[0];
}
export function trendGrade(values, columnMax) {
  const change = trendChange(values);
  if (change == null) return {...TREND_GRADES.unavailable, delta:null};
  const delta = columnMax > 0 ? change / columnMax : 0;
  const grade = delta >= TREND_THRESHOLDS.strong ? 'strongUp'
    : delta >= TREND_THRESHOLDS.moderate ? 'up'
    : delta <= -TREND_THRESHOLDS.strong ? 'strongDown'
    : delta <= -TREND_THRESHOLDS.moderate ? 'down' : 'flat';
  return {...TREND_GRADES[grade], delta};
}
export function trendColumn({history, metric, count, group = metricGroup(metric), showValues = true, showLabels = false}) {
  return {
    trend: {history, metric, count, group, showValues, showLabels},
    width: trendWidth(count),
    headerColor: TREND_PALETTES[group]?.[2],
    value: row => trendChange(trendValues(history(row), metric)),
    tieValue: row => trendValues(history(row), metric).at(-1),
    sortable: true,
  };
}

// Existing APIs accept these windows; slice the response for intermediate display counts.
export const trendRequestCount = count => [3,5,8,10,18].find(n=>n>=count) || 18;
