// Independent, offline release gate for the public commentary capture and build.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const body = readFileSync(new URL('data/market-commentary.json', root), 'utf8');
const data = JSON.parse(body);
assert.equal(data.schemaVersion, 1);
assert.ok(data.records.length > 0);
assert.ok(Number.isFinite(Date.parse(data.capturedAt)));
assert.ok(data.costUSD >= 0 && data.costUSD <= 0.05);
assert.ok(data.calls >= 1 && data.calls <= 60);
assert.equal(new Set(data.records.map(r => r.id)).size, data.records.length);
for (const row of data.records) {
  assert.match(row.espnId, /^espn:\d+$/);
  assert.match(row.inputHash, /^[a-f0-9]{64}$/);
  assert.equal(row.text, undefined);
  assert.equal(row.source, 'ESPN');
  assert.ok(row.headline.split(/\s+/).length <= 25);
  const url = new URL(row.url);
  assert.equal(url.protocol, 'https:');
  assert.ok(['www.espn.com', 'espn.com'].includes(url.hostname));
  assert.ok(Date.parse(row.publishedAt) <= Date.parse(row.analyzedAt));
  assert.match(row.model, /^typesafe\/jev-1\.13(?:-\d+)?$/);
  assert.ok(row.answers.relevance.noul >= 0 && row.answers.relevance.noul <= 1);
  for (const name of ['topic', 'sentiment']) {
    const a = row.answers[name];
    assert.ok(a.confidence >= 0 && a.confidence <= 1);
    assert.ok(Object.hasOwn(a.probabilities, a.choice));
    assert.ok(Object.values(a.probabilities).every(p => typeof p === 'number' && p >= 0 && p <= 1));
    assert.ok(Math.abs(Object.values(a.probabilities).reduce((x,y) => x+y,0)-1) < 0.02);
  }
}
const archive = new URL(`data/market-commentary-archive/${data.capturedAt.replace(/[:.]/g, '-')}.json`, root);
assert.equal(readFileSync(archive,'utf8'), body);
const assets = new URL('dist/client/assets/', root);
assert.ok(existsSync(assets), 'Build before running the release gate.');
const bundles = readdirSync(assets).filter(p => p.endsWith('.js')).map(p => readFileSync(new URL(p, assets),'utf8'));
assert.ok(bundles.some(text => text.includes(data.capturedAt)), 'Built UI must contain this exact capture.');
assert.ok(bundles.some(text => text.includes('News evidence for')), 'Built UI must contain the evidence affordance.');
if (process.env.OPENROUTER_API_KEY) assert.ok(![body, ...bundles].some(text => text.includes(process.env.OPENROUTER_API_KEY)), 'Credential found in a public artifact.');
console.log(JSON.stringify({status:'PASS',records:data.records.length,articles:new Set(data.records.map(r=>r.articleId)).size,players:new Set(data.records.map(r=>r.espnId)).size,capturedAt:data.capturedAt,snapshotSha256:createHash('sha256').update(body).digest('hex'),archiveIdentical:true,builtCaptureVerified:true},null,2));
