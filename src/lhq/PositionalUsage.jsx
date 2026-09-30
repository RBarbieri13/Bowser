import {useState} from 'react';
import {Bars,Field,PlayerName,Status,Tip,useJson} from './shared.jsx';
import {stamp} from './model.js';
import {nflTeam} from './playerWorkspace.js';
import {TREND_METRICS,trendValue} from '../trendMetrics.js';
import './positionalUsage.css';

const METRICS={
 QB:['snaps','pass_attempts','completions','passing_yards','passing_tds','interceptions','rush_attempts','rushing_yards','rushing_tds','fantasy_points'],
 RB:['snaps','rush_attempts','rushing_yards','rushing_tds','targets','receptions','receiving_yards','receiving_tds','fantasy_points'],
 WR:['snaps','targets','receptions','receiving_yards','receiving_tds','fantasy_points'],
 TE:['snaps','targets','receptions','receiving_yards','receiving_tds','fantasy_points'],
};
const LABELS={snaps:'Snaps',pass_attempts:'Pass att',completions:'Cmp',passing_yards:'Pass yds',passing_tds:'Pass TD',interceptions:'INT',rush_attempts:'Rush att',rushing_yards:'Rush yds',rushing_tds:'Rush TD',targets:'Targets',receptions:'Rec',receiving_yards:'Rec yds',receiving_tds:'Rec TD',fantasy_points:'Fpts'};
const color=metric=>metric==='fantasy_points'?'#d8bf79':metric==='snaps'?'#3ecf8e':metric.startsWith('rush')?'#ffb340':metric.startsWith('pass')||['completions','interceptions'].includes(metric)?'#53a5ff':'#ac80ff';
const idOf=row=>row?.player_id||row?.playerId||'';

