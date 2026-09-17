// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,test} from 'vitest';
import {DataTable} from '../src/DataTable.jsx';
const columns=[{key:'name',label:'Player',group:'Identity',width:180,required:true},{key:'salary',label:'Salary',group:'DFS',width:110,type:'currency'},{key:'points',label:'Points',group:'Stats',width:90,decimals:1}];
const rows=[{id:1,name:'Alpha',salary:7000,points:1},{id:2,name:'Beta',salary:null,points:41},{id:3,name:'Gamma',salary:3000,points:-2}];
const renderTable=()=>render(<DataTable id="verification" title="Test statistics" columns={columns} rows={rows}/>);
beforeEach(()=>localStorage.clear());afterEach(cleanup);
const order=()=>within(screen.getByRole('table')).getAllByRole('row').slice(1).map(row=>row.querySelector('td').textContent);
test('every header toggles sort with missing salaries last in both directions',()=>{renderTable();fireEvent.click(screen.getByRole('button',{name:'Sort Salary'}));expect(order()).toEqual(['Gamma','Alpha','Beta']);fireEvent.click(screen.getByRole('button',{name:'Sort Salary'}));expect(order()).toEqual(['Alpha','Gamma','Beta']);});
test('search filters rows without inventing empty numeric values',()=>{renderTable();expect(screen.getByText('—')).toBeInTheDocument();fireEvent.change(screen.getByRole('textbox',{name:'Search Test statistics'}),{target:{value:'Beta'}});expect(order()).toEqual(['Beta']);expect(screen.getByText('—')).toBeInTheDocument();});
test('resizing persists independently per column and survives remount',()=>{const view=renderTable();fireEvent.keyDown(screen.getByRole('separator',{name:'Resize Salary column'}),{key:'ArrowRight'});expect(screen.getByRole('separator',{name:'Resize Salary column'})).toHaveAttribute('aria-valuenow','115');view.unmount();renderTable();expect(screen.getByRole('separator',{name:'Resize Salary column'})).toHaveAttribute('aria-valuenow','115');expect(screen.getByRole('separator',{name:'Resize Points column'})).toHaveAttribute('aria-valuenow','90');});
test('settings opens above table and Cancel does not change visible columns',()=>{renderTable();fireEvent.click(screen.getByRole('button',{name:'Table settings'}));const dialog=screen.getByRole('dialog',{name:'Test statistics table settings'});expect(dialog).toBeInTheDocument();const check=within(dialog).getByRole('checkbox',{name:'Salary'});fireEvent.click(check);fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}));expect(screen.getByRole('button',{name:'Sort Salary'})).toBeInTheDocument();});

test('numeric range excludes unknowns and preserves real negative points',()=>{renderTable();fireEvent.change(screen.getByRole('combobox',{name:'Test statistics numeric filter'}),{target:{value:'points'}});fireEvent.change(screen.getByRole('spinbutton',{name:'Test statistics maximum'}),{target:{value:'0'}});expect(order()).toEqual(['Gamma']);});
