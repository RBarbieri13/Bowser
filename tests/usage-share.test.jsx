// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {useState} from 'react';
import {test,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,within} from '@testing-library/react';
import {UsageShare,useUsageShareState,USAGE_SHARE_STATS,usageSurname} from '../src/lhq/UsageShare.jsx';
const slots=[{season:2025,week:17},{season:2025,week:18},{season:2026,week:1},{season:2026,week:2},{season:2026,week:3}];
const rows=[
 {playerId:'a',name:'Tyrone Tracy Jr.',position:'RB',team:'NYG',depthPosition:'RB',depthRank:1,history:slots.map((s,i)=>({...s,played:i!==0,snaps:i===0?99:20,rushAttempts:0,rushingYards:i===1?null:30,targets:2,receptions:1,fantasyPoints:i===4?-1.2:5}))},
 {playerId:'b',name:'Patrick Ricard',position:'RB',team:'NYG',depthPosition:'FB',depthRank:1,history:slots.map(s=>({...s,played:true,snaps:40,rushAttempts:4,rushingYards:8,targets:0,receptions:0,fantasyPoints:8}))},
 {playerId:'z',name:'Zero Snap',position:'RB',team:'NYG',depthRank:3,history:slots.map(s=>({...s,played:true,snaps:0,fantasyPoints:0}))},
];
const receiver={playerId:'r',name:'Receiver Alpha',position:'WR',team:'LA',depthRank:1,history:slots.map(s=>({...s,played:true,snaps:50,targets:8,receptions:6,receivingYards:80,receivingTds:1,fantasyPoints:20}))};
const payload=players=>({data:{groups:[{position:'RB',players},{position:'WR',players:[receiver]}]},meta:{depthUpdatedAt:'2026-09-28T15:17:00Z',trendSlots:slots}});
function Harness({selected=rows[0]}){const workspace=useUsageShareState({selected,season:2026,baseWeek:3,scoring:'ppr',availableWeeks:[1,2]});const [show,setShow]=useState(true);return <><button onClick={()=>setShow(!show)}>Toggle body</button><button onClick={()=>workspace.selectPlayer(selected)}>Click selected main row</button><output>{workspace.clock.join(' | ')}</output>{show&&<UsageShare workspace={workspace}/>}</>;}
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>payload(rows)}))));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
test('maps sourced depth and five aligned weeks into exact stat blocks, gaps, zeroes, leaders and negative fantasy points',async()=>{
 const immutable=JSON.stringify(rows);render(<Harness/>);
 await screen.findByRole('table',{name:'NYG RB five-week usage share'});
 const table=screen.getByRole('table');expect([...table.querySelectorAll('tbody')].map(t=>t.dataset.stat)).toEqual(['snaps','rushAttempts','rushingYards','targets','receptions','fantasyPoints']);
 expect(table).not.toHaveTextContent('Zero');expect(table).toHaveTextContent('FB1');expect(usageSurname('Tyrone Tracy Jr.')).toBe('Tracy');
 expect(screen.getByRole('columnheader',{name:'26·3'})).toHaveClass('unavailable-week');
 const snaps=table.querySelector('tbody[data-stat="snaps"]');
 const tracy=snaps.querySelector('[data-player="a"]');expect(tracy).toHaveClass('focused');
 expect(tracy.querySelectorAll('.usage-share-chip')[0]).toHaveTextContent('—');expect(tracy.querySelectorAll('.usage-share-chip')[0].title).toContain('no recorded game');
 const ricard=snaps.querySelector('[data-player="b"]');expect(ricard.querySelector('.usage-share-chip')).toHaveStyle({fontWeight:'700',background:'rgba(62, 207, 142, 0.78)'});
 expect(tracy.querySelectorAll('.usage-share-chip')[1]).toHaveStyle({fontWeight:'400',background:'rgba(62, 207, 142, 0.44)'});
 expect(tracy.querySelector('.usage-share-total')).toHaveTextContent('80');
 const carries=table.querySelector('tbody[data-stat="rushAttempts"] [data-player="a"] .usage-share-chip:not(.gap)');expect(carries).toHaveTextContent('0');expect(carries).toHaveStyle({background:'rgba(168, 124, 255, 0.1)'});
 const yards=table.querySelector('tbody[data-stat="rushingYards"] [data-player="a"]');expect(yards.querySelectorAll('.usage-share-chip')[1].title).toContain('not in 2025 capture');
 const fpts=table.querySelector('tbody[data-stat="fantasyPoints"] [data-player="a"]');expect(fpts.querySelectorAll('.usage-share-chip')[4]).toHaveTextContent('-1.2');expect(fpts.querySelector('.usage-share-total')).toHaveTextContent('13.8');
 expect(screen.getByRole('status')).toHaveTextContent('Stats: 2025 W17 → 2026 W3');expect(JSON.stringify(rows)).toBe(immutable);
 expect(String(fetch.mock.calls[0][0])).toContain('historyAnchor=requested');
});
test('focus pins selection across tab/collapse unmounts, follows new selections only when enabled, and caches team requests',async()=>{
 const {rerender}=render(<Harness/>);await screen.findByRole('table');
 fireEvent.click(screen.getByRole('button',{name:'Focus Patrick Ricard · Snaps'}));expect(screen.getByRole('button',{name:'Pinned'})).toHaveAttribute('aria-pressed','false');
 rerender(<Harness selected={receiver}/>);expect(screen.getByLabelText('Usage share team')).toHaveValue('NYG');
 fireEvent.click(screen.getByText('Toggle body'));fireEvent.click(screen.getByText('Toggle body'));
 await screen.findByRole('table');expect(screen.getByRole('button',{name:'Pinned'})).toBeInTheDocument();expect(document.querySelector('tbody[data-stat="snaps"] [data-player="b"]')).toHaveClass('focused');expect(fetch).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Pinned'}));await waitFor(()=>expect(screen.getByLabelText('Usage share team')).toHaveValue('LA'));
 expect(screen.getByLabelText('Usage share position')).toHaveValue('WR');await screen.findByRole('table',{name:'LA WR five-week usage share'});
 expect([...document.querySelectorAll('tbody')].map(t=>t.dataset.stat)).toEqual(USAGE_SHARE_STATS.WR.map(s=>s[0]));
 fireEvent.change(screen.getByLabelText('Usage share team'),{target:{value:'NYG'}});fireEvent.change(screen.getByLabelText('Usage share position'),{target:{value:'RB'}});
 await screen.findByRole('table',{name:'NYG RB five-week usage share'});expect(document.querySelector('tbody[data-stat="snaps"] [data-player="a"]')).toHaveClass('focused');
 // Position changes reuse the team's complete opportunity response.
 expect(fetch).toHaveBeenCalledTimes(2);
});
test('keeps unranked active players last, caps six, expands honestly and excludes only inactive displayed-window players',async()=>{
 const more=Array.from({length:7},(_,i)=>({...rows[0],playerId:`p${i}`,name:`Player ${i}`,depthRank:i===0?null:i,history:[...slots.map((s,j)=>({...s,played:true,snaps:j===4?1:0})),{season:2025,week:16,played:true,snaps:90}]}));
 more.push({...rows[0],playerId:'outside',name:'Outside Only',history:[...slots.map(s=>({...s,played:false,snaps:0})),{season:2025,week:16,played:true,snaps:90}]});
 fetch.mockImplementation(async()=>({ok:true,json:async()=>payload(more)}));render(<Harness/>);await screen.findByRole('table');
 let snaps=document.querySelector('tbody[data-stat="snaps"]');expect(snaps.querySelectorAll('[data-player]')).toHaveLength(6);expect(snaps.querySelector('[data-player="p0"]')).toBeNull();expect(screen.queryByText('Only')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'+1 more on the depth chart'}));snaps=document.querySelector('tbody[data-stat="snaps"]');expect(snaps.querySelectorAll('[data-player]')).toHaveLength(7);expect([...snaps.querySelectorAll('[data-player]')].at(-1)).toHaveAttribute('data-player','p0');expect(snaps.querySelector('[data-player="p0"] .usage-share-depth')).toHaveTextContent('—');
 fireEvent.click(screen.getByRole('button',{name:'Show top 6 only'}));expect(snaps.querySelectorAll('[data-player]')).toHaveLength(6);
});

