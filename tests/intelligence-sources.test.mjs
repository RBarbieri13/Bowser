import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import {
  mergeThirtyTwoBeatWritersPayloads,
  normalizeThirtyTwoBeatWritersPayload,
  scanWithThirtyTwoBeatWriters,
  thirtyTwoBeatWritersStatus,
} from "../server/intelligence-provider-32bw.mjs";
import {
  normalizeRotoWireRss,
  parseRotoWireRss,
  scanWithRotoWire,
} from "../server/intelligence-provider-rotowire.mjs";
import { normalizeFantasyProsPayload, scanWithFantasyPros } from "../server/intelligence-provider-fantasypros.mjs";
import { normalizeSleeperTrends, scanWithSleeper } from "../server/intelligence-provider-sleeper.mjs";
import { priorityXHandles } from "../server/intelligence-x-priority.mjs";
import { buildXaiRequestBody } from "../server/intelligence-provider-xai.mjs";

const resolveIdentity = (name) => ({
  playerId: name === "Test Receiver" ? "player-wr" : "player-rb",
  name,
  position: name === "Test Receiver" ? "WR" : "RB",
  team: name === "Test Receiver" ? "NYG" : "WAS",
});

afterEach(() => {
  delete process.env.THIRTYTWO_BEAT_WRITERS_API_TOKEN;
  delete process.env.THIRTYTWO_BEAT_WRITERS_INGESTION_AUTHORIZED;
  delete process.env.ROTOWIRE_RSS_ENABLED;
  delete process.env.FANTASYPROS_API_KEY;
  delete process.env.FANTASYPROS_INGESTION_AUTHORIZED;
});

test("FantasyPros maps structured player news and keeps its API key server-side", async () => {
  const fixture = { items: [{ id: 12, player_name: "Test Receiver", title: "Test Receiver earns starting role", news: "The receiver worked with the first team.", impact: "He has a path to more targets.", updated: "2026-08-30 18:00:00", link: "https://www.fantasypros.com/nfl/news/test.php", categories: ["Depth Chart"] }] };
  const events = normalizeFantasyProsPayload(fixture, { resolveIdentity });
  assert.equal(events[0].eventType, "ROLE_CHANGE");
  process.env.FANTASYPROS_API_KEY = "test-fp-key";
  process.env.FANTASYPROS_INGESTION_AUTHORIZED = "true";
  const result = await scanWithFantasyPros({ resolveIdentity, fetchImpl: async (url, options) => {
    assert.match(String(url), /^https:\/\/api\.fantasypros\.com\/public\/v2\/json\/nfl\/news/);
    assert.equal(options.headers["x-api-key"], "test-fp-key");
    return new Response(JSON.stringify(fixture), { status: 200, headers: { "Content-Type": "application/json" } });
  } });
  assert.equal(result.events.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /test-fp-key/);
});

test("Sleeper normalizes add/drop windows as market activity and fetches the documented endpoints", async () => {
  const payloads = [{ type: "add", hours: 1, items: [{ player_id: "s1", count: 40 }] }, { type: "add", hours: 24, items: [{ player_id: "s1", count: 2000 }] }, { type: "drop", hours: 24, items: [{ player_id: "s1", count: 20 }] }];
  const events = normalizeSleeperTrends(payloads, { s1: { full_name: "Test Receiver" } }, { resolveIdentity, capturedAt: "2026-08-30T18:00:00Z" });
  assert.equal(events.length, 1);
  assert.match(events[0].summary, /2,000 adds and 20 drops/);
  assert.match(events[0].fantasyAnalysis, /not confirmation/);
  const requests = [];
  await scanWithSleeper({ disableCache: true, resolveIdentity, fetchImpl: async (url) => {
    requests.push(String(url));
    if (String(url).endsWith("/players/nfl")) return new Response(JSON.stringify({ s1: { full_name: "Test Receiver" } }), { status: 200 });
    return new Response("[]", { status: 200 });
  } });
  assert.equal(requests.filter((url) => url.includes("/trending/")).length, 6);
});

test("priority X pass uses the exact approved handle set while broad discovery stays unrestricted", () => {
  const priority = buildXaiRequestBody({ searchMode: "priority" }, new Date("2026-08-30T18:00:00Z"));
  const broad = buildXaiRequestBody({ searchMode: "broad" }, new Date("2026-08-30T18:00:00Z"));
  assert.deepEqual(priority.tools[0].allowed_x_handles, priorityXHandles());
  assert.equal(priorityXHandles().length, 11);
  assert.equal(Object.hasOwn(broad.tools[0], "allowed_x_handles"), false);
});

