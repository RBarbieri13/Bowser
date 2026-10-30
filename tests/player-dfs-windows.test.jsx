// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,within} from '@testing-library/react';
import {LhqProvider} from '../src/lhq/shared.jsx';
import {usePlayerOwnership} from '../src/lhq/usePlayerOwnership.js';
import {PlayerDatabase} from '../src/lhq/PlayerDatabase.jsx';
const props={season:2026,setSeason:vi.fn(),scoring:'ppr',setScoring:vi.fn(),onOpen:vi.fn()};
const options=[{key:'mon',label:'Monday Showdown FLEX',season:2026,week:2,contestTypeId:96},{key:'mon:cpt',label:'Monday Showdown CPT',season:2026,week:2,contestTypeId:96},{key:'classic',label:'Classic',season:2026,week:2,contestTypeId:1}];
const athletes=[['ram','Fixture Ram','LAR'],['giant','Fixture Giant','NYG'],['buf','Fixture Bill','BUF']];
const response=data=>({ok:true,json:async()=>data});
beforeEach(()=>{
 localStorage.clear();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 vi.stubGlobal('fetch',vi.fn(async input=>{
 const u=new URL(input,'https://test.invalid'),p=u.searchParams,w=Number(p.get('week'));
 if(u.pathname.endsWith('/schedule'))return response({data:[{gameId:`2026_0${w}_NYG_LA`,awayTeam:'NYG',homeTeam:'LA',week:w,kickoffUtc:'2026-09-21T23:15:00Z'},{gameId:`2026_0${w}_BUF_NE`,awayTeam:'BUF',homeTeam:'NE',week:w}]});
 if(p.get('view')==='dfs-lineup')return response({data:athletes.filter(([id])=>p.get('dfsSlate')==='classic'||id!=='buf').flatMap(([id,name,team])=>['FLEX','CPT'].map(role=>({id:`${id}:${role}`,playerId:id,name,team,position:'WR',rosterPosition:role,salary:role==='CPT'?15000:10000,projection:role==='CPT'?30:20,gameId:id==='buf'?'2026_02_BUF_NE':'2026_02_NYG_LA'}))).concat([{id:'dk:unmatched',playerId:null,name:'Unmatched Salary Player',team:'NYG',position:'WR',rosterPosition:'FLEX',salary:200,projection:null,gameId:'2026_02_NYG_LA'}]),meta:{key:p.get('dfsSlate').replace(':cpt',''),season:2026,week:2}});
 if(u.pathname.endsWith('/player-stats')){const weeks=p.get('weeks').split(',').map(Number);return response({data:athletes.map(([id,name,team])=>({player_id:id,player_display_name:name,team:team==='LAR'?'LA':team,position:'WR',games_played:weeks.length,fantasy_points:weeks.reduce((a,b)=>a+b,0)*10,range_position_rank:2,player_trends:weeks.map(week=>({season:2026,week,snaps:week*10,team:team==='LAR'?'LA':team}))})),meta:{trendSlots:weeks.map(week=>({season:2026,week})),statsCoverage:{missingWeeks:[]}}});}
 return response({seasons:[2025,2026],availableWeeks:[1,2,3],dfsOptions:options,dfsDefault:'classic'});
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const grid=()=>screen.getByRole('table',{name:'Player statistics'});
const choose=(label,value)=>fireEvent.change(screen.getByLabelText(label),{target:{value:String(value)}});
test('initial DFS slate follows the verified current default ahead of a larger locked Classic',async()=>{
 const existingFetch=fetch;
 vi.stubGlobal('fetch',vi.fn(async input=>{
  const result=await existingFetch(input),data=await result.json();
  if(data.dfsOptions)data.dfsOptions=[{key:'locked',label:'All-week Classic · locked',season:2026,week:2,contestTypeId:1,isLocked:true},...data.dfsOptions];
  return response(data);
 }));
 render(<LhqProvider><PlayerDatabase {...props}/></LhqProvider>);
 await within(grid()).findByRole('button',{name:'Fixture Bill',exact:true});
 expect(screen.getByLabelText('DFS slate')).toHaveValue('classic');
 expect(screen.getByLabelText('Weeks back')).toHaveValue('3');
 expect(fetch.mock.calls.filter(([u])=>String(u).includes('/player-stats?')).some(([u])=>new URL(u,'https://test.invalid').searchParams.get('weeks')==='1,2,3')).toBe(true);
 choose('Base week',1);expect(screen.getByLabelText('Weeks back')).toHaveValue('1');
 choose('Base week',3);expect(screen.getByLabelText('Weeks back')).toHaveValue('3');
 choose('DFS slate','locked');
 expect(screen.getByLabelText('DFS slate')).toHaveValue('locked');
});
test('locked slate notice stays visible with complete projections and disappears when DFS is off',async()=>{
 const existingFetch=fetch;
 vi.stubGlobal('fetch',vi.fn(async input=>{
  const result=await existingFetch(input),data=await result.json();
  if(new URL(input,'https://test.invalid').searchParams.get('view')==='dfs-lineup')data.meta={...data.meta,availability:'locked',slateState:'in-progress',projectionStatus:{status:'complete'},availabilityMessage:'Slate locked at the sourced kickoff. Retained pregame capture for historical review and local drafts.'};
  return response(data);
 }));
 render(<LhqProvider><PlayerDatabase {...props}/></LhqProvider>);
 await within(grid()).findByRole('button',{name:'Fixture Bill',exact:true});
 await screen.findByText(/Slate locked at the sourced kickoff/);
 fireEvent.click(screen.getByRole('checkbox',{name:'DFS',exact:true}));
 expect(screen.queryByText(/Slate locked at the sourced kickoff/)).not.toBeInTheDocument();
});
test('base/count and DFS windows remain independent; Monday slate includes only eligible teams and missing-stat identities',async()=>{
 render(<LhqProvider><PlayerDatabase {...props}/></LhqProvider>);
 await within(grid()).findByRole('button',{name:'Fixture Bill',exact:true});
 choose('Base week',7);choose('Weeks back',3);choose('DFS slate','mon');
 await within(grid()).findByRole('button',{name:'Unmatched Salary Player',exact:true});
 expect(within(grid()).queryByRole('button',{name:'Fixture Bill',exact:true})).not.toBeInTheDocument();
 expect(within(grid()).getAllByRole('row')).toHaveLength(5); // two header rows, three salary identities
 expect(screen.getByLabelText('Base week')).toHaveValue('7');expect(screen.getByLabelText('Weeks back')).toHaveValue('3');expect(screen.getByLabelText('DFS week')).toHaveValue('2');
 const statRequests=fetch.mock.calls.filter(([u])=>String(u).includes('/player-stats?')).map(([u])=>new URL(u,'https://test.invalid').searchParams);
 expect(statRequests.at(-1).get('weeks')).toBe('5,6,7');expect(statRequests.at(-1).get('trendRange')).toBe('selected');
 expect([...grid().querySelectorAll('.lhq-bars')].every(b=>b.querySelectorAll('.lhq-bar-slot').length===3)).toBe(true);
 expect(screen.getByRole('button',{name:/NYG @ LA/})).toHaveAttribute('data-slate','true');
 expect(screen.getByRole('button',{name:/NYG @ LA/})).toHaveAttribute('aria-pressed','false');
 expect(screen.getByRole('button',{name:/BUF @ NE/})).toBeDisabled();
 expect(within(grid()).getByRole('button',{name:'Unmatched Salary Player'}).closest('tr')).not.toHaveTextContent('WR2');
 choose('DFS slate','mon:cpt');
 await waitFor(()=>expect(within(grid()).queryByRole('button',{name:'Unmatched Salary Player'})).not.toBeInTheDocument());
 expect(within(grid()).getAllByText('$15.0K')).toHaveLength(2);
});
test('game filters intersect the slate; turning DFS off restores statistics-only players and hides all DFS controls/columns',async()=>{
 render(<LhqProvider><PlayerDatabase {...props}/></LhqProvider>);
 await within(grid()).findByRole('button',{name:'Fixture Bill',exact:true});
 fireEvent.click(screen.getByRole('button',{name:/NYG @ LA/}));
 expect(within(grid()).queryByRole('button',{name:'Fixture Bill'})).not.toBeInTheDocument();
 choose('Sort','draft_kings_price');
 fireEvent.click(screen.getByRole('checkbox',{name:'DFS',exact:true}));
 expect(screen.getByLabelText('Sort')).toHaveValue('fantasy_points');
 await within(grid()).findByRole('button',{name:'Fixture Bill',exact:true});
 expect(screen.queryByLabelText('DFS week')).not.toBeInTheDocument();expect(screen.queryByLabelText('DFS slate')).not.toBeInTheDocument();
 expect(within(grid()).queryByRole('button',{name:'Sal',exact:true})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/NYG @ LA/})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Player team'}));fireEvent.click(screen.getByRole('option',{name:'BUF',exact:true}));expect(within(grid()).queryByRole('button',{name:'Fixture Ram'})).not.toBeInTheDocument();
});
test('unavailable future slates never fall back to another week and the statistics range stays fixed',async()=>{
 render(<LhqProvider><PlayerDatabase {...props}/></LhqProvider>);
 await within(grid()).findByRole('button',{name:'Fixture Bill',exact:true});
 choose('Base week',4);choose('Weeks back',2);choose('DFS week',5);
 await screen.findByText(/No verified 2026 Week 5 slate/);
 expect(screen.getByLabelText('DFS slate')).toHaveValue('none');
 expect(screen.getByLabelText('Base week')).toHaveValue('4');expect(screen.getByLabelText('Weeks back')).toHaveValue('2');
 await waitFor(()=>expect(within(grid()).getByRole('button',{name:'Fixture Bill'})).toBeInTheDocument());
 expect(within(grid()).queryByText('$10.0K')).not.toBeInTheDocument();
 choose('Base week',1);expect(screen.getByLabelText('Weeks back')).toHaveValue('1');expect(screen.getByLabelText('DFS week')).toHaveValue('5');
});

test('average follows the selected window, DFS value follows slate salary, and Kick moves to base-week hover',async()=>{
 render(<LhqProvider><PlayerDatabase {...props}/></LhqProvider>);
 await within(grid()).findByRole('button',{name:'Fixture Ram',exact:true});
 expect(within(grid()).queryByRole('button',{name:'Kick',exact:true})).not.toBeInTheDocument();
 choose('Weeks back',1);
 expect(within(grid()).queryByRole('button',{name:'Avg Fpts',exact:true})).not.toBeInTheDocument();
 choose('Weeks back',3);
 const row=await within(grid()).findByRole('button',{name:'Fixture Ram',exact:true});
 expect(row.closest('tr')).toHaveTextContent('20.0');
 expect(within(grid()).getByRole('button',{name:'Avg Fpts',exact:true})).toBeInTheDocument();
 expect(within(row.closest('tr')).getByText('2.00')).toBeInTheDocument();
 const opp=within(row.closest('tr')).getByText('NYG');fireEvent.mouseEnter(opp.closest('.lhq-tip-anchor'));
 expect(screen.getByRole('tooltip')).toHaveTextContent('2026 Week 3');
 expect(screen.getByRole('tooltip')).toHaveTextContent('Sep 21, 2026');
 expect(screen.getByRole('tooltip')).toHaveTextContent('7:15 PM ET');
 fireEvent.mouseLeave(opp.closest('.lhq-tip-anchor'));
 choose('Sort','average_fantasy_points');choose('Weeks back',1);
 expect(screen.getByLabelText('Sort')).toHaveValue('fantasy_points');
});

test('whole sections collapse into a narrow restore rail without changing adjacent widths',async()=>{
 render(<LhqProvider><PlayerDatabase {...props}/></LhqProvider>);
 await within(grid()).findByRole('button',{name:'Fixture Ram',exact:true});
 const before=[...grid().querySelectorAll('col')].map(c=>c.style.width);
 const header=screen.getByRole('button',{name:'Hide rushing section'}).closest('th');expect(header.colSpan).toBe(4);
 fireEvent.click(screen.getByRole('button',{name:'Hide rushing section'}));
 expect(screen.queryByRole('button',{name:'rushing trend settings'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Show rushing section'}).closest('th').colSpan).toBe(1);
 expect([...grid().querySelectorAll('col')].filter(c=>c.style.width==='32px')).toHaveLength(1);
 expect(screen.getByRole('button',{name:'Show rushing section'})).toHaveTextContent('RUSH');
 expect(JSON.parse(localStorage.getItem('bowser:lhq:players:collapsed-groups:v1'))).toEqual(['rushing']);
 fireEvent.click(screen.getByRole('button',{name:'Show rushing section'}));
 expect([...grid().querySelectorAll('col')].map(c=>c.style.width)).toEqual(before);
 expect(grid().querySelectorAll('tbody tr:first-child .lhq-section-boundary').length).toBe(7);
});


test('statistics default to latest complete week while partial current week remains selectable',async()=>{
 const existingFetch=fetch;
 vi.stubGlobal('fetch',vi.fn(async input=>{
  const result=await existingFetch(input),data=await result.json();
  if(data.availableWeeks){data.availableWeeks=[1,2,3,4,5];data.latestCompleteWeek=4;data.weekCoverage=[{week:4,completedGames:16,sourcedGames:16,scheduledGames:16},{week:5,completedGames:1,sourcedGames:1,scheduledGames:15}];}
  return response(data);
 }));
 render(<LhqProvider><PlayerDatabase {...props}/></LhqProvider>);
 await within(grid()).findByRole('button',{name:'Fixture Bill',exact:true});
 expect(screen.getByLabelText('Base week')).toHaveValue('4');
 expect(screen.getByLabelText('Weeks back')).toHaveValue('4');
 expect(screen.getByRole('option',{name:'Week 5 · partial'})).toBeInTheDocument();
 choose('Base week',5);
 expect(screen.getByLabelText('Base week')).toHaveValue('5');
 expect(fetch.mock.calls.some(([u])=>String(u).includes('weeks=1%2C2%2C3%2C4%2C5'))).toBe(true);
});

test('LEFA follows real Yahoo read interface, filters one column after activity and Finish, and Clear All preserves other filters',async()=>{
 const leagues=[{key:'999.l.1',name:'Loongi League'},{key:'999.l.2',name:'LOEG'},{key:'999.l.3',name:'Fart League'}];
 const yahoo={status:{connected:true},account:{season:2026,leagues,teams:leagues.map(l=>({key:`${l.key}.t.1`,leagueKey:l.key}))},busy:false,loadOwnershipPage:vi.fn(async(team,start)=>({start,exhausted:true,nextStart:null,checkedAt:new Date().toISOString(),players:athletes.map(([id,name,nfl],i)=>({key:`999.p.${i}`,name,team:nfl,position:'WR',owned:id!=='ram',ownershipType:id==='ram'?'freeagents':'team',isMine:id==='giant'&&team==='999.l.1.t.1'}))}))};
 function App(){const ownership=usePlayerOwnership(yahoo,2026);return <LhqProvider><PlayerDatabase {...props} yahoo={yahoo} ownership={ownership}/></LhqProvider>;}
 render(<App/>);
 await waitFor(()=>expect(screen.getByText(/3\/4 fully checked/)).toBeInTheDocument());
 const r=within(grid()).getByRole('button',{name:'Fixture Giant',exact:true}).closest('tr');
 expect(r.lastChild).toHaveClass('lefa-column');expect(r.lastChild).toHaveTextContent('★●●≋');expect(r.lastChild.previousSibling).toHaveClass('activity-column');expect(r.lastChild.previousSibling.previousSibling).toHaveClass('activity-column');expect(r.lastChild.previousSibling.previousSibling.previousSibling).toHaveTextContent('WR2');
 const headings=within(grid()).getAllByRole('columnheader');expect(headings.findIndex(h=>h.textContent==='Fin')).toBeLessThan(headings.findIndex(h=>h.querySelector('[aria-label="Sleeper activity source settings"]')));
 expect(screen.getByRole('separator',{name:'Resize Sleeper activity'})).toHaveAttribute('aria-valuenow','114');
 fireEvent.change(screen.getByPlaceholderText('Search Players'),{target:{value:'Fixture'}});
 fireEvent.click(screen.getByRole('button',{name:'Filter All leagues ownership'}));
 fireEvent.click(screen.getByRole('button',{name:'None',exact:true}));
 fireEvent.click(screen.getByRole('checkbox',{name:/Unowned/}));
 expect(within(grid()).queryByRole('button',{name:'Fixture Giant',exact:true})).not.toBeInTheDocument();
 expect(within(grid()).getByRole('button',{name:'Fixture Ram',exact:true})).toBeInTheDocument();
 fireEvent.keyDown(document,{key:'Escape'});
 fireEvent.click(screen.getByRole('button',{name:'Clear All'}));
 expect(within(grid()).getByRole('button',{name:'Fixture Giant',exact:true})).toBeInTheDocument();
 expect(screen.getByPlaceholderText('Search Players')).toHaveValue('Fixture');
 expect(yahoo.loadOwnershipPage).toHaveBeenCalledTimes(3);
});

test('Sleeper and Yahoo independently collapse to restore rails and remember visibility across reloads',async()=>{
 const view=render(<LhqProvider><PlayerDatabase {...props}/></LhqProvider>);
 await within(grid()).findByRole('button',{name:'Fixture Bill',exact:true});
 const initialWidth=Number.parseFloat(grid().style.width);
 fireEvent.keyDown(screen.getByRole('separator',{name:'Resize Sleeper activity'}),{key:'ArrowRight'});
 expect(screen.getByRole('separator',{name:'Resize Sleeper activity'})).toHaveAttribute('aria-valuenow','118');
 fireEvent.click(screen.getByRole('button',{name:'Hide Sleeper market trends'}));
 expect(screen.queryByRole('button',{name:'Sort Sleeper adds'})).not.toBeInTheDocument();
 expect(screen.queryByLabelText(/^sleeper adds:/)).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Show Sleeper market trends'}).closest('th')).toHaveClass('activity-collapsed');
 expect(Number.parseFloat(grid().style.width)).toBe(initialWidth-96);
 expect(screen.getByRole('button',{name:'Sort Yahoo adds'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Hide Yahoo market trends'}));
 expect(screen.queryByRole('button',{name:'Yahoo activity source settings'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Clear All'})).toBeInTheDocument();
 expect(Number.parseFloat(grid().style.width)).toBe(initialWidth-192);
 view.unmount();
 render(<LhqProvider><PlayerDatabase {...props}/></LhqProvider>);
 await within(grid()).findByRole('button',{name:'Fixture Bill',exact:true});
 expect(screen.getByRole('button',{name:'Show Sleeper market trends'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Show Yahoo market trends'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Show Sleeper market trends'}));
 expect(screen.getByRole('separator',{name:'Resize Sleeper activity'})).toHaveAttribute('aria-valuenow','118');
 expect(screen.getByRole('button',{name:'Sort Sleeper net adds'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Show Yahoo market trends'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Show Yahoo market trends'}));
 expect(screen.getByRole('button',{name:'Sort Yahoo net adds'})).toBeInTheDocument();
 expect(Number.parseFloat(grid().style.width)).toBe(initialWidth+4);
});
