import { useMemo, useState } from 'react';
import { TableSettingsPanel, TableColumnResize, useTablePreferences } from './TableSettings.jsx';
import { visibleTableColumns, tableColumnWidth, sortTableRows, toggleTableSort, formatTableValue } from './tableSettings.js';
import './DataTable.css';

// Shared table mechanics; callers own the meaning and rendering of each column.
export function DataTable({ id, title, columns, rows, rowKey, getValue=(row,key)=>row[key], renderCell, filters, defaultSorts=[], footer, className='', tableClassName='', rowLabel }) {
  const [prefs,setPrefs] = useTablePreferences(`bowser:table:${id}:v1`, columns, {sorts:defaultSorts});
  const [settings,setSettings] = useState(false);
  const [search,setSearch] = useState('');
  const [rangeKey,setRangeKey] = useState(''), [minimum,setMinimum] = useState(''), [maximum,setMaximum] = useState('');
  const numericColumns = columns.filter(column=>rows.some(row=>typeof getValue(row,column.key)==='number'));
  const activeRangeKey = numericColumns.some(column=>column.key===rangeKey) ? rangeKey : '';
  const visible = visibleTableColumns(columns,prefs);
  const filtered = useMemo(()=>rows.filter(row=>{if(search.trim()&&!columns.some(column=>String(getValue(row,column.key)??'').toLowerCase().includes(search.trim().toLowerCase())))return false;if(activeRangeKey&&(minimum!==''||maximum!=='')){const value=getValue(row,activeRangeKey);if(typeof value!=='number'||!Number.isFinite(value))return false;if(minimum!==''&&value<Number(minimum))return false;if(maximum!==''&&value>Number(maximum))return false;}return true;}),[rows,columns,search,getValue,activeRangeKey,minimum,maximum]);
  const sorted = sortTableRows(filtered,prefs.sorts,getValue);
  const width = visible.reduce((sum,column)=>sum+tableColumnWidth(column,prefs),0);
  return <section className={`data-table ${className} density-${prefs.density}`}>
    <div className="data-table-controls" aria-label={`${title} filters`}><label>Search<input aria-label={`Search ${title}`} value={search} onChange={event=>setSearch(event.target.value)} placeholder="Filter rows…" /></label>{filters}{numericColumns.length>0&&<><label>Numeric filter<select aria-label={`${title} numeric filter`} value={activeRangeKey} onChange={event=>setRangeKey(event.target.value)}><option value="">Any value</option>{numericColumns.map(column=><option key={column.key} value={column.key}>{column.label}</option>)}</select></label>{activeRangeKey&&<><label>Minimum<input type="number" aria-label={`${title} minimum`} value={minimum} onChange={event=>setMinimum(event.target.value)}/></label><label>Maximum<input type="number" aria-label={`${title} maximum`} value={maximum} onChange={event=>setMaximum(event.target.value)}/></label></>}</>}<button type="button" onClick={()=>setSettings(true)}>Table settings</button><span>{filtered.length} / {rows.length} rows</span></div>
    <TableSettingsPanel open={settings} onClose={()=>setSettings(false)} title={`${title} table settings`} columns={columns} value={prefs} onChange={setPrefs}/>
    <div className="data-table-scroll" tabIndex={0} aria-label={`Scrollable ${title}`}><table className={tableClassName} style={{width:prefs.autoFit?'100%':width,minWidth:width,tableLayout:'fixed'}}><caption>{title}</caption><colgroup>{visible.map(column=><col key={column.key} style={{width:tableColumnWidth(column,prefs)}}/>)}</colgroup><thead><tr>{visible.map(column=>{const sort=prefs.sorts.find(item=>item.key===column.key);return <th key={column.key} scope="col" aria-sort={sort?(sort.desc?'descending':'ascending'):'none'}><button type="button" aria-label={`Sort ${column.label}`} onClick={event=>setPrefs(current=>toggleTableSort(current,column.key,event.shiftKey))}>{column.label}{sort?(sort.desc?' ↓':' ↑'):''}</button><TableColumnResize column={column} width={tableColumnWidth(column,prefs)} onChange={next=>setPrefs(current=>({...current,autoFit:false,widths:{...current.widths,[column.key]:next}}))}/></th>;})}</tr></thead><tbody>{sorted.map((row,index)=><tr aria-label={rowLabel?.(row)} key={rowKey?rowKey(row):row.id??index}>{visible.map(column=><td key={column.key} data-column={column.key}>{renderCell?.(row,column,prefs)??formatTableValue(getValue(row,column.key),column,prefs)}</td>)}</tr>)}</tbody>{footer?.(visible,prefs,filtered)}</table>{!sorted.length&&<p className="data-table-empty">No rows match these filters.</p>}</div>
  </section>;
}
