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
  it('retrieves chosen team roster and verifies refresh with another league read',async()=>{
    mockFetch(url=>url.endsWith('status')?status:url.includes('leagues?')?account:url.includes('roster?')?{teamKey:'999.l.1.t.1',week:3,players:[{key:'p1',name:'Fixture Player',slot:'RB',position:'RB',team:'BUF'}]}:{refreshed:true});
    render(<YahooConnection/>);
    fireEvent.click(await screen.findByRole('button',{name:'Test team · View roster'}));
    expect(await screen.findByText('Fixture Player')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Test token refresh'}));
    expect(await screen.findByText('Token refresh passed; league access verified again.')).toBeInTheDocument();
    expect(fetch.mock.calls.some(([url,options])=>url.endsWith('refresh')&&options.method==='POST')).toBe(true);
  });
  it('clears league data on disconnect and on a season change',async()=>{
    mockFetch(url=>url.endsWith('status')?status:url.includes('leagues?')?account:{connected:false});
    const {rerender}=render(<YahooConnection/>);await screen.findByText('Test league');
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
