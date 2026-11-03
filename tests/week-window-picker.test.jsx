// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {useState} from 'react';
import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {WeekWindowPicker} from '../src/lhq/WeekWindowPicker.jsx';
afterEach(cleanup);
const now=Date.parse('2026-11-03T18:00:00Z');
const meta={availableWeeks:[1,2,3,4,5,6,7,8],dfsDefault:'classic8',scheduleWeeks:Array.from({length:9},(_,i)=>({week:i+1,firstGameDate:`2026-${i<4?'09':'10'}-01`,lastGameDate:'2026-11-02'})).map(r=>r.week===8?{week:8,firstGameDate:'2026-10-29',lastGameDate:'2026-11-02'}:r.week===9?{week:9,firstGameDate:'2026-11-05',lastGameDate:'2026-11-09'}:r),weekCoverage:Array.from({length:9},(_,i)=>({week:i+1,scheduledGames:14,sourcedGames:i===7?13:i===8?0:14}))};
const slates=[{key:'classic8',week:8,label:'2026 W8 · Sunday Main · archived',contestTypeId:1,isLocked:true,startsAt:'2026-11-01T18:00:00Z'},{key:'flex8',week:8,label:'2026 W8 · Monday Only · CHI @ SEA · Showdown · FLEX · archived',contestTypeId:96,rosterPosition:'FLEX',isLocked:true,startsAt:'2026-11-03T01:15:00Z'},{key:'cpt8',week:8,label:'2026 W8 · Monday Only · CHI @ SEA · Showdown · CPT · archived',contestTypeId:96,rosterPosition:'CPT',isLocked:true,startsAt:'2026-11-03T01:15:00Z'}];
function setup(initial={from:1,through:8},extra={}){
 const changed=vi.fn();
 function Harness(){
  const [range,setRange]=useState(initial),[dfs,setDfs]=useState({week:9,slate:'none',enabled:true});
  return <><WeekWindowPicker meta={meta} season={2026} now={now} {...range} onStatsChange={v=>{changed(v);setRange(v);}} dfsWeek={dfs.week} slate={dfs.slate==='none'?'':dfs.slate} slates={slates} dfsEnabled={dfs.enabled} onDfsWeek={week=>setDfs(o=>({...o,week}))} onSlate={slate=>setDfs(o=>({...o,slate}))} onDfsEnabled={enabled=>setDfs(o=>({...o,enabled}))} onLatestActuals={()=>{setRange({from:8,through:8});setDfs(o=>({...o,enabled:false}));}} {...extra}/><output aria-label="Committed range">{range.from},{range.through}</output><output aria-label="Committed DFS">{dfs.week},{dfs.slate},{String(dfs.enabled)}</output></>;
 }
 render(<Harness/>);return {changed};
}
const stats=()=>screen.getByRole('button',{name:/^Statistics window:/});
const dfs=()=>screen.getByRole('button',{name:/^DFS window:/});
const choose=(name)=>fireEvent.click(screen.getByRole('button',{name,exact:true}));
test('historical3–6 stages both endpoints, applies once, and never moves DFS',()=>{
 const {changed}=setup();fireEvent.click(stats());choose('Start week: Week 3');choose('Ending week: Week 6');
 expect(screen.getByLabelText('Committed range')).toHaveTextContent('1,8');expect(changed).not.toHaveBeenCalled();
 expect(screen.getByText('Weeks 3–6')).toBeInTheDocument();choose('Apply window');
 expect(changed).toHaveBeenCalledExactlyOnceWith({from:3,through:6,mode:'range',requestedCount:4});expect(stats()).toHaveAccessibleName('Statistics window: Weeks 3–6, 4 weeks');
 expect(screen.getByLabelText('Committed DFS')).toHaveTextContent('9,none,true');
});
test('escape cancels drafts and restores focus; arbitrary count and recent shortcuts share the same endpoint',()=>{
 setup({from:3,through:6});fireEvent.click(stats());choose('Start week: Week 2');
 fireEvent.keyDown(document,{key:'Escape'});expect(stats()).toHaveFocus();expect(screen.getByLabelText('Committed range')).toHaveTextContent('3,6');
 fireEvent.click(stats());fireEvent.change(screen.getByLabelText('Number of weeks in statistics window'),{target:{value:'2'}});choose('Apply window');expect(screen.getByLabelText('Committed range')).toHaveTextContent('5,6');
 fireEvent.click(stats());choose('Last 3 weeks through Week 6');choose('Apply window');expect(screen.getByLabelText('Committed range')).toHaveTextContent('4,6');
});
test('DFS8 Classic/Showdown/Captain are staged independently; current9 never borrows8 source',()=>{
 setup({from:3,through:6});fireEvent.click(dfs());choose('DFS week: Week 8');
 expect(screen.getByLabelText('Committed DFS')).toHaveTextContent('9,none,true');
 expect(screen.getByRole('button',{name:/Sunday Main/})).toBeInTheDocument();expect(screen.queryByRole('button',{name:/Monday Only/})).not.toBeInTheDocument();
 choose('Showdown');fireEvent.change(screen.getByLabelText('Find DFS slate or team'),{target:{value:'CHI'}});choose('Monday Only · CHI @ SEA · Showdown · CPT Mon, Nov 2, 7:15 PM CT · Locked capture');choose('Apply DFS');
 expect(screen.getByLabelText('Committed DFS')).toHaveTextContent('8,cpt8,true');expect(screen.getByLabelText('Committed range')).toHaveTextContent('3,6');
 fireEvent.click(dfs());choose('Current · W9');expect(screen.getByText(/No verified Week 9 salaries/)).toBeInTheDocument();choose('Apply DFS');expect(screen.getByLabelText('Committed DFS')).toHaveTextContent('9,none,true');
});
test('all22weeks remain selectable and latest/all-actuals actions explicitly handle player scope',()=>{
 setup();fireEvent.click(stats());choose('Start week: Week 22');choose('Apply window');expect(stats()).toHaveAccessibleName('Statistics window: Week 22, 1 week');
 fireEvent.click(stats());choose('Latest played week · W8');expect(screen.getByLabelText('Committed range')).toHaveTextContent('8,8');expect(screen.getByLabelText('Committed DFS')).toHaveTextContent('9,none,false');
});
test('apply historical range with all actuals is atomic and explicit',()=>{
 const {changed}=setup();fireEvent.click(stats());choose('Start week: Week 3');choose('Ending week: Week 6');choose('Apply range · all NFL actuals');
 expect(changed).toHaveBeenCalledExactlyOnceWith({from:3,through:6,mode:'range',requestedCount:4});expect(screen.getByLabelText('Committed DFS')).toHaveTextContent('9,none,false');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('week grid has one tab stop, arrow/Home/End navigation and source-independent current context',async()=>{
 const user=userEvent.setup();setup();await user.click(stats());const grid=screen.getByRole('group',{name:'Start week'}),first=within(grid).getByRole('button',{name:'Start week: Week 1'});
 expect(within(grid).getAllByRole('button').filter(b=>b.tabIndex===0)).toHaveLength(1);first.focus();await user.keyboard('{End}');expect(within(grid).getByRole('button',{name:'Start week: Week 22'})).toHaveFocus();
 await user.keyboard('{Enter}');expect(screen.getByText('Week 22',{exact:true})).toBeInTheDocument();await user.keyboard('{Escape}');expect(stats()).toHaveFocus();expect(screen.getByText('Today · Tue, Nov 3')).toBeInTheDocument();
});

test('absolute ranges keep their start; recent windows slide and retain a clamped requested length',()=>{
 setup({from:3,through:6});fireEvent.click(stats());choose('Through W6, choose ending week');choose('Ending week: Week 8');choose('Apply window');expect(screen.getByLabelText('Committed range')).toHaveTextContent('3,8');
 fireEvent.click(stats());fireEvent.change(screen.getByLabelText('Number of weeks in statistics window'),{target:{value:'3'}});choose('Apply window');expect(screen.getByLabelText('Committed range')).toHaveTextContent('6,8');
 fireEvent.click(stats());choose('Ending week: Week 1');choose('Apply window');expect(screen.getByLabelText('Committed range')).toHaveTextContent('1,1');
 fireEvent.click(stats());expect(screen.getByLabelText('Number of weeks in statistics window')).toHaveValue(3);choose('Ending week: Week 6');choose('Apply window');expect(screen.getByLabelText('Committed range')).toHaveTextContent('4,6');
});
