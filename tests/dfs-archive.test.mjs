import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { getDfsWeek,getDfsArchiveIndex,getDfsSlate } from '../server/dfs-store.mjs';
import { queryPlayers,queryTeamBoxScores,queryOpportunityTracker,queryPlayerIdentity,queryPlayerProfile,queryDfsArchive,openDatabase } from '../server/stats-store.mjs';

const params = value => new URLSearchParams(value);

test('archive keeps both 2026 weeks and immutable pre-enrichment capture versions', () => {
  const index = getDfsArchiveIndex();
  assert.ok(index.some(s => s.season===2026 && s.week===1));
  const allWeek = index.filter(s => s.slateId===153427);
  assert.ok(allWeek.length>=2);
  const old = allWeek.find(s => s.projectedPlayers===192);
  const expanded = allWeek.find(s => s.projectedPlayers===398);
  assert.ok(old); assert.ok(expanded);
  assert.notEqual(old.captureId,expanded.captureId);
  const oldData = getDfsWeek(2026,2,{captureId:old.captureId});
  const newData = getDfsWeek(2026,2,{captureId:expanded.captureId});
  assert.equal(oldData.records.find(r=>r.name==='Carson Wentz').projection,null);
  assert.equal(oldData.records.find(r=>r.name==='Jahmyr Gibbs').projection,23.1);
  assert.equal(newData.records.find(r=>r.name==='Carson Wentz').projection,14.95);
  assert.equal(newData.records.find(r=>r.name==='Carson Wentz').projectionSource,'Fantasy Sports Central');
});

test('exact-week lookup never leaks current DFS into unavailable historical weeks', () => {
  const prior = getDfsWeek(2026,1).records.find(r=>r.name==='Jahmyr Gibbs');
  const next = getDfsWeek(2026,2).records.find(r=>r.name==='Jahmyr Gibbs');
  assert.equal(prior.salary,8000); assert.equal(next.salary,8500);
  for (const [season,week] of [[2025,18],[2099,1]]) {
    const result=getDfsWeek(season,week);
    assert.equal(result.meta.available,false); assert.deepEqual(result.records,[]);
    assert.match(result.meta.reason,new RegExp(`${season} Week ${week}`));
  }
  assert.equal(getDfsWeek(2026,2,{captureId:'does-not-exist'}).meta.available,false);
  assert.ok(getDfsSlate('week1').records.length>350);
});

test('Team Box joins historical salaries and NFL-wide position ranks before team filtering', () => {
  const result=queryTeamBoxScores(params('season=2026&team=DET&weeks=1&scoring=ppr&trendAnchors=1&trendWeeks=18'));
  const gibbs=result.data.find(r=>r.player_display_name==='Jahmyr Gibbs');
  assert.equal(gibbs.draft_kings_price,8000); assert.equal(gibbs.draft_kings_projection,22.2);
  assert.equal(gibbs.dfs_meta.week,1); assert.equal(gibbs.position_finish,3);
  const all=queryPlayers(params('season=2026&weeks=1&positions=RB&limit=all&scoring=ppr')).data;
  assert.equal(gibbs.position_finish,all.find(r=>r.player_id===gibbs.player_id).position_finish);
  assert.equal(gibbs.trendsByAnchor['1'].length,18);
  assert.deepEqual(gibbs.trendsByAnchor['1'].map(r=>r.key),result.meta.trendsByAnchor['1'].slots.map(r=>r.key));
});

test('upcoming Team Box rows contain verified DFS and null actual statistics', () => {
  const result=queryTeamBoxScores(params('season=2026&team=DET&weeks=2&trendAnchors=2&trendWeeks=5'));
  const gibbs=result.data.find(r=>r.player_display_name==='Jahmyr Gibbs');
  assert.equal(gibbs.played,false); assert.equal(gibbs.stats_available,false);
  for(const key of ['snaps','fantasy_points','position_finish','carries','rushing_yards']) assert.equal(gibbs[key],null);
  assert.equal(gibbs.draft_kings_price,8500);assert.equal(gibbs.draft_kings_projection,getDfsWeek(2026,2).records.find(r=>r.name==='Jahmyr Gibbs').projection);
  assert.equal(result.meta.trendsByAnchor['2'].week,1);
  assert.equal(gibbs.trendsByAnchor['2'].at(-1).week,1);
});

