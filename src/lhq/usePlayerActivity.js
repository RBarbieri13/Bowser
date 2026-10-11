import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {usePublicRefresh} from './shared.jsx';
import {mergeSnapshot,readSnapshot,saveSnapshot} from '../marketPulseStorage.js';
import {transactionSummary,transactionCoverage} from './LeagueResearch.jsx';
import {publicIdentityKey,leagueKeyFromTeam} from './playerIdentity.js';
import {sleeperActivityIndex} from './playerActivity.js';
const TTL=15*60*1000;
export function usePlayerActivity(yahoo,season) {
  const refresh=usePublicRefresh(),[hours,setHours]=useState(24),[capture,setCapture]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[tick,setTick]=useState(0),[selected,setSelected]=useState('');
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
  // Private transactions use the existing authorized serial queue and stay in memory.
  const account=yahoo?.status?.connected&&yahoo?.account?.season===Number(season)?yahoo.account:null;
  const teams=account?.teams||[],leagues=account?.leagues||[];
  const options=teams.filter((team,i)=>teams.findIndex(t=>leagueKeyFromTeam(t.key)===leagueKeyFromTeam(team.key))===i).map(team=>({key:team.key,name:leagues.find(l=>l.key===leagueKeyFromTeam(team.key))?.name||'Authorized league'}));
  const teamKey=options.some(t=>t.key===selected)?selected:options[0]?.key||'';
  const research=account&&teamKey?yahoo?.research?.[teamKey]:null;
  const validResearch=research?.season===Number(season)&&research?.teamKey===teamKey?research:null;
  const attempts=useRef({account:null,keys:new Set()});
  const busy=!!yahoo?.researchBusy?.[teamKey],load=yahoo?.loadResearch;
  useEffect(()=>{
    if(attempts.current.account!==account)attempts.current={account,keys:new Set()};
    if(!account||!teamKey||!load||busy||yahoo?.busy||validResearch?.transactions||attempts.current.keys.has(teamKey))return;
    attempts.current.keys.add(teamKey);load(teamKey,{include:'transactions'});
  },[account,teamKey,load,busy,yahoo?.busy,validResearch]);
  const yahooFor=useMemo(()=>{
    const memo=new Map();
    return row=>{const key=publicIdentityKey(row);if(!key||row.identityUnavailable)return null;if(!memo.has(key))memo.set(key,transactionSummary(validResearch,row));return memo.get(key);};
  },[validResearch]);
  const reloadYahoo=useCallback(()=>{if(account&&teamKey&&!busy)load?.(teamKey,{include:'transactions'});},[account,teamKey,busy,load]);
  return {hours,setHours,snapshot,sleeperFor,loading,error,refreshSleeper:()=>setTick(n=>n+1),yahooFor,teamKey,setTeamKey:setSelected,options,leagueName:options.find(t=>t.key===teamKey)?.name||'',yahooBusy:busy,yahooError:yahoo?.errors?.[`research:${teamKey}`]||validResearch?.errors?.transactions||'',yahooCoverage:account?transactionCoverage(validResearch):'Connect Yahoo to read private league transactions. Yahoo-wide activity is unavailable.',reloadYahoo};
}
