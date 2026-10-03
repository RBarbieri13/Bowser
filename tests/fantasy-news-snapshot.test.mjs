import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { fantasyNewsMaterialHash, prepareFantasyNewsSnapshot } from "../scripts/prepare-fantasy-news-snapshot.mjs";
import { repositorySnapshotHash, validateRepositorySnapshot } from "../server/fantasy-news-repository.mjs";

const NOW = Date.parse("2026-10-01T20:00:00Z");
const OPTIONS = { now: NOW, checkedAt: "2026-10-01T19:00:00Z", updatedAt: "2026-10-01T19:01:00Z", revision: "test-1" };
function event(overrides = {}) {
  return {
    eventId: "public-report", player: { playerId: null, name: "Test Runner", team: "BUF", position: "RB" },
    headline: "Test Runner listed as limited", summary: "The official report lists limited participation.", fantasyAnalysis: null,
    eventType: "PRACTICE", status: "CONFIRMED", fantasyImpact: "MEDIUM", firstReportedAt: null, lastUpdatedAt: null, checkedAt: "2026-10-01T19:00:00Z",
    sourceQuality: { confidence: null }, injury: { isInjuryRelated: true, practiceStatus: "LIMITED" },
    sources: [{ sourceName: "NFL", sourceType: "OFFICIAL", url: "https://www.nfl.com/news/practice-report", publishedAt: null, publishedAtRaw: null, publishedDate: "2026-09-30", isOriginalSource: true }], ...overrides,
  };
}

test("local preparation produces a validated envelope with truthful unavailable source clocks", () => {
  const input = event();
  const result = prepareFantasyNewsSnapshot([input], OPTIONS);
  assert.equal(result.changed, true);
  assert.equal(result.snapshot.contentHash, repositorySnapshotHash(result.snapshot));
  validateRepositorySnapshot(result.snapshot, { now: NOW });
  assert.equal(result.snapshot.events[0].sources[0].publishedAt, null);
  assert.equal(result.snapshot.events[0].sources[0].publishedAtRaw, "2026-09-30 (publication clock and timezone unavailable)");
  assert.equal(input.sources[0].publishedAtRaw, null);
  assert.equal(result.snapshot.checkedAt, OPTIONS.checkedAt);
  assert.equal(result.snapshot.updatedAt, OPTIONS.updatedAt);
});

test("publication dates never come from verification or writer time", () => {
  for (const publishedDate of [null, "", "2026-02-31"]) {
    const input = event(); input.sources[0].publishedDate = publishedDate;
    assert.throws(() => prepareFantasyNewsSnapshot([input], OPTIONS), (error) => error.code === "source_publication_date_required");
  }
});

test("explicitly undated checked official sources survive preparation with null publication fields", () => {
  const input = event();
  input.sources[0] = { ...input.sources[0], publishedAt: null, publishedDate: null, publishedAtRaw: "Publication and update clock not displayed", checkedAt: "2026-10-01T18:59:00Z" };
  const result = prepareFantasyNewsSnapshot([input], OPTIONS);
  assert.equal(result.changed, true);
  assert.deepEqual(result.snapshot.events[0].sources[0], input.sources[0]);
  assert.equal(result.snapshot.events[0].sources[0].publishedAt, null);
  assert.equal(result.snapshot.events[0].sources[0].publishedDate, null);
  const rechecked = structuredClone(result.snapshot.events);
  rechecked[0].checkedAt = "2026-10-01T19:20:00Z";
  rechecked[0].sources[0].checkedAt = "2026-10-01T19:19:00Z";
  const unchanged = prepareFantasyNewsSnapshot(rechecked, { ...OPTIONS, previous: result.snapshot, checkedAt: "2026-10-01T19:20:00Z", updatedAt: "2026-10-01T19:21:00Z", revision: "test-2" });
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.snapshot, result.snapshot);
  for (const values of [{ checkedAt: null }, { checkedAt: "future-or-malformed" }, { publishedDate: "2026-02-31" }, { publishedDate: "2026-10-02" }]) {
    const invalid = structuredClone(input); Object.assign(invalid.sources[0], values);
    assert.throws(() => prepareFantasyNewsSnapshot([invalid], OPTIONS), (error) => error.code === "repository_invalid_records");
  }
});