test('moving Team Box anchors really reanchors the shared prior-season history', () => {
  const result=queryTeamBoxScores(params('season=2025&team=MIN&weeks=3,4&trendAnchors=3,4&trendWeeks=5'));
  assert.equal(result.meta.trendsByAnchor['3'].slots.at(-1).week,3);
  assert.equal(result.meta.trendsByAnchor['4'].slots.at(-1).week,4);
  assert.ok(result.data.every(row=>row.draft_kings_price===null && row.dfs_meta.season===2025));
});

test('Opportunity and Player Database expose explicitly selected-week DFS and 18-week histories', () => {
  for(const dfsSlate of ['current','selected-week']) {
    const result=queryOpportunityTracker(params(`season=2026&team=DET&weeks=1&games=18&dfsSlate=${dfsSlate}`));
    const gibbs=result.data.groups.flatMap(g=>g.players).find(p=>p.name==='Jahmyr Gibbs');
    assert.equal(gibbs.history.length,18); assert.equal(gibbs.position_finish,3);
    const current=getDfsSlate('current');
    assert.equal(result.meta.dfs.week,dfsSlate==='current'?current.meta.week:1);
    assert.equal(gibbs.draft_kings_price,dfsSlate==='current'?(current.records.find(row=>row.playerId===gibbs.playerId)?.salary ?? null):8000);
  }
  const database=queryPlayers(params('season=2026&weeks=1&search=Jahmyr&dfsSlate=selected-week&trendWeeks=18'));
  assert.equal(database.meta.dfs.week,1); assert.equal(database.data[0].draft_kings_price,8000);
});

test('identity resolution is conservative and rostered players without current statistics have profiles', () => {
  assert.equal(queryPlayerIdentity(params('season=2026&name=Jahmyr+Gibbs&team=DET&position=RB')).match.player_id,'00-0039139');
  assert.equal(queryPlayerIdentity(params('season=2026&name=Jahmyr+Gibbs&team=BUF&position=RB')).match,null);
  assert.equal(queryPlayerIdentity(params('season=2026&name=Not+a+Real+Player')).match,null);
  const db=openDatabase(undefined,2026);
  const row=db.prepare(`SELECT player_id FROM team_roster WHERE position IN ('QB','RB','WR','TE') AND player_id NOT IN (
    SELECT player_id FROM player_week_stats WHERE source_player_stats=1) LIMIT 1`).get();
  assert.ok(row);
  const profile=queryPlayerProfile(params(`season=2026&playerId=${row.player_id}&trendWeeks=18`));
  assert.equal(profile.data.player.playerId,row.player_id);
  assert.equal(profile.data.gameLogs.length,0);assert.equal(profile.meta.statsAvailable,false);
  assert.equal(profile.data.history.length,18);assert.equal(profile.meta.trendSlots.length,18);
  assert.ok(profile.meta.emptyReason);
});

test('archive API filters by player and preserves source and capture lineage',()=>{
  const result=queryDfsArchive(params('season=2026&week=1&playerId=00-0039139'));
  assert.equal(result.data.length,1);assert.equal(result.data[0].salary,8000);
  assert.ok(result.meta.captureId);assert.ok(result.meta.captures.length>=2);
  assert.throws(()=>queryDfsArchive(params('season=2026&week=19')),/regular-season/);
});

test('selected-week DFS keeps the requested upcoming week independent of completed rank context',()=>{
 const opportunity=queryOpportunityTracker(params({season:'2026',team:'NYG',weeks:'2',dfsSlate:'selected-week'}));
 assert.equal(opportunity.meta.dfs.week,2);
 const players=queryPlayers(params({season:'2026',weeks:'2',dfsSlate:'selected-week'}));
 assert.equal(players.meta.dfs.week,2);
});

