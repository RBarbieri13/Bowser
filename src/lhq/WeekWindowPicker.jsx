import {Picker} from './shared.jsx';
import {calendarContext,slateShortLabel} from './weekWindowModel.js';

const weeks=Array.from({length:22},(_,index)=>index+1);
const trendOptions=weeks.slice(0,18).map(week=>[week,week===1?'1 week':`${week} weeks`]);

export function WeekWindowPicker({meta,now,baseWeek,count,onBaseChange,onCountChange,trendCount,onTrendCountChange,dfsWeek,slate,weekSlates,dfsEnabled,onDfsWeek,onSlate,onDfsEnabled}){
 const calendar=calendarContext(meta,now);
 const baseOptions=weeks.map(week=>{
  const coverage=meta?.weekCoverage?.find(row=>row.week===week);
  const partial=coverage?.sourcedGames>0&&coverage.sourcedGames<coverage.scheduledGames;
  const context=partial?' · partial':week===calendar.currentWeek?' · current':'';
  return [week,`Week ${week}${context}`];
 });
 const countOptions=weeks.slice(0,baseWeek).map(week=>[week,week===1?'1 · base week only':`${week} weeks incl. base`]);
 const dfsOptions=weeks.map(week=>[week,`Week ${week}${week===calendar.calendarWeek?' · today':''}`]);
 const slateOptions=[
  ['none',weekSlates.length?'No slate · all players':'No slates available'],
  ...weekSlates.map(option=>[option.key,slateShortLabel(option)])
 ];
 return <>
  <div className="lhq-week-group" role="group" aria-label="Statistics window" title={`Today · ${calendar.dateLabel} CT.${calendar.currentWeek?` Current stats W${calendar.currentWeek}.`:''} Weeks back includes the base week and sets the cumulative totals.`}>
   <Picker label="Base week" value={baseWeek} options={baseOptions} onChange={value=>onBaseChange(Number(value))}/>
   <div className="lhq-secondary-week"><Picker label="Weeks back" value={count} options={countOptions} onChange={value=>onCountChange(Number(value))}/></div>
  </div>
  <div className="lhq-trend-weeks" title="Sets chart history only. Trend weeks end at the base week or the last regular-season week.">
   <Picker label="Trend history" value={trendCount} options={trendOptions} onChange={value=>onTrendCountChange(Number(value))}/>
  </div>
  <div className="lhq-week-group lhq-dfs-week-group" role="group" aria-label="DFS matchup window" title={`Today · ${calendar.dateLabel} CT. DFS follows its own schedule week.`}>
   <label className="lhq-dfs-toggle"><input type="checkbox" checked={dfsEnabled} onChange={event=>onDfsEnabled(event.target.checked)}/>DFS</label>
   {dfsEnabled&&<>
    <Picker label="DFS week" value={dfsWeek} options={dfsOptions} onChange={onDfsWeek}/>
    <Picker label="DFS slate" value={slate||'none'} options={slateOptions} onChange={onSlate} wide/>
   </>}
  </div>
 </>;
}
