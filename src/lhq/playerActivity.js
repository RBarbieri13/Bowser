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

export function attachYahooMarketActivity(rows, yahooRows, yahooFor) {
  const matches=new Map();
  for(const row of rows){
    const key=identity(row);
    if(key)matches.set(key,(matches.get(key)||0)+1);
  }
  const counts=row=>{
    const values=yahooFor(row);
    if(!values)return null;
    const {adds,drops}=values;
    return {...values,total:adds!==null&&drops!==null?adds+drops:null};
  };
  const yahooIds=new Map(yahooRows.map(row=>[identity(row),row.id]));
  const result=rows.map(row=>{
    const key=identity(row),yahooActivity=matches.get(key)===1?counts(row):null;
    if(!yahooActivity)return row;
    const match=row.match.endsWith(' only')?(key.startsWith('DEF|')?'Team defense':'Name, position & team'):row.match;
    return {...row,match,aliases:[...row.aliases,yahooIds.get(key)],yahooActivity};
  });
  for(const row of yahooRows){
    const key=identity(row),yahooActivity=counts(row);
    if(key&&!matches.has(key)&&yahooActivity){
      const {id,name,team,position}=row;
      result.push({id,name,team:normalizeTeam(team),position:normalizePosition(position),aliases:[id],match:'Yahoo only',yahooActivity});
    }
  }
  return result;
}

/** Public downloads must not disclose private activity via Rank or ordering. */
export function publicActivityExport(rows,columns,sort,rankSort) {
  const privateKey=key=>['activity_yahoo','league_ownership'].includes(key);
  const privateRank=privateKey(rankSort?.key);
  const exportedColumns=columns.filter(c=>isPublicExportColumn(c)&&!(privateRank&&c.key==='rank'));
  const privateOrder=privateKey(sort?.key)||(sort?.key==='rank'&&privateRank);
  return {columns:exportedColumns,rows:privateOrder?sortRows(rows,{key:'fantasy_points',desc:true},[{key:'fantasy_points',value:r=>r.fantasy_points}]):rows};
}