test("stable event IDs are preserved and duplicate/missing/ambiguous IDs stop preparation", () => {
  const events = [event({ eventId: "z-public" }), event({ eventId: "a-public" })];
  assert.deepEqual(prepareFantasyNewsSnapshot(events, OPTIONS).snapshot.events.map((item) => item.eventId), ["a-public", "z-public"]);
  for (const input of [[event(), event()], [event({ eventId: null })], [event({ eventId: " public " })]]) assert.throws(() => prepareFantasyNewsSnapshot(input, OPTIONS), (error) => ["duplicate_event_id", "stable_event_id_required"].includes(error.code));
});

test("clock-only changes and event ordering do not create material content commits", () => {
  const previous = prepareFantasyNewsSnapshot([event({ eventId: "b" }), event({ eventId: "a" })], OPTIONS).snapshot;
  const next = structuredClone(previous.events).reverse();
  for (const record of next) { record.checkedAt = "2026-10-01T19:20:00Z"; record.sources[0].checkedAt = "2026-10-01T19:20:00Z"; }
  const result = prepareFantasyNewsSnapshot(next, { ...OPTIONS, previous, checkedAt: "2026-10-01T19:20:00Z", updatedAt: "2026-10-01T19:21:00Z", revision: "test-2" });
  assert.equal(result.changed, false);
  assert.equal(result.reason, "unchanged_public_content");
  assert.equal(result.snapshot, previous);
  assert.equal(result.snapshot.checkedAt, OPTIONS.checkedAt);
  assert.equal(result.materialHash, fantasyNewsMaterialHash(previous));
});

test("report content, citations, publication and event-edit times remain material", () => {
  const previous = prepareFantasyNewsSnapshot([event()], OPTIONS).snapshot;
  const mutations = [
    (record) => { record.summary = "The official report now lists full participation."; },
    (record) => { record.sources[0].url = "https://www.nfl.com/news/updated-report"; },
    (record) => { record.sources[0].publishedAtRaw = "September 30, 2026, 4 PM (timezone unspecified)"; },
    (record) => { record.lastUpdatedAt = "2026-10-01T19:05:00Z"; },
    (record) => { record.injury.practiceStatus = "FULL"; },
    (record) => { record.urgency = { score: 3, basis: "Keep a healthy alternative until the final report.", method: "AI estimate from public reporting", estimatedAt: "2026-10-01T19:10:00Z" }; },
    (record) => { record.affectedPlayers = [{ name: "Other Runner", team: "BUF", position: "RB", relationship: "potential_beneficiary", impact: "Could gain work if the starter misses the game." }]; },
  ];
  for (const mutate of mutations) {
    const record = structuredClone(previous.events[0]); mutate(record);
    const result = prepareFantasyNewsSnapshot([record], { ...OPTIONS, previous, checkedAt: "2026-10-01T19:20:00Z", updatedAt: "2026-10-01T19:21:00Z", revision: "test-2" });
    assert.equal(result.changed, true);
    assert.notEqual(result.materialHash, fantasyNewsMaterialHash(previous));
  }
});

