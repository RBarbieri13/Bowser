// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {test,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {LhqProvider} from '../src/lhq/shared.jsx';
import {PositionalUsage} from '../src/lhq/PositionalUsage.jsx';
const slots=[{season:2025,week:17},{season:2025,week:18},{season:2026,week:1},{season:2026,week:2},{season:2026,week:3}];
const people=[{playerId:'a',name:'Receiver Alpha',player_display_name:'Receiver Alpha',team:'LA',position:'WR',depthPosition:'WR',depthRank:1},{playerId:'b',name:'Receiver Beta',player_display_name:'Receiver Beta',team:'LA',position:'WR',depthPosition:'WR',depthRank:2},{playerId:'q',name:'Quarterback Gamma',player_display_name:'Quarterback Gamma',team:'BUF',position:'QB',depthPosition:'QB',depthRank:1}];
const reply=data=>({ok:true,json:async()=>data});
beforeEach(()=>{
 localStorage.clear();vi.stubGlobal('fetch',vi.fn(async url=>{
  const u=new URL(url,'https://test.invalid');
  if(u.searchParams.get('view')==='research-roster')return reply({data:people,meta:{rosterSeason:2026}});
  return reply({data:{groups:['WR','QB'].map(position=>({position,players:people.filter(p=>p.position===position&&p.team===u.searchParams.get('team')).map((p,i)=>({...p,history:slots.map((slot,j)=>({...slot,...(j===1?{}:{snaps:i?2:40,targets:i?0:8,receptions:5,receivingYards:75,receivingTds:1,fantasyPoints:j===4?-1:18})}))}))}))},meta:{rosterSeason:2026,trendSlots:slots,trendDomains:{snaps:{min:0,max:80},fantasy_points:{min:-10,max:60}},depthUpdatedAt:'2026-09-29T12:00:00Z'}});
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
test('selected player follows sourced team and position with six aligned WR metrics and exact missing/zero callouts',async()=>{
 render(<LhqProvider><PositionalUsage selected={people[0]} season={2026} baseWeek={3}/></LhqProvider>);
 await screen.findByRole('button',{name:'Receiver Alpha',exact:true});
 expect(screen.getByLabelText('Usage team')).toHaveValue('LA');expect(screen.getByLabelText('Usage position')).toHaveValue('WR');
 expect(document.querySelectorAll('.lhq-usage-player')).toHaveLength(2);
 expect(document.querySelectorAll('.lhq-usage-player.selected .lhq-usage-metric')).toHaveLength(6);
 expect([...document.querySelectorAll('.lhq-bars')].every(chart=>chart.children.length===5)).toBe(true);
 const first=screen.getByRole('img',{name:/Receiver Alpha: Snaps/}),second=screen.getByRole('img',{name:/Receiver Beta: Snaps/});
 expect(first).toHaveAccessibleName(/2025 W18: unavailable/);
 expect(first.querySelector('.lhq-bar-plot i')).toHaveStyle({height:'50%'});
 expect(second.querySelector('.lhq-bar-plot i')).toHaveStyle({height:'2.5%'});
 expect(screen.getByRole('img',{name:/Receiver Beta: Targets/})).toHaveAccessibleName(/2026 W3: 0/);
 expect(screen.getByRole('img',{name:/Receiver Alpha: Fantasy points/})).toHaveAccessibleName(/2026 W3: -1/);
 expect(fetch.mock.calls.some(([url])=>String(url).includes('weeks=3&games=5'))).toBe(true);
});
test('manual team/position and comparison controls work, then a newly selected player resets the context',async()=>{
 const {rerender}=render(<LhqProvider><PositionalUsage season={2026} baseWeek={3}/></LhqProvider>);
 await screen.findByRole('option',{name:'BUF'});
 fireEvent.change(screen.getByLabelText('Usage team'),{target:{value:'BUF'}});fireEvent.change(screen.getByLabelText('Usage position'),{target:{value:'QB'}});
 await screen.findByRole('button',{name:'Quarterback Gamma',exact:true});
 fireEvent.click(screen.getByRole('button',{name:'Compare stat',exact:true}));
 fireEvent.change(screen.getByLabelText('Usage comparison statistic'),{target:{value:'passing_yards'}});
 expect(screen.getAllByRole('img')).toHaveLength(1);
 expect(screen.getByRole('img')).toHaveAccessibleName(/Passing yards/);
 rerender(<LhqProvider><PositionalUsage selected={people[0]} season={2026} baseWeek={3}/></LhqProvider>);
 await waitFor(()=>expect(screen.getByLabelText('Usage team')).toHaveValue('LA'));
 expect(screen.getByLabelText('Usage position')).toHaveValue('WR');
 expect(screen.getByLabelText('Usage comparison statistic')).toHaveValue('snaps');
 await screen.findByRole('button',{name:'Receiver Beta',exact:true});
 expect(screen.queryByRole('button',{name:'Quarterback Gamma',exact:true})).not.toBeInTheDocument();
});

test('sorts entire six-stat blocks by any week and metric, preserves ties, and keeps unavailable last',async()=>{
 const rows=[...people.slice(0,2),{...people[0],playerId:'c',name:'Receiver Missing',depthRank:3}];
 fetch.mockImplementation(async url=>String(url).includes('research-roster')?reply({data:rows}):reply({data:{groups:[{position:'WR',players:rows.map((p,i)=>({...p,history:slots.map((s,j)=>({...s,snaps:10,targets:i===2?null:(i===0?4:9),fantasyPoints:j===1?(i===0?0:i===1?-2:null):5}))}))}]},meta:{trendSlots:slots}}));
 render(<LhqProvider><PositionalUsage selected={rows[0]} season={2026} baseWeek={3}/></LhqProvider>);
 await screen.findByRole('button',{name:'Receiver Missing',exact:true});
 const names=()=>[...document.querySelectorAll('.lhq-usage-player>header .lhq-player')].map(n=>n.textContent);
 expect(names()).toEqual(['Receiver Alpha','Receiver Beta','Receiver Missing']);
 fireEvent.change(screen.getByLabelText('Usage sort statistic'),{target:{value:'targets'}});
 expect(names()).toEqual(['Receiver Beta','Receiver Alpha','Receiver Missing']);
 expect([...document.querySelectorAll('.lhq-usage-player')].every(p=>p.querySelectorAll('.lhq-usage-metric').length===6)).toBe(true);
 expect(screen.getByRole('button',{name:'Sort usage by 2026 Week 3'})).toHaveAttribute('aria-pressed','true');
 fireEvent.change(screen.getByLabelText('Usage sort statistic'),{target:{value:'fantasy_points'}});
 fireEvent.change(screen.getByLabelText('Usage sort week'),{target:{value:'1'}});
 fireEvent.click(screen.getByRole('button',{name:/Usage sort: highest first/}));
 expect(names()).toEqual(['Receiver Beta','Receiver Alpha','Receiver Missing']);
 expect(screen.getByRole('status')).toHaveTextContent('Fantasy points · 2025 W18 · lowest first');
 fireEvent.click(screen.getByRole('button',{name:'Sort usage by 2025 Week 18'}));
 expect(names()).toEqual(['Receiver Alpha','Receiver Beta','Receiver Missing']);
 // A new week starts descending; tied values retain official source order.
 fireEvent.click(screen.getByRole('button',{name:'Sort usage by 2026 Week 1'}));
 expect(names()).toEqual(['Receiver Alpha','Receiver Beta','Receiver Missing']);
 fireEvent.change(screen.getByLabelText('Usage sort statistic'),{target:{value:''}});
 expect(screen.getByRole('button',{name:/Usage sort: highest first/})).toBeDisabled();
 expect(names()).toEqual(['Receiver Alpha','Receiver Beta','Receiver Missing']);
});

test('week-header sorting works in comparison mode and survives view switches without modifying history',async()=>{
 render(<LhqProvider><PositionalUsage selected={people[0]} season={2026} baseWeek={3}/></LhqProvider>);
 await screen.findByRole('button',{name:'Receiver Beta',exact:true});
 fireEvent.click(screen.getByRole('button',{name:'Compare stat',exact:true}));
 fireEvent.change(screen.getByLabelText('Usage comparison statistic'),{target:{value:'targets'}});
 fireEvent.click(screen.getByRole('button',{name:'Sort usage by 2026 Week 3'}));
 expect(screen.getByLabelText('Usage sort statistic')).toHaveValue('targets');
 fireEvent.click(screen.getByRole('button',{name:'Sort usage by 2026 Week 3'}));
 expect([...document.querySelectorAll('.lhq-usage-comparison .lhq-player')].map(n=>n.textContent)).toEqual(['Receiver Beta','Receiver Alpha']);
 fireEvent.click(screen.getByRole('button',{name:'By player',exact:true}));
 expect(document.querySelector('.lhq-usage-player .lhq-player')).toHaveTextContent('Receiver Beta');
 expect(screen.getByRole('img',{name:/Receiver Beta: Targets/})).toHaveAccessibleName(/2025 W18: unavailable.*2026 W3: 0/);
});


test('hides zero-snap and missing-snap players in every metric and both views, but keeps partial-window participants',async()=>{
 const rows=['Active','Zero','Missing','Outside'].map((name,i)=>({...people[0],playerId:String(i),name,depthRank:i+1}));
 fetch.mockImplementation(async url=>String(url).includes('research-roster')?reply({data:rows}):reply({data:{groups:[{position:'WR',players:rows.map((p,i)=>({...p,history:[...slots.map((s,j)=>({...s,snaps:i===0&&j===4?1:i===2?null:0,targets:0,fantasyPoints:0})),{season:2025,week:16,snaps:70}]}))}]},meta:{trendSlots:slots}}));
 render(<LhqProvider><PositionalUsage selected={rows[1]} season={2026} baseWeek={3}/></LhqProvider>);
 await screen.findByRole('button',{name:'Active',exact:true});
 expect(document.querySelectorAll('.lhq-usage-player')).toHaveLength(1);
 expect(document.querySelectorAll('.lhq-usage-metric')).toHaveLength(6);
 for(const name of ['Zero','Missing','Outside'])expect(screen.queryByRole('button',{name,exact:true})).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Usage sort statistic'),{target:{value:'targets'}});
 fireEvent.click(screen.getByRole('button',{name:'Compare stat',exact:true}));
 for(const metric of ['snaps','targets','receptions','receiving_yards','receiving_tds','fantasy_points']){
  fireEvent.change(screen.getByLabelText('Usage comparison statistic'),{target:{value:metric}});
  expect(document.querySelectorAll('.lhq-usage-comparison')).toHaveLength(1);
  expect(screen.getAllByRole('img')).toHaveLength(1);
 }
});

test('explains an empty position group when nobody recorded snaps in the displayed window',async()=>{
 fetch.mockImplementation(async url=>String(url).includes('research-roster')?reply({data:people}):reply({data:{groups:[{position:'WR',players:[{...people[0],history:slots.map(s=>({...s,snaps:0}))}]}]},meta:{trendSlots:slots}}));
 render(<LhqProvider><PositionalUsage selected={people[0]} baseWeek={3}/></LhqProvider>);
 await screen.findByText('No LA WR players have recorded snaps in these five weeks.');
 expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