export function PositionalUsage({selected,season=2026,baseWeek=1,scoring='ppr',onOpen}){
 const selectedId=idOf(selected),[manual,setManual]=useState(null),[view,setView]=useState('players'),[metric,setMetric]=useState('snaps'),[collapsed,setCollapsed]=useState([]),[sortMetric,setSortMetric]=useState(''),[sortWeek,setSortWeek]=useState(4),[sortDirection,setSortDirection]=useState('desc');
 const roster=useJson(`/api/v1/meta?view=research-roster&season=${season}`);
 const sourced=(roster.data?.data||[]).find(r=>idOf(r)===selectedId)||selected;
 const choice=manual?.forPlayer===selectedId?manual:null;
 const team=choice?.team??nflTeam(String(sourced?.team||'').split(',').at(-1));
 const position=choice?.position??(METRICS[sourced?.position]?sourced.position:'WR');
 const setChoice=patch=>setManual({forPlayer:selectedId,team,position,...patch});
 const response=useJson(team?`/api/v1/opportunity-tracker?${new URLSearchParams({season,team,weeks:baseWeek,games:5,scoring,dfsSlate:'selected-week',historyAnchor:'requested'})}`:null);
 const meta=response.data?.meta||{},players=(response.data?.data?.groups||[]).find(g=>g.position===position)?.players||[],slots=meta.trendSlots||[];
 const metrics=METRICS[position],activeMetric=metrics.includes(metric)?metric:metrics[0];
 const teams=[...new Set((roster.data?.data||[]).map(r=>nflTeam(r.team)).filter(Boolean))].sort();
 const history=player=>slots.map(slot=>player.history?.find(h=>h.season===slot.season&&h.week===slot.week)||slot);
 const activeSort=sortMetric?(metrics.includes(sortMetric)?sortMetric:metrics[0]):'';
 const weekIndex=Math.min(sortWeek,Math.max(0,slots.length-1)),sortSlot=slots[weekIndex];
 const sortedPlayers=activeSort&&sortSlot?[...players].sort((a,b)=>{
  const av=trendValue(history(a)[weekIndex],activeSort),bv=trendValue(history(b)[weekIndex],activeSort);
  if(av===null)return bv===null?0:1;
  if(bv===null)return -1;
  return (av-bv)*(sortDirection==='asc'?1:-1);
 }):players;
 const sortByWeek=index=>{
  setSortMetric(activeSort||activeMetric);
  setSortDirection(activeSort&&index===weekIndex?(sortDirection==='desc'?'asc':'desc'):'desc');
  setSortWeek(index);
 };
 const weekHeader=<div className={`lhq-usage-weeks ${view==='metric'?'comparing':''}`}><span>{view==='players'?'Statistic':'Player'}</span><div>{slots.map((s,index)=><Tip key={s.key||`${s.season}-${s.week}`} text={`Sort ${TREND_METRICS[activeSort||activeMetric].label} by ${s.season} NFL Week ${s.week}; click again to reverse`}><button className={activeSort&&index===weekIndex?'active':''} aria-label={`Sort usage by ${s.season} Week ${s.week}`} aria-pressed={!!activeSort&&index===weekIndex} onClick={()=>sortByWeek(index)}>{String(s.season).slice(-2)}·W{s.week}{activeSort&&index===weekIndex?<span>{sortDirection==='desc'?'▾':'▴'}</span>:null}</button></Tip>)}</div></div>;
 const plot=(player,key)=><div className="lhq-usage-bars" role="img" aria-label={`${player.name}: ${TREND_METRICS[key].label}. ${history(player).map(h=>`${h.season} W${h.week}: ${trendValue(h,key)??'unavailable'}`).join('; ')}`}><Bars history={history(player)} metric={key} domain={meta.trendDomains?.[key]} color={color(key)} large values/></div>;
 return <section className="lhq-positional-usage" aria-label="Positional Usage">
  <div className="lhq-usage-selectors"><Field label="Usage team"><select aria-label="Usage team" value={team||''} onChange={e=>setChoice({team:e.target.value})}><option value="">Choose team</option>{teams.map(t=><option key={t}>{t}</option>)}</select></Field><Field label="Usage position"><select aria-label="Usage position" value={position} onChange={e=>setChoice({position:e.target.value})}>{Object.keys(METRICS).map(p=><option key={p}>{p}</option>)}</select></Field></div>
  {sourced&&<p className="lhq-usage-follow">{choice?'Manual comparison':`Following ${sourced.player_display_name||sourced.name}`}{choice&&<button onClick={()=>setManual(null)}>Follow selected player</button>}</p>}
  <div className="lhq-usage-views"><button aria-pressed={view==='players'} onClick={()=>setView('players')}>By player</button><button aria-pressed={view==='metric'} onClick={()=>setView('metric')}>Compare stat</button>{view==='metric'&&<select aria-label="Usage comparison statistic" value={activeMetric} onChange={e=>setMetric(e.target.value)}>{metrics.map(k=><option key={k} value={k}>{TREND_METRICS[k].label}</option>)}</select>}</div>
  <div className="lhq-usage-sort" aria-label="Positional usage sorting">
   <label>Sort<select aria-label="Usage sort statistic" value={activeSort} onChange={e=>{setSortMetric(e.target.value);setSortDirection('desc');}}><option value="">Depth order</option>{metrics.map(k=><option key={k} value={k}>{TREND_METRICS[k].label}</option>)}</select></label>
   <label>Week<select aria-label="Usage sort week" value={weekIndex} disabled={!slots.length} onChange={e=>{setSortWeek(Number(e.target.value));setSortMetric(activeSort||activeMetric);}}>{slots.map((s,index)=><option key={`${s.season}-${s.week}`} value={index}>{index===slots.length-1?'Base · ':''}{s.season} W{s.week}</option>)}</select></label>
   <button aria-label={sortDirection==='desc'?'Usage sort: highest first. Switch to lowest first':'Usage sort: lowest first. Switch to highest first'} disabled={!activeSort} onClick={()=>setSortDirection(d=>d==='desc'?'asc':'desc')}>{sortDirection==='desc'?'↓ High first':'↑ Low first'}</button>
  </div>
  {activeSort&&sortSlot&&<p className="lhq-usage-sort-summary" role="status">{TREND_METRICS[activeSort].label} · {sortSlot.season} W{sortSlot.week} · {sortDirection==='desc'?'highest':'lowest'} first · unavailable last</p>}
  <Status loading={roster.loading||response.loading} error={roster.error||response.error}/>
  {!team?<p className="lhq-note">Select a player in the table, or choose a team and position.</p>:<>
   <p className="lhq-usage-basis">{meta.rosterSeason||'—'} depth chart · {scoring.toUpperCase()} · last {slots.length||5} aligned regular-season weeks{slots.length?` through ${slots.at(-1).season} W${slots.at(-1).week}`:''}. Bye/DNP gaps retained. Bar scales match across teammates.</p>
   {weekHeader}
   {view==='players'?sortedPlayers.map(player=>{const isSelected=idOf(player)===selectedId,closed=collapsed.includes(idOf(player))&&!isSelected;return <section key={idOf(player)} className={`lhq-usage-player ${isSelected?'selected':''}`}><header><span className="lhq-usage-rank">{player.depthPosition||position}{player.depthRank??'—'}</span><PlayerName row={player} onOpen={onOpen}/>{isSelected&&<span className="lhq-usage-selected">Selected</span>}<button aria-label={`${closed?'Expand':'Collapse'} ${player.name} usage`} aria-expanded={!closed} disabled={isSelected} onClick={()=>setCollapsed(a=>a.includes(idOf(player))?a.filter(id=>id!==idOf(player)):[...a,idOf(player)])}>{closed?'+':'−'}</button></header>{!closed&&metrics.map(key=><div className="lhq-usage-metric" key={key}><Tip text={TREND_METRICS[key].label}><span style={{color:color(key)}}>{LABELS[key]}</span></Tip>{plot(player,key)}</div>)}</section>;}):sortedPlayers.map(player=><div key={idOf(player)} className={`lhq-usage-comparison ${idOf(player)===selectedId?'selected':''}`}><div><span className="lhq-usage-rank">{player.depthPosition||position}{player.depthRank??'—'}</span><PlayerName row={player} onOpen={onOpen}/></div>{plot(player,activeMetric)}</div>)}
   {!response.loading&&!players.length&&<p className="lhq-note">No sourced {position} depth-chart players are available for {team}.</p>}
   <p className="lhq-usage-basis">Official depth captured {stamp(meta.depthUpdatedAt)}. Unranked players remain unranked; — means unavailable, 0 is a sourced zero. Historical weeks may reflect a previous team.</p>
  </>}
 </section>;
}
