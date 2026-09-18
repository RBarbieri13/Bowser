import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeSourceUrl, deduplicateIntelligenceEvents } from "../server/intelligence-dedup.mjs";

function event(overrides = {}) {
  return {
    eventId: overrides.eventId || "event-1",
    player: { playerId: "player-1", name: "Test Player", team: "BUF", position: "WR", ...overrides.player },
    headline: overrides.headline || "Test Player wins the starting role",
    summary: overrides.summary || "The receiver worked with the first team and is expected to start.",
    eventType: overrides.eventType || "ROLE_CHANGE",
    sourceQuality: { confidence: overrides.confidence || 80, corroboratingSourceCount: 0 },
    sources: overrides.sources || [{ sourceName: "Source A", sourceType: "FANTASY_EXPERT", url: "https://example.com/story?utm_source=x", publishedAt: "2026-08-30T12:00:00Z" }],
    firstReportedAt: overrides.firstReportedAt || "2026-08-30T12:00:00Z",
    lastUpdatedAt: overrides.lastUpdatedAt || "2026-08-30T12:00:00Z",
  };
}

test("canonical URLs remove trackers without erasing source identity", () => {
  assert.equal(canonicalizeSourceUrl("https://www.Example.com//story/?utm_source=x&b=2&a=1#top"), "https://example.com/story?a=1&b=2");
});

test("conservative dedupe merges corroborating observations but not different players", () => {
  const duplicate = event({ eventId: "event-2", confidence: 92, sources: [{ sourceName: "Source B", sourceType: "FANTASY_EXPERT", url: "https://other.example/report", publishedAt: "2026-08-30T12:20:00Z" }] });
  const otherPlayer = event({ eventId: "event-3", player: { playerId: "player-2", name: "Other Player" } });
  const result = deduplicateIntelligenceEvents([event(), duplicate, otherPlayer]);
  assert.equal(result.events.length, 2);
  const merged = result.events.find((item) => item.player.playerId === "player-1");
  assert.equal(merged.sources.length, 2);
  assert.equal(merged.sourceQuality.corroboratingSourceCount, 1);
});

test("a supplementary outlet cannot replace a matching core expert event", () => {
  const core = event({ headline: "Core source role update", summary: "Test Player worked with the first team and earned the starting role.", confidence: 68, sources: [{ sourceName: "32 Beat Writers Nuggets", sourceType: "NEWS_OUTLET", url: "https://32beatwriters.com/players/1", publishedAt: "2026-08-30T12:00:00Z" }] });
  const supplementary = event({ eventId: "rss", headline: "Supplementary role update", summary: "Test Player worked with the first team and earned the starting role.", confidence: 90, sources: [{ sourceName: "RotoWire NFL RSS", sourceType: "NEWS_OUTLET", url: "https://rss.example/item", publishedAt: "2026-08-30T12:05:00Z" }] });
  const result = deduplicateIntelligenceEvents([core, supplementary]);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].headline, "Core source role update");
  assert.equal(result.events[0].sources.length, 2);
});

test("a later same-source revision updates content and timestamp together", () => {
  const oldEvent = event({ headline: "Old role report", summary: "Test Player worked with the first team.", lastUpdatedAt: "2026-08-30T12:00:00Z" });
  const update = event({ eventId: "event-update", headline: "New role report", summary: "Test Player worked with the first team and was named the starter.", lastUpdatedAt: "2026-08-30T13:00:00Z" });
  const result = deduplicateIntelligenceEvents([oldEvent, update]);
  assert.equal(result.events[0].headline, "New role report");
  assert.equal(result.events[0].lastUpdatedAt, "2026-08-30T13:00:00Z");
});

test("RotoWire cannot override the core Sleeper market signal", () => {
  const sleeper = event({ headline: "Sleeper core signal", summary: "Test Player is rising after two thousand adds.", sources: [{ sourceName: "Sleeper Trending Players", sourceType: "SOCIAL", url: "https://docs.sleeper.com/", publishedAt: "2026-08-30T12:00:00Z" }] });
  const rotowire = event({ eventId: "rw", headline: "RotoWire supplementary signal", summary: "Test Player is rising after two thousand adds.", confidence: 99, sources: [{ sourceName: "RotoWire NFL RSS", sourceType: "NEWS_OUTLET", url: "https://rotowire.com/item", publishedAt: "2026-08-30T12:05:00Z" }] });
  const result = deduplicateIntelligenceEvents([sleeper, rotowire]);
  assert.equal(result.events[0].headline, "Sleeper core signal");
});
