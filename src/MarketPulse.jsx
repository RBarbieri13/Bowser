import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowClockwise, ArrowDown, ArrowUp, ChartLineUp, DownloadSimple, MagnifyingGlass, Star, X } from '@phosphor-icons/react';
import { combineMarketRows, isWatched } from './marketPulseRows.js';
import './MarketPulse.css';
import { TableColumnResize, TableSettingsPanel, useTablePreferences } from './TableSettings.jsx';
import { formatTableValue, sortTableRows, tableColumnWidth, toggleTableSort, visibleTableColumns } from './tableSettings.js';
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
function Balance({row,prefs}) {
  if(row.addShare==null)return <span className="mp-unknown" title="Both add and drop counts are needed. Missing from a top list does not mean zero.">—</span>;
  return <div className="mp-balance" aria-label={`${pct(row.addShare)} adds; ${pct(100-row.addShare)} drops`}><div className="mp-ratio"><i style={{width:`${row.addShare}%`}}/><b style={{width:`${100-row.addShare}%`}}/></div><span>{formatTableValue(row.addShare,{type:'percent'},prefs)} adds</span></div>;
}
const HISTORY_METRICS = {
  sleeper: [{key:'adds',label:'Add counts'}, {key:'drops',label:'Drop counts'}, {key:'net',label:'Net adds'}, {key:'addShare',label:'Add share',percent:true}],
  espn: [{key:'rosterPct',label:'Roster percentage',percent:true}, {key:'startPct',label:'Start percentage',percent:true}, {key:'rosterDelta',label:'Roster change · pp'}],
};
function History({data,player}) {
  const choices=HISTORY_METRICS[data.provider];
  const [metric,setMetric]=useState(choices[0].key), [count,setCount]=useState(16);
  const definition=choices.find(choice=>choice.key===metric);
  const observations=(data.history || []).slice(-count).map(h=>({at:h.capturedAt,value:h.rows.find(r=>r.id===player.id)?.[metric]??null}));
  const present=observations.filter(point=>point.value!==null);
  // All players in this source/window share the scale. Missing samples stay missing.
  const values=(data.history || []).slice(-count).flatMap(h=>h.rows.map(row=>row[metric])).filter(Number.isFinite);
  const min=values.reduce((lowest,value)=>Math.min(lowest,value),0), max=definition.percent?100:values.reduce((highest,value)=>Math.max(highest,value),1), span=max-min;
  const valueLabel=value=>value==null?'Not in returned sample':definition.percent?pct(value):new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
  return <section className="mp-history" aria-label="Player snapshot history"><h3>Observed {definition.label.toLowerCase()}</h3>
    <div className="mp-history-controls"><label>{data.provider==='sleeper'?'Sleeper':'ESPN'} trend metric<select value={metric} onChange={event=>setMetric(event.target.value)}>{choices.map(choice=><option key={choice.key} value={choice.key}>{choice.label}</option>)}</select></label><label>{data.provider==='sleeper'?'Sleeper':'ESPN'} historical observations<select value={count} onChange={event=>setCount(Number(event.target.value))}>{[5,10,16,32,96].map(value=><option key={value} value={value}>{value} observations</option>)}</select></label></div>
    <p>{observations.length} saved observation{observations.length===1?'':'s'} · {data.provider==='sleeper'?`rolling ${data.window}-hour windows`:'provider snapshots'}</p>
    {present.length<2?<div className="mp-history-empty">History starts here.<small>Another uncached refresh will add a point. We never invent past activity.</small></div>:<div className="mp-history-bars" data-scale-min={min} data-scale-max={max}>{observations.map(point=><div key={point.at} title={`${stamp(point.at)}: ${valueLabel(point.value)}`}><span>{point.value==null?'—':valueLabel(point.value)}</span><div className="mp-history-plot"><b className="mp-history-zero" style={{top:`${max/span*100}%`}}/>{point.value!=null&&<i className={point.value<0?'negative':''} style={{top:`${(point.value>=0?max-point.value:max)/span*100}%`,height:point.value===0?'1px':`${Math.abs(point.value)/span*100}%`}}/>}</div><small>{time(point.at)}</small></div>)}</div>}
    <details><summary>Exact observations</summary><div className="mp-observations">{observations.slice().reverse().map(point=><div key={point.at}><time>{stamp(point.at)}</time><strong>{valueLabel(point.value)}</strong></div>)}</div></details>
    <p className="mp-footnote">Capture times use your local timezone. These are provider observations, not NFL games. Overlapping windows are not additive. Bars share a zero baseline and source-wide scale.</p>
  </section>;
}

