import {useEffect,useRef,useState} from 'react';
import {mergeSnapshot,readSnapshot,saveSnapshot} from '../marketPulseStorage.js';
const SOURCES=['sleeper','espn'];
export function useMarketData(hours){
 const [snapshots,setSnapshots]=useState({}),[busy,setBusy]=useState(false),[errors,setErrors]=useState({}),[notice,setNotice]=useState('');const request=useRef({id:0,controller:null});
  async function load(refresh=false) {
    request.current.controller?.abort();
    const id=++request.current.id, controller=new AbortController();
    request.current.controller=controller;
    setBusy(true); setErrors({}); setNotice('');
    const results = await Promise.all(SOURCES.map(async provider=>{
      const expectedWindow=provider==='espn'?'current':String(hours);
      let savedSnapshot=snapshots[provider]?.window===expectedWindow?snapshots[provider]:null;
      try {
        try {
          const stored=await readSnapshot(provider,hours);
          if(stored) savedSnapshot=mergeSnapshot(savedSnapshot,stored);
        } catch { /* Live refresh still works when site storage is blocked. */ }
        if(refresh && savedSnapshot?.capturedAt && Date.now()<savedSnapshot.nextRefreshAt && !savedSnapshot.error)
          return {provider,body:{...savedSnapshot,cached:true}};
        const response=await fetch(`/api/v1/market-pulse?provider=${provider}&hours=${hours}`,{
          method:refresh?'POST':'GET',headers:refresh?{'x-bowser-refresh':'1'}:{},signal:controller.signal,
        });
        const body=await response.json();
        if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
        if (body.provider!==provider || !Array.isArray(body.rows)) throw new Error('Unexpected provider response.');
        let merged=mergeSnapshot(savedSnapshot || snapshots[provider],body);
        try { merged=await saveSnapshot(merged); }
        catch { merged={...merged,storageError:'Browser history could not be saved. Enable site storage to keep snapshots after closing this page.'}; }
        return {provider,body:merged};
      } catch (error) { return {provider,body:savedSnapshot,error:error.message || 'Unable to load this source.'}; }
    }));
    if (id!==request.current.id) return;
    // Each source keeps its own last-good snapshot, timestamp and error.
    setSnapshots(previous=>{
      const next={...previous};
      results.forEach(({provider,body})=>{ if(body) next[provider]=body; });
      return next;
    });
    setErrors(Object.fromEntries(results.filter(r=>r.error||r.body?.error||r.body?.storageError).map(r=>[r.provider,r.error||r.body.error||r.body.storageError])));
    if(refresh) {
      const good=results.filter(r=>r.body&&!r.error&&!r.body.error);
      setNotice(good.length===2
        ? good.every(r=>r.body.cached) ? 'Both sources are within the 15-minute refresh cooldown.' : 'Both sources refreshed. Capture times are shown above.'
        : 'Refresh incomplete. Available source data remains visible; retry Refresh data.');
    }
    setBusy(false);
  }
  useEffect(()=>{
    // Never relabel a previous Sleeper window as the newly selected one.
    setSnapshots(previous=>({espn:previous.espn}));
    load();
    return ()=>{request.current.id++;request.current.controller?.abort();};
  },[hours]);
return {snapshots,busy,errors,notice,load};
}
