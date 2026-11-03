// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {useState} from 'react';
import {afterEach,test,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor,renderHook,act} from '@testing-library/react';
import {ActivityHeader,ActivityCells} from '../src/lhq/PlayerActivity.jsx';
import {activityKey,compactActivity,sleeperActivityIndex,isPublicExportColumn,publicActivityExport} from '../src/lhq/playerActivity.js';
import {usePlayerActivity} from '../src/lhq/usePlayerActivity.js';
import {sortRows} from '../src/lhq/model.js';
import {LhqProvider} from '../src/lhq/shared.jsx';
const row={name:'Fixture Player',team:'LA',position:'WR'};
const empty=()=>null;
const activity={hours:24,setHours:vi.fn(),sleeperFor:()=>({adds:31500,drops:5500,net:26000}),yahooFor:empty,teamKey:'999.l.1.t.1',leagueName:'Loongi League',options:[{key:'999.l.1.t.1',name:'Loongi League'},{key:'999.l.2.t.1',name:'LOEG'}],setTeamKey:vi.fn(),yahooPeriod:'today',setYahooPeriod:vi.fn(),yahooCoverage:'Yahoo-wide public trend lists',reloadYahoo:vi.fn(),refreshSleeper:vi.fn()};
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
test('abbreviations retain zeros, signs and missing values; no private composite is exported',()=>{
 expect([31500,5500,26000,0,null,-1250].map(v=>compactActivity(v))).toEqual(['31.5k','5.5k','26k','0','—','−1.3k']);
 expect(compactActivity(16000,true)).toBe('+16k');expect(compactActivity(522200)).toBe('522k');
 expect(['league_ownership','activity_yahoo','activity_sleeper','fantasy_points'].filter(key=>isPublicExportColumn({key}))).toEqual(['fantasy_points']);
});
test('conservative source join: unique names/position/team, aliases, collisions, missing sides and defense identities',()=>{
 const lookup=sleeperActivityIndex([{...row,team:'LAR',adds:31500,drops:5500},{name:'Unknown Side',team:'NYG',position:'RB',adds:4,drops:null},{name:'Miami Dolphins',position:'DEF',team:'MIA',adds:20,drops:0}]);
 expect(lookup(row)).toEqual({adds:31500,drops:5500,net:26000});
 expect(lookup({...row,team:'NYG'})).toBeNull();
 expect(lookup({...row,identityUnavailable:true})).toBeNull();
 expect(lookup({name:'Unknown Side',team:'NYG',position:'RB'})).toEqual({adds:4,drops:null,net:null});
 expect(lookup({name:'MIA',position:'DST',team:'MIA'})).toEqual({adds:20,drops:0,net:20});
 expect(sleeperActivityIndex([row,row])(row)).toBeNull();
});
test('all six sort controls use unrounded numeric values, descending first and reverse on repeat; unknown last',()=>{
 const rows=[{id:'low',adds:1001,drops:30,net:-29},{id:'high',adds:1009,drops:100,net:18},{id:'gap',adds:null,drops:null,net:null}];
 function Harness(){const [sort,setSort]=useState({key:'other',desc:true}),[fields,setFields]=useState({sleeper:'adds',yahoo:'adds'});const cols=['sleeper','yahoo'].map(p=>({key:activityKey(p),value:r=>r[fields[p]]}));return <>{['sleeper','yahoo'].map(p=><ActivityHeader key={p} provider={p} activity={activity} sort={sort} field={fields[p]} onSort={(field,desc)=>{setFields(s=>({...s,[p]:field}));setSort({key:activityKey(p),desc});}}/>)}<output>{sortRows(rows,sort,cols).map(r=>r.id).join(',')}</output></>;}
 render(<LhqProvider><Harness/></LhqProvider>);
 for(const provider of ['Sleeper','Yahoo'])for(const field of ['adds','drops','net adds']){
  const button=screen.getByRole('button',{name:`Sort ${provider} ${field}`});fireEvent.click(button);expect(button).toHaveAttribute('aria-pressed','true');expect(screen.getByRole('status')).toHaveTextContent('high,low,gap');fireEvent.click(button);expect(screen.getByRole('status')).toHaveTextContent('low,high,gap');
 }
});
test('compact cells expose full exact counts and provider context; Yahoo gaps never show zero',()=>{
 render(<LhqProvider><ActivityCells provider="sleeper" row={row} activity={activity}/><ActivityCells provider="yahoo" row={row} activity={activity}/></LhqProvider>);
 expect(screen.getByLabelText('sleeper adds: 31500')).toHaveTextContent('31.5k');
 fireEvent.focus(screen.getByLabelText('sleeper adds: 31500'));expect(screen.getByRole('tooltip')).toHaveTextContent('31,500');expect(screen.getByRole('tooltip')).toHaveTextContent('rolling 24h');
 expect(screen.getByLabelText('yahoo adds: unavailable')).toHaveTextContent('—');
});
test('provider menus choose rolling window/calendar date and close with Escape returning focus',()=>{
 render(<LhqProvider><ActivityHeader provider="sleeper" activity={activity}/><ActivityHeader provider="yahoo" activity={activity}/></LhqProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Sleeper activity source settings'}));fireEvent.change(screen.getByLabelText('Sleeper activity window'),{target:{value:'72'}});expect(activity.setHours).toHaveBeenCalledWith(72);fireEvent.keyDown(document,{key:'Escape'});expect(screen.getByRole('button',{name:'Sleeper activity source settings'})).toHaveFocus();
 fireEvent.click(screen.getByRole('button',{name:'Yahoo activity source settings'}));expect(screen.getByRole('dialog')).toHaveTextContent('Yahoo-wide');fireEvent.change(screen.getByLabelText('Yahoo trend date'),{target:{value:'yesterday'}});expect(activity.setYahooPeriod).toHaveBeenCalledWith('yesterday');
});
const account={season:2026,teams:[{key:'999.l.1.t.1'}],leagues:[{key:'999.l.1',name:'Loongi League'}]};
const mockFetch=()=>vi.stubGlobal('fetch',vi.fn(async url=>({ok:true,json:async()=>({provider:'sleeper',window:new URL(url,'https://test.invalid').searchParams.get('hours'),capturedAt:Date.now(),nextRefreshAt:Date.now()+900000,rows:[{...row,adds:12,drops:4}]})})));
test('Yahoo counts are platform-wide, require no private queue, survive disconnect, and use calendar dates',async()=>{
 const loadResearch=vi.fn();vi.stubGlobal('fetch',vi.fn(async url=>{const p=new URL(url,'https://test.invalid').searchParams;return {ok:true,json:async()=>p.get('provider')==='yahoo'?{provider:'yahoo',scope:'platform',period:p.get('period'),date:'2026-11-02',rows:[{...row,adds:31000,drops:4000}]}:{provider:'sleeper',window:p.get('hours'),capturedAt:Date.now(),nextRefreshAt:Date.now()+900000,rows:[]}};}));
 const y={account,status:{connected:true},loadResearch,research:{},researchBusy:{}};
 const {result,rerender}=renderHook(({yahoo})=>usePlayerActivity(yahoo,2026),{initialProps:{yahoo:y}});
 await waitFor(()=>expect(result.current.yahooFor(row)?.adds).toBe(31000));
 expect(loadResearch).not.toHaveBeenCalled();expect(result.current.yahooFor(row)).toEqual({adds:31000,drops:4000,net:27000});
 rerender({yahoo:{...y,status:{connected:false}}});expect(result.current.yahooFor(row)?.adds).toBe(31000);
 act(()=>result.current.setYahooPeriod('yesterday'));expect(result.current.yahooFor(row)).toBeNull();
 await waitFor(()=>expect(fetch.mock.calls.some(([u])=>String(u).includes('provider=yahoo&period=yesterday'))).toBe(true));
});
test('activity legend explains symbols and global scope on hover',()=>{
 render(<LhqProvider><ActivityHeader provider="yahoo" activity={activity}/></LhqProvider>);
 fireEvent.mouseEnter(screen.getByRole('button',{name:'Yahoo activity legend'}).parentElement);
 expect(screen.getByRole('tooltip')).toHaveTextContent('+ = adds. − = drops. Δ = adds minus drops');
 expect(screen.getByRole('tooltip')).toHaveTextContent('Yahoo-wide');
});
test('Sleeper requests exact windows, never relabels old counts, and reports provider failure',async()=>{
 mockFetch();const {result}=renderHook(()=>usePlayerActivity(null,2026));await waitFor(()=>expect(result.current.sleeperFor(row)?.adds).toBe(12));
 expect(fetch).toHaveBeenCalledWith('/api/v1/market-pulse?provider=sleeper&hours=24',expect.objectContaining({method:'POST',headers:{'x-bowser-refresh':'1'}}));
 let reject;fetch.mockImplementationOnce(()=>new Promise((_,r)=>{reject=r;}));act(()=>result.current.setHours(72));expect(result.current.sleeperFor(row)).toBeNull();await waitFor(()=>expect(reject).toBeTypeOf('function'));await act(async()=>reject(Error('Provider unavailable')));expect(result.current.sleeperFor(row)).toBeNull();expect(result.current.error).toBe('Provider unavailable');
});

test('public CSV drops private-derived Rank and uses public fantasy ordering after Yahoo or LEFA sorts',()=>{
 const rows=[{name:'Private leader',fantasy_points:1},{name:'Public leader',fantasy_points:30}],columns=[{key:'name',label:'Name',value:r=>r.name},{key:'rank',label:'Rank',value:r=>r.name==='Private leader'?1:2},{key:'fantasy_points',label:'Fpts',value:r=>r.fantasy_points},{key:'activity_yahoo',label:'Private activity',value:()=>10},{key:'league_ownership',label:'LEFA',value:()=>2}];
 for(const key of ['activity_yahoo','league_ownership'])for(const sortKey of [key,'rank']){
   const output=publicActivityExport(rows,columns,{key:sortKey,desc:true},{key,desc:true});
   const csv=[output.columns.map(c=>c.label).join(','),...output.rows.map(r=>output.columns.map(c=>c.value(r)).join(','))].join('\n');
   expect(csv).toBe('Name,Fpts\nPublic leader,30\nPrivate leader,1');
 }
});
