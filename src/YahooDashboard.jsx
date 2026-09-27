import { useEffect, useMemo, useRef, useState } from 'react';
import './YahooDashboard.css';
const fmt = n => n == null ? '—' : Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
const benchSlots = new Set(['BN','IR','IR+','IL','IL+','NA']);
const record = t => t?.wins == null ? '—' : `${t.wins}–${t.losses ?? '—'}–${t.ties ?? '—'}`;
const ownMatch = d => d?.scoreboard?.matchups.find(m=>m.teams.some(t=>t.key===d.teamKey));
export async function yahooRequest(action,options={}) {
  const res=await fetch(`/api/v1/auth/yahoo/${action}`,{credentials:'same-origin',cache:'no-store',...options});
  const data=await res.json();
  if(!res.ok) {const error=new Error(data.error?.message || 'Yahoo could not load this view.');error.code=data.error?.code;throw error;}
  return data;
}
function DataTable({label,columns,rows,initial='rank'}) {
  const [sort,setSort]=useState({key:initial,dir:1});
  const [widths,setWidths]=useState({});
  const ordered=useMemo(()=>[...rows].sort((a,b)=>{const x=a[sort.key],y=b[sort.key];if(x==null||x==='')return y==null||y===''?0:1;if(y==null||y==='')return -1;return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true}))*sort.dir;}),[rows,sort]);
  const resize=(event,key,width)=>{event.preventDefault();const el=event.currentTarget,x=event.clientX;el.setPointerCapture(event.pointerId);const move=e=>setWidths(v=>({...v,[key]:Math.max(70,Math.min(460,width+e.clientX-x))}));const end=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);el.removeEventListener('pointercancel',end);};el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);};
  return <div className="yd-table-scroll" tabIndex={0} role="region" aria-label={`${label} table`}><table><caption>{label}</caption><colgroup>{columns.map(c=><col key={c.key} style={{width:widths[c.key]||c.width||110}}/>)}</colgroup><thead><tr>{columns.map(c=><th key={c.key} aria-sort={sort.key===c.key?(sort.dir===1?'ascending':'descending'):'none'}><button onClick={()=>setSort(v=>({key:c.key,dir:v.key===c.key?-v.dir:1}))}>{c.label}{sort.key===c.key?(sort.dir===1?' ↑':' ↓'):''}</button><span role="separator" tabIndex={0} aria-label={`Resize ${c.label}`} aria-orientation="vertical" aria-valuemin={70} aria-valuemax={460} aria-valuenow={widths[c.key]||c.width||110} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setWidths(v=>({...v,[c.key]:Math.max(70,Math.min(460,(v[c.key]||c.width||110)+(e.key==='ArrowRight'?10:-10)))}));}}} onPointerDown={e=>resize(e,c.key,widths[c.key]||c.width||110)}/></th>)}</tr></thead><tbody>{ordered.map(r=><tr key={r.key} className={r.mine?'yd-mine':''}>{columns.map(c=><td key={c.key} className={c.numeric?'yd-number':''}>{c.render?c.render(r):r[c.key]??'—'}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="yd-empty">No records returned for this selection.</p>}</div>;
}
export function YahooDashboard({account,season,onOpenPlayer,reload=0}) {
  const [selected,setSelected]=useState(account.teams[0]?.key||'');
  const [week,setWeek]=useState('current');
  const [view,setView]=useState('lineup');
  const [lineupFilter,setLineupFilter]=useState('all');
  const [search,setSearch]=useState('');
  const [snapshots,setSnapshots]=useState({});
  const [failures,setFailures]=useState({});
  const [loading,setLoading]=useState(false);
  const revision=useRef(0);
  useEffect(()=>{
    let stopped=false;const id=++revision.current;
    setSnapshots({});setFailures({});setLoading(true);
    (async()=>{
      // One team at a time bounds Yahoo calls and cookie refresh races.
      for(const team of account.teams){
        if(stopped)break;
        try {const d=await yahooRequest(`dashboard?${new URLSearchParams({season,team:team.key,week})}`);if(!stopped&&id===revision.current)setSnapshots(v=>({...v,[team.key]:d}));}
        catch(e){if(!stopped&&id===revision.current)setFailures(v=>({...v,[team.key]:e.message}));if(['not_connected','authorization_expired','fantasy_access_denied','rate_limited'].includes(e.code))break;}
      }
      if(!stopped&&id===revision.current)setLoading(false);
    })();return()=>{stopped=true;revision.current++;};
  },[account,season,week,reload]);
  const data=snapshots[selected], team=account.teams.find(t=>t.key===selected), league=account.leagues.find(l=>l.key===team?.leagueKey);
  const players=data?.roster?.players||[];
  const visible=players.filter(p=>(lineupFilter==='all'||(lineupFilter==='starters'?!benchSlots.has(p.slot):benchSlots.has(p.slot)))&&`${p.name} ${p.team} ${p.position}`.toLowerCase().includes(search.toLowerCase()));
  const concerns=players.filter(p=>!benchSlots.has(p.slot)&&((p.status&&/^(O|IR|D|Q|SUSP|PUP)/i.test(p.status))||p.byeWeek===data?.week));
  const emptySlots=data?.roster&&data?.settings?.rosterPositions.filter(p=>!benchSlots.has(p.position)&&p.count!=null).flatMap(p=>{const missing=p.count-players.filter(x=>x.slot===p.position).length;return missing>0?[`${missing} ${p.position}`]:[];})||[];
  const playerName=p=><button className="yd-player" onClick={e=>onOpenPlayer?.({...p,season},e.currentTarget)} disabled={!onOpenPlayer}>{p.name}</button>;
  const lineColumns=[{key:'slot',label:'Slot',width:80},{key:'name',label:'Player',width:230,render:playerName},{key:'position',label:'Pos',width:90},{key:'team',label:'NFL',width:80},{key:'status',label:'Status',width:100,render:p=><span title={p.statusDetail}>{p.status||'—'}</span>},{key:'byeWeek',label:'Bye',width:75,numeric:true},{key:'points',label:`Yahoo W${data?.week??'—'} pts`,width:145,numeric:true,render:p=>fmt(p.points)}];
  const standingColumns=[{key:'rank',label:'Rank',width:80,numeric:true},{key:'name',label:'Team',width:240,render:t=><span>{t.name}{t.mine&&<small className="yd-you">YOU</small>}</span>},{key:'wins',label:'W',width:70,numeric:true},{key:'losses',label:'L',width:70,numeric:true},{key:'ties',label:'T',width:70,numeric:true},{key:'pointsFor',label:'Points for',width:130,numeric:true,render:t=>fmt(t.pointsFor)},{key:'pointsAgainst',label:'Points against',width:145,numeric:true,render:t=>fmt(t.pointsAgainst)},{key:'waiverPriority',label:'Waiver',width:95,numeric:true},{key:'faabBalance',label:'FAAB left',width:115,numeric:true,render:t=>fmt(t.faabBalance)},{key:'moves',label:'Moves',width:95,numeric:true}];
  return <section className="yahoo-dashboard" aria-label="Yahoo fantasy dashboard">
    <div className="yd-overview-heading"><h2>My teams</h2><span>{account.teams.length} teams · {account.leagues.length} leagues</span>{loading&&<span role="status">Loading Yahoo team data…</span>}</div>
    {!account.teams.length&&<p className="yd-empty">No owned NFL teams were returned for {season}. Switch the Yahoo account or season in settings.</p>}
    <div className="yd-teams">{account.teams.map(t=>{
      const d=snapshots[t.key],l=account.leagues.find(x=>x.key===t.leagueKey),s=d?.standings?.find(x=>x.key===t.key),m=ownMatch(d),me=m?.teams.find(x=>x.key===t.key),opp=m?.teams.find(x=>x.key!==t.key);
      return <button className="yd-team" key={t.key} aria-pressed={selected===t.key} onClick={()=>{setSelected(t.key);setSearch('');}}><span className="yd-team-league">{l?.name||'Yahoo league'}</span><strong>{t.name}</strong><span className="yd-team-record">Rank {fmt(s?.rank)} <span>·</span> {record(s)}</span><span className="yd-score"><b>{fmt(me?.points)}</b><span>–</span><b>{fmt(opp?.points)}</b></span><span className="yd-team-opponent">{opp?`vs ${opp.name}`:d?.scoreboard?'No head-to-head matchup returned':failures[t.key]?'Unable to load · retry refresh':loading?'Loading matchup…':'Matchup unavailable'}</span><span className="yd-team-meta">{d?`Week ${d.week}`:'—'} · {m?.status||'—'} · Yahoo projection {fmt(me?.projected)}</span></button>;
    })}</div>
    {team&&<>
      <div className="yd-workspace-bar"><div><h2>{team.name}</h2><p>{league?.name} · {season} · {league?.scoring||'Yahoo scoring'} · points use this league’s settings</p></div><label>Week<select value={week} onChange={e=>setWeek(e.target.value)}><option value="current">Current in each league</option>{Array.from({length:18},(_,i)=><option key={i+1} value={i+1}>Week {i+1}</option>)}</select></label><a href={`https://football.fantasysports.yahoo.com/${season}/f1/${team.key.split('.l.')[1]?.replace('.t.','/')}`} target="_blank" rel="noreferrer">Open team in Yahoo ↗</a></div>
      <div className="yd-tabs" role="tablist" aria-label="Team dashboard views">{[['lineup','Lineup'],['standings','Standings'],['matchups','Matchups']].map(([key,label])=><button role="tab" id={`yd-tab-${key}`} aria-controls={`yd-panel-${key}`} aria-selected={view===key} key={key} onClick={()=>setView(key)}>{label}</button>)}</div>
      {failures[selected]&&<p role="alert" className="yahoo-notice">{failures[selected]}</p>}
      {!data&&!failures[selected]&&<p className="yd-empty">{loading?'Loading this team…':'Team data unavailable. Refresh to retry.'}</p>}
      {data&&<div role="tabpanel" id={`yd-panel-${view}`} aria-labelledby={`yd-tab-${view}`}>
        <div className="yd-context"><span>{view==='standings'?'Current season standings':`Week ${data.week}`}</span><span>Retrieved {new Date(data.checkedAt).toLocaleString()}</span></div>
        {view==='lineup'&&<>
          {(concerns.length>0||emptySlots.length>0)&&<div className="yd-attention"><strong>Lineup check</strong>{emptySlots.length>0&&<span>Unfilled: {emptySlots.join(', ')}</span>}{concerns.map(p=><span key={p.key}>{p.name}: {p.byeWeek===data.week?'bye week':p.statusDetail||p.status}</span>)}</div>}
          <div className="yd-lineup-tools"><label>Players<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search lineup"/></label><label>Roster view<select value={lineupFilter} onChange={e=>setLineupFilter(e.target.value)}><option value="all">All slots</option><option value="starters">Starters</option><option value="bench">Bench & reserve</option></select></label><span>{players.filter(p=>!benchSlots.has(p.slot)).length} starters · {players.filter(p=>benchSlots.has(p.slot)).length} bench / reserve</span></div>
          {data.warnings?.roster&&<p role="status">{data.warnings.roster}</p>}
          {data.errors?.roster?<p role="alert">{data.errors?.roster}</p>:<DataTable key={`lineup-${selected}`} label={`${team.name} · Week ${data.week} lineup`} columns={lineColumns} rows={visible.map((p,i)=>({...p,order:i}))} initial="order"/>}
          <p className="yd-footnote">Yahoo points use this league’s scoring. Player cards show Bowser’s separately labeled scoring. “—” means Yahoo did not return a value.</p>
        </>}
        {view==='standings'&&(data.errors?.standings?<p role="alert">{data.errors?.standings}</p>:<DataTable key={`standings-${selected}`} label={`${league?.name} · current standings`} columns={standingColumns} rows={(data.standings||[]).map(t=>({...t,mine:account.teams.some(owned=>owned.key===t.key)}))}/>)}
        {view==='matchups'&&(data.errors?.scoreboard?<p role="alert">{data.errors?.scoreboard}</p>:<div className="yd-matchups">{data.scoreboard?.matchups.map((m,i)=><article key={i} className={`yd-matchup ${m.teams.some(t=>t.key===selected)?'yd-matchup-mine':''}`}><header><span>Week {m.week} · {m.status||'Status unavailable'}</span><span>{m.tied?'Tie':m.playoffs?'Playoffs':''}</span></header>{m.teams.map(t=><div className="yd-matchup-team" key={t.key}><span>{t.name}{t.key===selected&&<small className="yd-you">YOU</small>}{m.winnerKey===t.key&&<small className="yd-you">WIN</small>}</span><strong>{fmt(t.points)}</strong><small>Proj {fmt(t.projected)}</small></div>)}</article>)}{!data.scoreboard?.matchups.length&&<p>No head-to-head matchups returned for this week.</p>}</div>)}
      </div>}
    </>}
  </section>;
}
