import {useId,useState} from 'react';
import {createPortal} from 'react-dom';
import {Info,Key} from '@phosphor-icons/react';
import './ColumnLegend.css';
export function ColumnLegend({label,text,ownership=false}){
 const [point,setPoint]=useState(null),id=useId();
 const show=e=>{const r=e.currentTarget.getBoundingClientRect();setPoint({left:Math.max(8,Math.min(innerWidth-328,r.right-320)),top:r.bottom+6});};
 return <span className="column-legend-anchor" onMouseEnter={show} onMouseLeave={()=>setPoint(null)} onFocus={show} onBlur={()=>setPoint(null)} onKeyDown={e=>{if(e.key==='Escape')setPoint(null);}} onMouseDown={e=>e.stopPropagation()}><button type="button" className="column-legend-trigger" aria-label={label} aria-describedby={point?id:undefined} aria-expanded={!!point} onClick={show}>{ownership&&<Key size={12} aria-hidden="true"/>}<Info size={12} aria-hidden="true"/></button>{point&&createPortal(<div id={id} className="column-legend-popup" role="tooltip" style={point}><strong>{label}</strong><div>{text}</div></div>,document.body)}</span>;
}