test("previous/current validation runs before no-change decisions and rejects private data or bad hashes", () => {
  const previous = prepareFantasyNewsSnapshot([event()], OPTIONS).snapshot;
  const invalidPrevious = { ...previous, contentHash: "0".repeat(64) };
  assert.throws(() => prepareFantasyNewsSnapshot(previous.events, { ...OPTIONS, previous: invalidPrevious }), (error) => error.code === "repository_checksum_mismatch");
  assert.throws(() => prepareFantasyNewsSnapshot(previous.events, { ...OPTIONS, previous, checkedAt: "not a timestamp" }), (error) => error.code === "repository_invalid_schema");
  assert.throws(() => prepareFantasyNewsSnapshot([event({ yahooContext: { roster: "private" } })], OPTIONS), (error) => error.code === "repository_non_public");
  assert.throws(() => prepareFantasyNewsSnapshot([event({ lastUpdatedAt: "bad-date" })], OPTIONS), (error) => error.code === "repository_invalid_records");
  assert.throws(() => prepareFantasyNewsSnapshot([event()], { ...OPTIONS, previous: false }), (error) => error.code === "repository_invalid_schema");
});

test("changed content requires a new monotonic writer revision and non-regressing source check", () => {
  const previous = prepareFantasyNewsSnapshot([event()], OPTIONS).snapshot;
  const changed = event({ summary: "A different public report." });
  for (const overrides of [{ revision: "test-1", updatedAt: "2026-10-01T19:21:00Z" }, { revision: "test-2", updatedAt: "2026-10-01T19:01:00Z" }]) {
    assert.throws(() => prepareFantasyNewsSnapshot([changed], { ...OPTIONS, previous, ...overrides }), (error) => error.code === "repository_revision_regression");
  }
});

test("CLI writes only a changed validated local payload and leaves existing output untouched on no-change", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "fantasy-news-preparation-"));
  try {
    const current = Date.now();
    const record = event({ checkedAt: new Date(current - 120_000).toISOString() });
    const checkedAt = new Date(current - 60_000).toISOString();
    const updatedAt = new Date(current - 30_000).toISOString();
    const input = path.join(directory, "events.json");
    const output = path.join(directory, "snapshot.json");
    writeFileSync(input, JSON.stringify([record]));
    const script = new URL("../scripts/prepare-fantasy-news-snapshot.mjs", import.meta.url);
    const args = [fileURLToPath(script), "--events", input, "--checked-at", checkedAt, "--updated-at", updatedAt, "--revision", "cli-1", "--out", output];
    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).changed, true);
    const bytes = readFileSync(output, "utf8");
    validateRepositorySnapshot(JSON.parse(bytes));
    const unchanged = spawnSync(process.execPath, [...args, "--previous", output], { encoding: "utf8" });
    assert.equal(unchanged.status, 0, unchanged.stderr);
    assert.equal(JSON.parse(unchanged.stdout).changed, false);
    assert.equal(readFileSync(output, "utf8"), bytes);
    record.sources[0] = { ...record.sources[0], publishedAt: null, publishedDate: null, publishedAtRaw: "Publication and update clock not displayed", checkedAt: record.checkedAt };
    writeFileSync(input, JSON.stringify([record]));
    const undated = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(undated.status, 0, undated.stderr);
    const undatedBytes = readFileSync(output, "utf8");
    const undatedSnapshot = JSON.parse(undatedBytes);
    validateRepositorySnapshot(undatedSnapshot);
    assert.equal(undatedSnapshot.events[0].sources[0].publishedAt, null);
    assert.equal(undatedSnapshot.events[0].sources[0].publishedDate, null);
    writeFileSync(input, JSON.stringify([event({ yahooContext: { roster: "private-secret" } })]));
    const rejected = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(rejected.status, 1);
    assert.equal(rejected.stderr.includes("private-secret"), false);
    assert.equal(readFileSync(output, "utf8"), undatedBytes);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("Vercel suppresses only the public data branch while leaving app/default branch deployments enabled", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.git.deploymentEnabled, { "fantasy-news-data": false });
  const enabled = (branch) => config.git.deploymentEnabled[branch] ?? config.git.deploymentEnabled["*"] ?? true;
  assert.equal(enabled("fantasy-news-data"), false);
  for (const branch of ["main", "feature/fantasy-news-workspace", "feature/unrelated", "any-new-branch"]) assert.equal(enabled(branch), true);
});
