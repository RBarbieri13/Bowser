import { getMeta, queryGameBreakdown, queryOpportunityTracker, queryPlayerProfile, queryPlayers, queryTeamBoxScores, QueryValidationError } from "./stats-store.mjs";
import { getIntelligenceRegistry, queryIntelligenceFeed, IntelligenceQueryError } from "./intelligence-store.mjs";
import { scanWithXai, IntelligenceProviderError } from "./intelligence-provider-xai.mjs";

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

export function fantasyStatsApiPlugin() {
  return {
    name: "local-fantasy-stats-api",
    configureServer(server) {
      server.middlewares.use("/api/v1", async (request, response, next) => {
        try {
          if (request.method !== "GET") return sendJson(response, 405, { error: { code: "read_only", message: "This API is read-only" } });
          const url = new URL(request.url || "/", "http://local");
          if (url.pathname === "/meta") return sendJson(response, 200, getMeta());
          if (url.pathname === "/player-stats") return sendJson(response, 200, queryPlayers(url.searchParams));
          if (url.pathname === "/player-profile") return sendJson(response, 200, queryPlayerProfile(url.searchParams));
          if (url.pathname === "/team-box-scores") return sendJson(response, 200, queryTeamBoxScores(url.searchParams));
          if (url.pathname === "/opportunity-tracker") return sendJson(response, 200, queryOpportunityTracker(url.searchParams));
          if (url.pathname === "/game-breakdown") return sendJson(response, 200, queryGameBreakdown(url.searchParams));
          if (url.pathname === "/intelligence-sources") return sendJson(response, 200, getIntelligenceRegistry());
          if (url.pathname === "/intelligence-feed") {
            if (url.searchParams.get("live") === "1") {
              const payload = await scanWithXai({
                lookbackHours: Number(url.searchParams.get("hours") || 24),
                positions: String(url.searchParams.get("position") || "QB,RB,WR,TE").split(",").filter(Boolean),
                teams: String(url.searchParams.get("team") || "").split(",").filter(Boolean),
                query: url.searchParams.get("search") || "",
              });
              return sendJson(response, 200, payload);
            }
            return sendJson(response, 200, queryIntelligenceFeed(url.searchParams));
          }
          return next();
        } catch (error) {
          if (error instanceof QueryValidationError) {
            return sendJson(response, 400, { error: { code: "invalid_query", field: error.field, message: error.message } });
          }
          if (error instanceof IntelligenceQueryError) return sendJson(response, 400, { error: { code: "invalid_query", field: error.field, message: error.message } });
          if (error instanceof IntelligenceProviderError) return sendJson(response, error.status || 503, { error: { code: error.code, message: error.message } });
          return sendJson(response, 500, { error: { code: "warehouse_error", message: error instanceof Error ? error.message : "Unknown API error" } });
        }
      });
    },
  };
}