const SOURCES = ['sleeper', 'espn'];
export const MARKET_COLUMNS = [
  {key:'watch',label:'Watchlist',group:'Player',width:48,minWidth:40,type:'number'},
  {key:'name',label:'Player',group:'Player',width:178,minWidth:120,required:true},
  {key:'team',label:'Team',group:'Player',width:55},
  {key:'position',label:'Pos',group:'Player',width:46},
  {key:'history',label:'History',group:'Player',width:74},
  {key:'adds',label:'Adds',group:'Sleeper transactions',width:78,type:'number'},
  {key:'drops',label:'Drops',group:'Sleeper transactions',width:78,type:'number'},
  {key:'net',label:'Net',group:'Sleeper transactions',width:80,type:'number'},
  {key:'addShare',label:'Add / drop',group:'Sleeper transactions',width:104,type:'percent'},
  {key:'rosterPct',label:'Roster %',group:'ESPN ownership',width:86,type:'percent'},
  {key:'startPct',label:'Start %',group:'ESPN ownership',width:80,type:'percent'},
  {key:'rosterDelta',label:'Δ Ros · pp',group:'ESPN ownership',width:95,type:'number',decimals:2},
  {key:'source',label:'Sources',group:'Provenance',width:120},
  {key:'match',label:'Identity match',group:'Provenance',width:160},
];
const NUMERIC_FILTERS=MARKET_COLUMNS.filter(column=>['number','percent'].includes(column.type)&&column.key!=='watch');
export function MarketPulse({season=2026,onOpenPlayer}) {
  const saved = useMemo(preferences, []);
  const [hours,setHours] = useState([6,24,72].includes(saved.hours) ? saved.hours : 24);
  const [position,setPosition] = useState(['All','QB','RB','WR','TE','K','DEF'].includes(saved.position) ? saved.position : 'All');
  const [search,setSearch] = useState(''), [team,setTeam] = useState('All');
  const [watch,setWatch] = useState(Array.isArray(saved.watch) ? saved.watch.filter(x=>typeof x==='string').slice(0,1000) : []);
  const [watchOnly,setWatchOnly] = useState(false);
  const [tablePrefs,setTablePrefs]=useTablePreferences('bowser:market-pulse:table:v2',MARKET_COLUMNS,{hidden:['source','match'],sorts:[saved.sort && MARKET_COLUMNS.some(column=>column.key===saved.sort.key) ? saved.sort : {key:'adds',desc:true}]});
  const [settingsOpen,setSettingsOpen]=useState(false), [source,setSource]=useState('all'), [identity,setIdentity]=useState('all'), [ranges,setRanges]=useState({});
  const [snapshots,setSnapshots] = useState({});
  const [busy,setBusy] = useState(false), [errors,setErrors] = useState({}), [notice,setNotice] = useState('');
  const [selected,setSelected] = useState(null), [limit,setLimit] = useState(100);
  const sort=tablePrefs.sorts[0] || {key:'adds',desc:true};
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
  const rows=useMemo(()=>sortTableRows(combined.filter(row=>
    (position==='All'||row.position===position)&&(team==='All'||row.team===team)&&
    (!watchOnly||isWatched(row,watch))&&`${row.name} ${row.team}`.toLowerCase().includes(search.toLowerCase())&&
    (source==='all'||source==='both'&&row.sleeperId&&row.espnId||source==='sleeper'&&row.sleeperId||source==='espn'&&row.espnId||source==='sleeper-only'&&row.sleeperId&&!row.espnId||source==='espn-only'&&row.espnId&&!row.sleeperId)&&
    (identity==='all'||identity==='matched'&&row.sleeperId&&row.espnId||identity==='unmatched'&&!(row.sleeperId&&row.espnId))&&
    NUMERIC_FILTERS.every(({key})=>{
      const range=ranges[key]||{}, value=row[key];
      if (range.min==null&&range.max==null) return true;
      return value!=null && (range.min==null||value>=range.min) && (range.max==null||value<=range.max);
    })
  ),tablePrefs.sorts,(row,key)=>key==='watch'?Number(isWatched(row,watch)):key==='history'?row.name:key==='source'?[row.sleeperId?'Sleeper':null,row.espnId?'ESPN':null].filter(Boolean).join(' + '):row[key]),[combined,position,team,watchOnly,watch,search,tablePrefs.sorts,source,identity,ranges]);
  const teams=[...new Set(combined.map(row=>row.team))].sort();
  const player=combined.find(row=>row.aliases.includes(selected));
  const hasSnapshot=SOURCES.some(source=>snapshots[source]?.capturedAt);
  const toggleWatch=row=>setWatch(old=>isWatched(row,old)?old.filter(id=>!row.aliases.includes(id)):[...old,row.id]);
  const openPlayer=row=>onOpenPlayer ? onOpenPlayer({player_id:row.player_id || null,player_display_name:row.name,name:row.name,team:row.team,position:row.position,season,sleeper_id:row.sleeperId,espn_id:row.espnId}) : setSelected(player?.id===row.id?null:row.id);
  const columns=visibleTableColumns(MARKET_COLUMNS,tablePrefs);
  const displayPrefs=tablePrefs.autoFit?{...tablePrefs,widths:Object.fromEntries(columns.map(column=>{
    const values=rows.map(row=>column.key==='source'?[row.sleeperId?'Sleeper':null,row.espnId?'ESPN':null].filter(Boolean).join(' + '):column.key==='history'?'History':column.key==='watch'?'★':formatTableValue(row[column.key],column,tablePrefs));
    const longest=values.reduce((length,value)=>Math.max(length,String(value).length),column.label.length);
    return [column.key,tableColumnWidth({...column,maxWidth:Math.min(column.maxWidth??700,320)},{widths:{[column.key]:column.key==='addShare'?Math.max(column.width,longest*7+24):longest*7+24}})];
  }))}:tablePrefs;
  const groups=[];
  columns.forEach(column=>{const last=groups.at(-1); if(last?.label===column.group)last.count++;else groups.push({label:column.group,count:1});});
  function header(column) {
    const {key,label}=column, active=tablePrefs.sorts.find(item=>item.key===key);
    return <th key={key} scope="col" aria-sort={active?(active.desc?'descending':'ascending'):'none'} style={{position:'relative'}}>
      <button aria-label={key==='watch'?'Sort by watchlist':label}
        title={key==='rosterDelta'?'ESPN roster percentage-point change since previous saved snapshot':`Sort by ${label}. Shift-click adds a secondary sort.`}
        onClick={event=>setTablePrefs(old=>{
          const existing=old.sorts.some(item=>item.key===key);
          const next=toggleTableSort(old,key,event.shiftKey);
          if (!existing && !['name','team','position','source','match','history'].includes(key)) next.sorts=next.sorts.map(item=>item.key===key?{...item,desc:true}:item);
          return next;
        })}>
        {key==='watch'?<Star aria-hidden="true"/>:label}
        {active?(active.desc?<ArrowDown aria-hidden="true"/>:<ArrowUp aria-hidden="true"/>):<span className="mp-sort-hint" aria-hidden="true">↕</span>}
      </button><TableColumnResize column={column} width={tableColumnWidth(column,displayPrefs)} onChange={width=>setTablePrefs(old=>({...old,autoFit:false,widths:{...old.widths,[key]:width}}))}/>
    </th>;
  }
  const cell=(row,column)=>{
    switch(column.key){
      case 'watch': return <button className="mp-star" aria-label={`${isWatched(row,watch)?'Unwatch':'Watch'} ${row.name}`} aria-pressed={isWatched(row,watch)} onClick={()=>toggleWatch(row)}><Star weight={isWatched(row,watch)?'fill':'regular'}/></button>;
      case 'name': return <button className="mp-player" title={`Open ${row.name} player profile · ${row.match}`} onClick={()=>openPlayer(row)}>{row.name}</button>;
      case 'history': return <button className="mp-history-open" aria-label={`Market history for ${row.name}`} aria-expanded={player?.id===row.id} onClick={()=>setSelected(player?.id===row.id?null:row.id)}><ChartLineUp aria-hidden="true"/>History</button>;
      case 'addShare': return tablePrefs.heatmap?<Balance row={row} prefs={tablePrefs}/>:formatTableValue(row.addShare,column,tablePrefs);
      case 'source': return [row.sleeperId?'Sleeper':null,row.espnId?'ESPN':null].filter(Boolean).join(' + ');
      default: return formatTableValue(row[column.key],column,tablePrefs);
    }
  };
  const resetFilters=()=>{setSearch('');setTeam('All');setPosition('All');setWatchOnly(false);setSource('all');setIdentity('all');setRanges({});};
  const setRange=(key,edge,value)=>setRanges(old=>({...old,[key]:{...old[key],[edge]:value===''?null:Number(value)}}));
  function download() {
    const url=URL.createObjectURL(new Blob([csvFor(rows,snapshots)],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`bowser-market-combined-${hours}h.csv`;a.click();URL.revokeObjectURL(url);
  }
  return <main className={`page-content market-pulse mp-density-${tablePrefs.density}`} data-heatmap={tablePrefs.heatmap}>
    <header className="mp-heading">
      <div><h1>Market Pulse</h1><p>Sleeper transactions + ESPN ownership, side by side.</p></div>
      <div className="mp-actions"><button onClick={()=>setSettingsOpen(true)}>Table settings</button><button onClick={download} disabled={!rows.length}><DownloadSimple/> Export CSV</button>
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
        <label>Sources<select value={source} onChange={event=>setSource(event.target.value)}><option value="all">All sources</option><option value="both">Both sources</option><option value="sleeper">Has Sleeper</option><option value="espn">Has ESPN</option><option value="sleeper-only">Sleeper only</option><option value="espn-only">ESPN only</option></select></label>
        <label>Identity<select value={identity} onChange={event=>setIdentity(event.target.value)}><option value="all">All identities</option><option value="matched">Matched sources</option><option value="unmatched">Single-source only</option></select></label>
        <button onClick={resetFilters}>Reset filters</button><span className="mp-matching">{rows.length} matching</span>
      </div>
      <details className="mp-numeric-filters"><summary>Numeric filters · {NUMERIC_FILTERS.filter(({key})=>ranges[key]?.min!=null||ranges[key]?.max!=null).length} active</summary><div>{NUMERIC_FILTERS.map(column=><fieldset key={column.key}><legend>{column.label}</legend><label><span className="sr-only">Minimum {column.label}</span><input type="number" step="any" aria-label={`Minimum ${column.label}`} placeholder="Min" value={ranges[column.key]?.min??''} onChange={event=>setRange(column.key,'min',event.target.value)}/></label><span>to</span><label><span className="sr-only">Maximum {column.label}</span><input type="number" step="any" aria-label={`Maximum ${column.label}`} placeholder="Max" value={ranges[column.key]?.max??''} onChange={event=>setRange(column.key,'max',event.target.value)}/></label></fieldset>)}</div><p>Ranges exclude unknown values. Missing from a provider's top list does not mean zero.</p></details>
      <div className="mp-table-scroll" role="region" aria-label="Combined player trends" tabIndex={0}>
        <table style={{width:columns.reduce((sum,column)=>sum+tableColumnWidth(column,displayPrefs),0)}}><caption className="sr-only">Sleeper and ESPN player popularity metrics. Click any column header to sort. Shift-click adds a secondary sort.</caption>
          <colgroup>{columns.map(column=><col key={column.key} style={{width:tableColumnWidth(column,displayPrefs)}}/>)}</colgroup>
          <thead><tr className="mp-groups">{groups.map((group,index)=><th key={`${group.label}-${index}`} colSpan={group.count} scope="colgroup">{group.label==='Sleeper transactions'?`Sleeper · ${hours}h transactions`:group.label==='ESPN ownership'?'ESPN · ownership':group.label}</th>)}</tr><tr>{columns.map(header)}</tr></thead>
          <tbody>{rows.slice(0,limit).map(row=><tr key={row.id} className={player?.id===row.id?'selected':''}>{columns.map((column,columnIndex)=>{
            const positive=column.key==='adds'||column.key==='net'&&row.net>=0||column.key==='rosterDelta'&&row.rosterDelta>0;
            const negative=column.key==='drops'||column.key==='net'&&row.net<0||column.key==='rosterDelta'&&row.rosterDelta<0;
            const className=[tablePrefs.heatmap?(positive?'mp-positive':negative?'mp-negative':''):'',columnIndex>0&&columns[columnIndex-1].group!==column.group?'mp-group-start':''].filter(Boolean).join(' ');
            return column.key==='name'?<th scope="row" key={column.key}>{cell(row,column)}</th>:<td className={className} key={column.key} title={column.key==='rosterDelta'?(snapshots.espn?.previousAt?`ESPN percentage-point change since ${stamp(snapshots.espn.previousAt)}`:'A second ESPN observation is needed'):undefined}>{cell(row,column)}</td>;
          })}</tr>)}</tbody>
        </table>
        {!rows.length&&<div className="mp-empty"><ChartLineUp/><h2>{busy?'Loading snapshots…':hasSnapshot?'No matching players':'Start your market history'}</h2><p>{hasSnapshot?'Adjust the search, position, team or watchlist filter.':'Refresh data to retrieve real provider snapshots. No account or token is required.'}</p></div>}
      </div>
      {rows.length>limit&&<button className="mp-more" onClick={()=>setLimit(n=>n+100)}>Show 100 more · {rows.length-limit} remaining</button>}
      {player&&<aside className="mp-detail" aria-label={`${player.name} details`}>
        <div className="mp-detail-heading"><div><h2><button className="mp-player" onClick={()=>openPlayer(player)}>{player.name}</button></h2><p>{player.team} · {player.position} · {player.match}</p></div><button aria-label="Close player details" onClick={()=>setSelected(null)}><X/></button></div>
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
    <TableSettingsPanel open={settingsOpen} onClose={()=>setSettingsOpen(false)} title="Market Pulse table settings" columns={MARKET_COLUMNS} value={tablePrefs} onChange={setTablePrefs}/>
  </main>;
}
