// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {LhqProvider, Shell, Grid} from '../src/lhq/shared.jsx';

const panels=[
 {id:'filters',title:'Filters & settings',shortTitle:'Filters',content:<span>Filter content</span>},
 {id:'totals',title:'Position Totals',shortTitle:'Totals',content:<span>Totals content</span>},
 {id:'player',title:'Selected player · statistics',shortTitle:'Player',content:<span>Player content</span>},
 {id:'usage',title:'Usage share',shortTitle:'Usage',clock:['Depth: current','Stats: 2026 W1 → W3'],content:<span>Usage content</span>},
 {id:'depth',title:'Depth chart',shortTitle:'Depth',content:<span>Depth content</span>},
 {id:'schedule',title:'Team schedule',shortTitle:'Sched',content:<span>Schedule content</span>},
 {id:'game',title:'Game statistics',shortTitle:'Games',content:<span>Game content</span>},
 {id:'lineup',title:'DraftKings lineup cards',shortTitle:'DK',content:<span>Lineup content</span>},
];
function harness(props={}){return <LhqProvider><Shell page="players" defaultPanel="totals" panels={panels} sidebarWidth={400} {...props}>Main content</Shell></LhqProvider>;}
const open=()=>fireEvent.click(screen.getByRole('button',{name:/Show sidebar/}));
beforeEach(()=>{sessionStorage.clear();localStorage.clear();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('requestAnimationFrame',fn=>{fn();return 1;});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

test('starts hidden and mounts only selected content, with route default and session restore',()=>{
 const view=render(harness());expect(screen.queryByRole('tablist')).not.toBeInTheDocument();open();
 expect(screen.getByRole('tab',{name:'Position Totals'})).toHaveAttribute('aria-selected','true');
 expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
 expect(screen.getByText('Totals content')).toBeInTheDocument();expect(screen.queryByText('Filter content')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('tab',{name:'Filters & settings'}));
 expect(JSON.parse(sessionStorage.getItem('bowser:lhq:sidebar-tab:players'))).toBe('filters');
 fireEvent.click(screen.getByRole('button',{name:/Hide sidebar/}));open();expect(screen.getByText('Filter content')).toBeInTheDocument();
 view.unmount();render(harness());expect(screen.queryByRole('tablist')).not.toBeInTheDocument();open();expect(screen.getByText('Filter content')).toBeInTheDocument();
});
test('all full-name tabs remain available at narrow widths without an overflow menu',()=>{
 sessionStorage.setItem('bowser:lhq:sidebar-width:players','240');render(harness());open();
 expect(screen.getAllByRole('tab')).toHaveLength(panels.length);
 for(const panel of panels)expect(screen.getByRole('tab',{name:panel.title})).toHaveTextContent(panel.title);
 expect(screen.queryByRole('menu')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('tab',{name:'Usage share'}));
 expect(screen.getByText('Usage content')).toBeInTheDocument();
 expect(screen.getByText('Depth: current')).toBeInTheDocument();
 expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Expand sidebar width'}));
 expect(screen.getByRole('tab',{name:'Usage share'})).toHaveAttribute('aria-selected','true');
});
test('keyboard traverses every tab and restores focus while Home and End work',()=>{
 render(harness());open();let tab=screen.getByRole('tab',{name:'Position Totals'});
 fireEvent.keyDown(tab,{key:'ArrowRight'});expect(screen.getByText('Player content')).toBeInTheDocument();
 tab=screen.getByRole('tab',{name:'Selected player · statistics'});expect(tab).toHaveFocus();
 fireEvent.keyDown(tab,{key:'End'});expect(screen.getByText('Lineup content')).toBeInTheDocument();
 tab=screen.getByRole('tab',{name:'DraftKings lineup cards'});expect(tab).toHaveFocus();
 fireEvent.keyDown(tab,{key:'Home'});expect(screen.getByText('Filter content')).toBeInTheDocument();
 expect(screen.getByRole('tab',{name:'Filters & settings'})).toHaveFocus();
});
test('browse arrows reveal clipped tabs without changing the active panel and disable at ends',()=>{
 render(harness());open();const rail=screen.getByRole('tablist');
 Object.defineProperties(rail,{clientWidth:{value:200},scrollWidth:{value:900},scrollLeft:{value:0,writable:true}});
 rail.getBoundingClientRect=()=>({left:0,right:200});
 panels.forEach((p,i)=>{screen.getByRole('tab',{name:p.title}).getBoundingClientRect=()=>({left:i*100-rail.scrollLeft,right:(i+1)*100-rail.scrollLeft});});
 rail.scrollTo=vi.fn();fireEvent.scroll(rail);
 expect(screen.getByRole('button',{name:'Scroll sidebar tabs left'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Scroll sidebar tabs right'}));
 expect(rail.scrollTo).toHaveBeenCalledWith(expect.objectContaining({left:100}));
 expect(screen.getByText('Totals content')).toBeInTheDocument();
 rail.scrollLeft=700;fireEvent.scroll(rail);
 expect(screen.getByRole('button',{name:'Scroll sidebar tabs right'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Scroll sidebar tabs left'})).toBeEnabled();
});
test('route restore is isolated, stale section falls back, and focus actions select hidden sections',()=>{
 sessionStorage.setItem('bowser:lhq:sidebar-tab:players','"removed"');
 sessionStorage.setItem('bowser:lhq:sidebar-tab:waivers','"filters"');
 const view=render(harness());open();expect(screen.getByText('Totals content')).toBeInTheDocument();
 view.rerender(harness({page:'waivers'}));expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
 open();expect(screen.getByText('Filter content')).toBeInTheDocument();
 view.rerender(harness({page:'waivers',focusPanel:{key:'research-1',id:'depth'}}));
 expect(screen.getByText('Depth content')).toBeInTheDocument();
 expect(JSON.parse(sessionStorage.getItem('bowser:lhq:sidebar-tab:waivers'))).toBe('depth');
});
test('row mousedown publishes the existing row without blocking normal controls',()=>{
 const callback=vi.fn(), click=vi.fn(),row={player_id:'1',name:'Real row'};
 render(<Grid rows={[row]} columns={[{key:'name',width:100,render:r=><button onClick={click}>{r.name}</button>}]} onRowMouseDown={callback}/>);
 fireEvent.mouseDown(screen.getByRole('button',{name:'Real row'}));expect(callback.mock.calls[0][0]).toBe(row);
 fireEvent.click(screen.getByRole('button',{name:'Real row'}));expect(click).toHaveBeenCalledOnce();
});
