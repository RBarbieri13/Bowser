import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowClockwise, ArrowDown, ArrowUp, ChartLineUp, DownloadSimple, MagnifyingGlass, Star, X } from '@phosphor-icons/react';
import { combineMarketRows, isWatched, sortMarketRows } from './marketPulseRows.js';
import './MarketPulse.css';
import { mergeSnapshot, readSnapshot, saveSnapshot } from './marketPulseStorage.js';

const KEY='bowser:market-pulse:v1';
const nf=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const fmt=value=>value==null?'—':nf.format(value);
const pct=value=>value==null?'—':`${value.toFixed(1)}%`;
const stamp=value=>value?new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not refreshed yet';
const time=value=>new Date(value).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
function preferences() {try{const p=JSON.parse(localStorage.getItem(KEY));return p&&typeof p==='object'?p:{};}catch{return {};}}
export function csvFor(rows, snapshots) {
  const escape = value => `"${(typeof value === 'string' ? value.replace(/^[\s]*[=+@-]/, "'$&") : String(value ?? '')).replaceAll('"', '""')}"`;
  const iso = value => value ? new Date(value).toISOString() : '';
  return [
    ['Player','Position','Team','Sleeper ID','ESPN ID','Identity match','Sleeper window','Sleeper captured at','ESPN captured at','Adds','Drops','Net','Add share %','Roster %','Start %','Roster change pp','ESPN previous at'],
    ...rows.map(p => [p.name,p.position,p.team,p.sleeperId,p.espnId,p.match,snapshots.sleeper?.window,iso(snapshots.sleeper?.capturedAt),iso(snapshots.espn?.capturedAt),p.adds,p.drops,p.net,p.addShare,p.rosterPct,p.startPct,p.rosterDelta,iso(snapshots.espn?.previousAt)])
  ].map(row => row.map(escape).join(',')).join('\r\n');
}
function Balance({row}) {
  if(row.addShare==null)return <span className="mp-unknown" title="Both add and drop counts are needed. Missing from a top list does not mean zero.">—</span>;
  return <div className="mp-balance" aria-label={`${pct(row.addShare)} adds; ${pct(100-row.addShare)} drops`}><div className="mp-ratio"><i style={{width:`${row.addShare}%`}}/><b style={{width:`${100-row.addShare}%`}}/></div><span>{Math.round(row.addShare)}% adds</span></div>;
}
function History({data,player}) {
  const metric=data.provider==='sleeper'?'adds':'rosterPct';
  const observations=(data.history || []).map(h=>({at:h.capturedAt,value:h.rows.find(r=>r.id===player.id)?.[metric]??null}));
  const present=observations.filter(p=>p.value!==null);
  const max=metric==='rosterPct'?100:Math.max(1,...present.map(p=>p.value));
  return <section className="mp-history" aria-label="Player snapshot history"><h3>Observed {metric==='adds'?'add counts':'roster percentage'}</h3><p>{observations.length} saved observation{observations.length===1?'':'s'} · {data.provider==='sleeper'?`rolling ${data.window}-hour windows`:'provider snapshots'}</p>
    {present.length<2?<div className="mp-history-empty">History starts here.<small>Another uncached refresh will add a point. We never invent past activity.</small></div>:<div className="mp-history-bars">{observations.slice(-16).map(p=><div key={p.at} title={`${stamp(p.at)}: ${p.value==null?'Not in returned sample':metric==='adds'?fmt(p.value):pct(p.value)}`}><span>{p.value==null?'—':metric==='adds'?fmt(p.value):pct(p.value)}</span><i style={{height:p.value==null?0:`${Math.max(2,p.value/max*92)}px`}}/><small>{time(p.at)}</small></div>)}</div>}
    <details><summary>Exact observations</summary><div className="mp-observations">{observations.slice().reverse().map(p=><div key={p.at}><time>{stamp(p.at)}</time><strong>{p.value==null?'Not in sample':metric==='adds'?fmt(p.value):pct(p.value)}</strong></div>)}</div></details>
    <p className="mp-footnote">Capture times use your local timezone. Overlapping windows are not additive. Bars use a zero baseline.</p>
  </section>;
}

