import { readFile, writeFile, mkdir, rename, open, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { classifyCommentary, newsCandidates, NEWS_URL } from '../server/market-commentary.mjs';
import { fetchJson } from '../server/market-pulse.mjs';

const root = new URL('../', import.meta.url);
const snapshot = new URL('data/market-commentary.json', root);
const lock = new URL('artifacts/market-commentary.lock', root);
await mkdir(new URL('artifacts/', root), { recursive: true });
let handle;
try {
  handle = await open(lock, 'wx');
  let previous = {};
  try { previous = JSON.parse(await readFile(snapshot, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const now = Date.now();
  const candidates = newsCandidates(await fetchJson(NEWS_URL), now);
  if (!candidates.length) throw new Error('No safely matched player excerpts. Last-good commentary retained.');
  const result = await classifyCommentary(candidates, previous, { now });
  if (result.changed) {
    const content = `${JSON.stringify(result, null, 2)}\n`;
    const archive = new URL('data/market-commentary-archive/', root);
    await mkdir(archive, { recursive: true });
    await writeFile(new URL(`${result.capturedAt.replace(/[:.]/g, '-')}.json`, archive), content, { flag: 'wx' });
    const temp = `${fileURLToPath(snapshot)}.tmp`;
    await writeFile(temp, content);
    await rename(temp, snapshot);
  }
  console.log(JSON.stringify({ changed: result.changed, capturedAt: result.changed ? result.capturedAt : previous.capturedAt, candidates: candidates.length, records: result.records.length, calls: result.calls, costUSD: result.costUSD }));
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'Another commentary refresh is running; last-good data retained.' : error.message);
  process.exitCode = 1;
} finally {
  if (handle) { await handle.close(); await unlink(lock); }
}
