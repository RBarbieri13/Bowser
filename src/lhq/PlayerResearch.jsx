import {trendColumn,visibleTrendMax} from '../trendColumn.js';
import {useState} from 'react';
import {Bars,Field,MetricSelect,PlayerName,Status,useJson} from './shared.jsx';
import {nflTeam} from './playerWorkspace.js';
import {fmt,stamp,sortRows} from './model.js';
import './research.css';
const idOf=r=>r?.player_id||r?.playerId||'';
const nameOf=r=>r?.player_display_name||r?.name||'';
const teamOf=r=>String(r?.team||'').split(',').at(-1);
const fields=[['passing_attempts','Pass att'],['completions','Cmp'],['passing_yards','Pass yds'],['passing_tds','Pass TD'],['carries','Rush att'],['rushing_yards','Rush yds'],['rushing_tds','Rush TD'],['targets','Targets'],['receptions','Rec'],['receiving_yards','Rec yds'],['receiving_tds','Rec TD'],['fantasy_points','Fpts']];
export function ResearchButton({row,onSelect}){return <button className="lhq-inspect-button" aria-label={`Research ${nameOf(row)} in sidebar`} title="Research in sidebar" onClick={()=>onSelect(row)}>◧</button>;}
function CompactTable({columns,rows,onOpen}){const [sort,setSort]=useState(null);const ordered=sort?sortRows(rows,sort,columns):rows;return <div className="lhq-research-table"><table><thead><tr>{columns.map(c=><th key={c.key}><button onClick={()=>setSort({key:c.key,desc:sort?.key===c.key?!sort.desc:true})}>{c.label}{sort?.key===c.key?(sort.desc?' ▾':' ▴'):''}</button></th>)}</tr></thead><tbody>{ordered.map((r,i)=><tr key={r.player_id||r.playerId||r.week||i}>{columns.map(c=><td key={c.key}>{c.render?c.render(r):r[c.key]??'—'}</td>)}</tr>)}</tbody></table></div>;}
export function PlayerResearch({kind='player',rows=[],selected,onSelect,season,weeks='1',scoring='ppr',onOpen,team:fixedTeam}){
 const [playerSearch,setPlayerSearch]=useState(''),[localPlayer,setLocalPlayer]=useState(null);
 const picked=onSelect?selected:(localPlayer||selected);
 const pick=row=>{setLocalPlayer(row);onSelect?.(row);};
 const roster=useJson(kind==='depth'?`/api/v1/meta?view=research-roster&season=${season}`:null);
 const candidates=kind==='depth'&&Array.isArray(roster.data?.data)?roster.data.data:rows;
 const chosen=candidates.find(r=>idOf(r)===idOf(picked))||picked||null;
 const [teamOverride,setTeamOverride]=useState(''),[gameWeek,setGameWeek]=useState(''),[metric,setMetric]=useState('snaps');
 const team=nflTeam(teamOverride||teamOf(chosen)||fixedTeam||''),id=idOf(chosen);
 const weekList=String(weeks).split(',').map(Number).filter(w=>w>=1&&w<=22),lastWeek=Math.max(...weekList,1),activeWeek=weekList.includes(Number(gameWeek))?Number(gameWeek):lastWeek;
 const profile=useJson(kind==='player'&&id?`/api/v1/player-profile?${new URLSearchParams({season,playerId:id,weeks,scoring})}`:null);
 const depth=useJson(['depth','playing'].includes(kind)&&team?`/api/v1/opportunity-tracker?${new URLSearchParams({season,team,weeks:lastWeek,games:5,scoring})}`:null);
 const schedule=useJson(kind==='schedule'&&team?`/api/v1/schedule?${new URLSearchParams({season,week:Array.from({length:22},(_,i)=>i+1).join(',')})}`:null);
 const game=useJson(kind==='game'&&team?`/api/v1/team-box-scores?${new URLSearchParams({season,team,weeks:activeWeek,seasonType:'ALL',scoring})}`:null);
 const meta=useJson(kind==='depth'||!team?`/api/v1/meta?season=${season}`:null);
 const state={player:profile,depth,playing:depth,schedule,game}[kind];
 const teams=[...new Set([...(meta.data?.teams||[]),...candidates.map(r=>nflTeam(teamOf(r))).filter(Boolean)])].sort();
 const lastName=r=>(r.last_name||nameOf(r).replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i,'').trim().split(/\s+/).at(-1)||'');
 const depthPlayers=candidates.filter(r=>(!teamOverride||nflTeam(teamOf(r))===nflTeam(teamOverride))&&nameOf(r).toLowerCase().includes(playerSearch.trim().toLowerCase())).sort((a,b)=>lastName(a).localeCompare(lastName(b))||nameOf(a).localeCompare(nameOf(b)));
 const selection=kind==='depth'?<div className="lhq-research-controls"><Status loading={roster.loading} error={roster.error}/><Field label="Research team"><select aria-label="Research team" value={teamOverride} onChange={e=>{setTeamOverride(e.target.value);if(e.target.value&&nflTeam(teamOf(chosen))!==e.target.value)pick(null);}}><option value="">All teams</option>{teams.map(t=><option key={t}>{t}</option>)}</select></Field><Field label="Search players"><input type="search" aria-label="Search depth players" placeholder="Search player name" value={playerSearch} onChange={e=>setPlayerSearch(e.target.value)}/></Field><Field label="Research player"><select aria-label="Research player" value={depthPlayers.some(r=>idOf(r)===id)?id:''} onChange={e=>pick(candidates.find(r=>idOf(r)===e.target.value)||null)}><option value="">Choose a player</option>{depthPlayers.map(r=><option key={idOf(r)} value={idOf(r)}>{nameOf(r)} · {r.position} · {r.team}</option>)}</select></Field>{!depthPlayers.length&&<p className="lhq-note">No available players match this team and search.</p>}<p className="lhq-note">{team?`${team} · `:''}{season} statistics · selected W{weeks}{roster.data?.meta?.rosterSeason?` · ${roster.data.meta.rosterSeason} roster`:''}</p></div>:<div className="lhq-research-controls">{rows.length>0&&<Field label="Research player"><select aria-label="Research player" value={id} onChange={e=>{setTeamOverride('');onSelect?.(rows.find(r=>idOf(r)===e.target.value)||null);}}><option value="">Choose a player</option>{rows.map(r=><option key={idOf(r)} value={idOf(r)}>{nameOf(r)} · {r.position} · {r.team}</option>)}</select></Field>}{!id&&!fixedTeam&&kind!=='player'&&<Field label="Research team"><select value={teamOverride} onChange={e=>setTeamOverride(e.target.value)}><option value="">Choose team</option>{(meta.data?.teams||[]).map(t=><option key={t}>{t}</option>)}</select></Field>}<p className="lhq-note">{chosen?`${nameOf(chosen)} · `:''}{team?`${team} · `:''}{season} · {scoring.toUpperCase()} · selected W{weeks}</p></div>;
 let content;
 if(kind==='player'){
  const logs=profile.data?.data?.gameLogs?.filter(r=>weekList.includes(r.week))||[];
  const sums=Object.fromEntries(fields.map(([key])=>{const values=logs.map(r=>r[key]).filter(Number.isFinite);return[key,values.length?values.reduce((a,b)=>a+b,0):null];}));
  content=!id?<p className="lhq-note">Use ◧ beside a player name, or choose a player above.</p>:<><Status loading={state.loading} error={state.error}/>{profile.data&&<><div className="lhq-summary">{logs.length} sourced games in selected range</div><CompactTable columns={[{key:'label',label:'Statistic'},{key:'value',label:'Total',render:r=>fmt(r.value,r.label==='Fpts'?1:0)}]} rows={fields.map(([key,label])=>({label,value:sums[key]}))}/><CompactTable columns={[{key:'week',label:'Wk'},{key:'opponent_team',label:'Opp'},{key:'offense_snaps',label:'Snaps'},{key:'fantasy_points',label:'Fpts',render:r=>fmt(r.fantasy_points,1)}]} rows={logs}/></>}</>;
 }else if(kind==='depth'||kind==='playing'){
  const groups=depth.data?.data?.groups||[];
  content=<><Status loading={state.loading} error={state.error}/><p className="lhq-note">Official depth captured {stamp(depth.data?.meta?.depthUpdatedAt)}. Unranked roster players stay unranked.</p>{kind==='playing'&&<MetricSelect label="Playing time metric" value={metric} onChange={setMetric}/ >}{groups.map(g=><section key={g.position}><h4>{g.position}</h4><CompactTable onOpen={onOpen} columns={[{key:'depthRank',label:'#'},{key:'name',label:'Player',render:r=><PlayerName row={r} onOpen={onOpen}/>},{key:kind==='depth'?'rosterStatusLabel':'history',label:kind==='depth'?'Status':'Last 5 NFL weeks',...(kind==='playing'?trendColumn({metric,count:5,history:r=>r.history}):{}),render:r=>kind==='depth'?r.rosterStatusLabel||'—':<Bars history={r.history} metric={metric} columnMax={visibleTrendMax(g.players,r=>r.history,metric)}/>}]} rows={g.players}/></section>)}</>;
 }else if(kind==='schedule'){
  const games=(schedule.data?.data||[]).filter(g=>[g.homeTeam,g.awayTeam].includes(team));
  content=<><Status loading={state.loading} error={state.error}/><CompactTable columns={[{key:'week',label:'Wk'},{key:'opponent',label:'Matchup',render:g=><a href={`#/game/${encodeURIComponent(g.gameId)}?scoring=${scoring}`}>{g.awayTeam} @ {g.homeTeam}</a>},{key:'gameday',label:'Date'},{key:'score',label:'Score',render:g=>g.awayScore==null?'—':`${g.awayScore}–${g.homeScore}`}]} rows={games}/></>;
 }else{
  const players=(game.data?.data||[]).filter(r=>r.played&&r.stats_available!==false);
  content=<><Field label="Game week"><select value={activeWeek} onChange={e=>setGameWeek(e.target.value)}>{weekList.map(w=><option key={w} value={w}>Week {w}</option>)}</select></Field><Status loading={state.loading} error={state.error}/><CompactTable columns={[{key:'player_display_name',label:'Player',render:r=><PlayerName row={r} onOpen={onOpen}/>},{key:'snaps',label:'Snp'},{key:'carries',label:'Rush'},{key:'targets',label:'Tgt'},{key:'fantasy_points',label:'Fpts',render:r=>fmt(r.fantasy_points,1)}]} rows={players}/>{!state.loading&&!players.length&&<p className="lhq-note">Game statistics unavailable for this week.</p>}</>;
 }
 return <div className="lhq-context-research">{selection}{!team&&kind!=='player'?<p className="lhq-note">Choose a team or player to load this panel.</p>:content}</div>;
}
