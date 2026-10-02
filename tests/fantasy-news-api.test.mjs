import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import intelligenceFeedHandler from "../api/v1/intelligence-feed.mjs";
import { fantasyNewsHandler as handler, FantasyNewsQueryError, projectFantasyNewsFeed, queryFantasyNews } from "../server/fantasy-news.mjs";

const NOW = Date.parse("2026-10-01T20:00:00Z");
const OPTIONS = {
  now: NOW, readRepository: false, databaseStatus: { ready: true }, refreshTokenConfigured: true,
  providerStatus: { sources: { rotowire: { ready: true }, sleeper: { ready: true }, xai: { configured: false } } },
};

function event(overrides = {}) {
  return {
    eventId: "test-public-report", player: { playerId: "p1", name: "Test Receiver", team: "BUF", position: "WR" },
    headline: "Test Receiver participates fully", summary: "The official practice report lists full participation.",
    fantasyAnalysis: "Review the next official game designation.", eventType: "PRACTICE", status: "CONFIRMED", fantasyImpact: "MEDIUM",
    firstReportedAt: "2026-10-01T18:00:00-01:00", lastUpdatedAt: "2026-10-01T19:30:00Z",
    sourceQuality: { confidence: 96 },
    sources: [{ sourceName: "NFL", sourceType: "OFFICIAL", url: "https://www.nfl.com/news/practice-report", author: null, xHandle: null, publishedAt: "2026-10-01T18:00:00-01:00", isOriginalSource: true }],
    injury: { isInjuryRelated: true, practiceStatus: "FULL" }, ...overrides,
  };
}

function feed(events, extraMeta = {}) { return { meta: { snapshotMode: "durable_active_snapshot", total: events.length, ...extraMeta }, events }; }
function project(events, params = {}, options = OPTIONS) { return projectFantasyNewsFeed(feed(events), new URLSearchParams(params), options); }

test("the Reed correction preserves publication date and separates attributed surgery from source checks", () => {
  const archive = JSON.parse(readFileSync(new URL("../data/fantasy-news-baseline.json", import.meta.url), "utf8"));
  const reed = archive.events.find((report) => report.eventId === "gb-jayden-reed-ir-2026-09-30");
  const result = projectFantasyNewsFeed(feed([reed], { snapshotMode: "archived_public_baseline" }), new URLSearchParams(), OPTIONS);
  const article = result.articles[0];
  assert.equal(article.status, "REPORTED");
  assert.equal(article.evidence.kind, "report");
  assert.equal(article.source, "RotoWire");
  assert.equal(article.publishedAt, null);
  assert.equal(article.publishedDate, "2026-09-30");
  assert.equal(article.checkedAt, "2026-10-01T18:06:00Z");
  assert.equal(article.updatedAt, "2026-10-01T18:16:47Z");
  assert.equal(article.firstReportedAt, null);
  assert.equal(article.freshness.ageSeconds, null);
  assert.match(article.injury.expectedReturn, /remainder of the 2026 season/);
  assert.match(article.fantasyAnalysis, /keeper\/dynasty/);
});

test("current public articles preserve source clocks and separate polling, edits and evidence", () => {
  const result = project([event()]);
  assert.equal(result.meta.state, "current");
  assert.equal(result.meta.scope, "public_nfl_news");
  assert.equal(result.meta.live, false);
  assert.equal(result.meta.readAt, "2026-10-01T20:00:00.000Z");
  assert.equal(result.meta.freshness.latestSourcePublishedAt, "2026-10-01T18:00:00-01:00");
  assert.equal(result.meta.freshness.latestEventUpdatedAt, "2026-10-01T19:30:00Z");
  const article = result.articles[0];
  assert.equal(article.publishedAt, "2026-10-01T18:00:00-01:00");
  assert.equal(article.capturedAt, null);
  assert.equal(article.checkedAt, null);
  assert.equal(article.freshness.ageSeconds, 3600);
  assert.equal(article.category, "practice");
  assert.equal(article.evidence.kind, "official_report");
  assert.equal(article.evidence.confidence, 96);
  assert.deepEqual(result.meta.coverage.byPosition, { QB: 0, RB: 0, WR: 1, TE: 0 });
  assert.equal(result.meta.coverage.complete, false);
  assert.equal(result.meta.refresh.schedulerVerified, false);
});

