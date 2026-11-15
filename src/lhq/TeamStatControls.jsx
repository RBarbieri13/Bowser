import {CaretDown,CaretRight} from '@phosphor-icons/react';
import {COLORS} from './model.js';
import {ColumnLegend} from './ColumnLegend.jsx';
import './teamStatControls.css';

export const TEAM_STAT_GROUPS=[
 {id:'usage',label:'Usage',summary:'Snaps · Snap %',keys:['snaps','snap_pct']},
 {id:'passing',label:'Passing',summary:'C-A · Yds · TD · Int',keys:['passing_line','passing_yards','passing_tds','interceptions']},
 {id:'receiving',label:'Receiving',summary:'Rec · Yds · TD · Tgt',keys:['receptions','receiving_yards','receiving_tds','targets']},
 {id:'rushing',label:'Rushing',summary:'Att · Yds · TD',keys:['carries','rushing_yards','rushing_tds']},
 {id:'fantasy',label:'Fantasy',summary:'Points · Position finish',keys:['fantasy_points','position_finish']},
 {id:'dfs',label:'DFS',summary:'Salary · Projection',keys:['draft_kings_price','draft_kings_projection']},
];

export function TeamStatControls({visibleStats,dfs,onToggle,onCustomize}){
 return <div className="team-stat-controls" role="group" aria-label="Team box stat columns">
  <div className="team-stat-controls-label"><strong>Stat columns</strong><span>Show / hide <ColumnLegend label="Passing and receiving column key" text={'The four middle columns are shared: QB rows show passing; RB, WR and TE rows show receiving.\nC-A / REC = completions-attempts for QBs, receptions for receivers. YDS and TD follow the same position rule. INT / TGT = QB interceptions or receiver targets.\nUsage shows snaps and snap percentage. Rushing is a separate group for every position.\nClick a group to show all its stats or hide it. Column options lets you choose individual stats. Changes apply to every displayed week and are saved.'}/></span></div>
  <div className="team-stat-controls-buttons">{TEAM_STAT_GROUPS.map(group=>{
   const count=group.id==='dfs'&&!dfs?0:group.keys.filter(key=>visibleStats.includes(key)).length;
   const shown=count>0,complete=count===group.keys.length,Chevron=shown?CaretDown:CaretRight;
   return <button type="button" key={group.id} className="team-stat-toggle" style={{'--team-stat-color':COLORS[group.id]}} data-visible={shown} aria-label={`${complete?'Hide':'Show'} ${group.label.toLowerCase()} columns`} aria-expanded={shown} title={`${complete?'Hide':'Show all'} ${group.label.toLowerCase()} columns across every week`} onClick={()=>onToggle(group,!complete)}>
    <span className="team-stat-toggle-title"><Chevron size={13} aria-hidden="true"/><strong>{group.label}</strong>{shown&&!complete&&<small>{count}/{group.keys.length}</small>}</span>
    <span className="team-stat-toggle-summary">{group.summary}</span>
   </button>;
  })}</div>
  <button type="button" className="lhq-mini lhq-outline team-stat-customize" onClick={onCustomize}>Column options</button>
 </div>;
}
