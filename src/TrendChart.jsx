import { TREND_METRICS, TREND_METRIC_KEYS, trendValue, trendDomain } from './trendMetrics.js';
import './TrendChart.css';
export function TrendMetricSelect({metric,onChange,label}) {
  return <select className="trend-metric-select" aria-label={label} value={metric === 'carries' ? 'rush_attempts' : metric} onChange={event=>onChange(event.target.value)}>{TREND_METRIC_KEYS.map(key=><option key={key} value={key}>{TREND_METRICS[key].label}</option>)}</select>;
}
export function TrendChart({history=[],metric='snaps',domain,playerName='Player',height=44,showValues=true,showLabels=true}) {
  const definition=TREND_METRICS[metric] || TREND_METRICS.snaps;
  const {min,max}=trendDomain(metric,domain), span=max-min, baseline=max/span*100;
  const format=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:definition.decimals}).format(value);
  const summary=history.map(game=>`${game.season} Week ${game.week}: ${trendValue(game,metric)===null?'unavailable':format(trendValue(game,metric))}`).join('; ');
  if (!history.length) return <span className="player-trend-empty">No history available</span>;
  return <span className={`shared-trend inline-player-trend trend-${definition.className}`} role="img" aria-label={`${definition.label} trend for ${playerName}: ${summary}`} title={`${definition.label}: shared NFL scale ${format(min)} to ${format(max)}. Calendar weeks align across players; gaps are unavailable, not zero.${metric==='position_finish'?' Lower rank is better.':''}`} data-scale-mode="shared" data-scale-min={min} data-scale-max={max} style={{'--plot-height':typeof height==='number'?`${height}px`:height}}>
    {history.map((game,index)=>{const value=trendValue(game,metric), missing=value===null, end=missing?baseline:(max-value)/span*100, top=Math.min(baseline,end), size=missing?0:Math.abs(value)/span*100;
      const title=`${game.season} W${game.week}${game.team?` · ${game.team}`:''}${game.opponent?` vs ${game.opponent}`:''}: ${missing?'No recorded value / bye / DNP':`${format(value)} ${definition.unit}`}`;
      return <span className={`trend-bar-item${missing?' missing':value<0?' negative':value===0?' zero':''}`} key={game.key||`${game.season}-${game.week}-${index}`} data-season={game.season} data-week={game.week} data-value={value??''} title={title} aria-hidden="true">
        {showValues&&<b>{missing?'—':format(value)}</b>}
        <span className="trend-plot"><span className="trend-baseline" style={{top:`${baseline}%`}}/>{!missing&&<i style={{top:`${top}%`,height:`${size}%`}}/>}{missing&&<span className="trend-gap">·</span>}{value===0&&<span className="trend-zero" style={{top:`${baseline}%`}}/>}</span>
        {showLabels&&<small>{String(game.season||'').slice(-2)}·{game.week}</small>}
      </span>;
    })}
  </span>;
}
