// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
vi.mock('../src/lhq/DfsLineupBuilder.jsx',()=>({DfsLineupBuilder:({slate})=><div>Research lineup: {slate}</div>}));
vi.mock('../src/lhq/PlayerResearch.jsx',()=>({PlayerResearch:()=>null,ResearchButton:()=>null}));
import {LhqProvider} from '../src/lhq/shared.jsx';
import {TeamBoxScores} from '../src/lhq/TeamBoxScores.jsx';
import {DEFAULT_VISIBLE_STATS,TEAM_BOX_PREFERENCE_KEY} from '../src/teamBoxColumns.js';

const weeks=[1,2,3,4,5,6];
const schedule=weeks.map(week=>({season:2026,week,gameId:`game-${week}`,opponent:'DAL',homeAway:'home',gameday:`2026-10-${String(week).padStart(2,'0')}`,pointsFor:21,pointsAgainst:14,scoreLabel:'W 21-14'}));
const players=[['q','Quarterback Fixture','QB'],['r','Runner Fixture','RB']];
const payload={data:players.flatMap(([id,name,position])=>weeks.map(week=>({player_id:id,player_display_name:name,position,position_group:position,team:'NYG',season:2026,week,played:true,stats_available:true,snaps:40,fantasy_points:10+week,draft_kings_price:week===5?null:5000+week*100,draft_kings_projection:12+week,dfs_meta:{season:2026,week,label:`Classic week ${week}`,slateKey:`classic-${week}`}}))),meta:{schedule}};
const table=()=>screen.getByRole('table',{name:'Weekly team box scores'});
const columns=()=>within(table()).getAllByRole('columnheader').filter(th=>th.querySelector('.lhq-column-resize'));
const box=week=>within(screen.getByRole('group',{name:'Independent team matchup'})).getAllByRole('button').find(button=>button.title.includes(`2026 Week ${week} ·`));
async function page(){render(<LhqProvider><TeamBoxScores season={2026} setSeason={()=>{}} scoring="ppr" setScoring={()=>{}} onOpen={()=>{}}/></LhqProvider>);await screen.findByRole('button',{name:'Runner Fixture',exact:true});}
beforeEach(()=>{localStorage.clear();sessionStorage.clear();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('fetch',vi.fn(async input=>{const url=new URL(input,'http://fixture.test');let body;if(url.pathname.endsWith('/meta'))body=url.searchParams.get('view')==='dfs-lineup'?{data:[{playerId:'r',salary:15000,projection:40,rosterPosition:'CPT'}],meta:{season:2026,week:6,contest:'showdown',options:[{key:'showdown:cpt',label:'Showdown captain'}]}}:{availableWeeks:weeks,teams:['NYG']};else body=url.searchParams.get('season')==='2025'?{data:[],meta:{schedule:[]}}:payload;return {ok:true,json:async()=>body};}));});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

test('historical Classic salary is immediately before points, missing captures stay unavailable, and sidebar Showdown does not replace it',async()=>{
 await page();const heads=columns();for(let i=0;i<heads.length;i++)if(heads[i].textContent.startsWith('FPTS'))expect(heads[i-1].textContent).toBe('DK$');
 const runner=screen.getByRole('button',{name:'Runner Fixture',exact:true}).closest('tr');
 const salaryHeads=heads.filter(th=>th.textContent==='DK$');
 expect(runner.children[salaryHeads[0].cellIndex]).toHaveTextContent('$5.4K');
 expect(runner.children[salaryHeads[1].cellIndex]).toHaveTextContent('—');
 expect(runner.children[salaryHeads[2].cellIndex]).toHaveTextContent('$5.6K');
 fireEvent.click(screen.getByRole('button',{name:/Show sidebar/}));fireEvent.click(screen.getByRole('tab',{name:'Slate salaries & lineup cards'}));
 fireEvent.change(screen.getByLabelText('Research DFS slate'),{target:{value:'showdown:cpt'}});
 await screen.findByText('Research lineup: showdown:cpt');
 expect(runner.children[salaryHeads[2].cellIndex]).toHaveTextContent('$5.6K');
 expect(runner).not.toHaveTextContent('$15.0K');
});

test('visible Games shown expands beyond three weeks without moving the current end or replacing an independent matchup',async()=>{
 await page();expect(screen.getByLabelText('Games shown')).toHaveValue('3');
 expect(screen.queryByRole('separator',{name:'Resize week 2026-2'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Toggle game selector'}));fireEvent.click(box(1));
 expect(screen.getByRole('separator',{name:'Resize week 2026-1'})).toBeInTheDocument();
 expect(screen.getByLabelText('Through week')).toHaveValue('6');
 fireEvent.change(screen.getByLabelText('Games shown'),{target:{value:'5'}});
 for(const week of weeks)expect(screen.getByRole('separator',{name:`Resize week 2026-${week}`})).toBeInTheDocument();
 expect(box(1)).toHaveAttribute('aria-pressed','true');expect(screen.getByLabelText('Through week')).toHaveValue('6');
 fireEvent.click(within(screen.getByRole('group',{name:'Independent team matchup'})).getByRole('button',{name:/All/}));
 expect(screen.queryByRole('separator',{name:'Resize week 2026-1'})).not.toBeInTheDocument();
 for(const week of [2,3,4,5,6])expect(screen.getByRole('separator',{name:`Resize week 2026-${week}`})).toBeInTheDocument();
});

test('single independent matchup replaces the prior independent choice even with Shift and keeps range weeks',async()=>{
 await page();fireEvent.click(screen.getByRole('button',{name:'Toggle game selector'}));fireEvent.click(box(1));fireEvent.click(box(2),{shiftKey:true});
 expect(box(1)).toHaveAttribute('aria-pressed','false');expect(box(2)).toHaveAttribute('aria-pressed','true');
 expect(screen.queryByRole('separator',{name:'Resize week 2026-1'})).not.toBeInTheDocument();
 for(const week of [2,4,5,6])expect(screen.getByRole('separator',{name:`Resize week 2026-${week}`})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Toggle week 2026-2'}));expect(screen.queryByRole('separator',{name:'Resize week 2026-2'})).not.toBeInTheDocument();
});

test('position pills combine choices instead of forcing one position',async()=>{
 await page();fireEvent.click(screen.getByRole('button',{name:'Toggle game selector'}));
 fireEvent.click(screen.getByRole('button',{name:'QB',exact:true}));expect(screen.queryByRole('button',{name:'Runner Fixture',exact:true})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'RB',exact:true}));expect(screen.getByRole('button',{name:'Runner Fixture',exact:true})).toBeInTheDocument();expect(screen.getByRole('button',{name:'Quarterback Fixture',exact:true})).toBeInTheDocument();
});

test('salary visibility migrates once while an explicit DFS-off preference remains off',async()=>{
 localStorage.setItem(TEAM_BOX_PREFERENCE_KEY,JSON.stringify({visibleStats:DEFAULT_VISIBLE_STATS.filter(k=>k!=='draft_kings_price'),dfsOn:false}));
 await page();expect(columns().some(th=>th.textContent==='DK$')).toBe(false);
 const saved=JSON.parse(localStorage.getItem(TEAM_BOX_PREFERENCE_KEY));expect(saved.historicalSalaryLayout).toBe(1);expect(saved.dfsOn).toBe(false);expect(saved.visibleStats).toContain('draft_kings_price');
});
