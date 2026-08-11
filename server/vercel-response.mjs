import { QueryValidationError } from "./stats-store.mjs";

export function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", status === 200
    ? "public, s-maxage=3600, stale-while-revalidate=86400"
    : "no-store");
  response.end(JSON.stringify(payload));
}

export function runQuery(response, query) {
  try {
    sendJson(response, 200, query());
  } catch (error) {
    if (error instanceof QueryValidationError) {
      sendJson(response, 400, { error: { code: "invalid_query", field: error.field, message: error.message } });
      return;
    }
    sendJson(response, 500, { error: { code: "warehouse_error", message: error instanceof Error ? error.message : "Unknown API error" } });
  }
}
