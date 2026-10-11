// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { readOwnershipCache, writeOwnershipCache, validSnapshot, SNAPSHOT_MAX_AGE } from '../src/lhq/ownershipCache.js';
import { usePlayerOwnership } from '../src/lhq/usePlayerOwnership.js';
import { useDataRefresh, DAILY_REFRESH_MS } from '../src/lhq/useDataRefresh.js';
const grant = () => ({scope:'a'.repeat(64),key:Buffer.alloc(32,7).toString('base64'),expiresAt:new Date(Date.now()+3600000).toISOString()});
const player = () => ({key:'999.p.1',name:'Fixture Receiver',team:'LA',position:'WR',owned:true,isMine:true,ownershipType:'team',checkedAt:new Date().toISOString(),privateManager:'DO NOT STORE'});
const pools = () => ({'999.l.1':{complete:true,checkedAt:new Date().toISOString(),players:[player()]}});
const account = cache => ({season:2026,ownershipCache:cache,leagues:[{key:'999.l.1',name:'Loongi League'}],teams:[{key:'999.l.1.t.1',leagueKey:'999.l.1'}]});
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('indexedDB',new IDBFactory());});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
test('disk contains only authenticated ciphertext; grant keys, names and response extras never persist',async()=>{
 const g=grant();expect(await writeOwnershipCache(g,pools())).toBe(true);
 const snapshot=await readOwnershipCache(g,['999.l.1']);
 expect(snapshot.pools['999.l.1'].players[0].name).toBe('Fixture Receiver');
 expect(snapshot.pools['999.l.1'].players[0]).not.toHaveProperty('privateManager');
 const db=await new Promise(resolve=>{const r=indexedDB.open('bowser-private-ownership-v1');r.onsuccess=()=>resolve(r.result);});
 const entry=await new Promise(resolve=>{const r=db.transaction('snapshots').objectStore('snapshots').get(g.scope);r.onsuccess=()=>resolve(r.result);});db.close();
 const raw=JSON.stringify(entry);for(const secret of [g.key,'Fixture','999.l.1','DO NOT STORE'])expect(raw).not.toContain(secret);
 expect(await readOwnershipCache({...g,key:Buffer.alloc(32,8).toString('base64')},['999.l.1'])).toBe(null);
 expect(await readOwnershipCache({...g,scope:'b'.repeat(64)},['999.l.1'])).toBe(null);
 expect(await readOwnershipCache(g,['999.l.2'])).toBe(null);
 expect(await readOwnershipCache({...g,expiresAt:new Date(Date.now()-1).toISOString()},['999.l.1'])).toBe(null);
});
test('snapshot validation rejects age, future clocks, duplicate identities, incomplete league and changed membership',()=>{
 const s={version:1,savedAt:Date.now(),pools:pools()};expect(validSnapshot(s,['999.l.1'])).toBe(true);
 expect(validSnapshot(s,['999.l.1'],Date.now()+SNAPSHOT_MAX_AGE+100)).toBe(false);
 expect(validSnapshot({...s,savedAt:Date.now()+60000},['999.l.1'])).toBe(false);
 s.pools['999.l.1'].players.push(player());expect(validSnapshot(s,['999.l.1'])).toBe(false);
});
test('fresh encrypted snapshot hydrates on remount without any ownership scan; disconnect erases it',async()=>{
 const g=grant(),a=account(g),p=pools();await writeOwnershipCache(g,p);
 const read=vi.fn();const y={status:{connected:true},account:a,busy:false,loadOwnershipPage:read};
 const first=renderHook(({yahoo})=>usePlayerOwnership(yahoo,2026),{initialProps:{yahoo:y}});
 await waitFor(()=>expect(first.result.current.complete).toBe(true));expect(read).not.toHaveBeenCalled();
 expect(first.result.current.statesFor(player()).states.L).toBe('mine');first.unmount();
 const second=renderHook(({yahoo})=>usePlayerOwnership(yahoo,2026),{initialProps:{yahoo:y}});
 await waitFor(()=>expect(second.result.current.complete).toBe(true));expect(read).not.toHaveBeenCalled();
 second.rerender({yahoo:{...y,status:{connected:false},account:null}});
 expect(second.result.current.observed).toBe(0);
 await waitFor(async()=>expect(await readOwnershipCache(g,['999.l.1'])).toBe(null));
});
test('manual background refresh retains full saved values on provider error and never stamps them newer',async()=>{
 const g=grant(),p=pools();await writeOwnershipCache(g,p);
 let finish;const read=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
 const y={status:{connected:true},account:account(g),busy:false,loadOwnershipPage:read};
 const h=renderHook(()=>usePlayerOwnership(y,2026));await waitFor(()=>expect(h.result.current.complete).toBe(true));
 const before=h.result.current.oldest;act(()=>h.result.current.refresh());
 await waitFor(()=>expect(read).toHaveBeenCalledTimes(1));expect(h.result.current.statesFor(player()).states.L).toBe('mine');
 await act(async()=>finish(null));await waitFor(()=>expect(h.result.current.loading).toBe(false));
 expect(h.result.current.error).toMatch(/stopped/);expect(h.result.current.oldest).toBe(before);
 expect(h.result.current.statesFor(player()).states.L).toBe('mine');
});
test('cancelled writes are not persisted',async()=>{
 const g=grant();expect(await writeOwnershipCache(g,pools(),()=>false)).toBe(false);expect(await readOwnershipCache(g,['999.l.1'])).toBe(null);
});
test('daily refresh and manual button share a deduplicated public reload plus authenticated Yahoo rediscovery',async()=>{
 vi.useFakeTimers();const load=vi.fn(async()=>{}),refresh=vi.fn();
 const h=renderHook(()=>useDataRefresh({load},{refresh}));
 await act(async()=>{vi.advanceTimersByTime(DAILY_REFRESH_MS);});
 expect(load).toHaveBeenCalledTimes(1);expect(refresh).toHaveBeenCalledTimes(1);expect(h.result.current.version).toBe(1);
 await act(async()=>{await h.result.current.refresh();});expect(load).toHaveBeenCalledTimes(2);
});
