import { IntelligenceProviderError } from "./intelligence-errors.mjs";
import { resolvePlayerIdentity } from "./intelligence-identities.mjs";
import { consolidateEvents, normalizeExternalEvent } from "./intelligence-schema.mjs";

const API_URL = "https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=2&numTeams=12&ppr=1";

export function fantasyCalcStatus() {
  const ready = process.env.FANTASYCALC_ENABLED === "true";
  return {
    id: "fantasycalc-market",
    configured: ready,
    ready,
    core: false,
    capabilities: ["market_value", "rank", "trend_30_day", "adp"],
    message: ready ? "FantasyCalc market data is enabled with attribution." : "FantasyCalc is connector-ready; set FANTASYCALC_ENABLED=true only for an attributed, non-commercial integration.",
  };
}

export function normalizeFantasyCalcPayload(payload = [], options = {}) {
  const capturedAt = options.capturedAt || new Date().toISOString();
  const resolver = options.resolveIdentity || resolvePlayerIdentity;
  const rows = Array.isArray(payload) ? payload : payload.values || payload.players || [];
  return consolidateEvents(rows.map((row) => {
    const player = row.player || row;
    const identity = resolver(player.name || player.fullName || row.name);
    if (!identity || !["QB", "RB", "WR", "TE"].includes(identity.position)) return null;
    const trend = Number(row.trend30Day ?? row.trend_30_day ?? 0);
    const direction = trend > 0 ? "UP" : trend < 0 ? "DOWN" : "NEUTRAL";
    const value = Number(row.value ?? row.redraftValue ?? 0);
    const rank = Number(row.overallRank ?? row.rank ?? 0);
    return normalizeExternalEvent({
      event_id: `fantasycalc-${identity.playerId}-${capturedAt.slice(0, 10)}`,
      player: { player_id: identity.playerId, name: identity.name, team: identity.team, position: identity.position },
      headline: `${identity.name} FantasyCalc market value ${direction === "UP" ? "rose" : direction === "DOWN" ? "fell" : "held steady"}`,
      summary: `Current redraft market value ${value.toLocaleString()}${rank ? `, overall rank ${rank}` : ""}, with a 30-day trend of ${trend > 0 ? "+" : ""}${trend}.`,
      event_type: "OTHER",
      status: "CONFIRMED",
      fantasy_impact: Math.abs(trend) >= 500 ? "MEDIUM" : "LOW",
      fantasy_analysis: "Crowdsourced market value is a price signal, not independent confirmation of football news.",
      affected_players: [],
      sentiment: { score: Math.max(-70, Math.min(70, Math.round(trend / 10))), direction, expert_sentiment: null, beat_writer_sentiment: null, social_sentiment: null, reason: "Direction reflects FantasyCalc's published 30-day market trend." },
      buzz: { score: null, direction: "STABLE" },
      injury: { is_injury_related: false, body_part: null, practice_status: null, game_status: null, expected_return: null },
      source_quality: { confidence: 70, primary_source_type: "OTHER", corroborating_source_count: 0 },
      sources: [{ source_name: "FantasyCalc", author: null, x_handle: null, source_type: "OTHER", published_at: capturedAt, url: "https://fantasycalc.com/", is_original_source: true }],
      first_reported_at: capturedAt,
      last_updated_at: capturedAt,
    });
  }));
}

export async function scanWithFantasyCalc(options = {}) {
  const status = fantasyCalcStatus();
  if (!status.ready) throw new IntelligenceProviderError("provider_disabled", status.message, 503, status.id);
  const response = await (options.fetchImpl || fetch)(API_URL, { headers: { Accept: "application/json", "User-Agent": "Bowser Fantasy Analytics/1.0" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new IntelligenceProviderError("provider_error", `FantasyCalc returned ${response.status}`, 502, status.id);
  const events = normalizeFantasyCalcPayload(await response.json(), { resolveIdentity: options.resolveIdentity });
  return { events, provider: { ...status, eventCount: events.length } };
}
