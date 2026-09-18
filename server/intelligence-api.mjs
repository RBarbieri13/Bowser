import { timingSafeEqual } from "node:crypto";

import { defaultIntelligenceStore, intelligenceDatabaseStatus } from "./intelligence-db.mjs";
import { executeIntelligenceRun } from "./intelligence-ingest.mjs";

export class IntelligenceApiError extends Error {
  constructor(code, message, status) { super(message); this.name = "IntelligenceApiError"; this.code = code; this.status = status; }
}

function authorized(value) {
  const expected = process.env.INTELLIGENCE_REFRESH_TOKEN;
  if (!expected) throw new IntelligenceApiError("refresh_not_configured", "Add INTELLIGENCE_REFRESH_TOKEN before enabling manual refresh.", 503);
  const provided = String(value || "").replace(/^Bearer\s+/i, "");
  const left = Buffer.from(provided); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireRefreshAuthorization(header) {
  if (!authorized(header)) throw new IntelligenceApiError("unauthorized", "A valid operator refresh token is required.", 401);
}

export async function startIntelligenceRefresh({ authorization, idempotencyKey, body = {}, store } = {}) {
  requireRefreshAuthorization(authorization);
  const database = intelligenceDatabaseStatus();
  if (!database.ready && !store) throw new IntelligenceApiError("storage_not_configured", database.message, 503);
  if (!idempotencyKey) throw new IntelligenceApiError("idempotency_required", "Idempotency-Key is required.", 400);
  try {
    return await executeIntelligenceRun({
      store: store || defaultIntelligenceStore(),
      idempotencyKey,
      source: body.source || "all",
      lookbackHours: body.lookbackHours || 24,
      positions: body.positions,
      teams: body.teams,
      query: body.query,
    });
  } catch (error) {
    if (error?.code === "idempotency_conflict") throw new IntelligenceApiError(error.code, error.message, 409);
    if (error?.code === "refresh_in_progress") throw new IntelligenceApiError(error.code, error.message, 409);
    if (error?.code === "prior_run_failed") throw new IntelligenceApiError(error.code, error.message, 409);
    if (error?.code === "provider_coverage_regression") throw new IntelligenceApiError(error.code, error.message, 409);
    if (error?.code === "provider_coverage_unknown") throw new IntelligenceApiError(error.code, error.message, 409);
    throw error;
  }
}

export async function intelligenceRunStatus({ authorization, runId, latest = false, store } = {}) {
  requireRefreshAuthorization(authorization);
  const selected = store || defaultIntelligenceStore();
  const run = latest ? await selected.latestRun() : await selected.run(runId);
  if (!run) throw new IntelligenceApiError("run_not_found", "Intelligence refresh run not found.", 404);
  return { run };
}
