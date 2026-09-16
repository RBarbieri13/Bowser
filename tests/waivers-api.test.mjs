import test from 'node:test';
import assert from 'node:assert/strict';
import { queryWaivers, readWaiverSnapshot, supplementWaiverSnapshot } from '../server/waivers-store.mjs';
const snapshot={season:2026,waiverWeek:2,capturedAt:'2026-09-15T12:00:00Z',sources:[],players:[
 {id:'known',playerId:'00-1',name:'First Player',position:'RB',team:'JAC',rankings:{a:{rank:1}},faab:{a:{low:0,high:0,unit:'percent',budgetBasis:'annual'}}},
 {id:'new',playerId:'00-2',name:'New Player',position:'WR',team:'BUF',rankings:{a:{rank:2}},faab:{}},
 {id:'collision',playerId:'00-wrong',name:'First Player',position:'RB',team:'JAX',rankings:{},faab:{}},
]};
const stats=[{player_id:'00-1',player_display_name:'First Player',position:'RB',team:'JAX',games_played:1,snaps:20,carries:7,fantasy_points:12,player_trends:[{week:1,gameId:'2026_01_A_B',rushAttempts:7,targets:2,fantasyPoints:12},{week:2,rushAttempts:90}]}];
const market={refresh:async(provider)=>({provider,capturedAt:123,window:'24',rows:provider==='sleeper'?[{id:'sleeper:1',gsisId:'00-1',name:'First Player',position:'RB',team:'JAX',adds:100,drops:null}]:[{name:'First Player',position:'RB',team:'JAX',rosterPct:25,startPct:3}]})};
const deps={snapshot,availableWeeks:[2],readMeta:()=>({weekOptions:[{week:1}]}),queryStats:params=>{assert.equal(params.get('season'),'2026');assert.equal(params.get('scoring'),'half');return {data:stats};},market};
test('waivers joins stable identities, retains no-stat targets, preserves explicit zero and selected trend scope',async()=>{
 const result=await queryWaivers(new URLSearchParams('season=2026&week=2&weeks=1&scoring=half'),deps);
 assert.equal(result.rows.length,3);assert.equal(result.rows[0].stats.carries,7);assert.equal(result.rows[0].faab.a.low,0);
 assert.equal(result.rows[0].stats.trends.length,1);assert.equal(result.rows[0].stats.trends[0].carries,7);
 assert.equal(result.rows[1].stats.fantasy_points,null);assert.equal(result.rows[2].stats.fantasy_points,null);
 assert.equal(result.rows[0].activity.adds,100);assert.equal(result.rows[0].activity.drops,null);assert.equal(result.rows[0].activity.rosterPct,25);
 assert.equal(result.rows[0].stats.draft_kings_price,undefined);assert.equal(result.rows[0].stats.adp,undefined);
});
test('failed popularity feeds retain rankings and statistics with explicit source errors',async()=>{
 const result=await queryWaivers(new URLSearchParams('scoring=half'),{...deps,market:{refresh:async()=>{throw new Error('offline');}}});
 assert.equal(result.rows[0].rankings.a.rank,1);assert.equal(result.rows[0].stats.fantasy_points,12);assert.equal(result.rows[0].activity.adds,null);assert.ok(result.meta.activity.every(p=>p.error));
});
test('rejects unsupported seasons, malformed weeks and activity windows',async()=>{
 for(const query of ['season=2024','weeks=0','weeks=1,no','hours=7','scoring=dk'])await assert.rejects(queryWaivers(new URLSearchParams(query),deps));
});
test('published snapshot has five independently populated ranking and FAAB sources',()=>{
 const data=readWaiverSnapshot(2026,2);
 assert.ok(data.sources.filter(s=>s.rankCount>0).length>=5);assert.ok(data.sources.filter(s=>s.faabCount>0).length>=5);
 for(const s of data.sources){assert.equal(s.rankCount,data.players.filter(p=>p.rankings[s.id]).length);assert.equal(s.faabCount,data.players.filter(p=>p.faab[s.id]).length);}
 assert.ok(data.players.length>20);
 assert.equal(data.sources.some(s=>/faabtastic/i.test(s.id)),false);
});

test('additional expert bids preserve published ranges and separate community advice',()=>{
 const data=readWaiverSnapshot(2026,2);
 assert.equal(data.sources.filter(s=>s.faabCount>0 && s.type!=='community').length,8);
 assert.equal(data.sources.filter(s=>s.type==='community').length,1);
 const shough=data.players.find(p=>p.name==='Tyler Shough');
 assert.deepEqual([shough.faab.ftn.low,shough.faab.ftn.high],[5,10]);
 assert.equal(shough.faab.fantasylife.low,17.5);
 assert.equal(shough.faab.fantasylife.tier,'10–12 teams / 1-QB');
 assert.equal(shough.faab.fantasylife.alternatives.find(b=>b.tier==='10–12 teams / superflex').low,60);
 const coker=data.players.find(p=>p.name==='Jalen Coker');
 assert.deepEqual([coker.faab.ftn.low,coker.faab.ftn.high],[10,20]);
 assert.equal(data.sources.find(s=>s.id==='moves').type,'community');
 assert.ok(data.supplementRecordedAt);
});

test('supplement rejects wrong scope, mismatched identities, invalid bids and inaccurate coverage without mutating base',()=>{
 const base=structuredClone(snapshot);
 const supplement={season:2026,waiverWeek:2,recordedAt:'2026-09-16T00:00:00Z',
  sources:[{id:'extra',type:'expert',faabUrl:'https://example.com/research',rankCount:0,faabCount:1}],
  players:[{id:'known',name:'First Player',position:'RB',faab:{extra:{low:5,high:10,unit:'percent',budgetBasis:'annual'}}}]};
 const merged=supplementWaiverSnapshot(base,supplement);
 assert.equal(merged.players[0].faab.extra.low,5);
 assert.deepEqual(merged.players[0].faab.a,base.players[0].faab.a);
 assert.equal(base.players[0].faab.extra,undefined);
 for(const mutate of [
  s=>s.season=2025,
  s=>s.players[0].name='Wrong Player',
  s=>s.players[0].id='unknown',
  s=>s.players.push(structuredClone(s.players[0])),
  s=>s.sources[0].faabCount=2,
  s=>s.sources[0].rankCount=1,
  s=>s.players[0].faab.extra.high=101,
  s=>s.players[0].faab.extra.low=null,
  s=>s.players[0].faab.a=s.players[0].faab.extra,
  s=>s.sources.push(structuredClone(s.sources[0])),
 ]) {
  const invalid=structuredClone(supplement);mutate(invalid);
  assert.throws(()=>supplementWaiverSnapshot(base,invalid));
  assert.deepEqual(base,snapshot);
 }
});
