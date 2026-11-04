// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {useState} from 'react';
import {afterEach,expect,test} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {WeekWindowPicker} from '../src/lhq/WeekWindowPicker.jsx';
import {expectDfsWeek,expectStats,setDfsSlate,setDfsWeek,setStatsCount,setStatsThrough,toggleDfs} from './week-window-actions.js';

afterEach(cleanup);
const now=Date.parse('2026-11-03T18:00:00Z');
const meta={
 availableWeeks:[8],
 scheduleWeeks:[
  {week:8,firstGameDate:'2026-10-29',lastGameDate:'2026-11-02'},
  {week:9,firstGameDate:'2026-11-05',lastGameDate:'2026-11-09'}
 ],
 weekCoverage:[{week:8,scheduledGames:14,completedGames:13,sourcedGames:13}]
};
const slates=[
 {key:'classic8',label:'2026 W8 · Sunday Main · archived'},
 {key:'flex8',label:'2026 W8 · Monday Only · CHI @ SEA · Showdown · FLEX · archived'},
 {key:'cpt8',label:'2026 W8 · Monday Only · CHI @ SEA · Showdown · CPT · archived'}
];

function setup(){
 function Harness(){
  const [baseWeek,setBaseWeek]=useState(8),[count,setCount]=useState(8),[trendCount,setTrendCount]=useState(5);
  const [dfsWeek,setDfsWeek]=useState(9),[slate,setSlate]=useState(''),[dfsEnabled,setDfsEnabled]=useState(true);
  return <WeekWindowPicker meta={meta} now={now} baseWeek={baseWeek} count={Math.min(count,baseWeek)} onBaseChange={setBaseWeek}
   onCountChange={setCount} trendCount={trendCount} onTrendCountChange={setTrendCount}
   dfsWeek={dfsWeek} slate={slate} weekSlates={dfsWeek===8?slates:[]} dfsEnabled={dfsEnabled}
   onDfsWeek={week=>{setDfsWeek(Number(week));setSlate(Number(week)===8?'classic8':'');}} onSlate={setSlate} onDfsEnabled={setDfsEnabled}/>;
 }
 render(<Harness/>);
}

test('historical totals use the inclusive Base week and Weeks back without moving trends or DFS',async()=>{
 setup();
 const user=userEvent.setup();
 await user.tab();
 expect(screen.getByLabelText('Base week')).toHaveFocus();
 await user.selectOptions(screen.getByLabelText('Base week'),'6');
 await user.selectOptions(screen.getByLabelText('Weeks back'),'4');
 expectStats(3,6);
 expect(screen.getByLabelText('Trend history')).toHaveValue('5');
 expectDfsWeek(9);
 expect(within(screen.getByLabelText('Base week')).getAllByRole('option')).toHaveLength(22);
 expect(within(screen.getByLabelText('Weeks back')).getAllByRole('option')).toHaveLength(6);
});

test('trend history changes independently and a clamped lookback is retained on return',()=>{
 setup();
 setStatsCount(3);
 expectStats(6,8);
 fireEvent.change(screen.getByLabelText('Trend history'),{target:{value:'9'}});
 expectStats(6,8);
 expectDfsWeek(9);
 setStatsThrough(1);
 expectStats(1,1);
 setStatsThrough(6);
 expectStats(4,6);
 expect(screen.getByLabelText('Trend history')).toHaveValue('9');
});

test('DFS keeps exact Classic, FLEX and CPT choices and an unavailable week clears the slate',()=>{
 setup();
 setDfsWeek(8);
 const slate=()=>screen.getByLabelText('DFS slate');
 expect(slate()).toHaveValue('classic8');
 expect(within(slate()).getByRole('option',{name:/Showdown · FLEX/})).toHaveValue('flex8');
 expect(within(slate()).getByRole('option',{name:/Showdown · CPT/})).toHaveValue('cpt8');
 setDfsSlate('cpt8');
 expect(slate()).toHaveValue('cpt8');
 setDfsWeek(9);
 expect(slate()).toHaveValue('none');
 expect(within(slate()).getAllByRole('option')).toHaveLength(1);
 toggleDfs();
 expect(screen.queryByLabelText('DFS slate')).not.toBeInTheDocument();
 expectStats(1,8);
 expect(screen.getByLabelText('Trend history')).toHaveValue('5');
});

test('the current sourced stats week and today’s DFS schedule week have distinct context',()=>{
 setup();
 expect(within(screen.getByLabelText('Base week')).getByRole('option',{name:'Week 8 · partial'})).toBeInTheDocument();
 expect(within(screen.getByLabelText('DFS week')).getByRole('option',{name:'Week 9 · today'})).toBeInTheDocument();
 expect(screen.getByRole('group',{name:'Statistics window'})).toHaveAttribute('title',expect.stringContaining('Tue, Nov 3 CT. Current stats W8.'));
});
