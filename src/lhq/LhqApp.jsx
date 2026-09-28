import {useEffect,useRef,useState} from 'react';
import {App as LegacyApp} from '../App.jsx';
import {PlayerProfile} from '../PlayerProfile.jsx';
import {LeagueHub} from './LeagueHub.jsx';
import {YahooConnection} from './YahooConnection.jsx';
import {useYahooDashboard} from './useYahooDashboard.js';
import {OpportunityTracker} from './OpportunityTracker.jsx';
import {TeamBoxScores} from './TeamBoxScores.jsx';
import {MarketPulse} from './MarketPulse.jsx';
import {Waivers} from './Waivers.jsx';
import {PlayerDatabase} from './PlayerDatabase.jsx';
import {LhqProvider} from './shared.jsx';
export function LhqApp(){
 const [route,setRoute]=useState(()=>location.hash.slice(2)||'players'),[season,setSeason]=useState(2026),[scoring,setScoring]=useState('ppr'),[profile,setProfile]=useState(null),[error,setError]=useState('');const opener=useRef(null),openRevision=useRef(0);
 useEffect(()=>{const change=()=>setRoute(location.hash.slice(2)||'players');addEventListener('hashchange',change);return()=>removeEventListener('hashchange',change);},[]);
 const open=async(row,element)=>{const requestId=++openRevision.current;opener.current=element;setError('');const name=row.player_display_name||row.name||row.playerDisplayName;let playerId=row.player_id||row.playerId;const selectedSeason=row.season||season;try{if(!playerId){const r=await fetch(`/api/v1/player-identity?${new URLSearchParams({season:selectedSeason,name,team:row.team||'',position:row.position||''})}`);const d=await r.json();if(!r.ok||!d.match?.player_id)throw Error('No unique warehouse player identity is available.');playerId=d.match.player_id;}if(requestId===openRevision.current)setProfile({playerId,name,season:selectedSeason,scoring});}catch(e){if(requestId===openRevision.current)setError(e.message);}};
 const yahoo=useYahooDashboard({season});
 const page=route.split('?')[0];const params=new URLSearchParams(route.split('?')[1]||'');
 useEffect(()=>{if(page==='team-box-scores'){if(['2025','2026'].includes(params.get('season')))setSeason(Number(params.get('season')));if(['ppr','half','standard'].includes(params.get('scoring')))setScoring(params.get('scoring'));}},[route]);
 const props={season,setSeason,scoring,setScoring,onOpen:open};return <LhqProvider>{page==='players'?<PlayerDatabase {...props}/>:page==='waivers'?<Waivers {...props}/>:page==='market-pulse'?<MarketPulse {...props}/>:page==='team-box-scores'?<TeamBoxScores key={route} {...props} initialTeam={params.get('team')} initialWeeks={params.get('weeks')}/>:page==='opportunity-tracker'?<OpportunityTracker {...props}/>:route.split('?')[0]==='yahoo'?<YahooConnection {...props} yahoo={yahoo}/>:page==='league-hub'?<LeagueHub {...props} yahoo={yahoo}/>:<LegacyApp/>}{error&&<div role="alert" className="lhq-profile-error">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}{profile&&<PlayerProfile player={profile} season={profile.season} scoring={profile.scoring} onClose={()=>{openRevision.current++;setProfile(null);opener.current?.focus();}} onSelectPlayer={(playerId,name)=>setProfile(p=>({...p,playerId,name}))}/>}</LhqProvider>;
}
