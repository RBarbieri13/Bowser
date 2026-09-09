import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getDfsSlate } from '../server/dfs-store.mjs';
import { queryPlayers, closeDatabase, QueryValidationError } from '../server/stats-store.mjs';

const snapshot=JSON.parse(readFileSync(new URL('../data/dfs-week1-2026.json',import.meta.url)));
test.after(()=>closeDatabase());
test('pinned Classic slates have unique IDs, real prices, bounded projections and source provenance',()=>{
  for(const [key,slate] of Object.entries(snapshot.slates)) {
    assert.equal(slate.season,2026);assert.equal(slate.week,1);assert.equal(slate.scoring,'DraftKings Classic');
    assert.equal(slate.gameCount,key==='week1'?16:12);
    assert.equal(new Set(slate.records.map(r=>r.team)).size,slate.gameCount*2);
    assert.equal(slate.coverage.salaryPlayers,slate.records.length);
    assert.equal(new Set(slate.records.map(r=>r.draftKingsId)).size,slate.records.length);
    const matched=slate.records.filter(r=>r.playerId);
    assert.equal(new Set(matched.map(r=>r.playerId)).size,matched.length);
    assert.ok(matched.length>350);
    for(const r of slate.records) {
      assert.ok(Number.isInteger(r.salary)&&r.salary>=2000&&r.salary<=15000);
      if(r.projection!==null) {assert.ok(Number.isFinite(r.projection)&&r.projection>=0&&r.projection<=70);assert.ok(r.projectionSource);assert.match(r.projectionUrl,/^https:\/\//);}
    }
  }
  assert.equal(getDfsSlate('invalid'),null);
});
test('all-week salary and projection are joined by stable identity and remain independent of historical scoring',()=>{
  const params='search=Jahmyr%20Gibbs&limit=all&includeTrends=0';
  const ppr=queryPlayers(new URLSearchParams(params));
  const standard=queryPlayers(new URLSearchParams(params+'&scoring=standard&weeks=1'));
  assert.equal(ppr.data[0].draft_kings_price,8000);
  assert.ok(ppr.data[0].draft_kings_projection>0);
  assert.equal(ppr.data[0].draft_kings_projection,standard.data[0].draft_kings_projection);
  assert.equal(ppr.meta.season,2025);assert.equal(ppr.meta.dfs.season,2026);
  assert.equal(ppr.meta.dfs.id,153054);
  assert.notEqual(ppr.data[0].fantasy_points,standard.data[0].fantasy_points);
});
test('main-slate exclusion is unknown, not zero; another slate restores the official price',()=>{
  const main=queryPlayers(new URLSearchParams('search=Puka%20Nacua&dfsSlate=main&includeTrends=0'));
  const week=queryPlayers(new URLSearchParams('search=Puka%20Nacua&dfsSlate=week1&includeTrends=0'));
  assert.equal(main.data[0].draft_kings_price,null);assert.equal(main.data[0].draft_kings_projection,null);
  assert.equal(week.data[0].draft_kings_price,7700);assert.ok(week.data[0].draft_kings_projection>0);
  assert.throws(()=>queryPlayers(new URLSearchParams('dfsSlate=showdown')),QueryValidationError);
});
test('DFS sorts use the entire filtered database and put unavailable values last in both directions',()=>{
  for(const field of ['draft_kings_price','draft_kings_projection'])for(const direction of ['asc','desc']){
    const result=queryPlayers(new URLSearchParams(`sort=${field}&direction=${direction}&dfsSlate=main&limit=all&includeTrends=0`));
    const values=result.data.map(r=>r[field]),present=values.filter(v=>v!==null);
    assert.ok(present.length>300);assert.equal(values.at(-1),null);
    assert.deepEqual(present,[...present].sort((a,b)=>direction==='asc'?a-b:b-a));
  }
});