test("polling and recently edited event times do not turn an old source into fresh reporting", () => {
  const old = event({ firstReportedAt: "2026-09-30T10:00:00Z", lastUpdatedAt: "2026-10-01T19:59:00Z" });
  old.sources[0].publishedAt = "2026-09-30T10:00:00Z";
  const result = project([old]);
  assert.equal(result.meta.state, "stale");
  assert.equal(result.articles[0].freshness.state, "stale");
  assert.equal(result.meta.freshness.ageSeconds, 34 * 3600);
  assert.equal(project([old], { hours: "24" }).articles.length, 0);
});

test("bootstrap, missing and failed durable reads are explicit unavailable states without sample substitution", async () => {
  const bootstrap = projectFantasyNewsFeed(feed([event()], { snapshotMode: "curated_bootstrap" }), new URLSearchParams(), OPTIONS);
  assert.equal(bootstrap.meta.state, "unavailable");
  assert.deepEqual(bootstrap.articles, []);
  const absent = projectFantasyNewsFeed(undefined, new URLSearchParams(), OPTIONS);
  assert.equal(absent.meta.state, "unavailable");
  const failed = await queryFantasyNews(new URLSearchParams(), { ...OPTIONS, readFeed: async () => { throw new Error("private provider error with secret"); }, baseline: feed([event()]) });
  assert.equal(failed.meta.state, "unavailable");
  assert.equal(JSON.stringify(failed).includes("secret"), false);
  assert.deepEqual(failed.articles, []);
  const empty = project([]);
  assert.equal(empty.meta.state, "empty");
  assert.equal(empty.meta.freshness.latestSourcePublishedAt, null);
});

test("missing, invalid, future, timezone-free and reversed timestamps are rejected", () => {
  const invalid = ["not a timestamp", "2026-10-01T19:00:00", "2026-10-02T19:00:00Z", "2026-02-31T19:00:00Z", null];
  for (const publishedAt of invalid) {
    const input = event(); input.sources[0].publishedAt = publishedAt;
    const result = project([input]);
    assert.equal(result.meta.state, "unavailable", String(publishedAt));
    assert.equal(result.meta.discarded, 1);
    assert.deepEqual(result.articles, []);
  }
  assert.deepEqual(project([event({ lastUpdatedAt: "2026-10-01T18:00:00Z" })]).articles, []);
});

test("malformed objects, identities and partly invalid citation lists do not crash or imply coverage", () => {
  const partlyInvalid = event(); partlyInvalid.sources.push({ sourceName: "Bad", sourceType: "OFFICIAL", url: "javascript:alert(1)", publishedAt: "2026-10-01T19:00:00Z" });
  const result = project([null, {}, event({ player: { name: "Test Kicker", position: "K" } }), partlyInvalid, event()]);
  assert.equal(result.meta.state, "partial");
  assert.equal(result.meta.discarded, 4);
  assert.equal(result.articles.length, 1);
});

test("public projection strips unknown fields and rejects private/Yahoo/Page-linked records", () => {
  const safe = event({ extraSecret: "must never appear" });
  safe.player.privateRoster = "private roster body";
  safe.sources[0].privatePayload = "private source body";
  const privateUrls = ["https://fantasysports.yahooapis.com/fantasy/v2/league/1", "https://example.com/api/v1/yahoo", "https://chatgpt.com/g/g-p/private-page", "https://example.com/news?access_token=private-secret", "https://user:secret@example.com/news", "https://example.com/news?X-Amz-Credential=private-secret", "https://example.com/news#oauth_token=private-secret"];
  const unsafe = privateUrls.map((url, index) => { const input = event({ eventId: `bad-${index}` }); input.sources[0].url = url; return input; });
  const result = project([safe, ...unsafe, event({ eventId: "private", scope: "private" }), event({ eventId: "yahoo", yahooContext: { roster: "secret" } })]);
  assert.equal(result.articles.length, 1);
  assert.equal(result.meta.discarded, 9);
  assert.equal(/private roster body|private source body|must never appear|private-secret|yahooContext/.test(JSON.stringify(result)), false);
  assert.deepEqual(result.articles[0].players, [{ playerId: "p1", name: "Test Receiver", team: "BUF", position: "WR" }]);
});

