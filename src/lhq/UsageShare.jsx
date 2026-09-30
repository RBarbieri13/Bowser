import {useCallback,useEffect,useRef,useState} from 'react';
import {nflTeam} from './playerWorkspace.js';
import './usageShare.css';

const TEAMS='ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LA LAC LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' ');
const RECEIVING=[['snaps','Snaps','#3ecf8e'],['targets','Targets','#a87cff'],['receptions','Rec','#5aa9ff'],['receivingYards','Rec yds','#f2ae49'],['receivingTds','Rec TD','#e8735a'],['fantasyPoints','Fpts','#d8bf79']];
export const USAGE_SHARE_STATS={
 WR:RECEIVING,TE:RECEIVING,
 RB:[['snaps','Snaps','#3ecf8e'],['rushAttempts','Carries','#a87cff'],['rushingYards','Rush yds','#f2ae49'],['targets','Targets','#2fc4b2'],['receptions','Rec','#5aa9ff'],['fantasyPoints','Fpts','#d8bf79']],
 QB:[['snaps','Snaps','#3ecf8e'],['passAttempts','Pass att','#a87cff'],['passingYards','Pass yds','#5aa9ff'],['passingTds','Pass TD','#e8735a'],['rushAttempts','Rush att','#2fc4b2'],['fantasyPoints','Fpts','#d8bf79']],
};
const COLORS=['#5aa9ff','#f2ae49','#a87cff','#e8735a','#d8bf79','#b4b4b4','#72e3ad'];
const idOf=p=>p?.playerId||p?.player_id||'';
const nameOf=p=>p?.name||p?.player_display_name||'';
export const usageSurname=name=>String(name||'').replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i,'').trim().split(/\s+/).at(-1);
const rowAt=(player,slot)=>player.history?.find(h=>Number(h.season)===Number(slot.season)&&Number(h.week)===Number(slot.week));
export function usageShareValue(row,key){return row?.played===false||!Number.isFinite(row?.[key])?null:row[key];}
const format=(n,key)=>key==='fantasyPoints'?n.toFixed(1):String(Math.round(n));
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(',');
const date=(value,clock=false)=>{const d=new Date(value);return value&&Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',...(clock?{hour:'2-digit',minute:'2-digit',hour12:false}:{})}).format(d).replace(',','')+(clock?' UTC':''):'unavailable';};
const selectionOf=selected=>{const position=['FB','HB'].includes(selected?.position)?'RB':selected?.position;const team=nflTeam(String(selected?.team||'').split(',').at(-1));return USAGE_SHARE_STATS[position]&&TEAMS.includes(team)?{team,position,focus:idOf(selected)}:null;};

// Route-owned state deliberately outlives the shell's mounted active panel.
export function useUsageShareState({selected,season=2026,baseWeek=1,scoring='ppr',teams=TEAMS,availableWeeks}={}){
 const [choice,setChoice]=useState(()=>({team:'NYG',position:'RB',focus:'',follow:true,expanded:false,reveal:0,...selectionOf(selected)}));
 const [visible,setVisible]=useState(false),[response,setResponse]=useState({key:'',data:null,error:'',loading:false});
 const cache=useRef(new Map()),handledReveal=useRef(''),selectedId=idOf(selected),selectedTeam=selected?.team,selectedPosition=selected?.position;
 const selectPlayer=useCallback(player=>{const next=selectionOf(player);if(next)setChoice(old=>old.follow?{...old,...next,reveal:old.reveal+1,expanded:old.team===next.team&&old.position===next.position?old.expanded:false}:old);},[]);
 useEffect(()=>selectPlayer(selected),[selectedId,selectedTeam,selectedPosition,selectPlayer]);
 const key=`${season}:${choice.team}:${Math.min(18,baseWeek)}:${scoring}`;
 useEffect(()=>{
  if(!visible)return;
  if(cache.current.has(key)){setResponse({key,data:cache.current.get(key),error:'',loading:false});return;}
  const controller=new AbortController();setResponse({key,data:null,error:'',loading:true});
  const query=new URLSearchParams({season,team:choice.team,weeks:Math.min(18,baseWeek),games:5,scoring,historyAnchor:'requested'});
  fetch(`/api/v1/opportunity-tracker?${query}`,{credentials:'same-origin',cache:'no-store',signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error?.message||data.error||'Usage data unavailable');return data;}).then(data=>{if(!controller.signal.aborted){cache.current.set(key,data);setResponse({key,data,error:'',loading:false});}}).catch(e=>{if(!controller.signal.aborted)setResponse({key,data:null,error:e.message,loading:false});});
  return()=>controller.abort();
 },[visible,key,season,choice.team,baseWeek,scoring]);
 const result=response.key===key?response:{key,data:cache.current.get(key)||null,error:'',loading:visible&&!cache.current.has(key)};
 const meta=result.data?.meta||{},slots=meta.trendSlots||[];
 // Reveal an explicitly followed player beyond the normal six-player cap once
 // per selection, while allowing a subsequent user collapse to remain collapsed.
 useEffect(()=>{
  if(!result.data||!choice.focus)return;
  const revealKey=`${key}:${choice.position}:${choice.focus}:${choice.reveal}`;
  if(handledReveal.current===revealKey)return;
  handledReveal.current=revealKey;
  const group=result.data.data?.groups?.find(g=>g.position===choice.position)?.players||[];
  const ordered=group.filter(p=>slots.some(s=>usageShareValue(rowAt(p,s),'snaps')>0)).sort((a,b)=>(a.depthRank??Infinity)-(b.depthRank??Infinity));
  if(ordered.findIndex(p=>idOf(p)===choice.focus)>=6)setChoice(old=>({...old,expanded:true}));
 },[result.data,key,choice.position,choice.focus,choice.reveal]);
 const clock=result.data?[`Depth: current · captured ${date(meta.depthUpdatedAt,true)}`,`Stats: ${slots.length?`${slots[0].season} W${slots[0].week} → ${slots.at(-1).season} W${slots.at(-1).week}`:'unavailable'} · calendar weeks · ${scoring.toUpperCase()}`]:[];
 return {choice,setChoice,setVisible,selectPlayer,result,clock,season,scoring,availableWeeks,teams:[...new Set([...teams.map(t=>nflTeam(Array.isArray(t)?t[0]:t)),choice.team])].filter(t=>TEAMS.includes(t)).sort(),followSelected:()=>setChoice(old=>({...old,follow:!old.follow,...(!old.follow?{...selectionOf(selected),reveal:old.reveal+1}:{})}))};
}

