import {useMemo} from 'react';
import dfsWeekly from '../../data/dfs-weekly.json';
import {Field,Status,Tip,useStored} from './shared.jsx';
import {fmt,stamp} from './model.js';
import './LeagueResearch.css';

const TEAM_MAP={JAC:'JAX',LA:'LAR',WSH:'WAS'};
const team=value=>TEAM_MAP[String(value||'').toUpperCase()]||String(value||'').toUpperCase();
const pos=value=>['D/ST','DST'].includes(String(value||'').toUpperCase())?'DEF':String(value||'').toUpperCase();
const clean=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const identity=row=>`${clean(row.name||row.player_display_name)}|${pos(row.position)}|${team(row.team)}`;
const safeId=value=>String(value||'').slice(0,120);
const slate=dfsWeekly.slates?.[dfsWeekly.defaultSlate]||{};
const projectionRows=Array.isArray(slate.records)?slate.records:[];
function uniqueIndex(rows){
 const map=new Map();
 for(const row of rows){const key=identity(row);if(clean(row.name)&&row.team&&row.position)map.set(key,map.has(key)?null:row);}
 return map;
}
const projectionIndex=uniqueIndex(projectionRows);
export const projectionMeta={provider:slate.projectionProvider||'DraftKings projection unavailable',week:slate.week||dfsWeekly.week,season:slate.season||dfsWeekly.season,scoring:slate.scoring||'DraftKings Classic',capturedAt:slate.capturedAt||dfsWeekly.capturedAt};
export function projectionFor(row){
 const match=projectionIndex.get(identity(row));
 return match?{value:Number.isFinite(match.projection)?match.projection:null,source:match.projectionSource||projectionMeta.provider,url:match.projectionUrl||null,week:match.projectionWeek||projectionMeta.week,scoring:projectionMeta.scoring,capturedAt:match.projectionSourceDate||projectionMeta.capturedAt}:null;
}
export function ownershipRequests(rows,limit=24){
 const seen=new Set();
 return rows.map(row=>({id:safeId(row.playerId||row.player_id||row.id),name:row.name||row.player_display_name,team:row.team,position:row.position})).filter(row=>row.id&&row.name&&row.team&&row.position&&!seen.has(row.id)&&seen.add(row.id)).slice(0,limit);
}
export function ownershipLookup(research){
 return new Map((research?.ownership?.matches||[]).map(item=>[item.id,item]));
}
export function ownershipValue(research,row){
 const id=safeId(row.playerId||row.player_id||row.id);
 return ownershipLookup(research).get(id)||null;
}
export function useLeaguePickups(season,leagueKey){
 const [stored,setStored]=useStored(`bowser:lhq:pickup-drafts:v1:${season}:${leagueKey||'none'}`,[]);
 const items=Array.isArray(stored)?stored.filter(item=>item&&typeof item.id==='string'&&item.id.length<=120&&Number.isFinite(item.preference)).slice(0,200):[];
 const ids=new Set(items.map(item=>item.id));
 const toggle=(id,preference=1)=>setStored(current=>{const valid=Array.isArray(current)?current.filter(item=>item&&typeof item.id==='string'&&item.id.length<=120&&Number.isFinite(item.preference)).slice(0,200):[];return valid.some(item=>item.id===id)?valid.filter(item=>item.id!==id):[...valid,{id,preference}];});
 return {items,ids,toggle};
}
export function MarkPickupButton({id,name,pickups,preference=1}){
 const active=pickups?.ids?.has(id);
 return <button className={`lhq-pickup-button ${active?'active':''}`} aria-label={`${active?'Unmark':'Mark'} pickup ${name||id}`} onClick={()=>pickups?.toggle(id,preference)}>{active?'Marked':'Mark'}</button>;
}
export function OwnershipMark({value}){
 if(!value||value.owned==null)return <span className="lhq-ownership-mark unknown">—</span>;
 return <Tip text={`Yahoo ownership response: ${value.ownershipType||'unavailable'}`}><span className={`lhq-ownership-mark ${value.owned?'owned':'available'}`}>{value.owned?'✓':'×'}</span></Tip>;
}
export function LeagueResearchPanel({yahoo:y,season,rows=[],selectedTeamKey,onTeamChange,title='Yahoo research'}){
 const teams=y?.teams||[],teamKey=selectedTeamKey&&teams.some(t=>t.key===selectedTeamKey)?selectedTeamKey:teams[0]?.key||'',research=teamKey?y?.research?.[teamKey]:null,pickups=useLeaguePickups(season,teamKey);
 const projected=useMemo(()=>[...(research?.availability?.players||[])].map(player=>({...player,projection:projectionFor(player)})).sort((a,b)=>(b.projection?.value??-Infinity)-(a.projection?.value??-Infinity)||String(a.name).localeCompare(String(b.name))).slice(0,8),[research]);
 const requested=ownershipRequests(rows);
 const load=()=>teamKey&&y?.loadResearch?.(teamKey,{include:requested.length?'availability,transactions,ownership':'availability,transactions',availabilityStatus:'FA',players:requested});
 if(!y)return <p className="lhq-research-note">Yahoo research is unavailable until the parent page supplies the private Yahoo session prop.</p>;
 if(!teams.length)return <div className="lhq-research-panel"><p className="lhq-research-note">No owned Yahoo leagues discovered. Connect Yahoo to show league-specific research.</p><a className="lhq-mini" href="#/yahoo">Yahoo Connection</a></div>;
 return <div className="lhq-research-panel">
  <div className="lhq-research-controls"><Field label="Owned team"><select value={teamKey} onChange={e=>onTeamChange?.(e.target.value)}>{teams.map(t=><option key={t.key} value={t.key}>{t.name}</option>)}</select></Field><button className="lhq-mini" disabled={!teamKey||y.researchBusy?.[teamKey]} onClick={load}>{y.researchBusy?.[teamKey]?'Reading…':'Read league'}</button></div>
  <p className="lhq-research-note">{title}. Ownership checks are bounded to {requested.length} visible rows; unknown means no exact unique Yahoo identity or ownership response. Private Yahoo payloads stay in memory.</p>
  <Status error={y.errors?.[`research:${teamKey}`]}/>
  {research&&<p className="lhq-research-note">Captured {stamp(research.checkedAt)} · availability {research.availability?.players?.length??0} players from one page · transactions {research.transactions?.items?.length??'—'} actual returned of limit {research.transactions?.limit??'—'} · ownership {research.ownership?.matched??0}/{research.ownership?.requested??0} explicit.</p>}
  <div className="lhq-research-list">{projected.map(player=><div className="lhq-research-player" key={player.key}><div><strong>{player.name}</strong><small>{player.position||'—'} · {player.team||'—'} · Yahoo FA page</small></div><Tip text={player.projection?`${player.projection.source} · ${projectionMeta.season} W${player.projection.week} · ${player.projection.scoring}`:'No exact sourced projection match'}><span>{player.projection?.value==null?'—':fmt(player.projection.value,1)}</span></Tip><MarkPickupButton id={player.key} name={player.name} pickups={pickups}/></div>)}</div>
  {!projected.length&&<p className="lhq-research-note">Read a league to show the top available free agents from the returned Yahoo page, sorted by sourced projection when exactly matched.</p>}
 </div>;
}
