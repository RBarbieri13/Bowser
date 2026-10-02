import assert from "node:assert/strict";
import test from "node:test";

import { createRepositoryFantasyNewsReader, FANTASY_NEWS_REPOSITORY_URL, repositorySnapshotHash, validateRepositorySnapshot } from "../server/fantasy-news-repository.mjs";

const NOW = Date.parse("2026-10-01T20:00:00Z");
function snapshot(overrides = {}) {
  const result = {
    version: 1, scope: "public_nfl_news", mode: "repository_public_snapshot", checkedAt: "2026-10-01T19:00:00Z", updatedAt: "2026-10-01T19:01:00Z", revision: "test-1",
    events: [{
      eventId: "public-report", player: { playerId: null, name: "Test Runner", team: "BUF", position: "RB" },
      headline: "Test Runner listed as limited", summary: "The official report lists limited practice participation.", fantasyAnalysis: null,
      eventType: "PRACTICE", status: "CONFIRMED", fantasyImpact: "MEDIUM", firstReportedAt: null, lastUpdatedAt: null, checkedAt: "2026-10-01T19:00:00Z",
      sourceQuality: { confidence: null }, injury: { isInjuryRelated: true, practiceStatus: "LIMITED" },
      sources: [{ sourceName: "NFL", sourceType: "OFFICIAL", url: "https://www.nfl.com/news/practice-report", publishedAt: null, publishedAtRaw: "September 30, 2026, 3 PM, timezone unspecified", publishedDate: "2026-09-30", isOriginalSource: true }],
    }], ...overrides,
  };
  result.contentHash = repositorySnapshotHash(result);
  return result;
}
function response(payload, init = {}) { return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status: 200, headers: { "content-type": "text/plain", etag: '"proof"' }, ...init }); }

test("canonical SHA256 is independent of object property order and excludes its own contentHash", () => {
  const payload = snapshot();
  const reversed = Object.fromEntries(Object.entries(payload).reverse());
  assert.equal(repositorySnapshotHash(reversed), payload.contentHash);
  assert.equal(repositorySnapshotHash({ ...payload, contentHash: "ignored" }), payload.contentHash);
  assert.equal(validateRepositorySnapshot(payload, { now: NOW }), payload);
});

test("repository fetch is fixed, conditional, bounded and retains source check versus writer times", async () => {
  let time = NOW;
  let calls = 0;
  const reader = createRepositoryFantasyNewsReader({ now: () => time, fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url, FANTASY_NEWS_REPOSITORY_URL);
    assert.equal(options.redirect, "error");
    assert.equal(options.method, "GET");
    assert.equal(options.signal instanceof AbortSignal, true);
    if (calls === 2) { assert.equal(options.headers["If-None-Match"], '"proof"'); return new Response(null, { status: 304 }); }
    return response(snapshot());
  } });
  const first = await reader();
  assert.equal(first.verified, true);
  assert.equal(first.feed.meta.repository.checkedAt, "2026-10-01T19:00:00Z");
  assert.equal(first.feed.meta.repository.updatedAt, "2026-10-01T19:01:00Z");
  assert.equal(first.feed.meta.repository.fetchedAt, "2026-10-01T20:00:00.000Z");
  first.feed.events[0].summary = "caller mutation";
  assert.equal((await reader()).feed.events[0].summary.includes("caller mutation"), false);
  assert.equal(calls, 1);
  time += 60_001;
  const conditional = await reader();
  assert.equal(conditional.feed.meta.repository.cacheState, "not_modified");
  assert.equal(conditional.feed.meta.repository.checkedAt, "2026-10-01T19:00:00Z");
  assert.equal(calls, 2);
});

test("cold-start missing repository never claims verification and is cached for sixty seconds", async () => {
  let calls = 0;
  const reader = createRepositoryFantasyNewsReader({ now: NOW, fetchImpl: async () => { calls += 1; return response("not found", { status: 404 }); } });
  const result = await reader();
  assert.equal(result.verified, false);
  assert.equal(result.feed, null);
  assert.equal(result.error.code, "repository_not_found");
  await reader();
  assert.equal(calls, 1);
});

