import { IntelligenceProviderError } from "./intelligence-errors.mjs";
import { resolvePlayerIdentity } from "./intelligence-identities.mjs";
import { consolidateEvents, normalizeExternalEvent } from "./intelligence-schema.mjs";

const API_ROOT = "https://api.sleeper.app/v1";
const WINDOWS = [1, 6, 24];
let playerCache = { expiresAt: 0, players: null };
let trendCache = { expiresAt: 0, result: null };

export function sleeperStatus() {
  return {
    id: "sleeper-trending",
    configured: true,
    ready: true,
    core: true,
    capabilities: ["adds", "drops", "velocity", "waiver_market"],
    message: "Sleeper Trending is available through the official public API.",
  };
}

async function json(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "Bowser Fantasy Analytics/1.0" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new IntelligenceProviderError("provider_error", `Sleeper returned ${response.status}`, 502, "sleeper-trending");
  return response.json();
}

async function sleeperPlayers(fetchImpl) {
  if (playerCache.players && playerCache.expiresAt > Date.now()) return playerCache.players;
  const players = await json(`${API_ROOT}/players/nfl`, fetchImpl);
  playerCache = { players, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  return players;
}

function countsByPlayer(results) {
  const mapped = new Map();
  for (const { type, hours, items } of results) {
    for (const item of items || []) {
      const entry = mapped.get(String(item.player_id)) || { adds: {}, drops: {} };
      entry[type === "add" ? "adds" : "drops"][hours] = Number(item.count) || 0;
      mapped.set(String(item.player_id), entry);
    }
  }
  return mapped;
}

export function normalizeSleeperTrends(results = [], players = {}, options = {}) {
  const resolver = options.resolveIdentity || resolvePlayerIdentity;
  const capturedAt = options.capturedAt || new Date().toISOString();
  const events = [];
  for (const [sleeperId, activity] of countsByPlayer(results)) {
    const sleeperPlayer = players[sleeperId] || {};
    const name = sleeperPlayer.full_name || `${sleeperPlayer.first_name || ""} ${sleeperPlayer.last_name || ""}`.trim();
    const identity = resolver(name);
    if (!identity || !["QB", "RB", "WR", "TE"].includes(identity.position)) continue;
    const adds = activity.adds[24] || 0;
    const drops = activity.drops[24] || 0;
    const net = adds - drops;
    const direction = net > 0 ? "UP" : net < 0 ? "DOWN" : "NEUTRAL";
    const magnitude = Math.min(70, Math.round(Math.log10(Math.abs(net) + 1) * 24));
    const score = direction === "UP" ? magnitude : direction === "DOWN" ? -magnitude : 0;
    const addVelocity = activity.adds[1] ?? Math.round((activity.adds[6] || 0) / 6);
    const dropVelocity = activity.drops[1] ?? Math.round((activity.drops[6] || 0) / 6);
    events.push(normalizeExternalEvent({
      event_id: `sleeper-trending-${sleeperId}-${capturedAt.slice(0, 13)}`,
      player: { player_id: identity.playerId, name: identity.name, team: identity.team, position: identity.position },
      headline: `${identity.name} is ${direction === "UP" ? "being added" : direction === "DOWN" ? "being dropped" : "holding steady"} on Sleeper`,
      summary: `${adds.toLocaleString()} adds and ${drops.toLocaleString()} drops over 24 hours; current velocity is approximately ${addVelocity.toLocaleString()} adds and ${dropVelocity.toLocaleString()} drops per hour.`,
      event_type: "OTHER",
      status: "CONFIRMED",
      fantasy_impact: Math.abs(net) >= 1000 ? "HIGH" : Math.abs(net) >= 100 ? "MEDIUM" : "LOW",
      fantasy_analysis: "This is waiver-market activity, not confirmation of an injury, lineup change, or role. Use the linked reporting sources to identify the cause.",
      affected_players: [],
      sentiment: { score, direction, expert_sentiment: null, beat_writer_sentiment: null, social_sentiment: score, reason: "Direction reflects net Sleeper adds versus drops, not generic emotional sentiment." },
      buzz: { score: Math.min(100, Math.round(Math.log10(adds + drops + 1) * 25)), direction: addVelocity + dropVelocity >= 500 ? "SURGING" : addVelocity + dropVelocity >= 50 ? "RISING" : "STABLE" },
      injury: { is_injury_related: false, body_part: null, practice_status: null, game_status: null, expected_return: null },
      source_quality: { confidence: 96, primary_source_type: "SOCIAL", corroborating_source_count: 0 },
      sources: [{ source_name: "Sleeper Trending Players", author: null, x_handle: "@SleeperNFL", source_type: "SOCIAL", published_at: capturedAt, url: "https://docs.sleeper.com/", is_original_source: true }],
      first_reported_at: capturedAt,
      last_updated_at: capturedAt,
    }));
  }
  return consolidateEvents(events);
}

export async function scanWithSleeper(options = {}) {
  if (!options.disableCache && trendCache.result && trendCache.expiresAt > Date.now()) return structuredClone(trendCache.result);
  const fetchImpl = options.fetchImpl || fetch;
  const limit = Math.max(10, Math.min(100, Number(options.limit) || 50));
  const [players, ...payloads] = await Promise.all([
    sleeperPlayers(fetchImpl),
    ...WINDOWS.flatMap((hours) => ["add", "drop"].map(async (type) => ({
      type,
      hours,
      items: await json(`${API_ROOT}/players/nfl/trending/${type}?lookback_hours=${hours}&limit=${limit}`, fetchImpl),
    }))),
  ]);
  const events = normalizeSleeperTrends(payloads, players, { resolveIdentity: options.resolveIdentity });
  const result = { events, provider: { ...sleeperStatus(), eventCount: events.length, windows: WINDOWS, cacheHours: 24 } };
  if (!options.disableCache) trendCache = { result: structuredClone(result), expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  return result;
}
