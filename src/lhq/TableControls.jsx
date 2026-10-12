import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {trendWidth} from '../trendColumn.js';
import './tableControls.css';

export function ColumnOptions({title='Column options',onClose,children,onReset}){
 const root=useRef(null);
 useEffect(()=>{const previous=document.activeElement;root.current?.querySelector('button')?.focus();const key=e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const nodes=[...root.current.querySelectorAll('button,input,select,[tabindex="0"]')].filter(n=>!n.disabled);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};},[]);
 return createPortal(<div className="lhq-modal-backdrop" onClick={onClose}><section ref={root} className="lhq lhq-column-modal" role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}><header><strong>{title}</strong><button aria-label="Close column options" onClick={onClose}>×</button></header><div className="lhq-column-groups">{children}</div><footer>{onReset&&<button className="lhq-mini lhq-outline" onClick={onReset}>Reset to defaults</button>}<button className="lhq-mini lhq-outline" onClick={onClose}>Done</button></footer></section></div>,document.body);
}
// Measure rendered leaf headers/cells; share the widest requirement for a stat
// across all week columns. Group captions never inflate individual stat widths.
export function fitTableColumns(label,columns){
 const table=[...document.querySelectorAll('table')].find(t=>t.getAttribute('aria-label')===label);
 if(!table)return {};
 const context=document.createElement('canvas').getContext('2d'),result={};
 if(!context)return {};
 columns.forEach((column,index)=>{
  if(column.widthKey==='marker'){result.marker=40;return;}
  let width=column.trend?trendWidth(column.trend.count):column.minWidth||28;
  const nodes=[table.querySelectorAll('.lhq-leaf-band th')[index],...[...table.tBodies].flatMap(b=>[...b.rows].filter(r=>r.cells.length===columns.length).map(r=>r.cells[index]))].filter(Boolean);
  for(const node of nodes){const textNode=node.tagName==='TH'?node.querySelector('button')||node:node.querySelector('span')||node;const style=getComputedStyle(textNode),cellStyle=getComputedStyle(node);context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;const text=node.innerText.split('\n').map(s=>context.measureText(s.trim()).width);width=Math.max(width,Math.max(0,...text)+Math.max(8,parseFloat(cellStyle.paddingLeft)+parseFloat(cellStyle.paddingRight))+(node.tagName==='TH'?8:0));}
  const key=column.widthKey||column.key;result[key]=Math.max(result[key]||0,Math.min(420,Math.ceil(width)));
 });return result;
}