test('Vercel shared player research function preserves all public route query parameters',async()=>{
 const {default:handler}=await import('../api/v1/player-profile.mjs');
 const invoke=url=>{const response={setHeader(){},end(text){this.body=JSON.parse(text);}};handler({method:'GET',url},response);assert.equal(response.statusCode,200);return response.body;};
 assert.equal(invoke('/api/v1/player-profile?resource=identity&season=2026&name=Cam%20Skattebo&team=NYG&position=RB').match.player_display_name,'Cam Skattebo');
 assert.equal(invoke('/api/v1/dfs-archive?season=2026&week=2').meta.week,2);
 assert.equal(invoke('/api/v1/player-profile?resource=archive&season=2026&week=1').meta.week,1);
});


test('Showdown player/Opportunity joins and exact archived role selection never mix Captain with FLEX',()=>{
 for(const [suffix,role,price] of [['','FLEX',12000],[':cpt','CPT',18000]]){
  const key='2026-w2-dk-153434'+suffix;
  const players=queryPlayers(params({season:'2026',weeks:'1',search:'Jahmyr Gibbs',dfsSlate:key,includeTrends:'0'}));
  assert.equal(players.data.length,1);assert.equal(players.data[0].draft_kings_price,price);
  assert.equal(players.data[0].position_finish,3);assert.equal(players.meta.dfs.rosterPosition,role);
  const opportunity=queryOpportunityTracker(params({season:'2026',team:'DET',weeks:'1',dfsSlate:key}));
  const gibbs=opportunity.data.groups.flatMap(g=>g.players).find(r=>r.name==='Jahmyr Gibbs');
  assert.equal(gibbs.draft_kings_price,price);assert.equal(gibbs.position_finish,3);
  assert.equal(gibbs.dfs_meta.rosterPosition,role);
  assert.ok(opportunity.meta.dfs.options.some(option=>option.key===key));
  const archived=queryDfsArchive(params({season:'2026',week:'2',slateId:'153434',rosterPosition:role,playerId:gibbs.playerId}));
  assert.equal(archived.data.length,1);assert.equal(archived.data[0].salary,price);
  assert.equal(archived.meta.rosterPosition,role);
  const capture=getDfsWeek(2026,2,{captureId:archived.meta.captureId,rosterPosition:role});
  assert.ok(capture.records.every(record=>record.rosterPosition===role));
 }
 assert.throws(()=>queryDfsArchive(params({season:'2026',week:'2',slateId:'153434',rosterPosition:'invalid'})),/FLEX or CPT/);
 assert.equal(getDfsWeek(2026,2).meta.scoring,'DraftKings Classic');
});


test('selected archive records are reused and refreshed after atomic archive replacement', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'bowser-archive-cache-'));
  try {
    mkdirSync(join(temp, 'server')); mkdirSync(join(temp, 'data'));
    for (const file of ['server/dfs-store.mjs', 'data/dfs-week1-2026.json', 'data/dfs-weekly.json', 'data/dfs_archive.sqlite']) {
      cpSync(new URL(`../${file}`, import.meta.url), join(temp, file));
    }
    const isolated = await import(pathToFileURL(join(temp, 'server/dfs-store.mjs')));
    const key = '2026-w2-dk-153427';
    const first = isolated.getDfsSlate(key);
    assert.equal(isolated.getDfsSlate(key).records[0], first.records[0]);
    const archive = join(temp, 'data/dfs_archive.sqlite');
    cpSync(archive, `${archive}.next`);
    const db = new DatabaseSync(`${archive}.next`);
    try {
      db.prepare("UPDATE dfs_prices SET record_json=json_set(record_json, '$.salary', ?) WHERE capture_id=? AND player_id=?")
        .run(first.records[0].salary + 100, first.meta.captureId, first.records[0].playerId);
    } finally { db.close(); }
    renameSync(`${archive}.next`, archive);
    const updated = isolated.getDfsSlate(key);
    assert.equal(updated.records[0].salary, first.records[0].salary + 100);
    assert.notEqual(updated.records[0], first.records[0]);
    assert.equal(isolated.getDfsWeek(2026, 2, { captureId: updated.meta.captureId }).records[0], updated.records[0]);
    assert.deepEqual(updated.meta.options, first.meta.options);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
