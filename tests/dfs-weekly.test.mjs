import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDfsSlate, dfsSlateTiming } from '../server/dfs-store.mjs';

const weekly = JSON.parse(readFileSync(new URL('../data/dfs-weekly.json', import.meta.url)));
const pinnedPath = new URL('../data/dfs-week1-2026.json', import.meta.url);
const pinned = JSON.parse(readFileSync(pinnedPath));

test('current chooses the verified weekly default; every archived and current slate has dated options', () => {
  const current = getDfsSlate();
  const upcoming = Object.entries(weekly.slates).filter(([,s]) => s.season === weekly.season && s.week === weekly.week && s.contestTypeId !== 96 && dfsSlateTiming(s).slateState === 'upcoming').sort(([,a],[,b])=>b.gameCount-a.gameCount || a.id-b.id);
  assert.equal(current.meta.key, upcoming[0]?.[0] || weekly.defaultSlate);
  assert.equal(current.meta.week, weekly.slates[weekly.defaultSlate].week);
  assert.equal(current.meta.season, weekly.slates[weekly.defaultSlate].season);
  assert.equal(current.meta.scoring, 'DraftKings Classic');
  assert.equal(current.meta.options.length, Object.values(weekly.slates).reduce((n,s)=>n+(s.contestTypeId===96?2:1),0) + 3);
  for (const option of current.meta.options) {
    assert.ok(option.label.includes(String(option.season)));
    assert.ok(option.label.includes(`W${option.week}`));
    assert.ok(option.startsAt);
    assert.ok(option.endsAt);
    assert.ok(getDfsSlate(option.key));
  }
  assert.equal(getDfsSlate('not-a-slate'), null);
});

test('lock follows first kickoff and archive window is explicitly a schedule estimate', () => {
  const single = {startsAt:'2026-10-02T00:15:00Z',endsAt:'2026-10-02T00:15:00Z'};
  const timing = iso => dfsSlateTiming(single,Date.parse(iso));
  assert.equal(timing('2026-10-02T00:14:59Z').slateState,'upcoming');
  assert.equal(timing('2026-10-02T00:15:00Z').availability,'locked');
  assert.equal(timing('2026-10-02T03:45:00Z').slateState,'in-progress');
  assert.equal(timing('2026-10-02T04:15:00Z').slateState,'archived');
  assert.match(timing('2026-10-02T04:15:00Z').archiveTimeBasis,/not a verified game completion/);
  const multi = {...single,endsAt:'2026-10-06T00:15:00Z',games:[{startsAt:single.startsAt},{startsAt:'2026-10-06T00:15:00Z'}]};
  assert.equal(dfsSlateTiming(multi,Date.parse('2026-10-02T04:15:00Z')).slateState,'locked');
  assert.equal(dfsSlateTiming(multi,Date.parse('2026-10-06T01:00:00Z')).slateState,'in-progress');
  assert.equal(dfsSlateTiming(multi,Date.parse('2026-10-06T04:15:00Z')).availability,'archived');
});

test('current skips a locked all-week slate while explicit selection keeps its historical rows', t => {
  t.mock.method(Date,'now',()=>Date.parse('2026-10-02T03:45:00Z'));
  const current=getDfsSlate();
  assert.equal(current.meta.id,154080);
  assert.equal(current.meta.slateState,'upcoming');
  assert.equal(current.meta.currentSnapshotAvailable,true);
  for(const key of ['2026-w4-dk-154077','2026-w4-dk-154084']){
    const historical=getDfsSlate(key);
    assert.equal(historical.meta.availability,'locked');
    assert.equal(historical.meta.slateState,'in-progress');
    assert.equal(historical.meta.isLocked,true);
    assert.equal(historical.meta.currentSnapshotAvailable,false);
    assert.ok(historical.records.length>0);
    assert.match(historical.meta.availabilityMessage,/historical review and local drafts/);
    assert.equal(current.meta.options.find(o=>o.key===key).isLocked,true);
  }
});

test('week1 and main are immutable historical aliases', () => {
  for (const key of ['week1', 'main']) {
    const result = getDfsSlate(key);
    assert.equal(result.meta.id, pinned.slates[key].id);
    assert.deepEqual(result.records, pinned.slates[key].records.filter(r => r.playerId));
  }
});

