import {createContext,useContext} from 'react';
import {TREND_METRICS,trendValue} from './trendMetrics.js';
import {metricGroup,TREND_PALETTES,trendGrade,trendWhole} from './trendColumn.js';
import './TrendBars.css';

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
          <span className="bowser-trend-plot lhq-bar-plot" style={{height:missing?1:height}}>{!missing&&<i style={{height,background:zero?'#2A2A2A':palette[Math.min(2,Math.max(0,i-(history.length-3)))]}}/>}</span>
        </span>;
      })}
      <span className="bowser-trend-arrow" title={title} aria-label={title} style={{color:grade.color,fontSize:grade.size}}>{grade.glyph}</span>
    </span>
    {showLabels&&<span className="bowser-trend-dates" aria-hidden="true">{history.map((h,i)=><small key={h.key||i}>{h.shortLabel||(h.season!=null?`${String(h.season).slice(-2)}·${h.week}`:h.label)}</small>)}</span>}
  </span>;
}
