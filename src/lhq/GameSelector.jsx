import {bowserGameSelector as design} from './selectorStyles.js';
import {nflTeam} from './playerWorkspace.js';
import './selectors.css';
const known=v=>typeof v==='number'&&Number.isFinite(v);
export function gameSelection(selected,id,additive=false,single=false){return additive&&!single?(selected.includes(id)?selected.filter(k=>k!==id):[...selected,id]):selected.length===1&&selected[0]===id?[]:[id];}
export function gamePresentation(game){
 const away=nflTeam(game.awayTeam),home=nflTeam(game.homeTeam);
 const phase=game.state==='in'?'live':game.state==='post'||known(game.homeScore)&&known(game.awayScore)?'final':'pre';
 let status='Kickoff unavailable';
 if(phase==='final')status=`Final${game.overtime?' · OT':''}`;
 else if(phase==='live')status=[game.quarter,game.clock].filter(v=>v!=null&&v!=='').join(' ')||'Live · clock unavailable';
 else if(game.kickoffUtc&&Number.isFinite(Date.parse(game.kickoffUtc)))status=new Date(game.kickoffUtc).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',minute:'2-digit'}).replace(',','');
 else if(game.gameday){const date=new Date(`${game.gameday}T12:00:00Z`);const [h,m]=String(game.gametime||'').split(':');status=`${Number.isFinite(date.getTime())?date.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}):game.gameday}${h&&m?` ${Number(h)%12||12}:${m} ${Number(h)<12?'AM':'PM'}`:' · time unavailable'}`;}
 const favorite=nflTeam(game.favoriteTeam),spread=game.spread,total=game.overUnder;
 return {phase,status,teams:[away,home].map((abbr,i)=>{const score=i?game.homeScore:game.awayScore,other=i?game.awayScore:game.homeScore;let value='—',color=design.colors.muted;
 if(phase==='pre'){if(favorite===abbr&&known(spread))value=`${-Math.abs(spread)}`;else if(favorite&&known(total))value=`o${total}`;}
 else {value=known(score)?String(score):'—';color=known(score)&&known(other)&&score>other?design.colors.green:phase==='live'?design.colors.text:design.colors.muted;}
 return {abbr,value,color,possession:phase==='live'&&nflTeam(game.possession)===abbr,logo:`/logos/nfl/${abbr==='LA'?'LAR':abbr}.png`};})};
}
export function GameSelector({games=[],selected=[],highlighted=[],eligible,onChange,single=false,compact=false,label='Game selector',empty='No sourced games available',details}){
 return <div className="bowser-game-selector" role="group" aria-label={label}><button type="button" className="bowser-game-all" data-selected={!selected.length} aria-pressed={!selected.length} onClick={()=>onChange([])}><span>All</span><small>{games.length} games</small></button>{games.map(g=>{const id=g.gameId||g.key,p=gamePresentation(g),on=selected.includes(id),disabled=eligible&&!eligible.includes(id);return <button type="button" key={id} aria-label={`${p.teams[0].abbr} @ ${p.teams[1].abbr} · ${g.gameday||p.status}`} title={`${p.teams[0].abbr}@${p.teams[1].abbr}${g.gameday?` · ${g.gameday}`:''} · ${p.status}${p.phase==='pre'?` ET${known(g.spread)&&known(g.overUnder)?'':' · odds unavailable'}`:''}${details?` · ${details(g)}`:''}`} className="bowser-game-box" style={{...design.box,width:compact?design.compact.width:design.box.width}} data-selected={on||highlighted.includes(id)} data-slate={highlighted.includes(id)} data-faded={selected.length>0&&!on} aria-pressed={on} disabled={disabled} onClick={e=>onChange(gameSelection(selected,id,e.shiftKey||e.metaKey||e.ctrlKey,single))}><span className="bowser-game-status" data-live={p.phase==='live'}><span className="bowser-game-status-label">{p.status}</span>{p.phase==='live'&&<i aria-label="Live"/>}</span>{p.teams.map(t=><span key={t.abbr} className="bowser-game-team" style={{...design.row,height:compact?design.compact.rowHeight:design.row.height}}><i className="bowser-possession" style={{background:t.possession?design.colors.green:'transparent'}} aria-label={t.possession?`${t.abbr} possession`:undefined}/><span className="bowser-game-logo"><img src={t.logo} alt={`${t.abbr} helmet`} width={design.logoSize} height={design.logoSize}/></span><span className="bowser-game-abbr">{t.abbr}</span><span className="bowser-game-value" style={{color:t.color}}>{t.value}</span></span>)}</button>;})}{!games.length&&<span className="bowser-game-empty">{empty}</span>}</div>;
}
