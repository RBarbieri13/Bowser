import { queryPlayerIdentity, queryDfsArchive, getMeta, queryGameBreakdown, queryOpportunityTracker, queryPlayerProfile, queryPlayers, queryTeamBoxScores, QueryValidationError } from "./stats-store.mjs";
import { getIntelligenceRegistry, queryPersistedIntelligenceFeed, IntelligenceQueryError } from "./intelligence-store.mjs";
import { IntelligenceProviderError } from "./intelligence-errors.mjs";
import { IntelligenceApiError, intelligenceRunStatus, startIntelligenceRefresh } from "./intelligence-api.mjs";

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export function fantasyStatsApiPlugin() {
  return {
    name: "local-fantasy-stats-api",
    configureServer(server) {
      server.middlewares.use("/api/v1", async (request, response, next) => {
        try {
          const url = new URL(request.url || "/", "http://local");
          if (url.pathname === "/intelligence-runs" && request.method === "POST") return sendJson(response, 200, await startIntelligenceRefresh({ authorization: request.headers.authorization, idempotencyKey: request.headers["idempotency-key"], body: await readBody(request) }));
          if (url.pathname === "/intelligence-runs" && request.method === "GET") return sendJson(response, 200, await intelligenceRunStatus({ authorization: request.headers.authorization, runId: url.searchParams.get("runId"), latest: url.searchParams.get("latest") === "1" }));
          if (request.method !== "GET") return sendJson(response, 405, { error: { code: "read_only", message: "This API is read-only" } });
          if (url.pathname === "/meta") return sendJson(response, 200, getMeta(undefined, url.searchParams));
          if (url.pathname === "/player-stats") return sendJson(response, 200, queryPlayers(url.searchParams));
          if (url.pathname === "/player-identity") return sendJson(response, 200, queryPlayerIdentity(url.searchParams));
          if (url.pathname === "/dfs-archive") return sendJson(response, 200, queryDfsArchive(url.searchParams));
          if (url.pathname === "/player-profile") return sendJson(response, 200, queryPlayerProfile(url.searchParams));
          if (url.pathname === "/team-box-scores") return sendJson(response, 200, queryTeamBoxScores(url.searchParams));
          if (url.pathname === "/opportunity-tracker") return sendJson(response, 200, queryOpportunityTracker(url.searchParams));
          if (url.pathname === "/game-breakdown") return sendJson(response, 200, queryGameBreakdown(url.searchParams));
          if (url.pathname === "/intelligence-sources") return sendJson(response, 200, getIntelligenceRegistry());
          if (url.pathname === "/intelligence-feed") {
            if (url.searchParams.get("live") === "1") return sendJson(response, 405, { error: { code: "use_refresh_endpoint", message: "Use the authenticated intelligence-runs endpoint for live refreshes." } });
            return sendJson(response, 200, await queryPersistedIntelligenceFeed(url.searchParams));
          }
          return next();
        } catch (error) {
          if (error instanceof QueryValidationError) {
            return sendJson(response, 400, { error: { code: "invalid_query", field: error.field, message: error.message } });
          }
          if (error instanceof IntelligenceQueryError) return sendJson(response, 400, { error: { code: "invalid_query", field: error.field, message: error.message } });
          if (error instanceof IntelligenceProviderError) return sendJson(response, error.status || 503, { error: { code: error.code, message: error.message } });
          if (error instanceof IntelligenceApiError) return sendJson(response, error.status, { error: { code: error.code, message: error.message } });
          if (String(request.url || "").includes("intelligence")) return sendJson(response, 500, { error: { code: "intelligence_error", message: "The intelligence request could not be completed." } });
          return sendJson(response, 500, { error: { code: "warehouse_error", message: error instanceof Error ? error.message : "Unknown API error" } });
        }
      });
    },
  };
}
