import {ArrowDown,ArrowUp,ArrowsDownUp,ChartBar,Minus,Plus} from '@phosphor-icons/react';

export function TeamWeekActions({season,week,sorted,descending,trendActive,onSort,onTrend,onTrendDrop}){
 const Direction=sorted?(descending?ArrowDown:ArrowUp):ArrowsDownUp;
 const order=sorted&&!descending?'highest':'lowest';
 const nextOrder=sorted?order:'highest';
 return <span className="team-week-actions" role="group" aria-label={`${season} week ${week} table actions`}>
  <button type="button" className="team-week-action" data-active={sorted} aria-pressed={sorted} aria-label={`Sort ${season} week ${week} fantasy points ${nextOrder} first`} title={`Sort this week's FPTS ${nextOrder} first. Click again to reverse. Reveals FPTS if hidden.`} onClick={onSort}>
   <Direction size={16} aria-hidden="true"/><span>Sort FPTS</span>
  </button>
  <button type="button" className="team-week-action" data-active={trendActive} aria-pressed={trendActive} aria-label={`${trendActive?'Remove':'Add'} trend after ${season} week ${week}`} title={trendActive?'Remove this trend chart':`Add a trend chart after ${season} week ${week}, or move the existing chart here. You can also drop its header here.`} onClick={onTrend} onDragOver={e=>{if(onTrendDrop)e.preventDefault();}} onDrop={e=>{e.preventDefault();onTrendDrop?.();}}>
   <ChartBar size={16} aria-hidden="true"/><span>{trendActive?'Remove trend':'Add trend'}</span>{trendActive?<Minus size={12} aria-hidden="true"/>:<Plus size={12} aria-hidden="true"/>}
  </button>
 </span>;
}