test('an explicit click on the same selected main row restores manual context only while following',async()=>{
 render(<Harness/>);await screen.findByRole('table');
 fireEvent.change(screen.getByLabelText('Usage share team'),{target:{value:'LA'}});
 await screen.findByRole('table',{name:'LA RB five-week usage share'});
 fireEvent.click(screen.getByRole('button',{name:'Click selected main row'}));
 await screen.findByRole('table',{name:'NYG RB five-week usage share'});
 expect(document.querySelector('tbody[data-stat="snaps"] [data-player="a"]')).toHaveClass('focused');
 fireEvent.click(screen.getByRole('button',{name:'Follows selection'}));
 fireEvent.change(screen.getByLabelText('Usage share team'),{target:{value:'LA'}});
 fireEvent.click(screen.getByRole('button',{name:'Click selected main row'}));
 expect(screen.getByLabelText('Usage share team')).toHaveValue('LA');
});
test('reveals a followed player beyond the first six while preserving a subsequent deliberate collapse',async()=>{
 const group=Array.from({length:8},(_,i)=>({...rows[0],playerId:`tail${i}`,name:`Depth Player ${i}`,depthRank:i+1}));
 fetch.mockImplementation(async()=>({ok:true,json:async()=>payload(group)}));
 render(<Harness selected={group[7]}/>);
 await screen.findByRole('button',{name:'Focus Depth Player 7 · Snaps'});
 expect(document.querySelector('tbody[data-stat="snaps"] [data-player="tail7"]')).toHaveClass('focused');
 fireEvent.click(screen.getByRole('button',{name:'Show top 6 only'}));
 expect(screen.queryByRole('button',{name:'Focus Depth Player 7 · Snaps'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Click selected main row'}));
 await screen.findByRole('button',{name:'Focus Depth Player 7 · Snaps'});
});
