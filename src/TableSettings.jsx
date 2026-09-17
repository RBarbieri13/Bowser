import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {tableColumnWidth, validateTablePreferences} from './tableSettings.js';
import './TableSettings.css';

export function useTablePreferences(storageKey, columns, defaults = {}) {
  const signature = JSON.stringify(columns.map(({key, width, minWidth, maxWidth, required, orderable}) => ({key, width, minWidth, maxWidth, required, orderable})));
  const read = () => {
    try { return validateTablePreferences(JSON.parse(localStorage.getItem(storageKey)), columns, defaults); }
    catch { return validateTablePreferences(null, columns, defaults); }
  };
  const [stored, update] = useState(() => ({storageKey, prefs: read()}));
  useEffect(() => {
    update(old => ({storageKey, prefs: old.storageKey === storageKey ? validateTablePreferences(old.prefs, columns, defaults) : read()}));
  }, [storageKey, signature]);
  useEffect(() => {
    // A key change must never write the previous page's layout into the new key.
    if (stored.storageKey !== storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(stored.prefs)); } catch { /* Browser storage can be disabled. */ }
  }, [storageKey, stored]);
  const prefs = stored.storageKey === storageKey ? stored.prefs : read();
  const setPrefs = next => update(old => {
    const previous = old.storageKey === storageKey ? old.prefs : read();
    return {storageKey, prefs: validateTablePreferences(typeof next === 'function' ? next(previous) : next, columns, defaults)};
  });
  return [prefs, setPrefs];
}

export function TableColumnResize({column, width, onChange}) {
  const cleanup = useRef(null);
  useEffect(() => () => cleanup.current?.(), []);
  const bounded = next => tableColumnWidth(column, {widths: {[column.key]: next}});
  const resize = event => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    cleanup.current?.();
    const x = event.clientX, start = width;
    const move = next => onChange(bounded(start + next.clientX - x));
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); cleanup.current = null; };
    cleanup.current = stop;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
  };
  return <span className="table-column-resize" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={`Resize ${column.label} column`} aria-valuenow={width} aria-valuemin={column.minWidth ?? 44} aria-valuemax={column.maxWidth ?? 700} onPointerDown={resize} onClick={event => event.stopPropagation()} onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    onChange(bounded(event.key === 'Home' ? column.minWidth ?? 44 : event.key === 'End' ? column.maxWidth ?? 700 : width + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 25 : 5)));
  }} title="Drag to resize. Arrow keys change 5 pixels; Shift changes 25."/>;
}