export function UsageShare({workspace}){
 const {choice,setChoice,setVisible,result,teams,season,availableWeeks}=workspace;
 useEffect(()=>{setVisible(true);return()=>setVisible(false);},[setVisible]);
 const meta=result.data?.meta||{},slots=meta.trendSlots||[];
 const group=result.data?.data?.groups?.find(g=>g.position===choice.position)?.players||[];
 const players=group.filter(p=>slots.some(s=>usageShareValue(rowAt(p,s),'snaps')>0)).map((p,index)=>({...p,sourceOrder:index})).sort((a,b)=>(a.depthRank??Infinity)-(b.depthRank??Infinity)||a.sourceOrder-b.sourceOrder);
 const shown=choice.expanded?players:players.slice(0,6),focused=players.find(p=>idOf(p)===choice.focus)||players[0];
 const focusId=idOf(focused),otherPlayers=players.filter(p=>idOf(p)!==focusId);
 const stats=USAGE_SHARE_STATS[choice.position];
 const choose=patch=>setChoice(old=>({...old,...patch,focus:'',expanded:false}));
 const focus=player=>setChoice(old=>({...old,focus:idOf(player),follow:false}));
 return <section className="lhq-usage-share" aria-label="Usage share">
  <div className="usage-share-controls"><select aria-label="Usage share team" value={choice.team} onChange={e=>choose({team:e.target.value})}>{teams.map(team=><option key={team}>{team}</option>)}</select><select aria-label="Usage share position" value={choice.position} onChange={e=>choose({position:e.target.value})}>{Object.keys(USAGE_SHARE_STATS).sort((a,b)=>['QB','RB','WR','TE'].indexOf(a)-['QB','RB','WR','TE'].indexOf(b)).map(pos=><option key={pos}>{pos}</option>)}</select><button className="usage-share-follow" aria-pressed={choice.follow} onClick={workspace.followSelected}>{choice.follow?'Follows selection':'Pinned'}</button></div>
  {result.loading&&<p className="usage-share-message" role="status">Loading sourced usage…</p>}{result.error&&<p className="usage-share-message" role="alert">{result.error}</p>}
  {!!result.data&&<>
   <div className="usage-share-context"><span title={`${choice.team} ${choice.position} · ${meta.depthUpdatedAt?'Official depth':'Depth unavailable'} · ${date(meta.depthUpdatedAt)} · ${players.length} players`}>{choice.team} {choice.position} · {meta.depthUpdatedAt?'Official depth':'Depth unavailable'} · {date(meta.depthUpdatedAt)} · {players.length} players</span><span title={`Focus: ${nameOf(focused)||'—'}`}>Focus: {nameOf(focused)||'—'}{players.length>6&&!choice.expanded?` · showing 6 of ${players.length}`:''}</span></div>
   <table className="usage-share-matrix" aria-label={`${choice.team} ${choice.position} five-week usage share`}><colgroup><col className="usage-share-name-column"/>{slots.map(s=><col key={`${s.season}-${s.week}`}/>)}<col className="usage-share-total-column"/></colgroup><thead><tr><th scope="col">Stat · player</th>{slots.map(s=><th scope="col" key={`${s.season}-${s.week}`} className={s.season===season&&availableWeeks&&!availableWeeks.includes(Number(s.week))?'unavailable-week':''}>{String(s.season).slice(-2)}·{s.week}</th>)}<th scope="col">5-wk</th></tr></thead>
   {stats.map(([key,label,hue])=>{
    const values=shown.flatMap(p=>slots.map(s=>usageShareValue(rowAt(p,s),key))),max=Math.max(1,...values.filter(v=>v!==null));
    const leaders=slots.map(s=>Math.max(0,...shown.map(p=>usageShareValue(rowAt(p,s),key)).filter(v=>v!==null)));
    return <tbody key={key} data-stat={key}><tr className="usage-share-stat-band"><th colSpan={slots.length+2} scope="colgroup"><div style={{color:hue,background:`rgba(${rgb(hue)},.12)`,borderBottom:`1px solid rgba(${rgb(hue)},.5)`}}>{label}<span>max {format(max,key)}</span></div></th></tr>{shown.map(player=>{
     const active=idOf(player)===focusId,observations=slots.map(slot=>usageShareValue(rowAt(player,slot),key)),observed=observations.filter(v=>v!==null),tag=player.depthRank!=null?`${player.depthPosition||choice.position}${player.depthRank}`:'—';
     const tagColor=active?'#3ecf8e':COLORS[otherPlayers.findIndex(p=>idOf(p)===idOf(player))%COLORS.length];
     return <tr key={idOf(player)} data-player={idOf(player)} className={active?'focused':''}><td><button aria-label={`Focus ${nameOf(player)} · ${label}`} onClick={()=>focus(player)} title={nameOf(player)}><span className="usage-share-depth" style={{color:tagColor}}>{tag}</span><span className="usage-share-name">{usageSurname(nameOf(player))}</span></button></td>{slots.map((slot,index)=>{const value=observations[index],row=rowAt(player,slot),gap=value===null,reason=!row||row.played===false?(row?.missingReason||'no recorded game'):`${label} not in ${slot.season} capture`;return <td key={`${slot.season}-${slot.week}`}><span data-value-length={gap?1:format(value,key).length} className={`usage-share-chip${gap?' gap':''}`} title={`${nameOf(player)} · ${slot.season} W${slot.week} · ${label} ${gap?`— · ${reason}`:format(value,key)}`} style={gap?undefined:{background:`rgba(${rgb(hue)},${Math.max(0,Math.min(1,.10+.68*value/max))})`,fontWeight:value>0&&value===leaders[index]?700:400}}>{gap?'—':format(value,key)}</span></td>;})}<td className="usage-share-total">{observed.length?format(observed.reduce((a,b)=>a+b,0),key):'—'}</td></tr>;
    })}</tbody>;
   })}</table>
   {!players.length&&<p className="usage-share-message">No {choice.team} {choice.position} players have recorded snaps in these five weeks.</p>}
   {players.length>6&&<button className="usage-share-more" onClick={()=>setChoice(old=>({...old,expanded:!old.expanded}))}>{choice.expanded?'Show top 6 only':`+${players.length-6} more on the depth chart`}</button>}
   <p className="usage-share-footnote">Shade is relative to each stat block's max (shown in the header); the week leader is bold; — is a gap, never zero. Click a name to focus that player.</p>
  </>}
 </section>;
}