test("checksum mismatches, malformed JSON and changed source URLs retain only the last verified snapshot", async () => {
  for (const badResponse of [response({ ...snapshot(), contentHash: "0".repeat(64) }), response("{broken"), { ok: true, status: 200, redirected: true, url: "https://private.example.com", text: async () => JSON.stringify(snapshot()) }]) {
    let time = NOW;
    let calls = 0;
    const reader = createRepositoryFantasyNewsReader({ now: () => time, fetchImpl: async () => ++calls === 1 ? response(snapshot()) : badResponse });
    const good = await reader();
    time += 60_001;
    const retained = await reader();
    assert.equal(retained.verified, true);
    assert.equal(retained.feed.meta.repository.lastReadState, "unavailable");
    assert.equal(retained.feed.meta.repository.cacheState, "retained_last_good");
    assert.equal(retained.feed.meta.repository.contentHash, good.feed.meta.repository.contentHash);
    assert.equal(retained.feed.events[0].eventId, "public-report");
  }
});

test("private and unknown fields, Yahoo links, missing checks and unsupported positions are rejected", () => {
  const candidates = [
    snapshot({ privateData: { roster: "private" } }),
    snapshot({ events: [{ ...snapshot().events[0], yahooContext: { leagueKey: "private" } }] }),
    snapshot({ events: [{ ...snapshot().events[0], player: { ...snapshot().events[0].player, ownership: "private" } }] }),
    snapshot({ events: [{ ...snapshot().events[0], sources: [{ ...snapshot().events[0].sources[0], url: "https://fantasysports.yahooapis.com/fantasy/v2/league/private" }] }] }),
    snapshot({ events: [{ ...snapshot().events[0], checkedAt: null }] }),
    snapshot({ events: [{ ...snapshot().events[0], sources: [{ ...snapshot().events[0].sources[0], publishedDate: "2026-10-02" }] }] }),
    snapshot({ events: [{ ...snapshot().events[0], player: { name: "Test Kicker", position: "K" } }] }),
  ];
  for (const payload of candidates) assert.throws(() => validateRepositorySnapshot(payload, { now: NOW }), (error) => error.code.startsWith("repository_"));
});

test("future and reversed envelope clocks never claim a verified repository check", () => {
  for (const payload of [snapshot({ checkedAt: "2026-10-02T20:00:00Z", updatedAt: "2026-10-02T20:01:00Z" }), snapshot({ updatedAt: "2026-10-01T18:00:00Z" }), snapshot({ checkedAt: "2026-10-01T19:00:00" }), snapshot({ checkedAt: "2026-02-31T19:00:00Z" })]) {
    assert.throws(() => validateRepositorySnapshot(payload, { now: NOW }), (error) => error.code === "repository_invalid_schema");
  }
});

test("nonnull malformed event clocks and record checks after the envelope are rejected", () => {
  for (const eventOverride of [{ lastUpdatedAt: "definitely-not-a-date" }, { firstReportedAt: "2027-01-01T00:00:00Z" }, { checkedAt: "2026-10-01T19:30:00Z" }]) {
    const payload = snapshot({ events: [{ ...snapshot().events[0], ...eventOverride }] });
    assert.throws(() => validateRepositorySnapshot(payload, { now: NOW }), (error) => error.code === "repository_invalid_records");
  }
});

test("repository validation accepts explicitly checked undated official citations without inventing publication dates", () => {
  const report = snapshot().events[0];
  report.sources = [{ ...report.sources[0], publishedAt: null, publishedDate: null, publishedAtRaw: "Publication and update clock not displayed", checkedAt: "2026-10-01T18:59:00Z" }];
  const payload = snapshot({ events: [report] });
  assert.equal(validateRepositorySnapshot(payload, { now: NOW }), payload);
  assert.equal(payload.events[0].sources[0].publishedAt, null);
  assert.equal(payload.events[0].sources[0].publishedDate, null);
  for (const values of [{ checkedAt: null }, { checkedAt: "invalid" }, { checkedAt: "2026-10-02T00:00:00Z" }, { checkedAt: "2026-10-01T19:00:01Z" }, { publishedDate: "2026-02-31" }, { publishedDate: "2026-10-02" }, { publishedAt: "2026-02-31T00:00:00Z" }, { publishedAtRaw: null }]) {
    const invalid = structuredClone(report); Object.assign(invalid.sources[0], values);
    assert.throws(() => validateRepositorySnapshot(snapshot({ events: [invalid] }), { now: NOW }), (error) => error.code === "repository_invalid_records");
  }
  const privateCitation = structuredClone(report); privateCitation.sources[0].yahooContext = { roster: "private" };
  assert.throws(() => validateRepositorySnapshot(snapshot({ events: [privateCitation] }), { now: NOW }), (error) => error.code === "repository_non_public");
});

