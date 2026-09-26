// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {IDBFactory} from 'fake-indexeddb';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {MarketPulse,csvFor} from '../src/MarketPulse.jsx';
const now=Date.now();
const commentary={capturedAt:new Date(now).toISOString(),model:'typesafe/jev-1.13',records:[{id:'a',espnId:'espn:12',playerName:'Fixture Runner',headline:'Fixture Runner returns to practice',url:'https://www.espn.com/nfl/story/_/id/1/test',source:'ESPN',publishedAt:new Date(now-3600000).toISOString(),analyzedAt:new Date(now).toISOString(),model:'typesafe/jev-1.13',answers:{relevance:{noul:0.99},topic:{choice:'injury',confidence:0.9},sentiment:{choice:'positive',confidence:0.92,probabilities:{positive:0.92,negative:0.02,neutral:0.02,unclear:0.04}}}}]};
beforeEach(()=>{localStorage.clear();global.indexedDB=new IDBFactory();global.fetch=vi.fn(async url=>({ok:true,json:async()=>({provider:url.includes('espn')?'espn':'sleeper',window:url.includes('espn')?'current':'24',rows:url.includes('espn')?[{id:'espn:12',name:'Fixture Runner',position:'RB',team:'BUF',rosterPct:80,startPct:40},{id:'espn:13',name:'No News',position:'WR',team:'NYG',rosterPct:30,startPct:10}]:[],capturedAt:now,history:[]})}));});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test('dense commentary columns sort and resize; source evidence is separate from profile action',async()=>{
 const open=vi.fn();render(<MarketPulse commentary={commentary} onOpenPlayer={open}/>);
 await screen.findByRole('button',{name:'Fixture Runner',exact:true});
 expect(screen.getByRole('button',{name:'Filters & settings'})).toHaveAttribute('aria-expanded','false');
 const table=screen.getByRole('table');
 for(const name of ['News','Latest topic','Pos +','Neutral','Neg −','Unclear','Conf %','Tone','Δ Tone · pp']) {
  const button=within(table).getByRole('button',{name,exact:true});fireEvent.click(button);const direction=button.closest('th').getAttribute('aria-sort');fireEvent.click(button);expect(button.closest('th').getAttribute('aria-sort')).not.toBe(direction);
  expect(screen.getByRole('separator',{name:`Resize ${name} column`})).toBeInTheDocument();
 }
 fireEvent.click(screen.getByRole('button',{name:'News evidence for Fixture Runner'}));
 expect(screen.getByRole('link',{name:/returns to practice/})).toHaveAttribute('href',commentary.records[0].url);expect(open).not.toHaveBeenCalled();
 expect(screen.getByText(/1 sampled articles · 1 publications/)).toBeInTheDocument();
});
test('news filters are inside the existing single panel and source counts remain independent',async()=>{
 render(<MarketPulse commentary={commentary}/>);await screen.findByRole('button',{name:'Fixture Runner',exact:true});fireEvent.click(screen.getByRole('button',{name:'Filters & settings'}));
 fireEvent.click(screen.getByRole('button',{name:'With news',exact:true}));expect(screen.queryByRole('button',{name:'No News',exact:true})).not.toBeInTheDocument();
 expect(screen.getByText('80.0%')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('News topic'),{target:{value:'waiver'}});expect(screen.queryByRole('button',{name:'Fixture Runner',exact:true})).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('News topic'),{target:{value:'injury'}});expect(screen.getByRole('button',{name:'Fixture Runner',exact:true})).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Commentary tone'),{target:{value:'negative'}});expect(screen.queryByRole('button',{name:'Fixture Runner',exact:true})).not.toBeInTheDocument();
});
test('CSV identifies model-derived columns and capture timestamp',()=>{
 const csv=csvFor([{name:'Fixture Runner',newsCount:1,newsBalance:100,newsDelta:null}],{commentary});expect(csv).toContain('Commentary balance');expect(csv).toContain(commentary.capturedAt);expect(csv).toContain('"100"');
});
