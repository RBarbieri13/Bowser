// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {useState} from 'react';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {TableColumnResize, TableSettingsPanel, useTablePreferences} from '../src/TableSettings.jsx';
import {formatTableValue, sortTableRows, tableColumnWidth, toggleTableSort, validateTablePreferences, visibleTableColumns} from '../src/tableSettings.js';

const columns = [
  {key:'name',label:'Player',group:'Details',required:true,width:160,minWidth:100,maxWidth:300},
  {key:'points',label:'Fantasy points',group:'Fantasy',type:'number',width:90,minWidth:50,maxWidth:150},
  {key:'salary',label:'DK salary',group:'DFS',type:'currency',width:110},
];
beforeEach(() => localStorage.clear());
afterEach(() => {cleanup(); vi.restoreAllMocks();});

test('saved preferences reject unknown and malformed fields and preserve required identity', () => {
  const input = {hidden:['name','points','unknown','points'],order:['salary','salary','constructor'],widths:{name:-900,points:Infinity,salary:999999},density:'giant',numberFormat:'none',heatmap:'no',sorts:[{key:'salary',desc:true},{key:'salary',desc:false},{key:'unknown',desc:false}],savedViews:[{name:'  Useful ',value:{hidden:['name','salary'],widths:{points:1}}}]};
  const prefs=validateTablePreferences(input,columns);
  expect(prefs.hidden).toEqual(['points']); expect(prefs.order).toEqual(['salary','name','points']);
  expect(prefs.widths).toEqual({name:100,points:90,salary:700});
  expect(prefs.density).toBe('compact'); expect(prefs.numberFormat).toBe('source'); expect(prefs.heatmap).toBe(true);
  expect(prefs.sorts).toEqual([{key:'salary',desc:true}]);
  expect(prefs.savedViews[0].name).toBe('Useful'); expect(prefs.savedViews[0].value.hidden).toEqual(['salary']);
  expect(visibleTableColumns(columns,prefs).map(column=>column.key)).toEqual(['salary','name']);
});
test('multi-column numeric sorting is stable, preserves zero and leaves unavailable values last in either direction', () => {
  const rows=[{id:'a',points:null,salary:5000},{id:'b',points:0,salary:4000},{id:'c',points:-2,salary:7000},{id:'d',points:0,salary:7000},{id:'e',points:0,salary:7000},{id:'f',points:NaN,salary:8000}];
  expect(sortTableRows(rows,[{key:'points',desc:true},{key:'salary',desc:true}]).map(row=>row.id)).toEqual(['d','e','b','c','f','a']);
  expect(sortTableRows(rows,[{key:'points',desc:false}]).map(row=>row.id)).toEqual(['c','b','d','e','a','f']);
  const prefs=toggleTableSort({sorts:[{key:'points',desc:true}]},'salary',true);
  expect(prefs.sorts).toEqual([{key:'points',desc:true},{key:'salary',desc:false}]);
  expect(toggleTableSort(prefs,'points').sorts).toEqual([{key:'points',desc:false}]);
});
test('formatting never turns missing values into zero and retains percent and currency units', () => {
  expect(formatTableValue(null,{type:'number'},{})).toBe('—'); expect(formatTableValue(NaN,{},{})).toBe('—');
  expect(formatTableValue(0,{type:'percent'},{})).toBe('0.0%');
  expect(formatTableValue(1250.5,{type:'currency'},{numberFormat:'integer'})).toBe('$1,251');
  expect(formatTableValue(4,{type:'number'},{numberFormat:'decimal'})).toBe('4.0');
  expect(tableColumnWidth(columns[1],{widths:{points:999}})).toBe(150);
});
function SettingsHarness(){
  const [prefs,setPrefs]=useTablePreferences('table-test',columns,{sorts:[{key:'points',desc:true}]});
  const [open,setOpen]=useState(false);
  return <><button onClick={()=>setOpen(true)}>Settings</button><output data-testid="prefs">{JSON.stringify(prefs)}</output><TableSettingsPanel open={open} onClose={()=>setOpen(false)} title="Fantasy table settings" columns={columns} value={prefs} onChange={setPrefs}/></>;
}
const current=()=>JSON.parse(screen.getByTestId('prefs').textContent);
test('settings stage visibility, ordering and formatting; cancel discards and apply persists', () => {
  render(<SettingsHarness/>); fireEvent.click(screen.getByRole('button',{name:'Settings'}));
  const dialog=screen.getByRole('dialog',{name:'Fantasy table settings'});
  expect(dialog.parentElement).toBe(document.body.lastElementChild);
  fireEvent.click(within(dialog).getByRole('checkbox',{name:'Fantasy points'}));
  fireEvent.change(within(dialog).getByLabelText('Density'),{target:{value:'comfortable'}});
  expect(current().hidden).toEqual([]);
  fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'})); expect(current().density).toBe('compact');
  fireEvent.click(screen.getByRole('button',{name:'Settings'}));
  fireEvent.click(screen.getByRole('checkbox',{name:'Fantasy points'}));
  fireEvent.change(screen.getByLabelText('DK salary width'),{target:{value:'128'}});
  fireEvent.click(screen.getByRole('button',{name:'Move DK salary earlier'}));
  fireEvent.change(screen.getByLabelText('Number format'),{target:{value:'decimal'}});
  fireEvent.click(screen.getByRole('button',{name:'Apply settings'}));
  expect(current().hidden).toEqual(['points']);expect(current().order).toEqual(['name','salary','points']);expect(current().widths.salary).toBe(128);
  expect(JSON.parse(localStorage.getItem('table-test')).numberFormat).toBe('decimal');
});
test('saved view restores the complete column layout and reset retains named views', () => {
  render(<SettingsHarness/>);fireEvent.click(screen.getByRole('button',{name:'Settings'}));
  fireEvent.click(screen.getByRole('checkbox',{name:'DK salary'}));
  fireEvent.change(screen.getByLabelText('View name'),{target:{value:'Only football'}});
  fireEvent.click(screen.getByRole('button',{name:'Save view'}));
  fireEvent.click(screen.getByRole('button',{name:'Show all'}));
  expect(screen.getByRole('checkbox',{name:'DK salary'})).toBeChecked();
  fireEvent.change(screen.getByLabelText('Saved views'),{target:{value:'0'}});
  expect(screen.getByRole('checkbox',{name:'DK salary'})).not.toBeChecked();
  fireEvent.click(screen.getByRole('button',{name:'Reset table'}));
  expect(screen.getByRole('checkbox',{name:'DK salary'})).toBeChecked();
  fireEvent.click(screen.getByRole('button',{name:'Apply settings'}));
  expect(current().savedViews[0].name).toBe('Only football');
});
test('keyboard resizing uses five pixels, supports a larger step and clamps bounds', () => {
  const change=vi.fn(); render(<TableColumnResize column={columns[1]} width={90} onChange={change}/>);
  const resize=screen.getByRole('separator',{name:'Resize Fantasy points column'});
  fireEvent.keyDown(resize,{key:'ArrowRight'});expect(change).toHaveBeenLastCalledWith(95);
  fireEvent.keyDown(resize,{key:'ArrowLeft',shiftKey:true});expect(change).toHaveBeenLastCalledWith(65);
  fireEvent.keyDown(resize,{key:'Home'});expect(change).toHaveBeenLastCalledWith(50);
  fireEvent.keyDown(resize,{key:'End'});expect(change).toHaveBeenLastCalledWith(150);
});