test("rumor, X access and paywall limits remain separate from source authority confidence", () => {
  const input = event({ eventId: "rumor", eventType: "RUMOR", status: "RUMOR", sourceQuality: { confidence: 42 } });
  input.sources = [
    { ...input.sources[0], sourceName: "Beat Writer", sourceType: "BEAT_WRITER", url: "https://x.com/writer/status/123", isOriginalSource: false },
    { ...input.sources[0], sourceName: "32 Beat Writers", sourceType: "FANTASY_EXPERT", url: "https://www.32beatwriters.com/feeds/nuggets" },
  ];
  const article = project([input]).articles[0];
  assert.equal(article.evidence.kind, "rumor");
  assert.equal(article.evidence.label, "Rumor");
  assert.equal(article.sources[0].isX, true);
  assert.equal(article.sources[0].access, "login_possible");
  assert.equal(article.sources[1].access, "paywall_possible");
});

test("Sleeper market activity is never labeled injury, practice or playing-time confirmation", () => {
  const input = event({ eventId: "sleeper-trending-1", eventType: "OTHER", injury: { isInjuryRelated: false } });
  input.sources[0].sourceName = "Sleeper Trending";
  input.sources[0].url = "https://docs.sleeper.com/";
  const article = project([input]).articles[0];
  assert.equal(article.category, "fantasy_news");
  assert.equal(article.evidence.kind, "market_signal");
  assert.equal(article.timestampBasis, "observed_at");
  assert.match(article.evidence.label, /does not confirm football news/);
});

test("time window, position, team, status and text filters use accepted source dates", () => {
  const first = event();
  const second = event({ eventId: "other", player: { playerId: null, name: "Test Runner", team: "BAL", position: "RB" }, eventType: "RETURN", status: "REPORTED" });
  assert.deepEqual(project([first, second], { position: "RB", team: "BAL", search: "runner", status: "REPORTED", eventType: "RETURN", limit: "1" }).articles.map((article) => article.id), ["other"]);
  assert.equal(project([first], { search: "no match" }).meta.state, "empty");
  assert.equal(project([first], { hours: "720" }).articles.length, 1);
});

test("invalid queries are rejected before reading a store or enabling any refresh", async () => {
  for (const params of [{ position: "DST" }, { hours: "721" }, { hours: "0" }, { limit: "0" }, { eventType: "FAKE" }, { live: "1" }, { team: "BUF/secret" }]) {
    let reads = 0;
    await assert.rejects(() => queryFantasyNews(new URLSearchParams(params), { ...OPTIONS, readFeed: async () => { reads += 1; return feed([]); } }), (error) => error instanceof FantasyNewsQueryError);
    assert.equal(reads, 0);
  }
});

test("read polling reuses bounded persisted public reads and cannot grant ingestion readiness", async () => {
  let received;
  const result = await queryFantasyNews(new URLSearchParams({ hours: "24" }), { ...OPTIONS, databaseStatus: { ready: false }, refreshTokenConfigured: false, readFeed: async (params) => { received = params; return feed([event()]); } });
  assert.equal(received.get("hours"), "720");
  assert.equal(received.get("limit"), "100");
  assert.equal(result.meta.refresh.ready, false);
  assert.equal(result.meta.refresh.lastSuccessfulRunAt, null);
  assert.equal(result.meta.refresh.tokenConfigured, false);
  const bounded = projectFantasyNewsFeed(feed([event()], { total: 101 }), new URLSearchParams(), OPTIONS);
  assert.equal(bounded.meta.state, "partial");
  assert.equal(bounded.meta.coverage.complete, false);
});

