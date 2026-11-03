import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CACHE_MS, createMarketPulse, normalizeSleeper, normalizeEspn, marketPulseHandler } from '../server/market-pulse.mjs';

const players=Object.fromEntries(Array.from({length:110},(_,i)=>[String(i),{full_name:`Fixture Player ${i}`,position:'RB',team:'BUF',gsis_id:`fixture-${i}`} ]));
const adds=[{player_id:'1',count:120},{player_id:'2',count:0}];
const drops=[{player_id:'1',count:30},{player_id:'3',count:50}];
const espn={players:[{player:{id:11,fullName:'Fixture ESPN',defaultPositionId:2,proTeamId:2,ownership:{percentOwned:80,percentStarted:40}}}]};
function fixture(){let at=1800000000000, calls=0, fail=false;const fetcher=async url=>{calls++; if(fail)throw new Error('Fixture provider offline'); if(url.includes('espn.com'))return espn;if(url.includes('/trending/add'))return adds;if(url.includes('/trending/drop'))return drops;return players;};return {fetcher,now:()=>at,advance:(n=CACHE_MS+1)=>{at+=n;},calls:()=>calls,fail:()=>{fail=true;}};}

test('source normalization preserves unknown vs zero and complete ratios',()=>{
 const rows=normalizeSleeper(adds,drops,players);
 assert.equal(rows[0].net,90);assert.equal(rows[0].addShare,80);
 assert.equal(rows[1].adds,0);assert.equal(rows[1].drops,null);assert.equal(rows[1].net,null);assert.equal(rows[2].adds,null);
 assert.equal(normalizeSleeper([{player_id:'1',count:0}],[{player_id:'1',count:0}],players)[0].addShare,null);
 assert.throws(()=>normalizeSleeper([{player_id:'1',count:-1}],[],players));
 assert.throws(()=>normalizeSleeper([{player_id:'not-in-catalogue',count:1}],[],players));
 assert.equal(normalizeEspn(espn)[0].rosterPct,80);assert.equal(normalizeEspn(espn)[0].adds,null);
 assert.throws(()=>normalizeEspn({players:[{player:{id:1,fullName:'Fixture',ownership:{percentOwned:1000}}}]}));
});
test('GET is offline; concurrent refreshes coalesce; cooldown does not fabricate observations',async()=>{
 const f=fixture(),s=createMarketPulse({filename:':memory:',...f});
 assert.equal(s.read().rows.length,0);assert.equal(f.calls(),0);
 const [a,b]=await Promise.all([s.refresh(),s.refresh()]);
 assert.equal(f.calls(),3);assert.equal(a.capturedAt,b.capturedAt);assert.equal(a.history.length,1);
 assert.equal((await s.refresh()).cached,true);assert.equal(f.calls(),3);assert.equal(s.read().history.length,1);s.close();
});
test('failures retain last good payload and timestamp; throttle retry attempts',async()=>{
 const f=fixture(),s=createMarketPulse({filename:':memory:',...f}); const initial=await s.refresh();
 f.advance();f.fail();const failed=await s.refresh();
 assert.equal(failed.capturedAt,initial.capturedAt);assert.deepEqual(failed.rows,initial.rows);assert.match(failed.error,/offline/);assert.equal(failed.stale,true);
 const calls=f.calls();await s.refresh();assert.equal(f.calls(),calls);assert.equal(s.read().history.length,1);s.close();
});
test('persistent history survives reopening; provider and windows remain isolated; ESPN delta uses observations',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'bowser-pulse-test-')),filename=join(directory,'snapshots.sqlite'),f=fixture();let s=createMarketPulse({filename,...f});
 await s.refresh();await s.refresh('sleeper',6);await s.refresh('espn');f.advance();await s.refresh('espn');
 assert.equal(s.read('espn').rows[0].rosterDelta,0);assert.equal(s.read('espn').history.length,2);
 s.close();s=createMarketPulse({filename,...f});assert.equal(s.read().history.length,1);assert.equal(s.read('sleeper',6).history.length,1);assert.equal(s.read('sleeper',72).history.length,0);assert.equal(s.read('espn').history.length,2);s.close();
});
test('retention is bounded and no daily catalogue refetch during cache lifetime',async()=>{
 const f=fixture(),s=createMarketPulse({filename:':memory:',...f});
 for(let i=0;i<100;i++){await s.refresh();f.advance();}
 assert.equal(s.read().history.length,96);assert.equal(f.calls(),202);s.close();
});
test('invalid query and public network requests are rejected before provider access',async()=>{
 const invoke=async(req)=>{let status,body;const res={setHeader(){},set statusCode(v){status=v;},end(v){body=JSON.parse(v);}};await marketPulseHandler({headers:{host:'localhost'},socket:{remoteAddress:'127.0.0.1'},method:'GET',url:'/api/v1/market-pulse',...req},res);return {status,body};};
 assert.equal((await invoke({url:'/api/v1/market-pulse?provider=unknown'})).status,400);
 assert.equal((await invoke({socket:{remoteAddress:'10.1.1.1'}})).status,403);
 assert.equal((await invoke({headers:{host:'untrusted.example'}})).status,403);
 assert.equal((await invoke({method:'DELETE'})).status,405);
 assert.equal((await invoke({method:'POST'})).status,403);
 assert.equal((await invoke({method:'POST',headers:{host:'localhost','x-bowser-refresh':'1',origin:'https://untrusted.example'}})).status,403);
});

