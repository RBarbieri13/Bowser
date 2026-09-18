// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {TeamBoxScores} from '../src/TeamBoxScores.jsx';
import {MarketPulse} from '../src/MarketPulse.jsx';

const schedule=[1,2].map(week=>({week,gameId:`fixture-${week}`,opponent:'DAL'}));
const order=()=>[...screen.getByRole('table',{name:'RB week-by-week player statistics'}).querySelectorAll('tbody tr')].map(row=>row.dataset.playerId);
beforeEach(()=>{localStorage.clear();sessionStorage.clear();global.indexedDB=new IDBFactory();});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function teamPage(){
 sessionStorage.setItem('bowser:team-box-score-state:v1',JSON.stringify({season:2026,weekStart:1,weekEnd:2}));
 global.fetch=vi.fn(async input=>{const weeks=new URL(input,'http://fixture').searchParams.get('weeks').split(',').map(Number);return {ok:true,json:async()=>({data:[{id:'a',name:'Alpha',v:[30,5]},{id:'b',name:'Beta',v:[30,20]}].flatMap(p=>[1,2].filter(w=>weeks.includes(w)).map(week=>({player_id:p.id,player_display_name:p.name,position_group:'RB',position:'RB',week,fantasy_points:p.v[week-1]}))),meta:{weeks:schedule.filter(x=>weeks.includes(x.week)),schedule,playerCount:2}})};});
 return render(<TeamBoxScores season={2026} meta={{teams:['NYG']}}/>);
}
test('secondary player sort retains Week 1 primary metric',async()=>{
 teamPage();await screen.findByRole('button',{name:'Alpha',exact:true});
 fireEvent.click(screen.getByRole('button',{name:'Sort Week 1 Fantasy points',exact:true}));
 expect(order()).toEqual(['a','b']);
 fireEvent.click(screen.getByRole('button',{name:'Sort Player',exact:true}),{shiftKey:true});
 expect(order()).toEqual(['a','b']);
});
test('saved raw ESPN observations produce all available percentage-point deltas',async()=>{
 const points=[10,20,15].map((rosterPct,index)=>({capturedAt:1800000000000+index*900001,rows:[{id:'espn:1',name:'History Player',team:'BUF',position:'RB',rosterPct,startPct:5}]}));
 global.fetch=vi.fn(async input=>({ok:true,json:async()=>input.includes('provider=espn')?{provider:'espn',window:'current',capturedAt:points[2].capturedAt,history:points,rows:[{...points[2].rows[0],rosterDelta:-5}]}:{provider:'sleeper',window:'24',capturedAt:null,history:[],rows:[]}}));
 render(<MarketPulse/>);await screen.findByRole('button',{name:'History Player',exact:true});
 fireEvent.click(screen.getByRole('button',{name:'Market history for History Player'}));
 fireEvent.change(screen.getByLabelText('ESPN trend metric'),{target:{value:'rosterDelta'}});
 const history=screen.getByRole('region',{name:'Player snapshot history'});
 expect(history.querySelector('.mp-history-bars')).not.toBeNull();
 expect(within(history).getAllByText('10',{exact:true}).length).toBeGreaterThan(0);
});
