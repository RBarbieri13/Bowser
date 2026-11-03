import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {usePublicRefresh} from './shared.jsx';
import {mergeSnapshot,readSnapshot,saveSnapshot} from '../marketPulseStorage.js';
import {sleeperActivityIndex} from './playerActivity.js';
const TTL=15*60*1000;
export function usePlayerActivity() {
  const refresh=usePublicRefresh(),[hours,setHours]=useState(24),[capture,setCapture]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[tick,setTick]=useState(0);
  const latest=useRef(null);latest.current=capture;
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState!=='hidden')setTick(n=>n+1);},TTL);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    setLoading(true);setError('');
    (async()=>{
      let saved=latest.current?.window===String(hours)?latest.current:null;
      try{
        try{const stored=await readSnapshot('sleeper',hours);if(stored)saved=mergeSnapshot(saved,stored);}catch{/* Public history is optional. */}
        if(!active)return;
        if(saved)setCapture(saved);
        if(saved?.capturedAt&&Date.now()<saved.nextRefreshAt&&!saved.error)return;
        const response=await fetch(`/api/v1/market-pulse?provider=sleeper&hours=${hours}`,{method:'POST',headers:{'x-bowser-refresh':'1'},credentials:'same-origin',cache:'no-store',signal:controller.signal});
        const body=await response.json();
        if(!response.ok||body.provider!=='sleeper'||body.window!==String(hours)||!Array.isArray(body.rows))throw Error('Sleeper activity unavailable.');
        const merged=mergeSnapshot(saved,body);
        if(active){setCapture(merged);setError(body.error||'');}
        try{await saveSnapshot(merged);}catch{/* Never store private Yahoo data here. */}
      }catch(caught){if(active){setCapture(saved);setError(caught.message||'Sleeper activity unavailable.');}}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;controller.abort();};
  },[hours,refresh,tick]);
  const snapshot=capture?.window===String(hours)?capture:null;
  const sleeperFor=useMemo(()=>sleeperActivityIndex(snapshot?.rows),[snapshot]);
  const [yahooPeriod,setYahooPeriod]=useState('today'),[yahooSnapshot,setYahooSnapshot]=useState(null),[yahooBusy,setYahooBusy]=useState(false),[yahooError,setYahooError]=useState(''),[yahooTick,setYahooTick]=useState(0);
  useEffect(()=>{
    let active=true;const controller=new AbortController();setYahooBusy(true);setYahooError('');
    fetch(`/api/v1/market-pulse?provider=yahoo&period=${yahooPeriod}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      const data=await response.json();if(!response.ok||data.provider!=='yahoo'||data.scope!=='platform'||!Array.isArray(data.rows))throw Error('Yahoo-wide trends unavailable.');
      if(active){setYahooSnapshot({...data,period:yahooPeriod});setYahooError(data.error||'');}
    }).catch(error=>{if(active)setYahooError(error.message);}).finally(()=>{if(active)setYahooBusy(false);});
    return()=>{active=false;controller.abort();};
  },[yahooPeriod,yahooTick,refresh,tick]);
  const publicYahoo=yahooSnapshot?.period===yahooPeriod?yahooSnapshot:null;
  const yahooFor=useMemo(()=>sleeperActivityIndex(publicYahoo?.rows),[publicYahoo]);
  const reloadYahoo=useCallback(()=>setYahooTick(n=>n+1),[]);
  return {hours,setHours,snapshot,sleeperFor,loading,error,refreshSleeper:()=>setTick(n=>n+1),yahooFor,yahooPeriod,setYahooPeriod,yahooSnapshot:publicYahoo,yahooBusy,yahooError,yahooCoverage:publicYahoo?.coverage||'Yahoo-wide public transaction trends. Missing counts remain unavailable.',reloadYahoo,options:[],teamKey:''};
}
