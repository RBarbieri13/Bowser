import { createHash } from "node:crypto";

export const EVENT_TYPES = ["INJURY", "PRACTICE", "ROLE_CHANGE", "DEPTH_CHART", "TRANSACTION", "COACH_COMMENT", "PERFORMANCE", "RUMOR", "SUSPENSION", "RETURN", "OTHER"];
export const EVENT_STATUSES = ["CONFIRMED", "REPORTED", "STRONG_INDICATION", "RUMOR", "SPECULATION"];
export const FANTASY_IMPACTS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const SOURCE_TYPES = ["OFFICIAL", "INSIDER", "BEAT_WRITER", "FANTASY_EXPERT", "NEWS_OUTLET", "SOCIAL", "OTHER"];
export const SENTIMENT_DIRECTIONS = ["STRONGLY_UP", "UP", "NEUTRAL", "DOWN", "STRONGLY_DOWN"];
export const BUZZ_DIRECTIONS = ["SURGING", "RISING", "STABLE", "FALLING"];

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

export const INTELLIGENCE_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["generated_at", "lookback_hours", "events"],
  properties: {
    generated_at: { type: "string", format: "date-time" },
    lookback_hours: { type: "integer", minimum: 1, maximum: 168 },
    events: {
      type: "array",
      maxItems: 80,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["event_id", "player", "headline", "summary", "event_type", "status", "fantasy_impact", "fantasy_analysis", "affected_players", "sentiment", "buzz", "injury", "source_quality", "sources", "first_reported_at", "last_updated_at"],
        properties: {
          event_id: { type: "string" },
          player: {
            type: "object", additionalProperties: false, required: ["name", "team", "position"],
            properties: { name: { type: "string" }, team: { type: "string" }, position: { enum: ["QB", "RB", "WR", "TE"] } },
          },
          headline: { type: "string" },
          summary: { type: "string" },
          event_type: { enum: EVENT_TYPES },
          status: { enum: EVENT_STATUSES },
          fantasy_impact: { enum: FANTASY_IMPACTS },
          fantasy_analysis: { type: "string" },
          affected_players: {
            type: "array", maxItems: 12,
            items: {
              type: "object", additionalProperties: false, required: ["name", "relationship", "impact"],
              properties: {
                name: { type: "string" },
                relationship: { enum: ["DIRECT", "BENEFICIARY", "NEGATIVE_SECONDARY", "COMPETITOR"] },
                impact: { type: "string" },
              },
            },
          },
          sentiment: {
            type: "object", additionalProperties: false,
            required: ["score", "direction", "expert_sentiment", "beat_writer_sentiment", "social_sentiment", "reason"],
            properties: {
              score: { type: "number", minimum: -100, maximum: 100 }, direction: { enum: SENTIMENT_DIRECTIONS },
              expert_sentiment: nullableNumber, beat_writer_sentiment: nullableNumber, social_sentiment: nullableNumber,
              reason: { type: "string" },
            },
          },
          buzz: {
            type: "object", additionalProperties: false, required: ["score", "direction"],
            properties: { score: nullableNumber, direction: { enum: BUZZ_DIRECTIONS } },
          },
          injury: {
            type: "object", additionalProperties: false,
            required: ["is_injury_related", "body_part", "practice_status", "game_status", "expected_return"],
            properties: { is_injury_related: { type: "boolean" }, body_part: nullableString, practice_status: nullableString, game_status: nullableString, expected_return: nullableString },
          },
          source_quality: {
            type: "object", additionalProperties: false, required: ["confidence", "primary_source_type", "corroborating_source_count"],
            properties: { confidence: { type: "number", minimum: 0, maximum: 100 }, primary_source_type: { enum: SOURCE_TYPES }, corroborating_source_count: { type: "integer", minimum: 0, maximum: 100 } },
          },
          sources: {
            type: "array", minItems: 1, maxItems: 20,
            items: {
              type: "object", additionalProperties: false,
              required: ["source_name", "author", "x_handle", "source_type", "published_at", "url", "is_original_source"],
              properties: {
                source_name: { type: "string" }, author: nullableString, x_handle: nullableString, source_type: { enum: SOURCE_TYPES },
                published_at: { type: "string", format: "date-time" }, url: { type: "string", format: "uri" }, is_original_source: { type: "boolean" },
              },
            },
          },
          first_reported_at: { type: "string", format: "date-time" },
          last_updated_at: { type: "string", format: "date-time" },
        },
      },
    },
  },
};

const statusCaps = { CONFIRMED: 100, REPORTED: 94, STRONG_INDICATION: 84, RUMOR: 55, SPECULATION: 35 };
const sourceWeights = { OFFICIAL: 96, INSIDER: 91, BEAT_WRITER: 84, NEWS_OUTLET: 76, FANTASY_EXPERT: 68, SOCIAL: 42, OTHER: 35 };

function cleanEnum(value, allowed, fallback) {
  const candidate = String(value || "").toUpperCase();
  return allowed.includes(candidate) ? candidate : fallback;
}

