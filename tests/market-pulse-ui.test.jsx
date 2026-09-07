// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {MarketPulse,csvFor} from '../src/MarketPulse.jsx';
const rows=[{id:'sleeper:1',name:'Fixture Runner',position:'RB',team:'BUF',adds:120,drops:30,net:90,addShare:80,rosterPct:null,startPct:null},{id:'sleeper:2',name:'Fixture Receiver',position:'WR',team:'NYG',adds:10,drops:null,net:null,addShare:null,rosterPct:null,startPct:null}];
const data={provider:'sleeper',window:'24',rows,capturedAt:1800000000000,error:null,stale:false,history:[{capturedAt:1800000000000,rows}]};
beforeEach(()=>{localStorage.clear();global.fetch=vi.fn(async()=>({ok:true,json:async()=>data}));});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test('renders counts, incomplete coverage, and history without inventing observations',async()=>{
 render(<MarketPulse/>);await screen.findByRole('button',{name:/Fixture Runner Sleeper|Fixture Runner BUF/});
 expect(screen.getByText('Incomplete coverage')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Fixture Runner BUF · Sleeper'}));
 expect(screen.getByText('History starts here.')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Watch Fixture Runner'}));
 expect(JSON.parse(localStorage.getItem('bowser:market-pulse:v1')).watch).toEqual(['sleeper:1']);
 fireEvent.click(screen.getByRole('button',{name:'Watchlist'}));
 expect(screen.queryByRole('button',{name:/Fixture Receiver NYG/})).not.toBeInTheDocument();
});
test('explicit refresh uses same-origin guard and source/window changes query correct source',async()=>{
 render(<MarketPulse/>);await screen.findByRole('button',{name:'Fixture Runner BUF · Sleeper'});
 fireEvent.click(screen.getByRole('button',{name:'Refresh data'}));await waitFor(()=>expect(fetch.mock.calls.some(([,o])=>o.method==='POST'&&o.headers['x-bowser-refresh']==='1')).toBe(true));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Refresh data'})).not.toBeDisabled());
 fireEvent.change(screen.getByLabelText('Observation window'),{target:{value:'6'}});
 await waitFor(()=>expect(fetch.mock.calls.at(-1)[0]).toContain('hours=6'));
 fireEvent.click(screen.getByRole('button',{name:/ESPN EXPERIMENTAL/}));
 await waitFor(()=>expect(fetch.mock.calls.at(-1)[0]).toContain('provider=espn'));
 expect(screen.getByText('Current provider snapshot')).toBeInTheDocument();
});
test('empty first load is not shown as real market data and failures are visible',async()=>{
 fetch.mockResolvedValueOnce({ok:true,json:async()=>({...data,rows:[],history:[],capturedAt:null})});
 render(<MarketPulse/>);await screen.findByText('Start your market history');
 expect(screen.getAllByRole('button',{name:'Refresh data'}).length).toBe(2);
 fetch.mockRejectedValueOnce(new Error('Network offline'));fireEvent.click(screen.getAllByRole('button',{name:'Refresh data'})[0]);
 expect(await screen.findByRole('alert')).toHaveTextContent('Network offline');
});
test('CSV preserves unknowns and protects spreadsheet formulas',()=>{
 const csv=csvFor([{...rows[0],name:'=HYPERLINK("malicious")',adds:null,net:-20}],data);
 expect(csv).toContain("'=HYPERLINK");expect(csv).toContain('"","30"');expect(csv).toContain('Captured at');
 expect(csv).toContain('"-20"');expect(csv).not.toContain("'-20");
});
