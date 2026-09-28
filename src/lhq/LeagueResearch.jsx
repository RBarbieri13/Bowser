import {useCallback,useEffect,useMemo,useState} from 'react';
import dfsWeekly from '../../data/dfs-weekly.json';
import {Field,PlayerName,Status,Tip,useJson} from './shared.jsx';
import {fmt,stamp} from './model.js';
import {identityLabelFromKey,leagueKeyFromTeam,normalizePosition,normalizeTeam,publicIdentityKey} from './playerIdentity.js';
import './LeagueResearch.css';

const team=normalizeTeam;
const pos=normalizePosition;
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
export function ownershipRequests(rows,limit=24,skipIds=[]){
 const seen=new Set();
 const skip=new Set(skipIds);
 return rows.map(row=>({id:publicIdentityKey(row)||safeId(row.playerId||row.player_id||row.id),name:row.name||row.player_display_name,team:row.team,position:row.position})).filter(row=>row.id&&row.name&&row.team&&row.position&&!skip.has(row.id)&&!seen.has(row.id)&&seen.add(row.id)).slice(0,limit);
}
export function ownershipLookup(research){
 return new Map((research?.ownership?.matches||[]).map(item=>[item.id,item]));
}
export function ownershipValue(research,row){
 const id=publicIdentityKey(row)||safeId(row.playerId||row.player_id||row.id);
 return ownershipLookup(research).get(id)||null;
}
const eventName='bowser:lhq:pickup-drafts:changed';
function pickupStorageKey(season,leagueKey){return `bowser:lhq:pickup-drafts:v2:${season}:${leagueKey||'none'}`;}
function readPickups(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
function validPickups(value){
 const seen=new Set();
 return (Array.isArray(value)?value:[]).filter(item=>item&&typeof item.id==='string'&&item.id.length<=120&&!seen.has(item.id)&&seen.add(item.id)&&Number.isFinite(item.preference)).slice(0,200).map(item=>({id:item.id,preference:item.preference}));
}
export function useLeaguePickups(season,leagueKey){
 const key=pickupStorageKey(season,leagueKey);
 const [stored,setStored]=useState(()=>validPickups(readPickups(key)));
 useEffect(()=>{setStored(validPickups(readPickups(key)));},[key]);
 useEffect(()=>{
  const sync=event=>{if(!event.detail?.key||event.detail.key===key)setStored(validPickups(readPickups(key)));};
  const storage=event=>{if(event.key===key)setStored(validPickups(readPickups(key)));};
  window.addEventListener(eventName,sync);window.addEventListener('storage',storage);
  return()=>{window.removeEventListener(eventName,sync);window.removeEventListener('storage',storage);};
 },[key]);
 const write=useCallback(updater=>{
  const current=validPickups(readPickups(key));
  const next=validPickups(typeof updater==='function'?updater(current):updater);
  try{localStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new CustomEvent(eventName,{detail:{key}}));}catch{}
  setStored(next);
 },[key]);
 const items=validPickups(stored);
 const ids=new Set(items.map(item=>item.id));
 const toggle=(id,preference=1)=>leagueKey&&id&&write(current=>current.some(item=>item.id===id)?current.filter(item=>item.id!==id):[...current,{id,preference}]);
 const remove=id=>write(current=>current.filter(item=>item.id!==id));
 return {items,ids,toggle,remove,leagueKey};
}
export function MarkPickupButton({id,row,name,pickups,preference=1}){
 const identityId=id||publicIdentityKey(row);
 const active=identityId&&pickups?.ids?.has(identityId);
 const disabled=!pickups?.leagueKey||!identityId;
 return <button className={`lhq-pickup-button ${active?'active':''}`} disabled={disabled} aria-label={`${active?'Unmark':'Mark'} pickup ${name||row?.name||row?.player_display_name||identityId||'player'}`} title={disabled?'Select a discovered Yahoo league before marking pickups':'Local pickup preference'} onClick={()=>pickups?.toggle(identityId,preference)}>{active?'Marked':'Mark'}</button>;
}
export function OwnershipMark({value}){
 if(!value||value.owned==null)return <span className="lhq-ownership-mark unknown">—</span>;
 return <Tip text={`Yahoo ownership response: ${value.ownershipType||'unavailable'}`}><span className={`lhq-ownership-mark ${value.owned?'owned':'available'}`}>{value.owned?'✓':'×'}</span></Tip>;
}
export function transactionSummary(research,row){
 const key=publicIdentityKey(row);
 if(!research?.transactions||!key)return null;
 let adds=0,drops=0;
 for(const transaction of research.transactions.items||[]){
  for(const player of transaction.players||[]){
   if(publicIdentityKey(player)!==key)continue;
   const action=String(player.action||transaction.type||'').toLowerCase();
   if(action.includes('add'))adds++;
   if(action.includes('drop'))drops++;
  }
 }
 return {adds,drops,net:adds-drops,coverage:research.transactions.coverage||'Most recent league transactions'};
}
function optionLabel(teamItem,leagues){
 const league=leagues.find(l=>l.key===teamItem.leagueKey);
 return `${league?.name||teamItem.leagueKey||'Yahoo league'} · ${teamItem.name||teamItem.key}`;
}
function pickupCandidates(rows,research,dashboard){
 return [...rows,...(research?.availability?.players||[]),...(dashboard?.roster?.players||[])].filter(publicIdentityKey);
}
function PickupList({pickups,candidates,onOpen}){
 const byId=new Map();
 for(const candidate of candidates){const key=publicIdentityKey(candidate);if(key&&!byId.has(key))byId.set(key,candidate);}
 return <div className="lhq-research-list">{pickups.items.map(item=>{const row=byId.get(item.id);return <div className="lhq-research-player" key={item.id}><div>{row?<PlayerName row={row} onOpen={onOpen}/>:<strong>{identityLabelFromKey(item.id)}</strong>}<small>{row?`${row.position||'—'} · ${row.team||'—'}`:item.id}</small></div><span>Pref {item.preference}</span><button className="lhq-mini" onClick={()=>pickups.remove(item.id)}>Remove</button></div>;})}{!pickups.items.length&&<p className="lhq-research-note">Marked players from Market Pulse and Waivers appear here for this Yahoo league.</p>}</div>;
}
function DepthPanel({season,team,onOpen}){
 const result=useJson(team?`/api/v1/opportunity-tracker?${new URLSearchParams({season,team,weeks:1,games:5,scoring:'ppr'})}`:null);
 const groups=result.data?.data?.groups||[];
 return <div className="lhq-depth-panel"><Status loading={result.loading} error={result.error}/>{groups.slice(0,4).map(group=><section key={group.position}><h4>{group.position}</h4>{group.players.slice(0,6).map(player=><div className="lhq-depth-row" key={player.playerId||player.name}><span>{player.depthRank||'—'}</span><PlayerName row={{...player,name:player.name,playerId:player.playerId}} onOpen={onOpen}/><small>{player.rosterStatusLabel||'Roster status unavailable'}</small></div>)}</section>)}{!team&&<p className="lhq-research-note">Choose a team to load depth context.</p>}</div>;
}
export function LeagueResearchPanel({yahoo:y,season,rows=[],selectedTeamKey,onTeamChange,title='Yahoo research',onOpen}){
 const [view,setView]=useState('free'),[positionFilter,setPositionFilter]=useState('All'),[scanBusy,setScanBusy]=useState(false);
 const teams=y?.teams||[],leagues=y?.leagues||[],teamKey=selectedTeamKey&&teams.some(t=>t.key===selectedTeamKey)?selectedTeamKey:teams[0]?.key||'',leagueKey=leagueKeyFromTeam(teamKey),research=teamKey?y?.research?.[teamKey]:null,dashboard=teamKey?y?.dashboards?.[teamKey]:null,pickups=useLeaguePickups(season,leagueKey);
 const candidates=useMemo(()=>pickupCandidates(rows,research,dashboard),[rows,research,dashboard]);
 const projected=useMemo(()=>[...(research?.availability?.players||[])].filter(player=>positionFilter==='All'||player.position===positionFilter).map(player=>({...player,projection:projectionFor(player)})).sort((a,b)=>(b.projection?.value??-Infinity)-(a.projection?.value??-Infinity)||String(a.name).localeCompare(String(b.name))),[research,positionFilter]);
 const requested=ownershipRequests(rows);
 const load=()=>teamKey&&y?.loadResearch?.(teamKey,{include:requested.length?'availability,transactions,ownership':'availability,transactions',availabilityStatus:'FA',players:requested});
 const next=()=>teamKey&&research?.availability?.nextStart!=null&&y?.loadResearch?.(teamKey,{include:'availability,transactions',availabilityStatus:research.availability.status||'FA',availabilityStart:research.availability.nextStart});
 const scan=async()=>{if(!teamKey||scanBusy)return;setScanBusy(true);try{let start=research?.availability?.nextStart??0,status=research?.availability?.status||'FA',guard=0;while(start!=null&&start<2000&&guard<80){const result=await y?.loadResearch?.(teamKey,{include:'availability',availabilityStatus:status,availabilityStart:start});start=result?.availability?.nextStart??null;guard++;}}finally{setScanBusy(false);}};
 if(!y)return <p className="lhq-research-note">Yahoo research is unavailable until the parent page supplies the private Yahoo session prop.</p>;
 if(!teams.length)return <div className="lhq-research-panel"><p className="lhq-research-note">No owned Yahoo leagues discovered. Connect Yahoo to show league-specific research.</p><a className="lhq-mini" href="#/yahoo">Yahoo Connection</a></div>;
 const roster=dashboard?.roster?.players||[],weekLabel=dashboard?.roster?.week||y.week||'current';
 return <div className="lhq-research-panel">
  <div className="lhq-research-controls"><Field label="Yahoo league"><select value={teamKey} onChange={e=>onTeamChange?.(e.target.value)}>{teams.map(t=><option key={t.key} value={t.key}>{optionLabel(t,leagues)}</option>)}</select></Field><button className="lhq-mini" disabled={!teamKey||y.researchBusy?.[teamKey]} onClick={load}>{y.researchBusy?.[teamKey]?'Reading…':'Read league'}</button></div>
  <div className="lhq-view-tabs">{[['roster','Roster'],['free','Free agents'],['pickups','Pickup list'],['transactions','Transactions']].map(([key,label])=><button key={key} className={view===key?'active':''} onClick={()=>setView(key)}>{label}</button>)}</div>
  <p className="lhq-research-note">{title}. Ownership checks are bounded to {requested.length} visible rows; unknown means no exact unique Yahoo identity or ownership response. Private Yahoo payloads stay in memory.</p>
  <Status error={y.errors?.[`research:${teamKey}`]}/>
  {research&&<p className="lhq-research-note">Captured {stamp(research.checkedAt)} · availability {research.availability?.players?.length??0} players from one page · transactions {research.transactions?.items?.length??'—'} actual returned of limit {research.transactions?.limit??'—'} · ownership {research.ownership?.matched??0}/{research.ownership?.requested??0} explicit.</p>}
  {view==='roster'&&<><p className="lhq-research-note">Roster week {weekLabel}. These rows come from yahoo.dashboards[{teamKey}].roster.players.</p><div className="lhq-research-list">{roster.map(player=><div className="lhq-research-player" key={player.key}><div><PlayerName row={player} onOpen={onOpen}/><small>{player.slot||'—'} · {player.position||'—'} · {player.team||'—'}</small></div><span>{player.points==null?'—':fmt(player.points,1)}</span><MarkPickupButton row={player} name={player.name} pickups={pickups}/></div>)}</div>{!roster.length&&<p className="lhq-research-note">Roster is unavailable until the dashboard for this owned team loads.</p>}<DepthPanel season={season} team={roster[0]?.team} onOpen={onOpen}/></>}
  {view==='free'&&<><div className="lhq-panel-actions"><Field label="Position"><select value={positionFilter} onChange={e=>setPositionFilter(e.target.value)}>{['All','QB','RB','WR','TE','K','DEF'].map(p=><option key={p}>{p}</option>)}</select></Field><button className="lhq-mini lhq-outline" disabled={!research?.availability?.nextStart||y.researchBusy?.[teamKey]} onClick={next}>Next 25</button><button className="lhq-mini" disabled={scanBusy||y.researchBusy?.[teamKey]} onClick={scan}>{scanBusy?'Scanning…':'Scan top 2000'}</button></div><div className="lhq-research-list">{projected.map(player=><div className="lhq-research-player" key={player.key}><div><PlayerName row={player} onOpen={onOpen}/><small>{player.position||'—'} · {player.team||'—'} · Yahoo {research?.availability?.status||'FA'} pool</small></div><Tip text={player.projection?`${player.projection.source} · ${projectionMeta.season} W${player.projection.week} · ${player.projection.scoring}`:'No exact sourced projection match'}><span>{player.projection?.value==null?'—':fmt(player.projection.value,1)}</span></Tip><MarkPickupButton row={player} name={player.name} pickups={pickups}/></div>)}</div>{!projected.length&&<p className="lhq-research-note">Read a league to show the available free-agent pool, sorted by sourced projection when exactly matched.</p>}</>}
  {view==='pickups'&&<PickupList pickups={pickups} candidates={candidates} onOpen={onOpen}/>}
  {view==='transactions'&&<div className="lhq-research-list">{(research?.transactions?.items||[]).map(item=><div className="lhq-transaction-row" key={item.key}><strong>{item.type||'transaction'} · {item.status||'—'}</strong><small>{item.players?.map(player=>`${player.action||item.type}: ${player.name}`).join(' · ')||'No player details returned'}</small></div>)}{!research?.transactions?.items?.length&&<p className="lhq-research-note">Read league transactions to show actual returned adds, drops and trades.</p>}</div>}
 </div>;
}
