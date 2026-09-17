import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDfsSlate } from '../server/dfs-store.mjs';

const weekly = JSON.parse(readFileSync(new URL('../data/dfs-weekly.json', import.meta.url)));
const pinnedPath = new URL('../data/dfs-week1-2026.json', import.meta.url);
const pinned = JSON.parse(readFileSync(pinnedPath));

test('current chooses the verified weekly default; every archived and current slate has dated options', () => {
  const current = getDfsSlate();
  assert.equal(current.meta.key, weekly.defaultSlate);
  assert.equal(current.meta.week, weekly.slates[weekly.defaultSlate].week);
  assert.equal(current.meta.season, weekly.slates[weekly.defaultSlate].season);
  assert.equal(current.meta.scoring, 'DraftKings Classic');
  assert.equal(current.meta.options.length, Object.keys(weekly.slates).length + 3);
  for (const option of current.meta.options) {
    assert.ok(option.label.includes(String(option.season)));
    assert.ok(option.label.includes(`W${option.week}`));
    assert.ok(option.startsAt);
    assert.ok(option.endsAt);
    assert.ok(getDfsSlate(option.key));
  }
  assert.equal(getDfsSlate('not-a-slate'), null);
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
  assert.equal(byName.get('Jahmyr Gibbs').projection, 23.1);
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
