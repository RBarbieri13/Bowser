import { IntelligenceProviderError } from "./intelligence-errors.mjs";
import { resolvePlayerIdentity } from "./intelligence-identities.mjs";
import { consolidateEvents, normalizeExternalEvent } from "./intelligence-schema.mjs";

const API_URL = "https://api.32beatwriters.com/api/nuggets";
const SITE_URL = "https://www.32beatwriters.com";
const ALLOWED_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);
const TEAM_ABBREVIATIONS = new Map([
  ["arizona cardinals", "ARI"], ["atlanta falcons", "ATL"], ["baltimore ravens", "BAL"],
  ["buffalo bills", "BUF"], ["carolina panthers", "CAR"], ["chicago bears", "CHI"],
  ["cincinnati bengals", "CIN"], ["cleveland browns", "CLE"], ["dallas cowboys", "DAL"],
  ["denver broncos", "DEN"], ["detroit lions", "DET"], ["green bay packers", "GB"],
  ["houston texans", "HOU"], ["indianapolis colts", "IND"], ["jacksonville jaguars", "JAX"],
  ["kansas city chiefs", "KC"], ["las vegas raiders", "LV"], ["los angeles chargers", "LAC"],
  ["los angeles rams", "LAR"], ["miami dolphins", "MIA"], ["minnesota vikings", "MIN"],
  ["new england patriots", "NE"], ["new orleans saints", "NO"], ["new york giants", "NYG"],
  ["new york jets", "NYJ"], ["philadelphia eagles", "PHI"], ["pittsburgh steelers", "PIT"],
  ["san francisco 49ers", "SF"], ["seattle seahawks", "SEA"], ["tampa bay buccaneers", "TB"],
  ["tennessee titans", "TEN"], ["washington commanders", "WAS"],
]);