test("archived verified public facts preserve raw unknown-timezone clocks without inventing freshness", () => {
  const archived = event({ firstReportedAt: null, lastUpdatedAt: null, checkedAt: "2026-10-01T19:00:00Z" });
  archived.sources[0] = { ...archived.sources[0], publishedAt: null, publishedAtRaw: "September 30, 2026, 3:05 PM (timezone unspecified)", publishedDate: "2026-09-30" };
  const baseline = feed([archived], { snapshotMode: "archived_public_baseline" });
  const result = projectFantasyNewsFeed(baseline, new URLSearchParams({ hours: "168" }), OPTIONS);
  assert.equal(result.meta.state, "stale");
  assert.equal(result.meta.live, false);
  assert.equal(result.meta.freshness.latestSourcePublishedAt, null);
  assert.equal(result.meta.freshness.ageSeconds, null);
  assert.equal(result.articles[0].publishedAt, null);
  assert.equal(result.articles[0].publishedDate, "2026-09-30");
  assert.equal(result.articles[0].checkedAt, "2026-10-01T19:00:00Z");
  assert.equal(result.articles[0].capturedAt, null);
  assert.equal(result.articles[0].freshness.state, "stale");
  assert.match(result.articles[0].publishedAtRaw, /timezone unspecified/);
  assert.equal(projectFantasyNewsFeed(baseline, new URLSearchParams({ hours: "24" }), OPTIONS).articles.length, 1);
  assert.deepEqual(projectFantasyNewsFeed(feed([event({ checkedAt: null })], { snapshotMode: "archived_public_baseline" }), new URLSearchParams(), OPTIONS).articles, []);
});

test("unknown same-day and boundary dates stay visible with uncertain exact-hour coverage and no invented instant", () => {
  const archived = event({ firstReportedAt: null, lastUpdatedAt: null, checkedAt: "2026-10-01T19:00:00Z" });
  archived.sources[0] = { ...archived.sources[0], publishedAt: null, publishedAtRaw: "October 1, 2026 (publication clock and timezone unavailable)", publishedDate: "2026-10-01" };
  const baseline = feed([archived], { snapshotMode: "archived_public_baseline" });
  for (const hours of ["1", "24", "168"]) {
    const result = projectFantasyNewsFeed(baseline, new URLSearchParams({ hours }), OPTIONS);
    assert.equal(result.articles.length, 1);
    assert.equal(result.meta.timeFilterBasis, "exact_timestamps_and_overlapping_calendar_dates");
    assert.equal(result.articles[0].publishedAt, null);
    assert.equal(result.articles[0].freshness.ageSeconds, null);
    assert.match(result.meta.coverage.limitations.join(" "), /exact-hour inclusion and publication age cannot be established/);
  }
  const future = structuredClone(archived);
  future.sources[0].publishedDate = "2026-10-02";
  assert.equal(projectFantasyNewsFeed(feed([future], { snapshotMode: "archived_public_baseline" }), new URLSearchParams(), OPTIONS).articles.length, 0);
  const futureCheck = { ...archived, checkedAt: "2026-10-02T19:00:00Z" };
  assert.equal(projectFantasyNewsFeed(feed([futureCheck], { snapshotMode: "archived_public_baseline" }), new URLSearchParams(), OPTIONS).articles.length, 0);
});

function checkedUndatedEvent(overrides = {}) {
  const report = event({ firstReportedAt: null, lastUpdatedAt: null, checkedAt: "2026-10-01T19:55:00Z", ...overrides });
  report.sources = [{ ...report.sources[0], publishedAt: null, publishedDate: null, publishedAtRaw: "Publication and update clock not displayed", checkedAt: "2026-10-01T19:50:00Z" }];
  return report;
}

function repositoryFeed(events) {
  return feed(events, { snapshotMode: "repository_public_snapshot", repository: { checkedAt: "2026-10-01T19:55:00Z", updatedAt: "2026-10-01T19:56:00Z", lastReadState: "verified" } });
}

