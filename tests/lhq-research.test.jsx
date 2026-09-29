// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {LhqProvider} from '../src/lhq/shared.jsx';
import {PlayerDatabase} from '../src/lhq/PlayerDatabase.jsx';
import {PlayerResearch} from '../src/lhq/PlayerResearch.jsx';
const props={season:2026,setSeason:vi.fn(),scoring:'ppr',setScoring:vi.fn(),onOpen:vi.fn()};
const player={player_id:'test-a',player_display_name:'Test Alpha',team:'LA',position:'QB',games_played:2,passing_yards:650,fantasy_points:50,range_position_rank:2,position_finish:7,player_trends:[1,2,3,4,5].map(week=>({week,season:2026,label:`2026 W${week}`,snaps:week*10}))};
const reply=data=>({ok:true,json:async()=>data});
beforeEach(()=>{localStorage.clear();sessionStorage.clear();vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});vi.stubGlobal('fetch',vi.fn(async url=>reply(String(url).includes('player-stats')?{data:[player],meta:{statsCoverage:{missingWeeks:[2]}}}:{data:[],seasons:[2025,2026]})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
test('original image brand and contextual sidebar remain collapsed initially',async()=>{
 render(<LhqProvider><PlayerDatabase {...props}/></LhqProvider>);
 expect(screen.getByAltText('Bowser')).toHaveAttribute('src',expect.stringContaining('bowser-logo.png'));
 await screen.findByRole('button',{name:'Test Alpha',exact:true});
 expect(document.querySelector('.lhq-sidebar')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Research Test Alpha in sidebar'}));
 expect(screen.getByRole('button',{name:'Selected player · statistics −'})).toHaveAttribute('aria-expanded','true');
 expect(screen.getByLabelText('Research player')).toHaveValue('test-a');
});
test('range finish displays aggregate rank, missing-week coverage, and independent three-week trend controls',async()=>{
 render(<LhqProvider><PlayerDatabase {...props}/></LhqProvider>);
 await screen.findByText('QB2');
 expect(screen.queryByText('QB7')).toBeNull();
 expect(screen.getByRole('status')).toHaveTextContent('statistics unavailable for W2');
 fireEvent.click(screen.getByRole('button',{name:'usage trend settings'}));
 fireEvent.change(screen.getByLabelText('usage trend history'),{target:{value:'3'}});
 fireEvent.click(screen.getByRole('button',{name:'Done',exact:true}));
 await waitFor(()=>expect(document.querySelectorAll('.lhq-bars')[0].querySelectorAll('.lhq-bar-slot')).toHaveLength(3));
 const grid=document.querySelector('.lhq-grid');const colWidths=[...grid.querySelectorAll('col')].map(c=>c.style.width);
 fireEvent.click(screen.getByRole('button',{name:'Hide usage trend'}));
 const widths=[...grid.querySelectorAll('col')].map(c=>c.style.width);
 expect(widths.filter((w,i)=>w!==colWidths[i])).toEqual(['18px']);
 fireEvent.click(screen.getByRole('button',{name:'Show usage trend'}));
 expect([...grid.querySelectorAll('col')].map(c=>c.style.width)).toEqual(colWidths);
});
test('selected player statistics sum exact weeks including real zero and exclude unselected games',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>reply({data:{gameLogs:[{week:1,passing_yards:200,fantasy_points:0},{week:2,passing_yards:300,fantasy_points:10},{week:3,passing_yards:900,fantasy_points:90}]}})));
 render(<LhqProvider><PlayerResearch kind="player" selected={player} rows={[player]} {...props} weeks="1,2"/></LhqProvider>);
 expect(await screen.findByText('500')).toBeInTheDocument();
 expect(screen.queryByText('1,400')).toBeNull();
 expect(screen.getByText('2 sourced games in selected range')).toBeInTheDocument();
});