test('fixed identity or trend fields keep their configured positions when statistical columns reorder', () => {
  const fixedColumns=columns.map(column=>column.key==='name'?{...column,orderable:false}:column);
  const prefs=validateTablePreferences({order:['salary','points','name']},fixedColumns);
  expect(prefs.order).toEqual(['name','salary','points']);
  render(<TableSettingsPanel open onClose={()=>{}} title="Fixed fields" columns={fixedColumns} value={prefs} onChange={()=>{}}/>);
  expect(screen.getByRole('button',{name:'Move Player later'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Move Player earlier'})).toBeDisabled();
});

test('switching storage keys never writes the previous table layout into the newly selected table', () => {
  localStorage.setItem('first-table',JSON.stringify({hidden:['salary'],widths:{points:70}}));
  localStorage.setItem('second-table',JSON.stringify({hidden:['points'],widths:{points:120}}));
  const writes=vi.spyOn(Storage.prototype,'setItem');
  function Keyed({storageKey}) { const [prefs]=useTablePreferences(storageKey,columns); return <output data-testid="keyed">{JSON.stringify(prefs)}</output>; }
  const view=render(<Keyed storageKey="first-table"/>);
  writes.mockClear();view.rerender(<Keyed storageKey="second-table"/>);
  expect(JSON.parse(screen.getByTestId('keyed').textContent).hidden).toEqual(['points']);
  const secondWrites=writes.mock.calls.filter(([key])=>key==='second-table').map(([,value])=>JSON.parse(value));
  expect(secondWrites.length).toBeGreaterThan(0);
  expect(secondWrites.every(prefs=>prefs.widths.points===120 && prefs.hidden.includes('points') && !prefs.hidden.includes('salary'))).toBe(true);
  expect(JSON.parse(localStorage.getItem('first-table')).hidden).toEqual(['salary']);
});
