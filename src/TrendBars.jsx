import {createContext,useContext} from 'react';
import {TREND_METRICS,trendValue} from './trendMetrics.js';
import {metricGroup,TREND_PALETTES,trendGrade,trendWhole,trendIntensity} from './trendColumn.js';
import './TrendBars.css';

// Filled geometry remains crisp at the existing 16px arrow-slot width.
const ARROW_PATHS={
  'Strong up':'M10 1 20 11H13V25H7V11H0Z',
  'Up':'M2 24 0 20 12 8H5V2H20V17H14V10Z',
  'Flat':'M0 10H12V5L20 13 12 21V16H0Z',
  'Down':'M2 2 0 6 12 18H5V24H20V9H14V16Z',
  'Strong down':'M7 1H13V15H20L10 25 0 15H7Z',
};
export const TrendScaleContext = createContext(null);
export function TrendBars({history=[],metric='snaps',columnMax,group,playerName,showLabels=false,showValues=true,decorative=false,slotWidth=24}) {
  const scope=useContext(TrendScaleContext);
  const values=history.map(h=>trendValue(h,metric));
  const max=columnMax??scope?.max??Math.max(0,...values.map(v=>Math.abs(v??0)));
  const palette=TREND_PALETTES[group||scope?.group||metricGroup(metric)]||TREND_PALETTES.usage;
  const grade=trendGrade(values,max);
  const exact=value=>value==null?'Unavailable / bye / DNP':String(value);
  const slotLabel=h=>h.label||`${h.season} W${h.week}`;
  const title=grade.delta==null?'Unavailable · first or latest week has no sourced value'
    :`${grade.name} · Δ ${grade.delta>=0?'+':''}${grade.delta.toFixed(2)} of column max ${max}`;
  return <span className="bowser-trend-wrap" style={{'--trend-slot-width':`${slotWidth}px`}}>
    <span className="bowser-trend lhq-bars" role={decorative?undefined:"img"} aria-hidden={decorative||undefined} aria-label={`${TREND_METRICS[metric]?.label||metric} trend${playerName?` for ${playerName}`:''}: ${history.map((h,i)=>`${slotLabel(h)}: ${exact(values[i])}`).join('; ')}`} data-scale-max={max} data-scale-mode="visible-column">
      {history.map((h,i)=>{
        const value=values[i],missing=value==null,zero=value===0;
        const color=missing||zero?'#5A5A5A':i===history.length-1?'#FFFFFF':'#C4C4C4';
        const height=zero?1:2+Math.round((max>0?Math.abs(value)/max:0)*10);
        return <span className={`bowser-trend-slot lhq-bar-slot trend-bar-item${missing?' missing':value<0?' negative':zero?' zero':''}`} key={h.key||`${h.season}-${h.week}-${i}`} data-season={h.season} data-week={h.week} data-value={value??''} title={`${slotLabel(h)}${h.team?` · ${h.team}`:''}: ${exact(value)}`}>
          <b hidden={!showValues} className="bowser-trend-value" style={{color}}>{missing?'—':trendWhole(value)}</b>
          <span className="bowser-trend-plot lhq-bar-plot" style={{height:missing?1:height}}>{!missing&&<i style={{height,background:zero?'#2A2A2A':palette[2],opacity:zero?1:trendIntensity(value,max)}}/>}</span>
        </span>;
      })}
      <span className="bowser-trend-arrow" title={title} aria-label={title} data-direction={grade.name} style={{color:grade.color}}>{ARROW_PATHS[grade.name]?<svg viewBox="0 0 20 26" width="16" height="24" aria-hidden="true" focusable="false"><path d={ARROW_PATHS[grade.name]} fill="currentColor"/></svg>:grade.glyph}</span>
    </span>
    {showLabels&&<span className="bowser-trend-dates" aria-hidden="true">{history.map((h,i)=><small key={h.key||i}>{h.shortLabel||(h.season!=null?`${String(h.season).slice(-2)}·${h.week}`:h.label)}</small>)}</span>}
  </span>;
}