test("32 Beat Writers normalizer maps nuggets into Bowser's event contract", () => {
  const events = normalizeThirtyTwoBeatWritersPayload({
    data: {
      nuggets: [{
        id: 44,
        content: "The receiver handled every first-team snap and moved ahead in the rotation.",
        createdAt: "2026-08-30T14:00:00Z",
        player: { id: 17, name: "Test Receiver", position: "WR", teamDetails: { abbreviation: "NYG" } },
        author: "Example Beat Writer",
      }],
    },
  }, { feedKind: "nuggets", resolveIdentity });

  assert.equal(events.length, 1);
  assert.equal(events[0].eventId, "32bw-44");
  assert.equal(events[0].player.name, "Test Receiver");
  assert.equal(events[0].player.team, "NYG");
  assert.equal(events[0].eventType, "ROLE_CHANGE");
  assert.equal(events[0].sources[0].sourceName, "32 Beat Writers Nuggets");
  assert.equal(events[0].sources[0].sourceType, "NEWS_OUTLET");
  assert.equal(events[0].sources[0].isOriginalSource, false);
});

test("32 Beat Writers adapter refuses activation without both rights and a provider token", async () => {
  process.env.THIRTYTWO_BEAT_WRITERS_API_TOKEN = "test-token";
  assert.equal(thirtyTwoBeatWritersStatus().ready, false);
  await assert.rejects(() => scanWithThirtyTwoBeatWriters(), (error) => error.code === "provider_not_authorized");
});

test("32 Beat Writers merges associated news and fantasy insight before normalization", () => {
  const merged = mergeThirtyTwoBeatWritersPayloads(
    { data: { nuggets: [{ id: 7, content: "Synthetic team usage report.", createdAt: "2026-08-30T10:00:00Z" }] } },
    { data: { nuggets: [{ id: 7, fantasyInsight: "Synthetic fantasy interpretation.", fantasyInsightUpdatedAt: "2026-08-30T11:00:00Z" }] } },
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].content, "Synthetic team usage report.");
  assert.equal(merged[0].fantasyInsight, "Synthetic fantasy interpretation.");
});

test("32 Beat Writers adapter queries both official feed variants without exposing the token", async () => {
  process.env.THIRTYTWO_BEAT_WRITERS_API_TOKEN = "test-token";
  process.env.THIRTYTWO_BEAT_WRITERS_INGESTION_AUTHORIZED = "true";
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), authorization: options.headers.Authorization });
    return new Response(JSON.stringify({ data: { nuggets: [] } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await scanWithThirtyTwoBeatWriters({ fetchImpl, resolveIdentity });
  assert.equal(result.events.length, 0);
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /^https:\/\/api\.32beatwriters\.com\/api\/nuggets\?/);
  assert.match(requests[1].url, /feedType=fantasy/);
  assert.match(requests[1].url, /onlyFantasyInsight=true/);
  assert.deepEqual(requests.map((request) => request.authorization), ["Bearer test-token", "Bearer test-token"]);
  assert.doesNotMatch(JSON.stringify(result), /test-token/);
});

test("RotoWire RSS parser preserves IDs, links, timestamps, and attributed summaries", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><guid>nfl-test-1</guid><title>Test Running Back: Wins starting job</title>
    <link>https://www.rotowire.com//football/player/test-1</link>
    <description>The back won the starting role Sunday. Visit RotoWire.com for more analysis on this update.</description>
    <pubDate>Sun, 30 Aug 2026 1:10:00 PM PDT</pubDate></item>
    <item><guid>nfl-test-k</guid><title>Test Kicker: Makes the roster</title>
    <link>https://www.rotowire.com/football/player/test-k</link><description>Kicker update.</description>
    <pubDate>Sun, 30 Aug 2026 1:05:00 PM PDT</pubDate></item>
  </channel></rss>`;
  const items = parseRotoWireRss(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0].guid, "nfl-test-1");

  const events = normalizeRotoWireRss(xml, {
    resolveIdentity: (name) => name === "Test Kicker" ? { name, position: "K", team: "IND" } : resolveIdentity(name),
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].eventId, "rotowire-nfl-test-1");
  assert.equal(events[0].eventType, "ROLE_CHANGE");
  assert.equal(events[0].sources[0].sourceName, "RotoWire NFL RSS");
  assert.equal(events[0].sources[0].url, "https://www.rotowire.com/football/player/test-1");
  assert.doesNotMatch(events[0].summary, /Visit RotoWire/);
});

test("RotoWire scanner uses the public RSS transport", async () => {
  process.env.ROTOWIRE_RSS_ENABLED = "true";
  const fetchImpl = async (url, options) => {
    assert.equal(String(url), "https://www.rotowire.com/rss/news.php?sport=NFL");
    assert.match(options.headers.Accept, /rss\+xml/);
    return new Response("<?xml version=\"1.0\"?><rss><channel></channel></rss>", { status: 200 });
  };
  const result = await scanWithRotoWire({ fetchImpl, resolveIdentity });
  assert.equal(result.provider.id, "rotowire-rss");
  assert.deepEqual(result.events, []);
});
