import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryIntelligenceStore } from "../server/intelligence-db.mjs";
import { executeIntelligenceRun } from "../server/intelligence-ingest.mjs";

const sample = {
  eventId: "sample-event", player: { playerId: "p1", name: "Test Player", team: "BUF", position: "WR" },
  headline: "Test Player earns a starting role", summary: "The receiver worked with the first team.", eventType: "ROLE_CHANGE",
  sourceQuality: { confidence: 85, corroboratingSourceCount: 0 }, sources: [{ sourceName: "Official", url: "https://example.com/official", publishedAt: "2026-08-30T12:00:00Z" }],
  firstReportedAt: "2026-08-30T12:00:00Z", lastUpdatedAt: "2026-08-30T12:00:00Z",
};
const scan = async () => ({ events: [structuredClone(sample)], meta: { provider: { id: "fixture", activeSources: ["fixture"] } } });

test("refreshes are idempotent and no-change runs preserve one active snapshot", async () => {
  const store = createMemoryIntelligenceStore();
  const first = await executeIntelligenceRun({ store, scan, idempotencyKey: "one" });
  assert.equal(first.run.status, "promoted");
  const replay = await executeIntelligenceRun({ store, scan, idempotencyKey: "one" });
  assert.equal(replay.replay, true);
  const second = await executeIntelligenceRun({ store, scan, idempotencyKey: "two" });
  assert.equal(second.noChange, true);
  assert.deepEqual(await store.activeEvents(), [sample]);
});

test("a failed refresh leaves the previous active snapshot intact", async () => {
  const store = createMemoryIntelligenceStore();
  await executeIntelligenceRun({ store, scan, idempotencyKey: "good" });
  await assert.rejects(() => executeIntelligenceRun({ store, idempotencyKey: "bad", scan: async () => { throw new Error("fixture failure"); } }), /fixture failure/);
  assert.deepEqual(await store.activeEvents(), [sample]);
});

test("a concurrent replay with the same idempotency key never starts a second provider scan", async () => {
  const store = createMemoryIntelligenceStore();
  let release;
  let scans = 0;
  const blockedScan = async () => {
    scans += 1;
    await new Promise((resolve) => { release = resolve; });
    return scan();
  };
  const first = executeIntelligenceRun({ store, scan: blockedScan, idempotencyKey: "concurrent" });
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  const replay = await executeIntelligenceRun({ store, scan: blockedScan, idempotencyKey: "concurrent" });
  assert.equal(replay.replay, true);
  assert.equal(replay.inProgress, true);
  assert.equal(scans, 1);
  release();
  assert.equal((await first).run.status, "promoted");
});

test("replaying a failed idempotency key returns the original failure instead of unrelated active data", async () => {
  const store = createMemoryIntelligenceStore();
  await executeIntelligenceRun({ store, scan, idempotencyKey: "good-first" });
  await assert.rejects(() => executeIntelligenceRun({ store, idempotencyKey: "failed-key", scan: async () => { throw new Error("upstream failed"); } }), /upstream failed/);
  await assert.rejects(() => executeIntelligenceRun({ store, scan, idempotencyKey: "failed-key" }), (error) => error.code === "prior_run_failed");
});

test("a replacement snapshot cannot silently remove a previously active provider", async () => {
  const store = createMemoryIntelligenceStore();
  await executeIntelligenceRun({ store, scan: async () => ({ events: [structuredClone(sample)], meta: { provider: { activeSources: ["alpha", "beta"] } } }), idempotencyKey: "coverage-one" });
  await assert.rejects(() => executeIntelligenceRun({ store, scan: async () => ({ events: [structuredClone(sample)], meta: { provider: { activeSources: ["alpha"] } } }), idempotencyKey: "coverage-two" }), (error) => error.code === "provider_coverage_regression");
  assert.deepEqual((await store.activeEvents()).map((event) => event.eventId), ["sample-event"]);
});
