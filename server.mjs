import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { getMeta, queryGameBreakdown, queryOpportunityTracker, queryPlayerProfile, queryPlayers, queryTeamBoxScores, QueryValidationError } from "./server/stats-store.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const clientDirectory = path.join(root, "dist", "client");
const indexPath = path.join(clientDirectory, "index.html");
const indexHtml = readFileSync(indexPath, "utf8");

const app = express();
app.disable("x-powered-by");

app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

function sendApi(response, status, payload) {
  response.status(status);
  response.setHeader("Cache-Control", status === 200
    ? "public, s-maxage=3600, stale-while-revalidate=86400"
    : "no-store");
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

app.get("/api/v1/meta", apiHandler(() => getMeta()));
app.get("/api/v1/player-stats", apiHandler((params) => queryPlayers(params)));
app.get("/api/v1/player-profile", apiHandler((params) => queryPlayerProfile(params)));
app.get("/api/v1/team-box-scores", apiHandler((params) => queryTeamBoxScores(params)));
app.get("/api/v1/opportunity-tracker", apiHandler((params) => queryOpportunityTracker(params)));
app.get("/api/v1/game-breakdown", apiHandler((params) => queryGameBreakdown(params)));
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
