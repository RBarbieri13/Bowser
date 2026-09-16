import { IntelligenceProviderError } from "./intelligence-errors.mjs";
import { resolvePlayerIdentity } from "./intelligence-identities.mjs";
import { consolidateEvents, normalizeExternalEvent } from "./intelligence-schema.mjs";

const RSS_URL = "https://www.rotowire.com/rss/news.php?sport=NFL";

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  return decodeXml(block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
}

function cleanDescription(value) {
  return decodeXml(value).replace(/\s*Visit RotoWire\.com for more analysis on this update\.?\s*$/i, "").trim();
}

function iso(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function classify(text) {
  if (/injur|hurt|ir\b|pup\b|questionable|doubtful|ruled out|miss|surgery|knee|ankle|hamstring|concussion/i.test(text)) return "INJURY";
  if (/waiv|release|cut|sign|trade|contract|roster|activated|reserve/i.test(text)) return "TRANSACTION";
  if (/starter|starting|backup|depth chart|role|rotation|promotion|demotion/i.test(text)) return "ROLE_CHANGE";
  if (/practice|limited|did not practice|full participant/i.test(text)) return "PRACTICE";
  if (/touchdown|yards|carries|targets|catches|receptions/i.test(text)) return "PERFORMANCE";
  return "OTHER";
}

function direction(text) {
  if (/placed on ir|reserve\/pup|ruled out|waived|released|miss|surgery|limited|loses|backup/i.test(text)) return { score: -38, direction: "DOWN" };
  if (/wins|starter|starting|activated|returns|earns spot|promoted|lead role/i.test(text)) return { score: 34, direction: "UP" };
  return { score: 0, direction: "NEUTRAL" };
}

function impact(text, eventType) {
  if (/season[- ]ending|reserve\/pup|placed on ir|miss the first four|wins.*job|starting job/i.test(text)) return "HIGH";
  if (["INJURY", "TRANSACTION", "ROLE_CHANGE"].includes(eventType)) return "MEDIUM";
  return "LOW";
}

export function rotoWireStatus() {
  const ready = process.env.ROTOWIRE_RSS_ENABLED === "true";
  return {
    id: "rotowire-rss",
    configured: ready,
    authorized: ready,
    ready,
    capabilities: ["rss", "player_news", "source_attribution"],
    message: ready
      ? "RotoWire NFL RSS is enabled as a supplementary source."
      : "RotoWire RSS is connector-ready but disabled until ROTOWIRE_RSS_ENABLED=true confirms the intended use is covered.",
  };
}

export function parseRotoWireRss(xml = "") {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => ({
    guid: tag(match[1], "guid"),
    title: tag(match[1], "title"),
    link: tag(match[1], "link"),
    description: cleanDescription(match[1].match(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i)?.[1] || ""),
    pubDate: tag(match[1], "pubDate"),
  })).filter((item) => item.guid && item.title && item.link);
}

export function normalizeRotoWireItem(item = {}, options = {}) {
  const [rawName, ...headlineParts] = String(item.title || "").split(":");
  const identity = (options.resolveIdentity || resolvePlayerIdentity)(rawName.trim());
  if (!identity || !["QB", "RB", "WR", "TE"].includes(identity.position)) return null;
  const headlineDetail = headlineParts.join(":").trim();
  const summary = cleanDescription(item.description);
  if (!summary) return null;
  const text = `${headlineDetail} ${summary}`;
  const eventType = classify(text);
  const sentiment = direction(text);
  const publishedAt = iso(item.pubDate);
  return normalizeExternalEvent({
    event_id: `rotowire-${item.guid}`,
    player: { player_id: identity.playerId, name: identity.name, team: identity.team, position: identity.position },
    headline: `${identity.name}: ${headlineDetail || "latest NFL update"}`,
    summary,
    event_type: eventType,
    status: "REPORTED",
    fantasy_impact: impact(text, eventType),
    fantasy_analysis: "Supplementary report. Confirm material lineup and injury changes against Bowser's core sources.",
    affected_players: [],
    sentiment: {
      score: sentiment.score,
      direction: sentiment.direction,
      expert_sentiment: null,
      beat_writer_sentiment: null,
      social_sentiment: null,
      reason: "Direction is derived only from explicit availability or role language in the RSS item.",
    },
    buzz: { score: null, direction: "STABLE" },
    injury: {
      is_injury_related: eventType === "INJURY",
      body_part: null,
      practice_status: null,
      game_status: null,
      expected_return: null,
    },
    source_quality: { confidence: 76, primary_source_type: "NEWS_OUTLET", corroborating_source_count: 0 },
    sources: [{
      source_name: "RotoWire NFL RSS",
      author: null,
      x_handle: "@RotoWireNFL",
      source_type: "NEWS_OUTLET",
      published_at: publishedAt,
      url: item.link.replace("rotowire.com//", "rotowire.com/"),
      is_original_source: false,
    }],
    first_reported_at: publishedAt,
    last_updated_at: publishedAt,
  });
}

export function normalizeRotoWireRss(xml = "", options = {}) {
  return consolidateEvents(parseRotoWireRss(xml).map((item) => normalizeRotoWireItem(item, options)));
}

export async function scanWithRotoWire(options = {}) {
  const status = rotoWireStatus();
  if (!status.ready) throw new IntelligenceProviderError("provider_disabled", status.message, 503, "rotowire-rss");
  const fetchImpl = options.fetchImpl || fetch;
  let response;
  try {
    response = await fetchImpl(RSS_URL, {
      headers: { Accept: "application/rss+xml, application/xml;q=0.9", "User-Agent": "Bowser Fantasy Analytics/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new IntelligenceProviderError("provider_unreachable", error instanceof Error ? error.message : "RotoWire RSS request failed", 502, "rotowire-rss");
  }
  if (!response.ok) throw new IntelligenceProviderError("provider_error", `RotoWire RSS returned ${response.status}`, 502, "rotowire-rss");
  const events = normalizeRotoWireRss(await response.text(), { resolveIdentity: options.resolveIdentity });
  return { events, provider: { ...status, eventCount: events.length } };
}