export function TableSettingsPanel({open, onClose, title = 'Table settings', columns, value, onChange}) {
  const [draft, setDraft] = useState(() => validateTablePreferences(value, columns));
  const [viewName, setViewName] = useState('');
  const dialog = useRef(null);
  useEffect(() => {
    if (!open) return;
    setDraft(validateTablePreferences(value, columns)); setViewName('');
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => dialog.current?.querySelector('button')?.focus());
    return () => { document.body.style.overflow = oldOverflow; previous?.focus?.(); };
  }, [open]);
  if (!open) return null;
  const patch = update => setDraft(old => validateTablePreferences({...old, ...update}, columns));
  const groups = [...new Set(columns.map(column => column.group || 'Columns'))];
  const byKey = new Map(columns.map(column => [column.key, column]));
  const nextIndex = (key,direction) => {
    const index=draft.order.indexOf(key), column=byKey.get(key);
    if(column?.orderable===false)return -1;
    for(let next=index+direction;next>=0&&next<draft.order.length;next+=direction){
      const candidate=byKey.get(draft.order[next]);
      if(column?.orderGroup && candidate?.orderGroup!==column.orderGroup)continue;
      if(candidate?.orderable!==false)return next;
    }
    return -1;
  };
  const move = (key,direction) => {
    const order=[...draft.order],index=order.indexOf(key),next=nextIndex(key,direction);
    if(next<0)return;
    [order[index],order[next]]=[order[next],order[index]];patch({order});
  };
  const toggle = (column, visible) => patch({hidden: visible ? draft.hidden.filter(key => key !== column.key) : [...draft.hidden, column.key]});
  const reset = () => setDraft(validateTablePreferences({savedViews: draft.savedViews}, columns));
  return createPortal(<div className="table-settings-layer" onMouseDown={event => {if (event.target === event.currentTarget) onClose();}}>
    <section className="table-settings-panel" role="dialog" aria-modal="true" aria-label={title} ref={dialog} onKeyDown={event => {
      if (event.key === 'Escape') {event.stopPropagation(); onClose();}
      if (event.key === 'Tab') {
        const focusable = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
      }
    }}>
      <header><div><h2>{title}</h2><p>Choose fields, reorder columns, and format this table.</p></div><button onClick={onClose} aria-label="Close table settings">✕</button></header>
      <div className="table-settings-content">
        <section className="table-settings-format" aria-label="Table formatting">
          <label>Density<select value={draft.density} onChange={event => patch({density: event.target.value})}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label>
          <label>Number format<select value={draft.numberFormat} onChange={event => patch({numberFormat: event.target.value})}><option value="source">Source precision</option><option value="integer">Whole numbers</option><option value="decimal">One decimal</option></select></label>
          <label><input type="checkbox" checked={draft.heatmap} onChange={event => patch({heatmap: event.target.checked})}/> Conditional colors</label>
          <label><input type="checkbox" checked={draft.autoFit} onChange={event => patch({autoFit: event.target.checked})}/> Auto fit columns</label>
        </section>
        <section className="table-settings-presets" aria-label="Column presets"><strong>Presets</strong><button onClick={() => patch({hidden: []})}>Show all</button><button onClick={() => patch({hidden: columns.filter(column => !column.required && !['number','percent','currency'].includes(column.type)).map(column => column.key)})}>Numeric fields</button><button onClick={() => patch({density: 'compact', widths: Object.fromEntries(columns.map(column => [column.key, Math.max(column.minWidth ?? 44, (column.width ?? 100) * .8)]))})}>Compact widths</button></section>
        <section className="table-settings-views" aria-label="Saved table views"><label>View name<input value={viewName} maxLength={60} onChange={event => setViewName(event.target.value)} placeholder="Name this column layout"/></label><button disabled={!viewName.trim() || draft.savedViews.length >= 12} onClick={() => {const name = viewName.trim(); patch({savedViews: [...draft.savedViews.filter(view => view.name !== name), {name, value: validateTablePreferences(draft, columns, {}, false)}]}); setViewName('');}}>Save view</button>{draft.savedViews.length > 0 && <label>Saved views<select defaultValue="" onChange={event => {const view = draft.savedViews[Number(event.target.value)]; if (view) patch(view.value); event.target.value = '';}}><option value="" disabled>Load a view…</option>{draft.savedViews.map((view, index) => <option key={`${view.name}-${index}`} value={index}>{view.name}</option>)}</select></label>}{draft.savedViews.length > 0 && <button onClick={() => patch({savedViews: []})}>Clear saved views</button>}</section>
        <div className="table-settings-groups">{groups.map(group => {
          const members = columns.filter(column => (column.group || 'Columns') === group);
          return <fieldset key={group}><legend>{group}</legend><div className="table-settings-group-actions"><button onClick={() => patch({hidden: draft.hidden.filter(key => !members.some(column => column.key === key))})}>Show section</button><button onClick={() => patch({hidden: [...draft.hidden, ...members.filter(column => !column.required).map(column => column.key)]})}>Hide section</button></div>{members.map(column => <div key={column.key} className="table-settings-field"><label><input type="checkbox" checked={!draft.hidden.includes(column.key)} disabled={column.required} onChange={event => toggle(column, event.target.checked)}/>{column.label}{column.required && <small>Required</small>}</label><label className="table-settings-width"><span className="sr-only">{column.label} width</span><input aria-label={`${column.label} width`} type="number" min={column.minWidth ?? 44} max={column.maxWidth ?? 700} step={1} value={draft.widths[column.key] ?? tableColumnWidth(column,draft)} onChange={event => patch({widths: {...draft.widths, [column.key]: Number(event.target.value)}})}/><span>px</span></label></div>)}</fieldset>;
        })}</div>
        <section className="table-settings-order" aria-label="Column order"><h3>Column order</h3>{columns.some(column=>column.orderGroup)&&<p>Columns move within their labeled section.</p>}<p>Hidden fields keep their position when restored.</p><ol>{draft.order.map((key, index) => <li key={key}><span>{index+1}. {byKey.get(key)?.label}{byKey.get(key)?.orderable === false ? ' · fixed' : ''}{draft.hidden.includes(key) ? ' · hidden' : ''}</span><button aria-label={`Move ${byKey.get(key)?.label} earlier`} disabled={nextIndex(key,-1)<0} onClick={() => move(key,-1)}>←</button><button aria-label={`Move ${byKey.get(key)?.label} later`} disabled={nextIndex(key,1)<0} onClick={() => move(key,1)}>→</button></li>)}</ol></section>
      </div>
      <footer><button onClick={reset}>Reset table</button><span>{columns.length-draft.hidden.length} of {columns.length} columns visible</span><button onClick={onClose}>Cancel</button><button className="table-settings-apply" onClick={() => {onChange(validateTablePreferences(draft, columns)); onClose();}}>Apply settings</button></footer>
    </section>
  </div>, document.body);
}
