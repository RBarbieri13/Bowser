import {sortRows} from './model.js';
import {publicIdentityKey,normalizePosition,normalizeTeam} from './playerIdentity.js';
export const ACTIVITY_FIELDS = [['adds','+','adds'],['drops','−','drops'],['net','Δ','net adds']];
export const activityKey = provider => `activity_${provider}`;
export const isPublicExportColumn = column => !['league_ownership','activity_yahoo','activity_sleeper'].includes(column.key);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function activityValues(row) {
  const adds=count(row?.adds), drops=count(row?.drops);
  return {adds,drops,net:adds!==null&&drops!==null?adds-drops:null};
}
export function compactActivity(value, signed=false) {
  if(!Number.isFinite(value))return '—';
  const abs=Math.abs(value), divisor=abs>=1e6?1e6:abs>=1e3?1e3:1;
  const text=divisor===1?String(abs):(abs/divisor).toFixed(abs/divisor>=100?0:1).replace(/\.0$/,'');
  return `${value<0?'−':signed&&value>0?'+':''}${text}${divisor===1e6?'m':divisor===1e3?'k':''}`;
}
function identity(row) {
  const team=normalizeTeam(row?.team),position=normalizePosition(row?.position);
  return position==='DEF'&&team&&team!=='FA'?`DEF|${team}`:publicIdentityKey(row);
}
/** Only complete unique source identities. Missing top-list membership is not zero. */
export function sleeperActivityIndex(rows=[]) {
  const index=new Map();
  for(const row of rows){const key=identity(row);if(key)index.set(key,index.has(key)?null:activityValues(row));}
  return row=>row?.identityUnavailable?null:index.get(identity(row))||null;
}

/** Public downloads must not disclose private activity via Rank or ordering. */
export function publicActivityExport(rows,columns,sort,rankSort) {
  const privateKey=key=>['activity_yahoo','league_ownership'].includes(key);
  const privateRank=privateKey(rankSort?.key);
  const exportedColumns=columns.filter(c=>isPublicExportColumn(c)&&!(privateRank&&c.key==='rank'));
  const privateOrder=privateKey(sort?.key)||(sort?.key==='rank'&&privateRank);
  return {columns:exportedColumns,rows:privateOrder?sortRows(rows,{key:'fantasy_points',desc:true},[{key:'fantasy_points',value:r=>r.fantasy_points}]):rows};
}
