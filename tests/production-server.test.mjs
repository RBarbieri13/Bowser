import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import app from "../server.mjs";
import { closeDatabase } from "../server/stats-store.mjs";

let server;
let origin;

before(async () => {
  process.env.VERCEL = "1";
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      origin = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  closeDatabase();
  delete process.env.VERCEL;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("production server serves the standalone application", async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Bowser Fantasy Football/);
});

test("production API serves the packaged SQLite warehouse", async () => {
  const metaResponse = await fetch(`${origin}/api/v1/meta`);
  assert.equal(metaResponse.status, 200);
  const meta = await metaResponse.json();
  assert.equal(meta.warehouse.players, 609);

  const statsResponse = await fetch(`${origin}/api/v1/player-stats?seasonType=ALL&limit=all`);
  assert.equal(statsResponse.status, 200);
  const stats = await statsResponse.json();
  assert.equal(stats.data.length, 609);
  assert.ok(stats.meta.queryMs < 250);
});

test("unknown API routes do not fall back to the app shell", async () => {
  const response = await fetch(`${origin}/api/v1/missing`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "not_found");
});