test("checked all-undated official reports remain visible without claiming publication age or lookback inclusion", () => {
  const report = checkedUndatedEvent();
  for (const hours of ["1", "24", "168"]) {
    const result = projectFantasyNewsFeed(repositoryFeed([report]), new URLSearchParams({ hours }), OPTIONS);
    assert.equal(result.meta.state, "current");
    assert.equal(result.meta.freshness.basis, "source_check");
    assert.equal(result.meta.freshness.sourceCheckAgeSeconds, 300);
    assert.equal(result.meta.freshness.latestSourcePublishedAt, null);
    assert.equal(result.meta.freshness.ageSeconds, null);
    assert.equal(result.meta.discarded, 0);
    assert.equal(result.meta.timeFilterBasis, "exact_timestamps_and_overlapping_calendar_dates_with_undated_reports");
    assert.equal(result.meta.coverage.unknownPublicationDates, 1);
    assert.equal(result.meta.coverage.includedWithoutPublicationDate, 1);
    assert.match(result.meta.coverage.limitations.join(" "), /Whether these reports were published within the requested window and their publication age cannot be established/);
    const article = result.articles[0];
    assert.equal(article.evidence.kind, "official_report");
    assert.equal(article.publishedAt, null);
    assert.equal(article.publishedDate, null);
    assert.equal(article.timestampStatus, "unknown");
    assert.equal(article.checkedAt, "2026-10-01T19:55:00Z");
    assert.equal(article.freshness.state, "stale");
    assert.equal(article.freshness.ageSeconds, null);
    assert.equal(article.sources[0].checkedAt, "2026-10-01T19:50:00Z");
    assert.equal(article.sources[0].timestampStatus, "unknown");
    assert.deepEqual(article.timeFilter, { basis: "unknown_publication_date", withinWindow: null, hasUndatedSources: true });
  }
});

test("mixed dated and undated citations preserve each clock but cannot date the aggregate report", () => {
  const mixed = checkedUndatedEvent({ eventId: "a-unknown-report" });
  mixed.sources.push({ ...event().sources[0], sourceName: "Earlier reporting", isOriginalSource: false, publishedAt: "2026-09-29T19:00:00Z", publishedDate: "2026-09-29", checkedAt: "2026-10-01T19:45:00Z" });
  mixed.sources.push({ ...event().sources[0], sourceName: "Dated reporting", isOriginalSource: false, publishedAt: null, publishedAtRaw: "October 1, 2026 (clock unavailable)", publishedDate: "2026-10-01", checkedAt: "2026-10-01T19:45:00Z" });
  const known = event({ eventId: "z-known-report", checkedAt: "2026-10-01T19:45:00Z" });
  const result = projectFantasyNewsFeed(repositoryFeed([mixed, known]), new URLSearchParams({ hours: "1" }), OPTIONS);
  assert.deepEqual(result.articles.map((article) => article.id), ["z-known-report", "a-unknown-report"]);
  const article = result.articles[1];
  assert.equal(article.timestampStatus, "unknown");
  assert.equal(article.publishedAt, null);
  assert.equal(article.publishedDate, null);
  assert.equal(article.freshness.ageSeconds, null);
  assert.equal(article.sources[1].publishedAt, "2026-09-29T19:00:00Z");
  assert.equal(article.sources[1].publishedDate, "2026-09-29");
  assert.equal(article.sources[2].publishedDate, "2026-10-01");
  assert.equal(article.sources[2].timestampStatus, "timezone_unspecified");
  assert.deepEqual(article.timeFilter, { basis: "unknown_publication_date", withinWindow: null, hasUndatedSources: true });
  assert.equal(result.articles[0].timeFilter.withinWindow, true);
  // A dated citation still follows its own exact/calendar rule when no undated citation is present.
  const datedOnly = structuredClone(mixed); datedOnly.sources.shift();
  const datedResult = projectFantasyNewsFeed(repositoryFeed([datedOnly]), new URLSearchParams({ hours: "1" }), OPTIONS);
  assert.equal(datedResult.articles.length, 1);
  assert.equal(datedResult.articles[0].timeFilter.basis, "overlapping_calendar_date");
  assert.equal(datedResult.articles[0].timeFilter.withinWindow, null);
});