const SOURCES = ['sleeper', 'espn'];
const COLUMNS = [
  ['watch','Watchlist',32], ['name','Player',150], ['team','Team',44], ['position','Pos',36],
  ['adds','Adds',68], ['drops','Drops',68], ['net','Net',80], ['addShare','Add / drop',92],
  ['rosterPct','Roster %',76], ['startPct','Start %',70], ['rosterDelta','Δ Ros · pp',84],
];
export function MarketPulse() {
  const saved = useMemo(preferences, []);
  const [hours,setHours] = useState([6,24,72].includes(saved.hours) ? saved.hours : 24);
  const [position,setPosition] = useState(['All','QB','RB','WR','TE','K','DEF'].includes(saved.position) ? saved.position : 'All');
  const [search,setSearch] = useState(''), [team,setTeam] = useState('All');
  const [watch,setWatch] = useState(Array.isArray(saved.watch) ? saved.watch.filter(x=>typeof x==='string').slice(0,1000) : []);
  const [watchOnly,setWatchOnly] = useState(false);
  const [sort,setSort] = useState(COLUMNS.some(([key])=>key===saved.sort?.key) && typeof saved.sort.desc==='boolean' ? saved.sort : {key:'adds',desc:true});
  const [snapshots,setSnapshots] = useState({});
  const [busy,setBusy] = useState(false), [errors,setErrors] = useState({}), [notice,setNotice] = useState('');
  const [selected,setSelected] = useState(null), [limit,setLimit] = useState(100);
  const request = useRef({id:0,controller:null});
  useEffect(()=>{
    try { localStorage.setItem(KEY,JSON.stringify({hours,position,watch,sort})); } catch { /* Storage is optional. */ }
  },[hours,position,watch,sort]);
  async function load(refresh=false) {
    request.current.controller?.abort();
    const id=++request.current.id, controller=new AbortController();
    request.current.controller=controller;
    setBusy(true); setErrors({}); setNotice('');
    const results = await Promise.all(SOURCES.map(async provider=>{
      const expectedWindow=provider==='espn'?'current':String(hours);
      let savedSnapshot=snapshots[provider]?.window===expectedWindow?snapshots[provider]:null;
      try {
        try {
          const stored=await readSnapshot(provider,hours);
          if(stored) savedSnapshot=mergeSnapshot(savedSnapshot,stored);
        } catch { /* Live refresh still works when site storage is blocked. */ }
        if(refresh && savedSnapshot?.capturedAt && Date.now()<savedSnapshot.nextRefreshAt && !savedSnapshot.error)
          return {provider,body:{...savedSnapshot,cached:true}};
        const response=await fetch(`/api/v1/market-pulse?provider=${provider}&hours=${hours}`,{
          method:refresh?'POST':'GET',headers:refresh?{'x-bowser-refresh':'1'}:{},signal:controller.signal,
        });
        const body=await response.json();
        if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
        if (body.provider!==provider || !Array.isArray(body.rows)) throw new Error('Unexpected provider response.');
        let merged=mergeSnapshot(savedSnapshot || snapshots[provider],body);
        try { merged=await saveSnapshot(merged); }
        catch { merged={...merged,storageError:'Browser history could not be saved. Enable site storage to keep snapshots after closing this page.'}; }
        return {provider,body:merged};
      } catch (error) { return {provider,body:savedSnapshot,error:error.message || 'Unable to load this source.'}; }
    }));
    if (id!==request.current.id) return;
    // Each source keeps its own last-good snapshot, timestamp and error.
    setSnapshots(previous=>{
      const next={...previous};
      results.forEach(({provider,body})=>{ if(body) next[provider]=body; });
      return next;
    });
    setErrors(Object.fromEntries(results.filter(r=>r.error||r.body?.error||r.body?.storageError).map(r=>[r.provider,r.error||r.body.error||r.body.storageError])));
    if(refresh) {
      const good=results.filter(r=>r.body&&!r.error&&!r.body.error);
      setNotice(good.length===2
        ? good.every(r=>r.body.cached) ? 'Both sources are within the 15-minute refresh cooldown.' : 'Both sources refreshed. Capture times are shown above.'
        : 'Refresh incomplete. Available source data remains visible; retry Refresh data.');
    }
    setBusy(false);
  }
  useEffect(()=>{
    // Never relabel a previous Sleeper window as the newly selected one.
    setSnapshots(previous=>({espn:previous.espn}));
    setSelected(null); setLimit(100); load();
    return ()=>{request.current.id++;request.current.controller?.abort();};
  },[hours]);
  const combined=useMemo(()=>combineMarketRows(
    snapshots.sleeper?.window===String(hours)?snapshots.sleeper.rows:[],snapshots.espn?.rows||[]
  ),[snapshots,hours]);
  const rows=useMemo(()=>sortMarketRows(combined.filter(r=>
    (position==='All'||r.position===position)&&(team==='All'||r.team===team)&&
    (!watchOnly||isWatched(r,watch))&&`${r.name} ${r.team}`.toLowerCase().includes(search.toLowerCase())
  ),sort,watch),[combined,position,team,watchOnly,watch,search,sort]);
  const teams=[...new Set(combined.map(r=>r.team))].sort();
  const player=combined.find(r=>r.aliases.includes(selected));
  const hasSnapshot=SOURCES.some(source=>snapshots[source]?.capturedAt);
  const toggleWatch=row=>setWatch(old=>isWatched(row,old)?old.filter(id=>!row.aliases.includes(id)):[...old,row.id]);
  function header([key,label]) {
    const active=sort.key===key;
    return <th key={key} scope="col" aria-sort={active?(sort.desc?'descending':'ascending'):'none'}>
      <button aria-label={key==='watch'?'Sort by watchlist':label}
        title={key==='rosterDelta'?'ESPN roster percentage-point change since previous saved snapshot':`Sort by ${label}`}
        onClick={()=>setSort(old=>({key,desc:old.key===key?!old.desc:!['name','team','position'].includes(key)}))}>
        {key==='watch'?<Star aria-hidden="true"/>:label}
        {active?(sort.desc?<ArrowDown aria-hidden="true"/>:<ArrowUp aria-hidden="true"/>):<span className="mp-sort-hint" aria-hidden="true">↕</span>}
      </button>
    </th>;
  }
  function download() {
    const url=URL.createObjectURL(new Blob([csvFor(rows,snapshots)],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`bowser-market-combined-${hours}h.csv`;a.click();URL.revokeObjectURL(url);
  }
  return <main className="page-content market-pulse">
    <header className="mp-heading">
      <div><h1>Market Pulse</h1><p>Sleeper transactions + ESPN ownership, side by side.</p></div>
      <div className="mp-actions"><button onClick={download} disabled={!rows.length}><DownloadSimple/> Export CSV</button>
        <button className="mp-primary" onClick={()=>load(true)} disabled={busy}><ArrowClockwise className={busy?'mp-spin':''}/>{busy?'Loading…':'Refresh data'}</button></div>
    </header>
    <section className="mp-source-band" aria-label="Source snapshots">
      <label className="mp-window" htmlFor="mp-window">Sleeper window<select id="mp-window" value={hours} onChange={e=>setHours(Number(e.target.value))}>
        <option value={6}>Past 6 hours</option><option value={24}>Past 24 hours</option><option value={72}>Past 72 hours</option>
      </select></label>
      {SOURCES.map(source=><div className="mp-source-stamp" key={source}>
        <strong>{source==='sleeper'?'Sleeper · adds / drops':'ESPN · roster / start %'}</strong>
        <span>{stamp(snapshots[source]?.capturedAt)}{snapshots[source]?.stale?' · refresh available':''}{source==='espn'?' · experimental':''}</span>
      </div>)}
    </section>
    {SOURCES.filter(source=>errors[source]).map(source=><div className="mp-alert" role="alert" key={source}>
      <strong>{source==='sleeper'?'Sleeper':'ESPN'}:</strong> {errors[source]} {snapshots[source]?.capturedAt?'Last successful snapshot retained.':'No values substituted.'} Use Refresh data to retry.
    </div>)}
    <p className="mp-status" role="status">{notice||'— = not reported or not confidently matched. Counts and percentages describe different provider populations.'}</p>
    <section className="mp-workspace">
      <div className="mp-toolbar">
        <label className="mp-search"><MagnifyingGlass/><span className="sr-only">Find player or team</span><input placeholder="Find player or team…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <label>Position<select value={position} onChange={e=>setPosition(e.target.value)}>{['All','QB','RB','WR','TE','K','DEF'].map(p=><option key={p}>{p}</option>)}</select></label>
        <label>Team<select value={team} onChange={e=>setTeam(e.target.value)}><option>All</option>{teams.map(t=><option key={t}>{t}</option>)}</select></label>
        <button aria-pressed={watchOnly} onClick={()=>setWatchOnly(v=>!v)}><Star weight={watchOnly?'fill':'regular'}/> Watchlist</button>
        <span className="mp-matching">{rows.length} matching</span>
      </div>
      <div className="mp-table-scroll" role="region" aria-label="Combined player trends" tabIndex={0}>
        <table><caption className="sr-only">Sleeper and ESPN player popularity metrics. Click any column header to sort.</caption>
          <colgroup>{COLUMNS.map(([key,,width])=><col key={key} style={{width}}/>)}</colgroup>
          <thead><tr className="mp-groups"><th colSpan={4} scope="colgroup">Player</th><th colSpan={4} scope="colgroup">Sleeper · {hours}h transactions</th><th colSpan={3} scope="colgroup">ESPN · ownership</th></tr><tr>{COLUMNS.map(header)}</tr></thead>
          <tbody>{rows.slice(0,limit).map(row=><tr key={row.id} className={player?.id===row.id?'selected':''}>
            <td><button className="mp-star" aria-label={`${isWatched(row,watch)?'Unwatch':'Watch'} ${row.name}`} aria-pressed={isWatched(row,watch)} onClick={()=>toggleWatch(row)}><Star weight={isWatched(row,watch)?'fill':'regular'}/></button></td>
            <th scope="row"><button className="mp-player" title={`${row.name} · ${row.match}`} aria-expanded={player?.id===row.id} onClick={()=>setSelected(player?.id===row.id?null:row.id)}>{row.name}</button></th>
            <td title={row.espnTeam&&row.espnTeam!==row.team?`Sleeper: ${row.team}; ESPN: ${row.espnTeam}`:row.team}>{row.team}</td><td>{row.position}</td>
            <td className="mp-positive">{fmt(row.adds)}</td><td className="mp-negative">{fmt(row.drops)}</td>
            <td className={row.net==null?'':row.net>=0?'mp-positive':'mp-negative'}>{row.net>0?'+':''}{fmt(row.net)}</td>
            <td><Balance row={row}/></td><td>{pct(row.rosterPct)}</td><td>{pct(row.startPct)}</td>
            <td title={snapshots.espn?.previousAt?`ESPN percentage-point change since ${stamp(snapshots.espn.previousAt)}`:'A second ESPN observation is needed'}>{row.rosterDelta==null?'—':`${row.rosterDelta>0?'+':''}${row.rosterDelta.toFixed(2)}`}</td>
          </tr>)}</tbody>
        </table>
        {!rows.length&&<div className="mp-empty"><ChartLineUp/><h2>{busy?'Loading snapshots…':hasSnapshot?'No matching players':'Start your market history'}</h2><p>{hasSnapshot?'Adjust the search, position, team or watchlist filter.':'Refresh data to retrieve real provider snapshots. No account or token is required.'}</p></div>}
      </div>
      {rows.length>limit&&<button className="mp-more" onClick={()=>setLimit(n=>n+100)}>Show 100 more · {rows.length-limit} remaining</button>}
      {player&&<aside className="mp-detail" aria-label={`${player.name} details`}>
        <div className="mp-detail-heading"><div><h2>{player.name}</h2><p>{player.team} · {player.position} · {player.match}</p></div><button aria-label="Close player details" onClick={()=>setSelected(null)}><X/></button></div>
        <div className="mp-history-grid">{SOURCES.map(source=>snapshots[source]&&player[source==='sleeper'?'sleeperId':'espnId']
          ?<History key={source} data={snapshots[source]} player={{id:player[source==='sleeper'?'sleeperId':'espnId']}}/>
          :<p key={source}>No confidently matched {source==='sleeper'?'Sleeper':'ESPN'} observation for this player.</p>)}</div>
      </aside>}
    </section>
    <footer className="mp-method"><details><summary>Sources, matching & refresh limits</summary>
      <p>Sleeper: returned trending-list counts. Net = adds − drops; add share = adds ÷ (adds + drops), only when both are reported. The labeled green/red bar shows adds versus drops, not ownership. A missing count is unknown, never zero.</p>
      <p>ESPN: reported roster/start percentages, not transaction counts. Δ Ros is percentage-point change since our previous ESPN snapshot ({stamp(snapshots.espn?.previousAt)}), not a standardized daily change. ESPN is an experimental public endpoint and may change without notice.</p>
      <p>Rows match on a shared provider ID when available, otherwise an unambiguous name + position + team (team for defenses). Unmatched or ambiguous players stay separate with unavailable metrics shown as —. Populations and observation windows are not interchangeable.</p>
      <p>Refresh updates both sources with independent 15-minute caches and last-good snapshots. History retains up to 96 observations per source/window; overlapping windows cannot be added together. Watchlists and sorting stay in this browser. Saved history stays in this browser on this device; clearing site data removes it. Server caches may reset between requests. No background refresh job runs.</p>
      <p>For personal fantasy research. No Yahoo credentials or private league data are accessed. Source coverage and availability may change.</p>
      <a href="https://docs.sleeper.com/" target="_blank" rel="noreferrer">Sleeper API documentation ↗</a> · <a href="https://fantasy.espn.com/football/players/add" target="_blank" rel="noreferrer">ESPN Fantasy ↗</a>
    </details></footer>
  </main>;
}
