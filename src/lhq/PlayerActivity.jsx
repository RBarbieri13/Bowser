import {ColumnLegend} from './ColumnLegend.jsx';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Tip} from './shared.jsx';
import {stamp} from './model.js';
import {ACTIVITY_FIELDS,activityKey,compactActivity} from './playerActivity.js';
import './PlayerActivity.css';
export function activityContext(provider,activity){
  if(provider==='yahoo')return `Yahoo-wide transaction trends · ${activity.yahooSnapshot?.date||activity.yahooPeriod||'today'} calendar date · checked ${activity.yahooSnapshot?.capturedAt?stamp(activity.yahooSnapshot.capturedAt):'unavailable'}. ${activity.yahooError?'Refresh failed; ':''}${activity.yahooCoverage} Independent of your leagues, Base week and DFS slate.`;
  const snapshot=activity.snapshot;
  return `Sleeper · rolling ${activity.hours}h platform top lists · captured ${snapshot?.capturedAt?stamp(snapshot.capturedAt):'unavailable'}${snapshot?.capturedAt&&Date.now()-snapshot.capturedAt>900000?' · stale capture':''}${activity.loading?' · refreshing':''}${activity.error?' · refresh failed':''}. Missing top-list membership is unavailable, not zero. Net requires both counts. Independent of Base week and DFS slate.`;
}
export function ActivityCells({provider,row,activity}){
  const values=provider==='sleeper'?activity.sleeperFor(row):activity.yahooFor(row);
  return <div className="activity-cells">{ACTIVITY_FIELDS.map(([field,,label])=>{const value=values?.[field]??null;return <Tip key={field} text={`${provider==='yahoo'?'Yahoo':'Sleeper'} ${label}: ${value===null?'unavailable':value.toLocaleString('en-US')}. ${activityContext(provider,activity)}`}><span className={`activity-number ${value===null?'activity-missing':field==='net'?value>0?'activity-positive':value<0?'activity-negative':'':''}`} aria-label={`${provider} ${label}: ${value===null?'unavailable':value}`} tabIndex={0}>{compactActivity(value,field==='net')}</span></Tip>;})}</div>;
}
export function ActivityHeader({provider,activity,sort,field,onSort}){
  const [anchor,setAnchor]=useState(null),trigger=useRef(null),menu=useRef(null);
  const label=provider==='sleeper'?'Sleeper':'Yahoo',close=()=>{setAnchor(null);trigger.current?.focus();};
  useEffect(()=>{
    if(!anchor)return;
    menu.current?.querySelector('select,button')?.focus();
    const key=e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const nodes=[...menu.current.querySelectorAll('select,button,a')].filter(n=>!n.disabled);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}};
    const outside=e=>{if(!menu.current?.contains(e.target)&&!trigger.current?.contains(e.target))setAnchor(null);};
    const dismiss=()=>setAnchor(null);
    document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);window.addEventListener('scroll',dismiss,true);
    return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',dismiss,true);};
  },[anchor]);
  return <div className={`activity-header activity-${provider}`}>
    <div className="activity-provider-line"><Tip text={activityContext(provider,activity)}><button ref={trigger} type="button" className="activity-provider" aria-label={`${label} activity source settings`} aria-haspopup="dialog" aria-expanded={!!anchor} onClick={()=>{if(anchor){close();return;}const r=trigger.current.getBoundingClientRect();setAnchor({left:Math.max(8,Math.min(innerWidth-248,r.left)),top:r.bottom+6});}}><span className="activity-badge">{provider==='sleeper'?'SLP':'Y!'}</span><small>{provider==='sleeper'?`${activity.hours}h`:activity.yahooPeriod==='yesterday'?'Yday':'Today'}</small><span aria-hidden="true">▾</span></button></Tip><ColumnLegend label={`${label} activity legend`} text={`+ = adds. − = drops. Δ = adds minus drops; positive means more adds than drops.
${activityContext(provider,activity)}
0 is a reported zero; — means no sourced count. Counts cover the published trend lists, not every NFL player. Click a symbol to sort; arrows show sort direction.`}/></div>
    <div className="activity-sorters">{ACTIVITY_FIELDS.map(([key,symbol,name])=>{const active=sort?.key===activityKey(provider)&&field===key;return <button key={key} type="button" aria-label={`Sort ${label} ${name}`} aria-pressed={active} title={`${label} ${name} · ${active&&sort.desc?'ascending next':'descending next'}`} onClick={()=>onSort(key,active?!sort.desc:true)}><b>{symbol}</b><span aria-hidden="true">{active&&!sort.desc?'▴':'▾'}</span></button>;})}</div>
    {anchor&&createPortal(<section ref={menu} role="dialog" aria-label={`${label} activity settings`} className="activity-menu" style={anchor}><header><strong>{label} activity</strong><button aria-label="Close activity settings" onClick={close}>×</button></header>{provider==='sleeper'?<label>Rolling window<select aria-label="Sleeper activity window" value={activity.hours} onChange={e=>activity.setHours(Number(e.target.value))}>{[6,24,72].map(n=><option key={n} value={n}>{n} hours</option>)}</select></label>:<label>Calendar date<select aria-label="Yahoo trend date" value={activity.yahooPeriod||'today'} onChange={e=>activity.setYahooPeriod(e.target.value)}><option value="today">Today</option><option value="yesterday">Yesterday</option></select></label>}<p>{activityContext(provider,activity)}</p><button disabled={provider==='sleeper'?activity.loading:activity.yahooBusy} onClick={provider==='sleeper'?activity.refreshSleeper:activity.reloadYahoo}>Refresh {label}</button></section>,document.body)}
  </div>;
}
