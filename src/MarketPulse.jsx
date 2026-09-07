import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowClockwise, ArrowDown, ArrowUp, ChartLineUp, DownloadSimple, MagnifyingGlass, Star, X } from '@phosphor-icons/react';
import './MarketPulse.css';

const KEY='bowser:market-pulse:v1';
const nf=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const fmt=value=>value==null?'—':nf.format(value);
const pct=value=>value==null?'—':`${value.toFixed(1)}%`;
const stamp=value=>value?new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not refreshed yet';
const time=value=>new Date(value).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
function preferences() {try{const p=JSON.parse(localStorage.getItem(KEY));return p&&typeof p==='object'?p:{};}catch{return {};}}
export function csvFor(rows, data) {
  const escape=value=>`"${(typeof value==='string'?value.replace(/^[\s]*[=+@-]/,"'$&"):String(value??'')).replaceAll('"','""')}"`;
  return [['Provider','Window','Captured at','Player','Position','Team','Adds','Drops','Net','Add share %','Roster %','Start %','Roster change pp'],...rows.map(p=>[data.provider,data.window,new Date(data.capturedAt).toISOString(),p.name,p.position,p.team,p.adds,p.drops,p.net,p.addShare,p.rosterPct,p.startPct,p.rosterDelta])].map(row=>row.map(escape).join(',')).join('\r\n');
}
function Balance({row}) {
  if(row.addShare==null)return <span className="mp-unknown" title="Both add and drop counts are needed. Missing from a top list does not mean zero.">Incomplete coverage</span>;
  return <div className="mp-balance" aria-label={`${pct(row.addShare)} adds; ${pct(100-row.addShare)} drops`}><div className="mp-ratio"><i style={{width:`${row.addShare}%`}}/><b style={{width:`${100-row.addShare}%`}}/></div><span>{Math.round(row.addShare)}% adds</span></div>;
}
function History({data,player}) {
  const metric=data.provider==='sleeper'?'adds':'rosterPct';
  const observations=data.history.map(h=>({at:h.capturedAt,value:h.rows.find(r=>r.id===player.id)?.[metric]??null}));
  const present=observations.filter(p=>p.value!==null);
  const max=metric==='rosterPct'?100:Math.max(1,...present.map(p=>p.value));
  return <section className="mp-history" aria-label="Player snapshot history"><h3>Observed {metric==='adds'?'add counts':'roster percentage'}</h3><p>{observations.length} saved observation{observations.length===1?'':'s'} · {data.provider==='sleeper'?`rolling ${data.window}-hour windows`:'provider snapshots'}</p>
    {present.length<2?<div className="mp-history-empty">History starts here.<small>Another uncached refresh will add a point. We never invent past activity.</small></div>:<div className="mp-history-bars">{observations.slice(-16).map(p=><div key={p.at} title={`${stamp(p.at)}: ${p.value==null?'Not in returned sample':metric==='adds'?fmt(p.value):pct(p.value)}`}><span>{p.value==null?'—':metric==='adds'?fmt(p.value):pct(p.value)}</span><i style={{height:p.value==null?0:`${Math.max(2,p.value/max*92)}px`}}/><small>{time(p.at)}</small></div>)}</div>}
    <details><summary>Exact observations</summary><div className="mp-observations">{observations.slice().reverse().map(p=><div key={p.at}><time>{stamp(p.at)}</time><strong>{p.value==null?'Not in sample':metric==='adds'?fmt(p.value):pct(p.value)}</strong></div>)}</div></details>
    <p className="mp-footnote">Capture times use your local timezone. Overlapping windows are not additive. Bars use a zero baseline.</p>
  </section>;
}
export function MarketPulse() {
  const saved=useMemo(preferences,[]);
  const [provider,setProvider]=useState(saved.provider==='espn'?'espn':'sleeper');
  const [hours,setHours]=useState([6,24,72].includes(saved.hours)?saved.hours:24);
  const [position,setPosition]=useState(['All','QB','RB','WR','TE','K','DEF'].includes(saved.position)?saved.position:'All');
  const [search,setSearch]=useState(''); const [team,setTeam]=useState('All');
  const [watch,setWatch]=useState(Array.isArray(saved.watch)?saved.watch.filter(x=>typeof x==='string').slice(0,1000):[]);
  const [watchOnly,setWatchOnly]=useState(false);
  const [sort,setSort]=useState({key:'adds',desc:true});
  const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [selected,setSelected]=useState(null),[limit,setLimit]=useState(100);
  const request=useRef({id:0,controller:null});
  useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify({provider,hours,position,watch}));}catch{/* Browsing remains usable without storage. */}},[provider,hours,position,watch]);
  async function load(refresh=false) {
    request.current.controller?.abort();
    const id=++request.current.id,controller=new AbortController();request.current.controller=controller;
    setBusy(true);setError('');setNotice('');
    try {
      const response=await fetch(`/api/v1/market-pulse?provider=${provider}&hours=${hours}`,{method:refresh?'POST':'GET',headers:refresh?{'x-bowser-refresh':'1'}:{},signal:controller.signal});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || `Request failed (${response.status})`);
      if(id!==request.current.id)return;
      setData(body);
      if(refresh)setNotice(body.error?'Refresh failed; last successful data retained.':body.cached?'Using the saved snapshot within the refresh cooldown.':'New provider snapshot saved.');
    }catch(e){if(e.name!=='AbortError'&&id===request.current.id)setError(e.message || 'Unable to load Market Pulse.');}
    finally{if(id===request.current.id)setBusy(false);}
  }
  useEffect(()=>{
    setData(null);setSelected(null);setTeam('All');setLimit(100);setSort({key:provider==='sleeper'?'adds':'rosterPct',desc:true});load();
    return ()=>{request.current.id++;request.current.controller?.abort();};
  },[provider,hours]);
  const rows=useMemo(()=>{
    const filtered=(data?.rows||[]).filter(r=>(position==='All'||r.position===position)&&(team==='All'||r.team===team)&&(!watchOnly||watch.includes(r.id))&&`${r.name} ${r.team}`.toLowerCase().includes(search.toLowerCase()));
    return filtered.sort((a,b)=>{const x=a[sort.key],y=b[sort.key];if(x==null&&y==null)return a.name.localeCompare(b.name);if(x==null)return 1;if(y==null)return -1;const comparison=typeof x==='string'?x.localeCompare(y):x-y;return (sort.desc?-comparison:comparison)||a.name.localeCompare(b.name);});
  },[data,position,team,watchOnly,watch,search,sort]);
  const teams=[...new Set((data?.rows||[]).map(r=>r.team))].sort();
  const player=data?.rows.find(r=>r.id===selected);
  const sleeper=provider==='sleeper';
  const maxAdds=Math.max(1,...rows.map(r=>r.adds??0));
  const leader=(data?.rows||[]).filter(r=>r[sleeper?'adds':'rosterPct']!=null).sort((a,b)=>b[sleeper?'adds':'rosterPct']-a[sleeper?'adds':'rosterPct'])[0];
  const toggleWatch=id=>setWatch(old=>old.includes(id)?old.filter(p=>p!==id):[...old,id]);
  function header(label,key){return <th scope="col" aria-sort={sort.key===key?(sort.desc?'descending':'ascending'):'none'}><button onClick={()=>setSort(old=>({key,desc:old.key===key?!old.desc:true}))}>{label}{sort.key===key?(sort.desc?<ArrowDown/>:<ArrowUp/>):null}</button></th>;}
  function download(){const url=URL.createObjectURL(new Blob([csvFor(rows,data)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`bowser-market-${provider}-${data.window}.csv`;a.click();URL.revokeObjectURL(url);}
  return <main className="page-content market-pulse">
    <header className="mp-heading"><div><div className="mp-eyebrow"><ChartLineUp weight="bold"/> MARKET INTELLIGENCE <span>RESEARCH PROTOTYPE</span></div><h1>Market Pulse</h1><p>See where fantasy managers are moving. Keep each source in context.</p></div><div className="mp-actions"><button onClick={download} disabled={!rows.length}><DownloadSimple/> Export CSV</button><button className="mp-primary" onClick={()=>load(true)} disabled={busy}><ArrowClockwise className={busy?'mp-spin':''}/>{busy?'Loading…':'Refresh data'}</button></div></header>
    <section className="mp-source-band" aria-label="Data source"><div className="mp-source-buttons"><button aria-pressed={sleeper} onClick={()=>setProvider('sleeper')}><strong>Sleeper</strong><span>Adds & drops</span></button><button aria-pressed={!sleeper} onClick={()=>setProvider('espn')}><strong>ESPN <small>EXPERIMENTAL</small></strong><span>Roster & start rates</span></button></div><div className="mp-window"><label htmlFor="mp-window">Observation window</label>{sleeper?<select id="mp-window" value={hours} onChange={e=>setHours(Number(e.target.value))}><option value={6}>Past 6 hours</option><option value={24}>Past 24 hours</option><option value={72}>Past 72 hours</option></select>:<strong>Current provider snapshot</strong>}</div><div className="mp-freshness"><span className={`mp-dot${data?.stale?' stale':''}`}/><div><strong>{data?.capturedAt?(data.stale?'Saved snapshot · refresh available':'Snapshot available'):'Awaiting first refresh'}</strong><small>{stamp(data?.capturedAt)}</small></div></div></section>
    {(error||data?.error)&&<div className="mp-alert" role="alert">{error||data.error} {data?.capturedAt?'Your last successful snapshot is still shown.':'No data has been substituted.'}</div>}
    <p className="mp-status" role="status">{notice||(!sleeper?'Experimental public endpoint · may change without notice. Percentages are not add/drop counts.':'Top 500 per direction requested · missing counts mean unknown, not zero.')}</p>
    <section className="mp-summary" aria-label="Snapshot summary"><div><span>PLAYERS OBSERVED</span><strong>{fmt(data?.rows.length??0)}</strong><small>{sleeper?'Union of returned add and drop lists':'Returned ownership sample'}</small></div><div><span>{sleeper?'MOST ADDED IN SAMPLE':'HIGHEST ROSTER % IN SAMPLE'}</span><strong>{leader?.name||'—'}</strong><small>{leader?(sleeper?`${fmt(leader.adds)} adds · ${hours}h`:`${pct(leader.rosterPct)} rostered`):'Refresh to collect a snapshot'}</small></div><div><span>SAVED OBSERVATIONS</span><strong>{data?.history.length??0}<em> / 96</em></strong><small>Separate history for each source & window</small></div></section>
    <section className="mp-workspace"><div className="mp-toolbar"><label className="mp-search"><MagnifyingGlass/><input aria-label="Find player or team" placeholder="Find player or team…" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Position<select value={position} onChange={e=>setPosition(e.target.value)}>{['All','QB','RB','WR','TE','K','DEF'].map(p=><option key={p}>{p}</option>)}</select></label><label>Team<select value={team} onChange={e=>setTeam(e.target.value)}><option>All</option>{teams.map(t=><option key={t}>{t}</option>)}</select></label><button aria-pressed={watchOnly} onClick={()=>setWatchOnly(v=>!v)}><Star weight={watchOnly?'fill':'regular'}/> Watchlist</button></div>
    <div className={`mp-analysis-grid${player?' with-detail':''}`}><div className="mp-table-region"><div className="mp-table-caption"><h2>{sleeper?'Transaction activity':'Ownership monitor'}</h2><span>{rows.length} matching · select a player to inspect history</span></div><div className="mp-table-scroll"><table><caption className="sr-only">{provider} player popularity metrics</caption><thead><tr><th scope="col"><Star aria-label="Watchlist"/></th>{header('Player','name')}{header('Pos','position')}{sleeper?<>{header('Adds','adds')}{header('Drops','drops')}{header('Net','net')}{header('Add / drop balance','addShare')}</>:<>{header('Roster %','rosterPct')}{header('Start %','startPct')}{header('Change · pp','rosterDelta')}</>}</tr></thead><tbody>{rows.slice(0,limit).map(row=><tr key={row.id} className={row.id===selected?'selected':''}><td><button className="mp-star" aria-label={`${watch.includes(row.id)?'Unwatch':'Watch'} ${row.name}`} aria-pressed={watch.includes(row.id)} onClick={()=>toggleWatch(row.id)}><Star weight={watch.includes(row.id)?'fill':'regular'}/></button></td><th scope="row"><button className="mp-player" aria-expanded={selected===row.id} onClick={()=>setSelected(selected===row.id?null:row.id)}>{row.name}<small>{row.team} · {provider==='sleeper'?'Sleeper':'ESPN'}</small></button></th><td>{row.position}</td>{sleeper?<><td className="mp-positive"><div className="mp-count">{fmt(row.adds)}{row.adds!=null&&<i style={{width:`${row.adds/maxAdds*100}%`}}/>}</div></td><td className="mp-negative">{fmt(row.drops)}</td><td className={row.net==null?'':row.net>=0?'mp-positive':'mp-negative'}>{row.net>0?'+':''}{fmt(row.net)}</td><td><Balance row={row}/></td></>:<><td className="mp-positive">{pct(row.rosterPct)}</td><td>{pct(row.startPct)}</td><td title={data.previousAt?`Percentage-point change since ${stamp(data.previousAt)}`:'A second observation is needed'}>{row.rosterDelta==null?'—':`${row.rosterDelta>0?'+':''}${row.rosterDelta.toFixed(2)}`}</td></>}</tr>)}</tbody></table></div>
      {!rows.length&&<div className="mp-empty"><ChartLineUp/><h3>{busy?'Loading snapshot…':data?.capturedAt?'No matching players':'Start your market history'}</h3><p>{data?.capturedAt?'Adjust the search, position, team or watchlist filter.':'Refresh data to retrieve a real provider snapshot. No account or token is required.'}</p>{!data?.capturedAt&&!busy&&<button className="mp-primary" onClick={()=>load(true)}>Refresh data</button>}</div>}
      {rows.length>limit&&<button className="mp-more" onClick={()=>setLimit(n=>n+100)}>Show 100 more · {rows.length-limit} remaining</button>}
    </div>{player&&<aside className="mp-detail" aria-label={`${player.name} details`}><div className="mp-detail-heading"><div><span>PLAYER INSPECTOR</span><h2>{player.name}</h2><p>{player.team} · {player.position}</p></div><button aria-label="Close player details" onClick={()=>setSelected(null)}><X/></button></div><dl><div><dt>{sleeper?'Adds':'Rostered'}</dt><dd className="mp-positive">{sleeper?fmt(player.adds):pct(player.rosterPct)}</dd></div><div><dt>{sleeper?'Drops':'Started'}</dt><dd>{sleeper?fmt(player.drops):pct(player.startPct)}</dd></div></dl>{sleeper&&<Balance row={player}/>}<History data={data} player={player}/><div className="mp-context"><strong>Read this as a market signal</strong><p>{sleeper?'Adds indicate transaction interest, not a recommendation or availability in your league. High adds and drops together can indicate churn.':'A low roster rate describes ESPN’s reported market, not whether this player is available in your Yahoo leagues.'}</p></div></aside>}</div></section>
    <footer className="mp-method"><details><summary>How to read these numbers & refresh limits</summary><p>Sleeper: counts from the returned trending lists; a dash means not reported. Net = adds − drops. Add share = adds ÷ (adds + drops), only when both are known. Green/red segments show that ratio, not roster percentage. The faint adds bar is scaled to the largest count in the filtered sample.</p><p>ESPN: reported roster/start percentages. Change is the percentage-point difference from our previous snapshot ({stamp(data?.previousAt)}), not a standardized daily change. Source populations, scoring formats and reporting windows are not interchangeable.</p><p>Refreshes are cached for 15 minutes; failures cool down for one minute. Player identities are cached daily. No background job runs. Keep up to 96 snapshots per source/window. History reflects capture time and cannot be summed across overlapping windows. Watchlists stay in this browser; snapshots stay on this machine.</p><p>Local personal research only. No Yahoo credentials or private league data are accessed. Commercial use and public redistribution need separate provider review.</p><a href="https://docs.sleeper.com/" target="_blank" rel="noreferrer">Sleeper API documentation ↗</a> · <a href="https://fantasy.espn.com/football/players/add" target="_blank" rel="noreferrer">ESPN Fantasy ↗</a></details><span>Data: {sleeper?'Sleeper':'ESPN'} · {stamp(data?.capturedAt)} · Personal research</span></footer>
  </main>;
}
