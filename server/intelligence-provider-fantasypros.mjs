import { IntelligenceProviderError } from "./intelligence-errors.mjs";
import { resolvePlayerIdentity } from "./intelligence-identities.mjs";
import { consolidateEvents, normalizeExternalEvent } from "./intelligence-schema.mjs";

const API_URL = "https://api.fantasypros.com/public/v2/json/nfl/news";

function text(value) {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;/g, "'").replace(/&quot;/gi, "\"")
    .replace(/\s+/g, " ").trim();
}

function iso(value) {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(value || "")) ? `${String(value).replace(" ", "T")}Z` : value;
  const date = new Date(normalized || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function eventType(item, combined) {
  const categories = (item.categories || []).join(" ");
  if (/injur|practice|questionable|doubtful|out\b|ir\b|pup\b|concussion/i.test(`${categories} ${combined}`)) return "INJURY";
  if (/transaction|waiv|release|sign|trade|cut|activate/i.test(`${categories} ${combined}`)) return "TRANSACTION";
  if (/rumor/i.test(categories)) return "RUMOR";
  if (/role|starter|depth chart|snap|target share|committee/i.test(combined)) return "ROLE_CHANGE";
  return "OTHER";
}

function sentiment(combined) {
  if (/ruled out|placed on ir|miss|waived|released|demoted|backup/i.test(combined)) return { score: -42, direction: "DOWN" };
  if (/cleared|activated|starter|starting|lead role|returns|promoted/i.test(combined)) return { score: 38, direction: "UP" };
  return { score: 0, direction: "NEUTRAL" };
}

export function fantasyProsStatus() {
  const configured = Boolean(process.env.FANTASYPROS_API_KEY);
  const authorized = process.env.FANTASYPROS_INGESTION_AUTHORIZED === "true";
  return {
    id: "fantasypros-news",
    configured,
    authorized,
    ready: configured && authorized,
    core: true,
    capabilities: ["player_news", "injuries", "transactions", "fantasy_impact", "source_attribution"],
    message: !configured ? "Add FANTASYPROS_API_KEY to configure FantasyPros Player News."
      : authorized ? "FantasyPros Player News is configured and rights-approved."
        : "The API key is configured, but storage and display remain disabled until FANTASYPROS_INGESTION_AUTHORIZED=true is backed by the applicable rights record.",
  };
}

export function normalizeFantasyProsItem(item = {}, options = {}) {
  const rawName = text(item.player_name || item.player?.name || item.name);
  const identity = (options.resolveIdentity || resolvePlayerIdentity)(rawName);
  if (!identity || !["QB", "RB", "WR", "TE"].includes(identity.position)) return null;
  const headline = text(item.title);
  const summary = text(item.news || item.desc || item.description);
  const fantasyAnalysis = text(item.impact || item.fantasy_impact || item.analysis) || "FantasyPros did not provide a separate impact field for this item.";
  if (!headline || !summary) return null;
  const combined = `${headline} ${summary} ${fantasyAnalysis}`;
  const type = eventType(item, combined);
  const direction = sentiment(combined);
  const publishedAt = iso(item.updated || item.created || item.published_at);
  return normalizeExternalEvent({
    event_id: `fantasypros-${item.id || `${identity.playerId}-${publishedAt}`}`,
    player: { player_id: identity.playerId, name: identity.name, team: item.team_id || identity.team, position: identity.position },
    headline,
    summary,
    event_type: type,
    status: type === "RUMOR" ? "RUMOR" : "REPORTED",
    fantasy_impact: /season-ending|placed on ir|starting job|lead role/i.test(combined) ? "HIGH" : type === "INJURY" || type === "TRANSACTION" ? "MEDIUM" : "LOW",
    fantasy_analysis: fantasyAnalysis,
    affected_players: [],
    sentiment: { score: direction.score, direction: direction.direction, expert_sentiment: direction.score, beat_writer_sentiment: null, social_sentiment: null, reason: "Direction is derived from explicit availability or role language in the FantasyPros item." },
    buzz: { score: null, direction: "STABLE" },
    injury: { is_injury_related: type === "INJURY", body_part: null, practice_status: null, game_status: null, expected_return: null },
    source_quality: { confidence: 78, primary_source_type: "FANTASY_EXPERT", corroborating_source_count: 0 },
    sources: [{
      source_name: "FantasyPros Player News",
      author: text(item.author) || null,
      x_handle: "@FantasyProsNFL",
      source_type: "FANTASY_EXPERT",
      published_at: publishedAt,
      url: item.link,
      is_original_source: false,
    }],
    first_reported_at: publishedAt,
    last_updated_at: publishedAt,
  });
}

export function normalizeFantasyProsPayload(payload = {}, options = {}) {
  return consolidateEvents((payload.items || payload.news || []).map((item) => normalizeFantasyProsItem(item, options)));
}

export async function scanWithFantasyPros(options = {}) {
  const status = fantasyProsStatus();
  if (!status.ready) throw new IntelligenceProviderError("provider_not_configured", status.message, 503, status.id);
  const url = new URL(API_URL);
  url.searchParams.set("limit", String(Math.max(1, Math.min(100, Number(options.limit) || 100))));
  url.searchParams.set("order_by", "updated");
  const response = await (options.fetchImpl || fetch)(url, {
    headers: { "x-api-key": process.env.FANTASYPROS_API_KEY, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new IntelligenceProviderError("provider_error", `FantasyPros returned ${response.status}`, response.status === 401 || response.status === 403 ? 503 : 502, status.id);
  const events = normalizeFantasyProsPayload(await response.json(), { resolveIdentity: options.resolveIdentity });
  return { events, provider: { ...status, eventCount: events.length } };
}