function finite(value, fallback = null, minimum = -Infinity, maximum = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function iso(value, fallback = new Date().toISOString()) {
  const date = new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

function sourceConfidence(status, sources) {
  const independent = new Set(sources.map((source) => `${source.sourceName}:${source.author || source.xHandle || ""}`.toLowerCase()));
  const types = new Set(sources.map((source) => source.sourceType));
  const strongest = Math.max(0, ...sources.map((source) => sourceWeights[source.sourceType] || sourceWeights.OTHER));
  const corroboration = Math.min(12, Math.max(0, independent.size - 1) * 4);
  const diversity = types.size > 1 ? 3 : 0;
  return Math.round(Math.min(statusCaps[status] || 35, strongest + corroboration + diversity));
}

export function normalizeExternalEvent(input = {}, citations = []) {
  const rawPlayer = input.player || {};
  const status = cleanEnum(input.status, EVENT_STATUSES, "SPECULATION");
  const sources = (Array.isArray(input.sources) ? input.sources : []).map((source) => {
    const url = safeUrl(source.url);
    if (!url) return null;
    return {
      sourceName: String(source.source_name || source.sourceName || "Unknown source").slice(0, 120),
      author: source.author ? String(source.author).slice(0, 120) : null,
      xHandle: source.x_handle || source.xHandle ? String(source.x_handle || source.xHandle).slice(0, 80) : null,
      sourceType: cleanEnum(source.source_type || source.sourceType, SOURCE_TYPES, "OTHER"),
      publishedAt: iso(source.published_at || source.publishedAt),
      url,
      isOriginalSource: Boolean(source.is_original_source ?? source.isOriginalSource),
      encounteredByProvider: citations.includes(url) || citations.includes(url.replace(/\/$/, "")),
    };
  }).filter(Boolean);
  if (!sources.length) return null;

  const playerName = String(rawPlayer.name || "").trim();
  if (!playerName) return null;
  const position = cleanEnum(rawPlayer.position, ["QB", "RB", "WR", "TE"], null);
  if (!position) return null;
  const eventType = cleanEnum(input.event_type || input.eventType, EVENT_TYPES, "OTHER");
  const reportedAt = iso(input.first_reported_at || input.firstReportedAt || sources[0]?.publishedAt);
  const eventSeed = `${playerName}|${eventType}|${reportedAt.slice(0, 10)}|${String(input.headline || "")}`.toLowerCase();
  const eventId = String(input.event_id || input.eventId || `evt-${createHash("sha256").update(eventSeed).digest("hex").slice(0, 20)}`);
  const sentimentInput = input.sentiment || {};
  const buzzInput = input.buzz || {};
  const injuryInput = input.injury || {};
  const sourceQualityInput = input.source_quality || input.sourceQuality || {};

  return {
    eventId,
    player: {
      playerId: rawPlayer.player_id || rawPlayer.playerId || null,
      name: playerName,
      team: String(rawPlayer.team || "UNK").toUpperCase().slice(0, 5),
      position,
    },
    headline: String(input.headline || "Player development").trim().slice(0, 220),
    summary: String(input.summary || "").trim().slice(0, 1200),
    eventType,
    status,
    fantasyImpact: cleanEnum(input.fantasy_impact || input.fantasyImpact, FANTASY_IMPACTS, "LOW"),
    fantasyAnalysis: String(input.fantasy_analysis || input.fantasyAnalysis || "").trim().slice(0, 900),
    affectedPlayers: (input.affected_players || input.affectedPlayers || []).slice(0, 12).map((player) => ({
      name: String(player.name || "").slice(0, 100),
      relationship: cleanEnum(player.relationship, ["DIRECT", "BENEFICIARY", "NEGATIVE_SECONDARY", "COMPETITOR"], "DIRECT"),
      impact: String(player.impact || "").slice(0, 600),
    })).filter((player) => player.name),
    sentiment: {
      score: finite(sentimentInput.score, 0, -100, 100),
      direction: cleanEnum(sentimentInput.direction, SENTIMENT_DIRECTIONS, "NEUTRAL"),
      expertSentiment: finite(sentimentInput.expert_sentiment ?? sentimentInput.expertSentiment, null, -100, 100),
      beatWriterSentiment: finite(sentimentInput.beat_writer_sentiment ?? sentimentInput.beatWriterSentiment, null, -100, 100),
      socialSentiment: finite(sentimentInput.social_sentiment ?? sentimentInput.socialSentiment, null, -100, 100),
      reason: String(sentimentInput.reason || "").slice(0, 600),
    },
    buzz: { score: finite(buzzInput.score, null, 0, 100), direction: cleanEnum(buzzInput.direction, BUZZ_DIRECTIONS, "STABLE") },
    injury: {
      isInjuryRelated: Boolean(injuryInput.is_injury_related ?? injuryInput.isInjuryRelated),
      bodyPart: injuryInput.body_part || injuryInput.bodyPart || null,
      practiceStatus: injuryInput.practice_status || injuryInput.practiceStatus || null,
      gameStatus: injuryInput.game_status || injuryInput.gameStatus || null,
      expectedReturn: injuryInput.expected_return || injuryInput.expectedReturn || null,
    },
    sourceQuality: {
      confidence: sourceConfidence(status, sources),
      modelConfidence: finite(sourceQualityInput.confidence, null, 0, 100),
      primarySourceType: cleanEnum(sourceQualityInput.primary_source_type || sourceQualityInput.primarySourceType, SOURCE_TYPES, sources[0].sourceType),
      corroboratingSourceCount: Math.max(0, new Set(sources.map((source) => source.url)).size - 1),
    },
    sources,
    firstReportedAt: reportedAt,
    lastUpdatedAt: iso(input.last_updated_at || input.lastUpdatedAt || reportedAt),
  };
}

export function consolidateEvents(events = []) {
  const byId = new Map();
  for (const event of events.filter(Boolean)) {
    const existing = byId.get(event.eventId);
    if (!existing || new Date(event.lastUpdatedAt) > new Date(existing.lastUpdatedAt)) byId.set(event.eventId, event);
  }
  return [...byId.values()].sort((a, b) => new Date(b.lastUpdatedAt) - new Date(a.lastUpdatedAt));
}
