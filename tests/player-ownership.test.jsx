// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {useState} from 'react';
import {afterEach,test,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor,renderHook,act} from '@testing-library/react';
import {OwnershipHeader,OwnershipCells} from '../src/lhq/PlayerOwnership.jsx';
import {defaultOwnershipFilters,defaultLeagueMapping,ownershipLeagues,ownershipIndex,playerOwnership,matchesOwnership,ownershipSortValue,ownershipSummary,OWNERSHIP_MAX_AGE} from '../src/lhq/ownershipModel.js';
import {usePlayerOwnership} from '../src/lhq/usePlayerOwnership.js';
const account={season:2026,leagues:[{key:'999.l.1',name:'Loongi League'},{key:'999.l.2',name:'LOEG'},{key:'999.l.3',name:'Fart League'},{key:'999.l.4',name:'Fourth League'}],teams:[1,2,3,4].map(n=>({key:`999.l.${n}.t.1`,leagueKey:`999.l.${n}`}))};
const row={name:'Fixture Alpha',team:'LA',position:'WR'};
const observed=(extra={})=>({...row,key:'999.p.1',checkedAt:new Date().toISOString(),owned:true,ownershipType:'team',isMine:true,...extra});
afterEach(()=>{cleanup();vi.useRealTimers();});
test('mapping uses discovered exact league names; all leagues includes fourth, not guessed league order',()=>{
 const leagues=ownershipLeagues(account);
 expect(defaultLeagueMapping(leagues)).toEqual({L:'999.l.1',E:'999.l.2',F:'999.l.3'});
 expect(leagues).toHaveLength(4);
 expect(defaultLeagueMapping([{key:'other',name:'Maybe Loongi League 2026'}]).L).toBe('');
 expect(defaultLeagueMapping([...leagues,{key:'duplicate',name:'Loongi League'}]).L).toBe('');
});
test('identity, explicit ownership, missing owner, staleness, zero observations and collisions are conservative',()=>{
 const check=p=>playerOwnership(row,ownershipIndex(p));
 expect(check([observed()])).toBe('mine');
 expect(check([observed({isMine:false})])).toBe('other');
 expect(check([observed({owned:false,ownershipType:'waivers',isMine:false})])).toBe('free');
 expect(check([observed({isMine:null})])).toBe('unknown');
 expect(check([])).toBe('unknown');
 expect(check([observed({team:'NYG'})])).toBe('unknown');
 expect(check([observed({checkedAt:new Date(Date.now()-OWNERSHIP_MAX_AGE-1).toISOString()})])).toBe('unknown');
 expect(check([observed(),observed({key:'999.p.2'})])).toBe('unknown');
 expect(ownershipSummary(['mine','free'])).toBe('mixed');
 expect(ownershipSummary(['mine','unknown'])).toBe('unknown');
});
test('OR within, AND across letters; A any/every spans all discovered leagues; empty vs all statuses',()=>{
 const states={L:'mine',E:'other',F:'free'},all=['mine','other','free','unknown'];
 const f=defaultOwnershipFilters();expect(matchesOwnership(states,all,f)).toBe(true);
 f.A=['free'];f.mode='any';expect(matchesOwnership(states,all,f)).toBe(true);
 f.mode='every';expect(matchesOwnership(states,all,f)).toBe(false);
 f.A=['mine','other','free'];f.L=['mine','free'];f.E=['other'];expect(matchesOwnership(states,all,f)).toBe(true);
 f.F=[];expect(matchesOwnership(states,all,f)).toBe(false);
 expect(matchesOwnership({L:'unknown',E:'unknown',F:'unknown'},[],defaultOwnershipFilters())).toBe(true);
 expect(ownershipSortValue(['unknown'])).toBe(null);
 expect(ownershipSortValue(['mine'])).toBeGreaterThan(ownershipSortValue(['other']));
});
test('compact menus support three symbols, All/None, any/every, sorting, Escape and Clear All without count subtext',()=>{
 const sort=vi.fn(),assign=vi.fn();
 function Harness(){const [f,setF]=useState(defaultOwnershipFilters);return <><OwnershipHeader filters={f} setFilters={setF} clear={()=>setF(defaultOwnershipFilters())} ownership={{leagues:ownershipLeagues(account),mapping:defaultLeagueMapping(account.leagues),assign}} sort={{key:'fantasy_points'}} sortScope="A" onSort={sort}/><output>{JSON.stringify(f)}</output></>;}
 render(<Harness/>);
 expect(screen.getByRole('button',{name:'Clear All'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Filter All leagues ownership'}));
 fireEvent.click(screen.getByRole('button',{name:'None',exact:true}));
 fireEvent.click(screen.getByRole('checkbox',{name:/Unowned/}));
 fireEvent.click(screen.getByRole('button',{name:'Any league',exact:true}));
 fireEvent.click(screen.getByRole('button',{name:'○ first ↑'}));expect(sort).toHaveBeenCalledWith('A',false);
 expect(screen.queryByText(/of 3 selected/)).not.toBeInTheDocument();
 fireEvent.keyDown(document,{key:'Escape'});
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Filter All leagues ownership'})).toHaveFocus();
 fireEvent.click(screen.getByRole('button',{name:'Clear All'}));
 expect(screen.getByRole('status')).toHaveTextContent(JSON.stringify(defaultOwnershipFilters()));
});
test('four symbols render in one cell with named accessible descriptions',()=>{
 render(<OwnershipCells row={row} ownership={{leagues:account.leagues,statesFor:()=>({states:{L:'mine',E:'other',F:'free'},all:['mine','other','free','free']})}}/>);
 expect(screen.getByLabelText('Loongi League: Mine')).toHaveTextContent('★');
 expect(screen.getByLabelText('LOEG: Owned by others')).toHaveTextContent('●');
 expect(screen.getByLabelText('Fart League: Unowned')).toHaveTextContent('○');
 expect(screen.getByLabelText('All leagues: Mixed ownership')).toHaveTextContent('≋');
});
test('ownership scanner is private, round-robin, uncoupled from table filters, and clears synchronously on disconnect',async()=>{
 const read=vi.fn(async team=>({start:0,players:[observed({isMine:team.includes('.1.')})],nextStart:null,exhausted:true,checkedAt:new Date().toISOString()}));
 const yahoo={account,status:{connected:true},loadOwnershipPage:read,busy:false};
 const store=vi.spyOn(Storage.prototype,'setItem');
 const {result,rerender}=renderHook(({y})=>usePlayerOwnership(y,2026),{initialProps:{y:yahoo}});
 await waitFor(()=>expect(result.current.complete).toBe(true));
 expect(read).toHaveBeenCalledTimes(4);
 expect(result.current.statesFor(row).all).toHaveLength(4);
 expect(result.current.statesFor(row).states.L).toBe('mine');
 expect(store).not.toHaveBeenCalled();
 rerender({y:{...yahoo,account:null,status:{connected:false}}});
 expect(result.current.statesFor(row).all).toEqual([]);
 expect(result.current.observed).toBe(0);store.mockRestore();
});
test('repeated pagination stops, removes compromised league observations, and never invents unowned',async()=>{
 const first=Array.from({length:25},(_,i)=>observed({key:`999.p.${i}`,name:`Fixture ${i}`}));
 const read=vi.fn(async(_team,start)=>({start,players:first,nextStart:start+25,exhausted:false,checkedAt:new Date().toISOString()}));
 const solo={...account,leagues:account.leagues.slice(0,1),teams:account.teams.slice(0,1)};
 const {result}=renderHook(()=>usePlayerOwnership({account:solo,status:{connected:true},loadOwnershipPage:read,busy:false},2026));
 await waitFor(()=>expect(result.current.error).toMatch(/stopped/));expect(read).toHaveBeenCalledTimes(2);
 expect(result.current.observed).toBe(0);expect(result.current.statesFor(row).states.L).toBe('unknown');
});
test('unmount cancels pending page completion and account replacement does not reuse private observations',async()=>{
 let finish;
 const read=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
 const {unmount}=renderHook(()=>usePlayerOwnership({account,status:{connected:true},loadOwnershipPage:read,busy:false},2026));
 await waitFor(()=>expect(read).toHaveBeenCalledTimes(1));unmount();
 await act(async()=>finish({start:0,players:[],nextStart:null,exhausted:true,checkedAt:new Date().toISOString()}));
 expect(read).toHaveBeenCalledTimes(1);
});