test('Week 2 sample prices/projections and rookies join stable current identities', () => {
  const byName = new Map(getDfsSlate('2026-w2-dk-153427').records.map(r => [r.name, r]));
  assert.equal(byName.get('Jahmyr Gibbs').salary, 8500);
  const captured = weekly.slates['2026-w2-dk-153427'].records.find(r=>r.name==='Jahmyr Gibbs');
  assert.equal(byName.get('Jahmyr Gibbs').projection,captured.projection);
  assert.equal(captured.projectionSource,'Fantasy Info Central');
  assert.ok(Number.isFinite(captured.projection) && captured.projection > 0);
  for (const name of ['Carnell Tate', 'Makai Lemon']) {
    assert.match(byName.get(name).playerId, /^00-/);
    assert.ok(byName.get(name).projection > 0);
  }
  for (const record of byName.values()) {
    if (record.projection === null) assert.ok(record.projectionUnavailableReason);
    else {
      assert.equal(record.projectionWeek, 2);
      assert.equal(record.projectionSeason, 2026);
      assert.equal(record.projectionGameId, record.gameId);
      assert.ok(record.projectionSourceDate || record.projectionCapturedAt);
      if (!record.projectionSourceDate) assert.match(record.projectionSourceDateBasis,/Publication time unavailable/);
    }
  }
});

test('Main excludes Thursday and Monday while preserving the official all-week prices', () => {
  const main = getDfsSlate('2026-w2-dk-153428');
  assert.equal(main.meta.gameCount, 13);
  assert.ok(!main.records.some(r => ['DET', 'BUF', 'NYG', 'LAR'].includes(r.team)));
  assert.ok(getDfsSlate('2026-w2-dk-153427').records.some(r => r.name === 'Puka Nacua' && r.salary === 7900));
});

test('missing and invalid weekly data transparently fall back to dated last-good archive', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'bowser-dfs-fallback-'));
  try {
    mkdirSync(join(temp, 'server')); mkdirSync(join(temp, 'data'));
    cpSync(new URL('../server/dfs-store.mjs', import.meta.url), join(temp, 'server/dfs-store.mjs'));
    cpSync(pinnedPath, join(temp, 'data/dfs-week1-2026.json'));
    const isolated = await import(pathToFileURL(join(temp, 'server/dfs-store.mjs')));
    for (const malformed of [null, '{broken', JSON.stringify({schemaVersion:2,validation:{status:'partial'},slates:{}})]) {
      if (malformed !== null) writeFileSync(join(temp, 'data/dfs-weekly.json'), malformed);
      const result = isolated.getDfsSlate('current');
      assert.equal(result.meta.id, 153054);
      assert.equal(result.meta.availability, 'last-good');
      assert.match(result.meta.availabilityMessage, /2026 Week 1/);
      assert.ok(result.records.length > 350);
    }
  } finally { rmSync(temp, {recursive:true, force:true}); }
});


test('Thursday full-game Showdown selection isolates official FLEX and CPT values', () => {
  const flex=getDfsSlate('2026-w2-dk-153434');
  const captain=getDfsSlate('2026-w2-dk-153434:cpt');
  assert.equal(flex.meta.scoring,'DraftKings Showdown Captain Mode');
  assert.equal(flex.meta.rosterPosition,'FLEX');assert.equal(captain.meta.rosterPosition,'CPT');
  assert.match(flex.meta.label,/Thursday Only.*DET @ BUF.*09-17.*FLEX/);
  assert.equal(flex.meta.gameCount,1);
  assert.equal(flex.meta.coverage.salaryPlayers,47);
  assert.equal(flex.meta.coverage.salaryEntries,94);
  assert.equal(new Set(flex.records.map(r=>r.playerId)).size,flex.records.length);
  assert.equal(new Set(captain.records.map(r=>r.playerId)).size,captain.records.length);
  assert.deepEqual(new Set(flex.records.map(r=>r.playerId)),new Set(captain.records.map(r=>r.playerId)));
  for(const row of flex.records){
    const cpt=captain.records.find(r=>r.playerId===row.playerId);
    assert.equal(row.rosterPosition,'FLEX');assert.equal(cpt.rosterPosition,'CPT');
    assert.equal(cpt.salary,row.salary*1.5);
    assert.notEqual(cpt.draftKingsId,row.draftKingsId);
    if(row.projection!==null){
      assert.equal(cpt.projection,Number((row.projection*1.5).toFixed(4)));
      assert.equal(cpt.projectionBase,row.projectionBase);
      assert.equal(cpt.projectionMultiplier,1.5);
      assert.match(cpt.projectionBasis,/1.5 Captain/);
    }else assert.equal(cpt.projection,null);
  }
  const gibbs=flex.records.find(r=>r.name==='Jahmyr Gibbs');
  assert.equal(gibbs.salary,12000);
  assert.equal(captain.records.find(r=>r.playerId===gibbs.playerId).salary,18000);
  assert.equal(getDfsSlate('2026-w2-dk-153427:cpt'),null);
  assert.equal(getDfsSlate('current').meta.scoring,'DraftKings Classic');
});


