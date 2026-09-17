import express from "express";
import { waiversHandler } from "./server/waivers-store.mjs";
import { marketPulseHandler } from "./server/market-pulse.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { queryPlayerIdentity, queryDfsArchive, getMeta, queryGameBreakdown, queryOpportunityTracker, queryPlayerProfile, queryPlayers, queryTeamBoxScores, QueryValidationError } from "./server/stats-store.mjs";
import { getIntelligenceRegistry, queryPersistedIntelligenceFeed, IntelligenceQueryError } from "./server/intelligence-store.mjs";
import { IntelligenceProviderError } from "./server/intelligence-errors.mjs";
import { IntelligenceApiError, intelligenceRunStatus, startIntelligenceRefresh } from "./server/intelligence-api.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const clientDirectory = path.join(root, "dist", "client");
const indexPath = path.join(clientDirectory, "index.html");
const indexHtml = readFileSync(indexPath, "utf8");

const app = express();
app.all('/api/v1/market-pulse', marketPulseHandler);
app.all('/api/v1/waivers', waiversHandler);
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

function sendApi(response, status, payload, cacheControl) {
  response.status(status);
  response.setHeader("Cache-Control", cacheControl || (status === 200
    ? "public, s-maxage=3600, stale-while-revalidate=86400"
    : "no-store"));
  response.json(payload);
}

function apiHandler(handler) {
  return (request, response) => {
    try {
      const url = new URL(request.originalUrl, "https://local.invalid");
      sendApi(response, 200, handler(url.searchParams));
    } catch (error) {
      if (error instanceof QueryValidationError) {
        sendApi(response, 400, { error: { code: "invalid_query", field: error.field, message: error.message } });
        return;
      }
      sendApi(response, 500, { error: { code: "warehouse_error", message: error instanceof Error ? error.message : "Unknown API error" } });
    }
  };
}

function asyncApiHandler(handler) {
  return async (request, response) => {
    try {
      const url = new URL(request.originalUrl, "https://local.invalid");
      sendApi(response, 200, await handler(url.searchParams), "no-store");
    } catch (error) {
      if (error instanceof IntelligenceQueryError) return sendApi(response, 400, { error: { code: "invalid_query", field: error.field, message: error.message } });
      if (error instanceof IntelligenceProviderError) return sendApi(response, error.status || 503, { error: { code: error.code, message: error.message } });
      if (error instanceof IntelligenceApiError) return sendApi(response, error.status, { error: { code: error.code, message: error.message } });
      console.error("Intelligence API read failed", { name: error?.name, code: error?.code });
      sendApi(response, 500, { error: { code: "intelligence_error", message: "Unable to load intelligence data." } });
    }
  };
}

app.get("/api/v1/meta", apiHandler((params) => getMeta(undefined, params)));
app.get("/api/v1/player-stats", apiHandler((params) => queryPlayers(params)));
app.get("/api/v1/player-identity", apiHandler((params) => queryPlayerIdentity(params)));
app.get("/api/v1/dfs-archive", apiHandler((params) => queryDfsArchive(params)));
app.get("/api/v1/player-profile", apiHandler((params) => queryPlayerProfile(params)));
app.get("/api/v1/team-box-scores", apiHandler((params) => queryTeamBoxScores(params)));
app.get("/api/v1/opportunity-tracker", apiHandler((params) => queryOpportunityTracker(params)));
app.get("/api/v1/game-breakdown", apiHandler((params) => queryGameBreakdown(params)));
app.get("/api/v1/intelligence-sources", apiHandler(() => getIntelligenceRegistry()));
app.get("/api/v1/intelligence-feed", async (request, response) => {
  if (request.query.live === "1") return sendApi(response, 405, { error: { code: "use_refresh_endpoint", message: "Use the authenticated intelligence-runs endpoint for live refreshes." } }, "no-store");
  return asyncApiHandler((params) => queryPersistedIntelligenceFeed(params))(request, response);
});
app.post("/api/v1/intelligence-runs", async (request, response) => {
  try {
    const result = await startIntelligenceRefresh({ authorization: request.headers.authorization, idempotencyKey: request.headers["idempotency-key"], body: request.body || {} });
    sendApi(response, 200, result, "no-store");
  } catch (error) {
    if (error instanceof IntelligenceApiError || error instanceof IntelligenceProviderError) return sendApi(response, error.status || 500, { error: { code: error.code, message: error.message } }, "no-store");
    console.error("Intelligence refresh failed", { name: error?.name, code: error?.code });
    sendApi(response, 500, { error: { code: "intelligence_error", message: "The intelligence refresh could not be completed." } }, "no-store");
  }
});
app.get("/api/v1/intelligence-runs", async (request, response) => {
  try {
    const result = await intelligenceRunStatus({ authorization: request.headers.authorization, runId: request.query.runId, latest: request.query.latest === "1" });
    sendApi(response, 200, result, "no-store");
  } catch (error) {
    if (error instanceof IntelligenceApiError) return sendApi(response, error.status, { error: { code: error.code, message: error.message } }, "no-store");
    console.error("Intelligence run lookup failed", { name: error?.name, code: error?.code });
    sendApi(response, 500, { error: { code: "intelligence_error", message: "The intelligence run could not be loaded." } }, "no-store");
  }
});
app.use("/api", (request, response) => sendApi(response, 404, {
  error: { code: "not_found", message: `Unknown API route: ${request.originalUrl}` },
}));

app.use(express.static(clientDirectory, {
  etag: true,
  immutable: true,
  maxAge: "1y",
  index: false,
}));

app.use((request, response, next) => {
  if (!["GET", "HEAD"].includes(request.method)) return next();
  response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  response.type("html").send(indexHtml);
});

export default app;
