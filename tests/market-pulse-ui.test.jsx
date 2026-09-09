// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { readSnapshot, saveSnapshot, mergeSnapshot } from '../src/marketPulseStorage.js';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {MarketPulse,csvFor} from '../src/MarketPulse.jsx';
import {combineMarketRows,sortMarketRows} from '../src/marketPulseRows.js';

const rows=[
  {id:'sleeper:1',name:'Fixture Runner',position:'RB',team:'BUF',adds:120,drops:30,net:90,addShare:80},
  {id:'sleeper:2',name:'Fixture Receiver',position:'WR',team:'NYG',adds:10,drops:null,net:null,addShare:null},
];
const espnRows=[
  {id:'espn:11',name:'Fixture Runner',position:'RB',team:'BUF',rosterPct:78.4,startPct:55.6,rosterDelta:1.5},
  {id:'espn:22',name:'ESPN Only',position:'QB',team:'KC',rosterPct:99,startPct:89,rosterDelta:-2},
];
const data={provider:'sleeper',window:'24',rows,capturedAt:1800000000000,error:null,stale:false,history:[{capturedAt:1800000000000,rows}]};
const espn={...data,provider:'espn',window:'current',rows:espnRows,history:[{capturedAt:1800000000000,rows:espnRows}]};
const reply=body=>({ok:true,json:async()=>body});
beforeEach(()=>{
  localStorage.clear();
  global.indexedDB=new IDBFactory();
  global.fetch=vi.fn(async url=>reply(url.includes('provider=espn')?espn:{...data,window:new URL(url,'http://localhost').searchParams.get('hours')}));
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const ready=()=>screen.findByRole('button',{name:'Fixture Runner',exact:true});
const tableRows=()=>within(screen.getByRole('table')).getAllByRole('row').slice(2);
test('combines both providers in one dense table and removes all summary cards',async()=>{
  render(<MarketPulse/>);await ready();
  const runner=screen.getByRole('button',{name:'Fixture Runner',exact:true}).closest('tr');
  expect(within(runner).getByText('120')).toBeInTheDocument();
  expect(within(runner).getByText('78.4%')).toBeInTheDocument();
  expect(screen.queryByRole('region',{name:'Snapshot summary'})).not.toBeInTheDocument();
  expect(screen.queryByText('PLAYERS OBSERVED')).not.toBeInTheDocument();
  expect(screen.queryByText('MOST ADDED IN SAMPLE')).not.toBeInTheDocument();
  expect(screen.queryByText('SAVED OBSERVATIONS')).not.toBeInTheDocument();
  expect(tableRows()).toHaveLength(3);
  fireEvent.click(screen.getByRole('button',{name:'Fixture Runner',exact:true}));
  expect(screen.getAllByText('History starts here.')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button',{name:'Watch Fixture Runner'}));
  expect(JSON.parse(localStorage.getItem('bowser:market-pulse:v1')).watch).toEqual(['sleeper:1']);
  fireEvent.click(screen.getByRole('button',{name:'Watchlist',exact:true}));
  expect(tableRows()).toHaveLength(1);
});
test('refresh updates both sources; selected window is applied only to Sleeper metrics',async()=>{
  render(<MarketPulse/>);await ready();
  fireEvent.click(screen.getByRole('button',{name:'Refresh data'}));
  await waitFor(()=>expect(fetch.mock.calls.filter(([,o])=>o.method==='POST')).toHaveLength(2));
  for(const [,o] of fetch.mock.calls.filter(([,o])=>o.method==='POST')) expect(o.headers['x-bowser-refresh']).toBe('1');
  await waitFor(()=>expect(screen.getByRole('button',{name:'Refresh data'})).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Sleeper window'),{target:{value:'6'}});
  await waitFor(()=>expect(screen.getByText('Sleeper · 6h transactions')).toBeInTheDocument());
  await waitFor(()=>expect(fetch.mock.calls.some(([url])=>url.includes('provider=sleeper&hours=6'))).toBe(true));
  expect(await screen.findByText('78.4%')).toBeInTheDocument();
});
test('every leaf column sorts in both directions and keeps unknown values last',async()=>{
  render(<MarketPulse/>);await ready();
  for(const label of ['Sort by watchlist','Player','Team','Pos','Adds','Drops','Net','Add / drop','Roster %','Start %','Δ Ros · pp']){
    const button=within(screen.getByRole('table')).getByRole('button',{name:label,exact:true});
    fireEvent.click(button);const first=button.closest('th').getAttribute('aria-sort');
    expect(['ascending','descending']).toContain(first);
    fireEvent.click(button);expect(button.closest('th')).toHaveAttribute('aria-sort',first==='ascending'?'descending':'ascending');
  }
  fireEvent.click(screen.getByRole('button',{name:'Roster %',exact:true}));
  expect(tableRows()[0]).toHaveTextContent('ESPN Only');
  expect(tableRows().at(-1)).toHaveTextContent('Fixture Receiver');
  fireEvent.click(screen.getByRole('button',{name:'Roster %',exact:true}));
  expect(tableRows()[0]).toHaveTextContent('Fixture Runner');
  expect(tableRows().at(-1)).toHaveTextContent('Fixture Receiver');
  expect(JSON.parse(localStorage.getItem('bowser:market-pulse:v1')).sort).toEqual({key:'rosterPct',desc:false});
});
test('partial provider failure preserves the other source and last-good data on refresh',async()=>{
  render(<MarketPulse/>);await ready();
  fetch.mockImplementation(async url=>{if(url.includes('espn'))throw new Error('Network offline');return reply(data);});
  fireEvent.click(screen.getByRole('button',{name:'Refresh data'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('ESPN: Network offline');
  expect(screen.getByText('78.4%')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Last successful snapshot retained');
});
test('first-load failures remain explicit and zero counts are not substituted',async()=>{
  fetch.mockImplementation(async url=>url.includes('espn')?Promise.reject(new Error('ESPN offline')):reply({...data,rows:[],history:[],capturedAt:null}));
  render(<MarketPulse/>);
  expect(await screen.findByText('Start your market history')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('No values substituted');
  expect(tableRows()).toHaveLength(0);
});
test('old-window requests cannot overwrite a newly selected window',async()=>{
  let resolveOld;
  fetch.mockImplementation(url=>url.includes('hours=24')&&url.includes('sleeper')
    ?new Promise(resolve=>{resolveOld=resolve;})
    :Promise.resolve(reply(url.includes('espn')?espn:{...data,window:'6',rows:[{...rows[0],adds:6}]})));
  render(<MarketPulse/>);
  fireEvent.change(screen.getByLabelText('Sleeper window'),{target:{value:'6'}});
  await ready();
  expect(within(tableRows()[0]).getByText('6')).toBeInTheDocument();
  resolveOld(reply(data));
  await waitFor(()=>expect(within(tableRows()[0]).getByText('6')).toBeInTheDocument());
});
test('saved ESPN watch identifiers survive a combined match and can be removed',async()=>{
  localStorage.setItem('bowser:market-pulse:v1',JSON.stringify({provider:'espn',watch:['espn:11']}));
  render(<MarketPulse/>);await ready();
  expect(screen.getByRole('button',{name:'Unwatch Fixture Runner'})).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByRole('button',{name:'Unwatch Fixture Runner'}));
  expect(JSON.parse(localStorage.getItem('bowser:market-pulse:v1')).watch).toEqual([]);
});
test('matching is one-to-one, conservative, supports IDs and team-defense aliases',()=>{
  expect(combineMarketRows(rows,espnRows)).toHaveLength(3);
  const duplicate=[...espnRows,{...espnRows[0],id:'espn:33'}];
  expect(combineMarketRows(rows,duplicate).find(r=>r.id==='sleeper:1').rosterPct).toBeNull();
  expect(combineMarketRows([{...rows[0],team:'FA'}],espnRows)[0].rosterPct).toBeNull();
  expect(combineMarketRows([{...rows[0],espnId:'11',team:'MIA'}],espnRows)[0].rosterPct).toBe(78.4);
  expect(combineMarketRows([{...rows[0],name:'Giants',position:'DEF',team:'NYG'}],[{...espnRows[0],name:'New York Giants D/ST',position:'DEF',team:'NYG'}])).toHaveLength(1);
  expect(combineMarketRows([{...rows[0],team:'LA'}],[{...espnRows[0],team:'LAR'}])).toHaveLength(1);
  const missing=combineMarketRows([],espnRows)[0];
  expect(missing.adds).toBeNull();expect(missing.net).toBeNull();
});
test('numeric sorting respects negative numbers, zero and null in either direction',()=>{
  const merged=combineMarketRows(rows,espnRows);
  const input=[{...merged[0],net:0},{...merged[1],net:-10},merged[2]];
  expect(sortMarketRows(input,{key:'net',desc:true}).map(r=>r.net)).toEqual([0,-10,null]);
  expect(sortMarketRows(input,{key:'net',desc:false}).map(r=>r.net)).toEqual([-10,0,null]);
});
test('CSV exports both source timestamps and protects spreadsheet formulas without altering negatives',()=>{
  const csv=csvFor([{...combineMarketRows(rows,espnRows)[0],name:'  =HYPERLINK("malicious")',adds:null,net:-20}],{sleeper:data,espn});
  expect(csv).toContain("'  =HYPERLINK");
  expect(csv).toContain('"","30"');
  expect(csv).toContain('Sleeper captured at');expect(csv).toContain('ESPN captured at');
  expect(csv).toContain('"-20"');expect(csv).not.toContain("'-20");
});


test('browser history survives a cold server and full component remount',async()=>{
  await saveSnapshot({...espn,storage:'browser'});
  fetch.mockImplementation(async url=>reply(url.includes('espn')?{...espn,rows:[],history:[],capturedAt:null,storage:'browser'}:data));
  const view=render(<MarketPulse/>);await ready();
  expect(screen.getByText('78.4%')).toBeInTheDocument();
  view.unmount();fetch.mockRejectedValue(new Error('Provider unavailable'));
  render(<MarketPulse/>);await ready();
  expect(screen.getByText('78.4%')).toBeInTheDocument();
  expect((await readSnapshot('espn',24)).history).toHaveLength(1);
});
test('browser history deduplicates observations, calculates ESPN change and isolates windows',async()=>{
  const first={...espn,storage:'browser'};
  await saveSnapshot(first);await saveSnapshot(first);
  const next={...first,capturedAt:first.capturedAt+900001,history:[],rows:espnRows.map(r=>({...r,rosterPct:r.rosterPct+0.5}))};
  const saved=await saveSnapshot(next);
  expect(saved.history).toHaveLength(2);expect(saved.rows[0].rosterDelta).toBe(0.5);
  expect((await saveSnapshot(first)).capturedAt).toBe(next.capturedAt);
  await saveSnapshot({...data,window:'6'});
  expect(await readSnapshot('sleeper',24)).toBeNull();
  expect((await readSnapshot('sleeper',6)).window).toBe('6');
  const long={...first,history:Array.from({length:110},(_,i)=>({capturedAt:first.capturedAt+i,rows:espnRows}))};
  expect(mergeSnapshot(null,long).history).toHaveLength(96);
});

test('unavailable browser storage does not prevent live provider refresh',async()=>{
  global.indexedDB={open(){throw new Error('Site storage blocked');}};
  render(<MarketPulse/>);await ready();
  expect(screen.getByText('78.4%')).toBeInTheDocument();
  expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Browser history could not be saved');
});

test('failed refresh with saved snapshots reports failure rather than success',async()=>{
  await saveSnapshot(espn);await saveSnapshot(data);
  render(<MarketPulse/>);await ready();
  fetch.mockRejectedValue(new Error('Network offline'));
  fireEvent.click(screen.getByRole('button',{name:'Refresh data'}));
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Refresh incomplete'));
  expect(screen.getByText('78.4%')).toBeInTheDocument();
});
test('storage failure and empty server response preserve current rows',async()=>{
  render(<MarketPulse/>);await ready();
  global.indexedDB={open(){throw new Error('Site storage blocked');}};
  fetch.mockImplementation(async url=>reply({... (url.includes('espn')?espn:data),capturedAt:null,rows:[],history:[]}));
  fireEvent.click(screen.getByRole('button',{name:'Refresh data'}));
  await waitFor(()=>expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Browser history could not be saved'));
  expect(screen.getByText('78.4%')).toBeInTheDocument();
});

test('readable but unwritable storage cannot roll newer in-memory data back',async()=>{
  render(<MarketPulse/>);await ready();
  vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');});
  const newer={...espn,capturedAt:espn.capturedAt+900001,history:[],rows:espnRows.map(r=>({...r,rosterPct:80}))};
  fetch.mockImplementation(async url=>reply(url.includes('espn')?newer:data));
  fireEvent.click(screen.getByRole('button',{name:'Refresh data'}));
  await waitFor(()=>expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Browser history could not be saved'));
  expect(screen.getAllByText('80.0%')).toHaveLength(2);
  fetch.mockImplementation(async url=>reply({... (url.includes('espn')?espn:data),rows:[],history:[],capturedAt:null}));
  fireEvent.click(screen.getByRole('button',{name:'Refresh data'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Refresh data'})).toBeEnabled());
  expect(screen.getAllByText('80.0%')).toHaveLength(2);
  fetch.mockRejectedValue(new Error('Network offline'));
  fireEvent.click(screen.getByRole('button',{name:'Refresh data'}));
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Refresh incomplete'));
  expect(screen.getAllByText('80.0%')).toHaveLength(2);
});