// Public Yahoo trend counts must never come from private league transactions.
import {parseYahooTrends,createYahooTrends} from '../server/yahoo-trends.mjs';
const yahooHtml=(adds='12,345',drops='0',name='Fixture &amp; Player',date='2026-11-02')=>`<table><thead><tr>${['Player','% Ros','% Start','Drops','Adds','Trades','Total'].map(x=>`<th><a href="/f1/buzzindex?date=${date}&sort=BI_A">${x}</a></th>`).join('')}</tr></thead><tbody><tr><td><a class="name playernote" data-ys-playerid="42">${name}</a><span>NYG - WR</span></td><td>10%</td><td>2%</td><td>${drops}</td><td>${adds}</td><td>1</td><td>12346</td></tr></tbody></table>`;
test('Yahoo public trend parser retains exact counts/zeros and rejects missing or malformed fields',()=>{
 assert.deepEqual(parseYahooTrends(yahooHtml())[0],{id:'yahoo:42',name:'Fixture & Player',team:'NYG',position:'WR',adds:12345,drops:0,net:12345});
 assert.throws(()=>parseYahooTrends(yahooHtml(),{date:'2026-11-01'}),/different calendar date/);
 for(const html of ['<html>Sign in</html>',yahooHtml('—'),yahooHtml('-1'),yahooHtml('1.2')])assert.throws(()=>parseYahooTrends(html));
});
test('Yahoo public trend fetch coalesces callers, caches, preserves dated last good on failure, and changes calendar dates independently',async()=>{
 let time=Date.parse('2026-11-02T21:00:00Z'),calls=0,fail=false;const urls=[];
 const load=createYahooTrends({now:()=>time,fetcher:async(url,options)=>{calls++;urls.push(url);assert.equal(options.redirect,'error');assert.equal(options.headers,undefined);if(fail)throw Error('Source unavailable');return {ok:true,text:async()=>yahooHtml('12,345','0','Fixture &amp; Player',new URL(url).searchParams.get('date'))};}});
 const [a,b]=await Promise.all([load(),load()]);assert.equal(calls,2);assert.deepEqual(a,b);assert.equal(a.scope,'platform');assert.equal(a.date,'2026-11-02');assert.equal(a.rows[0].adds,12345);assert(urls.every(u=>u.startsWith('https://football.fantasysports.yahoo.com/f1/buzzindex?')&&!u.includes('league')));
 await load();assert.equal(calls,2);time+=16*60000;fail=true;const stale=await load();assert.equal(stale.rows[0].adds,12345);assert.equal(stale.capturedAt,a.capturedAt);assert(stale.error);assert(stale.stale);
 fail=false;const yesterday=await load('yesterday');assert.equal(yesterday.date,'2026-11-01');assert(yesterday.sources.every(u=>u.includes('date=2026-11-01')));await assert.rejects(load('other'));
});