test("unknown publication support never accepts absent checks, implicit missing fields or malformed dates", () => {
  const mutations = [
    (source) => { delete source.checkedAt; }, (source) => { source.checkedAt = null; },
    (source) => { source.checkedAt = "2026-10-02T19:00:00Z"; },
    (source) => { source.checkedAt = "2026-10-01T19:59:00Z"; },
    (source) => { delete source.publishedDate; }, (source) => { delete source.publishedAt; },
    (source) => { source.publishedAtRaw = ""; }, (source) => { source.publishedDate = "2026-02-31"; },
    (source) => { source.publishedDate = "2026-10-02"; }, (source) => { source.publishedAt = "bad-clock"; },
    (source) => { source.publishedAt = "2026-10-02T19:00:00Z"; },
    (source) => { source.scope = "private"; },
  ];
  for (const mutate of mutations) {
    const report = checkedUndatedEvent(); mutate(report.sources[0]);
    const result = projectFantasyNewsFeed(repositoryFeed([report]), new URLSearchParams(), OPTIONS);
    assert.equal(result.meta.discarded, 1);
    assert.deepEqual(result.articles, []);
  }
  assert.deepEqual(project([checkedUndatedEvent()]).articles, []);
});

test("public AI urgency estimates and explicitly supplied affected identities project without inference", () => {
  const urgency = { score: 4, basis: "Repeated missed practices require a healthy replacement plan.", method: "AI estimate from public reporting", estimatedAt: "2026-10-01T19:30:00Z" };
  const affectedPlayers = [{ name: "Other Runner", playerId: null, team: "BUF", position: "RB", relationship: "potential_beneficiary", impact: "Could gain work if the starter misses the game; the role is not confirmed." }, { name: "Name Only", relationship: "possible_workload_loss", impact: "A returning teammate may reduce opportunities." }];
  const result = project([event({ urgency, affectedPlayers })]);
  assert.deepEqual(result.articles[0].urgency, urgency);
  assert.deepEqual(result.articles[0].affectedPlayers, affectedPlayers);
  const missing = project([event()]).articles[0];
  assert.equal(missing.urgency, null);
  assert.deepEqual(missing.affectedPlayers, []);
  const invalid = [
    { urgency: { ...urgency, score: 1.5 } }, { urgency: { ...urgency, score: 6 } },
    { urgency: { ...urgency, estimatedAt: "2026-10-02T00:00:00Z" } },
    { urgency: { ...urgency, method: "Provider ranking" } }, { urgency: { ...urgency, basis: "<script>private</script>" } },
    { urgency: { ...urgency, leagueKey: "private-secret" } },
    { affectedPlayers: [{ ...affectedPlayers[0], roster: "private-secret" }] },
    { affectedPlayers: [{ ...affectedPlayers[0], position: "DST" }] },
    { affectedPlayers: [{ ...affectedPlayers[0], team: "BUF/private-secret" }] },
    { affectedPlayers: [{ ...affectedPlayers[0], impact: "" }] },
  ];
  for (const fields of invalid) {
    const rejected = project([event(fields)]);
    assert.deepEqual(rejected.articles, []);
    assert.equal(JSON.stringify(rejected).includes("private-secret"), false);
  }
});

test("serverless endpoint is GET-only and sends no-store on rejected requests", async () => {
  const response = { headers: {}, statusCode: null, body: null, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: "POST", url: "/api/v1/fantasy-news", body: { yahoo: "private" } }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers["Allow"], "GET");
  assert.equal(response.headers["Cache-Control"], "no-store");
  await handler({ method: "GET", url: "/api/v1/fantasy-news?position=DST" }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "invalid_query");
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("raw Node middleware responses share GET-only and no-store behavior", async () => {
  const response = { headers: {}, statusCode: null, body: null, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = JSON.parse(body); } };
  await handler({ method: "POST", url: "/api/v1/fantasy-news" }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers["Content-Type"], "application/json; charset=utf-8");
});