function plainText(value) {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function teamAbbreviation(value) {
  const raw = String(value || "").trim();
  if (!raw) return "UNK";
  if (/^[A-Z]{2,4}$/.test(raw)) return raw;
  return TEAM_ABBREVIATIONS.get(raw.toLowerCase()) || raw.slice(0, 4).toUpperCase();
}

function rawPlayer(item) {
  return item.player || item.playerDetails || item.players?.[0] || {};
}

function itemIdentity(item, resolver = resolvePlayerIdentity) {
  const player = rawPlayer(item);
  const name = plainText(player.name || player.fullName || item.playerName || item.name);
  const resolved = name ? resolver(name) : null;
  const position = String(player.position || player.positionAbbreviation || item.position || resolved?.position || "").toUpperCase();
  if (!name || !ALLOWED_POSITIONS.has(position)) return null;
  const teamValue = player.teamAbbreviation || player.team?.abbreviation || player.teamDetails?.abbreviation
    || player.team?.name || player.teamDetails?.name || item.team || resolved?.team;
  return {
    playerId: resolved?.playerId || player.id || item.playerId || null,
    name: resolved?.name || name,
    position,
    team: teamAbbreviation(teamValue),
  };
}

function classify(text) {
  if (/injur|hurt|ir\b|pup\b|questionable|doubtful|limited practice|did not practice|neck|knee|ankle|hamstring|concussion/i.test(text)) return "INJURY";
  if (/waiv|release|cut|sign|trade|contract|roster spot/i.test(text)) return "TRANSACTION";
  if (/depth chart|starter|backup|handcuff|third receiver|role|rotation|snap|personnel/i.test(text)) return "ROLE_CHANGE";
  if (/practice|camp|reps/i.test(text)) return "PRACTICE";
  if (/touchdown|yards|carries|targets|catches|receptions/i.test(text)) return "PERFORMANCE";
  return "OTHER";
}

function fantasyDirection(text) {
  if (/avoid|drop|do not roster|unlikely|danger|behind|lost|fourth|miss|out\b|reserve|cut/i.test(text)) return { score: -45, direction: "DOWN" };
  if (/add him|buy|target|lead job|starter|primary backup|handcuff|expanded|breakout|ahead|won/i.test(text)) return { score: 48, direction: "UP" };
  return { score: 0, direction: "NEUTRAL" };
}

function fantasyImpact(text, eventType) {
  if (/season[- ]ending|miss the first four|lead job|starter|primary backup|true handcuff/i.test(text)) return "HIGH";
  if (eventType === "INJURY" || eventType === "ROLE_CHANGE" || eventType === "TRANSACTION") return "MEDIUM";
  return "LOW";
}

function sourcePage(item, feedKind) {
  const player = rawPlayer(item);
  const playerId = player.id || item.playerId;
  if (playerId) return `${SITE_URL}/players/${encodeURIComponent(playerId)}`;
  return feedKind === "fantasy" ? `${SITE_URL}/feeds/fantasy-insight` : `${SITE_URL}/feeds/nuggets`;
}

export function thirtyTwoBeatWritersStatus() {
  const tokenConfigured = Boolean(process.env.THIRTYTWO_BEAT_WRITERS_API_TOKEN);
  const ingestionAuthorized = process.env.THIRTYTWO_BEAT_WRITERS_INGESTION_AUTHORIZED === "true";
  return {
    id: "32beatwriters",
    configured: tokenConfigured,
    authorized: ingestionAuthorized,
    ready: tokenConfigured && ingestionAuthorized,
    capabilities: ["nuggets", "fantasy_insight", "player_identity", "source_attribution"],
    message: !tokenConfigured
      ? "A provider-issued 32 Beat Writers API token is required; browser session tokens are not accepted."
      : ingestionAuthorized
        ? "32 Beat Writers ingestion is configured and rights-approved."
        : "Membership access is verified, but automated storage and display require written authorization before activation.",
  };
}

export function normalizeThirtyTwoBeatWritersItem(item = {}, options = {}) {
  const feedKind = options.feedKind === "fantasy" ? "fantasy" : "nuggets";
  const player = itemIdentity(item, options.resolveIdentity || resolvePlayerIdentity);
  if (!player) return null;
  const news = plainText(item.content || item.news || item.description);
  const fantasyInsight = plainText(item.fantasyInsight || item.fantasy_insight);
  const text = `${fantasyInsight} ${news}`.trim();
  if (!text) return null;
  const eventType = classify(text);
  const sentiment = fantasyDirection(fantasyInsight || news);
  const publishedAt = item.fantasyInsightUpdatedAt || item.updatedAt || item.createdAt || new Date().toISOString();
  const author = plainText(item.author || item.authorName) || "32BeatWriters";
  const sourceUrl = sourcePage(item, feedKind);
  const sources = [];
  if (news) sources.push({
    source_name: "32 Beat Writers Nuggets",
    author,
    x_handle: "@32BeatWriters",
    source_type: "NEWS_OUTLET",
    published_at: item.updatedAt || item.createdAt || publishedAt,
    url: sourceUrl,
    is_original_source: false,
  });
  if (fantasyInsight) sources.push({
    source_name: "32 Beat Writers Fantasy Insight",
    author,
    x_handle: "@32BeatWriters",
    source_type: "FANTASY_EXPERT",
    published_at: publishedAt,
    url: sourceUrl,
    is_original_source: false,
  });
  return normalizeExternalEvent({
    event_id: `32bw-${item.id || `${player.name}-${publishedAt}`}`,
    player: { player_id: player.playerId, name: player.name, team: player.team, position: player.position },
    headline: plainText(item.headline || item.title) || `${player.name}: ${eventType === "ROLE_CHANGE" ? "role and usage update" : "latest team report"}`,
    summary: news || fantasyInsight,
    event_type: eventType,
    status: feedKind === "fantasy" ? "STRONG_INDICATION" : "REPORTED",
    fantasy_impact: fantasyImpact(text, eventType),
    fantasy_analysis: fantasyInsight || "Awaiting a separate Bowser fantasy-impact synthesis.",
    affected_players: [],
    sentiment: {
      score: sentiment.score,
      direction: sentiment.direction,
      expert_sentiment: feedKind === "fantasy" ? sentiment.score : null,
      beat_writer_sentiment: feedKind === "nuggets" ? sentiment.score : null,
      social_sentiment: null,
      reason: fantasyInsight ? "Direction is derived from the labeled 32 Beat Writers fantasy insight." : "Direction is derived from explicit role language in the nugget.",
    },
    buzz: { score: null, direction: "STABLE" },
    injury: {
      is_injury_related: eventType === "INJURY",
      body_part: null,
      practice_status: null,
      game_status: null,
      expected_return: null,
    },
    source_quality: { confidence: feedKind === "fantasy" ? 76 : 74, primary_source_type: feedKind === "fantasy" ? "FANTASY_EXPERT" : "NEWS_OUTLET", corroborating_source_count: 0 },
    sources,
    first_reported_at: item.createdAt || publishedAt,
    last_updated_at: publishedAt,
  });
}

export function normalizeThirtyTwoBeatWritersPayload(payload = {}, options = {}) {
  const items = thirtyTwoBeatWritersItems(payload);
  if (!Array.isArray(items)) return [];
  return consolidateEvents(items.map((item) => normalizeThirtyTwoBeatWritersItem(item, options)));
}

function thirtyTwoBeatWritersItems(payload = {}) {
  const items = payload?.data?.nuggets || payload?.nuggets || payload?.data || [];
  return Array.isArray(items) ? items : [];
}

export function mergeThirtyTwoBeatWritersPayloads(nuggetsPayload = {}, fantasyPayload = {}) {
  const merged = new Map();
  for (const item of thirtyTwoBeatWritersItems(nuggetsPayload)) merged.set(String(item.id), { ...item });
  for (const item of thirtyTwoBeatWritersItems(fantasyPayload)) {
    const key = String(item.id);
    const existing = merged.get(key) || {};
    merged.set(key, {
      ...existing,
      ...item,
      content: existing.content || item.content,
      fantasyInsight: item.fantasyInsight || existing.fantasyInsight,
      createdAt: existing.createdAt || item.createdAt,
    });
  }
  return [...merged.values()];
}

async function requestFeed(token, query, fetchImpl = fetch) {
  const url = new URL(API_URL);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new IntelligenceProviderError("provider_unreachable", error instanceof Error ? error.message : "32 Beat Writers request failed", 502, "32beatwriters");
  }
  if (!response.ok) {
    const message = (await response.text()).slice(0, 300);
    throw new IntelligenceProviderError("provider_error", `32 Beat Writers returned ${response.status}: ${message}`, response.status === 401 || response.status === 403 ? 503 : 502, "32beatwriters");
  }
  return response.json();
}

export async function scanWithThirtyTwoBeatWriters(options = {}) {
  const status = thirtyTwoBeatWritersStatus();
  if (!status.ready) throw new IntelligenceProviderError("provider_not_authorized", status.message, 503, "32beatwriters");
  const token = process.env.THIRTYTWO_BEAT_WRITERS_API_TOKEN;
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 30));
  const fetchImpl = options.fetchImpl || fetch;
  const [nuggetsPayload, fantasyPayload] = await Promise.all([
    requestFeed(token, { page: 1, limit, sortBy: "createdAt", sortOrder: "desc" }, fetchImpl),
    requestFeed(token, { feedType: "fantasy", onlyFantasyInsight: true, page: 1, limit, sortBy: "createdAt", sortOrder: "desc" }, fetchImpl),
  ]);
  const events = consolidateEvents(mergeThirtyTwoBeatWritersPayloads(nuggetsPayload, fantasyPayload)
    .map((item) => normalizeThirtyTwoBeatWritersItem(item, {
      feedKind: item.fantasyInsight ? "fantasy" : "nuggets",
      resolveIdentity: options.resolveIdentity,
    })));
  return { events, provider: { ...status, eventCount: events.length } };
}