test('weekly snapshot reuse detects atomic refreshes and preserves invalid-file fallback', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'bowser-dfs-cache-'));
  try {
    mkdirSync(join(temp, 'server')); mkdirSync(join(temp, 'data'));
    cpSync(new URL('../server/dfs-store.mjs', import.meta.url), join(temp, 'server/dfs-store.mjs'));
    cpSync(pinnedPath, join(temp, 'data/dfs-week1-2026.json'));
    const key = weekly.defaultSlate;
    const slate = structuredClone(weekly.slates[key]);
    slate.records = slate.records.filter(row => row.playerId).slice(0, 1);
    const snapshot = { schemaVersion: 2, validation: { status: 'verified' }, defaultSlate: key, slates: { [key]: slate } };
    const path = join(temp, 'data/dfs-weekly.json');
    writeFileSync(path, JSON.stringify(snapshot));
    const isolated = await import(pathToFileURL(join(temp, 'server/dfs-store.mjs')));
    const first = isolated.getDfsSlate().records[0];
    assert.equal(isolated.getDfsSlate().records[0], first, 'unchanged snapshots reuse parsed records');
    assert.equal(isolated.getDfsWeek(slate.season, slate.week).records[0], first);
    slate.records[0].salary += 100;
    writeFileSync(`${path}.next`, JSON.stringify(snapshot));
    renameSync(`${path}.next`, path);
    const updated = isolated.getDfsSlate().records[0];
    assert.notEqual(updated, first);
    assert.equal(updated.salary, first.salary + 100);
    assert.equal(isolated.getDfsWeek(slate.season, slate.week).records[0].salary, updated.salary);
    for (const invalid of ['{broken', JSON.stringify({ ...snapshot, validation: { status: 'partial' } })]) {
      writeFileSync(path, invalid);
      assert.equal(isolated.getDfsSlate().meta.id, pinned.slates[pinned.defaultSlate].id);
      assert.equal(isolated.getDfsWeek(slate.season, slate.week).meta.available, false);
    }
    rmSync(path);
    assert.equal(isolated.getDfsSlate().meta.id, pinned.slates[pinned.defaultSlate].id);
    writeFileSync(path, JSON.stringify(snapshot));
    assert.equal(isolated.getDfsSlate().records[0].salary, updated.salary);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('partial projection captures expose source limitations through Classic and Showdown lineup metadata', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'bowser-dfs-partial-'));
  try {
    mkdirSync(join(temp, 'server')); mkdirSync(join(temp, 'data'));
    cpSync(new URL('../server/dfs-store.mjs', import.meta.url), join(temp, 'server/dfs-store.mjs'));
    cpSync(pinnedPath, join(temp, 'data/dfs-week1-2026.json'));
    const classicKey = '2026-w2-dk-153427', showdownKey = '2026-w2-dk-153434';
    const slates = Object.fromEntries([classicKey,showdownKey].map(key => {
      const slate = structuredClone(weekly.slates[key]);
      slate.projectionProvider = null;
      slate.projectionSourceDate = null;
      slate.primaryProjectionStatus = {status:'unavailable',source:'Fantasy Info Central',reason:'Projection source is over 72 hours old'};
      slate.projectionStatus = {refreshMode:'allow-partial-projections',status:'unavailable',projectedPlayers:0,missingPlayers:slate.records.length,publicationTime:null};
      slate.projectionBasis = 'Primary projections rejected; supplemental publication time unknown.';
      slate.records.forEach(row => { row.projection = null; row.projectionUnavailableReason = 'Primary source unavailable; no exact supplemental match'; });
      return [key,slate];
    }));
    writeFileSync(join(temp, 'data/dfs-weekly.json'), JSON.stringify({schemaVersion:2,validation:{status:'verified'},defaultSlate:classicKey,slates}));
    const isolated = await import(pathToFileURL(join(temp, 'server/dfs-store.mjs')));
    for (const key of [classicKey,showdownKey,`${showdownKey}:cpt`]) {
      const result = isolated.getDfsSlate(key);
      assert.match(result.meta.availabilityMessage,/Official DraftKings salaries verified/);
      assert.match(result.meta.availabilityMessage,/over 72 hours old/);
      assert.match(result.meta.availabilityMessage,/publication time is unknown; capture times are observations/);
      assert.equal(result.meta.projectionSourceDate,null);
      assert.ok(result.records.every(row => row.projection === null));
      if (key.includes('153434')) assert.match(result.meta.projectionBasis,/supplemental publication time unknown/);
    }
    const lineup = isolated.getDfsLineupSlate(showdownKey);
    assert.match(lineup.meta.projectionBasis,/supplemental publication time unknown/);
    assert.match(lineup.meta.availabilityMessage,/supplemental projection entries/);
    assert.equal(lineup.records.length,slates[showdownKey].records.length);
    assert.deepEqual(new Set(lineup.records.map(row=>row.rosterPosition)),new Set(['FLEX','CPT']));
  } finally { rmSync(temp,{recursive:true,force:true}); }
});