test("a verified repository snapshot is primary and source checks remain separate from publication clocks", async () => {
  const publicFeed = feed([event({ checkedAt: "2026-10-01T19:00:00Z" })], {
    snapshotMode: "repository_public_snapshot",
    repository: { sourceUrl: "https://raw.githubusercontent.com/RBarbieri13/Bowser/fantasy-news-data/data/fantasy-news-public.json", revision: "proof-1", checkedAt: "2026-10-01T19:00:00Z", updatedAt: "2026-10-01T19:01:00Z", fetchedAt: "2026-10-01T19:55:00Z", lastReadState: "verified", cacheState: "fetched" },
  });
  const result = await queryFantasyNews(new URLSearchParams(), { ...OPTIONS, readRepository: async () => ({ verified: true, feed: publicFeed }), readFeed: async () => { throw new Error("must not read DB"); } });
  assert.equal(result.meta.state, "current");
  assert.equal(result.meta.freshness.basis, "source_check");
  assert.equal(result.articles[0].freshness.state, "current");
  assert.equal(result.meta.freshness.sourceCheckAgeSeconds, 3600);
  assert.equal(result.meta.repository.updatedAt, "2026-10-01T19:01:00Z");
  assert.equal(result.meta.refresh.persistence, "public_git_repository");
  const failed = structuredClone(publicFeed);
  failed.meta.repository.lastReadState = "unavailable";
  failed.meta.repository.errorCode = "repository_checksum_mismatch";
  assert.equal(projectFantasyNewsFeed(failed, new URLSearchParams(), OPTIONS).meta.state, "stale");
});

test("a cold repository 404 explicitly falls back to an archived public snapshot", async () => {
  const archived = event({ firstReportedAt: null, lastUpdatedAt: null, checkedAt: "2026-10-01T19:00:00Z" });
  archived.sources[0] = { ...archived.sources[0], publishedAt: null, publishedAtRaw: "September 30, timezone unspecified", publishedDate: "2026-09-30" };
  const result = await queryFantasyNews(new URLSearchParams(), {
    ...OPTIONS, readRepository: async () => ({ verified: false, feed: null, sourceUrl: "https://raw.githubusercontent.com/RBarbieri13/Bowser/fantasy-news-data/data/fantasy-news-public.json", error: { code: "repository_not_found" } }),
    readFeed: async () => feed([], { snapshotMode: "curated_bootstrap" }), baseline: feed([archived], { snapshotMode: "archived_public_baseline" }),
  });
  assert.equal(result.meta.state, "stale");
  assert.equal(result.meta.snapshotMode, "archived_public_baseline");
  assert.equal(result.meta.repository.lastReadState, "unavailable");
  assert.equal(result.meta.repository.errorCode, "repository_not_found");
  assert.equal(result.articles[0].publishedAt, null);
});

test("Vercel fantasy news shares the existing feed function and preserves query validation and GET-only controls", async () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const rewrite = config.rewrites.find((rule) => rule.source === "/api/v1/fantasy-news");
  assert.equal(rewrite?.destination, "/api/v1/intelligence-feed?resource=fantasy-news");
  const functions = readdirSync(new URL("../api/", import.meta.url), { recursive: true }).filter((file) => /\.(?:mjs|cjs|js|ts)$/.test(file));
  assert.equal(functions.includes("v1/fantasy-news.mjs"), false);
  assert.ok(functions.length <= 12);
  const response = { headers: {}, statusCode: null, body: null, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const destination = new URL(rewrite.destination, "https://fixture.test");
  destination.searchParams.set("position", "QB");
  destination.searchParams.set("hours", "0");
  await intelligenceFeedHandler({ method: "GET", url: `${destination.pathname}${destination.search}` }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.field, "hours");
  assert.equal(response.headers["Cache-Control"], "no-store");
  await intelligenceFeedHandler({ method: "POST", url: "/api/v1/intelligence-feed", query: { resource: "fantasy-news" } }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, "GET");
  assert.equal(response.body.error.message, "Public fantasy news is read-only.");
});

test("shared function retains the existing intelligence feed method, live-refresh and query behavior", async () => {
  const response = { headers: {}, statusCode: null, body: null, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await intelligenceFeedHandler({ method: "POST", url: "/api/v1/intelligence-feed" }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.body.error.message, "This API is read-only");
  await intelligenceFeedHandler({ method: "GET", url: "/api/v1/intelligence-feed?live=1" }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.body.error.code, "use_refresh_endpoint");
  await intelligenceFeedHandler({ method: "GET", url: "/api/v1/intelligence-feed?position=DST" }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.field, "position");
  assert.equal(response.headers["Cache-Control"], "no-store");
});
