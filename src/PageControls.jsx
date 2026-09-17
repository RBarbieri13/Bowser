import { useId, useState } from 'react';
import { CaretDown, SlidersHorizontal } from '@phosphor-icons/react';
import './PageControls.css';

export function PageControls({ title, summary, actions, children, className='', notices, defaultOpen=false }) {
  const [open,setOpen]=useState(defaultOpen);
  const id=useId();
  return <section className={`page-controls ${className}`} aria-label={`${title} controls`}>
    <header className="page-controls-bar"><div className="page-controls-heading"><h1>{title}</h1>{summary&&<div className="page-controls-summary">{summary}</div>}</div><div className="page-controls-actions">{actions}{children&&<button type="button" className="page-controls-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><SlidersHorizontal aria-hidden="true"/>Filters &amp; settings<CaretDown aria-hidden="true" className={open?'expanded':''}/></button>}</div></header>
    {children&&<div id={id} className="page-controls-panel" hidden={!open}>{children}</div>}
    {notices&&<div className="page-controls-notices">{notices}</div>}
  </section>;
}