test("urgency is a bounded public AI estimate whose time cannot follow the envelope writer", () => {
  const report = snapshot().events[0];
  report.urgency = { score: 4, basis: "Repeated absences warrant a backup plan before the final report.", method: "AI estimate from public reporting", estimatedAt: "2026-10-01T19:00:30Z" };
  report.affectedPlayers = [{ name: "Other Runner", playerId: "public-id", team: "BUF", position: "RB", relationship: "potential_beneficiary", impact: "Could receive more touches if the reported absence continues." }];
  assert.doesNotThrow(() => validateRepositorySnapshot(snapshot({ events: [report] }), { now: NOW }));
  for (const values of [{ score: 0 }, { score: 6 }, { score: 3.5 }, { basis: "" }, { basis: "x".repeat(601) }, { basis: "<b>urgent</b>" }, { method: "AI guess" }, { estimatedAt: "invalid" }, { estimatedAt: "2026-10-02T00:00:00Z" }, { estimatedAt: "2026-10-01T19:01:01Z" }]) {
    const invalid = structuredClone(report); Object.assign(invalid.urgency, values);
    assert.throws(() => validateRepositorySnapshot(snapshot({ events: [invalid] }), { now: NOW }), (error) => error.code === "repository_invalid_records");
  }
  for (const values of [{ team: "BUF/private" }, { team: null }, { position: "K" }, { position: null }, { playerId: "" }, { relationship: "" }, { impact: "x".repeat(601) }]) {
    const invalid = structuredClone(report); Object.assign(invalid.affectedPlayers[0], values);
    assert.throws(() => validateRepositorySnapshot(snapshot({ events: [invalid] }), { now: NOW }), (error) => error.code === "repository_invalid_records");
  }
  for (const field of ["urgency", "affectedPlayers"]) {
    const invalid = structuredClone(report);
    if (field === "urgency") invalid.urgency.leagueKey = "private-secret";
    else invalid.affectedPlayers[0].ownership = "private-secret";
    assert.throws(() => validateRepositorySnapshot(snapshot({ events: [invalid] }), { now: NOW }), (error) => error.code === "repository_non_public");
  }
});

test("oversized citation sets are rejected before any trailing citation can be silently discarded", () => {
  const input = snapshot().events[0];
  input.sources = Array.from({ length: 21 }, () => ({ ...input.sources[0] }));
  input.sources[20].url = "https://example.com/news#access_token=private-secret";
  assert.throws(() => validateRepositorySnapshot(snapshot({ events: [input] }), { now: NOW }), (error) => error.code === "repository_non_public");
});

test("older or conflicting revisions cannot replace the accepted snapshot", async () => {
  let time = NOW;
  let calls = 0;
  const older = snapshot({ revision: "older", checkedAt: "2026-10-01T18:00:00Z", updatedAt: "2026-10-01T18:01:00Z", events: [{ ...snapshot().events[0], checkedAt: "2026-10-01T18:00:00Z" }] });
  const reader = createRepositoryFantasyNewsReader({ now: () => time, fetchImpl: async () => response(++calls === 1 ? snapshot() : older) });
  await reader();
  time += 60_001;
  const retained = await reader();
  assert.equal(retained.error.code, "repository_revision_regression");
  assert.equal(retained.feed.meta.repository.revision, "test-1");
});

test("size cap rejects both declared and streamed oversized bodies before publication", async () => {
  for (const tooLarge of [response("{}", { headers: { "content-length": String(512 * 1024 + 1) } }), response(" ".repeat(512 * 1024 + 1))]) {
    const reader = createRepositoryFantasyNewsReader({ now: NOW, fetchImpl: async () => tooLarge });
    const result = await reader();
    assert.equal(result.verified, false);
    assert.equal(result.error.code, "repository_too_large");
  }
});

test("concurrent cold reads use one fetch, while errors never expose upstream error bodies", async () => {
  let release;
  let calls = 0;
  const reader = createRepositoryFantasyNewsReader({ now: NOW, fetchImpl: async () => { calls += 1; await new Promise((resolve) => { release = resolve; }); throw new Error("Bearer private-secret"); } });
  const first = reader();
  const second = reader();
  release();
  const [one, two] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(one.verified, false);
  assert.equal(JSON.stringify(two).includes("private-secret"), false);
});
