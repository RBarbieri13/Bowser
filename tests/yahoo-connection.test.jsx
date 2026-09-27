// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { YahooConnection } from '../src/YahooConnection.jsx';
afterEach(()=>{cleanup();vi.unstubAllGlobals();window.location.hash='';});
const status={configured:true,connected:true,connectionUrl:'https://bowser-fantasy-football.vercel.app/#/yahoo'};
const account={leagues:[{key:'999.l.1',name:'Test league',season:2026,teams:12,week:3,scoring:'head'}],teams:[{key:'999.l.1.t.1',leagueKey:'999.l.1',name:'Test team'}],checkedAt:'2026-09-24T12:00:00Z'};
function mockFetch(handler){vi.stubGlobal('fetch',vi.fn(async(url,options)=>({ok:true,json:async()=>handler(url,options)})));}
describe('Yahoo connection verification',()=>{
  it('shows real connection action with collapsed settings and no demo leagues',async()=>{
    mockFetch(()=>({...status,connected:false}));render(<YahooConnection/>);
    expect(await screen.findByRole('link',{name:'Connect Yahoo'})).toHaveAttribute('href','https://bowser-fantasy-football.vercel.app/api/v1/auth/yahoo/start');
    expect(screen.getByRole('button',{name:'Filters & settings'})).toHaveAttribute('aria-expanded','false');
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('loads the dashboard and verifies refresh with another league read',async()=>{
    mockFetch(url=>url.endsWith('status')?status:url.includes('leagues?')?account:url.includes('dashboard?')?{teamKey:'999.l.1.t.1',week:3,roster:{players:[]},standings:[],scoreboard:{matchups:[]},errors:{},checkedAt:account.checkedAt}:{refreshed:true});
    render(<YahooConnection/>);
    expect(await screen.findByRole('heading',{name:'My teams'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Filters & settings'}));
    fireEvent.click(screen.getByRole('button',{name:'Test token refresh'}));
    expect(await screen.findByText('Token refresh passed; league access verified again.')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url,options])=>url.endsWith('refresh')&&options.method==='POST')).toBe(true);
  });
  it('clears league data on disconnect and on a season change',async()=>{
    mockFetch(url=>url.endsWith('status')?status:url.includes('leagues?')?account:{connected:false});
    const {rerender}=render(<YahooConnection/>);await screen.findByRole('heading',{name:'My teams'});
    fireEvent.click(screen.getByRole('button',{name:'Filters & settings'}));
    fireEvent.click(screen.getByRole('button',{name:'Disconnect'}));
    await waitFor(()=>expect(screen.queryByText('Test league')).toBeNull());
    mockFetch(url=>url.endsWith('status')?{...status,connected:false}:account);
    rerender(<YahooConnection season={2025}/>);
    expect(await screen.findByRole('link',{name:'Connect Yahoo'})).toBeInTheDocument();
    expect(screen.queryByText('Fixture Player')).toBeNull();
  });
  it('explains denied API access without claiming a successful league test',async()=>{
    vi.stubGlobal('fetch',vi.fn(async url=>({ok:url.endsWith('status'),json:async()=>url.endsWith('status')?status:{error:{message:'Fantasy API permission denied'}}})));
    render(<YahooConnection/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Fantasy API permission denied');
    expect(screen.queryByRole('table')).toBeNull();
  });
});

function dashboard(teamKey='999.l.1.t.1',week=3) {
 return {teamKey,week,season:2026,checkedAt:account.checkedAt,errors:{},settings:{rosterPositions:[{position:'RB',count:2}]},roster:{week,players:[{key:'p1',name:'Starter One',slot:'RB',position:'RB',team:'BUF',status:'Q',points:0,byeWeek:7},{key:'p2',name:'Bench Two',slot:'BN',position:'WR',team:'NYG',points:14,byeWeek:3}]},standings:[{key:teamKey,name:'Test team',rank:2,wins:1,losses:1,ties:0,pointsFor:201.4,pointsAgainst:203,faabBalance:0},{key:'999.l.1.t.2',name:'Other team',rank:1,wins:2,losses:0,ties:0,pointsFor:220}],scoreboard:{week,matchups:[{week,status:'midevent',teams:[{key:teamKey,name:'Test team',points:0,projected:105.4},{key:'999.l.1.t.2',name:'Other team',points:12.5,projected:110.5}]}]}};
}
describe('Yahoo dashboard',()=>{
 it('shows actual zeroes, bench filters, lineup alerts, standings and selected-week matchups',async()=>{
  const open=vi.fn();mockFetch(url=>url.endsWith('status')?status:url.includes('leagues?')?account:dashboard('999.l.1.t.1',Number(new URL(url,'http://test').searchParams.get('week'))||3));
  render(<YahooConnection onOpenPlayer={open}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Starter One'}));expect(open.mock.calls[0][0].name).toBe('Starter One');
  expect(screen.getByText('Unfilled: 1 RB')).toBeInTheDocument();expect(screen.getByText('Starter One: Q')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Roster view'),{target:{value:'starters'}});expect(screen.queryByRole('button',{name:'Bench Two'})).toBeNull();
  fireEvent.click(screen.getByRole('tab',{name:'Standings'}));expect(screen.getByRole('table')).toHaveTextContent('201.4');expect(screen.getByText('Current season standings')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Week'),{target:{value:'2'}});await waitFor(()=>expect(fetch.mock.calls.some(([url])=>url.includes('dashboard?')&&url.includes('week=2'))).toBe(true));
  fireEvent.click(screen.getByRole('tab',{name:'Matchups'}));expect(await screen.findByText('Week 2 · midevent')).toBeInTheDocument();
 });
 it('keeps league team contexts separate when switching teams',async()=>{
  const second={key:'999.l.2.t.1',leagueKey:'999.l.2',name:'Second team'};
  mockFetch(url=>url.endsWith('status')?status:url.includes('leagues?')?{...account,teams:[...account.teams,second],leagues:[...account.leagues,{key:'999.l.2',name:'Second league'}]}:{...dashboard(new URL(url,'http://test').searchParams.get('team')),roster:{players:[{key:'p3',name:url.includes('999.l.2')?'Second league player':'First league player',slot:'QB'}]}});
  render(<YahooConnection/>);await screen.findByRole('button',{name:'First league player'});
  fireEvent.click(screen.getByRole('button',{name:/Second league Second team/}));expect(await screen.findByRole('button',{name:'Second league player'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'First league player'})).toBeNull();
 });
});
