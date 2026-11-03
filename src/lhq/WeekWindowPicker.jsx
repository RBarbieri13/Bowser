import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {calendarContext,defaultSlateKey,rangeCoverageLabel,rangeThrough,scheduleWeekDates,slateShortLabel,slateStartLabel,weekRangeLabel} from './weekWindowModel.js';
import {statisticsWeekStatus} from './playerCalendar.js';
import './weekWindowPicker.css';

function WeekGrid({value,from=value,through=value,onChange,label,current,meta}){
 const refs=useRef({}),[focused,setFocused]=useState(value);
 useEffect(()=>setFocused(value),[value]);
 useEffect(()=>{refs.current[value]?.focus();},[label]);
 const move=(e,week)=>{const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-6,ArrowDown:6}[e.key];if(delta||e.key==='Home'||e.key==='End'){e.preventDefault();const next=e.key==='Home'?1:e.key==='End'?22:Math.max(1,Math.min(22,week+delta));refs.current[next]?.focus();}};
 return <div className="ww-week-grid" role="group" aria-label={label}>{Array.from({length:22},(_,i)=>i+1).map(week=><button ref={e=>refs.current[week]=e} type="button" key={week} aria-label={`${label}: Week ${week}`} aria-pressed={week===value} aria-current={week===current?'date':undefined} tabIndex={week===focused?0:-1} onFocus={()=>setFocused(week)} data-in-range={week>=from&&week<=through} data-current={week===current} title={`${week===current?'Current NFL week · ':''}${scheduleWeekDates(meta,week)} · ${statisticsWeekStatus(meta,week).label}`} onKeyDown={e=>move(e,week)} onClick={()=>onChange(week)}>{week}<span>{week>=19?['WC','DIV','CONF','SB'][week-19]:meta?.weekCoverage?.find(r=>r.week===week&&r.sourcedGames>0&&r.sourcedGames<r.scheduledGames)?'partial':''}</span></button>)}</div>;
}
function Endpoint({label,value,active,onSelect,onChange,initial=false}){
 const full=label==='From'?'start week':'ending week';
 return <div className={active?'active':''}><button type="button" className="ww-edge" data-initial-focus={initial||undefined} aria-label={`${label} W${value}, choose ${full}`} aria-pressed={active} onClick={onSelect}><span>{label}</span><strong>W{value}</strong></button><div className="ww-edge-adjust"><button type="button" aria-label={`Earlier ${full}`} disabled={value<=1} onClick={()=>onChange(value-1)}>−</button><button type="button" aria-label={`Later ${full}`} disabled={value>=22} onClick={()=>onChange(value+1)}>+</button></div></div>;
}
function TrendHistory({count,onChange,through,available}){
 const id=useId(),[draft,setDraft]=useState(String(count));
 useEffect(()=>setDraft(String(count)),[count]);
 const commit=()=>{const n=Math.max(1,Math.min(18,Math.trunc(Number(draft)||count)));setDraft(String(n));if(n!==count)onChange?.(n);};
 return <div className="ww-trends" role="group" aria-label="Independent trend history" title="Trend history is independent of cumulative totals. All players share the same NFL calendar slots, ending at the statistics Through week (regular season, capped at Week18); bye and missing weeks remain gaps.">
  <label htmlFor={id}>Trends <span>{available!=null&&available<count?`${available} of ${count} · W${through}`:`through W${through}`}</span></label>
  <div className="ww-trend-stepper"><button type="button" aria-label="Fewer trend weeks" disabled={count<=1} onClick={()=>onChange?.(count-1)}>−</button><label><input id={id} aria-label="Trend history weeks" type="number" min="1" max="18" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setDraft(String(count));}}}/><span>weeks</span></label><button type="button" aria-label="More trend weeks" disabled={count>=18} onClick={()=>onChange?.(count+1)}>+</button></div>
 </div>;
}
export function WeekWindowPicker({meta,season,now,from,through,mode='range',requestedCount=through-from+1,onStatsChange,trendCount=5,actualTrendSlots=null,trendThrough=Math.min(through,18),onTrendCountChange,dfsWeek,slate,slates=[],dfsEnabled,onDfsWeek,onSlate,onDfsEnabled,onLatestActuals}){
 const [open,setOpen]=useState(null),[edge,setEdge]=useState('from'),[point,setPoint]=useState(null),id=useId();
 const [draft,setDraft]=useState({from,through}),[dfsDraft,setDfsDraft]=useState({week:dfsWeek,slate:slate||'none',enabled:dfsEnabled});
 const [format,setFormat]=useState('classic'),[search,setSearch]=useState('');
 const [draftMode,setDraftMode]=useState(mode),[draftRecent,setDraftRecent]=useState(requestedCount);
 const triggers=useRef({}),panel=useRef(null),clock=calendarContext(meta,now),count=through-from+1;
 const selected=slates.find(o=>o.key===slate),draftCount=draft.through-draft.from+1;
 const options=slates.filter(o=>o.week===dfsDraft.week),filtered=options.filter(o=>(format==='all'||(o.contestTypeId===96?'showdown':'classic')===format)&&slateShortLabel(o).toLowerCase().includes(search.toLowerCase()));
 const close=()=>{setOpen(null);triggers.current[open]?.focus();};
 const show=(kind,event)=>{
  if(open===kind){close();return;}
  const r=event.currentTarget.getBoundingClientRect();setPoint({left:Math.max(8,Math.min(innerWidth-448,r.left)),top:r.bottom+8,maxHeight:Math.max(180,innerHeight-r.bottom-16)});
  if(kind==='stats'){setDraft({from,through});setDraftMode(mode);setDraftRecent(requestedCount);setEdge(mode==='recent'?'through':'from');}else{setDfsDraft({week:dfsWeek,slate:slate||'none',enabled:dfsEnabled});setFormat(selected?.contestTypeId===96?'showdown':'classic');setSearch('');}
  setOpen(kind);
 };
 useEffect(()=>{
  if(!open)return;
  const first=panel.current?.querySelector('[data-initial-focus]:not(:disabled)')||panel.current?.querySelector('button:not(:disabled)');first?.focus();
  const key=e=>{
   if(e.key==='Escape'){e.preventDefault();close();}
   if(e.key==='Tab'){const nodes=[...panel.current.querySelectorAll('button:not(:disabled),input,select,a')].filter(e=>e.tabIndex!==-1);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}
  };
  const outside=e=>{if(!panel.current?.contains(e.target)&&!Object.values(triggers.current).some(t=>t?.contains(e.target)))setOpen(null);};
  const dismiss=()=>setOpen(null);
  document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);};
 },[open]);
 const statsRange=weekRangeLabel(from,through),todayWeek=clock.currentWeek,dfsCalendarWeek=clock.calendarWeek,draftRange=weekRangeLabel(draft.from,draft.through);
 const changeEdge=(which,value)=>setDraft(old=>which==='from'?{from:value,through:Math.max(value,old.through)}:draftMode==='recent'?rangeThrough(value,draftRecent):{from:Math.min(old.from,value),through:value});
 const recent=n=>{const safe=Math.max(1,Math.min(22,Math.trunc(Number(n)||1)));setDraftMode('recent');setDraftRecent(safe);setEdge('through');setDraft(rangeThrough(draft.through,safe));};
 const rangeChanged=draft.from!==from||draft.through!==through||draftMode!==mode||(draftMode==='recent'&&draftRecent!==requestedCount);
 const rangeValue={...draft,mode:draftMode,requestedCount:draftMode==='recent'?draftRecent:draftCount};
 const setDraftWeek=week=>{setDfsDraft(old=>({...old,week,slate:defaultSlateKey(slates,week,meta?.dfsDefault)}));setSearch('');setFormat('classic');};
 const apply=()=>{
  if(open==='stats'){if(rangeChanged)onStatsChange(rangeValue);}
  else{
   if(dfsDraft.week!==dfsWeek)onDfsWeek(dfsDraft.week);
   if(dfsDraft.slate!==(slate||'none')||dfsDraft.week!==dfsWeek)onSlate(dfsDraft.slate);
   if(dfsDraft.enabled!==dfsEnabled)onDfsEnabled(dfsDraft.enabled);
  }
  close();
 };
 return <div className="ww-controls">
  <div className="ww-stat-group"><button type="button" ref={e=>triggers.current.stats=e} className="ww-summary ww-stats" aria-label={`Statistics window: ${statsRange}, ${count} ${count===1?'week':'weeks'}`} aria-expanded={open==='stats'} aria-haspopup="dialog" aria-controls={open==='stats'?id:undefined} onClick={e=>show('stats',e)}><span className="ww-summary-top"><b>Totals</b><strong>{from===through?`W${through}`:`W${from}–${through}`}</strong><span aria-hidden="true">⌄</span></span><small>{mode==='recent'?`Last ${requestedCount} · `:''}{count} {count===1?'week':'weeks'} · cumulative</small></button><button type="button" className="ww-latest" aria-label={`Latest played week · W${clock.latestPlayed||'—'}`} disabled={!clock.latestPlayed} title="Show the latest imported week alone, with all NFL actuals and DFS off" onClick={()=>{onLatestActuals();if(open)close();}}><span>Latest</span><strong>W{clock.latestPlayed||'—'}</strong></button></div>
  <TrendHistory count={trendCount} available={actualTrendSlots} onChange={onTrendCountChange} through={trendThrough}/>
  <button type="button" ref={e=>triggers.current.dfs=e} className="ww-summary ww-dfs" aria-label={`DFS window: ${dfsEnabled?`Week ${dfsWeek}, ${selected?slateShortLabel(selected):'no sourced slate'}`:'off'}`} aria-expanded={open==='dfs'} aria-haspopup="dialog" aria-controls={open==='dfs'?id:undefined} onClick={e=>show('dfs',e)}><span className="ww-summary-top"><b>DFS</b><strong>{dfsEnabled?`W${dfsWeek}`:'Off'}</strong><span aria-hidden="true">⌄</span></span><small>{dfsEnabled?(selected?slateShortLabel(selected):'No sourced slate'):'All NFL actuals'}</small></button>
  <div className="ww-today" title="America/Chicago · Current statistics week advances after the first completed game has imported statistics. DFS follows its independent schedule week."><strong>Today · {clock.dateLabel}</strong><span>{todayWeek?`Current stats W${todayWeek} · Chicago time`:clock.beforeSeason?'Before this season':clock.afterSeason?'Historical season':clock.awaitingFirstImport?'Awaiting first imported game':'Schedule dates unavailable'}</span></div>
  {open&&createPortal(<section ref={panel} id={id} className="lhq ww-panel" role="dialog" aria-label={open==='stats'?'Statistics window editor':'DFS week and slate editor'} style={point}>
   <header><strong>{open==='stats'?'Statistics window':'DFS week & slate'} <small>{season}</small></strong><button type="button" aria-label="Close week editor" onClick={close}>×</button></header>
   <div className="ww-clockline">{clock.dateLabel}{todayWeek?` · Current stats W${todayWeek}`:''} · America/Chicago</div>
   {open==='stats'?<>
    <div className="ww-range-summary" aria-live="polite"><strong>{draftRange}</strong><span>{draftCount} {draftCount===1?'week':'weeks'} · cumulative totals · trends configured separately</span></div>
    {todayWeek&&<div className="ww-shortcuts"><button type="button" title={`Keep ${draftCount} weeks ending in the current statistics week`} onClick={()=>{setDraftMode('recent');setDraftRecent(draftCount);setEdge('through');setDraft(rangeThrough(todayWeek,draftCount));}}>Through current · W{todayWeek}</button></div>}
    <div className="ww-range-modes" role="group" aria-label="Statistics selection mode"><button type="button" aria-pressed={draftMode==='range'} onClick={()=>{setDraftMode('range');setEdge('from');}}>Week range</button><button type="button" aria-pressed={draftMode==='recent'} onClick={()=>recent(draftCount)}>Recent weeks</button></div>
    <div className="ww-endpoints">{draftMode==='range'&&<><Endpoint initial label="From" value={draft.from} active={edge==='from'} onSelect={()=>setEdge('from')} onChange={n=>changeEdge('from',n)}/><span aria-hidden="true">→</span></>}<Endpoint initial={draftMode==='recent'} label="Through" value={draft.through} active={edge==='through'} onSelect={()=>setEdge('through')} onChange={n=>changeEdge('through',n)}/></div>
    <p className="ww-instruction">{draftMode==='recent'?`Choose the ending week; keep ${draftRecent} weeks.`:edge==='from'?'Choose the first week, then the last.':'Choose the last week; the first stays fixed.'} All 22 weeks are selectable.</p>
    <WeekGrid label={edge==='from'?'Start week':'Ending week'} value={edge==='from'?draft.from:draft.through} from={draft.from} through={draft.through} current={todayWeek} meta={meta} onChange={n=>{changeEdge(edge,n);if(edge==='from')setEdge('through');}}/>
    <div className="ww-window-length"><label>Window length <input type="number" min="1" max="22" aria-label="Number of weeks in statistics window" value={draftMode==='recent'?draftRecent:draftCount} onChange={e=>recent(e.target.value)}/> weeks</label><span>through W{draft.through}</span></div>
    {draftMode==='recent'&&draftRecent>draft.through&&<p className="ww-instruction">Only {draft.through} weeks exist through W{draft.through} in this season; {draftRecent} remains your requested length.</p>}
    <div className="ww-recent" role="group" aria-label="Recent weeks through the ending week">{[1,3,5].map(n=><button type="button" key={n} aria-label={`Last ${n} ${n===1?'week':'weeks'} through Week ${draft.through}`} aria-pressed={draftCount===n} onClick={()=>recent(n)}>{n===1?'1 week':`${n} weeks`}</button>)}<button type="button" aria-pressed={draft.from===1} onClick={()=>{setDraftMode('range');setEdge('through');setDraft({from:1,through:draft.through});}}>Season to date</button></div>
    <div className="ww-context"><b>{scheduleWeekDates(meta,draft.from)}{draft.from!==draft.through?` → ${scheduleWeekDates(meta,draft.through)}`:''}</b><span>{rangeCoverageLabel(meta,draft.from,draft.through)}</span><span>Trend request stays at {trendCount} weeks through W{Math.min(draft.through,18)}. DFS W{dfsWeek} stays separate.{dfsEnabled&&selected?' Slate limits the player pool.':''}</span></div>
    {dfsEnabled&&<button type="button" className="ww-all-actuals" title={`Apply ${draftRange.toLowerCase()} and remove the DFS player-pool restriction`} onClick={()=>{if(rangeChanged)onStatsChange(rangeValue);onDfsEnabled(false);close();}}>Apply range · all NFL actuals</button>}
   </>:<>
    <div className="ww-dfs-enabled"><label><input data-initial-focus type="checkbox" checked={dfsDraft.enabled} onChange={e=>setDfsDraft(old=>({...old,enabled:e.target.checked}))}/> DFS fields + slate player pool</label>{dfsCalendarWeek&&<button type="button" title="Independent DFS schedule week for today" onClick={()=>setDraftWeek(dfsCalendarWeek)}>Schedule · W{dfsCalendarWeek}</button>}</div>
    <div className="ww-dfs-week-label"><strong>Week {dfsDraft.week}</strong><span>{scheduleWeekDates(meta,dfsDraft.week)}</span></div>
    <WeekGrid label="DFS week" value={dfsDraft.week} meta={meta} current={dfsCalendarWeek} onChange={setDraftWeek}/>
    <div className="ww-clock-match">{dfsDraft.week===dfsCalendarWeek?`W${dfsDraft.week} is today’s DFS schedule week.`:'Historical or manually selected DFS week.'}</div>
    <div className="ww-slate-tools"><div role="group" aria-label="Slate format">{[['classic','Classic'],['showdown','Showdown'],['all','All']].map(([key,name])=><button type="button" key={key} aria-pressed={format===key} onClick={()=>setFormat(key)}>{name}</button>)}</div><input type="search" aria-label="Find DFS slate or team" placeholder="Find slate or team…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="ww-slate-heading">Sourced slates <small>{filtered.length} shown / {options.length}</small></div>
    <div className="ww-slates" role="group" aria-label="DFS slate"><button type="button" aria-pressed={dfsDraft.slate==='none'} onClick={()=>setDfsDraft(old=>({...old,slate:'none'}))}><strong>No slate</strong><span>All players · DFS values unavailable</span></button>{filtered.map(option=><button type="button" key={option.key} aria-pressed={dfsDraft.slate===option.key} onClick={()=>setDfsDraft(old=>({...old,slate:option.key}))}><strong>{slateShortLabel(option)}</strong><span>{slateStartLabel(option)} · {option.isLocked?'Locked capture':'Pregame'}</span></button>)}</div>
    {!options.length&&<p className="ww-instruction">No verified Week {dfsDraft.week} salaries or projections. A different week's slate is never substituted.</p>}
    {options.length>0&&!filtered.length&&<p className="ww-instruction">No matching slates. Try All formats or clear the search.</p>}
    <p className="ww-instruction">Totals stay {statsRange.toLowerCase()} ({count} weeks). Trend request stays at {trendCount} weeks through W{trendThrough}.</p>
   </>}
   <footer><button type="button" className="ww-cancel" onClick={close}>Cancel</button><button type="button" onClick={apply}>{open==='stats'?'Apply window':'Apply DFS'}</button></footer>
  </section>,document.body)}
 </div>;
}
