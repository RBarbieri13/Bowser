import {TREND_METRICS,trendValue} from '../trendMetrics.js';
import {metricGroup} from '../trendColumn.js';
export const slotKey=slot=>`${slot.season}-${slot.week}`;
export const playedSnap=(history,slots)=>history.some(h=>slots.some(s=>slotKey(s)===slotKey(h))&&h.played!==false&&trendValue(h,'snaps')>0);
export function comparePeriods(history,metric,earlier,later,mode='total'){
 const period=keys=>{const values=keys.map(key=>{const row=history.find(h=>slotKey(h)===key);return row?.played===false?null:trendValue(row,metric);});const count=values.filter(Number.isFinite).length,complete=keys.length>0&&count===keys.length;return {count,expected:keys.length,value:complete?values.reduce((a,b)=>a+b,0)/(mode==='average'?keys.length:1):null};};
 const prior=period(earlier),recent=period(later),delta=prior.value!=null&&recent.value!=null?recent.value-prior.value:null;
 const percent=delta==null?null:prior.value===0?(recent.value===0?0:null):delta/Math.abs(prior.value)*100;
 return {prior,recent,delta,percent,mode,metric};
}
export function distinctTrendGroups(metrics){const groups=[];for(const metric of metrics){let group=metricGroup(metric);if(group===groups.at(-1))group=['rushing','passing','receiving','fantasy','usage'].find(g=>g!==group&&g!==groups.at(-1));groups.push(group);}return groups;}
export const comparisonMode=(metric,mode)=>metric.endsWith('_pct')||metric==='position_finish'?'average':mode;
export const comparisonUnit=metric=>TREND_METRICS[metric]?.unit||metric;
