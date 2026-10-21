import {useMemo,useRef,useState} from 'react';
import {Shell,Picker,PlayerName,Source} from './shared.jsx';
import {MAX_PACK_BYTES,parseBriefingPack,safeSourceUrl,splitPlayerText,optionSignal,defenseTeam} from './briefingModel.js';
import './briefings.css';

function RichText({text,players,onOpen,season}) {
 return splitPlayerText(String(text),players).map((part,i)=>part.player?<PlayerName key={i} name={part.text} row={{...part.player,season}} onOpen={onOpen}/>:<span key={i}>{part.text}</span>);
}
const points=n=>Number.isFinite(n)?n.toFixed(2):'—';
function BriefingTable({headers,rows,renderCell,label}) {
 const [sort,setSort]=useState(null),[widths,setWidths]=useState({});
 const ordered=useMemo(()=>!sort?rows:[...rows].sort((a,b)=>String(a[sort.index]??'').localeCompare(String(b[sort.index]??''),undefined,{numeric:true})*(sort.desc?-1:1)),[rows,sort]);
 function resize(e,index) {
  e.preventDefault();e.stopPropagation();const start=e.clientX,width=e.currentTarget.parentElement.getBoundingClientRect().width;const target=e.currentTarget;
  target.setPointerCapture(e.pointerId);
  target.onpointermove=event=>setWidths(old=>({...old,[index]:Math.max(100,Math.min(800,width+event.clientX-start))}));
  target.onpointerup=target.onpointercancel=()=>{target.onpointermove=null;target.onpointerup=null;target.onpointercancel=null;};
 }
 return <div className="brief-table-scroll" tabIndex={0} aria-label={`${label} scrollable table`}><table className="brief-table" aria-label={label}><thead><tr>{headers.map((h,i)=><th key={i} style={{minWidth:widths[i]||110,width:widths[i]}} aria-sort={sort?.index===i?(sort.desc?'descending':'ascending'):'none'}><button onClick={()=>setSort({index:i,desc:sort?.index===i?!sort.desc:false})}>{h} {sort?.index===i?(sort.desc?'↓':'↑'):''}</button><span className="brief-resize" role="separator" tabIndex={0} aria-label={`Resize ${h}`} aria-orientation="vertical" aria-valuenow={widths[i]||110} aria-valuemin={100} aria-valuemax={800} onPointerDown={e=>resize(e,i)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setWidths(w=>({...w,[i]:Math.max(100,Math.min(800,(w[i]||110)+(e.key==='ArrowRight'?20:-20)))}));}}}/></th>)}</tr></thead><tbody>{ordered.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{renderCell?renderCell(cell,j,row):cell}</td>)}</tr>)}</tbody></table></div>;
}
function Comparison({rows,season,rich}) {
 const [sort,setSort]=useState('slot');
 const ordered=useMemo(()=>sort==='gain'?[...rows].sort((a,b)=>Math.max(-Infinity,...b.options.map(p=>optionSignal(b.starter,p).delta??-Infinity))-Math.max(-Infinity,...a.options.map(p=>optionSignal(a.starter,p).delta??-Infinity))):rows,[rows,sort]);
 const person=(p,starter)=>{
  if(!p)return <span>Not verified</span>;
  const signal=starter?optionSignal(starter,p):{}; const defense=defenseTeam(p.name); const isDefense=['DEF','DST'].includes(p.position)||/^DST/.test(p.rank||'');
  return <div className={`brief-option ${signal.delta>0?'gain':signal.rankOnly?'rank-gain':''}`}>{defense?<a href={`#/team-box-scores?team=${defense}&season=${season}`}>{p.name}</a>:isDefense?<span>{p.name}</span>:rich(p.name)}{p.flag&&<b className="brief-flag">{p.flag}</b>}<div className="brief-numbers">{points(p.pts)} pts · {p.rank||'Rank —'} {starter&&<strong>{signal.delta==null?'Δ —':`${signal.delta>0?'+':''}${points(signal.delta)}`} {signal.rankOnly?'RANK':'PTS'}</strong>}</div>{p.waiver&&<small>{p.waiver} at capture</small>}</div>;
 };
 return <><div className="brief-table-tools"><span>Yahoo league projections · external ECR · alternatives are not additive</span><label>Order <select value={sort} onChange={e=>setSort(e.target.value)}><option value="slot">Starting slots</option><option value="gain">Largest available gain</option></select></label></div><div className="brief-table-scroll" tabIndex={0} aria-label="Starter comparison scrollable table"><table className="brief-table brief-comparison" aria-label="Starters versus available players"><thead><tr>{['Slot','Captured starter','Roster alternative','Available option 1','Available option 2','Available option 3'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{ordered.map((r,i)=><tr key={i}><td><b>{r.slot}</b></td><td>{person(r.starter)}</td><td>{rich(r.bench)}</td>{[0,1,2].map(j=><td key={j}>{person(r.options[j],r.starter)}</td>)}</tr>)}</tbody></table></div></>;
}
export function Briefings({pack,setPack,onOpen,season,scoring}) {
 const [type,setType]=useState('waiver'),[league,setLeague]=useState(''),[reportId,setReportId]=useState(''),[query,setQuery]=useState(''),[error,setError]=useState('');
 const file=useRef(null);
 const reports=pack?.reports||[],choices=reports.filter(r=>r.type===type).sort((a,b)=>b.date.localeCompare(a.date));
 const report=choices.find(r=>r.id===reportId)||choices[0];
 const latestWaiver=reports.filter(r=>r.type==='waiver').sort((a,b)=>b.date.localeCompare(a.date))[0];
 const allLeagues=[...new Set(report?.sections.map(s=>s.league).filter(Boolean)||[])];
 const players=pack?.players||[];
 const rich=text=><RichText text={text} players={players} onOpen={onOpen} season={report?.season||season}/>;
 const sections=(report?.sections||[]).filter(s=>(!league||!s.league||s.league===league)&&(!query||JSON.stringify(s).toLowerCase().includes(query.toLowerCase())));
 async function load(event) {
  const selected=event.target.files?.[0]; if(!selected)return;
  try {if(selected.size>MAX_PACK_BYTES)throw Error('Choose a briefing pack smaller than 2 MB.');const next=parseBriefingPack(await selected.text());setPack(next);setType(next.reports.some(r=>r.type==='waiver')?'waiver':'daily');setReportId('');setLeague('');setQuery('');setError('');}catch(e){setError(e.message);}finally{event.target.value='';}
 }
 const sources=report?<><Source label="Report edition" title={`${report.date} · ${report.season} Week ${report.week}`} detail="Dated research · not live Yahoo availability"/><span className="brief-source-note">{report.context}</span></>:<span className="brief-source-note">Open your private briefing pack to read the complete reports here. File contents stay in browser memory and are never uploaded.</span>;
 const outline=<div className="brief-outline">{sections.map(s=><a href={`#brief-${s.id}`} key={s.id} onClick={e=>{e.preventDefault();document.getElementById(`brief-${s.id}`)?.scrollIntoView({behavior:'auto',block:'start'});}}>{s.title}</a>)}</div>;
 return <Shell page="briefings" stacks={<Picker label="Briefing" value={type} onChange={v=>{setType(v);setLeague('');setReportId('');}} options={[["waiver","Waiver game plans"],["daily","Daily briefing"]]}/>} sources={sources} panels={[{id:'contents',title:'Report contents',content:outline},{id:'sources',title:'Research sources',content:<div className="brief-sources">{report?.sources.map((s,i)=><p key={i}>{safeSourceUrl(s.url)?<a href={safeSourceUrl(s.url)} target="_blank" rel="noreferrer">{s.name} ↗</a>:s.name}<small>{s.date} {s.basis}</small></p>)}</div>}]} usageContext={{season:report?.season||season,scoring}}>
 <div className="brief-toolbar"><div className="brief-tabs">{[['waiver','Waiver game plans'],['daily','Daily briefing']].map(([key,label])=><button key={key} className={`lhq-mini ${type!==key?'lhq-outline':''}`} aria-pressed={type===key} onClick={()=>{setType(key);setLeague('');setReportId('');setQuery('');}}>{label}</button>)}</div><label>Edition <select aria-label="Report edition" value={report?.id||''} onChange={e=>setReportId(e.target.value)}>{choices.map(r=><option key={r.id} value={r.id}>{r.date} · W{r.week}</option>)}</select></label><label>League <select aria-label="Report league" value={league} onChange={e=>setLeague(e.target.value)}><option value="">All leagues</option>{allLeagues.map(l=><option key={l} value={l}>{l==='loeg'?'LOEG':l==='fart'?'Fart':l==='loongi'?'Loongi':l}</option>)}</select></label><input aria-label="Search briefing" placeholder="Find a player or topic…" value={query} onChange={e=>setQuery(e.target.value)}/><input ref={file} type="file" accept=".json,application/json" hidden aria-label="Choose private briefing pack" onChange={load}/><button className="lhq-mini" onClick={()=>file.current.click()}>Open report file</button>{pack&&<button className="lhq-mini lhq-outline" onClick={()=>{setPack(null);setError('');}}>Clear private reports</button>}</div>
 {error&&<p role="alert" className="brief-warning">{error}</p>}
 <div className="brief-content">
 {!report?<div className="brief-empty"><h1>{type==='daily'?'Daily Fantasy Briefing':'Waiver game plans'}</h1><p>Full league plans, starter comparisons, FAAB strategy and linked player research in your Bowser workspace.</p><button className="lhq-mini" onClick={()=>file.current.click()}>Open private briefing pack</button><p>Your report stays private in this browser session. Reopen the file after a full reload; nothing is published, submitted to Yahoo, or saved in browser storage.</p><a href="#/waivers">Open public waiver research ↗</a></div>:<>
 <div className="brief-title"><div><span className="brief-kicker">PRIVATE RESEARCH / {report.date} / WEEK {report.week}</span><h1>{report.title}</h1></div><a href="#/waivers">Waiver research ↗</a><a href="#/yahoo">Yahoo connection ↗</a></div>
 <p className="brief-warning">Snapshot as of {report.date}. Recheck availability, projections and injuries before acting. This report does not refresh Yahoo or submit transactions.</p>
 {type==='daily'&&latestWaiver&&<div className="brief-linked-plan"><strong>Waiver game plan · {latestWaiver.date}</strong><span>{latestWaiver.date>report.date?'Newer than this daily edition; use the updated plan for acquisition decisions.':'Companion league-by-league bid and lineup strategy.'}</span><button className="lhq-mini" onClick={()=>{setType('waiver');setReportId(latestWaiver.id);setQuery('');}}>Read full game plan</button>{latestWaiver.sections[0]?.blocks.filter(b=>b.kind==='table').slice(0,1).map((b,i)=><BriefingTable key={i} headers={b.headers} rows={b.rows} renderCell={rich} label="Latest waiver priorities"/>)}</div>}
 {!sections.length&&<p>No sections match this search.</p>}
 {sections.map(s=><section id={`brief-${s.id}`} className="brief-section" key={`${report.id}-${s.id}`}><h2>{s.title}</h2>{s.blocks.map((b,i)=>b.kind==='heading'?<h3 key={i}>{rich(b.text)}</h3>:b.kind==='paragraph'?<p key={i}>{rich(b.text)}</p>:b.kind==='news'?<p className="brief-news" key={i}>{rich(b.text)} {safeSourceUrl(b.url)&&<a href={safeSourceUrl(b.url)} target="_blank" rel="noreferrer">Source ↗</a>}<small>{b.date}</small></p>:b.kind==='comparison'?<Comparison key={i} rows={b.rows} onOpen={onOpen} season={report.season} rich={rich}/>:<BriefingTable key={i} headers={b.headers} rows={b.rows} renderCell={rich} label={`${s.title} table ${i+1}`}/>)}</section>)}
 <details className="brief-section"><summary>Source links and publication dates</summary><div className="brief-sources">{report.sources.map((s,i)=><p key={i}>{safeSourceUrl(s.url)?<a href={safeSourceUrl(s.url)} target="_blank" rel="noreferrer">{s.name} ↗</a>:s.name}<small>{s.date} · {s.basis||'See source for coverage.'}</small></p>)}</div></details>
 <p className="brief-privacy">Private file · browser memory only · full reload clears reports · no fantasy transactions</p>
 </>}
 </div>
 </Shell>;
}
