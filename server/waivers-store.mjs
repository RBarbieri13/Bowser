import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMeta, queryPlayers, queryPlayerHistories, QueryValidationError } from './stats-store.mjs';
import { getMarketPulse } from './market-pulse.mjs';

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../data');
const snapshots = new Map();
const STAT_FIELDS = ['games_played','snaps','snap_pct','passing_attempts','completions','passing_yards','passing_tds','interceptions','carries','rushing_yards','rushing_tds','targets','receptions','receiving_yards','receiving_tds','fantasy_points','position_finish','position_finish_week','position_finish_season'];
const normalizeName = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const teamCode = value => ({JAC:'JAX',LA:'LAR',WSH:'WAS'}[value] || value);
const positionCode = value => ['DST','D/ST','DEF'].includes(value) ? 'DEF' : value;
const identity = row => `${normalizeName(row.name || row.player_display_name)}|${positionCode(row.position)}|${teamCode(row.team)}`;
function uniqueIndex(rows, key) {
  const map = new Map();
  for (const row of rows) { const id = key(row); if (id) map.set(id, map.has(id) ? null : row); }
  return map;
}
function integer(params, key, fallback, min, max) {
  const raw = params.get(key);
  if (raw === null || raw === '') return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) throw new QueryValidationError(key, `Choose a valid ${key}.`);
  return Number(raw);
}
export function availableWaiverWeeks(season) {
  return readdirSync(dataDir).flatMap(name => { const match = name.match(/^waivers-(\d{4})-week(\d{1,2})\.json$/); return match && Number(match[1]) === season ? [Number(match[2])] : []; }).sort((a,b)=>a-b);
}
export function supplementWaiverSnapshot(snapshot, supplement) {
  if (supplement.season !== snapshot.season || supplement.waiverWeek !== snapshot.waiverWeek || !Array.isArray(supplement.sources) || !Array.isArray(supplement.players)) throw new Error('Invalid waiver supplement scope.');
  const merged = structuredClone(snapshot), sourceIds = new Set(merged.sources.map(source => source.id)), additions = new Set();
  for (const source of supplement.sources) {
    if (!source.id || sourceIds.has(source.id) || additions.has(source.id) || !['expert','community'].includes(source.type) || !source.faabUrl?.startsWith('https://')) throw new Error('Invalid supplementary source.');
    additions.add(source.id);
  }
  const players = new Map(merged.players.map(player => [player.id, player])), seen = new Set(), counts = new Map();
  function validateBid(bid) {
    if (!bid || !Number.isFinite(bid.low) || bid.low < 0 || !Number.isFinite(bid.high) || bid.high < bid.low || bid.high > 100 || !['percent','dollars'].includes(bid.unit) || !['annual','remaining','unspecified'].includes(bid.budgetBasis) || (bid.unit === 'dollars' && bid.referenceBudget !== 100)) throw new Error('Invalid supplementary bid.');
    for (const alternative of bid.alternatives || []) validateBid(alternative);
  }
  for (const addition of supplement.players) {
    const player = players.get(addition.id);
    if (!player || seen.has(addition.id) || player.name !== addition.name || player.position !== addition.position) throw new Error('Unmatched supplementary identity.');
    seen.add(addition.id);
    for (const [id,bid] of Object.entries(addition.faab || {})) {
      if (!additions.has(id) || player.faab[id]) throw new Error('Invalid supplementary source mapping.');
      validateBid(bid); player.faab[id] = structuredClone(bid); counts.set(id,(counts.get(id)||0)+1);
    }
  }
  for (const source of supplement.sources) {
    if (source.rankCount !== 0 || source.faabCount !== counts.get(source.id)) throw new Error('Supplementary coverage mismatch.');
    merged.sources.push(structuredClone(source));
  }
  merged.supplementRecordedAt = supplement.recordedAt;
  return merged;
}
export function readWaiverSnapshot(season, week) {
  const key = `${season}-${week}`;
  if (!availableWaiverWeeks(season).includes(week)) throw new QueryValidationError('week', `No published waiver snapshot is available for ${season} Week ${week}.`);
  if (!snapshots.has(key)) {
    let snapshot = JSON.parse(readFileSync(resolve(dataDir,`waivers-${season}-week${week}.json`),'utf8'));
    if (snapshot.season !== season || snapshot.waiverWeek !== week || !Array.isArray(snapshot.players) || !Array.isArray(snapshot.sources)) throw new Error('Invalid waiver snapshot.');
    if (snapshot.sources.filter(s=>s.rankCount>0).length < 5 || snapshot.sources.filter(s=>s.faabCount>0).length < 5) throw new Error('Waiver source coverage is incomplete.');
    const supplementPath = resolve(dataDir,`waivers-supplement-${season}-week${week}.json`);
    if (existsSync(supplementPath)) snapshot = supplementWaiverSnapshot(snapshot,JSON.parse(readFileSync(supplementPath,'utf8')));
    snapshots.set(key,snapshot);
  }
  return snapshots.get(key);
}
export async function queryWaivers(params = new URLSearchParams(), deps = {}) {
  const season = integer(params,'season',2026,2025,2026);
  const knownWeeks = deps.availableWeeks || availableWaiverWeeks(season);
  const week = integer(params,'week',knownWeeks.at(-1) || 2,1,22);
  const snapshot = deps.snapshot || readWaiverSnapshot(season,week);
  const scoring = params.get('scoring') || 'ppr';
  if (!['ppr','half','standard'].includes(scoring)) throw new QueryValidationError('scoring','Choose PPR, Half PPR or Standard.');
  const hours = integer(params,'hours',24,6,72);
  if (![6,24,72].includes(hours)) throw new QueryValidationError('hours','Choose 6, 24 or 72 hours.');
  const meta = (deps.readMeta || getMeta)(undefined,new URLSearchParams({season:String(season)}));
  const completedWeeks = [...new Set((meta.weekOptions || []).map(w=>Number(w.week)))].sort((a,b)=>a-b);
  const rawWeeks = params.get('weeks') || completedWeeks.filter(w=>w<week).join(',') || '1';
  if (!/^\d+(,\d+)*$/.test(rawWeeks)) throw new QueryValidationError('weeks','Choose valid statistics weeks.');
  const selectedWeeks = [...new Set(rawWeeks.split(',').map(Number))];
  if (selectedWeeks.some(w=>w<1 || w>22)) throw new QueryValidationError('weeks','Choose statistics weeks from 1 through 22.');
  const statsParams = new URLSearchParams({season:String(season),seasonType:'ALL',weeks:selectedWeeks.join(','),scoring,limit:'all',includeTrends:'1',positions:'QB,RB,WR,TE,K',trendWeeks:params.get('trendWeeks') || '10'});
  const statsPayload = (deps.queryStats || queryPlayers)(statsParams);
  const statsById = uniqueIndex(statsPayload.data,row=>row.player_id);
  const statsByIdentity = uniqueIndex(statsPayload.data,identity);
  const missingIds = snapshot.players.filter(player=>player.playerId && !statsById.has(player.playerId)).map(player=>player.playerId);
  const extraHistory = missingIds.length ? (deps.queryHistory || queryPlayerHistories)(statsParams, missingIds) : new Map();
  const market = deps.market || getMarketPulse();
  // A provider outage must not hide the imported rankings or recorded statistics.
  const activity = await Promise.allSettled(['sleeper','espn'].map(provider=>market.refresh(provider,hours)));
  const providerData = activity.map((result,i)=>result.status==='fulfilled' ? result.value : {provider:['sleeper','espn'][i],rows:[],capturedAt:null,error:'Activity source unavailable'});
  const [sleeper,espn] = providerData;
  const sleeperById = uniqueIndex(sleeper.rows,row=>row.gsisId);
  const sleeperByIdentity = uniqueIndex(sleeper.rows,identity);
  const espnByIdentity = uniqueIndex(espn.rows,identity);
  const rows = snapshot.players.map(player=>{
    const stat = player.playerId ? statsById.get(player.playerId) : statsByIdentity.get(identity(player));
    const canonicalId = player.playerId || stat?.player_id || null;
    const matchedIdentity = stat ? {...player,name:stat.player_display_name,team:stat.team} : player;
    const add = (canonicalId && sleeperById.get(canonicalId)) || sleeperByIdentity.get(identity(matchedIdentity));
    const ownership = espnByIdentity.get(identity(matchedIdentity));
    const statistics = Object.fromEntries(STAT_FIELDS.map(field=>[field,stat?.[field] ?? null]));
    statistics.trends = (stat?.player_trends || extraHistory.get(canonicalId) || []).map(game=>({...game,
      carries:game.rushAttempts, fantasy_points:game.fantasyPoints,
      rushing_yards:game.rushingYards,rushing_tds:game.rushingTds,receiving_yards:game.receivingYards,receiving_tds:game.receivingTds,
    }));
    return {...player,playerId:canonicalId,season,stats:statistics,statsMatched:!!stat,activity:{
      adds:add?.adds ?? null,drops:add?.drops ?? null,net:add?.net ?? null,rosterPct:ownership?.rosterPct ?? null,startPct:ownership?.startPct ?? null,
      windowHours:hours,addsSource:'Sleeper',ownershipSource:'ESPN',addsCapturedAt:sleeper.capturedAt,ownershipCapturedAt:espn.capturedAt,
      addsUrl:'https://docs.sleeper.com/#trending-players',ownershipUrl:'https://fantasy.espn.com/football/players/add',
    }};
  });
  return {meta:{season,waiverWeek:week,capturedAt:snapshot.capturedAt,supplementRecordedAt:snapshot.supplementRecordedAt || null,availableWeeks:knownWeeks,statsWeeks:completedWeeks,selectedStatsWeeks:selectedWeeks,statsSeason:season,scoring,sources:snapshot.sources,trendSlots:statsPayload.meta?.trendSlots || [],trendDomains:statsPayload.meta?.trendDomains || {},positionFinish:statsPayload.meta?.positionFinish,
    activity:providerData.map(({provider,capturedAt,error,stale,window})=>({provider,capturedAt,error:error||null,stale:!!stale,window})),
    totalPlayers:rows.length,statsMatched:rows.filter(r=>r.statsMatched).length,notes:['Rankings and FAAB are a dated source snapshot; scoring changes apply to historical statistics only.','Global roster percentages do not establish availability in your league.'],
  },rows};
}
export async function waiversHandler(request,response) {
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  if (request.method !== 'GET') { response.statusCode=405;response.setHeader('Allow','GET');response.end(JSON.stringify({error:{message:'Waivers is read-only.'}}));return; }
  try {const params=new URL(request.originalUrl || request.url,'http://local').searchParams;const result=await queryWaivers(params);response.statusCode=200;response.end(JSON.stringify(result));}
  catch(error){response.statusCode=error instanceof QueryValidationError ? 400 : 500;response.end(JSON.stringify({error:{message:error instanceof QueryValidationError ? error.message : 'Waiver data is unavailable. Existing saved targets are unchanged.'}}));}
}
export function waiversPlugin(){return {name:'waivers-api',configureServer(server){server.middlewares.use('/api/v1/waivers',waiversHandler);}};}
